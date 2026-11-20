/**
 * 三级直达专员绩效 · 数据层（任务包 × 考核月份 × 专员）
 *
 * 口径（2026-11 三级直达绩效改造）：
 * - 识别：任务执行链快照 chainLevelOf(chainSnapshot) === "三级链"（创建时锁定），
 *   不按是否有工作组记录、不按页面演示身份推断。
 * - 任务包：Task × 考核月份（考核月份 = WorkloadAssign.serviceMonth 服务归属月）。
 * - 专员记录：Task.id × serviceMonth × specialist 唯一；多品种/多区域证据随记录与
 *   考核快照保存；同一个人跨任务/跨月各自独立。
 * - 绩效依据：workloadAssigns 中 progress === "已完成"（已审核）的有效业务；
 *   待审核 / 未完成不入账。区分已审核执行量（本模块）与发包计划量（serviceItems）。
 * - 对私单价：基线唯一稳定绑定是问卷计价快照 QuestionnaireTaskSnapshot.prices.priv；
 *   推广类业务基线缺绑定，按本次改造口径启用「任务级对私价格映射」（DIRECT_PRIVATE_PRICES，
 *   按 taskId 可追溯），缺价的分项明确提示并阻止确认，禁止用对公单价/结算金额兜底。
 * - 留痕：提交/退回/重评写入操作日志并保存当次权重、上限与有效业务依据快照；
 *   历史持久化到 localStorage（演示级；快照内含服务商与药厂归属，写入时校验会话主体一致）。
 * - 完结：taskStatus === "已结算"（结算完结）或 "已撤销" 后仅供查阅；
 *   reconStatus === "已结算" 而 taskStatus 仍为「执行中」（单笔结算已确认）仍可退回。
 *   写入时以传入的最新 tasks 再次校验。
 */
import { useEffect, useSyncExternalStore } from "react"
import { chainLevelOf } from "../domain/taskV4"
import type { Task, VisitRecord, WorkloadAssign } from "../types"
import { BUSINESS_TYPE_CATEGORIES } from "./acceptanceData"
import { specialistAccounts, visitRecords } from "./mockData"

// ── 类型 ─────────────────────────────────────────────────────────────────────

export type DirectStatus = "待考核" | "已考核"

/** 有效业务依据快照（分项 = 品种 × 服务大类 × 服务项目 × 地区，来自已审核任务量） */
export interface DirectPerfItem {
  key: string
  category: string
  itemName: string
  variety: string
  region: string
  unit: string
  /** 有效工作量（已审核次数） */
  count: number
  /** 适用对私单价（元）；null = 缺价，阻止确认 */
  privateUnitPrice: number | null
  /** 对私单价来源说明 */
  priceSource: string
  /** 计价来源任务量行（可追溯） */
  sourceAssignIds: string[]
}

/** 单次考核结果快照（保存当次规则与依据，规则调整后历史仍可读） */
export interface DirectAssessment {
  /** 确认金额（分，整数） */
  cents: number
  /** 当次默认金额快照（分） */
  baseCents: number
  /** 当次上限比例快照（服务商绩效设置） */
  capRatio: number
  /** 绩效比 = cents / baseCents */
  ratio: number
  /** 四维评分（0–1，两位小数） */
  scores: [number, number, number, number]
  /** 当次四维权重快照（百分比） */
  weights: [number, number, number, number]
  /** 有效业务依据快照 */
  items: DirectPerfItem[]
}

export type DirectOpKind = "submit" | "return" | "reassess"

export interface DirectPerfOp {
  id: string
  kind: DirectOpKind
  /** 操作人（登录主体姓名） */
  actor: string
  /** 操作主体（登录企业名） */
  actorOrg: string
  time: string
  /** 退回原因 / 金额调整原因 */
  reason: string
  from: DirectStatus
  to: DirectStatus
  before: DirectAssessment | null
  after: DirectAssessment | null
}

/** 专员绩效记录：Task.id × 考核月份 × 专员 唯一 */
export interface DirectPerfRecord {
  id: string
  taskId: string
  taskNo: string
  taskName: string
  serviceMonth: string
  specialist: string
  specialistAccount: string
  provider: string
  holderPharma: string
  /** 多品种证据（该专员该月已审核业务的品种并集） */
  varietyNames: string[]
  /** 多区域证据 */
  regionNames: string[]
  items: DirectPerfItem[]
  /** 任一分项缺对私单价 → 明确提示并阻止确认 */
  missingPrice: boolean
  history: DirectPerfOp[]
}

/** 任务包：Task × 考核月份（只统计已审核执行量） */
export interface DirectPerfPackage {
  key: string
  taskId: string
  taskNo: string
  taskName: string
  provider: string
  holderPharma: string
  varietyNames: string[]
  regionNames: string[]
  serviceMonth: string
  /** 任务终态（已结算完结 / 已撤销）：仅供查阅，不可写入 */
  locked: boolean
  records: DirectPerfRecord[]
}

// ── 金额与比例（一律按分计算） ────────────────────────────────────────────────

export const toCents = (yuan: number) => Math.round(yuan * 100)

export const itemCents = (item: DirectPerfItem) =>
  item.privateUnitPrice == null ? 0 : toCents(item.privateUnitPrice) * item.count

/** 默认金额（分）= Σ 有效工作量 × 适用对私单价；缺价分项不计入并另行提示 */
export function baseCentsOf(items: DirectPerfItem[]): number {
  return items.reduce((sum, item) => sum + itemCents(item), 0)
}

export function workloadOf(items: DirectPerfItem[]): number {
  return items.reduce((sum, item) => sum + item.count, 0)
}

export const ratioOf = (cents: number, baseCents: number): number =>
  baseCents > 0 ? cents / baseCents : 0

/** 比例显示：两位可精确则两位，四位可精确则四位，否则 ≈ 前四位（与最终 HTML 一致） */
export function ratioText(ratio: number): string {
  if (Math.abs(ratio - Number(ratio.toFixed(2))) < 1e-9) return ratio.toFixed(2)
  const rounded = ratio.toFixed(4)
  return Math.abs(ratio - Number(rounded)) < 1e-9 ? rounded : "≈ " + rounded
}

/** 绩效比滑块下界（0.01） */
export const MIN_RATIO = 0.01

/** 金额允许范围（分）：下界至少 1 分，上界 = 默认金额 × 上限比例 */
export function amountRange(baseCents: number, capRatio: number): { min: number; max: number } {
  return { min: Math.max(1, Math.round(baseCents * MIN_RATIO)), max: Math.round(baseCents * capRatio) }
}

export function validateAmountCents(
  cents: number,
  baseCents: number,
  capRatio: number,
): string | null {
  if (!Number.isFinite(cents) || cents <= 0) return "请输入有效金额"
  const { min, max } = amountRange(baseCents, capRatio)
  if (cents < min) return `最低 ${formatCentsText(min)}`
  if (cents > max)
    return `不能超过 ${formatCentsText(max)}（默认金额 × ${Math.round(capRatio * 100)}%）`
  return null
}

/** 四维评分校验：0–1，最多两位小数 */
export function validateScore(value: number): string | null {
  if (!Number.isFinite(value)) return "请输入分值"
  if (Math.round(value * 1000) !== Math.round(value * 100) * 10) return "最多输入两位小数"
  if (value < 0 || value > 1) return "需在 0–1 之间"
  return null
}

export function weightedScoreOf(
  scores: [number, number, number, number],
  weights: [number, number, number, number],
): number {
  const total = scores.reduce((sum, score, index) => sum + score * (weights[index] / 100), 0)
  return Math.round(total * 100) / 100
}

/** 分 → ¥ 文本（整数分展示，避免浮点尾差） */
export function formatCentsText(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const yuan = Math.floor(abs / 100)
  const fen = abs % 100
  return `${negative ? "−" : ""}¥${yuan.toLocaleString("zh-CN")}.${String(fen).padStart(2, "0")}`
}

// ── 对私单价解析 ─────────────────────────────────────────────────────────────

/**
 * 任务级对私价格映射（演示）。
 * 基线说明：Task 有价目表快照，但 PriceBookRule.amount / ServiceItem.unitPrice /
 * WorkloadAssign.amount 均为对公口径，不能当对私单价；推广类业务在基线中缺稳定对私绑定。
 * 按本次改造口径使用「任务级对私价格映射」补齐验收任务（键 = taskId|品种|服务项目，
 * 可追溯到具体任务）；问卷类业务仍优先读任务里真实的问卷计价快照 prices.priv。
 */
export const DIRECT_PRIVATE_PRICES: Record<string, number> = {
  // TK-2026-0011（TR-011 · 智联科技 × 百益 · 阿托伐他汀 · 陕西）
  "TR-011|阿托伐他汀钙片(20mg)|医院拜访": 150,
  // TK-2026-0021（TR-021 · 东方恒业 × 百益 · 阿托伐他汀 · 广东）
  "TR-021|阿托伐他汀钙片(20mg)|医院拜访": 100,
  "TR-021|阿托伐他汀钙片(20mg)|商业拜访": 100,
  // TK-2026-0022（TR-022 · 东方恒业 × 百益 · 已结算完结演示）
  "TR-022|阿托伐他汀钙片(20mg)|医院拜访": 100,
  // TK-2026-0023（TR-023 · 东方恒业 × 百益 · 分项缺价演示：故意不配「商业拜访」）
  "TR-023|阿托伐他汀钙片(20mg)|医院拜访": 100,
}

const QUESTIONNAIRE_CATEGORY = "问卷调研与分析服务"

/** 问卷类：读任务创建时锁定的问卷计价快照（基线唯一的真实对私绑定） */
function questionnairePrivatePrice(task: Task, assign: WorkloadAssign): number | null {
  if (assign.category !== QUESTIONNAIRE_CATEGORY) return null
  const item = task.serviceItems.find(
    (si) => si.variety === assign.variety && si.category === assign.category && si.name === assign.itemName,
  )
  const code = item?.questionnaire?.code
  if (!code) return null
  const snapshot = task.questionnaireSnapshots?.find(
    (s) => s.code === code && s.variety === assign.variety,
  )
  return snapshot?.prices.priv ?? null
}

export interface PrivatePriceResolution {
  price: number | null
  source: string
}

/** 解析分项适用对私单价：问卷快照（真实绑定）优先，其次任务级对私价格映射 */
export function resolvePrivatePrice(task: Task, assign: WorkloadAssign): PrivatePriceResolution {
  const questionnaire = questionnairePrivatePrice(task, assign)
  if (questionnaire != null)
    return { price: questionnaire, source: "任务问卷计价快照（创建时锁定）" }
  const mapped = DIRECT_PRIVATE_PRICES[`${task.id}|${assign.variety}|${assign.itemName}`]
  if (typeof mapped === "number" && mapped > 0)
    return { price: mapped, source: "任务级对私价格映射（演示数据）" }
  return { price: null, source: "缺少适用的对私单价" }
}

function unitOf(task: Task, assign: WorkloadAssign): string {
  const item = task.serviceItems.find(
    (si) => si.variety === assign.variety && si.category === assign.category && si.name === assign.itemName,
  )
  return item?.unit ?? "次"
}

// ── 记录与任务包派生 ─────────────────────────────────────────────────────────

export const recordKeyOf = (taskId: string, serviceMonth: string, specialist: string) =>
  `${taskId}::${serviceMonth}::${specialist}`

/** 任务是否三级直达：按创建时链路快照判定（不按工作组记录或演示身份） */
export function taskIsDirect(task: Task): boolean {
  return chainLevelOf(task.chainSnapshot) === "三级链"
}

/** 任务终态锁定：结算完结或撤销后关联考核仅供查阅 */
export function taskLockedOf(task: Task): boolean {
  return task.taskStatus === "已结算" || task.taskStatus === "已撤销"
}

/** 组内分项排序：品种 → 大类 → 服务项目 → 地区 */
function itemSortKey(item: DirectPerfItem): string {
  return `${item.variety}|${item.category}|${item.itemName}|${item.region}`
}

/** 该任务某服务月份的已审核任务量（绩效依据；待审核/未完成不入账） */
export function auditedAssignsOf(task: Task, serviceMonth: string): WorkloadAssign[] {
  return task.workloadAssigns.filter(
    (a) => a.progress === "已完成" && (!serviceMonth || a.serviceMonth === serviceMonth),
  )
}

/** 已审核任务量 → 分项行（品种 × 大类 × 项目 × 地区）；同键合并，来源行可追溯 */
function buildItems(task: Task, assigns: WorkloadAssign[]): DirectPerfItem[] {
  const groups = new Map<string, DirectPerfItem>()
  assigns.forEach((assign) => {
    const key = `${assign.variety}|${assign.category}|${assign.itemName}|${assign.region}`
    const resolution = resolvePrivatePrice(task, assign)
    const existing = groups.get(key)
    if (existing) {
      existing.count += assign.workload
      existing.sourceAssignIds.push(assign.id)
    } else {
      groups.set(key, {
        key,
        category: assign.category,
        itemName: assign.itemName,
        variety: assign.variety,
        region: assign.region,
        unit: unitOf(task, assign),
        count: assign.workload,
        privateUnitPrice: resolution.price,
        priceSource: resolution.source,
        sourceAssignIds: [assign.id],
      })
    }
  })
  return [...groups.values()].sort((a, b) => itemSortKey(a).localeCompare(itemSortKey(b)))
}

function buildRecord(
  task: Task,
  serviceMonth: string,
  specialist: string,
  history: DirectPerfOp[],
): DirectPerfRecord | null {
  const assigns = auditedAssignsOf(task, serviceMonth).filter((a) => a.specialist === specialist)
  if (assigns.length === 0) return null
  const items = buildItems(task, assigns)
  return {
    id: recordKeyOf(task.id, serviceMonth, specialist),
    taskId: task.id,
    taskNo: task.taskNo,
    taskName: task.taskName,
    serviceMonth,
    specialist,
    specialistAccount: specialistAccounts[specialist] ?? specialist,
    provider: task.provider,
    holderPharma: task.holderPharma ?? "",
    varietyNames: [...new Set(assigns.map((a) => a.variety))],
    regionNames: [...new Set(assigns.map((a) => a.region))],
    items,
    missingPrice: items.some((item) => item.privateUnitPrice == null),
    history,
  }
}

// ── 留痕存储（演示级：localStorage；操作内含归属，写入时校验主体一致） ────────

const STORE_KEY = "beiye-direct-perf-history-v1"
const STORE_EVT = "beiye-direct-perf-history-change"

type Listener = () => void
const listeners = new Set<Listener>()
/** 留痕修订号：提交/退回/重评后自增，页面派生依赖它即时重算 */
let storeRevision = 0

function emit() {
  storeRevision += 1
  listeners.forEach((listener) => listener())
}

export function subscribeDirectPerf(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function directPerfRevision(): number {
  return storeRevision
}

function isOpArray(value: unknown): value is DirectPerfOp[] {
  return (
    Array.isArray(value) &&
    value.every((op) => typeof op === "object" && op !== null && "kind" in op)
  )
}

function readStore(): Record<string, DirectPerfOp[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, unknown>
    const safe: Record<string, DirectPerfOp[]> = {}
    Object.entries(parsed).forEach(([id, ops]) => {
      if (isOpArray(ops)) safe[id] = ops
    })
    return safe
  } catch {
    return {}
  }
}

function writeStore(next: Record<string, DirectPerfOp[]>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
  } catch {
    /* 演示原型：落盘失败时保留内存结果 */
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(STORE_EVT))
  }
}

let state: Record<string, DirectPerfOp[]> = readStore()

function commitStore(next: Record<string, DirectPerfOp[]>) {
  state = next
  writeStore(next)
}

/** 订阅留痕修订号（提交/退回后派生即时重算；跨 tab 经 storage 事件同步） */
export function useDirectPerfSync(): number {
  const revision = useSyncExternalStore(subscribeDirectPerf, directPerfRevision, directPerfRevision)
  useEffect(() => {
    const on = () => {
      state = readStore()
      storeRevision += 1
    }
    window.addEventListener?.("storage", on)
    return () => {
      window.removeEventListener?.("storage", on)
    }
  }, [])
  return revision
}

/**
 * 存量种子留痕：TK-2026-0022（已结算完结）的王芳考核结果，
 * 用于验证「完结任务历史可查看、写入被阻止」。
 */
const SEED_HISTORY: Record<string, DirectPerfOp[]> = {
  [recordKeyOf("TR-022", "2026-08", "王芳")]: [
    {
      id: "TR-022-OP-1",
      kind: "submit",
      actor: "陈伟",
      actorOrg: "东方恒业推广有限公司",
      time: "2026-08-29 16:20",
      reason: "",
      from: "待考核",
      to: "已考核",
      before: null,
      after: {
        cents: 60000,
        baseCents: 60000,
        capRatio: 1.2,
        ratio: 1,
        scores: [0.9, 0.9, 0.9, 0.9],
        weights: [20, 25, 35, 20],
        items: [
          {
            key: "阿托伐他汀钙片(20mg)|市场推广服务|医院拜访|广东",
            category: "市场推广服务",
            itemName: "医院拜访",
            variety: "阿托伐他汀钙片(20mg)",
            region: "广东",
            unit: "次",
            count: 6,
            privateUnitPrice: 100,
            priceSource: "任务级对私价格映射（演示数据）",
            sourceAssignIds: ["TR-022-WL-1"],
          },
        ],
      },
    },
  ],
}

/** 记录当前生效的留痕（最新在前）：落盘优先，其次存量种子 */
export function historyOf(recordId: string): DirectPerfOp[] {
  return state[recordId] ?? SEED_HISTORY[recordId] ?? []
}

/** 当前有效考核结果（最新一条 after）；null = 待考核 */
export function assessedOf(record: DirectPerfRecord): DirectAssessment | null {
  return record.history[0]?.after ?? null
}

export function statusOf(record: DirectPerfRecord): DirectStatus {
  return assessedOf(record) ? "已考核" : "待考核"
}

/** 最新操作是退回 → 行按钮显示「重新考核」 */
export function returnedOf(record: DirectPerfRecord): boolean {
  return record.history[0]?.kind === "return"
}

// ── 任务包派生（页面读取入口） ───────────────────────────────────────────────

/** 直达任务包：三级链任务 × 考核月份（仅执行中 / 已结算；待确认与已撤销不生成考核包） */
export function directPackagesOf(tasks: Task[]): DirectPerfPackage[] {
  const packages: DirectPerfPackage[] = []
  tasks.forEach((task) => {
    if (!taskIsDirect(task)) return
    if (task.taskStatus !== "执行中" && task.taskStatus !== "已结算") return
    const audited = task.workloadAssigns.filter((a) => a.progress === "已完成")
    const monthsOfYear = [...new Set(audited.map((a) => a.serviceMonth))].sort()
    monthsOfYear.forEach((serviceMonth) => {
      const specialists = [
        ...new Set(
          audited
            .filter((a) => a.serviceMonth === serviceMonth)
            .map((a) => a.specialist),
        ),
      ].sort()
      const records = specialists
        .map((specialist) =>
          buildRecord(task, serviceMonth, specialist, historyOf(recordKeyOf(task.id, serviceMonth, specialist))),
        )
        .filter((r): r is DirectPerfRecord => r !== null)
      if (records.length === 0) return
      packages.push({
        key: `${task.id}::${serviceMonth}`,
        taskId: task.id,
        taskNo: task.taskNo,
        taskName: task.taskName,
        provider: task.provider,
        holderPharma: task.holderPharma ?? "",
        varietyNames: [...new Set(records.flatMap((r) => r.varietyNames))],
        regionNames: [...new Set(records.flatMap((r) => r.regionNames))],
        serviceMonth,
        locked: taskLockedOf(task),
        records,
      })
    })
  })
  return packages.sort(
    (a, b) => b.serviceMonth.localeCompare(a.serviceMonth) || a.taskNo.localeCompare(b.taskNo),
  )
}

/** 按 key 取任务包（用传入的最新 tasks 重新派生） */
export function packageByKey(tasks: Task[], key: string): DirectPerfPackage | null {
  return directPackagesOf(tasks).find((p) => p.key === key) ?? null
}

/** 按记录 id 取记录（用传入的最新 tasks 重新派生；写路径校验用） */
export function recordByKey(tasks: Task[], recordId: string): DirectPerfRecord | null {
  const [taskId, serviceMonth, specialist] = recordId.split("::")
  if (!taskId || !serviceMonth || !specialist) return null
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return null
  return buildRecord(task, serviceMonth, specialist, historyOf(recordId))
}

// ── 写路径（提交 / 退回；以最新任务状态再校验） ───────────────────────────────

export interface WriteResult {
  ok: boolean
  error?: string
}

export interface AssessmentInput {
  cents: number
  scores: [number, number, number, number]
  /** 金额偏离默认时的必填调整原因 */
  reason: string
}

function nowText() {
  return new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-")
}

let opSeq = 0
function nextOpId() {
  opSeq += 1
  return `DP-OP-${Date.now().toString(36)}-${opSeq}`
}

/**
 * 提交（或退回后的重新考核）。caller 必须传入任务上下文中的最新 tasks：
 * 提交时再次校验任务存在、未完结、记录当前待考核、金额/原因/评分合法。
 */
export function submitDirectAssessment(
  tasks: Task[],
  recordId: string,
  input: AssessmentInput,
  actor: { name: string; org: string },
  settings: { capRatio: number; weights: [number, number, number, number] },
): WriteResult {
  const [taskId, serviceMonth, specialist] = recordId.split("::")
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return { ok: false, error: "关联任务不存在，无法提交" }
  if (taskLockedOf(task))
    return { ok: false, error: "任务已结算完结或撤销，考核记录已锁定，不能提交" }
  if (task.taskStatus === "待确认") return { ok: false, error: "任务尚未确认生效，不能提交考核" }
  const record = buildRecord(task, serviceMonth, specialist, historyOf(recordId))
  if (!record) return { ok: false, error: "该专员在本考核月份没有已审核的有效业务，不能提交" }
  if (assessedOf(record)) return { ok: false, error: "该专员当前已考核；请先退回再重新考核" }
  const baseCents = baseCentsOf(record.items)
  if (baseCents <= 0) return { ok: false, error: "有效业务缺少适用的对私单价，不能确认金额" }
  if (record.missingPrice)
    return { ok: false, error: "存在缺少对私单价的业务分项，不能确认，请先补齐价格来源" }
  const amountError = validateAmountCents(input.cents, baseCents, settings.capRatio)
  if (amountError) return { ok: false, error: amountError }
  const changed = input.cents !== baseCents
  if (changed && !input.reason.trim())
    return { ok: false, error: "金额偏离默认值时必须填写调整原因" }
  for (let i = 0; i < 4; i += 1) {
    const scoreError = validateScore(input.scores[i])
    if (scoreError) return { ok: false, error: `第 ${i + 1} 项评分：${scoreError}` }
  }
  const prior = record.history[0]?.kind === "return" ? record.history[0]?.before ?? null : null
  const assessment: DirectAssessment = {
    cents: input.cents,
    baseCents,
    capRatio: settings.capRatio,
    ratio: ratioOf(input.cents, baseCents),
    scores: [...input.scores] as [number, number, number, number],
    weights: [...settings.weights] as [number, number, number, number],
    items: record.items,
  }
  const op: DirectPerfOp = {
    id: nextOpId(),
    kind: prior ? "reassess" : "submit",
    actor: actor.name,
    actorOrg: actor.org,
    time: nowText(),
    reason: changed ? input.reason.trim() : "",
    from: "待考核",
    to: "已考核",
    before: prior,
    after: assessment,
  }
  commitStore({ ...state, [recordId]: [op, ...historyOf(recordId)] })
  emit()
  return { ok: true }
}

/**
 * 退回重评：从该专员的「查看记录」发起；确认后状态回「待考核」，
 * 当前确认金额移出汇总，原版本保留在留痕中。写入时以最新任务状态再校验。
 */
export function returnDirectAssessment(
  tasks: Task[],
  recordId: string,
  reason: string,
  actor: { name: string; org: string },
): WriteResult {
  const trimmed = reason.trim()
  if (!trimmed) return { ok: false, error: "请填写退回原因" }
  const [taskId, serviceMonth, specialist] = recordId.split("::")
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return { ok: false, error: "关联任务不存在，无法退回" }
  if (taskLockedOf(task))
    return { ok: false, error: "任务已结算完结或撤销，考核记录已锁定，仅供查阅，不能退回" }
  const record = buildRecord(task, serviceMonth, specialist, historyOf(recordId))
  if (!record) return { ok: false, error: "未找到该专员的考核记录" }
  if (!assessedOf(record)) return { ok: false, error: "该专员当前待考核，无需退回" }
  const op: DirectPerfOp = {
    id: nextOpId(),
    kind: "return",
    actor: actor.name,
    actorOrg: actor.org,
    time: nowText(),
    reason: trimmed,
    from: "已考核",
    to: "待考核",
    before: assessedOf(record),
    after: null,
  }
  commitStore({ ...state, [recordId]: [op, ...historyOf(recordId)] })
  emit()
  return { ok: true }
}

// ── 汇总 ────────────────────────────────────────────────────────────────────

export interface PackageStats {
  done: number
  total: number
  status: DirectStatus
  /** 已确认绩效合计（分）：只统计当前有效的已考核记录 */
  confirmedCents: number
}

export function packageStatsOf(pkg: DirectPerfPackage): PackageStats {
  const done = pkg.records.filter((r) => assessedOf(r) !== null).length
  return {
    done,
    total: pkg.records.length,
    status: pkg.records.length > 0 && done === pkg.records.length ? "已考核" : "待考核",
    confirmedCents: pkg.records.reduce((sum, r) => sum + (assessedOf(r)?.cents ?? 0), 0),
  }
}

/** 考核下一位（同包内按名单顺序的第一个待考核专员） */
export function nextPendingOf(pkg: DirectPerfPackage): DirectPerfRecord | null {
  return pkg.records.find((r) => assessedOf(r) === null) ?? null
}

// ── 查看依据：真实底层记录关联 ───────────────────────────────────────────────

export interface LinkedRecordRow {
  id: string
  date: string
  period: string
  auditResult: string
  /** 每条计入金额（分）= 该分项适用对私单价 */
  amountCents: number | null
}

export interface LinkedRecordsResult {
  rows: LinkedRecordRow[]
  /** 真实底层记录数与有效工作量一致 */
  complete: boolean
  /** 底层明细缺失说明（如实展示缺口，不伪造记录） */
  gapNote: string | null
}

/**
 * 分项的原始业务记录：市场推广类按项目既有分类口径（acceptanceData.BUSINESS_TYPE_CATEGORIES，
 * 拜访管理页同一口径）把拜访类别归到业务类型，再按 任务 × 专员 × 品种 × 服务月份 ×
 * 已通过 关联拜访记录（VisitRecord.taskId）。商业拜访等基线未建立分类映射的业务类型，
 * 如实展示汇总与缺口；未挂任务的拜访不入依据。
 */
export function linkedRecordsOf(
  task: Task,
  record: DirectPerfRecord,
  item: DirectPerfItem,
): LinkedRecordsResult {
  if (item.category !== "市场推广服务") {
    return {
      rows: [],
      complete: false,
      gapNote: `该分项为「${item.category}」，基线没有逐条原始记录来源；此处展示已审核工作量汇总，明细以任务详情与结算单为准。`,
    }
  }
  const categorySet = BUSINESS_TYPE_CATEGORIES[item.itemName]
  if (!categorySet) {
    return {
      rows: [],
      complete: false,
      gapNote: `「${item.itemName}」在基线中未建立拜访类别的分区映射（拜访管理页同类口径），无法逐条关联；此处展示已审核工作量汇总，不按记录数补差。`,
    }
  }
  const rows: VisitRecord[] = visitRecords
    .filter(
      (v) =>
        v.taskId === record.taskId &&
        v.specialist === record.specialist &&
        v.variety === item.variety &&
        categorySet.includes(v.visitCategory) &&
        v.auditStatus === "已通过" &&
        v.visitDate.slice(0, 7) === record.serviceMonth,
    )
    .sort((a, b) => a.visitDate.localeCompare(b.visitDate) || a.id.localeCompare(b.id))
  const complete = rows.length === item.count
  return {
    rows: rows.map((v) => ({
      id: v.id,
      date: v.visitDate,
      period: v.visitPeriod,
      auditResult: "已通过",
      amountCents: item.privateUnitPrice == null ? null : toCents(item.privateUnitPrice),
    })),
    complete,
    gapNote: complete
      ? null
      : `该分项已审核有效工作量 ${item.count} 次，任务下已关联的已通过${item.itemName}记录 ${rows.length} 条；底层明细不完整时以已审核工作量汇总为准，不按记录数补差。`,
  }
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { effectiveProviderAuthRows, subscribeCooperation } from "../data/cooperationModel"
import {
  DEMO_HOLDER,
  DEMO_PROVIDER,
  filterAuthorizedProviders,
  isPairAuthorized,
  regionsOfProvider,
  seedBudgetPlans,
  seedExecutionChain,
  seedPriceBooks,
  seedPriceItems,
  seedPriceRatios,
  seedReportPrices,
  seedSubAuths,
  seedTasks,
  seedUnitPriceAdjustRule,
  seedVarieties,
  varietiesOfProvider,
} from "../data/mockData"
import { formatCNY } from "../constants"
import {
  assertSamePriceBook,
  canCompleteSettlement,
  canRollbackComplete,
  canRollbackConfirm,
  canRollbackStart,
  canUnconfirmProvider,
  chainLevelOf,
  chainNodesOf,
  confirmedSettledAmount,
  findPeriodForMonth,
  hasInProgressBill,
  isLatestValidBill,
  latestValidBill,
  recommendedBudget,
  snapshotPriceBook,
  unitPriceOutOfRange,
  validateSettlementPeriods,
  workGroupEnabled,
} from "../domain/taskV4"
import type {
  BudgetPlan,
  ChainChangeRecord,
  ConfirmSettlementInput,
  CreateBudgetPlanInput,
  CreateSubAuthInput,
  CreateTaskInput,
  ExecutionChain,
  PriceBook,
  PriceItem,
  PriceRatio,
  ProviderSubAuth,
  ReportFile,
  ReportPrice,
  Role,
  ServiceItem,
  SettlementBill,
  SettlementBillVersion,
  SettlementLine,
  SubAuthTargetType,
  Task,
  TaskOpsLog,
  UnitPriceAdjustRule,
  Variety,
  VarietyProviderAuth,
  WorkgroupSplit,
  WorkloadAssign,
  WorkloadStage,
} from "../types"

export { formatCNY, cny } from "../constants"
export {
  DEMO_PROVIDER,
  DEMO_HOLDER,
  isPairAuthorized,
  varietiesOfProvider,
  regionsOfProvider,
}

export function formatCoverage(items: string[]): string {
  if (!items.length) return "—"
  if (items.includes("全国") && items.length === 1) return "全国"
  return items.join("、")
}

export function formatMoney(n: number, masked = false): string {
  return formatCNY(n, masked)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const DEMO_NOW = "2026-08-24 12:00"
const ROLE_ACTOR: Record<Role, string> = {
  药厂销售部门: "李强",
  药厂合规部门: "合规管理员",
  服务提供商: "服务商",
}

interface MutationResult<T = void> {
  ok: boolean
  error?: string
  warning?: string
  data?: T
}

/** 上传 / 重新上传报告的表单载荷（报告名称/品种/区域由分派记录锁定，仅附件可变） */
export interface ReportUploadPayload {
  name: string
  fileName: string
  variety: string
  region: string
  /** 关联服务项目（报告类任务结算计价依据）；纯推广任务可空 */
  itemName?: string
  /** 本会话真实文件的 ObjectURL；种子/演示场景可空 */
  url?: string
}

/** 发起结算载荷：结算品种取任务、月份取 input，明细 = 任务量部分数量 或 已通过报告 */
export interface SettlementStartInput {
  serviceMonth: string
  selections: Array<
    | { workloadId: string; qty: number }
    | { reportId: string; qty: number }
  >
}

function pad(n: number, w = 3) {
  return String(n).padStart(w, "0")
}

function nextId(prefix: string, ids: string[]): string {
  const nums = ids
    .map((id) => Number(id.replace(/\D/g, "")))
    .filter((n) => !Number.isNaN(n))
  return `${prefix}-${pad(Math.max(0, ...nums) + 1)}`
}

/** 报告记录与报告类服务项目的匹配键：品种|地区|服务项目 */
function reportItemKey(variety?: string, region?: string, itemName?: string) {
  return `${variety ?? ""}|${region ?? ""}|${itemName ?? ""}`
}

/**
 * 分派即选定：药厂创建任务勾选报告类服务项目时已确定要做哪些报告，
 * 按品种×地区×服务项目补齐缺失的「待上传」报告记录（已有同键记录不重复生成）。
 */
export function ensurePendingReports(task: Task): Task {
  if (task.taskStatus === "已撤销") return task
  const wanted = task.serviceItems.filter(
    (it) => it.category !== "市场推广服务",
  )
  if (!wanted.length) return task
  const existing = new Set(
    task.reports.map((r) => reportItemKey(r.variety, r.region, r.itemName)),
  )
  const missing = wanted.filter(
    (it) => !existing.has(reportItemKey(it.variety, it.region, it.name)),
  )
  if (!missing.length) return task
  const base = task.reports.length
  const pending: ReportFile[] = missing.map((it, i) => ({
    id: `${task.id}-RQ-${base + i + 1}`,
    name: it.name,
    uploadedAt: "",
    uploadedBy: "",
    status: "待上传",
    comment: "",
    variety: it.variety,
    region: it.region,
    itemName: it.name,
    category: it.category,
  }))
  return { ...task, reports: [...task.reports, ...pending] }
}

/** 剩余可结算金额：只汇总已确认且未作废结算单；结算完结后作废为 0 */
export function remainingOfTask(task: Task): number {
  if (task.remainingVoided) return 0
  return Math.max(0, task.planAmount - confirmedSettledAmount(task))
}

/** 任务是否含推广服务（市场推广服务价目类别） */
export function hasPromoItems(task: Task): boolean {
  return task.serviceItems.some((it) => it.category === "市场推广服务")
}

/** 任务是否含报告服务（分析报告服务 / 问卷调研与分析服务） */
export function hasReportItems(task: Task): boolean {
  return task.serviceItems.some((it) => it.category !== "市场推广服务")
}

/** 任务生效链级别（按创建时快照，三级链跳过「已拆解到工作组」档） */
export function chainLevelOfTask(task: Task) {
  return chainLevelOf(task.chainSnapshot)
}

export function workloadStageOf(task: Task): WorkloadStage {
  if (task.workloadAssigns.length > 0) return "已分配到专员"
  const fourLevel = chainLevelOf(task.chainSnapshot) === "四级链"
  if (fourLevel && task.workgroupSplits.length > 0) return "已拆解到工作组"
  return "未拆解"
}

/** 工作量进度：已完成 n / 待审核 m / 未完成 k */
export function progressCountOf(
  task: Task,
): { done: number; review: number; todo: number } {
  return {
    done: task.workloadAssigns.filter((a) => a.progress === "已完成").length,
    review: task.workloadAssigns.filter((a) => a.progress === "待审核").length,
    todo: task.workloadAssigns.filter((a) => a.progress === "未完成").length,
  }
}

export function workloadStageLabel(task: Task): string {
  if (!hasPromoItems(task)) return "报告服务，无需拆解"
  const stage = workloadStageOf(task)
  if (stage !== "已分配到专员") return stage
  const { done, review, todo } = progressCountOf(task)
  return `已分配到专员（已完成 ${done} / 待审核 ${review} / 未完成 ${todo}）`
}

/** 展示层状态映射：数据层手册词 → 主状态 + 辅助状态（V2 设计方案 5.5） */
export function displayStatusOf(
  task: Task,
): { main: string; aux?: string; owner: string } {
  if (task.taskStatus === "待确认")
    return { main: "待服务商确认", owner: "服务提供商" }
  if (task.taskStatus === "已撤销") return { main: "已撤销", owner: "—" }
  if (task.taskStatus === "已结算") return { main: "已结算", owner: "—" }
  if (task.reconStatus === "对账中")
    return { main: "待药厂处理", aux: "对账中", owner: "药厂" }
  if (task.reports.some((r) => r.status === "待审核"))
    return { main: "执行中", aux: "报告待审核", owner: "药厂" }
  return {
    main: "执行中",
    owner: hasPromoItems(task) ? "服务提供商" : "服务提供商",
  }
}

/** 任务可发起结算的服务月份（存在已审核且未选入结算单的任务量） */
export function settleableMonths(task: Task): string[] {
  const months = task.workloadAssigns
    .filter((a) => a.progress === "已完成" && !a.settledBillNo)
    .map((a) => a.serviceMonth)
  return [...new Set(months)].sort()
}

/** 某服务月份下可发起结算的服务专员（存在该月已审核且未选入结算单的任务量） */
export function settleableSpecialists(
  task: Task,
  serviceMonth: string,
): string[] {
  const names = task.workloadAssigns
    .filter(
      (a) =>
        a.progress === "已完成" &&
        !a.settledBillNo &&
        a.serviceMonth === serviceMonth,
    )
    .map((a) => a.specialist)
  return [...new Set(names)]
}

/** 结算明细行是否落入该预算行覆盖范围（服务商 × 品种 × 地区 × 服务月份所属年度） */
export function lineMatchesPlan(
  plan: BudgetPlan,
  provider: string,
  variety: string,
  region: string,
  serviceMonth: string,
): boolean {
  if (provider !== plan.provider) return false
  if (Number(serviceMonth.slice(0, 4)) !== plan.year) return false
  if (!plan.varieties.includes(variety)) return false
  if (plan.regions.includes("全国")) return true
  return plan.regions.includes(region)
}

/** 派生：预算行实际结算金额 = Σ 已确认结算明细（零分摊，按 服务商×品种×地区×服务月份 落回） */
export function actualAmountOf(plan: BudgetPlan, tasks: Task[]): number {
  let sum = 0
  tasks.forEach((t) => {
    if (t.provider !== plan.provider) return
    t.settlements.forEach((bill) => {
      if (!bill.confirmed || bill.voided) return
      bill.lines.forEach((l) => {
        if (
          lineMatchesPlan(
            plan,
            t.provider,
            l.variety,
            l.region,
            bill.serviceMonth,
          )
        ) {
          sum += l.actualAmount
        }
      })
    })
  })
  return sum
}

/** 差异 = 年度预算金额 − 实际结算金额 */
export function budgetDiffOf(plan: BudgetPlan, tasks: Task[]): number {
  return plan.yearAmount - actualAmountOf(plan, tasks)
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0).getDate()
  return `${year}-${pad(month, 2)}-${pad(d, 2)}`
}

/** 任务推广时段覆盖的自然月（1-12），用于冻结判定 */
export function monthsCoveredByTask(task: Task, year: number): number[] {
  const months: number[] = []
  for (let m = 1; m <= 12; m++) {
    const start = `${year}-${pad(m, 2)}-01`
    const end = lastDayOfMonth(year, m)
    if (task.startDate <= end && task.endDate >= start) months.push(m)
  }
  return months
}

/**
 * 冻结判定：某月该服务商存在「执行中」任务（推广时段覆盖该月）即冻结。
 * 粒度 = 服务商 × 月份，不再按品种/地区细分。
 */
export function frozenMonthsOf(
  provider: string,
  year: number,
  tasks: Task[],
): number[] {
  const set = new Set<number>()
  tasks.forEach((t) => {
    if (t.provider !== provider || t.taskStatus !== "执行中") return
    monthsCoveredByTask(t, year).forEach((m) => set.add(m))
  })
  return [...set].sort((a, b) => a - b)
}

/** 全年结束后整行锁定（演示时钟 DEMO_NOW） */
export function isBudgetYearLocked(year: number): boolean {
  return year < Number(DEMO_NOW.slice(0, 4))
}

interface TaskDataContextValue {
  tasks: Task[]
  budgetPlans: BudgetPlan[]
  varieties: Variety[]
  auths: VarietyProviderAuth[]
  priceBooks: PriceBook[]
  priceItems: PriceItem[]
  priceRatios: PriceRatio[]
  reportPrices: ReportPrice[]
  unitPriceAdjustRule: UnitPriceAdjustRule
  /** 执行链配置（当前生效值，新建任务按此写快照） */
  chain: ExecutionChain
  /** 调整执行链；按「工作组」节点变化写入变更记录并刷新更新时间/更新人 */
  updateChain: (
    next: ExecutionChain,
    operator: string,
  ) => MutationResult<ExecutionChain>
  /** 服务商下层品种授权（服务商 → 工作组/服务专员，对象类型跟随链路） */
  subAuths: ProviderSubAuth[]
  /** 当前生效链路的授权对象类型（四级链=工作组，三级链=服务专员） */
  subAuthTargetType: () => SubAuthTargetType
  /** 任务可承接对象（按任务链快照 + 任务品种×区域 已授权过滤），用于拆包强约束 */
  authorizedSubTargets: (task: Task) => string[]
  createSubAuth: (input: CreateSubAuthInput) => MutationResult<ProviderSubAuth>
  updateSubAuth: (
    id: string,
    input: CreateSubAuthInput,
  ) => MutationResult<ProviderSubAuth>
  deleteSubAuth: (id: string) => MutationResult
  authorizedProviders: (varietyName: string, region: string) => string[]
  varietiesOf: (provider: string) => string[]
  regionsOf: (provider: string, varieties?: string[]) => string[]
  createBudgetPlan: (input: CreateBudgetPlanInput) => MutationResult<BudgetPlan>
  updateBudgetPlan: (
    id: string,
    patch: { yearAmount?: number; months?: number[] },
  ) => MutationResult<BudgetPlan>
  createTask: (input: CreateTaskInput, role?: Role) => MutationResult<Task>
  revokeTask: (id: string) => MutationResult<Task>
  confirmTask: (id: string) => MutationResult<Task>
  unconfirmProvider: (id: string) => MutationResult<Task>
  splitToWorkgroup: (
    taskId: string,
    splits: Omit<WorkgroupSplit, "id">[],
  ) => MutationResult<Task>
  /** 三级链任务：服务商把工作量直接分配给服务专员（写 workloadAssigns，不经工作组） */
  splitToSpecialists: (
    taskId: string,
    rows: Omit<WorkgroupSplit, "id">[],
  ) => MutationResult<Task>
  assignWorkload: (
    taskId: string,
    assigns: Omit<WorkloadAssign, "id">[],
  ) => MutationResult<Task>
  uploadReport: (
    taskId: string,
    reportId: string,
    payload: ReportUploadPayload,
  ) => MutationResult<Task>
  reuploadReport: (
    taskId: string,
    reportId: string,
    payload: ReportUploadPayload,
  ) => MutationResult<Task>
  reviewReport: (
    taskId: string,
    reportId: string,
    pass: boolean,
    comment: string,
  ) => MutationResult<Task>
  startSettlement: (
    taskId: string,
    input: SettlementStartInput,
  ) => MutationResult<Task>
  confirmSettlement: (
    taskId: string,
    billId: string,
    lines: SettlementLine[],
    opts?: ConfirmSettlementInput,
  ) => MutationResult<Task>
  completeSettlement: (taskId: string) => MutationResult<Task>
  rollbackStartSettlement: (
    taskId: string,
    billId: string,
  ) => MutationResult<Task>
  rollbackConfirmSettlement: (
    taskId: string,
    billId: string,
  ) => MutationResult<Task>
  rollbackCompleteSettlement: (taskId: string) => MutationResult<Task>
  uploadPaymentVoucher: (
    taskId: string,
    billId: string,
    name: string,
  ) => MutationResult<Task>
  createVariety: (input: Omit<Variety, "id">) => MutationResult<Variety>
  updateVariety: (
    id: string,
    patch: Partial<Variety>,
  ) => MutationResult<Variety>
  bindVarietyPriceBook: (
    varietyId: string,
    priceBookId: string,
  ) => MutationResult<Variety>
  savePriceItems: (varietyId: string, items: PriceItem[]) => MutationResult
  savePriceRatios: (varietyId: string, ratios: PriceRatio[]) => MutationResult
  saveReportPrices: (varietyId: string, prices: ReportPrice[]) => MutationResult
  copyPriceList: (
    fromVarietyId: string,
    toVarietyIds: string[],
  ) => MutationResult
  saveUnitPriceAdjustRule: (
    rule: UnitPriceAdjustRule,
  ) => MutationResult<UnitPriceAdjustRule>
}

const TaskDataContext = createContext<TaskDataContextValue | null>(null)

export function TaskDataProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(() =>
    clone(seedTasks).map(ensurePendingReports),
  )
  const [budgetPlans, setBudgetPlans] = useState<BudgetPlan[]>(() =>
    clone(seedBudgetPlans),
  )
  const [varieties, setVarieties] = useState<Variety[]>(() =>
    clone(seedVarieties),
  )
  /**
   * 业务授权（P0-3 统一数据源）：auths 不再维护独立 state，实时派生自
   * cooperationModel（药厂「业务授权」页的唯一事实源）。药厂撤销授权 /
   * 暂停合作后，任务创建、预算分析、品种过滤与本页数据同步失效。
   */
  const [cooperationVersion, setCooperationVersion] = useState(0)
  useEffect(
    () => subscribeCooperation(() => setCooperationVersion((v) => v + 1)),
    [],
  )
  const auths = useMemo<VarietyProviderAuth[]>(() => {
    void cooperationVersion
    return effectiveProviderAuthRows().flatMap((row) =>
      row.varietyNames.map((name) => {
        const variety = varieties.find((v) => v.tradeName.startsWith(name))
        return {
          id: `${row.id}:${name}`,
          provider: row.provider,
          varietyId: variety?.id ?? name,
          varietyName: variety?.tradeName ?? name,
          holder: variety?.holder ?? DEMO_HOLDER,
          regions: row.regions,
        }
      }),
    )
  }, [cooperationVersion, varieties])
  const [priceBooks, setPriceBooks] = useState<PriceBook[]>(() =>
    clone(seedPriceBooks),
  )
  const [priceItems, setPriceItems] = useState<PriceItem[]>(() =>
    clone(seedPriceItems),
  )
  const [priceRatios, setPriceRatios] = useState<PriceRatio[]>(() =>
    clone(seedPriceRatios),
  )
  const [reportPrices, setReportPrices] = useState<ReportPrice[]>(() =>
    clone(seedReportPrices),
  )
  const [unitPriceAdjustRule, setUnitPriceAdjustRule] =
    useState<UnitPriceAdjustRule>(() => clone(seedUnitPriceAdjustRule))
  const [chain, setChain] = useState<ExecutionChain>(() =>
    clone(seedExecutionChain),
  )
  const [subAuths, setSubAuths] = useState<ProviderSubAuth[]>(() =>
    clone(seedSubAuths),
  )

  /** 调整执行链：只有「工作组」节点可切换，其余节点保持启用 */
  const updateChain = useCallback(
    (
      next: ExecutionChain,
      operator: string,
    ): MutationResult<ExecutionChain> => {
      const before = workGroupEnabled(chain)
      const after = workGroupEnabled(next)
      if (before === after) return { ok: false, error: "执行链未发生变化" }
      const record: ChainChangeRecord = {
        id: `CHAIN-CR-${chain.changeRecords.length + 1}`,
        time: DEMO_NOW,
        operator,
        action: after ? "启用工作组" : "停用工作组",
        impact: after
          ? "新任务恢复四级链：服务商先拆解到工作组，再由工作组分配到专员；存量任务按创建时链路继续执行。"
          : "新任务改为三级链：服务商直接把工作量分配给专员；组长不再参与拆解与填报审核；存量任务按创建时链路继续执行。",
      }
      const updated: ExecutionChain = {
        nodes: chainNodesOf(after),
        changeRecords: [record, ...chain.changeRecords],
        updatedAt: DEMO_NOW,
        updatedBy: operator,
      }
      setChain(updated)
      return { ok: true, data: clone(updated) }
    },
    [chain],
  )

  // ─── 服务商下层品种授权：对象类型跟随链路，拆包强约束的数据源 ───

  /** 当前链路的授权对象类型：四级链 → 工作组；三级链 → 服务专员 */
  const subAuthTargetType = useCallback(
    (): SubAuthTargetType =>
      chainLevelOf(chain) === "四级链" ? "工作组" : "服务专员",
    [chain],
  )

  /** 任务可承接对象：按任务链快照决定对象类型，取任务 品种×区域 上已授权的对象 */
  const authorizedSubTargets = useCallback(
    (task: Task): string[] => {
      const targetType =
        chainLevelOf(task.chainSnapshot) === "四级链" ? "工作组" : "服务专员"
      const hit = subAuths.filter(
        (a) =>
          a.provider === task.provider &&
          a.targetType === targetType &&
          task.varieties.includes(a.varietyName) &&
          task.regions.some(
            (r) => a.regions.includes("全国") || a.regions.includes(r),
          ),
      )
      return [...new Set(hit.map((a) => a.targetName))]
    },
    [subAuths],
  )

  const validateSubAuth = useCallback(
    (input: CreateSubAuthInput): MutationResult<Variety> => {
      if (!input.provider) return { ok: false, error: "请选择服务提供商" }
      if (!input.targetName)
        return { ok: false, error: `请选择${input.targetType}` }
      if (!input.varietyId) return { ok: false, error: "请选择品种" }
      if (!input.regions?.length) return { ok: false, error: "请选择授权区域" }
      const expectType: SubAuthTargetType =
        chainLevelOf(chain) === "四级链" ? "工作组" : "服务专员"
      if (input.targetType !== expectType) {
        return {
          ok: false,
          error: `当前执行链为${chainLevelOf(chain)}，授权对象只能选择${expectType}`,
        }
      }
      const variety = varieties.find((v) => v.id === input.varietyId)
      if (!variety) return { ok: false, error: "品种不存在" }
      for (const region of input.regions) {
        if (
          !isPairAuthorized(auths, input.provider, variety.tradeName, region)
        ) {
          return {
            ok: false,
            error: `${input.provider} 未获得「${variety.tradeName}」在「${region}」的药厂授权，不能向下授权`,
          }
        }
      }
      return { ok: true, data: variety }
    },
    [auths, chain, varieties],
  )

  const createSubAuth = useCallback(
    (input: CreateSubAuthInput): MutationResult<ProviderSubAuth> => {
      const checked = validateSubAuth(input)
      if (!checked.ok) return { ok: false, error: checked.error }
      const variety = checked.data!
      const dup = subAuths.find(
        (a) =>
          a.provider === input.provider &&
          a.targetType === input.targetType &&
          a.targetName === input.targetName &&
          a.varietyId === input.varietyId &&
          a.regions.some((r) => input.regions.includes(r)),
      )
      if (dup)
        return {
          ok: false,
          error: "该对象在本品种所选区域已有授权，请直接编辑区域",
        }
      const row: ProviderSubAuth = {
        id: nextId(
          "SUB",
          subAuths.map((a) => a.id),
        ),
        provider: input.provider,
        targetType: input.targetType,
        targetName: input.targetName,
        varietyId: variety.id,
        varietyName: variety.tradeName,
        regions: [...input.regions],
        createdAt: DEMO_NOW,
        createdBy: "陈伟",
      }
      setSubAuths((prev) => [row, ...prev])
      return { ok: true, data: row }
    },
    [subAuths, validateSubAuth],
  )

  const updateSubAuth = useCallback(
    (
      id: string,
      input: CreateSubAuthInput,
    ): MutationResult<ProviderSubAuth> => {
      const row = subAuths.find((a) => a.id === id)
      if (!row) return { ok: false, error: "授权不存在" }
      const checked = validateSubAuth(input)
      if (!checked.ok) return { ok: false, error: checked.error }
      const variety = checked.data!
      const dup = subAuths.find(
        (a) =>
          a.id !== id &&
          a.provider === input.provider &&
          a.targetType === input.targetType &&
          a.targetName === input.targetName &&
          a.varietyId === input.varietyId &&
          a.regions.some((r) => input.regions.includes(r)),
      )
      if (dup) return { ok: false, error: "该对象在本品种所选区域已有授权" }
      const next: ProviderSubAuth = {
        ...row,
        ...input,
        varietyName: variety.tradeName,
      }
      setSubAuths((prev) => prev.map((a) => (a.id === id ? next : a)))
      return { ok: true, data: next }
    },
    [subAuths, validateSubAuth],
  )

  const deleteSubAuth = useCallback(
    (id: string): MutationResult => {
      if (!subAuths.some((a) => a.id === id))
        return { ok: false, error: "授权不存在" }
      setSubAuths((prev) => prev.filter((a) => a.id !== id))
      return { ok: true }
    },
    [subAuths],
  )

  const appendLog = (task: Task, log: Omit<TaskOpsLog, "id">): TaskOpsLog[] => [
    ...task.opsLogs,
    { ...log, id: `${task.id}-LOG-${task.opsLogs.length + 1}` },
  ]

  const appendBillVersion = (
    bill: SettlementBill,
    action: string,
    operator: string,
  ): SettlementBillVersion[] => [
    ...bill.versions,
    {
      version: bill.versions.length + 1,
      time: DEMO_NOW,
      operator,
      action,
      snapshot: {
        confirmed: bill.confirmed,
        voided: bill.voided,
        finalAmount: bill.finalAmount,
        lines: clone(bill.lines),
      },
    },
  ]

  const authorizedProviders = useCallback(
    (varietyName: string, region: string) =>
      filterAuthorizedProviders(auths, varietyName, [region]),
    [auths],
  )

  const varietiesOf = useCallback(
    (provider: string) => varietiesOfProvider(auths, provider),
    [auths],
  )

  const regionsOf = useCallback(
    (provider: string, varieties?: string[]) =>
      regionsOfProvider(auths, provider, varieties),
    [auths],
  )

  // ─── 预算计划：纯计划数据，与任务零交点，不阻断任何操作 ───

  const createBudgetPlan = useCallback(
    (input: CreateBudgetPlanInput): MutationResult<BudgetPlan> => {
      if (!input.provider) return { ok: false, error: "请选择服务商" }
      if (!input.varieties?.length)
        return { ok: false, error: "请选择覆盖品种" }
      if (!input.regions?.length) return { ok: false, error: "请选择覆盖地区" }
      if (!Number.isFinite(input.yearAmount) || input.yearAmount <= 0)
        return { ok: false, error: "请填写年度预算" }
      const dup = budgetPlans.find(
        (p) => p.year === input.year && p.provider === input.provider,
      )
      if (dup)
        return { ok: false, error: "同年度、同服务商已有预算行，请直接编辑" }
      const authorizedVarieties = varietiesOfProvider(auths, input.provider)
      for (const variety of input.varieties) {
        if (!authorizedVarieties.includes(variety)) {
          return {
            ok: false,
            error: `${input.provider} 未获得「${variety}」的授权`,
          }
        }
      }
      for (const region of input.regions) {
        const covered = input.varieties.some((v) =>
          isPairAuthorized(auths, input.provider, v, region),
        )
        if (!covered) {
          return {
            ok: false,
            error: `${input.provider} 未获得所选品种在「${region}」的授权`,
          }
        }
      }
      const base = Math.floor(input.yearAmount / 12)
      const months = input.months ?? Array.from({ length: 12 }, () => base)
      if (input.months)
        months[11] += input.yearAmount - months.reduce((s, m) => s + m, 0)
      const row: BudgetPlan = {
        id: nextId(
          "BP",
          budgetPlans.map((p) => p.id),
        ),
        year: input.year,
        provider: input.provider,
        varieties: [...input.varieties],
        regions: [...input.regions],
        yearAmount: Math.round(input.yearAmount),
        months: months.map((m) => Math.round(m)),
        updatedAt: DEMO_NOW,
      }
      setBudgetPlans((prev) => [row, ...prev])
      return { ok: true, data: row }
    },
    [auths, budgetPlans],
  )

  const updateBudgetPlan = useCallback(
    (
      id: string,
      patch: { yearAmount?: number; months?: number[] },
    ): MutationResult<BudgetPlan> => {
      const row = budgetPlans.find((p) => p.id === id)
      if (!row) return { ok: false, error: "预算行不存在" }
      if (isBudgetYearLocked(row.year))
        return { ok: false, error: "该年度已结束，整行锁定不可修改" }
      if (patch.months) {
        const frozen = frozenMonthsOf(row.provider, row.year, tasks)
        const changed = frozen.find(
          (m) => (patch.months![m - 1] ?? 0) !== (row.months[m - 1] ?? 0),
        )
        if (changed != null)
          return {
            ok: false,
            error: `${changed}月已有任务执行中，月度预算已冻结`,
          }
      }
      const next: BudgetPlan = {
        ...row,
        yearAmount:
          patch.yearAmount != null
            ? Math.round(patch.yearAmount)
            : row.yearAmount,
        months: patch.months
          ? patch.months.map((m) => Math.round(m))
          : row.months,
        updatedAt: DEMO_NOW,
      }
      setBudgetPlans((prev) => prev.map((p) => (p.id === id ? next : p)))
      const sum = next.months.reduce((s, m) => s + m, 0)
      const warning =
        sum !== next.yearAmount
          ? `月度预算合计 ${formatCNY(sum)} 与年度预算 ${formatCNY(next.yearAmount)} 差 ${formatCNY(Math.abs(sum - next.yearAmount))}，已保存（仅提示，不阻断）`
          : undefined
      return { ok: true, data: next, warning }
    },
    [budgetPlans, tasks],
  )

  // ─── 任务：创建不做任何预算校验 ───

  const createTask = useCallback(
    (
      input: CreateTaskInput,
      role: Role = "药厂销售部门",
    ): MutationResult<Task> => {
      if (role !== "药厂销售部门")
        return { ok: false, error: "仅药厂企业管理员可以创建任务" }
      if (!input.provider) return { ok: false, error: "请选择服务提供商" }
      if (!input.varieties?.length) return { ok: false, error: "请选择品种" }
      if (!input.regions?.length) return { ok: false, error: "请选择服务地区" }
      if (!input.startDate || !input.endDate)
        return { ok: false, error: "请选择推广时间" }
      if (input.endDate < input.startDate)
        return { ok: false, error: "结束日期不能早于开始日期" }

      const picked = input.varieties
        .map((name) => varieties.find((v) => v.tradeName === name))
        .filter((v): v is Variety => !!v)
      if (picked.length !== input.varieties.length)
        return { ok: false, error: "存在无效品种" }
      const bookCheck = assertSamePriceBook(picked, priceBooks)
      if (!bookCheck.ok) return { ok: false, error: bookCheck.error }

      const items = input.serviceItems.filter((it) => it.amount > 0)
      if (!items.length)
        return { ok: false, error: "请至少填写一项服务项目的推广金额" }
      if (
        items.some((it) => !it.variety || !input.varieties.includes(it.variety))
      ) {
        return { ok: false, error: "服务项目必须归属已选品种" }
      }
      if (
        items.some((it) => !it.region || !input.regions.includes(it.region))
      ) {
        return { ok: false, error: "服务项目必须归属到具体品种和地区" }
      }
      for (const it of items) {
        const rangeErr = unitPriceOutOfRange(
          it.unitPrice,
          it.suggestedUnitPrice || it.unitPrice,
          unitPriceAdjustRule,
        )
        if (rangeErr)
          return { ok: false, error: `${it.variety} / ${it.name}：${rangeErr}` }
        const drifted =
          it.unitPrice !== it.suggestedUnitPrice ||
          it.amount !== it.suggestedAmount
        if (drifted && !it.adjustReason?.trim()) {
          return {
            ok: false,
            error: `「${it.name}」偏离建议单价或建议金额，调整原因必填`,
          }
        }
      }

      const itemPairs = new Set(items.map((it) => `${it.variety}|${it.region}`))
      for (const pair of itemPairs) {
        const [variety, region] = pair.split("|")
        if (!isPairAuthorized(auths, input.provider, variety, region)) {
          return {
            ok: false,
            error: `${input.provider} 未获得「${variety}」在「${region}」的授权`,
          }
        }
      }
      for (const variety of input.varieties) {
        for (const region of input.regions) {
          if (!isPairAuthorized(auths, input.provider, variety, region)) {
            return {
              ok: false,
              error: `${input.provider} 未获得「${variety}」在「${region}」的授权`,
            }
          }
        }
      }

      const periodErr = validateSettlementPeriods(
        input.startDate,
        input.endDate,
        input.settlementPeriods || [],
      )
      if (periodErr) return { ok: false, error: periodErr }

      const rec = recommendedBudget({
        provider: input.provider,
        varieties: input.varieties,
        regions: input.regions,
        startDate: input.startDate,
        endDate: input.endDate,
        categories: [...new Set(items.map((it) => it.category))],
        plans: budgetPlans,
      })
      const first = picked[0]
      const planAmount = items.reduce((s, it) => s + it.amount, 0)
      const n = tasks.length + 1
      const id = `TR-${pad(n)}`
      const snapshot = snapshotPriceBook(bookCheck.book)
      const periods = (input.settlementPeriods || []).map((p, i) => ({
        id: `${id}-SP-${i + 1}`,
        name: p.name,
        startDate: p.startDate,
        endDate: p.endDate,
      }))
      const task: Task = {
        id,
        taskNo: `TK-2026-${pad(n, 4)}`,
        taskName: `${input.varieties.join("、")}_${first?.holder ?? DEMO_HOLDER}`,
        varieties: [...input.varieties],
        provider: input.provider,
        holderPharma: input.holderPharma,
        regions: [...input.regions],
        startDate: input.startDate,
        endDate: input.endDate,
        priceBookId: snapshot.id,
        priceBookSnapshot: snapshot,
        chainSnapshot: clone(chain),
        recommendedAmount: rec.amount,
        recommendedConfigured: rec.configured,
        planLocked: false,
        planAmount: Math.round(planAmount),
        settledAmount: 0,
        remainingVoided: false,
        taskStatus: "待确认",
        reconStatus: "未发起",
        createdAt: DEMO_NOW,
        createdBy: ROLE_ACTOR[role],
        serviceItems: items.map((it, i) => ({
          ...it,
          id: it.id || `${id}-SI-${i + 1}`,
        })),
        workgroupSplits: [],
        workloadAssigns: [],
        reports: [],
        settlements: [],
        settlementPeriods: periods,
        roundingLogs: input.roundingLogs ?? [],
        priceAdjustLogs: input.priceAdjustLogs ?? [],
        opsLogs: [
          {
            id: `${id}-LOG-1`,
            time: DEMO_NOW,
            operator: ROLE_ACTOR[role],
            role,
            action: "创建任务",
            detail: `价目表 ${snapshot.name} ${snapshot.version}；计划总金额 ${formatCNY(planAmount)}`,
            afterState: "待确认",
          },
        ],
      }
      // 分派即选定：报告类服务项目同步生成「待上传」报告记录
      const finalized = ensurePendingReports(task)
      setTasks((prev) => [finalized, ...prev])
      const warnings: string[] = []
      if (!rec.configured) warnings.push("未配置预算，已允许创建")
      else if (planAmount > rec.amount)
        warnings.push(
          `计划总金额 ${formatCNY(planAmount)} 高于预算推荐 ${formatCNY(rec.amount)}（仅提示，不阻断）`,
        )
      else if (rec.amount > 0 && planAmount < rec.amount)
        warnings.push(
          `预算推荐 ${formatCNY(rec.amount)}，计划总金额 ${formatCNY(planAmount)}（仅提示）`,
        )
      return { ok: true, data: finalized, warning: warnings.join("；") || undefined }
    },
    [
      auths,
      budgetPlans,
      chain,
      priceBooks,
      tasks,
      unitPriceAdjustRule,
      varieties,
    ],
  )

  const revokeTask = useCallback(
    (id: string): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === id)
      if (!task) return { ok: false, error: "任务不存在" }
      if (task.taskStatus !== "待确认")
        return { ok: false, error: "仅待服务商确认的任务可以撤销" }
      const next: Task = {
        ...task,
        taskStatus: "已撤销",
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: "李强",
          role: "企业管理员 · 销售部",
          action: "撤销任务",
          detail: "药厂撤销待确认任务",
          beforeState: "待确认",
          afterState: "已撤销",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === id ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const confirmTask = useCallback(
    (id: string): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === id)
      if (!task) return { ok: false, error: "任务不存在" }
      if (task.taskStatus !== "待确认")
        return { ok: false, error: "仅待确认任务可以确认" }
      const next: Task = {
        ...task,
        taskStatus: "执行中",
        planLocked: true,
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: ROLE_ACTOR["服务提供商"],
          role: "服务提供商",
          action: "确认任务",
          detail: "服务商确认后，任务计划、单价和价目表快照锁定",
          beforeState: "待确认",
          afterState: "执行中",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === id ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const unconfirmProvider = useCallback(
    (id: string): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === id)
      if (!task) return { ok: false, error: "任务不存在" }
      if (!canUnconfirmProvider(task)) {
        return {
          ok: false,
          error:
            "仅执行中且没有分配、执行、报告或结算数据的任务可撤回服务商确认",
        }
      }
      const next: Task = {
        ...task,
        taskStatus: "待确认",
        planLocked: false,
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: "李强",
          role: "企业管理员 · 销售部",
          action: "撤回服务商确认",
          detail: "无执行数据，撤回后回到待服务商确认",
          beforeState: "执行中",
          afterState: "待确认",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === id ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const splitToWorkgroup = useCallback(
    (
      taskId: string,
      splits: Omit<WorkgroupSplit, "id">[],
    ): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      if (task.taskStatus !== "执行中")
        return { ok: false, error: "仅执行中任务可拆分任务包" }
      const rows = splits.filter((s) => s.qty > 0)
      if (rows.length === 0)
        return { ok: false, error: "请至少为一个工作组分配业务次数" }
      const groups = [...new Set(rows.map((s) => s.workGroup))]
      if (groups.some((g) => !g)) return { ok: false, error: "请选择工作组" }
      if (
        groups.some((g) => !rows.some((s) => s.workGroup === g && s.qty > 0))
      ) {
        return { ok: false, error: "每个工作组至少分配 1 条业务次数" }
      }
      const badRow = rows.find(
        (s) => !s.itemName || !s.variety || !s.region || s.unitPrice <= 0,
      )
      if (badRow)
        return {
          ok: false,
          error: "拆分明细不完整，请重新选择工作组、品种、地区与业务",
        }
      const notInPlan = rows.find(
        (s) =>
          !task.serviceItems.some(
            (i) =>
              i.variety === s.variety &&
              i.region === s.region &&
              i.name === s.itemName &&
              i.category === s.category &&
              i.unitPrice === s.unitPrice,
          ),
      )
      if (notInPlan) {
        return {
          ok: false,
          error: `${notInPlan.workGroup}：${notInPlan.variety} · ${notInPlan.region} · ${notInPlan.itemName} 不在任务计划明细中（单价须与价目表一致）`,
        }
      }
      const overQty = rows.find((s) => {
        const plan = task.serviceItems.find(
          (i) =>
            i.variety === s.variety &&
            i.region === s.region &&
            i.name === s.itemName,
        )
        const total = rows
          .filter(
            (x) =>
              x.variety === s.variety &&
              x.region === s.region &&
              x.itemName === s.itemName,
          )
          .reduce((sum, x) => sum + x.qty, 0)
        return !plan || total > plan.qty
      })
      if (overQty) {
        const plan = task.serviceItems.find(
          (i) =>
            i.variety === overQty.variety &&
            i.region === overQty.region &&
            i.name === overQty.itemName,
        )
        return {
          ok: false,
          error: `${overQty.variety} · ${overQty.region} · ${overQty.itemName} 各组次数合计超过计划次数（计划 ${plan?.qty ?? 0}）`,
        }
      }
      const sum = rows.reduce((s, x) => s + x.unitPrice * x.qty, 0)
      if (sum > task.planAmount) {
        return {
          ok: false,
          error: `累计拆分金额 ${formatCNY(sum)} 超过计划总金额 ${formatCNY(task.planAmount)}`,
        }
      }
      const next: Task = {
        ...task,
        workgroupSplits: rows.map((s, i) => ({
          ...s,
          amount: s.unitPrice * s.qty,
          id: `${taskId}-WG-${i + 1}`,
        })),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  /** 三级链：服务商把工作量直接分配给服务专员（rows 复用 WorkgroupSplit 形态，workGroup 字段承载专员姓名） */
  const splitToSpecialists = useCallback(
    (
      taskId: string,
      splits: Omit<WorkgroupSplit, "id">[],
    ): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      if (task.taskStatus !== "执行中")
        return { ok: false, error: "仅执行中任务可分配任务量" }
      if (chainLevelOf(task.chainSnapshot) !== "三级链")
        return { ok: false, error: "该任务为四级链任务，请拆分任务包到工作组" }
      const rows = splits.filter((s) => s.qty > 0)
      if (rows.length === 0)
        return { ok: false, error: "请至少为一名服务专员分配工作量" }
      if (rows.some((s) => !s.workGroup))
        return { ok: false, error: "请选择服务专员" }
      const badRow = rows.find(
        (s) => !s.itemName || !s.variety || !s.region || s.unitPrice <= 0,
      )
      if (badRow)
        return {
          ok: false,
          error: "分配明细不完整，请重新选择专员、品种、地区与业务",
        }
      // 授权强约束：专员必须是该任务 品种×区域 上已授权的对象
      const allowed = new Set(authorizedSubTargets(task))
      const unauthorized = rows.find((s) => !allowed.has(s.workGroup))
      if (unauthorized) {
        return {
          ok: false,
          error: `「${unauthorized.workGroup}」未获得本任务品种·区域的服务商授权，请先在 品种授权 → 服务商授权 中授权`,
        }
      }
      const notInPlan = rows.find(
        (s) =>
          !task.serviceItems.some(
            (i) =>
              i.variety === s.variety &&
              i.region === s.region &&
              i.name === s.itemName &&
              i.category === s.category &&
              i.unitPrice === s.unitPrice,
          ),
      )
      if (notInPlan) {
        return {
          ok: false,
          error: `${notInPlan.workGroup}：${notInPlan.variety} · ${notInPlan.region} · ${notInPlan.itemName} 不在任务计划明细中（单价须与价目表一致）`,
        }
      }
      const overQty = rows.find((s) => {
        const plan = task.serviceItems.find(
          (i) =>
            i.variety === s.variety &&
            i.region === s.region &&
            i.name === s.itemName,
        )
        const existing = task.workloadAssigns
          .filter(
            (a) =>
              a.specialist !== s.workGroup &&
              a.variety === s.variety &&
              a.region === s.region &&
              a.itemName === s.itemName,
          )
          .reduce((sum, a) => sum + a.workload, 0)
        const incoming = rows
          .filter(
            (x) =>
              x.variety === s.variety &&
              x.region === s.region &&
              x.itemName === s.itemName,
          )
          .reduce((sum, x) => sum + x.qty, 0)
        return !plan || existing + incoming > plan.qty
      })
      if (overQty) {
        const plan = task.serviceItems.find(
          (i) =>
            i.variety === overQty.variety &&
            i.region === overQty.region &&
            i.name === overQty.itemName,
        )
        return {
          ok: false,
          error: `${overQty.variety} · ${overQty.region} · ${overQty.itemName} 各专员工作量合计超过计划次数（计划 ${plan?.qty ?? 0}）`,
        }
      }
      const incomingAmount = rows.reduce((s, x) => s + x.unitPrice * x.qty, 0)
      const assignedAmount = task.workloadAssigns.reduce(
        (s, a) => s + a.amount,
        0,
      )
      if (assignedAmount + incomingAmount > task.planAmount) {
        return {
          ok: false,
          error: `累计分配金额 ${formatCNY(assignedAmount + incomingAmount)} 超过计划总金额 ${formatCNY(task.planAmount)}`,
        }
      }
      // 追加合并：同 专员+品种+地区+业务+服务月份 覆盖旧记录，其余保留（支持分批分配，不丢执行进度）
      const serviceMonth = task.startDate.slice(0, 7)
      const keyOf = (a: {
        specialist: string
        variety: string
        region: string
        itemName: string
        serviceMonth: string
      }) =>
        `${a.specialist}|${a.variety}|${a.region}|${a.itemName}|${a.serviceMonth}`
      const merged = new Map(task.workloadAssigns.map((a) => [keyOf(a), a]))
      const settledHit = rows.find(
        (s) =>
          merged.get(
            keyOf({
              specialist: s.workGroup,
              variety: s.variety,
              region: s.region,
              itemName: s.itemName,
              serviceMonth,
            }),
          )?.settledBillNo,
      )
      if (settledHit)
        return {
          ok: false,
          error: `「${settledHit.workGroup}」的${settledHit.itemName}已选入结算单，不可重新分配`,
        }
      rows.forEach((s, i) => {
        merged.set(
          keyOf({
            specialist: s.workGroup,
            variety: s.variety,
            region: s.region,
            itemName: s.itemName,
            serviceMonth,
          }),
          {
            id: `${taskId}-WL-${task.workloadAssigns.length + i + 1}`,
            specialist: s.workGroup,
            variety: s.variety,
            region: s.region,
            category: s.category,
            itemName: s.itemName,
            workload: s.qty,
            amount: s.unitPrice * s.qty,
            progress: "未完成",
            serviceMonth,
          },
        )
      })
      const next: Task = {
        ...task,
        workloadAssigns: [...merged.values()],
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: ROLE_ACTOR["服务提供商"],
          role: "服务提供商",
          action: "分配任务量",
          detail: "三级链任务：工作量直接分配给服务专员，不经工作组",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [authorizedSubTargets, tasks],
  )

  const assignWorkload = useCallback(
    (
      taskId: string,
      assigns: Omit<WorkloadAssign, "id">[],
    ): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      if (
        chainLevelOf(task.chainSnapshot) === "四级链" &&
        task.workgroupSplits.length === 0
      ) {
        return { ok: false, error: "请先拆分任务包到工作组" }
      }
      if (
        assigns.some(
          (a) =>
            !a.specialist ||
            !a.variety ||
            !a.region ||
            a.workload <= 0 ||
            a.amount <= 0 ||
            !a.serviceMonth ||
            !a.itemName,
        )
      ) {
        return {
          ok: false,
          error: "请完整填写品种、地区、服务项目、服务月份、专员、工作量和金额",
        }
      }
      if (
        assigns.some(
          (a) =>
            !task.varieties.includes(a.variety) ||
            !task.regions.includes(a.region),
        )
      ) {
        return { ok: false, error: "工作量的品种/地区必须属于本任务覆盖范围" }
      }
      // 已选入结算单的任务量不可被覆盖移除
      const kept = new Set(
        assigns.map((a) => `${a.specialist}|${a.serviceMonth}|${a.itemName}`),
      )
      const droppedSettled = task.workloadAssigns.some(
        (a) =>
          a.settledBillNo &&
          !kept.has(`${a.specialist}|${a.serviceMonth}|${a.itemName}`),
      )
      if (droppedSettled)
        return {
          ok: false,
          error: "已选入结算单的任务量不可移除，请保留对应记录",
        }
      const next: Task = {
        ...task,
        workloadAssigns: assigns.map((a, i) => ({
          ...a,
          id: `${taskId}-WL-${i + 1}`,
        })),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const uploadReport = useCallback(
    (
      taskId: string,
      reportId: string,
      payload: ReportUploadPayload,
    ): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      const report = task.reports.find((r) => r.id === reportId)
      if (!report) return { ok: false, error: "报告记录不存在" }
      if (report.status !== "待上传")
        return { ok: false, error: "该报告已上传，请等待审核；被退回的报告请走重新上传" }
      if (!payload.fileName.trim()) return { ok: false, error: "请选择报告附件" }
      // 名称/品种/区域/服务项目由分派记录锁定，仅登记附件
      const next: Task = {
        ...task,
        reports: task.reports.map((r) =>
          r.id === reportId
            ? {
                ...r,
                fileName: payload.fileName.trim(),
                url: payload.url,
                uploadedAt: DEMO_NOW,
                uploadedBy: task.provider,
                status: "待审核",
                comment: "",
                serviceMonth: DEMO_NOW.slice(0, 7),
                version: 1,
              }
            : r,
        ),
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: ROLE_ACTOR["服务提供商"],
          role: "服务提供商",
          action: "上传报告",
          detail: `${report.name} · 附件 ${payload.fileName.trim()}`,
          afterState: "执行中",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const reuploadReport = useCallback(
    (
      taskId: string,
      reportId: string,
      payload: ReportUploadPayload,
    ): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      const report = task.reports.find((r) => r.id === reportId)
      if (!report) return { ok: false, error: "报告不存在" }
      if (report.status === "待上传")
        return { ok: false, error: "该报告尚未上传过附件，请直接上传" }
      if (report.status === "通过")
        return { ok: false, error: "审核通过的报告已锁定，不可重新上传" }
      if (report.settledBillNo)
        return { ok: false, error: "报告已选入结算单，不可重新上传" }
      if (!payload.name.trim()) return { ok: false, error: "请填写报告名称" }
      if (!payload.fileName.trim()) return { ok: false, error: "请选择报告附件" }
      if (!payload.variety) return { ok: false, error: "请选择所属品种" }
      const matchedItem = task.serviceItems.find(
        (it) => it.category !== "市场推广服务" && it.name === payload.itemName,
      )
      const next: Task = {
        ...task,
        reports: task.reports.map((r) =>
          r.id === reportId
            ? {
                ...r,
                name: payload.name.trim(),
                fileName: payload.fileName.trim(),
                url: payload.url,
                variety: payload.variety,
                region: payload.region,
                itemName: matchedItem?.name ?? r.itemName,
                category: matchedItem?.category ?? r.category,
                uploadedAt: DEMO_NOW,
                uploadedBy: task.provider,
                status: "待审核",
                comment: "",
                serviceMonth: r.serviceMonth ?? DEMO_NOW.slice(0, 7),
                version: (r.version ?? 1) + 1,
              }
            : r,
        ),
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: ROLE_ACTOR["服务提供商"],
          role: "服务提供商",
          action: "重新上传报告",
          detail: `${payload.name.trim()}（第 ${(report.version ?? 1) + 1} 版），状态回到待审核`,
          afterState: "执行中",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const reviewReport = useCallback(
    (
      taskId: string,
      reportId: string,
      pass: boolean,
      comment: string,
    ): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      if (!pass && !comment.trim()) return { ok: false, error: "驳回意见必填" }
      const next: Task = {
        ...task,
        reports: task.reports.map((r) =>
          r.id === reportId
            ? { ...r, status: pass ? "通过" : "驳回", comment: comment.trim() }
            : r,
        ),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  // ─── 生成结算单：结算信息（锁定结算品种+结算月份）→ 结算项目（勾选明细填本次结算量）→ 明细调整（可选回填）───

  const startSettlement = useCallback(
    (
      taskId: string,
      input: SettlementStartInput,
    ): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      if (task.taskStatus !== "执行中")
        return { ok: false, error: "仅执行中任务可发起结算" }
      if (hasInProgressBill(task))
        return { ok: false, error: "已有结算单待确认" }
      const { serviceMonth, selections } = input
      if (!/^\d{4}-\d{2}$/.test(serviceMonth))
        return { ok: false, error: "请选择服务月份" }
      if (!selections.length) return { ok: false, error: "请勾选结算明细" }
      const period = findPeriodForMonth(task, serviceMonth)
      if (!period)
        return {
          ok: false,
          error:
            "服务商只能针对药厂预设结算周期发起结算，当前月份不在任何预设周期内",
        }

      // 展开勾选：任务量行（可部分数量）+ 已通过报告行（整份）
      const chosenWorkloads: { assign: WorkloadAssign; qty: number }[] = []
      const chosenReports: { report: ReportFile; qty: number }[] = []
      for (const sel of selections) {
        if ("workloadId" in sel) {
          const assign = task.workloadAssigns.find(
            (a) => a.id === sel.workloadId,
          )
          if (!assign) return { ok: false, error: "结算明细不存在" }
          const remainingQty = assign.workload - (assign.settledQty ?? 0)
          if (
            assign.progress !== "已完成" ||
            assign.settledBillNo ||
            assign.serviceMonth !== serviceMonth
          )
            return {
              ok: false,
              error: "只能选择该服务月份内已审核且未结算的任务量",
            }
          if (
            !Number.isInteger(sel.qty) ||
            sel.qty < 1 ||
            sel.qty > remainingQty
          )
            return {
              ok: false,
              error: `本次结算量须为 1 ~ ${remainingQty} 的整数`,
            }
          chosenWorkloads.push({ assign, qty: sel.qty })
        } else {
          const report = task.reports.find((r) => r.id === sel.reportId)
          if (!report) return { ok: false, error: "结算明细不存在" }
          if (
            report.status !== "通过" ||
            report.settledBillNo ||
            (report.serviceMonth ?? report.uploadedAt.slice(0, 7)) !==
              serviceMonth
          )
            return {
              ok: false,
              error: "只能选择该服务月份内已审核通过且未结算的报告",
            }
          chosenReports.push({ report, qty: 1 })
        }
      }

      // 按 品种×地区×服务类型×服务项目 汇总成结算单明细行（零分摊；任务量按本次工作量折算金额）
      const grouped = new Map<string, SettlementLine>()
      chosenWorkloads.forEach(({ assign, qty }) => {
        const unitPrice = assign.workload > 0 ? assign.amount / assign.workload : 0
        const lineAmount = Math.round(unitPrice * qty)
        const key = `${assign.variety}|${assign.region}|${assign.category}|${assign.itemName}`
        const exist = grouped.get(key)
        if (exist) {
          exist.serviceAmount += lineAmount
          exist.actualAmount += lineAmount
        } else {
          grouped.set(key, {
            id: key,
            variety: assign.variety,
            region: assign.region,
            serviceType: assign.category,
            serviceItem: assign.itemName,
            serviceAmount: lineAmount,
            actualAmount: lineAmount,
            remark: "",
          })
        }
      })
      chosenReports.forEach(({ report }) => {
        const matchedItem = task.serviceItems.find(
          (it) =>
            it.category !== "市场推广服务" &&
            it.name === (report.itemName ?? it.name),
        )
        const unitPrice = matchedItem?.unitPrice ?? 0
        const key = `${report.variety ?? task.varieties[0] ?? ""}|${report.region ?? task.regions[0] ?? ""}|${report.category ?? "分析报告服务"}|${report.itemName ?? report.name}`
        const exist = grouped.get(key)
        if (exist) {
          exist.serviceAmount += unitPrice
          exist.actualAmount += unitPrice
        } else {
          grouped.set(key, {
            id: key,
            variety: report.variety ?? task.varieties[0] ?? "",
            region: report.region ?? task.regions[0] ?? "",
            serviceType: report.category ?? "分析报告服务",
            serviceItem: report.itemName ?? report.name,
            serviceAmount: unitPrice,
            actualAmount: unitPrice,
            remark: `对应报告：${report.fileName ?? report.name}`,
          })
        }
      })
      const lines = [...grouped.values()].map((l, i) => ({
        ...l,
        id: `${taskId}-L-${Date.now()}-${i}`,
      }))
      const amount = lines.reduce((s, l) => s + l.actualAmount, 0)
      const remain = remainingOfTask(task)
      if (amount <= 0) return { ok: false, error: "结算金额须大于 0" }
      if (amount > remain)
        return {
          ok: false,
          error: `结算金额 ${formatCNY(amount)} 超过剩余可结算金额 ${formatCNY(remain)}`,
        }

      const seq = task.settlements.length + 1
      const billNo = `JS-2026-${task.taskNo.slice(-4)}-${pad(seq, 2)}`
      const workGroupNames = [
        ...new Set(
          chosenWorkloads
            .map((w) => w.assign.workGroup)
            .filter((x): x is string => !!x),
        ),
      ]
      const workGroupLabel = chosenWorkloads.length
        ? workGroupNames.length === 1
          ? workGroupNames[0]
          : "多工作组"
        : "报告服务"
      const bill: SettlementBill = {
        id: `${taskId}-SB-${seq}`,
        billNo,
        contractNo: "HT-2026-BY-001",
        workGroup: workGroupLabel,
        settlementPeriodId: period.id,
        servicePeriod: `${period.startDate} ~ ${period.endDate}`,
        serviceMonth,
        madeAt: DEMO_NOW.slice(0, 10),
        provider: task.provider,
        lines,
        finalAmount: amount,
        confirmed: false,
        voided: false,
        financeLocked: false,
        appliedAmount: amount,
        adjustAmount: 0,
        workloadSettledQty: chosenWorkloads.map((w) => ({
          workloadId: w.assign.id,
          qty: w.qty,
        })),
        versions: [
          {
            version: 1,
            time: DEMO_NOW,
            operator: ROLE_ACTOR["服务提供商"],
            action: "发起结算",
            snapshot: {
              confirmed: false,
              voided: false,
              finalAmount: amount,
              lines,
            },
          },
        ],
      }
      const next: Task = {
        ...task,
        reconStatus: "对账中",
        settlements: [...task.settlements, bill],
        workloadAssigns: task.workloadAssigns.map((a) => {
          const hit = chosenWorkloads.find((w) => w.assign.id === a.id)
          if (!hit) return a
          const settledQty = (a.settledQty ?? 0) + hit.qty
          return {
            ...a,
            settledQty,
            settledBillNo:
              settledQty >= a.workload ? billNo : a.settledBillNo,
          }
        }),
        reports: task.reports.map((r) =>
          chosenReports.some((w) => w.report.id === r.id)
            ? { ...r, settledBillNo: billNo }
            : r,
        ),
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: ROLE_ACTOR["服务提供商"],
          role: "服务提供商",
          action: "发起结算",
          detail: `${billNo} · 周期 ${period.name} · 申请 ${formatCNY(amount)} · 明细 ${selections.length} 条`,
          afterState: "对账中",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const confirmSettlement = useCallback(
    (
      taskId: string,
      billId: string,
      lines: SettlementLine[],
      opts?: ConfirmSettlementInput,
    ): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      const bill = task.settlements.find((b) => b.id === billId)
      if (!bill || bill.confirmed || bill.voided)
        return { ok: false, error: "结算单不存在、已作废或已确认" }
      if (!opts?.declarationAccepted)
        return { ok: false, error: "请勾选确认声明后再确认" }
      if (lines.some((l) => !l.variety || !l.region))
        return { ok: false, error: "结算明细须包含品种和地区" }
      for (const l of lines) {
        const min = Math.round(l.serviceAmount * 0.5)
        const max = Math.round(l.serviceAmount * 1.5)
        if (l.actualAmount < min || l.actualAmount > max) {
          return {
            ok: false,
            error: `「${l.serviceItem}」实际结算金额须在计划金额的 50%—150% 内（${formatCNY(min)} ~ ${formatCNY(max)}）`,
          }
        }
        if (l.actualAmount !== l.serviceAmount && !l.remark.trim()) {
          return { ok: false, error: "调整实际结算金额时调整原因必填" }
        }
      }
      const appliedAmount = lines.reduce((s, l) => s + l.serviceAmount, 0)
      const finalAmount = lines.reduce((s, l) => s + l.actualAmount, 0)
      const remain = remainingOfTask(task)
      if (finalAmount > remain)
        return {
          ok: false,
          error: `实际结算金额超过剩余可结算金额 ${formatCNY(remain)}`,
        }
      const patched: SettlementBill = {
        ...bill,
        lines,
        finalAmount,
        confirmed: true,
        confirmedAt: DEMO_NOW,
        confirmedBy: "李强",
        declarationAccepted: true,
        declarationVersion: opts.declarationVersion,
        appliedAmount,
        adjustAmount: finalAmount - appliedAmount,
      }
      patched.versions = appendBillVersion(patched, "结算确认", "李强")
      const nextBills = task.settlements.map((b) =>
        b.id === billId ? patched : b,
      )
      const nextPartial: Task = {
        ...task,
        settlements: nextBills,
        remainingVoided: false,
      }
      const newSettled = confirmedSettledAmount(nextPartial)
      const next: Task = {
        ...nextPartial,
        settledAmount: newSettled,
        reconStatus: "已结算",
        taskStatus: "执行中",
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: "李强",
          role: "企业管理员 · 销售部",
          action: "结算确认",
          detail: `${bill.billNo} 申请 ${formatCNY(appliedAmount)}，确认 ${formatCNY(finalAmount)}，声明 ${opts.declarationVersion}`,
          afterState: "已结算",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const completeSettlement = useCallback(
    (taskId: string): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      if (task.taskStatus === "已结算")
        return { ok: false, error: "任务已结算完结" }
      if (!canCompleteSettlement(task)) {
        return {
          ok: false,
          error: "结算完结要求至少一笔已对账结算单，且没有对账中结算单",
        }
      }
      const remain = remainingOfTask(task)
      const next: Task = {
        ...task,
        remainingVoided: remain > 0,
        settledAmount: confirmedSettledAmount(task),
        taskStatus: "已结算",
        reconStatus: "已结算",
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: "李强",
          role: "企业管理员 · 销售部",
          action: "结算完结",
          detail:
            remain > 0
              ? `剩余计划金额 ${formatCNY(remain)} 作废，剩余可结算归零`
              : "任务金额已全部结清",
          beforeState: "执行中",
          afterState: "已结算",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const rollbackStartSettlement = useCallback(
    (taskId: string, billId: string): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      const bill = task.settlements.find((b) => b.id === billId)
      if (!bill) return { ok: false, error: "结算单不存在" }
      if (!isLatestValidBill(task, billId))
        return { ok: false, error: "非最新有效结算单不可回退" }
      if (bill.financeLocked)
        return { ok: false, error: "已财务锁定的结算单不可回退" }
      if (!canRollbackStart(task, bill))
        return {
          ok: false,
          error: "对账中只能回退最新有效结算单的「发起结算」",
        }
      const voided: SettlementBill = {
        ...bill,
        voided: true,
        voidedAt: DEMO_NOW,
        voidedBy: "李强",
        voidReason: "回退发起结算",
      }
      voided.versions = appendBillVersion(voided, "回退发起结算", "李强")
      const nextBills = task.settlements.map((b) =>
        b.id === billId ? voided : b,
      )
      const nextPartial: Task = { ...task, settlements: nextBills }
      const next: Task = {
        ...nextPartial,
        reconStatus:
          confirmedSettledAmount(nextPartial) > 0 ? "已结算" : "未发起",
        settledAmount: confirmedSettledAmount(nextPartial),
        workloadAssigns: task.workloadAssigns.map((a) => {
          const hit = bill.workloadSettledQty?.find(
            (w) => w.workloadId === a.id,
          )
          if (hit) {
            const settledQty = Math.max(0, (a.settledQty ?? hit.qty) - hit.qty)
            return {
              ...a,
              settledQty,
              settledBillNo: settledQty > 0 ? a.settledBillNo : undefined,
            }
          }
          return a.settledBillNo === bill.billNo
            ? { ...a, settledBillNo: undefined }
            : a
        }),
        reports: task.reports.map((r) =>
          r.settledBillNo === bill.billNo
            ? { ...r, settledBillNo: undefined }
            : r,
        ),
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: "李强",
          role: "企业管理员 · 销售部",
          action: "回退发起结算",
          detail: `${bill.billNo} 逻辑作废，任务量与报告解除占用`,
          beforeState: "对账中",
          afterState:
            confirmedSettledAmount(nextPartial) > 0 ? "已结算" : "未发起",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const rollbackConfirmSettlement = useCallback(
    (taskId: string, billId: string): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      const bill = task.settlements.find((b) => b.id === billId)
      if (!bill) return { ok: false, error: "结算单不存在" }
      if (!isLatestValidBill(task, billId))
        return { ok: false, error: "非最新有效结算单不可回退" }
      if (bill.financeLocked)
        return { ok: false, error: "已财务锁定的结算单不可回退" }
      if (!canRollbackConfirm(task, bill))
        return {
          ok: false,
          error: "已对账只能回退最新有效结算单的「结算确认」",
        }
      const unconfirmed: SettlementBill = {
        ...bill,
        confirmed: false,
        confirmedAt: undefined,
        confirmedBy: undefined,
        declarationAccepted: false,
      }
      unconfirmed.versions = appendBillVersion(
        unconfirmed,
        "回退结算确认",
        "李强",
      )
      const nextBills = task.settlements.map((b) =>
        b.id === billId ? unconfirmed : b,
      )
      const nextPartial: Task = {
        ...task,
        settlements: nextBills,
        remainingVoided: false,
      }
      const next: Task = {
        ...nextPartial,
        taskStatus: "执行中",
        reconStatus: "对账中",
        settledAmount: confirmedSettledAmount(nextPartial),
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: "李强",
          role: "企业管理员 · 销售部",
          action: "回退结算确认",
          detail: `${bill.billNo} 恢复为对账中`,
          beforeState: "已结算",
          afterState: "对账中",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const rollbackCompleteSettlement = useCallback(
    (taskId: string): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      if (!canRollbackComplete(task))
        return { ok: false, error: "仅已结算任务可回退结算完结" }
      const next: Task = {
        ...task,
        taskStatus: "执行中",
        remainingVoided: false,
        reconStatus: hasInProgressBill(task) ? "对账中" : "已结算",
        settledAmount: confirmedSettledAmount(task),
        opsLogs: appendLog(task, {
          time: DEMO_NOW,
          operator: "李强",
          role: "企业管理员 · 销售部",
          action: "回退结算完结",
          detail: "恢复执行中，剩余可结算金额重新计算",
          beforeState: "已结算",
          afterState: "执行中",
        }),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const uploadPaymentVoucher = useCallback(
    (taskId: string, billId: string, name: string): MutationResult<Task> => {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return { ok: false, error: "任务不存在" }
      if (!name.trim()) return { ok: false, error: "请填写凭证文件名" }
      const next: Task = {
        ...task,
        settlements: task.settlements.map((b) =>
          b.id === billId ? { ...b, paymentVoucher: name.trim() } : b,
        ),
      }
      setTasks((prev) => prev.map((t) => (t.id === taskId ? next : t)))
      return { ok: true, data: next }
    },
    [tasks],
  )

  const createVariety = useCallback(
    (input: Omit<Variety, "id">): MutationResult<Variety> => {
      if (!input.genericName || !input.tradeName)
        return { ok: false, error: "请填写通用名和商品名" }
      const id = nextId(
        "V",
        varieties.map((v) => v.id),
      )
      const row: Variety = {
        ...input,
        id,
        holder: input.holder || DEMO_HOLDER,
        activePriceBookId: input.activePriceBookId || "",
      }
      setVarieties((prev) => [...prev, row])
      return { ok: true, data: row }
    },
    [varieties],
  )

  const bindVarietyPriceBook = useCallback(
    (varietyId: string, priceBookId: string): MutationResult<Variety> => {
      const row = varieties.find((v) => v.id === varietyId)
      if (!row) return { ok: false, error: "品种不存在" }
      if (priceBookId) {
        const book = priceBooks.find((b) => b.id === priceBookId)
        if (!book) return { ok: false, error: "价目表不存在" }
      }
      const next = { ...row, activePriceBookId: priceBookId }
      setVarieties((prev) => prev.map((v) => (v.id === varietyId ? next : v)))
      return { ok: true, data: next }
    },
    [priceBooks, varieties],
  )

  const saveUnitPriceAdjustRule = useCallback(
    (rule: UnitPriceAdjustRule): MutationResult<UnitPriceAdjustRule> => {
      if (rule.minAdjustRatio > rule.maxAdjustRatio)
        return { ok: false, error: "最小调整比例不能大于最大调整比例" }
      const next = { ...rule }
      setUnitPriceAdjustRule(next)
      return { ok: true, data: next }
    },
    [],
  )

  const updateVariety = useCallback(
    (id: string, patch: Partial<Variety>): MutationResult<Variety> => {
      const row = varieties.find((v) => v.id === id)
      if (!row) return { ok: false, error: "品种不存在" }
      const next = { ...row, ...patch, id }
      setVarieties((prev) => prev.map((v) => (v.id === id ? next : v)))
      return { ok: true, data: next }
    },
    [varieties],
  )

  const savePriceItems = useCallback(
    (varietyId: string, items: PriceItem[]): MutationResult => {
      const variety = varieties.find((v) => v.id === varietyId)
      const bookId = variety?.activePriceBookId || items[0]?.priceBookId
      if (!bookId) return { ok: false, error: "请先为品种绑定有效价目表" }
      const nextItems = items.map((it) => ({
        ...it,
        priceBookId: bookId,
        varietyId: "",
      }))
      setPriceItems((prev) => [
        ...prev.filter((p) => p.priceBookId !== bookId),
        ...nextItems,
      ])
      setPriceBooks((prev) =>
        prev.map((b) => {
          if (b.id !== bookId) return b
          const promo = nextItems.map((it, i) => ({
            id: it.id || `PBR-${bookId}-P${i + 1}`,
            category: it.category as PriceBook["rules"][number]["category"],
            name: it.name,
            amount: it.amount,
            unit: it.unit,
            isContractAmount: it.isContractAmount,
            isPreset: it.isPreset,
            ratio: b.rules.find((r) => r.name === it.name)?.ratio ?? 0,
          }))
          const reports = b.rules.filter((r) => r.category !== "市场推广服务")
          return { ...b, rules: [...promo, ...reports] }
        }),
      )
      return { ok: true }
    },
    [varieties],
  )

  const savePriceRatios = useCallback(
    (varietyId: string, ratios: PriceRatio[]): MutationResult => {
      const sum = ratios.reduce((s, r) => s + r.ratio, 0)
      if (sum !== 100)
        return { ok: false, error: `工作量比例合计必须为 100%，当前为 ${sum}%` }
      const variety = varieties.find((v) => v.id === varietyId)
      const bookId = variety?.activePriceBookId || ratios[0]?.priceBookId
      if (!bookId) return { ok: false, error: "请先为品种绑定有效价目表" }
      const nextRatios = ratios.map((it) => ({
        ...it,
        priceBookId: bookId,
        varietyId: "",
      }))
      setPriceRatios((prev) => [
        ...prev.filter((p) => p.priceBookId !== bookId),
        ...nextRatios,
      ])
      setPriceBooks((prev) =>
        prev.map((b) => {
          if (b.id !== bookId) return b
          return {
            ...b,
            rules: b.rules.map((r) => {
              const hit = nextRatios.find((x) => x.name === r.name)
              return hit ? { ...r, ratio: hit.ratio } : r
            }),
          }
        }),
      )
      return { ok: true }
    },
    [varieties],
  )

  const saveReportPrices = useCallback(
    (varietyId: string, prices: ReportPrice[]): MutationResult => {
      const sum = prices.reduce((s, r) => s + r.ratio, 0)
      if (sum !== 100)
        return { ok: false, error: `报告比例合计必须为 100%，当前为 ${sum}%` }
      const variety = varieties.find((v) => v.id === varietyId)
      const bookId = variety?.activePriceBookId || prices[0]?.priceBookId
      if (!bookId) return { ok: false, error: "请先为品种绑定有效价目表" }
      const nextPrices = prices.map((it) => ({
        ...it,
        priceBookId: bookId,
        varietyId: "",
      }))
      setReportPrices((prev) => [
        ...prev.filter((p) => p.priceBookId !== bookId),
        ...nextPrices,
      ])
      setPriceBooks((prev) =>
        prev.map((b) => {
          if (b.id !== bookId) return b
          const promo = b.rules.filter((r) => r.category === "市场推广服务")
          const reports = nextPrices.map((it, i) => ({
            id: it.id || `PBR-${bookId}-R${i + 1}`,
            category: it.reportType as PriceBook["rules"][number]["category"],
            name: it.name,
            amount: it.amount,
            unit: it.unit,
            isContractAmount: true,
            isPreset: true,
            ratio: it.ratio,
          }))
          return { ...b, rules: [...promo, ...reports] }
        }),
      )
      return { ok: true }
    },
    [varieties],
  )

  const copyPriceList = useCallback(
    (fromVarietyId: string, toVarietyIds: string[]): MutationResult => {
      if (!toVarietyIds.length) return { ok: false, error: "请选择目标品种" }
      const from = varieties.find((v) => v.id === fromVarietyId)
      if (!from?.activePriceBookId)
        return { ok: false, error: "源品种未绑定标准价目表，无法按价目表复制" }
      setVarieties((prev) =>
        prev.map((v) =>
          toVarietyIds.includes(v.id)
            ? { ...v, activePriceBookId: from.activePriceBookId }
            : v,
        ),
      )
      return { ok: true }
    },
    [varieties],
  )

  const value = useMemo<TaskDataContextValue>(
    () => ({
      tasks,
      budgetPlans,
      varieties,
      auths,
      priceBooks,
      priceItems,
      priceRatios,
      reportPrices,
      unitPriceAdjustRule,
      chain,
      updateChain,
      subAuths,
      subAuthTargetType,
      authorizedSubTargets,
      createSubAuth,
      updateSubAuth,
      deleteSubAuth,
      authorizedProviders,
      varietiesOf,
      regionsOf,
      createBudgetPlan,
      updateBudgetPlan,
      createTask,
      revokeTask,
      confirmTask,
      unconfirmProvider,
      splitToWorkgroup,
      splitToSpecialists,
      assignWorkload,
      uploadReport,
      reuploadReport,
      reviewReport,
      startSettlement,
      confirmSettlement,
      completeSettlement,
      uploadPaymentVoucher,
      rollbackStartSettlement,
      rollbackConfirmSettlement,
      rollbackCompleteSettlement,
      createVariety,
      updateVariety,
      bindVarietyPriceBook,
      savePriceItems,
      savePriceRatios,
      saveReportPrices,
      copyPriceList,
      saveUnitPriceAdjustRule,
    }),
    [
      tasks,
      budgetPlans,
      varieties,
      auths,
      priceBooks,
      priceItems,
      priceRatios,
      reportPrices,
      unitPriceAdjustRule,
      chain,
      updateChain,
      subAuths,
      subAuthTargetType,
      authorizedSubTargets,
      createSubAuth,
      updateSubAuth,
      deleteSubAuth,
      authorizedProviders,
      varietiesOf,
      regionsOf,
      createBudgetPlan,
      updateBudgetPlan,
      createTask,
      revokeTask,
      confirmTask,
      unconfirmProvider,
      splitToWorkgroup,
      splitToSpecialists,
      assignWorkload,
      uploadReport,
      reuploadReport,
      reviewReport,
      startSettlement,
      confirmSettlement,
      completeSettlement,
      uploadPaymentVoucher,
      rollbackStartSettlement,
      rollbackConfirmSettlement,
      rollbackCompleteSettlement,
      createVariety,
      updateVariety,
      bindVarietyPriceBook,
      savePriceItems,
      savePriceRatios,
      saveReportPrices,
      copyPriceList,
      saveUnitPriceAdjustRule,
    ],
  )

  return (
    <TaskDataContext.Provider value={value}>
      {children}
    </TaskDataContext.Provider>
  )
}

export function useTaskData(): TaskDataContextValue {
  const ctx = useContext(TaskDataContext)
  if (!ctx) throw new Error("useTaskData must be used within TaskDataProvider")
  return ctx
}

// 仅保留类型导出给页面使用
export type { ServiceItem }

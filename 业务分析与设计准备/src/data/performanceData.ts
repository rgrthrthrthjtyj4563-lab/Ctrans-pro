/**
 * 打绩效模块 · 数据层（M1）
 * 模型依据《打绩效-需求设计文档 V1.6》：
 * - 阶段一（服务商→工作组）：质量系数区间校验
 * - 阶段二/直达（→服务专员）：一对一，实发 ≤ 完成工作量金额 × X%，另录四维服务评定（B13）
 * - 校验配置（系数区间 + 上限 X%）实时读取，不入快照
 */
import { useEffect, useReducer } from "react"
import { formatCNY } from "../constants"

// ── 类型 ─────────────────────────────────────────────────────────────────────

export type ChainKind = "四级链" | "三级直达"
export type PerfStatus = "未打绩效" | "已生效" | "已撤销"

/** 业务分项明细（V1.5：给专员打的记录展示该专员本人的分项业务） */
export interface BizItem {
  name: string
  count: number
  unit: string
  unitPrice: number
}

/** 四维服务评定（B13，随结算单留档，不参与金额计算） */
export interface Evaluation {
  p1: number // 服务程序/制度/职业道德遵循 20%
  p2: number // 服务态度及专业水平反馈 25%
  p3: number // 服务记录准确性/相关性/完整性 35%
  p4: number // 服务预算匹配度 20%
}

export const EVAL_DIMENSIONS: { key: keyof Evaluation; label: string }[] = [
  { key: "p1", label: "服务程序 / 制度 / 职业道德遵循" },
  { key: "p2", label: "服务态度及专业水平反馈" },
  { key: "p3", label: "服务记录准确性 / 相关性 / 完整性" },
  { key: "p4", label: "服务预算匹配度" },
]

/** 专员绩效记录（一专员一条；阶段二挂工作组批次，直达不挂工作组） */
export interface SpecialistRecord {
  id: string
  batchNo: string
  chain: ChainKind
  month: string
  provider: string
  group: string | null
  variety: string
  specialist: string
  username: string
  items: BizItem[]
  status: PerfStatus
  actualAmount?: number
  evaluation?: Evaluation
  operator: string
  operatedAt: string
}

/** 绩效批次（服务商 × 品种 × 考核月 × 链型） */
export interface PerfBatch {
  batchNo: string
  chain: ChainKind
  month: string
  provider: string
  group: string | null
  directCount?: number
  variety: string
  workload: number
  defaultAmount: number
  actualAmount?: number
  status: PerfStatus
  ops: { actor: string; time: string; action: string }[]
}

// ── 绩效设置（服务商配置，实时读取非快照） ──────────────────────────────────

export interface PerformanceRuleConfig {
  coefMin: number
  coefMax: number
  capRatio: number // 专员实发上限 X%（如 1.2 = 120%）
}

export const DEFAULT_RULE: PerformanceRuleConfig = {
  coefMin: 0.6,
  coefMax: 1.2,
  capRatio: 1.2,
}

export type PerfMode = "层级模式" | "灵活模式"

export interface PerformanceSettings extends PerformanceRuleConfig {
  mode: PerfMode
  weights: [number, number, number, number]
  updatedAt?: string
}

export interface PerformanceSettingsLog {
  id: string
  changedAt: string
  operator: string
  summary: string
}

export const DEFAULT_SETTINGS: PerformanceSettings = {
  mode: "层级模式",
  coefMin: 0.6,
  coefMax: 1.2,
  weights: [20, 25, 35, 20],
  capRatio: 1.2,
}

const SETTINGS_KEY = "beiye-perf-settings"
const SETTINGS_EVT = "beiye-perf-settings-change"
const SETTINGS_LOG_KEY = "beiye-perf-settings-log"

function validSettings(value: Partial<PerformanceSettings>): value is PerformanceSettings {
  return (value.mode === "层级模式" || value.mode === "灵活模式") &&
    typeof value.coefMin === "number" && typeof value.coefMax === "number" &&
    typeof value.capRatio === "number" && Array.isArray(value.weights) && value.weights.length === 4 &&
    value.weights.every((weight) => typeof weight === "number")
}

export function getSettings(): PerformanceSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS, weights: [...DEFAULT_SETTINGS.weights] as PerformanceSettings["weights"] }
    const parsed = JSON.parse(raw) as Partial<PerformanceSettings>
    if (validSettings(parsed)) return { ...parsed, weights: [...parsed.weights] as PerformanceSettings["weights"] }
  } catch {
    /* 演示原型：落 localStorage 失败时回退默认 */
  }
  return { ...DEFAULT_SETTINGS, weights: [...DEFAULT_SETTINGS.weights] as PerformanceSettings["weights"] }
}

export function saveSettings(next: PerformanceSettings) {
  const safe = { ...next, weights: [...next.weights] as PerformanceSettings["weights"] }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(safe))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(SETTINGS_EVT))
}

export function getSettingsLogs(): PerformanceSettingsLog[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_LOG_KEY) ?? "[]") as PerformanceSettingsLog[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function appendSettingsLog(log: PerformanceSettingsLog) {
  const next = [log, ...getSettingsLogs()].slice(0, 50)
  try {
    localStorage.setItem(SETTINGS_LOG_KEY, JSON.stringify(next))
  } catch {
    /* 演示原型：日志存储失败时不阻断设置保存 */
  }
  window.dispatchEvent(new Event(SETTINGS_EVT))
}

export function resetSettings() {
  const next = { ...DEFAULT_SETTINGS, weights: [...DEFAULT_SETTINGS.weights] as PerformanceSettings["weights"], updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-") }
  saveSettings(next)
  return next
}

export function usePerfSettings(): PerformanceSettings {
  const [settings, setSettings] = useReducer(() => getSettings(), getSettings())
  useEffect(() => {
    const on = () => setSettings()
    window.addEventListener(SETTINGS_EVT, on)
    return () => window.removeEventListener(SETTINGS_EVT, on)
  }, [])
  return settings
}

/** 兼容既有表单消费点：规则从完整设置派生。 */
export function getRule(): PerformanceRuleConfig {
  const { coefMin, coefMax, capRatio } = getSettings()
  return { coefMin, coefMax, capRatio }
}

export function setRule(next: PerformanceRuleConfig) {
  const current = getSettings()
  saveSettings({ ...current, ...next, updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-") })
}

export function useRule(): PerformanceRuleConfig {
  const { coefMin, coefMax, capRatio } = usePerfSettings()
  return { coefMin, coefMax, capRatio }
}

export function getEvalDimensions(settings = getSettings()) {
  return EVAL_DIMENSIONS.map((dimension, index) => ({ ...dimension, weight: settings.weights[index] / 100 }))
}

export function canWritePerf() {
  return true
}

// ── 演示数据（与 public/绩效管理界面预览.html V1.6 一致） ─────────────────────

const d = (count: number, unitPrice = 100): BizItem[] => {
  const day = Math.max(count - 1, 0)
  return [
    { name: "医院拜访 · 日访", count: day, unit: "次", unitPrice },
    { name: "医院拜访 · 夜访", count: count - day, unit: "次", unitPrice },
  ]
}

const seedRecords: SpecialistRecord[] = [
  {
    id: "PF-202608-012-S01", batchNo: "PF-202608-012", chain: "四级链", month: "2026-08",
    provider: "程秋明发企", group: "程秋明团队", variety: "优甲乐 100片装",
    specialist: "程插美", username: "cakin27", items: d(9), status: "已生效",
    actualAmount: 900, evaluation: { p1: 0.9, p2: 0.9, p3: 0.9, p4: 0.9 },
    operator: "程秋明团队", operatedAt: "2026-08-31 17:40",
  },
  {
    id: "PF-202608-012-S02", batchNo: "PF-202608-012", chain: "四级链", month: "2026-08",
    provider: "程秋明发企", group: "程秋明团队", variety: "优甲乐 100片装",
    specialist: "汪志强", username: "cakin28", items: d(7), status: "已生效",
    actualAmount: 770, evaluation: { p1: 0.85, p2: 0.85, p3: 0.85, p4: 0.85 },
    operator: "程秋明团队", operatedAt: "2026-08-31 17:42",
  },
  {
    id: "PF-202608-012-S03", batchNo: "PF-202608-012", chain: "四级链", month: "2026-08",
    provider: "程秋明发企", group: "程秋明团队", variety: "优甲乐 100片装",
    specialist: "李文静", username: "cakin29", items: d(5), status: "未打绩效",
    operator: "程秋明团队", operatedAt: "—",
  },
  {
    id: "PF-202608-014-D01", batchNo: "PF-202608-014", chain: "三级直达", month: "2026-08",
    provider: "程秋明发企", group: null, variety: "优甲乐 100片装",
    specialist: "周航", username: "cakin35", items: d(8), status: "已生效",
    actualAmount: 800, evaluation: { p1: 0.9, p2: 0.9, p3: 0.9, p4: 0.9 },
    operator: "程秋明发企", operatedAt: "2026-08-30 10:15",
  },
  {
    id: "PF-202608-015-D01", batchNo: "PF-202608-015", chain: "三级直达", month: "2026-08",
    provider: "程秋明发企", group: null, variety: "优甲乐 100片装",
    specialist: "蒋莉", username: "cakin36", items: d(6), status: "未打绩效",
    operator: "程秋明发企", operatedAt: "—",
  },
]

const seedBatches: PerfBatch[] = [
  {
    batchNo: "PF-202608-012", chain: "四级链", month: "2026-08", provider: "程秋明发企",
    group: "程秋明团队", variety: "优甲乐 100片装", workload: 21, defaultAmount: 2100,
    actualAmount: 2100, status: "已生效",
    ops: [{ actor: "程秋明发企", time: "2026-08-31 17:20", action: "阶段一提交生效" }],
  },
  {
    batchNo: "PF-202608-013", chain: "四级链", month: "2026-08", provider: "程秋明发企",
    group: "程秋明二团队", variety: "优甲乐 100片装", workload: 12, defaultAmount: 1200,
    status: "未打绩效", ops: [],
  },
  {
    batchNo: "PF-202608-014", chain: "三级直达", month: "2026-08", provider: "程秋明发企",
    group: null, directCount: 1, variety: "优甲乐 100片装", workload: 8, defaultAmount: 800,
    actualAmount: 800, status: "已生效",
    ops: [{ actor: "程秋明发企", time: "2026-08-30 10:15", action: "直达绩效提交生效" }],
  },
  {
    batchNo: "PF-202608-015", chain: "三级直达", month: "2026-08", provider: "程秋明发企",
    group: null, directCount: 3, variety: "优甲乐 100片装", workload: 13, defaultAmount: 1300,
    status: "未打绩效", ops: [],
  },
  {
    batchNo: "PF-202607-088", chain: "四级链", month: "2026-07", provider: "程秋明发企",
    group: "程秋明团队", variety: "优甲乐 100片装", workload: 19, defaultAmount: 1900,
    actualAmount: 1900, status: "已生效",
    ops: [{ actor: "程秋明发企", time: "2026-07-31 16:02", action: "阶段一提交生效" }],
  },
  {
    batchNo: "PF-202607-086", chain: "四级链", month: "2026-07", provider: "程秋明发企",
    group: "程秋明团队", variety: "百赛松 30mg", workload: 13, defaultAmount: 1300,
    status: "已撤销",
    ops: [{ actor: "程秋明发企", time: "2026-07-30 11:47", action: "阶段一提交生效" }],
  },
]

// ── 内存 store（跨页共享，演示级） ────────────────────────────────────────────

type Listener = () => void
const listeners = new Set<Listener>()
let state: { batches: PerfBatch[]; records: SpecialistRecord[] } = {
  batches: seedBatches,
  records: seedRecords,
}

function emit() {
  listeners.forEach((l) => l())
}

export function getBatches() {
  return state.batches
}
export function getRecords() {
  return state.records
}
export function recordsOfBatch(batchNo: string) {
  return state.records.filter((r) => r.batchNo === batchNo)
}
export function patchBatch(batchNo: string, patch: Partial<PerfBatch>) {
  if (!canWritePerf()) return false
  state.batches = state.batches.map((b) =>
    b.batchNo === batchNo ? { ...b, ...patch } : b,
  )
  emit()
  return true
}
export function patchRecord(id: string, patch: Partial<SpecialistRecord>) {
  if (!canWritePerf()) return false
  state.records = state.records.map((r) => (r.id === id ? { ...r, ...patch } : r))
  emit()
  return true
}
export function appendOp(batchNo: string, op: { actor: string; time: string; action: string }) {
  if (!canWritePerf()) return false
  state.batches = state.batches.map((b) =>
    b.batchNo === batchNo ? { ...b, ops: [...b.ops, op] } : b,
  )
  emit()
  return true
}

/** 订阅 store 变化（页面级刷新） */
export function usePerfSync() {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    listeners.add(force)
    return () => {
      listeners.delete(force)
    }
  }, [])
}

// ── 计算与校验 ───────────────────────────────────────────────────────────────

export const itemsWorkload = (items: BizItem[]) =>
  items.reduce((s, i) => s + i.count, 0)
export const itemsDefault = (items: BizItem[]) =>
  items.reduce((s, i) => s + i.count * i.unitPrice, 0)

export function evalTotal(e?: Evaluation, settings = getSettings()): number | null {
  if (!e) return null
  const t = getEvalDimensions(settings).reduce((s, dim) => s + e[dim.key] * dim.weight, 0)
  return Math.round(t * 100) / 100
}

/** 阶段一：质量系数校验（仅服务商给工作组打绩效使用） */
export function validateCoef(actual: number, def: number, rule: PerformanceRuleConfig): string | null {
  if (!(def > 0) || !(actual > 0)) return "默认或实发金额必须大于 0：不能提交。"
  const c = actual / def
  if (c < rule.coefMin - 1e-9 || c > rule.coefMax + 1e-9)
    return `质量系数 ${c.toFixed(2)} 超出 ${rule.coefMin.toFixed(2)} – ${rule.coefMax.toFixed(2)} 的范围，不能提交。`
  return null
}

/** 阶段二/直达：工作量上限校验（B12） */
export function validateCap(actual: number, def: number, rule: PerformanceRuleConfig): string | null {
  if (!(actual > 0)) return "实发金额必须大于 0：不能提交。"
  const cap = def * rule.capRatio
  if (actual > cap + 1e-9)
    return `实发金额不得大于上限 ${formatCNY(cap)}（完成工作量金额 × ${Math.round(rule.capRatio * 100)}%），不能提交。`
  return null
}

/** 服务评定校验（B13） */
export function validateEval(e: Evaluation): string | null {
  const bad = EVAL_DIMENSIONS.some((dim) => {
    const v = e[dim.key]
    return Number.isNaN(v) || v < 0 || v > 1
  })
  return bad ? "服务评定每项须在 0–1 之间（两位小数）。" : null
}

import { formatCNY } from "../constants"
import type {
  BudgetPlan,
  ChainLevel,
  ChainNode,
  ExecutionChain,
  PriceBook,
  RoundingLog,
  ServiceCategory,
  ServiceItem,
  SettlementBill,
  SettlementPeriod,
  Task,
  UnitPriceAdjustRule,
  Variety,
} from "../types"

export const PRICE_BOOK_MISMATCH_MSG =
  "所选品种使用的标准价目表不一致，无法在同一任务中计算统一单价。请按价目表分别创建任务。"

// ===== 执行链（工作组可停用 = 三级链） =====

/** 四级链节点定义（默认形态） */
export function defaultChainNodes(): ChainNode[] {
  return [
    {
      id: "药厂",
      label: "药厂",
      level: 1,
      enabled: true,
      toggleable: false,
      summary: "创建任务、确认服务商发包金额与结算单",
    },
    {
      id: "服务提供商",
      label: "服务提供商",
      level: 2,
      enabled: true,
      toggleable: false,
      summary: "确认任务、拆解工作量、发起结算",
    },
    {
      id: "工作组",
      label: "工作组",
      level: 3,
      enabled: true,
      toggleable: true,
      summary: "承接拆解、二次分配到专员、审核专员填报",
    },
    {
      id: "服务专员",
      label: "服务专员",
      level: 4,
      enabled: true,
      toggleable: false,
      summary: "执行拜访、会议、调研并填报工作量",
    },
  ]
}

/** 按「工作组是否启用」生成节点；其余节点恒为启用 */
export function chainNodesOf(workGroupEnabled: boolean): ChainNode[] {
  return defaultChainNodes().map((n) =>
    n.toggleable ? { ...n, enabled: workGroupEnabled } : n,
  )
}

export function workGroupNode(chain: ExecutionChain): ChainNode | undefined {
  return chain.nodes.find((n) => n.id === "工作组")
}

export function workGroupEnabled(chain: ExecutionChain): boolean {
  return workGroupNode(chain)?.enabled !== false
}

export function chainLevelOf(chain: ExecutionChain): ChainLevel {
  return workGroupEnabled(chain) ? "四级链" : "三级链"
}

/** 链路径文案，如「药厂 → 服务提供商 → 服务专员」 */
export function chainPathLabel(chain: ExecutionChain): string {
  return chain.nodes
    .filter((n) => n.enabled)
    .map((n) => n.label)
    .join(" → ")
}

export const DEFAULT_UNIT_PRICE_RULE: UnitPriceAdjustRule = {
  enabled: true,
  minAdjustRatio: -0.3,
  maxAdjustRatio: 0.3,
  roundingMode: "nearest",
  hint: "单价可在建议单价的 ±30% 内调整；金额无法被单价整除时，按最近可选档位取整。",
}

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0")
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0).getDate()
  return `${year}-${pad(month)}-${pad(d)}`
}

export function monthsCovered(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || endDate < startDate) return []
  const months: string[] = []
  let y = Number(startDate.slice(0, 4))
  let m = Number(startDate.slice(5, 7))
  const endY = Number(endDate.slice(0, 4))
  const endM = Number(endDate.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${pad(m)}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return months
}

export function defaultSettlementPeriods(
  startDate: string,
  endDate: string,
): Omit<SettlementPeriod, "id">[] {
  return monthsCovered(startDate, endDate).map((ym, i) => {
    const y = Number(ym.slice(0, 4))
    const m = Number(ym.slice(5, 7))
    const start = i === 0 ? startDate : `${ym}-01`
    const end = ym === endDate.slice(0, 7) ? endDate : lastDayOfMonth(y, m)
    return { name: `${y}年${m}月`, startDate: start, endDate: end }
  })
}

export function validateSettlementPeriods(
  startDate: string,
  endDate: string,
  periods: { startDate: string endDate: string }[],
): string | undefined {
  if (!periods.length) return "请配置覆盖整个推广期的结算周期"
  const sorted = [...periods].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  )
  for (const p of sorted) {
    if (!p.startDate || !p.endDate) return "请完整填写每个结算周期的起止日期"
    if (p.endDate < p.startDate) return "结算周期结束日不能早于开始日"
    if (p.startDate < startDate || p.endDate > endDate)
      return "结算周期必须完全落在推广期内"
  }
  if (sorted[0].startDate !== startDate)
    return "结算周期必须从推广期开始日连续覆盖，不得有空档"
  if (sorted[sorted.length - 1].endDate !== endDate)
    return "结算周期必须覆盖至推广期结束日，不得有空档"
  for (let i = 1; i < sorted.length; i++) {
    const expected = addDays(sorted[i - 1].endDate, 1)
    if (sorted[i].startDate < expected) return "结算周期不得重叠"
    if (sorted[i].startDate > expected) return "结算周期不得有空档"
  }
  return undefined
}

export function periodCoversMonth(
  period: SettlementPeriod,
  serviceMonth: string,
): boolean {
  if (!/^\d{4}-\d{2}$/.test(serviceMonth)) return false
  const y = Number(serviceMonth.slice(0, 4))
  const m = Number(serviceMonth.slice(5, 7))
  const monthStart = `${serviceMonth}-01`
  const monthEnd = lastDayOfMonth(y, m)
  return period.startDate <= monthEnd && period.endDate >= monthStart
}

export function findPeriodForMonth(
  task: Task,
  serviceMonth: string,
): SettlementPeriod | undefined {
  return task.settlementPeriods.find((p) => periodCoversMonth(p, serviceMonth))
}

export function isPriceBookActive(book: PriceBook | undefined): boolean {
  return !!book && book.status === "生效"
}

export function varietyPriceBook(
  variety: Variety | undefined,
  books: PriceBook[],
): PriceBook | undefined {
  if (!variety?.activePriceBookId) return undefined
  return books.find((b) => b.id === variety.activePriceBookId)
}

export function assertSamePriceBook(
  varieties: Variety[],
  books: PriceBook[],
): { ok: true book: PriceBook } | { ok: false error: string } {
  if (!varieties.length) return { ok: false, error: "请选择品种" }
  const bound = varieties.map((v) => ({ v, book: varietyPriceBook(v, books) }))
  const missing = bound.find((x) => !isPriceBookActive(x.book))
  if (missing) {
    return {
      ok: false,
      error: `品种「${missing.v.tradeName}」没有有效价目表，无法创建任务`,
    }
  }
  const firstId = bound[0].book!.id
  if (bound.some((x) => x.book!.id !== firstId)) {
    return { ok: false, error: PRICE_BOOK_MISMATCH_MSG }
  }
  return { ok: true, book: bound[0].book! }
}

export function snapshotPriceBook(book: PriceBook): PriceBook {
  return JSON.parse(JSON.stringify(book)) as PriceBook
}

export function nearestTier(amount: number, unitPrice: number): {
  qty: number
  amount: number
  rounded: boolean
  rawQty: number
  reason: string
} {
  if (unitPrice <= 0) {
    return {
      qty: 0,
      amount: 0,
      rounded: false,
      rawQty: 0,
      reason: "单价须大于 0",
    }
  }
  const rawQty = amount / unitPrice
  const qty = Math.round(rawQty)
  const nextAmount = qty * unitPrice
  const rounded = Math.abs(rawQty - qty) > 1e-9 || nextAmount !== amount
  return {
    qty,
    amount: nextAmount,
    rounded,
    rawQty,
    reason: rounded
      ? `金额无法被单价整除（${formatCNY(amount)} ÷ ${formatCNY(unitPrice)} = ${rawQty.toFixed(2)}），已按最近可选档位取整为数量 ${qty}`
      : "",
  }
}

export function unitPriceOutOfRange(
  unitPrice: number,
  suggested: number,
  rule: UnitPriceAdjustRule,
): string | undefined {
  if (!rule.enabled || suggested <= 0) return undefined
  const min = Math.round(suggested * (1 + rule.minAdjustRatio))
  const max = Math.round(suggested * (1 + rule.maxAdjustRatio))
  if (unitPrice < min || unitPrice > max) {
    return `单价 ${formatCNY(unitPrice)} 超出建议单价 ${formatCNY(suggested)} 的允许范围（${formatCNY(min)} ~ ${formatCNY(max)}，${rule.hint}）`
  }
  return undefined
}

export function roundingToastText(
  log: Pick<RoundingLog, "beforeAmount" | "beforeQty" | "unitPrice" | "afterAmount" | "afterQty" | "reason">,
): string {
  return `调整前金额 ${formatCNY(log.beforeAmount)}、数量 ${
    Number.isInteger(log.beforeQty) ? log.beforeQty : log.beforeQty.toFixed(2)
  }；适用单价 ${formatCNY(log.unitPrice)}；调整后金额 ${formatCNY(log.afterAmount)}、数量 ${log.afterQty}。${log.reason}`
}

export function recommendedBudget(params: {
  provider: string
  varieties: string[]
  regions: string[]
  startDate: string
  endDate: string
  categories: ServiceCategory[]
  plans: BudgetPlan[]
}): { amount: number configured: boolean detail: string } {
  const { provider, varieties, regions, startDate, endDate, plans } = params
  const months = monthsCovered(startDate, endDate)
  if (!provider || !varieties.length || !regions.length || !months.length) {
    return { amount: 0, configured: false, detail: "未配置预算" }
  }
  const matched = plans.filter((p) => {
    if (p.provider !== provider) return false
    if (
      Number(startDate.slice(0, 4)) !== p.year &&
      Number(endDate.slice(0, 4)) !== p.year
    )
      return false
    const varietyHit = varieties.some((v) => p.varieties.includes(v))
    if (!varietyHit) return false
    if (p.regions.includes("全国")) return true
    return regions.some((r) => p.regions.includes(r) || r === "全国")
  })
  if (!matched.length)
    return { amount: 0, configured: false, detail: "未配置预算" }
  let amount = 0
  matched.forEach((p) => {
    months.forEach((ym) => {
      if (Number(ym.slice(0, 4)) !== p.year) return
      const mi = Number(ym.slice(5, 7)) - 1
      amount += p.months[mi] ?? 0
    })
  })
  return {
    amount,
    configured: true,
    detail: `按服务商 × 品种 × 地区 × 推广期覆盖月份汇总（${matched.length} 条预算行）`,
  }
}

export function validBills(task: Task): SettlementBill[] {
  return task.settlements.filter((b) => !b.voided)
}

export function latestValidBill(task: Task): SettlementBill | undefined {
  const bills = validBills(task)
  return bills[bills.length - 1]
}

export function confirmedSettledAmount(task: Task): number {
  return validBills(task)
    .filter((b) => b.confirmed)
    .reduce((s, b) => s + b.finalAmount, 0)
}

export function hasInProgressBill(task: Task): boolean {
  return validBills(task).some((b) => !b.confirmed)
}

export function hasConfirmedBill(task: Task): boolean {
  return validBills(task).some((b) => b.confirmed)
}

export function isLatestValidBill(task: Task, billId: string): boolean {
  return latestValidBill(task)?.id === billId
}

export function taskHasExecData(task: Task): boolean {
  return (
    task.workgroupSplits.length > 0 ||
    task.workloadAssigns.length > 0 ||
    // 「待上传」报告记录是药厂分派的投影，不算服务商执行数据
    task.reports.some((r) => r.status !== "待上传") ||
    validBills(task).length > 0
  )
}

export function canUnconfirmProvider(task: Task): boolean {
  return task.taskStatus === "执行中" && !taskHasExecData(task)
}

export function canRollbackStart(task: Task, bill?: SettlementBill): boolean {
  const latest = bill ?? latestValidBill(task)
  if (!latest) return false
  if (latest.voided || latest.financeLocked || latest.confirmed) return false
  return task.reconStatus === "对账中" && isLatestValidBill(task, latest.id)
}

export function canRollbackConfirm(task: Task, bill?: SettlementBill): boolean {
  const latest = bill ?? latestValidBill(task)
  if (!latest) return false
  if (latest.voided || latest.financeLocked || !latest.confirmed) return false
  if (task.taskStatus === "已结算") return false
  return task.reconStatus === "已结算" && isLatestValidBill(task, latest.id)
}

export function canRollbackComplete(task: Task): boolean {
  return task.taskStatus === "已结算"
}

export function canCompleteSettlement(task: Task): boolean {
  return (
    task.taskStatus === "执行中" &&
    hasConfirmedBill(task) &&
    !hasInProgressBill(task)
  )
}

export function suggestedOf(
  book: PriceBook,
  category: string,
  name: string,
): { unitPrice: number unit: string } | undefined {
  const rule = book.rules.find(
    (r) => r.category === category && r.name === name,
  )
  if (!rule) return undefined
  return { unitPrice: rule.amount, unit: rule.unit }
}

export function serviceKey(
  it: Pick<ServiceItem, "variety" | "region" | "category" | "name">,
): string {
  return `${it.variety}|${it.region}|${it.category}|${it.name}`
}

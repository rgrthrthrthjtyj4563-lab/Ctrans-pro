/**
 * 「创建任务」预算回填与工作量调整的纯函数（新版口径）。
 *
 * 计算顺序（需求定稿）：
 *   预算金额 → 平均分配到已选服务类别 → 按统一业务比例分配项目计划金额
 *   → 项目初始数量 ＝ 项目初始计划金额 ÷ 单价，向下取整
 *
 * 关键规则：
 * - 初始项目金额保留比例分配结果（按分精确、合计＝类别基准），不因整数数量测算反写；
 * - 只有用户主动修改数量后，该项目金额才变为 整数数量 × 单价；
 * - 地区是执行范围：不参与金额均摊，也不重复取整；提交时再按 品种 × 执行地区
 *   组合对数量、金额做守恒分摊（总数不变）。
 */

export interface PlanRuleInput {
  name: string
  unit: string
  unitPrice: number
  /** 项目比例（百分比，如 40 表示 40%）；0 的项目分得 0 */
  ratio: number
}

export interface PlanItemState {
  name: string
  unit: string
  unitPrice: number
  /** 初始计划金额＝类别基准 × 项目比例（按分精确） */
  initialAmount: number
  /** 初始整数数量＝floor(初始金额 ÷ 单价)；不足一次为 0，金额仍保留 */
  initialQty: number
  /** 当前计划金额：未调整时＝初始金额；用户改数量后＝数量 × 单价 */
  amount: number
  qty: number
  /** 用户是否主动调整过数量（恢复初始分配的依据之一） */
  adjusted: boolean
}

/** 金额统一按「分」参与分摊计算，避免浮点累计误差 */
const toCents = (v: number) => Math.round(v * 100)
const toYuan = (c: number) => Math.round(c) / 100
const cents = (v: number) => Math.round(v * 100) / 100

/** 预算平均分配到 n 个已选类别：按分处理尾差（前几份各多 1 分），合计精确等于预算 */
export function splitBudgetEvenly(total: number, count: number): number[] {
  const n = Math.max(0, Math.floor(count))
  if (n <= 0) return []
  const totalCents = Math.max(0, toCents(total))
  const base = Math.floor(totalCents / n)
  const rem = totalCents - base * n
  return Array.from({ length: n }, (_, i) => toYuan(base + (i < rem ? 1 : 0)))
}

/**
 * 按比例把类别基准分摊到各项目：按分精确，最大余数法处理尾差，
 * 项目金额合计精确等于基准。比例全为 0 时按原值均摊（编辑中的兜底口径）。
 */
export function allocateAmountByRatio(
  base: number,
  ratios: number[],
): number[] {
  const n = ratios.length
  if (n <= 0) return []
  const baseCents = Math.max(0, toCents(base))
  const weightSum = ratios.reduce(
    (s, r) => s + (Number.isFinite(r) && r > 0 ? r : 0),
    0,
  )
  const share = (r: number) =>
    weightSum > 0 && Number.isFinite(r) && r > 0 ? r / weightSum : 0
  if (weightSum <= 0) {
    // 比例尚未填好：先均摊占位（进入第二步前会按已校验比例重新派生）
    return splitBudgetEvenly(base, n)
  }
  const rawCents = ratios.map((r) => baseCents * share(r))
  const floors = rawCents.map((c) => Math.floor(c))
  const remainder = baseCents - floors.reduce((s, c) => s + c, 0)
  // 余数分给小数部分最大的前 remainder 个（并列时索引靠前的优先），保证合计精确
  const order = ratios
    .map((_, i) => i)
    .sort((a, b) => {
      const fa = rawCents[a] - floors[a]
      const fb = rawCents[b] - floors[b]
      return fb - fa || a - b
    })
    .slice(0, Math.max(0, remainder))
  order.forEach((i) => (floors[i] += 1))
  return floors.map(toYuan)
}

/** 从类别基准派生整组项目状态：金额按比例分摊、数量 floor，全部 adjusted=false */
export function deriveCategoryItems(
  base: number,
  rules: PlanRuleInput[],
): PlanItemState[] {
  const amounts = allocateAmountByRatio(
    base,
    rules.map((r) => r.ratio),
  )
  return rules.map((r, i) => {
    const initialAmount = amounts[i] ?? 0
    const initialQty =
      r.unitPrice > 0 ? Math.max(0, Math.floor(initialAmount / r.unitPrice)) : 0
    return {
      name: r.name,
      unit: r.unit,
      unitPrice: r.unitPrice,
      initialAmount,
      initialQty,
      amount: initialAmount,
      qty: initialQty,
      adjusted: false,
    }
  })
}

/**
 * 问卷调研类别的异价派生：类别预算在参与品种间均摊（等比 100/N 复用最大余数法），
 * 各品种数量 = floor(自身金额 ÷ 自身对公单价)。问卷类别不走统一业务比例，
 * 每个品种的单价由 问卷 × 品种 → 计价方案 解析，天然不同。
 */
export function deriveSurveyItems(
  base: number,
  rows: { variety: string; unitPrice: number }[],
): PlanItemState[] {
  const n = rows.length
  return deriveCategoryItems(
    base,
    rows.map((r) => ({
      name: r.variety,
      unit: "份",
      unitPrice: r.unitPrice,
      ratio: n > 0 ? 100 / n : 0,
    })),
  )
}

/** 数量在 n 个组合（品种 × 执行地区）间守恒分摊：floor + 余数给前几个组合 */
export function splitQtyAcrossCombos(qty: number, combos: number): number[] {
  const n = Math.max(1, Math.floor(combos))
  const total = Math.max(0, Math.floor(qty))
  const base = Math.floor(total / n)
  const rem = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0))
}

/** 金额在 n 个组合间守恒分摊：按分均摊 + 尾差给前几个组合，合计精确等于原金额 */
export function splitAmountAcrossCombos(
  amount: number,
  combos: number,
): number[] {
  return splitBudgetEvenly(amount, Math.max(1, Math.floor(combos)))
}

/** 用户把数量改为整数 qty 后的新计划金额 */
export function amountForQty(qty: number, unitPrice: number): number {
  return cents(Math.max(0, Math.floor(qty)) * unitPrice)
}

/** 分值相等比较（金额展示与校验统一走分口径，避免浮点误差） */
export function sameAmount(a: number, b: number): boolean {
  return toCents(a) === toCents(b)
}

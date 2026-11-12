import { describe, expect, it } from "vitest"
import {
  allocateAmountByRatio,
  amountForQty,
  deriveCategoryItems,
  sameAmount,
  splitAmountAcrossCombos,
  splitBudgetEvenly,
  splitQtyAcrossCombos,
} from "../domain/batchAdjust"

const PROMO_RULES = [
  { name: "医院拜访", unit: "次", unitPrice: 200, ratio: 40 },
  { name: "商业拜访", unit: "次", unitPrice: 300, ratio: 10 },
  { name: "科室会议", unit: "场", unitPrice: 2000, ratio: 30 },
  { name: "学术推广", unit: "次", unitPrice: 500, ratio: 20 },
]

/** 分口径比较（金额一律按分断言） */
const eqCents = (a: number, b: number) => sameAmount(a, b)
const sum = (xs: number[]) =>
  Math.round(xs.reduce((s, x) => s + x * 100, 0)) / 100

// A. 回填与初始计算：预算 → 类别平均 → 比例分配金额 → 金额÷单价取整数量
describe("budget backfill and initial derivation", () => {
  it("splits budget evenly across selected categories with cent-level tail handling", () => {
    expect(splitBudgetEvenly(12000, 1)).toEqual([12000])
    expect(splitBudgetEvenly(12000, 2)).toEqual([6000, 6000])
    // 尾差按分处理：合计精确等于预算
    const odd = splitBudgetEvenly(100, 3)
    expect(eqCents(sum(odd), 100)).toBe(true)
    expect(odd).toEqual([33.34, 33.33, 33.33])
    expect(eqCents(sum(splitBudgetEvenly(0.01, 2)), 0.01)).toBe(true)
  })

  it("derives 50000 with 40/10/30/20 into exact amounts and integer quantities", () => {
    const items = deriveCategoryItems(50000, PROMO_RULES)
    // 项目金额＝类别金额 × 比例，合计精确等于类别金额
    expect(items.map((x) => x.initialAmount)).toEqual([
      20000, 5000, 15000, 10000,
    ])
    expect(eqCents(sum(items.map((x) => x.initialAmount)), 50000)).toBe(true)
    // 数量＝金额 ÷ 单价向下取整，只显示非负整数
    expect(items.map((x) => x.initialQty)).toEqual([100, 16, 7, 20])
    expect(items.every((x) => Number.isInteger(x.initialQty))).toBe(true)
    // 初始金额不因整数数量反写：保留 5000 / 15000，而非 16×300 / 7×2000
    expect(eqCents(items[1].amount, 5000)).toBe(true)
    expect(eqCents(items[2].amount, 15000)).toBe(true)
    expect(items.every((x) => x.adjusted)).toBe(false)
    expect(items.every((x) => eqCents(x.amount, x.initialAmount))).toBe(true)
  })

  it("keeps the allocated amount when it cannot buy one unit (qty floors to 0)", () => {
    const items = deriveCategoryItems(500, PROMO_RULES)
    const meeting = items.find((x) => x.name === "科室会议")!
    expect(eqCents(meeting.initialAmount, 150)).toBe(true)
    expect(meeting.initialQty).toBe(0)
    expect(eqCents(meeting.amount, 150)).toBe(true)
  })

  it("allocates ratio amounts with exact cent totals on awkward bases", () => {
    const amounts = allocateAmountByRatio(100, [33.33, 33.33, 33.34])
    expect(eqCents(sum(amounts), 100)).toBe(true)
    // 三等分的尾差给到靠前的项
    expect(allocateAmountByRatio(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33])
    expect(allocateAmountByRatio(1000, [40, 10, 30, 20])).toEqual([
      400, 100, 300, 200,
    ])
  })
})

// B. 主动调整：只有被有效修改的项目金额变为 数量 × 单价
describe("manual quantity adjustment", () => {
  it("recomputes only the modified item and keeps others' allocated amounts", () => {
    const items = deriveCategoryItems(50000, PROMO_RULES)
    // 科室会议 7 场 → 8 场：仅该项金额变化
    const meeting = {
      ...items[2],
      qty: 8,
      amount: amountForQty(8, 2000),
      adjusted: true,
    }
    expect(eqCents(meeting.amount, 16000)).toBe(true)
    const total1 = sum(
      [...items.slice(0, 2), meeting, ...items.slice(3)].map((x) => x.amount),
    )
    expect(eqCents(total1, 51000)).toBe(true)
    // 商业拜访未被修改时仍保留 ¥5,000（不是 16×300 的 ¥4,800）
    expect(eqCents(items[1].amount, 5000)).toBe(true)

    // 再把商业拜访改为 17 次 → ¥5,100，总计划 ¥51,100
    const visit = {
      ...items[1],
      qty: 17,
      amount: amountForQty(17, 300),
      adjusted: true,
    }
    expect(eqCents(visit.amount, 5100)).toBe(true)
    const total2 = sum(
      [...items.slice(0, 1), visit, meeting, ...items.slice(3)].map(
        (x) => x.amount,
      ),
    )
    expect(eqCents(total2, 51100)).toBe(true)
  })

  it("zeroes only the item the user actively sets to zero", () => {
    expect(amountForQty(0, 2000)).toBe(0)
    const items = deriveCategoryItems(50000, PROMO_RULES)
    const zeroed = {
      ...items[0],
      qty: 0,
      amount: amountForQty(0, 200),
      adjusted: true,
    }
    expect(eqCents(zeroed.amount, 0)).toBe(true)
    // 其他项目不受影响
    expect(eqCents(items[1].amount, 5000)).toBe(true)
  })

  it("floors non-integer input quantities defensively", () => {
    expect(amountForQty(3.7, 300)).toBe(900)
    expect(amountForQty(-2, 300)).toBe(0)
  })
})

// C. 组合守恒：提交按 品种 × 地区 分摊时数量与金额都不变（地区不制造差额）
describe("combo-conserving distribution at submit", () => {
  it("conserves total quantity across combos (floor + remainder to the first)", () => {
    expect(splitQtyAcrossCombos(16, 3)).toEqual([6, 5, 5])
    expect(splitQtyAcrossCombos(7, 2)).toEqual([4, 3])
    expect(splitQtyAcrossCombos(5, 1)).toEqual([5])
    expect(splitQtyAcrossCombos(0, 4).reduce((s, x) => s + x, 0)).toBe(0)
  })

  it("conserves total amount across combos at cent precision", () => {
    const parts = splitAmountAcrossCombos(5000, 3)
    expect(eqCents(sum(parts), 5000)).toBe(true)
    expect(parts).toEqual([1666.67, 1666.67, 1666.66])
    expect(eqCents(sum(splitAmountAcrossCombos(0.01, 3)), 0.01)).toBe(true)
  })

  it("does not re-floor quantities per region: derivation ignores combos entirely", () => {
    // 初始数量只由 金额 ÷ 单价 决定；选择多少个执行地区都不改变测算数量与计划金额
    const one = deriveCategoryItems(50000, PROMO_RULES)
    const again = deriveCategoryItems(50000, PROMO_RULES)
    expect(again.map((x) => x.initialQty)).toEqual(one.map((x) => x.initialQty))
    expect(again.map((x) => x.initialAmount)).toEqual(
      one.map((x) => x.initialAmount),
    )
    // 16 次不会被拆成多个地区后重复取整（如 2 地区各 8 次仍是合计 16 次，金额合计不变）
    const qtyParts = splitQtyAcrossCombos(16, 2)
    expect(qtyParts.reduce((s, x) => s + x, 0)).toBe(16)
    expect(eqCents(sum(splitAmountAcrossCombos(5000, 2)), 5000)).toBe(true)
  })
})

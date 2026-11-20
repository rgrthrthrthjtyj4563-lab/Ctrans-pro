/**
 * 三级直达专员绩效 · 回归测试（金额 / 聚合 / 退回 / 完结 / 数据范围 / 价格解析）
 */
import { afterAll, describe, expect, it } from "vitest"
import type { AuditStatus, ExecutionChain, Task, WorkloadAssign } from "../types"
import { chainNodesOf } from "../domain/taskV4"
import { seedTasks, visitRecords } from "./mockData"
import {
  type DirectPerfItem,
  DIRECT_PRIVATE_PRICES,
  amountRange,
  auditedAssignsOf,
  baseCentsOf,
  directPackagesOf,
  formatCentsText,
  linkedRecordsOf,
  packageByKey,
  packageStatsOf,
  ratioOf,
  ratioText,
  recordByKey,
  returnDirectAssessment,
  submitDirectAssessment,
  taskIsDirect,
  toCents,
  validateAmountCents,
  validateScore,
  weightedScoreOf,
} from "./directPerformance"

const V = "阿托伐他汀钙片(20mg)"
const WEIGHTS: [number, number, number, number] = [20, 25, 35, 20]
const SETTINGS = { capRatio: 1.2, weights: WEIGHTS }
const OPERATOR = { name: "陈伟", org: "东方恒业推广有限公司" }

/** 合成任务的测试价格：写进任务级映射并在结束后清理（不污染演示键） */
const TEST_PRICE_KEYS: string[] = []
function registerTestPrice(taskId: string, itemName: string, price = 100) {
  const key = `${taskId}|${V}|${itemName}`
  DIRECT_PRIVATE_PRICES[key] = price
  TEST_PRICE_KEYS.push(key)
}
afterAll(() => {
  TEST_PRICE_KEYS.forEach((key) => delete DIRECT_PRIVATE_PRICES[key])
})

// 本文件所有合成任务都使用「医院拜访 × ¥100」的对私映射；商业拜访仅在缺价用例（TR-904）中不注册
;["TR-900", "TR-901", "TR-902", "TR-903", "TR-904", "TR-905", "TR-906", "TR-907", "TR-908", "TR-910", "TR-911", "TR-912", "TR-913", "TR-914", "TR-915"].forEach((taskId) => registerTestPrice(taskId, "医院拜访"))

function chainOf(workGroupEnabled: boolean): ExecutionChain {
  return {
    nodes: chainNodesOf(workGroupEnabled),
    changeRecords: [],
    updatedAt: "2026-01-01 00:00",
    updatedBy: "演示",
  }
}

function assign(id: string, specialist: string, overrides: Partial<WorkloadAssign> = {}): WorkloadAssign {
  return {
    id,
    specialist,
    variety: V,
    region: "广东",
    category: "市场推广服务",
    itemName: "医院拜访",
    workload: 5,
    amount: 1000,
    progress: "已完成",
    serviceMonth: "2026-10",
    ...overrides,
  }
}

function taskOf(id: string, assigns: WorkloadAssign[], overrides: Partial<Task> = {}): Task {
  return {
    id,
    taskNo: `TK-${id}`,
    taskName: `${V}_百益制药`,
    varieties: [V],
    provider: "东方恒业推广有限公司",
    holderPharma: "百益制药",
    regions: ["广东"],
    startDate: "2026-09-01",
    endDate: "2026-12-31",
    priceBookId: "PB-TEST",
    priceBookSnapshot: { id: "PB-TEST", name: "测试", version: "1", status: "生效", effectiveFrom: "2026-01-01", rules: [] },
    chainSnapshot: chainOf(false),
    recommendedAmount: 0,
    recommendedConfigured: true,
    planLocked: true,
    planAmount: 0,
    settledAmount: 0,
    remainingVoided: false,
    taskStatus: "执行中",
    reconStatus: "未发起",
    createdAt: "2026-09-01 00:00",
    createdBy: "测试",
    serviceItems: [
      { id: `${id}-SI-1`, variety: V, region: "广东", category: "市场推广服务", name: "医院拜访", unitPrice: 200, unit: "次", qty: 30, amount: 6000, suggestedUnitPrice: 200, suggestedAmount: 6000 },
      { id: `${id}-SI-2`, variety: V, region: "广东", category: "市场推广服务", name: "商业拜访", unitPrice: 300, unit: "次", qty: 4, amount: 1200, suggestedUnitPrice: 300, suggestedAmount: 1200 },
    ],
    workgroupSplits: [],
    workloadAssigns: assigns,
    reports: [],
    settlements: [],
    settlementPeriods: [],
    roundingLogs: [],
    priceAdjustLogs: [],
    opsLogs: [],
    ...overrides,
  } as Task
}

const item = (overrides: Partial<DirectPerfItem> = {}): DirectPerfItem => ({
  key: `${V}|市场推广服务|医院拜访|广东`,
  category: "市场推广服务",
  itemName: "医院拜访",
  variety: V,
  region: "广东",
  unit: "次",
  count: 5,
  privateUnitPrice: 100,
  priceSource: "任务级对私价格映射（演示数据）",
  sourceAssignIds: ["x1"],
  ...overrides,
})

// ── 金额与比例（分口径） ─────────────────────────────────────────────────────

describe("money math in cents", () => {
  it("keeps cent precision and never drifts on floating point", () => {
    expect(toCents(485.13)).toBe(48513)
    expect(formatCentsText(48513)).toBe("¥485.13")
    expect(formatCentsText(50000)).toBe("¥500.00")
    expect(formatCentsText(148500)).toBe("¥1,485.00")
    expect(formatCentsText(-1)).toBe("−¥0.01")
  })

  it("validates the allowed amount range with exact boundaries", () => {
    // 陈静用例：默认 ¥500，上限 ¥600
    expect(amountRange(50000, 1.2)).toEqual({ min: 500, max: 60000 })
    expect(validateAmountCents(50000, 50000, 1.2)).toBeNull()
    expect(validateAmountCents(60000, 50000, 1.2)).toBeNull()
    // 手输超上限一分 → 拒绝
    expect(validateAmountCents(60001, 50000, 1.2)).toBe("不能超过 ¥600.00（默认金额 × 120%）")
    // 滑块下界 0.01 × 默认 = ¥5，低于下界拒绝
    expect(validateAmountCents(499, 50000, 1.2)).toBe("最低 ¥5.00")
    expect(validateAmountCents(0, 50000, 1.2)).toBe("请输入有效金额")
  })

  it("matches the ¥485.13 acceptance example: ratio ≈ 0.9703 and weighted score 0.93", () => {
    const cents = 48513
    const ratio = ratioOf(cents, 50000)
    expect(ratioText(ratio)).toBe("≈ 0.9703")
    const scores: [number, number, number, number] = [1, 1, 0.8, 1]
    expect(weightedScoreOf(scores, WEIGHTS)).toBe(0.93)
    // 金额不被评分驱动：评分后金额仍是 ¥485.13
    expect(cents).toBe(48513)
  })

  it("validates scores: 0–1 with two decimals only", () => {
    expect(validateScore(0)).toBeNull()
    expect(validateScore(1)).toBeNull()
    expect(validateScore(0.8)).toBeNull()
    expect(validateScore(1.01)).toBe("需在 0–1 之间")
    expect(validateScore(-0.1)).toBe("需在 0–1 之间")
    expect(validateScore(0.805)).toBe("最多输入两位小数")
  })

  it("computes default amount only from priced items (missing price items are excluded from cents)", () => {
    const items = [item(), item({ key: "k2", itemName: "商业拜访", privateUnitPrice: null, count: 2 })]
    expect(baseCentsOf(items)).toBe(50000)
  })
})

// ── 聚合：任务包 × 考核月份 × 专员 ───────────────────────────────────────────

describe("package aggregation", () => {
  it("recognizes direct tasks only by the chain snapshot", () => {
    expect(taskIsDirect(taskOf("T1", []))).toBe(true)
    expect(taskIsDirect({ ...taskOf("T1", []), chainSnapshot: chainOf(true) })).toBe(false)
  })

  it("counts only audited workload (待审核/未完成 never enter the package)", () => {
    const task = taskOf("TR-900", [
      assign("a1", "陈静"),
      assign("a2", "陈静", { progress: "待审核", workload: 99 }),
      assign("a3", "陈静", { progress: "未完成", workload: 99 }),
      assign("a4", "王芳", { workload: 7, amount: 1400 }),
    ])
    expect(auditedAssignsOf(task, "2026-10").map((a) => a.id)).toEqual(["a1", "a4"])
    const packages = directPackagesOf([task])
    expect(packages).toHaveLength(1)
    expect(packages[0].records.map((r) => r.specialist).sort()).toEqual(["王芳", "陈静"].sort())
    const chenjing = packages[0].records.find((r) => r.specialist === "陈静")!
    expect(chenjing.items).toHaveLength(1)
    expect(chenjing.items[0].count).toBe(5)
  })

  it("groups by task × service month and keeps records unique per specialist", () => {
    const task = taskOf("TR-901", [
      assign("a1", "陈静", { serviceMonth: "2026-10" }),
      assign("a2", "陈静", { itemName: "商业拜访", serviceMonth: "2026-09", workload: 2, amount: 600 }),
      assign("a3", "张伟", { serviceMonth: "2026-10", workload: 12, amount: 2400 }),
    ])
    const packages = directPackagesOf([task])
    expect(packages.map((p) => p.serviceMonth)).toEqual(["2026-10", "2026-09"])
    const october = packageByKey([task], "TR-901::2026-10")!
    expect(october.records).toHaveLength(2)
    // 同一专员跨月记录互不串：9 月记录是独立的
    const sept = packageByKey([task], "TR-901::2026-09")!
    expect(sept.records).toHaveLength(1)
    expect(sept.records[0].id).toBe("TR-901::2026-09::陈静")
    // 同一月不同专员记录 id 唯一
    const ids = october.records.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("keeps variety and region evidence on records and packages", () => {
    const task = taskOf("TR-902", [
      assign("a1", "陈静"),
      assign("a2", "陈静", { variety: "氨氯地平片(5mg)", region: "陕西", itemName: "商业拜访", workload: 2, amount: 600 }),
    ])
    const [pkg] = directPackagesOf([task])
    const record = pkg.records[0]
    expect(record.varietyNames).toEqual([V, "氨氯地平片(5mg)"])
    expect(record.regionNames).toEqual(["广东", "陕西"])
    expect(pkg.varietyNames).toHaveLength(2)
    expect(record.items).toHaveLength(2)
  })

  it("sums confirmed cents from valid assessments only and derives package status", () => {
    const task = taskOf("TR-903", [assign("a1", "陈静"), assign("a2", "王芳", { workload: 7 })])
    const pkg = packageByKey([task], "TR-903::2026-10")!
    expect(packageStatsOf(pkg)).toEqual({ done: 0, total: 2, status: "待考核", confirmedCents: 0 })
    expect(submitDirectAssessment([task], "TR-903::2026-10::陈静", { cents: 50000, scores: [1, 1, 1, 1], reason: "" }, OPERATOR, SETTINGS).ok).toBe(true)
    const after = packageByKey([task], "TR-903::2026-10")!
    expect(packageStatsOf(after)).toEqual({ done: 1, total: 2, status: "待考核", confirmedCents: 50000 })
  })
})

// ── 对私价格 ────────────────────────────────────────────────────────────────

describe("private price resolution", () => {
  it("blocks confirmation when an item has no private price (no fallback to public price)", () => {
    // TR-023 的商业拜访未配置对私映射：不能确认，且不落到对公单价
    const task = taskOf("TR-904", [
      assign("a1", "刘洋"),
      assign("a2", "刘洋", { itemName: "商业拜访", workload: 3, amount: 900 }),
    ])
    const record = recordByKey([task], "TR-904::2026-10::刘洋")!
    expect(record.missingPrice).toBe(true)
    const result = submitDirectAssessment([task], record.id, { cents: 70000, scores: [1, 1, 1, 1], reason: "" }, OPERATOR, SETTINGS)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("缺少对私单价")
    // WorkloadAssign.amount（对公 900）不允许兜底
    const bizItem = record.items.find((i) => i.itemName === "商业拜访")!
    expect(bizItem.privateUnitPrice).toBeNull()
  })

  it("requires an adjustment reason whenever the amount deviates from the default", () => {
    const task = taskOf("TR-905", [assign("a1", "陈静")])
    const missing = submitDirectAssessment([task], "TR-905::2026-10::陈静", { cents: 48513, scores: [1, 1, 1, 1], reason: "  " }, OPERATOR, SETTINGS)
    expect(missing.ok).toBe(false)
    expect(missing.error).toContain("调整原因")
    const ok = submitDirectAssessment([task], "TR-905::2026-10::陈静", { cents: 48513, scores: [1, 1, 1, 1], reason: "服务记录存在缺项" }, OPERATOR, SETTINGS)
    expect(ok.ok).toBe(true)
  })

  it("documents the demo price map keys as traceable task-level bindings", () => {
    expect(DIRECT_PRIVATE_PRICES["TR-021|阿托伐他汀钙片(20mg)|医院拜访"]).toBe(100)
    expect(DIRECT_PRIVATE_PRICES["TR-021|阿托伐他汀钙片(20mg)|不存在的项目"]).toBeUndefined()
  })
})

// ── 退回与版本 ──────────────────────────────────────────────────────────────

describe("return and reassessment", () => {
  it("returns one specialist only: amount leaves the total, others unchanged, history kept", () => {
    const task = taskOf("TR-906", [assign("a1", "陈静"), assign("a2", "王芳", { workload: 7 })])
    const submit = (id: string, cents: number) =>
      submitDirectAssessment([task], id, { cents, scores: [0.9, 0.9, 0.9, 0.9], reason: cents === 70000 ? "" : "服务记录存在缺项" }, OPERATOR, SETTINGS)
    expect(submit("TR-906::2026-10::陈静", 48513).ok).toBe(true)
    expect(submit("TR-906::2026-10::王芳", 70000).ok).toBe(true)
    expect(packageStatsOf(packageByKey([task], "TR-906::2026-10")!)).toMatchObject({ done: 2, status: "已考核", confirmedCents: 118513 })

    // 只退回陈静
    const result = returnDirectAssessment([task], "TR-906::2026-10::陈静", "服务记录存在缺项", OPERATOR)
    expect(result.ok).toBe(true)
    const stats = packageStatsOf(packageByKey([task], "TR-906::2026-10")!)
    expect(stats).toMatchObject({ done: 1, status: "待考核", confirmedCents: 70000 })

    // 陈静：待考核 + 最新操作是退回 + 原版本保留
    const chenjing = recordByKey([task], "TR-906::2026-10::陈静")!
    expect(chenjing.history).toHaveLength(2)
    expect(chenjing.history[0].kind).toBe("return")
    expect(chenjing.history[0].before?.cents).toBe(48513)
    expect(chenjing.history[0].after).toBeNull()
    expect(chenjing.history[1].after?.cents).toBe(48513)

    // 王芳不受影响
    const wangfang = recordByKey([task], "TR-906::2026-10::王芳")!
    expect(wangfang.history).toHaveLength(1)
    expect(wangfang.history[0].kind).toBe("submit")

    // 重新考核产生新版本（reassess，before 为退回前的结果）
    const resubmit = submitDirectAssessment([task], "TR-906::2026-10::陈静", { cents: 50000, scores: [1, 1, 0.8, 1], reason: "" }, OPERATOR, SETTINGS)
    expect(resubmit.ok).toBe(true)
    const updated = recordByKey([task], "TR-906::2026-10::陈静")!
    expect(updated.history).toHaveLength(3)
    expect(updated.history[0].kind).toBe("reassess")
    expect(updated.history[0].before?.cents).toBe(48513)
    expect(updated.history[0].after?.cents).toBe(50000)
    // 日志包含操作者、时间、原因、前后状态
    const op = updated.history[1]
    expect(op.kind).toBe("return")
    expect(op.actor).toBe("陈伟")
    expect(op.reason).toBe("服务记录存在缺项")
    expect(op.from).toBe("已考核")
    expect(op.to).toBe("待考核")
  })

  it("rejects invalid returns: empty reason or pending record", () => {
    const task = taskOf("TR-907", [assign("a1", "陈静")])
    expect(returnDirectAssessment([task], "TR-907::2026-10::陈静", "", OPERATOR).ok).toBe(false)
    expect(returnDirectAssessment([task], "TR-907::2026-10::陈静", "还没考核就退回", OPERATOR).ok).toBe(false)
  })

  it("does not double-submit an already assessed record", () => {
    const task = taskOf("TR-908", [assign("a1", "陈静")])
    expect(submitDirectAssessment([task], "TR-908::2026-10::陈静", { cents: 50000, scores: [1, 1, 1, 1], reason: "" }, OPERATOR, SETTINGS).ok).toBe(true)
    const again = submitDirectAssessment([task], "TR-908::2026-10::陈静", { cents: 50000, scores: [1, 1, 1, 1], reason: "" }, OPERATOR, SETTINGS)
    expect(again.ok).toBe(false)
    expect(again.error).toContain("已考核")
    expect(recordByKey([task], "TR-908::2026-10::陈静")!.history).toHaveLength(1)
  })
})

// ── 完结锁定 ────────────────────────────────────────────────────────────────

describe("task completion locks", () => {
  it("blocks writes on settled-completed tasks but keeps history readable", () => {
    // 用真实种子任务 TK-2026-0022（已结算完结 + 存量种子留痕）
    const task = seedTasks.find((t) => t.id === "TR-022")!
    const [pkg] = directPackagesOf([task])
    expect(pkg.locked).toBe(true)
    const record = recordByKey([task], "TR-022::2026-08::王芳")!
    expect(record.history).toHaveLength(1)
    expect(record.history[0].after?.cents).toBe(60000)
    // 写入被阻止
    expect(submitDirectAssessment([task], record.id, { cents: 60000, scores: [1, 1, 1, 1], reason: "" }, OPERATOR, SETTINGS).ok).toBe(false)
    expect(returnDirectAssessment([task], record.id, "试试退回", OPERATOR).ok).toBe(false)
  })

  it("still allows returns while reconStatus is settled but the task is running", () => {
    // 单张结算单已确认：reconStatus=已结算、taskStatus=执行中 → 仍可退回
    const task = taskOf("TR-910", [assign("a1", "陈静")], { reconStatus: "已结算", taskStatus: "执行中" })
    expect(submitDirectAssessment([task], "TR-910::2026-10::陈静", { cents: 50000, scores: [1, 1, 1, 1], reason: "" }, OPERATOR, SETTINGS).ok).toBe(true)
    expect(returnDirectAssessment([task], "TR-910::2026-10::陈静", "金额复核调整", OPERATOR).ok).toBe(true)
    expect(recordByKey([task], "TR-910::2026-10::陈静")!.history[0].kind).toBe("return")
  })

  it("re-validates against the latest task state at write time (completed during operation)", () => {
    const open = taskOf("TR-911", [assign("a1", "陈静")])
    expect(submitDirectAssessment([open], "TR-911::2026-10::陈静", { cents: 50000, scores: [1, 1, 1, 1], reason: "" }, OPERATOR, SETTINGS).ok).toBe(true)
    // 操作期间任务被完结：以最新 tasks 再校验，写入被阻止，原结果不变
    const completed = { ...open, taskStatus: "已结算" as const, reconStatus: "已结算" as const }
    const result = returnDirectAssessment([completed], "TR-911::2026-10::陈静", "任务已完结", OPERATOR)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("锁定")
    expect(recordByKey([completed], "TR-911::2026-10::陈静")!.history).toHaveLength(1)
  })
})

// ── 数据范围与依据关联 ──────────────────────────────────────────────────────

describe("record linkage and data isolation", () => {
  it("does not mix records across tasks for the same specialist", () => {
    const t1 = taskOf("TR-912", [assign("a1", "陈静")])
    const t2 = taskOf("TR-913", [assign("b1", "陈静", { workload: 3, amount: 600 })])
    const r1 = recordByKey([t1, t2], "TR-912::2026-10::陈静")!
    const r2 = recordByKey([t1, t2], "TR-913::2026-10::陈静")!
    expect(r1.items[0].count).toBe(5)
    expect(r2.items[0].count).toBe(3)
    // 考核互不影响（改额需带原因）
    expect(submitDirectAssessment([t1, t2], r1.id, { cents: 40000, scores: [1, 1, 1, 1], reason: "按实际完成度调整" }, OPERATOR, SETTINGS).ok).toBe(true)
    expect(recordByKey([t1, t2], r2.id)!.history).toHaveLength(0)
  })

  it("links audited visits by task × specialist × variety × month via BUSINESS_TYPE mapping", () => {
    const task = taskOf("TR-914", [assign("a1", "陈静")])
    const record = recordByKey([task], "TR-914::2026-10::陈静")!
    const pushed: typeof visitRecords = []
    const base = {
      no: 0,
      specialist: "陈静",
      specialistAccount: "chenjing",
      provider: "东方恒业推广有限公司",
      holderPharma: "百益制药",
      workGroup: "—",
      hospital: "测试医院",
      hospitalGrade: "三级甲等" as const,
      department: "心内科",
      visitee: "测试",
      visitMethod: "上门",
      variety: V,
      visitPeriod: "日访",
      visitDate: "2026-10-01",
      startTime: "2026-10-01 09:00",
      startOnTime: true,
      endTime: "2026-10-01 10:00",
      endOnTime: true,
      startClock: "09:00:00",
      endClock: "10:00:00",
      visitLocation: "测试",
      visitContent: "测试",
      customerFeedback: "测试",
      performanceStatus: "已评定" as const,
      auditComment: "",
      amount: 0,
      visitCategory: "学术拜访",
    }
    const mk = (id: string, auditStatus: AuditStatus, overrides: Partial<(typeof visitRecords)[number]> = {}) => ({
      id,
      ...base,
      auditStatus,
      ...overrides,
    })
    pushed.push(
      mk("T-1", "已通过", { taskId: "TR-914" }),
      mk("T-2", "已通过", { taskId: "TR-914", visitCategory: "科室拜访" }),
      // 不应计入：待审核 / 其他任务 / 其他月 / 调研类
      mk("T-3", "待审核", { taskId: "TR-914" }),
      mk("T-4", "已通过", { taskId: "TR-999" }),
      mk("T-5", "已通过", { taskId: "TR-914", visitDate: "2026-09-02" }),
      mk("T-6", "已通过", { taskId: "TR-914", visitCategory: "信息收集和调研" }),
    )
    visitRecords.push(...pushed)
    try {
      const result = linkedRecordsOf(task, record, item({ count: 2 }))
      expect(result.complete).toBe(true)
      expect(result.rows.map((r) => r.id)).toEqual(["T-1", "T-2"])
      expect(result.gapNote).toBeNull()
      // 计数不足 → 如实展示缺口
      const short = linkedRecordsOf(task, record, item({ count: 5 }))
      expect(short.complete).toBe(false)
      expect(short.gapNote).toContain("5 次")
      expect(short.gapNote).toContain("2 条")
    } finally {
      pushed.forEach((row) => {
        const index = visitRecords.indexOf(row)
        if (index >= 0) visitRecords.splice(index, 1)
      })
    }
  })

  it("reports an honest gap for business types without a baseline category mapping", () => {
    const task = taskOf("TR-915", [assign("a1", "陈静", { itemName: "商业拜访", workload: 2, amount: 600 })])
    const record = recordByKey([task], "TR-915::2026-10::陈静")!
    const result = linkedRecordsOf(task, record, item({ itemName: "商业拜访", count: 2 }))
    expect(result.rows).toHaveLength(0)
    expect(result.complete).toBe(false)
    expect(result.gapNote).toContain("商业拜访")
  })
})

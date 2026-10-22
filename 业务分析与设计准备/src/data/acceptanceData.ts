/**
 * 成果验收（前端原型数据层）：
 * - 验收链配置：药厂级，localStorage 持久化，默认一级（成果验收）供演示，可配 1–3 级
 * - 材料包：任务 × 服务月份，推广记录（visitRecords.taskId）+ 报告（task.reports.serviceMonth）归集
 * - 记录级验收：每条材料独立推进级数；驳回退回（整改中）→ 重新提交回第 1 级
 * 全部为 mock/内存状态，不接任何后端。
 */
import type {
  AcceptanceChainConfig,
  AcceptanceItemState,
  AcceptancePackage,
  AcceptanceReviewLog,
  ReportFile,
  VisitRecord,
} from "../types"
import { tr3PromoRecords } from "./mockData"

/** 部门候选（组织树部门的演示子集；配置页下拉用） */
export const PHARMA_ACCEPT_DEPARTMENTS = ["销售部", "合规部", "市场部", "医学部"]

/**
 * 业务类型分区（材料分区表行）：拜访类别 → 展示类型。
 * 当前原型会议/调研都挂在拜访模块下，跳转预置类别集合过滤；未来独立成模块只换跳转目标。
 */
export const BUSINESS_TYPE_CATEGORIES: Record<string, string[]> = {
  医院拜访: ["科室拜访", "学术拜访", "日常拜访", "跟踪巡访服务"],
  "会议（科室会）": ["科室会"],
  调研: ["信息收集和调研"],
}

export function promoBusinessType(visitCategory: string): string {
  for (const [type, cats] of Object.entries(BUSINESS_TYPE_CATEGORIES)) {
    if (cats.includes(visitCategory)) return type
  }
  return visitCategory
}

export const ACCEPTANCE_CONFIG_KEY = "beiye-acceptance-chain-v1"

/** 演示默认：一级（成果验收，单级一次通过）；departments 保留满配两档供切换两级时回填 */
export const DEFAULT_ACCEPTANCE_CONFIG: AcceptanceChainConfig = {
  levels: 1,
  departments: ["销售部", "合规部"],
}

export function loadAcceptanceConfig(): AcceptanceChainConfig {
  try {
    const raw = localStorage.getItem(ACCEPTANCE_CONFIG_KEY)
    if (!raw) return DEFAULT_ACCEPTANCE_CONFIG
    const parsed = JSON.parse(raw) as AcceptanceChainConfig
    if (
      typeof parsed?.levels === "number" &&
      Array.isArray(parsed?.departments) &&
      parsed.departments.length >= parsed.levels
    ) {
      return parsed
    }
  } catch {
    /* 演示数据损坏时回落默认 */
  }
  return DEFAULT_ACCEPTANCE_CONFIG
}

export function persistAcceptanceConfig(config: AcceptanceChainConfig) {
  localStorage.setItem(ACCEPTANCE_CONFIG_KEY, JSON.stringify(config))
}

// ===== 纯派生：条目/包状态 =====

export function itemAcceptanceLabel(
  state: AcceptanceItemState | undefined,
  levels: number,
): { label: string; tone: "brand" | "success" | "danger" } {
  const pending = (lv: number) => ({
    label: levels <= 1 ? "待验收" : `待验收 · 第 ${lv} 级`,
    tone: "brand" as const,
  })
  if (!state || (state.passedLevels === 0 && !state.rectifying)) return pending(1)
  if (state.rectifying) return { label: "整改中", tone: "danger" }
  if (state.passedLevels >= levels) return { label: "已通过", tone: "success" }
  return pending(state.passedLevels + 1)
}

/** 包内当前待决级（最小下一级）；无待决返回 null */
export function pendingLevelOf(
  items: Record<string, AcceptanceItemState | undefined>,
  levels: number,
): number | null {
  let min: number | null = null
  for (const st of Object.values(items)) {
    if (!st || st.rectifying || st.passedLevels >= levels) continue
    const need = st.passedLevels + 1
    if (min === null || need < min) min = need
  }
  return min
}

/** 当前级展示名：单级=成果验收；多级=第 N 级 · 部门 */
export function acceptStageLabel(config: AcceptanceChainConfig, level: number): string {
  return config.levels <= 1
    ? "成果验收"
    : `第 ${level} 级 · ${config.departments[level - 1] ?? "—"}`
}

export function packageKey(taskId: string, serviceMonth: string) {
  return `${taskId}|${serviceMonth}`
}

/** 材料包月份清单：推广记录月份 ∪ 报告归属月份，倒序 */
export function packageMonths(promos: VisitRecord[], reports: ReportFile[]) {
  const months = new Set<string>()
  promos.forEach((r) => months.add(r.visitDate.slice(0, 7)))
  reports.forEach((r) => r.serviceMonth && months.add(r.serviceMonth))
  return Array.from(months).sort().reverse()
}

/** 材料完整性：推广记录全部经服务商审核 + 报告全部已上传（系统门槛，不可关闭） */
export function packageCompleteness(promos: VisitRecord[], reports: ReportFile[]) {
  const promoDone = promos.filter((r) => r.auditStatus === "已通过").length
  const reportDone = reports.filter((r) => r.status !== "待上传").length
  return {
    promoDone,
    promoTotal: promos.length,
    reportDone,
    reportTotal: reports.length,
    complete: promoDone === promos.length && reportDone === reports.length,
  }
}

export function emptyPackage(taskId: string, serviceMonth: string): AcceptancePackage {
  return { taskId, serviceMonth, items: {}, logs: [], batches: [] }
}

// ===== 演示种子：TK-2026-0003（TR-003）两个月的材料包 =====

function seedItem(passedLevels: number, rectifying = false): AcceptanceItemState {
  return { passedLevels, rectifying }
}

/**
 * 2026-09：当月批次，按当前验收级数播种——
 * - 单级（默认）：除 2 条被驳整改中外全部待验收，跳入即可审
 * - 多级：第 1 级已审（17 条推广记录 + 月度执行报告过 1 级待第 2 级），2 条整改中
 */
function seedSeptember(levels: number): AcceptancePackage {
  const promos = tr3PromoRecords.filter((r) => r.visitDate.startsWith("2026-09"))
  const single = levels <= 1
  const dept = single ? "成果验收" : "销售部"
  const passed = single ? 0 : 1
  const items: Record<string, AcceptanceItemState> = {}
  promos.forEach((r) => {
    items[r.id] = r.id === "TR3-VR-0905" ? seedItem(passed, true) : seedItem(passed)
  })
  items["TR-003-RP-3"] = seedItem(passed)
  items["TR-003-RP-4"] = seedItem(passed, true)
  const rejectionLogs: AcceptanceReviewLog[] = [
    {
      id: "TR3-09-L1-0905",
      itemId: "TR3-VR-0905",
      itemType: "推广记录",
      level: 1,
      department: dept,
      reviewer: "王敏",
      decision: "驳回",
      comment: "现场签到图片无法辨认，请补充清晰原图",
      time: "2026-09-30 14:20",
    },
    {
      id: "TR3-09-L1-RP4",
      itemId: "TR-003-RP-4",
      itemType: "报告",
      level: 1,
      department: dept,
      reviewer: "王敏",
      decision: "驳回",
      comment: "汇总数据与推广记录数量不一致，请核对后重新提交",
      time: "2026-09-30 14:20",
    },
  ]
  const level1Logs: AcceptanceReviewLog[] = single
    ? []
    : [
        ...promos.map((r, i) => ({
          id: `TR3-09-L1-${i + 1}`,
          itemId: r.id,
          itemType: "推广记录" as const,
          level: 1,
          department: dept,
          reviewer: "王敏",
          decision: r.id === "TR3-VR-0905" ? ("驳回" as const) : ("通过" as const),
          comment: r.id === "TR3-VR-0905" ? "现场签到图片无法辨认，请补充清晰原图" : "",
          time: "2026-09-30 14:20",
        })),
        {
          id: "TR3-09-L1-RP3",
          itemId: "TR-003-RP-3",
          itemType: "报告",
          level: 1,
          department: dept,
          reviewer: "王敏",
          decision: "通过",
          comment: "报告内容完整，同意",
          time: "2026-09-30 14:20",
        },
        ...rejectionLogs.filter((l) => l.itemId !== "TR3-VR-0905"),
      ]
  return {
    taskId: "TR-003",
    serviceMonth: "2026-09",
    items,
    logs: single ? rejectionLogs : level1Logs,
    batches: [
      {
        id: "TR3-09-B1",
        taskId: "TR-003",
        serviceMonth: "2026-09",
        level: 1,
        department: dept,
        reviewer: "王敏",
        time: "2026-09-30 14:20",
        passedCount: single ? 0 : 18,
        rejectedCount: 2,
        batchComment: single ? "签到图与汇总数据两处问题，退回补充" : "其余材料齐全，同意",
        rejections: [
          {
            itemName: "推广记录 TR3-VR-0905 · 佛山市第一人民医院学术拜访",
            reason: "现场签到图片无法辨认，请补充清晰原图",
          },
          {
            itemName: "广东区域推广数据汇总 2026-09",
            reason: "汇总数据与推广记录数量不一致，请核对后重新提交",
          },
        ],
      },
    ],
  }
}

/** 2026-08：历史月已全部通过（展示验收通过与「发起结算」态）；级数按当前配置对齐 */
function seedAugust(levels: number): AcceptancePackage {
  const promos = tr3PromoRecords.filter((r) => r.visitDate.startsWith("2026-08"))
  const single = levels <= 1
  const items: Record<string, AcceptanceItemState> = {}
  promos.forEach((r) => {
    items[r.id] = seedItem(Math.min(2, levels))
  })
  items["TR-003-RP-1"] = seedItem(Math.min(2, levels))
  items["TR-003-RP-2"] = seedItem(Math.min(2, levels))
  return {
    taskId: "TR-003",
    serviceMonth: "2026-08",
    items,
    logs: [],
    batches: [
      {
        id: "TR3-08-B1",
        taskId: "TR-003",
        serviceMonth: "2026-08",
        level: 1,
        department: single ? "成果验收" : "销售部",
        reviewer: "王敏",
        time: "2026-08-30 15:00",
        passedCount: 18,
        rejectedCount: 0,
        batchComment: "材料齐全，同意",
        rejections: [],
      },
      ...(single
        ? []
        : [
            {
              id: "TR3-08-B2",
              taskId: "TR-003",
              serviceMonth: "2026-08",
              level: 2,
              department: "合规部",
              reviewer: "沈悦",
              time: "2026-08-31 10:40",
              passedCount: 18,
              rejectedCount: 0,
              batchComment: "复核无异议",
              rejections: [],
            },
          ]),
    ],
  }
}

/** 种子材料包按验收级数播种（AcceptanceProvider 初始化时取当前配置级数） */
export function buildSeedPackages(levels: number): Record<string, AcceptancePackage> {
  return {
    [packageKey("TR-003", "2026-09")]: seedSeptember(levels),
    [packageKey("TR-003", "2026-08")]: seedAugust(levels),
  }
}

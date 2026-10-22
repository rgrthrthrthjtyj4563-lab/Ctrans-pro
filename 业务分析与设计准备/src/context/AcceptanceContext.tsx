/**
 * 成果验收共享状态（前端原型）：
 * - 验收链配置：localStorage 持久化（药厂级）
 * - 材料包状态：会话内存（与 TaskDataContext 同款口径，不落盘）
 * 不接后端；所有写操作仅改 React 状态并返回结果对象。
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type {
  AcceptanceBatchLog,
  AcceptanceChainConfig,
  AcceptancePackage,
  AcceptanceReviewLog,
} from "../types"
import {
  DEFAULT_ACCEPTANCE_CONFIG,
  buildSeedPackages,
  emptyPackage,
  loadAcceptanceConfig,
  packageKey,
  persistAcceptanceConfig,
} from "../data/acceptanceData"

export interface BatchReviewInput {
  taskId: string
  serviceMonth: string
  level: number
  department: string
  reviewer: string
  batchComment: string
  items: {
    itemId: string
    itemType: "推广记录" | "报告"
    itemName: string
    decision: "通过" | "驳回"
    comment: string
  }[]
}

interface AcceptanceContextValue {
  config: AcceptanceChainConfig
  saveConfig: (next: AcceptanceChainConfig) => void
  packages: Record<string, AcceptancePackage>
  /** 取包（无则建空包）：组件读取用，不产生写副作用 */
  packageOf: (taskId: string, serviceMonth: string) => AcceptancePackage
  /** 批量验收：逐条落状态 + 追加留痕与批次记录 */
  reviewBatch: (input: BatchReviewInput) => { ok: boolean; error?: string }
  /** 重新提交（服务商补料后）：该条回第 1 级重新验收 */
  resubmitItem: (taskId: string, serviceMonth: string, itemId: string) => void
}

const AcceptanceContext = createContext<AcceptanceContextValue | null>(null)

export function nowLocalStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AcceptanceProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AcceptanceChainConfig>(
    () => loadAcceptanceConfig() ?? DEFAULT_ACCEPTANCE_CONFIG,
  )
  // 种子材料包按当前配置级数播种：一级=当月批次待验收，多级=过 1 级待本级
  const [packages, setPackages] = useState<Record<string, AcceptancePackage>>(
    () => buildSeedPackages(config.levels),
  )

  const saveConfig = useCallback((next: AcceptanceChainConfig) => {
    // 每级必须落一个部门：缺失级按候选首位（销售部）补齐，再按级数裁剪
    const filled = Array.from(
      { length: next.levels },
      (_, i) => next.departments[i] ?? "销售部",
    )
    const normalized: AcceptanceChainConfig = {
      levels: next.levels,
      departments: filled,
      updatedAt: nowLocalStamp(),
      updatedBy: "当前登录用户",
    }
    setConfig(normalized)
    persistAcceptanceConfig(normalized)
  }, [])

  const packageOf = useCallback(
    (taskId: string, serviceMonth: string) =>
      packages[packageKey(taskId, serviceMonth)] ?? emptyPackage(taskId, serviceMonth),
    [packages],
  )

  const reviewBatch = useCallback((input: BatchReviewInput) => {
    if (!input.items.length) return { ok: false, error: "本批无待审材料" }
    if (input.items.some((it) => it.decision === "驳回" && !it.comment.trim())) {
      return { ok: false, error: "驳回条目必须填写原因" }
    }
    const key = packageKey(input.taskId, input.serviceMonth)
    const time = nowLocalStamp()
    setPackages((prev) => {
      const pkg = prev[key] ?? emptyPackage(input.taskId, input.serviceMonth)
      const items = { ...pkg.items }
      const logs: AcceptanceReviewLog[] = []
      input.items.forEach((it, i) => {
        // 逐条按自身进度推进（支持包内混合级数：重交条回第 1 级，其余在当前级）
        const cur = pkg.items[it.itemId] ?? { passedLevels: 0, rectifying: false }
        const actedLevel = Math.min(cur.passedLevels + 1, input.level)
        if (it.decision === "通过") {
          items[it.itemId] = {
            passedLevels: cur.passedLevels + 1,
            rectifying: false,
          }
        } else {
          items[it.itemId] = { passedLevels: cur.passedLevels, rectifying: true }
        }
        logs.push({
          id: `${key}-L${actedLevel}-${Date.now()}-${i}`,
          itemId: it.itemId,
          itemType: it.itemType,
          level: actedLevel,
          department: input.department,
          reviewer: input.reviewer,
          decision: it.decision,
          comment: it.comment.trim(),
          time,
        })
      })
      const batch: AcceptanceBatchLog = {
        id: `${key}-B${input.level}-${Date.now()}`,
        taskId: input.taskId,
        serviceMonth: input.serviceMonth,
        level: input.level,
        department: input.department,
        reviewer: input.reviewer,
        time,
        passedCount: input.items.filter((it) => it.decision === "通过").length,
        rejectedCount: input.items.filter((it) => it.decision === "驳回").length,
        batchComment: input.batchComment.trim(),
        rejections: input.items
          .filter((it) => it.decision === "驳回")
          .map((it) => ({ itemName: it.itemName, reason: it.comment.trim() })),
      }
      const next: AcceptancePackage = {
        ...pkg,
        items,
        logs: [...pkg.logs, ...logs],
        batches: [...pkg.batches, batch],
      }
      return { ...prev, [key]: next }
    })
    return { ok: true }
  }, [])

  const resubmitItem = useCallback(
    (taskId: string, serviceMonth: string, itemId: string) => {
      const key = packageKey(taskId, serviceMonth)
      setPackages((prev) => {
        const pkg = prev[key]
        if (!pkg || !pkg.items[itemId]) return prev
        return {
          ...prev,
          [key]: {
            ...pkg,
            items: { ...pkg.items, [itemId]: { passedLevels: 0, rectifying: false } },
          },
        }
      })
    },
    [],
  )

  const value = useMemo(
    () => ({ config, saveConfig, packages, packageOf, reviewBatch, resubmitItem }),
    [config, saveConfig, packages, packageOf, reviewBatch, resubmitItem],
  )

  return <AcceptanceContext.Provider value={value}>{children}</AcceptanceContext.Provider>
}

export function useAcceptance(): AcceptanceContextValue {
  const ctx = useContext(AcceptanceContext)
  if (!ctx) throw new Error("useAcceptance 必须在 AcceptanceProvider 内使用")
  return ctx
}

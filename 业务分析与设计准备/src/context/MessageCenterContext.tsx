import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { NavFocus, PageId } from "../types"
import type { AuthPrincipal } from "../auth/authTypes"

/**
 * 消息中心（站内信）——2026-10-26 批次
 *
 * 定位：消息只「投影」业务事实，不产生业务事实；待办的真相在业务单据，
 * 「已读」不是业务状态（已读 ≠ 已办）。
 *
 * - 收件模型：按「自然人 userId + 工作空间根 id（workspaceKey=principal.workspaceId）」投递，
 *   收件人必须是可解析的具体人（auth 档案），不做「发给所有人」式投递；
 * - 计数全派生：铃铛 = 三类未读之和、页签角标 = 本类未读、「待处理 N 项」= 待办未完成数，
 *   杜绝手写计数（旧 getRoleDashboardData().unreadCount 写死 11/4/8 的口径不再被铃铛消费）；
 * - 会话内存态：不落 localStorage，切换登录即重置（与 tasks 纯内存口径一致）；
 * - 相对时间由 minutesAgo 渲染时换算，保证任何时候打开都是新鲜时间（不随日期变假）。
 */

export type MsgTab = "待办" | "通知" | "公告"
export type MsgLevel = "before3" | "before1" | "hour" | "overdue"

export interface McMessage {
  id: string
  /** 收件人自然人 id（auth 档案 userId，如 u-chenwei） */
  recipientUserId: string
  /** 工作空间根 id：org-pharma / org-provider-east / org-provider-smart / org-platform */
  workspaceKey: string
  tab: MsgTab
  /** 类型徽标文案：准入/合同/结算/验收/备案/任务/授权/合作/成员/租户/系统/规范… */
  type: string
  title: string
  desc: string
  /** 相对时间锚点：N 分钟前（渲染时换算成 刚刚/N 分钟前/N 小时前/昨天/N 天前） */
  minutesAgo: number
  unread: boolean
  /** 待办类生命周期：pending=未完成；done=业务已处理（消息仍留列表，按钮消失） */
  status?: "pending" | "done"
  /** 通知类：是否可跳转（可跳转行尾带 ›） */
  jump?: boolean
  /** 待办类：截止时间条文案（如「明日 18:00 截止」/「已超期 2 小时」） */
  deadline?: string
  /** 四级提醒色：3 天蓝 / 1 天琥珀 / 1 小时橙 / 超期红（仅待办类） */
  level?: MsgLevel
  /** 通知/公告：点击展开的正文 */
  body?: string
  /** 公告：发布主体 / 发布时间 / 可见范围 */
  publisher?: string
  published?: string
  scope?: string
  /** 去处理落点（真实页面 + 可选预置筛选） */
  target?: { page: PageId; focus?: NavFocus }
  /** 状态变化兜底：事项已被他人处理/撤回——去处理仅定位到最新列表并提示 */
  stale?: boolean
}

// ── 组织根 id 与服务商收件人解析（auth 档案口径） ────────────────────────────

export const ORG_PHARMA = "org-pharma"
export const ORG_PROVIDER_EAST = "org-provider-east"
export const ORG_PROVIDER_SMART = "org-provider-smart"
export const ORG_PLATFORM = "org-platform"

/** 服务商租户 → 默认收件管理员（演示口径：东方恒业=陈伟；智联=刘洋·任务分派与初审） */
const PROVIDER_ADMIN_BY_ORG: Record<string, string> = {
  [ORG_PROVIDER_EAST]: "u-chenwei",
  [ORG_PROVIDER_SMART]: "u-liuyang",
}

/** 服务商全称 → 租户根 id（任务/验收等按 provider 名字反查收件人） */
const PROVIDER_ORG_BY_NAME: Record<string, string> = {
  东方恒业推广有限公司: ORG_PROVIDER_EAST,
  智联科技有限公司: ORG_PROVIDER_SMART,
}

export function providerAdminOf(orgId: string | null | undefined): string | null {
  return orgId ? PROVIDER_ADMIN_BY_ORG[orgId] ?? null : null
}

export function providerOrgByName(name: string | null | undefined): string | null {
  return name ? PROVIDER_ORG_BY_NAME[name] ?? null : null
}

/** 两域统一的工作空间显示名（抽屉头部「当前工作空间」） */
export function workspaceLabelOf(principal: AuthPrincipal): string {
  return principal.realm === "PLATFORM"
    ? principal.workspaceName
    : principal.tenantName
}

// ── 种子（演示数据；文案对齐设计稿与需求稿，target 换真实 pageId） ─────────────

function buildSeeds(): McMessage[] {
  return [
    // 李航（百益 · 企业管理员+区域销售经理）：任务/验收/结算跟进视角
    { id: "mc-lihang-1", recipientUserId: "u-lihang", workspaceKey: ORG_PHARMA, tab: "待办", type: "任务",
      title: "TK-2026-0001 待服务商确认", desc: "发包已 3 天未确认，期间可撤销重发", minutesAgo: 55,
      unread: true, status: "pending", deadline: "已超期 2 天 · 建议跟进或撤销", level: "overdue",
      target: { page: "task-dispatch" } },
    { id: "mc-lihang-2", recipientUserId: "u-lihang", workspaceKey: ORG_PHARMA, tab: "待办", type: "结算",
      title: "结算单 SET-0822 待确认", desc: "东方恒业 · 本月结算批次 · 待确认金额", minutesAgo: 160,
      unread: true, status: "pending", deadline: "今日 17:00 截止确认", level: "hour",
      // 结算明细独立页已移除：结算确认统一在「任务执行」内操作
      target: { page: "task-dispatch" } },
    { id: "mc-lihang-3", recipientUserId: "u-lihang", workspaceKey: ORG_PHARMA, tab: "待办", type: "验收",
      title: "9 月成果批次待审核", desc: "拜访记录 24 条 · 工作组一", minutesAgo: 4320,
      unread: false, status: "pending", deadline: "10-29 18:00 截止", level: "before3",
      // 药厂侧拜访入口统一走业务数据管理的审核工作台（hospital-visits 药厂侧已下线）
      target: { page: "visit-audit-hospital", focus: { serviceMonth: "2026-09", provider: "东方恒业推广有限公司" } } },

    // 沈悦（百益 · 企业管理员）：合同归档 + 结算跟进视角
    { id: "mc-shenyue-1", recipientUserId: "u-shenyue", workspaceKey: ORG_PHARMA, tab: "待办", type: "合同",
      title: "《东方恒业推广服务协议》待上传归档", desc: "线下已签 · 待上传扫描件", minutesAgo: 1500,
      unread: true, status: "pending", deadline: "已超期 2 天 · 10-24 截止", level: "overdue",
      target: { page: "contract-management" } },
    { id: "mc-shenyue-3", recipientUserId: "u-shenyue", workspaceKey: ORG_PHARMA, tab: "待办", type: "结算",
      title: "结算单 SET-0819 已确认", desc: "已处理 · 可在结算记录中追溯", minutesAgo: 4460,
      unread: false, status: "done" },

    // 赵宁（百益 · 企业管理员·合规部）：准入审核 + 备案留底视角
    { id: "mc-zhaoning-1", recipientUserId: "u-zhaoning", workspaceKey: ORG_PHARMA, tab: "待办", type: "准入",
      title: "智联科技准入材料待审核", desc: "准入任务 VA-013 · 推广类材料 14 项", minutesAgo: 120,
      unread: true, status: "pending", deadline: "明日 18:00 截止", level: "before1",
      target: { page: "vendor-access" } },
    { id: "mc-zhaoning-2", recipientUserId: "u-zhaoning", workspaceKey: ORG_PHARMA, tab: "待办", type: "备案",
      title: "人员备案信息待补充", desc: "华东区域 · 缺少执业证明文件", minutesAgo: 30,
      unread: true, status: "pending", target: { page: "rep-filing" } },
    { id: "mc-zhaoning-3", recipientUserId: "u-zhaoning", workspaceKey: ORG_PHARMA, tab: "公告", type: "规范",
      title: "服务人员备案材料新口径提醒", desc: "备案材料规范更新", minutesAgo: 7200,
      unread: true, body: "服务人员备案材料口径已更新：身份证明文件须为原件扫描件，培训考核记录需加盖服务机构公章。请按最新规范准备后续材料。",
      publisher: "百益制药 · 企业管理员", published: "2026-10-21 09:30", scope: "百益制药企业成员" },

    // 陈伟（东方恒业 · 服务商管理员）：承接确认视角
    { id: "mc-chenwei-1", recipientUserId: "u-chenwei", workspaceKey: ORG_PROVIDER_EAST, tab: "待办", type: "任务",
      title: "TK-2026-0013 待确认承接", desc: "阿托伐他汀 · 陕西 · 计划 10-31 截止", minutesAgo: 18,
      unread: true, status: "pending", deadline: "2 天内确认，逾期可被撤销", level: "before1",
      target: { page: "task-dispatch" } },
    { id: "mc-chenwei-2", recipientUserId: "u-chenwei", workspaceKey: ORG_PROVIDER_EAST, tab: "通知", type: "合作",
      title: "合作关系导入完成", desc: "百益制药已批量导入 3 条合作关系记录", minutesAgo: 2880,
      unread: false, body: "导入的合作关系已生效，含来源留痕（线下导入）。可在合作关系页查看明细。",
      jump: false },
    // 陈伟的另一身份（百益编码登录 = 企业管理员·合规部）——演示「其他身份还有 N 条」
    { id: "mc-chenwei-3", recipientUserId: "u-chenwei", workspaceKey: ORG_PHARMA, tab: "待办", type: "准入",
      title: "康晟云服准入材料已提交", desc: "任务 VA-014 · 待你审核", minutesAgo: 45,
      unread: true, status: "pending", target: { page: "vendor-access" } },

    // 杨明（东方恒业 · 服务专员·工作组三）：执行视角 + 授权撤销 + 兜底种子
    { id: "mc-yangming-1", recipientUserId: "u-yangming", workspaceKey: ORG_PROVIDER_EAST, tab: "待办", type: "任务",
      title: "新任务已分派至工作组三", desc: "氨氯地平 · 江苏 · 本周内提交拜访计划", minutesAgo: 120,
      unread: true, status: "pending", target: { page: "task-dispatch" } },
    { id: "mc-yangming-2", recipientUserId: "u-yangming", workspaceKey: ORG_PROVIDER_EAST, tab: "通知", type: "授权",
      title: "泽康药业已撤销对你的业务授权", desc: "涉及 3 个品种，相关任务已停用", minutesAgo: 60,
      unread: true, jump: false, body: "如需恢复业务范围，请联系药厂管理员重新发起业务授权。撤销原因可在授权记录中查看。" },
    { id: "mc-yangming-3", recipientUserId: "u-yangming", workspaceKey: ORG_PROVIDER_EAST, tab: "待办", type: "备案",
      title: "异常拜访待补充说明", desc: "该事项已被组长处理，点击可定位最新列表", minutesAgo: 1440,
      unread: true, status: "pending", stale: true, target: { page: "hospital-visits" } },

    // 王敏（系统管理后台）：跨租户监管视角（口径对齐审计日志：系统视角可见跨租户）
    { id: "mc-wangmin-1", recipientUserId: "u-wangmin", workspaceKey: ORG_PLATFORM, tab: "通知", type: "租户",
      title: "租户套餐即将到期", desc: "云杏生物医药 · 专业版 · 剩余 7 天", minutesAgo: 2880,
      unread: true, jump: true, target: { page: "tenant-management" } },
    { id: "mc-wangmin-2", recipientUserId: "u-wangmin", workspaceKey: ORG_PLATFORM, tab: "通知", type: "租户",
      title: "泰合医学推广配额接近上限", desc: "成员数 48/50，接近套餐限额", minutesAgo: 4320,
      unread: false, jump: true, target: { page: "tenant-package" } },
    { id: "mc-wangmin-3", recipientUserId: "u-wangmin", workspaceKey: ORG_PLATFORM, tab: "公告", type: "系统",
      title: "关于 10 月下旬系统维护窗口的公告", desc: "系统例行维护安排", minutesAgo: 90,
      unread: true, body: "为进一步提升服务稳定性，系统将于 10 月 28 日 00:00–02:00 进行例行维护。维护期间部分服务可能短暂不可用，请提前安排相关操作。",
      publisher: "贝医信息科技 · 系统管理员", published: "2026-10-26 10:00", scope: "全体租户" },
  ]
}

// ── Context ────────────────────────────────────────────────────────────────

export interface OtherWorkspaceUnread {
  workspaceKey: string
  label: string
  count: number
}

/** 其他工作空间的显示名（收件模型内部用，不依赖登录态） */
const WORKSPACE_LABELS: Record<string, string> = {
  [ORG_PHARMA]: "百益制药",
  [ORG_PROVIDER_EAST]: "东方恒业推广有限公司",
  [ORG_PROVIDER_SMART]: "智联科技有限公司",
  [ORG_PLATFORM]: "系统管理后台",
}

export interface MessageCenterStore {
  /** 当前「人 × 工作空间」的消息列表（新事件置顶） */
  messagesFor: (userId: string, workspaceKey: string) => McMessage[]
  /** 铃铛角标 = 三类未读之和（99+ 截断在展示层做） */
  unreadTotalFor: (userId: string, workspaceKey: string) => number
  /** 同一自然人在其他工作空间的未读汇总（「其他身份还有 N 条」提示条） */
  otherWorkspaceUnread: (userId: string, currentWorkspaceKey: string) => OtherWorkspaceUnread[]
  markRead: (userId: string, workspaceKey: string, id: string) => void
  markAllRead: (userId: string, workspaceKey: string) => void
  /** 业务事件入箱：unread=true、minutesAgo=0（置顶）；收件人解析失败则静默丢弃（演示口径） */
  push: (message: Omit<McMessage, "unread" | "minutesAgo">) => void
  /**
   * 投递订阅口（2026-10-26 多渠道投递批次）：订阅「新事件入箱」。
   * 业务侧仍只调 push（三处调用点零改动）；通知渠道层订阅本口做 fan-out
   * （浏览器通知 + 企微/飞书/钉钉机器人），保证站内信仍是唯一事实源。
   */
  subscribePush: (listener: (message: McMessage) => void) => () => void
}

const MessageCenterContext = createContext<MessageCenterStore | null>(null)

export function MessageCenterProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<McMessage[]>(() => buildSeeds())
  /** 投递订阅者（通知渠道层）；用 ref 保存避免每次渲染重订阅 */
  const pushListeners = useRef(new Set<(message: McMessage) => void>())

  const messagesFor = useCallback(
    (userId: string, workspaceKey: string) =>
      messages
        .filter((m) => m.recipientUserId === userId && m.workspaceKey === workspaceKey)
        .slice()
        .sort((a, b) => a.minutesAgo - b.minutesAgo),
    [messages],
  )

  const unreadTotalFor = useCallback(
    (userId: string, workspaceKey: string) =>
      messages.filter((m) => m.recipientUserId === userId && m.workspaceKey === workspaceKey && m.unread).length,
    [messages],
  )

  const otherWorkspaceUnread = useCallback(
    (userId: string, currentWorkspaceKey: string) => {
      const byWs = new Map<string, number>()
      for (const m of messages) {
        if (m.recipientUserId !== userId || m.workspaceKey === currentWorkspaceKey || !m.unread) continue
        byWs.set(m.workspaceKey, (byWs.get(m.workspaceKey) ?? 0) + 1)
      }
      return Array.from(byWs.entries()).map(([workspaceKey, count]) => ({
        workspaceKey,
        label: WORKSPACE_LABELS[workspaceKey] ?? workspaceKey,
        count,
      }))
    },
    [messages],
  )

  const markRead = useCallback((userId: string, workspaceKey: string, id: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, unread: false } : m)))
  }, [])

  const markAllRead = useCallback((userId: string, workspaceKey: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.recipientUserId === userId && m.workspaceKey === workspaceKey ? { ...m, unread: false } : m,
      ),
    )
  }, [])

  const push = useCallback((message: Omit<McMessage, "unread" | "minutesAgo">) => {
    const full: McMessage = { ...message, unread: true, minutesAgo: 0 }
    setMessages((prev) => [full, ...prev])
    // 通知渠道层订阅口：站内信入箱后同步 fan-out（浏览器通知 / 三方机器人）
    pushListeners.current.forEach((fn) => fn(full))
  }, [])

  const subscribePush = useCallback((listener: (message: McMessage) => void) => {
    pushListeners.current.add(listener)
    return () => {
      pushListeners.current.delete(listener)
    }
  }, [])

  const value = useMemo(
    () => ({ messagesFor, unreadTotalFor, otherWorkspaceUnread, markRead, markAllRead, push, subscribePush }),
    [messagesFor, unreadTotalFor, otherWorkspaceUnread, markRead, markAllRead, push, subscribePush],
  )

  return <MessageCenterContext.Provider value={value}>{children}</MessageCenterContext.Provider>
}

export function useMessageCenter(): MessageCenterStore {
  const ctx = useContext(MessageCenterContext)
  if (!ctx) throw new Error("useMessageCenter 必须在 MessageCenterProvider 内使用")
  return ctx
}

/** minutesAgo → 相对时间文案（刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前） */
export function formatRelativeTime(minutesAgo: number): string {
  if (minutesAgo < 1) return "刚刚"
  if (minutesAgo < 60) return `${Math.floor(minutesAgo)} 分钟前`
  if (minutesAgo < 24 * 60) return `${Math.floor(minutesAgo / 60)} 小时前`
  if (minutesAgo < 48 * 60) return "昨天"
  return `${Math.floor(minutesAgo / (24 * 60))} 天前`
}

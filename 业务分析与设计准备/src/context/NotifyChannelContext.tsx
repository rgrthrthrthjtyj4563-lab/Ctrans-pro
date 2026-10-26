import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { NavFocus, PageId } from "../types"
import type { AuthPrincipal } from "../auth/authTypes"
import {
  ORG_PHARMA,
  ORG_PLATFORM,
  ORG_PROVIDER_EAST,
  ORG_PROVIDER_SMART,
  useMessageCenter,
} from "./MessageCenterContext"
import type { McMessage, MsgLevel, MsgTab } from "./MessageCenterContext"

/**
 * 通知渠道层（跨平台投递）——2026-10-26 批次 · 原型可演示版
 *
 * 定位：站内信是「事实源」，本层是它的**第二投递渠道**，不产生业务事实。
 * - 业务侧仍只调 MessageCenterContext.push（三处调用点零改动）；
 *   本层订阅 subscribePush 做 fan-out，因此「站内信有的，机器人才会有」恒成立。
 * - 仅投递给「消息收件人 == 当前登录人」的消息：给他人投递的消息不会在当前会话弹窗。
 * - 演示口径（不接后端）：三方机器人推送为**本地模拟外发**，落到 OutboundPush 外发日志，
 *   由 BotSimulator 以「模拟办公客户端」形式呈现；浏览器通知走真实 Web Notification API。
 */

export type NotifyChannel = "wecom" | "feishu" | "dingtalk"

export interface ChannelMeta {
  key: NotifyChannel
  label: string
  botName: string
  /** 品牌主色（仅用于演示区分渠道，取自各家品牌色） */
  brand: string
  /** 真实产品里该渠道的接入方式（方案说明用，不在原型里执行） */
  integration: string
}

export const NOTIFY_CHANNELS: ChannelMeta[] = [
  {
    key: "wecom",
    label: "企业微信",
    botName: "贝医业务助手",
    brand: "#1273E6",
    integration: "自建应用 message/send（可达个人）· 群机器人 webhook（仅发群）",
  },
  {
    key: "feishu",
    label: "飞书",
    botName: "贝医业务助手",
    brand: "#3370FF",
    integration: "自建应用 im/v1/messages + 交互卡片（卡片按钮可回跳业务页）",
  },
  {
    key: "dingtalk",
    label: "钉钉",
    botName: "贝医业务助手",
    brand: "#0089FF",
    integration: "企业内部应用机器人 · 群机器人 webhook（需加签）",
  },
]

/** 一条外发记录（三方渠道投递成功的模拟留痕） */
export interface OutboundPush {
  id: string
  channel: NotifyChannel
  messageId: string
  recipientUserId: string
  /** 该渠道下的账号标识（企微 userid / 飞书 open_id / 钉钉 staffId） */
  recipientAccount: string
  tab: MsgTab
  type: string
  title: string
  desc: string
  level?: MsgLevel
  deadline?: string
  stale?: boolean
  target?: { page: PageId; focus?: NavFocus }
  sentAt: number
  origin: "event" | "demo"
}

// ── 渠道账号绑定（演示映射） ─────────────────────────────────────────────────
// 企微 userid 取自 auth/authProfiles.ts 的外部扫码身份池（wm-* 条目），飞书/钉钉按同口径补足。
// 真实产品：企微 userid 由通讯录同步、飞书 open_id 由应用授权回调、钉钉 staffId 由组织同步。

const CHANNEL_ACCOUNTS: Record<string, Partial<Record<NotifyChannel, string>>> = {
  "u-chenwei": { wecom: "CHEN_WEI", feishu: "ou_chenwei", dingtalk: "staff-chenwei" },
  "u-wangmin": { wecom: "WANG_MIN", feishu: "ou_wangmin", dingtalk: "staff-wangmin" },
  "u-zhaoning": { wecom: "ZHAO_NING", feishu: "ou_zhaoning", dingtalk: "staff-zhaoning" },
  "u-lihang": { wecom: "LI_HANG", feishu: "ou_lihang", dingtalk: "staff-lihang" },
  "u-shenyue": { wecom: "SHEN_YUE", feishu: "ou_shenyue", dingtalk: "staff-shenyue" },
  "u-yangming": { wecom: "YANG_MING", feishu: "ou_yangming", dingtalk: "staff-yangming" },
  "u-liuyang": { wecom: "LIU_YANG", feishu: "ou_liuyang", dingtalk: "staff-liuyang" },
  "u-zhoukai": { wecom: "ZHOU_KAI", feishu: "ou_zhoukai", dingtalk: "staff-zhoukai" },
  "u-hanlei": { wecom: "HAN_LEI", feishu: "ou_hanlei", dingtalk: "staff-hanlei" },
}

/** 未登记账号：按 userId 生成稳定演示账号，保证任意演示账号都能走通投递 */
function fallbackAccount(userId: string, channel: NotifyChannel): string {
  const slug = userId.replace(/^u-/, "")
  if (channel === "wecom") return slug.replace(/-/g, "_").toUpperCase()
  if (channel === "feishu") return `ou_${slug.replace(/-/g, "")}`
  return `staff-${slug}`
}

export function channelAccountOf(userId: string, channel: NotifyChannel): string {
  return CHANNEL_ACCOUNTS[userId]?.[channel] ?? fallbackAccount(userId, channel)
}

// ── 演示事件（各工作空间一条，target 指向真实业务页） ──────────────────────────

type DemoEvent = Omit<McMessage, "id" | "recipientUserId" | "workspaceKey" | "unread" | "minutesAgo">

const DEMO_EVENTS: Record<string, DemoEvent> = {
  [ORG_PHARMA]: {
    tab: "待办", type: "准入", title: "服务商准入材料待审核（演示事件）",
    desc: "智联科技提交推广类准入材料 14 项", status: "pending",
    deadline: "明日 18:00 截止", level: "before1", target: { page: "vendor-access" },
  },
  [ORG_PROVIDER_EAST]: {
    tab: "待办", type: "任务", title: "新任务待确认承接（演示事件）",
    desc: "百益制药发包 · 计划 10-31 截止", status: "pending",
    deadline: "2 天内确认，逾期可被撤销", level: "before1", target: { page: "task-dispatch" },
  },
  [ORG_PROVIDER_SMART]: {
    tab: "待办", type: "任务", title: "新任务待分派至工作组（演示事件）",
    desc: "承接确认完成，待分派到具体工作组", status: "pending", target: { page: "task-dispatch" },
  },
  [ORG_PLATFORM]: {
    tab: "通知", type: "租户", title: "新租户开通申请待处理（演示事件）",
    desc: "某企业提交开通申请，待开通租户与套餐", jump: true, target: { page: "tenant-management" },
  },
}

const FALLBACK_EVENT: DemoEvent = {
  tab: "通知", type: "系统", title: "新的业务事件（演示事件）",
  desc: "由通知渠道演示按钮触发", jump: false,
}

// ── Context ─────────────────────────────────────────────────────────────────

export interface NotifyChannelStore {
  channels: ChannelMeta[]
  /** 渠道开关（会话内存态，切换登录重置） */
  enabled: Record<NotifyChannel, boolean>
  toggleChannel: (channel: NotifyChannel, value: boolean) => void
  /** 当前登录人在各渠道的账号（面板展示绑定情况） */
  currentAccounts: Partial<Record<NotifyChannel, string>>

  /** 已投递到三方渠道的记录（新→旧） */
  outbox: OutboundPush[]
  clearOutbox: () => void

  /** 浏览器通知（真实 Web Notification API） */
  browserSupported: boolean
  browserPermission: NotificationPermission | "unsupported"
  browserEnabled: boolean
  setBrowserEnabled: (value: boolean) => void
  requestBrowserPermission: () => Promise<void>
  sendTestBrowserNotification: () => void

  /** 渠道设置面板 */
  panelOpen: boolean
  setPanelOpen: (value: boolean) => void

  /** 模拟办公客户端窗口 */
  simulatorOpen: boolean
  setSimulatorOpen: (value: boolean) => void
  simulatorChannel: NotifyChannel
  setSimulatorChannel: (channel: NotifyChannel) => void

  /** 演示：模拟一条业务事件入箱（站内信 + 浏览器通知 + 已开启的机器人渠道） */
  simulateEvent: () => void
  canSimulate: boolean
}

const NotifyChannelContext = createContext<NotifyChannelStore | null>(null)

export function NotifyChannelProvider({
  principal,
  children,
}: {
  principal: AuthPrincipal | null
  children: ReactNode
}) {
  const mc = useMessageCenter()

  const [enabled, setEnabled] = useState<Record<NotifyChannel, boolean>>({
    wecom: true,
    feishu: true,
    dingtalk: true,
  })
  const [outbox, setOutbox] = useState<OutboundPush[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const [simulatorChannel, setSimulatorChannel] = useState<NotifyChannel>("wecom")

  const browserSupported = typeof window !== "undefined" && "Notification" in window
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">(
    browserSupported ? Notification.permission : "unsupported",
  )
  const [browserEnabled, setBrowserEnabled] = useState(false)

  /**
   * fan-out 读的是最新配置，用 ref 承载可避免每次开关切换都重订阅。
   */
  const cfg = useRef({ principal, enabled, browserEnabled, browserPermission })
  cfg.current = { principal, enabled, browserEnabled, browserPermission }

  const notifyBrowser = useCallback((m: McMessage) => {
    const { browserEnabled: on, browserPermission: perm } = cfg.current
    if (!browserSupported || !on || perm !== "granted") return
    try {
      // 演示口径：不做「页面可见时抑制」，便于评审当场看到真实系统通知
      const n = new Notification(`【${m.type}】${m.title}`, {
        body: m.desc,
        tag: m.id,
        icon: "/favicon.svg",
      })
      n.onclick = () => {
        window.focus()
        n.close()
      }
    } catch {
      // 部分环境（非 https / 无权限）会抛错，静默降级，不阻断投递
    }
  }, [browserSupported])

  const fanOut = useCallback(
    (m: McMessage, origin: "event" | "demo") => {
      const { principal: p, enabled: on } = cfg.current
      // 只投递给当前登录人：给他人投递的消息不在本会话弹窗
      if (!p || m.recipientUserId !== p.userId) return

      notifyBrowser(m)

      const sent: OutboundPush[] = []
      for (const c of NOTIFY_CHANNELS) {
        if (!on[c.key]) continue
        sent.push({
          id: `op-${Date.now()}-${c.key}-${Math.random().toString(36).slice(2, 6)}`,
          channel: c.key,
          messageId: m.id,
          recipientUserId: m.recipientUserId,
          recipientAccount: channelAccountOf(m.recipientUserId, c.key),
          tab: m.tab,
          type: m.type,
          title: m.title,
          desc: m.desc,
          level: m.level,
          deadline: m.deadline,
          stale: m.stale,
          target: m.target,
          sentAt: Date.now(),
          origin,
        })
      }
      if (sent.length === 0) return

      setOutbox((prev) => [...sent, ...prev])
      // 有新推送即弹出模拟客户端，并切到首个已送达渠道（评审当场可见）
      setSimulatorChannel(sent[0].channel)
      setSimulatorOpen(true)
    },
    [notifyBrowser],
  )

  // 订阅站内信入箱（业务侧零改动）
  useEffect(() => mc.subscribePush((m) => fanOut(m, "event")), [mc, fanOut])

  const toggleChannel = useCallback((channel: NotifyChannel, value: boolean) => {
    setEnabled((prev) => ({ ...prev, [channel]: value }))
  }, [])

  const requestBrowserPermission = useCallback(async () => {
    if (!browserSupported) return
    const perm = await Notification.requestPermission()
    setBrowserPermission(perm)
    if (perm === "granted") setBrowserEnabled(true)
  }, [browserSupported])

  const sendTestBrowserNotification = useCallback(() => {
    notifyBrowser({
      id: `test-${Date.now()}`,
      recipientUserId: principal?.userId ?? "",
      workspaceKey: principal?.workspaceId ?? "",
      tab: "通知",
      type: "测试",
      title: "浏览器通知已接通",
      desc: "这是一条测试通知：后续业务事件投递时会以同样方式提醒你。",
      minutesAgo: 0,
      unread: true,
    })
  }, [notifyBrowser, principal])

  const simulateEvent = useCallback(() => {
    if (!principal) return
    const event = DEMO_EVENTS[principal.workspaceId] ?? FALLBACK_EVENT
    mc.push({
      ...event,
      id: `mc-demo-${Date.now()}`,
      recipientUserId: principal.userId,
      workspaceKey: principal.workspaceId,
    })
  }, [mc, principal])

  const clearOutbox = useCallback(() => setOutbox([]), [])

  const currentAccounts = useMemo(() => {
    if (!principal) return {}
    const out: Partial<Record<NotifyChannel, string>> = {}
    for (const c of NOTIFY_CHANNELS) out[c.key] = channelAccountOf(principal.userId, c.key)
    return out
  }, [principal])

  const value = useMemo<NotifyChannelStore>(
    () => ({
      channels: NOTIFY_CHANNELS,
      enabled,
      toggleChannel,
      currentAccounts,
      outbox,
      clearOutbox,
      browserSupported,
      browserPermission,
      browserEnabled,
      setBrowserEnabled,
      requestBrowserPermission,
      sendTestBrowserNotification,
      panelOpen,
      setPanelOpen,
      simulatorOpen,
      setSimulatorOpen,
      simulatorChannel,
      setSimulatorChannel,
      simulateEvent,
      canSimulate: !!principal,
    }),
    [
      enabled, toggleChannel, currentAccounts, outbox, clearOutbox,
      browserSupported, browserPermission, browserEnabled,
      requestBrowserPermission, sendTestBrowserNotification,
      panelOpen, simulatorOpen, simulatorChannel, simulateEvent, principal,
    ],
  )

  return <NotifyChannelContext.Provider value={value}>{children}</NotifyChannelContext.Provider>
}

export function useNotifyChannel(): NotifyChannelStore {
  const ctx = useContext(NotifyChannelContext)
  if (!ctx) throw new Error("useNotifyChannel 必须在 NotifyChannelProvider 内使用")
  return ctx
}

import { useEffect, useMemo, useState } from "react"
import {
  Bell,
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Users,
  X,
} from "lucide-react"
import type { NavFocus, PageId } from "../types"
import type { ToastMessage } from "./Toast"
import {
  formatRelativeTime,
  useMessageCenter,
  workspaceLabelOf,
} from "../context/MessageCenterContext"
import type { AuthPrincipal } from "../auth/authTypes"
import type { McMessage, MsgTab } from "../context/MessageCenterContext"
import "./MessageCenter.css"

/**
 * 消息中心抽屉 —— KIOXIA《消息中心交互原型设计》Drawer 移植（mc- 前缀 + lucide 图标）。
 * 行为口径（2026-10-26 拍板）：
 * - 待办行只有「去处理」（消息只投影事实，业务动作在业务页完成；无行内驳回/确认）；
 * - 已读 ≠ 已办：「全部标为已读」只清未读角标，待办仍留列表；done 态按钮消失、行置灰；
 * - 公告展开即已读（计入页签角标）；通知点击=已读，jump 的同步跳转、无 jump 仅展开正文（无 ›）；
 * - 事项状态变化（stale）：去处理仅定位到最新列表并 toast 提示，不落空白页；
 * - 「其他身份还有 N 条」浮层点击 = 提示重新登录查看（对齐 2026-09-18「切换企业入口已砍」拍板，不做假切换）；
 * - Esc 关闭、关闭后焦点回归铃铛（焦点回归由 App 的 onClose 实现）。
 */

type FilterKind = "全部" | "待处理" | "未读"

function EmptyState({ kind }: { kind: "pending" | "unread" | "all" }) {
  const title =
    kind === "pending" ? "暂无待处理事项" : kind === "unread" ? "暂无未读消息" : "暂无消息"
  return (
    <div className="mc-empty">
      <div className="mc-empty-icon">
        <Bell size={25} aria-hidden />
      </div>
      <strong>{title}</strong>
      <span>{kind === "all" ? "有新的待办或通知会在这里提醒你" : "可切换到「全部」查看历史消息"}</span>
    </div>
  )
}

export function MessageCenterDrawer({
  principal,
  mobile,
  onClose,
  navigate,
  addToast,
}: {
  principal: AuthPrincipal
  mobile?: boolean
  onClose: () => void
  navigate: (page: PageId, focus?: NavFocus) => void
  addToast: (msg: Omit<ToastMessage, "id">) => void
}) {
  const mc = useMessageCenter()
  const userId = principal.userId
  const workspaceKey = principal.workspaceId
  const workspaceLabel = workspaceLabelOf(principal)

  const [tab, setTab] = useState<MsgTab>("待办")
  const [filter, setFilter] = useState<FilterKind>("全部")
  const [identityOpen, setIdentityOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const messages = useMemo(
    () => mc.messagesFor(userId, workspaceKey),
    [mc, userId, workspaceKey],
  )
  const otherIdentities = useMemo(
    () => mc.otherWorkspaceUnread(userId, workspaceKey),
    [mc, userId, workspaceKey],
  )
  const otherTotal = otherIdentities.reduce((sum, o) => sum + o.count, 0)

  const counts: Record<MsgTab, number> = {
    待办: messages.filter((m) => m.tab === "待办" && m.unread).length,
    通知: messages.filter((m) => m.tab === "通知" && m.unread).length,
    公告: messages.filter((m) => m.tab === "公告" && m.unread).length,
  }
  const pendingCount = messages.filter((m) => m.tab === "待办" && m.status === "pending").length

  const source = messages.filter((m) => m.tab === tab)
  const shown = source.filter((m) =>
    filter === "全部"
      ? true
      : filter === "待处理"
        ? m.status === "pending"
        : m.unread,
  )

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    addEventListener("keydown", esc)
    return () => removeEventListener("keydown", esc)
  }, [onClose])

  const switchTab = (t: MsgTab) => {
    setTab(t)
    setFilter("全部")
    setExpanded(null)
  }

  const markRead = (id: string) => mc.markRead(userId, workspaceKey, id)

  /** 去处理 / 点击跳转：stale 仅定位最新列表并提示 */
  const goHandle = (m: McMessage) => {
    markRead(m.id)
    onClose()
    if (m.stale) {
      addToast({
        type: "info",
        title: "该事项状态已变化",
        description: "已为你定位到最新列表，可在列表中查看处理结果。",
      })
    } else {
      addToast({ type: "info", title: "已定位到业务对象", description: m.title })
    }
    if (m.target) navigate(m.target.page, m.target.focus)
  }

  const openMessage = (m: McMessage) => {
    markRead(m.id)
    if (m.tab === "公告") {
      setExpanded(expanded === m.id ? null : m.id)
      return
    }
    if (m.status === "pending" || m.jump) {
      goHandle(m)
      return
    }
    setExpanded(expanded === m.id ? null : m.id)
  }

  const switchIdentityHint = () => {
    setIdentityOpen(false)
    onClose()
    addToast({
      type: "info",
      title: "请切换工作空间后查看",
      description: "跨企业消息须退出登录后，使用对应企业编码重新登录查看（演示口径）。",
    })
  }

  return (
    <section className={`mc-drawer ${mobile ? "mc-mobile" : ""}`} aria-label="消息中心">
      <header className="mc-header">
        <div>
          <div className="mc-title">消息中心</div>
          <div className="mc-workspace">
            <Building2 size={12} aria-hidden />
            {workspaceLabel}
          </div>
          <div className="mc-pending">待处理 {pendingCount} 项</div>
        </div>
        <div className="mc-actions">
          <button
            onClick={() => mc.markAllRead(userId, workspaceKey)}
            disabled={counts.待办 + counts.通知 + counts.公告 === 0}
          >
            全部标为已读
          </button>
          <button className="mc-close" onClick={onClose} aria-label="关闭消息中心">
            <X size={18} aria-hidden />
          </button>
        </div>
      </header>

      {otherTotal > 0 && (
        <div className="mc-identity-wrap">
          <button
            className="mc-identity"
            aria-expanded={identityOpen}
            onClick={() => setIdentityOpen(!identityOpen)}
          >
            <span>
              <Users size={17} aria-hidden /> 其他身份还有 {otherTotal} 条未读
            </span>
            <ChevronRight
              size={17}
              aria-hidden
              style={{ transform: identityOpen ? "rotate(90deg)" : undefined, transition: "transform .15s" }}
            />
          </button>
          {identityOpen && (
            <div className="mc-identity-popover" role="menu">
              <b>切换工作空间与身份（未读 {otherTotal} 条）</b>
              {otherIdentities.map((o) => (
                <button key={o.workspaceKey} onClick={switchIdentityHint}>
                  <span>
                    {o.label} · {o.count} 条未读
                  </span>
                  <ChevronRight size={16} aria-hidden />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <nav className="mc-tabs">
        {(["待办", "通知", "公告"] as MsgTab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => switchTab(t)}>
            {t}
            {counts[t] > 0 && <span className="mc-count">{counts[t]}</span>}
          </button>
        ))}
      </nav>

      <div className="mc-filters">
        <div className="mc-segmented">
          {(tab === "待办" ? (["全部", "待处理"] as FilterKind[]) : (["全部", "未读"] as FilterKind[])).map(
            (f) => (
              <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
                {f}
              </button>
            ),
          )}
        </div>
        <span>
          显示 {shown.length} / 共 {source.length} 条
        </span>
      </div>

      <div className="mc-list">
        {shown.length === 0 ? (
          <EmptyState kind={source.length === 0 ? "all" : filter === "待处理" ? "pending" : "unread"} />
        ) : (
          shown.map((m) => (
            <article
              key={m.id}
              className={`mc-row ${m.status === "done" ? "done" : ""}`}
              tabIndex={0}
              onClick={() => openMessage(m)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  openMessage(m)
                }
              }}
            >
              <div className="mc-icon">
                {m.status === "done" ? (
                  <Check size={17} aria-hidden />
                ) : m.tab === "待办" ? (
                  <Briefcase size={17} aria-hidden />
                ) : (
                  <FileText size={17} aria-hidden />
                )}
              </div>
              <div className="mc-body">
                <div className="mc-top">
                  <span className="mc-type">{m.type}</span>
                  <span className="mc-title-line">{m.title}</span>
                  <span className="mc-time">{formatRelativeTime(m.minutesAgo)}</span>
                  {m.unread && <span className="mc-dot" aria-label="未读" />}
                </div>
                <div className="mc-summary">
                  {m.status === "done" && <Check size={13} aria-hidden />}
                  {m.desc}
                </div>
                {m.deadline && m.level && (
                  <div className={`mc-deadline ${m.level}`}>
                    <Clock size={13} aria-hidden />
                    {m.deadline}
                  </div>
                )}
                {expanded === m.id && m.body && (
                  <div className="mc-inline-detail">
                    {m.body}
                    {m.tab === "公告" && (
                      <div className="mc-meta">
                        <span>{m.publisher}</span>
                        <span>{m.published}</span>
                        <span>{m.scope}</span>
                      </div>
                    )}
                  </div>
                )}
                {m.tab === "公告" && expanded !== m.id && (
                  <div className="mc-announcement-meta">
                    {m.publisher}
                    <span>·</span>
                    {m.published}
                    <span>·</span>
                    {m.scope}
                  </div>
                )}
                {m.status === "pending" && (
                  <div className="mc-action-line">
                    <button
                      className="mc-link-button"
                      onClick={(e) => {
                        e.stopPropagation()
                        goHandle(m)
                      }}
                    >
                      {m.stale ? "查看最新列表" : "去处理"}
                      <ChevronRight size={14} aria-hidden />
                    </button>
                  </div>
                )}
                {m.status === "done" && <div className="mc-handled">已处理</div>}
              </div>
              {m.tab === "通知" && m.jump && (
                <span className="mc-row-chevron">
                  <ChevronRight size={16} aria-hidden />
                </span>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  )
}

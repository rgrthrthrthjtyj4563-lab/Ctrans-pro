import { useEffect, useRef } from "react"
import { Bell, ChevronRight, Clock, Trash2, X } from "lucide-react"
import { NOTIFY_CHANNELS, useNotifyChannel } from "../context/NotifyChannelContext"
import type { NotifyChannel, OutboundPush } from "../context/NotifyChannelContext"
import "./NotifyChannel.css"

/**
 * 模拟办公客户端（企微 / 飞书 / 钉钉）——原型演示用
 *
 * 说明：原型无后端，三方机器人推送以本窗口模拟呈现（真实接入需服务端持 access_token 调用各家接口）。
 * 机器人卡片的「去处理」= 交互卡片按钮的等价物：点击回跳站内对应业务页（真实产品由卡片 URL/回调承接）。
 */

function clockOf(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function channelMeta(channel: NotifyChannel) {
  return NOTIFY_CHANNELS.find((c) => c.key === channel) ?? NOTIFY_CHANNELS[0]
}

function PushCard({ push, onHandle }: { push: OutboundPush; onHandle: (p: OutboundPush) => void }) {
  const meta = channelMeta(push.channel)
  return (
    <div className="nc-chat">
      <div className="nc-chat-avatar" style={{ background: meta.brand }} aria-hidden>
        贝
      </div>
      <div className="nc-chat-main">
        <div className="nc-chat-name">
          <b>{meta.botName}</b>
          <span>{clockOf(push.sentAt)}</span>
          {push.origin === "demo" && <span>· 演示事件</span>}
        </div>
        <div className="nc-card">
          <div className="nc-card-top">
            <span className="nc-card-type">{push.type}</span>
            <span className="nc-card-title">{push.title}</span>
          </div>
          <div className="nc-card-desc">{push.desc}</div>
          {push.deadline && push.level && (
            <div className={`nc-card-dl ${push.level}`}>
              <Clock size={12} aria-hidden />
              {push.deadline}
            </div>
          )}
          <div className="nc-card-foot">
            <button className="nc-card-btn" onClick={() => onHandle(push)}>
              {push.stale ? "查看最新列表" : "去处理"}
              <ChevronRight size={13} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function BotSimulator({ onHandle }: { onHandle: (push: OutboundPush) => void }) {
  const nc = useNotifyChannel()
  const bodyRef = useRef<HTMLDivElement>(null)
  const list = nc.outbox.filter((p) => p.channel === nc.simulatorChannel)
  const meta = channelMeta(nc.simulatorChannel)

  // 新推送到达时滚到窗口顶部（聊天流为「新消息在上」）
  useEffect(() => {
    if (nc.simulatorOpen) bodyRef.current?.scrollTo({ top: 0 })
  }, [nc.outbox.length, nc.simulatorChannel, nc.simulatorOpen])

  useEffect(() => {
    if (!nc.simulatorOpen) return
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") nc.setSimulatorOpen(false)
    }
    addEventListener("keydown", esc)
    return () => removeEventListener("keydown", esc)
  }, [nc])

  if (!nc.simulatorOpen) return null

  return (
    <section className="nc-sim" aria-label="机器人推送模拟客户端">
      <div className="nc-sim-head">
        <div className="nc-sim-head-top">
          <div className="nc-sim-logo" style={{ background: meta.brand }} aria-hidden>
            贝
          </div>
          <div className="nc-sim-title">
            <b>{meta.label} · {meta.botName}</b>
            <span>机器人推送模拟（原型演示，未接真实后端）</span>
          </div>
          <button className="nc-close" onClick={() => nc.setSimulatorOpen(false)} aria-label="关闭模拟客户端">
            <X size={17} aria-hidden />
          </button>
        </div>
        <div className="nc-sim-tabs" role="tablist">
          {NOTIFY_CHANNELS.map((c) => {
            const n = nc.outbox.filter((p) => p.channel === c.key).length
            return (
              <button
                key={c.key}
                role="tab"
                aria-selected={nc.simulatorChannel === c.key}
                className={nc.simulatorChannel === c.key ? "active" : ""}
                style={{ color: nc.simulatorChannel === c.key ? c.brand : undefined }}
                onClick={() => nc.setSimulatorChannel(c.key)}
              >
                {c.label}
                {n > 0 && <span className="nc-sim-tabcount">{n}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="nc-sim-body" ref={bodyRef}>
        {list.length === 0 ? (
          <div className="nc-sim-empty">
            <Bell size={22} aria-hidden />
            <b>{meta.label}暂无推送</b>
            <span>在「通知渠道」里开启该渠道后，业务事件会推送到这里</span>
          </div>
        ) : (
          list.map((p) => <PushCard key={p.id} push={p} onHandle={onHandle} />)
        )}
      </div>

      <div className="nc-sim-foot">
        <button className="nc-btn primary" onClick={nc.simulateEvent} disabled={!nc.canSimulate}>
          模拟推送一条
        </button>
        <button className="nc-btn" onClick={() => nc.setPanelOpen(true)}>
          通知渠道
        </button>
        <button className="nc-ghost" onClick={nc.clearOutbox} aria-label="清空推送记录">
          <Trash2 size={12} aria-hidden /> 清空
        </button>
      </div>
    </section>
  )
}

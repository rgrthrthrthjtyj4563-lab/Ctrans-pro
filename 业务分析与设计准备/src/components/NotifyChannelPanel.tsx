import { useEffect } from "react"
import { Bell, Info, MonitorSmartphone, X } from "lucide-react"
import { NOTIFY_CHANNELS, useNotifyChannel } from "../context/NotifyChannelContext"
import type { NotifyChannel } from "../context/NotifyChannelContext"
import "./NotifyChannel.css"

/**
 * 通知渠道设置面板（原型可演示版）
 *
 * 口径：站内信是事实源，浏览器通知与三方机器人是**同一事件的叠加投递渠道**；
 * 关掉某个渠道只影响「提醒怎么送达」，不影响站内信与未读数。
 */

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`nc-switch ${on ? "on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <i />
    </button>
  )
}

export function NotifyChannelPanel() {
  const nc = useNotifyChannel()

  // Esc 关闭（与消息抽屉、模拟客户端同约定）
  useEffect(() => {
    if (!nc.panelOpen) return
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") nc.setPanelOpen(false)
    }
    addEventListener("keydown", esc)
    return () => removeEventListener("keydown", esc)
  }, [nc])

  if (!nc.panelOpen) return null

  const perm = nc.browserPermission
  const permText =
    perm === "granted" ? "已授权" : perm === "denied" ? "已拒绝" : perm === "default" ? "未授权" : "当前环境不支持"
  const permClass = perm === "granted" ? "ok" : perm === "denied" ? "bad" : perm === "default" ? "warn" : ""

  return (
    <div className="nc-overlay" onClick={() => nc.setPanelOpen(false)}>
      <div
        className="nc-panel"
        role="dialog"
        aria-modal="true"
        aria-label="通知渠道"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nc-head">
          <div>
            <h3>通知渠道</h3>
            <p>
              站内信是唯一事实源；浏览器通知与机器人是同一事件的其他投递渠道，
              关闭任一渠道都不影响站内信与未读数。
            </p>
          </div>
          <button className="nc-close" onClick={() => nc.setPanelOpen(false)} aria-label="关闭">
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* 浏览器通知（真实 Web Notification API） */}
        <div className="nc-section">
          <div className="nc-section-title">
            <b>浏览器通知</b>
            <span className={`nc-badge ${permClass}`}>{permText}</span>
          </div>
          <div className="nc-browser">
            <div className="nc-browser-icon">
              <MonitorSmartphone size={18} aria-hidden />
            </div>
            <div className="nc-browser-main">
              <b>系统级桌面通知</b>
              <span>
                {perm === "granted"
                  ? nc.browserEnabled
                    ? "已开启：业务事件投递时会弹出系统通知"
                    : "已授权但未开启，打开开关后生效"
                  : perm === "denied"
                    ? "已被浏览器拒绝：请在地址栏站点设置中改为「允许」后刷新"
                    : perm === "default"
                      ? "需先授权，授权后业务事件会弹出系统通知"
                      : "当前浏览器环境不支持 Notification API"}
              </span>
            </div>
            {perm === "granted" ? (
              <>
                <button className="nc-btn" onClick={nc.sendTestBrowserNotification}>
                  测试通知
                </button>
                <Switch on={nc.browserEnabled} onChange={nc.setBrowserEnabled} label="开启浏览器通知" />
              </>
            ) : (
              <button
                className="nc-btn primary"
                onClick={() => void nc.requestBrowserPermission()}
                disabled={perm !== "default"}
              >
                开启通知
              </button>
            )}
          </div>
        </div>

        {/* 三方机器人渠道 */}
        <div className="nc-section">
          <div className="nc-section-title">
            <b>跨平台机器人</b>
            <span className="nc-hint">当前账号已绑定：{NOTIFY_CHANNELS.filter((c) => nc.currentAccounts[c.key]).length} / 3</span>
          </div>
          {NOTIFY_CHANNELS.map((c) => (
            <div className="nc-channel" key={c.key}>
              <span className="nc-dot-brand" style={{ background: c.brand }} aria-hidden />
              <div className="nc-channel-main">
                <b>{c.label} · {c.botName}</b>
                <span>{nc.currentAccounts[c.key] ?? "未绑定"}</span>
              </div>
              <Switch
                on={nc.enabled[c.key]}
                onChange={(v) => nc.toggleChannel(c.key as NotifyChannel, v)}
                label={`开启${c.label}机器人推送`}
              />
            </div>
          ))}
          <p className="nc-hint" style={{ marginTop: 9 }}>
            开启后，待办与通知会同步推送到对应办公客户端；公告默认只留在站内信。
          </p>
        </div>

        {/* 演示 */}
        <div className="nc-section">
          <div className="nc-section-title">
            <b>演示</b>
            <span className="nc-hint">仅原型演示，不写入真实数据</span>
          </div>
          <div className="nc-demo">
            <p className="nc-hint" style={{ margin: 0 }}>
              点按下方按钮模拟一条业务事件：站内信入箱（铃铛 +1）→ 浏览器通知 → 所有已开启渠道的机器人推送。
            </p>
            <div className="nc-demo-actions">
              <button className="nc-btn primary" onClick={nc.simulateEvent} disabled={!nc.canSimulate}>
                <Bell size={13} aria-hidden /> 模拟业务事件推送
              </button>
              <button className="nc-btn" onClick={() => nc.setSimulatorOpen(true)}>
                打开模拟客户端
              </button>
            </div>
          </div>
        </div>

        <div className="nc-note">
          <b>关于真实接入：</b>
          三方机器人推送无法纯前端完成——各家接口都需要服务端持 <code>access_token</code>（app secret 签名）或
          webhook 密钥调用，前端直连会泄露密钥且受 CORS 限制。落地时需增加一个投递服务：
          订阅业务事件 → 查「用户 × 渠道账号」绑定 → 调用企微 <code>message/send</code>、
          飞书 <code>im/v1/messages</code>（交互卡片可带「去处理」回跳）、钉钉企业内部应用机器人。
          <br />
          <Info size={11} aria-hidden style={{ verticalAlign: "-1px", marginRight: 3 }} />
          企微 <code>userid</code> 已可从现有登录档案解析（见 auth/authProfiles.ts 的扫码身份池），飞书 open_id / 钉钉 staffId 需在接入时补同步。
        </div>
      </div>
    </div>
  )
}

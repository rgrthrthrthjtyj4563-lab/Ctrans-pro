import {
  ArrowUpRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  LogOut,
  MoonStar,
  Repeat,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
  UserCircle,
} from "lucide-react"
import {
  DEMO_ACCOUNT_GROUPS,
  DEMO_ACCOUNT_HINTS,
  type DemoAccountHint,
} from "../auth/authProfiles"
import type { AuthPrincipal } from "../auth/authTypes"
import "./UserMenu.css"

export interface UserMenuProps {
  principal: AuthPrincipal
  /** 顶栏与弹层共用的身份行（角色集 · 企业；平台侧=角色 · 系统管理后台） */
  identityTitle: string
  dataScopeLabel: string
  servingPharmaName?: string
  open: boolean
  onToggle: () => void
  canSwitchPharma: boolean
  onSwitchPharma: () => void
  onOpenRepMobileDemo: () => void
  onOpenFullMobileDemo: () => void
  /** 完整移动端演示是否正在体验中（显示「体验中」徽章） */
  fullMobileDemoActive: boolean
  switchingAccount: string | null
  onSwitchAccount: (account: string) => void
  onSignOut: () => void
  /** 演示入口（原型未实现的页面）统一 toast 提示 */
  onNotice: (title: string) => void
  /** 账号与安全（2026-09-18 第一期缺口批次：修改密码弹窗，App 层挂载） */
  onOpenAccountSecurity: () => void
  narrow: boolean
}

/**
 * 个人中心（顶栏用户菜单）：触发器 + 高保真下拉弹层。
 * 样式全部收敛在 UserMenu.css（um- 前缀），不影响其他板块。
 */
export function UserMenu({
  principal,
  identityTitle,
  dataScopeLabel,
  servingPharmaName,
  open,
  onToggle,
  canSwitchPharma,
  onSwitchPharma,
  onOpenRepMobileDemo,
  onOpenFullMobileDemo,
  fullMobileDemoActive,
  switchingAccount,
  onSwitchAccount,
  onSignOut,
  onNotice,
  onOpenAccountSecurity,
  narrow,
}: UserMenuProps) {
  // 切换角色卡片：按分组顺序展平，分组名进卡片（对齐设计稿），排除当前登录账号
  const cards: Array<{ hint: DemoAccountHint; groupLabel: string }> = []
  for (const group of DEMO_ACCOUNT_GROUPS) {
    for (const hint of DEMO_ACCOUNT_HINTS) {
      if (hint.group === group.key && hint.userId !== principal.userId) {
        cards.push({ hint, groupLabel: group.label })
      }
    }
  }

  return (
    <div className="um-root">
      <button
        type="button"
        className={`um-trigger${open ? " is-open" : ""}`}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`个人中心：${principal.name}`}
      >
        <span className="um-avatar um-avatar--trigger" aria-hidden>
          {principal.name.slice(0, 1)}
        </span>
        {!narrow && (
          <span className="um-trigger-text">
            <span className="um-trigger-name">
              {principal.name}
              <span className="um-trigger-account">{principal.account}</span>
            </span>
            <span className="um-trigger-role" title={identityTitle}>
              {identityTitle}
            </span>
          </span>
        )}
        <ChevronDown size={13} className={`um-trigger-caret${open ? " is-open" : ""}`} aria-hidden />
      </button>

      {open && (
        <div className="um-popover" role="menu" aria-label="个人中心菜单">
          {/* 身份摘要 + 快捷入口 */}
          <div className="um-head">
            <div className="um-head-row">
              <span className="um-avatar um-avatar--head" aria-hidden>
                {principal.name.slice(0, 1)}
              </span>
              <div className="um-head-main">
                <div className="um-head-line1">
                  <span className="um-head-name">{principal.name}</span>
                  <span className="um-head-account">{principal.account}</span>
                  <span className="um-badge-current">当前登录</span>
                </div>
                <div className="um-head-role">
                  <ShieldCheck size={12} aria-hidden />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {identityTitle}
                  </span>
                </div>
                <div className="um-head-scope">数据范围：{dataScopeLabel}</div>
                {servingPharmaName && (
                  <div className="um-head-pharma">当前服务药厂：{servingPharmaName}</div>
                )}
              </div>
            </div>
            <div className="um-quick">
              <button
                type="button"
                className="um-quick-btn"
                onClick={() => onNotice("个人资料设置为演示入口，原型未实现该页面（演示）")}
              >
                <UserCircle size={14} className="um-ic-brand" aria-hidden />
                <span>个人资料设置</span>
              </button>
              <button
                type="button"
                className="um-quick-btn"
                onClick={onOpenAccountSecurity}
              >
                <ShieldCheck size={14} className="um-ic-info" aria-hidden />
                <span>账号与安全</span>
              </button>
              {/* 切换企业入口已砍（2026-09-18 拍板）：跨企业=退出登录后用另一家企业编码重新登录；
                  多企业身份场景保留在登录链路（EnterpriseSwitchGate/网关代码沉睡可回滚） */}
              {canSwitchPharma && (
                <button
                  type="button"
                  className="um-quick-btn"
                  onClick={onSwitchPharma}
                  title={servingPharmaName ? `当前服务药厂：${servingPharmaName}` : undefined}
                >
                  <Building2 size={14} className="um-ic-brand" aria-hidden />
                  <span>切换服务药厂</span>
                </button>
              )}
            </div>
          </div>

          {/* 可滚动主体 */}
          <div className="um-body">
            <section className="um-section">
              <div className="um-section-label">演示场景</div>
              <button type="button" className="um-row" onClick={onOpenRepMobileDemo}>
                <span className="um-row-main">
                  <Smartphone size={15} className="um-row-ic" aria-hidden />
                  医药代表移动端
                </span>
                <ArrowUpRight size={13} className="um-row-arrow" aria-hidden />
              </button>
              <button
                type="button"
                className="um-row um-row--featured"
                onClick={onOpenFullMobileDemo}
              >
                <span className="um-row-main">
                  <TabletSmartphone size={15} className="um-row-ic" aria-hidden />
                  完整移动端
                </span>
                {fullMobileDemoActive && <span className="um-badge-live">体验中</span>}
              </button>
            </section>

            <section className="um-section">
              <div className="um-section-head">
                <span className="um-section-label">
                  <Repeat size={11} aria-hidden /> 切换角色
                </span>
                <span className="um-section-hint">回到工作台并重置演示</span>
              </div>
              <div className="um-cards">
                {cards.map(({ hint, groupLabel }) => (
                  <button
                    key={hint.userId}
                    type="button"
                    className="um-card"
                    disabled={switchingAccount !== null}
                    onClick={() => onSwitchAccount(hint.account)}
                    title={hint.scene}
                  >
                    <span className="um-card-group">{groupLabel}</span>
                    <span className="um-card-line">
                      <span className="um-card-name">
                        {hint.name}
                        <span className="um-card-account">{hint.account}</span>
                      </span>
                      {switchingAccount === hint.account ? (
                        <span className="um-card-switching">切换中…</span>
                      ) : (
                        <CheckCircle2 size={14} className="um-card-check" aria-hidden />
                      )}
                    </span>
                    <span className="um-card-role">
                      {hint.roleName} · {hint.orgName}
                    </span>
                    <span className="um-card-tags">
                      {hint.tags.map((tag, i) => (
                        <span key={tag} className={i === 0 ? "um-tag" : "um-tag um-tag--brand"}>
                          {tag}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="um-section">
              <div className="um-section-label">系统偏好</div>
              <div className="um-pref">
                <button
                  type="button"
                  className="um-pref-btn"
                  onClick={() => onNotice("通知偏好为演示入口，原型未实现该页面（演示）")}
                >
                  <Bell size={14} aria-hidden />
                  <span>通知偏好</span>
                </button>
                <button
                  type="button"
                  className="um-pref-btn"
                  onClick={() => onNotice("深色模式跟随系统设置，原型未提供切换（演示）")}
                >
                  <MoonStar size={14} aria-hidden />
                  <span>深色模式（跟随）</span>
                </button>
              </div>
            </section>
          </div>

          {/* 底部：登出 + 版本 */}
          <div className="um-foot">
            <button type="button" className="um-logout" onClick={onSignOut}>
              <LogOut size={14} aria-hidden />
              退出登录
            </button>
            <span className="um-version">Build v2.4.0-prod</span>
          </div>
        </div>
      )}
    </div>
  )
}

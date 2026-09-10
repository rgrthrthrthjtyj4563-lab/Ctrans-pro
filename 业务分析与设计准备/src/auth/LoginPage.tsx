/**
 * 多方式登录页（原型首期）：账号密码 / 短信验证码 / 扫码登录（企业微信 + 微信开放平台）。
 * 演示环境说明：认证由内存 Mock Gateway 模拟，不调用真实短信与 OAuth；
 * 登录态仅存在于当前页面，刷新即失效。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import {
  KeyRound,
  MessageSquareText,
  QrCode,
  Smartphone,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  ScanLine,
  Building2,
  ChevronDown,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react"
import { BrandMark } from "../components/Brand"
import { Button } from "../components/Button"
import { authGateway } from "./mockGateway"
import {
  DEMO_ACCOUNT_HINTS,
  DEMO_PASSWORD,
  QR_IDENTITIES,
} from "./authProfiles"
import type { LoginFailure, QrLoginState, QrSource } from "./authTypes"
import { useAuth } from "./AuthProvider"

const RESEND_SECONDS = 60
const QR_POLL_MS = 700

type MethodTab = "password" | "sms" | "qr"
type FieldKey = "account" | "password" | "phone" | "code" | "qr"

// ─── 演示二维码图形（确定性伪随机点阵，不可被真实扫描） ─────────────────────
function seededCells(seed: string, size = 25): boolean[][] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const rand = () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 1000) / 1000
  }
  const cells: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => rand() > 0.52),
  )
  const stampFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r += 1)
      for (let c = 0; c < 7; c += 1) {
        const border = r === 0 || r === 6 || c === 0 || c === 6
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
        cells[r0 + r][c0 + c] = border || core
      }
    for (let r = -1; r <= 7; r += 1)
      for (let c = -1; c <= 7; c += 1) {
        const rr = r0 + r
        const cc = c0 + c
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue
        if (r === -1 || r === 7 || c === -1 || c === 7) cells[rr][cc] = false
      }
  }
  stampFinder(0, 0)
  stampFinder(0, size - 7)
  stampFinder(size - 7, 0)
  return cells
}

function DemoQrGraphic({ seed, dimmed }: { seed: string; dimmed: boolean }) {
  const cells = useMemo(() => seededCells(seed), [seed])
  const n = cells.length
  const s = 260 / n
  return (
    <svg
      viewBox="0 0 260 260"
      width="100%"
      height="100%"
      style={{ display: "block", opacity: dimmed ? 0.25 : 1, transition: "opacity 200ms ease" }}
      role="img"
      aria-label="登录二维码（演示图形，无法被真实设备扫描）"
    >
      <rect width="260" height="260" fill="#FFFFFF" />
      {cells.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c * s} y={r * s} width={s} height={s} fill="#111827" /> : null,
        ),
      )}
    </svg>
  )
}

// ─── 样式常量（全部取 token，不新定义品牌色） ───────────────────────────────
const inputBase: CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  fontSize: "var(--fs-14)",
  color: "var(--color-text-1)",
  background: "#FFFFFF",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 8,
  outline: "none",
  transition: "border-color 120ms ease, box-shadow 120ms ease",
}
const inputErrorBorder: CSSProperties = { borderColor: "var(--color-danger-fg)" }
const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-13)",
  fontWeight: 600,
  color: "var(--color-text-1)",
  marginBottom: 6,
}
const fieldHelpStyle: CSSProperties = {
  fontSize: "var(--fs-12)",
  color: "var(--color-danger-fg)",
  marginTop: 6,
  display: "flex",
  alignItems: "center",
  gap: 4,
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export function LoginPage() {
  const { setSession } = useAuth()
  const [method, setMethod] = useState<MethodTab>("password")
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})

  // 密码登录
  const [account, setAccount] = useState("")
  const [password, setPassword] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const accountRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // 短信登录
  const [phone, setPhone] = useState("")
  const [codeDigits, setCodeDigits] = useState<string[]>(["", "", "", "", "", ""])
  const [smsDevCode, setSmsDevCode] = useState<string | null>(null)
  const [resendLeft, setResendLeft] = useState(0)
  const codeRefs = useRef<Array<HTMLInputElement | null>>([])

  const methodTabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const clearErrors = useCallback(() => {
    setFormError(null)
    setFieldErrors({})
  }, [])

  /** 失败信息定位到具体字段；无字段归属的全局失败走 aria-live 状态区 */
  const applyFailure = useCallback((failure: LoginFailure) => {
    setFormError(null)
    if (failure.field && failure.field !== "qr") {
      setFieldErrors({ [failure.field]: failure.message })
    } else {
      setFormError(failure.message)
    }
  }, [])

  // ─── 密码方式 ─────────────────────────────────────────────────────────────
  const submitPassword = useCallback(
    async (e?: { preventDefault: () => void }) => {
      e?.preventDefault()
      clearErrors()
      setBusy(true)
      const result = await authGateway.loginPassword({ account, password })
      setBusy(false)
      if (result.ok) {
        setSession(result.session)
        return
      }
      applyFailure(result.failure)
      if (result.failure.field === "account") accountRef.current?.focus()
      if (result.failure.field === "password") passwordRef.current?.focus()
    },
    [account, password, clearErrors, applyFailure, setSession],
  )

  // ─── 短信方式 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (resendLeft <= 0) return
    const t = window.setInterval(() => setResendLeft((v) => Math.max(0, v - 1)), 1000)
    return () => window.clearInterval(t)
  }, [resendLeft])

  const requestSmsCode = useCallback(async () => {
    clearErrors()
    setBusy(true)
    const result = await authGateway.requestSms({ phone })
    setBusy(false)
    if (!result.ok) {
      applyFailure(result.failure)
      return
    }
    setSmsDevCode(result.devCode)
    setResendLeft(RESEND_SECONDS)
    setCodeDigits(["", "", "", "", "", ""])
    window.setTimeout(() => codeRefs.current[0]?.focus(), 50)
  }, [phone, clearErrors, applyFailure])

  const submitSms = useCallback(async () => {
    const code = codeDigits.join("")
    if (code.length < 6) {
      setFieldErrors({ code: "请输入完整的 6 位验证码" })
      return
    }
    clearErrors()
    setBusy(true)
    const result = await authGateway.verifySms({ phone, code })
    setBusy(false)
    if (result.ok) {
      setSession(result.session)
      return
    }
    setFieldErrors({ [result.failure.field ?? "code"]: result.failure.message })
    if (
      result.failure.code === "sms-code-expired" ||
      result.failure.code === "sms-attempts-exceeded"
    ) {
      setSmsDevCode(null)
      setCodeDigits(["", "", "", "", "", ""])
    }
  }, [codeDigits, phone, clearErrors, setSession])

  const setCodeAt = (idx: number, ch: string) => {
    setCodeDigits((prev) => {
      const next = [...prev]
      next[idx] = ch
      return next
    })
  }

  const onCodeKeyDown = (idx: number) => (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !codeDigits[idx] && idx > 0) {
      codeRefs.current[idx - 1]?.focus()
      setCodeAt(idx - 1, "")
    }
  }

  const onCodePaste = (e: ReactClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (!text) return
    e.preventDefault()
    const next = ["", "", "", "", "", ""]
    for (let i = 0; i < text.length; i += 1) next[i] = text[i]
    setCodeDigits(next)
    codeRefs.current[Math.min(text.length, 5)]?.focus()
  }

  // ─── 扫码方式 ─────────────────────────────────────────────────────────────
  const [qrSource, setQrSource] = useState<QrSource>("wecom")
  const [qr, setQr] = useState<QrLoginState | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [identityId, setIdentityId] = useState(QR_IDENTITIES[0]?.id ?? "")
  const [qrHint, setQrHint] = useState<string>("")
  const qrBusy = useRef(false)

  const createQrTicket = useCallback(
    async (source: QrSource) => {
      qrBusy.current = true
      setQrError(null)
      setQrHint("")
      const result = await authGateway.createQr({ source })
      setQr(result.ok ? result.state : null)
      if (!result.ok) setQrError(result.failure.message)
      qrBusy.current = false
    },
    [],
  )

  useEffect(() => {
    void createQrTicket(qrSource)
  }, [qrSource, createQrTicket])

  // 轮询 + 倒计时共用一个定时器
  useEffect(() => {
    if (!qr) return
    let disposed = false
    let counter = 0
    const timer = window.setInterval(async () => {
      counter += 1
      setNow(Date.now())
      if (counter % 2 !== 0 || qrBusy.current) return
      const snap = await authGateway.pollQr(qr.ticket)
      if (disposed) return
      if (snap.result) {
        if (snap.result.ok) {
          setSession(snap.result.session)
        } else {
          setQrError(snap.result.failure.message)
          setQr(null)
          // 失败后重新生成一张等待中的二维码，便于连续演示
          window.setTimeout(() => void createQrTicket(qr.source), 900)
        }
        return
      }
      setQr(snap.state)
    }, QR_POLL_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [qr?.ticket, qr?.status === "expired", setSession, createQrTicket]) // eslint-disable-line react-hooks/exhaustive-deps

  const simulateScan = useCallback(
    async (unboundDemo = false) => {
      if (!qr || qr.status !== "waiting") return
      const id = unboundDemo
        ? QR_IDENTITIES.find((i) => i.source === qr.source && !i.userId)?.id ?? ""
        : identityId
      setQrHint("已扫描，请在手机上确认登录…")
      const result = await authGateway.simulateScan(qr.ticket, id)
      if (!result.ok) setQrError(result.failure.message)
    },
    [qr, identityId],
  )

  const qrRemaining = qr ? Math.max(0, Math.ceil((qr.expiresAt - now) / 1000)) : 0
  const expired = !qr || qr.status === "expired"
  const identities = QR_IDENTITIES.filter((i) => i.source === qrSource)

  // ─── 键盘可访问的 tab 切换 ────────────────────────────────────────────────
  const onTabKeyDown = (idx: number) => (e: ReactKeyboardEvent) => {
    const order: MethodTab[] = ["password", "sms", "qr"]
    let next = idx
    if (e.key === "ArrowRight") next = (idx + 1) % order.length
    else if (e.key === "ArrowLeft") next = (idx + order.length - 1) % order.length
    else return
    e.preventDefault()
    setMethod(order[next])
    clearErrors()
    methodTabRefs.current[next]?.focus()
  }

  const fillDemoAccount = (acc: string) => {
    setMethod("password")
    setAccount(acc)
    setPassword(DEMO_PASSWORD)
    clearErrors()
  }

  const [hintsOpen, setHintsOpen] = useState(false)

  return (
    <div className="login-shell">
      <style>{`
        .login-shell {
          min-height: 100%; display: grid; grid-template-columns: 1fr;
          background: var(--color-canvas);
        }
        @media (min-width: 900px) { .login-shell { grid-template-columns: 46fr 54fr; } }
        .login-brand { display: none; }
        @media (min-width: 900px) { .login-brand { display: flex; } }
        .login-input:focus-visible { border-color: var(--color-brand); box-shadow: 0 0 0 3px var(--color-brand-subtle); }
        .login-tab[aria-selected="true"] { color: var(--color-brand); background: var(--color-brand-subtle); }
        .login-mobile-brand { display: flex; align-items: center; gap: 10; padding: 16px 20px 0; }
        @media (min-width: 900px) { .login-mobile-brand { display: none; } }
      `}</style>

      {/* 左：品牌面板（≥900px） */}
      <section
        className="login-brand"
        aria-hidden="true"
        style={{
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 56px",
          background:
            "linear-gradient(160deg, var(--color-sidebar) 0%, #14261f 55%, var(--color-brand) 160%)",
          color: "#E5E7EB",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BrandMark size={40} />
          <div>
            <div style={{ fontSize: "var(--fs-18)", fontWeight: 800, color: "#F9FAFB" }}>药合作系统</div>
            <div style={{ fontSize: "var(--fs-12)", color: "var(--color-sidebar-accent)", letterSpacing: "0.08em" }}>
              AI 运营控制台 V3
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ margin: "0 0 16px", fontSize: "var(--fs-28)", fontWeight: 800, lineHeight: 1.4, color: "#F9FAFB" }}>
            一个入口，连接药厂、服务商与专员的合规推广协作
          </h1>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              "账号密码 / 短信验证码 / 企业微信与微信扫码，多种受控登录方式",
              "登录身份由「用户 + 生效授权角色」决定，菜单按真实权限渲染",
              "停用账号、过期与回收授权、未绑定扫码身份都会被明确阻断",
            ].map((line) => (
              <li key={line} style={{ display: "flex", gap: 10, fontSize: "var(--fs-14)", lineHeight: 1.7, color: "#D1D5DB" }}>
                <ShieldCheck size={16} style={{ color: "var(--color-sidebar-accent)", flexShrink: 0, marginTop: 3 }} />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ fontSize: "var(--fs-12)", color: "#6B7280", lineHeight: 1.8 }}>
          原型演示环境 · 纯前端模拟认证 · 不产生任何真实登录风险
        </div>
      </section>

      {/* 右：登录表单 */}
      <main
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 20px 48px",
          minWidth: 0,
        }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          {/* 窄屏品牌头 */}
          <div className="login-mobile-brand" style={{ gap: 10, display: "flex", alignItems: "center", marginBottom: 20 }}>
            <BrandMark size={36} />
            <div>
              <div style={{ fontSize: "var(--fs-16)", fontWeight: 800, color: "var(--color-text-1)" }}>药合作系统</div>
              <div style={{ fontSize: "var(--fs-11)", color: "var(--color-brand)" }}>AI 运营控制台 V3</div>
            </div>
          </div>

          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 14,
              boxShadow: "0 12px 32px rgba(16, 24, 40, 0.06)",
              padding: "24px 24px 20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: "var(--fs-20)", fontWeight: 700, color: "var(--color-text-1)" }}>
                欢迎登录
              </h2>
              <span
                style={{
                  fontSize: "var(--fs-11)",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "var(--color-warning-bg)",
                  color: "var(--color-warning-fg)",
                  border: "1px solid #FDE68A",
                }}
              >
                演示环境
              </span>
            </div>
            <p style={{ margin: "0 0 18px", fontSize: "var(--fs-13)", color: "var(--color-text-2)", lineHeight: 1.6 }}>
              登录身份与可进入的功能，由管理员在「用户与组织」中配置的生效授权决定。
            </p>

            {/* 方式切换 */}
            <div
              role="tablist"
              aria-label="登录方式"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 6,
                padding: 4,
                background: "#F3F4F6",
                borderRadius: 10,
                marginBottom: 18,
              }}
            >
              {(
                [
                  { key: "password", label: "账号密码", icon: KeyRound },
                  { key: "sms", label: "短信验证码", icon: MessageSquareText },
                  { key: "qr", label: "扫码登录", icon: QrCode },
                ] as const
              ).map((tab, idx) => (
                <button
                  key={tab.key}
                  ref={(el) => {
                    methodTabRefs.current[idx] = el
                  }}
                  type="button"
                  role="tab"
                  id={`login-tab-${tab.key}`}
                  aria-selected={method === tab.key}
                  aria-controls={`login-panel-${tab.key}`}
                  tabIndex={method === tab.key ? 0 : -1}
                  onKeyDown={onTabKeyDown(idx)}
                  onClick={() => {
                    setMethod(tab.key)
                    clearErrors()
                  }}
                  className="login-tab"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    height: 36,
                    fontSize: "var(--fs-13)",
                    fontWeight: method === tab.key ? 700 : 500,
                    color: method === tab.key ? "var(--color-brand)" : "var(--color-text-2)",
                    background: method === tab.key ? "#FFFFFF" : "transparent",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    boxShadow: method === tab.key ? "0 1px 3px rgba(16,24,40,0.1)" : "none",
                  }}
                >
                  <tab.icon size={14} aria-hidden />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 全局错误（字段级错误在各自下方展示） */}
            <div aria-live="polite" role="status">
              {formError && (
                <div style={{ ...fieldHelpStyle, marginBottom: 12 }}>
                  <TriangleAlert size={13} aria-hidden />
                  {formError}
                </div>
              )}
            </div>

            {/* ── 账号密码 ── */}
            {method === "password" && (
              <form
                role="tabpanel"
                id="login-panel-password"
                aria-labelledby="login-tab-password"
                onSubmit={submitPassword}
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                <div>
                  <label htmlFor="login-account" style={labelStyle}>
                    用户名或手机号
                  </label>
                  <input
                    id="login-account"
                    ref={accountRef}
                    className="login-input"
                    autoComplete="username"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.account)}
                    aria-describedby={fieldErrors.account ? "err-account" : undefined}
                    style={{ ...(fieldErrors.account ? inputErrorBorder : {}), ...inputBase }}
                    placeholder="如 lihang 或 13901350102"
                  />
                  {fieldErrors.account && (
                    <div id="err-account" style={fieldHelpStyle}>
                      <TriangleAlert size={13} aria-hidden />
                      {fieldErrors.account}
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="login-password" style={labelStyle}>
                    密码
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="login-password"
                      ref={passwordRef}
                      className="login-input"
                      autoComplete="current-password"
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? "err-password" : "pwd-hint"}
                      style={{ ...(fieldErrors.password ? inputErrorBorder : {}), ...inputBase, paddingRight: 44 }}
                      placeholder={`演示环境固定密码：${DEMO_PASSWORD}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      aria-label={showPwd ? "隐藏密码" : "显示密码"}
                      title={showPwd ? "隐藏密码" : "显示密码"}
                      className="login-input"
                      style={{
                        position: "absolute",
                        right: 6,
                        top: 6,
                        width: 28,
                        height: 28,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "none",
                        background: "transparent",
                        borderRadius: 6,
                        color: "var(--color-text-3)",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {fieldErrors.password ? (
                    <div id="err-password" style={fieldHelpStyle}>
                      <TriangleAlert size={13} aria-hidden />
                      {fieldErrors.password}
                    </div>
                  ) : (
                    <div id="pwd-hint" style={{ fontSize: "var(--fs-12)", color: "var(--color-text-3)", marginTop: 6 }}>
                      演示环境统一固定密码 <code className="font-mono-nums" style={{ fontWeight: 700, color: "var(--color-brand)" }}>{DEMO_PASSWORD}</code>
                    </div>
                  )}
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={busy}
                  style={{ width: "100%", marginTop: 4, justifyContent: "center" }}
                >
                  登 录
                </Button>
              </form>
            )}

            {/* ── 短信验证码 ── */}
            {method === "sms" && (
              <div
                role="tabpanel"
                id="login-panel-sms"
                aria-labelledby="login-tab-sms"
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                <div>
                  <label htmlFor="login-phone" style={labelStyle}>
                    已绑定手机号
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="login-phone"
                      className="login-input"
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={11}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={fieldErrors.phone ? "err-phone" : undefined}
                      style={{ ...(fieldErrors.phone ? inputErrorBorder : {}), ...inputBase, flex: 1 }}
                      placeholder="11 位手机号，如 13809120106"
                    />
                    <button
                      type="button"
                      onClick={requestSmsCode}
                      disabled={busy || resendLeft > 0 || phone.length !== 11}
                      className="login-input"
                      style={{
                        width: 118,
                        flexShrink: 0,
                        background: "var(--color-brand-subtle)",
                        color: "var(--color-brand)",
                        border: "1px solid var(--color-border-strong)",
                        fontWeight: 700,
                        fontSize: "var(--fs-13)",
                        cursor: resendLeft > 0 || phone.length !== 11 ? "not-allowed" : "pointer",
                        opacity: phone.length !== 11 ? 0.55 : 1,
                        whiteSpace: "nowrap",
                        padding: "0 8px",
                      }}
                    >
                      {resendLeft > 0 ? `重新发送 ${resendLeft}s` : "获取验证码"}
                    </button>
                  </div>
                  {fieldErrors.phone && (
                    <div id="err-phone" style={fieldHelpStyle}>
                      <TriangleAlert size={13} aria-hidden />
                      {fieldErrors.phone}
                    </div>
                  )}
                </div>
                <div>
                  <span style={labelStyle}>短信验证码</span>
                  <div role="group" aria-label="6 位短信验证码" aria-describedby={fieldErrors.code ? "err-code" : undefined} style={{ display: "flex", gap: 8 }}>
                    {codeDigits.map((d, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          codeRefs.current[idx] = el
                        }}
                        className="login-input font-mono-nums"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={1}
                        value={d}
                        disabled={!smsDevCode}
                        onChange={(e) => {
                          const ch = e.target.value.replace(/\D/g, "").slice(-1)
                          setCodeAt(idx, ch)
                          if (ch && idx < 5) codeRefs.current[idx + 1]?.focus()
                        }}
                        onKeyDown={onCodeKeyDown(idx)}
                        onPaste={onCodePaste}
                        style={{
                          ...(fieldErrors.code ? inputErrorBorder : {}),
                          ...inputBase,
                          width: 44,
                          textAlign: "center",
                          fontWeight: 700,
                          ...(smsDevCode ? {} : { background: "#F9FAFB", color: "var(--color-text-3)" }),
                        }}
                        aria-label={`验证码第 ${idx + 1} 位`}
                      />
                    ))}
                  </div>
                  {fieldErrors.code && (
                    <div id="err-code" style={fieldHelpStyle}>
                      <TriangleAlert size={13} aria-hidden />
                      {fieldErrors.code}
                    </div>
                  )}
                  {!smsDevCode && !fieldErrors.code && (
                    <div style={{ fontSize: "var(--fs-12)", color: "var(--color-text-3)", marginTop: 6 }}>
                      先输入手机号并获取验证码（演示环境不发送真实短信）
                    </div>
                  )}
                </div>
                {smsDevCode && (
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "var(--color-sidebar)",
                      color: "var(--color-sidebar-text)",
                      fontSize: "var(--fs-13)",
                      lineHeight: 1.6,
                    }}
                  >
                    <Smartphone size={16} style={{ marginTop: 2, flexShrink: 0, color: "var(--color-sidebar-accent)" }} aria-hidden />
                    <div>
                      <div style={{ fontSize: "var(--fs-11)", color: "#6B7280", marginBottom: 2 }}>模拟短信 · 5 分钟内有效</div>
                      【药合作】您的登录验证码是{" "}
                      <span className="font-mono-nums" style={{ fontWeight: 800, color: "var(--color-sidebar-accent)", letterSpacing: "0.12em" }}>
                        {smsDevCode}
                      </span>
                      ，请勿泄露。（演示环境直接回显，不发送真实短信）
                    </div>
                  </div>
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  loading={busy}
                  disabled={codeDigits.join("").length < 6}
                  onClick={submitSms}
                  style={{ width: "100%", marginTop: 4, justifyContent: "center" }}
                >
                  验证并登录
                </Button>
              </div>
            )}

            {/* ── 扫码登录 ── */}
            {method === "qr" && (
              <div role="tabpanel" id="login-panel-qr" aria-labelledby="login-tab-qr" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  role="group"
                  aria-label="扫码来源"
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 4, background: "#F3F4F6", borderRadius: 10 }}
                >
                  {(
                    [
                      { key: "wecom", label: "企业微信" },
                      { key: "wechat", label: "微信开放平台" },
                    ] as const
                  ).map((src) => (
                    <button
                      key={src.key}
                      type="button"
                      aria-pressed={qrSource === src.key}
                      onClick={() => {
                        setQrSource(src.key)
                        setIdentityId(QR_IDENTITIES.find((i) => i.source === src.key)?.id ?? "")
                        clearErrors()
                        setQrError(null)
                      }}
                      style={{
                        height: 34,
                        fontSize: "var(--fs-13)",
                        fontWeight: qrSource === src.key ? 700 : 500,
                        color: qrSource === src.key ? "var(--color-brand)" : "var(--color-text-2)",
                        background: qrSource === src.key ? "#FFFFFF" : "transparent",
                        border: "none",
                        borderRadius: 8,
                        cursor: "pointer",
                        boxShadow: qrSource === src.key ? "0 1px 3px rgba(16,24,40,0.1)" : "none",
                      }}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      position: "relative",
                      width: 236,
                      height: 236,
                      padding: 10,
                      background: "#FFFFFF",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                  >
                    {qr && !expired && <DemoQrGraphic seed={qr.ticket} dimmed={qr.status === "scanned"} />}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        borderRadius: 12,
                        background: expired ? "rgba(255,255,255,0.92)" : qr?.status === "scanned" ? "rgba(255,255,255,0.75)" : "transparent",
                        pointerEvents: expired ? "auto" : "none",
                        textAlign: "center",
                        padding: 12,
                      }}
                    >
                      {expired && (
                        <>
                          <RefreshCw size={26} style={{ color: "var(--color-brand)" }} aria-hidden />
                          <div style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--color-text-1)" }}>二维码已过期</div>
                          <Button
                            type="button"
                            variant="primary"
                            size="md"
                            icon={<RefreshCw size={14} />}
                            onClick={() => void createQrTicket(qrSource)}
                            style={{ width: "auto", height: 34 }}
                          >
                            刷新二维码
                          </Button>
                        </>
                      )}
                      {!expired && qr?.status === "scanned" && (
                        <>
                          <ScanLine size={26} style={{ color: "var(--color-success-fg)" }} aria-hidden />
                          <div style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--color-text-1)" }}>
                            {qrHint || "已扫描，请在手机上确认"}
                          </div>
                        </>
                      )}
                      {!expired && !qr && (
                        <LoaderCircle
                          size={22}
                          style={{ color: "var(--color-brand)", animation: "spin 0.8s linear infinite" }}
                          role="status"
                          aria-label="正在生成二维码"
                        />
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: "center", fontSize: "var(--fs-13)", color: "var(--color-text-2)", lineHeight: 1.7, maxWidth: 300 }}>
                    使用 <b style={{ color: "var(--color-text-1)" }}>{qrSource === "wecom" ? "企业微信「扫一扫」" : "微信「扫一扫」"}</b>
                    登录。
                    {!expired && qr && (
                      <span className="font-mono-nums" style={{ color: "var(--color-text-3)" }}>
                        {" "}
                        · 剩余 {Math.floor(qrRemaining / 60)}:{String(qrRemaining % 60).padStart(2, "0")}
                      </span>
                    )}
                    <div style={{ fontSize: "var(--fs-12)", color: "var(--color-text-3)", marginTop: 4 }}>
                      无法扫码？切换到上方「账号密码」或「短信验证码」登录
                    </div>
                  </div>

                  {qrError && (
                    <div
                      role="alert"
                      style={{
                        width: "100%",
                        ...fieldHelpStyle,
                        padding: "10px 12px",
                        background: "var(--color-danger-bg)",
                        border: "1px solid #FECACA",
                        borderRadius: 8,
                        marginTop: 0,
                      }}
                    >
                      <TriangleAlert size={13} aria-hidden />
                      <span>{qrError}</span>
                    </div>
                  )}

                  {/* 演示专用扫码模拟器 */}
                  <div
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px dashed var(--color-border-strong)",
                      borderRadius: 10,
                      background: "#FAFAFA",
                    }}
                  >
                    <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--color-warning-fg)", marginBottom: 8, letterSpacing: "0.05em" }}>
                      演示 · 扫码模拟器（真实产品由手机确认，无此区域）
                    </div>
                    <label htmlFor="qr-identity" style={{ display: "block", fontSize: "var(--fs-12)", color: "var(--color-text-2)", marginBottom: 4 }}>
                      模拟扫码身份
                    </label>
                    <select
                      id="qr-identity"
                      value={identityId}
                      onChange={(e) => setIdentityId(e.target.value)}
                      style={{ ...inputBase, height: 34, fontSize: "var(--fs-13)" }}
                    >
                      {identities.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.label}（{i.detail}）
                        </option>
                      ))}
                    </select>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        icon={<ScanLine size={14} />}
                        disabled={expired || qr?.status !== "waiting"}
                        onClick={() => void simulateScan(false)}
                        style={{ flex: 1, minWidth: 0, justifyContent: "center", height: 34 }}
                      >
                        模拟扫码并确认
                      </Button>
                      <Button
                        type="button"
                        variant="soft"
                        size="md"
                        disabled={expired || qr?.status !== "waiting"}
                        onClick={() => void simulateScan(true)}
                        style={{ flex: 1, minWidth: 0, justifyContent: "center", height: 34 }}
                      >
                        模拟未绑定身份
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 演示账号速查（与登录无关的演示辅助，不构成功能入口） */}
          <div
            style={{
              marginTop: 14,
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              background: "var(--color-surface)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setHintsOpen((v) => !v)}
              aria-expanded={hintsOpen}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: "var(--fs-13)",
                fontWeight: 600,
                color: "var(--color-text-1)",
                textAlign: "left",
              }}
            >
              <Building2 size={14} style={{ color: "var(--color-brand)" }} aria-hidden />
              可登录演示账号（点击展开 · 全部密码 {DEMO_PASSWORD}）
              <ChevronDown size={14} style={{ marginLeft: "auto", color: "var(--color-text-3)", transform: hintsOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }} aria-hidden />
            </button>
            {hintsOpen && (
              <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                {DEMO_ACCOUNT_HINTS.map((h) => (
                  <button
                    key={h.userId}
                    type="button"
                    onClick={() => fillDemoAccount(h.account)}
                    title={h.scene}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      padding: "8px 10px",
                      background: "#F9FAFB",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: "var(--fs-12)",
                      color: "var(--color-text-2)",
                      lineHeight: 1.5,
                    }}
                  >
                    <span className="font-mono-nums" style={{ fontWeight: 700, color: "var(--color-text-1)", flexShrink: 0 }}>
                      {h.account}
                    </span>
                    <span style={{ color: "var(--color-brand)", fontWeight: 600, flexShrink: 0 }}>{h.roleName}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.scene}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p style={{ textAlign: "center", fontSize: "var(--fs-11)", color: "var(--color-text-3)", marginTop: 16, lineHeight: 1.7 }}>
            原型演示：认证逻辑全部在浏览器内存中模拟，未接入真实账号体系与短信服务；
            <br />
            生产环境将由服务端完成校验并签发 HttpOnly Secure Cookie 会话。
          </p>
        </div>
      </main>
    </div>
  )
}

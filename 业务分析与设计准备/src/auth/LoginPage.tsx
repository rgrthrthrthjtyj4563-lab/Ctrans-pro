/**
 * 多方式登录页（原型首期）：账号密码 / 短信验证码 / 扫码登录（企业微信 + 微信开放平台）。
 * 演示环境说明：认证由内存 Mock Gateway 模拟，不调用真实短信与 OAuth；
 * 登录态仅存在于当前页面，刷新即失效。
 *
 * 视觉：2026-09-14 按新设计稿重绘（浅底流体渐变光斑 + 噪点 + 左品牌区 + 右玻璃拟态卡片），
 * 全部配色以 .login-shell 作用域内的 lg- 变量承载，不污染全局 token；
 * 认证逻辑（Mock 网关、字段级校验、扫码轮询与模拟器）与改造前一致。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  LoaderCircle,
  RefreshCw,
  ScanLine,
  Smartphone,
  TriangleAlert,
} from "lucide-react"
import { BrandMark } from "../components/Brand"
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
          on ? <rect key={`${r}-${c}`} x={c * s} y={r * s} width={s} height={s} fill="#1A2B42" /> : null,
        ),
      )}
    </svg>
  )
}

// ─── 作用域样式（仅登录页，lg- 前缀；登录页先于主题选择，固定品牌视觉） ──────
const LOGIN_CSS = `
  .login-shell {
    --lg-bg: #F4F7FB;
    --lg-text-1: #1A2B42;
    --lg-text-2: rgba(26,43,66,0.52);
    --lg-text-3: rgba(26,43,66,0.38);
    --lg-text-4: rgba(26,43,66,0.28);
    --lg-brand: #19C59A;
    --lg-brand-dim: #0D9B7A;
    --lg-input-border: rgba(195,212,232,0.8);

    position: relative;
    min-height: 100vh;
    background: var(--lg-bg);
    color: var(--lg-text-1);
    overflow-x: hidden;
  }
  .login-deco { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .lg-blob { position: absolute; border-radius: 50%; will-change: transform; }
  .lg-blob-a {
    width: 900px; height: 720px; bottom: -18%; left: -10%;
    background: radial-gradient(ellipse at center, rgba(185,214,255,0.72) 0%, rgba(185,214,255,0.18) 55%, transparent 75%);
    filter: blur(110px); animation: lgBlobA 22s ease-in-out infinite alternate;
  }
  .lg-blob-b {
    width: 1100px; height: 640px; bottom: -14%; left: 12%;
    background: radial-gradient(ellipse at center, rgba(186,234,226,0.62) 0%, rgba(186,234,226,0.14) 55%, transparent 75%);
    filter: blur(130px); animation: lgBlobB 18s ease-in-out infinite alternate;
  }
  .lg-blob-c {
    width: 680px; height: 600px; top: -12%; right: -6%;
    background: radial-gradient(ellipse at center, rgba(210,222,255,0.58) 0%, rgba(210,222,255,0.12) 55%, transparent 75%);
    filter: blur(100px); animation: lgBlobC 25s ease-in-out infinite alternate;
  }
  .lg-blob-d {
    width: 640px; height: 820px; top: 8%; left: -8%;
    background: radial-gradient(ellipse at center, rgba(200,220,248,0.48) 0%, rgba(200,220,248,0.1) 55%, transparent 75%);
    filter: blur(120px); animation: lgBlobD 20s ease-in-out infinite alternate;
  }
  @keyframes lgBlobA { from { transform: translate(0,0) scale(1); } to { transform: translate(55px,-45px) scale(1.05); } }
  @keyframes lgBlobB { from { transform: translate(0,0) scale(1.02); } to { transform: translate(-45px,-50px) scale(1); } }
  @keyframes lgBlobC { from { transform: translate(0,0) scale(1); } to { transform: translate(-40px,48px) scale(1.04); } }
  @keyframes lgBlobD { from { transform: translate(0,0) scale(1.03); } to { transform: translate(32px,-42px) scale(1); } }
  .lg-noise { position: absolute; inset: 0; opacity: 0.025; filter: url(#lg-grain); background: #7A8FA8; }
  .lg-vignette { position: absolute; inset: 0; background: linear-gradient(to left, rgba(244,247,251,0.55) 0%, transparent 55%); }

  .login-layout { position: relative; z-index: 1; display: flex; align-items: stretch; min-height: 100vh; }
  .login-brand { display: none; }
  .login-main { width: 100%; display: flex; align-items: center; justify-content: center; padding: 24px 20px 48px; min-width: 0; }
  .login-mobile-brand { display: flex; align-items: center; gap: 10px; padding: 16px 4px 0; }
  .login-card-wrap { width: 100%; max-width: 420px; margin: 0 auto; }
  @media (min-width: 900px) {
    .login-brand {
      flex: 1; display: flex; flex-direction: column; justify-content: space-between;
      padding: clamp(32px, 5vw, 64px); min-width: 0;
    }
    .login-main { width: clamp(380px, 32vw, 480px); flex-shrink: 0; padding: 24px clamp(24px, 4vw, 56px) 24px 24px; }
    .login-mobile-brand { display: none; }
    .login-card-wrap { max-width: none; }
  }

  .lg-field {
    width: 100%; height: 50px; padding: 0 14px;
    background: rgba(255,255,255,0.95);
    border: 1px solid var(--lg-input-border);
    border-radius: 10px;
    color: var(--lg-text-1); font-size: 14px; font-family: inherit;
    outline: none; transition: border-color 200ms ease, box-shadow 200ms ease;
  }
  .lg-field::placeholder { color: rgba(26,43,66,0.3); }
  .lg-field:focus { border-color: var(--lg-brand); box-shadow: 0 0 0 3px rgba(25,197,154,0.12), 0 1px 3px rgba(0,0,0,0.06); }
  .lg-field[aria-invalid="true"] { border-color: #DC2626; }
  .lg-field[aria-invalid="true"]:focus { box-shadow: 0 0 0 3px rgba(220,38,38,0.1); }
  .lg-label { display: block; font-size: 12px; font-weight: 500; color: rgba(26,43,66,0.5); margin-bottom: 7px; letter-spacing: 0.02em; }
  .lg-error-pill {
    padding: 10px 13px; background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.2);
    border-radius: 9px; color: #C83232; font-size: 13px;
    display: flex; align-items: center; gap: 8px; line-height: 1.5;
  }
  .lg-error-pill svg { flex-shrink: 0; }

  .lg-tab {
    flex: 1; background: none; border: none; padding: 0 0 12px; cursor: pointer;
    font-size: 13px; font-family: inherit; letter-spacing: 0.01em;
    color: rgba(26,43,66,0.42); position: relative; transition: color 200ms ease;
  }
  .lg-tab[aria-selected="true"] { color: var(--lg-brand); font-weight: 500; }
  .lg-tab::after {
    content: ""; position: absolute; bottom: -1px; left: 20%; right: 20%;
    height: 2px; border-radius: 2px; background: var(--lg-brand);
    box-shadow: 0 0 6px rgba(25,197,154,0.45);
    transform: scaleX(0); transform-origin: center; transition: transform 200ms ease;
  }
  .lg-tab[aria-selected="true"]::after { transform: scaleX(1); }

  .lg-panel { animation: lgPanelIn 210ms ease; }
  @keyframes lgPanelIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  .lg-submit {
    width: 100%; height: 50px; border-radius: 11px; border: none; cursor: pointer;
    color: #FFFFFF; font-size: 15px; font-weight: 500; letter-spacing: 0.01em; font-family: inherit;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    background: linear-gradient(135deg, #0E8F76 0%, #13A98D 50%, #19C59A 100%);
    transition: transform 150ms ease, box-shadow 150ms ease, filter 150ms ease;
  }
  .lg-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(25,197,154,0.3), 0 4px 10px rgba(25,197,154,0.18); filter: brightness(1.05); }
  .lg-submit:active:not(:disabled) { transform: scale(0.985) translateY(0); box-shadow: none; }
  .lg-submit:disabled { cursor: not-allowed; opacity: 0.75; }

  .lg-btn-solid {
    height: 34px; padding: 0 14px; border-radius: 9px; border: none; cursor: pointer;
    color: #FFFFFF; font-size: 13px; font-weight: 500; font-family: inherit;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    background: linear-gradient(135deg, #0E8F76 0%, #13A98D 50%, #19C59A 100%);
    transition: filter 150ms ease, opacity 150ms ease;
  }
  .lg-btn-solid:hover:not(:disabled) { filter: brightness(1.05); }
  .lg-btn-solid:disabled { cursor: not-allowed; opacity: 0.55; }
  .lg-btn-soft {
    height: 34px; padding: 0 14px; border-radius: 9px; cursor: pointer;
    border: 1px solid rgba(25,197,154,0.3); background: rgba(25,197,154,0.06);
    color: var(--lg-brand-dim); font-size: 13px; font-weight: 500; font-family: inherit;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    transition: background 150ms ease, opacity 150ms ease;
  }
  .lg-btn-soft:hover:not(:disabled) { background: rgba(25,197,154,0.12); }
  .lg-btn-soft:disabled { cursor: not-allowed; opacity: 0.55; }

  .lg-seg {
    display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 4px;
    background: rgba(26,43,66,0.04); border-radius: 10px;
  }
  .lg-seg-btn {
    height: 32px; font-size: 13px; font-family: inherit; cursor: pointer;
    border: none; border-radius: 8px; background: transparent;
    color: rgba(26,43,66,0.45); font-weight: 500; transition: all 150ms ease;
  }
  .lg-seg-btn[aria-pressed="true"] { background: #FFFFFF; color: var(--lg-brand-dim); box-shadow: 0 1px 3px rgba(26,43,66,0.1); }

  .lg-qr-card {
    position: relative; background: #FFFFFF; border-radius: 14px; padding: 12px;
    overflow: hidden; box-shadow: 0 2px 16px rgba(26,43,66,0.08);
    animation: lgQrPulse 3s ease-in-out infinite;
  }
  .lg-scanline {
    position: absolute; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, rgba(25,197,154,0.85), transparent);
    animation: lgScan 2.5s ease-in-out infinite;
  }
  .lg-qr-corner { position: absolute; width: 20px; height: 20px; border-color: var(--lg-brand); border-style: solid; }
  @keyframes lgQrPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(25,197,154,0); } 50% { box-shadow: 0 0 0 8px rgba(25,197,154,0.07); } }
  @keyframes lgScan { 0% { top: 8%; opacity: 0.8; } 50% { opacity: 0.4; } 100% { top: 88%; opacity: 0.8; } }

  .lg-dot {
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    background: var(--lg-brand); animation: lgBreathe 2.4s ease-in-out infinite; flex-shrink: 0;
  }
  @keyframes lgBreathe { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.65); } }

  @keyframes lgFadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes lgFadeInBlur { from { opacity: 0; filter: blur(5px); transform: translateY(8px); } to { opacity: 1; filter: blur(0); transform: translateY(0); } }
  .lg-anim-0 { animation: lgFadeInUp 0.55s 0.06s both cubic-bezier(0.16,1,0.3,1); }
  .lg-anim-1 { animation: lgFadeInUp 0.6s 0.14s both cubic-bezier(0.16,1,0.3,1); }
  .lg-anim-2 { animation: lgFadeInUp 0.6s 0.22s both cubic-bezier(0.16,1,0.3,1); }
  .lg-anim-3 { animation: lgFadeInUp 0.6s 0.3s both cubic-bezier(0.16,1,0.3,1); }
  .lg-anim-4 { animation: lgFadeInUp 0.55s 0.38s both cubic-bezier(0.16,1,0.3,1); }
  .lg-anim-card { animation: lgFadeInBlur 0.7s 0.2s both cubic-bezier(0.16,1,0.3,1); }

  .lg-demo-row {
    width: 100%; background: none; cursor: pointer; padding: 10px 14px;
    display: flex; align-items: center; justify-content: space-between;
    border: none; border-bottom: 1px solid rgba(200,215,235,0.3);
    font-family: inherit; text-align: left; transition: background 150ms ease;
  }
  .lg-demo-row:last-child { border-bottom: none; }
  .lg-demo-row:hover { background: rgba(25,197,154,0.05); }
  .lg-copy-btn {
    background: none; border: none; cursor: pointer; color: rgba(26,43,66,0.3);
    padding: 2px; display: flex; transition: color 150ms ease;
  }
  .lg-copy-btn:hover { color: var(--lg-brand); }

  .login-shell :focus-visible { outline: 2px solid rgba(25,197,154,0.65); outline-offset: 2px; }

  @media (prefers-reduced-motion: reduce) {
    .lg-blob, .lg-scanline, .lg-qr-card, .lg-dot,
    .lg-anim-0, .lg-anim-1, .lg-anim-2, .lg-anim-3, .lg-anim-4, .lg-anim-card, .lg-panel { animation: none !important; }
  }
`

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

  // 演示账号速查复制反馈（纯 UI）
  const [hintsOpen, setHintsOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

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

  const copyText = useCallback((text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(key)
    window.setTimeout(() => setCopied((v) => (v === key ? null : v)), 1600)
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

  const tabDefs = [
    { key: "password" as const, label: "账号登录" },
    { key: "sms" as const, label: "短信验证" },
    { key: "qr" as const, label: "扫码登录" },
  ]

  return (
    <div className="login-shell">
      <style>{LOGIN_CSS}</style>

      {/* 噪点滤镜定义（隐藏 SVG） */}
      <svg style={{ display: "none" }} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id="lg-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>

      {/* ── 背景装饰层：流体渐变光斑 + 噪点 + 右侧提亮渐晕 ── */}
      <div className="login-deco" aria-hidden="true">
        <div className="lg-blob lg-blob-a" />
        <div className="lg-blob lg-blob-b" />
        <div className="lg-blob lg-blob-c" />
        <div className="lg-blob lg-blob-d" />
        <div className="lg-noise" />
        <div className="lg-vignette" />
      </div>

      <div className="login-layout">
        {/* ── 左：品牌区（≥900px） ── */}
        <section className="login-brand" aria-hidden="true">
          <div className="lg-anim-0" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BrandMark size={40} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2, color: "#1A2B42" }}>
                药合作
              </div>
              <div style={{ fontSize: 11, color: "rgba(26,43,66,0.38)", letterSpacing: "0.04em", marginTop: 2 }}>
                营销协同管理系统
              </div>
            </div>
          </div>

          <div style={{ maxWidth: 480 }}>
            <h1
              className="lg-anim-1"
              style={{
                margin: "0 0 20px",
                fontSize: "clamp(32px, 3.2vw, 44px)",
                fontWeight: 600,
                color: "#1A2B42",
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
              }}
            >
              让医药协作，
              <br />
              更智能。
            </h1>
            <p
              className="lg-anim-2"
              style={{ margin: "0 0 28px", fontSize: 15, color: "rgba(26,43,66,0.52)", lineHeight: 1.75, fontWeight: 400 }}
            >
              连接药企、服务商与专业人员，
              <br />
              让任务、执行、结算与数据洞察高效协同。
            </p>
            <div className="lg-anim-3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="lg-dot" />
              <span style={{ color: "rgba(26,43,66,0.35)", fontSize: 12, letterSpacing: "0.06em" }}>
                AI powered collaboration workspace
              </span>
            </div>
          </div>

          <div className="lg-anim-4" style={{ color: "rgba(26,43,66,0.28)", fontSize: 12, letterSpacing: "0.02em" }}>
            原型演示环境 · 纯前端模拟认证 · 不产生任何真实登录风险
          </div>
        </section>

        {/* ── 右：登录卡片 ── */}
        <main className="login-main">
          <div className="login-card-wrap">
            {/* 窄屏品牌头 */}
            <div className="login-mobile-brand" style={{ marginBottom: 20 }}>
              <BrandMark size={36} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#1A2B42", lineHeight: 1.2 }}>药合作</div>
                <div style={{ fontSize: 11, color: "var(--lg-brand-dim)", letterSpacing: "0.04em", marginTop: 2 }}>
                  营销协同管理系统
                </div>
              </div>
            </div>

            <div
              className="lg-anim-card"
              style={{
                background: "rgba(255,255,255,0.82)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(200,215,235,0.65)",
                borderRadius: 22,
                padding: "32px 32px 28px",
                boxShadow:
                  "0 2px 4px rgba(26,43,66,0.03), 0 12px 40px rgba(26,43,66,0.07), 0 40px 80px rgba(26,43,66,0.04)",
              }}
            >
              {/* 卡片头 */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: "#1A2B42", letterSpacing: "-0.02em" }}>
                    欢迎回来
                  </h2>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "rgba(26,43,66,0.45)", lineHeight: 1.5 }}>
                    登录药合作，继续你的工作
                  </p>
                </div>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    background: "rgba(25,197,154,0.07)",
                    border: "1px solid rgba(25,197,154,0.2)",
                    borderRadius: 6, padding: "4px 8px",
                    flexShrink: 0, marginTop: 2,
                  }}
                >
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#19C59A", boxShadow: "0 0 4px rgba(25,197,154,0.5)" }} />
                  <span style={{ color: "#0D9B7A", fontSize: 10, fontWeight: 500, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                    Demo Env
                  </span>
                </div>
              </div>

              {/* 方式切换（下划线页签） */}
              <div
                role="tablist"
                aria-label="登录方式"
                style={{ display: "flex", borderBottom: "1px solid rgba(200,215,235,0.55)", marginBottom: 24 }}
              >
                {tabDefs.map((tab, idx) => (
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
                    className="lg-tab"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 全局错误（字段级错误在各自下方展示） */}
              <div aria-live="polite" role="status">
                {formError && (
                  <div className="lg-error-pill" style={{ marginBottom: 14 }}>
                    <TriangleAlert size={14} aria-hidden />
                    {formError}
                  </div>
                )}
              </div>

              {/* ── 账号密码 ── */}
              {method === "password" && (
                <form
                  key="password"
                  role="tabpanel"
                  id="login-panel-password"
                  aria-labelledby="login-tab-password"
                  onSubmit={submitPassword}
                  className="lg-panel"
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <div>
                    <label htmlFor="login-account" className="lg-label">
                      用户名或手机号
                    </label>
                    <input
                      id="login-account"
                      ref={accountRef}
                      className="lg-field"
                      autoComplete="username"
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      aria-invalid={Boolean(fieldErrors.account)}
                      aria-describedby={fieldErrors.account ? "err-account" : undefined}
                      placeholder="请输入用户名或手机号"
                    />
                    {fieldErrors.account && (
                      <div id="err-account" className="lg-error-pill" style={{ marginTop: 8 }}>
                        <TriangleAlert size={14} aria-hidden />
                        {fieldErrors.account}
                      </div>
                    )}
                  </div>
                  <div>
                    <label htmlFor="login-password" className="lg-label">
                      密码
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="login-password"
                        ref={passwordRef}
                        className="lg-field"
                        autoComplete="current-password"
                        type={showPwd ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.password)}
                        aria-describedby={fieldErrors.password ? "err-password" : "pwd-hint"}
                        style={{ paddingRight: 44 }}
                        placeholder="请输入密码"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        aria-label={showPwd ? "隐藏密码" : "显示密码"}
                        title={showPwd ? "隐藏密码" : "显示密码"}
                        style={{
                          position: "absolute",
                          right: 13,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "rgba(26,43,66,0.32)",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          transition: "color 150ms ease",
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "rgba(26,43,66,0.65)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "rgba(26,43,66,0.32)")}
                      >
                        {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {fieldErrors.password ? (
                      <div id="err-password" className="lg-error-pill" style={{ marginTop: 8 }}>
                        <TriangleAlert size={14} aria-hidden />
                        {fieldErrors.password}
                      </div>
                    ) : (
                      <div id="pwd-hint" style={{ fontSize: 12, color: "rgba(26,43,66,0.35)", marginTop: 7 }}>
                        演示环境统一固定密码{" "}
                        <code className="font-mono-nums" style={{ fontWeight: 700, color: "#0D9B7A" }}>
                          {DEMO_PASSWORD}
                        </code>
                      </div>
                    )}
                  </div>
                  <button type="submit" className="lg-submit" disabled={busy} style={{ marginTop: 8 }}>
                    {busy ? (
                      <>
                        <LoaderCircle size={18} style={{ animation: "spin 0.7s linear infinite" }} aria-hidden />
                        <span>正在登录…</span>
                      </>
                    ) : (
                      <span>登录</span>
                    )}
                  </button>
                </form>
              )}

              {/* ── 短信验证码 ── */}
              {method === "sms" && (
                <div
                  key="sms"
                  role="tabpanel"
                  id="login-panel-sms"
                  aria-labelledby="login-tab-sms"
                  className="lg-panel"
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <div>
                    <label htmlFor="login-phone" className="lg-label">
                      已绑定手机号
                    </label>
                    <div style={{ display: "flex", gap: 10 }}>
                      <input
                        id="login-phone"
                        className="lg-field"
                        inputMode="numeric"
                        autoComplete="tel"
                        maxLength={11}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                        aria-invalid={Boolean(fieldErrors.phone)}
                        aria-describedby={fieldErrors.phone ? "err-phone" : undefined}
                        style={{ flex: 1, minWidth: 0 }}
                        placeholder="11 位手机号，如 13809120106"
                      />
                      <button
                        type="button"
                        onClick={requestSmsCode}
                        disabled={busy || resendLeft > 0 || phone.length !== 11}
                        style={{
                          flexShrink: 0,
                          height: 50,
                          padding: "0 16px",
                          borderRadius: 10,
                          border: "1px solid rgba(25,197,154,0.3)",
                          background: "rgba(25,197,154,0.06)",
                          color: resendLeft > 0 ? "rgba(26,43,66,0.3)" : "#0D9B7A",
                          fontSize: 13,
                          fontWeight: 500,
                          fontFamily: "inherit",
                          cursor: busy || resendLeft > 0 || phone.length !== 11 ? "not-allowed" : "pointer",
                          transition: "background 150ms, color 150ms",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {resendLeft > 0 ? `重新发送 ${resendLeft}s` : "发送验证码"}
                      </button>
                    </div>
                    {fieldErrors.phone && (
                      <div id="err-phone" className="lg-error-pill" style={{ marginTop: 8 }}>
                        <TriangleAlert size={14} aria-hidden />
                        {fieldErrors.phone}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="lg-label" style={{ marginBottom: 7 }}>
                      短信验证码
                    </span>
                    <div role="group" aria-label="6 位短信验证码" aria-describedby={fieldErrors.code ? "err-code" : undefined} style={{ display: "flex", gap: 8 }}>
                      {codeDigits.map((d, idx) => (
                        <input
                          key={idx}
                          ref={(el) => {
                            codeRefs.current[idx] = el
                          }}
                          className="lg-field font-mono-nums"
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
                            width: 48,
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 17,
                            ...(smsDevCode ? {} : { background: "rgba(26,43,66,0.03)", color: "rgba(26,43,66,0.3)" }),
                          }}
                          aria-label={`验证码第 ${idx + 1} 位`}
                        />
                      ))}
                    </div>
                    {fieldErrors.code && (
                      <div id="err-code" className="lg-error-pill" style={{ marginTop: 8 }}>
                        <TriangleAlert size={14} aria-hidden />
                        {fieldErrors.code}
                      </div>
                    )}
                    {!smsDevCode && !fieldErrors.code && (
                      <div style={{ fontSize: 12, color: "rgba(26,43,66,0.35)", marginTop: 7 }}>
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
                        padding: "10px 13px",
                        borderRadius: 12,
                        background: "rgba(25,197,154,0.05)",
                        border: "1px solid rgba(25,197,154,0.18)",
                        color: "rgba(26,43,66,0.72)",
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                    >
                      <Smartphone size={16} style={{ marginTop: 2, flexShrink: 0, color: "#0D9B7A" }} aria-hidden />
                      <div>
                        <div style={{ fontSize: 11, color: "rgba(26,43,66,0.38)", marginBottom: 2 }}>模拟短信 · 5 分钟内有效</div>
                        【药合作】您的登录验证码是{" "}
                        <span className="font-mono-nums" style={{ fontWeight: 800, color: "#0D9B7A", letterSpacing: "0.12em" }}>
                          {smsDevCode}
                        </span>
                        ，请勿泄露。（演示环境直接回显，不发送真实短信）
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="lg-submit"
                    disabled={busy || codeDigits.join("").length < 6}
                    onClick={() => void submitSms()}
                    style={{ marginTop: 8 }}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle size={18} style={{ animation: "spin 0.7s linear infinite" }} aria-hidden />
                        <span>正在验证…</span>
                      </>
                    ) : (
                      <span>验证并登录</span>
                    )}
                  </button>
                </div>
              )}

              {/* ── 扫码登录 ── */}
              {method === "qr" && (
                <div
                  key="qr"
                  role="tabpanel"
                  id="login-panel-qr"
                  aria-labelledby="login-tab-qr"
                  className="lg-panel"
                  style={{ display: "flex", flexDirection: "column", gap: 16 }}
                >
                  <div className="lg-seg" role="group" aria-label="扫码来源">
                    {(
                      [
                        { key: "wecom", label: "企业微信" },
                        { key: "wechat", label: "微信开放平台" },
                      ] as const
                    ).map((src) => (
                      <button
                        key={src.key}
                        type="button"
                        className="lg-seg-btn"
                        aria-pressed={qrSource === src.key}
                        onClick={() => {
                          setQrSource(src.key)
                          setIdentityId(QR_IDENTITIES.find((i) => i.source === src.key)?.id ?? "")
                          clearErrors()
                          setQrError(null)
                        }}
                      >
                        {src.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                    <div style={{ position: "relative" }}>
                      <div className="lg-qr-card" style={{ width: 200, height: 200 }}>
                        {qr && !expired && <DemoQrGraphic seed={qr.ticket} dimmed={qr.status === "scanned"} />}
                        {!expired && qr?.status === "waiting" && <div className="lg-scanline" />}
                      </div>
                      <div className="lg-qr-corner" style={{ top: -2, left: -2, borderWidth: "2px 0 0 2px", borderRadius: "4px 0 0 0" }} aria-hidden />
                      <div className="lg-qr-corner" style={{ top: -2, right: -2, borderWidth: "2px 2px 0 0", borderRadius: "0 4px 0 0" }} aria-hidden />
                      <div className="lg-qr-corner" style={{ bottom: -2, left: -2, borderWidth: "0 0 2px 2px", borderRadius: "0 0 0 4px" }} aria-hidden />
                      <div className="lg-qr-corner" style={{ bottom: -2, right: -2, borderWidth: "0 2px 2px 0", borderRadius: "0 0 4px 0" }} aria-hidden />

                      {/* 过期 / 已扫描覆盖层 */}
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          borderRadius: 14,
                          background: expired ? "rgba(255,255,255,0.92)" : qr?.status === "scanned" ? "rgba(255,255,255,0.72)" : "transparent",
                          pointerEvents: expired ? "auto" : "none",
                          textAlign: "center",
                          padding: 12,
                        }}
                      >
                        {expired && (
                          <>
                            <RefreshCw size={26} style={{ color: "#0D9B7A" }} aria-hidden />
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A2B42" }}>二维码已过期</div>
                            <button type="button" className="lg-btn-solid" onClick={() => void createQrTicket(qrSource)}>
                              <RefreshCw size={14} aria-hidden />
                              刷新二维码
                            </button>
                          </>
                        )}
                        {!expired && qr?.status === "scanned" && (
                          <>
                            <ScanLine size={26} style={{ color: "#12B886" }} aria-hidden />
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A2B42" }}>
                              {qrHint || "已扫描，请在手机上确认"}
                            </div>
                          </>
                        )}
                        {!expired && !qr && (
                          <LoaderCircle
                            size={22}
                            style={{ color: "#0D9B7A", animation: "spin 0.8s linear infinite" }}
                            role="status"
                            aria-label="正在生成二维码"
                          />
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: "center", fontSize: 13, color: "rgba(26,43,66,0.52)", lineHeight: 1.7, maxWidth: 300 }}>
                      使用 <b style={{ color: "#1A2B42" }}>{qrSource === "wecom" ? "企业微信「扫一扫」" : "微信「扫一扫」"}</b>
                      登录。
                      {!expired && qr && (
                        <span className="font-mono-nums" style={{ color: "rgba(26,43,66,0.38)" }}>
                          {" "}
                          · 剩余 {Math.floor(qrRemaining / 60)}:{String(qrRemaining % 60).padStart(2, "0")}
                        </span>
                      )}
                      <div style={{ fontSize: 12, color: "rgba(26,43,66,0.38)", marginTop: 4 }}>
                        无法扫码？切换到上方「账号登录」或「短信验证」登录
                      </div>
                    </div>

                    {qrError && (
                      <div role="alert" className="lg-error-pill" style={{ width: "100%" }}>
                        <TriangleAlert size={14} aria-hidden />
                        <span>{qrError}</span>
                      </div>
                    )}

                    {/* 演示专用扫码模拟器 */}
                    <div
                      style={{
                        width: "100%",
                        padding: 12,
                        border: "1px dashed rgba(26,43,66,0.18)",
                        borderRadius: 12,
                        background: "rgba(26,43,66,0.02)",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-warning-fg)", marginBottom: 8, letterSpacing: "0.05em" }}>
                        演示 · 扫码模拟器（真实产品由手机确认，无此区域）
                      </div>
                      <label htmlFor="qr-identity" className="lg-label" style={{ marginBottom: 4 }}>
                        模拟扫码身份
                      </label>
                      <select
                        id="qr-identity"
                        value={identityId}
                        onChange={(e) => setIdentityId(e.target.value)}
                        className="lg-field"
                        style={{ height: 38, fontSize: 13 }}
                      >
                        {identities.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.label}（{i.detail}）
                          </option>
                        ))}
                      </select>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          className="lg-btn-solid"
                          disabled={expired || qr?.status !== "waiting"}
                          onClick={() => void simulateScan(false)}
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          <ScanLine size={14} aria-hidden />
                          模拟扫码并确认
                        </button>
                        <button
                          type="button"
                          className="lg-btn-soft"
                          disabled={expired || qr?.status !== "waiting"}
                          onClick={() => void simulateScan(true)}
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          模拟未绑定身份
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 演示账号速查（与登录无关的演示辅助，不构成功能入口） ── */}
              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setHintsOpen((v) => !v)}
                  aria-expanded={hintsOpen}
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px 0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    color: "rgba(26,43,66,0.38)",
                    fontSize: 12,
                    fontFamily: "inherit",
                    transition: "color 150ms",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#19C59A")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "rgba(26,43,66,0.38)")}
                >
                  <span>体验演示账号</span>
                  <ChevronDown
                    size={12}
                    aria-hidden
                    style={{ transform: hintsOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms ease" }}
                  />
                </button>

                <div
                  style={{
                    maxHeight: hintsOpen ? 320 : 0,
                    overflow: "hidden",
                    transition: "max-height 200ms cubic-bezier(0.4,0,0.2,1)",
                  }}
                >
                  <div
                    style={{
                      marginTop: 8,
                      background: "rgba(25,197,154,0.04)",
                      border: "1px solid rgba(25,197,154,0.14)",
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    {/* 统一密码行 */}
                    <div
                      style={{
                        padding: "10px 14px",
                        borderBottom: "1px solid rgba(200,215,235,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontSize: 11, color: "rgba(26,43,66,0.38)", letterSpacing: "0.03em" }}>统一演示密码</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <code className="font-mono-nums" style={{ fontSize: 12, color: "#0D9B7A", letterSpacing: "0.08em" }}>
                          {DEMO_PASSWORD}
                        </code>
                        <button
                          type="button"
                          className="lg-copy-btn"
                          aria-label="复制演示密码"
                          title="复制演示密码"
                          onClick={() => copyText(DEMO_PASSWORD, "pwd")}
                        >
                          {copied === "pwd" ? <Check size={14} style={{ color: "#19C59A" }} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* 账号行 */}
                    <div style={{ maxHeight: 236, overflowY: "auto" }}>
                      {DEMO_ACCOUNT_HINTS.map((h) => (
                        <button
                          key={h.userId}
                          type="button"
                          className="lg-demo-row"
                          onClick={() => fillDemoAccount(h.account)}
                        >
                          <div style={{ textAlign: "left", minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: "#2C4060", fontWeight: 500 }}>
                              {h.name} · {h.roleName}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "rgba(26,43,66,0.42)",
                                marginTop: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={h.scene}
                            >
                              {h.scene}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <code className="font-mono-nums" style={{ fontSize: 11, color: "#0D9B7A", letterSpacing: "0.05em" }}>
                              {h.account}
                            </code>
                            <button
                              type="button"
                              className="lg-copy-btn"
                              aria-label={`复制账号 ${h.account}`}
                              title={`复制账号 ${h.account}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                copyText(h.account, `user-${h.userId}`)
                              }}
                            >
                              {copied === `user-${h.userId}` ? <Check size={14} style={{ color: "#19C59A" }} /> : <Copy size={14} />}
                            </button>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p style={{ textAlign: "center", fontSize: 11, color: "rgba(26,43,66,0.3)", marginTop: 16, lineHeight: 1.7 }}>
              原型演示：认证逻辑全部在浏览器内存中模拟，未接入真实账号体系与短信服务；
              <br />
              生产环境将由服务端完成校验并签发 HttpOnly Secure Cookie 会话。
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}

/**
 * 登录页（多租户口径 · 批次①）：企业编码 + 手机号 + 短信验证码两段式。
 * 第 1 段解析企业编码（「本设备记住的企业」快捷条目仅回填编码、点击重新解析），
 * 第 2 段企业内身份验证，支持「短信登录 | 密码登录」两种方式切换（2026-09-18）：
 * 密码登录的账号在已验证企业的命名空间内定位（账号企业内唯一）。
 * 扫码入口本期隐藏（LOGIN_METHODS_EXPOSED 开关，组件与契约保留）。
 * 演示环境说明：认证由内存 Mock Gateway 模拟，不调用真实短信与 OAuth；
 * 登录态仅存在于当前页面，刷新即失效。
 *
 * 视觉：2026-09-14 按新设计稿重绘（浅底流体渐变光斑 + 噪点 + 左品牌区 + 右玻璃拟态卡片），
 * 全部配色以 .login-shell 作用域内的 lg- 变量承载，不污染全局 token。
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
  Building2,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  X,
} from "lucide-react"
import { BrandMark } from "../components/Brand"
import { Modal } from "../components/Modal"
import { authGateway } from "./mockGateway"
import { ForgotPasswordModal } from "./ForgotPasswordModal"
import {
  DEMO_ACCOUNT_GROUPS,
  DEMO_ACCOUNT_HINTS,
  DEMO_PASSWORD,
  QR_IDENTITIES,
  type DemoAccountHint,
} from "./authProfiles"
import type { AccessRealm, LoginFailure, QrLoginState, QrSource } from "./authTypes"
import { useAuth } from "./AuthProvider"
import { LoginBackdrop } from "./LoginBackdrop"
import { LoginBrandFlow, LoginFlowCanvas } from "./LoginBrandFlow"
import "./loginShell.css"

const RESEND_SECONDS = 60
const QR_POLL_MS = 700

/**
 * 扫码登录露出开关（本期口径：隐藏）。
 * 扫码的组件、契约方法、QR_IDENTITIES 与演示二维码全部保留；
 * 置 true 即恢复旧扫码页签（非本期口径，仅回归验证）。
 * 开关关闭时不只是不渲染入口：不创建二维码票据、不启动轮询定时器，
 * 不产生任何隐藏方式的副作用（createQrTicket 的 useEffect 用同一开关门控）。
 * 密码登录已于 2026-09-18 以「步骤 2 方式切换」形态正式回归，不再走本开关。
 */
export const LOGIN_METHODS_EXPOSED = { qr: false }

// ─── 本设备记住的企业（localStorage 容错读写） ───────────────────────────────

const REMEMBERED_ENT_KEY = "lg-remembered-enterprises"

interface RememberedEnterprise {
  code: string
  name: string
}

/** 读全部 try/catch：不可用、格式损坏或写入失败时静默降级，登录流程不受影响 */
function loadRememberedEnterprises(): { list: RememberedEnterprise[]; corrupted: boolean } {
  try {
    const raw = window.localStorage.getItem(REMEMBERED_ENT_KEY)
    if (!raw) return { list: [], corrupted: false }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error("bad shape")
    const list = parsed.filter(
      (v): v is RememberedEnterprise =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as RememberedEnterprise).code === "string" &&
        typeof (v as RememberedEnterprise).name === "string",
    )
    return { list, corrupted: list.length !== parsed.length }
  } catch {
    return { list: [], corrupted: true }
  }
}

function saveRememberedEnterprises(list: RememberedEnterprise[]): void {
  try {
    window.localStorage.setItem(REMEMBERED_ENT_KEY, JSON.stringify(list.slice(0, 5)))
  } catch {
    /* 写失败静默降级 */
  }
}

type MethodTab = "sms" | "qr"
/** 第 2 段身份验证方式（企业已验证后的子方式） */
type VerifMethod = "sms" | "password"
type FieldKey = "entcode" | "account" | "password" | "phone" | "code" | "qr"

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



// ─── 记住默认登录开关（短信/密码两种验证方式共用；FR-01） ────────────────────
/** 安全卡片 + iOS 质感开关：默认不勾选；勾选且验证成功后才在本设备保存长期会话 */
function RememberDefaultSwitch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      htmlFor="lg-remember-default"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "13px 14px",
        borderRadius: 16,
        background: checked ? "rgba(25,197,154,0.07)" : "rgba(255,255,255,0.72)",
        border: `1px solid ${checked ? "rgba(25,197,154,0.4)" : "rgba(200,215,235,0.85)"}`,
        cursor: "pointer",
        userSelect: "none",
        transition: "background 160ms ease, border-color 160ms ease",
      }}
    >
      <input
        id="lg-remember-default"
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
      <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: checked ? "linear-gradient(135deg, #0E8F76, #19C59A)" : "rgba(25,197,154,0.1)",
            border: `1px solid ${checked ? "transparent" : "rgba(25,197,154,0.22)"}`,
            color: checked ? "#FFFFFF" : "#0D9B7A",
            transition: "background 160ms ease, color 160ms ease",
          }}
        >
          <ShieldCheck size={20} />
        </span>
        <span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: "var(--lg-text-1)", lineHeight: 1.4, whiteSpace: "nowrap" }}>
              记住默认登录
            </span>
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 6px",
                borderRadius: 6,
                background: "rgba(25,197,154,0.1)",
                color: "#0D9B7A",
                fontSize: "10px",
                fontWeight: 600,
                lineHeight: 1.4,
                flexShrink: 0,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#19C59A" }} />
              本机安全
            </span>
          </span>
          <span style={{ display: "block", fontSize: "var(--fs-12)", color: "var(--lg-text-3)", marginTop: 2, whiteSpace: "nowrap" }}>
            仅限当前设备有效，退出后自动失效
          </span>
        </span>
      </span>
      {/* iOS 质感开关：轨道随勾选换薄荷渐变，滑块位移 20px */}
      <span
        aria-hidden
        style={{
          width: 48,
          height: 28,
          borderRadius: 999,
          flexShrink: 0,
          padding: 2,
          display: "flex",
          alignItems: "center",
          background: checked ? "linear-gradient(135deg, #0D9B7A, #19C59A)" : "rgba(26,43,66,0.16)",
          transition: "background 160ms ease",
        }}
      >
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "#FFFFFF",
            boxShadow: "0 1px 3px rgba(15,23,42,0.25)",
            transform: checked ? "translateX(20px)" : "translateX(0)",
            transition: "transform 160ms ease",
          }}
        />
      </span>
    </label>
  )
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────
/** restoreNotice：默认登录恢复失败回退标准登录时的一次性提示（AC-06/AC-07 可见） */
export function LoginPage({
  restoreNotice,
  onDismissRestoreNotice,
}: {
  restoreNotice?: string | null
  onDismissRestoreNotice?: () => void
}) {
  const { setSession } = useAuth()
  // 顶层方式：仅短信（扫码为隐藏回归通道）；密码不再占用顶层页签
  const [method, setMethod] = useState<MethodTab>("sms")
  /** 第 2 段身份验证方式：短信（默认）| 账号密码（2026-09-18 回归） */
  const [verifMethod, setVerifMethod] = useState<VerifMethod>("sms")
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})

  // 编码两段式：第 1 段 = 企业验证/工作空间验证（enterprise 为空时未验证），第 2 段 = 短信验证
  const [entCode, setEntCode] = useState("")
  const [entBusy, setEntBusy] = useState(false)
  /** aria-live 异步结果区：正在解析 / 已识别：{企业名} / 缓存失效提示 */
  const [entStatus, setEntStatus] = useState<string | null>(null)
  const [enterprise, setEnterprise] = useState<{ id: string; name: string; code: string; realm: AccessRealm } | null>(null)
  const [remembered, setRemembered] = useState<RememberedEnterprise[]>([])
  /** 递增守卫：切换企业/重新解析时丢弃慢返回的旧 resolveEnterprise/requestSms 结果 */
  const resolveSeq = useRef(0)
  const smsSeq = useRef(0)
  const entCodeRef = useRef<HTMLInputElement>(null)

  // 密码登录（第 2 段「密码登录」子方式；账号企业内唯一，联合企业编码定位）
  const [account, setAccount] = useState("")
  const [password, setPassword] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const accountRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // 短信登录（第 2 段）
  const [phone, setPhone] = useState("")
  const [codeDigits, setCodeDigits] = useState<string[]>(["", "", "", "", "", ""])
  const [smsDevCode, setSmsDevCode] = useState<string | null>(null)
  const [resendLeft, setResendLeft] = useState(0)
  /** 发送成功提示（区分首发/重发文案） */
  const [smsNotice, setSmsNotice] = useState<string | null>(null)
  const codeRefs = useRef<Array<HTMLInputElement | null>>([])
  /** 记住默认登录（FR-01）：默认不勾选；仅验证码验证成功后才生效 */
  const [rememberDefault, setRememberDefault] = useState(false)

  // 演示账号速查弹框开关
  const [hintsOpen, setHintsOpen] = useState(false)
  /** 找回密码弹框（密码登录子方式的「忘记密码？」入口，2026-09-18 第一期缺口批次） */
  const [forgotOpen, setForgotOpen] = useState(false)
  /** 已展开完整场景说明的账号（ⓘ 切换；折叠态单行截断） */
  const [expandedHints, setExpandedHints] = useState<ReadonlySet<string>>(new Set())

  const methodTabRefs = useRef<Array<HTMLButtonElement | null>>([])

  // 挂载时读取记住的企业；损坏缓存提示一次并重置（登录流程不受影响）
  useEffect(() => {
    const { list, corrupted } = loadRememberedEnterprises()
    if (corrupted) {
      setRemembered([])
      saveRememberedEnterprises([])
      setEntStatus("已保存的企业信息已失效，请重新输入企业编码")
      return
    }
    setRemembered(list)
  }, [])

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

  /** 清空第 2 段全部验证状态（短信+密码）并作废在途请求（切换企业/重新解析时必须执行） */
  const resetSmsState = useCallback(() => {
    smsSeq.current += 1
    setPhone("")
    setCodeDigits(["", "", "", "", "", ""])
    setSmsDevCode(null)
    setResendLeft(0)
    setSmsNotice(null)
    setAccount("")
    setPassword("")
    setFieldErrors({})
    setFormError(null)
    setBusy(false)
  }, [])

  /**
   * 解析企业编码（手输/快捷条目/演示速查共用）。快捷条目仅用于回填编码：
   * 每次点击都重新调用 resolveEnterprise，不信任缓存中的企业名/ID。
   * 系统管理后台编码与普通企业编码复用同一形式，但解析为 realm=PLATFORM，
   * 第 1 步文案显示「工作空间验证」，不把软件服务方伪装成普通企业租户。
   */
  const resolveEnterpriseCode = useCallback(
    async (codeRaw: string): Promise<boolean> => {
      const code = codeRaw.trim().toUpperCase()
      setEntStatus(null)
      setFieldErrors({})
      setFormError(null)
      if (!code) {
        setFieldErrors({ entcode: "请输入企业编码" })
        entCodeRef.current?.focus()
        return false
      }
      const seq = ++resolveSeq.current
      setEntBusy(true)
      setEntStatus("正在验证企业信息…")
      const result = await authGateway.resolveEnterprise({ code })
      setEntBusy(false)
      if (seq !== resolveSeq.current) return false
      if (!result.ok) {
        setEntStatus(null)
        setFieldErrors({ entcode: result.failure.message })
        return false
      }
      setEnterprise({
        id: result.enterpriseId,
        name: result.workspaceLabel,
        code,
        realm: result.realm,
      })
      setEntStatus(result.realm === "PLATFORM" ? "已识别：系统管理后台（软件服务方）" : `已识别：${result.enterpriseName}`)
      setRemembered((prev) => {
        const next = [
          { code, name: result.workspaceLabel },
          ...prev.filter((v) => v.code !== code),
        ].slice(0, 5)
        saveRememberedEnterprises(next)
        return next
      })
      resetSmsState()
      return true
    },
    [resetSmsState],
  )

  /** 返回第 1 段重新选企业：清空短信/密码全部状态与回显，并作废所有旧请求结果 */
  const switchEnterprise = useCallback(() => {
    resolveSeq.current += 1
    smsSeq.current += 1
    setEnterprise(null)
    setEntStatus(null)
    setFieldErrors({})
    setFormError(null)
    setBusy(false)
    setForgotOpen(false)
    setPhone("")
    setCodeDigits(["", "", "", "", "", ""])
    setSmsDevCode(null)
    setResendLeft(0)
    setSmsNotice(null)
    setAccount("")
    setPassword("")
    window.setTimeout(() => entCodeRef.current?.focus(), 30)
  }, [])

  const useMemoEntry = useCallback(
    async (entry: RememberedEnterprise) => {
      setEntCode(entry.code)
      const ok = await resolveEnterpriseCode(entry.code)
      if (!ok) {
        // 解析失败：缓存内容不可信，静默删除该条并提示重输（错误文案即重输提示）
        setRemembered((prev) => {
          const next = prev.filter((v) => v.code !== entry.code)
          saveRememberedEnterprises(next)
          return next
        })
      }
    },
    [resolveEnterpriseCode],
  )

  const deleteMemoEntry = useCallback((code: string) => {
    setRemembered((prev) => {
      const next = prev.filter((v) => v.code !== code)
      saveRememberedEnterprises(next)
      return next
    })
  }, [])

  /** 待确认删除的记住企业：点 × 只打开确认弹框，重点提示删除后果（用户 2026-09-15 要求） */
  const [memoDeleteTarget, setMemoDeleteTarget] = useState<RememberedEnterprise | null>(null)

  // ─── 密码方式（第 2 段「密码登录」：企业内账号 + 密码） ───────────────────
  const submitPassword = useCallback(
    async (e?: { preventDefault: () => void }) => {
      e?.preventDefault()
      if (!enterprise) return
      clearErrors()
      if (!account.trim()) {
        setFieldErrors({ account: "请输入登录账号" })
        accountRef.current?.focus()
        return
      }
      if (!password) {
        setFieldErrors({ password: "请输入密码" })
        passwordRef.current?.focus()
        return
      }
      setBusy(true)
      const result = await authGateway.loginPassword({
        account,
        password,
        workspaceId: enterprise.id,
        rememberDefaultLogin: rememberDefault,
      })
      setBusy(false)
      if (result.ok) {
        setSession(result.session)
        return
      }
      applyFailure(result.failure)
      if (result.failure.field === "account") accountRef.current?.focus()
      if (result.failure.field === "password") passwordRef.current?.focus()
    },
    [enterprise, account, password, rememberDefault, clearErrors, applyFailure, setSession],
  )

  /** 第 2 段子方式切换：清空双方临时错误，聚焦对应首字段 */
  const switchVerifMethod = useCallback((next: VerifMethod) => {
    setVerifMethod(next)
    setFieldErrors({})
    setFormError(null)
    window.setTimeout(() => {
      if (next === "password") accountRef.current?.focus()
      else window.setTimeout(() => codeRefs.current[0]?.focus(), 30)
    }, 30)
  }, [])

  // ─── 短信方式（第 2 段：企业内短信验证） ─────────────────────────────────
  useEffect(() => {
    if (resendLeft <= 0) return
    const t = window.setInterval(() => setResendLeft((v) => Math.max(0, v - 1)), 1000)
    return () => window.clearInterval(t)
  }, [resendLeft])

  const requestSmsCode = useCallback(async () => {
    if (!enterprise) return
    clearErrors()
    if (!/^1\d{10}$/.test(phone)) {
      setFieldErrors({ phone: "请输入正确的 11 位手机号" })
      return
    }
    const isResend = Boolean(smsDevCode)
    const seq = ++smsSeq.current
    setBusy(true)
    const result = await authGateway.requestSms({ enterpriseId: enterprise.id, phone })
    setBusy(false)
    if (seq !== smsSeq.current) return
    if (!result.ok) {
      applyFailure(result.failure)
      return
    }
    setSmsDevCode(result.devCode)
    setResendLeft(RESEND_SECONDS)
    setCodeDigits(["", "", "", "", "", ""])
    setSmsNotice(isResend ? "新验证码已发送，原验证码已失效" : "验证码已发送，请注意查收")
    window.setTimeout(() => codeRefs.current[0]?.focus(), 50)
  }, [enterprise, phone, smsDevCode, clearErrors, applyFailure])

  const submitSms = useCallback(async () => {
    if (!enterprise) return
    if (!smsDevCode) {
      setFieldErrors({ code: "请先获取短信验证码" })
      return
    }
    const code = codeDigits.join("")
    if (code.length < 6) {
      setFieldErrors({ code: "请输入完整的 6 位验证码" })
      return
    }
    clearErrors()
    const seq = ++smsSeq.current
    setBusy(true)
    const result = await authGateway.verifySms({ enterpriseId: enterprise.id, phone, code, rememberDefaultLogin: rememberDefault })
    setBusy(false)
    if (seq !== smsSeq.current) return
    if (result.ok) {
      setSession(result.session)
      return
    }
    const f = result.failure
    if (f.field === "account") {
      // 短信段没有账号输入框：账号级状态提示（冻结/停用/无服务药厂等）落到全局 aria-live 区
      setFormError(f.message)
    } else if (f.field && f.field !== "qr") {
      setFieldErrors({ [f.field]: f.message })
    } else {
      setFormError(f.message)
    }
    if (
      result.failure.code === "sms-code-expired" ||
      result.failure.code === "sms-attempts-exceeded"
    ) {
      setSmsDevCode(null)
      setCodeDigits(["", "", "", "", "", ""])
    }
  }, [enterprise, codeDigits, phone, smsDevCode, rememberDefault, clearErrors, applyFailure, setSession])

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

  // 开关关闭时不创建二维码票据（挂载即建码的旧行为已门控：仅在扫码露出且切到该页签时）
  useEffect(() => {
    if (!LOGIN_METHODS_EXPOSED.qr || method !== "qr") return
    void createQrTicket(qrSource)
  }, [LOGIN_METHODS_EXPOSED.qr, method, qrSource, createQrTicket])

  // 轮询 + 倒计时共用一个定时器（同样受开关门控，关闭时无轮询副作用）
  useEffect(() => {
    if (!qr || !LOGIN_METHODS_EXPOSED.qr || method !== "qr") return
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
  }, [qr?.ticket, qr?.status === "expired", method, setSession, createQrTicket]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── 键盘可访问的 tab 切换（仅回归模式渲染页签） ──────────────────────────
  const onTabKeyDown = (idx: number) => (e: ReactKeyboardEvent) => {
    const order = tabDefs.map((t) => t.key)
    let next = idx
    if (e.key === "ArrowRight") next = (idx + 1) % order.length
    else if (e.key === "ArrowLeft") next = (idx + order.length - 1) % order.length
    else return
    e.preventDefault()
    setMethod(order[next])
    clearErrors()
    methodTabRefs.current[next]?.focus()
  }

  /** 演示速查：填好企业编码并解析出企业名、填好手机号（密码方式切换后同企业则预填账号）；
      停留在短信段待发送；随即关闭速查弹框 */
  const applyDemoHint = useCallback(
    async (h: DemoAccountHint) => {
      setHintsOpen(false)
      setMethod("sms")
      resetSmsState()
      setEntCode(h.enterpriseCode)
      const ok = await resolveEnterpriseCode(h.enterpriseCode)
      // 解析成功的回调里会重置第 2 段，手机号/账号必须在解析完成后回填
      if (ok) {
        setPhone(h.phone)
        setAccount(h.account)
      }
    },
    [resetSmsState, resolveEnterpriseCode],
  )

  /** 页签按开关过滤；本期（关）不渲染页签，短信面板为默认面板（扫码回归用） */
  const tabDefs = [
    { key: "sms" as const, label: "短信验证" },
    ...(LOGIN_METHODS_EXPOSED.qr ? [{ key: "qr" as const, label: "扫码登录" }] : []),
  ]
  const showTabs = LOGIN_METHODS_EXPOSED.qr

  return (
    <div className="login-shell">
      <LoginBackdrop />
      <LoginFlowCanvas />

      <div className="login-layout">
        {/* ── 左：品牌区（≥900px） ── */}
        <section className="login-brand" aria-hidden="true">
          <div className="lg-anim-0" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BrandMark size={40} />
            <div>
              <div style={{ fontSize: "var(--fs-16)", fontWeight: 600, letterSpacing: "0", lineHeight: 1.2, color: "#1A2B42" }}>
                药合作
              </div>
              <div style={{ fontSize: "var(--fs-12)", color: "rgba(26,43,66,0.38)", letterSpacing: "0", marginTop: 2 }}>
                营销协同管理系统
              </div>
            </div>
          </div>

          {/* 主视觉横排：文案与开放式协作流线，背景仍由 LoginBackdrop 提供 */}
          <div className="lg-hero">
            <div className="lg-hero-copy">
              <h1
                className="lg-anim-1"
                style={{
                  margin: "0 0 16px",
                  fontSize: "clamp(32px, 3.2vw, 44px)",
                  fontWeight: 600,
                  color: "#1A2B42",
                  letterSpacing: "0",
                  lineHeight: 1.15,
                }}
              >
                让医药协作，
                <br />
                更高效。
              </h1>
              <div className="lg-hero-rule lg-anim-2" aria-hidden="true" />
              <p
                className="lg-anim-2"
                style={{ margin: "0 0 26px", fontSize: "var(--fs-15)", color: "rgba(26,43,66,0.52)", lineHeight: 1.75, fontWeight: 400 }}
              >
                连接药企、服务商与专业人员，
                <br />
                让任务、执行、结果与数据更紧密高效协同。
              </p>
              <div
                className="lg-anim-3"
                style={{
                  color: "rgba(26,43,66,0.32)",
                  fontSize: "var(--fs-11)",
                  fontWeight: 500,
                  letterSpacing: "0.22em",
                  lineHeight: 2,
                }}
              >
                BETTER COLLABORATION
                <br />
                BETTER HEALTHCARE
              </div>
            </div>
            <div className="lg-hero-flow lg-anim-3">
              <LoginBrandFlow />
            </div>
          </div>

          <div className="lg-anim-4" style={{ color: "rgba(26,43,66,0.28)", fontSize: "var(--fs-12)", letterSpacing: "0" }}>
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
                <div style={{ fontSize: "var(--fs-16)", fontWeight: 600, color: "#1A2B42", lineHeight: 1.2 }}>药合作</div>
                <div style={{ fontSize: "var(--fs-12)", color: "var(--lg-brand-dim)", letterSpacing: "0", marginTop: 2 }}>
                  营销协同管理系统
                </div>
              </div>
            </div>

            <div
              className="lg-anim-card lg-card"
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
                  <h2 style={{ margin: 0, fontSize: "var(--fs-24)", fontWeight: 600, color: "#1A2B42", letterSpacing: "0" }}>
                    欢迎回来
                  </h2>
                  <p style={{ margin: "6px 0 0", fontSize: "var(--fs-13)", color: "rgba(26,43,66,0.45)", lineHeight: 1.5 }}>
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
                  <span style={{ color: "#0D9B7A", fontSize: "var(--fs-12)", fontWeight: 500, letterSpacing: "0", whiteSpace: "nowrap" }}>
                    Demo Env
                  </span>
                </div>
              </div>

              {/* 方式切换：本期仅短信（不渲染页签，展示两步指示）；回归模式恢复旧页签 */}
              {showTabs ? (
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
              ) : (
                method === "sms" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 24,
                      fontSize: "var(--fs-12)",
                      color: "rgba(26,43,66,0.4)",
                    }}
                    aria-label="登录步骤"
                  >
                    <span
                      className="lg-stepchip"
                      aria-current={enterprise ? "step" : undefined}
                      style={enterprise ? undefined : { background: "rgba(25,197,154,0.1)", color: "#0D9B7A", borderColor: "rgba(25,197,154,0.35)", fontWeight: 600 }}
                    >
                      {/* 后台编码解析后第 1 步改称「工作空间验证」（软件服务方不是企业租户） */}
                      {enterprise?.realm === "PLATFORM" ? "1 工作空间验证" : "1 企业验证"}
                    </span>
                    <span aria-hidden style={{ color: "rgba(26,43,66,0.25)" }}>›</span>
                    <span
                      className="lg-stepchip"
                      aria-current={enterprise ? "step" : undefined}
                      style={enterprise ? { background: "rgba(25,197,154,0.1)", color: "#0D9B7A", borderColor: "rgba(25,197,154,0.35)", fontWeight: 600 } : undefined}
                    >
                      2 {verifMethod === "sms" ? "短信验证" : "账号密码"}
                    </span>
                  </div>
                )
              )}

              {/* 默认登录恢复失败的一次性提示（可关闭）：记录已撤销，回到标准登录 */}
              {restoreNotice && (
                <div
                  className="lg-error-pill"
                  role="status"
                  style={{
                    marginBottom: 14,
                    background: "rgba(245,166,35,0.08)",
                    borderColor: "rgba(245,166,35,0.38)",
                    color: "#8A5A00",
                    alignItems: "flex-start",
                  }}
                >
                  <TriangleAlert size={14} aria-hidden style={{ marginTop: 2 }} />
                  <span style={{ flex: 1 }}>{restoreNotice}</span>
                  {onDismissRestoreNotice && (
                    <button
                      type="button"
                      onClick={onDismissRestoreNotice}
                      aria-label="关闭提示"
                      style={{
                        marginLeft: "auto",
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: "#8A5A00",
                        cursor: "pointer",
                        fontSize: "var(--fs-14)",
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )}

              {/* 全局错误（字段级错误在各自下方展示） */}
              <div aria-live="polite" role="status">
                {formError && (
                  <div className="lg-error-pill" style={{ marginBottom: 14 }}>
                    <TriangleAlert size={14} aria-hidden />
                    {formError}
                  </div>
                )}
              </div>

              {/* ── 短信验证（企业编码两段式：1 企业验证 → 2 短信验证） ── */}
              {method === "sms" && (
                <div
                  key="sms"
                  role="tabpanel"
                  id="login-panel-sms"
                  aria-labelledby={showTabs ? "login-tab-sms" : undefined}
                  className="lg-panel"
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  {!enterprise ? (
                    <>
                      {/* 第 1 段：企业编码 */}
                      <div>
                        <label htmlFor="login-entcode" className="lg-label">
                          企业编码
                        </label>
                        <div className="lg-field-row" style={{ display: "flex", gap: 10 }}>
                          <input
                            id="login-entcode"
                            ref={entCodeRef}
                            className="lg-field font-mono-nums"
                            value={entCode}
                            onChange={(e) => setEntCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void resolveEnterpriseCode(entCode)
                            }}
                            maxLength={8}
                            disabled={entBusy}
                            autoComplete="off"
                            aria-invalid={Boolean(fieldErrors.entcode)}
                            aria-describedby={fieldErrors.entcode ? "err-entcode" : entStatus ? "ent-status" : undefined}
                            style={{ flex: 1, minWidth: 0, letterSpacing: "0.08em", fontWeight: 700 }}
                            placeholder="8 位企业编码，如 E9K4P7X2"
                          />
                          <button
                            type="button"
                            onClick={() => void resolveEnterpriseCode(entCode)}
                            disabled={entBusy || !entCode.trim()}
                            style={{
                              flexShrink: 0,
                              height: 50,
                              padding: "0 16px",
                              borderRadius: 10,
                              border: "1px solid rgba(25,197,154,0.3)",
                              background: "rgba(25,197,154,0.06)",
                              color: entBusy || !entCode.trim() ? "rgba(26,43,66,0.3)" : "#0D9B7A",
                              fontSize: "var(--fs-13)",
                              fontWeight: 500,
                              fontFamily: "inherit",
                              cursor: entBusy || !entCode.trim() ? "not-allowed" : "pointer",
                              transition: "background 150ms, color 150ms",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {entBusy ? "验证中…" : "验证企业"}
                          </button>
                        </div>
                        {fieldErrors.entcode && (
                          <div id="err-entcode" className="lg-error-pill" style={{ marginTop: 8 }}>
                            <TriangleAlert size={14} aria-hidden />
                            {fieldErrors.entcode}
                          </div>
                        )}
                        {/* 异步结果区（aria-live）：正在解析 / 已识别 / 缓存失效 */}
                        <div id="ent-status" aria-live="polite" role="status">
                          {entStatus && !fieldErrors.entcode && (
                            <div
                              className={
                                entStatus.startsWith("已识别")
                                  ? "lg-ok-note"
                                  : entStatus.includes("失效")
                                    ? "lg-warn-note"
                                    : "lg-info-note"
                              }
                              style={{ marginTop: 8 }}
                            >
                              {entBusy && (
                                <LoaderCircle size={13} style={{ animation: "spin 0.7s linear infinite" }} aria-hidden />
                              )}
                              {entStatus}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 本设备记住的企业：点击仅回填编码并重新解析，不信任缓存 */}
                      {remembered.length > 0 && (
                        <div>
                          <span className="lg-label" style={{ marginBottom: 7 }}>
                            本设备记住的企业
                          </span>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {remembered.map((v) => (
                              <div key={v.code} className="lg-memo-row">
                                <button
                                  type="button"
                                  className="lg-memo-main"
                                  disabled={entBusy}
                                  onClick={() => void useMemoEntry(v)}
                                >
                                  <Building2 size={14} aria-hidden />
                                  <span className="lg-memo-name">{v.name}</span>
                                  <code className="font-mono-nums lg-memo-code">{v.code}</code>
                                </button>
                                <button
                                  type="button"
                                  className="lg-memo-del"
                                  aria-label={`删除记住的企业 ${v.name}`}
                                  title={`删除 ${v.name}`}
                                  disabled={entBusy}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setMemoDeleteTarget(v)
                                  }}
                                >
                                  <X size={13} aria-hidden />
                                </button>
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize: "var(--fs-12)", color: "rgba(26,43,66,0.35)", marginTop: 6 }}>
                            也可在上方输入其他企业编码
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* 第 2 段：企业内短信验证 */}
                      <div className="lg-ent-chip">
                        <Building2 size={15} aria-hidden />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="lg-ent-chip-name">{enterprise.name}</div>
                          <code className="font-mono-nums" style={{ fontSize: "var(--fs-12)", color: "rgba(26,43,66,0.35)", letterSpacing: "0.08em" }}>
                            {enterprise.code}
                          </code>
                        </div>
                        <button type="button" className="lg-ent-switch" onClick={switchEnterprise}>
                          {enterprise.realm === "PLATFORM" ? "更换工作空间编码" : "切换企业"}
                        </button>
                      </div>

                      {/* 身份验证子方式：短信登录 | 密码登录（账号企业内唯一） */}
                      <div
                        role="group"
                        aria-label="身份验证方式"
                        style={{ display: "flex", gap: 2, padding: 3, borderRadius: 12, background: "rgba(26,43,66,0.045)" }}
                      >
                        {(["sms", "password"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={verifMethod === m}
                            onClick={() => switchVerifMethod(m)}
                            style={{
                              flex: 1,
                              height: 34,
                              borderRadius: 9,
                              border: "none",
                              cursor: "pointer",
                              fontSize: "var(--fs-12)",
                              fontWeight: verifMethod === m ? 700 : 500,
                              fontFamily: "inherit",
                              background: verifMethod === m ? "#FFFFFF" : "transparent",
                              color: verifMethod === m ? "#0D9B7A" : "rgba(26,43,66,0.45)",
                              boxShadow: verifMethod === m ? "0 1px 3px rgba(26,43,66,0.1)" : "none",
                              transition: "background 150ms ease, color 150ms ease",
                            }}
                          >
                            {m === "sms" ? "短信登录" : "密码登录"}
                          </button>
                        ))}
                      </div>

                      {verifMethod === "sms" ? (
                        <>
                      <div aria-live="polite" role="status">
                        {smsNotice && (
                          <div className="lg-ok-note">✓ {smsNotice}</div>
                        )}
                      </div>

                      <div>
                        <label htmlFor="login-phone" className="lg-label">
                          {enterprise.realm === "PLATFORM" ? "软件服务方工作人员手机号" : `${enterprise.name}的手机号`}
                        </label>
                        <div className="lg-field-row" style={{ display: "flex", gap: 10 }}>
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
                              fontSize: "var(--fs-13)",
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
                        <div role="group" aria-label="6 位短信验证码" aria-describedby={fieldErrors.code ? "err-code" : undefined} className="lg-codeboxes" style={{ display: "flex", gap: 8 }}>
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
                                fontSize: "var(--fs-16)",
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
                          <div style={{ fontSize: "var(--fs-12)", color: "rgba(26,43,66,0.35)", marginTop: 7 }}>
                            先输入手机号并获取验证码（演示环境不发送真实短信，成员验证码固定为 123456）
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
                            fontSize: "var(--fs-13)",
                            lineHeight: 1.6,
                          }}
                        >
                          <Smartphone size={16} style={{ marginTop: 2, flexShrink: 0, color: "#0D9B7A" }} aria-hidden />
                          <div>
                            <div style={{ fontSize: "var(--fs-12)", color: "rgba(26,43,66,0.38)", marginBottom: 2 }}>模拟短信 · 5 分钟内有效</div>
                            【药合作】您的登录验证码是{" "}
                            <span className="font-mono-nums" style={{ fontWeight: 800, color: "#0D9B7A", letterSpacing: "0.08em" }}>
                              {smsDevCode}
                            </span>
                            ，请勿泄露。（演示环境直接回显，不发送真实短信）
                          </div>
                        </div>
                      )}
                      <RememberDefaultSwitch checked={rememberDefault} onChange={setRememberDefault} />
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
                        </>
                      ) : (
                        <form
                          key="password"
                          onSubmit={submitPassword}
                          style={{ display: "flex", flexDirection: "column", gap: 12 }}
                        >
                          <div>
                            <label htmlFor="login-account" className="lg-label">
                              登录账号
                            </label>
                            <input
                              id="login-account"
                              ref={accountRef}
                              className="lg-field"
                              autoComplete="username"
                              value={account}
                              onChange={(e) => setAccount(e.target.value.toLowerCase())}
                              aria-invalid={Boolean(fieldErrors.account)}
                              aria-describedby={fieldErrors.account ? "err-account" : "account-hint"}
                              placeholder="登录账号或手机号"
                            />
                            {fieldErrors.account ? (
                              <div id="err-account" className="lg-error-pill" style={{ marginTop: 8 }}>
                                <TriangleAlert size={14} aria-hidden />
                                {fieldErrors.account}
                              </div>
                            ) : (
                              <div id="account-hint" style={{ fontSize: "var(--fs-12)", color: "rgba(26,43,66,0.35)", marginTop: 7 }}>
                                企业内唯一，支持登录账号或手机号
                              </div>
                            )}
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <label htmlFor="login-password" className="lg-label">
                                密码
                              </label>
                              <button
                                type="button"
                                onClick={() => setForgotOpen(true)}
                                style={{
                                  background: "none", border: "none", cursor: "pointer", padding: 0,
                                  fontSize: "var(--fs-12)", fontWeight: 600, fontFamily: "inherit", color: "#0D9B7A",
                                }}
                              >
                                忘记密码？
                              </button>
                            </div>
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
                              <div id="pwd-hint" style={{ fontSize: "var(--fs-12)", color: "rgba(26,43,66,0.35)", marginTop: 7 }}>
                                初始密码统一{" "}
                                <code className="font-mono-nums" style={{ fontWeight: 700, color: "#0D9B7A" }}>
                                  {DEMO_PASSWORD}
                                </code>
                                ，修改后以新密码为准
                              </div>
                            )}
                          </div>
                          <RememberDefaultSwitch checked={rememberDefault} onChange={setRememberDefault} />
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
                    </>
                  )}
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
                            <div style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: "#1A2B42" }}>二维码已过期</div>
                            <button type="button" className="lg-btn-solid" onClick={() => void createQrTicket(qrSource)}>
                              <RefreshCw size={14} aria-hidden />
                              刷新二维码
                            </button>
                          </>
                        )}
                        {!expired && qr?.status === "scanned" && (
                          <>
                            <ScanLine size={26} style={{ color: "#12B886" }} aria-hidden />
                            <div style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: "#1A2B42" }}>
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

                    <div style={{ textAlign: "center", fontSize: "var(--fs-13)", color: "rgba(26,43,66,0.52)", lineHeight: 1.7, maxWidth: 300 }}>
                      使用 <b style={{ color: "#1A2B42" }}>{qrSource === "wecom" ? "企业微信「扫一扫」" : "微信「扫一扫」"}</b>
                      登录。
                      {!expired && qr && (
                        <span className="font-mono-nums" style={{ color: "rgba(26,43,66,0.38)" }}>
                          {" "}
                          · 剩余 {Math.floor(qrRemaining / 60)}:{String(qrRemaining % 60).padStart(2, "0")}
                        </span>
                      )}
                      <div style={{ fontSize: "var(--fs-12)", color: "rgba(26,43,66,0.38)", marginTop: 4 }}>
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
                      <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--color-warning-fg)", marginBottom: 8, letterSpacing: "0.05em" }}>
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
                        style={{ height: 38, fontSize: "var(--fs-13)" }}
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

              {/* ── 演示账号速查：弹框入口（不撑登录卡布局，列表见根级 Modal） ── */}
              <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
                <button type="button" className="lg-demo-entry" onClick={() => setHintsOpen(true)}>
                  <Info size={14} aria-hidden />
                  <span>演示账号速查</span>
                  <span className="lg-demo-entry-count">
                    {DEMO_ACCOUNT_HINTS.length} 个角色 · 全流程测试
                  </span>
                </button>
              </div>
            </div>

            <p style={{ textAlign: "center", fontSize: "var(--fs-12)", color: "rgba(26,43,66,0.3)", marginTop: 16, lineHeight: 1.7 }}>
              原型演示：认证逻辑全部在浏览器内存中模拟，未接入真实账号体系与短信服务；
              <br />
              生产环境将由服务端完成校验并签发 HttpOnly Secure Cookie 会话。
            </p>
          </div>
        </main>
      </div>

      {/* 演示账号速查弹框：点击账号回填企业编码+手机号并关闭；点 ⓘ 展开完整场景说明 */}
      {hintsOpen && (
        <Modal open title="演示账号速查" onClose={() => setHintsOpen(false)} width={560}>
          <div
            style={{
              padding: "10px 14px",
              fontSize: "var(--fs-12)",
              color: "rgba(26,43,66,0.55)",
              lineHeight: 1.6,
              background: "rgba(25,197,154,0.05)",
              border: "1px solid rgba(25,197,154,0.16)",
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            点击账号自动填入企业编码与手机号，验证码统一{" "}
            <b className="font-mono-nums" style={{ color: "#0D9B7A" }}>123456</b>
            <span style={{ color: "rgba(26,43,66,0.38)" }}>；点 ⓘ 展开该账号的演示场景说明</span>
          </div>
          {/* 分组 + 账号行：点击主区回填企业编码（自动解析）+ 手机号，停留短信段待发送 */}
          <div
            style={{
              maxHeight: "min(54vh, 460px)",
              overflowY: "auto",
              border: "1px solid rgba(200,215,235,0.55)",
              borderRadius: 12,
            }}
          >
            {DEMO_ACCOUNT_GROUPS.map((g) => {
              const items = DEMO_ACCOUNT_HINTS.filter((h) => h.group === g.key)
              if (items.length === 0) return null
              return (
                <div key={g.key}>
                  <div className="lg-demo-group">
                    <span className="lg-demo-group-label">{g.label}</span>
                    <span className="font-mono-nums lg-demo-group-hint">{g.hint}</span>
                  </div>
                  {items.map((h) => {
                    const expanded = expandedHints.has(h.userId)
                    return (
                      <div key={h.userId} className="lg-demo-row">
                        <button
                          type="button"
                          className="lg-demo-main"
                          onClick={() => void applyDemoHint(h)}
                        >
                          <div style={{ textAlign: "left", minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontSize: "var(--fs-12)", color: "#2C4060", fontWeight: 600 }}>
                                {h.name} · {h.roleName}
                              </span>
                              {h.tags.map((t) => (
                                <span key={t} className="lg-demo-tag">
                                  {t}
                                </span>
                              ))}
                            </div>
                            <div
                              style={{
                                fontSize: "var(--fs-12)",
                                color: "rgba(26,43,66,0.42)",
                                marginTop: 3,
                                lineHeight: 1.55,
                                ...(expanded
                                  ? { whiteSpace: "normal" }
                                  : {
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }),
                              }}
                            >
                              {h.scene}
                            </div>
                            <div
                              className="font-mono-nums"
                              style={{ fontSize: "var(--fs-12)", color: "#0D9B7A", letterSpacing: "0.05em", marginTop: 3 }}
                            >
                              {h.enterpriseCode} · {h.phone}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          className="lg-demo-more"
                          aria-label={expanded ? `收起${h.name}的场景说明` : `展开${h.name}的场景说明`}
                          aria-expanded={expanded}
                          title={expanded ? "收起场景说明" : "查看完整场景说明"}
                          onClick={() =>
                            setExpandedHints((prev) => {
                              const next = new Set(prev)
                              if (next.has(h.userId)) next.delete(h.userId)
                              else next.add(h.userId)
                              return next
                            })
                          }
                        >
                          <Info size={13} aria-hidden />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {/* 删除记住的企业：重点提示删除后果（仅清本设备记忆，确认后才删） */}
      {memoDeleteTarget && (
        <Modal
          open
          title="删除记住的企业？"
          onClose={() => setMemoDeleteTarget(null)}
          width={440}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="lg-warn-note" style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(217,119,6,0.07)", border: "1px solid rgba(217,119,6,0.25)", fontSize: "var(--fs-13)", lineHeight: 1.7 }}>
              <TriangleAlert size={17} aria-hidden style={{ marginTop: 2 }} />
              <span>
                删除后，<b>本设备将不再记住「{memoDeleteTarget.name}」</b>
                （编码 <code className="font-mono-nums">{memoDeleteTarget.code}</code>），
                下次登录需要重新输入该企业的企业编码。
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "var(--fs-13)", color: "rgba(26,43,66,0.5)", lineHeight: 1.7 }}>
              此操作只影响本设备的登录快捷记忆，不会影响你的账号、企业与该企业的关系，
              也不会通知任何人。再次用该企业编码登录成功后会重新记住。
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button
                type="button"
                className="lg-btn-soft"
                onClick={() => setMemoDeleteTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="lg-btn-solid"
                style={{ background: "linear-gradient(135deg, #C0392B 0%, #DC2626 100%)" }}
                onClick={() => {
                  deleteMemoEntry(memoDeleteTarget.code)
                  setMemoDeleteTarget(null)
                }}
              >
                <X size={14} aria-hidden />
                确认删除
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 找回密码：密码登录子方式「忘记密码？」入口；成功后回填登录账号并聚焦密码框 */}
      {forgotOpen && enterprise && (
        <ForgotPasswordModal
          enterprise={{ id: enterprise.id, name: enterprise.name, code: enterprise.code }}
          onClose={() => setForgotOpen(false)}
          onDone={(account) => {
            setForgotOpen(false)
            setVerifMethod("password")
            setFieldErrors({})
            setFormError(null)
            if (account) setAccount(account)
            window.setTimeout(() => passwordRef.current?.focus(), 60)
          }}
        />
      )}
    </div>
  )
}

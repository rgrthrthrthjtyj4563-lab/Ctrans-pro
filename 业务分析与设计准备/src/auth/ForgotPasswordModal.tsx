/**
 * 找回密码弹窗（2026-09-18 第一期缺口批次）：登录页「密码登录」子方式的
 * 「忘记密码？」入口。两步流程：
 *   ① 定位：输入本企业登录账号或手机号 → 网关定位重置目标（停用账号拦截）
 *      → 复用短信票据机制发送验证码（防枚举假码口径不变）；
 *   ② 重置：输入 6 位验证码 + 新密码（8-20 位含字母和数字）→ 覆盖密码并
 *      清除登录锁定（连错锁定可通过找回密码自助解除）。
 * 演示口径：验证码固定 123456 且明文回显，不发真实短信；生产由服务端完成。
 */
import { useState } from "react"
import { LoaderCircle, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react"
import { Modal } from "../components/Modal"
import { authGateway, PASSWORD_PATTERN, PASSWORD_RULE_TEXT, resetLoginPassword, resolveResetTarget } from "./mockGateway"

export interface ForgotPasswordTarget {
  /** 已解析的企业（登录第 1 段产物） */
  id: string
  name: string
  /** 企业编码（展示用） */
  code: string
}

type Step = "identify" | "reset" | "done"

const fieldStyle = {
  width: "100%",
  height: 46,
  borderRadius: 10,
  border: "1px solid rgba(26,43,66,0.14)",
  padding: "0 14px",
  fontSize: "var(--fs-14)",
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
  color: "rgba(26,43,66,0.9)",
} as const

export function ForgotPasswordModal({
  enterprise,
  onClose,
  onDone,
}: {
  enterprise: ForgotPasswordTarget
  onClose: () => void
  /** 重置成功：回填登录账号并聚焦密码框 */
  onDone: (account: string) => void
}) {
  const [step, setStep] = useState<Step>("identify")
  const [accountOrPhone, setAccountOrPhone] = useState("")
  const [resolved, setResolved] = useState<{ phone: string; account: string } | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [pwd, setPwd] = useState("")
  const [pwd2, setPwd2] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sendCode = async () => {
    setError(null)
    if (!accountOrPhone.trim()) {
      setError("请输入登录账号或手机号")
      return
    }
    setBusy(true)
    const target = resolveResetTarget(enterprise.id, accountOrPhone)
    if (!target.ok) {
      setBusy(false)
      setError(target.error)
      return
    }
    const sms = await authGateway.requestSms({ enterpriseId: enterprise.id, phone: target.phone })
    setBusy(false)
    if (!sms.ok) {
      setError(sms.failure.message)
      return
    }
    setResolved({ phone: target.phone, account: target.account })
    setDevCode(sms.devCode)
    setCode("")
    setPwd("")
    setPwd2("")
    setStep("reset")
  }

  const submitReset = async () => {
    if (!resolved) return
    setError(null)
    if (code.trim().length !== 6) {
      setError("请输入 6 位短信验证码")
      return
    }
    if (!PASSWORD_PATTERN.test(pwd)) {
      setError(`新密码不符合规则（${PASSWORD_RULE_TEXT}）`)
      return
    }
    if (pwd !== pwd2) {
      setError("两次输入的新密码不一致")
      return
    }
    setBusy(true)
    const result = await resetLoginPassword({
      workspaceId: enterprise.id,
      phone: resolved.phone,
      code: code.trim(),
      newPassword: pwd,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.failure.message)
      return
    }
    setStep("done")
  }

  return (
    <Modal
      open
      title="找回密码"
      onClose={onClose}
      width={460}
      footer={
        <div style={{ display: "flex", gap: 8, flex: 1, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 34, padding: "0 14px", borderRadius: 9, border: "1px solid rgba(26,43,66,0.14)",
              background: "#fff", color: "rgba(26,43,66,0.65)", fontSize: "var(--fs-13)", fontFamily: "inherit", cursor: "pointer",
            }}
          >
            {step === "done" ? "关闭" : "取消"}
          </button>
          {step === "reset" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitReset()}
              style={{
                height: 34, padding: "0 16px", borderRadius: 9, border: "none", background: "#19C59A",
                color: "#fff", fontSize: "var(--fs-13)", fontWeight: 600, fontFamily: "inherit",
                cursor: busy ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              {busy && <LoaderCircle size={14} style={{ animation: "spin 0.7s linear infinite" }} aria-hidden />}
              重置密码
            </button>
          )}
          {step === "done" && (
            <button
              type="button"
              onClick={() => onDone(resolved?.account ?? "")}
              style={{
                height: 34, padding: "0 16px", borderRadius: 9, border: "none", background: "#19C59A",
                color: "#fff", fontSize: "var(--fs-13)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              返回登录
            </button>
          )}
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            padding: "9px 13px", borderRadius: 10, fontSize: "var(--fs-12)", lineHeight: 1.6,
            background: "rgba(25,197,154,0.05)", border: "1px solid rgba(25,197,154,0.16)", color: "rgba(26,43,66,0.6)",
          }}
        >
          当前企业：<b style={{ color: "rgba(26,43,66,0.8)" }}>{enterprise.name}</b>
          <code className="font-mono-nums" style={{ marginLeft: 6, letterSpacing: "0.06em", color: "#0D9B7A" }}>{enterprise.code}</code>
          <span style={{ display: "block", color: "rgba(26,43,66,0.38)", marginTop: 2 }}>
            通过本企业绑定的手机号验证身份后重置密码；账号已停用时不可自助找回。
          </span>
        </div>

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#C73A3A", fontSize: "var(--fs-13)" }} role="alert">
            <TriangleAlert size={14} aria-hidden />
            {error}
          </div>
        )}

        {step === "identify" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="fp-account" style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: "rgba(26,43,66,0.55)" }}>
              登录账号或手机号
            </label>
            <input
              id="fp-account"
              value={accountOrPhone}
              onChange={(e) => setAccountOrPhone(e.target.value)}
              style={fieldStyle}
              placeholder="本企业内的登录账号或 11 位手机号"
              onKeyDown={(e) => {
                if (e.key === "Enter") void sendCode()
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendCode()}
              style={{
                height: 44, borderRadius: 10, border: "none", background: "#19C59A", color: "#fff",
                fontSize: "var(--fs-14)", fontWeight: 600, fontFamily: "inherit", cursor: busy ? "wait" : "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4,
              }}
            >
              {busy && <LoaderCircle size={16} style={{ animation: "spin 0.7s linear infinite" }} aria-hidden />}
              获取短信验证码
            </button>
          </div>
        )}

        {step === "reset" && resolved && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 13px", borderRadius: 12,
                background: "rgba(25,197,154,0.05)", border: "1px solid rgba(25,197,154,0.18)",
                color: "rgba(26,43,66,0.72)", fontSize: "var(--fs-13)", lineHeight: 1.6,
              }}
            >
              <Smartphone size={16} style={{ marginTop: 2, flexShrink: 0, color: "#0D9B7A" }} aria-hidden />
              <div>
                <div style={{ fontSize: "var(--fs-12)", color: "rgba(26,43,66,0.38)", marginBottom: 2 }}>
                  已发送至 {resolved.account} · 模拟短信 5 分钟内有效
                </div>
                【药合作】您的密码重置验证码是{" "}
                <span className="font-mono-nums" style={{ fontWeight: 800, color: "#0D9B7A", letterSpacing: "0.08em" }}>
                  {devCode}
                </span>
                ，请勿泄露。（演示环境直接回显，不发送真实短信）
              </div>
            </div>
            <div>
              <label htmlFor="fp-code" style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: "rgba(26,43,66,0.55)" }}>
                短信验证码
              </label>
              <input
                id="fp-code"
                className="font-mono-nums"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                style={{ ...fieldStyle, marginTop: 6, letterSpacing: "0.12em", fontWeight: 600 }}
                placeholder="请输入 6 位验证码"
              />
            </div>
            <div>
              <label htmlFor="fp-pwd" style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: "rgba(26,43,66,0.55)" }}>
                新密码
              </label>
              <input
                id="fp-pwd"
                type="password"
                autoComplete="new-password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                style={{ ...fieldStyle, marginTop: 6 }}
                placeholder={PASSWORD_RULE_TEXT}
              />
            </div>
            <div>
              <label htmlFor="fp-pwd2" style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: "rgba(26,43,66,0.55)" }}>
                确认新密码
              </label>
              <input
                id="fp-pwd2"
                type="password"
                autoComplete="new-password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                style={{ ...fieldStyle, marginTop: 6 }}
                placeholder="再次输入新密码"
              />
            </div>
          </div>
        )}

        {step === "done" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 0 8px" }}>
            <ShieldCheck size={34} style={{ color: "#0D9B7A" }} aria-hidden />
            <div style={{ fontSize: "var(--fs-15)", fontWeight: 700, color: "rgba(26,43,66,0.85)" }}>密码已重置</div>
            <div style={{ fontSize: "var(--fs-13)", color: "rgba(26,43,66,0.55)", textAlign: "center", lineHeight: 1.7 }}>
              账号 <b>{resolved?.account}</b> 的密码已更新，登录锁定已同步解除。
              <br />
              请使用新密码重新登录。
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

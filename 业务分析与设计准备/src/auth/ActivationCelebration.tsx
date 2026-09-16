/**
 * 首登激活庆祝弹框（待激活成员验证码通过、落在选药厂门页时的一次性欢迎弹框）。
 * 口径（2026-09-16 拍板）：无任何按钮、不可手动关闭（Esc/点遮罩均无效），
 * 5 秒后自动淡出消失；烟花开场自动燃放一次（用户要求保留）。
 * 挂载即计时，由父组件在 onDone 后卸载；不使用共享 Modal（其 Esc/× 与不可关闭口径冲突）。
 * prefers-reduced-motion 下跳过烟花与入场动画，计时口径不变。
 */
import { useEffect, useRef, useState } from "react"
import { ShieldCheck } from "lucide-react"
import "./authGates.css"

/** 角色名 → 称谓（正文「尊敬的 X 组长」用） */
function titleOfRole(roleName: string): string {
  if (roleName.includes("组长")) return "组长"
  if (roleName.includes("专员")) return "专员"
  if (roleName.includes("管理员")) return "管理员"
  return "同事"
}

const AUTO_DISMISS_MS = 5000
const FADE_OUT_MS = 320

/** 烟花粒子（口径移植自 stitch 设计稿：摩擦/重力/衰减/发光） */
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  size: number
  decay: number
  color: string
}

const FIREWORK_COLORS = [
  "#19C59A", "#0E8F76", "#6EE7B7", "#38BDF8",
  "#60A5FA", "#F59E0B", "#FBBF24", "#EC4899", "#A78BFA",
]

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function ActivationCelebration({
  name,
  roleName,
  orgName,
  pharmaCount,
  onDone,
}: {
  name: string
  roleName: string
  orgName: string
  pharmaCount: number
  onDone: () => void
}) {
  const [leaving, setLeaving] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(AUTO_DISMISS_MS / 1000)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const doneRef = useRef(false)

  // 5 秒自动消失：右上角读秒每秒递减，归零淡出后回调卸载
  // （一次性守卫，StrictMode 双 effect 不重复回调）
  useEffect(() => {
    const tick = window.setInterval(() => {
      setSecondsLeft((v) => {
        if (v <= 1) {
          window.clearInterval(tick)
          if (!doneRef.current) {
            setLeaving(true)
            window.setTimeout(() => {
              if (doneRef.current) return
              doneRef.current = true
              onDone()
            }, FADE_OUT_MS)
          }
          return 0
        }
        return v - 1
      })
    }, 1000)
    return () => window.clearInterval(tick)
  }, [onDone])

  // 烟花：挂载即自动燃放一组错峰爆点；rAF 循环与延迟爆点随卸载全部清理
  useEffect(() => {
    if (reducedMotion()) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const particles: Particle[] = []
    const burst = (x: number, y: number, count: number) => {
      const palette = [
        FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
        FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
        "#FFFFFF",
      ]
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2
        const speed = Math.random() * 5 + 2
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          size: Math.random() * 3 + 1.5,
          decay: Math.random() * 0.015 + 0.012,
          color: palette[Math.floor(Math.random() * palette.length)],
        })
      }
    }
    const w = () => window.innerWidth
    const h = () => window.innerHeight
    burst(w() * 0.25, h() * 0.35, 55)
    burst(w() * 0.75, h() * 0.32, 55)
    const t1 = window.setTimeout(() => burst(w() * 0.5, h() * 0.22, 70), 180)
    const t2 = window.setTimeout(() => {
      burst(w() * 0.35, h() * 0.45, 50)
      burst(w() * 0.65, h() * 0.42, 50)
    }, 350)

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i]
        p.vx *= 0.96
        p.vy = p.vy * 0.96 + 0.12
        p.x += p.vx
        p.y += p.vy
        p.alpha -= p.decay
        if (p.alpha <= 0) {
          particles.splice(i, 1)
          continue
        }
        ctx.save()
        ctx.globalAlpha = p.alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.shadowBlur = 8
        ctx.shadowColor = p.color
        ctx.fill()
        ctx.restore()
      }
      rafId = window.requestAnimationFrame(loop)
    }
    let rafId = window.requestAnimationFrame(loop)
    return () => {
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <div
      className={`act-cele-overlay${leaving ? " act-cele-overlay--leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="账号激活成功欢迎弹框"
    >
      <canvas ref={canvasRef} className="act-cele-canvas" aria-hidden />
      <div className="act-cele-card">
        <div className="act-cele-ribbon act-cele-ribbon--l" aria-hidden />
        <div className="act-cele-ribbon act-cele-ribbon--r" aria-hidden />
        <span className="act-cele-countdown" role="timer" aria-label={`${secondsLeft}秒后自动关闭`}>
          <span className="act-cele-countdown-num">{secondsLeft}</span>s 后自动关闭
        </span>
        <div className="act-cele-icon" aria-hidden>
          <ShieldCheck size={30} strokeWidth={2.2} />
        </div>
        <span className="act-cele-badge">
          <span className="act-cele-badge-dot" aria-hidden />
          企业账号首次登录并激活成功
        </span>
        <h3 className="act-cele-title">欢迎加入药合作协同体系！</h3>
        <p className="act-cele-body">
          尊敬的 <strong>{name}</strong> {titleOfRole(roleName)}，您所属的{" "}
          <strong>{orgName}</strong> 已为您授权 <strong className="act-cele-count">{pharmaCount}</strong>{" "}
          家药厂的业务协作权限。请在主界面中选择本次要进入的业务空间，开始您的数字协同工作。
        </p>
      </div>
    </div>
  )
}

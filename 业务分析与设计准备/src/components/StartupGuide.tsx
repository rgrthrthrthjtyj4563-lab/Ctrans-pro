import { useEffect, type CSSProperties } from "react"
import { ArrowRight, Check, ChevronRight, Play, ShieldCheck, X } from "lucide-react"
import type { PageId } from "../types"

/**
 * 新手引导「合作启动步骤」（2026-09-21，2026-09-23 调整为准入→合同→品种→价目）：
 * 顶栏胶囊入口 + 工作台欢迎卡 + 右侧抽屉，仅药厂会话可见。
 * 2026-10-14：取消手动标记完成——完成态由 useStartupGuide 按各板块是否存在
 * 本厂数据现查现算（创建即完成、不追数据结局），抽屉不再提供「完成」按钮。
 * 文案对齐设计稿；步骤跳转走 AppShell navigate（自带越权拦截）。
 */

/** 引导主标题（欢迎卡、抽屉、顶栏胶囊共用） */
export const STARTUP_GUIDE_TITLE = "合作启动步骤"
/** 引导副标题（欢迎卡、抽屉共用） */
export const STARTUP_GUIDE_SUBTITLE = "完成准入、合同、品种与价目的基础配置后，即可安心开展后续业务。"

/** 合作启动步骤配置（顺序即推荐路径） */
export interface StartupGuideStep {
  id: string
  title: string
  description: string
  targetPage: PageId
  targetLabel: string
}

export const STARTUP_GUIDE_STEPS: StartupGuideStep[] = [
  {
    id: "vendor-admission",
    title: "发起服务商准入",
    description: "在「服务商准入」选择准入模板创建准入任务，并将一次性准入码线下告知服务商；发起后即视为完成本步。",
    targetPage: "vendor-access",
    targetLabel: "服务商准入",
  },
  {
    id: "contract-upload",
    title: "服务商上传合作合同",
    description: "准入通过后，提醒服务商上传双方线下签署的合作合同，核对无误后归档存证。",
    targetPage: "contract-management",
    targetLabel: "合同管理",
  },
  {
    id: "variety-entry",
    title: "录入品种管理信息",
    description: "维护本厂可推广品种的主数据（通用名、规格、批准文号等），作为授权与价目配置的基础。",
    targetPage: "varieties",
    targetLabel: "品种管理",
  },
  {
    id: "price-config",
    title: "价目表配置",
    description: "为品种配置服务单价与结算规则，作为后续任务发布与结算的依据。",
    targetPage: "price-config",
    targetLabel: "价目表配置",
  },
]

/**
 * 价目板块「已有配置」的一次性本地标记（原型口径，无后端）：
 * 价目表页的数据是组件私有 state，工作台层读不到，用首次产生配置时落一个
 * 永不复位的标记代记录——创建即完成、不追数据结局。
 */
export const PRICE_CONFIG_STARTED_KEY = "baiyee-price-config-started-v1"

export function markPriceConfigStarted() {
  try {
    window.localStorage.setItem(PRICE_CONFIG_STARTED_KEY, "1")
  } catch {
    /* 写失败静默降级（隐私模式仅内存会话） */
  }
}

export function isPriceConfigStarted(): boolean {
  try {
    return window.localStorage.getItem(PRICE_CONFIG_STARTED_KEY) === "1"
  } catch {
    return false
  }
}

/** 工作台欢迎引导卡注入的状态与回调（AppShell → Dashboard） */
export interface StartupGuideBannerState {
  userName: string
  completedCount: number
  total: number
  /** 本次会话是否展示（「稍后再说」只关当前会话；全部完成后永久隐藏） */
  visible: boolean
  onOpen: () => void
  onDismiss: () => void
}

const TOPBAR_HEIGHT = 52

/* ── 工作台欢迎引导卡 ─────────────────────────────────────────── */

export function StartupGuideBanner({ state }: { state: StartupGuideBannerState }) {
  /* 本次会话被「稍后再说」关闭、或全部完成后不再展示（顶栏胶囊仍可打开抽屉查看） */
  if (!state.visible) return null
  const percent = state.total === 0 ? 0 : Math.round((state.completedCount / state.total) * 100)
  return (
    <section
      style={{
        position: "relative",
        background: "var(--color-brand-subtle)",
        borderRadius: 8,
        padding: "18px 20px",
        display: "flex",
        alignItems: "stretch",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            background: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-brand)",
            flexShrink: 0,
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <ShieldCheck size={22} aria-hidden="true" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: "var(--fs-15)", fontWeight: 700, color: "var(--color-text-1)" }}>
            欢迎回来，{state.userName}
          </span>
          <span style={{ fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--color-text-1)" }}>
            建议先完成：{STARTUP_GUIDE_TITLE}
          </span>
          <span style={{ fontSize: "var(--fs-12)", color: "var(--color-text-2)" }}>
            {STARTUP_GUIDE_SUBTITLE}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: "var(--color-text-2)" }}>
              已完成 {state.completedCount}/{state.total} 项
            </span>
            <div style={{ width: 144, height: 6, borderRadius: 999, background: "#FFFFFF", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${percent}%`,
                  borderRadius: 999,
                  background: "var(--color-brand)",
                  transition: "width 200ms ease",
                }}
              />
            </div>
            <span style={{ fontSize: "var(--fs-11)", color: "var(--color-text-3)" }}>完成度 {percent}%</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0, paddingRight: 56 }}>
        <button type="button" className="sg-banner-cta" onClick={state.onOpen}>
          <Play size={14} aria-hidden="true" />
          <span>开始设置</span>
        </button>
      </div>
      <button
        type="button"
        onClick={state.onDismiss}
        title="暂时关闭提示"
        aria-label="稍后再说，关闭欢迎引导卡"
        style={{
          position: "absolute",
          top: 10,
          right: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: "var(--fs-11)",
          color: "var(--color-text-3)",
          padding: "2px 4px",
          borderRadius: 4,
        }}
      >
        稍后再说
        <X size={12} aria-hidden="true" />
      </button>
    </section>
  )
}

/* ── 右侧「业务启动步骤」抽屉 ─────────────────────────────────── */

interface StartupGuideDrawerProps {
  open: boolean
  onClose: () => void
  completedSteps: string[]
  onNavigate: (page: PageId) => void
}

const stepTagStyle = (tone: "amber" | "gray" | "green"): CSSProperties => ({
  flexShrink: 0,
  fontSize: "var(--fs-11)",
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: 4,
  border: "1px solid transparent",
  ...(tone === "amber"
    ? { color: "#C77A16", background: "#FEF6EB", borderColor: "#F3E2C2" }
    : tone === "green"
      ? { color: "#248A5A", background: "#EAF6F0", borderColor: "#CDEBDD" }
      : { color: "var(--color-text-3)", background: "#F3F4F6", borderColor: "var(--color-border)" }),
})

export function StartupGuideDrawer({ open, onClose, completedSteps, onNavigate }: StartupGuideDrawerProps) {
  /* Esc 关闭（对齐 Modal 的 window keydown 模式） */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const completedSet = new Set(completedSteps)
  const completedCount = STARTUP_GUIDE_STEPS.filter((step) => completedSet.has(step.id)).length
  const total = STARTUP_GUIDE_STEPS.length
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100)
  /* 当前步 = 推荐路径上第一个未完成步；全部完成则无高亮 */
  const activeIndex = STARTUP_GUIDE_STEPS.findIndex((step) => !completedSet.has(step.id))

  return (
    <>
      <div
        className="sg-overlay"
        onClick={onClose}
        style={{
          position: "fixed",
          top: TOPBAR_HEIGHT,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(17, 24, 39, 0.35)",
          zIndex: 90,
        }}
      />
      <aside
        className="sg-panel"
        role="dialog"
        aria-modal="true"
        aria-label={STARTUP_GUIDE_TITLE}
        style={{
          position: "fixed",
          top: TOPBAR_HEIGHT,
          right: 0,
          bottom: 0,
          width: "min(420px, 100vw)",
          background: "#FFFFFF",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.12)",
          zIndex: 91,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 头部：标签 + 标题 + 描述 + 进度卡 */}
        <div style={{ padding: "14px 20px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: "var(--fs-11)",
                fontWeight: 500,
                color: "var(--color-text-3)",
                background: "#F3F4F6",
                padding: "3px 10px",
                borderRadius: 999,
              }}
            >
              新手引导 · 推荐路径
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={`关闭${STARTUP_GUIDE_TITLE}`}
              title="关闭"
              style={{
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: "transparent",
                borderRadius: 6,
                cursor: "pointer",
                color: "var(--color-text-3)",
              }}
            >
              <X size={16} />
            </button>
          </div>
          <h2 style={{ margin: "10px 0 0", fontSize: "var(--fs-16)", fontWeight: 700, color: "var(--color-text-1)" }}>
            {STARTUP_GUIDE_TITLE}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "var(--fs-12)", color: "var(--color-text-3)", lineHeight: 1.6 }}>
            {STARTUP_GUIDE_SUBTITLE}
          </p>
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              background: "#F9FAFB",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: "var(--color-text-1)" }}>
                {completedCount}/{total} 已完成
              </span>
              <span style={{ fontSize: "var(--fs-11)", color: "var(--color-text-3)" }}>预计耗时 3 分钟</span>
            </div>
            <div style={{ marginTop: 8, height: 6, borderRadius: 999, background: "var(--color-border)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${percent}%`,
                  borderRadius: 999,
                  background: "var(--color-brand)",
                  transition: "width 200ms ease",
                }}
              />
            </div>
          </div>
        </div>

        {/* 步骤卡片列表 */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {STARTUP_GUIDE_STEPS.map((step, index) => {
            const isDone = completedSet.has(step.id)
            const isActive = index === activeIndex
            return (
              <div
                key={step.id}
                style={{
                  border: isActive ? "2px solid var(--color-brand)" : "1px solid var(--color-border)",
                  borderRadius: 8,
                  padding: isActive ? 13 : 14,
                  background: isActive ? "var(--color-brand-subtle)" : "#FFFFFF",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {isDone ? (
                      <span
                        aria-hidden="true"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: "#248A5A",
                          color: "#FFFFFF",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: isActive ? "var(--color-brand)" : "#E5E7EB",
                          color: isActive ? "#FFFFFF" : "var(--color-text-2)",
                          fontSize: "var(--fs-11)",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {index + 1}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: "var(--fs-13)",
                        fontWeight: 600,
                        color: isDone ? "var(--color-text-2)" : "var(--color-text-1)",
                      }}
                    >
                      {step.title}
                    </span>
                  </div>
                  {isDone ? (
                    <span style={stepTagStyle("green")}>已完成</span>
                  ) : isActive ? (
                    <span style={stepTagStyle("amber")}>待完成</span>
                  ) : (
                    <span style={stepTagStyle("gray")}>未开始</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: "var(--fs-12)", color: "var(--color-text-3)", lineHeight: 1.6 }}>
                  {step.description}
                </p>
                {!isDone && (
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <button
                      type="button"
                      className={isActive ? "sg-step-btn sg-step-btn--primary" : "sg-step-link"}
                      onClick={() => onNavigate(step.targetPage)}
                    >
                      <span>前往处理 · {step.targetLabel}</span>
                      {isActive ? <ArrowRight size={13} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 底部说明 */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--color-border)", background: "#F9FAFB" }}>
          <span style={{ fontSize: "var(--fs-11)", color: "var(--color-text-3)" }}>
            完成状态由系统按各板块是否已有数据自动判定，无需手动标记。
          </span>
        </div>
      </aside>
    </>
  )
}

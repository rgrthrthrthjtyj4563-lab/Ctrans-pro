/**
 * 三级直达专员绩效 · 共享 UI（一级总列表 / 二级专员名单 / Figma 版考核弹窗 / 依据 / 记录 / 退回）
 * 交互与样式依据 outputs/直达专员绩效工作台.html（含 Figma 版弹窗）；
 * 数据口径见 src/data/directPerformance.ts。PerformanceTeamQuality 与 PerformanceSpecialist
 * 两个入口共用本文件的弹窗与写路径，保证同一条记录只有一个可信状态。
 */
import { useEffect, useMemo, useState } from "react"
import { Modal } from "../components/Modal"
import { Button } from "../components/Button"
import { formatCNY } from "../constants"
import { usePerfSettings, getEvalDimensions } from "../data/performanceData"
import type { Task } from "../types"
import {
  MIN_RATIO,
  type DirectPerfItem,
  type DirectPerfOp,
  type DirectPerfRecord,
  type DirectAssessment,
  type LinkedRecordsResult,
  amountRange,
  assessedOf,
  baseCentsOf,
  formatCentsText,
  linkedRecordsOf,
  ratioOf,
  ratioText,
  returnedOf,
  toCents,
  validateAmountCents,
  validateScore,
  weightedScoreOf,
  workloadOf,
} from "../data/directPerformance"

// ── Figma 版考核弹窗样式（移植自最终 HTML，前缀 dpa-） ────────────────────────

const DPA_CSS = `
.dpa-head { display:flex; align-items:flex-start; gap:16px; padding:24px 28px 20px; border-bottom:1px solid #f1f5f9 }
.dpa-avatar { flex:none; display:grid; place-items:center; width:44px; height:44px; border-radius:50%; background:#f0fdfa; box-shadow:0 0 0 1px #ccfbf1; color:#115e59; font-size:15px; font-weight:650 }
.dpa-identity { flex:1; min-width:0 }
.dpa-name { display:flex; align-items:center; gap:8px; flex-wrap:wrap }
.dpa-name h2 { margin:0; color:#0f172a; font-size:17px; line-height:1.45; font-weight:650 }
.dpa-status { padding:2px 6px; border-radius:6px; background:#fffbeb; box-shadow:0 0 0 1px #fde68ab3; color:#92400e; font-size:11px; white-space:nowrap }
.dpa-sub { margin:4px 0 0; color:#64748b; font-size:12.5px }
.dpa-close { color:#64748b; font-size:18px; margin:-4px -8px 0 0; flex:none; border:0; background:none; border-radius:5px; width:36px; height:36px; line-height:1; cursor:pointer }
.dpa-close:hover { background:#f1f5f9 }
.dpa-body { overflow:auto; overscroll-behavior:contain; padding:24px 28px; flex:1; min-height:0 }
.dpa-foot { border-top:1px solid #f1f5f9; display:flex; align-items:center; justify-content:flex-start; flex-wrap:wrap; gap:16px; padding:16px 28px; background:#fff }
.dpa-section + .dpa-section { margin-top:28px }
.dpa-section-title { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; margin-bottom:12px }
.dpa-section-title b { color:#0f766e; font-size:11px; letter-spacing:.055em }
.dpa-section-title h3 { margin:0; font-size:14.5px; font-weight:650 }
.dpa-section-title small { margin-left:auto; color:#64748b; font-size:12px }
.dpa-table { border:1px solid #e2e8f0; border-radius:12px; overflow:auto }
.dpa-table table { width:100%; border-collapse:separate; border-spacing:0; font-size:13px }
.dpa-table th, .dpa-table td { padding:10px 16px; border-bottom:1px solid #f1f5f9; text-align:left }
.dpa-table thead th { background:#f8fafc; color:#475569; font-weight:500; white-space:nowrap }
.dpa-table tbody th { font-weight:500; background:#fff; white-space:nowrap }
.dpa-table tbody td { color:#334155; white-space:nowrap }
.dpa-table tbody td:last-child, .dpa-table tbody td.num, .dpa-table thead th.num { color:#0f172a; font-weight:550; text-align:right }
.dpa-table thead th.num { text-align:right; font-weight:500; color:#475569 }
.dpa-table tfoot td { background:#f8fafc; color:#475569; font-size:12.5px; border-bottom:0 }
.dpa-table tfoot td.num { color:#0f172a; font-size:14px; font-weight:650 }
.dpa-dot { display:inline-block; width:6px; height:6px; margin-right:8px; border-radius:50%; background:#6366f1; vertical-align:middle }
.dpa-dot.day { background:#0ea5e9 }
.dpa-hint { color:#64748b; font-size:12px; margin:8px 0 0 }
.dpa-amount-box { padding:20px; border:1px solid #e2e8f0; border-radius:12px; background:#f8fafc }
.dpa-amount-box.invalid { background:#fff1f2; border-color:#fecdd3 }
.dpa-amount-line { display:flex; align-items:flex-end; flex-wrap:wrap; column-gap:32px; row-gap:12px }
.dpa-amount-line label, .dpa-aside-label { display:block; color:#475569; font-size:12px; font-weight:550; margin-bottom:5px }
.dpa-input-wrap { display:flex; align-items:center; gap:4px; max-width:100%; width:220px; height:48px; padding:0 12px; border:1px solid #cbd5e1; border-radius:8px; background:#fff }
.dpa-input-wrap span { color:#64748b; font-size:18px; font-weight:550 }
.dpa-input-wrap input { width:100%; min-width:0; padding:0; border:0; background:none; color:#0f172a; font-size:22px; font-weight:650; font-variant-numeric:tabular-nums; outline:none; appearance:textfield }
.dpa-input-wrap input::-webkit-inner-spin-button, .dpa-input-wrap input::-webkit-outer-spin-button { appearance:none; margin:0 }
.dpa-input-wrap:focus-within { outline:2px solid #0f766e; outline-offset:1px }
.dpa-input-wrap:has(input[aria-invalid="true"]) { border-color:#fb7185 }
.dpa-readout { padding-bottom:3px }
.dpa-readout .dpa-aside-label { margin-bottom:0 }
.dpa-readout output { color:#0f766e; font-size:22px; font-weight:650; font-variant-numeric:tabular-nums }
.dpa-delta { color:#64748b; font-size:12.5px; padding-bottom:7px; margin:0; font-variant-numeric:tabular-nums }
.dpa-delta.positive { color:#92400e }
.dpa-restore { margin-left:auto; margin-bottom:5px; border:0; border-radius:6px; background:transparent; color:#0f766e; padding:4px 8px; font-size:12.5px; font-weight:600; cursor:pointer }
.dpa-restore:hover { background:#f0fdfa }
.dpa-slider-zone { margin-top:24px }
.dpa-slider-track { position:relative; height:24px }
.dpa-slider-track::before { content:""; position:absolute; inset:9px 0; border-radius:20px; background:linear-gradient(90deg,#0d9488 var(--slider-progress),#e2e8f0 var(--slider-progress)); pointer-events:none }
.dpa-slider-box.invalid .dpa-slider-track::before { background:linear-gradient(90deg,#f43f5e var(--slider-progress),#e2e8f0 var(--slider-progress)) }
.dpa-slider-track::after { content:""; position:absolute; left:var(--slider-default); width:1px; top:5px; height:14px; background:#94a3b8; pointer-events:none }
.dpa-slider-track input { position:absolute; z-index:1; inset:0; width:100%; height:24px; padding:0; margin:0; appearance:none; border:0; border-radius:0; background:none; cursor:pointer }
.dpa-slider-track input::-webkit-slider-runnable-track { height:24px; background:transparent }
.dpa-slider-track input::-webkit-slider-thumb { appearance:none; width:20px; height:20px; margin-top:2px; border-radius:50%; background:#fff; border:2px solid #0f766e; box-shadow:0 2px 6px #0f172a2e }
.dpa-slider-track input::-moz-range-thumb { width:16px; height:16px; border-radius:50%; background:#fff; border:2px solid #0f766e; box-shadow:0 2px 6px #0f172a2e }
.dpa-scale { position:relative; display:flex; justify-content:space-between; margin-top:4px; color:#64748b; font-size:11px; font-variant-numeric:tabular-nums }
.dpa-scale .dpa-default-tick { position:absolute; left:var(--slider-default); transform:translateX(-50%); color:#475569; white-space:nowrap }
.dpa-error { color:#be123c; font-size:12.5px; margin:10px 0 0 }
.dpa-reason { margin-top:16px }
.dpa-reason .required { color:#be123c }
.dpa-preset-row { display:flex; flex-wrap:wrap; gap:6px; margin:2px 0 3px }
.dpa-preset-row button { border:0; border-radius:999px; color:#475569; padding:4px 10px; background:#f1f5f9; font-size:12px; cursor:pointer }
.dpa-preset-row button:hover { background:#f0fdfa; color:#115e59 }
.dpa-reason textarea { width:100%; border:1px solid #cbd5e1; border-radius:7px; padding:6px 10px; font:inherit; resize:vertical }
.dpa-reason textarea:focus { outline:2px solid #0f766e; outline-offset:1px }
.dpa-reason textarea[aria-invalid="true"] { border-color:#fb7185 }
.dpa-score-box { border:1px solid #e2e8f0; border-radius:12px; overflow:hidden }
.dpa-score { display:flex; align-items:center; gap:16px; padding:14px 16px }
.dpa-score + .dpa-score { border-top:1px solid #f1f5f9 }
.dpa-score-text { flex:1; min-width:0 }
.dpa-score-text label { display:inline-block; font-size:13.5px; font-weight:550; color:#1e293b; margin-right:6px }
.dpa-weight { display:inline-block; padding:1px 6px; border-radius:4px; background:#f1f5f9; color:#475569; font-size:11px; white-space:nowrap }
.dpa-score-note { margin:2px 0 0; font-size:12px; color:#64748b }
.dpa-score-note.invalid { color:#be123c }
.dpa-contribution { width:86px; color:#64748b; font-size:12px; text-align:right; font-variant-numeric:tabular-nums }
.dpa-score input { flex:none; width:84px; height:40px; padding:0 5px; text-align:center; font-size:16px; font-weight:650; border:1px solid #cbd5e1; border-radius:8px; font-variant-numeric:tabular-nums; appearance:textfield; outline:none }
.dpa-score input::-webkit-inner-spin-button, .dpa-score input::-webkit-outer-spin-button { appearance:none; margin:0 }
.dpa-score input.adjusted { border-color:#fcd34d }
.dpa-score input[aria-invalid="true"] { border-color:#fb7185 }
.dpa-score-total { border-top:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; background:#f0fdfa; color:#334155; font-size:13px; font-weight:550 }
.dpa-score-total small { font-weight:400; margin-left:8px; color:#64748b; font-size:12px }
.dpa-score-total output { color:#115e59; font-weight:650; font-size:22px; font-variant-numeric:tabular-nums }
.dpa-foot-values { display:flex; align-items:center; gap:24px; color:#475569; font-size:12px }
.dpa-foot-values div + div { border-left:1px solid #e2e8f0; padding-left:24px }
.dpa-foot-values b { display:block; color:#0f172a; font-weight:650; font-size:17px; font-variant-numeric:tabular-nums }
.dpa-foot-actions { display:flex; gap:10px; margin-left:auto }
.dpa-miss { border-radius:8px; background:#fff1f2; border:1px solid #fecdd3; color:#9f1239; font-size:12.5px; padding:8px 12px; margin:0 0 14px }
.dpa-money-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px 12px; padding:10px; background:#f3f8f4; border-radius:7px; font-size:12px }
.dpa-money-grid b { display:block; font-size:16px }
`

const REASON_PRESETS = ["服务记录存在缺项", "拜访质量未达标准", "超额完成服务目标", "客户反馈突出"]

function StyleBlock() {
  return <style>{DPA_CSS}</style>
}

// ── 直达列表共享 UI（分段状态切换 / 人员格 / 状态徽标 / 表格悬停） ─────────────

const DIRECT_UI_CSS = `
.dpq-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:20px; font-size:11px; font-weight:650; white-space:nowrap }
.dpq-pill::before { content:""; width:5px; height:5px; border-radius:50%; background:currentColor }
.dpq-pill.dpq-pending { background:#FBF2DF; color:#855613 }
.dpq-pill.dpq-active { background:#E8F4EE; color:#115E59 }
.dpq-roster tbody tr { transition: background 120ms ease }
.dpq-roster tbody tr:hover > td { background:#F6FAF7 }
.dpq-seg { display:inline-flex; background:#F2F4F7; border-radius:8px; padding:3px; gap:2px }
.dpq-seg button { border:1px solid transparent; background:transparent; color:#667085; font-size:12.5px; font-weight:500; padding:5px 12px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; font-family:inherit; white-space:nowrap }
.dpq-seg button[aria-pressed="true"] { background:#fff; border-color:var(--color-border); color:var(--color-brand); font-weight:650; box-shadow:0 1px 2px rgba(16,24,40,.06) }
.dpq-seg .dpq-cnt { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; color:#98A2B3 }
.dpq-seg button[aria-pressed="true"] .dpq-cnt { color:var(--color-brand); opacity:.75 }
.dpq-avatar { flex:none; display:grid; place-items:center; width:34px; height:34px; border-radius:50%; background:var(--color-brand-subtle, #E8F4EE); color:var(--color-brand, #176451); font-weight:650; font-size:13px }
`

/** 页面级直达 UI 样式（每个使用页渲染一次） */
export function DirectUiStyle() {
  return <style>{DIRECT_UI_CSS}</style>
}

/** 考核状态徽标（带圆点） */
export function DirectStatusPill({ status }: { status: "待考核" | "已考核" }) {
  return <span className={`dpq-pill ${status === "已考核" ? "dpq-active" : "dpq-pending"}`}>{status}</span>
}

/** 分段式状态切换（全部 / 待考核 / 已考核，含计数） */
export function DirectSegmentedTabs({
  current,
  counts,
  onChange,
  ariaLabel = "考核状态筛选",
}: {
  current: "all" | "待考核" | "已考核"
  counts: { all: number; 待考核: number; 已考核: number }
  onChange: (tab: "all" | "待考核" | "已考核") => void
  ariaLabel?: string
}) {
  const tabs: ("all" | "待考核" | "已考核")[] = ["all", "待考核", "已考核"]
  return (
    <div className="dpq-seg" role="group" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button key={tab} type="button" aria-pressed={current === tab} onClick={() => onChange(tab)}>
          {tab === "all" ? "全部" : tab}
          <span className="dpq-cnt">{counts[tab]}</span>
        </button>
      ))}
    </div>
  )
}

/** 人员格：头像 + 姓名 + 账号 */
export function DirectPersonCell({ name, account }: { name: string; account: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <span className="dpq-avatar" aria-hidden="true">
        {name.slice(0, 1)}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-text-1)", lineHeight: 1.35 }}>{name}</div>
        <div style={{ fontSize: 11, color: "#98A2B3", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: 1.4 }}>
          {account}
        </div>
      </div>
    </div>
  )
}

function parseAmountCents(text: string): number {
  const trimmed = text.trim()
  if (!trimmed || !Number.isFinite(Number(trimmed))) return Number.NaN
  return Math.round(Number(trimmed) * 100)
}

// ── Figma 版考核弹窗 ─────────────────────────────────────────────────────────

export interface AssessmentSubmitInput {
  cents: number
  scores: [number, number, number, number]
  reason: string
}

export function DirectAssessmentModal({
  open,
  record,
  onClose,
  onSubmit,
}: {
  open: boolean
  record: DirectPerfRecord | null
  onClose: () => void
  /** 提交（父组件执行写路径校验与留痕）；返回错误文本则就近展示 */
  onSubmit: (input: AssessmentSubmitInput) => string | null
}) {
  const settings = usePerfSettings()
  const dimensions = getEvalDimensions(settings)
  const capRatio = settings.capRatio
  const weights = settings.weights

  const [amountText, setAmountText] = useState("")
  const [sliderValue, setSliderValue] = useState(1)
  const [scoreTexts, setScoreTexts] = useState(["1.00", "1.00", "1.00", "1.00"])
  const [reason, setReason] = useState("")
  const [amountTouched, setAmountTouched] = useState(false)
  const [scoreTouched, setScoreTouched] = useState([false, false, false, false])
  const [attempted, setAttempted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // 打开或切换专员时重置（默认金额、绩效比 1.00、评分全部 1.00）
  useEffect(() => {
    if (!open || !record) return
    setAmountText((baseCentsOf(record.items) / 100).toFixed(2))
    setSliderValue(1)
    setScoreTexts(["1.00", "1.00", "1.00", "1.00"])
    setReason("")
    setAmountTouched(false)
    setScoreTouched([false, false, false, false])
    setAttempted(false)
    setSubmitError(null)
  }, [open, record])

  const baseCents = record ? baseCentsOf(record.items) : 0
  const { min, max } = amountRange(baseCents, capRatio)
  const cents = parseAmountCents(amountText)
  const amountError = Number.isNaN(cents)
    ? "请输入有效金额"
    : validateAmountCents(cents, baseCents, capRatio)
  const showAmountError = (amountTouched || attempted) && amountError !== null
  const changed = !Number.isNaN(cents) && cents !== baseCents
  const reasonMissing = changed && !reason.trim()
  const ratio = !Number.isNaN(cents) && baseCents > 0 ? ratioOf(cents, baseCents) : null

  const parsedScores = useMemo(
    () => scoreTexts.map((text) => Number(text)) as unknown as [number, number, number, number],
    [scoreTexts],
  )
  const scoreErrors = parsedScores.map((value) => validateScore(value))
  const showScoreErrors = scoreTouched.map((touched, i) => (touched || attempted) && scoreErrors[i] !== null)
  const scoresValid = scoreErrors.every((error) => error === null)
  const weighted = scoresValid ? weightedScoreOf(parsedScores, weights) : null

  const canSubmit =
    record != null &&
    !record.missingPrice &&
    baseCents > 0 &&
    amountError === null &&
    !reasonMissing &&
    scoresValid

  if (!record) return null

  const applySlider = (value: number) => {
    setSliderValue(value)
    const nextCents = Math.round(baseCents * value)
    setAmountText((nextCents / 100).toFixed(2))
  }
  const applyAmountText = (text: string) => {
    setAmountText(text)
    const parsed = parseAmountCents(text)
    // 手输金额实时反算绩效比与滑块位置；滑块刻度不把手输金额反算回去
    if (!Number.isNaN(parsed) && baseCents > 0) setSliderValue(Math.min(capRatio, Math.max(MIN_RATIO, parsed / baseCents)))
  }
  const restoreDefault = () => {
    setSliderValue(1)
    setAmountText((baseCents / 100).toFixed(2))
  }
  const appendReasonPreset = (preset: string) => {
    setReason((current) => {
      const trimmed = current.trim()
      if (trimmed.split("；").includes(preset)) return current
      const next = trimmed ? `${trimmed}；${preset}` : preset
      return next.slice(0, 200)
    })
  }
  const commitScoreText = (index: number) => {
    setScoreTouched((prev) => prev.map((t, i) => (i === index ? true : t)))
    setScoreTexts((prev) =>
      prev.map((text, i) => {
        if (i !== index) return text
        const parsed = Number(text)
        return Number.isFinite(parsed) && validateScore(parsed) === null ? parsed.toFixed(2) : text
      }),
    )
  }

  const handleSubmit = () => {
    setAttempted(true)
    setAmountTouched(true)
    setSubmitError(null)
    if (!canSubmit) return
    const error = onSubmit({
      cents,
      scores: parsedScores.map((value) => Math.round(value * 100) / 100) as [number, number, number, number],
      reason,
    })
    if (error) setSubmitError(error)
  }

  const sliderPct = ((sliderValue - MIN_RATIO) / (capRatio - MIN_RATIO)) * 100
  const defaultPct = ((1 - MIN_RATIO) / (capRatio - MIN_RATIO)) * 100

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`直达专员考核 · ${record.specialist}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "#0f172a73" }} onClick={onClose} />
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 760,
          maxHeight: "calc(100dvh - 64px)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px -20px #0f172a73",
          color: "#0f172a",
          overflow: "hidden",
        }}
      >
        <StyleBlock />
        <div className="dpa-head">
          <span className="dpa-avatar" aria-hidden="true">
            {record.specialist.slice(-2)}
          </span>
          <div className="dpa-identity">
            <div className="dpa-name">
              <h2>
                {returnedOf(record) ? "直达专员重新考核 · " : "直达专员考核 · "}
                {record.specialist}
              </h2>
              <span className="dpa-status">待考核</span>
            </div>
            <p className="dpa-sub">
              {record.taskNo} · {record.taskName} · {record.serviceMonth}
            </p>
          </div>
          <button type="button" className="dpa-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="dpa-body">
          {record.missingPrice && (
            <p className="dpa-miss">
              「{record.items.filter((i) => i.privateUnitPrice == null).map((i) => i.itemName).join("、")}
              」缺少适用的对私单价，不能确认金额；不能用对公单价或结算金额兜底。请联系管理员补齐价格来源后再考核。
            </p>
          )}

          <section className="dpa-section">
            <div className="dpa-section-title">
              <b aria-hidden="true">01</b>
              <h3>工作量与计价</h3>
              <small>有效工作量合计 {workloadOf(record.items)} 次</small>
            </div>
            <div className="dpa-table" role="region" aria-label="工作量与计价">
              <table>
                <thead>
                  <tr>
                    <th scope="col">业务分项</th>
                    <th scope="col" className="num">
                      有效工作量
                    </th>
                    <th scope="col" className="num">
                      对私单价
                    </th>
                    <th scope="col" className="num">
                      小计
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {record.items.map((item) => (
                    <tr key={item.key}>
                      <th scope="row">
                        <span aria-hidden="true" className={`dpa-dot${item.itemName === "医院拜访" ? " day" : ""}`} />
                        {item.variety} · {item.itemName}（{item.region}）
                      </th>
                      <td className="num">
                        {item.count} {item.unit}
                      </td>
                      <td className="num">
                        {item.privateUnitPrice == null ? (
                          <span style={{ color: "#be123c" }}>缺价</span>
                        ) : (
                          formatCNY(item.privateUnitPrice)
                        )}
                      </td>
                      <td className="num">
                        {item.privateUnitPrice == null ? "—" : formatCentsText(toCents(item.privateUnitPrice) * item.count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>默认金额（绩效比 1.00）</td>
                    <td className="num">{formatCentsText(baseCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="dpa-hint">原始业务记录可在专员名单中点击「查看依据」核对。</p>
          </section>

          <section className="dpa-section">
            <div className="dpa-section-title">
              <b aria-hidden="true">02</b>
              <h3>绩效金额</h3>
              <small>
                允许范围 {formatCentsText(min)} – {formatCentsText(max)}
              </small>
            </div>
            <div className={`dpa-amount-box${showAmountError ? " invalid" : ""}`}>
              <div className="dpa-amount-line">
                <div>
                  <label htmlFor="dpa-amount">确认金额</label>
                  <div className="dpa-input-wrap">
                    <span aria-hidden="true">¥</span>
                    <input
                      id="dpa-amount"
                      type="number"
                      inputMode="decimal"
                      min={min / 100}
                      max={max / 100}
                      step={0.01}
                      value={amountText}
                      aria-invalid={showAmountError}
                      onChange={(e) => applyAmountText(e.target.value)}
                      onBlur={() => {
                        setAmountTouched(true)
                        if (!Number.isNaN(parseAmountCents(amountText))) {
                          setAmountText((parseAmountCents(amountText) / 100).toFixed(2))
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="dpa-readout">
                  <span className="dpa-aside-label">绩效比</span>
                  <output className="dpa-readout-num">{ratio == null ? "—" : ratioText(ratio)}</output>
                </div>
                <p
                  className={`dpa-delta${!Number.isNaN(cents) && cents > baseCents ? " positive" : ""}`}
                  aria-live="polite"
                >
                  {Number.isNaN(cents)
                    ? ""
                    : changed
                      ? `较默认 ${cents > baseCents ? "+" : "−"}${formatCentsText(Math.abs(cents - baseCents))}`
                      : "与默认金额一致"}
                </p>
                <button type="button" className="dpa-restore" style={{ display: changed ? "inline-block" : "none" }} onClick={restoreDefault}>
                  恢复默认
                </button>
              </div>
              <div className={`dpa-slider-box${showAmountError ? " invalid" : ""}`} style={{ marginTop: 24 }}>
                <div className="dpa-slider-track" style={{ ["--slider-default" as string]: `${defaultPct}%`, ["--slider-progress" as string]: `${sliderPct}%` }}>
                  <input
                    type="range"
                    aria-label="绩效比"
                    min={MIN_RATIO}
                    max={capRatio}
                    step={0.01}
                    value={sliderValue}
                    aria-valuetext={sliderValue.toFixed(2)}
                    onChange={(e) => applySlider(Number(e.target.value))}
                  />
                </div>
                <div className="dpa-scale" aria-hidden="true" style={{ ["--slider-default" as string]: `${defaultPct}%` }}>
                  <span>{MIN_RATIO.toFixed(2)}</span>
                  <span className="dpa-default-tick">1.00 默认</span>
                  <span>{capRatio.toFixed(2)} 上限</span>
                </div>
              </div>
              {showAmountError && (
                <p className="dpa-error" aria-live="polite">
                  {amountError}
                </p>
              )}
              <p className="dpa-hint">拖动绩效比可快速调整；手输金额精确到分，提交时以手输金额为准。</p>
            </div>
            <div className="dpa-reason" style={{ display: changed ? "block" : "none" }}>
              <label htmlFor="dpa-reason" style={{ display: "block", fontSize: 12, fontWeight: 620, marginBottom: 5 }}>
                金额调整原因 <span className="required" aria-hidden="true">*</span>
              </label>
              <div className="dpa-preset-row">
                {REASON_PRESETS.map((preset) => (
                  <button key={preset} type="button" onClick={() => appendReasonPreset(preset)}>
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                id="dpa-reason"
                rows={2}
                maxLength={200}
                placeholder="请说明金额调整的依据"
                value={reason}
                aria-invalid={(attempted || reason.length > 0 ? reasonMissing : attempted && reasonMissing) || undefined}
                onChange={(e) => setReason(e.target.value)}
              />
              {attempted && reasonMissing && (
                <p className="dpa-error" aria-live="polite">
                  请输入金额调整原因。
                </p>
              )}
            </div>
          </section>

          <section className="dpa-section">
            <div className="dpa-section-title">
              <b aria-hidden="true">03</b>
              <h3>服务评分</h3>
              <small>每项 0–1，最多两位小数</small>
            </div>
            <div className="dpa-score-box">
              {dimensions.map((dimension, index) => (
                <div className="dpa-score" key={dimension.key}>
                  <div className="dpa-score-text">
                    <label htmlFor={`dpa-score-${index}`}>{dimension.label}</label>
                    <span className="dpa-weight">权重 {Math.round(dimension.weight * 100)}%</span>
                    <p className={`dpa-score-note${showScoreErrors[index] ? " invalid" : ""}`}>
                      {showScoreErrors[index] ? scoreErrors[index] : DEFAULT_DIMENSION_HINTS[index]}
                    </p>
                  </div>
                  <span className="dpa-contribution">
                    {scoreErrors[index] === null
                      ? `贡献 ${(parsedScores[index] * dimension.weight).toFixed(4).replace(/0{1,2}$/, "")}`
                      : "贡献 —"}
                  </span>
                  <input
                    id={`dpa-score-${index}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={1}
                    step={0.01}
                    value={scoreTexts[index]}
                    aria-invalid={showScoreErrors[index]}
                    className={scoreErrors[index] === null && parsedScores[index] < 1 ? "adjusted" : ""}
                    onChange={(e) => {
                      const text = e.target.value
                      setScoreTexts((prev) => prev.map((t, i) => (i === index ? text : t)))
                    }}
                    onBlur={() => commitScoreText(index)}
                  />
                </div>
              ))}
              <div className="dpa-score-total">
                <div>
                  加权得分
                  <small>仅作服务评价，不影响确认金额</small>
                </div>
                <output>{weighted == null ? "—" : weighted.toFixed(2)}</output>
              </div>
            </div>
          </section>
        </div>

        <div className="dpa-foot">
          <div className="dpa-foot-values">
            <div>
              确认金额
              <b>{amountError === null ? formatCentsText(cents) : "—"}</b>
            </div>
            <div>
              加权得分
              <b>{weighted == null ? "—" : weighted.toFixed(2)}</b>
            </div>
          </div>
          <div className="dpa-foot-actions">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="primary"
              style={{ background: "#0f766e", borderColor: "#0f766e" }}
              disabled={record.missingPrice || baseCents <= 0}
              onClick={handleSubmit}
            >
              提交考核
            </Button>
          </div>
        </div>
        {submitError && (
          <p role="alert" style={{ margin: 0, padding: "0 28px 14px", color: "#be123c", fontSize: 12.5, background: "#fff" }}>
            {submitError}
          </p>
        )}
      </div>
    </div>
  )
}

const DEFAULT_DIMENSION_HINTS = [
  "合规拜访、无违规宣传与利益输送",
  "沟通质量、产品知识与专业表达",
  "记录真实、要素齐全、提交及时",
  "实际服务量与预算计划的匹配程度",
]

// ── 业务与审核依据（分项 → 原始记录下钻） ─────────────────────────────────────

const SOURCE_PAGE_SIZE = 8

export function DirectSourcesModal({
  open,
  task,
  record,
  onClose,
  onDrillItem,
}: {
  open: boolean
  task: Task | null
  record: DirectPerfRecord | null
  onClose: () => void
  onDrillItem: (item: DirectPerfItem) => void
}) {
  if (!record) return null
  const reviewCount = task
    ? task.workloadAssigns.filter(
        (a) => a.specialist === record.specialist && a.serviceMonth === record.serviceMonth && a.progress !== "已完成",
      ).length
    : 0
  return (
    <Modal
      open={open}
      title="业务与审核依据"
      onClose={onClose}
      width={720}
      footer={
        <Button variant="primary" onClick={onClose}>
          关闭
        </Button>
      }
    >
      <div style={{ fontSize: 12.5, color: "#667085", marginBottom: 10 }}>
        {record.taskNo} · {record.serviceMonth} · {record.varietyNames.join("、")} · {record.regionNames.join("、")}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["业务分项", "有效工作量", "对私单价", "小计", "操作"].map((heading, i) => (
              <th
                key={heading}
                style={{
                  padding: "8px 10px",
                  textAlign: i === 0 ? "left" : "right",
                  fontSize: "var(--fs-12)",
                  fontWeight: 600,
                  color: "#9CA3AF",
                  background: "#F9FAFB",
                  borderBottom: "1px solid var(--color-border)",
                  whiteSpace: "nowrap",
                }}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {record.items.map((item) => (
            <tr key={item.key}>
              <td style={{ padding: "10px", fontSize: "var(--fs-13)", borderBottom: "1px solid #F3F4F6" }}>
                {item.variety} · {item.itemName}
                <span style={{ display: "block", fontSize: 11, color: "#667085" }}>{item.region}</span>
              </td>
              <td style={{ ...sourceNumTd }}>
                {item.count} {item.unit}
              </td>
              <td style={{ ...sourceNumTd }}>
                {item.privateUnitPrice == null ? <span style={{ color: "#C73A3A" }}>缺价</span> : formatCNY(item.privateUnitPrice)}
              </td>
              <td style={{ ...sourceNumTd }}>
                {item.privateUnitPrice == null ? "—" : formatCentsText(toCents(item.privateUnitPrice) * item.count)}
              </td>
              <td style={{ ...sourceNumTd }}>
                <button
                  type="button"
                  onClick={() => onDrillItem(item)}
                  style={{ border: "none", background: "none", padding: 0, fontSize: 13, color: "var(--color-brand)", cursor: "pointer" }}
                >
                  {item.itemName}记录 ›
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...sourceNumTd, fontWeight: 600, textAlign: "left" }}>合计</td>
            <td style={{ ...sourceNumTd, fontWeight: 600 }}>{workloadOf(record.items)} 次</td>
            <td style={sourceNumTd} />
            <td style={{ ...sourceNumTd, fontWeight: 600 }}>{formatCentsText(baseCentsOf(record.items))}</td>
            <td style={sourceNumTd} />
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 11.5, color: "#667085", marginTop: 10 }}>
        依据与考核使用同一数据来源：仅统计已审核（已完成）任务量；待审核与未完成不入账。
        {reviewCount > 0 && ` 另有 ${reviewCount} 条待审核/未完成任务量，未计入绩效。`}
      </p>
      {record.items.some((item) => item.privateUnitPrice == null) && (
        <p style={{ fontSize: 12, color: "#9F1239", background: "#FFF1F2", borderRadius: 6, padding: "8px 12px", marginTop: 8 }}>
          「{record.items.filter((item) => item.privateUnitPrice == null).map((item) => item.itemName).join("、")}」缺少适用的对私单价（不能用对公单价兜底），该专员不能确认金额。
        </p>
      )}
    </Modal>
  )
}

const sourceNumTd: React.CSSProperties = {
  padding: "10px",
  fontSize: "var(--fs-13)",
  borderBottom: "1px solid #F3F4F6",
  textAlign: "right",
  whiteSpace: "nowrap",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
}

export function DirectSourceItemsModal({
  open,
  task,
  record,
  item,
  onClose,
  onBack,
}: {
  open: boolean
  task: Task | null
  record: DirectPerfRecord | null
  item: DirectPerfItem | null
  onClose: () => void
  onBack: () => void
}) {
  const [page, setPage] = useState(1)
  useEffect(() => {
    setPage(1)
  }, [item?.key])
  if (!record || !item) return null
  const result: LinkedRecordsResult = task ? linkedRecordsOf(task, record, item) : { rows: [], complete: false, gapNote: "任务数据不可用" }
  const pages = Math.max(1, Math.ceil(result.rows.length / SOURCE_PAGE_SIZE))
  const current = Math.min(page, pages)
  const slice = result.rows.slice((current - 1) * SOURCE_PAGE_SIZE, current * SOURCE_PAGE_SIZE)
  return (
    <Modal
      open={open}
      title={`${item.itemName} · 记录列表`}
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            返回业务分项
          </Button>
          <Button variant="primary" onClick={onClose}>
            关闭
          </Button>
        </>
      }
    >
      <div style={{ fontSize: 12.5, color: "#667085", marginBottom: 10 }}>
        {record.taskNo} · {record.serviceMonth} · {record.specialist} · {item.variety} · {item.region}
      </div>
      {result.gapNote && (
        <p style={{ fontSize: 12, color: "#674711", background: "#FBF2DF", borderRadius: 6, padding: "8px 12px", margin: "0 0 10px" }}>
          {result.gapNote}
        </p>
      )}
      {result.rows.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["记录编号", "执行日期", "拜访时段", "审核结果", "计入金额"].map((heading, i) => (
                <th
                  key={heading}
                  style={{
                    padding: "8px 10px",
                    textAlign: i === 0 ? "left" : "right",
                    fontSize: "var(--fs-12)",
                    fontWeight: 600,
                    color: "#9CA3AF",
                    background: "#F9FAFB",
                    borderBottom: "1px solid var(--color-border)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr key={row.id}>
                <td style={{ ...sourceNumTd, textAlign: "left" }}>{row.id}</td>
                <td style={sourceNumTd}>{row.date}</td>
                <td style={sourceNumTd}>{row.period}</td>
                <td style={{ ...sourceNumTd, color: "#248A5A" }}>{row.auditResult}</td>
                <td style={sourceNumTd}>{row.amountCents == null ? "—" : formatCentsText(row.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: 13, color: "#667085", textAlign: "center", padding: "20px 0" }}>没有已关联的原始记录。</p>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12, color: "#667085" }}>
        <span>
          共 {result.rows.length} 条{pages > 1 ? ` · 第 ${current} / ${pages} 页` : ""}
        </span>
        {pages > 1 && (
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              上一页
            </Button>
            <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
              下一页
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── 考核记录（留痕）与退回 ───────────────────────────────────────────────────

export const DIRECT_OP_LABELS: Record<DirectPerfOp["kind"], string> = {
  submit: "提交考核",
  return: "退回重评",
  reassess: "重新考核",
}

function scoresLine(before: DirectAssessment | null, after: DirectAssessment | null, index: number): string {
  const fmt = (a: DirectAssessment | null) => (a ? a.scores[index].toFixed(2) : "—")
  return `${fmt(before)} → ${fmt(after)}`
}

export function DirectRecordModal({
  open,
  task,
  record,
  onClose,
  onReturn,
  onReassess,
  onOpenAudit,
}: {
  open: boolean
  task: Task | null
  record: DirectPerfRecord | null
  onClose: () => void
  onReturn: (record: DirectPerfRecord) => void
  onReassess: (record: DirectPerfRecord) => void
  onOpenAudit: (record: DirectPerfRecord, opIndex: number) => void
}) {
  const settings = usePerfSettings()
  if (!record) return null
  const latest = record.history[0]
  const active = assessedOf(record)
  const locked = task ? task.taskStatus === "已结算" || task.taskStatus === "已撤销" : false
  const weights = active?.weights ?? ((settings.weights) as [number, number, number, number])
  const dimensions = getEvalDimensions({ ...settings, weights })
  const canReturn = active !== null && !locked
  const canReassess = active === null && returnedOf(record) && !locked
  return (
    <Modal
      open={open}
      title={`考核记录 · ${record.specialist}`}
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          {canReturn && (
            <Button variant="outline" style={{ color: "#C73A3A" }} onClick={() => onReturn(record)}>
              退回重评
            </Button>
          )}
          {canReassess && (
            <Button variant="primary" onClick={() => onReassess(record)}>
              重新考核
            </Button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 8px",
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 650,
            color: active ? "#115E59" : "#855613",
            background: active ? "#E8F4EE" : "#FBF2DF",
          }}
        >
          {active ? "已考核" : "待考核"}
        </span>
        <span>
          已确认绩效 <b style={{ fontFamily: "ui-monospace, monospace" }}>{active ? formatCentsText(active.cents) : "—"}</b>
          {active ? ` · 绩效比 ${ratioText(active.ratio)}` : ""}
        </span>
        <span style={{ color: "#667085", fontSize: 12 }}>
          {record.taskNo} · {record.serviceMonth} · {record.varietyNames.join("、")} · {record.regionNames.join("、")}
        </span>
      </div>
      {locked && (
        <p style={{ fontSize: 12.5, color: "#667085", background: "#F6F8F7", borderRadius: 6, padding: "8px 12px", marginTop: 10 }}>
          任务已结算完结，考核记录已锁定，仅供查阅。
        </p>
      )}
      {latest?.reason && (
        <p style={{ fontSize: 12.5, color: "#674711", background: "#FBF2DF", borderRadius: 6, padding: "8px 12px", marginTop: 10 }}>
          {latest.kind === "return" ? "退回原因　" : "金额调整原因　"}
          {latest.reason}
        </p>
      )}
      {active && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>已确认评分（当次快照权重 {weights.join("/")}%）</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <tbody>
              {dimensions.map((dimension, index) => (
                <tr key={dimension.key}>
                  <td style={{ padding: "8px 10px", fontSize: "var(--fs-13)", borderBottom: "1px solid #F3F4F6" }}>
                    {dimension.label}
                    <span style={{ color: "#667085", fontSize: 11, marginLeft: 6 }}>权重 {Math.round(dimension.weight * 100)}%</span>
                  </td>
                  <td style={{ ...sourceNumTd, fontWeight: 600 }}>{active.scores[index].toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: "8px 10px", fontSize: "var(--fs-13)", fontWeight: 600 }}>加权得分</td>
                <td style={{ ...sourceNumTd, fontWeight: 600 }}>{weightedScoreOf(active.scores, weights).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: "#667085", marginTop: 8 }}>
            当次默认金额 {formatCentsText(active.baseCents)} · 上限比例 {Math.round(active.capRatio * 100)}%（历史版本按当次快照展示，规则调整后仍可读）。
          </div>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>操作日志</div>
        {record.history.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "#667085", marginTop: 8 }}>暂无操作记录。</p>
        ) : (
          record.history.map((op, index) => (
            <div
              key={op.id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px dashed #EEF0F2" }}
            >
              <div style={{ fontSize: 13 }}>
                <b>{DIRECT_OP_LABELS[op.kind]}</b>
                <span style={{ display: "block", fontSize: 11.5, color: "#667085", marginTop: 2 }}>
                  {op.time} · {op.actor}（{op.actorOrg}）
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpenAudit(record, index)}
                style={{ border: "none", background: "none", padding: 0, fontSize: 13, color: "var(--color-brand)", cursor: "pointer" }}
              >
                查看变更
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}

export function DirectAuditModal({
  open,
  record,
  opIndex,
  onClose,
  onBack,
}: {
  open: boolean
  record: DirectPerfRecord | null
  opIndex: number | null
  onClose: () => void
  onBack: () => void
}) {
  if (!record || opIndex === null) return null
  const op = record.history[opIndex]
  if (!op) return null
  const centsLabel = (a: DirectAssessment | null) => (a ? formatCentsText(a.cents) : "—")
  const ratioLabel = (a: DirectAssessment | null) => (a ? ratioText(a.ratio) : "—")
  return (
    <Modal
      open={open}
      title={`${DIRECT_OP_LABELS[op.kind]} · ${record.specialist}`}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            返回考核记录
          </Button>
          <Button variant="primary" onClick={onClose}>
            关闭
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 0 }}>
        {(
          [
            ["操作人", `${op.actor}（${op.actorOrg}）`],
            ["操作时间", op.time],
            ["考核状态", `${op.from} → ${op.to}`],
            ["绩效金额", `${centsLabel(op.before)} → ${centsLabel(op.after)}`],
            ["绩效比", `${ratioLabel(op.before)} → ${ratioLabel(op.after)}`],
            [op.kind === "return" ? "退回原因" : "金额调整原因", op.reason || "—"],
          ] as [string, string][]
        ).map(([label, value]) => (
          <div
            key={label}
            style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #EEF0F2", fontSize: 13 }}
          >
            <span style={{ color: "#667085" }}>{label}</span>
            <b style={{ fontFamily: "ui-monospace, monospace", textAlign: "right" }}>{value}</b>
          </div>
        ))}
      </div>
      {op.kind === "reassess" && (
        <p style={{ margin: "9px 0 0", fontSize: 12, color: "#667085" }}>变更前的金额和评分为退回前的考核结果。</p>
      )}
      <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600 }}>四维评分</div>
      <div style={{ display: "grid", marginTop: 4 }}>
        {DEFAULT_DIMENSION_HINTS.map((_, index) => (
          <div
            key={index}
            style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #EEF0F2", fontSize: 13 }}
          >
            <span style={{ color: "#667085" }}>
              第 {index + 1} 项
              {op.after ? `（权重 ${Math.round(op.after.weights[index])}%）` : ""}
            </span>
            <b style={{ fontFamily: "ui-monospace, monospace" }}>{scoresLine(op.before, op.after, index)}</b>
          </div>
        ))}
      </div>
      {op.after && (
        <div style={{ fontSize: 11.5, color: "#667085", marginTop: 8 }}>
          当次依据快照：{op.after.items.map((item) => `${item.itemName} ${item.count}${item.unit}×¥${item.privateUnitPrice ?? "缺价"}`).join("；")}；
          默认金额 {formatCentsText(op.after.baseCents)}。
        </div>
      )}
    </Modal>
  )
}

export function DirectReturnModal({
  open,
  record,
  onClose,
  onConfirm,
}: {
  open: boolean
  record: DirectPerfRecord | null
  onClose: () => void
  onConfirm: (reason: string) => string | null
}) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setReason("")
      setError(null)
    }
  }, [open, record?.id])
  if (!record) return null
  const active = assessedOf(record)
  return (
    <Modal
      open={open}
      title={`退回重评 · ${record.specialist}`}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            style={{ background: "#C73A3A", borderColor: "#C73A3A" }}
            onClick={() => {
              setError(null)
              const result = onConfirm(reason)
              if (result) setError(result)
            }}
          >
            确认退回
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 12.5, color: "#674711", background: "#FBF2DF", borderRadius: 6, padding: "8px 12px", margin: "0 0 12px" }}>
        确认后，该专员回到待考核，当前 {active ? formatCentsText(active.cents) : "—"} 从已确认绩效合计中移除，原考核记录保留；同批其他专员和其他任务的结果不变。
      </p>
      <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 620 }}>
        退回原因 <span style={{ color: "#C73A3A" }}>*</span>
        <textarea
          rows={3}
          maxLength={200}
          required
          value={reason}
          aria-invalid={!!error}
          placeholder="请说明退回原因"
          onChange={(e) => setReason(e.target.value)}
          style={{ border: "1px solid #D0D5DD", borderRadius: 7, padding: "6px 10px", font: "inherit", resize: "vertical" }}
        />
      </label>
      {error && (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#C73A3A" }} role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}

export function DirectSuccessModal({
  open,
  record,
  confirmedCents,
  dueCount,
  nextName,
  onClose,
  onNext,
}: {
  open: boolean
  record: DirectPerfRecord | null
  confirmedCents: number
  dueCount: number
  nextName: string | null
  onClose: () => void
  onNext: () => void
}) {
  if (!record) return null
  return (
    <Modal
      open={open}
      title="考核已提交"
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            返回专员名单
          </Button>
          {nextName && (
            <Button variant="primary" onClick={onNext}>
              考核下一位 · {nextName}
            </Button>
          )}
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 10, background: "#F3F8F4", borderRadius: 7, fontSize: 12 }}>
        <div>
          本次确认绩效
          <b style={{ display: "block", fontSize: 16, fontFamily: "ui-monospace, monospace" }}>{formatCentsText(confirmedCents)}</b>
        </div>
        <div>
          本包待考核
          <b style={{ display: "block", fontSize: 16 }}>{dueCount} 人</b>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#667085", marginTop: 10 }}>
        {record.specialist} 已变为「已考核」，其余待考核人员可继续操作；考核流程在提交时结束。
      </p>
    </Modal>
  )
}

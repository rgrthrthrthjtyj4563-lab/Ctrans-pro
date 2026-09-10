import { useMemo, useState } from "react"
import { History } from "lucide-react"
import { PageHeader } from "../components/PageHeader"
import { Button } from "../components/Button"
import { ConfirmDialog } from "../components/ConfirmDialog"
import type { ToastMessage } from "../components/Toast"
import { DEFAULT_SETTINGS, appendSettingsLog, getSettings, getSettingsLogs, saveSettings, type PerformanceSettings } from "../data/performanceData"

const card: React.CSSProperties = { background: "#fff", border: "1px solid var(--color-border)", borderRadius: 8, padding: "14px 16px" }
const input: React.CSSProperties = { height: 32, width: 110, border: "1px solid #D0D5DD", borderRadius: 6, padding: "0 10px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 13, textAlign: "right" }
const label: React.CSSProperties = { fontSize: 12, color: "#667085", display: "block", marginBottom: 5 }
const now = () => new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-")

function changeSummary(before: PerformanceSettings, after: PerformanceSettings) {
  const changes: string[] = []
  if (before.mode !== after.mode) changes.push(`评级模式：${before.mode} → ${after.mode}`)
  if (before.coefMin !== after.coefMin || before.coefMax !== after.coefMax) changes.push(`质量系数：${after.coefMin.toFixed(2)}–${after.coefMax.toFixed(2)}`)
  if (before.weights.join(",") !== after.weights.join(",")) changes.push(`评定权重：${after.weights.join("/")}%`)
  if (before.capRatio !== after.capRatio) changes.push(`实发上限：${Math.round(after.capRatio * 100)}%`)
  return changes.join("；") || "保存绩效设置"
}

export function PerformanceSettings({ addToast, operator }: { addToast: (msg: Omit<ToastMessage, "id">) => void; operator: string }) {
  const active = getSettings()
  const [draft, setDraft] = useState<PerformanceSettings>(active)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [logs, setLogs] = useState(getSettingsLogs)
  const weightTotal = draft.weights.reduce((total, weight) => total + weight, 0)
  const valid = draft.coefMin > 0 && draft.coefMax > draft.coefMin && draft.weights.every((weight) => weight >= 0) && weightTotal === 100 && draft.capRatio > 0
  const update = <K extends keyof PerformanceSettings>(key: K, value: PerformanceSettings[K]) => setDraft((previous) => ({ ...previous, [key]: value }))
  const setWeight = (index: number, value: number) => setDraft((previous) => ({ ...previous, weights: previous.weights.map((weight, i) => i === index ? value : weight) as PerformanceSettings["weights"] }))
  const logsToShow = useMemo(() => logs.slice(0, 8), [logs])
  const persist = (next: PerformanceSettings, summary: string) => {
    const saved = { ...next, updatedAt: now() }
    saveSettings(saved)
    const entry = { id: `perf-setting-${Date.now()}`, changedAt: saved.updatedAt!, operator, summary }
    appendSettingsLog(entry); setDraft(saved); setLogs((previous) => [entry, ...previous])
  }
  const save = () => { if (!valid) return; persist(draft, changeSummary(active, draft)); addToast({ type: "success", title: "绩效设置已保存并实时生效" }) }
  const applyReset = () => { const next = { ...DEFAULT_SETTINGS, weights: [...DEFAULT_SETTINGS.weights] as PerformanceSettings["weights"] }; persist(next, "恢复默认：层级模式；系数 0.60–1.20；权重 20/25/35/20%；上限 120%"); setResetConfirm(false); addToast({ type: "success", title: "绩效设置已恢复默认并实时生效" }) }

  return <div>
    <PageHeader title="绩效设置" description="评级模式、金额校验与服务评定规则" updatedAt={active.updatedAt ? `最近变更 ${active.updatedAt}` : "尚未保存自定义配置"} />
    <div style={{ padding: "12px 20px 24px", maxWidth: 1180 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 330px", gap: 14, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <section style={card}><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>评级模式</div><div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {(["层级模式", "灵活模式"] as const).map((mode) => <label key={mode} style={{ border: `1px solid ${draft.mode === mode ? "var(--color-brand)" : "var(--color-border)"}`, background: draft.mode === mode ? "var(--color-brand-subtle)" : "#fff", borderRadius: 7, padding: "10px 12px", cursor: "pointer" }}><input type="radio" name="perf-mode" checked={draft.mode === mode} onChange={() => update("mode", mode)} /> <b style={{ marginLeft: 5, fontSize: 13 }}>{mode}</b><span style={{ display: "block", marginTop: 6, fontSize: 12, color: "#667085", lineHeight: 1.5 }}>{mode === "层级模式" ? "阶段二须等批次生效；撤销先专员后工作组。" : "两层并行，打分与撤销均不受对方流程制约。"}</span></label>)}
          </div></section>
          <section style={card}><div style={{ fontSize: 14, fontWeight: 600 }}>质量系数区间 <span style={{ fontSize: 12, color: "#667085", fontWeight: 400 }}>阶段一</span></div><div style={{ display: "flex", gap: 12, alignItems: "end", marginTop: 10 }}>
            {([["下限", draft.coefMin, (value: number) => update("coefMin", value)], ["上限", draft.coefMax, (value: number) => update("coefMax", value)]] as const).map(([name, value, change]) => <div key={name}><label style={label}>{name}</label><input style={input} type="number" min={0} step={0.01} value={value} onChange={(event) => change(Number(event.target.value))} /></div>)}<span style={{ fontSize: 12, color: draft.coefMin > 0 && draft.coefMax > draft.coefMin ? "#667085" : "#C73A3A", paddingBottom: 8 }}>实发 ÷ 默认金额；需满足 0 &lt; 下限 &lt; 上限</span>
          </div></section>
          <section style={card}><div style={{ fontSize: 14, fontWeight: 600 }}>服务评定权重 <span style={{ fontSize: 12, color: "#667085", fontWeight: 400 }}>仅随结算单留档，不参与实发金额计算</span></div><div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 10 }}>
            {["服务程序", "服务态度及专业水平", "服务记录准确性", "服务预算匹配度"].map((name, index) => <div key={name}><label style={label}>{name}</label><div style={{ display: "flex", gap: 5, alignItems: "center" }}><input style={{ ...input, width: "100%" }} type="number" min={0} step={1} value={draft.weights[index]} onChange={(event) => setWeight(index, Number(event.target.value))} /><span style={{ fontSize: 12 }}>%</span></div></div>)}
          </div><div style={{ marginTop: 8, fontSize: 12, color: weightTotal === 100 ? "#248A5A" : "#C73A3A" }}>合计 {weightTotal}% {weightTotal === 100 ? "✓" : "· 四项权重合计须为 100%"}</div></section>
          <section style={card}><div style={{ display: "flex", alignItems: "end", gap: 14, flexWrap: "wrap" }}><div><div style={{ fontSize: 14, fontWeight: 600 }}>实发金额上限 <span style={{ fontSize: 12, color: "#667085", fontWeight: 400 }}>阶段二 / 直达</span></div><label style={{ ...label, marginTop: 8 }}>上限比例 X（%）</label><input style={input} type="number" min={0.01} step={1} value={Math.round(draft.capRatio * 100)} onChange={(event) => update("capRatio", Number(event.target.value) / 100)} /></div><span style={{ fontSize: 12, color: "#667085", paddingBottom: 8 }}>完成工作量 ¥600 × {Math.round(draft.capRatio * 100)}% = 上限 ¥{(600 * draft.capRatio).toFixed(0)}</span></div></section>
          <div style={{ display: "flex", gap: 10 }}><Button variant="primary" size="sm" disabled={!valid} onClick={save}>保存并生效</Button><Button variant="ghost" size="sm" onClick={() => setResetConfirm(true)}>恢复默认</Button></div>
        </div>
        <aside style={{ ...card, padding: 0, overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--color-border)" }}><History size={16} color="var(--color-brand)" /><b style={{ fontSize: 14 }}>配置变更日志</b></div>{logsToShow.length === 0 ? <div style={{ padding: 16, fontSize: 12.5, color: "#667085" }}>暂无变更记录。首次保存后将记录操作人、时间与变更内容。</div> : <div>{logsToShow.map((log) => <div key={log.id} style={{ padding: "12px 14px", borderBottom: "1px solid #F2F4F7" }}><div style={{ fontSize: 12.5, color: "var(--color-text-1)", lineHeight: 1.5 }}>{log.summary}</div><div style={{ marginTop: 5, fontSize: 11.5, color: "#667085" }}>{log.changedAt} · {log.operator}</div></div>)}</div>}</aside>
      </div>
    </div>
    <ConfirmDialog open={resetConfirm} title="恢复默认绩效设置？" description="将恢复层级模式、0.60–1.20 系数、20/25/35/20 权重和 120% 上限，并写入变更日志。" confirmLabel="恢复默认" variant="warning" onConfirm={applyReset} onCancel={() => setResetConfirm(false)} />
  </div>
}

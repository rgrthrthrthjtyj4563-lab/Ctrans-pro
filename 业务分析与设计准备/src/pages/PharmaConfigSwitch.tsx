import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  History,
  MapPin,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { Tag } from "../components/StatusTag";
import type { ToastMessage } from "../components/Toast";
import type { Role } from "../types";

type Mode = "strict" | "standard" | "free";

interface Props {
  addToast: (msg: Omit<ToastMessage, "id">) => void;
  currentRole: Role;
}

const MODE: Record<Mode, { label: string; description: string; icon: typeof ShieldCheck; lines: string[]; risk?: boolean }> = {
  strict: {
    label: "严格合规",
    description: "适用于高监管、强合规要求的药厂业务场景",
    icon: ShieldCheck,
    lines: ["完整留痕校验，缺失必要证据时不可提交", "地图位置不可随意拖拽，位置需与实际匹配", "轨迹与速度异常自动拦截"],
  },
  standard: {
    label: "常规合规",
    description: "适用于常规推广业务，保留核心留痕校验",
    icon: FileText,
    lines: ["保留核心留痕校验，允许合理调整", "地图允许有限范围调整，超限触发提示", "异常轨迹触发复核提示，不强制拦截"],
  },
  free: {
    label: "自由模式",
    description: "允许较高业务灵活度，适用于低约束业务场景",
    icon: Activity,
    risk: true,
    lines: ["允许较高业务灵活度，仍保留操作留痕", "关键放宽操作需二次确认并记录日志", "保留风险提醒，不强制拦截"],
  },
};

const box: React.CSSProperties = { background: "#fff", border: "1px solid var(--color-border)", borderRadius: 8, padding: 20 };
const sectionTitle: React.CSSProperties = { fontSize: "var(--fs-16)", fontWeight: 600, color: "var(--color-text-1)" };
const hint: React.CSSProperties = { marginTop: 4, fontSize: "var(--fs-12)", color: "#667085", lineHeight: 1.55 };

function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} style={{ width: 36, height: 20, border: "none", borderRadius: 999, background: checked ? "var(--color-brand)" : "#CBD5E1", position: "relative", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, padding: 0 }}>
    <span style={{ position: "absolute", left: 2, top: 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.25)", transform: checked ? "translateX(16px)" : "none", transition: "transform 160ms ease" }} />
  </button>;
}

function NumberField({ label, unit, value, setValue, help, disabled }: { label: string; unit: string; value: string; setValue: (value: string) => void; help: string; disabled?: boolean }) {
  return <label style={{ display: "block" }}>
    <span style={{ display: "block", fontSize: "var(--fs-13)", fontWeight: 500, color: "#374151", marginBottom: 6 }}>{label} <em style={{ fontStyle: "normal", color: "#9CA3AF", fontFamily: "var(--font-mono)", fontWeight: 400 }}>{unit}</em></span>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="number" min="0" value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)} style={{ width: 116, height: 32, padding: "0 10px", border: "1px solid var(--color-border)", borderRadius: 6, fontFamily: "var(--font-mono)", color: "var(--color-text-1)", background: disabled ? "#F9FAFB" : "#fff" }} />
      <span style={{ fontSize: "var(--fs-12)", color: "#9CA3AF" }}>{help}</span>
    </div>
  </label>;
}

function RuleGroup({ title, summary, open, onToggle, children }: { title: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <section style={{ ...box, padding: 0, overflow: "hidden" }}>
    <button type="button" onClick={onToggle} aria-expanded={open} style={{ cursor: "pointer", width: "100%", padding: "14px 20px", border: "none", background: "#fff", display: "flex", alignItems: "center", textAlign: "left" }}>
      <span style={sectionTitle}>{title}</span><span style={{ fontSize: "var(--fs-12)", color: "#667085", marginLeft: 12 }}>{summary}</span><span style={{ marginLeft: "auto", color: "#9CA3AF", display: "grid" }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
    </button>
    {open && <div style={{ borderTop: "1px solid #F3F4F6", padding: 20, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "20px 40px" }}>{children}</div>}
  </section>;
}

export function PharmaConfigSwitch({ addToast, currentRole }: Props) {
  const [savedMode, setSavedMode] = useState<Mode>("standard");
  const [mode, setMode] = useState<Mode>("standard");
  const [showDiff, setShowDiff] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ trace: true, map: false, track: false, data: false });
  const [duration, setDuration] = useState("15");
  const [contentWords, setContentWords] = useState("50");
  const [feedbackWords, setFeedbackWords] = useState("20");
  const [radius, setRadius] = useState("500");
  const [distance, setDistance] = useState("200");
  const [minSpeed, setMinSpeed] = useState("0");
  const [maxSpeed, setMaxSpeed] = useState("60");
  const [photo, setPhoto] = useState(true);
  const [mapDrag, setMapDrag] = useState(false);
  const [track, setTrack] = useState(true);
  const readOnly = currentRole === "药厂合规部门";
  const changed = mode !== savedMode;
  const setGroup = (key: string) => setOpen((current) => ({ ...current, [key]: !current[key] }));

  const preview = useMemo(() => ({
    strict: { duration: "≥ 20 分钟", map: "不允许", evidence: "拍照、定位、客户反馈", track: "严格校验", active: ["定位/地图", "现场记录", "提交校验"] },
    standard: { duration: "≥ 15 分钟", map: "有限允许", evidence: "拍照、定位", track: "标准校验", active: ["现场记录"] },
    free: { duration: "由规则设定", map: "允许调整", evidence: "定位记录", track: "提示复核", active: [] },
  })[mode], [mode]);

  function save() {
    if (!duration || Number(duration) < 1 || Number(duration) > 120) {
      addToast({ type: "error", title: "无法保存", description: "最短拜访时长需为 1–120 分钟。" });
      return;
    }
    setConfirmOpen(true);
  }
  function confirmSave() {
    setSavedMode(mode); setConfirmOpen(false);
    addToast({ type: "success", title: "配置已保存", description: "新规则将应用于后续业务，历史记录保留原规则快照。" });
  }
  function restore() { setMode(savedMode); addToast({ type: "info", title: "已恢复", description: "未保存的模式变更已恢复为上次保存状态。" }); }

  return <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
    <PageHeader title="药厂配置开关" description="选择业务合规模式并维护关键校验规则；配置变更将按生效范围应用。" updatedAt="2026-09-08 10:30 · 李航" actions={<><Tag label={`当前生效：${MODE[savedMode].label}`} color="brand" /><Button variant="outline" size="md" icon={<History size={14} />} onClick={() => setHistoryOpen(true)}>查看变更记录</Button></>} />
    <main style={{ flex: 1, overflow: "auto", padding: 16, paddingBottom: 82 }}>
      <div style={{ width: "100%" }}>
        <section style={{ ...box, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}><div><div style={sectionTitle}>业务合规模式</div><p style={hint}>选择一种模式以决定服务专员的规则约束强度；模式变更需保存后生效。</p></div>{changed && <Tag label="待保存变更" color="warning" />}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            {(Object.keys(MODE) as Mode[]).map((item) => { const config = MODE[item]; const Icon = config.icon; const selected = mode === item; return <button key={item} type="button" disabled={readOnly} onClick={() => setMode(item)} aria-pressed={selected} style={{ cursor: readOnly ? "not-allowed" : "pointer", opacity: readOnly ? .7 : 1, position: "relative", minHeight: 214, padding: 16, textAlign: "left", borderRadius: 8, border: selected ? "2px solid var(--color-brand)" : "1px solid var(--color-border)", background: selected ? "var(--color-brand-subtle)" : "#fff", transition: "border-color 160ms ease, background-color 160ms ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 6, background: selected ? "var(--color-brand)" : "#F3F4F6", color: selected ? "#fff" : "#667085" }}><Icon size={16} /></span><strong style={{ fontSize: "var(--fs-14)", color: "#1F2937" }}>{config.label}</strong>{item === "standard" && <Tag label="默认" />}{item === "strict" && <Tag label="推荐" color="brand" />}<span style={{ marginLeft: "auto", width: 16, height: 16, border: selected ? "5px solid var(--color-brand)" : "2px solid #D1D5DB", borderRadius: "50%" }} /></div>
              {selected && <span style={{ position: "absolute", top: 14, right: 40 }}><Tag label="当前选择" color="brand" /></span>}
              <p style={{ ...hint, minHeight: 38 }}>{config.description}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>{config.lines.map((line) => <li key={line} style={{ display: "flex", gap: 5, fontSize: "var(--fs-12)", color: "#374151", marginTop: 5, lineHeight: 1.45 }}><Check size={13} color="#248A5A" style={{ flex: "none", marginTop: 2 }} />{line}</li>)}</ul>
              {config.risk && <div style={{ marginTop: 9, padding: "6px 8px", border: "1px solid #FDE68A", borderRadius: 4, color: "#C77A16", fontSize: "var(--fs-12)", lineHeight: 1.45 }}><AlertTriangle size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />关键规则放宽后将记录至变更日志。</div>}
            </button>; })}
          </div>
          <button type="button" onClick={() => setShowDiff(!showDiff)} style={{ cursor: "pointer", marginTop: 14, border: 0, background: "none", color: "var(--color-brand)", fontSize: "var(--fs-12)", padding: 0 }}>查看规则差异 {showDiff ? "⌃" : "⌄"}</button>
          {showDiff && <table style={{ marginTop: 10, width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-12)", border: "1px solid var(--color-border)" }}><thead><tr style={{ background: "#F9FAFB", textAlign: "left" }}>{["规则项", "严格合规", "常规合规", "自由模式"].map((item) => <th key={item} style={{ padding: "9px 12px", borderBottom: "1px solid var(--color-border)", color: "#374151" }}>{item}</th>)}</tr></thead><tbody>{[["地图拖拽", "禁止", "有限允许", "允许调整"], ["拜访证据", "完整必选", "核心必选", "建议填写"], ["轨迹校验", "严格拦截", "标准校验", "提示复核"]].map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell} style={{ padding: "9px 12px", borderBottom: "1px solid #F3F4F6", color: "#374151" }}>{cell}</td>)}</tr>)}</tbody></table>}
        </section>

        <section style={{ ...box, marginBottom: 16 }}><div style={sectionTitle}>当前模式下的业务体验 {changed && <Tag label="预览新模式效果" color="info" />}</div><p style={hint}>以下为服务专员完成一次拜访时的规则预览，实际以保存后的具体参数为准。</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>{[[Clock3, "预计最短时长", preview.duration], [MapPin, "地图位置调整", preview.map], [FileText, "必要证据要求", preview.evidence], [Activity, "轨迹/速度校验", preview.track]].map(([Icon, label, value]) => { const C = Icon as typeof Clock3; return <div key={label as string} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 14 }}><div style={{ display: "flex", alignItems: "center", gap: 6, color: "#667085", fontSize: "var(--fs-12)" }}><C size={14} />{label as string}</div><div style={{ marginTop: 9, color: "#1F2937", fontSize: "var(--fs-13)", fontWeight: 600, lineHeight: 1.4 }}>{value as string}</div></div>; })}</div>
          <div style={{ marginTop: 12, padding: 14, border: "1px solid var(--color-border)", borderRadius: 8 }}><div style={{ fontSize: "var(--fs-12)", color: "#667085", marginBottom: 10 }}>服务专员拜访流程预览</div><div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>{["开始拜访", "定位/地图", "现场记录", "反馈与附件", "提交校验"].map((step, index) => <span key={step} style={{ display: "contents" }}><span style={{ padding: "4px 9px", fontSize: "var(--fs-12)", borderRadius: 4, border: preview.active.includes(step) ? "1px solid var(--color-brand)" : "1px solid var(--color-border)", background: preview.active.includes(step) ? "var(--color-brand-subtle)" : "#F9FAFB", color: preview.active.includes(step) ? "var(--color-brand)" : "#667085" }}>{step}</span>{index < 4 && <ChevronRight size={14} color="#9CA3AF" />}</span>)}</div></div>
        </section>

        <div style={{ marginBottom: 16 }}><div style={{ ...sectionTitle, marginBottom: 10 }}>详细规则</div><div style={{ display: "grid", gap: 10 }}>
          <RuleGroup title="拜访留痕" summary="已配置 4 项" open={open.trace} onToggle={() => setGroup("trace")}><NumberField label="最短拜访时长" unit="分钟" value={duration} setValue={setDuration} help="建议 15–30" disabled={readOnly} /><NumberField label="客户内容字数" unit="字" value={contentWords} setValue={setContentWords} help="0 为不限制" disabled={readOnly} /><NumberField label="客户反馈字数" unit="字" value={feedbackWords} setValue={setFeedbackWords} help="0 为不限制" disabled={readOnly} /><div><div style={{ fontSize: "var(--fs-13)", fontWeight: 500, color: "#374151", marginBottom: 9 }}>现场拍照</div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Switch checked={photo} onChange={setPhoto} disabled={readOnly} /><span style={{ fontSize: "var(--fs-13)", color: photo ? "var(--color-brand)" : "#667085" }}>{photo ? "启用" : "停用"}</span></div></div></RuleGroup>
          <RuleGroup title="地图与定位" summary={mode === "strict" ? "含 1 项风险规则" : "已配置 3 项"} open={open.map} onToggle={() => setGroup("map")}><div><div style={{ fontSize: "var(--fs-13)", fontWeight: 500, color: "#374151", marginBottom: 9 }}>允许拖拽位置</div>{mode === "strict" ? <><span style={{ color: "#9CA3AF", fontSize: "var(--fs-13)" }}>禁止（严格合规模式下不可修改）</span> <Tag label="不适用" /></> : <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Switch checked={mapDrag} onChange={setMapDrag} disabled={readOnly} /><span style={{ fontSize: "var(--fs-13)", color: "#667085" }}>{mapDrag ? "启用" : "停用"}</span></div>}</div><NumberField label="地址搜索半径" unit="米" value={radius} setValue={setRadius} help="地图可选范围" disabled={readOnly} /><NumberField label="单日最大行程" unit="公里" value={distance} setValue={setDistance} help="0 为不限制" disabled={readOnly} /></RuleGroup>
          <RuleGroup title="轨迹校验" summary={mode === "free" ? "提示模式" : "已配置 3 项"} open={open.track} onToggle={() => setGroup("track")}><div><div style={{ fontSize: "var(--fs-13)", fontWeight: 500, color: "#374151", marginBottom: 9 }}>校验拜访间隔</div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Switch checked={track} onChange={setTrack} disabled={readOnly || mode === "free"} /><span style={{ fontSize: "var(--fs-13)", color: "#667085" }}>{mode === "free" ? "自由模式下仅提示" : track ? "启用" : "停用"}</span></div></div><NumberField label="最小移动速度" unit="km/h" value={minSpeed} setValue={setMinSpeed} help="0 为不限制" disabled={readOnly} /><NumberField label="最大移动速度" unit="km/h" value={maxSpeed} setValue={setMaxSpeed} help="超出将触发复核" disabled={readOnly} /></RuleGroup>
          <RuleGroup title="资料采集" summary="已配置 2 项" open={open.data} onToggle={() => setGroup("data")}><div><div style={{ fontSize: "var(--fs-13)", fontWeight: 500, color: "#374151", marginBottom: 8 }}>心血管品种要求</div><Tag label="客户反馈" color="brand" /> <Tag label="现场照片" color="brand" /> <Tag label="定位记录" color="brand" /></div><div><div style={{ fontSize: "var(--fs-13)", fontWeight: 500, color: "#374151", marginBottom: 8 }}>抗感染品种要求</div><Tag label="客户反馈" color="brand" /> <Tag label="定位记录" color="brand" /></div></RuleGroup>
        </div></div>
        {changed && <section style={{ padding: 14, background: "#FEF3E2", border: "1px solid #FDE68A", borderRadius: 8, display: "flex", gap: 9 }}><AlertTriangle size={16} color="#C77A16" style={{ flex: "none", marginTop: 2 }} /><div><strong style={{ color: "#C77A16", fontSize: "var(--fs-13)" }}>变更影响说明</strong><div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 8, fontSize: "var(--fs-12)", color: "#92400E" }}><span>影响药厂：测试药厂企业</span><span>生效：保存后对新建业务生效</span><span>历史记录：保留原规则快照</span></div></div></section>}
      </div>
    </main>
    <footer style={{ height: 58, flex: "none", borderTop: "1px solid var(--color-border)", background: "#fff", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 -2px 8px rgba(0,0,0,.04)" }}><span style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--fs-13)", color: changed ? "#C77A16" : "#667085" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: changed ? "#C77A16" : "#248A5A" }} />{changed ? "当前有未保存变更" : "配置已保存，无待变更项"}</span>{readOnly ? <span style={{ fontSize: "var(--fs-12)", color: "#9CA3AF" }}>当前角色仅可查看，配置调整由药厂销售管理员操作。</span> : <div style={{ display: "flex", gap: 8 }}><Button variant="outline" size="md" disabled={!changed} onClick={restore}>恢复上次保存</Button><Button variant="primary" size="md" icon={<Save size={14} />} disabled={!changed} onClick={save}>保存配置</Button></div>}</footer>
    <ConfirmDialog open={confirmOpen} title="确认保存配置" description={`将业务合规模式由“${MODE[savedMode].label}”调整为“${MODE[mode].label}”。`} impact={mode === "free" ? "自由模式会放宽关键校验规则，所有变更将写入操作日志。" : "新规则将影响后续新建业务，历史记录保留原规则快照。"} variant="warning" confirmLabel="确认保存" onConfirm={confirmSave} onCancel={() => setConfirmOpen(false)} />
    {historyOpen && <><div onClick={() => setHistoryOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 90 }} /><aside role="dialog" aria-label="变更记录" style={{ position: "fixed", right: 0, top: 0, bottom: 0, zIndex: 91, width: 480, background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,.12)", display: "flex", flexDirection: "column" }}><div style={{ padding: 20, borderBottom: "1px solid var(--color-border)", display: "flex" }}><div><div style={sectionTitle}>变更记录</div><p style={hint}>按时间倒序排列，含关键字段前后值</p></div><button onClick={() => setHistoryOpen(false)} aria-label="关闭变更记录" style={{ marginLeft: "auto", border: 0, background: "none", color: "#9CA3AF", cursor: "pointer" }}><X size={18} /></button></div><div style={{ padding: 20, overflow: "auto" }}>{[["2026-09-08 10:30", "李航", "常规合规", "严格合规", "最短拜访时长：10 分钟 → 20 分钟", "季度合规审查后按要求升级"], ["2026-08-15 14:22", "张峰", "自由模式", "常规合规", "轨迹校验：停用 → 启用", "合规部审批通过"]].map(([time, user, before, after, field, note]) => <div key={time} style={{ borderLeft: "1px solid var(--color-border)", padding: "0 0 20px 18px", position: "relative" }}><span style={{ position: "absolute", left: -5, top: 2, width: 9, height: 9, borderRadius: "50%", background: "var(--color-brand)" }} /><div style={{ ...box, padding: 14 }}><div style={{ display: "flex", justifyContent: "space-between" }}><strong style={{ fontSize: "var(--fs-13)" }}>{user}</strong><span style={{ fontFamily: "var(--font-mono)", color: "#9CA3AF", fontSize: "var(--fs-12)" }}>{time}</span></div><div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}><Tag label={before} /><ChevronRight size={14} color="#9CA3AF" /><Tag label={after} color="brand" /></div><p style={{ ...hint, color: "#374151" }}>{field}</p><p style={hint}>备注：{note}</p><p style={hint}>影响范围：测试药厂企业 · 全部品种</p></div></div>)}</div></aside></>}
  </div>;
}

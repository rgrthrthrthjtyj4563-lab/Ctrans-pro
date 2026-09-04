/**
 * 绩效系数配置（系统管理 → 绩效系数配置，V1.6）
 * 一页两项：① 质量系数区间（阶段一）② 专员实发上限 X%（阶段二/直达）
 * 打绩效表单提交时实时读取，不做创建时快照
 */
import { useState } from "react"
import { PageHeader } from "../components/PageHeader"
import { Button } from "../components/Button"
import type { ToastMessage } from "../components/Toast"
import { DEFAULT_RULE, type PerformanceRuleConfig, getRule, setRule } from "../data/performanceData"

const inputStyle: React.CSSProperties = {
  height: 34,
  width: 160,
  border: "1px solid #D0D5DD",
  borderRadius: 6,
  padding: "0 12px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 14,
  textAlign: "right",
}

export function PerformanceCoefficientConfig({ addToast }: { addToast: (msg: Omit<ToastMessage, "id">) => void }) {
  const current = getRule()
  const [coefMin, setCoefMin] = useState(current.coefMin)
  const [coefMax, setCoefMax] = useState(current.coefMax)
  const [capX, setCapX] = useState(Math.round(current.capRatio * 100))
  const [hint, setHint] = useState("")

  function save() {
    if (!(coefMin > 0) || !(coefMax > 0) || !(coefMin < coefMax)) {
      setHint("系数区间无效：需满足 0 < 下限 < 上限")
      return
    }
    if (!(capX > 0)) {
      setHint("专员上限 X 无效：需大于 0")
      return
    }
    const next: PerformanceRuleConfig = { coefMin, coefMax, capRatio: capX / 100 }
    setRule(next)
    setHint("")
    addToast({
      type: "success",
      title: `配置已更新：系数区间 ${next.coefMin.toFixed(2)} – ${next.coefMax.toFixed(2)} · 专员上限 ${capX}%`,
    })
  }

  function reset() {
    setCoefMin(DEFAULT_RULE.coefMin)
    setCoefMax(DEFAULT_RULE.coefMax)
    setCapX(Math.round(DEFAULT_RULE.capRatio * 100))
    setHint("")
  }

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: "18px 20px",
    marginBottom: 14,
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "#667085", marginBottom: 6, display: "block" }

  return (
    <div>
      <PageHeader
        title="绩效系数配置"
        description="打绩效表单提交时实时读取，不做创建时快照；仅系统管理员可改"
        updatedAt="配置变更实时生效"
      />
      <div style={{ padding: "16px 24px" }}>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>质量系数区间（阶段一）</div>
          <p style={{ fontSize: 12.5, color: "#667085", marginTop: 0 }}>
            用于「服务商给工作组打绩效」：质量系数 = 实发金额 ÷ 默认金额，须在区间内（含边界），越界阻断提交。
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>下限</label>
              <input style={inputStyle} type="number" min={0} step={0.01} value={coefMin} onChange={(e) => setCoefMin(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label style={labelStyle}>上限</label>
              <input style={inputStyle} type="number" min={0} step={0.01} value={coefMax} onChange={(e) => setCoefMax(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>专员实发上限 X%（阶段二 / 三级直达）</div>
          <p style={{ fontSize: 12.5, color: "#667085", marginTop: 0 }}>
            用于「给服务专员打绩效」：实发金额不得大于该专员完成工作量金额 × X%，超出阻断提交；与阶段一金额互不约束。
          </p>
          <div>
            <label style={labelStyle}>上限比例 X（%）</label>
            <input style={inputStyle} type="number" min={1} step={1} value={capX} onChange={(e) => setCapX(parseInt(e.target.value, 10) || 0)} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={save}>
            保存配置
          </Button>
          <Button variant="ghost" onClick={reset}>
            恢复默认（0.60 / 1.20 / 120%）
          </Button>
          {hint ? (
            <span style={{ fontSize: 12.5, color: "#C73A3A" }}>{hint}</span>
          ) : (
            <span style={{ fontSize: 12, color: "#667085" }}>
              当前生效：系数区间 {current.coefMin.toFixed(2)} – {current.coefMax.toFixed(2)} · 专员上限{" "}
              {Math.round(current.capRatio * 100)}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

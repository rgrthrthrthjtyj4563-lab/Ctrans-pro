/**
 * 审核流程页签：处理链预览 + 服务商业务审核开关（药厂/服务商差异，走草稿）
 * + 药厂成果验收流程（级数与部门顺序，接入既有 AcceptanceContext，统一走草稿发布）。
 * 服务商业务审核与药厂成果验收是不同节点，分别配置与说明。
 */
import { CheckCircle2, ChevronRight, ClipboardCheck, LockKeyhole, ShieldCheck, Users, WalletCards } from "lucide-react"
import { Tag } from "../../components/StatusTag"
import { PHARMA_ACCEPT_DEPARTMENTS } from "../../data/acceptanceData"

interface Props {
  autoReview: boolean
  onAutoReviewChange: (auto: boolean) => void
  /** 当前编辑中的验收流程（来自草稿 ?? 生效配置） */
  acceptance: { levels: number; departments: string[] }
  onAcceptanceChange: (levels: number, departments: string[]) => void
  acceptanceDirty: boolean
  readOnly: boolean
}

export function ReviewFlow({ autoReview, onAutoReviewChange, acceptance, onAcceptanceChange, acceptanceDirty, readOnly }: Props) {
  const acceptChain =
    acceptance.levels <= 1
      ? "一级 · 成果验收"
      : Array.from({ length: acceptance.levels }, (_, i) => acceptance.departments[i] ?? "销售部").join(" → ")
  const nodes = [
    { icon: ShieldCheck, title: "系统校验", detail: "次数、时长、重复与材料", state: "固定执行", tag: "info" as const },
    {
      icon: Users,
      title: "服务商业务审核",
      detail: autoReview ? "合格业务自动通过" : "默认人工审核",
      state: autoReview ? "自动/人工分流" : "人工审核",
      tag: "warning" as const,
    },
    { icon: ClipboardCheck, title: "药厂成果验收", detail: acceptChain, state: acceptance.levels <= 1 ? "一级验收" : `${acceptance.levels}级验收`, tag: "brand" as const },
    { icon: WalletCards, title: "结算确认", detail: "费用与结算独立确认", state: "独立节点", tag: "info" as const },
  ]
  const setDept = (index: number, value: string) => {
    const next = [...acceptance.departments]
    while (next.length < 3) next.push(PHARMA_ACCEPT_DEPARTMENTS[next.length] ?? "销售部")
    next[index] = value
    onAcceptanceChange(acceptance.levels, next)
  }

  return (
    <div className="pcs-tab-page">
      <div className="pcs-content-heading">
        <div>
          <h2>审核流程</h2>
          <p>预览业务从系统校验到结算确认的完整处理链；下方配置修改后进入草稿，发布后生效。</p>
        </div>
        {!readOnly && <Tag color="info" label="修改自动加入草稿，发布后生效" />}
      </div>
      <div className="pcs-flow-line">
        {nodes.map((node, index) => (
          <div className="pcs-flow-step" key={node.title}>
            <div className="pcs-step-number">{index + 1}</div>
            <node.icon size={20} />
            <strong style={{ fontSize: "var(--fs-13)", color: "var(--color-text-1)" }}>{node.title}</strong>
            <span>{node.detail}</span>
            <Tag color={node.tag} label={node.state} />
            {index < nodes.length - 1 && <ChevronRight className="pcs-flow-arrow" size={18} />}
          </div>
        ))}
      </div>

      <div className="pcs-review-settings">
        <div>
          <h3>服务商业务审核</h3>
          <p>普通合格业务可自动通过；次数超限选择「转人工审核」的记录仍进入人工节点。</p>
        </div>
        <div className="pcs-segmented">
          <button className={!autoReview ? "active" : ""} disabled={readOnly} onClick={() => onAutoReviewChange(false)}>默认人工</button>
          <button className={autoReview ? "active" : ""} disabled={readOnly} onClick={() => onAutoReviewChange(true)}>合格自动通过</button>
        </div>
      </div>

      <div style={{ marginTop: 16, border: "1px solid var(--color-border)", borderRadius: 8, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: "0 0 5px", fontSize: "var(--fs-14)", color: "var(--color-text-1)" }}>药厂成果验收流程</h3>
            <p style={{ margin: 0, color: "var(--color-text-2)", fontSize: "var(--fs-12)" }}>
              任务月度成果材料包（推广记录 + 报告）的部门验收级数与顺序；全部通过后才可发起结算。与上方「服务商业务审核」是不同节点。
            </p>
          </div>
          {acceptanceDirty ? <Tag color="warning" label="待发布变更" /> : <Tag color="brand" label={`当前生效：${acceptChain}`} />}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {[1, 2, 3].map((lv) => (
            <button
              key={lv}
              type="button"
              disabled={readOnly}
              onClick={() => onAcceptanceChange(lv, acceptance.departments)}
              aria-pressed={acceptance.levels === lv}
              style={{
                height: 30,
                padding: "0 14px",
                fontSize: "var(--fs-13)",
                fontWeight: acceptance.levels === lv ? 600 : 400,
                cursor: readOnly ? "not-allowed" : "pointer",
                color: acceptance.levels === lv ? "var(--color-brand)" : "#374151",
                background: acceptance.levels === lv ? "var(--color-brand-subtle)" : "#fff",
                border: `1px solid ${acceptance.levels === lv ? "var(--color-brand)" : "var(--color-border)"}`,
                borderRadius: 6,
              }}
            >
              {lv === 1 ? "一级（默认）" : lv === 2 ? "两级" : "三级"}
            </button>
          ))}
          <span style={{ fontSize: "var(--fs-12)", color: "var(--color-text-3)" }}>
            {acceptance.levels === 1 ? "单级验收，整包一次通过" : "材料包将按顺序逐级流转"}
          </span>
        </div>
        {acceptance.levels <= 1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px dashed #D1D5DB", borderRadius: 8, marginBottom: 12, background: "#F9FAFB", fontSize: "var(--fs-12)", color: "var(--color-text-2)" }}>
            <CheckCircle2 size={14} color="var(--color-brand)" style={{ flexShrink: 0 }} />
            单级验收 · 不区分部门，生命周期节点显示为「成果验收」
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            {Array.from({ length: acceptance.levels }, (_, i) => i).map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 8, background: "#F9FAFB" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--color-brand)", color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ minWidth: 110 }}>
                  <strong style={{ fontSize: "var(--fs-13)", color: "var(--color-text-1)" }}>第 {i + 1} 级</strong>
                  <div style={{ fontSize: "var(--fs-11)", color: "var(--color-text-3)" }}>{i === 0 ? "材料提交后首先验收" : `第 ${i} 级通过后进入`}</div>
                </div>
                <select
                  value={acceptance.departments[i] ?? PHARMA_ACCEPT_DEPARTMENTS[0]}
                  disabled={readOnly}
                  onChange={(e) => setDept(i, e.target.value)}
                  style={{ marginLeft: "auto", height: 32, padding: "0 10px", fontSize: "var(--fs-13)", color: "#374151", border: "1px solid var(--color-border)", borderRadius: 6, background: "#fff", outline: "none" }}
                >
                  {PHARMA_ACCEPT_DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px dashed #D1D5DB", borderRadius: 8, background: "#F9FAFB" }}>
          <LockKeyhole size={15} color="var(--color-text-3)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: "var(--fs-13)", color: "#374151" }}>材料完整性校验（系统自动 · 不可关闭）</strong>
            <div style={{ fontSize: "var(--fs-12)", color: "var(--color-text-3)", marginTop: 2 }}>当月推广记录须全部经服务商审核，报告须已上传</div>
          </div>
          <Tag label="内置规则" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: "var(--fs-12)", color: "var(--color-text-2)" }}>
          <CheckCircle2 size={14} color="#C77A16" style={{ flexShrink: 0 }} />
          <span>流程调整后：已在验收中的材料按原流程完成，之后新提交的按新流程执行。调整随「发布配置」一起生效。</span>
        </div>
      </div>

      <div className="pcs-compare-grid">
        <div className="pcs-result-strip">
          <Tag color="success" label="普通合格拜访" />
          <span>系统校验通过</span>
          <ChevronRight size={15} color="var(--color-text-3)" />
          <strong>{autoReview ? "自动通过服务商审核" : "等待服务商审核"}</strong>
          <ChevronRight size={15} color="var(--color-text-3)" />
          <span>药厂{acceptance.levels <= 1 ? "成果验收" : `${acceptance.levels}级验收（${acceptChain}）`}</span>
        </div>
        <div className="pcs-result-strip">
          <Tag color="warning" label="次数例外拜访" />
          <span>允许提交</span>
          <ChevronRight size={15} color="var(--color-text-3)" />
          <strong>等待服务商人工审核</strong>
          <ChevronRight size={15} color="var(--color-text-3)" />
          <span>费用待判断</span>
        </div>
      </div>
    </div>
  )
}

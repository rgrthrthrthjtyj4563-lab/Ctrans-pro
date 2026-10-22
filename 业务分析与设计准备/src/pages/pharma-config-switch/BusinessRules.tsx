/**
 * 业务规则页签：场景导航（含服务商差异角标）+ 规则分组表（生效值/草稿并列展示）。
 */
import { useState } from "react"
import { ChevronDown, Search } from "lucide-react"
import { Tag } from "../../components/StatusTag"
import {
  PHARMA_RULE_GROUPS,
  PHARMA_SCENARIO_RULE_MAP,
  PHARMA_SWITCH_SCENARIOS,
  UNIFIED_OWNER,
  differencesOf,
  getRule,
  isFixedRule,
  sameRule,
  switchKey,
  type SwitchConfig,
  type SwitchRule,
} from "../../data/pharmaSwitchRules"
interface Props {
  ownerKey: string
  ownerLabel: string
  scenario: string
  onScenarioChange: (scenario: string) => void
  live: SwitchConfig
  merged: SwitchConfig
  drafts: SwitchConfig
  onEdit: (base: SwitchRule) => void
  /** 「计费方式」行跳转到费用控制对应场景（库存信息 / 流向信息） */
  onFee: (scene: string) => void
  onlyDiff: boolean
  onOnlyDiffChange: (value: boolean) => void
  readOnly: boolean
  /** 有费用配置入口的场景：其「计费方式」行显示真实费用规则值（生效 / 含草稿） */
  feeScenes: Record<string, { live: string; merged: string; hasDraft: boolean }>
}

function rulesForScene(scene: string): SwitchRule[] {
  return scene === "医院拜访"
    ? PHARMA_RULE_GROUPS.flatMap((g) => g.rules)
    : (PHARMA_SCENARIO_RULE_MAP[scene] ?? [])
}

export function BusinessRules({
  ownerKey,
  ownerLabel,
  scenario,
  onScenarioChange,
  live,
  merged,
  drafts,
  onEdit,
  onFee,
  onlyDiff,
  onOnlyDiffChange,
  readOnly,
  feeScenes,
}: Props) {
  const [query, setQuery] = useState("")
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(PHARMA_RULE_GROUPS.map((g) => [g.title, g.open])),
  )
  const isUnified = ownerKey === UNIFIED_OWNER

  const renderRow = (base: SwitchRule) => {
    const active = getRule(live, ownerKey, scenario, base)
    const next = getRule(merged, ownerKey, scenario, base)
    const different = !sameRule(next, getRule(merged, UNIFIED_OWNER, scenario, base))
    if (onlyDiff && !different) return null
    const changed = !sameRule(active, next)
    const fee = base.name === "计费方式"
    // 库存/流向「计费方式」行读真实费用规则，跳转定位到费用控制对应场景
    const feeInfo = fee ? feeScenes[scenario] : undefined
    const hasDraft = !!drafts[switchKey(ownerKey, scenario, base.name)]
    return (
      <div className="pcs-rule-row" key={base.name}>
        <div className="pcs-rule-name">{base.name}</div>
        <div className="pcs-rule-value">
          <strong>{feeInfo ? feeInfo.live : active.value}</strong>
          {feeInfo && feeInfo.hasDraft && <span className="pcs-draft-inline">草稿：{feeInfo.merged}</span>}
          {!feeInfo && changed && <span className="pcs-draft-inline">草稿：{next.value}</span>}
        </div>
        <div className="pcs-rule-result">
          {active.result}
          {!feeInfo && changed && next.result !== active.result && (
            <span className="pcs-draft-inline">草稿：{next.result}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Tag
            color={different ? "warning" : isUnified ? "brand" : "info"}
            label={different ? "服务商差异" : isUnified ? "药厂统一" : "沿用药厂"}
          />
          {hasDraft && <Tag color="warning" label="待发布" />}
        </div>
        <div>
          {isFixedRule(base) ? (
            <span className="pcs-fixed-label" title="已确定的固定业务规则，无需配置">固定规则</span>
          ) : readOnly ? (
            <span className="pcs-fixed-label">仅查看</span>
          ) : (
            <button className="pcs-text-btn" onClick={() => (fee ? onFee(scenario) : onEdit(base))}>
              {fee ? "费用设置" : "修改"}
            </button>
          )}
        </div>
      </div>
    )
  }

  const filtered = PHARMA_SWITCH_SCENARIOS.filter((s) => s.includes(query.trim()))

  return (
    <div className="pcs-workspace">
      <aside className="pcs-scenario-panel">
        <div className="pcs-search-box">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索业务场景" aria-label="搜索业务场景" />
        </div>
        <div className="pcs-scenario-list">
          {filtered.map((s) => {
            const count = isUnified ? 0 : differencesOf(merged, ownerKey, s).length
            return (
              <div className={`pcs-scenario-item ${scenario === s ? "active" : ""}`} key={s}>
                <button onClick={() => { onScenarioChange(s); onOnlyDiffChange(false) }}>{s}</button>
                {count > 0 && (
                  <button
                    className="pcs-diff-count"
                    title={`${ownerLabel}有${count}项规则与药厂统一配置不同（含待发布草稿），点击查看`}
                    onClick={() => { onScenarioChange(s); onOnlyDiffChange(true) }}
                  >
                    {count}项差异
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {filtered.length === 0 && (
          <div className="pcs-scenario-empty">
            未找到场景
            <button onClick={() => setQuery("")}>清除搜索</button>
          </div>
        )}
      </aside>
      <section className="pcs-rule-content">
        <div className="pcs-content-heading">
          <div>
            <h2>{scenario}</h2>
            <p>业务规则决定能否提交；费用控制单独判断是否计费。</p>
          </div>
        </div>
        {!isUnified && (
          <div className="pcs-difference-filter">
            <label>
              <input
                type="checkbox"
                checked={onlyDiff}
                onChange={(e) => onOnlyDiffChange(e.target.checked)}
              />
              只看与药厂不同的规则
            </label>
            <span>差异数量包含待发布草稿</span>
          </div>
        )}
        <div className="pcs-rule-table-head">
          <span>规则名称</span>
          <span>当前生效值 / 草稿</span>
          <span>触发后结果</span>
          <span>配置来源</span>
          <span />
        </div>
        {scenario === "医院拜访" && !onlyDiff
          ? PHARMA_RULE_GROUPS.map((g) => (
              <div className="pcs-rule-group" key={g.title}>
                <div className="pcs-group-head">
                  <div>
                    <strong style={{ fontSize: "var(--fs-13)", color: "var(--color-text-1)" }}>{g.title}</strong>
                    <span>{g.description}</span>
                  </div>
                  <button onClick={() => setOpenGroups({ ...openGroups, [g.title]: !openGroups[g.title] })}>
                    {openGroups[g.title] ? "收起" : "展开"}
                    <ChevronDown size={14} style={{ transform: openGroups[g.title] ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }} />
                  </button>
                </div>
                {openGroups[g.title] && g.rules.map(renderRow)}
              </div>
            ))
          : rulesForScene(scenario).map(renderRow)}
        {onlyDiff && differencesOf(merged, ownerKey, scenario).length === 0 && (
          <div className="pcs-scenario-empty">
            本场景全部沿用药厂统一配置
            <button className="pcs-text-btn" onClick={() => onOnlyDiffChange(false)}>查看全部规则</button>
          </div>
        )}
      </section>
    </div>
  )
}

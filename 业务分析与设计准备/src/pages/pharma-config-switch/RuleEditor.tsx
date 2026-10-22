/**
 * 逐项规则编辑弹窗：按该规则的类型呈现数值/单位/选项/超限处理，
 * 校验服务商次数不得高于药厂统一上限；保存只写草稿。
 */
import { useState } from "react"
import { GitBranch } from "lucide-react"
import { Button } from "../../components/Button"
import { Modal } from "../../components/Modal"
import { UNIFIED_OWNER, isCountRule, numberOf, type SwitchRule } from "../../data/pharmaSwitchRules"

type Handling = "禁止提交" | "转人工审核" | "允许提交但不计费"

interface Props {
  base: SwitchRule
  current: SwitchRule
  unified: SwitchRule
  ownerLabel: string
  ownerKey: string
  scene: string
  onClose: () => void
  onSave: (rule: SwitchRule) => void
  onInherit: () => void
}

export function RuleEditor({ base, current, unified, ownerLabel, ownerKey, scene, onClose, onSave, onInherit }: Props) {
  const count = isCountRule(base)
  const material = /照片|拜访反馈/.test(base.name) || /^(必填|选填)$/.test(base.value)
  const method = base.name === "可用拜访方式"
  const toggle = /^(开启|关闭)$/.test(base.value)
  const [amount, setAmount] = useState(String(Number.isFinite(numberOf(current.value)) ? numberOf(current.value) || 1 : 1))
  const [unlimited, setUnlimited] = useState(current.value.includes("不限"))
  const [choice, setChoice] = useState(
    material
      ? current.value.startsWith("必填")
        ? "必填"
        : current.value === "选填"
          ? "选填"
          : "不启用"
      : current.value,
  )
  const [handling, setHandling] = useState<Handling>(
    current.result.includes("不计费")
      ? "允许提交但不计费"
      : current.result.includes("人工")
        ? "转人工审核"
        : "禁止提交",
  )
  const unit = base.value.includes("字")
    ? "字"
    : base.value.includes("分钟")
      ? "分钟"
      : base.value.includes("米")
        ? "米"
        : base.value.includes("天")
          ? "天"
          : base.value.includes("日")
            ? "日"
            : base.value.includes("月")
              ? "个月"
              : base.value.includes("份")
                ? "份"
                : "次"
  const photo = base.name.includes("照片")
  const hasQuantity = !method && !toggle && (!material || photo || base.name === "拜访反馈")
  const needsNumber = hasQuantity && !unlimited && (!material || choice === "必填")
  const n = Number(amount)
  let error = needsNumber && (!Number.isSafeInteger(n) || n < 1) ? "请输入大于0的整数" : ""
  if (base.name === "本月业务填报截止" && n > 28) error = "请选择1至28日，确保每个月都有该日期"
  const unifiedCap = numberOf(unified.value)
  if (count && ownerKey !== UNIFIED_OWNER && (unlimited ? Infinity : n) > unifiedCap) {
    error = `不能超过药厂统一上限：${unified.value}`
  }
  const value = method || toggle
    ? choice
    : material
      ? choice !== "必填"
        ? choice
        : photo
          ? `必填${base.value.includes("各") ? "各" : ""}${n}张`
          : base.name === "拜访反馈"
            ? `必填 · 至少${n}字`
            : "必填"
      : unlimited
        ? "不限制"
        : current.value.includes("不限")
          ? `最多${n}${unit}`
          : current.value.replace(/\d+/, String(n))
  const result = count
    ? unlimited
      ? "不触发次数限制"
      : `超限${handling}`
    : material
      ? choice === "必填"
        ? "不满足禁止提交"
        : choice === "选填"
          ? "不影响提交"
          : "隐藏填写入口"
      : toggle
        ? choice === "关闭"
          ? "报告中脱敏"
          : "报告中实名展示"
        : current.result

  const selectStyle = { height: 34, padding: "0 10px", fontSize: "var(--fs-13)", color: "var(--color-text-1)", border: "1px solid var(--color-border-strong)", borderRadius: 6, background: "#fff", outline: "none", minWidth: 190 } as const

  return (
    <Modal
      open
      title={`修改${base.name}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          {ownerKey !== UNIFIED_OWNER && <Button variant="ghost" onClick={onInherit}>恢复沿用药厂</Button>}
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!!error} onClick={() => onSave({ ...base, value, result })}>保存到草稿</Button>
        </>
      }
    >
      <div style={{ fontSize: "var(--fs-12)", color: "var(--color-text-2)", marginTop: -6, marginBottom: 14 }}>
        {ownerLabel} · {scene}
      </div>
      <div className="pcs-scope-hint">
        <GitBranch size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong style={{ fontSize: "var(--fs-13)" }}>{ownerKey === UNIFIED_OWNER ? "修改药厂统一规则" : "由药厂维护的服务商差异"}</strong>
          <span>
            {ownerKey === UNIFIED_OWNER
              ? "沿用本规则的服务商将同步更新；已有单独配置仍保留。"
              : `药厂统一配置：${unified.value} · ${unified.result}`}
          </span>
        </div>
      </div>
      {count && (
        <label className="pcs-check-line">
          <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
          不限制次数
        </label>
      )}
      {(material || method || toggle) && (
        <div className="pcs-field">
          <label>配置要求</label>
          <select value={choice} onChange={(e) => setChoice(e.target.value)} style={selectStyle}>
            {(material ? ["不启用", "选填", "必填"] : method ? ["上门、网络", "上门", "网络"] : ["开启", "关闭"]).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          {material && <span className="pcs-field-help">不启用：隐藏入口；选填：可填可不填；必填：未满足要求禁止提交。</span>}
        </div>
      )}
      {needsNumber && (
        <div className="pcs-field">
          <label htmlFor="pcs-rule-amount">{photo ? "每类照片最少张数" : base.name === "拜访反馈" ? "反馈最少字数" : "规则数值"}</label>
          <div className="pcs-number-input">
            <input id="pcs-rule-amount" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span>{photo ? "张" : unit}</span>
          </div>
        </div>
      )}
      {count && !unlimited && (
        <div className="pcs-field">
          <label>超限后如何处理</label>
          <select value={handling} onChange={(e) => setHandling(e.target.value as Handling)} style={selectStyle}>
            {["禁止提交", "转人工审核", "允许提交但不计费"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
      )}
      {error && (
        <div role="alert" className="pcs-field-error">{error}</div>
      )}
      <div className="pcs-example-box">
        <strong>保存后的规则</strong>
        <p>{value} · {result}</p>
      </div>
      <span className="pcs-field-help">先保存到草稿，再点击「发布配置」。已开始的业务保持原规则。</span>
    </Modal>
  )
}

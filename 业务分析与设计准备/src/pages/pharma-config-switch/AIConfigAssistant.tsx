/**
 * AI 配置助手（模块内子视图）：
 * - 帮我配置：解析「场景 + 每月次数 + 超限处理」的明确需求 → 生成建议 → 用户确认加入草稿
 * - 解释规则结果：按当前范围与规则解释能否提交、审核流向、费用结果
 * 本页为本地交互演示（规则化解析，非真实模型调用）；解释不提交业务、不占额度、不自动发布。
 */
import { useState } from "react"
import { Bot, ChevronRight, Sparkles } from "lucide-react"
import { Button } from "../../components/Button"
import { Tag } from "../../components/StatusTag"
import {
  PHARMA_SWITCH_SCENARIOS,
  REVIEW_SCENE,
  UNIFIED_OWNER,
  feeRuleOf,
  getRule,
  isCountRule,
  numberOf,
  rulesForScene,
  type SwitchConfig,
  type SwitchProviderRef,
  type SwitchRule,
} from "../../data/pharmaSwitchRules"

type Handling = "禁止提交" | "转人工审核" | "允许提交但不计费"

interface AIResponse {
  type: "explain" | "recommend" | "unsupported"
  content: string[]
  proposal?: { ownerKey: string; ownerLabel: string; scene: string; rule: SwitchRule }
}

interface Props {
  ownerKey: string
  ownerLabel: string
  providers: SwitchProviderRef[]
  scenario: string
  config: SwitchConfig
  version: number
  hasDraft: boolean
  readOnly: boolean
  onBack: () => void
  onAdd: (ownerKey: string, scene: string, rule: SwitchRule) => void
}

export function AIConfigAssistant({
  ownerKey,
  ownerLabel,
  providers,
  scenario,
  config,
  version,
  hasDraft,
  readOnly,
  onBack,
  onAdd,
}: Props) {
  const [mode, setMode] = useState<"recommend" | "explain">("recommend")
  const [text, setText] = useState("")
  const [response, setResponse] = useState<AIResponse | null>(null)
  const stateLabel = hasDraft ? `待发布草稿（基于V${version}）` : `当前生效V${version}`
  const answer = () => {
    const matchedProvider = providers.find((p) => text.includes(p.name))
    const targetOwnerKey = text.includes("药厂统一")
      ? UNIFIED_OWNER
      : matchedProvider
        ? matchedProvider.id
        : ownerKey
    const targetOwnerLabel =
      targetOwnerKey === UNIFIED_OWNER ? "药厂统一" : providers.find((p) => p.id === targetOwnerKey)?.name ?? ownerLabel
    const targetScene = PHARMA_SWITCH_SCENARIOS.find((s) => s !== "通用要求" && text.includes(s)) ?? scenario
    const base = rulesForScene(targetScene).find((r) => isCountRule(r) && /月/.test(r.name))
    if (mode === "recommend") {
      const limit = text.match(/(?:最多|上限|不超过)\s*(\d+)\s*次/)
      if (!base || !limit) {
        setResponse({
          type: "unsupported",
          content: [
            "当前原型支持「每月次数上限＋超限处理」的建议演示。请明确业务场景、每月次数，以及超限后禁止提交、转人工审核或允许提交但不计费。",
            "其他需求可在「业务规则」页签中逐项配置；完整自然语言理解将在接入 AI 服务后提供。",
          ],
        })
        return
      }
      const n = Number(limit[1])
      const handling: Handling = /不计费|不付费/.test(text)
        ? "允许提交但不计费"
        : /人工/.test(text)
          ? "转人工审核"
          : "禁止提交"
      if (!/不计费|不付费|人工|禁止|阻止/.test(text)) {
        setResponse({
          type: "unsupported",
          content: ["次数上限已识别。还需要说明：超限后是禁止提交、转人工审核，还是允许提交但不计费？"],
        })
        return
      }
      const cap = getRule(config, UNIFIED_OWNER, targetScene, base)
      if (!Number.isSafeInteger(n) || n < 1 || (targetOwnerKey !== UNIFIED_OWNER && n > numberOf(cap.value))) {
        setResponse({
          type: "unsupported",
          content: [
            `建议不能加入草稿：次数必须为正整数，服务商不得超过药厂统一上限（${cap.value}）。`,
          ],
        })
        return
      }
      const current = getRule(config, targetOwnerKey, targetScene, base)
      const rule: SwitchRule = { ...base, value: `最多${n}次`, result: `超限${handling}` }
      setResponse({
        type: "recommend",
        proposal: { ownerKey: targetOwnerKey, ownerLabel: targetOwnerLabel, scene: targetScene, rule },
        content: [
          `${targetOwnerLabel} · ${targetScene}：${current.value} → ${rule.value}；${current.result} → ${rule.result}。`,
          `第${n}次未超出本条规则，仍需满足时长、材料、重复检查等要求。`,
          `从第${n + 1}次起：${handling}。${handling === "转人工审核" ? "人工审核完成前，费用待判断。" : handling === "禁止提交" ? "不进入审核及费用计算。" : "保留业务记录，超出部分不计费。"}`,
          "时长不满足或发现重复内容，仍然禁止提交。建议加入草稿后，需要由药厂发布才会生效。",
        ],
      })
      return
    }
    const currentRules = rulesForScene(targetScene).map((r) => {
      // 库存/流向的「计费方式」读真实费用规则，说明由费用控制维护
      if (r.name === "计费方式" && (targetScene === "库存信息" || targetScene === "流向信息")) {
        const fee = feeRuleOf(
          config,
          targetOwnerKey,
          targetScene === "库存信息" ? "库存计费单位" : "流向计费单位",
        )
        return { ...r, value: fee.value, result: "由费用控制页维护并计费" }
      }
      return getRule(config, targetOwnerKey, targetScene, r)
    })
    const lines = [`解释依据：${targetOwnerLabel} · ${targetScene} · ${stateLabel}。`]
    const visit = text.match(/第\s*(\d+)\s*次/)
    const duration = text.match(/(\d+)\s*分钟/)
    const repeat = /内容重复|重复内容/.test(text) && !/没有重复|无重复|不重复/.test(text)
    let blocked = false
    let manual = false
    let unpaid = false
    if (visit && base) {
      const rule = getRule(config, targetOwnerKey, targetScene, base)
      if (Number(visit[1]) > numberOf(rule.value)) {
        lines.push(`次数：第${visit[1]}次超过${rule.value}，${rule.result}。`)
        blocked = rule.result.includes("禁止")
        manual = rule.result.includes("人工")
        unpaid = rule.result.includes("不计费")
      } else {
        lines.push(`次数：第${visit[1]}次未超出${rule.value}。`)
      }
    }
    if (duration) {
      for (const r of currentRules.filter((r) => /最短拜访时长|最长拜访时长/.test(r.name))) {
        const fail = r.name.includes("最短") ? Number(duration[1]) < numberOf(r.value) : Number(duration[1]) > numberOf(r.value)
        lines.push(`时长：${duration[1]}分钟${fail ? "不满足" : "满足"}${r.name}${r.value}。`)
        blocked ||= fail
      }
    }
    if (repeat) {
      blocked = true
      lines.push("内容重复：提示重复原因并禁止提交。")
    }
    if (visit || duration || repeat) {
      lines.push(
        `提交结果：${blocked ? "禁止提交" : manual ? "可提交，转人工审核" : unpaid ? "可提交，但不计费" : "已提供条件未命中阻断；其他必要条件仍需校验"}。`,
      )
      lines.push(
        `审核与费用：${blocked ? "不进入审核、不产生费用" : unpaid ? "超限部分不计费，其他业务审核要求仍适用" : manual ? "进入人工审核，费用待判断" : "满足全部业务规则后，再按审核、费用控制及价格约定判断"}。`,
      )
      lines.push("仅解释已提供的次数、时长与内容重复条件；未提供的定位、材料等条件不视为已通过。")
    } else {
      lines.push(...currentRules.map((r) => `${r.name}：${r.value}；${r.result}。`))
      lines.push("可继续描述具体业务，例如「第7次拜访，时长20分钟」，查看这些条件下的处理结果。")
    }
    setResponse({ type: "explain", content: lines })
  }
  const quickQuestions =
    mode === "explain"
      ? [
          "解释当前配置会产生什么结果",
          `${scenario}第7次拜访，时长20分钟，会怎么处理？`,
          `${scenario}第7次拜访，时长10分钟，且内容重复，会怎么处理？`,
          "库存信息本月收集10条，费用怎么算？",
        ]
      : [
          `${ownerLabel}医院拜访每月最多6次，超过允许记录但不计费。`,
          `${ownerLabel}医院拜访每月最多5次，超过转人工审核。`,
        ]

  return (
    <div className="pcs-ai">
      <div style={{ maxWidth: 1400, margin: "0 auto 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <button className="pcs-back-link" onClick={onBack}>
            <ChevronRight size={16} />返回药厂配置开关
          </button>
          <h1 style={{ margin: "0 0 4px", fontSize: "var(--fs-20)", fontWeight: 600, color: "var(--color-text-1)" }}>AI 配置助手</h1>
          <p style={{ margin: 0, color: "var(--color-text-2)", fontSize: "var(--fs-13)" }}>
            描述需求获得配置建议，或询问当前规则会产生什么结果；返回后保留配置范围、场景、页签与草稿。
          </p>
        </div>
        <Tag color="warning" label="交互演示 · 尚未接入AI服务" />
      </div>
      <div className="pcs-ai-frame">
        <section className="pcs-chat-panel">
          <div className="pcs-chat-context">
            <Bot size={16} />
            {ownerLabel} · {scenario} · {stateLabel}
          </div>
          <div className="pcs-segmented" style={{ alignSelf: "flex-start" }}>
            <button className={mode === "recommend" ? "active" : ""} onClick={() => { setMode("recommend"); setResponse(null) }}>帮我配置</button>
            <button className={mode === "explain" ? "active" : ""} onClick={() => { setMode("explain"); setResponse(null) }}>解释规则结果</button>
          </div>
          <div className="pcs-ai-welcome">
            <div className="pcs-bot-avatar"><Bot size={20} /></div>
            <p>
              {mode === "explain"
                ? "我会结合当前范围与规则，解释能否提交、审核流向、费用结果和原因。"
                : "说明希望怎样开展业务，建议经你确认后加入草稿。"}
            </p>
          </div>
          <div className="pcs-quick-list">
            <span>示例问题</span>
            {quickQuestions.map((q) => (
              <button key={q} onClick={() => { setText(q); setResponse(null) }}>
                <span style={{ overflowWrap: "anywhere" }}>{q}</span>
                <ChevronRight size={14} style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
          <div className="pcs-prompt-box">
            <textarea
              aria-label="描述需求或业务情况"
              maxLength={500}
              value={text}
              onChange={(e) => { setText(e.target.value); setResponse(null) }}
              placeholder={mode === "explain" ? "描述你想了解的业务情况…" : "描述业务场景、次数和超限处理方式…"}
            />
            <div>
              <span>{text.length}/500</span>
              <Button variant="primary" size="sm" disabled={!text.trim()} onClick={answer}>
                {mode === "explain" ? "解释结果" : "生成配置建议"}
              </Button>
            </div>
          </div>
        </section>
        <section className="pcs-proposal-panel">
          {!response ? (
            <div className="pcs-proposal-empty">
              <Sparkles size={28} />
              <strong>{mode === "explain" ? "了解规则如何影响业务" : "把业务需求变成配置"}</strong>
              <p>解释不会提交业务、占用额度或修改配置。配置建议需确认加入草稿后再发布。</p>
            </div>
          ) : (
            <div className="pcs-proposal">
              <div className="pcs-proposal-head">
                <h2>
                  {response.type === "explain" ? "规则结果说明" : response.type === "recommend" ? "配置建议与影响" : "需要补充的信息"}
                </h2>
              </div>
              {response.content.map((line, i) => (
                <div className="pcs-understanding" key={i}>
                  <p>{line}</p>
                </div>
              ))}
              {response.proposal && (
                <div className="pcs-proposal-actions">
                  {readOnly ? (
                    <span style={{ fontSize: "var(--fs-12)", color: "var(--color-text-3)", alignSelf: "center" }}>
                      当前身份无编辑权限，不能把建议加入草稿。
                    </span>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => {
                        const p = response.proposal!
                        onAdd(p.ownerKey, p.scene, p.rule)
                      }}
                    >
                      确认加入草稿（{response.proposal.ownerLabel}）
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

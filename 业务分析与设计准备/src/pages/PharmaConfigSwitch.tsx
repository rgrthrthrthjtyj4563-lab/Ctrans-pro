/**
 * 药厂配置开关（业务规则版）：由药厂维护业务规则、费用控制、审核流程与版本记录。
 * - 配置范围：药厂统一 + 指定合作服务商差异（服务商列表来自真实合作关系，稳定租户 ID）
 * - 草稿制：所有修改先入草稿，「发布配置」校验通过后更新生效值、递增版本、保留快照
 * - 成果验收流程接入既有 AcceptanceContext：草稿阶段不生效，确认发布后再同步共享上下文
 * - 权限：复用 can("business-switch", "view"/"edit")；发布沿用 edit 权限
 * 本页为前端原型：本地持久化、无后端、AI 为本地交互演示。
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, ShieldCheck } from "lucide-react"
import { Button } from "../components/Button"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { Modal } from "../components/Modal"
import { PageHeader } from "../components/PageHeader"
import { Tag } from "../components/StatusTag"
import type { ToastMessage } from "../components/Toast"
import { usePermission } from "../context/PermissionContext"
import { useAcceptance } from "../context/AcceptanceContext"
import { PHARMA_ACCEPT_DEPARTMENTS } from "../data/acceptanceData"
import { relationshipsOfPharma, subscribeCooperation, tenantNameOf } from "../data/cooperationModel"
import { usePharmaSwitchConfig } from "../hooks/usePharmaSwitchConfig"
import {
  ACCEPTANCE_RULE,
  FEE_BASE_RULES,
  FEE_SCENE,
  PHARMA_SWITCH_SCENARIOS,
  REVIEW_BASE_RULE,
  REVIEW_SCENE,
  UNIFIED_OWNER,
  UNIFIED_OWNER_LABEL,
  differencesOf,
  encodeAcceptanceRule,
  feeRuleOf,
  getRule,
  hasFeeDraft,
  parseAcceptanceRule,
  rulesForScene,
  sameRule,
  type SwitchProviderRef,
  type SwitchRule,
  type SwitchSnapshot,
} from "../data/pharmaSwitchRules"
import { AIConfigAssistant } from "./pharma-config-switch/AIConfigAssistant"
import { BusinessRules } from "./pharma-config-switch/BusinessRules"
import { FeeControl } from "./pharma-config-switch/FeeControl"
import { PublishDialog } from "./pharma-config-switch/PublishDialog"
import { ReviewFlow } from "./pharma-config-switch/ReviewFlow"
import { RuleEditor } from "./pharma-config-switch/RuleEditor"
import { VersionDetailDialog, VersionHistory } from "./pharma-config-switch/VersionHistory"
import type { NavigateFn, Role } from "../types"
import "./pharma-config-switch/pharma-config-switch.css"

type TabId = "rules" | "fee" | "review" | "version"
type Scope = "unified" | "provider"

const TABS: { id: TabId; label: string }[] = [
  { id: "rules", label: "业务规则" },
  { id: "fee", label: "费用控制" },
  { id: "review", label: "审核流程" },
  { id: "version", label: "版本记录" },
]

interface Props {
  addToast: (msg: Omit<ToastMessage, "id">) => void
  currentRole?: Role
  navigate?: NavigateFn
}

export function PharmaConfigSwitch({ addToast, navigate }: Props) {
  const { principal, can, logAudit } = usePermission()
  const readOnly = !can("business-switch", "edit")
  const pharmaTenantId = principal.realm === "TENANT" ? principal.tenantId : ""
  const pharmaName = principal.realm === "TENANT" ? principal.tenantName : ""

  // 合作生效的服务商（真实合作关系，按稳定租户 ID；合作暂停/终止自动退出差异配置）
  const [coopRev, setCoopRev] = useState(0)
  useEffect(() => subscribeCooperation(() => setCoopRev((r) => r + 1)), [])
  const providers = useMemo<SwitchProviderRef[]>(() => {
    if (!pharmaTenantId) return []
    return relationshipsOfPharma(pharmaTenantId)
      .filter((r) => r.status === "active")
      .map((r) => ({ id: r.providerTenantId, name: tenantNameOf(r.providerTenantId) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmaTenantId, coopRev])

  const { state, merged, version, draftCount, conflicts, storageError, saveRule, discardDrafts, publish } =
    usePharmaSwitchConfig(pharmaTenantId, providers)

  const [tab, setTab] = useState<TabId>("rules")
  const [scope, setScope] = useState<Scope>("unified")
  const [providerKey, setProviderKey] = useState("")
  const [scenario, setScenario] = useState("医院拜访")
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [editing, setEditing] = useState<SwitchRule | null>(null)
  const [feeFocus, setFeeFocus] = useState("库存信息")
  const [dialog, setDialog] = useState<null | "publish" | "diff" | "differences" | "discard">(null)
  const [versionDetail, setVersionDetail] = useState<SwitchSnapshot | null>(null)
  const [aiOpen, setAiOpen] = useState(false)

  useEffect(() => {
    if (scope === "provider" && !providerKey && providers.length) setProviderKey(providers[0].id)
  }, [scope, providerKey, providers])

  const selectedProvider = providers.find((p) => p.id === providerKey)
  const ownerKey = scope === "unified" ? UNIFIED_OWNER : providerKey
  const ownerLabel = scope === "unified" ? UNIFIED_OWNER_LABEL : selectedProvider?.name ?? providerKey

  // ── 成果验收（接入 AcceptanceContext，统一走草稿发布） ──
  const { config: acceptConfig, saveConfig: saveAcceptanceConfig } = useAcceptance()
  const acceptBase = useMemo(
    () => encodeAcceptanceRule(acceptConfig.levels, acceptConfig.departments),
    [acceptConfig],
  )
  const acceptRule = getRule(merged, UNIFIED_OWNER, REVIEW_SCENE, acceptBase)
  const acceptParsed = parseAcceptanceRule(acceptRule)
  // 部门满配三档：解析值（草稿/覆盖）优先，缺档回填当前生效配置，切换级数时下拉始终有值
  const acceptDepartments = Array.from({ length: 3 }, (_, i) => {
    if (acceptParsed && i < acceptParsed.levels) return acceptParsed.departments[i] ?? "销售部"
    return acceptConfig.departments[i] ?? PHARMA_ACCEPT_DEPARTMENTS[i] ?? "销售部"
  })
  const acceptEditing = {
    levels: acceptParsed?.levels ?? acceptConfig.levels,
    departments: acceptDepartments,
  }
  const acceptanceDirty = !sameRule(acceptRule, acceptBase)

  /** 草稿/差异表里的规则基线解析（含费用控制、审核流程两个伪场景） */
  const resolveBase = useCallback(
    (scene: string, name: string, next: SwitchRule): SwitchRule => {
      if (scene === FEE_SCENE) return FEE_BASE_RULES.find((r) => r.name === name) ?? next
      if (scene === REVIEW_SCENE) return name === REVIEW_BASE_RULE.name ? REVIEW_BASE_RULE : acceptBase
      return rulesForScene(scene).find((r) => r.name === name) ?? next
    },
    [acceptBase],
  )

  const autoReview = getRule(merged, ownerKey, REVIEW_SCENE, REVIEW_BASE_RULE).value === "合格自动通过"

  const handleSaveRule = (rule: SwitchRule) => {
    saveRule(ownerKey, scenario, rule, resolveBase(scenario, rule.name, rule))
    setEditing(null)
    addToast({ type: "success", title: "已保存到草稿", description: "发布前不改变当前生效配置。" })
  }
  const handleInherit = () => {
    if (!editing) return
    saveRule(ownerKey, scenario, getRule(merged, UNIFIED_OWNER, scenario, editing), editing)
    setEditing(null)
    addToast({ type: "success", title: "恢复沿用已加入草稿", description: "发布后生效，并将跟随药厂统一配置的后续调整。" })
  }
  /** 费用控制页签：选项变更 → 统一草稿流（发布后生效） */
  const handleFeeChange = (base: SwitchRule, option: { value: string; result: string }) => {
    saveRule(ownerKey, FEE_SCENE, { ...base, value: option.value, result: option.result }, base)
  }
  /** 业务规则页「费用设置」→ 费用控制对应场景（库存信息 / 流向信息） */
  const handleGoFee = (scene: string) => {
    setFeeFocus(scene)
    setTab("fee")
  }
  const handleAutoReviewChange = (auto: boolean) => {
    saveRule(ownerKey, REVIEW_SCENE, { ...REVIEW_BASE_RULE, value: auto ? "合格自动通过" : "默认人工" }, REVIEW_BASE_RULE)
  }
  const handleAcceptanceChange = (levels: number, departments: string[]) => {
    saveRule(UNIFIED_OWNER, REVIEW_SCENE, encodeAcceptanceRule(levels, departments), acceptBase)
  }

  const publishHint = draftCount
    ? `已有${draftCount}项待发布修改。保存草稿不会改变当前生效配置。`
    : "暂无待发布修改。点击规则右侧「修改」，保存到草稿后即可发布。"

  const doPublish = () => {
    if (!draftCount) return
    const errors = [...conflicts]
    if (acceptanceDirty) {
      const parsed = parseAcceptanceRule(acceptRule)
      if (!parsed || (parsed.levels > 1 && parsed.departments.length < parsed.levels)) {
        errors.push("成果验收流程配置不完整：每级需对应一个验收部门")
      }
    }
    if (errors.length) {
      addToast({ type: "error", title: "暂不能发布", description: errors[0] })
      return
    }
    // 成果验收同步共享上下文：失败则中止发布（不显示发布成功）
    if (acceptanceDirty) {
      try {
        saveAcceptanceConfig({ levels: acceptEditing.levels, departments: acceptEditing.departments })
      } catch {
        addToast({ type: "error", title: "发布失败", description: "成果验收流程保存失败，发布已中止，请重试。" })
        return
      }
    }
    const result = publish()
    if (!result.ok) {
      addToast({ type: "error", title: "发布失败", description: result.errors[0] ?? "未知错误" })
      return
    }
    logAudit({
      module: "药厂配置开关",
      action: "发布配置",
      target: `V${result.version}（${result.count}项调整）`,
      resource: "business-switch.edit",
      decision: "允许",
      reason: "药厂管理员发布业务规则草稿",
      result: "成功",
    })
    setDialog(null)
    addToast({
      type: "success",
      title: `V${result.version}已发布`,
      description: "仅影响新业务；已开始、已提交的记录保留原规则（本地原型）。",
    })
  }

  if (aiOpen) {
    return (
      <div className="pcs-root">
        <PageHeader
          title="药厂配置开关"
          description="AI 配置助手"
          dataRange={pharmaName || undefined}
          updatedAt={`当前生效 V${version}${draftCount ? ` · ${draftCount}项待发布` : ""}`}
        />
        <AIConfigAssistant
          ownerKey={ownerKey}
          ownerLabel={ownerLabel}
          providers={providers}
          scenario={scenario}
          config={merged}
          version={version}
          hasDraft={draftCount > 0}
          readOnly={readOnly}
          onBack={() => setAiOpen(false)}
          onAdd={(targetOwner, scene, rule) => {
            saveRule(targetOwner, scene, rule, resolveBase(scene, rule.name, rule))
            setScope(targetOwner === UNIFIED_OWNER ? "unified" : "provider")
            if (targetOwner !== UNIFIED_OWNER) setProviderKey(targetOwner)
            setScenario(scene)
            setOnlyDiff(false)
            setTab("rules")
            setAiOpen(false)
            addToast({ type: "success", title: "建议已加入草稿", description: "请检查后发布；不会自动发布。" })
          }}
        />
      </div>
    )
  }

  const providerScopeUnavailable = scope === "provider" && (!providers.length || !selectedProvider)

  return (
    <div className="pcs-root">
      <PageHeader
        title="药厂配置开关"
        description="由药厂配置业务要求、超限处理和计费方式；修改保存到草稿，发布后生效。"
        dataRange={pharmaName || undefined}
        updatedAt={`当前生效 V${version}${draftCount ? ` · ${draftCount}项待发布` : " · 无待发布"}`}
        actions={
          <>
            <Button variant="secondary" icon={<Bot size={15} />} onClick={() => setAiOpen(true)}>AI 配置助手</Button>
            <Button
              variant="primary"
              disabled={!draftCount || readOnly}
              title={readOnly ? "当前身份无编辑权限" : draftCount ? "" : "暂无待发布修改，修改并保存到草稿后即可发布"}
              onClick={() => setDialog("publish")}
            >
              发布配置{draftCount ? `（${draftCount}）` : ""}
            </Button>
          </>
        }
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id as TabId)}
      />
      <main className="pcs-main">
        <p className="pcs-guidance">
          {publishHint}
          {storageError && <strong role="alert"> 本地保存失败，请勿刷新页面。</strong>}
        </p>
        <div className="pcs-scope-bar">
          <div className="pcs-scope-switch">
            <span>配置范围</span>
            <div className="pcs-segmented">
              <button
                className={scope === "unified" ? "active" : ""}
                onClick={() => { setScope("unified"); setOnlyDiff(false) }}
              >
                药厂统一
              </button>
              <button
                className={scope === "provider" ? "active" : ""}
                disabled={!providers.length}
                title={providers.length ? "" : "暂无合作生效的服务商"}
                onClick={() => { setScope("provider"); setOnlyDiff(false) }}
              >
                指定服务商
              </button>
            </div>
          </div>
          {scope === "provider" && (
            providers.length ? (
              <select
                className="pcs-select"
                value={providerKey}
                onChange={(e) => { setProviderKey(e.target.value); setOnlyDiff(false) }}
                aria-label="选择服务商"
              >
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: "var(--fs-12)", color: "var(--color-text-2)" }}>暂无合作生效的服务商，先在「合作与授权 › 合作关系」建立合作</span>
            )
          )}
          <span className="pcs-version-chip">V{version} · 当前生效</span>
          {draftCount > 0 && (
            <button className="pcs-draft-chip" onClick={() => setDialog("diff")}>草稿有{draftCount}项修改</button>
          )}
          <button className="pcs-difference-link" onClick={() => setDialog("differences")}>查看服务商差异</button>
        </div>
        <div className="pcs-page-surface">
          {tab === "rules" &&
            (providerScopeUnavailable ? (
              <div className="pcs-scenario-empty" style={{ padding: "60px 20px" }}>
                {providers.length
                  ? "所选服务商合作已暂停或终止，差异配置仅在合作生效期间可用。"
                  : "当前药厂暂无合作生效的服务商，可先维护药厂统一规则。"}
                <Button variant="outline" size="sm" onClick={() => setScope("unified")}>返回药厂统一</Button>
              </div>
            ) : (
              <BusinessRules
                ownerKey={ownerKey}
                ownerLabel={ownerLabel}
                scenario={scenario}
                onScenarioChange={setScenario}
                live={state.live}
                merged={merged}
                drafts={state.drafts}
                onEdit={(base) => { setEditing(base) }}
                onFee={handleGoFee}
                onlyDiff={onlyDiff}
                onOnlyDiffChange={setOnlyDiff}
                readOnly={readOnly}
                feeScenes={{
                  库存信息: {
                    live: feeRuleOf(state.live, ownerKey, "库存计费单位").value,
                    merged: feeRuleOf(merged, ownerKey, "库存计费单位").value,
                    hasDraft: hasFeeDraft(state.drafts, ownerKey, "库存计费单位"),
                  },
                  流向信息: {
                    live: feeRuleOf(state.live, ownerKey, "流向计费单位").value,
                    merged: feeRuleOf(merged, ownerKey, "流向计费单位").value,
                    hasDraft: hasFeeDraft(state.drafts, ownerKey, "流向计费单位"),
                  },
                }}
              />
            ))}
          {tab === "fee" && (
            <FeeControl
              ownerKey={ownerKey}
              ownerLabel={ownerLabel}
              live={state.live}
              merged={merged}
              drafts={state.drafts}
              focus={feeFocus}
              onChange={readOnly ? () => {} : handleFeeChange}
              onOpenPriceTable={() => {
                if (navigate) {
                  navigate("price-config")
                } else {
                  addToast({ type: "info", title: "价目表配置", description: "请从左侧菜单「基础数据 › 价目表配置」进入。" })
                }
              }}
              readOnly={readOnly}
            />
          )}
          {tab === "review" && (
            <ReviewFlow
              autoReview={autoReview}
              onAutoReviewChange={readOnly ? () => {} : handleAutoReviewChange}
              acceptance={acceptEditing}
              onAcceptanceChange={readOnly ? () => {} : handleAcceptanceChange}
              acceptanceDirty={acceptanceDirty}
              readOnly={readOnly}
            />
          )}
          {tab === "version" && <VersionHistory history={state.history} onOpenDetail={setVersionDetail} />}
        </div>
      </main>
      <footer className="pcs-action-bar">
        <div>
          <span className="pcs-action-status">
            <ShieldCheck size={16} color={draftCount ? "var(--color-warning-fg)" : "var(--color-success-fg)"} />
            当前生效 V{version}
            {draftCount ? <Tag color="warning" label={`${draftCount}项待发布`} /> : <span>暂无待发布修改</span>}
          </span>
        </div>
        {readOnly ? (
          <span className="pcs-publish-hint">当前身份仅可查看，配置调整由拥有药厂配置开关编辑权限的企业管理员操作。</span>
        ) : (
          <div>
            {draftCount > 0 && (
              <Button variant="ghost" onClick={() => setDialog("discard")}>放弃草稿</Button>
            )}
            {draftCount > 0 && (
              <Button
                variant="outline"
                onClick={() =>
                  addToast(
                    storageError
                      ? { type: "warning", title: "本地保存失败", description: "请勿刷新页面。" }
                      : { type: "info", title: "草稿已保存在此浏览器", description: "刷新后仍可继续编辑（演示原型，本地存储）。" },
                  )
                }
              >
                保存草稿
              </Button>
            )}
            <Button
              variant="primary"
              disabled={!draftCount}
              title={draftCount ? "" : "暂无待发布修改，修改并保存到草稿后即可发布"}
              onClick={() => setDialog("publish")}
            >
              发布配置{draftCount ? `（${draftCount}）` : ""}
            </Button>
          </div>
        )}
      </footer>

      {editing && (
        <RuleEditor
          base={editing}
          current={getRule(merged, ownerKey, scenario, editing)}
          unified={getRule(merged, UNIFIED_OWNER, scenario, editing)}
          ownerLabel={ownerLabel}
          ownerKey={ownerKey}
          scene={scenario}
          onClose={() => setEditing(null)}
          onSave={handleSaveRule}
          onInherit={handleInherit}
        />
      )}
      {(dialog === "publish" || dialog === "diff") && (
        <PublishDialog
          mode={dialog}
          live={state.live}
          drafts={state.drafts}
          providers={providers}
          conflicts={conflicts}
          version={version}
          draftCount={draftCount}
          resolveBase={resolveBase}
          onClose={() => setDialog(null)}
          onConfirmPublish={doPublish}
          onGoPublish={() => setDialog("publish")}
        />
      )}
      {dialog === "discard" && (
        <ConfirmDialog
          open
          title="放弃全部草稿？"
          description={`将移除${draftCount}项待发布修改，当前生效配置不受影响。`}
          impact="放弃后无法恢复本次草稿。"
          variant="warning"
          confirmLabel="确认放弃"
          onConfirm={() => {
            discardDrafts()
            setDialog(null)
            addToast({ type: "info", title: "已放弃草稿", description: "当前生效配置保持不变。" })
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === "differences" && (
        <Modal
          open
          title="服务商差异概览"
          onClose={() => setDialog(null)}
          width={860}
          footer={<Button variant="outline" onClick={() => setDialog(null)}>关闭</Button>}
        >
          <div style={{ fontSize: "var(--fs-12)", color: "var(--color-text-2)", marginTop: -6, marginBottom: 14 }}>
            与药厂统一配置比较，包含待发布草稿；仅统计合作生效的服务商。
          </div>
          <div className="pcs-difference-table">
            <div className="pcs-difference-head">
              <span>服务商</span><span>差异规则</span><span>涉及场景</span><span>版本</span><span />
            </div>
            {providers.length === 0 && (
              <div className="pcs-difference-row"><span style={{ color: "var(--color-text-2)" }}>暂无合作生效的服务商</span><span /><span /><span /><span /></div>
            )}
            {providers.map((p) => {
              const items = [...PHARMA_SWITCH_SCENARIOS, FEE_SCENE].map((s) => ({ scene: s, count: differencesOf(merged, p.id, s).length })).filter((s) => s.count)
              return (
                <div className="pcs-difference-row" key={p.id}>
                  <span>{p.name}</span>
                  <span>{items.reduce((n, s) => n + s.count, 0)}项</span>
                  <span style={{ overflowWrap: "anywhere" }}>{items.map((s) => `${s.scene} ${s.count}项`).join("、") || "全部沿用药厂规则"}</span>
                  <span>V{version}{draftCount > 0 ? "＋草稿" : ""}</span>
                  <button
                    onClick={() => {
                      setScope("provider")
                      setProviderKey(p.id)
                      setScenario(items[0]?.scene ?? "医院拜访")
                      setOnlyDiff(items.length > 0)
                      setTab("rules")
                      setDialog(null)
                    }}
                  >
                    查看规则
                  </button>
                </div>
              )
            })}
          </div>
        </Modal>
      )}
      {versionDetail && (
        <VersionDetailDialog
          snapshot={versionDetail}
          providers={providers}
          onClose={() => setVersionDetail(null)}
        />
      )}
    </div>
  )
}

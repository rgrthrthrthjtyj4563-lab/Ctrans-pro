/**
 * 发布确认 / 草稿变更弹窗：真实草稿差异表 + 冲突校验 + 生效说明。
 */
import { Check } from "lucide-react"
import { Button } from "../../components/Button"
import { Modal } from "../../components/Modal"
import {
  splitSwitchKey,
  getRule,
  type SwitchConfig,
  type SwitchProviderRef,
  type SwitchRule,
} from "../../data/pharmaSwitchRules"

function ChangeList({
  live,
  drafts,
  providers,
  resolveBase,
}: {
  live: SwitchConfig
  drafts: SwitchConfig
  providers: SwitchProviderRef[]
  resolveBase: (scene: string, name: string, next: SwitchRule) => SwitchRule
}) {
  const ownerLabel = (ownerKey: string) =>
    ownerKey === "unified"
      ? "药厂统一"
      : providers.find((p) => p.id === ownerKey)?.name ?? ownerKey
  return (
    <div className="pcs-diff-table">
      <div className="pcs-diff-head">
        <span>范围 / 规则</span>
        <span>当前生效</span>
        <span>拟发布配置</span>
        <span>处理结果</span>
      </div>
      {Object.entries(drafts).map(([key, next]) => {
        const { ownerKey, scene, ruleName } = splitSwitchKey(key)
        const base = resolveBase(scene, ruleName, next)
        const previous = getRule(live, ownerKey, scene, base)
        return (
          <div className="pcs-diff-row" key={key}>
            <span>
              <strong>{ownerLabel(ownerKey)}</strong>
              <small>{scene} · {ruleName}</small>
            </span>
            <span>
              {previous.value}
              <small>{previous.result}</small>
            </span>
            <span>{next.value}</span>
            <span>{next.result}</span>
          </div>
        )
      })}
      {Object.keys(drafts).length === 0 && (
        <div className="pcs-diff-row">
          <span style={{ color: "var(--color-text-2)" }}>暂无待发布修改</span>
          <span /><span /><span />
        </div>
      )}
    </div>
  )
}

interface Props {
  /** publish = 发布确认；diff = 草稿变更查看 */
  mode: "publish" | "diff"
  live: SwitchConfig
  drafts: SwitchConfig
  providers: SwitchProviderRef[]
  conflicts: string[]
  version: number
  draftCount: number
  resolveBase: (scene: string, name: string, next: SwitchRule) => SwitchRule
  onClose: () => void
  onConfirmPublish: () => void
  onGoPublish: () => void
}

export function PublishDialog({
  mode,
  live,
  drafts,
  providers,
  conflicts,
  version,
  draftCount,
  resolveBase,
  onClose,
  onConfirmPublish,
  onGoPublish,
}: Props) {
  const isPublish = mode === "publish"
  return (
    <Modal
      open
      title={isPublish ? "确认发布配置" : "草稿变更"}
      onClose={onClose}
      width={880}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>返回修改</Button>
          {isPublish ? (
            <Button variant="primary" disabled={!draftCount || conflicts.length > 0} onClick={onConfirmPublish}>
              确认发布 V{version + 1}
            </Button>
          ) : (
            <Button variant="primary" disabled={!draftCount || conflicts.length > 0} onClick={onGoPublish}>
              前往发布
            </Button>
          )}
        </>
      }
    >
      <div style={{ fontSize: "var(--fs-12)", color: "var(--color-text-2)", marginTop: -6, marginBottom: 14 }}>
        {draftCount}项修改 · 当前V{version} → 新版本V{version + 1}
      </div>
      <ChangeList live={live} drafts={drafts} providers={providers} resolveBase={resolveBase} />
      <div className="pcs-release-note">
        生效方式：发布后立即生效。仅影响新业务，已开始、已提交的记录不变。本次发布保存在当前浏览器的原型数据中。
      </div>
      {conflicts.length > 0 ? (
        <div className="pcs-validation-errors" role="alert" style={{ marginTop: 10 }}>
          <strong>暂不能发布，请处理以下冲突</strong>
          {conflicts.map((c) => <p key={c}>{c}</p>)}
        </div>
      ) : (
        <div className="pcs-validation-ok" style={{ marginTop: 10 }}>
          <Check size={18} />
          冲突校验通过（服务商次数上限、时长上下限、结算申请窗口），可发布。
        </div>
      )}
    </Modal>
  )
}

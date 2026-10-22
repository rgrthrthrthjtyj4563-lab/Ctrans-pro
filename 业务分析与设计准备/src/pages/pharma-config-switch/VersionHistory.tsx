/**
 * 版本记录页签 + 版本快照详情弹窗：本地原型的真实发布记录，每次发布保留配置快照。
 */
import { History } from "lucide-react"
import { Button } from "../../components/Button"
import { Modal } from "../../components/Modal"
import { Tag } from "../../components/StatusTag"
import {
  getRule,
  type SwitchConfig,
  type SwitchProviderRef,
  type SwitchSnapshot,
} from "../../data/pharmaSwitchRules"
import { allSceneRules } from "../../data/pharmaSwitchRules"

export function VersionHistory({
  history,
  onOpenDetail,
}: {
  history: SwitchSnapshot[]
  onOpenDetail: (snapshot: SwitchSnapshot) => void
}) {
  return (
    <div className="pcs-tab-page">
      <div className="pcs-content-heading">
        <div>
          <h2>版本记录</h2>
          <p>本地原型的真实发布记录；每次发布保留配置快照。修改规则 → 保存到草稿 → 发布配置。</p>
        </div>
      </div>
      <div className="pcs-version-list">
        {history.map((h, i) => (
          <div className="pcs-version-row" key={h.version}>
            <div className={`pcs-version-dot ${i === 0 ? "current" : ""}`}><History size={16} /></div>
            <div className="pcs-version-main">
              <div>
                <strong style={{ fontSize: "var(--fs-13)", color: "var(--color-text-1)" }}>V{h.version}</strong>
                <Tag color={i === 0 ? "success" : "default"} label={i === 0 ? "当前生效" : "历史版本"} />
              </div>
              <p>{h.note}</p>
            </div>
            <span style={{ color: "var(--color-text-2)", fontSize: "var(--fs-12)", fontFamily: "var(--font-mono)" }}>{h.date}</span>
            <Button variant="outline" size="sm" onClick={() => onOpenDetail(h)}>查看详情</Button>
          </div>
        ))}
      </div>
      <div className="pcs-version-note">
        <History size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong style={{ fontSize: "var(--fs-13)" }}>新规则仅影响生效后新开始的业务</strong>
          <p>已开始或已提交的业务保留原规则，不追溯修改。</p>
        </div>
      </div>
    </div>
  )
}

export function VersionDetailDialog({
  snapshot,
  providers,
  onClose,
}: {
  snapshot: SwitchSnapshot
  providers: SwitchProviderRef[]
  onClose: () => void
}) {
  const ownerLabel = (ownerKey: string) =>
    ownerKey === "unified" ? "药厂统一" : providers.find((p) => p.id === ownerKey)?.name ?? ownerKey
  const config: SwitchConfig = snapshot.config
  // 药厂统一全量目录 + 各服务商覆盖项
  const rows: { key: string; label: string; value: string; result: string }[] = allSceneRules().map(({ scene, rule }) => {
    const resolved = getRule(config, "unified", scene, rule)
    return {
      key: `unified::${scene}::${rule.name}`,
      label: `药厂统一 · ${scene} · ${rule.name}`,
      value: resolved.value,
      result: resolved.result,
    }
  })
  Object.entries(config).forEach(([key, rule]) => {
    const [ownerKey, scene, name] = key.split("::")
    if (ownerKey === "unified") return
    rows.push({ key, label: `${ownerLabel(ownerKey)} · ${scene} · ${name}`, value: rule.value, result: rule.result })
  })
  return (
    <Modal open title={`版本V${snapshot.version}详情`} onClose={onClose} width={820}
      footer={<Button variant="outline" onClick={onClose}>关闭</Button>}>
      <div style={{ fontSize: "var(--fs-12)", color: "var(--color-text-2)", marginTop: -6, marginBottom: 12 }}>
        {snapshot.date} · {snapshot.note} · 仅作用于生效后的新业务。
      </div>
      <div className="pcs-snapshot-list">
        {rows.map((row) => (
          <div key={row.key}>
            <span>{row.label}</span>
            <strong style={{ color: "var(--color-text-1)", fontWeight: 600 }}>{row.value}</strong>
            <span>{row.result}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

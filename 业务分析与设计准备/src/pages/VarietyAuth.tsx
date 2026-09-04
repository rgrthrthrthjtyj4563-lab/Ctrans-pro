import { useState } from "react"
import { Plus, PencilLine, Trash2 } from "lucide-react"
import { PageHeader } from "../components/PageHeader"
import { Button } from "../components/Button"
import { Modal } from "../components/Modal"
import { RegionPicker } from "../components/RegionPicker"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { EmptyState } from "../components/EmptyState"
import { Tag } from "../components/StatusTag"
import { useTaskData } from "../context/TaskDataContext"
import {
  DEMO_PROVIDER,
  providers,
  specialists,
  workGroups,
} from "../data/mockData"
import { REGION_NATIONWIDE } from "../constants"
import type { ProviderSubAuth, Role, VarietyProviderAuth } from "../types"
import type { ToastMessage } from "../components/Toast"

interface Props {
  addToast: (msg: Omit<ToastMessage, "id">) => void
  currentRole: Role
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  fontSize: "var(--fs-13)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  outline: "none",
  fontFamily: "inherit",
}

type TabId = "pharma" | "provider"

export function VarietyAuth({ addToast, currentRole }: Props) {
  const {
    auths,
    varieties,
    createAuth,
    updateAuth,
    deleteAuth,
    subAuths,
    subAuthTargetType,
    createSubAuth,
    updateSubAuth,
    deleteSubAuth,
    varietiesOf,
  } = useTaskData()
  /** 药厂授权（药厂→服务商）由药厂销售部门管理；服务商授权（服务商→工作组/专员）由服务提供商管理 */
  const canWritePharma = currentRole === "药厂销售部门"
  const canWriteProvider = currentRole === "服务提供商"
  const [tab, setTab] = useState<TabId>(
    currentRole === "服务提供商" ? "provider" : "pharma",
  )

  const th: React.CSSProperties = {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: "var(--fs-12)",
    fontWeight: 600,
    color: "#9CA3AF",
    background: "#F9FAFB",
    borderBottom: "1px solid var(--color-border)",
    whiteSpace: "nowrap",
  }
  const td: React.CSSProperties = {
    padding: "12px",
    fontSize: "var(--fs-13)",
    color: "var(--color-text-1)",
    borderBottom: "1px solid #F3F4F6",
  }

  const tabs: { id: TabId label: string }[] = [
    { id: "pharma", label: "药厂授权" },
    { id: "provider", label: "服务商授权" },
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="品种授权"
        description="药厂把品种授权给服务提供商；服务提供商再把品种向下授权给执行对象（工作组或服务专员，跟随执行链路）。"
      />
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid var(--color-border)",
            marginBottom: 16,
          }}
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={{
                padding: "10px 15px",
                border: "none",
                borderBottom:
                  tab === item.id
                    ? "2px solid var(--color-brand)"
                    : "2px solid transparent",
                background: "none",
                color: tab === item.id ? "var(--color-brand)" : "#667085",
                fontWeight: tab === item.id ? 650 : 500,
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "pharma" ? (
          <PharmaAuthTab
            {...{
              addToast,
              canWrite: canWritePharma,
              auths,
              varieties,
              createAuth,
              updateAuth,
              deleteAuth,
              th,
              td,
            }}
          />
        ) : (
          <ProviderAuthTab
            {...{
              addToast,
              canWrite: canWriteProvider,
              subAuths,
              subAuthTargetType,
              createSubAuth,
              updateSubAuth,
              deleteSubAuth,
              varieties,
              varietiesOf,
              th,
              td,
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── 页签一：药厂授权（药厂 → 服务商，原有能力） ───

function PharmaAuthTab({
  addToast,
  canWrite,
  auths,
  varieties,
  createAuth,
  updateAuth,
  deleteAuth,
  th,
  td,
}: {
  addToast: (msg: Omit<ToastMessage, "id">) => void
  canWrite: boolean
  auths: VarietyProviderAuth[]
  varieties: { id: string tradeName: string }[]
  createAuth: (input: {
    provider: string
    varietyId: string
    regions: string[]
  }) => { ok: boolean error?: string data?: VarietyProviderAuth }
  updateAuth: (
    id: string,
    input: { provider: string varietyId: string regions: string[] },
  ) => { ok: boolean error?: string }
  deleteAuth: (id: string) => { ok: boolean error?: string }
  th: React.CSSProperties
  td: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<VarietyProviderAuth | null>(null)
  const [provider, setProvider] = useState("")
  const [varietyId, setVarietyId] = useState("")
  const [regions, setRegions] = useState<string[]>([])
  const [error, setError] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<VarietyProviderAuth | null>(
    null,
  )

  function openCreate() {
    setEditing(null)
    setProvider("")
    setVarietyId("")
    setRegions([])
    setError("")
    setOpen(true)
  }

  function openEdit(row: VarietyProviderAuth) {
    setEditing(row)
    setProvider(row.provider)
    setVarietyId(row.varietyId)
    setRegions([...row.regions])
    setError("")
    setOpen(true)
  }

  function submit() {
    const input = { provider, varietyId, regions }
    const result = editing ? updateAuth(editing.id, input) : createAuth(input)
    if (!result.ok) {
      setError(result.error || "保存失败")
      return
    }
    addToast({
      type: "success",
      title: editing ? "授权已更新" : "授权已创建",
      description: `${provider} · ${result.data?.varietyName ?? ""}`,
    })
    setOpen(false)
  }

  return (
    <>
      {canWrite && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 12,
          }}
        >
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={14} />}
            onClick={openCreate}
          >
            新建服务提供商品种授权
          </Button>
        </div>
      )}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          overflow: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "序号",
                "服务提供方",
                "药品上市许可持有人",
                "品种",
                "区域",
                "操作",
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {auths.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title="暂无授权"
                    description="请先完成品种管理，再把品种授权给服务提供方。"
                  />
                </td>
              </tr>
            ) : (
              auths.map((a, i) => (
                <tr key={a.id}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{a.provider}</td>
                  <td style={td}>{a.holder}</td>
                  <td style={td}>{a.varietyName}</td>
                  <td style={td}>{a.regions.join("、")}</td>
                  <td style={td}>
                    {canWrite && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<PencilLine size={13} />}
                          onClick={() => openEdit(a)}
                        >
                          修改
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 size={13} />}
                          onClick={() => setDeleteTarget(a)}
                        >
                          删除
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        title={editing ? "修改服务提供商品种授权" : "新建服务提供商品种授权"}
        onClose={() => setOpen(false)}
        width={560}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={submit}>
              保存
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {error && (
            <div style={{ color: "#C73A3A", fontSize: "var(--fs-13)" }}>
              {error}
            </div>
          )}
          <Field label="服务提供方">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              style={inputStyle}
            >
              <option value="">请选择服务提供方</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="品种">
            <select
              value={varietyId}
              onChange={(e) => setVarietyId(e.target.value)}
              style={inputStyle}
            >
              <option value="">请选择品种</option>
              {varieties.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.tradeName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="管理区域">
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRegions([REGION_NATIONWIDE])}
              >
                全国区域
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRegions([])}
              >
                清空
              </Button>
            </div>
            <RegionPicker value={regions} onChange={setRegions} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除授权"
        description={
          deleteTarget
            ? `删除后，${deleteTarget.provider} 将无法再承接「${deleteTarget.varietyName}」在 ${deleteTarget.regions.join("、")} 的任务。`
            : ""
        }
        confirmLabel="删除"
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteAuth(deleteTarget.id)
            addToast({ type: "success", title: "授权已删除" })
          }
          setDeleteTarget(null)
        }}
      />
    </>
  )
}

// ─── 页签二：服务商授权（服务商 → 工作组/服务专员，对象类型跟随执行链路） ───

function ProviderAuthTab({
  addToast,
  canWrite,
  subAuths,
  subAuthTargetType,
  createSubAuth,
  updateSubAuth,
  deleteSubAuth,
  varieties,
  varietiesOf,
  th,
  td,
}: {
  addToast: (msg: Omit<ToastMessage, "id">) => void
  canWrite: boolean
  subAuths: ProviderSubAuth[]
  subAuthTargetType: () => "工作组" | "服务专员"
  createSubAuth: (input: {
    provider: string
    targetType: "工作组" | "服务专员"
    targetName: string
    varietyId: string
    regions: string[]
  }) => { ok: boolean error?: string data?: ProviderSubAuth }
  updateSubAuth: (
    id: string,
    input: {
      provider: string
      targetType: "工作组" | "服务专员"
      targetName: string
      varietyId: string
      regions: string[]
    },
  ) => { ok: boolean error?: string }
  deleteSubAuth: (id: string) => { ok: boolean error?: string }
  varieties: { id: string tradeName: string }[]
  varietiesOf: (provider: string) => string[]
  th: React.CSSProperties
  td: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProviderSubAuth | null>(null)
  const [targetName, setTargetName] = useState("")
  const [varietyName, setVarietyName] = useState("")
  const [regions, setRegions] = useState<string[]>([])
  const [error, setError] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<ProviderSubAuth | null>(null)

  const targetType = subAuthTargetType()
  const targetOptions = targetType === "工作组" ? workGroups : specialists
  /** 服务商只能向下授权自己已获药厂授权的品种 */
  const authorizedVarietyNames = varietiesOf(DEMO_PROVIDER)

  function openCreate() {
    setEditing(null)
    setTargetName("")
    setVarietyName("")
    setRegions([])
    setError("")
    setOpen(true)
  }

  function openEdit(row: ProviderSubAuth) {
    setEditing(row)
    setTargetName(row.targetName)
    setVarietyName(row.varietyName)
    setRegions([...row.regions])
    setError("")
    setOpen(true)
  }

  function submit() {
    if (!varietyName) {
      setError("请选择品种")
      return
    }
    const variety = varieties.find((v) => v.tradeName === varietyName)
    if (!variety) {
      setError("品种不存在")
      return
    }
    const input = {
      provider: DEMO_PROVIDER,
      targetType,
      targetName,
      varietyId: variety.id,
      regions,
    }
    const result = editing
      ? updateSubAuth(editing.id, input)
      : createSubAuth(input)
    if (!result.ok) {
      setError(result.error || "保存失败")
      return
    }
    addToast({
      type: "success",
      title: editing ? "授权已更新" : "授权已创建",
      description: `${DEMO_PROVIDER} → ${targetName} · ${result.data?.varietyName ?? ""}`,
    })
    setOpen(false)
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Tag label={`当前授权对象：${targetType}`} color="info" />
          <span style={{ fontSize: "var(--fs-12)", color: "#667085" }}>
            授权对象类型由执行链路自动决定，切换链路后新增授权随之变化。
          </span>
        </div>
        {canWrite && (
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={14} />}
            onClick={openCreate}
          >
            新建{targetType}品种授权
          </Button>
        )}
      </div>
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          overflow: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "序号",
                "服务提供商",
                "授权对象",
                "品种",
                "区域",
                "创建时间",
                "操作",
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subAuths.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title="暂无授权"
                    description="请先把品种授权给执行对象（工作组或服务专员），再进行任务拆分。"
                  />
                </td>
              </tr>
            ) : (
              subAuths.map((a, i) => (
                <tr key={a.id}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{a.provider}</td>
                  <td style={td}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <strong>{a.targetName}</strong>
                      <Tag
                        label={a.targetType}
                        color={a.targetType === "工作组" ? "brand" : "success"}
                      />
                    </div>
                  </td>
                  <td style={td}>{a.varietyName}</td>
                  <td style={td}>{a.regions.join("、")}</td>
                  <td
                    style={{
                      ...td,
                      color: "#667085",
                      fontSize: "var(--fs-12)",
                    }}
                  >
                    {a.createdAt}
                  </td>
                  <td style={td}>
                    {canWrite && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<PencilLine size={13} />}
                          onClick={() => openEdit(a)}
                        >
                          修改
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 size={13} />}
                          onClick={() => setDeleteTarget(a)}
                        >
                          删除
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        title={
          editing ? `修改${targetType}品种授权` : `新建${targetType}品种授权`
        }
        onClose={() => setOpen(false)}
        width={560}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={submit}>
              保存
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {error && (
            <div style={{ color: "#C73A3A", fontSize: "var(--fs-13)" }}>
              {error}
            </div>
          )}
          <Field label="服务提供商">
            <input
              value={DEMO_PROVIDER}
              disabled
              style={{ ...inputStyle, background: "#F9FAFB", color: "#667085" }}
            />
          </Field>
          <Field
            label={`授权对象（当前执行链为${
              targetType === "工作组" ? "四级链" : "三级链"
            }）`}
          >
            <select
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              style={inputStyle}
            >
              <option value="">请选择{targetType}</option>
              {targetOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="品种（仅限已获药厂授权的品种）">
            <select
              value={varietyName}
              onChange={(e) => setVarietyName(e.target.value)}
              style={inputStyle}
            >
              <option value="">请选择品种</option>
              {authorizedVarietyNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="授权区域">
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRegions([REGION_NATIONWIDE])}
              >
                全国区域
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRegions([])}
              >
                清空
              </Button>
            </div>
            <RegionPicker value={regions} onChange={setRegions} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除授权"
        description={
          deleteTarget
            ? `删除后，${deleteTarget.targetName} 将无法再承接「${deleteTarget.varietyName}」在 ${deleteTarget.regions.join("、")} 的任务拆分。`
            : ""
        }
        confirmLabel="删除"
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteSubAuth(deleteTarget.id)
            addToast({ type: "success", title: "授权已删除" })
          }
          setDeleteTarget(null)
        }}
      />
    </>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontSize: "var(--fs-12)",
          color: "#667085",
          marginBottom: 6,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  )
}

/**
 * 团队工作质量评价（阶段一）
 * 批次 = 服务商 × 品种 × 考核月 × 链型；阶段二/直达按专员一对一在服务专员绩效维度操作
 */
import { useMemo, useState } from "react"
import { Download } from "lucide-react"
import { PageHeader } from "../components/PageHeader"
import { FilterBar } from "../components/FilterBar"
import { Button } from "../components/Button"
import { StatusTag, Tag } from "../components/StatusTag"
import { Pagination } from "../components/Pagination"
import { ConfirmDialog } from "../components/ConfirmDialog"
import type { ToastMessage } from "../components/Toast"
import { formatCNY } from "../constants"
import {
  type PerfBatch,
  type SpecialistRecord,
  appendOp,
  getBatches,
  getRecords,
  patchBatch,
  patchRecord,
  recordsOfBatch,
  usePerfSync,
  useRule,
} from "../data/performanceData"
import {
  BatchDetailModal,
  SpecialistDetailModal,
  SpecialistFormModal,
  Stage1FormModal,
  StatementModal,
} from "./PerformanceShared"

const PAGE_SIZE = 10

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
  whiteSpace: "nowrap",
}
const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
}
const linkBtn: React.CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  fontSize: 13,
  cursor: "pointer",
  color: "var(--color-text-1)",
}
const linkBrand: React.CSSProperties = {
  ...linkBtn,
  color: "var(--color-brand)",
  fontWeight: 500,
}

interface Props {
  addToast: (msg: Omit<ToastMessage, "id">) => void
}

type Identity = "服务商" | "工作组"

function now() {
  return new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-")
}

export function PerformanceTeamQuality({ addToast }: Props) {
  usePerfSync()
  const rule = useRule()
  const batches = getBatches()

  const [identity, setIdentity] = useState<Identity>("服务商")
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [applied, setApplied] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)

  const [stage1For, setStage1For] = useState<PerfBatch | null>(null)
  const [specialistFor, setSpecialistFor] = useState<SpecialistRecord | null>(null)
  const [detailFor, setDetailFor] = useState<PerfBatch | null>(null)
  const [spDetailFor, setSpDetailFor] = useState<SpecialistRecord | null>(null)
  const [statementFor, setStatementFor] = useState<SpecialistRecord | null>(null)
  const [revokeBlock, setRevokeBlock] = useState<PerfBatch | null>(null)
  const [revokeDirectFor, setRevokeDirectFor] = useState<SpecialistRecord | null>(null)

  const rows = useMemo(() => {
    return batches.filter((b) => {
      if (applied.query && !b.batchNo.includes(applied.query)) return false
      if (applied.provider && b.provider !== applied.provider) return false
      if (applied.variety && b.variety !== applied.variety) return false
      if (applied.group && (b.group ?? "") !== applied.group) return false
      if (applied.chain && b.chain !== applied.chain) return false
      if (applied.status && b.status !== applied.status) return false
      if (applied.month && b.month !== applied.month) return false
      return true
    })
  }, [batches, applied])

  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const stats = useMemo(() => {
    const pending = batches.filter((b) => b.status === "未打绩效").length
    const active = batches.filter((b) => b.status === "已生效").length
    const revoked = batches.filter((b) => b.status === "已撤销").length
    return { pending, active, revoked, total: batches.length }
  }, [batches])

  const provider = batches[0]?.provider ?? "程秋明发企"
  const groupOptions = Array.from(new Set(batches.map((b) => b.group).filter(Boolean))) as string[]

  function submitStage1(actual: number) {
    if (!stage1For) return
    const reopened = stage1For.status === "已撤销"
    patchBatch(stage1For.batchNo, { actualAmount: actual, status: "已生效" })
    appendOp(stage1For.batchNo, { actor: provider, time: now(), action: reopened ? "重新发起（阶段一提交生效）" : "阶段一提交生效" })
    addToast({ type: "success", title: reopened ? "阶段一绩效已重新提交生效；计入的已完成工作量已冻结" : "阶段一绩效已提交生效；计入的已完成工作量已冻结" })
    setStage1For(null)
  }

  function submitSpecialist(actual: number, evaluation: SpecialistRecord["evaluation"]) {
    if (!specialistFor) return
    const isDirect = specialistFor.chain === "三级直达"
    patchRecord(specialistFor.id, { actualAmount: actual, evaluation, status: "已生效", operatedAt: now() })
    if (isDirect) patchBatch(specialistFor.batchNo, { actualAmount: getRecords().filter((r) => r.batchNo === specialistFor.batchNo).reduce((s, r) => s + (r.actualAmount ?? 0), 0), status: "已生效" })
    appendOp(specialistFor.batchNo, { actor: isDirect ? provider : specialistFor.group ?? provider, time: now(), action: `${specialistFor.specialist} ${isDirect ? "直达绩效" : "阶段二"}提交生效` })
    const rest = recordsOfBatch(specialistFor.batchNo).filter((r) => r.status !== "已生效")
    addToast({ type: "success", title: `${specialistFor.specialist}绩效已生效${rest.length === 0 ? `；批次 ${specialistFor.batchNo} 专员绩效已全部完成` : `；本批剩余 ${rest.length} 位专员待打`}` })
    setSpecialistFor(null)
  }

  function revokeSpecialist() {
    if (!revokeDirectFor) return
    patchRecord(revokeDirectFor.id, { status: "已撤销", actualAmount: undefined, evaluation: undefined, operatedAt: now() })
    appendOp(revokeDirectFor.batchNo, { actor: provider, time: now(), action: `${revokeDirectFor.specialist} 直达绩效撤销` })
    addToast({ type: "success", title: `${revokeDirectFor.specialist}的直达绩效已撤销，工作量占用解除` })
    setRevokeDirectFor(null)
    setSpDetailFor(null)
  }

  const filterFields = [
    { id: "query", label: "绩效批次号", type: "text" as const, placeholder: "请输入批次号" },
    { id: "provider", label: "服务提供方", type: "select" as const, options: [{ value: "", label: "全部" }, { value: provider, label: provider }] },
    { id: "variety", label: "品种", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "优甲乐 100片装", label: "优甲乐 100片装" }, { value: "百赛松 30mg", label: "百赛松 30mg" }] },
    { id: "group", label: "被评价方（工作组）", type: "select" as const, options: [{ value: "", label: "全部" }, ...groupOptions.map((g) => ({ value: g, label: g }))] },
    { id: "chain", label: "流程类型", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "四级链", label: "四级链" }, { value: "三级直达", label: "三级直达" }] },
    { id: "status", label: "状态", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "未打绩效", label: "未打绩效" }, { value: "已生效", label: "已生效" }, { value: "已撤销", label: "已撤销" }] },
    { id: "month", label: "考核月份", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "2026-08", label: "2026-08" }, { value: "2026-07", label: "2026-07" }] },
  ]

  return (
    <div>
      <PageHeader
        title="团队工作质量评价"
        description="服务商给工作组打绩效；三级直达链没有工作组，服务商一对一给服务专员打。"
        actions={
          <Button variant="ghost" icon={<Download size={14} />} onClick={() => addToast({ type: "success", title: "批次快照已生成下载（演示）" })}>
            导出批次快照
          </Button>
        }
      />

      <div style={{ padding: "16px 24px" }}>
        {/* 演示身份条（原型演示控件，非登录角色） */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            background: "#FFFDF5",
            border: "1px dashed #E3C587",
            borderRadius: 8,
            padding: "8px 14px",
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "#C77A16", background: "#FEF3E2", borderRadius: 4, padding: "1px 6px" }}>原型演示</span>
          <span style={{ fontSize: 12, color: "#667085" }}>当前操作身份</span>
          <div style={{ display: "inline-flex", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 999, padding: 2, gap: 2 }}>
            {(["服务商", "工作组"] as Identity[]).map((id) => (
              <button
                key={id}
                onClick={() => setIdentity(id)}
                style={{
                  border: "none",
                  background: identity === id ? "var(--color-brand)" : "transparent",
                  color: identity === id ? "#fff" : "#667085",
                  fontSize: 12,
                  padding: "3px 14px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontWeight: identity === id ? 600 : 400,
                }}
              >
                {id}
                {id === "工作组" ? "（阶段二）" : ""}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "#667085" }}>身份条仅用于演示切换；药厂不参与绩效，登录后看不到本模块。</span>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          {[
            { k: "待处理", v: stats.pending, sub: "未打绩效" },
            { k: "已生效", v: stats.active, sub: "个批次" },
            { k: "已撤销", v: stats.revoked, sub: "个批次" },
            { k: "批次总数", v: stats.total, sub: "个" },
          ].map((s) => (
            <div
              key={s.k}
              style={{
                flex: 1,
                minWidth: 160,
                background: "#fff",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "14px 16px",
              }}
            >
              <div style={{ fontSize: 12, color: "#667085" }}>{s.k}</div>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4, ...mono }}>
                {s.v} <small style={{ fontSize: 12, color: "#667085", fontWeight: 400 }}>{s.sub}</small>
              </div>
            </div>
          ))}
        </div>

        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={(id, value) => setFilters((prev) => ({ ...prev, [id]: value }))}
          onSearch={() => {
            setApplied({ ...filters })
            setPage(1)
          }}
          onReset={() => {
            setFilters({})
            setApplied({})
            setPage(1)
          }}
        />

        <div style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 8, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr>
                <th style={th}>绩效批次号</th>
                <th style={th}>流程类型</th>
                <th style={th}>考核月份</th>
                <th style={th}>服务提供方</th>
                <th style={th}>被评价对象</th>
                <th style={th}>品种</th>
                <th style={{ ...th, textAlign: "right" }}>工作量</th>
                <th style={{ ...th, textAlign: "right" }}>默认金额</th>
                <th style={{ ...th, textAlign: "right" }}>实发金额</th>
                <th style={th}>质量系数</th>
                <th style={th}>状态</th>
                <th style={{ ...th, width: 210 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((b) => {
                const isDirect = b.chain === "三级直达"
                const coef = !isDirect && b.actualAmount ? b.actualAmount / b.defaultAmount : null
                const pendingSpecialists = recordsOfBatch(b.batchNo).filter((r) => r.status === "未打绩效")
                const nextSpecialist = pendingSpecialists[0]
                return (
                  <tr key={b.batchNo}>
                    <td style={{ ...td, ...mono }}>{b.batchNo}</td>
                    <td style={td}>
                      <Tag label={b.chain} color={isDirect ? "info" : "brand"} />
                    </td>
                    <td style={td}>{b.month}</td>
                    <td style={td}>{b.provider}</td>
                    <td style={td}>
                      {isDirect ? (
                        <span style={{ color: "#667085" }}>直达专员 ×{b.directCount ?? recordsOfBatch(b.batchNo).length}</span>
                      ) : (
                        <>
                          {b.group}
                          <span style={{ display: "block", fontSize: 11, color: "#667085", ...mono }}>cakin26</span>
                        </>
                      )}
                    </td>
                    <td style={td}>{b.variety}</td>
                    <td style={{ ...td, textAlign: "right", ...mono }}>{b.workload} 次</td>
                    <td style={{ ...td, textAlign: "right", ...mono }}>{formatCNY(b.defaultAmount)}</td>
                    <td style={{ ...td, textAlign: "right", ...mono }}>
                      {b.actualAmount != null ? formatCNY(b.actualAmount) : <span style={{ color: "#9CA3AF" }}>—</span>}
                    </td>
                    <td style={td}>
                      {coef != null ? (
                        <span style={{ ...mono, fontSize: 12.5, color: coef >= rule.coefMin && coef <= rule.coefMax ? "#248A5A" : "#C73A3A", background: coef >= rule.coefMin && coef <= rule.coefMax ? "#E6F5ED" : "#FEECEC", borderRadius: 6, padding: "3px 8px" }}>
                          {coef.toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: "#9CA3AF" }}>—</span>
                      )}
                    </td>
                    <td style={td}>
                      <StatusTag status={b.status} size="sm" />
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <button style={linkBtn} onClick={() => setDetailFor(b)}>
                          查看
                        </button>
                        {!isDirect && b.status !== "未打绩效" && identity === "工作组" && nextSpecialist && (
                          <button style={linkBrand} onClick={() => setSpecialistFor(nextSpecialist)}>
                            给服务专员打绩效
                          </button>
                        )}
                        {!isDirect && b.status === "未打绩效" && identity === "服务商" && (
                          <button style={linkBrand} onClick={() => setStage1For(b)}>
                            打绩效
                          </button>
                        )}
                        {!isDirect && b.status === "已撤销" && identity === "服务商" && (
                          <button style={linkBrand} onClick={() => setStage1For(b)}>
                            重新发起
                          </button>
                        )}
                        {isDirect && b.status === "未打绩效" && identity === "服务商" && nextSpecialist && (
                          <button style={linkBrand} onClick={() => setSpecialistFor(nextSpecialist)}>
                            打绩效
                          </button>
                        )}
                        {isDirect && b.status === "已生效" && identity === "服务商" && (
                          <button style={{ ...linkBtn, color: "#C73A3A" }} onClick={() => setRevokeDirectFor(getRecords().find((r) => r.batchNo === b.batchNo && r.status === "已生效") ?? null)}>
                            撤销
                          </button>
                        )}
                        {!isDirect && b.status === "已生效" && recordsOfBatch(b.batchNo).some((r) => r.status === "已生效") && identity === "服务商" && (
                          <button style={{ ...linkBtn, color: "#C73A3A" }} onClick={() => setRevokeBlock(b)}>
                            撤销
                          </button>
                        )}
                        {b.batchNo === "PF-202607-088" && identity === "服务商" && (
                          <button style={linkBtn} onClick={() => addToast({ type: "success", title: "批次快照已生成下载（演示）" })}>
                            导出
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />
        <p style={{ fontSize: 12.5, color: "#667085" }}>
          同一月里若同时有四级链和三级直达任务，会分成两个批次、分开打绩效，互不影响。已撤销的批次可重新打绩效。
        </p>
      </div>

      <Stage1FormModal open={!!stage1For} batch={stage1For} onClose={() => setStage1For(null)} onSubmit={submitStage1} />
      <SpecialistFormModal
        open={!!specialistFor}
        record={specialistFor}
        operator={specialistFor?.chain === "三级直达" ? "服务商" : "工作组"}
        onClose={() => setSpecialistFor(null)}
        onSubmit={submitSpecialist}
      />
      <BatchDetailModal
        open={!!detailFor}
        batch={detailFor}
        onClose={() => setDetailFor(null)}
        onViewSpecialist={(r) => setSpDetailFor(r)}
      />
      <SpecialistDetailModal
        open={!!spDetailFor}
        record={spDetailFor}
        rule={rule}
        onClose={() => setSpDetailFor(null)}
        onDownload={(r) => setStatementFor(r)}
        onRevoke={() => addToast({ type: "info", title: "撤销入口在服务专员绩效页的记录详情内（按专员单条撤销）" })}
      />
      <StatementModal
        open={!!statementFor}
        record={statementFor}
        onClose={() => setStatementFor(null)}
        onDownload={() => {
          addToast({ type: "success", title: "结算对账单 PDF 已生成下载（演示）" })
          setStatementFor(null)
        }}
      />

      <ConfirmDialog
        open={!!revokeBlock}
        title="无法撤销工作组绩效"
        description={`该批次还有 ${revokeBlock ? recordsOfBatch(revokeBlock.batchNo).filter((r) => r.status === "已生效").length : 0} 条专员绩效已生效。请先撤销专员绩效，再撤销工作组绩效。`}
        impact="撤销顺序：先撤销专员绩效，再撤销工作组绩效"
        confirmLabel="知道了"
        variant="warning"
        onConfirm={() => setRevokeBlock(null)}
        onCancel={() => setRevokeBlock(null)}
      />
      <ConfirmDialog
        open={!!revokeDirectFor}
        title="撤销直达绩效？"
        description={`确定撤销${revokeDirectFor?.specialist ?? ""}这条直达绩效？撤销后这部分工作量可重新打绩效；按专员逐条撤销。`}
        impact={revokeDirectFor ? `涉及金额 ${formatCNY(revokeDirectFor.actualAmount ?? 0)}` : undefined}
        confirmLabel="确认撤销"
        onConfirm={revokeSpecialist}
        onCancel={() => setRevokeDirectFor(null)}
      />
    </div>
  )
}

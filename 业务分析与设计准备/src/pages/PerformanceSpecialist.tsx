/**
 * 服务专员绩效（阶段二/直达结果页）
 * 一专员一条记录；行内查看=单专员分项明细；未打绩效可进一对一表单
 */
import { useMemo, useState } from "react"
import { PageHeader } from "../components/PageHeader"
import { FilterBar } from "../components/FilterBar"
import { Button } from "../components/Button"
import { StatusTag, Tag } from "../components/StatusTag"
import { Pagination } from "../components/Pagination"
import { ConfirmDialog } from "../components/ConfirmDialog"
import type { ToastMessage } from "../components/Toast"
import { formatCNY } from "../constants"
import {
  type SpecialistRecord,
  appendOp,
  getRecords,
  itemsDefault,
  itemsWorkload,
  patchRecord,
  usePerfSync,
  useRule,
} from "../data/performanceData"
import { SpecialistDetailModal, SpecialistFormModal, StatementModal } from "./PerformanceShared"

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

function now() {
  return new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-")
}

export function PerformanceSpecialist({ addToast }: Props) {
  usePerfSync()
  const rule = useRule()
  const records = getRecords()

  const [filters, setFilters] = useState<Record<string, string>>({})
  const [applied, setApplied] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)

  const [formFor, setFormFor] = useState<SpecialistRecord | null>(null)
  const [detailFor, setDetailFor] = useState<SpecialistRecord | null>(null)
  const [statementFor, setStatementFor] = useState<SpecialistRecord | null>(null)
  const [revokeFor, setRevokeFor] = useState<SpecialistRecord | null>(null)

  const rows = useMemo(() => {
    return records.filter((r) => {
      if (applied.provider && r.provider !== applied.provider) return false
      if (applied.group && (r.group ?? "直达") !== applied.group) return false
      if (applied.specialist && r.specialist !== applied.specialist) return false
      if (applied.variety && r.variety !== applied.variety) return false
      if (applied.chain && r.chain !== applied.chain) return false
      if (applied.status && r.status !== applied.status) return false
      if (applied.month && r.month !== applied.month) return false
      return true
    })
  }, [records, applied])

  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const stats = useMemo(() => {
    const pending = records.filter((r) => r.status === "未打绩效").length
    const active = records.filter((r) => r.status === "已生效").length
    const sum = records.reduce((s, r) => s + (r.actualAmount ?? 0), 0)
    return { pending, active, sum, count: records.length }
  }, [records])

  function submit(actual: number, evaluation: SpecialistRecord["evaluation"]) {
    if (!formFor) return
    const isDirect = formFor.chain === "三级直达"
    patchRecord(formFor.id, { actualAmount: actual, evaluation, status: "已生效", operatedAt: now() })
    appendOp(formFor.batchNo, {
      actor: isDirect ? formFor.provider : formFor.group ?? formFor.provider,
      time: now(),
      action: `${formFor.specialist} ${isDirect ? "直达绩效" : "阶段二"}提交生效`,
    })
    addToast({ type: "success", title: `${formFor.specialist}绩效已生效${isDirect ? "" : "；本批其余专员逐条继续"}` })
    setFormFor(null)
  }

  function revoke() {
    if (!revokeFor) return
    patchRecord(revokeFor.id, { status: "已撤销", actualAmount: undefined, evaluation: undefined, operatedAt: now() })
    appendOp(revokeFor.batchNo, { actor: revokeFor.group ?? revokeFor.provider, time: now(), action: `${revokeFor.specialist} 专员绩效撤销` })
    addToast({ type: "success", title: `${revokeFor.specialist}的专员绩效已撤销，工作量占用解除` })
    setRevokeFor(null)
    setDetailFor(null)
  }

  const specialists = Array.from(new Set(records.map((r) => r.specialist)))
  const filterFields = [
    { id: "provider", label: "服务提供商", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "程秋明发企", label: "程秋明发企" }] },
    { id: "group", label: "工作组", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "程秋明团队", label: "程秋明团队" }, { value: "程秋明二团队", label: "程秋明二团队" }] },
    { id: "specialist", label: "服务专员", type: "select" as const, options: [{ value: "", label: "全部" }, ...specialists.map((s) => ({ value: s, label: s }))] },
    { id: "variety", label: "品种", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "优甲乐 100片装", label: "优甲乐 100片装" }] },
    { id: "chain", label: "流程类型", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "四级链", label: "四级链" }, { value: "三级直达", label: "三级直达" }] },
    { id: "status", label: "状态", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "未打绩效", label: "未打绩效" }, { value: "已生效", label: "已生效" }, { value: "已撤销", label: "已撤销" }] },
    { id: "month", label: "考核月份", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "2026-08", label: "2026-08" }, { value: "2026-07", label: "2026-07" }] },
  ]

  return (
    <div>
      <PageHeader
        title="服务专员绩效"
        description="服务专员维度绩效明细 · 四级链同挂阶段一批次号；三级直达链批次直接挂专员、不出现工作组记录"
      />

      <div style={{ padding: "16px 24px" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          {[
            { k: "待处理", v: String(stats.pending), sub: "未打绩效" },
            { k: "已生效", v: String(stats.active), sub: "条" },
            { k: "实发合计", v: formatCNY(stats.sum), sub: "" },
            { k: "本月条数", v: String(stats.count), sub: "" },
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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1240 }}>
            <thead>
              <tr>
                <th style={th}>绩效批次号</th>
                <th style={th}>流程类型</th>
                <th style={th}>考核月份</th>
                <th style={th}>服务提供商</th>
                <th style={th}>工作组</th>
                <th style={th}>品种</th>
                <th style={th}>服务专员</th>
                <th style={{ ...th, textAlign: "right" }}>完成工作量</th>
                <th style={{ ...th, textAlign: "right" }}>默认金额</th>
                <th style={{ ...th, textAlign: "right" }}>实发金额</th>
                <th style={th}>上限校验</th>
                <th style={th}>状态</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const def = itemsDefault(r.items)
                const capOk = r.actualAmount != null && r.actualAmount <= def * rule.capRatio + 1e-9
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, ...mono }}>{r.batchNo}</td>
                    <td style={td}>
                      <Tag label={r.chain} color={r.chain === "三级直达" ? "info" : "brand"} />
                    </td>
                    <td style={td}>{r.month}</td>
                    <td style={td}>{r.provider}</td>
                    <td style={td}>
                      {r.group ?? <span style={{ color: "#667085" }}>—（直达）</span>}
                    </td>
                    <td style={td}>{r.variety}</td>
                    <td style={td}>
                      {r.specialist}
                      <span style={{ display: "block", fontSize: 11, color: "#667085", ...mono }}>{r.username}</span>
                    </td>
                    <td style={{ ...td, textAlign: "right", ...mono }}>{itemsWorkload(r.items)} 次</td>
                    <td style={{ ...td, textAlign: "right", ...mono }}>{formatCNY(def)}</td>
                    <td style={{ ...td, textAlign: "right", ...mono }}>
                      {r.actualAmount != null ? formatCNY(r.actualAmount) : <span style={{ color: "#9CA3AF" }}>待确认</span>}
                    </td>
                    <td style={td}>
                      {r.actualAmount != null ? (
                        <span style={{ ...mono, fontSize: 12.5, color: capOk ? "#248A5A" : "#C73A3A", background: capOk ? "#E6F5ED" : "#FEECEC", borderRadius: 6, padding: "3px 8px" }}>
                          {capOk ? "✓ 上限内" : "✕ 超上限"}
                        </span>
                      ) : (
                        <span style={{ color: "#9CA3AF" }}>—</span>
                      )}
                    </td>
                    <td style={td}>
                      <StatusTag status={r.status} size="sm" />
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <button style={linkBtn} onClick={() => setDetailFor(r)}>
                          查看
                        </button>
                        {r.status === "未打绩效" && (
                          <button style={linkBrand} onClick={() => setFormFor(r)}>
                            去打绩效
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
          本页聚焦绩效金额本身；支付域（实名/银行卡/渠道/合同/支付状态等）不在本模块呈现。四级链的专员绩效由工作组一对一打出，与工作组自身被评金额互不约束。
        </p>
      </div>

      <SpecialistFormModal
        open={!!formFor}
        record={formFor}
        operator={formFor?.chain === "三级直达" ? "服务商" : "工作组"}
        onClose={() => setFormFor(null)}
        onSubmit={submit}
      />
      <SpecialistDetailModal
        open={!!detailFor}
        record={detailFor}
        rule={rule}
        onClose={() => setDetailFor(null)}
        onDownload={(r) => setStatementFor(r)}
        onRevoke={(r) => setRevokeFor(r)}
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
        open={!!revokeFor}
        title="撤销服务专员绩效？"
        description={`确定撤销${revokeFor?.specialist ?? ""}这条绩效？撤销后恢复未打绩效，这部分工作量可重新打绩效；按专员逐条撤销，不影响本批其他专员。`}
        impact={revokeFor ? `被评价方 ${revokeFor.specialist}（${revokeFor.group ?? "直达"}）· 涉及金额 ${formatCNY(revokeFor.actualAmount ?? 0)}` : undefined}
        confirmLabel="确认撤销"
        onConfirm={revoke}
        onCancel={() => setRevokeFor(null)}
      />
    </div>
  )
}

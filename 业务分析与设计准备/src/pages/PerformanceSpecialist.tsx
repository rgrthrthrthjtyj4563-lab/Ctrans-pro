/**
 * 服务专员绩效（阶段二/直达结果页）
 * 一专员一条记录；行内查看=单专员分项明细；未打绩效可进一对一表单
 *
 * 三级直达改造（2026-11）：
 * - 顶部新增「直达任务包记录」：关联任务的直达考核（Task × 考核月份 × 专员），
 *   与「团队工作质量评价」共用同一数据层、Figma 版考核弹窗与写路径（共享结果/规则/完结限制）；
 * - 既有批次记录保留原表：四级链流程不变；存量直达记录（缺任务关联）保留查看、
 *   标注暂不可退回，不再提供旧的直达打绩效/撤销入口。
 */
import { useMemo, useState } from "react"
import { ShieldOff } from "lucide-react"
import { PageHeader } from "../components/PageHeader"
import { EmptyState } from "../components/EmptyState"
import { NO_BIZ_SCOPE_TITLE, noBizScopeDescription, regionNamesInScope, useServingScope } from '../hooks/useServingBizScope';
import { NO_REGION_SCOPE_TITLE, NO_REGION_SCOPE_DESCRIPTION, usePharmaRegionScope } from '../hooks/usePharmaRegionScope';
import { FilterBar } from "../components/FilterBar"
import { Button } from "../components/Button"
import { StatusTag, Tag } from "../components/StatusTag"
import { Pagination } from "../components/Pagination"
import { ConfirmDialog } from "../components/ConfirmDialog"
import type { ToastMessage } from "../components/Toast"
import { formatCNY } from "../constants"
import { usePermission } from "../context/PermissionContext"
import { useTaskData } from "../context/TaskDataContext"
import { varietyInScope } from "../data/cooperationModel"
import type { TenantPrincipal } from "../auth/authTypes"
import {
  type DirectPerfItem,
  type DirectPerfRecord,
  assessedOf,
  baseCentsOf,
  directPackagesOf,
  formatCentsText,
  historyOf,
  packageStatsOf,
  recordByKey,
  returnDirectAssessment,
  returnedOf,
  statusOf,
  submitDirectAssessment,
  useDirectPerfSync,
  workloadOf,
} from "../data/directPerformance"
import {
  type SpecialistRecord,
  appendOp,
  getRecords,
  itemsDefault,
  itemsWorkload,
  patchRecord,
  usePerfSettings,
  usePerfSync,
  useRule,
} from "../data/performanceData"
import { SpecialistDetailModal, SpecialistFormModal, StatementModal } from "./PerformanceShared"
import {
  DirectAssessmentModal,
  DirectAuditModal,
  DirectRecordModal,
  DirectReturnModal,
  DirectSourceItemsModal,
  DirectSourcesModal,
  DirectSuccessModal,
  type AssessmentSubmitInput,
} from "./PerformanceDirect"

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

type DirectTab = "all" | "待考核" | "已考核"

function now() {
  return new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-")
}

function DirectStatusPill({ status }: { status: "待考核" | "已考核" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 650,
        color: status === "已考核" ? "#115E59" : "#855613",
        background: status === "已考核" ? "#E8F4EE" : "#FBF2DF",
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  )
}

export function PerformanceSpecialist({ addToast }: Props) {
  usePerfSync()
  // 留痕修订号：提交/退回后记录派生即时重算
  const directRevision = useDirectPerfSync()
  const rule = useRule()
  const settings = usePerfSettings()
  const records = getRecords()
  const { tasks } = useTaskData()
  const { principal, can } = usePermission()

  const [filters, setFilters] = useState<Record<string, string>>({})
  const [applied, setApplied] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)

  // 直达任务包记录（新流程）：状态 tab + 专员搜索 + 分页
  const [directTab, setDirectTab] = useState<DirectTab>("all")
  const [directQuery, setDirectQuery] = useState("")
  const [directPage, setDirectPage] = useState(1)

  const [formFor, setFormFor] = useState<SpecialistRecord | null>(null)
  const [detailFor, setDetailFor] = useState<SpecialistRecord | null>(null)
  const [statementFor, setStatementFor] = useState<SpecialistRecord | null>(null)
  const [revokeFor, setRevokeFor] = useState<SpecialistRecord | null>(null)

  // 直达弹窗（与团队工作质量评价共用）
  const [assessFor, setAssessFor] = useState<DirectPerfRecord | null>(null)
  const [sourcesFor, setSourcesFor] = useState<DirectPerfRecord | null>(null)
  const [sourceItem, setSourceItem] = useState<DirectPerfItem | null>(null)
  const [recordFor, setRecordFor] = useState<DirectPerfRecord | null>(null)
  const [auditOpIndex, setAuditOpIndex] = useState<number | null>(null)
  const [returnFor, setReturnFor] = useState<DirectPerfRecord | null>(null)
  const [successFor, setSuccessFor] = useState<DirectPerfRecord | null>(null)

  // 统一过滤口径（P0-C）：当前服务商 + 当前服务药厂 + 已授权品种；范围失效默认拒绝
  const { denied, scope, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow } = useServingScope();
  // 药厂会话按部门管理区域叠加过滤（D2③）；非药厂会话不过滤
  const regionScope = usePharmaRegionScope();
  /** 直达写入需要 submit 能力；只读角色只可查看 */
  const canSubmitDirect = can("performance-specialist", "submit") && isProviderSession
  const operator = useMemo(() => {
    const tenant = principal.realm === "TENANT" ? (principal as TenantPrincipal) : null
    return { name: principal.name, org: tenant?.tenantName ?? "—" }
  }, [principal])

  const scopedTasks = useMemo(() => {
    return tasks.filter(
      (t) =>
        (!isProviderSession || matchesProviderRow({ provider: t.provider, holderPharma: t.holderPharma, varieties: t.varieties, regions: t.regions })) &&
        (!isPharmaSession || matchesPharmaRow(t)) &&
        regionScope.matchesRow({ taskId: t.id }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow, regionScope])

  const itemVisible = useMemo(() => {
    return (item: { variety: string; region: string }) => {
      if (scope) {
        if (scope.varietyNames.length > 0 && !varietyInScope(item.variety, scope.varietyNames)) return false
        if (!regionNamesInScope([item.region], scope.regions)) return false
      }
      return true
    }
  }, [scope])
  const visibleItemsOf = (record: DirectPerfRecord) => record.items.filter(itemVisible)

  // 直达任务包记录：包 → 记录打平（含考核月份与任务标识）
  const directRows = useMemo(() => {
    return directPackagesOf(scopedTasks).flatMap((pkg) =>
      pkg.records.map((record) => ({ record, pkg })),
    )
  }, [scopedTasks, directRevision])
  const directTotals = useMemo(() => {
    const totals: Record<DirectTab, number> = { all: directRows.length, 待考核: 0, 已考核: 0 }
    directRows.forEach(({ record }) => {
      totals[statusOf(record)] += 1
    })
    return totals
  }, [directRows])
  const directFiltered = useMemo(() => {
    const query = directQuery.trim().toLowerCase()
    return directRows.filter(({ record }) => {
      if (directTab !== "all" && statusOf(record) !== directTab) return false
      if (query && !(record.specialist.toLowerCase().includes(query) || record.specialistAccount.toLowerCase().includes(query) || record.taskNo.toLowerCase().includes(query))) return false
      return true
    })
  }, [directRows, directTab, directQuery])
  const directPaged = directFiltered.slice((directPage - 1) * PAGE_SIZE, directPage * PAGE_SIZE)

  // 会话口径过滤后的既有记录集合（统计卡/筛选下拉/列表同源）
  const sessionFiltered = useMemo(() => {
    return records.filter((r) =>
      (!isProviderSession || matchesProviderRow({ provider: r.provider, holderPharma: r.holderPharma, variety: r.variety })) &&
      (!isPharmaSession || matchesPharmaRow(r)) &&
      regionScope.matchesRow({ provider: r.provider, variety: r.variety }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow, regionScope])

  const rows = useMemo(() => {
    return sessionFiltered.filter((r) => {
      if (applied.provider && r.provider !== applied.provider) return false
      if (applied.group && (r.group ?? "直达") !== applied.group) return false
      if (applied.specialist && r.specialist !== applied.specialist) return false
      if (applied.variety && r.variety !== applied.variety) return false
      if (applied.chain && r.chain !== applied.chain) return false
      if (applied.status && r.status !== applied.status) return false
      if (applied.month && r.month !== applied.month) return false
      return true
    })
  }, [sessionFiltered, applied])

  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const stats = useMemo(() => {
    const pending = sessionFiltered.filter((r) => r.status === "未打绩效").length
    const active = sessionFiltered.filter((r) => r.status === "已生效").length
    const sum = sessionFiltered.reduce((s, r) => s + (r.actualAmount ?? 0), 0)
    return { pending, active, sum, count: sessionFiltered.length }
  }, [sessionFiltered])

  /** 提交（Figma 弹窗回调；与团队工作质量评价同一写路径与校验） */
  function submitAssessment(input: AssessmentSubmitInput): string | null {
    if (!assessFor) return "无效的考核对象"
    if (!canSubmitDirect) return "当前身份没有提交考核的权限"
    const result = submitDirectAssessment(tasks, assessFor.id, input, operator, {
      capRatio: settings.capRatio,
      weights: settings.weights,
    })
    if (!result.ok) return result.error ?? "提交失败"
    const fresh = recordByKey(tasks, assessFor.id)
    setAssessFor(null)
    if (fresh) setSuccessFor(fresh)
    addToast({ type: "success", title: `${assessFor.specialist} 考核已提交（${assessFor.taskNo} · ${assessFor.serviceMonth}）` })
    return null
  }

  function confirmReturn(reason: string): string | null {
    if (!returnFor) return "无效的退回对象"
    if (!canSubmitDirect) return "当前身份没有退回考核的权限"
    const result = returnDirectAssessment(tasks, returnFor.id, reason, operator)
    if (!result.ok) return result.error ?? "退回失败"
    addToast({ type: "success", title: `${returnFor.specialist} 已退回待考核，原考核记录保留` })
    setReturnFor(null)
    setRecordFor(null)
    return null
  }

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

  const specialists = Array.from(new Set(sessionFiltered.map((r) => r.specialist)))
  const providerOptions = Array.from(new Set(sessionFiltered.map((r) => r.provider)))
  const groupOptions = Array.from(new Set(sessionFiltered.map((r) => r.group).filter((g): g is string => Boolean(g))))
  const varietyOptions = Array.from(new Set(sessionFiltered.map((r) => r.variety)))
  const monthOptions = Array.from(new Set(sessionFiltered.map((r) => r.month))).sort().reverse()
  const chainOptions = Array.from(new Set(sessionFiltered.map((r) => r.chain)))
  const statusOptions = Array.from(new Set(sessionFiltered.map((r) => r.status)))
  const opt = (vals: string[]) => [{ value: "", label: "全部" }, ...vals.map((v) => ({ value: v, label: v }))]
  const filterFields = [
    { id: "provider", label: "服务提供商", type: "select" as const, options: opt(providerOptions) },
    { id: "group", label: "工作组", type: "select" as const, options: opt(groupOptions) },
    { id: "specialist", label: "服务专员", type: "select" as const, options: opt(specialists) },
    { id: "variety", label: "品种", type: "select" as const, options: opt(varietyOptions) },
    { id: "chain", label: "流程类型", type: "select" as const, options: opt(chainOptions) },
    { id: "status", label: "状态", type: "select" as const, options: opt(statusOptions) },
    { id: "month", label: "考核月份", type: "select" as const, options: opt(monthOptions) },
  ]

  const successNext = useMemo(() => {
    if (!successFor) return null
    const pkg = directPackagesOf(scopedTasks).find((p) => p.key === `${successFor.taskId}::${successFor.serviceMonth}`)
    const rest = pkg ? pkg.records.filter((r) => assessedOf(r) === null) : []
    const next = rest[0] ?? null
    return { nextName: next?.specialist ?? null, dueCount: rest.length }
  }, [successFor, scopedTasks, directRevision])

  return (
    <div>
      <PageHeader
        title="服务专员绩效"
        description="直达任务包记录（任务 × 月份 × 专员）与团队工作质量评价共用结果与规则；四级链专员绩效由工作组逐条打出，流程不变"
      />

      <div style={{ padding: "16px 24px" }}>
      {denied || regionScope.denied ? (
        <EmptyState
          icon={ShieldOff}
          title={denied ? NO_BIZ_SCOPE_TITLE : NO_REGION_SCOPE_TITLE}
          description={denied ? noBizScopeDescription(scope?.pharmaName) : NO_REGION_SCOPE_DESCRIPTION}
        />
      ) : (
        <>
        {/* ── 直达任务包记录（新流程；两入口同源同规则） ─────────────────── */}
        <section style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden", marginBottom: 24 }} aria-label="直达任务包记录">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 18px" }}>
            <div>
              <b style={{ fontSize: 14 }}>直达任务包记录</b>
              <span style={{ display: "block", fontSize: 12, color: "#667085", marginTop: 3 }}>
                关联任务的直达考核；提交、退回与「团队工作质量评价」写同一份留痕，完结任务仅供查阅。
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {(["all", "待考核", "已考核"] as DirectTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setDirectTab(tab); setDirectPage(1) }}
                  aria-pressed={directTab === tab}
                  style={{
                    border: "none",
                    background: directTab === tab ? "var(--color-brand-subtle)" : "transparent",
                    color: directTab === tab ? "var(--color-brand)" : "#667085",
                    fontSize: 12.5,
                    fontWeight: directTab === tab ? 700 : 500,
                    padding: "5px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  {tab === "all" ? "全部" : tab} <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{directTotals[tab]}</span>
                </button>
              ))}
              <input
                type="search"
                value={directQuery}
                placeholder="搜索专员或任务编号"
                onChange={(e) => { setDirectQuery(e.target.value); setDirectPage(1) }}
                aria-label="搜索直达记录"
                style={{ minHeight: 32, width: 180, border: "1px solid #D0D5DD", borderRadius: 6, padding: "4px 10px", fontSize: 12.5 }}
              />
            </div>
          </div>
          <div style={{ overflowX: "auto", borderTop: "1px solid var(--color-border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={th}>任务包 / 考核月</th>
                  <th style={th}>服务专员</th>
                  <th style={{ ...th, textAlign: "right" }}>有效工作量</th>
                  <th style={{ ...th, textAlign: "right" }}>默认绩效</th>
                  <th style={{ ...th, textAlign: "right" }}>已确认绩效</th>
                  <th style={th}>考核状态</th>
                  <th style={th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {directPaged.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: "center", color: "#667085" }}>
                      暂无直达任务包记录（三级链任务且该月有已审核工作量后生成）。
                    </td>
                  </tr>
                ) : (
                  directPaged.map(({ record, pkg }) => {
                    const items = visibleItemsOf(record)
                    const partial = items.length !== record.items.length
                    const active = assessedOf(record)
                    const hasHistory = historyOf(record.id).length > 0
                    return (
                      <tr key={record.id}>
                        <td style={td}>
                          {record.taskNo}
                          <span style={{ display: "block", fontSize: 11, color: "#667085" }}>
                            {record.serviceMonth} · {pkg.holderPharma}
                            {pkg.locked ? " · 已完结锁定" : ""}
                          </span>
                        </td>
                        <td style={td}>
                          {record.specialist}
                          <span style={{ display: "block", fontSize: 11, color: "#667085", ...mono }}>{record.specialistAccount}</span>
                        </td>
                        <td style={{ ...td, textAlign: "right", ...mono }}>{workloadOf(items)} 次</td>
                        <td style={{ ...td, textAlign: "right", ...mono }}>
                          {formatCentsText(baseCentsOf(items))}
                          {record.missingPrice && <span style={{ display: "block", fontSize: 11, color: "#C73A3A" }}>含缺价分项</span>}
                        </td>
                        <td style={{ ...td, textAlign: "right", ...mono }}>
                          {active ? formatCentsText(active.cents) : <span style={{ color: "#9CA3AF" }}>—</span>}
                        </td>
                        <td style={td}>
                          <DirectStatusPill status={statusOf(record)} />
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                            {canSubmitDirect && !pkg.locked && !active && !record.missingPrice && !partial && (
                              <button
                                style={linkBrand}
                                onClick={() => {
                                  setRecordFor(null)
                                  setAssessFor(record)
                                }}
                              >
                                {returnedOf(record) ? "重新考核" : "去考核"}
                              </button>
                            )}
                            <button style={linkBtn} onClick={() => { setSourceItem(null); setSourcesFor(record) }}>
                              查看依据
                            </button>
                            {hasHistory && (
                              <button style={linkBtn} onClick={() => setRecordFor(record)}>
                                查看记录
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px", borderTop: "1px solid var(--color-border)", color: "#667085", fontSize: 12 }}>
            <span>共 {directFiltered.length} 条</span>
            {!canSubmitDirect && <span>当前身份为只读：提交与退回需服务商管理员权限。</span>}
          </div>
          <Pagination page={directPage} pageSize={PAGE_SIZE} total={directFiltered.length} onChange={setDirectPage} />
        </section>

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
                const isDirect = r.chain === "三级直达"
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, ...mono }}>{r.batchNo}</td>
                    <td style={td}>
                      <Tag label={r.chain} color={isDirect ? "info" : "brand"} />
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
                        {isDirect ? (
                          <span style={{ fontSize: 11.5, color: "#855613" }} title="存量直达记录缺任务关联，仅供查看；任务关联的直达考核在上方任务包记录">
                            存量 · 只读
                          </span>
                        ) : (
                          r.status === "未打绩效" && (
                            <button style={linkBrand} onClick={() => setFormFor(r)}>
                              去打绩效
                            </button>
                          )
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
          本页聚焦绩效金额本身；支付域（实名/银行卡/渠道/合同/支付状态等）不在本模块呈现。四级链的专员绩效由工作组一对一打出，与工作组自身被评金额互不约束；
          存量直达记录缺任务关联，保留查看、暂不可退回。
        </p>
        </>
      )}
      </div>

      {/* ── 直达弹窗（与团队工作质量评价共用组件与写路径） ───────────────── */}
      <DirectAssessmentModal open={!!assessFor} record={assessFor} onClose={() => setAssessFor(null)} onSubmit={submitAssessment} />
      <DirectSourcesModal
        open={!!sourcesFor && !sourceItem}
        task={sourcesFor ? scopedTasks.find((t) => t.id === sourcesFor.taskId) ?? null : null}
        record={sourcesFor}
        onClose={() => { setSourcesFor(null); setSourceItem(null) }}
        onDrillItem={(item) => setSourceItem(item)}
      />
      <DirectSourceItemsModal
        open={!!sourcesFor && !!sourceItem}
        task={sourcesFor ? scopedTasks.find((t) => t.id === sourcesFor.taskId) ?? null : null}
        record={sourcesFor}
        item={sourceItem}
        onClose={() => { setSourcesFor(null); setSourceItem(null) }}
        onBack={() => setSourceItem(null)}
      />
      <DirectRecordModal
        open={!!recordFor && auditOpIndex === null}
        task={recordFor ? scopedTasks.find((t) => t.id === recordFor.taskId) ?? null : null}
        record={recordFor}
        onClose={() => setRecordFor(null)}
        onReturn={(r) => setReturnFor(r)}
        onReassess={(r) => { setRecordFor(null); setAssessFor(r) }}
        onOpenAudit={(_, index) => setAuditOpIndex(index)}
      />
      <DirectAuditModal
        open={!!recordFor && auditOpIndex !== null}
        record={recordFor}
        opIndex={auditOpIndex}
        onClose={() => { setRecordFor(null); setAuditOpIndex(null) }}
        onBack={() => setAuditOpIndex(null)}
      />
      <DirectReturnModal open={!!returnFor} record={returnFor} onClose={() => setReturnFor(null)} onConfirm={confirmReturn} />
      <DirectSuccessModal
        open={!!successFor}
        record={successFor}
        confirmedCents={successFor ? assessedOf(successFor)?.cents ?? 0 : 0}
        dueCount={successNext?.dueCount ?? 0}
        nextName={successNext?.nextName ?? null}
        onClose={() => setSuccessFor(null)}
        onNext={() => {
          const next = successNext?.nextName
            ? directPackagesOf(scopedTasks)
                .find((p) => successFor && p.key === `${successFor.taskId}::${successFor.serviceMonth}`)
                ?.records.find((r) => assessedOf(r) === null) ?? null
            : null
          setSuccessFor(null)
          if (next && canSubmitDirect && !next.missingPrice) setAssessFor(next)
        }}
      />

      {/* ── 既有批次弹窗 ─────────────────────────────────────────────────── */}
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
        canRevoke={detailFor?.chain !== "三级直达"}
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

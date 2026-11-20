/**
 * 团队工作质量评价
 * 一级页：三级直达任务包总列表（Task × 考核月份，默认可看历史）
 * 二级页：任务包详情与专员名单 → Figma 版考核弹窗 / 查看依据 / 查看记录 / 退回重评
 * 原有批次列表（四级链阶段一/阶段二，及存量直达）保留既有逻辑；存量直达批次只读，
 * 任务关联的直达考核走本页任务包流程，两个入口（本页 / 服务专员绩效）共用同一写路径。
 */
import { useMemo, useState } from "react"
import { Download, ShieldOff } from "lucide-react"
import { PageHeader } from "../components/PageHeader"
import { EmptyState } from "../components/EmptyState"
import { NO_BIZ_SCOPE_TITLE, noBizScopeDescription, useServingScope } from '../hooks/useServingBizScope';
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
import type { TenantPrincipal } from "../auth/authTypes"
import { varietyInScope } from "../data/cooperationModel"
import { regionNamesInScope } from "../hooks/useServingBizScope"
import {
  type DirectPerfItem,
  type DirectPerfPackage,
  type DirectPerfRecord,
  assessedOf,
  baseCentsOf,
  directPackagesOf,
  formatCentsText,
  historyOf,
  nextPendingOf,
  packageByKey,
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
  type PerfBatch,
  type SpecialistRecord,
  appendOp,
  getBatches,
  getRecords,
  patchBatch,
  patchRecord,
  recordsOfBatch,
  usePerfSettings,
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

type Identity = "服务商" | "工作组"
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

function ProgressMini({ done, total }: { done: number; total: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={mono}>{done} / {total} 人</span>
      <span style={{ display: "inline-block", width: 52, height: 4, borderRadius: 10, background: "#E4EBE6", overflow: "hidden" }}>
        <span style={{ display: "block", width: `${total > 0 ? (100 * done) / total : 0}%`, height: "100%", background: "var(--color-brand)" }} />
      </span>
    </span>
  )
}

function DirectTabs({
  current,
  totals,
  onChange,
}: {
  current: DirectTab
  totals: Record<DirectTab, number>
  onChange: (tab: DirectTab) => void
}) {
  const tabs: DirectTab[] = ["all", "待考核", "已考核"]
  return (
    <div style={{ display: "flex", gap: 16, borderBottom: "1px solid var(--color-border)", padding: "0 18px" }} role="group" aria-label="考核状态筛选">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          aria-pressed={current === tab}
          style={{
            border: "none",
            borderBottom: `2px solid ${current === tab ? "var(--color-brand)" : "transparent"}`,
            background: "none",
            minHeight: 39,
            padding: "10px 2px 8px",
            fontSize: 13,
            fontWeight: current === tab ? 700 : 600,
            color: current === tab ? "var(--color-brand)" : "#667085",
            cursor: "pointer",
          }}
        >
          {tab === "all" ? "全部" : tab} <span style={{ paddingLeft: 3, color: "#667085", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{totals[tab]}</span>
        </button>
      ))}
    </div>
  )
}

export function PerformanceTeamQuality({ addToast }: Props) {
  usePerfSync()
  // 留痕修订号：提交/退回后任务包派生（含汇总）即时重算
  const directRevision = useDirectPerfSync()
  const rule = useRule()
  const settings = usePerfSettings()
  const batches = getBatches()
  const { tasks } = useTaskData()
  const { principal, can } = usePermission()

  const [identity, setIdentity] = useState<Identity>("服务商")
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [applied, setApplied] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)

  // 三级直达：一级列表筛选/页码 + 二级详情（返回时保留）
  const [directTab, setDirectTab] = useState<DirectTab>("all")
  const [directFilters, setDirectFilters] = useState<Record<string, string>>({})
  const [directApplied, setDirectApplied] = useState<Record<string, string>>({})
  const [directPage, setDirectPage] = useState(1)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [rosterTab, setRosterTab] = useState<DirectTab>("all")
  const [personQuery, setPersonQuery] = useState("")

  // 直达弹窗
  const [assessFor, setAssessFor] = useState<DirectPerfRecord | null>(null)
  const [sourcesFor, setSourcesFor] = useState<DirectPerfRecord | null>(null)
  const [sourceItem, setSourceItem] = useState<DirectPerfItem | null>(null)
  const [recordFor, setRecordFor] = useState<DirectPerfRecord | null>(null)
  const [auditOpIndex, setAuditOpIndex] = useState<number | null>(null)
  const [returnFor, setReturnFor] = useState<DirectPerfRecord | null>(null)
  const [successFor, setSuccessFor] = useState<DirectPerfRecord | null>(null)

  const [stage1For, setStage1For] = useState<PerfBatch | null>(null)
  const [specialistFor, setSpecialistFor] = useState<SpecialistRecord | null>(null)
  const [detailFor, setDetailFor] = useState<PerfBatch | null>(null)
  const [spDetailFor, setSpDetailFor] = useState<SpecialistRecord | null>(null)
  const [statementFor, setStatementFor] = useState<SpecialistRecord | null>(null)
  const [revokeBlock, setRevokeBlock] = useState<PerfBatch | null>(null)

  // 统一过滤口径（P0-C）：当前服务商 + 当前服务药厂 + 已授权品种；范围失效默认拒绝
  const { denied, scope, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow } = useServingScope();
  // 药厂会话按部门管理区域叠加过滤（D2③）；非药厂会话不过滤
  const regionScope = usePharmaRegionScope();
  /** 直达写入需要 submit 能力；只读角色（如工作组组长）只可查看 */
  const canSubmitDirect = can("performance-team", "submit") && isProviderSession
  /** 操作者取登录主体（不按演示身份条切换） */
  const operator = useMemo(() => {
    const tenant = principal.realm === "TENANT" ? (principal as TenantPrincipal) : null
    return { name: principal.name, org: tenant?.tenantName ?? "—" }
  }, [principal])

  // 任务级会话过滤（直达任务包与既有批次列表同口径）
  const scopedTasks = useMemo(() => {
    return tasks.filter(
      (t) =>
        (!isProviderSession || matchesProviderRow({ provider: t.provider, holderPharma: t.holderPharma, varieties: t.varieties, regions: t.regions })) &&
        (!isPharmaSession || matchesPharmaRow(t)) &&
        regionScope.matchesRow({ taskId: t.id }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow, regionScope])

  // 授权品种/区域收窄到分项：范围外的分项不展示、不可经明细绕过
  const itemVisible = useMemo(() => {
    return (item: { variety: string; region: string }) => {
      if (scope) {
        if (scope.varietyNames.length > 0 && !varietyInScope(item.variety, scope.varietyNames)) return false
        if (!regionNamesInScope([item.region], scope.regions)) return false
      }
      return true
    }
  }, [scope])

  /** 展示口径的分项（范围外分项隐藏）；partial = 有被隐藏的分项时不能考核 */
  const visibleItemsOf = (record: DirectPerfRecord) => record.items.filter(itemVisible)

  const directPackages = useMemo(
    () => directPackagesOf(scopedTasks),
    [scopedTasks, directRevision],
  )

  // ── 一级列表：筛选 + 状态 tab + 分页 ────────────────────────────────────────
  const filteredPackages = useMemo(() => {
    return directPackages.filter((p) => {
      if (directApplied.query) {
        const query = directApplied.query.toLowerCase()
        if (!(p.taskName.toLowerCase().includes(query) || p.taskNo.toLowerCase().includes(query))) return false
      }
      if (directApplied.month && p.serviceMonth !== directApplied.month) return false
      if (directApplied.variety && !p.varietyNames.includes(directApplied.variety)) return false
      return true
    })
  }, [directPackages, directApplied])

  const directTotals = useMemo(() => {
    const totals: Record<DirectTab, number> = { all: filteredPackages.length, 待考核: 0, 已考核: 0 }
    filteredPackages.forEach((p) => {
      totals[packageStatsOf(p).status] += 1
    })
    return totals
  }, [filteredPackages])

  const directRows = useMemo(
    () => filteredPackages.filter((p) => directTab === "all" || packageStatsOf(p).status === directTab),
    [filteredPackages, directTab],
  )
  const directPaged = directRows.slice((directPage - 1) * PAGE_SIZE, directPage * PAGE_SIZE)

  const monthOptions = useMemo(
    () => [...new Set(directPackages.map((p) => p.serviceMonth))].sort().reverse(),
    [directPackages],
  )
  const directVarietyOptions = useMemo(
    () => [...new Set(directPackages.flatMap((p) => p.varietyNames))],
    [directPackages],
  )

  // ── 二级详情（从最新派生取包，保证提交/退回后立即反映） ─────────────────────
  const detailPackage: DirectPerfPackage | null = detailKey ? packageByKey(scopedTasks, detailKey) : null
  const detailStats = detailPackage ? packageStatsOf(detailPackage) : null
  const rosterRows = useMemo(() => {
    if (!detailPackage) return []
    return detailPackage.records.filter((r) => {
      if (rosterTab !== "all" && statusOf(r) !== rosterTab) return false
      const query = personQuery.trim().toLowerCase()
      if (query && !(r.specialist.toLowerCase().includes(query) || r.specialistAccount.toLowerCase().includes(query))) return false
      return true
    })
  }, [detailPackage, rosterTab, personQuery])

  function openAssess(record: DirectPerfRecord) {
    setRecordFor(null)
    setAssessFor(record)
  }

  /** 提交（Figma 弹窗回调）：写路径内部以最新任务状态再校验；返回错误文本就近展示 */
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
    if (fresh) {
      setSuccessFor(fresh)
      const pkg = packageByKey(scopedTasks, `${fresh.taskId}::${fresh.serviceMonth}`)
      addToast({ type: "success", title: `${fresh.specialist}考核已提交${pkg ? `；本包剩余 ${nextPendingOf(pkg) ? pkg.records.filter((r) => assessedOf(r) === null).length : 0} 位待考核` : ""}` })
    }
    return null
  }

  /** 退回（查看记录内发起）：状态回待考核，金额移出汇总，原版本保留 */
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

  // ── 既有批次（四级链/存量直达）逻辑保持不变 ────────────────────────────────
  const sessionFiltered = useMemo(() => {
    return batches.filter((b) =>
      (!isProviderSession || matchesProviderRow({ provider: b.provider, holderPharma: b.holderPharma, variety: b.variety })) &&
      (!isPharmaSession || matchesPharmaRow(b)) &&
      regionScope.matchesRow({ provider: b.provider, variety: b.variety }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow, regionScope])

  const rows = useMemo(() => {
    return sessionFiltered.filter((b) => {
      if (applied.query && !b.batchNo.includes(applied.query)) return false
      if (applied.provider && b.provider !== applied.provider) return false
      if (applied.variety && b.variety !== applied.variety) return false
      if (applied.group && (b.group ?? "") !== applied.group) return false
      if (applied.chain && b.chain !== applied.chain) return false
      if (applied.status && b.status !== applied.status) return false
      if (applied.month && b.month !== applied.month) return false
      return true
    })
  }, [sessionFiltered, applied])

  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const stats = useMemo(() => {
    const pending = sessionFiltered.filter((b) => b.status === "未打绩效").length
    const active = sessionFiltered.filter((b) => b.status === "已生效").length
    const revoked = sessionFiltered.filter((b) => b.status === "已撤销").length
    return { pending, active, revoked, total: sessionFiltered.length }
  }, [sessionFiltered])

  const provider = sessionFiltered[0]?.provider ?? "服务商"
  const groupOptions = Array.from(new Set(sessionFiltered.map((b) => b.group).filter(Boolean))) as string[]

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

  function revokeGroup() {
    if (!revokeBlock) return
    patchBatch(revokeBlock.batchNo, { status: "已撤销", actualAmount: undefined })
    appendOp(revokeBlock.batchNo, { actor: provider, time: now(), action: "工作组绩效撤销" })
    addToast({ type: "success", title: "工作组绩效已撤销" })
    setRevokeBlock(null)
  }

  const providerOptions = Array.from(new Set(sessionFiltered.map((b) => b.provider)))
  const varietyOptions = Array.from(new Set(sessionFiltered.map((b) => b.variety)))
  const monthOptionsLegacy = Array.from(new Set(sessionFiltered.map((b) => b.month))).sort().reverse()
  const opt = (vals: string[]) => [{ value: "", label: "全部" }, ...vals.map((v) => ({ value: v, label: v }))]
  const filterFields = [
    { id: "query", label: "绩效批次号", type: "text" as const, placeholder: "请输入批次号" },
    { id: "provider", label: "服务提供方", type: "select" as const, options: opt(providerOptions) },
    { id: "variety", label: "品种", type: "select" as const, options: opt(varietyOptions) },
    { id: "group", label: "被评价方（工作组）", type: "select" as const, options: opt(groupOptions) },
    { id: "chain", label: "流程类型", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "四级链", label: "四级链" }, { value: "三级直达", label: "三级直达" }] },
    { id: "status", label: "状态", type: "select" as const, options: [{ value: "", label: "全部" }, { value: "未打绩效", label: "未打绩效" }, { value: "已生效", label: "已生效" }, { value: "已撤销", label: "已撤销" }] },
    { id: "month", label: "考核月份", type: "select" as const, options: opt(monthOptionsLegacy) },
  ]

  const successNext = useMemo(() => {
    if (!successFor) return null
    const pkg = packageByKey(scopedTasks, `${successFor.taskId}::${successFor.serviceMonth}`)
    const next = pkg ? nextPendingOf(pkg) : null
    return { nextName: next?.specialist ?? null, dueCount: pkg ? pkg.records.filter((r) => assessedOf(r) === null).length : 0 }
  }, [successFor, scopedTasks, directRevision])

  const deniedView = denied || regionScope.denied

  // ── 二级详情视图 ───────────────────────────────────────────────────────────
  const detailView = detailPackage && detailStats && (
    <div>
      <button
        type="button"
        onClick={() => {
          setDetailKey(null)
          setRosterTab("all")
          setPersonQuery("")
        }}
        style={{ border: "none", background: "none", padding: 0, fontSize: 13, color: "#667085", cursor: "pointer", display: "inline-flex" }}
      >
        ‹ 返回列表（保留筛选与页码）
      </button>
      <PageHeader
        title={detailPackage.taskName}
        description={`${detailPackage.taskNo} · ${detailPackage.serviceMonth} 考核月 · 三级直达 · ${detailPackage.holderPharma}${detailPackage.locked ? " · 任务已结算完结，记录仅供查阅" : ""}`}
      />
      <div style={{ padding: "0 24px 24px" }}>
        <div style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "12px 18px 0" }}>
            <DirectTabs
              current={rosterTab}
              totals={{ all: detailStats.total, 待考核: detailStats.total - detailStats.done, 已考核: detailStats.done }}
              onChange={setRosterTab}
            />
            <input
              type="search"
              value={personQuery}
              placeholder="搜索专员姓名或账号"
              onChange={(e) => setPersonQuery(e.target.value)}
              style={{ minHeight: 33, width: 200, border: "1px solid #CFDCD4", borderRadius: 6, padding: "5px 10px", fontSize: 12.5, margin: "3px 0 7px" }}
              aria-label="搜索专员"
            />
          </div>
          <div style={{ overflowX: "auto", borderTop: "1px solid var(--color-border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr>
                  {["服务专员", "有效工作量", "默认绩效", "已确认绩效", "考核状态", "操作"].map((heading, i) => (
                    <th key={heading} style={{ ...th, textAlign: i >= 1 && i <= 3 ? "right" : "left", width: i === 5 ? 280 : undefined }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rosterRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...td, textAlign: "center", color: "#667085" }}>
                      没有符合条件的专员。
                    </td>
                  </tr>
                ) : (
                  rosterRows.map((record) => {
                    const items = visibleItemsOf(record)
                    const partial = items.length !== record.items.length
                    const baseCents = baseCentsOf(items)
                    const active = assessedOf(record)
                    const locked = detailPackage.locked
                    const canAssess = canSubmitDirect && !locked && !active && !record.missingPrice && !partial
                    const hasHistory = historyOf(record.id).length > 0
                    return (
                      <tr key={record.id}>
                        <td style={td}>
                          {record.specialist}
                          <span style={{ display: "block", fontSize: 11, color: "#667085", ...mono }}>{record.specialistAccount}</span>
                        </td>
                        <td style={{ ...td, textAlign: "right", ...mono }}>{workloadOf(items)} 次</td>
                        <td style={{ ...td, textAlign: "right", ...mono }}>
                          {formatCentsText(baseCents)}
                          {record.missingPrice && <span style={{ display: "block", fontSize: 11, color: "#C73A3A" }}>含缺价分项</span>}
                          {partial && <span style={{ display: "block", fontSize: 11, color: "#855613" }}>含当前范围外分项</span>}
                        </td>
                        <td style={{ ...td, textAlign: "right", ...mono }}>
                          {active ? formatCentsText(active.cents) : <span style={{ color: "#9CA3AF" }}>—</span>}
                        </td>
                        <td style={td}>
                          <DirectStatusPill status={statusOf(record)} />
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                            {canAssess && (
                              <button style={linkBrand} onClick={() => openAssess(record)}>
                                {returnedOf(record) ? "重新考核" : "去考核"}
                              </button>
                            )}
                            {!canAssess && !active && !locked && (record.missingPrice || partial) && (
                              <span style={{ fontSize: 11.5, color: "#855613" }} title="缺价或范围外分项未补齐前不能确认">
                                {record.missingPrice ? "缺价分项，不能确认" : "范围外分项，不能确认"}
                              </span>
                            )}
                            {active && locked && <span style={{ fontSize: 11.5, color: "#667085" }}>已锁定</span>}
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
            <span>共 {rosterRows.length} 人</span>
            <span>
              已评 {detailStats.done} / {detailStats.total} 人 · 已确认合计 {formatCentsText(detailStats.confirmedCents)}
            </span>
          </div>
        </div>
        {!canSubmitDirect && (
          <p style={{ fontSize: 12.5, color: "#667085", marginTop: 10 }}>当前身份为只读：可查看名单、依据与历史记录，提交与退回需服务商管理员权限。</p>
        )}
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="团队工作质量评价"
        description="三级直达：服务商按任务包一对一考核服务专员；原有四级链批次评价保留在下方，流程与规则不变。"
        actions={
          <Button variant="ghost" icon={<Download size={14} />} onClick={() => addToast({ type: "success", title: "批次快照已生成下载（演示）" })}>
            导出批次快照
          </Button>
        }
      />

      {deniedView ? (
        <div style={{ padding: "16px 24px" }}>
          <EmptyState
            icon={ShieldOff}
            title={denied ? NO_BIZ_SCOPE_TITLE : NO_REGION_SCOPE_TITLE}
            description={denied ? noBizScopeDescription(scope?.pharmaName) : NO_REGION_SCOPE_DESCRIPTION}
          />
        </div>
      ) : detailView ? (
        detailView
      ) : (
        <div style={{ padding: "16px 24px" }}>
          {/* ── 一级页：三级直达任务包总列表 ─────────────────────────────── */}
          <section style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }} aria-label="三级直达任务包">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px 0", flexWrap: "wrap" }}>
              <div>
                <b style={{ fontSize: 14 }}>直达专员绩效 · 任务包</b>
                <span style={{ display: "block", fontSize: 12, color: "#667085", marginTop: 3 }}>
                  任务包 = 任务 × 考核月份（服务归属月）；专员记录按 任务 × 月份 × 专员唯一；金额按适用对私单价计算。
                </span>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <DirectTabs current={directTab} totals={directTotals} onChange={(tab) => { setDirectTab(tab); setDirectPage(1) }} />
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--color-border)" }}>
              <FilterBar
                fields={[
                  { id: "query", label: "任务包", type: "text" as const, placeholder: "搜索任务名称或编号" },
                  { id: "month", label: "考核月份", type: "select" as const, options: opt(monthOptions) },
                  { id: "variety", label: "品种", type: "select" as const, options: opt(directVarietyOptions) },
                ]}
                values={directFilters}
                onChange={(id, value) => setDirectFilters((prev) => ({ ...prev, [id]: value }))}
                onSearch={() => {
                  setDirectApplied({ ...directFilters })
                  setDirectPage(1)
                }}
                onReset={() => {
                  setDirectFilters({})
                  setDirectApplied({})
                  setDirectPage(1)
                }}
              />
            </div>
            <div style={{ overflowX: "auto", borderTop: "1px solid var(--color-border)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
                <thead>
                  <tr>
                    <th style={th}>任务包</th>
                    <th style={th}>考核月份</th>
                    <th style={th}>合作药厂 / 品种</th>
                    <th style={th}>考核进度</th>
                    <th style={{ ...th, textAlign: "right" }}>已确认绩效</th>
                    <th style={th}>考核状态</th>
                    <th style={{ ...th, width: 120 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {directPaged.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ ...td, textAlign: "center", color: "#667085" }}>
                        没有符合条件的三级直达任务包（需三级链任务且该月有已审核工作量）。
                      </td>
                    </tr>
                  ) : (
                    directPaged.map((pkg) => {
                      const stats = packageStatsOf(pkg)
                      return (
                        <tr key={pkg.key}>
                          <td style={td}>
                            {pkg.taskName}
                            <span style={{ display: "block", fontSize: 11, color: "#667085", ...mono }}>{pkg.taskNo}</span>
                          </td>
                          <td style={{ ...td, ...mono }}>{pkg.serviceMonth}</td>
                          <td style={td}>
                            {pkg.holderPharma}
                            <span style={{ display: "block", fontSize: 11, color: "#667085" }}>{pkg.varietyNames.join("、")}</span>
                          </td>
                          <td style={td}>
                            <ProgressMini done={stats.done} total={stats.total} />
                          </td>
                          <td style={{ ...td, textAlign: "right", ...mono }}>
                            {stats.done > 0 ? formatCentsText(stats.confirmedCents) : <span style={{ color: "#9CA3AF" }}>—</span>}
                          </td>
                          <td style={td}>
                            <DirectStatusPill status={stats.status} />
                          </td>
                          <td style={td}>
                            <button
                              style={linkBrand}
                              onClick={() => {
                                setDetailKey(pkg.key)
                                setRosterTab("all")
                                setPersonQuery("")
                              }}
                            >
                              查看详情
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px", borderTop: "1px solid var(--color-border)", color: "#667085", fontSize: 12 }}>
              <span>共 {directRows.length} 个任务包</span>
              <span>状态只区分「待考核 / 已考核」；有任一专员待考核即「待考核」。</span>
            </div>
            <Pagination page={directPage} pageSize={PAGE_SIZE} total={directRows.length} onChange={setDirectPage} />
          </section>

          {/* ── 原有批次列表：四级链保留既有逻辑；存量直达只读 ───────────── */}
          <section style={{ marginTop: 26 }}>
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
              <span style={{ fontSize: 12, color: "#667085" }}>当前操作身份（仅影响下方既有批次列表）</span>
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
              <span style={{ fontSize: 12, color: "#667085" }}>身份条仅用于演示切换；直达考核按登录主体执行。</span>
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
                            <span style={{ color: "#667085" }}>存量直达 ×{b.directCount ?? recordsOfBatch(b.batchNo).length}</span>
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
                            {isDirect ? (
                              <span style={{ fontSize: 11.5, color: "#855613" }} title="存量直达批次无任务关联，仅供查看；新直达考核在上方任务包列表">
                                存量 · 只读
                              </span>
                            ) : (
                              <>
                                {b.status !== "未打绩效" || settings.mode === "灵活模式"
                                  ? identity === "工作组" && nextSpecialist && (
                                    <button style={linkBrand} onClick={() => setSpecialistFor(nextSpecialist)}>
                                      给服务专员打绩效
                                    </button>
                                  )
                                  : null}
                                {b.status === "未打绩效" && identity === "服务商" && (
                                  <button style={linkBrand} onClick={() => setStage1For(b)}>
                                    打绩效
                                  </button>
                                )}
                                {b.status === "已撤销" && identity === "服务商" && (
                                  <button style={linkBrand} onClick={() => setStage1For(b)}>
                                    重新发起
                                  </button>
                                )}
                                {b.status === "已生效" && recordsOfBatch(b.batchNo).some((r) => r.status === "已生效") && identity === "服务商" && (
                                  <button style={{ ...linkBtn, color: "#C73A3A" }} onClick={() => setRevokeBlock(b)}>
                                    撤销
                                  </button>
                                )}
                              </>
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
              四级链：服务商给工作组（阶段一）→ 工作组给专员（阶段二），入口与规则不变；已撤销批次可重新打绩效。
              存量直达批次缺任务关联，保留查看、暂不可退回；关联任务的直达考核在上方「任务包」进行。
            </p>
          </section>
        </div>
      )}

      {/* ── 三级直达弹窗 ─────────────────────────────────────────────────── */}
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
        onReassess={(r) => openAssess(r)}
        onOpenAudit={(_, index) => setAuditOpIndex(index)}
      />
      <DirectAuditModal
        open={!!recordFor && auditOpIndex !== null}
        record={recordFor}
        opIndex={auditOpIndex}
        onClose={() => { setRecordFor(null); setAuditOpIndex(null) }}
        onBack={() => setAuditOpIndex(null)}
      />
      <DirectReturnModal
        open={!!returnFor}
        record={returnFor}
        onClose={() => setReturnFor(null)}
        onConfirm={confirmReturn}
      />
      <DirectSuccessModal
        open={!!successFor}
        record={successFor}
        confirmedCents={successFor ? assessedOf(successFor)?.cents ?? 0 : 0}
        dueCount={successNext?.dueCount ?? 0}
        nextName={successNext?.nextName ?? null}
        onClose={() => setSuccessFor(null)}
        onNext={() => {
          const pkg = successFor ? packageByKey(scopedTasks, `${successFor.taskId}::${successFor.serviceMonth}`) : null
          const next = pkg ? nextPendingOf(pkg) : null
          setSuccessFor(null)
          if (next && canSubmitDirect && !next.missingPrice) setAssessFor(next)
        }}
      />

      {/* ── 既有批次弹窗（四级链/存量） ─────────────────────────────────── */}
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
        onRevoke={() => addToast({ type: "info", title: "存量直达记录仅供查看，暂不可退回；任务关联的直达考核在任务包列表操作" })}
        canRevoke={spDetailFor?.chain !== "三级直达"}
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
        title={settings.mode === "灵活模式" ? "撤销工作组绩效？" : "无法撤销工作组绩效"}
        description={settings.mode === "灵活模式" ? "灵活模式下两层评级互不制约，可直接撤销工作组绩效，不影响专员绩效记录。" : `该批次还有 ${revokeBlock ? recordsOfBatch(revokeBlock.batchNo).filter((r) => r.status === "已生效").length : 0} 条专员绩效已生效。请先撤销专员绩效，再撤销工作组绩效。`}
        impact={settings.mode === "灵活模式" ? "专员绩效保留，可分别撤销。" : "撤销顺序：先撤销专员绩效，再撤销工作组绩效"}
        confirmLabel={settings.mode === "灵活模式" ? "确认撤销" : "知道了"}
        variant="warning"
        onConfirm={settings.mode === "灵活模式" ? revokeGroup : () => setRevokeBlock(null)}
        onCancel={() => setRevokeBlock(null)}
      />
    </div>
  )
}

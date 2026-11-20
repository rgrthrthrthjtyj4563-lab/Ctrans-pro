/**
 * 团队工作质量评价 · 三级直达专员绩效
 * 一级页：任务包总列表（Task × 考核月份，默认可看历史）
 * 二级页：任务包详情与专员名单 → Figma 版考核弹窗 / 查看依据 / 查看记录 / 退回重评
 * 存量批次评价（四级链阶段一/阶段二、无任务关联的存量直达）在「服务专员绩效」页查看；
 * 本页专注任务包直达考核，两个入口共用同一数据层与写路径。
 */
import { useMemo, useState } from "react"
import { ArrowLeft, Download, ShieldOff } from "lucide-react"
import { PageHeader } from "../components/PageHeader"
import { EmptyState } from "../components/EmptyState"
import { NO_BIZ_SCOPE_TITLE, noBizScopeDescription, regionNamesInScope, useServingScope } from '../hooks/useServingBizScope';
import { NO_REGION_SCOPE_TITLE, NO_REGION_SCOPE_DESCRIPTION, usePharmaRegionScope } from '../hooks/usePharmaRegionScope';
import { FilterBar } from "../components/FilterBar"
import { Button } from "../components/Button"
import type { ToastMessage } from "../components/Toast"
import { usePermission } from "../context/PermissionContext"
import { useTaskData } from "../context/TaskDataContext"
import type { TenantPrincipal } from "../auth/authTypes"
import { varietyInScope } from "../data/cooperationModel"
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
import { usePerfSettings } from "../data/performanceData"
import {
  DirectAssessmentModal,
  DirectAuditModal,
  DirectPager,
  DirectPersonCell,
  DirectRecordModal,
  DirectReturnModal,
  DirectSegmentedTabs,
  DirectSourceItemsModal,
  DirectSourcesModal,
  DirectStatusPill,
  DirectSuccessModal,
  DirectUiStyle,
  type AssessmentSubmitInput,
} from "./PerformanceDirect"

const PAGE_SIZE = 10

const th: React.CSSProperties = {
  padding: "12px 20px",
  textAlign: "left",
  fontSize: "var(--fs-12)",
  fontWeight: 600,
  color: "#9CA3AF",
  background: "#F9FAFB",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
}
const td: React.CSSProperties = {
  padding: "15px 20px",
  fontSize: "var(--fs-13)",
  color: "var(--color-text-1)",
  borderBottom: "1px solid #F2F4F6",
  whiteSpace: "nowrap",
}
const numTd: React.CSSProperties = {
  ...td,
  textAlign: "right",
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

const opt = (vals: string[]) => [{ value: "", label: "全部" }, ...vals.map((v) => ({ value: v, label: v }))]

export function PerformanceTeamQuality({ addToast }: Props) {
  // 留痕修订号：提交/退回后任务包派生（含汇总）即时重算
  const directRevision = useDirectPerfSync()
  const settings = usePerfSettings()
  const { tasks } = useTaskData()
  const { principal, can } = usePermission()

  // 一级列表筛选/页码 + 二级详情（返回时保留）
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

  // 统一过滤口径（P0-C）：当前服务商 + 当前服务药厂 + 已授权品种；范围失效默认拒绝
  const { denied, scope, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow } = useServingScope();
  // 药厂会话按部门管理区域叠加过滤（D2③）；非药厂会话不过滤
  const regionScope = usePharmaRegionScope();
  /** 直达写入需要 submit 能力；只读角色只可查看 */
  const canSubmitDirect = can("performance-team", "submit") && isProviderSession
  /** 操作者取登录主体 */
  const operator = useMemo(() => {
    const tenant = principal.realm === "TENANT" ? (principal as TenantPrincipal) : null
    return { name: principal.name, org: tenant?.tenantName ?? "—" }
  }, [principal])

  // 任务级会话过滤
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
      addToast({ type: "success", title: `${fresh.specialist}考核已提交${pkg ? `；本包剩余 ${pkg.records.filter((r) => assessedOf(r) === null).length} 位待考核` : ""}` })
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

  const successNext = useMemo(() => {
    if (!successFor) return null
    const pkg = packageByKey(scopedTasks, `${successFor.taskId}::${successFor.serviceMonth}`)
    const next = pkg ? nextPendingOf(pkg) : null
    return { nextName: next?.specialist ?? null, dueCount: pkg ? pkg.records.filter((r) => assessedOf(r) === null).length : 0 }
  }, [successFor, scopedTasks, directRevision])

  const deniedView = denied || regionScope.denied

  // ── 二级详情视图（与项目其他列表→详情页一致：PageHeader + actions 返回按钮） ──
  const detailView = detailPackage && detailStats && (
    <div>
      <DirectUiStyle />
      <PageHeader
        title={detailPackage.taskName}
        description={`${detailPackage.taskNo} · ${detailPackage.serviceMonth} 考核月 · 三级直达 · ${detailPackage.holderPharma}${detailPackage.locked ? " · 任务已结算完结，记录仅供查阅" : ""}`}
        actions={
          <Button variant="ghost" size="md" icon={<ArrowLeft size={14} />} onClick={() => { setDetailKey(null); setRosterTab("all"); setPersonQuery("") }}>
            返回列表
          </Button>
        }
      />
      <div style={{ padding: "0 24px 24px" }}>
        <div style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "14px 20px", borderBottom: "1px solid var(--color-border)" }}>
            <DirectSegmentedTabs
              current={rosterTab}
              counts={{ all: detailStats.total, 待考核: detailStats.total - detailStats.done, 已考核: detailStats.done }}
              onChange={setRosterTab}
            />
            <input
              type="search"
              value={personQuery}
              placeholder="搜索专员姓名或账号"
              onChange={(e) => setPersonQuery(e.target.value)}
              style={{ minHeight: 34, width: 220, border: "1px solid #D0D5DD", borderRadius: 7, padding: "6px 12px", fontSize: 12.5 }}
              aria-label="搜索专员"
            />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="dpq-roster" style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={th}>服务专员</th>
                  <th style={{ ...th, textAlign: "right" }}>有效工作量</th>
                  <th style={{ ...th, textAlign: "right" }}>默认绩效</th>
                  <th style={{ ...th, textAlign: "right" }}>已确认绩效</th>
                  <th style={th}>考核状态</th>
                  <th style={{ ...th, textAlign: "right", width: 250 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {rosterRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...td, textAlign: "center", color: "#667085", padding: "28px 20px" }}>
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
                          <DirectPersonCell name={record.specialist} account={record.specialistAccount} />
                        </td>
                        <td style={numTd}>{workloadOf(items)} 次</td>
                        <td style={numTd}>
                          {formatCentsText(baseCents)}
                          {record.missingPrice && <span style={{ display: "block", fontSize: 11, color: "#C73A3A", fontFamily: "inherit" }}>含缺价分项</span>}
                          {partial && <span style={{ display: "block", fontSize: 11, color: "#855613", fontFamily: "inherit" }}>含当前范围外分项</span>}
                        </td>
                        <td style={numTd}>
                          {active ? formatCentsText(active.cents) : <span style={{ color: "#C2CAD4" }}>—</span>}
                        </td>
                        <td style={td}>
                          <DirectStatusPill status={statusOf(record)} />
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 16, alignItems: "center" }}>
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
                            {active && locked && <span style={{ fontSize: 11.5, color: "#98A2B3" }}>已锁定</span>}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "12px 20px", background: "#F9FAFB", borderTop: "1px solid var(--color-border)", color: "#667085", fontSize: 12.5 }}>
            <span>共 <b style={{ color: "var(--color-text-1)" }}>{rosterRows.length}</b> 人</span>
            <span>
              已评 <b style={{ color: "var(--color-text-1)" }}>{detailStats.done} / {detailStats.total}</b> 人 ·
              已确认合计 <b style={{ color: "var(--color-text-1)", fontFamily: "ui-monospace, monospace" }}>{formatCentsText(detailStats.confirmedCents)}</b>
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
        description="直达专员绩效 · 按任务包（任务 × 考核月份）一对一考核服务专员；四级链批次评价在「服务专员绩效」页进行。"
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
        <div style={{ padding: "16px 24px 24px" }}>
          <DirectUiStyle />
          {/* ── 一级页：三级直达任务包总列表 ─────────────────────────────── */}
          <section style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }} aria-label="三级直达任务包">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "16px 20px 12px" }}>
              <div>
                <b style={{ fontSize: 15 }}>直达专员绩效 · 任务包</b>
                <span style={{ display: "block", fontSize: 12, color: "#667085", marginTop: 4 }}>
                  任务包 = 任务 × 考核月份（服务归属月）；专员记录按 任务 × 月份 × 专员唯一；金额按适用对私单价计算。
                </span>
              </div>
              <DirectSegmentedTabs current={directTab} counts={directTotals} onChange={(tab) => { setDirectTab(tab); setDirectPage(1) }} />
            </div>
            <div style={{ padding: "2px 20px 14px", borderTop: "1px dashed var(--color-border)" }}>
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
              <table className="dpq-roster" style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={th}>任务包</th>
                    <th style={{ ...th, textAlign: "right" }}>考核月份</th>
                    <th style={th}>合作药厂 / 品种</th>
                    <th style={{ ...th, textAlign: "right" }}>已确认绩效</th>
                    <th style={th}>考核状态</th>
                    <th style={{ ...th, textAlign: "right", width: 110 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {directPaged.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ ...td, textAlign: "center", color: "#667085", padding: "32px 20px" }}>
                        没有符合条件的三级直达任务包（需三级链任务且该月有已审核工作量）。
                      </td>
                    </tr>
                  ) : (
                    directPaged.map((pkg) => {
                      const stats = packageStatsOf(pkg)
                      return (
                        <tr key={pkg.key}>
                          <td style={td}>
                            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{pkg.taskName}</div>
                            <div style={{ fontSize: 11, color: "#98A2B3", fontFamily: "ui-monospace, monospace", marginTop: 3 }}>{pkg.taskNo}</div>
                          </td>
                          <td style={numTd}>{pkg.serviceMonth}</td>
                          <td style={td}>
                            {pkg.holderPharma}
                            <span style={{ display: "block", fontSize: 11, color: "#98A2B3", marginTop: 3 }}>{pkg.varietyNames.join("、")}</span>
                          </td>
                          <td style={numTd}>
                            {stats.done > 0 ? formatCentsText(stats.confirmedCents) : <span style={{ color: "#C2CAD4" }}>—</span>}
                          </td>
                          <td style={td}>
                            <DirectStatusPill status={stats.status} />
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "12px 20px", background: "#F9FAFB", borderTop: "1px solid var(--color-border)", color: "#667085", fontSize: 12.5 }}>
              <span>
                共 <b style={{ color: "var(--color-text-1)" }}>{directRows.length}</b> 个任务包
                <span style={{ marginLeft: 14 }}>有任一专员待考核即显示「待考核」；全部完成后转「已考核」。</span>
              </span>
              <DirectPager page={directPage} pageSize={PAGE_SIZE} total={directRows.length} onChange={setDirectPage} />
            </div>
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
    </div>
  )
}

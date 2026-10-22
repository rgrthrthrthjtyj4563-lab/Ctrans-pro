import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import {
  Bell,
  Plus,
  Eye,
  Upload,
  Wrench,
  ChevronDown,
  Download,
  FileText,
  RefreshCw,
  Search,
  ShieldOff,
} from "lucide-react"
import { PageHeader } from "../components/PageHeader"
import { FilterBar } from "../components/FilterBar"
import { Button } from "../components/Button"
import { AcceptanceTab } from "../components/AcceptanceTab"
import { useAcceptance } from "../context/AcceptanceContext"
import { StatusTag, Tag } from "../components/StatusTag"
import { Modal } from "../components/Modal"
import { ConfirmDialog } from "../components/ConfirmDialog"
import { BatchCreateTaskModal } from "../components/BatchCreateTaskModal"
import { EmptyState } from "../components/EmptyState"
import { Pagination } from "../components/Pagination"
import {
  chainLevelOfTask,
  displayStatusOf,
  formatCNY,
  formatCoverage,
  hasPromoItems,
  progressCountOf,
  remainingOfTask,
  useTaskData,
} from "../context/TaskDataContext"
import { usePermission } from "../context/PermissionContext"
import { resolveGroupLeader } from "../data/permissions"
import { membershipsOfTenant } from "../data/cooperationModel"
import { NO_BIZ_SCOPE_TITLE, noBizScopeDescription, useServingScope } from "../hooks/useServingBizScope"
import {
  formatCNYUpper,
  RECON_STATUS_OPTIONS,
  TASK_STATUS_OPTIONS,
  reconStatusDisplay,
  taskStatusDisplay,
} from "../constants"
import {
  PRICE_BOOK_MISMATCH_MSG,
  canCompleteSettlement,
  canRollbackComplete,
  canRollbackConfirm,
  canRollbackStart,
  canUnconfirmProvider,
  defaultSettlementPeriods,
  isPriceBookActive,
  latestValidBill,
  nearestTier,
  recommendedBudget,
  roundingToastText,
  unitPriceOutOfRange,
  validBills,
  validateSettlementPeriods,
  varietyPriceBook,
} from "../domain/taskV4"
import {
  workGroupMembers,
  SERVICE_DAILY_CAPACITY,
  providers,
  visitRecords,
} from "../data/mockData"
import { packageMonths, packageKey, pendingLevelOf } from "../data/acceptanceData"
import { chainPathLabel } from "../domain/taskV4"
import {
  FILE_KIND_LABEL,
  downloadAttachment,
  fileKindOf,
  isInlinePreviewable,
} from "../utils/attachment"
import type {
  NavFocus,
  NavigateFn,
  PriceAdjustLog,
  ReportFile,
  Role,
  RoundingLog,
  ServiceItem,
  SettlementLine,
  SettlementPeriod,
  Task,
  WorkgroupSplit,
  WorkloadAssign,
} from "../types"
import {
  SETTLEMENT_DECLARATION_TEXT,
  SETTLEMENT_DECLARATION_VERSION,
} from "../types"
import type { ToastMessage } from "../components/Toast"

interface Props {
  addToast: (msg: Omit<ToastMessage, "id">) => void
  currentRole?: Role
  navFocus?: NavFocus
  navigate: NavigateFn
}

const PAGE_SIZE = 10
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
  verticalAlign: "top",
}

export type DetailTab = "plan" | "exec" | "settle" | "log" | "report"

type PersonalAllocationRow = Pick<WorkloadAssign, "id" | "specialist" | "itemName" | "workload" | "progress"> & {
  category?: string
  amount?: number
  done?: number
  completedAt?: string
}

const MAIN_STATUS_COLOR: Record<string, "warning" | "brand" | "danger" | "success" | "default"> =
  {
    待服务商确认: "warning",
    执行中: "brand",
    待药厂处理: "danger",
    已结算: "success",
    已撤销: "default",
  }

// 任务状态 / 对账状态的列展示口径抽到 constants（taskStatusDisplay /
// reconStatusDisplay），与工作台任务交付概览共用同一份实现。

/** 待审核报告数：行内动态提示与页签角标共用同一口径 */
function pendingReportCount(task: Task): number {
  return task.reports.filter((r) => r.status === "待审核").length
}

export function TaskExecution({
  addToast,
  currentRole,
  navFocus,
  navigate,
}: Props) {
  const ctx = useTaskData()
  const { principal, orgs, users, assignments, groupLeaders } = usePermission()
  const { config: acceptCfg, packageOf: acceptPkgOf, reviewBatch: acceptReviewBatch } = useAcceptance()
  /**
   * 组长拦截（2026-09-15 拍板）：无有效组长的工作组（未设置/被停用/调离本组/
   * 角色被回收）不得接收新的管理任务——下派控件禁用并说明原因。
   */
  const blockedWorkGroups = useMemo(() => {
    if (principal.realm !== "TENANT" || principal.tenantKind !== "provider") return {}
    const memberships = membershipsOfTenant(principal.tenantId)
    const out: Record<string, string> = {}
    for (const g of orgs.filter(o => o.type === "group" && o.parentId === principal.tenantId)) {
      const res = resolveGroupLeader(g.id, groupLeaders[g.id], { users, assignments, memberships, tenantId: principal.tenantId })
      if (res.status === "none") out[g.name] = "该工作组尚未配置有效组长，请先在「工作组管理」指定组长"
      else if (res.status === "invalid") out[g.name] = `组长失效（${res.reason}），请先在「工作组管理」重新指定`
    }
    return out
  }, [principal, orgs, users, assignments, groupLeaders])
  const {
    tasks,
    varieties,
    revokeTask,
    confirmTask,
    unconfirmProvider,
    splitToWorkgroup,
    splitToSpecialists,
    authorizedSubTargets,
    uploadReport,
    reuploadReport,
    reviewReport,
    startSettlement,
    confirmSettlement,
    completeSettlement,
    uploadPaymentVoucher,
    rollbackStartSettlement,
    rollbackConfirmSettlement,
    rollbackCompleteSettlement,
  } = ctx

  // 按钮与数据分支口径（2026-09-15）：按租户类型 + 当前角色页面权限判定，
  // 不再使用旧角色名称字符串硬编码
  const { can: canAction } = usePermission()
  const isProvider = principal.realm === 'TENANT' && principal.tenantKind === 'provider'
  const isSales = principal.realm === 'TENANT' && principal.tenantKind === 'pharma' && canAction('task-dispatch', 'edit')

  const [filters, setFilters] = useState<Record<string, string>>({})
  const [applied, setApplied] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [highlightId, setHighlightId] = useState<string | undefined>(
    navFocus?.taskId,
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [detail, setDetail] = useState<Task | null>(null)
  const [tab, setTab] = useState<DetailTab>("plan")

  const [revokeTarget, setRevokeTarget] = useState<Task | null>(null)
  const [unconfirmTarget, setUnconfirmTarget] = useState<Task | null>(null)
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null)
  const [rollbackStartTarget, setRollbackStartTarget] = useState<Task | null>(
    null,
  )
  const [rollbackConfirmTarget, setRollbackConfirmTarget] =
    useState<Task | null>(null)
  const [rollbackCompleteTarget, setRollbackCompleteTarget] =
    useState<Task | null>(null)
  const [splitTask, setSplitTask] = useState<Task | null>(null)
  const [settleTask, setSettleTask] = useState<Task | null>(null)
  const [confirmBillTask, setConfirmBillTask] = useState<Task | null>(null)
  const [historyTask, setHistoryTask] = useState<Task | null>(null)
  const [voucherTask, setVoucherTask] = useState<Task | null>(null)
  const [reportUploadTask, setReportUploadTask] = useState<Task | null>(null)
  const [uploadEditing, setUploadEditing] = useState<ReportFile | null>(null)
  const [reviewTask, setReviewTask] = useState<Task | null>(null)
  // 附件在线预览：记 taskId+reportId，渲染时从最新 tasks 解析，保证预览的是当前版本
  const [previewRef, setPreviewRef] = useState<{
    taskId: string
    reportId: string
  } | null>(null)
  const previewReport = previewRef
    ? (tasks
        .find((t) => t.id === previewRef.taskId)
        ?.reports.find((r) => r.id === previewRef.reportId) ?? null)
    : null

  useEffect(() => {
    if (navFocus?.taskId) {
      setHighlightId(navFocus.taskId)
      const t = tasks.find((x) => x.id === navFocus.taskId)
      if (t) setDetail(t)
    }
  }, [navFocus?.taskId, tasks])

  const live = (t: Task | null) =>
    t ? (tasks.find((x) => x.id === t.id) ?? t) : null

  // 统一过滤口径（P0-C）：服务商 = 当前服务商 + 当前服务药厂 + 已授权品种 + 派生区域，
  // 范围失效默认拒绝；药厂会话 = 本厂任务（一次会话只操作一家药厂数据）
  const { denied, scope, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow } = useServingScope()
  const taskInSessionScope = (t: Task) =>
    isProviderSession
      ? matchesProviderRow({ provider: t.provider, holderPharma: t.holderPharma, varieties: t.varieties, regions: t.regions })
      : isPharmaSession
        ? matchesPharmaRow(t)
        : true
  const visible = useMemo(() => {
    const list = tasks.filter((t) => {
      // 会话口径：服务商四要素 / 药厂本厂任务（范围失效时恒 false，默认拒绝）
      if (!taskInSessionScope(t)) return false
      if (applied.taskStatus && t.taskStatus !== applied.taskStatus)
        return false
      if (applied.reconStatus && t.reconStatus !== applied.reconStatus)
        return false
      if (applied.variety && !t.varieties.includes(applied.variety))
        return false
      if (applied.provider && t.provider !== applied.provider) return false
      if (applied.startDate && t.endDate < applied.startDate) return false
      if (applied.endDate && t.startDate > applied.endDate) return false
      return true
    })
    // 有待审核报告的任务默认排最前，其余保持原顺序（稳定排序）
    return [
      ...list.filter((t) => pendingReportCount(t) > 0),
      ...list.filter((t) => pendingReportCount(t) === 0),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, applied, denied, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow])

  const pageData = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openDetail(t: Task, nextTab: DetailTab = "plan") {
    setDetail(t)
    setTab(nextTab)
  }

  /** 操作栏：服务商按执行阶段给出多个并列动作，其余角色保留单一主动作 */
  function renderNextAction(t: Task) {
    const detailBtn = (
      <Button
        variant="ghost"
        size="sm"
        icon={<Eye size={13} />}
        onClick={() => openDetail(t)}
      >
        查看详情
      </Button>
    )
    if (t.taskStatus === "待确认") {
      if (isProvider) {
        return (
          <Button
            variant="primary"
            size="sm"
            onClick={() => openDetail(t, "plan")}
          >
            确认任务
          </Button>
        )
      }
      if (isSales) {
        return (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevokeTarget(t)}
          >
            撤销任务
          </Button>
        )
      }
    }
    if (t.reconStatus === "对账中" && isSales) {
      return (
        <Button
          variant="primary"
          size="sm"
          onClick={() => setConfirmBillTask(t)}
        >
          确认结算单
        </Button>
      )
    }
    if (
      t.taskStatus === "执行中" &&
      isSales &&
      t.reports.some((r) => r.status === "待审核")
    ) {
      return (
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            // 成果与验收页签内按材料包批量验收（原单报告一过式审核入口废弃）
            openDetail(t, "report")
          }}
        >
          验收成果
        </Button>
      )
    }
    if (isSales && canUnconfirmProvider(t)) {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setUnconfirmTarget(t)}
        >
          撤回服务商确认
        </Button>
      )
    }
    if (isSales && canCompleteSettlement(t)) {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCompleteTarget(t)}
        >
          结算完结
        </Button>
      )
    }
    if (isSales && canRollbackComplete(t)) {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRollbackCompleteTarget(t)}
        >
          回退结算完结
        </Button>
      )
    }
    if (t.taskStatus === "执行中" && isProvider) {
      const actions: React.ReactNode[] = []
      if (hasPromoItems(t)) {
        // 三级链任务：服务商直接分配服务专员；四级链任务：先拆解到工作组
        const threeLevel = chainLevelOfTask(t) === "三级链"
        const hasAssignment = threeLevel
          ? t.workloadAssigns.length > 0
          : t.workgroupSplits.length > 0
        if (!hasAssignment) {
          actions.push(
            <Button
              key="split"
              variant="primary"
              size="sm"
              onClick={() => setSplitTask(t)}
            >
              {threeLevel ? "分配任务量" : "拆分任务包"}
            </Button>,
          )
        } else {
          // 金额允许分批拆：只要还有剩余可拆金额，就保留继续拆分入口
          const assignedAmount = threeLevel
            ? t.workloadAssigns.reduce((s, x) => s + x.amount, 0)
            : t.workgroupSplits.reduce((s, x) => s + x.amount, 0)
          const remainingSplit = t.planAmount - assignedAmount
          if (remainingSplit > 0) {
            actions.push(
              <Button
                key="split-more"
                variant="outline"
                size="sm"
                onClick={() => setSplitTask(t)}
              >
                {threeLevel ? "继续分配" : "继续拆分"}
              </Button>,
            )
          }
          actions.push(
            <Button
              key="upload"
              variant="primary"
              size="sm"
              onClick={() => openDetail(t, "report")}
            >
              上传报告
            </Button>,
          )
          actions.push(
            <Button
              key="settle"
              variant="outline"
              size="sm"
              onClick={() => setSettleTask(t)}
            >
              发起结算
            </Button>,
          )
        }
      } else {
        actions.push(
          <Button
            key="upload"
            variant="primary"
            size="sm"
            onClick={() => openDetail(t, "report")}
          >
            上传报告
          </Button>,
        )
      }
      actions.push(detailBtn)
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {actions}
        </div>
      )
    }
    return detailBtn
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="任务执行"
        description="药厂创建发包任务，服务商确认后执行；任务金额按统一价目表及比例自动计算。"
        actions={
          isSales ? (
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={14} />}
              onClick={() => setCreateOpen(true)}
            >
              创建任务
            </Button>
          ) : undefined
        }
      />
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {denied ? (
          <EmptyState
            icon={ShieldOff}
            title={NO_BIZ_SCOPE_TITLE}
            description={noBizScopeDescription(scope?.pharmaName)}
          />
        ) : (
        <>
        <FilterBar
          fields={[
            {
              id: "taskStatus",
              label: "任务状态",
              type: "select",
              options: TASK_STATUS_OPTIONS,
            },
            {
              id: "reconStatus",
              label: "对账状态",
              type: "select",
              options: RECON_STATUS_OPTIONS,
            },
            {
              id: "variety",
              label: "品种",
              type: "select",
              options: varieties.map((v) => ({
                value: v.tradeName,
                label: v.tradeName,
              })),
            },
            {
              id: "provider",
              label: "服务提供方",
              type: "select",
              options: providers.map((p) => ({ value: p, label: p })),
            },
            { id: "startDate", label: "开始时间", type: "date" },
            { id: "endDate", label: "结束时间", type: "date" },
          ]}
          values={filters}
          onChange={(id, value) => setFilters((f) => ({ ...f, [id]: value }))}
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

        <div
          style={{
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            overflow: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 1340,
            }}
          >
            <thead>
              <tr>
                {[
                  "药厂名称",
                  "服务提供商名称",
                  "所属品种",
                  "推广金额",
                  "推广时段",
                  "已结算金额",
                  "剩余可结算金额",
                  "任务状态",
                  "对账状态",
                  "操作",
                ].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState
                      title="暂无任务"
                      description="药厂可创建任务；服务商确认后进入执行。"
                    />
                  </td>
                </tr>
              ) : (
                pageData.map((t) => {
                  const focused = highlightId === t.id
                  const prog = progressCountOf(t)
                  const display = displayStatusOf(t)
                  return (
                    <tr
                      key={t.id}
                      style={{
                        background: focused
                          ? "var(--color-brand-subtle)"
                          : undefined,
                      }}
                    >
                      <td style={td}>{t.holderPharma}</td>
                      <td style={td}>{t.provider}</td>
                      <td style={td}>{formatCoverage(t.varieties)}</td>
                      <td
                        style={{
                          ...td,
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 600,
                        }}
                      >
                        {formatCNY(t.planAmount)}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {t.startDate} ~ {t.endDate}
                      </td>
                      <td
                        style={{
                          ...td,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {formatCNY(t.settledAmount)}
                      </td>
                      <td
                        style={{
                          ...td,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {t.remainingVoided
                          ? `${formatCNY(0)}（已作废）`
                          : formatCNY(remainingOfTask(t))}
                      </td>
                      <td style={td}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Tag
                            label={taskStatusDisplay(t.taskStatus, t.reconStatus).label}
                            color={taskStatusDisplay(t.taskStatus, t.reconStatus).color}
                          />
                          {isSales && pendingReportCount(t) > 0 && (
                            <span
                              className="report-pending-icon"
                              title={`有 ${pendingReportCount(t)} 份报告待审核`}
                            >
                              <Bell size={13} />
                              <span
                                style={{
                                  fontSize: "var(--fs-11)",
                                  fontWeight: 650,
                                }}
                              >
                                {pendingReportCount(t)}
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={td}>
                        <Tag
                          label={reconStatusDisplay(t.reconStatus).label}
                          color={reconStatusDisplay(t.reconStatus).color}
                        />
                      </td>
                      <td style={td}>{renderNextAction(t)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={visible.length}
          onChange={setPage}
        />
        </>
        )}
      </div>

      <BatchCreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        addToast={addToast}
        holderPharma={principal.realm === 'TENANT' && principal.tenantKind === 'pharma' ? principal.tenantName : ''}
      />

      <TaskDetailModal
        task={live(detail)}
        tab={tab}
        onTab={setTab}
        onClose={() => setDetail(null)}
        isSales={isSales}
        isProvider={isProvider}
        onReview={() => detail && setReviewTask(detail)}
        onConfirmBill={() => detail && setConfirmBillTask(detail)}
        onUploadReport={
          isProvider
            ? () => {
                setUploadEditing(null)
                if (detail) setReportUploadTask(detail)
              }
            : undefined
        }
        onReuploadReport={
          isProvider
            ? (report) => {
                setUploadEditing(report)
                if (detail) setReportUploadTask(detail)
              }
            : undefined
        }
        onPreviewReport={(report) =>
          detail && setPreviewRef({ taskId: detail.id, reportId: report.id })
        }
        reviewerName={principal.name}
        addToast={addToast}
        onNavigate={navigate}
        onConfirmTask={
          isProvider && detail?.taskStatus === "待确认"
            ? () => {
                if (!detail) return
                const r = confirmTask(detail.id)
                if (r.ok) {
                  addToast({
                    type: "success",
                    title: "任务已确认",
                    description: `${detail.taskNo} 进入执行中，计划与价目表快照已锁定`,
                  })
                  setDetail(null)
                } else
                  addToast({
                    type: "error",
                    title: "无法确认",
                    description: r.error,
                  })
              }
            : undefined
        }
      />

      <SplitModal
        task={live(splitTask)}
        mode={
          splitTask && chainLevelOfTask(splitTask) === "三级链"
            ? "specialist"
            : "group"
        }
        targets={splitTask ? authorizedSubTargets(splitTask) : []}
        blockedTargets={
          splitTask && chainLevelOfTask(splitTask) !== "三级链"
            ? blockedWorkGroups
            : undefined
        }
        addToast={addToast}
        onClose={() => setSplitTask(null)}
        onSave={(splits) => {
          if (!splitTask) return
          const threeLevel = chainLevelOfTask(splitTask) === "三级链"
          const r = threeLevel
            ? splitToSpecialists(splitTask.id, splits)
            : splitToWorkgroup(splitTask.id, splits)
          if (!r.ok)
            addToast({
              type: "error",
              title: threeLevel ? "分配失败" : "拆解失败",
              description: r.error,
            })
          else {
            addToast({
              type: "success",
              title: threeLevel ? "已分配给服务专员" : "已拆分到工作组",
            })
            setSplitTask(null)
          }
        }}
      />

      <SettleModal
        task={live(settleTask)}
        onClose={() => setSettleTask(null)}
        onSave={(input) => {
          if (!settleTask) return
          const r = startSettlement(settleTask.id, input)
          if (!r.ok)
            addToast({ type: "error", title: "生成失败", description: r.error })
          else {
            const billNo = r.data?.settlements.at(-1)?.billNo ?? ""
            addToast({
              type: "success",
              title: "已生成结算单",
              description: `${billNo} · ${input.serviceMonth} · 共 ${input.selections.length} 条明细，对账状态变为对账中`,
            })
            setSettleTask(null)
          }
        }}
      />

      <ConfirmBillModal
        task={live(confirmBillTask)}
        onClose={() => setConfirmBillTask(null)}
        onSave={(billId, lines, declaration) => {
          if (!confirmBillTask) return
          const r = confirmSettlement(
            confirmBillTask.id,
            billId,
            lines,
            declaration,
          )
          if (!r.ok)
            addToast({ type: "error", title: "确认失败", description: r.error })
          else {
            const remain = r.data ? remainingOfTask(r.data) : 0
            addToast({
              type: remain > 0 ? "warning" : "success",
              title: "结算单已确认并立即生效",
              description:
                remain > 0
                  ? `剩余可结算 ${formatCNY(remain)}，可择期结算或结算完结`
                  : "已确认金额已计入已结算",
            })
            setConfirmBillTask(null)
          }
        }}
      />

      <HistoryModal
        task={live(historyTask)}
        onClose={() => setHistoryTask(null)}
      />

      <VoucherModal
        task={live(voucherTask)}
        onClose={() => setVoucherTask(null)}
        onSave={(billId, name) => {
          if (!voucherTask) return
          const r = uploadPaymentVoucher(voucherTask.id, billId, name)
          if (!r.ok)
            addToast({ type: "error", title: "上传失败", description: r.error })
          else {
            addToast({ type: "success", title: "付款凭证已上传" })
            setVoucherTask(null)
          }
        }}
      />

      <ReportUploadModal
        task={live(reportUploadTask)}
        editing={uploadEditing}
        onClose={() => {
          setReportUploadTask(null)
          setUploadEditing(null)
        }}
        onSave={(reportId, payload) => {
          if (!reportUploadTask) return
          const target = live(reportUploadTask)?.reports.find(
            (r) => r.id === reportId,
          )
          const isReupload = target?.status === "驳回"
          const r = isReupload
            ? reuploadReport(reportUploadTask.id, reportId, payload)
            : uploadReport(reportUploadTask.id, reportId, payload)
          if (!r.ok)
            addToast({ type: "error", title: "上传失败", description: r.error })
          else {
            addToast({
              type: "success",
              title: isReupload ? "报告已重新上传" : "报告已上传",
              description: "状态：待审核",
            })
            setReportUploadTask(null)
            setUploadEditing(null)
          }
        }}
      />

      <AttachmentPreviewModal
        key={previewReport?.id ?? "none"}
        report={previewReport}
        onClose={() => setPreviewRef(null)}
        decide={
          isSales && previewReport && previewReport.serviceMonth && previewRef
            ? (() => {
                const pkg = acceptPkgOf(previewRef.taskId, previewReport.serviceMonth)
                const st = pkg.items[previewReport.id]
                if (st && (st.rectifying || st.passedLevels >= acceptCfg.levels)) return undefined
                const lv = pendingLevelOf(pkg.items, acceptCfg.levels) ?? 1
                const department =
                  acceptCfg.levels <= 1 ? "成果验收" : acceptCfg.departments[lv - 1] ?? "—"
                const submit = (decision: "通过" | "驳回", comment: string) => {
                  const result = acceptReviewBatch({
                    taskId: previewRef.taskId,
                    serviceMonth: previewReport.serviceMonth!,
                    level: lv,
                    department,
                    reviewer: principal.name,
                    batchComment: "",
                    items: [
                      {
                        itemId: previewReport.id,
                        itemType: "报告",
                        itemName: previewReport.name,
                        decision,
                        comment,
                      },
                    ],
                  })
                  if (!result.ok) {
                    addToast({ type: "error", title: "提交失败", description: result.error })
                    return
                  }
                  addToast({
                    type: "success",
                    title: decision === "通过" ? "报告验收通过" : "报告已驳回",
                    description:
                      decision === "通过"
                        ? `${previewReport.name} 已通过 ${department} 验收`
                        : `${previewReport.name} 退回服务商补充，重新提交后从第 1 级重新验收`,
                  })
                  setPreviewRef(null)
                }
                return {
                  onPass: () => submit("通过", ""),
                  onReject: (reason: string) => submit("驳回", reason),
                }
              })()
            : undefined
        }
      />

      <ReviewModal
        task={live(reviewTask)}
        onClose={() => setReviewTask(null)}
        onPreviewReport={(report) =>
          reviewTask && setPreviewRef({ taskId: reviewTask.id, reportId: report.id })
        }
        onSave={(reportId, pass, comment) => {
          if (!reviewTask) return
          const r = reviewReport(reviewTask.id, reportId, pass, comment)
          if (!r.ok)
            addToast({ type: "error", title: "审核失败", description: r.error })
          else {
            addToast({
              type: "success",
              title: pass ? "报告已通过" : "报告已驳回",
            })
            setReviewTask(null)
          }
        }}
      />

      <ConfirmDialog
        open={!!revokeTarget}
        title="撤销任务"
        description={
          revokeTarget
            ? `撤销后 ${revokeTarget.taskNo} 变为已撤销，不再计入统计。`
            : ""
        }
        confirmLabel="撤销任务"
        variant="danger"
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) {
            const r = revokeTask(revokeTarget.id)
            if (r.ok)
              addToast({
                type: "success",
                title: "任务已撤销",
                description: revokeTarget.taskNo,
              })
            else
              addToast({
                type: "error",
                title: "无法撤销",
                description: r.error,
              })
          }
          setRevokeTarget(null)
        }}
      />

      <ConfirmDialog
        open={!!completeTarget}
        title="结算完结"
        description={
          completeTarget
            ? `结束后任务进入终态。剩余可结算金额 ${formatCNY(remainingOfTask(completeTarget))} 将作废归零，不再计入统计。`
            : ""
        }
        impact="结算完结后可通过「回退结算完结」恢复执行中；业务数据不会物理删除。"
        confirmLabel="结算完结"
        variant="danger"
        onCancel={() => setCompleteTarget(null)}
        onConfirm={() => {
          if (completeTarget) {
            const r = completeSettlement(completeTarget.id)
            if (r.ok)
              addToast({
                type: "success",
                title: "已结算完结",
                description: completeTarget.taskNo,
              })
            else
              addToast({
                type: "error",
                title: "无法完结",
                description: r.error,
              })
          }
          setCompleteTarget(null)
        }}
      />

      <ConfirmDialog
        open={!!unconfirmTarget}
        title="撤回服务商确认"
        description={
          unconfirmTarget
            ? `${unconfirmTarget.taskNo} 尚无分配、执行、报告或结算数据，撤回后回到待服务商确认。`
            : ""
        }
        confirmLabel="撤回确认"
        variant="danger"
        onCancel={() => setUnconfirmTarget(null)}
        onConfirm={() => {
          if (unconfirmTarget) {
            const r = unconfirmProvider(unconfirmTarget.id)
            if (r.ok)
              addToast({
                type: "success",
                title: "已撤回服务商确认",
                description: unconfirmTarget.taskNo,
              })
            else
              addToast({
                type: "error",
                title: "无法撤回",
                description: r.error,
              })
          }
          setUnconfirmTarget(null)
        }}
      />

      <ConfirmDialog
        open={!!rollbackStartTarget}
        title="回退发起结算"
        description={
          rollbackStartTarget
            ? `将逻辑作废最新有效结算单 ${latestValidBill(rollbackStartTarget)?.billNo ?? ""}，任务量解除占用。`
            : ""
        }
        impact="不物理删除结算单，仅作废并留痕。"
        confirmLabel="回退发起结算"
        variant="danger"
        onCancel={() => setRollbackStartTarget(null)}
        onConfirm={() => {
          if (rollbackStartTarget) {
            const bill = latestValidBill(rollbackStartTarget)
            const r = bill
              ? rollbackStartSettlement(rollbackStartTarget.id, bill.id)
              : { ok: false, error: "没有可回退结算单" }
            if (r.ok) addToast({ type: "success", title: "已回退发起结算" })
            else
              addToast({
                type: "error",
                title: "无法回退",
                description: r.error,
              })
          }
          setRollbackStartTarget(null)
        }}
      />

      <ConfirmDialog
        open={!!rollbackConfirmTarget}
        title="回退结算确认"
        description={
          rollbackConfirmTarget
            ? `将最新有效结算单 ${latestValidBill(rollbackConfirmTarget)?.billNo ?? ""} 恢复为对账中。`
            : ""
        }
        impact="已确认金额从已结算汇总中扣回；不物理删除。"
        confirmLabel="回退结算确认"
        variant="danger"
        onCancel={() => setRollbackConfirmTarget(null)}
        onConfirm={() => {
          if (rollbackConfirmTarget) {
            const bill = latestValidBill(rollbackConfirmTarget)
            const r = bill
              ? rollbackConfirmSettlement(rollbackConfirmTarget.id, bill.id)
              : { ok: false, error: "没有可回退结算单" }
            if (r.ok) addToast({ type: "success", title: "已回退结算确认" })
            else
              addToast({
                type: "error",
                title: "无法回退",
                description: r.error,
              })
          }
          setRollbackConfirmTarget(null)
        }}
      />

      <ConfirmDialog
        open={!!rollbackCompleteTarget}
        title="回退结算完结"
        description={
          rollbackCompleteTarget
            ? `${rollbackCompleteTarget.taskNo} 将恢复为执行中，剩余可结算金额重新计算。`
            : ""
        }
        confirmLabel="回退结算完结"
        variant="danger"
        onCancel={() => setRollbackCompleteTarget(null)}
        onConfirm={() => {
          if (rollbackCompleteTarget) {
            const r = rollbackCompleteSettlement(rollbackCompleteTarget.id)
            if (r.ok) addToast({ type: "success", title: "已回退结算完结" })
            else
              addToast({
                type: "error",
                title: "无法回退",
                description: r.error,
              })
          }
          setRollbackCompleteTarget(null)
        }}
      />
    </div>
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

// ─── 创建任务：对齐现网表单（任务名称自动 + 服务地区单选 + 三张服务表混合填写） ───

interface PriceRow {
  category: string
  name: string
  unitPrice: number
  unit: string
}

function ChipSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.length === 0 ? (
        <span style={{ fontSize: "var(--fs-12)", color: "#9CA3AF" }}>
          {placeholder || "无可选项"}
        </span>
      ) : (
        options.map((opt) => {
          const on = value.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() =>
                onChange(on ? value.filter((x) => x !== opt) : [...value, opt])
              }
              style={{
                padding: "4px 10px",
                borderRadius: 16,
                fontSize: "var(--fs-12)",
                cursor: "pointer",
                border: on
                  ? "1px solid var(--color-brand)"
                  : "1px solid var(--color-border)",
                background: on ? "var(--color-brand-subtle)" : "#fff",
                color: on ? "var(--color-brand)" : "#344054",
              }}
            >
              {opt}
            </button>
          )
        })
      )}
    </div>
  )
}


// ─── 任务详情：固定步骤条 + 页签 ───

function stepStateOf(
  task: Task,
): {
  steps: { label: string; owner: string; status: "done" | "current" | "todo" }[]
  currentLabel: string
} {
  const promo = hasPromoItems(task)
  const assigns = task.workloadAssigns
  const { done, review, todo } = progressCountOf(task)
  const remain = remainingOfTask(task)
  const reportPassed = task.reports.some((r) => r.status === "通过")

  const confirm: "done" | "current" | "todo" =
    task.taskStatus === "待确认"
      ? "current"
      : task.taskStatus === "已撤销"
        ? "todo"
        : "done"
  const assign: "done" | "current" | "todo" =
    task.taskStatus === "待确认" || task.taskStatus === "已撤销"
      ? "todo"
      : !promo || assigns.length > 0 || task.taskStatus === "已结算"
        ? "done"
        : "current"
  const execute: "done" | "current" | "todo" =
    assign !== "done"
      ? "todo"
      : task.taskStatus === "已结算"
        ? "done"
        : promo
          ? review + todo === 0 && (done > 0 || task.settlements.length > 0)
            ? "done"
            : "current"
          : reportPassed
            ? "done"
            : "current"
  const settle: "done" | "current" | "todo" =
    task.taskStatus === "已结算"
      ? "done"
      : task.reconStatus === "对账中"
        ? "current"
        : execute !== "done"
          ? "todo"
          : remain > 0
            ? "current"
            : "done"

  const steps = [
    { label: "发包", owner: "药厂", status: "done" as const },
    { label: "确认", owner: "服务提供商", status: confirm },
    {
      label: "执行分配",
      owner: promo ? "服务提供商 / 工作组" : "—",
      status: assign,
    },
    {
      label: "执行完成",
      owner: promo ? "服务专员" : "服务提供商",
      status: execute,
    },
    {
      label: "结算",
      owner:
        settle === "current" && task.reconStatus === "对账中"
          ? "药厂"
          : "服务提供商 → 药厂",
      status: settle,
    },
  ]
  const currentStep = steps.find((s) => s.status === "current")
  return {
    steps,
    currentLabel: currentStep
      ? `当前卡点：${currentStep.label}（${currentStep.owner}）`
      : task.taskStatus === "已撤销"
        ? "任务已撤销"
        : "全部步骤已完成",
  }
}

export function TaskDetailModal({
  task,
  tab,
  onTab,
  onClose,
  isSales,
  isProvider,
  onReview,
  onConfirmBill,
  onConfirmTask,
  onUploadReport,
  onReuploadReport,
  onPreviewReport,
  reviewerName,
  addToast,
  onNavigate,
}: {
  task: Task | null
  tab: DetailTab
  onTab: (t: DetailTab) => void
  onClose: () => void
  isSales: boolean
  isProvider: boolean
  onReview: () => void
  onConfirmBill: () => void
  onConfirmTask?: () => void
  onUploadReport?: () => void
  onReuploadReport?: (report: ReportFile) => void
  onPreviewReport?: (report: ReportFile) => void
  reviewerName?: string
  addToast?: (msg: { type: "success" | "error" | "info" | "warning"; title: string; description?: string }) => void
  onNavigate?: NavigateFn
}) {
  if (!task) return null
  return (
    <TaskDetailV5
      task={task}
      tab={tab}
      onTab={onTab}
      onClose={onClose}
      isSales={isSales}
      isProvider={isProvider}
      onReview={onReview}
      onConfirmBill={onConfirmBill}
      onConfirmTask={onConfirmTask}
      onUploadReport={onUploadReport}
      onReuploadReport={onReuploadReport}
      onPreviewReport={onPreviewReport}
      reviewerName={reviewerName ?? "—"}
      addToast={addToast ?? (() => {})}
      onNavigate={onNavigate}
    />
  )
}

function CompactValue({
  items,
  limit = 1,
}: {
  items: string[]
  limit?: number
}) {
  const [open, setOpen] = useState(false)
  const visible = items.slice(0, limit)
  const more = items.length - visible.length
  return (
    <div>
      <span>{visible.join("、") || "—"}</span>
      {more > 0 && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          style={{
            marginLeft: 6,
            border: "none",
            background: "#EBF2FE",
            color: "#2F6BCE",
            borderRadius: 10,
            padding: "1px 7px",
            cursor: "pointer",
            fontSize: "var(--fs-11)",
          }}
        >
          +{more}
        </button>
      )}
      {open && (
        <div
          style={{
            marginTop: 7,
            padding: "8px 10px",
            borderRadius: 6,
            background: "#F9FAFB",
            color: "#475467",
            fontSize: "var(--fs-12)",
            lineHeight: 1.7,
          }}
        >
          {items.join("、")}
        </div>
      )}
    </div>
  )
}

function DetailStatus({ label }: { label: string }) {
  const color: Record<string, "default" | "brand" | "info" | "success" | "warning" | "danger"> =
    {
      执行中: "info",
      对账中: "info",
      待确认: "warning",
      待审核: "warning",
      待对账: "warning",
      已通过: "success",
      已对账: "success",
      已确认: "success",
      已完成: "success",
      待开票: "warning",
      待付款: "warning",
      已退回: "danger",
      已驳回: "danger",
      待提交: "default",
      待上传: "default",
      "—": "default",
    }
  return <Tag label={label} color={color[label] ?? "default"} />
}

type LifecycleViewId = "stage4" | "stage5" | "loop" | "stage6"

const LIFECYCLE_STEP_NAMES = [
  "药厂发包",
  "服务商承接",
  "任务拆解下发",
  "任务执行中",
  "结算确认",
  "结算完结",
]

const LIFECYCLE_VIEWS: {
  id: LifecycleViewId
  label: string
  stage: number
  loop?: boolean
}[] = [
  { id: "stage4", label: "阶段 4 · 执行中", stage: 4 },
  { id: "stage5", label: "阶段 5 · 第 1 次结算确认", stage: 5 },
  { id: "loop", label: "循环 · 第 2 次结算继续执行", stage: 4, loop: true },
  { id: "stage6", label: "阶段 6 · 结算完结归档", stage: 6 },
]

function taskLifecycleStage(task: Task): number {
  if (task.taskStatus === "已结算") return 6
  if (
    task.settlements.length > 0 ||
    task.opsLogs.some((log) => log.action === "发起结算" || log.action === "结算确认")
  ) {
    return 5
  }
  if (task.taskStatus === "执行中") {
    return task.workgroupSplits.length > 0 || task.workloadAssigns.length > 0 ? 4 : 3
  }
  return 2
}

function taskLifecycleTimes(task: Task): string[] {
  const day = (value?: string) => (value ? value.slice(0, 10) : "")
  const logDay = (actions: string[]) => {
    const log = task.opsLogs.find((item) => actions.includes(item.action))
    return log ? day(log.time) : ""
  }
  const t1 = logDay(["创建任务"]) || day(task.createdAt)
  const t2 = logDay(["确认任务"])
  const t3 = logDay(["分配任务量"]) || t2
  const unsettledPeriod = task.settlementPeriods.find(
    (period) =>
      !task.settlements.some(
        (bill) => bill.settlementPeriodId === period.id && bill.confirmed && !bill.voided,
      ),
  )
  const planned = [
    day(task.createdAt) || day(task.startDate),
    day(task.startDate),
    day(task.startDate),
    day(task.startDate),
    unsettledPeriod?.endDate || day(task.endDate),
    day(task.endDate),
  ]
  const actual = [t1, t2, t3, t3, logDay(["发起结算", "结算确认"]), logDay(["结算完结"])]
  return actual.map((value, index) => value || planned[index] || "")
}

function TaskLifecycleBar({ task }: { task: Task }) {
  const { config: acceptConfig, packages: acceptPackages } = useAcceptance()
  const realStage = useMemo(() => taskLifecycleStage(task), [task])
  const times = useMemo(() => taskLifecycleTimes(task), [task])
  // 成果验收部门确认节点：任务有材料包时插在「任务执行中」与「结算确认」之间（X 部门确认——X 部门确认）
  const acceptNodes = useMemo(() => {
    const months = packageMonths(
      visitRecords.filter(r => r.taskId === task.id),
      task.reports,
    )
    const month = months[0]
    if (!month) return []
    const pkg = acceptPackages[packageKey(task.id, month)]
    const monthPromos = visitRecords.filter(r => r.taskId === task.id && r.visitDate.slice(0, 7) === month)
    const monthReports = task.reports.filter(r => (r.serviceMonth ?? "") === month)
    const states = [...monthPromos.map(r => pkg?.items[r.id]), ...monthReports.map(r => pkg?.items[r.id])]
    if (!states.length) return []
    const levels = acceptConfig.levels
    // 当前级 = 待决条目的最小下一级（整改中不阻塞级推进）；无待决 = 各级本轮均已审毕
    const currentLevel =
      states.reduce<number | null>((acc, s) => {
        if (!s || s.rectifying || s.passedLevels >= levels) return acc
        const need = s.passedLevels + 1
        return acc === null || need < acc ? need : acc
      }, null)
    const allPassed = states.every(s => s && !s.rectifying && s.passedLevels >= levels)
    return Array.from({ length: levels }, (_, i) => i + 1).map(lv => ({
      label: acceptConfig.levels <= 1 ? "成果验收" : `${acceptConfig.departments[lv - 1] ?? "—"}验收`,
      state: (allPassed || (currentLevel !== null && lv < currentLevel)
        ? "done"
        : currentLevel === lv
          ? "current"
          : currentLevel === null
            ? "done"
            : "future") as "done" | "current" | "future",
      level: lv,
    }))
  }, [task.id, task.reports, acceptPackages, acceptConfig])
  const [viewId, setViewId] = useState<LifecycleViewId | null>(() =>
    realStage >= 4
      ? (LIFECYCLE_VIEWS.find((view) => view.stage === realStage && !view.loop)?.id ?? null)
      : null,
  )
  const activeView = LIFECYCLE_VIEWS.find((view) => view.id === viewId)
  const activeStage = activeView ? activeView.stage : realStage
  const loopBadge = Boolean(activeView?.loop)
  // 结算确认等待中的当前节点用琥珀黄（等待/审核语义），执行与完结阶段用品牌绿
  const amberCurrent = activeStage === 5

  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        background: "var(--color-surface)",
        padding: "12px 16px 16px",
        marginBottom: 16,
      }}
    >
      <style>{`@keyframes taskLifecyclePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.8;transform:scale(1.08)}}`}</style>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 12,
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--color-brand)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: "var(--fs-12)",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--color-text-3)",
            }}
          >
            业务生命周期状态模拟
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 2,
            padding: 3,
            background: "var(--color-canvas)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
          }}
        >
          {LIFECYCLE_VIEWS.map((view) => {
            const active = viewId === view.id
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => setViewId(view.id)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "5px 10px",
                  borderRadius: 6,
                  fontSize: "var(--fs-12)",
                  background: active ? "var(--color-surface)" : "transparent",
                  color: active ? "var(--color-brand)" : "var(--color-text-2)",
                  fontWeight: active ? 650 : 500,
                  boxShadow: active ? "0 1px 3px rgba(16, 24, 40, 0.12)" : "none",
                }}
              >
                {view.label}
              </button>
            )
          })}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${6 + acceptNodes.length}, minmax(0, 1fr))`,
          gap: 4,
          padding: "20px 8px 0",
        }}
      >
        {LIFECYCLE_STEP_NAMES.map((name, index) => {
          const stepNo = index + 1
          const displayNo = acceptNodes.length ? (index <= 2 ? index + 1 : index) : stepNo
          const done = stepNo < activeStage
          const current = stepNo === activeStage
          const date = times[index]
          return (
            <Fragment key={name}>
            {index === 3 && acceptNodes.length > 0 ? (
              acceptNodes.map(node => (
                <div
                  key={`${node.label}${node.level}`}
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: 15,
                      width: "100%",
                      height: 2,
                      background: node.state !== "future" ? "var(--color-brand)" : "var(--color-border)",
                    }}
                  />
                  <span
                    style={{
                      position: "relative",
                      zIndex: 1,
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "var(--fs-12)",
                      fontWeight: 700,
                      ...(node.state === "done"
                        ? { background: "var(--color-brand)", color: "#fff" }
                        : node.state === "current"
                          ? {
                              background: "var(--color-brand)",
                              color: "#fff",
                              boxShadow: "0 0 0 4px var(--color-brand-subtle)",
                              animation: "taskLifecyclePulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                            }
                          : {
                              background: "var(--color-table-stripe)",
                              border: "1px solid var(--color-border)",
                              color: "var(--color-text-3)",
                            }),
                    }}
                  >
                    {node.state === "done" ? "✓" : node.level}
                  </span>
                  <div
                    style={{
                      position: "relative",
                      zIndex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--fs-12)",
                        fontWeight: node.state === "current" ? 650 : 500,
                        color:
                          node.state === "current"
                            ? "var(--color-brand)"
                            : node.state === "done"
                              ? "var(--color-text-1)"
                              : "var(--color-text-3)",
                      }}
                    >
                      {node.label}
                    </span>
                    {node.state === "current" && (
                      <span
                        style={{
                          background: "var(--color-brand-subtle)",
                          color: "var(--color-brand)",
                          fontSize: "var(--fs-10)",
                          fontWeight: 500,
                          padding: "1px 6px",
                          borderRadius: 4,
                          whiteSpace: "nowrap",
                        }}
                      >
                        待验收
                      </span>
                    )}
                  </div>
                  {node.state !== "current" && (
                    <span style={{ marginTop: 3, fontSize: "var(--fs-11)", color: "var(--color-text-3)" }}>
                      {node.state === "done" ? "已通过" : `第 ${node.level} 级`}
                    </span>
                  )}
                </div>
              ))
            ) : (
            <div
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              {stepNo < LIFECYCLE_STEP_NAMES.length && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 15,
                    width: "100%",
                    height: 2,
                    background:
                      stepNo < activeStage ? "var(--color-brand)" : "var(--color-border)",
                  }}
                />
              )}
              <span
                style={{
                  position: "relative",
                  zIndex: 1,
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--fs-12)",
                  fontWeight: 700,
                  ...(done
                    ? { background: "var(--color-brand)", color: "#fff" }
                    : current
                      ? {
                          background: amberCurrent ? "#F59E0B" : "var(--color-brand)",
                          color: "#fff",
                          boxShadow: amberCurrent
                            ? "0 0 0 4px rgba(245, 158, 11, 0.2)"
                            : "0 0 0 4px var(--color-brand-subtle)",
                          animation:
                            "taskLifecyclePulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                        }
                      : {
                          background: "var(--color-table-stripe)",
                          border: "1px solid var(--color-border)",
                          color: "var(--color-text-3)",
                        }),
                }}
              >
                {done ? (
                  "✓"
                ) : current && loopBadge ? (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    {stepNo}
                    <RefreshCw size={11} strokeWidth={2.5} />
                  </span>
                ) : (
                  stepNo
                )}
              </span>
              <div
                style={{
                  position: "relative",
                  zIndex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 10,
                }}
              >
                <span
                  style={{
                    fontSize: "var(--fs-12)",
                    fontWeight: current ? 650 : 500,
                    color: current
                      ? amberCurrent
                        ? "var(--color-warning-fg)"
                        : "var(--color-brand)"
                      : done
                        ? "var(--color-text-1)"
                        : "var(--color-text-3)",
                  }}
                >
                  {displayNo}. {name}
                </span>
                {current && (
                  <span
                    style={{
                      background: amberCurrent
                        ? "var(--color-warning-bg)"
                        : "var(--color-brand-subtle)",
                      color: amberCurrent ? "var(--color-warning-fg)" : "var(--color-brand)",
                      fontSize: "var(--fs-10)",
                      fontWeight: 500,
                      padding: "1px 6px",
                      borderRadius: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {loopBadge ? "第2期循环" : "当前"}
                  </span>
                )}
              </div>
              {!current && (
                <span
                  style={{
                    marginTop: 3,
                    fontSize: "var(--fs-11)",
                    color: "var(--color-text-3)",
                  }}
                >
                  {date || "—"}
                </span>
              )}
            </div>
            )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function TaskDetailV5({
  task,
  tab,
  onTab,
  onClose,
  isSales,
  isProvider,
  onReview,
  onConfirmBill,
  onConfirmTask,
  onUploadReport,
  onReuploadReport,
  onPreviewReport,
  reviewerName,
  addToast,
  onNavigate,
}: {
  task: Task
  tab: DetailTab
  onTab: (tab: DetailTab) => void
  onClose: () => void
  isSales: boolean
  isProvider: boolean
  onReview: () => void
  onConfirmBill: () => void
  onConfirmTask?: () => void
  onUploadReport?: () => void
  onReuploadReport?: (report: ReportFile) => void
  onPreviewReport?: (report: ReportFile) => void
  reviewerName?: string
  addToast?: (msg: { type: "success" | "error" | "info" | "warning"; title: string; description?: string }) => void
  onNavigate?: NavigateFn
}) {
  const [allocationWorkGroup, setAllocationWorkGroup] = useState<string | null>(
    null,
  )
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const [selectedBill, setSelectedBill] = useState<string | null>(null)
  const remain = remainingOfTask(task)
  const pendingUploadReports = task.reports.filter(
    (r) => r.status === "待上传",
  ).length
  const pendingReviewReports = task.reports.filter(
    (r) => r.status === "待审核",
  ).length
  const baseSplits = task.workgroupSplits.length
    ? task.workgroupSplits
    : (() => {
        // demo 兜底：按任务计划明细重造新结构拆分（工作组 × 品种 × 地区 × 业务）
        const demoGroups = ["工作组一", "工作组二", "工作组三"]
        return task.serviceItems.map((item, index) => ({
          id: `${task.id}-demo-${index + 1}`,
          workGroup: demoGroups[index % demoGroups.length],
          variety: item.variety,
          region: item.region,
          category: item.category,
          itemName: item.name,
          unitPrice: item.unitPrice,
          qty: item.qty,
          amount: item.amount,
        }))
      })()
  const periods = task.settlementPeriods.length
    ? task.settlementPeriods
    : [
        {
          id: `${task.id}-period-1`,
          name: "2026年8月",
          startDate: task.startDate,
          endDate: task.endDate,
        },
      ]
  // 操作记录 = 任务日志 + 成果验收批次混排（时间倒序；验收条目带级数·部门与驳回明细）
  const acceptancePackages = useAcceptance().packages
  const mergedLogRows = useMemo(() => {
    const ops = task.opsLogs.map((log) => ({
      id: log.id,
      time: log.time,
      operator: log.operator,
      role: log.role,
      action: log.action,
      detail: log.detail,
      acceptance: false,
    }))
    const batches = Object.values(acceptancePackages)
      .filter((p) => p.taskId === task.id)
      .flatMap((p) =>
        p.batches.map((b) => ({
          id: b.id,
          time: b.time,
          operator: b.reviewer,
          role: b.department === "成果验收" ? "成果验收" : `第 ${b.level} 级 · ${b.department}`,
          action: "成果验收",
          detail:
            `通过 ${b.passedCount} 条 / 驳回 ${b.rejectedCount} 条` +
            (b.rejections.length
              ? `；驳回：${b.rejections.map((rj) => `${rj.itemName}（${rj.reason}）`).join("；")}`
              : "") +
            (b.batchComment ? `；批次意见：${b.batchComment}` : ""),
          acceptance: true,
        })),
      )
    return [...ops, ...batches].sort((a, b) => b.time.localeCompare(a.time))
  }, [task.opsLogs, task.id, acceptancePackages])
  const tabs: { id: DetailTab; label: string; badge?: number }[] = [
    { id: "plan", label: "任务计划" },
    { id: "exec", label: "任务拆解" },
    {
      id: "report",
      label: "成果与验收",
      // 服务商关注待上传，药厂关注待验收
      badge: isProvider ? pendingUploadReports : pendingReviewReports,
    },
    { id: "settle", label: "结算周期与结算单" },
    { id: "log", label: "操作记录" },
  ]
  const splitWorkloads = (
    split: typeof baseSplits[number],
  ): PersonalAllocationRow[] => {
    const rows = task.workloadAssigns.filter(
      (row) => row.workGroup === split.workGroup,
    )
    return rows.length
      ? rows.map((row) => ({
          ...row,
          done: row.progress === "已完成" ? row.workload : 0,
        }))
      : [
          {
            id: `${split.id}-work-1`,
            specialist: "李四",
            itemName: "医院拜访",
            category: "市场推广服务",
            workload: 60,
            amount: Math.round(split.amount * 0.4),
            done: 42,
            progress: "未完成",
            completedAt: "2026-08-22 17:40",
          },
          {
            id: `${split.id}-work-2`,
            specialist: "李四",
            itemName: "区域市场分析报告",
            category: "分析报告服务",
            workload: 4,
            amount: Math.round(split.amount * 0.1),
            done: 3,
            progress: "未完成",
            completedAt: "2026-08-23 09:10",
          },
          {
            id: `${split.id}-work-3`,
            specialist: "王晨",
            itemName: "商业拜访",
            category: "市场推广服务",
            workload: 20,
            amount: Math.round(split.amount * 0.25),
            done: 16,
            progress: "未完成",
            completedAt: "2026-08-21 15:20",
          },
          {
            id: `${split.id}-work-4`,
            specialist: "赵敏",
            itemName: "药房拜访",
            category: "市场推广服务",
            workload: 80,
            amount: Math.round(split.amount * 0.25),
            done: 80,
            progress: "已完成",
            completedAt: "2026-08-19 18:00",
          },
        ]
  }
  const allocationSplit =
    baseSplits.find((split) => split.workGroup === allocationWorkGroup) ?? null
  const allocationRows = allocationSplit ? splitWorkloads(allocationSplit) : []
  const threeLevel = chainLevelOfTask(task) === "三级链"
  // 三级链：任务量直挂专员（无工作组层），拆解页签按专员聚合
  const specialistGroups = task.workloadAssigns
    .reduce<{ specialist: string; amount: number; rows: WorkloadAssign[] }[]>(
      (acc, a) => {
        const g = acc.find((x) => x.specialist === a.specialist)
        if (g) {
          g.amount += a.amount
          g.rows.push(a)
        } else
          acc.push({ specialist: a.specialist, amount: a.amount, rows: [a] })
        return acc
      },
      [],
    )
    .map((g) => ({
      ...g,
      varieties: [...new Set(g.rows.map((r) => r.variety))],
      regions: [...new Set(g.rows.map((r) => r.region))],
      done: g.rows.filter((r) => r.progress === "已完成").length,
      review: g.rows.filter((r) => r.progress === "待审核").length,
      todo: g.rows.filter((r) => r.progress === "未完成").length,
    }))
  const execGroups = baseSplits
    .reduce<{
      workGroup: string
      splits: WorkgroupSplit[]
      amount: number
      varieties: string[]
      regions: string[]
    }[]>((acc, s) => {
      const g = acc.find((x) => x.workGroup === s.workGroup)
      if (g) {
        g.splits.push(s)
        g.amount += s.amount
      } else
        acc.push({
          workGroup: s.workGroup,
          splits: [s],
          amount: s.amount,
          varieties: [s.variety],
          regions: [s.region],
        })
      return acc
    }, [])
    .map((g) => ({
      ...g,
      varieties: [...new Set(g.splits.map((s) => s.variety))],
      regions: [...new Set(g.splits.map((s) => s.region))],
    }))
  const displayBills = periods.flatMap((period, index) => {
    const real = task.settlements
      .filter((bill) => bill.settlementPeriodId === period.id)
      .map((bill) => ({
        id: bill.id,
        no: bill.billNo,
        period: period.name,
        amount: bill.finalAmount,
        status: bill.voided ? "已驳回" : bill.confirmed ? "已确认" : "对账中",
        createdAt: bill.madeAt,
        lines: bill.lines,
      }))
    if (real.length) return real
    const states = ["待对账", "对账中", "已确认", "已完成", "已驳回"]
    const status = states[index % states.length]
    const amount = Math.round(task.planAmount / periods.length)
    return [
      {
        id: `${period.id}-demo-bill`,
        no: `JS-2026-${String(index + 1).padStart(3, "0")}`,
        period: period.name,
        amount,
        status,
        createdAt: `2026-08-${String(8 + index * 3).padStart(2, "0")} 14:20`,
        lines: [
          {
            id: `${period.id}-line-1`,
            variety: task.varieties[0] ?? "阿托伐他汀钙片（20mg）",
            region: task.regions[0] ?? "陕西省",
            serviceType: "市场推广服务",
            serviceItem: "医院拜访",
            serviceAmount: Math.round(amount * 0.45),
            actualAmount: Math.round(amount * 0.45),
            remark: "已完成审核",
          },
          {
            id: `${period.id}-line-2`,
            variety: task.varieties[0] ?? "阿托伐他汀钙片（20mg）",
            region: task.regions[0] ?? "陕西省",
            serviceType: "市场推广服务",
            serviceItem: "商业拜访",
            serviceAmount: Math.round(amount * 0.2),
            actualAmount: Math.round(amount * 0.2),
            remark: "—",
          },
          {
            id: `${period.id}-line-3`,
            variety:
              task.varieties[1] ??
              task.varieties[0] ??
              "阿托伐他汀钙片（20mg）",
            region: task.regions[1] ?? task.regions[0] ?? "陕西省",
            serviceType: "分析报告服务",
            serviceItem: "区域市场分析报告",
            serviceAmount: amount - Math.round(amount * 0.65),
            actualAmount: amount - Math.round(amount * 0.65),
            remark: "含附件",
          },
        ],
      },
    ]
  })
  const businessAreas = ([
    { key: "promo", title: "市场推广服务", category: "市场推广服务" },
    {
      key: "analysis",
      title: "调研与报告一体化服务 · 分析报告服务",
      category: "分析报告服务",
    },
  ] as const).map((area) => {
    const items = task.serviceItems.filter(
      (item) => item.category === area.category,
    )
    const grouped = new Map<string, {
      key: string
      name: string
      unit: string
      unitPrice: number
      qty: number
      amount: number
      details: ServiceItem[]
    }>()
    items.forEach((item) => {
      const key = `${item.name}|${item.unitPrice}|${item.unit}`
      const current = grouped.get(key) ?? {
        key,
        name: item.name,
        unit: item.unit,
        unitPrice: item.unitPrice,
        qty: 0,
        amount: 0,
        details: [],
      }
      current.qty += item.qty
      current.amount += item.amount
      current.details.push(item)
      grouped.set(key, current)
    })
    const rows = [...grouped.values()].map((row) => {
      const related = task.workloadAssigns.filter(
        (workload) =>
          workload.category === area.category && workload.itemName === row.name,
      )
      const completed = related
        .filter((workload) => workload.progress === "已完成")
        .reduce((sum, workload) => sum + workload.workload, 0)
      const settled = validBills(task)
        .flatMap((bill) => bill.lines)
        .filter(
          (line) =>
            line.serviceType === area.category && line.serviceItem === row.name,
        )
        .reduce((sum, line) => sum + line.actualAmount, 0)
      return {
        ...row,
        completed,
        settled,
        status:
          completed >= row.qty && row.qty > 0
            ? "已完成"
            : completed > 0
              ? "执行中"
              : "未开始",
      }
    })
    const quantity = rows.reduce((sum, row) => sum + row.qty, 0)
    const completed = rows.reduce((sum, row) => sum + row.completed, 0)
    return {
      ...area,
      rows,
      amount: rows.reduce((sum, row) => sum + row.amount, 0),
      quantity,
      completed,
    }
  })

  return (
    <Modal
      open
      title={allocationSplit ? "个人分配任务明细" : `任务详情 · ${task.taskNo}`}
      onClose={onClose}
      width={1180}
      footer={
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          {onConfirmTask && task.taskStatus === "待确认" && (
            <span
              style={{
                marginRight: "auto",
                fontSize: "var(--fs-12)",
                color: "#667085",
              }}
            >
              确认后任务进入执行中，任务计划与价目表快照将锁定
            </span>
          )}
          {onConfirmTask && task.taskStatus === "待确认" ? (
            <>
              <Button variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button variant="primary" onClick={onConfirmTask}>
                确认任务
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      }
    >
      {allocationSplit ? (
        <PersonalAllocationDetail
          split={allocationSplit}
          task={task}
          rows={allocationRows}
          onBack={() => setAllocationWorkGroup(null)}
        />
      ) : (
        <>
          <TaskLifecycleBar task={task} />
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
                onClick={() => onTab(item.id)}
                style={{
                  position: "relative",
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
                {item.badge ? (
                  <span
                    style={{
                      marginLeft: 5,
                      minWidth: 17,
                      height: 17,
                      lineHeight: "17px",
                      display: "inline-block",
                      borderRadius: 9,
                      background: "#FEECEC",
                      color: "#C73A3A",
                      fontSize: "var(--fs-11)",
                    }}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {tab === "plan" && (
            <>
              <Section title="任务计划">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 10,
                  }}
                >
                  <Info label="任务编号" value={task.taskNo} />
                  <Info
                    label="品种"
                    value={<CompactValue items={task.varieties} />}
                  />
                  <Info label="服务提供方" value={task.provider} />
                  <Info
                    label="服务地区"
                    value={<CompactValue items={task.regions} limit={2} />}
                  />
                  <Info
                    label="推广时间"
                    value={`${task.startDate} ~ ${task.endDate}`}
                  />
                  <Info
                    label="任务状态"
                    value={
                      <DetailStatus
                        label={taskStatusDisplay(task.taskStatus, task.reconStatus).label}
                      />
                    }
                  />
                  <Info
                    label="对账状态"
                    value={
                      <DetailStatus label={reconStatusDisplay(task.reconStatus).label} />
                    }
                  />
                  <Info
                    label="预算金额"
                    value={
                      <strong
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {formatCNY(task.planAmount)}
                      </strong>
                    }
                  />
                  <Info
                    label="已结算金额"
                    value={
                      <strong
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "var(--color-brand)",
                        }}
                      >
                        {formatCNY(task.settledAmount)}
                      </strong>
                    }
                  />
                  <Info
                    label="剩余可结算金额"
                    value={
                      <strong
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          color: remain > 0 ? "#2F6BCE" : "var(--color-brand)",
                        }}
                      >
                        {formatCNY(remain)}
                      </strong>
                    }
                  />
                  <Info
                    label="创建人 / 创建时间"
                    value={`${task.createdBy} · ${task.createdAt}`}
                  />
                  <Info label="金额关系" value="剩余 = 预算 − 已结算" />
                  <Info
                    label="执行链"
                    value={
                      <span>
                        <Tag
                          label={chainLevelOfTask(task)}
                          color={threeLevel ? "info" : "brand"}
                        />{" "}
                        <span
                          style={{ fontSize: "var(--fs-12)", color: "#667085" }}
                        >
                          {chainPathLabel(task.chainSnapshot)}（创建时锁定）
                        </span>
                      </span>
                    }
                  />
                </div>
              </Section>
              <div style={{ height: 12 }} />
              {businessAreas.map((area) => (
                <div key={area.key} style={{ marginTop: 12 }}>
                  <Section
                    title={area.title}
                    subtitle={`分项金额 ${formatCNY(area.amount)}`}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        tableLayout: "fixed",
                      }}
                    >
                      <thead>
                        <tr>
                          {[
                            "服务项目",
                            "标准单价",
                            "计划数量",
                            "计划金额",
                            "已完成数量",
                            "已结算金额",
                          ].map((heading) => (
                            <th
                              key={heading}
                              style={
                                heading.includes("金额") ||
                                heading.includes("数量")
                                  ? { ...th, textAlign: "right" }
                                  : th
                              }
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {area.rows.map((row) => (
                          <tr key={row.key}>
                            <td style={td}>
                              <strong>{row.name}</strong>
                            </td>
                            <td style={td}>
                              {formatCNY(row.unitPrice)}/{row.unit}
                            </td>
                            <td
                              style={{
                                ...td,
                                textAlign: "right",
                                fontFamily: "'JetBrains Mono', monospace",
                              }}
                            >
                              {row.qty}
                            </td>
                            <td
                              style={{
                                ...td,
                                textAlign: "right",
                                fontFamily: "'JetBrains Mono', monospace",
                                fontWeight: 650,
                              }}
                            >
                              {formatCNY(row.amount)}
                            </td>
                            <td
                              style={{
                                ...td,
                                textAlign: "right",
                                fontFamily: "'JetBrains Mono', monospace",
                              }}
                            >
                              {row.completed}
                            </td>
                            <td
                              style={{
                                ...td,
                                textAlign: "right",
                                fontFamily: "'JetBrains Mono', monospace",
                              }}
                            >
                              {formatCNY(row.settled)}
                            </td>
                          </tr>
                        ))}
                        {!area.rows.length && (
                          <tr>
                            <td colSpan={6} style={td}>
                              该服务模式暂无业务明细
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </Section>
                </div>
              ))}
            </>
          )}

          {tab === "exec" &&
            (threeLevel ? (
              <Section
                title="任务分配"
                subtitle="三级链任务：工作量由服务提供商直接分配给服务专员（不经工作组，不适用工作组组长承接规则）"
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["服务专员", "品种", "地区", "金额合计", "执行进度"].map(
                        (heading) => (
                          <th
                            key={heading}
                            style={
                              heading.includes("金额")
                                ? { ...th, textAlign: "right" }
                                : th
                            }
                          >
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {specialistGroups.map((g) => (
                      <tr key={g.specialist}>
                        <td style={td}>
                          <strong>{g.specialist}</strong>
                          <div
                            style={{
                              fontSize: "var(--fs-11)",
                              color: "#98A2B3",
                              marginTop: 2,
                            }}
                          >
                            {g.rows.length} 条任务量
                          </div>
                        </td>
                        <td style={td}>
                          <CompactValue items={g.varieties} />
                        </td>
                        <td style={td}>
                          <CompactValue items={g.regions} />
                        </td>
                        <td
                          style={{
                            ...td,
                            textAlign: "right",
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: 650,
                          }}
                        >
                          {formatCNY(g.amount)}
                        </td>
                        <td style={td}>
                          <Tag
                            label={`已完成 ${g.done} / 待审核 ${g.review} / 未完成 ${g.todo}`}
                            color={
                              g.done === g.rows.length
                                ? "success"
                                : g.review > 0
                                  ? "warning"
                                  : "default"
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    {!specialistGroups.length && (
                      <tr>
                        <td colSpan={5} style={td}>
                          尚未分配任务量
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Section>
            ) : (
              <Section title="任务拆解" subtitle="按工作组聚合展示拆解记录">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["工作组", "品种", "地区", "金额合计", "操作"].map(
                        (heading) => (
                          <th
                            key={heading}
                            style={
                              heading.includes("金额")
                                ? { ...th, textAlign: "right" }
                                : th
                            }
                          >
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {execGroups.map((group) => {
                      return (
                        <Fragment key={group.workGroup}>
                          <tr>
                            <td style={td}>
                              <strong>{group.workGroup}</strong>
                              <div
                                style={{
                                  fontSize: "var(--fs-11)",
                                  color: "#98A2B3",
                                  marginTop: 2,
                                }}
                              >
                                {group.splits.length} 条业务明细
                              </div>
                            </td>
                            <td style={td}>
                              <CompactValue items={group.varieties} />
                            </td>
                            <td style={td}>
                              <CompactValue items={group.regions} />
                            </td>
                            <td
                              style={{
                                ...td,
                                textAlign: "right",
                                fontFamily: "'JetBrains Mono', monospace",
                                fontWeight: 650,
                              }}
                            >
                              {formatCNY(group.amount)}
                            </td>
                            <td style={td}>
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 6,
                                }}
                              >
                                <Button
                                  variant="soft"
                                  size="sm"
                                  onClick={() =>
                                    setAllocationWorkGroup(group.workGroup)
                                  }
                                >
                                  个人分配任务明细
                                </Button>
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      )
                    })}
                    {!execGroups.length && (
                      <tr>
                        <td colSpan={5} style={td}>
                          尚未拆分任务包
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Section>
            ))}

          {tab === "report" && (
            <AcceptanceTab
              task={task}
              isSales={isSales}
              isProvider={isProvider}
              reviewerName={reviewerName ?? "—"}
              navigate={onNavigate}
              addToast={addToast ?? (() => {})}
              onPreviewReport={onPreviewReport}
              onUploadReport={
                isProvider && task.taskStatus === "执行中" ? onUploadReport : undefined
              }
              onGoSettle={() => onTab("settle")}
            />
          )}

          {tab === "settle" && (
            <Section
              title="结算周期与结算单"
              subtitle="点击结算周期，在当前页面查看该周期对应结算单"
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {[
                      "结算周期",
                      "周期状态",
                      "应结算金额",
                      "已结算金额",
                      "待结算金额",
                      "对账状态",
                      "结算单数量",
                      "操作",
                    ].map((heading) => (
                      <th
                        key={heading}
                        style={
                          heading.includes("金额")
                            ? { ...th, textAlign: "right" }
                            : th
                        }
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period, index) => {
                    const bills = displayBills.filter(
                      (bill) => bill.period === period.name,
                    )
                    const due = Math.round(task.planAmount / periods.length)
                    const settled = bills
                      .filter((bill) => ["已确认", "已完成"].includes(bill.status))
                      .reduce((sum, bill) => sum + bill.amount, 0)
                    const active = selectedPeriod === period.id
                    const chosen = bills.find(
                      (bill) => bill.id === selectedBill,
                    )
                    return (
                      <Fragment key={period.id}>
                        <tr>
                          <td style={td}>
                            {period.name}
                            <div
                              style={{
                                fontSize: "var(--fs-11)",
                                color: "#98A2B3",
                                marginTop: 2,
                              }}
                            >
                              {period.startDate} ~ {period.endDate}
                            </div>
                          </td>
                          <td style={td}>
                            <DetailStatus
                              label={
                                settled >= due
                                  ? "已完成"
                                  : index === 0
                                    ? "对账中"
                                    : "待对账"
                              }
                            />
                          </td>
                          <td
                            style={{
                              ...td,
                              textAlign: "right",
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            {formatCNY(due)}
                          </td>
                          <td
                            style={{
                              ...td,
                              textAlign: "right",
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            {formatCNY(Math.min(due, settled))}
                          </td>
                          <td
                            style={{
                              ...td,
                              textAlign: "right",
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            {formatCNY(Math.max(0, due - settled))}
                          </td>
                          <td style={td}>
                            <DetailStatus
                              label={
                                index === 0
                                  ? "对账中"
                                  : settled
                                    ? "已对账"
                                    : "待对账"
                              }
                            />
                          </td>
                          <td style={td}>{bills.length}</td>
                          <td style={td}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedPeriod(active ? null : period.id)
                                if (active) setSelectedBill(null)
                              }}
                            >
                              {active ? "收起结算单" : "查看结算单"}
                            </Button>
                          </td>
                        </tr>
                        {active && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0 }}>
                              <div
                                style={{
                                  padding: "12px 16px 16px",
                                  background: "#F8FAFC",
                                  borderTop: "1px solid var(--color-border)",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "var(--fs-12)",
                                    color: "#667085",
                                    marginBottom: 8,
                                  }}
                                >
                                  当前查看：{period.name} 下的结算单
                                </div>
                                <table
                                  style={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                    background: "#fff",
                                  }}
                                >
                                    <thead>
                                      <tr>
                                        {[
                                          "结算单编号",
                                          "服务提供方",
                                          "结算金额",
                                          "对账状态",
                                          "创建时间",
                                          "操作",
                                        ].map((heading) => (
                                        <th
                                          key={heading}
                                          style={
                                            heading.includes("金额")
                                              ? { ...th, textAlign: "right" }
                                              : th
                                          }
                                        >
                                          {heading}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {bills.map((bill) => (
                                      <tr
                                        key={bill.id}
                                        style={{
                                          background:
                                            selectedBill === bill.id
                                              ? "#F0F9F7"
                                              : undefined,
                                        }}
                                      >
                                        <td style={td}>
                                          <strong>{bill.no}</strong>
                                        </td>
                                        <td style={td}>{task.provider}</td>
                                        <td
                                          style={{
                                            ...td,
                                            textAlign: "right",
                                            fontFamily:
                                              "'JetBrains Mono', monospace",
                                            fontWeight: 650,
                                          }}
                                        >
                                          {formatCNY(bill.amount)}
                                        </td>
                                        <td style={td}>
                                          <DetailStatus label={bill.status} />
                                        </td>
                                        <td style={td}>{bill.createdAt}</td>
                                        <td style={td}>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              setSelectedBill(
                                                selectedBill === bill.id
                                                  ? null
                                                  : bill.id,
                                              )
                                            }
                                          >
                                            {selectedBill === bill.id
                                              ? "收起单据"
                                              : "查看单据"}
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {chosen && (
                                  <SettlementReceipt
                                    task={task}
                                    bill={chosen}
                                    isSales={isSales}
                                    onConfirm={onConfirmBill}
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </Section>
          )}

          {tab === "log" && (
            <Section title="操作记录" subtitle="任务操作日志与成果验收批次混排，按时间倒序">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["时间", "操作人", "角色", "动作", "说明"].map(
                      (heading) => (
                        <th key={heading} style={th}>
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {mergedLogRows.map((row) =>
                    row.acceptance ? (
                      <tr key={row.id} style={{ background: "#F7FBF9" }}>
                        <td style={{ ...td, whiteSpace: "nowrap", borderLeft: "3px solid var(--color-brand)" }}>{row.time}</td>
                        <td style={td}>{row.operator}</td>
                        <td style={td}>{row.role}</td>
                        <td style={td}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Tag label="验收" color="brand" />
                            {row.action}
                          </span>
                        </td>
                        <td style={{ ...td, color: "#374151" }}>{row.detail}</td>
                      </tr>
                    ) : (
                      <tr key={row.id}>
                        <td style={td}>{row.time}</td>
                        <td style={td}>{row.operator}</td>
                        <td style={td}>{row.role}</td>
                        <td style={td}>{row.action}</td>
                        <td style={td}>{row.detail}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </Section>
          )}
        </>
      )}
    </Modal>
  )
}

function PersonalAllocationDetail({
  split,
  task,
  rows,
  onBack,
}: {
  split: WorkgroupSplit
  task: Task
  rows: PersonalAllocationRow[]
  onBack: () => void
}) {
  const [detailRow, setDetailRow] = useState<PersonalAllocationRow | null>(null)
  const cells = useMemo(() => {
    const order: string[] = []
    const bySpecialist = new Map<string, PersonalAllocationRow[]>()
    rows.forEach((row) => {
      if (!bySpecialist.has(row.specialist)) {
        bySpecialist.set(row.specialist, [])
        order.push(row.specialist)
      }
      bySpecialist.get(row.specialist)!.push(row)
    })
    return order.flatMap((specialist) => {
      const list = bySpecialist.get(specialist)!
      return list.map((row, i) => {
        const prev = list[i - 1]
        const showSpecialist = i === 0
        const showCategory = !prev || prev.category !== row.category
        let categorySpan = 0
        if (showCategory) {
          categorySpan = 1
          for (
            let j = i + 1;
            j < list.length && list[j].category === row.category;
            j += 1
          )
            categorySpan += 1
        }
        return {
          row,
          showSpecialist,
          specialistSpan: list.length,
          showCategory,
          categorySpan,
          groupStart: showSpecialist,
        }
      })
    })
  }, [rows])

  if (detailRow)
    return (
      <AllocationDetailPreview
        row={detailRow}
        workGroup={split.workGroup}
        onBack={() => setDetailRow(null)}
      />
    )

  const mergedTd: React.CSSProperties = {
    ...td,
    verticalAlign: "middle",
    fontWeight: 600,
    color: "var(--color-brand)",
  }
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← 返回任务详情
        </Button>
        <span style={{ color: "#98A2B3", fontSize: "var(--fs-12)" }}>
          任务拆解 / {split.workGroup} · 个人分配任务明细
        </span>
      </div>
      <Section
        title="个人分配任务明细"
        subtitle={`${rows.length} 条业务明细 · ${new Set(rows.map((row) => row.specialist)).size} 位服务专员`}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "服务专员",
                "服务类型",
                "服务项目",
                "计划量",
                "已完成",
                "待完成",
                "金额",
                "执行状态",
                "完成时间",
                "操作",
              ].map((heading) => (
                <th
                  key={heading}
                  style={
                    heading === "金额" ? { ...th, textAlign: "right" } : th
                  }
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map(
              ({
                row,
                showSpecialist,
                specialistSpan,
                showCategory,
                categorySpan,
                groupStart,
              }) => {
                const completed =
                  row.done ?? (row.progress === "已完成" ? row.workload : 0)
                const amount = row.amount ?? 0
                const completedAt =
                  row.completedAt ??
                  (row.progress === "已完成"
                    ? `${task.startDate.slice(0, 7)}-25 18:00`
                    : "—")
                const groupEdge = groupStart
                  ? { borderTop: "2px solid var(--color-border)" }
                  : {}
                return (
                  <tr key={row.id}>
                    {showSpecialist && (
                      <td
                        rowSpan={specialistSpan}
                        style={{
                          ...mergedTd,
                          ...groupEdge,
                          background: "#F5FAF8",
                        }}
                      >
                        <strong>{row.specialist}</strong>
                        <div
                          style={{
                            color: "#98A2B3",
                            fontSize: "var(--fs-11)",
                            fontWeight: 400,
                            marginTop: 2,
                          }}
                        >
                          {specialistSpan} 条业务
                        </div>
                      </td>
                    )}
                    {showCategory && (
                      <td
                        rowSpan={categorySpan}
                        style={{ ...td, verticalAlign: "middle", ...groupEdge }}
                      >
                        {row.category ?? "市场推广服务"}
                      </td>
                    )}
                    <td style={{ ...td, ...groupEdge }}>{row.itemName}</td>
                    <td style={{ ...td, ...groupEdge }}>{row.workload}</td>
                    <td style={{ ...td, ...groupEdge }}>{completed}</td>
                    <td style={{ ...td, ...groupEdge }}>
                      {Math.max(0, row.workload - completed)}
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: "right",
                        fontFamily: "'JetBrains Mono', monospace",
                        ...groupEdge,
                      }}
                    >
                      {formatCNY(amount)}
                    </td>
                    <td style={{ ...td, ...groupEdge }}>
                      <DetailStatus
                        label={row.progress === "已完成" ? "已完成" : "执行中"}
                      />
                    </td>
                    <td style={{ ...td, ...groupEdge }}>{completedAt}</td>
                    <td style={{ ...td, ...groupEdge }}>
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() => setDetailRow(row)}
                      >
                        查看详情
                      </Button>
                    </td>
                  </tr>
                )
              },
            )}
          </tbody>
        </table>
      </Section>
    </>
  )
}

function AllocationDetailPreview({
  row,
  workGroup,
  onBack,
}: {
  row: PersonalAllocationRow
  workGroup: string
  onBack: () => void
}) {
  const completed = row.done ?? (row.progress === "已完成" ? row.workload : 0)
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        <Button variant="outline" size="sm" onClick={onBack}>
          ← 返回个人分配明细
        </Button>
        <span style={{ color: "#98A2B3", fontSize: "var(--fs-12)" }}>
          任务拆解 / {workGroup} · 个人分配任务明细 / 明细详情
        </span>
      </div>
      <Section
        title="明细详情"
        subtitle={`${row.specialist} · ${row.category ?? "市场推广服务"} · ${row.itemName}`}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          <Info label="服务专员" value={row.specialist} />
          <Info label="服务类型" value={row.category ?? "市场推广服务"} />
          <Info label="服务项目" value={row.itemName} />
          <Info label="计划量" value={row.workload} />
          <Info
            label="已完成 / 待完成"
            value={`${completed} / ${Math.max(0, row.workload - completed)}`}
          />
          <Info
            label="金额"
            value={
              <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {formatCNY(row.amount ?? 0)}
              </strong>
            }
          />
          <Info
            label="执行状态"
            value={
              <DetailStatus
                label={row.progress === "已完成" ? "已完成" : "执行中"}
              />
            }
          />
          <Info label="完成时间" value={row.completedAt ?? "—"} />
        </div>
        <div
          style={{
            marginTop: 16,
            border: "1px dashed #B9CFC9",
            background: "#F5FAF8",
            borderRadius: 10,
            padding: "26px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              margin: "0 auto 12px",
              borderRadius: "50%",
              background: "var(--color-brand-subtle)",
              color: "var(--color-brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Wrench size={20} />
          </div>
          <div
            style={{
              fontSize: "var(--fs-15)",
              fontWeight: 650,
              color: "var(--color-text-1)",
            }}
          >
            逐条执行明细正在建设中
          </div>
          <div
            style={{
              fontSize: "var(--fs-13)",
              color: "#667085",
              marginTop: 6,
              lineHeight: 1.7,
            }}
          >
            该服务项目下的拜访签到、定位轨迹、报告附件与审核轨迹将在下一迭代开放。
          </div>
          <div
            style={{
              display: "inline-flex",
              gap: 8,
              marginTop: 14,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {["拜访签到记录", "定位轨迹核验", "报告附件清单", "审核轨迹"].map(
              (item) => (
                <Tag key={item} label={item} color="brand" />
              ),
            )}
          </div>
        </div>
      </Section>
    </>
  )
}

function SettlementReceipt({
  task,
  bill,
  isSales,
  onConfirm,
}: {
  task: Task
  bill: {
    id: string
    no: string
    period: string
    amount: number
    status: string
    createdAt: string
    lines: SettlementLine[]
  }
  isSales: boolean
  onConfirm: () => void
}) {
  const groupedLines = [
    ...bill.lines
      .reduce((groups, line) => {
        const current = groups.get(line.serviceType) ?? []
        current.push(line)
        groups.set(line.serviceType, current)
        return groups
      }, new Map<string, SettlementLine[]>())
      .entries(),
  ]
  const actual = bill.lines.reduce((sum, line) => sum + line.actualAmount, 0)
  return (
    <div
      style={{
        marginTop: 14,
        border: "1px solid #D7E2F0",
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "11px 16px",
          background: "#3384C8",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <strong>结算单详情</strong>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {bill.no}
          <DetailStatus label={bill.status} />
        </span>
      </div>
      <div style={{ padding: 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1,
            background: "#BFE6E8",
            borderRadius: 6,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          {[
            ["结算单编号", bill.no],
            ["服务品种", task.varieties.join("、")],
            ["推广时段", `${task.startDate} ~ ${task.endDate}`],
            ["制单日", bill.createdAt],
            ["服务委托方", task.holderPharma],
            ["服务提供方", task.provider],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "grid",
                gridTemplateColumns: "92px 1fr",
                padding: "9px 12px",
                background: "#E1F7F7",
                fontSize: "var(--fs-13)",
              }}
            >
              <span style={{ color: "#344054" }}>{label}：</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "序号",
                "服务类型",
                "服务项目",
                "服务金额",
                "实际结算金额",
                "备注",
              ].map((heading) => (
                <th
                  key={heading}
                  style={
                    heading.includes("金额")
                      ? { ...th, textAlign: "right" }
                      : th
                  }
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedLines.flatMap(([type, lines]) =>
              lines.map((line, index) => (
                <tr key={line.id}>
                  <td style={td}>
                    {index === 0
                      ? bill.lines.indexOf(line) + 1
                      : bill.lines.indexOf(line) + 1}
                  </td>
                  <td style={td}>{index === 0 ? type : ""}</td>
                  <td style={td}>
                    {line.serviceItem}
                    <div
                      style={{
                        color: "#98A2B3",
                        fontSize: "var(--fs-11)",
                        marginTop: 2,
                      }}
                    >
                      {line.variety} · {line.region}
                    </div>
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: "right",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {formatCNY(line.serviceAmount)}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: "right",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 650,
                    }}
                  >
                    {formatCNY(line.actualAmount)}
                  </td>
                  <td style={td}>{line.remark || "—"}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #D7E2F0",
            marginTop: 26,
            padding: "18px 28px",
          }}
        >
          <strong>最终结算金额（大写）：{formatCNYUpper(actual)}</strong>
          <strong
            style={{
              fontSize: "var(--fs-18)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {formatCNY(actual)}
          </strong>
        </div>
        <div
          style={{
            background: "#F7F8FA",
            padding: "10px 12px",
            color: "#475467",
            fontSize: "var(--fs-12)",
            lineHeight: 1.7,
          }}
        >
          <strong>声明：</strong>
          {SETTLEMENT_DECLARATION_TEXT}
        </div>
        {isSales && ["待对账", "对账中"].includes(bill.status) && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 12,
            }}
          >
            <Button variant="primary" onClick={onConfirm}>
              确认结算单
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

type GroupDraft = {
  workGroup: string
  varieties: string[]
  regions: string[]
  qty: Record<string, number>
  /** 组总金额输入值（用于反推次数） */ target?: string
  /** 折算说明（灰色小字提示） */ note?: string
}

function daysOfPeriod(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00`).getTime()
  const e = new Date(`${end}T00:00:00`).getTime()
  const d = Math.round((e - s) / 86400000) + 1
  return Number.isFinite(d) && d > 0 ? d : 1
}

/** 日均速率整量化：≥1 向上取整为「N 单位/天」；<1 表述为「每 N 日 1 单位」，不出现小数 */
function fmtRate(n: number, unit: string, suffix = "/天"): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  if (n >= 1) return `${Math.ceil(n)} ${unit}${suffix}`
  return `每 ${Math.ceil(1 / n)} 日 1 ${unit}`
}

/** 人力数：保留 1 位小数，整数不带小数；不足 0.1 人按「＜0.1 人」显示 */
function fmtPersons(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  const r = Math.round(n * 10) / 10
  if (r === 0) return "＜0.1 人"
  return Number.isInteger(r) ? `${r} 人` : `${r.toFixed(1)} 人`
}

/** 工作量测算：把分配的业务次数按推广时段折算成「需要多少名专员」，与组内实际人数对比给出人力饱和度（专员形态按单人测算） */
function WorkloadForecast({
  task,
  group,
  days,
  memberCount,
  memberText,
}: {
  task: Task
  group: GroupDraft
  days: number
  memberCount?: number
  memberText?: string
}) {
  const members = memberCount ?? workGroupMembers[group.workGroup] ?? 0
  const rows = task.serviceItems
    .filter(
      (i) =>
        group.varieties.includes(i.variety) && group.regions.includes(i.region),
    )
    .filter((i) => (Number(group.qty[i.id]) || 0) > 0)
    .map((i) => {
      const qty = Number(group.qty[i.id]) || 0
      const daily = qty / days
      const base = SERVICE_DAILY_CAPACITY[i.name]
      const need = base ? daily / base : null
      return { item: i, qty, daily, base, need }
    })
  if (rows.length === 0) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: "10px 12px",
          borderRadius: 6,
          background: "#F9FAFB",
          fontSize: "var(--fs-12)",
          color: "#98A2B3",
        }}
      >
        分配业务次数后显示工作量测算。
      </div>
    )
  }
  const needTotal = rows.reduce((s, r) => s + (r.need ?? 0), 0)
  const missingBase = rows.some((r) => !r.base)
  const saturation = members > 0 ? needTotal / members : 0
  const pct = Math.round(saturation * 100)
  const level = saturation >= 1 ? "over" : saturation >= 0.6 ? "ok" : "low"
  const levelMeta = {
    over: { color: "#C73A3A", bg: "#FEECEC" },
    ok: { color: "#1F7A4D", bg: "#EDF9F3" },
    low: { color: "#B45309", bg: "#FEF6E7" },
  }[level]
  return (
    <div
      style={{
        marginTop: 10,
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "9px 12px",
          background: "#F9FAFB",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          fontSize: "var(--fs-12)",
          color: "#475467",
        }}
      >
        <strong style={{ color: "var(--color-text-1)" }}>工作量测算</strong>
        <span>
          推广时段 {days} 天（按整段自然日折算） ·{" "}
          {memberText ?? `${group.workGroup} ${members} 名专员`}
        </span>
      </div>
      <div style={{ padding: "10px 12px", background: levelMeta.bg }}>
        <span
          style={{
            fontSize: "var(--fs-14)",
            fontWeight: 700,
            color: levelMeta.color,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          约需 {fmtPersons(needTotal)} · 人力饱和度 {pct}%
          {missingBase ? "（部分业务未配置基准，未计入）" : ""}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {[
              "服务项目",
              "分配次数",
              "每天需完成",
              "需要人力",
              "单人日基准",
            ].map((h) => (
              <th key={h} style={{ ...th, borderBottom: "1px solid #F3F4F6" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item.id}>
              <td style={{ ...td, padding: "8px 12px" }}>
                {r.item.name}
                <span
                  style={{
                    color: "#98A2B3",
                    marginLeft: 6,
                    fontSize: "var(--fs-11)",
                  }}
                >
                  {r.item.variety} · {r.item.region}
                </span>
              </td>
              <td
                style={{
                  ...td,
                  padding: "8px 12px",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {r.qty} {r.item.unit}
              </td>
              <td
                style={{
                  ...td,
                  padding: "8px 12px",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {fmtRate(r.daily, r.item.unit)}
              </td>
              <td
                style={{
                  ...td,
                  padding: "8px 12px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 650,
                }}
              >
                {r.need == null ? "未配置基准" : fmtPersons(r.need)}
              </td>
              <td style={{ ...td, padding: "8px 12px", color: "#667085" }}>
                {r.base ? fmtRate(r.base, r.item.unit, "/日") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SplitModal({
  task,
  mode = "group",
  targets,
  blockedTargets,
  onClose,
  onSave,
  addToast,
  /** group = 四级链按工作组拆分；specialist = 三级链直接分配服务专员 */
  /** 拆包强约束：仅列出的已授权对象可选；blockedTargets = 组长无效的工作组（禁选） */
}: {
  task: Task | null
  mode?: "group" | "specialist"
  targets: string[]
  /** 目标名 → 禁止下派原因（工作组无有效组长时不得接收新的管理任务） */
  blockedTargets?: Record<string, string>
  onClose: () => void
  onSave: (rows: Omit<WorkgroupSplit, "id">[]) => void
  addToast: (msg: Omit<ToastMessage, "id">) => void
}) {
  const isSpecialist = mode === "specialist"
  const targetWord = isSpecialist ? "服务专员" : "工作组"
  const [groups, setGroups] = useState<GroupDraft[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  useEffect(() => {
    if (!task) {
      setGroups([])
      setActive(null)
      return
    }
    const byGroup = new Map<string, GroupDraft>()
    task.workgroupSplits.forEach((s) => {
      const g = byGroup.get(s.workGroup) ?? {
        workGroup: s.workGroup,
        varieties: [],
        regions: [],
        qty: {},
      }
      if (!g.varieties.includes(s.variety)) g.varieties.push(s.variety)
      if (!g.regions.includes(s.region)) g.regions.push(s.region)
      const plan = task.serviceItems.find(
        (i) =>
          i.variety === s.variety &&
          i.region === s.region &&
          i.name === s.itemName &&
          i.unitPrice === s.unitPrice,
      )
      if (plan) g.qty[plan.id] = (Number(g.qty[plan.id]) || 0) + s.qty
      byGroup.set(s.workGroup, g)
    })
    setGroups([...byGroup.values()])
    setActive(null)
  }, [task])
  if (!task) return null

  const planOf = (id: string) => task.serviceItems.find((i) => i.id === id)
  const groupAmount = (g: GroupDraft) =>
    Object.entries(g.qty).reduce((sum, [id, q]) => {
      const p = planOf(id)
      return sum + (p ? p.unitPrice * (Number(q) || 0) : 0)
    }, 0)
  const total = groups.reduce((s, g) => s + groupAmount(g), 0)
  const remain = task.planAmount - total
  const days = daysOfPeriod(task.startDate, task.endDate)
  const othersQty = (list: GroupDraft[], planId: string, self: string) =>
    list.reduce(
      (s, g) => (g.workGroup === self ? s : s + (Number(g.qty[planId]) || 0)),
      0,
    )
  const usedByOthers = (id: string, self: string) => othersQty(groups, id, self)
  /** 本组可分配区间：下限 = 可用业务最低单价；上限 = min(剩余次数容量金额, 计划总金额 − 其他组已拆金额) */
  const boundsOf = (g: GroupDraft) => {
    const caps = task.serviceItems
      .filter(
        (it) =>
          g.varieties.includes(it.variety) && g.regions.includes(it.region),
      )
      .map((it) => ({
        price: it.unitPrice,
        cap: it.qty - othersQty(groups, it.id, g.workGroup),
      }))
      .filter((x) => x.cap > 0)
    if (caps.length === 0) return { min: 0, max: 0, hasCapacity: false }
    const othersTotal = groups
      .filter((x) => x.workGroup !== g.workGroup)
      .reduce((s, x) => s + groupAmount(x), 0)
    const min = Math.min(...caps.map((x) => x.price))
    const max = Math.max(
      min,
      Math.min(
        caps.reduce((s, x) => s + x.cap * x.price, 0),
        Math.max(0, task.planAmount - othersTotal),
      ),
    )
    return { min, max, hasCapacity: true }
  }

  const activeGroup =
    groups.find((g) => g.workGroup === active) ?? groups[0] ?? null
  const gi = activeGroup ? groups.indexOf(activeGroup) : -1
  const unassigned = groups
    .filter((g) => groupAmount(g) <= 0)
    .map((g) => g.workGroup)
  const filteredGroups = targets.filter((wg) => wg.includes(search.trim()))

  const toggleGroup = (wg: string) =>
    setGroups((prev) =>
      prev.some((g) => g.workGroup === wg)
        ? prev.filter((g) => g.workGroup !== wg)
        : [
            ...prev,
            {
              workGroup: wg,
              varieties: [...task.varieties],
              regions: [...task.regions],
              qty: {},
            },
          ],
    )
  const patchDims = (idx: number, part: Partial<GroupDraft>) =>
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== idx) return g
        const next = { ...g, ...part }
        const qty = Object.fromEntries(
          Object.entries(next.qty).filter(([id]) => {
            const p = planOf(id)
            return (
              p &&
              next.varieties.includes(p.variety) &&
              next.regions.includes(p.region)
            )
          }),
        )
        return { ...next, qty, target: "", note: "" }
      }),
    )
  const setQty = (idx: number, planId: string, value: number) =>
    setGroups((prev) =>
      prev.map((g, i) =>
        i === idx
          ? {
              ...g,
              qty: { ...g.qty, [planId]: Math.max(0, Math.floor(value || 0)) },
              target: "",
              note: "",
            }
          : g,
      ),
    )
  /** 输入组总金额：先钳制到可分配区间，再按各业务计划金额占比反推次数（取整）；调整行为用小字说明，不再静默 */
  const applyGroupAmount = (idx: number, input: number) =>
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== idx) return g
        const caps = task.serviceItems
          .filter(
            (it) =>
              g.varieties.includes(it.variety) && g.regions.includes(it.region),
          )
          .map((it) => ({
            it,
            cap: it.qty - othersQty(prev, it.id, g.workGroup),
          }))
          .filter((x) => x.cap > 0)
        if (caps.length === 0)
          return {
            ...g,
            qty: {},
            target: "",
            note: "本组范围内各业务剩余次数已被其他组占满",
          }
        const amountOf = (list: GroupDraft[]) =>
          list.reduce(
            (s, x) =>
              s +
              Object.entries(x.qty).reduce((sum, [id, q]) => {
                const p = planOf(id)
                return sum + (p ? p.unitPrice * (Number(q) || 0) : 0)
              }, 0),
            0,
          )
        const min = Math.min(...caps.map((x) => x.it.unitPrice))
        const othersTotal = amountOf(
          prev.filter((x) => x.workGroup !== g.workGroup),
        )
        const max = Math.max(
          min,
          Math.min(
            caps.reduce((s, x) => s + x.cap * x.it.unitPrice, 0),
            Math.max(0, task.planAmount - othersTotal),
          ),
        )
        const notes: string[] = []
        let target = input
        if (input < min) {
          notes.push(
            `￥${input.toLocaleString()} 不足以分配任何业务（最低单价 ${formatCNY(min)}），已按 ${formatCNY(min)} 折算`,
          )
          target = min
        } else if (input > max) {
          notes.push(`最多还可分配 ${formatCNY(max)}，已按上限折算`)
          target = max
        }
        const planSum = caps.reduce((s, x) => s + x.it.amount, 0)
        const qty: Record<string, number> = {}
        let rest = target
        const fracs: { id: string; frac: number; cap: number; price: number }[] =
          []
        caps.forEach(({ it, cap }) => {
          const share =
            planSum > 0 ? (target * it.amount) / planSum : target / caps.length
          const raw = share / it.unitPrice
          const q = Math.min(cap, Math.floor(raw))
          if (q > 0) {
            qty[it.id] = q
            rest -= q * it.unitPrice
          }
          fracs.push({
            id: it.id,
            frac: raw - Math.floor(raw),
            cap,
            price: it.unitPrice,
          })
        })
        fracs.sort((a, b) => b.frac - a.frac)
        fracs.forEach((f) => {
          const cur = qty[f.id] ?? 0
          if (rest >= f.price && cur < f.cap) {
            qty[f.id] = cur + 1
            rest -= f.price
          }
        })
        const actual = Object.entries(qty).reduce((s, [id, q]) => {
          const p = planOf(id)
          return s + (p ? p.unitPrice * (Number(q) || 0) : 0)
        }, 0)
        if (actual !== target) {
          notes.push(
            `输入 ${formatCNY(target)}，次数须为整数，已按 ${formatCNY(actual)} 折算（${
              actual < target ? "少" : "多"
            } ${formatCNY(Math.abs(target - actual))}）`,
          )
        }
        // 输入框始终归位为系统实际采用的金额，保证输入值与分配合计一致
        return { ...g, qty, target: String(actual), note: notes.join("；") }
      }),
    )
  const flatten = (): Omit<WorkgroupSplit, "id">[] =>
    groups.flatMap((g) =>
      Object.entries(g.qty)
        .map(([id, q]) => ({ plan: planOf(id), qty: Number(q) || 0 }))
        .filter(
          (x): x is { plan: ServiceItem; qty: number } => !!x.plan && x.qty > 0,
        )
        .map((x) => ({
          workGroup: g.workGroup,
          variety: x.plan.variety,
          region: x.plan.region,
          category: x.plan.category,
          itemName: x.plan.name,
          unitPrice: x.plan.unitPrice,
          qty: x.qty,
          amount: x.plan.unitPrice * x.qty,
        })),
    )

  return (
    <Modal
      open={!!task}
      title={isSpecialist ? "分配任务量给服务专员" : "拆分任务包到工作组"}
      onClose={onClose}
      width={1240}
      footer={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 18,
              fontSize: "var(--fs-12)",
              color: "#667085",
              flexWrap: "wrap",
            }}
          >
            <span>
              总拆分金额{" "}
              <strong
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "var(--fs-14)",
                }}
              >
                {formatCNY(total)}
              </strong>
            </span>
            <span>
              计划总金额{" "}
              <strong
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "var(--fs-14)",
                }}
              >
                {formatCNY(task.planAmount)}
              </strong>
            </span>
            <span>
              剩余可拆金额{" "}
              <strong
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "var(--fs-14)",
                  color: remain < 0 ? "#C73A3A" : "var(--color-brand)",
                }}
              >
                {formatCNY(remain)}
              </strong>
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (groups.length === 0) {
                  addToast({
                    type: "warning",
                    title: `请先选择${targetWord}`,
                    description: `在左侧勾选需要承接任务量的${targetWord}`,
                  })
                  return
                }
                if (unassigned.length > 0) {
                  addToast({
                    type: "error",
                    title: `存在未分配的${targetWord}`,
                    description: `请为「${unassigned.join("、")}」分配业务次数，或取消勾选`,
                  })
                  return
                }
                const blockedSelected = groups
                  .map((x) => x.workGroup)
                  .filter((name) => blockedTargets?.[name])
                if (blockedSelected.length > 0) {
                  addToast({
                    type: "error",
                    title: "存在未配置有效组长的工作组",
                    description: `「${blockedSelected.join("、")}」尚未配置有效组长，不能下派新的管理任务；请先在「工作组管理」指定组长`,
                  })
                  return
                }
                onSave(flatten())
              }}
            >
              保存
            </Button>
          </div>
        </div>
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "12px 16px",
          borderRadius: 8,
          marginBottom: 14,
          border: `1px solid ${remain < 0 ? "#FECACA" : "var(--color-border)"}`,
          background: remain < 0 ? "#FEECEC" : "var(--color-brand-subtle)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "var(--fs-12)",
              color: remain < 0 ? "#C73A3A" : "#667085",
            }}
          >
            剩余可拆金额
          </div>
          <div
            style={{
              fontSize: "var(--fs-18)",
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              color: remain < 0 ? "#C73A3A" : "var(--color-brand)",
            }}
          >
            {formatCNY(remain)}
          </div>
        </div>
        <div
          style={{
            fontSize: "var(--fs-12)",
            color: "#667085",
            lineHeight: 1.9,
            textAlign: "right",
          }}
        >
          <div>
            计划总金额 {formatCNY(task.planAmount)} · 已拆分 {formatCNY(total)}
            {remain < 0 ? " · 已超出计划总金额，请下调次数" : ""}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
        <div
          style={{
            width: 272,
            flexShrink: 0,
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            maxHeight: 480,
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                fontSize: "var(--fs-13)",
                fontWeight: 650,
                marginBottom: 8,
              }}
            >
              选择{targetWord}（可多选）
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`搜索${targetWord}`}
              style={{ ...inputStyle, height: 30 }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 8,
                fontSize: "var(--fs-12)",
                color: "#667085",
              }}
            >
              <span>
                已选 {groups.length} / {targets.length}
              </span>
              <span style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() =>
                    setGroups((prev) => {
                      const has = new Set(prev.map((g) => g.workGroup))
                      return [
                        ...prev,
                        ...filteredGroups
                          .filter((wg) => !has.has(wg))
                          .map((wg) => ({
                            workGroup: wg,
                            varieties: [...task.varieties],
                            regions: [...task.regions],
                            qty: {},
                          })),
                      ]
                    })
                  }
                  style={{
                    border: "none",
                    background: "none",
                    color: "var(--color-brand)",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: "var(--fs-12)",
                  }}
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={() => setGroups([])}
                  style={{
                    border: "none",
                    background: "none",
                    color: "#667085",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: "var(--fs-12)",
                  }}
                >
                  清空
                </button>
              </span>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredGroups.map((wg) => {
              const g = groups.find((x) => x.workGroup === wg)
              const on = !!g
              const amt = g ? groupAmount(g) : 0
              const isEmpty = on && amt <= 0
              const isActive = activeGroup?.workGroup === wg
              const blockedReason = blockedTargets?.[wg]
              const blocked = Boolean(blockedReason)
              return (
                <div
                  key={wg}
                  onClick={() => on && setActive(wg)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 12px",
                    cursor: on ? "pointer" : "default",
                    opacity: blocked ? 0.7 : 1,
                    background: isActive
                      ? "var(--color-brand-subtle)"
                      : undefined,
                    borderBottom: "1px solid #F3F4F6",
                  }}
                  title={blockedReason}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={blocked}
                    aria-label={blocked ? `${wg}（${blockedReason}）` : wg}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleGroup(wg)}
                    style={{ flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "var(--fs-13)",
                        fontWeight: isActive ? 650 : 500,
                        color: blocked
                          ? "#C77A16"
                          : isEmpty
                            ? "#C73A3A"
                            : "var(--color-text-1)",
                      }}
                    >
                      {wg}
                    </div>
                    <div style={{ fontSize: "var(--fs-11)", color: "#98A2B3" }}>
                      {blocked ? (
                        blockedReason
                      ) : (
                        <>
                          {isSpecialist
                            ? "服务专员"
                            : `${workGroupMembers[wg] ?? 0} 位专员`}
                          {on ? ` · ${formatCNY(amt)}` : ""}
                        </>
                      )}
                    </div>
                  </div>
                  {blocked && <Tag label="待指定组长" color="warning" />}
                  {!blocked && isEmpty && <Tag label="未分配" color="danger" />}
                </div>
              )
            })}
            {filteredGroups.length === 0 && (
              <div
                style={{
                  padding: 14,
                  fontSize: "var(--fs-12)",
                  color: "#98A2B3",
                }}
              >
                {targets.length === 0
                  ? "该品种·区域尚无授权对象，请先在 品种授权 → 服务商授权 中完成授权"
                  : `没有匹配的${targetWord}`}
              </div>
            )}
            {targets.length === 0 && filteredGroups.length === 0 && (
              <div style={{ padding: "0 12px 12px" }}>
                <Banner color="warning">
                  拆包强约束：仅已获得本任务品种·区域授权的{targetWord}
                  可承接任务量。
                </Banner>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {!activeGroup ? (
            <div
              style={{
                padding: "48px 0",
                textAlign: "center",
                color: "#98A2B3",
                fontSize: "var(--fs-13)",
                border: "1px dashed var(--color-border)",
                borderRadius: 8,
              }}
            >
              请先在左侧勾选{targetWord}
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <strong style={{ fontSize: "var(--fs-14)" }}>
                    {activeGroup.workGroup}
                  </strong>
                  <span style={{ fontSize: "var(--fs-12)", color: "#667085" }}>
                    分项金额合计{" "}
                    <strong
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "var(--color-brand)",
                      }}
                    >
                      {formatCNY(groupAmount(activeGroup))}
                    </strong>
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={activeGroup.target ?? ""}
                    placeholder="输入本组总金额，自动折算次数"
                    onChange={(e) =>
                      setGroups((prev) =>
                        prev.map((x, i) =>
                          i === gi ? { ...x, target: e.target.value } : x,
                        ),
                      )
                    }
                    onBlur={(e) => {
                      const v = Math.floor(Number(e.target.value) || 0)
                      if (v > 0) applyGroupAmount(gi, v)
                      else
                        setGroups((prev) =>
                          prev.map((x, i) =>
                            i === gi ? { ...x, target: "", note: "" } : x,
                          ),
                        )
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        (e.target as HTMLInputElement).blur()
                    }}
                    style={{ ...inputStyle, width: 216, height: 30 }}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setGroups((prev) => prev.filter((_, i) => i !== gi))
                  }
                >
                  移除
                </Button>
              </div>

              {(() => {
                const b = boundsOf(activeGroup)
                return (
                  <div
                    style={{
                      fontSize: "var(--fs-12)",
                      color: activeGroup.note ? "#B45309" : "#98A2B3",
                      marginBottom: 10,
                      lineHeight: 1.6,
                    }}
                  >
                    可分配区间：
                    {b.hasCapacity
                      ? `${formatCNY(b.min)} ~ ${formatCNY(b.max)}`
                      : "无可分配容量（各业务剩余次数已被其他组占满）"}
                    {activeGroup.note ? ` · ${activeGroup.note}` : ""}
                  </div>
                )
              })()}

              {groupAmount(activeGroup) <= 0 && (
                <div style={{ marginBottom: 12 }}>
                  <Banner color="warning">
                    已勾选「{activeGroup.workGroup}
                    」但未分配业务次数，请分配或取消勾选。
                  </Banner>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginBottom: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "var(--fs-12)",
                      color: "#9CA3AF",
                      marginBottom: 6,
                    }}
                  >
                    品种
                  </div>
                  <ChipSelect
                    options={task.varieties}
                    value={activeGroup.varieties}
                    onChange={(v) => patchDims(gi, { varieties: v })}
                  />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "var(--fs-12)",
                      color: "#9CA3AF",
                      marginBottom: 6,
                    }}
                  >
                    地区
                  </div>
                  <ChipSelect
                    options={task.regions}
                    value={activeGroup.regions}
                    onChange={(v) => patchDims(gi, { regions: v })}
                  />
                </div>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {[
                      "品种",
                      "地区",
                      "服务项目",
                      "单价",
                      "计划次数",
                      "剩余可分配",
                      "次数",
                      "分项金额",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          ...th,
                          textAlign: [
                            "单价",
                            "计划次数",
                            "剩余可分配",
                            "次数",
                            "分项金额",
                          ].includes(h)
                            ? "right"
                            : "left",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = task.serviceItems.filter(
                      (i) =>
                        activeGroup.varieties.includes(i.variety) &&
                        activeGroup.regions.includes(i.region),
                    )
                    if (rows.length === 0)
                      return (
                        <tr>
                          <td colSpan={8} style={{ ...td, color: "#9CA3AF" }}>
                            请勾选品种与地区以载入业务明细
                          </td>
                        </tr>
                      )
                    return (
                      <>
                        {rows.map((item) => {
                          const others = usedByOthers(
                            item.id,
                            activeGroup.workGroup,
                          )
                          const left = item.qty - others
                          const qty = Number(activeGroup.qty[item.id]) || 0
                          const over = qty > left
                          return (
                            <tr key={item.id}>
                              <td
                                style={{
                                  ...td,
                                  padding: "8px 10px",
                                  fontSize: "var(--fs-12)",
                                }}
                              >
                                {item.variety}
                              </td>
                              <td
                                style={{
                                  ...td,
                                  padding: "8px 10px",
                                  fontSize: "var(--fs-12)",
                                }}
                              >
                                {item.region}
                              </td>
                              <td style={{ ...td, padding: "8px 10px" }}>
                                {item.name}
                              </td>
                              <td
                                style={{
                                  ...td,
                                  padding: "8px 10px",
                                  textAlign: "right",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  color: "#667085",
                                }}
                              >
                                {formatCNY(item.unitPrice)}
                              </td>
                              <td
                                style={{
                                  ...td,
                                  padding: "8px 10px",
                                  textAlign: "right",
                                  fontFamily: "'JetBrains Mono', monospace",
                                }}
                              >
                                {item.qty} {item.unit}
                              </td>
                              <td
                                style={{
                                  ...td,
                                  padding: "8px 10px",
                                  textAlign: "right",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  color: left <= 0 ? "#C73A3A" : "#667085",
                                }}
                              >
                                {left}
                              </td>
                              <td
                                style={{
                                  ...td,
                                  padding: "4px 6px",
                                  textAlign: "right",
                                }}
                              >
                                <input
                                  type="number"
                                  min={0}
                                  value={qty === 0 ? "" : qty}
                                  onChange={(e) =>
                                    setQty(gi, item.id, Number(e.target.value))
                                  }
                                  style={{
                                    ...inputStyle,
                                    height: 30,
                                    width: 78,
                                    textAlign: "right",
                                    fontFamily: "'JetBrains Mono', monospace",
                                    borderColor: over
                                      ? "#C73A3A"
                                      : "var(--color-border)",
                                  }}
                                />
                              </td>
                              <td
                                style={{
                                  ...td,
                                  padding: "8px 10px",
                                  textAlign: "right",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontWeight: 650,
                                  color: over
                                    ? "#C73A3A"
                                    : "var(--color-text-1)",
                                }}
                              >
                                {formatCNY(item.unitPrice * qty)}
                              </td>
                            </tr>
                          )
                        })}
                        <tr style={{ background: "#F9FAFB" }}>
                          <td
                            colSpan={7}
                            style={{
                              ...td,
                              padding: "8px 10px",
                              textAlign: "right",
                              color: "#667085",
                            }}
                          >
                            {activeGroup.workGroup} 小计
                          </td>
                          <td
                            style={{
                              ...td,
                              padding: "8px 10px",
                              textAlign: "right",
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: 700,
                              color: "var(--color-brand)",
                            }}
                          >
                            {formatCNY(groupAmount(activeGroup))}
                          </td>
                        </tr>
                      </>
                    )
                  })()}
                </tbody>
              </table>

              <WorkloadForecast
                task={task}
                group={activeGroup}
                days={days}
                memberCount={
                  isSpecialist ? 1 : workGroupMembers[activeGroup.workGroup]
                }
                memberText={
                  isSpecialist
                    ? `${activeGroup.workGroup} · 按 1 名专员单人日基准测算`
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** 发起结算：服务月份 + 服务专员（不随链路变化，一张结算单对应一名服务专员） */
/** 二级类目：由服务项目名派生的展示分组（原型内置映射，未匹配显示「常规服务」） */
const SETTLE_SUB_CATEGORY: Record<string, string> = {
  医院拜访: "终端拜访",
  商业拜访: "渠道拜访",
  药房拜访: "渠道拜访",
  学术推广: "学术活动",
  科室会议: "学术活动",
  临床应用研究报告: "调研报告",
  区域市场分析报告: "调研报告",
  市场分析报告: "调研报告",
  问卷样本量: "问卷调研",
  分析总结: "数据分析",
}

interface SettleRow {
  key: string
  source: "workload" | "report"
  workloadId?: string
  reportId?: string
  specialist: string
  workGroup: string
  variety: string
  region: string
  /** 一级类目 = 服务大类（推广服务 / 报告服务两模式的载体） */
  topCategory: string
  /** 二级类目 = 服务项目分组 */
  subCategory: string
  /** 类别 = 具体服务项目 / 报告 */
  item: string
  unitPrice: number
  /** 可结算量 */
  available: number
}

function settleRowsOf(task: Task, month: string): SettleRow[] {
  const rows: SettleRow[] = []
  task.workloadAssigns.forEach((a) => {
    if (a.progress !== "已完成" || a.serviceMonth !== month) return
    const remainingQty = a.workload - (a.settledQty ?? 0)
    if (a.settledBillNo || remainingQty <= 0) return
    rows.push({
      key: a.id,
      source: "workload",
      workloadId: a.id,
      specialist: a.specialist,
      workGroup: a.workGroup || "—",
      variety: a.variety,
      region: a.region,
      topCategory: a.category,
      subCategory: SETTLE_SUB_CATEGORY[a.itemName] ?? "常规服务",
      item: a.itemName,
      unitPrice: a.workload > 0 ? a.amount / a.workload : 0,
      available: remainingQty,
    })
  })
  task.reports.forEach((r) => {
    if (r.status !== "通过" || r.settledBillNo) return
    if ((r.serviceMonth ?? r.uploadedAt.slice(0, 7)) !== month) return
    const matched =
      task.serviceItems.find(
        (it) => it.category !== "市场推广服务" && it.name === r.itemName,
      ) ?? task.serviceItems.find((it) => it.category !== "市场推广服务")
    rows.push({
      key: r.id,
      source: "report",
      reportId: r.id,
      specialist: r.uploadedBy,
      workGroup: "报告服务",
      variety: r.variety ?? task.varieties[0] ?? "",
      region: r.region ?? task.regions[0] ?? "",
      topCategory: r.category ?? matched?.category ?? "分析报告服务",
      subCategory: SETTLE_SUB_CATEGORY[r.itemName ?? ""] ?? "调研报告",
      item: r.itemName ?? r.name,
      unitPrice: matched?.unitPrice ?? 0,
      available: 1,
    })
  })
  return rows
}

/** 存在可结算明细（任务量或已通过报告）的服务月份 */
function settleableMonthsOf(task: Task): string[] {
  const months = new Set<string>()
  const rowMonths = new Set<string>()
  // 先记录真正可结算的月份，再取并集排序
  task.workloadAssigns.forEach((a) => {
    if (a.progress !== "已完成" || a.settledBillNo) return
    if (a.workload - (a.settledQty ?? 0) <= 0) return
    rowMonths.add(a.serviceMonth)
  })
  task.reports.forEach((r) => {
    if (r.status !== "通过" || r.settledBillNo) return
    rowMonths.add(r.serviceMonth ?? r.uploadedAt.slice(0, 7))
  })
  rowMonths.forEach((m) => {
    if (/^\d{4}-\d{2}$/.test(m)) months.add(m)
  })
  return [...months].sort()
}

function monthRangeOf(month: string): string {
  const [y, m] = month.split("-").map(Number)
  if (!y || !m) return month
  const last = new Date(y, m, 0).getDate()
  return `${month}-01 至 ${month}-${String(last).padStart(2, "0")}`
}

/* ── 生成结算单弹窗专用样式：弱化表头与网格线，对齐关系替代边框分隔 ── */
const smTh: React.CSSProperties = {
  padding: "9px 12px",
  textAlign: "left",
  fontSize: "var(--fs-12)",
  fontWeight: 500,
  color: "#667085",
  background: "#fff",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
}
const smTd: React.CSSProperties = {
  padding: "11px 12px",
  fontSize: "var(--fs-13)",
  color: "var(--color-text-1)",
  borderBottom: "1px solid #F3F4F6",
  verticalAlign: "middle",
}
const monoNum: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
}

/** 结算信息条内的紧凑字段：标签与值同行 */
function SettleInfoItem({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
      <span style={{ fontSize: "var(--fs-12)", color: "#98A2B3" }}>{label}</span>
      <span style={{ fontSize: "var(--fs-13)", fontWeight: 650, color: "var(--color-text-1)" }}>
        {children}
      </span>
    </div>
  )
}

function SettleModal({
  task,
  onClose,
  onSave,
}: {
  task: Task | null
  onClose: () => void
  onSave: (input: {
    serviceMonth: string
    selections: Array<
      { workloadId: string; qty: number } | { reportId: string; qty: number }
    >
  }) => void
}) {
  const months = task ? settleableMonthsOf(task) : []
  const [month, setMonth] = useState("")
  const [step, setStep] = useState<1 | 2>(1)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [catFilter, setCatFilter] = useState("全部")
  const [catView, setCatView] = useState<"可选" | "已选">("可选")
  const [manualOpen, setManualOpen] = useState(false)
  const [manualChecked, setManualChecked] = useState<Set<string>>(new Set())
  const [manualSpecialist, setManualSpecialist] = useState("")
  const [manualCategory, setManualCategory] = useState("")
  const [manualItem, setManualItem] = useState("")
  const madeAt = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    setMonth(months[0] ?? "")
    setStep(1)
    setQty({})
    setCatFilter("全部")
    setCatView("可选")
    setManualOpen(false)
    setManualChecked(new Set())
    setManualSpecialist("")
    setManualCategory("")
    setManualItem("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

  if (!task) return null

  const rows = settleRowsOf(task, month)
  const categories = [...new Set(rows.map((r) => r.topCategory))]
  const selectedRows = rows.filter((r) => (qty[r.key] ?? 0) > 0)
  const totalAmount = selectedRows.reduce(
    (s, r) => s + Math.round(r.unitPrice * (qty[r.key] ?? 0)),
    0,
  )
  const remain = remainingOfTask(task)
  const exceeded = totalAmount > remain
  const catStats = (cat: string) => {
    const catRows = cat === "全部" ? rows : rows.filter((r) => r.topCategory === cat)
    return {
      available: catRows.length,
      selected: catRows.filter((r) => (qty[r.key] ?? 0) > 0).length,
    }
  }
  const visibleRows =
    catFilter === "全部" ? rows : rows.filter((r) => r.topCategory === catFilter)
  const catList =
    catView === "可选"
      ? categories
      : categories.filter((c) => catStats(c).selected > 0)

  const setQtyOf = (key: string, value: number, max: number) => {
    const v = Math.max(0, Math.min(max, Math.round(value)))
    setQty((prev) => ({ ...prev, [key]: Number.isNaN(v) ? 0 : v }))
  }

  const stepTwoLines = () => {
    const grouped = new Map<string, SettlementLine>()
    selectedRows.forEach((r) => {
      const lineAmount = Math.round(r.unitPrice * (qty[r.key] ?? 0))
      const key = `${r.variety}|${r.region}|${r.topCategory}|${r.item}`
      const exist = grouped.get(key)
      if (exist) {
        exist.serviceAmount += lineAmount
        exist.actualAmount += lineAmount
      } else {
        grouped.set(key, {
          id: key,
          variety: r.variety,
          region: r.region,
          serviceType: r.topCategory,
          serviceItem: r.item,
          serviceAmount: lineAmount,
          actualAmount: lineAmount,
          remark: r.source === "report" ? "对应已审核通过的报告" : "",
        })
      }
    })
    return [...grouped.values()]
  }

  const previewNo = `JS-2026-${task.taskNo.slice(-4)}-${String(
    task.settlements.length + 1,
  ).padStart(2, "0")}`

  const manualRows = rows.filter(
    (r) =>
      (!manualSpecialist || r.specialist === manualSpecialist) &&
      (!manualCategory || r.topCategory === manualCategory) &&
      (!manualItem || r.item === manualItem),
  )

  /* 紧凑步骤指示：嵌在「结算信息」标题行右侧 */
  const stepIndicator = (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {["结算明细", "结算单预览"].map((label, i) => {
        const no = i + 1
        const active = step === no
        return (
          <Fragment key={label}>
            {i > 0 && (
              <div
                style={{
                  width: 24,
                  height: 1,
                  background: step > i ? "var(--color-brand)" : "#E5E7EB",
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: "var(--fs-12)",
                fontWeight: active ? 650 : 450,
                color: active ? "var(--color-brand)" : "#98A2B3",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  lineHeight: "17px",
                  textAlign: "center",
                  fontSize: "var(--fs-11)",
                  border: `1px solid ${active ? "var(--color-brand)" : "#D1D5DB"}`,
                  background: active ? "var(--color-brand)" : "#fff",
                  color: active ? "#fff" : "#98A2B3",
                }}
              >
                {no}
              </span>
              {label}
            </div>
          </Fragment>
        )
      })}
    </div>
  )

  /* 底部固定汇总操作栏：左侧始终展示核心汇总，右侧为操作按钮 */
  const footerBar = (
    <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-12)", color: "#667085" }}>
          已选项目{" "}
          <strong style={{ ...monoNum, fontSize: "var(--fs-16)", fontWeight: 700, color: "var(--color-text-1)" }}>
            {selectedRows.length}
          </strong>{" "}
          项
        </span>
        <span style={{ fontSize: "var(--fs-12)", color: "#667085" }}>
          本次结算金额{" "}
          <strong style={{ ...monoNum, fontSize: "var(--fs-16)", fontWeight: 700, color: exceeded ? "#C73A3A" : "var(--color-brand)" }}>
            {formatCNY(totalAmount)}
          </strong>
        </span>
        <span style={{ fontSize: "var(--fs-12)", color: "#667085" }}>
          剩余可结算{" "}
          <strong style={{ ...monoNum, fontSize: "var(--fs-14)", fontWeight: 650, color: "var(--color-text-1)" }}>
            {formatCNY(remain)}
          </strong>
        </span>
        {exceeded && (
          <span style={{ fontSize: "var(--fs-12)", color: "#C73A3A" }}>
            超出剩余可结算金额，无法生成
          </span>
        )}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexShrink: 0 }}>
        {step === 1 ? (
          <>
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={selectedRows.length === 0}
              onClick={() => setStep(2)}
            >
              下一步
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setStep(1)}>
              上一步
            </Button>
            <Button
              variant="primary"
              disabled={exceeded}
              onClick={() =>
                onSave({
                  serviceMonth: month,
                  selections: selectedRows.map((r) =>
                    r.source === "workload"
                      ? { workloadId: r.workloadId!, qty: qty[r.key] ?? 0 }
                      : { reportId: r.reportId!, qty: 1 },
                  ),
                })
              }
            >
              生成结算单
            </Button>
          </>
        )}
      </div>
    </div>
  )

  if (months.length === 0)
    return (
      <Modal open={!!task} title="生成结算单" onClose={onClose} width={860}
        footer={<Button variant="outline" onClick={onClose}>关闭</Button>}>
        <div style={{ fontSize: "var(--fs-13)", color: "#667085" }}>
          当前没有可结算明细：推广服务需要已审核且未结算的任务量；报告服务需要已审核通过且未结算的报告。
        </div>
      </Modal>
    )

  return (
    <Modal
      open={!!task}
      title="生成结算单"
      onClose={onClose}
      width={1120}
      footer={footerBar}
    >
      {/* ── ① 结算信息：一行紧凑呈现，结算月份为唯一交互项 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: "var(--fs-14)", fontWeight: 650, color: "var(--color-text-1)" }}>
          结算信息
        </span>
        <span style={{ fontSize: "var(--fs-12)", color: "#98A2B3" }}>
          切换结算月份将重新选择明细
        </span>
        <div style={{ marginLeft: "auto" }}>{stepIndicator}</div>
      </div>
      <div
        style={{
          background: "#F9FAFB",
          borderRadius: 10,
          padding: "11px 16px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 28,
          rowGap: 8,
        }}
      >
        <SettleInfoItem label="结算月份">
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value)
              setQty({})
              setCatFilter("全部")
              setManualChecked(new Set())
            }}
            style={{
              height: 26,
              padding: "0 6px",
              fontSize: "var(--fs-13)",
              fontWeight: 650,
              color: "var(--color-text-1)",
              background: "#fff",
              cursor: "pointer",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              outline: "none",
              fontFamily: "inherit",
            }}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </SettleInfoItem>
        <SettleInfoItem label="服务周期">{monthRangeOf(month)}</SettleInfoItem>
        <SettleInfoItem label="结算品种">{task.varieties.join("、")}</SettleInfoItem>
        <SettleInfoItem label="制单时间">{madeAt}</SettleInfoItem>
        <SettleInfoItem label="对账单号">
          <span style={{ fontWeight: 450, color: "#98A2B3" }}>生成后自动带出</span>
        </SettleInfoItem>
      </div>

      {step === 1 ? (
        <>
          {/* ── ② 结算项目：页面核心，勾选明细并填写本次结算量 ── */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: "var(--fs-14)", fontWeight: 650, color: "var(--color-text-1)" }}>
                结算项目
              </span>
              <span style={{ fontSize: "var(--fs-12)", color: "#98A2B3" }}>
                可结算 {rows.length} 条 · 勾选即按最大可结算量填入
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = { ...qty }
                    visibleRows.forEach((r) => (next[r.key] = r.available))
                    setQty(next)
                  }}
                >
                  一键选满可结算
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setQty({})}>
                  一键清空
                </Button>
              </div>
            </div>

            {/* 类目筛选 chips + 可选/已选切换（原左侧类目栏并入此行） */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              {["全部", ...catList].map((cat) => {
                const stats = catStats(cat)
                const active = catFilter === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCatFilter(cat)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 12px",
                      borderRadius: 999,
                      cursor: "pointer",
                      fontSize: "var(--fs-12)",
                      fontWeight: active ? 650 : 450,
                      border: `1px solid ${active ? "var(--color-brand)" : "var(--color-border)"}`,
                      background: active ? "var(--color-brand-subtle)" : "#fff",
                      color: active ? "var(--color-brand)" : "#667085",
                    }}
                  >
                    {cat}
                    <span
                      style={{
                        ...monoNum,
                        fontSize: "var(--fs-11)",
                        color: active ? "var(--color-brand)" : "#98A2B3",
                      }}
                    >
                      {stats.selected > 0 ? `${stats.selected}/${stats.available}` : stats.available}
                    </span>
                  </button>
                )
              })}
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                {(["可选", "已选"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCatView(v)}
                    style={{
                      padding: "3px 10px",
                      fontSize: "var(--fs-12)",
                      cursor: "pointer",
                      border: "none",
                      background: catView === v ? "var(--color-brand-subtle)" : "#fff",
                      color: catView === v ? "var(--color-brand)" : "#667085",
                      fontWeight: catView === v ? 650 : 450,
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <table
                className="settle-table row-click"
                style={{ width: "100%", borderCollapse: "collapse" }}
              >
                <thead>
                  <tr>
                    <th style={{ ...smTh, width: 36 }} />
                    <th style={smTh}>一级类目</th>
                    <th style={smTh}>二级类目</th>
                    <th style={smTh}>类别</th>
                    <th style={{ ...smTh, textAlign: "right" }}>可结算金额</th>
                    <th style={{ ...smTh, textAlign: "right" }}>可结算量</th>
                    <th style={{ ...smTh, textAlign: "right", width: 120 }}>本次结算量</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const rowQty = qty[r.key] ?? 0
                    const picked = rowQty > 0
                    return (
                      <tr
                        key={r.key}
                        className={picked ? "picked" : undefined}
                        title={`${r.specialist} · ${r.workGroup} · ${r.variety} · ${r.region}`}
                        onClick={() => setQtyOf(r.key, picked ? 0 : r.available, r.available)}
                        style={{ background: picked ? "var(--color-brand-subtle)" : undefined }}
                      >
                        <td style={{ ...smTd, width: 36 }}>
                          <input
                            type="checkbox"
                            checked={picked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setQtyOf(r.key, e.target.checked ? r.available : 0, r.available)
                            }
                            style={{
                              accentColor: "var(--color-brand)",
                              cursor: "pointer",
                              width: 15,
                              height: 15,
                            }}
                          />
                        </td>
                        <td style={smTd}>{r.topCategory}</td>
                        <td style={{ ...smTd, color: "#667085" }}>{r.subCategory}</td>
                        <td style={{ ...smTd, fontWeight: 550 }}>{r.item}</td>
                        <td
                          style={{
                            ...smTd,
                            ...monoNum,
                            textAlign: "right",
                            fontWeight: 650,
                            color: picked ? "var(--color-brand)" : "var(--color-text-1)",
                          }}
                        >
                          {formatCNY(Math.round(r.unitPrice * r.available))}
                        </td>
                        <td
                          style={{
                            ...smTd,
                            ...monoNum,
                            textAlign: "right",
                            color: "#667085",
                          }}
                        >
                          {r.available}
                        </td>
                        <td
                          style={{ ...smTd, textAlign: "right" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="number"
                            min={0}
                            max={r.available}
                            value={rowQty}
                            onChange={(e) => setQtyOf(r.key, Number(e.target.value), r.available)}
                            style={{
                              ...inputStyle,
                              width: 84,
                              height: 30,
                              textAlign: "right",
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          ...smTd,
                          textAlign: "center",
                          color: "#98A2B3",
                          padding: "28px 12px",
                        }}
                      >
                        {catFilter === "全部"
                          ? "该服务月份暂无可结算明细"
                          : `「${catFilter}」类目下暂无可结算明细`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── ③ 明细调整（可选）：默认收起，人工按专员维度批量勾选回填 ── */}
          <div
            style={{
              marginTop: 16,
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <button
              type="button"
              aria-expanded={manualOpen}
              onClick={() => setManualOpen((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "11px 14px",
                cursor: "pointer",
                textAlign: "left",
                border: "none",
                background: manualOpen ? "#F9FAFB" : "transparent",
              }}
            >
              <ChevronDown
                size={14}
                color="#98A2B3"
                style={{
                  transition: "transform 150ms",
                  transform: manualOpen ? "rotate(180deg)" : "none",
                }}
              />
              <span style={{ fontSize: "var(--fs-13)", fontWeight: 650, color: "var(--color-text-1)" }}>
                明细调整（可选）
              </span>
              <span style={{ fontSize: "var(--fs-12)", color: "#98A2B3" }}>
                默认无需处理；展开后按服务专员/类目筛选，勾选明细并回填至结算项目
              </span>
              {manualChecked.size > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "var(--fs-12)",
                    fontWeight: 600,
                    color: "var(--color-brand)",
                  }}
                >
                  已勾 {manualChecked.size} 条
                </span>
              )}
            </button>
            {manualOpen && (
              <div style={{ borderTop: "1px solid #F3F4F6", padding: "12px 14px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                    marginBottom: 10,
                  }}
                >
                  {[
                    {
                      label: "服务专员",
                      value: manualSpecialist,
                      set: setManualSpecialist,
                      options: [...new Set(rows.map((r) => r.specialist))],
                    },
                    {
                      label: "一级类目",
                      value: manualCategory,
                      set: setManualCategory,
                      options: categories,
                    },
                    {
                      label: "服务项目",
                      value: manualItem,
                      set: setManualItem,
                      options: [...new Set(rows.map((r) => r.item))],
                    },
                  ].map((f) => (
                    <label
                      key={f.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: "var(--fs-12)",
                        color: "#667085",
                      }}
                    >
                      {f.label}
                      <select
                        value={f.value}
                        onChange={(e) => f.set(e.target.value)}
                        style={{ ...inputStyle, width: 150, height: 30, fontSize: "var(--fs-12)" }}
                      >
                        <option value="">全部</option>
                        {f.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <table
                  className="settle-table"
                  style={{ width: "100%", borderCollapse: "collapse" }}
                >
                  <thead>
                    <tr>
                      {["", "二级类目", "类别", "服务专员", "品种", "金额"].map((h) => (
                        <th
                          key={h}
                          style={
                            h === "金额"
                              ? { ...smTh, textAlign: "right" }
                              : { ...smTh, ...(h === "" ? { width: 36 } : {}) }
                          }
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {manualRows.map((r) => {
                      const picked = manualChecked.has(r.key)
                      return (
                        <tr
                          key={r.key}
                          className={picked ? "picked" : undefined}
                          style={{
                            background: picked ? "var(--color-brand-subtle)" : undefined,
                          }}
                        >
                          <td style={{ ...smTd, width: 36 }}>
                            <input
                              type="checkbox"
                              checked={picked}
                              onChange={(e) =>
                                setManualChecked((prev) => {
                                  const next = new Set(prev)
                                  if (e.target.checked) next.add(r.key)
                                  else next.delete(r.key)
                                  return next
                                })
                              }
                              style={{
                                accentColor: "var(--color-brand)",
                                cursor: "pointer",
                                width: 15,
                                height: 15,
                              }}
                            />
                          </td>
                          <td style={smTd}>{r.subCategory}</td>
                          <td style={smTd}>{r.item}</td>
                          <td style={smTd}>{r.specialist}</td>
                          <td style={smTd}>{r.variety}</td>
                          <td
                            style={{
                              ...smTd,
                              ...monoNum,
                              textAlign: "right",
                              fontWeight: 650,
                            }}
                          >
                            {formatCNY(Math.round(r.unitPrice * r.available))}
                          </td>
                        </tr>
                      )
                    })}
                    {manualRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            ...smTd,
                            textAlign: "center",
                            color: "#98A2B3",
                            padding: "24px 12px",
                          }}
                        >
                          没有符合条件的明细
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
                  <span style={{ fontSize: "var(--fs-12)", color: "#98A2B3" }}>
                    回填后，勾选明细的「本次结算量」将置为其最大可结算量
                  </span>
                  <Button
                    variant="soft"
                    size="sm"
                    style={{ marginLeft: "auto" }}
                    disabled={manualChecked.size === 0}
                    onClick={() => {
                      const next = { ...qty }
                      manualChecked.forEach((key) => {
                        const row = rows.find((r) => r.key === key)
                        if (row) next[key] = row.available
                      })
                      setQty(next)
                      setCatFilter("全部")
                      setManualOpen(false)
                      setManualChecked(new Set())
                    }}
                  >
                    用勾选的数据回填至表格
                  </Button>
                </div>
              </div>
            )}
          </div>

          <style>{`
            .settle-table tbody tr:not(.picked):hover { background: #F9FAFB; }
            .settle-table tbody tr:last-child td { border-bottom: none; }
            .row-click tbody tr { cursor: pointer; }
            .row-click td input[type="number"] { cursor: text; }
          `}</style>
        </>
      ) : (
        <SettlementReceipt
          task={task}
          bill={{
            id: "settle-preview",
            no: previewNo,
            period: month,
            amount: totalAmount,
            status: "对账中",
            createdAt: madeAt,
            lines: stepTwoLines(),
          }}
          isSales={false}
          onConfirm={() => {}}
        />
      )}
    </Modal>
  )
}

function ConfirmBillModal({
  task,
  onClose,
  onSave,
}: {
  task: Task | null
  onClose: () => void
  onSave: (
    billId: string,
    lines: SettlementLine[],
    opts: { declarationAccepted: boolean; declarationVersion: string },
  ) => void
}) {
  const bill = task?.settlements.find((b) => !b.confirmed && !b.voided)
  const [lines, setLines] = useState<SettlementLine[]>([])
  const [declared, setDeclared] = useState(false)
  useEffect(() => {
    if (bill) {
      setLines(bill.lines.map((l) => ({ ...l })))
      setDeclared(false)
    }
  }, [bill?.id])
  if (!task || !bill) {
    return (
      <Modal
        open={!!task}
        title="确认结算单"
        onClose={onClose}
        footer={<Button onClick={onClose}>关闭</Button>}
      >
        <div style={{ fontSize: "var(--fs-13)", color: "#667085" }}>
          没有待确认的结算单。
        </div>
      </Modal>
    )
  }
  const period = task.settlementPeriods.find(
    (p) => p.id === bill.settlementPeriodId,
  )
  const finalAmount = lines.reduce((s, l) => s + Number(l.actualAmount || 0), 0)
  const applied = lines.reduce((s, l) => s + Number(l.serviceAmount || 0), 0)
  return (
    <Modal
      open={!!task}
      title="确认结算单"
      onClose={onClose}
      width={980}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              onSave(bill.id, lines, {
                declarationAccepted: declared,
                declarationVersion: SETTLEMENT_DECLARATION_VERSION,
              })
            }
          >
            确认并立即生效
          </Button>
        </>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          fontSize: "var(--fs-13)",
          marginBottom: 12,
        }}
      >
        <Info label="合同编号" value={bill.contractNo} />
        <Info
          label="结算周期"
          value={
            period
              ? `${period.name}（${period.startDate} ~ ${period.endDate}）`
              : bill.serviceMonth
          }
        />
        <Info label="服务时间" value={bill.servicePeriod} />
        <Info label="执行归属月份" value={bill.serviceMonth} />
        <Info label="制单日" value={bill.madeAt} />
        <Info label="服务提供方" value={bill.provider} />
      </div>
      <Banner color="warning">
        可逐服务项目调整实际结算金额；调整原因必填；每一项目必须在计划金额的
        50%—150% 内。确认即生效。
      </Banner>
      {lines.map((l, i) => {
        const min = Math.round(l.serviceAmount * 0.5)
        const max = Math.round(l.serviceAmount * 1.5)
        const out = l.actualAmount < min || l.actualAmount > max
        return (
          <div
            key={l.id}
            style={{
              display: "grid",
              gridTemplateColumns: "32px 1.1fr 70px 110px 1fr 90px 90px 1.4fr",
              gap: 8,
              marginTop: 8,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "var(--fs-12)", color: "#9CA3AF" }}>
              {i + 1}
            </span>
            <input
              value={l.variety}
              readOnly
              style={{ ...inputStyle, background: "#F9FAFB" }}
            />
            <input
              value={l.region}
              readOnly
              style={{ ...inputStyle, background: "#F9FAFB" }}
            />
            <input
              value={l.serviceType}
              readOnly
              style={{ ...inputStyle, background: "#F9FAFB" }}
            />
            <input
              value={l.serviceItem}
              readOnly
              style={{ ...inputStyle, background: "#F9FAFB" }}
            />
            <input
              type="number"
              value={l.serviceAmount}
              readOnly
              style={{ ...inputStyle, background: "#F9FAFB" }}
            />
            <input
              type="number"
              value={l.actualAmount}
              onChange={(e) =>
                setLines(
                  patch(lines, i, {
                    actualAmount: Number(e.target.value) || 0,
                  }),
                )
              }
              style={{
                ...inputStyle,
                borderColor: out ? "#C73A3A" : "var(--color-border)",
              }}
            />
            <input
              value={l.remark}
              onChange={(e) =>
                setLines(patch(lines, i, { remark: e.target.value }))
              }
              style={inputStyle}
              placeholder="调整时必填"
            />
          </div>
        )
      })}
      <div style={{ marginTop: 14, fontSize: "var(--fs-14)", fontWeight: 600 }}>
        申请 {formatCNY(applied)} · 调整 {formatCNY(finalAmount - applied)} ·
        最终 {formatCNYUpper(finalAmount)}（{formatCNY(finalAmount)}）
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginTop: 14,
          fontSize: "var(--fs-13)",
          color: "#344054",
        }}
      >
        <input
          type="checkbox"
          checked={declared}
          onChange={(e) => setDeclared(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          <strong>确认声明（{SETTLEMENT_DECLARATION_VERSION}）</strong>
          <div style={{ color: "#667085", marginTop: 4 }}>
            {SETTLEMENT_DECLARATION_TEXT}
          </div>
        </span>
      </label>
    </Modal>
  )
}

function HistoryModal({
  task,
  onClose,
}: {
  task: Task | null
  onClose: () => void
}) {
  if (!task) return null
  return (
    <Modal
      open={!!task}
      title="结算历史记录"
      onClose={onClose}
      width={780}
      footer={
        <Button variant="outline" onClick={onClose}>
          关闭
        </Button>
      }
    >
      {task.settlements
        .filter((b) => b.confirmed && !b.voided)
        .map((b) => (
          <div
            key={b.id}
            style={{
              borderBottom: "1px solid #F3F4F6",
              padding: "10px 0",
              fontSize: "var(--fs-13)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{b.billNo}</strong>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {formatCNY(b.finalAmount)}
              </span>
            </div>
            <div style={{ color: "#667085", marginTop: 4 }}>
              执行归属月份 {b.serviceMonth} · {b.confirmedAt} · {b.confirmedBy}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => alert(`原型：下载对账单 ${b.billNo}.pdf`)}
              >
                下载对账单
              </Button>
              {b.paymentVoucher
                ? `凭证：${b.paymentVoucher}`
                : "未上传付款凭证"}
            </div>
          </div>
        ))}
    </Modal>
  )
}

function VoucherModal({
  task,
  onClose,
  onSave,
}: {
  task: Task | null
  onClose: () => void
  onSave: (billId: string, name: string) => void
}) {
  const bill =
    task?.settlements.find(
      (b) => b.confirmed && !b.voided && !b.paymentVoucher,
    ) ?? task?.settlements.find((b) => b.confirmed && !b.voided)
  const [name, setName] = useState("付款凭证.pdf")
  if (!task || !bill) return null
  return (
    <Modal
      open={!!task}
      title="上传付款凭证"
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => onSave(bill.id, name)}>
            上传
          </Button>
        </>
      }
    >
      <Field label="结算单">
        {bill.billNo}（执行归属月份 {bill.serviceMonth}）
      </Field>
      <div style={{ height: 8 }} />
      <Field label="凭证文件名">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <div style={{ fontSize: "var(--fs-12)", color: "#9CA3AF", marginTop: 8 }}>
        原型不真正上传文件，填写名称即可演示。
      </div>
    </Modal>
  )
}

const REPORT_FILE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.zip,.png,.jpg,.jpeg"

function ReportUploadModal({
  task,
  editing,
  onClose,
  onSave,
}: {
  task: Task | null
  /** 指定上传/重传的报告记录（待上传或已退回）；为空时先在弹框内选择记录 */
  editing?: ReportFile | null
  onClose: () => void
  onSave: (
    reportId: string,
    payload: {
      name: string
      fileName: string
      variety: string
      region: string
      itemName?: string
      url?: string
    },
  ) => void
}) {
  const [selectedId, setSelectedId] = useState("")
  const [fileName, setFileName] = useState("")
  const [fileUrl, setFileUrl] = useState<string | undefined>(undefined)
  useEffect(() => {
    setSelectedId(editing?.id ?? "")
    setFileName(editing?.fileName ?? "")
    setFileUrl(undefined)
  }, [task?.id, editing?.id])
  if (!task) return null
  // 可上传目标：药厂分派生成的待上传记录 + 被退回待重传的记录
  const targets = task.reports.filter(
    (r) => r.status === "待上传" || r.status === "驳回",
  )
  const target =
    editing ?? task.reports.find((r) => r.id === selectedId) ?? null
  const invalidExt =
    fileName &&
    !REPORT_FILE_ACCEPT.split(",").some((ext) =>
      fileName.toLowerCase().endsWith(ext),
    )
  const isReupload = target?.status === "驳回"
  const canSubmit = !!target && !!fileName.trim() && !invalidExt
  const lockedFieldStyle: React.CSSProperties = {
    ...inputStyle,
    background: "#F9FAFB",
    color: "#475467",
  }
  return (
    <Modal
      open={!!task}
      title={isReupload ? "重新上传报告" : "上传报告"}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={() =>
              target &&
              onSave(target.id, {
                name: target.name,
                fileName: fileName.trim(),
                variety: target.variety ?? "",
                region: target.region ?? "",
                itemName: target.itemName,
                url: fileUrl,
              })
            }
          >
            {isReupload ? "重新上传" : "提交"}
          </Button>
        </>
      }
    >
      {!editing && (
        <Field label="选择报告任务">
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value)
              setFileName("")
              setFileUrl(undefined)
            }}
            style={inputStyle}
          >
            <option value="">请选择</option>
            {targets.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}（{r.variety ?? "—"} · {r.region ?? "全国"}
                {r.status === "驳回" ? " · 已退回" : ""}）
              </option>
            ))}
          </select>
          <div
            style={{
              fontSize: "var(--fs-12)",
              color: "#9CA3AF",
              marginTop: 4,
            }}
          >
            报告任务由药厂分派生成；名称、品种、区域随记录带出，不可修改。
          </div>
        </Field>
      )}
      {isReupload && (
        <Banner color="warning">
          重新上传后报告将回到「待审核」，原审核意见清空；版本号累加留痕。
        </Banner>
      )}
      {target && (
        <>
          {!editing && <div style={{ height: 10 }} />}
          <Field label="报告名称">
            <input value={target.name} readOnly style={lockedFieldStyle} />
          </Field>
          <div style={{ height: 10 }} />
          <Field label="附件">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="file"
                accept={REPORT_FILE_ACCEPT}
                style={{ fontSize: "var(--fs-12)" }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setFileName(file.name)
                    setFileUrl(URL.createObjectURL(file))
                  }
                }}
              />
              {fileName && (
                <span
                  style={{
                    fontSize: "var(--fs-12)",
                    color: invalidExt ? "#C73A3A" : "#2F6BCE",
                  }}
                >
                  {fileName}
                </span>
              )}
            </div>
            {invalidExt && (
              <div
                style={{
                  fontSize: "var(--fs-12)",
                  color: "#C73A3A",
                  marginTop: 4,
                }}
              >
                不支持的附件格式，允许：{REPORT_FILE_ACCEPT}
              </div>
            )}
            <div
              style={{
                fontSize: "var(--fs-12)",
                color: "#9CA3AF",
                marginTop: 4,
              }}
            >
              上传后药厂可在线预览（图片/PDF）或下载；历史演示附件为占位示例。
            </div>
          </Field>
          <div style={{ height: 10 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <Field label="所属品种">
              <input value={target.variety ?? "—"} readOnly style={lockedFieldStyle} />
            </Field>
            <Field label="所属区域">
              <input value={target.region ?? "全国"} readOnly style={lockedFieldStyle} />
            </Field>
          </div>
          {target.itemName && (
            <>
              <div style={{ height: 10 }} />
              <Field label="关联服务项目（结算计价依据）">
                <input value={target.itemName} readOnly style={lockedFieldStyle} />
              </Field>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

function AttachmentPreviewModal({
  report,
  onClose,
  decide,
}: {
  report: ReportFile | null
  onClose: () => void
  /** 成果验收动作（当前级验收人打开待验收报告时提供）；驳回必填原因 */
  decide?: { onPass: () => void; onReject: (reason: string) => void }
}) {
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  if (!report || !report.fileName) return null
  const fileName = report.fileName
  const kind = fileKindOf(fileName)
  // 仅本会话真实上传的文件可在线内嵌预览；种子演示附件展示占位卡
  const inlineable = isInlinePreviewable(kind) && !!report.url
  return (
    <Modal
      open
      title="附件预览"
      onClose={onClose}
      width={680}
      footer={
        rejecting ? (
          <>
            <span style={{ marginRight: "auto", fontSize: "var(--fs-12)", color: "#C73A3A" }}>
              驳回原因必填，该报告将退回服务商补充
            </span>
            <Button
              variant="outline"
              onClick={() => {
                setRejecting(false)
                setRejectReason("")
              }}
            >
              取消
            </Button>
            <Button
              variant="danger"
              disabled={!rejectReason.trim()}
              onClick={() => decide?.onReject(rejectReason.trim())}
            >
              确认驳回
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
            {decide && (
              <>
                <Button variant="danger" onClick={() => setRejecting(true)}>
                  驳回
                </Button>
                <Button variant="primary" onClick={() => decide.onPass()}>
                  通过
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {rejecting && (
        <>
          <div style={{ padding: "10px 12px", background: "#FFFBFA", border: "1px solid #F1C7C7", borderRadius: 6 }}>
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请填写驳回原因（必填），将退回服务商补充"
              style={{ width: "100%", height: 32, padding: "0 10px", fontSize: "var(--fs-13)", border: "1px solid #F1C7C7", borderRadius: 6, outline: "none", background: "#fff" }}
            />
          </div>
          <div style={{ height: 12 }} />
        </>
      )}
      <Info label="报告名称" value={report.name} />
      <div style={{ height: 10 }} />
      <Info label="附件" value={`${fileName} · ${FILE_KIND_LABEL[kind]}`} />
      <div style={{ height: 12 }} />
      {inlineable ? (
        kind === "image" ? (
          <img
            src={report.url}
            alt={fileName}
            style={{
              width: "100%",
              maxHeight: 360,
              objectFit: "contain",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              background: "#F9FAFB",
            }}
          />
        ) : (
          <iframe
            src={report.url}
            title={fileName}
            style={{
              width: "100%",
              height: 380,
              border: "1px solid var(--color-border)",
              borderRadius: 8,
            }}
          />
        )
      ) : (
        <div
          style={{
            border: "1px dashed var(--color-border)",
            borderRadius: 8,
            padding: "32px 20px",
            textAlign: "center",
            background: "#F9FAFB",
            color: "#667085",
            fontSize: "var(--fs-13)",
            lineHeight: 1.9,
          }}
        >
          <FileText size={28} style={{ marginBottom: 6 }} />
          <div style={{ color: "#344054", fontWeight: 600 }}>{fileName}</div>
          <div>{FILE_KIND_LABEL[kind]} · 演示占位预览</div>
          <div style={{ fontSize: "var(--fs-12)", color: "#98A2B3" }}>
            {report.url
              ? "该格式暂不支持在线预览，可下载到本地查看。"
              : "正式环境此处在线展示原始文件；演示附件可下载占位文件查看。"}
          </div>
        </div>
      )}
    </Modal>
  )
}

function ReviewModal({
  task,
  onClose,
  onSave,
  onPreviewReport,
}: {
  task: Task | null
  onClose: () => void
  onSave: (reportId: string, pass: boolean, comment: string) => void
  onPreviewReport?: (report: ReportFile) => void
}) {
  const pending = task?.reports.find((r) => r.status === "待审核")
  const [comment, setComment] = useState("")
  if (!task) return null
  return (
    <Modal
      open={!!task}
      title="审核报告"
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="danger"
            onClick={() => pending && onSave(pending.id, false, comment)}
          >
            驳回
          </Button>
          <Button
            variant="primary"
            onClick={() => pending && onSave(pending.id, true, comment)}
          >
            通过
          </Button>
        </>
      }
    >
      {!pending ? (
        <div style={{ fontSize: "var(--fs-13)" }}>没有待审核报告。</div>
      ) : (
        <>
          <Info label="报告名称" value={pending.name} />
          <div style={{ height: 10 }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: "var(--fs-13)",
            }}
          >
            <span style={{ color: "#667085", minWidth: 72 }}>附件</span>
            <span>{pending.fileName ?? "—"}</span>
            {pending.fileName && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPreviewReport?.(pending)}
              >
                预览
              </Button>
            )}
          </div>
          <div style={{ height: 10 }} />
          <Field label="审核意见（驳回时必填）">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              style={{ ...inputStyle, height: "auto", padding: 10 }}
            />
          </Field>
        </>
      )}
    </Modal>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: "var(--fs-13)",
            fontWeight: 650,
            color: "var(--color-text-1)",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: "var(--fs-12)", color: "#667085" }}>
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div
        style={{ fontSize: "var(--fs-12)", color: "#9CA3AF", marginBottom: 4 }}
      >
        {label}
      </div>
      <div style={{ fontSize: "var(--fs-13)", color: "var(--color-text-1)" }}>
        {value}
      </div>
    </div>
  )
}

function Banner({
  color,
  children,
}: {
  color: "danger" | "warning" | "info"
  children: React.ReactNode
}) {
  const map = {
    danger: { bg: "#FEECEC", bd: "#FECACA", fg: "#C73A3A" },
    warning: { bg: "#FEF3E2", bd: "#FDE68A", fg: "#C77A16" },
    info: { bg: "#EBF2FE", bd: "#BFDBFE", fg: "#2F6BCE" },
  }[color]
  return (
    <div
      style={{
        padding: "10px 12px",
        background: map.bg,
        border: `1px solid ${map.bd}`,
        borderRadius: 6,
        fontSize: "var(--fs-13)",
        color: map.fg,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  )
}

function patch<T>(list: T[], idx: number, part: Partial<T>): T[] {
  return list.map((item, i) => (i === idx ? { ...item, ...part } : item))
}

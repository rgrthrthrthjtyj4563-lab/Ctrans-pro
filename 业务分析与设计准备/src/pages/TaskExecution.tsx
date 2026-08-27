import { Fragment, useEffect, useMemo, useState } from 'react';
import { Plus, Eye, Wrench } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { Button } from '../components/Button';
import { StatusTag, Tag } from '../components/StatusTag';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import {
  DEMO_PROVIDER,
  DEMO_HOLDER,
  displayStatusOf,
  formatCNY,
  formatCoverage,
  hasPromoItems,
  hasReportItems,
  progressCountOf,
  remainingOfTask,
  settleableMonths,
  settleableWorkGroups,
  useTaskData,
  workloadStageOf,
} from '../context/TaskDataContext';
import { formatCNYUpper, RECON_STATUS_OPTIONS, TASK_STATUS_OPTIONS } from '../constants';
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
} from '../domain/taskV4';
import { workGroups, specialists, providers } from '../data/mockData';
import type {
  NavFocus, NavigateFn, PriceAdjustLog, Role, RoundingLog, ServiceItem, SettlementLine,
  SettlementPeriod, Task, WorkgroupSplit, WorkloadAssign, WorkloadProgress,
} from '../types';
import { SETTLEMENT_DECLARATION_TEXT, SETTLEMENT_DECLARATION_VERSION } from '../types';
import type { ToastMessage } from '../components/Toast';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole: Role;
  navFocus?: NavFocus;
  navigate: NavigateFn;
}

const PAGE_SIZE = 10;
const MEMORY_KEY = 'by-create-task-memory';
const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px', fontSize: 13,
  border: '1px solid #E5E7EB', borderRadius: 6, outline: 'none', fontFamily: 'inherit',
};
const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
  color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '12px', fontSize: 13, color: '#1F2937', borderBottom: '1px solid #F3F4F6', verticalAlign: 'top',
};

export type DetailTab = 'plan' | 'exec' | 'settle' | 'log' | 'report';

type PersonalAllocationRow = Pick<WorkloadAssign, 'id' | 'specialist' | 'itemName' | 'workload' | 'progress'> & {
  category?: string;
  amount?: number;
  done?: number;
  completedAt?: string;
};

const MAIN_STATUS_COLOR: Record<string, 'warning' | 'brand' | 'danger' | 'success' | 'default'> = {
  '待服务商确认': 'warning',
  '执行中': 'brand',
  '待药厂处理': 'danger',
  '已结算': 'success',
  '已撤销': 'default',
};

function taskStatusLabel(task: Task) {
  if (task.taskStatus === '待确认') return '待确认';
  if (task.taskStatus === '已撤销') return '已撤销';
  if (task.reconStatus === '已结算' || task.taskStatus === '已结算') return '已通过';
  return '执行中';
}

function taskStatusColor(task: Task): 'warning' | 'brand' | 'danger' | 'success' | 'default' {
  if (task.taskStatus === '待确认') return 'warning';
  if (task.taskStatus === '已撤销') return 'default';
  if (task.reconStatus === '已结算' || task.taskStatus === '已结算') return 'success';
  return 'brand';
}

function reconStatusLabel(task: Task) {
  if (task.reconStatus === '未发起') return '—';
  return task.reconStatus === '已结算' ? '已对账' : '对账中';
}

function reconStatusColor(task: Task): 'warning' | 'brand' | 'danger' | 'success' | 'default' {
  if (task.reconStatus === '对账中') return 'warning';
  if (task.reconStatus === '已结算') return 'success';
  return 'default';
}

export function TaskExecution({ addToast, currentRole, navFocus, navigate }: Props) {
  const ctx = useTaskData();
  const {
    tasks, varieties,
    revokeTask, confirmTask, unconfirmProvider, splitToWorkgroup, assignWorkload,
    uploadReport, reviewReport, startSettlement, confirmSettlement,
    completeSettlement, uploadPaymentVoucher,
    rollbackStartSettlement, rollbackConfirmSettlement, rollbackCompleteSettlement,
  } = ctx;

  const isSales = currentRole === '药厂销售部门';
  const isProvider = currentRole === '服务提供商';
  const isCompliance = currentRole === '药厂合规部门';

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [highlightId, setHighlightId] = useState<string | undefined>(navFocus?.taskId);

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Task | null>(null);
  const [tab, setTab] = useState<DetailTab>('plan');

  const [revokeTarget, setRevokeTarget] = useState<Task | null>(null);
  const [unconfirmTarget, setUnconfirmTarget] = useState<Task | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null);
  const [rollbackStartTarget, setRollbackStartTarget] = useState<Task | null>(null);
  const [rollbackConfirmTarget, setRollbackConfirmTarget] = useState<Task | null>(null);
  const [rollbackCompleteTarget, setRollbackCompleteTarget] = useState<Task | null>(null);
  const [splitTask, setSplitTask] = useState<Task | null>(null);
  const [assignTask, setAssignTask] = useState<Task | null>(null);
  const [settleTask, setSettleTask] = useState<Task | null>(null);
  const [confirmBillTask, setConfirmBillTask] = useState<Task | null>(null);
  const [historyTask, setHistoryTask] = useState<Task | null>(null);
  const [voucherTask, setVoucherTask] = useState<Task | null>(null);
  const [reportUploadTask, setReportUploadTask] = useState<Task | null>(null);
  const [reviewTask, setReviewTask] = useState<Task | null>(null);

  useEffect(() => {
    if (navFocus?.taskId) {
      setHighlightId(navFocus.taskId);
      const t = tasks.find((x) => x.id === navFocus.taskId);
      if (t) setDetail(t);
    }
  }, [navFocus?.taskId, tasks]);

  const live = (t: Task | null) => (t ? tasks.find((x) => x.id === t.id) ?? t : null);

  const visible = useMemo(() => {
    return tasks.filter((t) => {
      if (isProvider && t.provider !== DEMO_PROVIDER) return false;
      if (applied.taskStatus && t.taskStatus !== applied.taskStatus) return false;
      if (applied.reconStatus && t.reconStatus !== applied.reconStatus) return false;
      if (applied.variety && !t.varieties.includes(applied.variety)) return false;
      if (applied.provider && t.provider !== applied.provider) return false;
      if (applied.startDate && t.endDate < applied.startDate) return false;
      if (applied.endDate && t.startDate > applied.endDate) return false;
      return true;
    });
  }, [tasks, applied, isProvider]);

  const pageData = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openDetail(t: Task, nextTab: DetailTab = 'plan') {
    setDetail(t);
    setTab(nextTab);
  }

  /** 当前角色的下一步动作（列表只放一个按钮，其余进详情） */
  function renderNextAction(t: Task) {
    const settleable = settleableMonths(t);
    if (t.taskStatus === '待确认') {
      if (isProvider) {
        return <Button variant="primary" size="sm" onClick={() => {
          const r = confirmTask(t.id);
          if (r.ok) addToast({ type: 'success', title: '任务已确认', description: `${t.taskNo} 进入执行中，计划与价目表快照已锁定` });
          else addToast({ type: 'error', title: '无法确认', description: r.error });
        }}>确认任务</Button>;
      }
      if (isSales) {
        return <Button variant="outline" size="sm" onClick={() => setRevokeTarget(t)}>撤销任务</Button>;
      }
    }
    if (t.reconStatus === '对账中' && isSales) {
      return <Button variant="primary" size="sm" onClick={() => setConfirmBillTask(t)}>确认结算单</Button>;
    }
    if (t.taskStatus === '执行中' && isSales && t.reports.some((r) => r.status === '待审核')) {
      return <Button variant="primary" size="sm" onClick={() => { setReviewTask(t); openDetail(t, 'report'); }}>审核报告</Button>;
    }
    if (isSales && canUnconfirmProvider(t)) {
      return <Button variant="outline" size="sm" onClick={() => setUnconfirmTarget(t)}>撤回服务商确认</Button>;
    }
    if (isSales && canCompleteSettlement(t)) {
      return <Button variant="outline" size="sm" onClick={() => setCompleteTarget(t)}>结算完结</Button>;
    }
    if (isSales && canRollbackComplete(t)) {
      return <Button variant="outline" size="sm" onClick={() => setRollbackCompleteTarget(t)}>回退结算完结</Button>;
    }
    if (t.taskStatus === '执行中' && isProvider) {
      if (hasPromoItems(t) && t.workgroupSplits.length === 0) {
        return <Button variant="primary" size="sm" onClick={() => { setSplitTask(t); openDetail(t, 'exec'); }}>拆分任务包</Button>;
      }
      if (hasPromoItems(t) && t.workloadAssigns.length === 0) {
        return <Button variant="primary" size="sm" onClick={() => { setAssignTask(t); openDetail(t, 'exec'); }}>分配工作量</Button>;
      }
      if (settleable.length > 0) {
        return <Button variant="primary" size="sm" onClick={() => { setSettleTask(t); openDetail(t, 'settle'); }}>发起结算</Button>;
      }
      if (hasReportItems(t) && t.reports.length === 0) {
        return <Button variant="primary" size="sm" onClick={() => { setReportUploadTask(t); openDetail(t, 'report'); }}>上传报告</Button>;
      }
    }
    return <Button variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => openDetail(t)}>查看</Button>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="任务执行"
        description="药厂创建发包任务，服务商确认后执行；任务金额按统一价目表及比例自动计算。"
        actions={isSales ? (
          <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>创建任务</Button>
        ) : undefined}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <FilterBar
          fields={[
            { id: 'taskStatus', label: '任务状态', type: 'select', options: TASK_STATUS_OPTIONS },
            { id: 'reconStatus', label: '对账状态', type: 'select', options: RECON_STATUS_OPTIONS },
            { id: 'variety', label: '品种', type: 'select', options: varieties.map((v) => ({ value: v.tradeName, label: v.tradeName })) },
            { id: 'provider', label: '服务提供方', type: 'select', options: providers.map((p) => ({ value: p, label: p })) },
            { id: 'startDate', label: '开始时间', type: 'date' },
            { id: 'endDate', label: '结束时间', type: 'date' },
          ]}
          values={filters}
          onChange={(id, value) => setFilters((f) => ({ ...f, [id]: value }))}
          onSearch={() => { setApplied({ ...filters }); setPage(1); }}
          onReset={() => { setFilters({}); setApplied({}); setPage(1); }}
        />

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1380 }}>
            <thead>
              <tr>
                {['药厂名称', '服务提供商名称', '所属品种', '推广金额', '推广时段', '预算金额', '已结算金额', '剩余可结算金额', '任务状态', '对账状态', '操作'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr><td colSpan={11}><EmptyState title="暂无任务" description="药厂销售部门可创建任务；服务商确认后进入执行。" /></td></tr>
              ) : pageData.map((t) => {
                const focused = highlightId === t.id;
                const prog = progressCountOf(t);
                const display = displayStatusOf(t);
                return (
                  <tr key={t.id} style={{ background: focused ? '#E8F4F1' : undefined }}>
                    <td style={td}>{DEMO_HOLDER}</td>
                    <td style={td}>{t.provider}</td>
                    <td style={td}>{formatCoverage(t.varieties)}</td>
                    <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{formatCNY(t.planAmount)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{t.startDate} ~ {t.endDate}</td>
                    <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>
                      {t.recommendedConfigured ? formatCNY(t.recommendedAmount) : '未配置预算'}
                    </td>
                    <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(t.settledAmount)}</td>
                    <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>
                      {t.remainingVoided ? `${formatCNY(0)}（已作废）` : formatCNY(remainingOfTask(t))}
                    </td>
                    <td style={td}>
                      <Tag label={taskStatusLabel(t)} color={taskStatusColor(t)} />
                    </td>
                    <td style={td}><Tag label={reconStatusLabel(t)} color={reconStatusColor(t)} /></td>
                    <td style={td}>{renderNextAction(t)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={visible.length} onChange={setPage} />
      </div>

      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        addToast={addToast}
      />

      <TaskDetailModal
        task={live(detail)}
        tab={tab}
        onTab={setTab}
        onClose={() => setDetail(null)}
        isSales={isSales}
        isProvider={isProvider}
        isCompliance={isCompliance}
        navigate={navigate}
        onSplit={() => detail && setSplitTask(detail)}
        onAssign={() => detail && setAssignTask(detail)}
        onSettle={() => detail && setSettleTask(detail)}
        onConfirmBill={() => detail && setConfirmBillTask(detail)}
        onReview={() => detail && setReviewTask(detail)}
        onUploadReport={() => detail && setReportUploadTask(detail)}
        onHistory={() => detail && setHistoryTask(detail)}
        onVoucher={() => detail && setVoucherTask(detail)}
        onComplete={() => detail && setCompleteTarget(detail)}
        onUnconfirm={() => detail && setUnconfirmTarget(detail)}
        onRollbackStart={() => detail && setRollbackStartTarget(detail)}
        onRollbackConfirm={() => detail && setRollbackConfirmTarget(detail)}
        onRollbackComplete={() => detail && setRollbackCompleteTarget(detail)}
      />

      <SplitModal
        task={live(splitTask)}
        onClose={() => setSplitTask(null)}
        onSave={(splits) => {
          if (!splitTask) return;
          const r = splitToWorkgroup(splitTask.id, splits);
          if (!r.ok) addToast({ type: 'error', title: '拆解失败', description: r.error });
          else { addToast({ type: 'success', title: '已拆分到工作组' }); setSplitTask(null); }
        }}
      />

      <AssignModal
        task={live(assignTask)}
        onClose={() => setAssignTask(null)}
        onSave={(rows) => {
          if (!assignTask) return;
          const r = assignWorkload(assignTask.id, rows);
          if (!r.ok) addToast({ type: 'error', title: '分配失败', description: r.error });
          else { addToast({ type: 'success', title: '已分配工作量到服务专员' }); setAssignTask(null); }
        }}
      />

      <SettleModal
        task={live(settleTask)}
        onClose={() => setSettleTask(null)}
        onSave={(serviceMonth, workGroup, workloadIds) => {
          if (!settleTask) return;
          const r = startSettlement(settleTask.id, serviceMonth, workGroup, workloadIds);
          if (!r.ok) addToast({ type: 'error', title: '发起失败', description: r.error });
          else { addToast({ type: 'success', title: '已发起结算', description: `${workGroup} · ${serviceMonth}，对账状态变为对账中` }); setSettleTask(null); }
        }}
      />

      <ConfirmBillModal
        task={live(confirmBillTask)}
        onClose={() => setConfirmBillTask(null)}
        onSave={(billId, lines, declaration) => {
          if (!confirmBillTask) return;
          const r = confirmSettlement(confirmBillTask.id, billId, lines, declaration);
          if (!r.ok) addToast({ type: 'error', title: '确认失败', description: r.error });
          else {
            const remain = r.data ? remainingOfTask(r.data) : 0;
            addToast({
              type: remain > 0 ? 'warning' : 'success',
              title: '结算单已确认并立即生效',
              description: remain > 0 ? `剩余可结算 ${formatCNY(remain)}，可择期结算或结算完结` : '已确认金额已计入已结算',
            });
            setConfirmBillTask(null);
          }
        }}
      />

      <HistoryModal task={live(historyTask)} onClose={() => setHistoryTask(null)} />

      <VoucherModal
        task={live(voucherTask)}
        onClose={() => setVoucherTask(null)}
        onSave={(billId, name) => {
          if (!voucherTask) return;
          const r = uploadPaymentVoucher(voucherTask.id, billId, name);
          if (!r.ok) addToast({ type: 'error', title: '上传失败', description: r.error });
          else { addToast({ type: 'success', title: '付款凭证已上传' }); setVoucherTask(null); }
        }}
      />

      <ReportUploadModal
        task={live(reportUploadTask)}
        onClose={() => setReportUploadTask(null)}
        onSave={(name) => {
          if (!reportUploadTask) return;
          const r = uploadReport(reportUploadTask.id, name);
          if (!r.ok) addToast({ type: 'error', title: '上传失败', description: r.error });
          else { addToast({ type: 'success', title: '报告已上传', description: '状态：待审核' }); setReportUploadTask(null); }
        }}
      />

      <ReviewModal
        task={live(reviewTask)}
        onClose={() => setReviewTask(null)}
        onSave={(reportId, pass, comment) => {
          if (!reviewTask) return;
          const r = reviewReport(reviewTask.id, reportId, pass, comment);
          if (!r.ok) addToast({ type: 'error', title: '审核失败', description: r.error });
          else { addToast({ type: 'success', title: pass ? '报告已通过' : '报告已驳回' }); setReviewTask(null); }
        }}
      />

      <ConfirmDialog
        open={!!revokeTarget}
        title="撤销任务"
        description={revokeTarget ? `撤销后 ${revokeTarget.taskNo} 变为已撤销，不再计入统计。` : ''}
        confirmLabel="撤销任务"
        variant="danger"
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) {
            const r = revokeTask(revokeTarget.id);
            if (r.ok) addToast({ type: 'success', title: '任务已撤销', description: revokeTarget.taskNo });
            else addToast({ type: 'error', title: '无法撤销', description: r.error });
          }
          setRevokeTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!completeTarget}
        title="结算完结"
        description={completeTarget ? `结束后任务进入终态。剩余可结算金额 ${formatCNY(remainingOfTask(completeTarget))} 将作废归零，不再计入统计。` : ''}
        impact="结算完结后可通过「回退结算完结」恢复执行中；业务数据不会物理删除。"
        confirmLabel="结算完结"
        variant="danger"
        onCancel={() => setCompleteTarget(null)}
        onConfirm={() => {
          if (completeTarget) {
            const r = completeSettlement(completeTarget.id);
            if (r.ok) addToast({ type: 'success', title: '已结算完结', description: completeTarget.taskNo });
            else addToast({ type: 'error', title: '无法完结', description: r.error });
          }
          setCompleteTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!unconfirmTarget}
        title="撤回服务商确认"
        description={unconfirmTarget ? `${unconfirmTarget.taskNo} 尚无分配、执行、报告或结算数据，撤回后回到待服务商确认。` : ''}
        confirmLabel="撤回确认"
        variant="danger"
        onCancel={() => setUnconfirmTarget(null)}
        onConfirm={() => {
          if (unconfirmTarget) {
            const r = unconfirmProvider(unconfirmTarget.id);
            if (r.ok) addToast({ type: 'success', title: '已撤回服务商确认', description: unconfirmTarget.taskNo });
            else addToast({ type: 'error', title: '无法撤回', description: r.error });
          }
          setUnconfirmTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!rollbackStartTarget}
        title="回退发起结算"
        description={rollbackStartTarget ? `将逻辑作废最新有效结算单 ${latestValidBill(rollbackStartTarget)?.billNo ?? ''}，任务量解除占用。` : ''}
        impact="不物理删除结算单，仅作废并留痕。"
        confirmLabel="回退发起结算"
        variant="danger"
        onCancel={() => setRollbackStartTarget(null)}
        onConfirm={() => {
          if (rollbackStartTarget) {
            const bill = latestValidBill(rollbackStartTarget);
            const r = bill ? rollbackStartSettlement(rollbackStartTarget.id, bill.id) : { ok: false, error: '没有可回退结算单' };
            if (r.ok) addToast({ type: 'success', title: '已回退发起结算' });
            else addToast({ type: 'error', title: '无法回退', description: r.error });
          }
          setRollbackStartTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!rollbackConfirmTarget}
        title="回退结算确认"
        description={rollbackConfirmTarget ? `将最新有效结算单 ${latestValidBill(rollbackConfirmTarget)?.billNo ?? ''} 恢复为对账中。` : ''}
        impact="已确认金额从已结算汇总中扣回；不物理删除。"
        confirmLabel="回退结算确认"
        variant="danger"
        onCancel={() => setRollbackConfirmTarget(null)}
        onConfirm={() => {
          if (rollbackConfirmTarget) {
            const bill = latestValidBill(rollbackConfirmTarget);
            const r = bill ? rollbackConfirmSettlement(rollbackConfirmTarget.id, bill.id) : { ok: false, error: '没有可回退结算单' };
            if (r.ok) addToast({ type: 'success', title: '已回退结算确认' });
            else addToast({ type: 'error', title: '无法回退', description: r.error });
          }
          setRollbackConfirmTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!rollbackCompleteTarget}
        title="回退结算完结"
        description={rollbackCompleteTarget ? `${rollbackCompleteTarget.taskNo} 将恢复为执行中，剩余可结算金额重新计算。` : ''}
        confirmLabel="回退结算完结"
        variant="danger"
        onCancel={() => setRollbackCompleteTarget(null)}
        onConfirm={() => {
          if (rollbackCompleteTarget) {
            const r = rollbackCompleteSettlement(rollbackCompleteTarget.id);
            if (r.ok) addToast({ type: 'success', title: '已回退结算完结' });
            else addToast({ type: 'error', title: '无法回退', description: r.error });
          }
          setRollbackCompleteTarget(null);
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontWeight: 500 }}>{label}</div>
      {children}
    </label>
  );
}

// ─── 创建任务：对齐现网表单（任务名称自动 + 服务地区单选 + 三张服务表混合填写） ───

interface PriceRow {
  category: string;
  name: string;
  unitPrice: number;
  unit: string;
}

function ChipSelect({
  options, value, onChange, placeholder,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.length === 0 ? (
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>{placeholder || '无可选项'}</span>
      ) : options.map((opt) => {
        const on = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== opt) : [...value, opt])}
            style={{
              padding: '4px 10px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
              border: on ? '1px solid #176B5B' : '1px solid #E5E7EB',
              background: on ? '#E8F4F1' : '#fff',
              color: on ? '#176B5B' : '#344054',
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

interface DraftItem {
  variety: string;
  region: string;
  category: ServiceItem['category'];
  name: string;
  unit: string;
  suggestedUnitPrice: number;
  unitPrice: number;
  qty: number;
  amount: number;
  suggestedAmount: number;
  adjustReason: string;
}

const CREATE_STEPS = ['基本信息', '任务详情'];

function CreateTaskModal({
  open, onClose, addToast,
}: {
  open: boolean;
  onClose: () => void;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}) {
  const {
    varieties, priceBooks, budgetPlans, auths, unitPriceAdjustRule, createTask, varietiesOf, regionsOf,
  } = useTaskData();
  const memory = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || 'null'); } catch { return null; }
  }, []);

  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState(memory?.provider ?? '');
  const [pickedVarieties, setPickedVarieties] = useState<string[]>(memory?.varieties ?? []);
  const [pickedRegions, setPickedRegions] = useState<string[]>(memory?.regions ?? []);
  const [startDate, setStartDate] = useState(memory?.startDate ?? '2026-09-01');
  const [endDate, setEndDate] = useState(memory?.endDate ?? '2026-09-30');
  const [remember, setRemember] = useState(!!memory);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [periods, setPeriods] = useState<Omit<SettlementPeriod, 'id'>[]>(defaultSettlementPeriods('2026-09-01', '2026-09-30'));
  const [roundingLogs, setRoundingLogs] = useState<RoundingLog[]>([]);
  const [priceAdjustLogs, setPriceAdjustLogs] = useState<PriceAdjustLog[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [sectionAmounts, setSectionAmounts] = useState({ promo: 0, analysis: 0 });
  const [error, setError] = useState('');

  const varietyOpts = provider ? varietiesOf(provider) : [];
  const regionOpts = provider ? regionsOf(provider, pickedVarieties.length ? pickedVarieties : undefined) : [];
  const pickedObjs = pickedVarieties.map((n) => varieties.find((v) => v.tradeName === n)).filter((v): v is NonNullable<typeof v> => !!v);
  const lockedBook = pickedObjs[0] ? varietyPriceBook(pickedObjs[0], priceBooks) : undefined;

  const rec = recommendedBudget({
    provider, varieties: pickedVarieties, regions: pickedRegions, startDate, endDate,
    categories: ['市场推广服务', '分析报告服务'],
    plans: budgetPlans,
  });
  const planTotal = drafts.filter((d) => d.amount > 0).reduce((s, d) => s + d.amount, 0);
  const budgetDiff = rec.configured ? totalAmount - rec.amount : 0;

  function rulesOfBook() {
    if (!lockedBook) return { promo: [] as PriceRow[], analysis: [] as PriceRow[] };
    return {
      promo: lockedBook.rules.filter((r) => r.category === '市场推广服务').map((r) => ({ category: r.category, name: r.name, unitPrice: r.amount, unit: r.unit })),
      analysis: lockedBook.rules.filter((r) => r.category === '分析报告服务').map((r) => ({ category: r.category, name: r.name, unitPrice: r.amount, unit: r.unit })),
    };
  }

  function fixedRegionsOf(vs: string[]) {
    if (!provider || !vs.length) return [];
    const perVariety = vs.map((name) => auths.filter((a) => a.provider === provider && a.varietyName === name));
    if (perVariety.some((rows) => rows.length === 0)) return [];
    const candidates = [...new Set(perVariety.flatMap((rows) => rows.flatMap((row) => row.regions.filter((region) => region !== '全国'))))];
    const shared = candidates.filter((region) => perVariety.every((rows) => rows.some((row) => row.regions.includes('全国') || row.regions.includes(region))));
    return shared.length ? shared : perVariety.every((rows) => rows.some((row) => row.regions.includes('全国'))) ? ['全国'] : [];
  }

  function splitByRatio(total: number) {
    const { promo, analysis } = rulesOfBook();
    const promoWeight = promo.reduce((sum, row) => sum + (lockedBook?.rules.find((rule) => rule.id === row.name || (rule.category === row.category && rule.name === row.name))?.ratio ?? 0), 0);
    const analysisWeight = analysis.reduce((sum, row) => sum + (lockedBook?.rules.find((rule) => rule.id === row.name || (rule.category === row.category && rule.name === row.name))?.ratio ?? 0), 0);
    const all = promoWeight + analysisWeight || 1;
    const promoAmount = Math.round(total * promoWeight / all);
    return { promo: promoAmount, analysis: Math.max(0, Math.round(total - promoAmount)) };
  }

  function rebuildDrafts(vs: string[], rs: string[], amounts = sectionAmounts) {
    const book = vs[0] ? varietyPriceBook(varieties.find((v) => v.tradeName === vs[0]), priceBooks) : undefined;
    if (!book || !rs.length) {
      setDrafts([]);
      return;
    }
    const rows = [
      ...book.rules.filter((r) => r.category === '市场推广服务'),
      ...book.rules.filter((r) => r.category === '分析报告服务'),
    ];
    const pairCount = vs.length * rs.length;
    const next: DraftItem[] = [];
    vs.forEach((variety) => {
      rs.forEach((region) => {
        rows.forEach((r) => {
          const sectionRules = rows.filter((row) => row.category === r.category);
          const sectionWeight = sectionRules.reduce((sum, row) => sum + row.ratio, 0) || 1;
          const sectionAmount = r.category === '市场推广服务' ? amounts.promo : amounts.analysis;
          const requested = sectionAmount * r.ratio / sectionWeight / pairCount;
          const calculated = nearestTier(requested, r.amount);
          next.push({
            variety, region, category: r.category, name: r.name, unit: r.unit,
            suggestedUnitPrice: r.amount, unitPrice: r.amount,
            qty: calculated.qty, amount: calculated.amount,
            suggestedAmount: calculated.amount, adjustReason: '',
          });
        });
      });
    });
    setDrafts(next);
  }

  function applyTotalAmount(value: number) {
    const next = splitByRatio(Math.max(0, value));
    setTotalAmount(Math.max(0, value));
    setSectionAmounts(next);
    rebuildDrafts(pickedVarieties, pickedRegions, next);
  }

  function applySectionAmount(section: 'promo' | 'analysis', value: number) {
    const next = { ...sectionAmounts, [section]: Math.max(0, value) };
    setSectionAmounts(next);
    setTotalAmount(next.promo + next.analysis);
    rebuildDrafts(pickedVarieties, pickedRegions, next);
  }

  function patchDraft(idx: number, part: Partial<DraftItem>, source: 'price' | 'amount' | 'qty') {
    setDrafts((prev) => {
      const cur = prev[idx];
      if (!cur) return prev;
      const next = { ...cur, ...part };
      const beforeAmount = cur.amount;
      const beforeQty = source === 'amount' && next.unitPrice > 0 ? cur.amount / cur.unitPrice : cur.qty;
      if (source === 'qty') {
        next.amount = Math.round(next.qty * next.unitPrice);
      } else if (source === 'price') {
        next.amount = Math.round(next.qty * next.unitPrice);
      }
      const tier = nearestTier(next.amount, next.unitPrice);
      if (tier.rounded && next.amount > 0) {
        const log: RoundingLog = {
          id: `RND-${Date.now()}`,
          time: new Date().toISOString().slice(0, 16).replace('T', ' '),
          variety: next.variety,
          region: next.region,
          itemName: next.name,
          beforeAmount,
          beforeQty,
          unitPrice: next.unitPrice,
          afterAmount: tier.amount,
          afterQty: tier.qty,
          reason: tier.reason,
        };
        setRoundingLogs((logs) => [...logs, log]);
        addToast({ type: 'warning', title: '已按最近档位取整', description: roundingToastText(log) });
        next.qty = tier.qty;
        next.amount = tier.amount;
      } else if (!tier.rounded && source !== 'qty') {
        next.qty = tier.qty;
        next.amount = next.amount;
      }
      if (next.suggestedAmount === 0 && next.qty > 0 && next.unitPrice === next.suggestedUnitPrice) {
        next.suggestedAmount = next.qty * next.suggestedUnitPrice;
      }
      if (next.unitPrice !== next.suggestedUnitPrice || next.amount !== next.suggestedAmount) {
        if (next.adjustReason) {
          setPriceAdjustLogs((logs) => [...logs.filter((l) => !(l.variety === next.variety && l.region === next.region && l.itemName === next.name)), {
            id: `ADJ-${next.variety}-${next.region}-${next.name}`,
            time: new Date().toISOString().slice(0, 16).replace('T', ' '),
            variety: next.variety, region: next.region, itemName: next.name,
            suggestedUnitPrice: next.suggestedUnitPrice, actualUnitPrice: next.unitPrice,
            suggestedAmount: next.suggestedAmount, actualAmount: next.amount, reason: next.adjustReason,
          }]);
        }
      }
      return prev.map((item, i) => (i === idx ? next : item));
    });
  }

  function toggleVariety(name: string) {
    const v = varieties.find((x) => x.tradeName === name);
    const book = varietyPriceBook(v, priceBooks);
    if (!isPriceBookActive(book)) {
      setError(`品种「${name}」没有有效价目表，无法创建任务`);
      return;
    }
    if (pickedVarieties.includes(name)) {
      const next = pickedVarieties.filter((x) => x !== name);
      const regions = fixedRegionsOf(next);
      setPickedVarieties(next);
      setPickedRegions(regions);
      rebuildDrafts(next, regions);
      setError('');
      return;
    }
    if (lockedBook && book && book.id !== lockedBook.id) {
      setError(PRICE_BOOK_MISMATCH_MSG);
      addToast({ type: 'error', title: '价目表不一致', description: `${name} 使用「${book.name}」，与当前任务「${lockedBook.name}」不同` });
      return;
    }
    const next = [...pickedVarieties, name];
    const regions = fixedRegionsOf(next);
    setPickedVarieties(next);
    setPickedRegions(regions);
    rebuildDrafts(next, regions);
    setError('');
  }

  function goNext() {
    setError('');
    if (step === 0) {
      if (!provider) return setError('请选择服务提供商');
      if (!pickedVarieties.length) return setError('请选择品种');
      if (!startDate || !endDate) return setError('请选择推广时间');
      if (endDate < startDate) return setError('结束日期不能早于开始日期');
      const regions = fixedRegionsOf(pickedVarieties);
      if (!regions.length) return setError('所选品种在该服务商下没有共同授权的推广地区，无法创建同一任务');
      const missing = pickedObjs.find((v) => !isPriceBookActive(varietyPriceBook(v, priceBooks)));
      if (missing) return setError(`品种「${missing.tradeName}」没有有效价目表，无法创建任务`);
      if (new Set(pickedObjs.map((v) => v.activePriceBookId)).size > 1) return setError(PRICE_BOOK_MISMATCH_MSG);
      const initialRec = recommendedBudget({
        provider, varieties: pickedVarieties, regions, startDate, endDate,
        categories: ['市场推广服务', '分析报告服务'], plans: budgetPlans,
      });
      const initialTotal = initialRec.configured ? initialRec.amount : 0;
      const amounts = splitByRatio(initialTotal);
      setPickedRegions(regions);
      setTotalAmount(initialTotal);
      setSectionAmounts(amounts);
      rebuildDrafts(pickedVarieties, regions, amounts);
      setPeriods(defaultSettlementPeriods(startDate, endDate));
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!pickedVarieties.length) return setError('请选择品种');
      const missing = pickedObjs.find((v) => !isPriceBookActive(varietyPriceBook(v, priceBooks)));
      if (missing) return setError(`品种「${missing.tradeName}」没有有效价目表，无法创建任务`);
      const ids = [...new Set(pickedObjs.map((v) => v.activePriceBookId))];
      if (ids.length > 1) return setError(PRICE_BOOK_MISMATCH_MSG);
    }
    if (step === 2) {
      if (!pickedRegions.length) return setError('请选择服务地区');
      for (const vn of pickedVarieties) {
        for (const rg of pickedRegions) {
          const ok = auths.some((a) => a.provider === provider && a.varietyName === vn && (a.regions.includes('全国') || a.regions.includes(rg) || rg === '全国'));
          if (!ok) return setError(`${provider} 未获得「${vn}」在「${rg}」的授权`);
        }
      }
      rebuildDrafts(pickedVarieties, pickedRegions);
    }
    if (step === 4) {
      if (!drafts.some((d) => d.amount > 0)) return setError('请至少填写一项服务项目的推广金额');
      for (const d of drafts.filter((x) => x.amount > 0)) {
        const rangeErr = unitPriceOutOfRange(d.unitPrice, d.suggestedUnitPrice, unitPriceAdjustRule);
        if (rangeErr) return setError(`${d.variety} / ${d.name}：${rangeErr}`);
        if ((d.unitPrice !== d.suggestedUnitPrice || d.amount !== d.suggestedAmount) && !d.adjustReason.trim()) {
          return setError(`「${d.name}」（${d.variety}·${d.region}）偏离建议单价或建议金额，调整原因必填`);
        }
      }
    }
    setStep((s) => Math.min(s + 1, CREATE_STEPS.length - 1));
  }

  function submit() {
    if (totalAmount <= 0 || !drafts.some((draft) => draft.amount > 0)) {
      setError('请填写大于 0 的推广总金额');
      return;
    }
    const periodErr = validateSettlementPeriods(startDate, endDate, periods);
    if (periodErr) {
      setError(periodErr);
      return;
    }
    const items: ServiceItem[] = drafts.filter((d) => d.amount > 0).map((d, i) => ({
      id: `new-${i}`,
      variety: d.variety,
      region: d.region,
      category: d.category,
      name: d.name,
      unitPrice: d.unitPrice,
      unit: d.unit,
      qty: d.qty,
      amount: d.amount,
      suggestedUnitPrice: d.suggestedUnitPrice,
      suggestedAmount: d.suggestedAmount,
      adjustReason: d.adjustReason || undefined,
    }));
    const result = createTask({
      varieties: pickedVarieties, provider, regions: pickedRegions, startDate, endDate,
      serviceItems: items, settlementPeriods: periods, roundingLogs, priceAdjustLogs,
    });
    if (!result.ok) {
      setError(result.error || '创建失败');
      return;
    }
    if (remember) {
      localStorage.setItem(MEMORY_KEY, JSON.stringify({ provider, varieties: pickedVarieties, regions: pickedRegions, startDate, endDate }));
    } else {
      localStorage.removeItem(MEMORY_KEY);
    }
    addToast({
      type: result.warning ? 'warning' : 'success',
      title: '任务已创建',
      description: `${result.data?.taskNo} 进入待确认${result.warning ? `。${result.warning}` : ''}`,
    });
    setStep(0);
    setDrafts([]);
    setError('');
    onClose();
  }

  const { promo, analysis } = rulesOfBook();
  const survey: PriceRow[] = [];

  return (
    <Modal
      open={open}
      title="创建任务"
      onClose={onClose}
      width={980}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          {step > 0 && <Button variant="outline" onClick={() => { setError(''); setStep((s) => s - 1); }}>上一步</Button>}
          {step < CREATE_STEPS.length - 1
            ? <Button variant="primary" onClick={goNext}>下一步：任务详情</Button>
            : <Button variant="primary" onClick={submit}>创建任务</Button>}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {CREATE_STEPS.map((label, i) => (
          <div key={label} style={{
            padding: '4px 8px', borderRadius: 12, fontSize: 11, fontWeight: i === step ? 700 : 500,
            background: i === step ? '#E8F4F1' : i < step ? '#F3F4F6' : '#fff',
            color: i === step ? '#176B5B' : '#667085',
            border: i === step ? '1px solid #176B5B' : '1px solid #E5E7EB',
          }}>
            {i + 1}. {label}
          </div>
        ))}
      </div>
      {error && <Banner color="danger">{error}</Banner>}

      {step === 0 && (
        <Section title="基本信息">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="服务提供商（一个任务固定一个）">
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setPickedVarieties([]);
                  setPickedRegions([]);
                  setDrafts([]);
                }}
                style={inputStyle}
              >
                <option value="">请选择服务提供商</option>
                {providers.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="所属品种（可多选，同一价目表）">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 36, alignItems: 'center' }}>
                {varietyOpts.length === 0 ? (
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>{provider ? '该服务商暂无授权品种' : '请先选择服务提供商'}</span>
                ) : varietyOpts.map((name) => {
                  const variety = varieties.find((item) => item.tradeName === name);
                  const book = varietyPriceBook(variety, priceBooks);
                  const active = isPriceBookActive(book);
                  const mismatch = !!(lockedBook && book && book.id !== lockedBook.id);
                  const selected = pickedVarieties.includes(name);
                  const disabled = !active || mismatch;
                  return (
                    <button
                      key={name}
                      type="button"
                      title={!active ? '无有效价目表' : mismatch ? `与当前价目表不一致：${book?.name}` : book?.name}
                      disabled={disabled && !selected}
                      onClick={() => toggleVariety(name)}
                      style={{
                        padding: '4px 9px', borderRadius: 14, fontSize: 12,
                        border: selected ? '1px solid #176B5B' : '1px solid #E5E7EB',
                        background: selected ? '#E8F4F1' : '#fff',
                        color: disabled && !selected ? '#98A2B3' : selected ? '#176B5B' : '#344054',
                        cursor: disabled && !selected ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="推广时间（开始）"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} /></Field>
            <Field label="推广时间（结束）"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} /></Field>
            <Field label="推广地区">
              <div style={{ ...inputStyle, height: 'auto', minHeight: 36, display: 'flex', alignItems: 'center', background: '#F9FAFB', color: pickedRegions.length ? '#344054' : '#98A2B3' }}>
                {pickedRegions.length ? formatCoverage(pickedRegions) : '选择品种后，系统按授权范围自动带出'}
              </div>
            </Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 10 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            记住选项（下次创建自动带出服务商、品种与推广时间）
          </label>
        </Section>
      )}

      {step === 1 && (
        <TaskDetailsEditor
          priceBookName={lockedBook ? `${lockedBook.name} ${lockedBook.version}` : '—'}
          recommendedAmount={rec.configured ? rec.amount : undefined}
          totalAmount={totalAmount}
          sectionAmounts={sectionAmounts}
          rows={drafts}
          onTotalChange={applyTotalAmount}
          onSectionChange={applySectionAmount}
        />
      )}

      {step === 2 && (
        <Section title="授权校验（每个品种 × 地区）">
          <Field label="服务地区（多选省级）">
            <ChipSelect
              options={regionOpts}
              value={pickedRegions}
              onChange={(rs) => { setPickedRegions(rs); rebuildDrafts(pickedVarieties, rs); }}
              placeholder={provider ? '该服务商暂无授权地区' : '请先选择服务商'}
            />
          </Field>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr>
                <th style={th}>品种</th>
                {pickedRegions.map((r) => <th key={r} style={th}>{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {pickedVarieties.map((vn) => (
                <tr key={vn}>
                  <td style={td}>{vn}</td>
                  {pickedRegions.map((rg) => {
                    const ok = auths.some((a) => a.provider === provider && a.varietyName === vn && (a.regions.includes('全国') || a.regions.includes(rg)));
                    return <td key={rg} style={{ ...td, color: ok ? '#176B5B' : '#C73A3A' }}>{ok ? '已授权' : '未授权'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {step === 3 && (
        <Section title="预算推荐（仅提示，不阻断）">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Info label="预算推荐总金额" value={rec.configured ? formatCNY(rec.amount) : '未配置预算'} />
            <Info label="计划总金额" value={formatCNY(planTotal)} />
            <Info label="差额（计划 − 推荐）" value={rec.configured ? formatCNY(budgetDiff) : '—'} />
          </div>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 10 }}>{rec.detail}</div>
          {rec.configured && budgetDiff > 0 && (
            <Banner color="warning">计划总金额高于预算推荐，仅提示，允许创建。</Banner>
          )}
          {rec.configured && budgetDiff < 0 && (
            <Banner color="info">计划总金额低于预算推荐，仅提示，允许创建。</Banner>
          )}
          {!rec.configured && <Banner color="warning">未配置预算，允许创建。</Banner>}
        </Section>
      )}

      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Banner color="info">{unitPriceAdjustRule.hint}</Banner>
          {pickedVarieties.length === 0 || pickedRegions.length === 0 ? (
            <EmptyState title="请先完成品种和地区" description="服务项目按品种 × 地区落到价目表快照。" />
          ) : pickedVarieties.flatMap((vn) => pickedRegions.map((rg) => (
            <Section key={`${vn}-${rg}`} title={`${vn} · ${rg}`}>
              <ItemEditorTable
                rows={drafts}
                filterVariety={vn}
                filterRegion={rg}
                groups={[
                  { title: '市场推广服务', rows: promo },
                  { title: '调研与报告一体化服务 · 分析报告服务', rows: analysis },
                  { title: '调研与报告一体化服务 · 问卷调研与分析服务', rows: survey },
                ]}
                onPatch={patchDraft}
              />
            </Section>
          )))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 14, fontWeight: 700 }}>
            预算推荐 {rec.configured ? formatCNY(rec.amount) : '未配置'} · 计划总金额 {formatCNY(planTotal)} · 差额 {rec.configured ? formatCNY(budgetDiff) : '—'}
          </div>
        </div>
      )}

      {step === 5 && (
        <Section title="药厂预设结算周期">
          <div style={{ fontSize: 12, color: '#667085', marginBottom: 10 }}>
            必须连续覆盖整个推广期（{startDate} ~ {endDate}），不得重叠、不得空档。服务商只能针对这些周期发起结算。
          </div>
          {periods.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
              <input value={p.name} onChange={(e) => setPeriods(patch(periods, i, { name: e.target.value }))} style={inputStyle} />
              <input type="date" value={p.startDate} onChange={(e) => setPeriods(patch(periods, i, { startDate: e.target.value }))} style={inputStyle} />
              <input type="date" value={p.endDate} onChange={(e) => setPeriods(patch(periods, i, { endDate: e.target.value }))} style={inputStyle} />
              <Button variant="ghost" size="sm" onClick={() => setPeriods(periods.filter((_, j) => j !== i))}>删</Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPeriods([...periods, { name: `周期${periods.length + 1}`, startDate, endDate }])}
          >
            新增周期
          </Button>
        </Section>
      )}
    </Modal>
  );
}

function TaskDetailsEditor({
  priceBookName, recommendedAmount, totalAmount, sectionAmounts, rows, onTotalChange, onSectionChange,
}: {
  priceBookName: string;
  recommendedAmount?: number;
  totalAmount: number;
  sectionAmounts: { promo: number; analysis: number };
  rows: DraftItem[];
  onTotalChange: (value: number) => void;
  onSectionChange: (section: 'promo' | 'analysis', value: number) => void;
}) {
  const groups: { key: 'promo' | 'analysis'; title: string; category: ServiceItem['category'] }[] = [
    { key: 'promo', title: '市场推广服务', category: '市场推广服务' },
    { key: 'analysis', title: '调研与报告一体化服务 · 分析报告服务', category: '分析报告服务' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title="任务详情">
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 12, alignItems: 'end' }}>
          <Field label="推广总金额（￥）">
            <input
              type="number"
              min="0"
              value={totalAmount || ''}
              placeholder={recommendedAmount == null ? '未配置预算，请输入金额' : undefined}
              onChange={(event) => onTotalChange(Number(event.target.value) || 0)}
              style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontWeight: 650 }}
            />
          </Field>
          <Info label="预算推荐金额" value={recommendedAmount == null ? '未配置预算' : formatCNY(recommendedAmount)} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: '#667085' }}>
          标准价目表：{priceBookName}。系统按价目表比例自动分配金额并换算数量；金额无法整除时按最近档位取整。
        </div>
      </Section>

      {groups.map((group) => {
        const groupRows = rows.filter((row) => row.category === group.category);
        const actual = groupRows.reduce((sum, row) => sum + row.amount, 0);
        const displayRows = [...groupRows.reduce((map, row) => {
          const current = map.get(row.name);
          map.set(row.name, current
            ? { ...current, qty: current.qty + row.qty, amount: current.amount + row.amount }
            : { ...row });
          return map;
        }, new Map<string, DraftItem>()).values()];
        return (
          <Section key={group.key} title={group.title}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginBottom: 12 }}>
              <div style={{ color: '#667085', fontSize: 12 }}>可按分项总金额二次调整，系统将按本服务组的价目比例重新换算数量与明细金额。</div>
              <Field label="分项总金额（￥）">
                <input
                  type="number"
                  min="0"
                  value={sectionAmounts[group.key] || ''}
                  onChange={(event) => onSectionChange(group.key, Number(event.target.value) || 0)}
                  style={{ ...inputStyle, width: 180, fontFamily: "'JetBrains Mono', monospace", fontWeight: 650 }}
                />
              </Field>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['服务项目', '标准单价', '价目比例', '系统计算数量', '系统计算金额'].map((heading) => <th key={heading} style={th}>{heading}</th>)}</tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr key={row.name}>
                    <td style={td}>{row.name}</td>
                    <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(row.unitPrice)}/{row.unit}</td>
                    <td style={td}>{row.amount > 0 ? `${Math.round(row.amount / Math.max(1, actual) * 100)}%` : '—'}</td>
                    <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{row.qty}</td>
                    <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(row.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={td} colSpan={4}><strong>分项计算金额</strong></td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{formatCNY(actual)}</td>
                </tr>
              </tbody>
            </table>
          </Section>
        );
      })}

      <div style={{ position: 'sticky', bottom: 0, zIndex: 2, display: 'grid', gridTemplateColumns: '1fr 1fr 1.25fr', gap: 1, background: '#DCE5EF', border: '1px solid #DCE5EF', borderRadius: 8, overflow: 'hidden', boxShadow: '0 -8px 20px rgba(16, 24, 40, 0.08)' }}>
        <div style={{ background: '#F8FAFC', padding: '12px 16px' }}><div style={{ fontSize: 12, color: '#667085' }}>市场推广服务分项金额</div><strong style={{ display: 'block', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(sectionAmounts.promo)}</strong></div>
        <div style={{ background: '#F8FAFC', padding: '12px 16px' }}><div style={{ fontSize: 12, color: '#667085' }}>分析报告服务分项金额</div><strong style={{ display: 'block', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(sectionAmounts.analysis)}</strong></div>
        <div style={{ background: '#176B5B', color: '#fff', padding: '12px 16px', textAlign: 'right' }}><div style={{ fontSize: 12, opacity: 0.78 }}>任务合计金额</div><strong style={{ display: 'block', marginTop: 4, fontSize: 18, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(totalAmount)}</strong></div>
      </div>
    </div>
  );
}

function ItemEditorTable({
  rows, filterVariety, filterRegion, groups, onPatch,
}: {
  rows: DraftItem[];
  filterVariety: string;
  filterRegion: string;
  groups: { title: string; rows: PriceRow[] }[];
  onPatch: (idx: number, part: Partial<DraftItem>, source: 'price' | 'amount' | 'qty') => void;
}) {
  return (
    <div>
      {groups.map((g) => {
        const items = rows
          .map((d, idx) => ({ d, idx }))
          .filter(({ d }) => d.variety === filterVariety && d.region === filterRegion && g.rows.some((r) => r.name === d.name && r.category === d.category));
        if (!items.length) return null;
        const sum = items.reduce((s, x) => s + x.d.amount, 0);
        return (
          <div key={g.title} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 650, color: '#667085', margin: '8px 0' }}>{g.title}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['服务项目', '建议单价', '单价', '数量', '金额', '调整原因'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {items.map(({ d, idx }) => (
                  <tr key={d.name}>
                    <td style={td}>{d.name}</td>
                    <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(d.suggestedUnitPrice)}/{d.unit}</td>
                    <td style={td}>
                      <input type="number" value={d.unitPrice || ''} onChange={(e) => onPatch(idx, { unitPrice: Number(e.target.value) || 0 }, 'price')} style={{ ...inputStyle, height: 30, width: 90 }} />
                    </td>
                    <td style={td}>
                      <input type="number" value={d.qty || ''} onChange={(e) => onPatch(idx, { qty: Number(e.target.value) || 0 }, 'qty')} style={{ ...inputStyle, height: 30, width: 70 }} />
                    </td>
                    <td style={td}>
                      <input type="number" value={d.amount || ''} onChange={(e) => onPatch(idx, { amount: Number(e.target.value) || 0 }, 'amount')} style={{ ...inputStyle, height: 30, width: 110 }} />
                    </td>
                    <td style={td}>
                      <input value={d.adjustReason} onChange={(e) => onPatch(idx, { adjustReason: e.target.value }, 'price')} placeholder="偏离建议时必填" style={{ ...inputStyle, height: 30 }} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={td} colSpan={4}><strong>小计</strong></td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{formatCNY(sum)}</td>
                  <td style={td} />
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ─── 任务详情：固定步骤条 + 页签 ───

function stepStateOf(task: Task): { steps: { label: string; owner: string; status: 'done' | 'current' | 'todo' }[]; currentLabel: string } {
  const promo = hasPromoItems(task);
  const assigns = task.workloadAssigns;
  const { done, review, todo } = progressCountOf(task);
  const remain = remainingOfTask(task);
  const reportPassed = task.reports.some((r) => r.status === '通过');

  const confirm: 'done' | 'current' | 'todo' = task.taskStatus === '待确认' ? 'current'
    : task.taskStatus === '已撤销' ? 'todo' : 'done';
  const assign: 'done' | 'current' | 'todo' = task.taskStatus === '待确认' || task.taskStatus === '已撤销'
    ? 'todo'
    : !promo || assigns.length > 0 || task.taskStatus === '已结算' ? 'done' : 'current';
  const execute: 'done' | 'current' | 'todo' = assign !== 'done' ? 'todo'
    : task.taskStatus === '已结算' ? 'done'
      : promo
        ? (review + todo === 0 && (done > 0 || task.settlements.length > 0)) ? 'done' : 'current'
        : reportPassed ? 'done' : 'current';
  const settle: 'done' | 'current' | 'todo' = task.taskStatus === '已结算' ? 'done'
    : task.reconStatus === '对账中' ? 'current'
      : execute !== 'done' ? 'todo' : remain > 0 ? 'current' : 'done';

  const steps = [
    { label: '发包', owner: '药厂', status: 'done' as const },
    { label: '确认', owner: '服务提供商', status: confirm },
    { label: '执行分配', owner: promo ? '服务提供商 / 工作组' : '—', status: assign },
    { label: '执行完成', owner: promo ? '服务专员' : '服务提供商', status: execute },
    { label: '结算', owner: settle === 'current' && task.reconStatus === '对账中' ? '药厂' : '服务提供商 → 药厂', status: settle },
  ];
  const currentStep = steps.find((s) => s.status === 'current');
  return { steps, currentLabel: currentStep ? `当前卡点：${currentStep.label}（${currentStep.owner}）` : task.taskStatus === '已撤销' ? '任务已撤销' : '全部步骤已完成' };
}

export function TaskDetailModal({
  task, tab, onTab, onClose, isSales, isProvider, isCompliance, navigate,
  onSplit, onAssign, onSettle, onConfirmBill, onReview, onUploadReport, onHistory, onVoucher, onComplete,
  onUnconfirm, onRollbackStart, onRollbackConfirm, onRollbackComplete,
}: {
  task: Task | null;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  onClose: () => void;
  isSales: boolean;
  isProvider: boolean;
  isCompliance: boolean;
  navigate: NavigateFn;
  onSplit: () => void;
  onAssign: () => void;
  onSettle: () => void;
  onConfirmBill: () => void;
  onReview: () => void;
  onUploadReport: () => void;
  onHistory: () => void;
  onVoucher: () => void;
  onComplete: () => void;
  onUnconfirm?: () => void;
  onRollbackStart?: () => void;
  onRollbackConfirm?: () => void;
  onRollbackComplete?: () => void;
}) {
  if (!task) return null;
  return (
    <TaskDetailV5
      task={task}
      tab={tab}
      onTab={onTab}
      onClose={onClose}
      isSales={isSales}
      onReview={onReview}
      onConfirmBill={onConfirmBill}
    />
  );
}

function CompactValue({ items, limit = 1 }: { items: string[]; limit?: number }) {
  const [open, setOpen] = useState(false);
  const visible = items.slice(0, limit);
  const more = items.length - visible.length;
  return (
    <div>
      <span>{visible.join('、') || '—'}</span>
      {more > 0 && <button type="button" onClick={() => setOpen((value) => !value)} style={{ marginLeft: 6, border: 'none', background: '#EBF2FE', color: '#2F6BCE', borderRadius: 10, padding: '1px 7px', cursor: 'pointer', fontSize: 11 }}>+{more}</button>}
      {open && <div style={{ marginTop: 7, padding: '8px 10px', borderRadius: 6, background: '#F9FAFB', color: '#475467', fontSize: 12, lineHeight: 1.7 }}>{items.join('、')}</div>}
    </div>
  );
}

function DetailStatus({ label }: { label: string }) {
  const color: Record<string, 'default' | 'brand' | 'info' | 'success' | 'warning' | 'danger'> = {
    '执行中': 'info', '对账中': 'info', '待确认': 'warning', '待审核': 'warning', '待对账': 'warning',
    '已通过': 'success', '已对账': 'success', '已确认': 'success', '已完成': 'success', '待开票': 'warning',
    '待付款': 'warning', '已退回': 'danger', '已驳回': 'danger', '待提交': 'default', '—': 'default',
  };
  return <Tag label={label} color={color[label] ?? 'default'} />;
}

function TaskDetailV5({
  task, tab, onTab, onClose, isSales, onReview, onConfirmBill,
}: {
  task: Task;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  onClose: () => void;
  isSales: boolean;
  onReview: () => void;
  onConfirmBill: () => void;
}) {
  const [allocationSplitId, setAllocationSplitId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [selectedBill, setSelectedBill] = useState<string | null>(null);
  const remain = remainingOfTask(task);
  const pendingReports = 3;
  const baseSplits = task.workgroupSplits.length ? task.workgroupSplits : [
    { id: `${task.id}-demo-1`, workGroup: '陕西一组', variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', amount: Math.round(task.planAmount * 0.42), startDate: task.startDate, endDate: task.endDate },
    { id: `${task.id}-demo-2`, workGroup: '陕西二组', variety: task.varieties[1] ?? task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[1] ?? task.regions[0] ?? '陕西省', amount: Math.round(task.planAmount * 0.33), startDate: task.startDate, endDate: task.endDate },
    { id: `${task.id}-demo-3`, workGroup: '区域支持组', variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', amount: Math.max(0, task.planAmount - Math.round(task.planAmount * 0.75)), startDate: task.startDate, endDate: task.endDate },
  ];
  const periods = task.settlementPeriods.length ? task.settlementPeriods : [{ id: `${task.id}-period-1`, name: '2026年8月', startDate: task.startDate, endDate: task.endDate }];
  const reportRows = [
    ...task.reports.map((report, index) => ({ id: report.id, name: report.name, variety: task.varieties[index % Math.max(1, task.varieties.length)] ?? '—', region: task.regions[index % Math.max(1, task.regions.length)] ?? '—', submitter: report.uploadedBy, time: report.uploadedAt, status: report.status === '通过' ? '审核通过' : report.status === '驳回' ? '已退回' : '待审核', opinion: report.comment || '资料完整性待核验' })),
    { id: 'demo-report-1', name: '8月终端医院拜访执行报告', variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', submitter: '李四', time: '2026-08-22 16:30', status: '待审核', opinion: '—' },
    { id: 'demo-report-2', name: '区域市场信息调研报告', variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', submitter: '王晨', time: '2026-08-21 18:10', status: '待审核', opinion: '—' },
    { id: 'demo-report-3', name: '商业渠道拜访周报（第3周）', variety: task.varieties[1] ?? task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[1] ?? task.regions[0] ?? '陕西省', submitter: '赵敏', time: '2026-08-20 17:40', status: '待审核', opinion: '—' },
    { id: 'demo-report-4', name: '学术会议执行总结', variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', submitter: '陈峰', time: '2026-08-18 15:00', status: '审核通过', opinion: '内容完整，审核通过' },
    { id: 'demo-report-5', name: '重点医院客户覆盖分析', variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', submitter: '李四', time: '2026-08-16 11:20', status: '审核通过', opinion: '数据核验通过' },
    { id: 'demo-report-6', name: '区域竞品动态简报', variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', submitter: '王晨', time: '2026-08-14 10:10', status: '审核通过', opinion: '审核通过' },
    { id: 'demo-report-9', name: '重点客户拜访周报（第2周）', variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', submitter: '李四', time: '2026-08-11 17:20', status: '审核通过', opinion: '审核通过' },
    { id: 'demo-report-10', name: '区域会议执行复盘', variety: task.varieties[1] ?? task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', submitter: '王晨', time: '2026-08-09 16:30', status: '审核通过', opinion: '资料完整，审核通过' },
    { id: 'demo-report-11', name: '商业渠道终端覆盖明细', variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', submitter: '赵敏', time: '2026-08-07 14:40', status: '审核通过', opinion: '审核通过' },
    { id: 'demo-report-7', name: '终端样本收集说明', variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', submitter: '赵敏', time: '2026-08-12 18:00', status: '已退回', opinion: '请补充样本来源与原始附件' },
    { id: 'demo-report-8', name: '下月推广策略预案', variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', submitter: '—', time: '—', status: '待提交', opinion: '预计 2026-08-30 提交' },
  ].slice(0, 11);
  const tabs: { id: DetailTab; label: string; badge?: number }[] = [
    { id: 'plan', label: '任务计划' },
    { id: 'exec', label: '任务拆解' },
    { id: 'report', label: '报告与审核', badge: pendingReports },
    { id: 'settle', label: '结算周期与结算单' },
    { id: 'log', label: '操作记录' },
  ];
  const splitWorkloads = (split: typeof baseSplits[number]): PersonalAllocationRow[] => {
    const rows = task.workloadAssigns.filter((row) => row.workGroup === split.workGroup);
    return rows.length ? rows.map((row) => ({ ...row, done: row.progress === '已完成' ? row.workload : 0 })) : [
      { id: `${split.id}-work-1`, specialist: '李四', itemName: '医院拜访', category: '市场推广服务', workload: 60, amount: Math.round(split.amount * 0.4), done: 42, progress: '未完成', completedAt: '2026-08-22 17:40' },
      { id: `${split.id}-work-2`, specialist: '李四', itemName: '区域市场分析报告', category: '分析报告服务', workload: 4, amount: Math.round(split.amount * 0.1), done: 3, progress: '未完成', completedAt: '2026-08-23 09:10' },
      { id: `${split.id}-work-3`, specialist: '王晨', itemName: '商业拜访', category: '市场推广服务', workload: 20, amount: Math.round(split.amount * 0.25), done: 16, progress: '未完成', completedAt: '2026-08-21 15:20' },
      { id: `${split.id}-work-4`, specialist: '赵敏', itemName: '药房拜访', category: '市场推广服务', workload: 80, amount: Math.round(split.amount * 0.25), done: 80, progress: '已完成', completedAt: '2026-08-19 18:00' },
    ];
  };
  const allocationSplit = baseSplits.find((split) => split.id === allocationSplitId) ?? null;
  const allocationRows = allocationSplit ? splitWorkloads(allocationSplit) : [];
  const displayBills = periods.flatMap((period, index) => {
    const real = task.settlements.filter((bill) => bill.settlementPeriodId === period.id).map((bill) => ({ id: bill.id, no: bill.billNo, period: period.name, amount: bill.finalAmount, status: bill.voided ? '已驳回' : bill.confirmed ? '待开票' : '对账中', invoice: bill.confirmed ? '待开票' : '—', payment: bill.paymentVoucher ? '已完成' : '待付款', createdAt: bill.madeAt, lines: bill.lines }));
    if (real.length) return real;
    const states = ['待对账', '已确认', '待开票', '待付款', '已完成', '已驳回'];
    const status = states[index % states.length];
    const amount = Math.round(task.planAmount / periods.length);
    return [{ id: `${period.id}-demo-bill`, no: `JS-2026-${String(index + 1).padStart(3, '0')}`, period: period.name, amount, status, invoice: status === '待开票' ? '待开票' : status === '已完成' ? '已开票' : '—', payment: status === '已完成' ? '已完成' : status === '已驳回' ? '—' : '待付款', createdAt: `2026-08-${String(8 + index * 3).padStart(2, '0')} 14:20`, lines: [
      { id: `${period.id}-line-1`, variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', serviceType: '市场推广服务', serviceItem: '医院拜访', serviceAmount: Math.round(amount * 0.45), actualAmount: Math.round(amount * 0.45), remark: '已完成审核' },
      { id: `${period.id}-line-2`, variety: task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[0] ?? '陕西省', serviceType: '市场推广服务', serviceItem: '商业拜访', serviceAmount: Math.round(amount * 0.2), actualAmount: Math.round(amount * 0.2), remark: '—' },
      { id: `${period.id}-line-3`, variety: task.varieties[1] ?? task.varieties[0] ?? '阿托伐他汀钙片（20mg）', region: task.regions[1] ?? task.regions[0] ?? '陕西省', serviceType: '分析报告服务', serviceItem: '区域市场分析报告', serviceAmount: amount - Math.round(amount * 0.65), actualAmount: amount - Math.round(amount * 0.65), remark: '含附件' },
    ] }];
  });
  const businessAreas = ([
    { key: 'promo', title: '市场推广服务', category: '市场推广服务' },
    { key: 'analysis', title: '调研与报告一体化服务 · 分析报告服务', category: '分析报告服务' },
  ] as const).map((area) => {
    const items = task.serviceItems.filter((item) => item.category === area.category);
    const grouped = new Map<string, { key: string; name: string; unit: string; unitPrice: number; qty: number; amount: number; details: ServiceItem[] }>();
    items.forEach((item) => {
      const key = `${item.name}|${item.unitPrice}|${item.unit}`;
      const current = grouped.get(key) ?? { key, name: item.name, unit: item.unit, unitPrice: item.unitPrice, qty: 0, amount: 0, details: [] };
      current.qty += item.qty;
      current.amount += item.amount;
      current.details.push(item);
      grouped.set(key, current);
    });
    const rows = [...grouped.values()].map((row) => {
      const related = task.workloadAssigns.filter((workload) => workload.category === area.category && workload.itemName === row.name);
      const completed = related.filter((workload) => workload.progress === '已完成').reduce((sum, workload) => sum + workload.workload, 0);
      const settled = validBills(task).flatMap((bill) => bill.lines).filter((line) => line.serviceType === area.category && line.serviceItem === row.name).reduce((sum, line) => sum + line.actualAmount, 0);
      return { ...row, completed, settled, status: completed >= row.qty && row.qty > 0 ? '已完成' : completed > 0 ? '执行中' : '未开始' };
    });
    const quantity = rows.reduce((sum, row) => sum + row.qty, 0);
    const completed = rows.reduce((sum, row) => sum + row.completed, 0);
    return { ...area, rows, amount: rows.reduce((sum, row) => sum + row.amount, 0), quantity, completed };
  });

  return (
    <Modal
      open
      title={allocationSplit ? '个人分配任务明细' : `任务详情 · ${task.taskNo}`}
      onClose={onClose}
      width={1180}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Button variant="outline" onClick={onClose}>关闭</Button></div>}
    >
      {allocationSplit ? <PersonalAllocationDetail split={allocationSplit} task={task} rows={allocationRows} onBack={() => setAllocationSplitId(null)} /> : <>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E5E7EB', marginBottom: 16 }}>
        {tabs.map((item) => <button key={item.id} type="button" onClick={() => onTab(item.id)} style={{ position: 'relative', padding: '10px 15px', border: 'none', borderBottom: tab === item.id ? '2px solid #176B5B' : '2px solid transparent', background: 'none', color: tab === item.id ? '#176B5B' : '#667085', fontWeight: tab === item.id ? 650 : 500, cursor: 'pointer' }}>{item.label}{item.badge ? <span style={{ marginLeft: 5, minWidth: 17, height: 17, lineHeight: '17px', display: 'inline-block', borderRadius: 9, background: '#FEECEC', color: '#C73A3A', fontSize: 11 }}>{item.badge}</span> : null}</button>)}
      </div>

      {tab === 'plan' && <>
        <Section title="任务计划">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <Info label="任务编号" value={task.taskNo} /><Info label="品种" value={<CompactValue items={task.varieties} />} /><Info label="服务提供方" value={task.provider} />
            <Info label="服务地区" value={<CompactValue items={task.regions} limit={2} />} /><Info label="推广时间" value={`${task.startDate} ~ ${task.endDate}`} /><Info label="任务状态" value={<DetailStatus label={taskStatusLabel(task)} />} />
            <Info label="对账状态" value={<DetailStatus label={reconStatusLabel(task)} />} /><Info label="预算金额" value={<strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(task.planAmount)}</strong>} /><Info label="已结算金额" value={<strong style={{ fontFamily: "'JetBrains Mono', monospace", color: '#176B5B' }}>{formatCNY(task.settledAmount)}</strong>} />
            <Info label="剩余可结算金额" value={<strong style={{ fontFamily: "'JetBrains Mono', monospace", color: remain > 0 ? '#2F6BCE' : '#176B5B' }}>{formatCNY(remain)}</strong>} /><Info label="创建人 / 创建时间" value={`${task.createdBy} · ${task.createdAt}`} /><Info label="金额关系" value="剩余 = 预算 − 已结算" />
          </div>
        </Section>
        <div style={{ height: 12 }} />
        {businessAreas.map((area) => (
          <div key={area.key} style={{ marginTop: 12 }}><Section title={area.title} subtitle={`分项金额 ${formatCNY(area.amount)}`}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}><thead><tr>{['服务项目', '标准单价', '计划数量', '计划金额', '已完成数量', '已结算金额'].map((heading) => <th key={heading} style={heading.includes('金额') || heading.includes('数量') ? { ...th, textAlign: 'right' } : th}>{heading}</th>)}</tr></thead><tbody>
              {area.rows.map((row) => <tr key={row.key}><td style={td}><strong>{row.name}</strong></td><td style={td}>{formatCNY(row.unitPrice)}/{row.unit}</td><td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{row.qty}</td><td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 650 }}>{formatCNY(row.amount)}</td><td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{row.completed}</td><td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(row.settled)}</td></tr>)}
              {!area.rows.length && <tr><td colSpan={6} style={td}>该服务模式暂无业务明细</td></tr>}
            </tbody></table>
          </Section></div>
        ))}
      </>}

      {tab === 'exec' && <Section title="任务拆解" subtitle="拆解记录">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['工作组', '品种', '推广金额', '区域', '操作'].map((heading) => <th key={heading} style={heading.includes('金额') ? { ...th, textAlign: 'right' } : th}>{heading}</th>)}</tr></thead><tbody>
          {baseSplits.map((split) => {
            return <tr key={split.id}><td style={td}>{split.workGroup}</td><td style={td}><CompactValue items={[split.variety]} /></td><td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 650 }}>{formatCNY(split.amount)}</td><td style={td}><CompactValue items={[split.region]} /></td><td style={td}><Button variant="soft" size="sm" onClick={() => setAllocationSplitId(split.id)}>个人分配任务明细</Button></td></tr>;
          })}
        </tbody></table>
      </Section>}

      {tab === 'report' && <Section title="报告与审核" subtitle={`待审核 ${pendingReports} 条`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['报告名称', '所属品种', '所属区域', '提交人', '提交时间', '审核状态', '审核意见', '操作'].map((heading) => <th key={heading} style={th}>{heading}</th>)}</tr></thead><tbody>{reportRows.map((row) => <tr key={row.id}><td style={td}>{row.name}</td><td style={td}>{row.variety}</td><td style={td}>{row.region}</td><td style={td}>{row.submitter}</td><td style={td}>{row.time}</td><td style={td}><DetailStatus label={row.status} /></td><td style={{ ...td, color: row.status === '已退回' ? '#C77A16' : '#667085' }}>{row.opinion}</td><td style={td}>{isSales && row.status === '待审核' ? <Button variant="outline" size="sm" onClick={onReview}>审核</Button> : <Button variant="ghost" size="sm">查看</Button>}</td></tr>)}</tbody></table>
      </Section>}

      {tab === 'settle' && <Section title="结算周期与结算单" subtitle="点击结算周期，在当前页面查看该周期对应结算单">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['结算周期', '周期状态', '应结算金额', '已结算金额', '待结算金额', '对账状态', '结算单数量', '操作'].map((heading) => <th key={heading} style={heading.includes('金额') ? { ...th, textAlign: 'right' } : th}>{heading}</th>)}</tr></thead><tbody>{periods.map((period, index) => { const bills = displayBills.filter((bill) => bill.period === period.name); const due = Math.round(task.planAmount / periods.length); const settled = bills.filter((bill) => ['已确认', '待开票', '待付款', '已完成'].includes(bill.status)).reduce((sum, bill) => sum + bill.amount, 0); const active = selectedPeriod === period.id; const chosen = bills.find((bill) => bill.id === selectedBill); return <Fragment key={period.id}><tr><td style={td}>{period.name}<div style={{ fontSize: 11, color: '#98A2B3', marginTop: 2 }}>{period.startDate} ~ {period.endDate}</div></td><td style={td}><DetailStatus label={settled >= due ? '已完成' : index === 0 ? '对账中' : '待对账'} /></td><td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(due)}</td><td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(Math.min(due, settled))}</td><td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(Math.max(0, due - settled))}</td><td style={td}><DetailStatus label={index === 0 ? '对账中' : settled ? '已对账' : '待对账'} /></td><td style={td}>{bills.length}</td><td style={td}><Button variant="ghost" size="sm" onClick={() => { setSelectedPeriod(active ? null : period.id); if (active) setSelectedBill(null); }}>{active ? '收起结算单' : '查看结算单'}</Button></td></tr>{active && <tr><td colSpan={8} style={{ padding: 0 }}><div style={{ padding: '12px 16px 16px', background: '#F8FAFC', borderTop: '1px solid #E5E7EB' }}><div style={{ fontSize: 12, color: '#667085', marginBottom: 8 }}>当前查看：{period.name} 下的结算单</div><table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}><thead><tr>{['结算单编号', '服务提供方', '结算金额', '对账状态', '开票状态', '付款状态', '创建时间', '操作'].map((heading) => <th key={heading} style={heading.includes('金额') ? { ...th, textAlign: 'right' } : th}>{heading}</th>)}</tr></thead><tbody>{bills.map((bill) => <tr key={bill.id} style={{ background: selectedBill === bill.id ? '#F0F9F7' : undefined }}><td style={td}><strong>{bill.no}</strong></td><td style={td}>{task.provider}</td><td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 650 }}>{formatCNY(bill.amount)}</td><td style={td}><DetailStatus label={bill.status} /></td><td style={td}><DetailStatus label={bill.invoice} /></td><td style={td}><DetailStatus label={bill.payment} /></td><td style={td}>{bill.createdAt}</td><td style={td}><Button variant="ghost" size="sm" onClick={() => setSelectedBill(selectedBill === bill.id ? null : bill.id)}>{selectedBill === bill.id ? '收起单据' : '查看单据'}</Button></td></tr>)}</tbody></table>{chosen && <SettlementReceipt task={task} bill={chosen} isSales={isSales} onConfirm={onConfirmBill} />}</div></td></tr>}</Fragment>; })}</tbody></table>
      </Section>}

      {tab === 'log' && <Section title="操作记录"><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['时间', '操作人', '角色', '动作', '说明'].map((heading) => <th key={heading} style={th}>{heading}</th>)}</tr></thead><tbody>{task.opsLogs.slice().reverse().map((log) => <tr key={log.id}><td style={td}>{log.time}</td><td style={td}>{log.operator}</td><td style={td}>{log.role}</td><td style={td}>{log.action}</td><td style={td}>{log.detail}</td></tr>)}</tbody></table></Section>}
      </>}
    </Modal>
  );
}

function PersonalAllocationDetail({
  split, task, rows, onBack,
}: {
  split: WorkgroupSplit;
  task: Task;
  rows: PersonalAllocationRow[];
  onBack: () => void;
}) {
  const [detailRow, setDetailRow] = useState<PersonalAllocationRow | null>(null);
  const cells = useMemo(() => {
    const order: string[] = [];
    const bySpecialist = new Map<string, PersonalAllocationRow[]>();
    rows.forEach((row) => {
      if (!bySpecialist.has(row.specialist)) { bySpecialist.set(row.specialist, []); order.push(row.specialist); }
      bySpecialist.get(row.specialist)!.push(row);
    });
    return order.flatMap((specialist) => {
      const list = bySpecialist.get(specialist)!;
      return list.map((row, i) => {
        const prev = list[i - 1];
        const showSpecialist = i === 0;
        const showCategory = !prev || prev.category !== row.category;
        let categorySpan = 0;
        if (showCategory) { categorySpan = 1; for (let j = i + 1; j < list.length && list[j].category === row.category; j += 1) categorySpan += 1; }
        return { row, showSpecialist, specialistSpan: list.length, showCategory, categorySpan, groupStart: showSpecialist };
      });
    });
  }, [rows]);

  if (detailRow) return <AllocationDetailPreview row={detailRow} workGroup={split.workGroup} onBack={() => setDetailRow(null)} />;

  const mergedTd: React.CSSProperties = { ...td, verticalAlign: 'middle', fontWeight: 600, color: '#176B5B' };
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #E5E7EB', paddingBottom: 12, marginBottom: 16 }}>
        <Button variant="ghost" size="sm" onClick={onBack}>← 返回任务详情</Button>
        <span style={{ color: '#98A2B3', fontSize: 12 }}>任务拆解 / {split.workGroup} · 个人分配任务明细</span>
      </div>
      <Section title="个人分配任务明细" subtitle={`${rows.length} 条业务明细 · ${new Set(rows.map((row) => row.specialist)).size} 位服务专员`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['服务专员', '服务类型', '服务项目', '计划量', '已完成', '待完成', '金额', '执行状态', '完成时间', '操作'].map((heading) => <th key={heading} style={heading === '金额' ? { ...th, textAlign: 'right' } : th}>{heading}</th>)}</tr></thead>
          <tbody>{cells.map(({ row, showSpecialist, specialistSpan, showCategory, categorySpan, groupStart }) => {
            const completed = row.done ?? (row.progress === '已完成' ? row.workload : 0);
            const amount = row.amount ?? 0;
            const completedAt = row.completedAt ?? (row.progress === '已完成' ? `${task.startDate.slice(0, 7)}-25 18:00` : '—');
            const groupEdge = groupStart ? { borderTop: '2px solid #E5E7EB' } : {};
            return <tr key={row.id}>
              {showSpecialist && <td rowSpan={specialistSpan} style={{ ...mergedTd, ...groupEdge, background: '#F5FAF8' }}><strong>{row.specialist}</strong><div style={{ color: '#98A2B3', fontSize: 11, fontWeight: 400, marginTop: 2 }}>{specialistSpan} 条业务</div></td>}
              {showCategory && <td rowSpan={categorySpan} style={{ ...td, verticalAlign: 'middle', ...groupEdge }}>{row.category ?? '市场推广服务'}</td>}
              <td style={{ ...td, ...groupEdge }}>{row.itemName}</td>
              <td style={{ ...td, ...groupEdge }}>{row.workload}</td>
              <td style={{ ...td, ...groupEdge }}>{completed}</td>
              <td style={{ ...td, ...groupEdge }}>{Math.max(0, row.workload - completed)}</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", ...groupEdge }}>{formatCNY(amount)}</td>
              <td style={{ ...td, ...groupEdge }}><DetailStatus label={row.progress === '已完成' ? '已完成' : '执行中'} /></td>
              <td style={{ ...td, ...groupEdge }}>{completedAt}</td>
              <td style={{ ...td, ...groupEdge }}><Button variant="soft" size="sm" onClick={() => setDetailRow(row)}>查看详情</Button></td>
            </tr>;
          })}</tbody>
        </table>
      </Section>
    </>
  );
}

function AllocationDetailPreview({ row, workGroup, onBack }: { row: PersonalAllocationRow; workGroup: string; onBack: () => void }) {
  const completed = row.done ?? (row.progress === '已完成' ? row.workload : 0);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #E5E7EB', paddingBottom: 12, marginBottom: 16 }}>
        <Button variant="outline" size="sm" onClick={onBack}>← 返回个人分配明细</Button>
        <span style={{ color: '#98A2B3', fontSize: 12 }}>任务拆解 / {workGroup} · 个人分配任务明细 / 明细详情</span>
      </div>
      <Section title="明细详情" subtitle={`${row.specialist} · ${row.category ?? '市场推广服务'} · ${row.itemName}`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <Info label="服务专员" value={row.specialist} />
          <Info label="服务类型" value={row.category ?? '市场推广服务'} />
          <Info label="服务项目" value={row.itemName} />
          <Info label="计划量" value={row.workload} />
          <Info label="已完成 / 待完成" value={`${completed} / ${Math.max(0, row.workload - completed)}`} />
          <Info label="金额" value={<strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(row.amount ?? 0)}</strong>} />
          <Info label="执行状态" value={<DetailStatus label={row.progress === '已完成' ? '已完成' : '执行中'} />} />
          <Info label="完成时间" value={row.completedAt ?? '—'} />
        </div>
        <div style={{ marginTop: 16, border: '1px dashed #B9CFC9', background: '#F5FAF8', borderRadius: 10, padding: '26px 24px', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, margin: '0 auto 12px', borderRadius: '50%', background: '#E8F4F1', color: '#176B5B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Wrench size={20} /></div>
          <div style={{ fontSize: 15, fontWeight: 650, color: '#1F2937' }}>逐条执行明细正在建设中</div>
          <div style={{ fontSize: 13, color: '#667085', marginTop: 6, lineHeight: 1.7 }}>该服务项目下的拜访签到、定位轨迹、报告附件与审核轨迹将在下一迭代开放。</div>
          <div style={{ display: 'inline-flex', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['拜访签到记录', '定位轨迹核验', '报告附件清单', '审核轨迹'].map((item) => <Tag key={item} label={item} color="brand" />)}
          </div>
        </div>
      </Section>
    </>
  );
}

function SettlementReceipt({ task, bill, isSales, onConfirm }: {
  task: Task;
  bill: { id: string; no: string; period: string; amount: number; status: string; createdAt: string; lines: SettlementLine[] };
  isSales: boolean;
  onConfirm: () => void;
}) {
  const groupedLines = [...bill.lines.reduce((groups, line) => {
    const current = groups.get(line.serviceType) ?? [];
    current.push(line);
    groups.set(line.serviceType, current);
    return groups;
  }, new Map<string, SettlementLine[]>()).entries()];
  const actual = bill.lines.reduce((sum, line) => sum + line.actualAmount, 0);
  return (
    <div style={{ marginTop: 14, border: '1px solid #D7E2F0', background: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '11px 16px', background: '#3384C8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><strong>结算单详情</strong><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{bill.no}<DetailStatus label={bill.status} /></span></div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#BFE6E8', borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
          {[
            ['结算单编号', bill.no], ['服务品种', task.varieties.join('、')], ['推广时段', `${task.startDate} ~ ${task.endDate}`], ['制单日', bill.createdAt], ['服务委托方', DEMO_HOLDER], ['服务提供方', task.provider],
          ].map(([label, value]) => <div key={label} style={{ display: 'grid', gridTemplateColumns: '92px 1fr', padding: '9px 12px', background: '#E1F7F7', fontSize: 13 }}><span style={{ color: '#344054' }}>{label}：</span><span>{value}</span></div>)}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['序号', '服务类型', '服务项目', '服务金额', '实际结算金额', '备注'].map((heading) => <th key={heading} style={heading.includes('金额') ? { ...th, textAlign: 'right' } : th}>{heading}</th>)}</tr></thead><tbody>{groupedLines.flatMap(([type, lines]) => lines.map((line, index) => <tr key={line.id}><td style={td}>{index === 0 ? bill.lines.indexOf(line) + 1 : bill.lines.indexOf(line) + 1}</td><td style={td}>{index === 0 ? type : ''}</td><td style={td}>{line.serviceItem}<div style={{ color: '#98A2B3', fontSize: 11, marginTop: 2 }}>{line.variety} · {line.region}</div></td><td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(line.serviceAmount)}</td><td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 650 }}>{formatCNY(line.actualAmount)}</td><td style={td}>{line.remark || '—'}</td></tr>))}</tbody></table>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #D7E2F0', marginTop: 26, padding: '18px 28px' }}><strong>最终结算金额（大写）：{formatCNYUpper(actual)}</strong><strong style={{ fontSize: 18, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(actual)}</strong></div>
        <div style={{ background: '#F7F8FA', padding: '10px 12px', color: '#475467', fontSize: 12, lineHeight: 1.7 }}><strong>声明：</strong>{SETTLEMENT_DECLARATION_TEXT}</div>
        {isSales && ['待对账', '对账中'].includes(bill.status) && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><Button variant="primary" onClick={onConfirm}>确认结算单</Button></div>}
      </div>
    </div>
  );
}

function SplitModal({ task, onClose, onSave }: { task: Task | null; onClose: () => void; onSave: (rows: Omit<WorkgroupSplit, 'id'>[]) => void }) {
  const [rows, setRows] = useState<Omit<WorkgroupSplit, 'id'>[]>([]);
  useEffect(() => {
    if (task) {
      setRows(task.workgroupSplits.length
        ? task.workgroupSplits.map(({ id: _id, ...rest }) => rest)
        : [{ workGroup: workGroups[0], variety: task.varieties[0] ?? '', region: task.regions[0] ?? '', amount: 0, startDate: task.startDate, endDate: task.endDate }]);
    }
  }, [task]);
  if (!task) return null;
  const used = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const left = task.planAmount - used;
  return (
    <Modal
      open={!!task}
      title="拆分任务包到工作组"
      onClose={onClose}
      width={880}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave(rows)}>保存</Button>
        </>
      }
    >
      <Banner color="info">剩余可拆金额 {formatCNY(left)}（累计 ≤ 计划总金额 {formatCNY(task.planAmount)}）</Banner>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.8fr 1fr 1fr 1fr auto', gap: 8, marginTop: 8 }}>
          <select value={r.workGroup} onChange={(e) => setRows(patch(rows, i, { workGroup: e.target.value }))} style={inputStyle}>
            {workGroups.map((w) => <option key={w}>{w}</option>)}
          </select>
          <select value={r.variety} onChange={(e) => setRows(patch(rows, i, { variety: e.target.value }))} style={inputStyle}>
            {task.varieties.map((v) => <option key={v}>{v}</option>)}
          </select>
          <select value={r.region} onChange={(e) => setRows(patch(rows, i, { region: e.target.value }))} style={inputStyle}>
            {task.regions.map((rg) => <option key={rg}>{rg}</option>)}
          </select>
          <input type="number" value={r.amount} onChange={(e) => setRows(patch(rows, i, { amount: Number(e.target.value) || 0 }))} style={inputStyle} placeholder="推广金额" />
          <input type="date" value={r.startDate} onChange={(e) => setRows(patch(rows, i, { startDate: e.target.value }))} style={inputStyle} />
          <input type="date" value={r.endDate} onChange={(e) => setRows(patch(rows, i, { endDate: e.target.value }))} style={inputStyle} />
          <Button variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>删</Button>
        </div>
      ))}
      <div style={{ marginTop: 10 }}>
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { workGroup: workGroups[0], variety: task.varieties[0] ?? '', region: task.regions[0] ?? '', amount: 0, startDate: task.startDate, endDate: task.endDate }])}>新增一行</Button>
      </div>
    </Modal>
  );
}

function AssignModal({ task, onClose, onSave }: { task: Task | null; onClose: () => void; onSave: (rows: Omit<WorkloadAssign, 'id'>[]) => void }) {
  const [rows, setRows] = useState<Omit<WorkloadAssign, 'id'>[]>([]);
  useEffect(() => {
    if (task) {
      setRows(task.workloadAssigns.length
        ? task.workloadAssigns.map(({ id: _id, ...rest }) => rest)
        : [{
            workGroup: task.workgroupSplits[0]?.workGroup || workGroups[0],
            specialist: specialists[0],
            variety: task.workgroupSplits[0]?.variety || task.varieties[0] || '',
            region: task.workgroupSplits[0]?.region || task.regions[0] || '',
            category: '市场推广服务',
            itemName: task.serviceItems.find((it) => it.category === '市场推广服务')?.name ?? '',
            workload: 1, amount: 0, progress: '未完成',
            serviceMonth: task.startDate.slice(0, 7),
          }]);
    }
  }, [task]);
  if (!task) return null;
  const progressOpts: WorkloadProgress[] = ['未完成', '待审核', '已完成'];
  const promoItems = task.serviceItems.filter((it) => it.category === '市场推广服务');
  return (
    <Modal
      open={!!task}
      title="分配工作量到服务专员"
      onClose={onClose}
      width={1120}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave(rows)}>保存</Button>
        </>
      }
    >
      <Banner color="info">每条任务量需填「服务月份」（执行发生的月份，结算按它归属）；「已完成」= 已审核，可被选入结算单。</Banner>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '0.9fr 0.8fr 1.2fr 0.7fr 1.1fr 100px 70px 100px 80px auto', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <select value={r.workGroup} onChange={(e) => setRows(patch(rows, i, { workGroup: e.target.value }))} style={inputStyle}>
            {task.workgroupSplits.map((w) => <option key={w.id}>{w.workGroup}</option>)}
          </select>
          <select value={r.specialist} onChange={(e) => setRows(patch(rows, i, { specialist: e.target.value }))} style={inputStyle}>
            {specialists.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={r.variety} onChange={(e) => setRows(patch(rows, i, { variety: e.target.value }))} style={inputStyle}>
            {task.varieties.map((v) => <option key={v}>{v}</option>)}
          </select>
          <select value={r.region} onChange={(e) => setRows(patch(rows, i, { region: e.target.value }))} style={inputStyle}>
            {task.regions.map((rg) => <option key={rg}>{rg}</option>)}
          </select>
          <select
            value={r.itemName}
            onChange={(e) => {
              const item = promoItems.find((p) => p.name === e.target.value);
              setRows(patch(rows, i, { itemName: e.target.value, category: item?.category ?? '市场推广服务' }));
            }}
            style={inputStyle}
          >
            <option value="">选服务项目</option>
            {promoItems.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          <input type="month" value={r.serviceMonth} onChange={(e) => setRows(patch(rows, i, { serviceMonth: e.target.value }))} style={inputStyle} />
          <input type="number" value={r.workload} onChange={(e) => setRows(patch(rows, i, { workload: Number(e.target.value) || 0 }))} style={inputStyle} placeholder="工作量" />
          <input type="number" value={r.amount} onChange={(e) => setRows(patch(rows, i, { amount: Number(e.target.value) || 0 }))} style={inputStyle} placeholder="金额" />
          <select value={r.progress} onChange={(e) => setRows(patch(rows, i, { progress: e.target.value as WorkloadProgress }))} style={inputStyle}>
            {progressOpts.map((p) => <option key={p}>{p}</option>)}
          </select>
          <Button variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>删</Button>
        </div>
      ))}
      <div style={{ marginTop: 10 }}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows([...rows, {
            workGroup: task.workgroupSplits[0]?.workGroup || workGroups[0],
            specialist: specialists[0],
            variety: task.varieties[0] ?? '',
            region: task.regions[0] ?? '',
            category: '市场推广服务',
            itemName: promoItems[0]?.name ?? '',
            workload: 1, amount: 0, progress: '未完成',
            serviceMonth: task.startDate.slice(0, 7),
          }])}
        >
          新增一行
        </Button>
      </div>
    </Modal>
  );
}

/** 发起结算：服务月份 + 工作组；一张结算单对应一个工作组 */
function SettleModal({ task, onClose, onSave }: { task: Task | null; onClose: () => void; onSave: (serviceMonth: string, workGroup: string, workloadIds: string[]) => void }) {
  const months = task ? settleableMonths(task) : [];
  const [month, setMonth] = useState('');
  const [workGroup, setWorkGroup] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (task) {
      const firstMonth = settleableMonths(task)[0] ?? '';
      setMonth(firstMonth);
      setWorkGroup(firstMonth ? (settleableWorkGroups(task, firstMonth)[0] ?? '') : '');
      setChecked(new Set());
    }
  }, [task]);
  if (!task) return null;
  const groups = settleableWorkGroups(task, month);
  const rows = task.workloadAssigns.filter((a) => a.progress === '已完成' && !a.settledBillNo && a.serviceMonth === month && a.workGroup === workGroup);
  const sum = rows.filter((a) => checked.has(a.id)).reduce((s, a) => s + a.amount, 0);
  const remain = remainingOfTask(task);
  return (
    <Modal
      open={!!task}
      title="发起结算（服务月份 + 工作组）"
      onClose={onClose}
      width={860}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave(month, workGroup, [...checked])}>发起结算</Button>
        </>
      }
    >
      {months.length === 0 ? (
        <div style={{ fontSize: 13, color: '#667085' }}>当前没有已审核且未结算的任务量。请先在「执行与工作量」中把任务量标记为已完成（已审核）。</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 180px 1fr', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <Field label="服务月份">
              <select value={month} onChange={(e) => {
                const m = e.target.value;
                setMonth(m);
                setWorkGroup(settleableWorkGroups(task, m)[0] ?? '');
                setChecked(new Set());
              }} style={inputStyle}>
                {months.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="工作组">
              <select value={workGroup} onChange={(e) => { setWorkGroup(e.target.value); setChecked(new Set()); }} style={inputStyle}>
                {groups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Banner color="info">本次 {formatCNY(sum)} · 剩余可结算金额 {formatCNY(remain)}{sum > remain ? '（超出，无法发起）' : ''}</Banner>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['', '工作组', '专员', '品种', '地区', '服务项目', '工作量', '金额'].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={checked.has(a.id)}
                      onChange={(e) => setChecked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(a.id); else next.delete(a.id);
                        return next;
                      })}
                    />
                  </td>
                  <td style={td}>{a.workGroup}</td>
                  <td style={td}>{a.specialist}</td>
                  <td style={td}>{a.variety}</td>
                  <td style={td}>{a.region}</td>
                  <td style={td}>{a.itemName}</td>
                  <td style={td}>{a.workload}</td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(a.amount)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td style={td} colSpan={8}>该月份该工作组暂无已审核且未结算的任务量</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}

function ConfirmBillModal({ task, onClose, onSave }: {
  task: Task | null;
  onClose: () => void;
  onSave: (billId: string, lines: SettlementLine[], opts: { declarationAccepted: boolean; declarationVersion: string }) => void;
}) {
  const bill = task?.settlements.find((b) => !b.confirmed && !b.voided);
  const [lines, setLines] = useState<SettlementLine[]>([]);
  const [declared, setDeclared] = useState(false);
  useEffect(() => {
    if (bill) {
      setLines(bill.lines.map((l) => ({ ...l })));
      setDeclared(false);
    }
  }, [bill?.id]);
  if (!task || !bill) {
    return (
      <Modal open={!!task} title="确认结算单" onClose={onClose} footer={<Button onClick={onClose}>关闭</Button>}>
        <div style={{ fontSize: 13, color: '#667085' }}>没有待确认的结算单。</div>
      </Modal>
    );
  }
  const period = task.settlementPeriods.find((p) => p.id === bill.settlementPeriodId);
  const finalAmount = lines.reduce((s, l) => s + Number(l.actualAmount || 0), 0);
  const applied = lines.reduce((s, l) => s + Number(l.serviceAmount || 0), 0);
  return (
    <Modal
      open={!!task}
      title="确认结算单"
      onClose={onClose}
      width={980}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave(bill.id, lines, { declarationAccepted: declared, declarationVersion: SETTLEMENT_DECLARATION_VERSION })}>确认并立即生效</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 13, marginBottom: 12 }}>
        <Info label="合同编号" value={bill.contractNo} />
        <Info label="结算周期" value={period ? `${period.name}（${period.startDate} ~ ${period.endDate}）` : bill.serviceMonth} />
        <Info label="服务时间" value={bill.servicePeriod} />
        <Info label="执行归属月份" value={bill.serviceMonth} />
        <Info label="制单日" value={bill.madeAt} />
        <Info label="服务提供方" value={bill.provider} />
      </div>
      <Banner color="warning">可逐服务项目调整实际结算金额；调整原因必填；每一项目必须在计划金额的 50%—150% 内。确认即生效。</Banner>
      {lines.map((l, i) => {
        const min = Math.round(l.serviceAmount * 0.5);
        const max = Math.round(l.serviceAmount * 1.5);
        const out = l.actualAmount < min || l.actualAmount > max;
        return (
          <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '32px 1.1fr 70px 110px 1fr 90px 90px 1.4fr', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>{i + 1}</span>
            <input value={l.variety} readOnly style={{ ...inputStyle, background: '#F9FAFB' }} />
            <input value={l.region} readOnly style={{ ...inputStyle, background: '#F9FAFB' }} />
            <input value={l.serviceType} readOnly style={{ ...inputStyle, background: '#F9FAFB' }} />
            <input value={l.serviceItem} readOnly style={{ ...inputStyle, background: '#F9FAFB' }} />
            <input type="number" value={l.serviceAmount} readOnly style={{ ...inputStyle, background: '#F9FAFB' }} />
            <input
              type="number"
              value={l.actualAmount}
              onChange={(e) => setLines(patch(lines, i, { actualAmount: Number(e.target.value) || 0 }))}
              style={{ ...inputStyle, borderColor: out ? '#C73A3A' : '#E5E7EB' }}
            />
            <input value={l.remark} onChange={(e) => setLines(patch(lines, i, { remark: e.target.value }))} style={inputStyle} placeholder="调整时必填" />
          </div>
        );
      })}
      <div style={{ marginTop: 14, fontSize: 14, fontWeight: 600 }}>
        申请 {formatCNY(applied)} · 调整 {formatCNY(finalAmount - applied)} · 最终 {formatCNYUpper(finalAmount)}（{formatCNY(finalAmount)}）
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, fontSize: 13, color: '#344054' }}>
        <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <strong>确认声明（{SETTLEMENT_DECLARATION_VERSION}）</strong>
          <div style={{ color: '#667085', marginTop: 4 }}>{SETTLEMENT_DECLARATION_TEXT}</div>
        </span>
      </label>
    </Modal>
  );
}

function HistoryModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  if (!task) return null;
  return (
    <Modal open={!!task} title="结算历史记录" onClose={onClose} width={780} footer={<Button variant="outline" onClick={onClose}>关闭</Button>}>
      {task.settlements.filter((b) => b.confirmed && !b.voided).map((b) => (
        <div key={b.id} style={{ borderBottom: '1px solid #F3F4F6', padding: '10px 0', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{b.billNo}</strong>
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(b.finalAmount)}</span>
          </div>
          <div style={{ color: '#667085', marginTop: 4 }}>
            执行归属月份 {b.serviceMonth} · {b.confirmedAt} · {b.confirmedBy}
            <Button variant="ghost" size="sm" onClick={() => alert(`原型：下载对账单 ${b.billNo}.pdf`)}>下载对账单</Button>
            {b.paymentVoucher ? `凭证：${b.paymentVoucher}` : '未上传付款凭证'}
          </div>
        </div>
      ))}
    </Modal>
  );
}

function VoucherModal({ task, onClose, onSave }: { task: Task | null; onClose: () => void; onSave: (billId: string, name: string) => void }) {
  const bill = task?.settlements.find((b) => b.confirmed && !b.voided && !b.paymentVoucher) ?? task?.settlements.find((b) => b.confirmed && !b.voided);
  const [name, setName] = useState('付款凭证.pdf');
  if (!task || !bill) return null;
  return (
    <Modal
      open={!!task}
      title="上传付款凭证"
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave(bill.id, name)}>上传</Button>
        </>
      }
    >
      <Field label="结算单">{bill.billNo}（执行归属月份 {bill.serviceMonth}）</Field>
      <div style={{ height: 8 }} />
      <Field label="凭证文件名">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </Field>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>原型不真正上传文件，填写名称即可演示。</div>
    </Modal>
  );
}

function ReportUploadModal({ task, onClose, onSave }: { task: Task | null; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  if (!task) return null;
  return (
    <Modal
      open={!!task}
      title="上传报告"
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave(name)}>提交</Button>
        </>
      }
    >
      <Field label="报告名称">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="如 市场分析报告.pdf" />
      </Field>
    </Modal>
  );
}

function ReviewModal({ task, onClose, onSave }: { task: Task | null; onClose: () => void; onSave: (reportId: string, pass: boolean, comment: string) => void }) {
  const pending = task?.reports.find((r) => r.status === '待审核');
  const [comment, setComment] = useState('');
  if (!task) return null;
  return (
    <Modal
      open={!!task}
      title="审核报告"
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="danger" onClick={() => pending && onSave(pending.id, false, comment)}>驳回</Button>
          <Button variant="primary" onClick={() => pending && onSave(pending.id, true, comment)}>通过</Button>
        </>
      }
    >
      {!pending ? <div style={{ fontSize: 13 }}>没有待审核报告。</div> : (
        <>
          <Info label="报告名称" value={pending.name} />
          <div style={{ height: 10 }} />
          <Field label="审核意见（驳回时必填）">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} style={{ ...inputStyle, height: 'auto', padding: 10 }} />
          </Field>
        </>
      )}
    </Modal>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}><div style={{ fontSize: 13, fontWeight: 650, color: '#1F2937' }}>{title}</div>{subtitle && <div style={{ fontSize: 12, color: '#667085' }}>{subtitle}</div>}</div>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1F2937' }}>{value}</div>
    </div>
  );
}

function Banner({ color, children }: { color: 'danger' | 'warning' | 'info'; children: React.ReactNode }) {
  const map = {
    danger: { bg: '#FEECEC', bd: '#FECACA', fg: '#C73A3A' },
    warning: { bg: '#FEF3E2', bd: '#FDE68A', fg: '#C77A16' },
    info: { bg: '#EBF2FE', bd: '#BFDBFE', fg: '#2F6BCE' },
  }[color];
  return (
    <div style={{ padding: '10px 12px', background: map.bg, border: `1px solid ${map.bd}`, borderRadius: 6, fontSize: 13, color: map.fg, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function patch<T>(list: T[], idx: number, part: Partial<T>): T[] {
  return list.map((item, i) => (i === idx ? { ...item, ...part } : item));
}

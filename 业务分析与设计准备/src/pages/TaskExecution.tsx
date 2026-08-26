import { useEffect, useMemo, useState } from 'react';
import { Plus, Eye } from 'lucide-react';
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
import { workGroups, specialists, providers } from '../data/mockData';
import type { NavFocus, NavigateFn, Role, ServiceItem, SettlementLine, Task, WorkgroupSplit, WorkloadAssign, WorkloadProgress } from '../types';
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

export type DetailTab = 'basic' | 'items' | 'exec' | 'report' | 'settle';

const MAIN_STATUS_COLOR: Record<string, 'warning' | 'brand' | 'danger' | 'success' | 'default'> = {
  '待服务商确认': 'warning',
  '执行中': 'brand',
  '待药厂处理': 'danger',
  '已结算': 'success',
  '已撤销': 'default',
};

export function TaskExecution({ addToast, currentRole, navFocus, navigate }: Props) {
  const ctx = useTaskData();
  const {
    tasks, varieties,
    revokeTask, confirmTask, splitToWorkgroup, assignWorkload,
    uploadReport, reviewReport, startSettlement, confirmSettlement,
    completeSettlement, uploadPaymentVoucher,
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
  const [tab, setTab] = useState<DetailTab>('basic');

  const [revokeTarget, setRevokeTarget] = useState<Task | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null);
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

  function openDetail(t: Task, nextTab: DetailTab = 'basic') {
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
          if (r.ok) addToast({ type: 'success', title: '任务已确认', description: `${t.taskNo} 进入执行中` });
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
        description="药厂创建任务（服务商 → 多品种+多地区 → 每品种三张服务表）→ 待确认 → 服务商确认 → 拆解/工作量（单品种单地区）→ 按服务月份+工作组结算。预算不限制任务创建与结算。"
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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
            <thead>
              <tr>
                {['任务编号', '品种 / 服务提供商', '服务地区', '推广时段', '计划总金额', '已结算金额', '执行进度', '当前状态', '待办动作'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr><td colSpan={9}><EmptyState title="暂无任务" description="药厂销售部门可创建任务；服务商确认后进入执行。" /></td></tr>
              ) : pageData.map((t) => {
                const focused = highlightId === t.id;
                const prog = progressCountOf(t);
                const display = displayStatusOf(t);
                return (
                  <tr key={t.id} style={{ background: focused ? '#E8F4F1' : undefined }}>
                    <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{t.taskNo}</td>
                    <td style={td}>
                      <div>{formatCoverage(t.varieties)}</div>
                      <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{t.provider}</div>
                    </td>
                    <td style={td}>{formatCoverage(t.regions)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{t.startDate} ~ {t.endDate}</td>
                    <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{formatCNY(t.planAmount)}</td>
                    <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(t.settledAmount)}</td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {t.workloadAssigns.length > 0
                        ? `已完成 ${prog.done} / 待审核 ${prog.review} / 未完成 ${prog.todo}`
                        : hasPromoItems(t)
                          ? workloadStageOf(t)
                          : t.reports.some((r) => r.status === '待审核') ? '报告待审核' : t.reports.length ? '报告已上传' : '未上传报告'}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4, flexDirection: 'column', alignItems: 'flex-start' }}>
                        <Tag label={display.main} color={MAIN_STATUS_COLOR[display.main] ?? 'default'} />
                        {display.aux && <Tag label={display.aux} color="info" />}
                      </div>
                    </td>
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
        onSave={(billId, lines) => {
          if (!confirmBillTask) return;
          const r = confirmSettlement(confirmBillTask.id, billId, lines);
          if (!r.ok) addToast({ type: 'error', title: '确认失败', description: r.error });
          else {
            const remain = r.data ? remainingOfTask(r.data) : 0;
            addToast({
              type: remain > 0 ? 'warning' : 'success',
              title: '结算单已确认',
              description: remain > 0 ? `剩余可结算 ${formatCNY(remain)}，可择期结算或结算完结` : '任务金额已全部结清',
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
        description={completeTarget ? `结束后任务状态和对账状态均为已结算。剩余可结算金额 ${formatCNY(remainingOfTask(completeTarget))} 将作废，不再计入统计。` : ''}
        impact="此操作为终态，不可恢复。"
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

function CreateTaskModal({
  open, onClose, addToast,
}: {
  open: boolean;
  onClose: () => void;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}) {
  const { varieties, priceItems, reportPrices, createTask, varietiesOf, regionsOf } = useTaskData();
  const memory = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || 'null'); } catch { return null; }
  }, []);

  const [provider, setProvider] = useState(memory?.provider ?? '');
  const [pickedVarieties, setPickedVarieties] = useState<string[]>(memory?.varieties ?? []);
  const [pickedRegions, setPickedRegions] = useState<string[]>(memory?.regions ?? []);
  const [startDate, setStartDate] = useState(memory?.startDate ?? '2026-09-01');
  const [endDate, setEndDate] = useState(memory?.endDate ?? '2026-09-30');
  const [remember, setRemember] = useState(!!memory);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [error, setError] = useState('');

  const varietyOpts = provider ? varietiesOf(provider) : [];
  const regionOpts = provider ? regionsOf(provider, pickedVarieties.length ? pickedVarieties : undefined) : [];
  const first = varieties.find((v) => v.tradeName === pickedVarieties[0]);
  const taskName = pickedVarieties.length ? `${pickedVarieties.join('、')}_${first?.holder ?? ''}` : '';

  function rowsOf(varietyName: string): { promo: PriceRow[]; analysis: PriceRow[]; survey: PriceRow[] } {
    const varietyId = varieties.find((v) => v.tradeName === varietyName)?.id;
    return {
      promo: priceItems.filter((p) => p.varietyId === varietyId && p.category === '市场推广服务')
        .map((p) => ({ category: '市场推广服务', name: p.name, unitPrice: p.amount, unit: p.unit })),
      analysis: reportPrices.filter((p) => p.varietyId === varietyId && p.reportType === '分析报告服务')
        .map((p) => ({ category: '分析报告服务', name: p.name, unitPrice: p.amount, unit: p.unit })),
      survey: reportPrices.filter((p) => p.varietyId === varietyId && p.reportType === '问卷调研与分析服务')
        .map((p) => ({ category: '问卷调研与分析服务', name: p.name, unitPrice: p.amount, unit: p.unit })),
    };
  }

  function setAmount(key: string, value: number) {
    setAmounts((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    const items: ServiceItem[] = [];
    pickedVarieties.forEach((varietyName) => {
      const { promo, analysis, survey } = rowsOf(varietyName);
      [...promo, ...analysis, ...survey].forEach((row) => {
        const amount = amounts[`${varietyName}|${row.category}|${row.name}`] ?? 0;
        if (amount <= 0) return;
        items.push({
          id: '',
          variety: varietyName,
          category: row.category as ServiceItem['category'],
          name: row.name,
          unitPrice: row.unitPrice,
          unit: row.unit,
          qty: row.unitPrice > 0 ? Math.round(amount / row.unitPrice) : 0,
          amount,
        });
      });
    });
    const result = createTask({
      varieties: pickedVarieties, provider, regions: pickedRegions, startDate, endDate, serviceItems: items,
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
    addToast({ type: 'success', title: '任务已创建', description: `${result.data?.taskNo} 进入待确认` });
    setAmounts({});
    setError('');
    onClose();
  }

  const total = Object.values(amounts).reduce((s, n) => s + n, 0);

  function renderServiceTable(varietyName: string, title: string, group: string, rows: PriceRow[]) {
    if (rows.length === 0) return null;
    const sum = rows.reduce((s, r) => s + (amounts[`${varietyName}|${r.category}|${r.name}`] ?? 0), 0);
    return (
      <Section title={title}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['服务项目', '单价', '推广金额（￥）', '系统换算数量'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = `${varietyName}|${r.category}|${r.name}`;
              const amount = amounts[key] ?? 0;
              const qty = r.unitPrice > 0 ? Math.round(amount / r.unitPrice) : 0;
              return (
                <tr key={key}>
                  <td style={td}>{r.name}</td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(r.unitPrice)}/{r.unit}</td>
                  <td style={td}>
                    <input
                      type="number"
                      value={amount || ''}
                      onChange={(e) => setAmount(key, Number(e.target.value) || 0)}
                      placeholder="0"
                      style={{ ...inputStyle, height: 30, width: 140, fontFamily: "'JetBrains Mono', monospace" }}
                    />
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        value={qty || ''}
                        onChange={(e) => setAmount(key, (Number(e.target.value) || 0) * r.unitPrice)}
                        placeholder="0"
                        style={{ ...inputStyle, height: 30, width: 90 }}
                      />
                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>{r.unit}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td style={td} colSpan={3}><strong>{group}合计</strong></td>
              <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{formatCNY(sum)}</td>
            </tr>
          </tbody>
        </table>
      </Section>
    );
  }

  return (
    <Modal
      open={open}
      title="创建任务"
      onClose={onClose}
      width={920}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit}>提交</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <Banner color="danger">{error}</Banner>}

        <Section title="基本信息">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="服务提供商">
              <select
                value={provider}
                onChange={(e) => {
                  const p = e.target.value;
                  setProvider(p);
                  setPickedVarieties([]);
                  setPickedRegions([]);
                  setAmounts({});
                }}
                style={inputStyle}
              >
                <option value="">请选择服务提供商</option>
                {providers.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="任务名称（自动生成）">
              <input value={taskName} readOnly placeholder="选择品种后自动生成" style={{ ...inputStyle, background: '#F9FAFB', color: '#667085' }} />
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="品种（多选，与地区独立；须在该服务商授权范围内）">
                <ChipSelect
                  options={varietyOpts}
                  value={pickedVarieties}
                  onChange={(v) => { setPickedVarieties(v); setAmounts({}); }}
                  placeholder={provider ? '该服务商暂无授权品种' : '请先选择服务商'}
                />
              </Field>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="服务地区（多选，与品种独立；须在该服务商授权范围内）">
                <ChipSelect
                  options={regionOpts}
                  value={pickedRegions}
                  onChange={setPickedRegions}
                  placeholder={provider ? '该服务商暂无授权地区' : '请先选择服务商'}
                />
              </Field>
            </div>
            <Field label="推广时间（开始）"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} /></Field>
            <Field label="推广时间（结束）"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 10 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            记住选项（下次创建自动带出服务商、品种、服务地区与推广时间）
          </label>
        </Section>

        {pickedVarieties.length === 0 ? (
          <EmptyState title="请先选择服务商和品种" description="每个品种各自展示三张服务表；任务金额为各品种合计。" />
        ) : pickedVarieties.map((vn) => {
          const { promo, analysis, survey } = rowsOf(vn);
          return (
            <div key={vn} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#176B5B' }}>{vn}</div>
              {renderServiceTable(vn, '市场推广服务', '市场推广服务', promo)}
              {renderServiceTable(vn, '调研与报告一体化服务 · 分析报告服务', '分析报告服务', analysis)}
              {renderServiceTable(vn, '调研与报告一体化服务 · 问卷调研与分析服务', '问卷调研与分析服务', survey)}
            </div>
          );
        })}
        {pickedVarieties.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 14, fontWeight: 700, padding: '4px 4px 0' }}>
              服务总金额（计划总金额）：{formatCNY(total)}
            </div>
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>
              每个品种各自填写三张服务表；系统换算数量 = 推广金额 ÷ 单价。拆解与工作量在执行阶段落到单品种、单地区。
            </div>
          </>
        )}
      </div>
    </Modal>
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
}) {
  if (!task) return null;
  const promo = hasPromoItems(task);
  const report = hasReportItems(task);
  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'basic', label: '基本信息' },
    { id: 'items', label: '服务项目清单' },
    { id: 'exec', label: '执行与工作量' },
    ...(report ? [{ id: 'report' as const, label: '报告与审核' }] : []),
    { id: 'settle', label: '结算记录' },
  ];
  const remain = remainingOfTask(task);
  const { steps, currentLabel } = stepStateOf(task);

  const groupedCats = ['市场推广服务', '分析报告服务', '问卷调研与分析服务'] as const;

  return (
    <Modal
      open={!!task}
      title={`任务详情 · ${task.taskNo}`}
      onClose={onClose}
      width={960}
      footer={<Button variant="outline" onClick={onClose}>关闭</Button>}
    >
      {/* 固定步骤条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '4px 0 14px', borderBottom: '1px solid #E5E7EB', marginBottom: 12 }}>
        {steps.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', flex: i === steps.length - 1 ? undefined : 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 76 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                background: s.status === 'done' ? '#E8F4F1' : s.status === 'current' ? '#176B5B' : '#F3F4F6',
                color: s.status === 'done' ? '#176B5B' : s.status === 'current' ? '#fff' : '#9CA3AF',
                border: s.status === 'current' ? '2px solid #176B5B' : 'none',
              }}>
                {s.status === 'done' ? '✓' : i + 1}
              </div>
              <div style={{ fontSize: 12, fontWeight: s.status === 'current' ? 700 : 500, color: s.status === 'current' ? '#176B5B' : '#667085' }}>{s.label}</div>
              <div style={{ fontSize: 10, color: '#9CA3AF' }}>{s.owner}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: s.status === 'done' ? '#176B5B' : '#E5E7EB', margin: '0 6px 28px' }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#176B5B', background: '#E8F4F1', borderRadius: 6, padding: '6px 10px', marginBottom: 14 }}>
        {currentLabel}
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E5E7EB', margin: '-4px 0 16px' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            style={{
              padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#176B5B' : '#667085',
              borderBottom: tab === t.id ? '2px solid #176B5B' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'basic' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 13 }}>
          <Info label="任务名称" value={task.taskName} />
          <Info label="品种" value={formatCoverage(task.varieties)} />
          <Info label="服务提供方" value={task.provider} />
          <Info label="服务地区" value={formatCoverage(task.regions)} />
          <Info label="推广时间" value={`${task.startDate} ~ ${task.endDate}`} />
          <Info label="任务状态" value={<StatusTag status={task.taskStatus} size="sm" />} />
          <Info label="对账状态" value={<StatusTag status={task.reconStatus} size="sm" />} />
          <Info label="计划总金额（服务总金额）" value={formatCNY(task.planAmount)} />
          <Info label="已结算金额" value={formatCNY(task.settledAmount)} />
          <Info label="剩余可结算金额" value={task.remainingVoided ? `${formatCNY(0)}（已作废）` : formatCNY(remain)} />
          <Info label="创建人 / 时间" value={`${task.createdBy} · ${task.createdAt}`} />
        </div>
      )}

      {tab === 'items' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['品种', '价目类别（服务类型）', '服务项目', '单价', '数量', '分项金额'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {task.varieties.flatMap((vn) => {
              const items = task.serviceItems.filter((it) => it.variety === vn);
              if (!items.length) return [];
              return [
                <tr key={`v-${vn}`}>
                  <td colSpan={6} style={{ ...td, background: '#E8F4F1', fontWeight: 650, fontSize: 12, color: '#176B5B' }}>{vn}</td>
                </tr>,
                ...groupedCats.filter((c) => items.some((it) => it.category === c)).flatMap((cat) => [
                  <tr key={`g-${vn}-${cat}`}>
                    <td colSpan={6} style={{ ...td, background: '#F9FAFB', fontWeight: 650, fontSize: 12, color: '#667085' }}>
                      {cat === '市场推广服务' ? '市场推广服务（推广）' : `调研与报告一体化服务 · ${cat}（报告）`}
                    </td>
                  </tr>,
                  ...items.filter((it) => it.category === cat).map((it) => (
                    <tr key={it.id}>
                      <td style={td}>{it.variety}</td>
                      <td style={td}>{it.category}</td>
                      <td style={td}>{it.name}</td>
                      <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(it.unitPrice)}/{it.unit}</td>
                      <td style={td}>{it.qty}</td>
                      <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(it.amount)}</td>
                    </tr>
                  )),
                ]),
              ];
            })}
            <tr>
              <td style={td} colSpan={5}><strong>计划总金额（服务总金额）</strong></td>
              <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{formatCNY(task.planAmount)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {tab === 'exec' && (
        <div>
          {promo && task.workgroupSplits.length === 0 && <Banner color="warning">请及时将任务包拆解分派到工作组</Banner>}
          {promo && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px' }}>
                <strong style={{ fontSize: 13 }}>拆解记录</strong>
                {isProvider && task.taskStatus === '执行中' && (
                  <Button variant="primary" size="sm" onClick={onSplit}>拆分任务包到工作组</Button>
                )}
              </div>
              {task.workgroupSplits.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9CA3AF', padding: 12 }}>尚未拆解到工作组</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['工作组', '品种', '地区', '推广金额（发包金额）', '时区'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {task.workgroupSplits.map((s) => (
                      <tr key={s.id}>
                        <td style={td}>{s.workGroup}</td>
                        <td style={td}>{s.variety}</td>
                        <td style={td}>{s.region}</td>
                        <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(s.amount)}</td>
                        <td style={td}>{s.startDate} ~ {s.endDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
                <strong style={{ fontSize: 13 }}>工作量分配（任务量）</strong>
                {task.workgroupSplits.length > 0 && !isCompliance && (
                  <Button variant="outline" size="sm" onClick={onAssign}>分配工作量到服务专员</Button>
                )}
              </div>
              {task.workloadAssigns.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9CA3AF', padding: 12 }}>尚未分配到服务专员</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['专员', '工作组', '品种', '地区', '服务项目', '服务月份', '工作量', '金额', '进度', '结算单'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {task.workloadAssigns.map((a) => (
                      <tr key={a.id}>
                        <td style={td}>{a.specialist}</td>
                        <td style={td}>{a.workGroup}</td>
                        <td style={td}>{a.variety}</td>
                        <td style={td}>{a.region}</td>
                        <td style={td}>{a.itemName}</td>
                        <td style={td}>{a.serviceMonth}</td>
                        <td style={td}>{a.workload}</td>
                        <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(a.amount)}</td>
                        <td style={td}><Tag label={a.progress} color={a.progress === '已完成' ? 'success' : a.progress === '待审核' ? 'warning' : 'default'} /></td>
                        <td style={{ ...td, fontSize: 12, color: a.settledBillNo ? '#176B5B' : '#9CA3AF' }}>{a.settledBillNo ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 12, fontSize: 12, color: '#667085' }}>
                专员填报：先基础数据（标记客户）再业务数据，「已完成」=已审核，可按服务月份选入结算。可跳转
                <button onClick={() => navigate('hospital-visits')} style={{ color: '#176B5B', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>医院拜访</button>
                查看执行记录。
              </div>
            </>
          )}
          {!promo && (
            <div style={{ fontSize: 13, color: '#667085' }}>报告类服务无需拆解到工作组，请到「报告与审核」页签上传或审核报告。</div>
          )}
        </div>
      )}

      {tab === 'report' && (
        <div>
          {isProvider && task.taskStatus === '执行中' && (
            <div style={{ marginBottom: 10 }}><Button variant="primary" size="sm" onClick={onUploadReport}>上传报告</Button></div>
          )}
          {isSales && task.reports.some((r) => r.status === '待审核') && (
            <div style={{ marginBottom: 10 }}><Button variant="primary" size="sm" onClick={onReview}>审核报告</Button></div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['报告名称', '上传时间', '上传人', '审核状态', '审核意见'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {task.reports.length === 0 ? (
                <tr><td style={td} colSpan={5}>尚未上传报告</td></tr>
              ) : task.reports.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.name}</td>
                  <td style={td}>{r.uploadedAt}</td>
                  <td style={td}>{r.uploadedBy}</td>
                  <td style={td}><StatusTag status={r.status} size="sm" /></td>
                  <td style={td}>{r.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'settle' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {isProvider && task.taskStatus === '执行中' && task.reconStatus !== '对账中' && settleableMonths(task).length > 0 && (
              <Button variant="primary" size="sm" onClick={onSettle}>按服务月份发起结算</Button>
            )}
            {isSales && task.reconStatus === '对账中' && (
              <Button variant="primary" size="sm" onClick={onConfirmBill}>确认结算单</Button>
            )}
            {isSales && task.settlements.some((b) => b.confirmed) && (
              <Button variant="outline" size="sm" onClick={onHistory}>查看结算历史</Button>
            )}
            {isSales && task.settlements.some((b) => b.confirmed && !b.paymentVoucher) && (
              <Button variant="outline" size="sm" onClick={onVoucher}>上传付款凭证</Button>
            )}
            {isSales && task.taskStatus === '执行中' && remain > 0 && task.reconStatus !== '对账中' && (
              <Button variant="outline" size="sm" onClick={onComplete}>结算完结（剩余作废）</Button>
            )}
          </div>
          {task.settlements.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>
              暂无结算单。发起结算时按「服务月份 + 工作组」，勾选该组已审核任务量；一张结算单对应一个工作组。
            </div>
          ) : task.settlements.map((b) => (
            <div key={b.id} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <strong>{b.billNo}</strong>
                <span>工作组 {b.workGroup} · 执行归属月份 {b.serviceMonth} · {b.confirmed ? '已确认' : '待确认'} · 制单 {b.madeAt}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['品种', '地区', '服务类型', '服务项目', '服务金额', '实际结算金额', '备注'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {b.lines.map((l) => (
                    <tr key={l.id}>
                      <td style={td}>{l.variety}</td>
                      <td style={td}>{l.region}</td>
                      <td style={td}>{l.serviceType}</td>
                      <td style={td}>{l.serviceItem}</td>
                      <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(l.serviceAmount)}</td>
                      <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(l.actualAmount)}</td>
                      <td style={td}>{l.remark || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 8, fontSize: 13 }}>
                最终结算金额：{formatCNYUpper(b.finalAmount)}（{formatCNY(b.finalAmount)}）
                {b.paymentVoucher && <span style={{ marginLeft: 12, color: '#667085' }}>付款凭证：{b.paymentVoucher}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
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

function ConfirmBillModal({ task, onClose, onSave }: { task: Task | null; onClose: () => void; onSave: (billId: string, lines: SettlementLine[]) => void }) {
  const bill = task?.settlements.find((b) => !b.confirmed);
  const [lines, setLines] = useState<SettlementLine[]>([]);
  useEffect(() => {
    if (bill) setLines(bill.lines.map((l) => ({ ...l })));
  }, [bill?.id]);
  if (!task || !bill) {
    return (
      <Modal open={!!task} title="确认结算单" onClose={onClose} footer={<Button onClick={onClose}>关闭</Button>}>
        <div style={{ fontSize: 13, color: '#667085' }}>没有待确认的结算单。</div>
      </Modal>
    );
  }
  const finalAmount = lines.reduce((s, l) => s + Number(l.actualAmount || 0), 0);
  return (
    <Modal
      open={!!task}
      title="确认结算单"
      onClose={onClose}
      width={980}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave(bill.id, lines)}>确认</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 13, marginBottom: 12 }}>
        <Info label="合同编号" value={bill.contractNo} />
        <Info label="工作组" value={bill.workGroup} />
        <Info label="服务时间" value={bill.servicePeriod} />
        <Info label="执行归属月份" value={bill.serviceMonth} />
        <Info label="制单日" value={bill.madeAt} />
        <Info label="服务提供方" value={bill.provider} />
      </div>
      <Banner color="warning">修改实际结算金额时，备注必填（调整原因，及与服务商达成一致的确认信息）。确认后整单按明细行的品种×地区×服务月份落入预算行。</Banner>
      {lines.map((l, i) => (
        <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '32px 1.2fr 80px 110px 1fr 90px 90px 1.4fr', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>{i + 1}</span>
          <input value={l.variety} onChange={(e) => setLines(patch(lines, i, { variety: e.target.value }))} style={inputStyle} />
          <input value={l.region} onChange={(e) => setLines(patch(lines, i, { region: e.target.value }))} style={inputStyle} />
          <input value={l.serviceType} onChange={(e) => setLines(patch(lines, i, { serviceType: e.target.value }))} style={inputStyle} />
          <input value={l.serviceItem} onChange={(e) => setLines(patch(lines, i, { serviceItem: e.target.value }))} style={inputStyle} />
          <input type="number" value={l.serviceAmount} onChange={(e) => setLines(patch(lines, i, { serviceAmount: Number(e.target.value) || 0 }))} style={inputStyle} />
          <input type="number" value={l.actualAmount} onChange={(e) => setLines(patch(lines, i, { actualAmount: Number(e.target.value) || 0 }))} style={inputStyle} />
          <input value={l.remark} onChange={(e) => setLines(patch(lines, i, { remark: e.target.value }))} style={inputStyle} placeholder="调整时必填" />
        </div>
      ))}
      <div style={{ marginTop: 10 }}>
        <Button variant="outline" size="sm" onClick={() => setLines([...lines, { id: `nl-${lines.length}`, variety: task.varieties[0] ?? '', region: task.regions[0] ?? '', serviceType: '市场推广服务', serviceItem: '', serviceAmount: 0, actualAmount: 0, remark: '' }])}>新增一行</Button>
      </div>
      <div style={{ marginTop: 14, fontSize: 14, fontWeight: 600 }}>
        最终结算金额：{formatCNYUpper(finalAmount)}（{formatCNY(finalAmount)}）
      </div>
    </Modal>
  );
}

function HistoryModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  if (!task) return null;
  return (
    <Modal open={!!task} title="结算历史记录" onClose={onClose} width={780} footer={<Button variant="outline" onClick={onClose}>关闭</Button>}>
      {task.settlements.filter((b) => b.confirmed).map((b) => (
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
  const bill = task?.settlements.find((b) => b.confirmed && !b.paymentVoucher) ?? task?.settlements.find((b) => b.confirmed);
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 12, color: '#1F2937' }}>{title}</div>
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

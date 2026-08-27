import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatusTag } from '../components/StatusTag';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import { DEMO_PROVIDER, formatCNY, formatCoverage, useTaskData } from '../context/TaskDataContext';
import { providers } from '../data/mockData';
import type { NavigateFn, Role, SettlementBill, Task } from '../types';
import type { ToastMessage } from '../components/Toast';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole: Role;
  navigate: NavigateFn;
}

const PAGE_SIZE = 10;
const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
  color: '#9CA3AF', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '12px', fontSize: 13, color: '#1F2937', borderBottom: '1px solid #F3F4F6', verticalAlign: 'top',
};

interface BillRow {
  task: Task;
  bill: SettlementBill;
}

export function Settlement({ currentRole, navigate }: Props) {
  const { tasks } = useTaskData();
  const isProvider = currentRole === '服务提供商';

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const allBills = useMemo<BillRow[]>(() => {
    const rows: BillRow[] = [];
    tasks.forEach((task) => {
      if (isProvider && task.provider !== DEMO_PROVIDER) return;
      task.settlements.forEach((bill) => {
        if (bill.voided) return;
        rows.push({ task, bill });
      });
    });
    return rows.sort((a, b) => (a.bill.madeAt < b.bill.madeAt ? 1 : -1));
  }, [tasks, isProvider]);

  const rows = useMemo(() => allBills.filter(({ task, bill }) => {
    if (applied.variety && !bill.lines.some((l) => l.variety === applied.variety) && !task.varieties.includes(applied.variety)) return false;
    if (applied.provider && task.provider !== applied.provider) return false;
    if (applied.serviceMonth && bill.serviceMonth !== applied.serviceMonth) return false;
    if (applied.status && (bill.confirmed ? '已结算' : '对账中') !== applied.status) return false;
    return true;
  }), [allBills, applied]);

  const pageData = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const confirmedTotal = rows.filter((r) => r.bill.confirmed).reduce((s, r) => s + r.bill.finalAmount, 0);
  const pendingTotal = rows.filter((r) => !r.bill.confirmed).reduce((s, r) => s + r.bill.finalAmount, 0);

  // 服务专员维度统计：由任务执行明细（工作量分配 × 结算单）汇总生成
  const specialistStats = useMemo(() => {
    const map = new Map<string, { specialist: string; workGroup: string; provider: string; settled: number; toSettle: number; tasks: Set<string> }>();
    tasks.forEach((task) => {
      if (isProvider && task.provider !== DEMO_PROVIDER) return;
      task.workloadAssigns.forEach((a) => {
        const key = `${a.specialist}|${a.workGroup}`;
        const entry = map.get(key) ?? { specialist: a.specialist, workGroup: a.workGroup, provider: task.provider, settled: 0, toSettle: 0, tasks: new Set<string>() };
        entry.tasks.add(task.taskNo);
        if (a.settledBillNo) {
          const bill = task.settlements.find((b) => b.billNo === a.settledBillNo);
          if (bill?.confirmed) entry.settled += a.amount;
        } else if (a.progress === '已完成') {
          entry.toSettle += a.amount;
        }
        map.set(key, entry);
      });
    });
    return [...map.values()].sort((a, b) => b.settled + b.toSettle - (a.settled + a.toSettle));
  }, [tasks, isProvider]);

  const monthOptions = useMemo(() => {
    const months = [...new Set(allBills.map((r) => r.bill.serviceMonth))].sort().reverse();
    return months.map((m) => ({ value: m, label: m }));
  }, [allBills]);

  const varietyOptions = useMemo(() => {
    const list = [...new Set(allBills.flatMap((r) => r.bill.lines.map((l) => l.variety)))];
    return list.map((v) => ({ value: v, label: v }));
  }, [allBills]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="结算明细"
        description="结算数据以任务中已确认的结算单为唯一来源，本页只做统计与下钻；发起、确认、完结等操作请到「任务执行」。"
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '14px 20px', minWidth: 180 }}>
            <div style={{ fontSize: 12, color: '#667085', marginBottom: 6 }}>结算单</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{rows.length} <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 400 }}>张</span></div>
          </div>
          <div style={{ flex: 1, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '14px 20px', minWidth: 180 }}>
            <div style={{ fontSize: 12, color: '#667085', marginBottom: 6 }}>已确认结算金额</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#176B5B', fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(confirmedTotal)}</div>
          </div>
          <div style={{ flex: 1, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '14px 20px', minWidth: 180 }}>
            <div style={{ fontSize: 12, color: '#667085', marginBottom: 6 }}>对账中金额</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2F6BCE', fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(pendingTotal)}</div>
          </div>
        </div>

        <FilterBar
          fields={[
            { id: 'variety', label: '品种', type: 'select', options: varietyOptions },
            { id: 'provider', label: '服务提供商', type: 'select', options: providers.map((p) => ({ value: p, label: p })) },
            { id: 'serviceMonth', label: '执行归属月份', type: 'select', options: monthOptions },
            { id: 'status', label: '结算状态', type: 'select', options: [{ value: '对账中', label: '对账中' }, { value: '已结算', label: '已结算' }] },
          ]}
          values={filters}
          onChange={(id, value) => setFilters((f) => ({ ...f, [id]: value }))}
          onSearch={() => { setApplied({ ...filters }); setPage(1); }}
          onReset={() => { setFilters({}); setApplied({}); setPage(1); }}
        />

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr>
                {['结算单号', '关联任务', '品种', '地区', '服务提供商', '工作组', '执行归属月份', '结算状态', '确认结算金额', '确认日期', '付款凭证'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr><td colSpan={11}><EmptyState title="暂无结算单" description="服务提供商在「任务执行」中按服务月份+工作组发起结算后，结算单会出现在这里。" /></td></tr>
              ) : pageData.map(({ task, bill }) => (
                <tr key={bill.id}>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{bill.billNo}</td>
                  <td style={td}>
                    <button
                      onClick={() => navigate('task-dispatch', { taskId: task.id })}
                      style={{ color: '#176B5B', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}
                    >
                      {task.taskNo}
                    </button>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{task.taskName}</div>
                  </td>
                  <td style={td}>{formatCoverage([...new Set(bill.lines.map((l) => l.variety))])}</td>
                  <td style={td}>{formatCoverage([...new Set(bill.lines.map((l) => l.region))])}</td>
                  <td style={td}>{task.provider}</td>
                  <td style={td}>{bill.workGroup}</td>
                  <td style={td}>{bill.serviceMonth}</td>
                  <td style={td}><StatusTag status={bill.confirmed ? '已结算' : '对账中'} size="sm" /></td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{formatCNY(bill.finalAmount)}</td>
                  <td style={td}>{bill.confirmedAt ?? '—'}</td>
                  <td style={{ ...td, fontSize: 12, color: bill.paymentVoucher ? '#176B5B' : '#9CA3AF' }}>{bill.paymentVoucher ?? '未上传'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', fontSize: 13, fontWeight: 650 }}>
            服务专员维度统计
            <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 400, marginLeft: 8 }}>由任务执行明细（工作量分配 × 已确认结算单）汇总生成</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['服务专员', '工作组', '服务提供商', '参与任务数', '已结算金额', '待结算金额（已审核未发起）'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {specialistStats.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="暂无数据" description="分配工作量后，这里按服务专员汇总结算情况。" /></td></tr>
              ) : specialistStats.map((s) => (
                <tr key={`${s.specialist}|${s.workGroup}`}>
                  <td style={td}>{s.specialist}</td>
                  <td style={td}>{s.workGroup}</td>
                  <td style={td}>{s.provider}</td>
                  <td style={td}>{s.tasks.size}</td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace" }}>{formatCNY(s.settled)}</td>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", color: s.toSettle > 0 ? '#C77A16' : '#9CA3AF' }}>{s.toSettle > 0 ? formatCNY(s.toSettle) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { Eye, Edit2, Trash2, Plus, AlertTriangle, Clock } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatusTag, RiskTag } from '../components/StatusTag';
import { Pagination } from '../components/Pagination';
import { Button, IconButton } from '../components/Button';
import { DetailDrawer, FieldGroup, FieldItem } from '../components/DetailDrawer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Timeline } from '../components/Timeline';
import { promotionTasks, providers, workGroups, taskPackages, taskPackageProviders, getTaskPackageByTaskId } from '../data/mockData';
import type { PromotionTask, PageId, TaskExecStatus } from '../types';
import type { ToastMessage } from '../components/Toast';

const PAGE_SIZE = 15;

interface PromotionTasksProps {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navigate: (page: PageId) => void;
}

const riskOrder = { overdue: 0, risk: 1, attention: 2, normal: 3 };

// 条25 任务七态（与 StatusTag 配置表一致）
const execStatuses: TaskExecStatus[] = ['待分解', '待下发', '待执行', '执行中', '已完成', '任务取消', '任务终止'];

const execStatusCardStyles: Record<TaskExecStatus, { color: string; bg: string; border: string }> = {
  '待分解': { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
  '待下发': { color: '#C77A16', bg: '#FEF3E2', border: '#FDE68A' },
  '待执行': { color: '#2F6BCE', bg: '#EBF2FE', border: '#BFDBFE' },
  '执行中': { color: '#176B5B', bg: '#E8F4F1', border: '#A7F3D0' },
  '已完成': { color: '#248A5A', bg: '#E6F5ED', border: '#A7F3D0' },
  '任务取消': { color: '#9CA3AF', bg: '#F3F4F6', border: '#E5E7EB' },
  '任务终止': { color: '#C73A3A', bg: '#FEECEC', border: '#FECACA' },
};

const taskTimeline = [
  { id: 't1', type: '创建' as const, operator: '李强', role: '平台运营', time: '2026-07-15 09:00', detail: '创建推广任务并下发' },
  { id: 't2', type: '修改' as const, operator: '王芳', role: '服务专员', time: '2026-07-18 14:30', detail: '更新任务执行进度至 35%' },
  { id: 't3', type: '提交' as const, operator: '王芳', role: '服务专员', time: '2026-08-01 17:00', detail: '提交阶段拜访记录 3 条' },
];

export function PromotionTasks({ addToast, navigate }: PromotionTasksProps) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [drawerTask, setDrawerTask] = useState<PromotionTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return [...promotionTasks]
      .filter(t => {
        if (filters.riskLevel && t.riskLevel !== filters.riskLevel) return false;
        if (filters.status && t.status !== filters.status) return false;
        if (filters.taskType && t.taskType !== filters.taskType) return false;
        if (filters.doctor && !t.doctor.includes(filters.doctor)) return false;
        if (filters.assignee && !t.assignee.includes(filters.assignee)) return false;
        // deadline 为 YYYY-MM-DD，字符串比较即可满足起止区间筛选
        if (filters.deadlineStart && t.deadline < filters.deadlineStart) return false;
        if (filters.deadlineEnd && t.deadline > filters.deadlineEnd) return false;
        // 任务包 / 承接方 / 品种维度经所属任务包反查（单一事实源）
        const pkg = getTaskPackageByTaskId(t.id);
        if (filters.packageId && (!pkg || pkg.id !== filters.packageId)) return false;
        if (filters.provider && (!pkg || pkg.provider !== filters.provider)) return false;
        if (filters.variety && (!pkg || pkg.variety !== filters.variety)) return false;
        return true;
      })
      .sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);
  }, [filters]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const riskCounts = useMemo(() => ({
    overdue: promotionTasks.filter(t => t.riskLevel === 'overdue').length,
    risk:    promotionTasks.filter(t => t.riskLevel === 'risk').length,
    attention: promotionTasks.filter(t => t.riskLevel === 'attention').length,
    normal:  promotionTasks.filter(t => t.riskLevel === 'normal').length,
  }), []);

  const statusCounts = useMemo(
    () => execStatuses.map(s => ({ status: s, count: promotionTasks.filter(t => t.status === s).length })),
    []
  );

  function handleReset() { setFilters({}); setPage(1); setSelected([]); }
  function toggleRow(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleAll() {
    if (selected.length === pageData.length) setSelected([]);
    else setSelected(pageData.map(t => t.id));
  }

  const filterFields = [
    { id: 'riskLevel', label: '风险状态', type: 'select' as const, options: [
      { value: 'overdue', label: '已逾期' },
      { value: 'risk', label: '风险' },
      { value: 'attention', label: '需关注' },
      { value: 'normal', label: '正常' },
    ]},
    { id: 'status', label: '任务状态', type: 'select' as const, options: execStatuses.map(s => ({ value: s, label: s }))},
    { id: 'taskType', label: '任务类型', type: 'select' as const, options: [
      '学术推广', '产品讲解', '文献分享', '病例讨论', '科室会议',
    ].map(v => ({ value: v, label: v }))},
    { id: 'packageId', label: '任务包', type: 'select' as const, options: taskPackages
      .filter(p => p.taskIds.length > 0)
      .map(p => ({ value: p.id, label: `${p.packageNo} · ${p.provider}` }))},
    { id: 'provider', label: '承接方', type: 'select' as const, options: taskPackageProviders.map(v => ({ value: v, label: v }))},
    { id: 'variety', label: '品种', type: 'select' as const, options: Array.from(new Set(taskPackages.map(p => p.variety))).map(v => ({ value: v, label: v }))},
    { id: 'doctor', label: '医生', type: 'text' as const, placeholder: '搜索医生姓名' },
    { id: 'assignee', label: '负责人', type: 'text' as const, placeholder: '搜索负责人' },
    { id: 'deadlineStart', label: '截止日期起', type: 'date' as const },
    { id: 'deadlineEnd', label: '截止日期止', type: 'date' as const },
  ];

  const statsNode = (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: '#667085' }}>共 <strong style={{ color: '#1F2937', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 条</span>
      {riskCounts.overdue > 0 && (
        <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, color: '#C73A3A', fontWeight: 600 }}>
          <AlertTriangle size={13} /> 已逾期 {riskCounts.overdue}
        </span>
      )}
      {riskCounts.risk > 0 && (
        <span style={{ fontSize: 13, color: '#C77A16', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={13} /> 风险 {riskCounts.risk}
        </span>
      )}
    </div>
  );

  const th = (label: string, w?: string | number) => (
    <th style={{
      padding: '10px 12px',
      textAlign: 'left',
      fontSize: 12,
      fontWeight: 600,
      color: '#9CA3AF',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      background: '#F9FAFB',
      borderBottom: '1px solid #E5E7EB',
      whiteSpace: 'nowrap',
      width: w,
    }}>
      {label}
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="推广任务"
        description="管理药厂推广任务的下发、执行进度和状态"
        actions={
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={14} />}
            onClick={() => addToast({ type: 'info', title: '新建推广任务', description: '此操作将打开分步创建表单（演示中暂不展开）' })}
          >
            新建任务
          </Button>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* Risk summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: '已逾期', count: riskCounts.overdue, color: '#C73A3A', bg: '#FEECEC', border: '#FECACA' },
            { label: '风险（3日内）', count: riskCounts.risk, color: '#C77A16', bg: '#FEF3E2', border: '#FDE68A' },
            { label: '需关注（7日内）', count: riskCounts.attention, color: '#2F6BCE', bg: '#EBF2FE', border: '#BFDBFE' },
            { label: '正常推进', count: riskCounts.normal, color: '#248A5A', bg: '#E6F5ED', border: '#A7F3D0' },
          ].map(s => (
            <div
              key={s.label}
              onClick={() => setFilters({ riskLevel: s.label === '已逾期' ? 'overdue' : s.label.includes('风险') ? 'risk' : s.label.includes('关注') ? 'attention' : 'normal' })}
              style={{
                background: s.bg,
                border: `1px solid ${s.border}`,
                borderRadius: '8px',
                padding: '14px 16px',
                cursor: 'pointer',
                transition: 'box-shadow 150ms ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                {s.count}
              </div>
              <div style={{ fontSize: 12, color: s.color, marginTop: 4, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* 条25 任务七态汇总卡：点击即设任务状态筛选（与风险卡同一交互口径） */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, marginBottom: 16 }}>
          {statusCounts.map(s => {
            const st = execStatusCardStyles[s.status];
            return (
              <div
                key={s.status}
                onClick={() => setFilters({ status: s.status })}
                style={{
                  background: st.bg,
                  border: `1px solid ${st.border}`,
                  borderRadius: '8px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'box-shadow 150ms ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, color: st.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                  {s.count}
                </div>
                <div style={{ fontSize: 12, color: st.color, marginTop: 4, fontWeight: 500 }}>{s.status}</div>
              </div>
            );
          })}
        </div>

        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={(id, val) => setFilters(prev => ({ ...prev, [id]: val }))}
          onSearch={() => setPage(1)}
          onReset={handleReset}
          stats={statsNode}
          extraActions={
            selected.length > 0 ? (
              <>
                <span style={{ fontSize: 13, color: '#667085', padding: '0 4px' }}>已选 {selected.length} 条</span>
                <Button variant="secondary" size="sm" onClick={() => addToast({ type: 'info', title: '批量分配', description: '演示中暂不执行' })}>批量分配</Button>
                <Button variant="secondary" size="sm" style={{ color: '#C73A3A' }} onClick={() => setDeleteTarget('batch')}>批量删除</Button>
              </>
            ) : undefined
          }
          collapsedCount={4}
        />

        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', width: 40 }}>
                    <input type="checkbox" checked={selected.length === pageData.length && pageData.length > 0} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#176B5B' }} />
                  </th>
                  {th('任务编号', 130)}
                  {th('所属任务包', 100)}
                  {th('医生 / 医院')}
                  {th('任务类型', 100)}
                  {th('负责人', 90)}
                  {th('截止时间', 110)}
                  {th('进度', 100)}
                  {th('任务状态', 90)}
                  {th('风险等级', 90)}
                  {th('最近动作')}
                  {th('金额', 90)}
                  {th('操作', 90)}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ padding: 0 }}>
                      <EmptyState
                        title="没有符合条件的推广任务"
                        description="调整筛选条件后重试"
                        action={{ label: '重置筛选', onClick: handleReset }}
                      />
                    </td>
                  </tr>
                ) : pageData.map((task, idx) => {
                  const pkg = getTaskPackageByTaskId(task.id);
                  return (
                  <tr
                    key={task.id}
                    style={{
                      background: task.riskLevel === 'overdue'
                        ? (selected.includes(task.id) ? '#FDECEA' : '#FFFBFB')
                        : (selected.includes(task.id) ? '#F0FAF7' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'),
                      borderBottom: '1px solid #F3F4F6',
                    }}
                    onMouseEnter={e => { if (!selected.includes(task.id)) (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'; }}
                    onMouseLeave={e => { if (!selected.includes(task.id)) (e.currentTarget as HTMLTableRowElement).style.background = task.riskLevel === 'overdue' ? '#FFFBFB' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'; }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <input type="checkbox" checked={selected.includes(task.id)} onChange={() => toggleRow(task.id)} style={{ cursor: 'pointer', accentColor: '#176B5B' }} />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#2F6BCE', cursor: 'pointer' }} onClick={() => setDrawerTask(task)}>
                        {task.taskNo}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {/* 穿透链路第 2 跳：任务 → 所属任务包（task-dispatch） */}
                      {pkg ? (
                        <span
                          style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#176B5B', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          title={`查看任务包 ${pkg.packageNo}`}
                          onClick={() => navigate('task-dispatch')}
                        >
                          {pkg.packageNo}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1F2937' }}>{task.doctor}</div>
                      <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{task.hospital}</div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
                      {task.taskType}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151' }}>
                      {task.assignee}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: task.riskLevel === 'overdue' ? '#C73A3A' : task.riskLevel === 'risk' ? '#C77A16' : '#374151',
                        fontWeight: task.riskLevel === 'overdue' ? 700 : 400,
                      }}>
                        {task.deadline}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 3 }}>
                          <div style={{
                            height: '100%',
                            width: `${task.progress}%`,
                            background: task.progress >= 80 ? '#248A5A' : task.riskLevel === 'overdue' ? '#C73A3A' : '#C77A16',
                            borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#667085', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                          {task.progress}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <StatusTag status={task.status} size="sm" />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <RiskTag level={task.riskLevel} size="sm" />
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#667085', maxWidth: 140 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.lastAction}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#1F2937', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                      ¥{task.amount.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <IconButton icon={<Eye size={13} />} title="查看" size="sm" onClick={() => setDrawerTask(task)} />
                        <IconButton icon={<Edit2 size={13} />} title="修改" size="sm" onClick={() => addToast({ type: 'info', title: '编辑任务', description: '演示中不执行写操作' })} />
                        <IconButton icon={<Trash2 size={13} />} title="删除" size="sm" style={{ color: '#C73A3A' }} onClick={() => setDeleteTarget(task.id)} />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 16px', borderTop: pageData.length > 0 ? '1px solid #F3F4F6' : 'none' }}>
            {pageData.length > 0 && (
              <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
            )}
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      <DetailDrawer
        open={!!drawerTask}
        title={drawerTask ? `推广任务 · ${drawerTask.taskNo}` : ''}
        subtitle={drawerTask ? `${drawerTask.taskType} · ${drawerTask.hospital}` : ''}
        onClose={() => setDrawerTask(null)}
        footer={
          drawerTask ? (
            <>
              <Button variant="outline" size="md" onClick={() => setDrawerTask(null)}>关闭</Button>
              <Button variant="primary" size="md" onClick={() => { addToast({ type: 'info', title: '编辑任务', description: '演示中不执行写操作' }); setDrawerTask(null); }}>
                修改任务
              </Button>
            </>
          ) : null
        }
      >
        {drawerTask && (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              background: '#F9FAFB',
              borderRadius: '8px',
              marginBottom: 20,
              border: '1px solid #E5E7EB',
            }}>
              <StatusTag status={drawerTask.status} />
              <RiskTag level={drawerTask.riskLevel} />
              <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>截止：{drawerTask.deadline}</span>
            </div>

            {drawerTask.riskLevel === 'overdue' && (
              <div style={{
                padding: '10px 14px',
                background: '#FEECEC',
                border: '1px solid #FECACA',
                borderRadius: '6px',
                marginBottom: 16,
                fontSize: 13,
                color: '#C73A3A',
                display: 'flex',
                gap: 8,
              }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>此任务已超过截止时间，请立即与负责人确认处理方案。</span>
              </div>
            )}

            {/* Progress */}
            <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '8px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>任务进度</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: drawerTask.progress >= 80 ? '#248A5A' : '#C77A16', fontFamily: "'JetBrains Mono', monospace" }}>
                  {drawerTask.progress}%
                </span>
              </div>
              <div style={{ height: 10, background: '#E5E7EB', borderRadius: 5 }}>
                <div style={{
                  height: '100%',
                  width: `${drawerTask.progress}%`,
                  background: drawerTask.progress >= 80 ? '#248A5A' : drawerTask.riskLevel === 'overdue' ? '#C73A3A' : '#C77A16',
                  borderRadius: 5,
                  transition: 'width 600ms ease',
                }} />
              </div>
            </div>

            <FieldGroup title="任务信息">
              <FieldItem label="任务编号" value={<span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#2F6BCE' }}>{drawerTask.taskNo}</span>} />
              <FieldItem label="所属任务包" value={(() => {
                const pkg = getTaskPackageByTaskId(drawerTask.id);
                return pkg ? (
                  <span
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: '#176B5B', cursor: 'pointer' }}
                    title={`查看任务包 ${pkg.packageNo}`}
                    onClick={() => navigate('task-dispatch')}
                  >
                    {pkg.packageNo}
                  </span>
                ) : '—';
              })()} />
              <FieldItem label="任务类型" value={drawerTask.taskType} />
              <FieldItem label="医生" value={drawerTask.doctor} />
              <FieldItem label="医院" value={drawerTask.hospital} />
              <FieldItem label="负责人（服务专员）" value={drawerTask.assignee} />
              <FieldItem label="截止时间" value={
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: drawerTask.riskLevel === 'overdue' ? '#C73A3A' : '#374151', fontWeight: drawerTask.riskLevel === 'overdue' ? 700 : 400 }}>
                  {drawerTask.deadline}
                </span>
              } />
            </FieldGroup>

            <FieldGroup title="金额">
              <FieldItem
                label="任务金额"
                value={<span style={{ fontSize: 18, fontWeight: 700, color: '#1F2937', fontFamily: "'JetBrains Mono', monospace" }}>¥{drawerTask.amount.toLocaleString()}</span>}
              />
              <FieldItem label="最近动作" value={drawerTask.lastAction} />
            </FieldGroup>

            <FieldGroup title="操作历史">
              <div style={{ gridColumn: '1 / -1' }}>
                <Timeline events={taskTimeline} />
              </div>
            </FieldGroup>
          </div>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget === 'batch' ? `批量删除 ${selected.length} 条推广任务` : '删除推广任务'}
        description="此操作不可撤销，相关拜访记录和结算数据也将受到影响。"
        impact="删除后无法恢复，相关绩效数据将重新计算。操作日志将记录此次操作。"
        confirmLabel="确认删除"
        variant="danger"
        onConfirm={() => {
          addToast({ type: 'success', title: '删除成功', description: '操作已写入操作日志' });
          setDeleteTarget(null);
          setSelected([]);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

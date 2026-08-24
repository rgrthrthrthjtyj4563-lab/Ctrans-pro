import { useState, useMemo, useEffect } from 'react';
import { Send, BellRing, AlertTriangle, Plus, PackageOpen } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatusTag, RiskTag } from '../components/StatusTag';
import { Pagination } from '../components/Pagination';
import { Button } from '../components/Button';
import { DetailDrawer, FieldGroup, FieldItem } from '../components/DetailDrawer';
import { EmptyState } from '../components/EmptyState';
import { taskPackages, monthlyBudgets, promotionTasks, taskPackageProviders, providers, runBudgetCaliberCheck } from '../data/mockData';
import type { PageId, Role, TaskPackage, TaskPackageStatus } from '../types';
import type { ToastMessage } from '../components/Toast';

const PAGE_SIZE = 10;

// 临时方案：服务商演示身份固定为第一家服务商（智联科技有限公司），待权限模块 permissions.ts 落地后迁移
const PROVIDER_DEMO_IDENTITY = providers[0];

const riskOrder = { overdue: 0, risk: 1, attention: 2, normal: 3 };

// 汇总卡四态桶（任务五）：发包中 = 待承接+已承接；执行中 = 执行中；待初审 = 证据上交；已取消 = 已取消
const statusBuckets: { id: string; label: string; statuses: TaskPackageStatus[]; color: string; bg: string; border: string }[] = [
  { id: '发包中', label: '发包中', statuses: ['待承接', '已承接'], color: '#C77A16', bg: '#FEF3E2', border: '#FDE68A' },
  { id: '执行中', label: '执行中', statuses: ['执行中'], color: '#176B5B', bg: '#E8F4F1', border: '#A7F3D0' },
  { id: '待初审', label: '待初审', statuses: ['证据上交'], color: '#2F6BCE', bg: '#EBF2FE', border: '#BFDBFE' },
  { id: '已取消', label: '已取消', statuses: ['已取消'], color: '#9CA3AF', bg: '#F3F4F6', border: '#E5E7EB' },
];

const allPackageStatuses: TaskPackageStatus[] = ['待承接', '已承接', '执行中', '证据上交', '已初审', '已打绩效', '结算确认', '已取消'];

interface TaskDispatchProps {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navigate: (page: PageId) => void;
  currentRole: Role;
}

export function TaskDispatch({ addToast, navigate, currentRole }: TaskDispatchProps) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [drawerPkg, setDrawerPkg] = useState<TaskPackage | null>(null);

  // 页面挂载即跑口径自检：可用余额 = 预算额 − 已分配 + 已释放（dev 提示）
  useEffect(() => { runBudgetCaliberCheck(); }, []);

  // 服务商角色只看本服务商承接的包（临时方案，待权限模块 permissions.ts 落地后迁移）
  const roleScoped = useMemo(
    () => currentRole === '服务提供商' ? taskPackages.filter(p => p.provider === PROVIDER_DEMO_IDENTITY) : taskPackages,
    [currentRole]
  );

  const filtered = useMemo(() => {
    return [...roleScoped]
      .filter(p => {
        if (filters.status) {
          const bucket = statusBuckets.find(b => b.id === filters.status);
          if (bucket ? !bucket.statuses.includes(p.status) : p.status !== filters.status) return false;
        }
        if (filters.provider && p.provider !== filters.provider) return false;
        if (filters.variety && p.variety !== filters.variety) return false;
        if (filters.month && p.monthBudgetId !== filters.month) return false;
        // deadline 为 YYYY-MM-DD，字符串比较即可满足起止区间筛选
        if (filters.deadlineStart && p.deadline < filters.deadlineStart) return false;
        if (filters.deadlineEnd && p.deadline > filters.deadlineEnd) return false;
        return true;
      })
      .sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);
  }, [roleScoped, filters]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const bucketCounts = useMemo(
    () => statusBuckets.map(b => ({ ...b, count: roleScoped.filter(p => b.statuses.includes(p.status)).length })),
    [roleScoped]
  );

  function handleReset() { setFilters({}); setPage(1); }

  function handleDispatch(pkg: TaskPackage) {
    const budget = monthlyBudgets.find(m => m.id === pkg.monthBudgetId);
    // 条15 校验：占用额超出该月可用余额则阻断
    if (budget && pkg.budgetOccupied > budget.availableAmount) {
      addToast({ type: 'warning', title: '发包被阻断', description: `${pkg.packageNo} 占用额 ¥${pkg.budgetOccupied.toLocaleString()} 超出可用余额 ¥${budget.availableAmount.toLocaleString()}（条15 校验）` });
      return;
    }
    addToast({ type: 'success', title: '发包成功', description: `${pkg.packageNo} 已发包给 ${pkg.provider}，对方将收到承接提醒（演示）` });
  }

  function handleUrge(pkg: TaskPackage) {
    addToast({ type: 'success', title: `催办 ${pkg.packageNo}`, description: '已通过邮件/短信完成通知' });
  }

  const filterFields = [
    { id: 'status', label: '任务包状态', type: 'select' as const, options: [
      ...statusBuckets.map(b => ({ value: b.id, label: `${b.label}（汇总）` })),
      ...allPackageStatuses.map(s => ({ value: s, label: s })),
    ]},
    { id: 'provider', label: '承接方', type: 'select' as const, options: taskPackageProviders.map(v => ({ value: v, label: v }))},
    { id: 'variety', label: '品种', type: 'select' as const, options: Array.from(new Set(taskPackages.map(p => p.variety))).map(v => ({ value: v, label: v }))},
    { id: 'month', label: '月份', type: 'select' as const, options: monthlyBudgets.map(m => ({ value: m.id, label: m.monthLabel }))},
    { id: 'deadlineStart', label: '截止日期起', type: 'date' as const },
    { id: 'deadlineEnd', label: '截止日期止', type: 'date' as const },
  ];

  const occupiedSum = filtered.reduce((s, p) => s + p.budgetOccupied, 0);

  const statsNode = (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: '#667085' }}>共 <strong style={{ color: '#1F2937', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 个任务包</span>
      <span style={{ fontSize: 13, color: '#667085' }}>占用额合计 <strong style={{ color: '#176B5B', fontFamily: "'JetBrains Mono', monospace" }}>¥{occupiedSum.toLocaleString()}</strong></span>
      {filtered.some(p => p.riskLevel === 'overdue') && (
        <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, color: '#C73A3A', fontWeight: 600 }}>
          <AlertTriangle size={13} /> 已逾期 {filtered.filter(p => p.riskLevel === 'overdue').length}
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

  const drawerBudget = drawerPkg ? monthlyBudgets.find(m => m.id === drawerPkg.monthBudgetId) : undefined;
  const drawerTasks = drawerPkg ? promotionTasks.filter(t => drawerPkg.taskIds.includes(t.id)) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="任务包管理"
        description="月度预算分解出的任务包：发包、承接、执行与结算全状态跟踪，额度账本与实绩账本分列展示"
        actions={
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={14} />}
            onClick={() => addToast({ type: 'info', title: '新建任务包', description: '此操作将打开任务包创建表单（演示中暂不展开）' })}
          >
            新建任务包
          </Button>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* 四态汇总卡：点击即设状态筛选（与 PromotionTasks 风险卡同一交互口径） */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {bucketCounts.map(b => (
            <div
              key={b.id}
              onClick={() => setFilters({ status: b.id })}
              style={{
                background: b.bg,
                border: `1px solid ${b.border}`,
                borderRadius: '8px',
                padding: '14px 16px',
                cursor: 'pointer',
                transition: 'box-shadow 150ms ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: b.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                {b.count}
              </div>
              <div style={{ fontSize: 12, color: b.color, marginTop: 4, fontWeight: 500 }}>{b.label}</div>
            </div>
          ))}
        </div>

        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={(id, val) => setFilters(prev => ({ ...prev, [id]: val }))}
          onSearch={() => setPage(1)}
          onReset={handleReset}
          stats={statsNode}
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
                  {th('任务包编号', 110)}
                  {th('关联月度预算', 130)}
                  {th('承接方')}
                  {th('品种')}
                  {th('占用额', 100)}
                  {th('进度', 110)}
                  {th('状态', 90)}
                  {th('截止', 100)}
                  {th('风险', 90)}
                  {th('操作', 130)}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: 0 }}>
                      <EmptyState
                        icon={PackageOpen}
                        title="没有符合条件的任务包"
                        description="调整筛选条件后重试"
                        action={{ label: '重置筛选', onClick: handleReset }}
                      />
                    </td>
                  </tr>
                ) : pageData.map((pkg, idx) => {
                  const budget = monthlyBudgets.find(m => m.id === pkg.monthBudgetId);
                  const overBudget = !!budget && pkg.budgetOccupied > budget.availableAmount;
                  return (
                    <tr
                      key={pkg.id}
                      style={{
                        background: pkg.riskLevel === 'overdue' ? '#FFFBFB' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                        borderBottom: '1px solid #F3F4F6',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = pkg.riskLevel === 'overdue' ? '#FFFBFB' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'; }}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#176B5B', cursor: 'pointer', fontWeight: 600 }} onClick={() => setDrawerPkg(pkg)}>
                          {pkg.packageNo}
                        </span>
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pkg.annualTaskName}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#374151' }}>{budget?.monthLabel ?? '—'}</span>
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>可用 ¥{(budget?.availableAmount ?? 0).toLocaleString()}</div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>{pkg.provider}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#667085', whiteSpace: 'nowrap' }}>{pkg.variety}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#1F2937', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                        ¥{pkg.budgetOccupied.toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${pkg.progress}%`,
                              background: pkg.progress >= 80 ? '#248A5A' : pkg.riskLevel === 'overdue' ? '#C73A3A' : '#C77A16',
                              borderRadius: 3,
                            }} />
                          </div>
                          <span style={{ fontSize: 11, color: '#667085', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                            {pkg.progress}%
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <StatusTag status={pkg.status} size="sm" />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          fontSize: 12,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: pkg.riskLevel === 'overdue' ? '#C73A3A' : pkg.riskLevel === 'risk' ? '#C77A16' : '#374151',
                          fontWeight: pkg.riskLevel === 'overdue' ? 700 : 400,
                        }}>
                          {pkg.deadline}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <RiskTag level={pkg.riskLevel} size="sm" />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {pkg.status === '待承接' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Send size={12} />}
                              title={overBudget ? '超出可用余额（条15 校验）' : `发包给 ${pkg.provider}`}
                              style={overBudget ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                              onClick={() => handleDispatch(pkg)}
                            >
                              发包
                            </Button>
                          )}
                          {['待承接', '已承接', '执行中', '证据上交'].includes(pkg.status) && (
                            <Button variant="outline" size="sm" icon={<BellRing size={12} />} onClick={() => handleUrge(pkg)}>
                              催办
                            </Button>
                          )}
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

      {/* Detail Drawer：额度账本与实绩账本分列 + 关联任务清单（穿透第 3 跳入口） */}
      <DetailDrawer
        open={!!drawerPkg}
        width={620}
        title={drawerPkg ? `任务包 · ${drawerPkg.packageNo}` : ''}
        subtitle={drawerPkg ? drawerPkg.annualTaskName : ''}
        onClose={() => setDrawerPkg(null)}
        footer={
          drawerPkg ? (
            <>
              <Button variant="outline" size="md" onClick={() => setDrawerPkg(null)}>关闭</Button>
              {['待承接', '已承接', '执行中', '证据上交'].includes(drawerPkg.status) && (
                <Button variant="secondary" size="md" icon={<BellRing size={14} />} onClick={() => handleUrge(drawerPkg)}>催办</Button>
              )}
              {drawerPkg.status === '待承接' && (
                <Button variant="primary" size="md" icon={<Send size={14} />} onClick={() => handleDispatch(drawerPkg)}>发包</Button>
              )}
            </>
          ) : null
        }
      >
        {drawerPkg && (
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
              <StatusTag status={drawerPkg.status} />
              <RiskTag level={drawerPkg.riskLevel} />
              <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>截止：{drawerPkg.deadline}</span>
            </div>

            {drawerPkg.riskLevel === 'overdue' && (
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
                <span>此任务包已超过截止时间，请立即催办承接方或启动处置流程。</span>
              </div>
            )}

            {/* 执行进度（条26 工作量口径） */}
            <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '8px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>执行进度（工作量口径）</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: drawerPkg.progress >= 80 ? '#248A5A' : '#C77A16', fontFamily: "'JetBrains Mono', monospace" }}>
                  {drawerPkg.progress}%
                </span>
              </div>
              <div style={{ height: 10, background: '#E5E7EB', borderRadius: 5 }}>
                <div style={{
                  height: '100%',
                  width: `${drawerPkg.progress}%`,
                  background: drawerPkg.progress >= 80 ? '#248A5A' : drawerPkg.riskLevel === 'overdue' ? '#C73A3A' : '#C77A16',
                  borderRadius: 5,
                  transition: 'width 600ms ease',
                }} />
              </div>
            </div>

            {/* 额度账本 */}
            <FieldGroup title="额度账本">
              <FieldItem label="占用额（本包）" value={
                <span style={{ fontSize: 16, fontWeight: 700, color: '#176B5B', fontFamily: "'JetBrains Mono', monospace" }}>¥{drawerPkg.budgetOccupied.toLocaleString()}</span>
              } />
              <FieldItem label="关联月度预算" value={drawerBudget?.monthLabel ?? '—'} />
              <FieldItem label="月度预算额" value={`¥${(drawerBudget?.budgetAmount ?? 0).toLocaleString()}`} />
              <FieldItem label="月度可用余额" value={
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: drawerBudget && drawerPkg.budgetOccupied > drawerBudget.availableAmount ? '#C73A3A' : '#374151' }}>
                  ¥{(drawerBudget?.availableAmount ?? 0).toLocaleString()}
                </span>
              } />
            </FieldGroup>

            {/* 实绩账本 */}
            <FieldGroup title="实绩账本">
              <FieldItem label="执行中（待审）" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>¥{drawerPkg.executingAmount.toLocaleString()}</span>} />
              <FieldItem label="已执行" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>¥{drawerPkg.executedAmount.toLocaleString()}</span>} />
              <FieldItem label="已结算" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>¥{drawerPkg.settledAmount.toLocaleString()}</span>} />
              <FieldItem label="区域" value={drawerPkg.region} />
            </FieldGroup>

            <FieldGroup title="基本信息">
              <FieldItem label="承接方" value={drawerPkg.provider} />
              <FieldItem label="品种" value={drawerPkg.variety} />
              <FieldItem label="关联任务数" value={`${drawerPkg.taskIds.length} 条`} />
              <FieldItem label="截止时间" value={
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: drawerPkg.riskLevel === 'overdue' ? '#C73A3A' : '#374151', fontWeight: drawerPkg.riskLevel === 'overdue' ? 700 : 400 }}>
                  {drawerPkg.deadline}
                </span>
              } />
            </FieldGroup>

            {/* 关联任务清单：穿透第 3 跳入口（→ promotion-tasks 执行明细） */}
            <FieldGroup title={`关联任务清单（${drawerTasks.length}）`}>
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {drawerTasks.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#9CA3AF', padding: '8px 0' }}>尚未分解至任务</div>
                ) : drawerTasks.map(t => (
                  <div key={t.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    border: '1px solid #F3F4F6',
                    borderRadius: '6px',
                    background: '#FAFAFA',
                  }}>
                    <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: '#2F6BCE', whiteSpace: 'nowrap' }}>{t.taskNo}</span>
                    <span style={{ fontSize: 12, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.doctor} · {t.hospital}
                    </span>
                    <StatusTag status={t.status} size="sm" />
                    <span style={{ fontSize: 11, color: '#667085', fontFamily: "'JetBrains Mono', monospace" }}>{t.progress}%</span>
                    <Button variant="outline" size="sm" onClick={() => navigate('promotion-tasks')}>查看执行明细</Button>
                  </div>
                ))}
              </div>
            </FieldGroup>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

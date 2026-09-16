import { useState, useMemo } from 'react';
import { Eye, Edit2, Trash2, Download, CheckCircle, XCircle, AlertCircle, Info, MapPin, ShieldOff } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatusTag } from '../components/StatusTag';
import { Pagination } from '../components/Pagination';
import { Button, IconButton } from '../components/Button';
import { DetailDrawer, FieldGroup, FieldItem } from '../components/DetailDrawer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Timeline } from '../components/Timeline';
import { EmptyState } from '../components/EmptyState';
import { visitRecords, providers, workGroups, visitCategories } from '../data/mockData';
import { usePermission } from '../context/PermissionContext';
import { NO_BIZ_SCOPE_TITLE, noBizScopeDescription, useServingScope } from '../hooks/useServingBizScope';
import { InfoBanner } from './permUi';
import type { VisitRecord, AuditStatus, Role } from '../types';
import type { ToastMessage } from '../components/Toast';

type TabId = '医院拜访' | '商业拜访' | '药房拜访';
type DrawerTab = '记录详情' | '操作历史' | '拜访位置';

const PAGE_SIZE = 15;
const DRAWER_TABS: DrawerTab[] = ['记录详情', '操作历史', '拜访位置'];

interface VisitManagementProps {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole?: Role;
}

const mockTimeline = [
  { id: 'e1', type: '创建' as const, operator: '张伟', role: '服务专员', time: '2026-08-18 09:12', detail: '服务专员新建拜访记录' },
  { id: 'e2', type: '提交' as const, operator: '张伟', role: '服务专员', time: '2026-08-18 17:30', detail: '提交审核' },
  { id: 'e3', type: '审核驳回' as const, operator: '李强', role: '服务商管理员', time: '2026-08-19 10:05', comment: '拜访内容描述不详细，请补充学术交流细节。' },
  { id: 'e4', type: '修改' as const, operator: '张伟', role: '服务专员', time: '2026-08-19 14:22', detail: '修改拜访内容描述' },
  { id: 'e5', type: '提交' as const, operator: '张伟', role: '服务专员', time: '2026-08-19 14:25', detail: '重新提交审核' },
];

function hashLatLng(id: string): { lat: string; lng: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const lat = (25.1032 + ((h % 180) - 90) / 10000).toFixed(4);
  const lng = (117.0297 + (((h >> 9) % 180) - 90) / 10000).toFixed(4);
  return { lat, lng };
}

function VisitLocationMap({ record }: { record: VisitRecord }) {
  const { lat, lng } = hashLatLng(record.id);
  const pinX = 268;
  const pinY = 148;

  return (
    <>
      <div style={{
        position: 'relative',
        borderRadius: 8,
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        background: '#F6F8FA',
        marginBottom: 16,
      }}>
        <svg viewBox="0 0 640 360" width="100%" style={{ display: 'block' }} aria-hidden>
          <rect x="28" y="24" width="148" height="92" rx="6" fill="#E9EDF1" />
          <rect x="196" y="18" width="118" height="74" rx="6" fill="#EEF1F4" />
          <rect x="332" y="32" width="96" height="86" rx="6" fill="#E9EDF1" />
          <rect x="28" y="136" width="86" height="70" rx="6" fill="#EEF1F4" />
          <rect x="340" y="176" width="132" height="88" rx="6" fill="#E9EDF1" />
          <rect x="496" y="168" width="112" height="76" rx="6" fill="#EEF1F4" />
          <rect x="196" y="248" width="124" height="72" rx="6" fill="#E9EDF1" />
          <rect x="470" y="36" width="132" height="82" rx="8" fill="#E6F5ED" />
          <rect x="36" y="248" width="176" height="72" rx="14" fill="#EBF2FE" />
          <line x1="0" y1="228" x2="640" y2="118" stroke="#FFFFFF" strokeWidth="18" strokeLinecap="round" />
          <line x1="120" y1="0" x2="120" y2="360" stroke="#FFFFFF" strokeWidth="10" />
          <line x1="0" y1="120" x2="640" y2="120" stroke="#FFFFFF" strokeWidth="8" />
          <line x1="0" y1="210" x2="640" y2="210" stroke="#FFFFFF" strokeWidth="8" />
          <line x1="320" y1="0" x2="320" y2="360" stroke="#FFFFFF" strokeWidth="8" />
          <line x1="480" y1="0" x2="480" y2="360" stroke="#FFFFFF" strokeWidth="8" />
          <line x1="0" y1="300" x2="640" y2="300" stroke="#FFFFFF" strokeWidth="8" />
          <circle className="visit-pin-pulse" cx={pinX} cy={pinY} r="28" fill="var(--color-brand)" />
          <circle cx={pinX} cy={pinY} r="7" fill="var(--color-brand)" stroke="#FFFFFF" strokeWidth="2" />
        </svg>
        <MapPin
          size={18}
          color="var(--color-brand)"
          aria-hidden
          style={{
            position: 'absolute',
            left: `${(pinX / 640) * 100}%`,
            top: `${(pinY / 360) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 10px))',
            pointerEvents: 'none',
          }}
        />
        <div style={{
          position: 'absolute',
          left: `${((pinX + 36) / 640) * 100}%`,
          top: `${((pinY - 52) / 360) * 100}%`,
          width: 248,
          maxWidth: '52%',
          background: '#FFFFFF',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginBottom: 4 }}>打卡位置</div>
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', lineHeight: 1.5, marginBottom: 8 }}>
            {record.visitLocation}
          </div>
          <div style={{ fontSize: 'var(--fs-12)', color: '#667085', fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>
            {record.visitDate} {record.startClock}
          </div>
          <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>
            N{lat}° E{lng}°
          </div>
        </div>
        <div style={{
          position: 'absolute',
          right: 10,
          bottom: 8,
          fontSize: 'var(--fs-11)',
          color: '#9CA3AF',
          pointerEvents: 'none',
        }}>
          示意地图
        </div>
        <style>{`
          .visit-pin-pulse { opacity: 0.15; }
          @keyframes visitPinPulse {
            0% { opacity: 0.15; }
            70% { opacity: 0; }
            100% { opacity: 0; }
          }
          @media (prefers-reduced-motion: no-preference) {
            .visit-pin-pulse { animation: visitPinPulse 2.2s ease-out infinite; }
          }
        `}</style>
      </div>
      <FieldItem label="拜访位置" value={record.visitLocation} span />
    </>
  );
}

export function VisitManagement({ addToast }: VisitManagementProps) {
  const { principal, can } = usePermission();
  // 审核能力按角色页面权限判定（服务商侧审核；不再用旧角色名称字符串）
  const isProvider = can('hospital-visits', 'approve');
  // 统一过滤口径（P0-C）：当前服务商 + 当前服务药厂 + 已授权品种 + 派生区域；
  // 范围失效默认拒绝；备案类警告只拦学术拜访动作，不拦登录与查看（§8.2）
  const { denied, scope, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow } = useServingScope();
  // 判别别名（TS narrowing）：服务商会话的备案警告读取
  const isProviderTenant = principal.realm === 'TENANT' && principal.tenantKind === 'provider';
  const filingBlocked = isProviderTenant ? Boolean(principal.pharmaWarning) : false;
  const isAcademicVisit = (r: VisitRecord) => r.visitCategory.includes('学术');
  const [activeTab, setActiveTab] = useState<TabId>('医院拜访');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [drawerRecord, setDrawerRecord] = useState<VisitRecord | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('记录详情');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [batchAction, setBatchAction] = useState<null | 'approve' | 'reject'>(null);
  const [showAuditPanel, setShowAuditPanel] = useState(false);
  const [auditComment, setAuditComment] = useState('');

  // 会话口径过滤后的基础集合（tab 计数与列表同源，不再用未过滤总数）
  const sessionFiltered = useMemo(() => {
    if (denied) return [] as VisitRecord[];
    return visitRecords.filter((r) =>
      (!isProviderSession || matchesProviderRow({ provider: r.provider, holderPharma: r.holderPharma, variety: r.variety })) &&
      (!isPharmaSession || matchesPharmaRow(r)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denied, isProviderSession, isPharmaSession, matchesProviderRow, matchesPharmaRow]);

  const tabCounts: Record<TabId, number> = {
    '医院拜访': sessionFiltered.length,
    '商业拜访': Math.floor(sessionFiltered.length * 0.6),
    '药房拜访': Math.floor(sessionFiltered.length * 0.4),
  };

  const filtered = useMemo(() => {
    return sessionFiltered.filter(r => {
      if (filters.provider && !r.provider.includes(filters.provider)) return false;
      if (filters.workGroup && r.workGroup !== filters.workGroup) return false;
      if (filters.category && r.visitCategory !== filters.category) return false;
      if (filters.specialist) {
        const q = filters.specialist;
        const hitName = r.specialist.includes(q);
        const hitAccount = r.specialistAccount.toLowerCase().includes(q.toLowerCase());
        if (!hitName && !hitAccount) return false;
      }
      if (filters.hospital && !r.hospital.includes(filters.hospital)) return false;
      if (filters.auditStatus && r.auditStatus !== filters.auditStatus) return false;
      return true;
    });
  }, [sessionFiltered, filters]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(r => {
      counts[r.auditStatus] = (counts[r.auditStatus] || 0) + 1;
    });
    return counts;
  }, [filtered]);

  function handleFilterChange(id: string, val: string) {
    setFilters(prev => ({ ...prev, [id]: val }));
  }
  function handleReset() {
    setFilters({});
    setPage(1);
    setSelected([]);
  }

  function toggleRow(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleAll() {
    if (selected.length === pageData.length) setSelected([]);
    else setSelected(pageData.map(r => r.id));
  }

  function handleBatchApprove() {
    setBatchAction('approve');
  }
  function handleBatchReject() {
    setBatchAction('reject');
  }

  function confirmBatch() {
    addToast({
      type: batchAction === 'approve' ? 'success' : 'warning',
      title: batchAction === 'approve' ? `批量审核通过 ${selected.length} 条` : `批量驳回 ${selected.length} 条`,
      description: '操作已写入操作日志',
    });
    setSelected([]);
    setBatchAction(null);
    setAuditComment('');
  }

  function confirmDelete() {
    addToast({ type: 'success', title: '删除成功', description: '操作已写入操作日志' });
    setDeleteTarget(null);
  }

  function openDrawer(record: VisitRecord) {
    setDrawerRecord(record);
    setDrawerTab('记录详情');
    setShowAuditPanel(false);
  }

  function closeDrawer() {
    setDrawerRecord(null);
    setShowAuditPanel(false);
    setDrawerTab('记录详情');
  }

  const filterFields = [
    { id: 'provider', label: '服务提供商', type: 'select' as const, options: providers.map(p => ({ value: p, label: p })) },
    { id: 'workGroup', label: '工作组', type: 'select' as const, options: workGroups.map(w => ({ value: w, label: w })) },
    { id: 'category', label: '拜访类别', type: 'select' as const, options: visitCategories.map(c => ({ value: c, label: c })) },
    { id: 'specialist', label: '服务专员', type: 'text' as const, placeholder: '搜索服务专员' },
    { id: 'hospital', label: '医院名称', type: 'text' as const, placeholder: '搜索医院' },
    { id: 'auditStatus', label: '审核状态', type: 'select' as const, options: [
      { value: '待审核', label: '待审核' },
      { value: '已通过', label: '已通过' },
      { value: '已驳回', label: '已驳回' },
    ]},
    { id: 'startDate', label: '开始日期', type: 'date' as const },
    { id: 'endDate', label: '结束日期', type: 'date' as const },
  ];

  const statsNode = (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 'var(--fs-13)' }}>
      <span style={{ color: '#667085' }}>共 <strong style={{ color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 条</span>
      {Object.entries(statusCounts).map(([status, count]) => (
        <span key={status} style={{ color: '#667085', display: 'flex', alignItems: 'center', gap: 4 }}>
          <StatusTag status={status as AuditStatus} size="sm" />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: '#374151' }}>{count}</span>
        </span>
      ))}
    </div>
  );

  const extraActions = (
    <>
      <Button variant="outline" size="sm" icon={<Download size={13} />}>导出</Button>
      {isProvider && selected.length > 0 && (
        <>
          <span style={{ fontSize: 'var(--fs-13)', color: '#667085', padding: '0 4px' }}>已选 {selected.length} 条</span>
          <Button variant="secondary" size="sm" icon={<CheckCircle size={13} />} onClick={handleBatchApprove}>批量审核通过</Button>
          <Button variant="secondary" size="sm" icon={<XCircle size={13} />} onClick={handleBatchReject} style={{ color: '#C73A3A' }}>批量驳回</Button>
          <Button variant="secondary" size="sm" icon={<Trash2 size={13} />} onClick={() => setDeleteTarget('batch')} style={{ color: '#C73A3A' }}>批量删除</Button>
        </>
      )}
    </>
  );

  const th = (label: string, w?: string | number) => (
    <th style={{
      padding: '10px 12px',
      textAlign: 'left',
      fontSize: 'var(--fs-12)',
      fontWeight: 600,
      color: '#9CA3AF',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      background: '#F9FAFB',
      borderBottom: '1px solid var(--color-border)',
      whiteSpace: 'nowrap',
      width: w,
    }}>
      {label}
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="拜访管理"
        description="管理服务专员的医院、商业及药房拜访记录"
        tabs={[
          { id: '医院拜访', label: '医院拜访', count: tabCounts['医院拜访'] },
          { id: '商业拜访', label: '商业拜访', count: tabCounts['商业拜访'] },
          { id: '药房拜访', label: '药房拜访', count: tabCounts['药房拜访'] },
        ]}
        activeTab={activeTab}
        onTabChange={t => { setActiveTab(t as TabId); setPage(1); setSelected([]); }}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {denied ? (
          <EmptyState icon={ShieldOff} title={NO_BIZ_SCOPE_TITLE} description={noBizScopeDescription(scope?.pharmaName)} />
        ) : (
        <>
        {filingBlocked && (
          <div style={{ marginBottom: 12 }}>
            <InfoBanner tone="warning">
              当前服务药厂的备案存在异常（待审/退回/过期/暂停）：可进入药厂并查看数据，
              但<b>学术拜访类业务动作被阻断</b>（不可发起、提交或审核学术拜访）。下一步：请在「服务人员备案」补正材料或等待审核通过。
            </InfoBanner>
          </div>
        )}
        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={handleFilterChange}
          onSearch={() => setPage(1)}
          onReset={handleReset}
          stats={statsNode}
          extraActions={extraActions}
          collapsedCount={4}
        />

        <div style={{
          background: '#FFFFFF',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{
                    padding: '10px 12px',
                    background: '#F9FAFB',
                    borderBottom: '1px solid var(--color-border)',
                    width: 40,
                  }}>
                    <input
                      type="checkbox"
                      checked={selected.length === pageData.length && pageData.length > 0}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer', accentColor: 'var(--color-brand)' }}
                    />
                  </th>
                  {th('序号', 50)}
                  {th('服务专员')}
                  {th('服务提供商')}
                  {th('工作组')}
                  {th('医院 / 科室 / 被拜访人')}
                  {th('品种_规格')}
                  {th('拜访时段')}
                  {th('开始时间', 150)}
                  {th('结束时间', 150)}
                  {th('绩效状态')}
                  {th('审核状态')}
                  {th('审核意见')}
                  {th('操作', isProvider ? 140 : 70)}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={14} style={{ padding: 0 }}>
                      <EmptyState
                        title="没有符合条件的拜访记录"
                        description="尝试调整筛选条件，或联系管理员确认数据范围。"
                        hint="当前筛选条件过于严格"
                        action={{ label: '重置筛选', onClick: handleReset }}
                      />
                    </td>
                  </tr>
                ) : pageData.map((record, idx) => (
                  <tr
                    key={record.id}
                    style={{
                      background: selected.includes(record.id) ? '#F0FAF7' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                      borderBottom: '1px solid #F3F4F6',
                    }}
                    onMouseEnter={e => { if (!selected.includes(record.id)) (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'; }}
                    onMouseLeave={e => { if (!selected.includes(record.id)) (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'; }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(record.id)}
                        onChange={() => toggleRow(record.id)}
                        style={{ cursor: 'pointer', accentColor: 'var(--color-brand)' }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 'var(--fs-13)', fontWeight: 500, color: 'var(--color-text-1)' }}>{record.specialist}</div>
                      <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                        {record.specialistAccount}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-13)', color: '#374151', maxWidth: 120 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {record.provider}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-13)', color: '#374151', whiteSpace: 'nowrap' }}>
                      {record.workGroup}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 'var(--fs-13)', fontWeight: 500, color: 'var(--color-text-1)' }}>{record.hospital}</div>
                      <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>
                        {record.department} · {record.visitee}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-13)', color: '#374151', maxWidth: 140 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.variety}>
                        {record.variety}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-12)', color: '#667085', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                      {record.visitPeriod}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 'var(--fs-12)', color: '#374151', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                        {record.startTime}
                      </div>
                      {!record.startOnTime && (
                        <div style={{ fontSize: 'var(--fs-11)', color: '#248A5A', marginTop: 1 }}>非整点</div>
                      )}
                      {record.startOnTime && (
                        <div style={{ fontSize: 'var(--fs-11)', color: '#C77A16', marginTop: 1 }}>整点</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 'var(--fs-12)', color: '#374151', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                        {record.endTime}
                      </div>
                      {!record.endOnTime && (
                        <div style={{ fontSize: 'var(--fs-11)', color: '#248A5A', marginTop: 1 }}>非整点</div>
                      )}
                      {record.endOnTime && (
                        <div style={{ fontSize: 'var(--fs-11)', color: '#C77A16', marginTop: 1 }}>整点</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <StatusTag status={record.performanceStatus} size="sm" />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <StatusTag status={record.auditStatus} size="sm" />
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-12)', color: '#C73A3A', maxWidth: 140 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.auditComment}>
                        {record.auditComment || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <IconButton
                          icon={<Eye size={13} />}
                          title="查看详情"
                          aria-label="查看详情"
                          size="sm"
                          onClick={() => openDrawer(record)}
                        />
                        {isProvider && record.auditStatus === '待审核' && (
                          <IconButton
                            icon={<CheckCircle size={13} />}
                            title={filingBlocked && isAcademicVisit(record) ? '备案异常：学术拜访类动作已阻断' : '审核通过'}
                            aria-label="审核通过"
                            size="sm"
                            disabled={filingBlocked && isAcademicVisit(record)}
                            onClick={() => {
                              if (filingBlocked && isAcademicVisit(record)) {
                                addToast({ type: 'warning', title: '学术拜访已阻断', description: '当前备案异常（可进入药厂但不可发起/审核学术拜访），请先在「服务人员备案」完成补正。' });
                                return;
                              }
                              addToast({
                                type: 'success',
                                title: '审核通过',
                                description: `${record.id} 已通过审核，操作已写入操作日志`,
                              });
                            }}
                          />
                        )}
                        {isProvider && (
                          <>
                            <IconButton
                              icon={<Edit2 size={13} />}
                              title="修改"
                              aria-label="修改"
                              size="sm"
                              onClick={() => addToast({ type: 'info', title: '编辑模式', description: '此操作在真实系统中会打开编辑表单' })}
                            />
                            <IconButton
                              icon={<Trash2 size={13} />}
                              title="删除"
                              aria-label="删除"
                              size="sm"
                              style={{ color: '#C73A3A' }}
                              onClick={() => setDeleteTarget(record.id)}
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '0 16px', borderTop: pageData.length > 0 ? '1px solid #F3F4F6' : 'none' }}>
            {pageData.length > 0 && (
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                onChange={setPage}
              />
            )}
          </div>
        </div>
        </>
        )}
      </div>

      {/* Detail Drawer */}
      <DetailDrawer
        open={!!drawerRecord}
        title={drawerRecord ? `拜访记录 · ${drawerRecord.id}` : ''}
        subtitle={drawerRecord ? `${activeTab} · ${drawerRecord.hospital}` : ''}
        width={720}
        onClose={closeDrawer}
        footer={
          drawerRecord ? (
            <>
              <Button variant="outline" size="md" onClick={closeDrawer}>关闭</Button>
              {isProvider && drawerRecord.auditStatus === '待审核' && (
                <>
                  <Button
                    variant="primary"
                    size="md"
                    icon={<CheckCircle size={14} />}
                    disabled={filingBlocked && isAcademicVisit(drawerRecord)}
                    title={filingBlocked && isAcademicVisit(drawerRecord) ? '备案异常：学术拜访类动作已阻断' : undefined}
                    onClick={() => {
                      if (filingBlocked && isAcademicVisit(drawerRecord)) {
                        addToast({ type: 'warning', title: '学术拜访已阻断', description: '当前备案异常（可进入药厂但不可发起/审核学术拜访），请先在「服务人员备案」完成补正。' });
                        return;
                      }
                      addToast({ type: 'success', title: '审核通过', description: '操作已写入操作日志' });
                      closeDrawer();
                    }}
                  >
                    审核通过
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    icon={<XCircle size={14} />}
                    onClick={() => {
                      setDrawerTab('记录详情');
                      setShowAuditPanel(!showAuditPanel);
                    }}
                  >
                    驳回
                  </Button>
                </>
              )}
            </>
          ) : null
        }
      >
        {drawerRecord && (
          <div>
            <div style={{
              display: 'flex',
              gap: 20,
              borderBottom: '1px solid var(--color-border)',
              marginBottom: 16,
            }}>
              {DRAWER_TABS.map(tab => {
                const active = drawerTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDrawerTab(tab)}
                    style={{
                      padding: '8px 0',
                      fontSize: 'var(--fs-13)',
                      color: active ? 'var(--color-brand)' : '#667085',
                      border: 'none',
                      borderBottom: active ? '2px solid var(--color-brand)' : '2px solid transparent',
                      background: 'none',
                      cursor: 'pointer',
                      marginBottom: -1,
                      fontFamily: 'inherit',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {drawerTab === '记录详情' && (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  background: '#F9FAFB',
                  borderRadius: '8px',
                  marginBottom: 20,
                  border: '1px solid var(--color-border)',
                }}>
                  <StatusTag status={drawerRecord.auditStatus} />
                  <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>·</span>
                  <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>绩效状态：</span>
                  <StatusTag status={drawerRecord.performanceStatus} size="sm" />
                  <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginLeft: 'auto' }}>
                    {drawerRecord.startTime}
                  </span>
                </div>

                {drawerRecord.auditStatus === '已驳回' && drawerRecord.auditComment && (
                  <div style={{
                    padding: '10px 14px',
                    background: '#FEECEC',
                    border: '1px solid #FECACA',
                    borderRadius: '6px',
                    marginBottom: 16,
                    fontSize: 'var(--fs-13)',
                    color: '#C73A3A',
                    display: 'flex',
                    gap: 8,
                  }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <strong>驳回原因：</strong>{drawerRecord.auditComment}
                    </div>
                  </div>
                )}

                <FieldGroup title="基础信息">
                  <FieldItem
                    label="服务专员"
                    value={
                      <span>
                        {drawerRecord.specialist}{' '}
                        <span style={{ color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)' }}>
                          {drawerRecord.specialistAccount}
                        </span>
                      </span>
                    }
                  />
                  <FieldItem label="服务提供商" value={drawerRecord.provider} />
                  <FieldItem label="工作组" value={drawerRecord.workGroup} />
                  <FieldItem label="医院" value={drawerRecord.hospital} />
                  <FieldItem label="医院等级" value={drawerRecord.hospitalGrade} />
                  <FieldItem label="拜访科室" value={drawerRecord.department} />
                  <FieldItem label="被拜访人" value={drawerRecord.visitee} />
                  <FieldItem label="拜访方式" value={drawerRecord.visitMethod} />
                </FieldGroup>

                <FieldGroup title="拜访信息">
                  <FieldItem label="品种_规格" value={drawerRecord.variety} span />
                  <FieldItem label="拜访类别" value={drawerRecord.visitCategory} />
                  <FieldItem label="拜访时段" value={drawerRecord.visitPeriod} />
                  <FieldItem
                    label="拜访日期"
                    value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{drawerRecord.visitDate}</span>}
                  />
                  <FieldItem label="拜访位置" value={drawerRecord.visitLocation} span />
                  <FieldItem label="开始时间" value={
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {drawerRecord.startClock}
                      {drawerRecord.startOnTime && (
                        <span style={{ marginLeft: 6, fontSize: 'var(--fs-11)', background: '#FEF3E2', color: '#C77A16', padding: '1px 5px', borderRadius: 3 }}>整点</span>
                      )}
                    </span>
                  } />
                  <FieldItem label="结束时间" value={
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {drawerRecord.endClock}
                      {drawerRecord.endOnTime && (
                        <span style={{ marginLeft: 6, fontSize: 'var(--fs-11)', background: '#FEF3E2', color: '#C77A16', padding: '1px 5px', borderRadius: 3 }}>整点</span>
                      )}
                    </span>
                  } />
                </FieldGroup>

                <FieldGroup title="内容与反馈">
                  <FieldItem label="拜访内容" value={drawerRecord.visitContent} span />
                  <FieldItem label="客户反馈" value={drawerRecord.customerFeedback} span />
                </FieldGroup>

                <FieldGroup title="金额">
                  <FieldItem
                    label="本次金额"
                    value={<span style={{ fontSize: 'var(--fs-16)', fontWeight: 700, color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>￥{drawerRecord.amount.toLocaleString()}</span>}
                  />
                  <FieldItem label="审核状态" value={<StatusTag status={drawerRecord.auditStatus} />} />
                </FieldGroup>

                {showAuditPanel && (
                  <div style={{ marginBottom: 16, padding: '14px', background: '#FEF3E2', border: '1px solid #FDE68A', borderRadius: '8px' }}>
                    <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: '#C77A16', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Info size={14} /> 驳回意见（必填）
                    </div>
                    <textarea
                      value={auditComment}
                      onChange={e => setAuditComment(e.target.value)}
                      placeholder="请填写驳回原因，将通知服务专员修改后重新提交…"
                      style={{
                        width: '100%',
                        height: 80,
                        padding: '8px 10px',
                        fontSize: 'var(--fs-13)',
                        border: '1px solid #FDE68A',
                        borderRadius: '6px',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        outline: 'none',
                        background: '#FFFFFF',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                      <Button variant="outline" size="sm" onClick={() => setShowAuditPanel(false)}>取消</Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={!auditComment.trim()}
                        onClick={() => {
                          addToast({ type: 'warning', title: '已驳回', description: auditComment });
                          setShowAuditPanel(false);
                          closeDrawer();
                        }}
                      >
                        确认驳回
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {drawerTab === '操作历史' && (
              <FieldGroup title="操作历史">
                <div style={{ gridColumn: '1 / -1' }}>
                  <Timeline events={mockTimeline} />
                </div>
              </FieldGroup>
            )}

            {drawerTab === '拜访位置' && (
              <VisitLocationMap record={drawerRecord} />
            )}
          </div>
        )}
      </DetailDrawer>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget === 'batch' ? `批量删除 ${selected.length} 条拜访记录` : '删除拜访记录'}
        description={deleteTarget === 'batch'
          ? `此操作将删除 ${selected.length} 条拜访记录，该操作不可撤销。`
          : '此操作将永久删除该拜访记录，无法恢复。'
        }
        impact="相关绩效和结算数据将受到影响。操作日志将记录此次删除操作及操作人信息。"
        confirmLabel="确认删除"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Batch audit confirm */}
      <ConfirmDialog
        open={batchAction !== null}
        title={batchAction === 'approve' ? `批量审核通过 ${selected.length} 条` : `批量驳回 ${selected.length} 条`}
        description={batchAction === 'approve'
          ? `将对选中的 ${selected.length} 条拜访记录执行审核通过操作。`
          : `将对选中的 ${selected.length} 条拜访记录执行批量驳回操作。`
        }
        impact="批量操作将写入操作日志，影响相关服务专员的绩效计算。"
        confirmLabel={batchAction === 'approve' ? '确认通过' : '确认驳回'}
        variant={batchAction === 'approve' ? 'warning' : 'danger'}
        onConfirm={confirmBatch}
        onCancel={() => setBatchAction(null)}
      />
    </div>
  );
}

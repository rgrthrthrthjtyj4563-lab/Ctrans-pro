import { useMemo, useState } from 'react';
import { CheckCircle, Shield, XCircle } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { usePermission } from '../context/PermissionContext';
import { tdStyle, thStyle } from './permUi';

const PAGE_SIZE = 20;

const actionColor: Record<string, string> = {
  '新建角色': '#248A5A',
  '复制角色': '#2F6BCE',
  '编辑角色': '#C77A16',
  '停用角色': '#C73A3A',
  '启用角色': '#248A5A',
  '删除角色': '#C73A3A',
  '用户授权': '#248A5A',
  '回收授权': '#C73A3A',
  '角色预览': '#2F6BCE',
  '退出预览': '#6B7280',
  '导出': '#6B7280',
  '越权访问': '#C73A3A',
  '字段策略': '#C77A16',
};

export function PermissionAudit() {
  const { auditEvents, roles, orgs } = usePermission();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});

  const filtered = useMemo(() => auditEvents.filter(e => {
    if (applied.actor && !e.actor.includes(applied.actor)) return false;
    if (applied.targetUser && !e.target.includes(applied.targetUser)) return false;
    if (applied.role && e.roleName !== applied.role) return false;
    if (applied.org && e.org !== applied.org) return false;
    if (applied.module && e.module !== applied.module) return false;
    if (applied.action && e.action !== applied.action) return false;
    if (applied.decision && e.decision !== applied.decision) return false;
    if (applied.startDate && e.time.slice(0, 10) < applied.startDate) return false;
    if (applied.endDate && e.time.slice(0, 10) > applied.endDate) return false;
    return true;
  }), [auditEvents, applied]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const denied = filtered.filter(e => e.decision === '拒绝').length;

  const modules = Array.from(new Set(auditEvents.map(e => e.module)));
  const actions = Array.from(new Set(auditEvents.map(e => e.action)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="权限审计"
        description="角色变更、用户授权、预览、导出、越权访问与拒绝请求均在此留痕。审计记录只读，业务管理员不可删除。"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{
          padding: '10px 16px',
          background: '#F9FAFB',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          fontSize: 'var(--fs-13)',
          color: '#667085',
        }}>
          <Shield size={15} style={{ color: 'var(--color-brand)' }} />
          <span>
            当前筛选 {filtered.length} 条，其中拒绝 {denied} 条。可按操作者、目标用户、角色、组织、模块、动作和结果检索。
          </span>
        </div>

        <FilterBar
          fields={[
            { id: 'actor', label: '操作者', type: 'text', placeholder: '搜索操作者' },
            { id: 'targetUser', label: '目标用户 / 对象', type: 'text', placeholder: '搜索目标' },
            { id: 'role', label: '角色', type: 'select', options: roles.map(r => ({ value: r.name, label: r.name })) },
            { id: 'org', label: '组织', type: 'select', options: orgs.map(o => ({ value: o.name, label: o.name })) },
            { id: 'module', label: '模块', type: 'select', options: modules.map(v => ({ value: v, label: v })) },
            { id: 'action', label: '动作', type: 'select', options: actions.map(v => ({ value: v, label: v })) },
            { id: 'decision', label: '判定结果', type: 'select', options: [{ value: '允许', label: '允许' }, { value: '拒绝', label: '拒绝' }] },
            { id: 'startDate', label: '开始日期', type: 'date' },
            { id: 'endDate', label: '结束日期', type: 'date' },
          ]}
          values={filters}
          onChange={(id, val) => setFilters(prev => ({ ...prev, [id]: val }))}
          onSearch={() => { setApplied(filters); setPage(1); }}
          onReset={() => { setFilters({}); setApplied({}); setPage(1); }}
          collapsedCount={4}
          stats={
            <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>
              共 <strong style={{ color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 条
            </span>
          }
        />

        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1280 }}>
              <thead>
                <tr>
                  {['时间', '操作者 / 角色', '当前组织', '目标对象', '资源', '动作', '策略版本', '判定', '原因', '变更摘要', '请求标识', '来源 IP'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={12} style={{ padding: 0 }}><EmptyState title="没有符合条件的审计记录" description="调整筛选条件后重试" /></td></tr>
                ) : pageData.map((e, idx) => (
                  <tr key={e.id} style={{ background: e.decision === '拒绝' ? '#FEF7F7' : idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>{e.time}</td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{e.actor}</div>
                      <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF' }}>{e.actorRole}</div>
                    </td>
                    <td style={tdStyle}>{e.org}</td>
                    <td style={{ ...tdStyle, maxWidth: 180 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.target}>{e.target}</span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)', color: '#667085' }}>{e.resource}</td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 'var(--fs-12)',
                        fontWeight: 600,
                        color: actionColor[e.action] || '#374151',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: (actionColor[e.action] || '#374151') + '18',
                        whiteSpace: 'nowrap',
                      }}>
                        {e.action}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", color: '#667085' }}>—</td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 'var(--fs-12)',
                        fontWeight: 500,
                        color: e.decision === '允许' ? '#248A5A' : '#C73A3A',
                      }}>
                        {e.decision === '允许' ? <CheckCircle size={13} /> : <XCircle size={13} />}
                        {e.decision}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: '#667085', maxWidth: 160 }}>{e.reason || '—'}</td>
                    <td style={{ ...tdStyle, color: '#667085', fontSize: 'var(--fs-12)' }}>
                      {e.beforeSummary || e.afterSummary
                        ? `${e.beforeSummary ? `${e.beforeSummary} → ` : ''}${e.afterSummary ?? ''}`
                        : '—'}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{e.requestId}</td>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{e.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageData.length > 0 && (
            <div style={{ padding: '0 16px', borderTop: '1px solid #F3F4F6' }}>
              <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

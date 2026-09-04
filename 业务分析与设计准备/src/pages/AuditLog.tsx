import { useState, useMemo } from 'react';
import { Shield, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { auditLogs } from '../data/mockData';
import { usePermission } from '../context/PermissionContext';
import type { AuditLogEntry } from '../types';

const PAGE_SIZE = 20;

/** 权限域（用户、角色、组织、授权）审计的动作配色 */
const PERM_ACTION_COLOR: Record<string, string> = {
  '新建用户': '#248A5A',
  '启用账号': '#248A5A',
  '停用账号': '#C73A3A',
  '用户调岗': '#C77A16',
  '授予角色': '#2F6BCE',
  '回收角色': '#C73A3A',
  '新建部门': '#248A5A',
  '重命名部门': '#C77A16',
  '调整汇报上级': '#C77A16',
  '新增目录': '#248A5A',
  '新增菜单': '#248A5A',
  '编辑菜单': '#C77A16',
  '菜单排序': '#C77A16',
  '启用菜单': '#248A5A',
  '停用菜单': '#C73A3A',
};

const BUSINESS_ACTION_COLOR: Record<string, string> = {
  '新建': '#248A5A',
  '修改': '#C77A16',
  '删除': '#C73A3A',
  '审核通过': '#248A5A',
  '审核驳回': '#C73A3A',
  '提交': '#2F6BCE',
  '导出': '#6B7280',
  '批量修改': '#C77A16',
};

export function AuditLog() {
  const { auditEvents } = usePermission();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});

  // 权限域审计（用户与组织 / 角色管理 / 角色预览）与业务审计统一呈现
  const permRows: AuditLogEntry[] = useMemo(() => auditEvents.map(e => ({
    id: e.id,
    time: e.time,
    operator: e.actor,
    role: e.actorRole,
    module: e.module,
    action: e.action,
    target: e.target,
    beforeState: e.beforeSummary,
    afterState: e.afterSummary,
    ip: e.ip,
    result: e.result,
  })), [auditEvents]);

  const all = useMemo(
    () => [...permRows, ...auditLogs].sort((a, b) => (a.time < b.time ? 1 : -1)),
    [permRows],
  );

  const filtered = useMemo(() => {
    return all.filter(log => {
      if (filters.operator && !log.operator.includes(filters.operator)) return false;
      if (filters.module && log.module !== filters.module) return false;
      if (filters.action && log.action !== filters.action) return false;
      if (filters.result && log.result !== filters.result) return false;
      return true;
    });
  }, [all, filters]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const moduleOptions = Array.from(new Set(all.map(l => l.module)));
  const actionOptions = Array.from(new Set(all.map(l => l.action)));

  const filterFields = [
    { id: 'operator', label: '操作人', type: 'text' as const, placeholder: '搜索操作人' },
    { id: 'module', label: '功能模块', type: 'select' as const, options: moduleOptions.map(v => ({ value: v, label: v })) },
    { id: 'action', label: '操作类型', type: 'select' as const, options: actionOptions.map(v => ({ value: v, label: v })) },
    { id: 'result', label: '操作结果', type: 'select' as const, options: [
      { value: '成功', label: '成功' },
      { value: '失败', label: '失败' },
    ]},
    { id: 'startDate', label: '开始日期', type: 'date' as const },
    { id: 'endDate', label: '结束日期', type: 'date' as const },
  ];

  const actionColor = (log: AuditLogEntry) =>
    PERM_ACTION_COLOR[log.action] || BUSINESS_ACTION_COLOR[log.action] || '#374151';

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
    }}>{label}</th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="操作日志"
        description="组织、用户、角色、授权与业务高风险操作的统一审计，不可修改或删除"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{
          padding: '10px 16px',
          background: '#F9FAFB',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          fontSize: 'var(--fs-13)',
          color: '#667085',
        }}>
          <Shield size={15} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
          <span>
            操作日志为只读审计记录，不可修改、删除或导出敏感字段。
            用户调岗、部门移动、角色授予/回收、角色模板变更与业务高风险操作均强制写入此日志；
            历史记录保留原文与原资源键，不因命名迁移丢失。
          </span>
        </div>

        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={(id, val) => setFilters(prev => ({ ...prev, [id]: val }))}
          onSearch={() => setPage(1)}
          onReset={() => { setFilters({}); setPage(1); }}
          stats={
            <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>
              共 <strong style={{ color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 条记录
              （含用户与组织 / 角色管理 / 角色预览权限审计）
            </span>
          }
          collapsedCount={4}
        />

        <div style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
              <thead>
                <tr>
                  {th('操作时间', 160)}
                  {th('操作人 / 角色')}
                  {th('功能模块', 120)}
                  {th('操作类型', 90)}
                  {th('操作对象')}
                  {th('操作前状态', 90)}
                  {th('操作后状态', 90)}
                  {th('IP 地址', 120)}
                  {th('结果', 70)}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <EmptyState title="没有符合条件的操作日志" description="调整筛选条件后重试" />
                    </td>
                  </tr>
                ) : pageData.map((log, idx) => (
                  <tr
                    key={log.id}
                    style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA', borderBottom: '1px solid #F3F4F6' }}
                  >
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-12)', color: '#374151', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                      {log.time}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 'var(--fs-13)', fontWeight: 500, color: 'var(--color-text-1)' }}>{log.operator}</div>
                      <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', marginTop: 1 }}>{log.role}</div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-13)', color: '#374151', whiteSpace: 'nowrap' }}>{log.module}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: 'var(--fs-12)',
                        fontWeight: 600,
                        color: actionColor(log),
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: actionColor(log) + '18',
                        whiteSpace: 'nowrap',
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-13)', color: '#374151', maxWidth: 200 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.target}>
                        {log.target}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {log.beforeState ? (
                        <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{log.beforeState}</span>
                      ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {log.afterState ? (
                        <span style={{ fontSize: 'var(--fs-12)', color: '#374151', fontFamily: "'JetBrains Mono', monospace" }}>{log.afterState}</span>
                      ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                      {log.ip}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 'var(--fs-12)',
                        fontWeight: 500,
                        color: log.result === '成功' ? '#248A5A' : '#C73A3A',
                      }}>
                        {log.result === '成功' ? <CheckCircle size={13} /> : <XCircle size={13} />}
                        {log.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 16px', borderTop: pageData.length > 0 ? '1px solid #F3F4F6' : 'none' }}>
            {pageData.length > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />}
          </div>
        </div>
      </div>
    </div>
  );
}

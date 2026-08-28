import { useMemo, useState } from 'react';
import { Plus, Recycle, Users } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MetricCard } from '../components/MetricCard';
import { StatusTag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import { SCOPE_OPTIONS, scopeLabel, type GrantStatus, type ScopeType } from '../data/permissions';
import type { ToastMessage } from '../components/Toast';
import { Field, InfoBanner, inputStyle, tdStyle, thStyle } from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

const PAGE_SIZE = 10;

export function UserGrantManage({ addToast }: Props) {
  const store = usePermission();
  const { grants, users, roles, orgs, can, previewReadOnly } = store;
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({ status: 'active' });
  const [applied, setApplied] = useState<Record<string, string>>({ status: 'active' });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [open, setOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [form, setForm] = useState({ userId: '', roleId: '', orgId: '', scope: 'PHARMA' as ScopeType, from: '2026-08-26', to: '' });
  const [error, setError] = useState('');
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [batchRoleId, setBatchRoleId] = useState('');
  const [batchUserIds, setBatchUserIds] = useState<string[]>([]);

  const canWrite = can('user-grants', 'create') && !previewReadOnly;
  const canRevoke = can('user-grants', 'delete') && !previewReadOnly;

  const filtered = useMemo(() => grants.filter(g => {
    const user = users.find(u => u.id === g.userId);
    const role = roles.find(r => r.id === g.roleId);
    if (applied.user && user && !user.name.includes(applied.user) && !user.account.includes(applied.user)) return false;
    if (applied.role && g.roleId !== applied.role) return false;
    if (applied.org && g.orgId !== applied.org) return false;
    if (applied.status && g.status !== applied.status) return false;
    return true;
  }), [grants, users, roles, applied]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const stats = {
    active: grants.filter(g => g.status === 'active').length,
    pending: grants.filter(g => g.status === 'pending_review').length,
    expired: grants.filter(g => g.status === 'expired').length,
    revoked: grants.filter(g => g.status === 'revoked').length,
  };

  function submit() {
    if (!form.userId || !form.roleId || !form.orgId) {
      setError('请完整选择用户、角色和组织');
      return;
    }
    const org = orgs.find(o => o.id === form.orgId);
    const result = store.createGrant({
      userId: form.userId,
      roleId: form.roleId,
      orgId: form.orgId,
      orgName: org?.name ?? '',
      scope: form.scope,
      effectiveFrom: form.from,
      effectiveTo: form.to || undefined,
    });
    if (!result.ok) {
      setError(result.error || '授权失败');
      return;
    }
    addToast({ type: 'success', title: '授权已生效', description: '下一次请求将按新角色计算权限' });
    setOpen(false);
  }

  function submitBatch() {
    if (!batchRoleId || batchUserIds.length === 0) {
      addToast({ type: 'error', title: '请选择角色和用户' });
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const userId of batchUserIds) {
      const user = users.find(u => u.id === userId);
      const r = store.createGrant({
        userId,
        roleId: batchRoleId,
        orgId: user?.orgId ?? 'org-pharma',
        orgName: user?.orgName ?? '',
        scope: roles.find(x => x.id === batchRoleId)?.defaultScope ?? 'PHARMA',
        effectiveFrom: '2026-08-26',
      });
      if (r.ok) ok += 1;
      else fail += 1;
    }
    addToast({ type: 'success', title: '批量授权已执行', description: `新增 ${ok} 条${fail ? `，跳过 ${fail} 条` : ''}` });
    setBatchOpen(false);
    setBatchUserIds([]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="用户授权"
        description="一条授权 = 用户 × 角色 × 组织。支持有效期、回收和批量调整。"
        actions={canWrite ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="md" icon={<Users size={14} />} onClick={() => setBatchOpen(true)}>批量授权</Button>
            <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={() => { setError(''); setOpen(true); }}>单人授权</Button>
          </div>
        ) : undefined}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <MetricCard title="有效授权" value={stats.active} compact />
          <MetricCard title="待复核" value={stats.pending} iconColor="#C77A16" iconBg="#FEF3E2" compact />
          <MetricCard title="已过期" value={stats.expired} iconColor="#6B7280" iconBg="#F3F4F6" compact />
          <MetricCard title="已回收" value={stats.revoked} iconColor="#C73A3A" iconBg="#FEECEC" compact />
        </div>

        <FilterBar
          fields={[
            { id: 'user', label: '用户', type: 'text', placeholder: '姓名或账号' },
            { id: 'role', label: '角色', type: 'select', options: roles.map(r => ({ value: r.id, label: r.name })) },
            { id: 'org', label: '组织', type: 'select', options: orgs.map(o => ({ value: o.id, label: o.name })) },
            { id: 'status', label: '状态', type: 'select', options: [
              { value: 'active', label: '有效' },
              { value: 'pending_review', label: '待复核' },
              { value: 'expired', label: '已过期' },
              { value: 'revoked', label: '已回收' },
            ] },
          ]}
          values={filters}
          onChange={(id, val) => setFilters(prev => ({ ...prev, [id]: val }))}
          onSearch={() => { setApplied(filters); setPage(1); }}
          onReset={() => { setFilters({ status: 'active' }); setApplied({ status: 'active' }); setPage(1); }}
          stats={
            <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>
              共 <strong style={{ color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 条
              {selected.size > 0 ? ` · 已选 ${selected.size}` : ''}
            </span>
          }
          extraActions={selected.size > 0 && canRevoke ? (
            <Button variant="danger" size="sm" icon={<Recycle size={13} />} onClick={() => {
              selected.forEach(id => store.revokeGrant(id, '批量回收'));
              addToast({ type: 'success', title: '已回收授权', description: `${selected.size} 条立即失效` });
              setSelected(new Set());
            }}>回收所选</Button>
          ) : undefined}
        />

        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 40 }}>
                    <input
                      type="checkbox"
                      checked={pageData.length > 0 && pageData.every(g => selected.has(g.id))}
                      onChange={e => {
                        const next = new Set(selected);
                        pageData.forEach(g => { if (e.target.checked) next.add(g.id); else next.delete(g.id); });
                        setSelected(next);
                      }}
                    />
                  </th>
                  {['用户', '账号状态', '角色', '组织', '数据范围', '有效期', '授权人', '授权时间', '状态', '操作'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={11} style={{ padding: 0 }}><EmptyState title="没有符合条件的授权" description="调整筛选或新增一条授权" /></td></tr>
                ) : pageData.map((g, idx) => {
                  const user = users.find(u => u.id === g.userId);
                  const role = roles.find(r => r.id === g.roleId);
                  return (
                    <tr key={g.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={selected.has(g.id)} onChange={e => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(g.id); else next.delete(g.id);
                          setSelected(next);
                        }} />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{user?.name}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{user?.account}</div>
                      </td>
                      <td style={tdStyle}><StatusTag status={user?.accountStatus === 'enabled' ? '启用' : '停用'} /></td>
                      <td style={tdStyle}>{role?.name}</td>
                      <td style={tdStyle}>{g.orgName}</td>
                      <td style={tdStyle}>{scopeLabel(g.scope)}</td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                        {g.effectiveFrom}{g.effectiveTo ? ` ~ ${g.effectiveTo}` : ' 起'}
                      </td>
                      <td style={tdStyle}>{g.grantedBy}</td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", color: '#667085' }}>{g.grantedAt}</td>
                      <td style={tdStyle}><StatusTag status={statusWord(g.status)} /></td>
                      <td style={tdStyle}>
                        {g.status === 'active' && canRevoke && (
                          <Button variant="ghost" size="sm" onClick={() => setRevokeId(g.id)}>回收</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
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

      <Modal
        open={open}
        title="单人授权"
        onClose={() => setOpen(false)}
        width={520}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onClick={submit}>确认授权</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <InfoBanner>
            授权人不得修改自己的角色，也不得授予超出自身管理边界的角色。系统管理员、平台运营的授予需双人复核（本期以拦截演示）。
          </InfoBanner>
          {error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{error}</div>}
          <Field label="用户" required>
            <select value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} style={inputStyle}>
              <option value="">选择用户</option>
              {users.filter(u => u.accountStatus === 'enabled').map(u => (
                <option key={u.id} value={u.id}>{u.name} · {u.orgName}</option>
              ))}
            </select>
          </Field>
          <Field label="角色" required>
            <select value={form.roleId} onChange={e => {
              const role = roles.find(r => r.id === e.target.value);
              setForm(f => ({ ...f, roleId: e.target.value, scope: role?.defaultScope ?? f.scope }));
            }} style={inputStyle}>
              <option value="">选择角色</option>
              {roles.filter(r => r.status === 'enabled').map(r => (
                <option key={r.id} value={r.id}>{r.name}（{r.kind === 'preset' ? '预置' : '定制'}）</option>
              ))}
            </select>
          </Field>
          <Field label="组织" required>
            <select value={form.orgId} onChange={e => setForm(f => ({ ...f, orgId: e.target.value }))} style={inputStyle}>
              <option value="">选择组织</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="数据范围">
            <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as ScopeType }))} style={inputStyle}>
              {SCOPE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="生效日期" required>
              <input type="date" value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="到期日期" hint="临时授权必须填写">
              <input type="date" value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} style={inputStyle} />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={batchOpen}
        title="批量授权"
        onClose={() => setBatchOpen(false)}
        width={560}
        footer={
          <>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>取消</Button>
            <Button variant="primary" onClick={submitBatch}>确认执行（新增 {batchUserIds.length} 人）</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <InfoBanner tone="warning">
            批量调整将先展示新增人数，确认后执行并写入审计。本期演示按用户所属组织授予所选角色。
          </InfoBanner>
          <Field label="授予角色" required>
            <select value={batchRoleId} onChange={e => setBatchRoleId(e.target.value)} style={inputStyle}>
              <option value="">选择角色</option>
              {roles.filter(r => r.status === 'enabled' && r.kind === 'custom').map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </Field>
          <Field label="用户" hint={`已选 ${batchUserIds.length} 人`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {users.filter(u => u.accountStatus === 'enabled').map(u => {
                const on = batchUserIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setBatchUserIds(prev => on ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 'var(--fs-12)',
                      border: on ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
                      background: on ? 'var(--color-brand-subtle)' : '#fff',
                      color: on ? 'var(--color-brand)' : '#374151',
                      cursor: 'pointer',
                    }}
                  >
                    {u.name}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Modal>

      {revokeId && (
        <ConfirmDialog
          open
          title="回收授权"
          description="回收后该用户下一次请求立即失效，当前会话不再保留该角色权限。"
          impact="不影响其他组织下的授权。"
          variant="danger"
          confirmLabel="确认回收"
          onConfirm={() => {
            store.revokeGrant(revokeId, '管理员回收');
            addToast({ type: 'success', title: '授权已回收' });
            setRevokeId(null);
          }}
          onCancel={() => setRevokeId(null)}
        />
      )}
    </div>
  );
}

function statusWord(status: GrantStatus): '启用' | '已过期' | '已回收' | '待复核' {
  if (status === 'expired') return '已过期';
  if (status === 'revoked') return '已回收';
  if (status === 'pending_review') return '待复核';
  return '启用';
}

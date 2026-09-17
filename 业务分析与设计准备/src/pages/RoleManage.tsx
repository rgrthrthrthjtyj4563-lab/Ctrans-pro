/**
 * 角色与数据范围 —— 角色、功能权限、数据范围与角色成员授权的唯一可编辑入口。
 *
 * 页签结构（2026-09-15 拍板）：
 *   基本信息 | 页面与按钮权限 | 数据可见范围 | 已授权成员 | 变更记录
 * - 「已授权成员」承担角色授予/回收与成员名单管理（原独立授权页已删除，
 *   本页为唯一授权入口，不再跳转外部页面）；
 * - 数据可见范围：药厂角色只允许本药厂内部组织范围；服务商角色分组织范围与
 *   业务范围（指定范围时固定层级 药厂 → 当前服务商(只读) → 已授权品种，
 *   区域由品种授权派生、只读展示，不提供勾选）；
 * - 敏感字段策略并入「页面与按钮权限」页签的独立区块。
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, Pencil, Plus, Shield, ShieldAlert, Trash2, TriangleAlert } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MetricCard } from '../components/MetricCard';
import { StatusTag, Tag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import {
  PAGE_ACTION_META,
  RESOURCE_PAGES,
  SCOPE_OPTIONS,
  SENSITIVE_FIELDS,
  applyActionToggle,
  countGrantedUsers,
  grantStatusLabel,
  hasHighRiskGrant,
  identityLabel,
  isHighRiskRole,
  orgPathLabel,
  scopeLabel,
  summarizePerms,
  type FieldPolicyKind,
  type PageAction,
  type ResourcePage,
  type ScopeType,
  type SysRole,
  type SysRoleStatus,
} from '../data/permissions';
import {
  assignmentPharmaHealthCheck,
  authorizedVarietyLinesOfPharma,
  derivedRegionCodesOfScope,
  grantablePharmasForProvider,
  membershipOfUserInTenant,
  membershipsOfTenant,
  pruneVarietiesOnPharmaRemoval,
  relationshipsOfProvider,
  subscribeCooperation,
  subscribeTenantMemberships,
  tenantNameOf,
} from '../data/cooperationModel';
import type { ToastMessage } from '../components/Toast';
import {
  CheckCell, ChipSelect, Field, InfoBanner, RadioCard, RiskBadge, inputStyle, tdStyle, thStyle,
} from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

const PAGE_SIZE = 10;
type DetailTab = 'basic' | 'pages' | 'scope' | 'members' | 'history';

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'basic', label: '基本信息' },
  { id: 'pages', label: '页面与按钮权限' },
  { id: 'scope', label: '数据可见范围' },
  { id: 'members', label: '已授权成员' },
  { id: 'history', label: '变更记录' },
];

const linkBtnStyle = {
  background: 'none',
  border: 'none',
  padding: '1px 4px',
  fontSize: 'var(--fs-11)',
  color: 'var(--color-brand)',
  cursor: 'pointer',
} as const;

const chipStyle = { padding: '2px 8px', borderRadius: 999, fontSize: 'var(--fs-12)', background: '#EEF2F7', color: '#374151' } as const;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function RoleManage({ addToast }: Props) {
  const store = usePermission();
  const { assignments, users, orgs, changeLogs, can, previewReadOnly, realmRoles } = store;
  const roles = realmRoles;
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({ status: 'enabled' });
  const [applied, setApplied] = useState<Record<string, string>>({ status: 'enabled' });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('pages');

  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formScope, setFormScope] = useState<ScopeType>('PHARMA');
  const [formError, setFormError] = useState('');

  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    impact?: string;
    variant?: 'danger' | 'warning';
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  const canCreate = can('roles', 'create') && !previewReadOnly;
  const canEdit = can('roles', 'edit') && !previewReadOnly;
  const canDelete = can('roles', 'delete') && !previewReadOnly;

  const filtered = useMemo(() => {
    return roles.filter(r => {
      if (applied.name && !r.name.includes(applied.name)) return false;
      if (applied.status && r.status !== applied.status) return false;
      return true;
    });
  }, [roles, applied]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const detail = roles.find(r => r.id === detailId) ?? null;
  const readonly = !detail || !canEdit;

  const stats = useMemo(() => ({
    total: roles.length,
    draft: roles.filter(r => r.status === 'draft').length,
    enabled: roles.filter(r => r.status === 'enabled').length,
    members: new Set(assignments.filter(a => a.status === 'active').map(a => a.userId)).size,
  }), [roles, assignments]);

  function openCreate() {
    setFormName('');
    setFormDesc('');
    setFormScope(store.tenantKind === 'provider' ? 'PROVIDER' : 'PHARMA');
    setFormError('');
    setCreateOpen(true);
  }

  function submitCreate() {
    const result = store.createRole({ name: formName, description: formDesc, defaultScope: formScope });
    if (!result.ok) {
      setFormError(result.error || '保存失败');
      return;
    }
    addToast({
      type: 'success',
      title: '角色已创建',
      description: `${formName}（草稿 · 默认无业务写权限，可在详情中配置后发布）`,
    });
    setCreateOpen(false);
    if (result.role) {
      setDetailId(result.role.id);
      setTab('pages');
    }
  }

  function askDisable(role: SysRole) {
    const affected = users.filter(u => assignments.some(a => a.roleId === role.id && a.userId === u.id && a.status === 'active'));
    setConfirm({
      title: `停用「${role.name}」`,
      description: affected.length
        ? `停用后，以下 ${affected.length} 名用户的新会话将不再获得该角色权限。`
        : '当前没有有效授权用户。停用后该角色不可再被授予。',
      impact: affected.length ? affected.map(u => `${u.name}（${u.orgName}）`).join('、') : undefined,
      variant: 'warning',
      onConfirm: () => {
        const r = store.setRoleStatus(role.id, 'disabled', '管理员停用');
        if (!r.ok) addToast({ type: 'error', title: '无法停用', description: r.error });
        else addToast({ type: 'success', title: '角色已停用', description: role.name });
        setConfirm(null);
      },
    });
  }

  function askDelete(role: SysRole) {
    // 高危删除：仍有有效授权时先拦截并引导到「已授权成员」页签回收，无有效授权方可删除
    const activeAssignments = assignments.filter(
      a => a.roleId === role.id && (a.status === 'active' || a.status === 'pending_review'),
    );
    const affectedUsers = users.filter(u => activeAssignments.some(a => a.userId === u.id));
    if (affectedUsers.length > 0) {
      setConfirm({
        title: `「${role.name}」尚有有效授权，暂不可删除`,
        description: `以下 ${affectedUsers.length} 名用户仍持有该角色的有效授权，须先在本角色「已授权成员」页签回收全部授权后才能删除。`,
        impact: affectedUsers.map(u => `${u.name}（${u.orgName}）`).join('、'),
        variant: 'warning',
        confirmLabel: '去已授权成员回收',
        onConfirm: () => {
          setConfirm(null);
          setTab('members');
        },
      });
      return;
    }
    const historyCount = assignments.filter(a => a.roleId === role.id).length;
    const logCount = changeLogs.filter(c => c.roleId === role.id).length;
    setConfirm({
      title: `删除「${role.name}」`,
      description: `将永久删除该角色（${statusWord(role.status)} · v${role.version}），删除后不可恢复。`,
      impact: [
        historyCount > 0
          ? `历史授权记录 ${historyCount} 条：保留供审计查询，用户详情中将展示为「(已删除角色)」`
          : '无任何授权记录',
        logCount > 0 ? `角色变更记录 ${logCount} 条：随角色一并不可再访问` : '无角色变更记录',
      ].join('；') + '。',
      variant: 'danger',
      confirmLabel: '确认删除',
      onConfirm: () => {
        const r = store.deleteRole(role.id, '管理员删除角色');
        if (!r.ok) addToast({ type: 'error', title: '无法删除', description: r.error });
        else {
          addToast({ type: 'success', title: '角色已删除', description: role.name });
          if (detailId === role.id) setDetailId(null);
        }
        setConfirm(null);
      },
    });
  }

  if (detail) {
    return (
      <RoleDetail
        role={detail}
        tab={tab}
        onTabChange={setTab}
        readonly={readonly}
        previewReadOnly={previewReadOnly}
        canEdit={canEdit}
        canDelete={canDelete}
        onBack={() => setDetailId(null)}
        onDisable={() => askDisable(detail)}
        onEnable={() => {
          const r = store.setRoleStatus(detail.id, 'enabled', '重新启用');
          if (!r.ok) addToast({ type: 'error', title: '无法启用', description: r.error });
          else addToast({ type: 'success', title: '角色已启用' });
        }}
        onDelete={() => askDelete(detail)}
        addToast={addToast}
        confirm={confirm}
        setConfirm={setConfirm}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="角色与数据范围"
        description="角色、页面/按钮权限、数据范围与角色成员授权的唯一可编辑入口：角色的能力在页签中配置，成员的授予与回收在角色详情「已授权成员」页签完成。"
        actions={canCreate ? (
          <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={openCreate}>新建角色</Button>
        ) : undefined}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <InfoBanner tone="brand">
          <span>
            角色是能力模板（页面权限 + 组织数据范围）；业务范围（可处理药厂/品种）只有一个可编辑事实源——
            各角色详情的「已授权成员」页签按人授予与回收，且只能在药厂已授范围内收窄。
          </span>
        </InfoBanner>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16, marginTop: 12 }}>
          <MetricCard title="角色总数" value={stats.total} icon={Shield} compact />
          <MetricCard title="草稿中" value={stats.draft} icon={Shield} iconColor="#2F6BCE" iconBg="#EBF2FE" compact />
          <MetricCard title="启用中" value={stats.enabled} icon={Shield} iconColor="#248A5A" iconBg="#E6F5ED" compact />
          <MetricCard title="有效授权人数" value={stats.members} icon={Shield} iconColor="#C77A16" iconBg="#FEF3E2" compact />
        </div>

        <FilterBar
          fields={[
            { id: 'name', label: '角色名称', type: 'text', placeholder: '搜索角色名称' },
            { id: 'status', label: '状态', type: 'select', options: [{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }, { value: 'draft', label: '草稿' }] },
          ]}
          values={filters}
          onChange={(id, val) => setFilters(prev => ({ ...prev, [id]: val }))}
          onSearch={() => { setApplied(filters); setPage(1); }}
          onReset={() => { setFilters({ status: 'enabled' }); setApplied({ status: 'enabled' }); setPage(1); }}
          stats={
            <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>
              共 <strong style={{ color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 个角色
              · 默认展示启用角色
            </span>
          }
        />

        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
              <thead>
                <tr>
                  {['角色名称', '状态', '已授权人数', '权限摘要', '默认数据范围', '最近修改人', '最近修改时间', '操作'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 0 }}><EmptyState title="没有符合条件的角色" description="调整筛选条件，或新建一个角色" /></td></tr>
                ) : pageData.map((role, idx) => {
                  const members = countGrantedUsers(role.id, assignments);
                  const summary = permSummary(role);
                  return (
                    <tr key={role.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{role.name}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>{role.description}</div>
                      </td>
                      <td style={tdStyle}><StatusTag status={statusWord(role.status)} /></td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace" }}>{members}</td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#374151' }}>{summary.countText}</div>
                      </td>
                      <td style={tdStyle}>{scopeLabel(role.defaultScope)}</td>
                      <td style={tdStyle}>{role.updatedBy}</td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", color: '#667085', whiteSpace: 'nowrap' }}>{role.updatedAt}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {canEdit && !previewReadOnly ? (
                            <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => { setDetailId(role.id); setTab('pages'); }}>编辑</Button>
                          ) : (
                            <Button variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => { setDetailId(role.id); setTab('pages'); }}>查看</Button>
                          )}
                          {canEdit && role.status === 'enabled' && (
                            <Button variant="ghost" size="sm" onClick={() => askDisable(role)}>停用</Button>
                          )}
                          {canEdit && role.status !== 'enabled' && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              const r = store.setRoleStatus(role.id, 'enabled', '重新启用');
                              if (!r.ok) addToast({ type: 'error', title: '无法启用', description: r.error });
                              else addToast({ type: 'success', title: '角色已启用' });
                            }}>启用</Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => askDelete(role)}>删除</Button>
                          )}
                        </div>
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

      <RoleFormModal
        open={createOpen}
        name={formName}
        desc={formDesc}
        scope={formScope}
        error={formError}
        onName={setFormName}
        onDesc={setFormDesc}
        onScope={setFormScope}
        onClose={() => setCreateOpen(false)}
        onSubmit={submitCreate}
      />

      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          description={confirm.description}
          impact={confirm.impact}
          variant={confirm.variant}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/** 列表「权限摘要」：页面/操作计数 */
function permSummary(role: SysRole): { countText: string } {
  let pages = 0;
  let writes = 0;
  for (const p of RESOURCE_PAGES) {
    const granted = role.pagePerms[p.id] ?? [];
    if (granted.length === 0) continue;
    pages += 1;
    for (const key of granted) {
      if (key === 'view') continue;
      writes += 1;
    }
  }
  return { countText: `${pages} 个页面 · ${writes} 项操作` };
}

function statusWord(status: SysRoleStatus): '启用' | '停用' | '草稿' {
  return status === 'enabled' ? '启用' : status === 'disabled' ? '停用' : '草稿';
}

function RoleFormModal({
  open, name, desc, scope, error,
  onName, onDesc, onScope, onClose, onSubmit,
}: {
  open: boolean;
  name: string;
  desc: string;
  scope: ScopeType;
  error: string;
  onName: (v: string) => void;
  onDesc: (v: string) => void;
  onScope: (v: ScopeType) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const store = usePermission();
  const isProvider = store.tenantKind === 'provider';
  const options = scopeOptionsFor(isProvider);
  return (
    <Modal
      open={open}
      title="新建角色"
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={onSubmit}>创建草稿</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <InfoBanner>
          新角色以草稿创建，默认仅有工作台查看权限；创建后进入角色详情配置页面、按钮、数据范围与成员授权，「保存并发布」后生效。
        </InfoBanner>
        {error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{error}</div>}
        <Field label="角色名称" required>
          <input value={name} onChange={e => onName(e.target.value)} style={inputStyle} placeholder="同一租户内唯一" />
        </Field>
        <Field label="角色说明">
          <textarea
            value={desc}
            onChange={e => onDesc(e.target.value)}
            rows={3}
            style={{ ...inputStyle, height: 'auto', padding: 10, resize: 'vertical' }}
            placeholder="给其他管理员看的职责说明"
          />
        </Field>
        <Field label="默认数据范围" hint={`仅提供${isProvider ? '服务商' : '本药厂'}可用的范围档位；可在角色详情中再调整`}>
          <select value={scope} onChange={e => onScope(e.target.value as ScopeType)} style={inputStyle}>
            {options.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

/** 数据范围档位按租户类型收敛（2026-09-15 拍板）：药厂不含服务商/工作组/移动端档 */
function scopeOptionsFor(isProvider: boolean) {
  const providerSet: ScopeType[] = ['PROVIDER', 'GROUP', 'DEPT', 'DEPT_AND_CHILD', 'SELF', 'CUSTOM'];
  const pharmaSet: ScopeType[] = ['PHARMA', 'DEPT', 'DEPT_AND_CHILD', 'CUSTOM'];
  const allowed = new Set(isProvider ? providerSet : pharmaSet);
  return SCOPE_OPTIONS.filter(o => allowed.has(o.value));
}

/** 权限矩阵草稿与已发布版本的差异摘要 */
function draftDiff(role: SysRole, draft: SysRole) {
  const addedPages: string[] = [];
  const removedPages: string[] = [];
  let addedRisk = 0;
  let removedRisk = 0;
  for (const p of RESOURCE_PAGES) {
    const before = new Set(role.pagePerms[p.id] ?? []);
    const after = new Set(draft.pagePerms[p.id] ?? []);
    if (after.size > 0 && before.size === 0) addedPages.push(p.name);
    if (after.size === 0 && before.size > 0) removedPages.push(p.name);
    for (const a of p.actions) {
      const b = before.has(a.key);
      const n = after.has(a.key);
      if (!b && n && a.risk) addedRisk += 1;
      if (b && !n && a.risk) removedRisk += 1;
    }
  }
  return { addedPages, removedPages, addedRisk, removedRisk };
}

function RoleDetail({
  role, tab, onTabChange, readonly, previewReadOnly, canEdit, canDelete,
  onBack, onDisable, onEnable, onDelete, addToast, confirm, setConfirm,
}: {
  role: SysRole;
  tab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  readonly: boolean;
  previewReadOnly: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onBack: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onDelete: () => void;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  confirm: { title: string; description: string; impact?: string; variant?: 'danger' | 'warning'; confirmLabel?: string; onConfirm: () => void } | null;
  setConfirm: (c: typeof confirm) => void;
}) {
  const store = usePermission();
  const { assignments, users, orgs, changeLogs } = store;
  const [draft, setDraft] = useState<SysRole>(role);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const locked = readonly || previewReadOnly;

  useEffect(() => {
    setDraft(role);
  }, [role]);

  const isProvider = store.tenantKind === 'provider';
  const tenantRootId = store.principal.realm === 'TENANT' ? store.principal.tenantId : '';

  const members = assignments.filter(a => a.roleId === role.id && a.tenantId === tenantRootId);
  const activeMemberCount = new Set(members.filter(m => m.status === 'active').map(m => m.userId)).size;
  const history = changeLogs.filter(c => c.roleId === role.id);
  const dirty = JSON.stringify(draft) !== JSON.stringify(role);
  const diff = useMemo(() => draftDiff(role, draft), [draft, role]);
  const modules = Array.from(new Set(RESOURCE_PAGES.map(p => p.module)));

  function applyPages(patch: Record<string, PageAction[]>) {
    setDraft(d => ({ ...d, pagePerms: patch }));
  }

  function selectAllPages() {
    const next: Record<string, PageAction[]> = {};
    for (const p of RESOURCE_PAGES) next[p.id] = p.actions.map(a => a.key);
    applyPages(next);
  }

  function selectModule(mod: string) {
    const next = { ...draft.pagePerms };
    for (const p of RESOURCE_PAGES.filter(p => p.module === mod)) {
      next[p.id] = p.actions.map(a => a.key);
    }
    applyPages(next);
  }

  function clearModule(mod: string) {
    const next = { ...draft.pagePerms };
    for (const p of RESOURCE_PAGES.filter(p => p.module === mod)) delete next[p.id];
    applyPages(next);
  }

  function selectPageActions(p: ResourcePage) {
    const next = { ...draft.pagePerms };
    next[p.id] = p.actions.map(a => a.key);
    applyPages(next);
  }

  function clearPageActions(p: ResourcePage) {
    const next = { ...draft.pagePerms };
    delete next[p.id];
    applyPages(next);
  }

  function save(force = false) {
    if (locked) return;
    if (!force && (diff.addedRisk > 0 || hasHighRiskGrant(role.pagePerms, draft.pagePerms))) {
      setConfirm({
        title: '确认发布高危权限变更',
        description: `本次变更将为「${role.name}」新增 ${diff.addedRisk} 项高危操作（删除、审核、导出等）。保存后将立即影响 ${activeMemberCount} 名已授权用户的下一次请求。`,
        impact: '高危按钮在前端隐藏的同时，接口访问同样会被拒绝；请确认授权范围无误。',
        variant: 'warning',
        onConfirm: () => { setConfirm(null); save(true); },
      });
      return;
    }
    const result = store.updateRole(role.id, {
      name: draft.name,
      description: draft.description,
      defaultScope: draft.defaultScope,
      customScope: draft.customScope,
      pagePerms: draft.pagePerms,
      fieldPolicies: draft.fieldPolicies,
    }, '更新页面、范围或字段策略');
    if (!result.ok) addToast({ type: 'error', title: '保存失败', description: result.error });
    else addToast({ type: 'success', title: '权限已发布', description: `${draft.name} v${role.version + 1}` });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={role.name}
        description={role.description}
        tabs={DETAIL_TABS.map(t => ({
          id: t.id,
          label: t.label,
          count: t.id === 'members' ? members.filter(m => m.status === 'active').length : undefined,
        }))}
        activeTab={tab}
        onTabChange={id => onTabChange(id as DetailTab)}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="md" icon={<ArrowLeft size={14} />} onClick={onBack}>返回列表</Button>
            {canEdit && role.status === 'enabled' && (
              <Button variant="outline" size="md" onClick={onDisable}>停用</Button>
            )}
            {canEdit && role.status !== 'enabled' && (
              <Button variant="outline" size="md" onClick={onEnable}>启用</Button>
            )}
            {canDelete && (
              <Button variant="danger" size="md" icon={<Trash2 size={14} />} onClick={onDelete}>删除</Button>
            )}
            {(tab === 'pages' || tab === 'scope' || tab === 'basic') && (
              <Button variant="primary" size="md" disabled={!dirty || locked} onClick={() => save()}>保存并发布</Button>
            )}
          </div>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusTag status={statusWord(role.status)} />
          <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>版本 v{role.version}</span>
          <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
            适用域 {role.realm === 'PLATFORM' ? '系统管理后台' : `企业租户${role.appliesTo ? `（${role.appliesTo.map(t => (t === 'pharma' ? '药厂' : '服务商')).join('/')}）` : ''}`}
          </span>
          <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>已授权 {activeMemberCount} 人</span>
        </div>

        {tab === 'pages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'grid', gap: 10 }}>
                <InfoBanner>
                  支持全局、模块、页面三级批量选择。「查看页面」是父权限：勾选任一动作自动勾选查看，取消查看自动清空该页全部动作。批量选中只更新草稿，须「保存并发布」后生效。
                </InfoBanner>
                {!locked && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" style={linkBtnStyle} onClick={selectAllPages}>全选全部页面</button>
                    <span style={{ color: '#E5E7EB' }}>|</span>
                    <button type="button" style={{ ...linkBtnStyle, color: '#C73A3A' }} onClick={() => setConfirmClearAll(true)}>清空全部</button>
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-12)', color: '#667085' }}>
                      本次草稿：
                      {diff.addedPages.length > 0 && <span style={{ color: '#248A5A' }}> 新增页面 {diff.addedPages.length}</span>}
                      {diff.removedPages.length > 0 && <span style={{ color: '#C73A3A' }}> 移除页面 {diff.removedPages.length}</span>}
                      {diff.addedRisk > 0 && <span style={{ color: '#C77A16' }}> 新增高危操作 {diff.addedRisk}</span>}
                      {diff.removedRisk > 0 && <span style={{ color: '#667085' }}> 移除高危操作 {diff.removedRisk}</span>}
                      {diff.addedPages.length + diff.removedPages.length + diff.addedRisk + diff.removedRisk === 0 && ' 暂无变更'}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>模块 / 页面</th>
                      <th style={{ ...thStyle, width: 150 }}>页面批量</th>
                      {PAGE_ACTION_META.map(a => (
                        <th key={a.key} style={{ ...thStyle, textAlign: 'center', width: 88 }}>
                          {a.label}
                          {a.risk && <RiskBadge />}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map(mod => {
                      const pages = RESOURCE_PAGES.filter(p => p.module === mod);
                      const grantedPageCount = pages.filter(p => (draft.pagePerms[p.id] ?? []).length > 0).length;
                      return [
                        <tr key={`mod-${mod}`} style={{ background: '#F9FAFB' }}>
                          <td colSpan={2 + PAGE_ACTION_META.length} style={{ padding: '7px 12px', borderBottom: '1px solid var(--color-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 'var(--fs-12)', fontWeight: 700, color: '#374151' }}>{mod}</span>
                              <span style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF' }}>已授权 {grantedPageCount}/{pages.length} 页</span>
                              {!locked && (
                                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                                  <button type="button" style={linkBtnStyle} onClick={() => selectModule(mod)}>全选本模块</button>
                                  <button type="button" style={{ ...linkBtnStyle, color: '#C73A3A' }} onClick={() => clearModule(mod)}>清空本模块</button>
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>,
                        ...pages.map(p => {
                          const granted = new Set(draft.pagePerms[p.id] ?? []);
                          return (
                            <tr key={p.id}>
                              <td style={tdStyle}>
                                <div style={{ fontWeight: 600 }}>{p.name}</div>
                                <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>{p.description}</div>
                              </td>
                              <td style={tdStyle}>
                                {!locked ? (
                                  <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                                    <button type="button" style={linkBtnStyle} onClick={() => selectPageActions(p)}>全选可用操作</button>
                                    <button type="button" style={{ ...linkBtnStyle, color: '#C73A3A' }} onClick={() => clearPageActions(p)}>清空操作</button>
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 'var(--fs-11)', color: '#D1D5DB' }}>—</span>
                                )}
                              </td>
                              {PAGE_ACTION_META.map(a => {
                                const available = p.actions.some(x => x.key === a.key);
                                if (!available) {
                                  return <td key={a.key} style={{ ...tdStyle, textAlign: 'center', color: '#D1D5DB' }}>—</td>;
                                }
                                const def = p.actions.find(x => x.key === a.key)!;
                                const checked = a.key === 'view' ? granted.has('view') || granted.size > 0 : granted.has(a.key);
                                return (
                                  <td key={a.key} style={{ ...tdStyle, textAlign: 'center' }}>
                                    <CheckCell
                                      checked={checked}
                                      disabled={locked}
                                      risk={def.risk}
                                      onChange={next => setDraft(d => ({ ...d, pagePerms: applyActionToggle(d.pagePerms, p, a.key as PageAction, next) }))}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        }),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 敏感字段策略（并入页面与按钮权限页签） */}
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px' }}>
                <InfoBanner>
                  敏感字段展示策略：仅对已登记为敏感的字段开放配置。脱敏在服务端序列化前执行；隐藏字段前端不会收到原始值，列表也不展示列名。
                </InfoBanner>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['字段', '所属模块', '说明', '可见', '脱敏', '隐藏', '示例'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SENSITIVE_FIELDS.map((f, idx) => {
                    const policy = draft.fieldPolicies[f.key] ?? 'visible';
                    return (
                      <tr key={f.key} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{f.name}</td>
                        <td style={tdStyle}>{f.module}</td>
                        <td style={{ ...tdStyle, color: '#667085' }}>{f.description}</td>
                        {(['visible', 'mask', 'hidden'] as FieldPolicyKind[]).map(p => (
                          <td key={p} style={{ ...tdStyle, textAlign: 'center' }}>
                            <input
                              type="radio"
                              name={`fp-${f.key}`}
                              checked={policy === p}
                              disabled={locked}
                              onChange={() => setDraft(d => ({ ...d, fieldPolicies: { ...d.fieldPolicies, [f.key]: p } }))}
                              style={{ accentColor: p === 'hidden' ? '#C73A3A' : 'var(--color-brand)' }}
                            />
                          </td>
                        ))}
                        <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", color: '#667085' }}>
                          {policy === 'visible' ? '完整值' : policy === 'mask' ? f.maskExample : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'scope' && (
          <RoleScopeTab
            role={role}
            draft={draft}
            setDraft={setDraft}
            locked={locked}
            isProvider={isProvider}
            tenantRootId={tenantRootId}
            orgs={orgs}
          />
        )}

        {tab === 'basic' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 760 }}>
            <Field label="角色名称" required>
              <input value={draft.name} disabled={locked} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="可授权对象范围">
              <input
                value={role.realm === 'PLATFORM' ? '软件服务方工作人员（系统权限域）' : role.appliesTo ? role.appliesTo.map(t => (t === 'pharma' ? '药厂' : '服务商')).map(t => `${t}企业成员`).join(' / ') : '本企业成员'}
                disabled
                style={inputStyle}
              />
            </Field>
            <Field label="默认数据范围">
              <input value={scopeLabel(draft.defaultScope)} disabled style={inputStyle} />
            </Field>
            <Field label="角色说明" span>
              <textarea
                value={draft.description}
                disabled={locked}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, height: 'auto', padding: 10, resize: 'vertical' }}
              />
            </Field>
          </div>
        )}

        {tab === 'members' && (
          <RoleMembersTab
            role={role}
            canEdit={canEdit && !previewReadOnly}
            addToast={addToast}
          />
        )}

        {tab === 'history' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            {history.length === 0 ? (
              <EmptyState title="暂无变更记录" description="保存权限、启停或授权后将在此留痕" />
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead>
                  <tr>
                    {['时间', '操作者', '动作', '摘要', '变更前', '变更后', '版本'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {history.map((c, idx) => (
                    <tr key={c.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>{c.time}</td>
                      <td style={tdStyle}>{c.actor}</td>
                      <td style={tdStyle}>{c.action}</td>
                      <td style={tdStyle}>{c.summary}</td>
                      <td style={{ ...tdStyle, color: '#9CA3AF' }}>{c.beforeSummary || '—'}</td>
                      <td style={tdStyle}>{c.afterSummary || '—'}</td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace" }}>v{c.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmClearAll && (
        <ConfirmDialog
          open
          title="清空全部页面权限"
          description={`将移除「${role.name}」草稿中的全部页面与操作授权（仅当前角色，不影响其他角色）。`}
          impact="清空后保存发布，已授权用户将无法访问任何页面。"
          variant="danger"
          confirmLabel="确认清空"
          onConfirm={() => { applyPages({}); setConfirmClearAll(false); }}
          onCancel={() => setConfirmClearAll(false)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          description={confirm.description}
          impact={confirm.impact}
          variant={confirm.variant}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ─── 数据可见范围页签：组织范围 + 服务商业务范围（药厂 → 当前服务商 → 已授权品种） ──

function RoleScopeTab({
  role, draft, setDraft, locked, isProvider, tenantRootId, orgs,
}: {
  role: SysRole;
  draft: SysRole;
  setDraft: React.Dispatch<React.SetStateAction<SysRole>>;
  locked: boolean;
  isProvider: boolean;
  tenantRootId: string;
  orgs: ReturnType<typeof usePermission>['orgs'];
}) {
  // 本企业内部组织节点（租户边界内；药厂树天然不含服务商/工作组节点）
  const customOrgOptions = useMemo(() => {
    const ids = new Set(
      orgs
        .filter(o => o.id === tenantRootId)
        .map(root => orgDescendantIdsLocal(orgs, root.id))
        .flat(),
    );
    return orgs.filter(o => ids.has(o.id) && o.id !== tenantRootId);
  }, [orgs, tenantRootId]);

  return (
    <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20 }}>
      <InfoBanner>
        {isProvider
          ? '服务商角色的数据范围只含组织范围（本服务商内部节点）。业务范围（药厂 → 已授权品种）不在角色上配置：它是成员授权的一部分，统一在各角色「已授权成员」页签中按人授予（只能在药厂已授范围内收窄）。'
          : '药厂角色只允许本药厂内部组织范围：本药厂 / 本部门 / 本部门及以下 / 指定组织范围（仅本药厂内部组织节点）。不提供服务商、工作组、移动端或其他药厂范围。'}
        授权成员时系统按策略与人员所属组织自动定位权限覆盖根节点；例外跨组织权限请单独新建角色调整。
      </InfoBanner>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
        {scopeOptionsFor(isProvider).map(opt => (
          <RadioCard
            key={opt.value}
            checked={draft.defaultScope === opt.value}
            disabled={locked}
            title={opt.label}
            hint={scopeHintFor(opt.value, isProvider)}
            onClick={() => setDraft(d => ({ ...d, defaultScope: opt.value }))}
          />
        ))}
      </div>
      {draft.defaultScope === 'CUSTOM' && (
        <div style={{ marginTop: 20, display: 'grid', gap: 16 }}>
          <Field label={isProvider ? '指定内部组织（本服务商内部节点）' : '指定组织范围（本药厂内部节点）'}>
            <ChipSelect
              disabled={locked}
              values={[
                ...draft.customScope.orgIds,
                ...draft.customScope.pharmaIds.filter(id => !isProvider),
                ...draft.customScope.providerIds,
                ...draft.customScope.groupIds.filter(id => !isProvider),
                ...draft.customScope.deptIds,
              ].filter(id => customOrgOptions.some(o => o.id === id))}
              options={customOrgOptions.map(o => ({
                value: o.id,
                label: o.type === 'department' ? orgPathLabel(orgs, o.id) : o.name,
              }))}
              onChange={next => {
                const deptIds = next.filter(id => orgs.find(o => o.id === id)?.type === 'department');
                const orgIds = next.filter(id => orgs.find(o => o.id === id)?.type === 'platform');
                setDraft(d => ({
                  ...d,
                  customScope: {
                    ...d.customScope,
                    orgIds,
                    deptIds,
                    pharmaIds: isProvider ? d.customScope.pharmaIds : [],
                    providerIds: [],
                    groupIds: isProvider ? d.customScope.groupIds : [],
                  },
                }));
              }}
            />
          </Field>
        </div>
      )}
      <div style={{ marginTop: 16, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
        数据范围不决定员工可见的合作药厂——成员的可处理药厂与品种在「已授权成员」页签按人授予（同一角色不同人可不同范围）。
        {role.realm === 'PLATFORM' && ' 系统角色不使用数据范围。'}
      </div>
    </div>
  );
}

function orgDescendantIdsLocal(orgs: { id: string; parentId?: string }[], rootId: string): string[] {
  const ids = [rootId];
  const walk = (id: string) => {
    for (const child of orgs.filter(o => o.parentId === id)) {
      ids.push(child.id);
      walk(child.id);
    }
  };
  walk(rootId);
  return ids;
}

function scopeHintFor(value: ScopeType, isProvider: boolean): string {
  const hit = SCOPE_OPTIONS.find(o => o.value === value);
  if (hit) return hit.hint;
  return isProvider ? '服务商组织范围档位' : '本药厂组织范围档位';
}

// ─── 业务范围编辑器：药厂 → 当前服务商（只读）→ 已授权品种；区域派生只读 ───────

function BusinessScopeEditor({
  providerTenantId,
  pharmaIds,
  varietyNames,
  derivedRegions,
  grantablePharmas,
  disabled,
  onPharmaToggle,
  onVarietyToggle,
  providerName,
}: {
  providerTenantId: string;
  pharmaIds: string[];
  varietyNames: string[];
  derivedRegions: string[];
  grantablePharmas: string[];
  disabled?: boolean;
  onPharmaToggle: (pharmaId: string, next: boolean) => void;
  onVarietyToggle: (varietyName: string, next: boolean) => void;
  providerName?: string;
}) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>
        业务范围 · 固定层级：药厂 → 当前服务商（只读）→ 已授权品种
      </div>
      {/* 第 1 层：药厂（仅合作生效 ∧ 品种授权有效） */}
      <div>
        <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 6 }}>① 药厂（仅显示合作生效且有有效品种授权的药厂）</div>
        {grantablePharmas.length === 0 ? (
          <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>
            当前没有可授予的药厂（需先由药厂审核通过准入并授予品种业务授权）。
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {grantablePharmas.map(id => {
              const checked = pharmaIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPharmaToggle(id, !checked)}
                  style={{
                    ...chipStyle,
                    border: '1px solid var(--color-border)',
                    background: checked ? 'var(--color-brand-subtle)' : '#fff',
                    color: checked ? 'var(--color-brand)' : '#374151',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {tenantNameOf(id)}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {/* 第 2 层：当前服务商（只读，自动带入） */}
      <div>
        <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 6 }}>② 当前服务商（只读 · 自动带入，不可切换）</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ ...chipStyle, background: '#F3F4F6', color: '#667085', border: '1px dashed var(--color-border)' }}>
            {providerName ?? tenantNameOf(providerTenantId)}
          </span>
        </div>
      </div>
      {/* 第 3 层：已授权品种（按已选药厂展开；区域派生只读） */}
      <div>
        <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 6 }}>
          ③ 已授权品种（{pharmaIds.length === 0 ? '先选择药厂' : '不勾选 = 该药厂全部已授权品种'}）
        </div>
        {pharmaIds.length === 0 ? (
          <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>选择药厂后展示其授予本服务商的有效品种。</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {pharmaIds.map(pharmaId => {
              const lines = authorizedVarietyLinesOfPharma(providerTenantId, pharmaId);
              return (
                <div key={pharmaId} style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 'var(--fs-12)', color: '#374151', fontWeight: 600 }}>{tenantNameOf(pharmaId)}</div>
                  {lines.length === 0 ? (
                    <div style={{ fontSize: 'var(--fs-12)', color: '#C77A16' }}>该药厂品种授权已失效（不可授予）</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {lines.map(line => {
                        const checked = varietyNames.includes(line.varietyName);
                        return (
                          <button
                            key={line.varietyName}
                            type="button"
                            disabled={disabled}
                            title={`授权区域（派生，只读）：${line.regions.join('、') || '—'}`}
                            onClick={() => onVarietyToggle(line.varietyName, !checked)}
                            style={{
                              ...chipStyle,
                              border: '1px solid var(--color-border)',
                              background: checked ? 'var(--color-brand-subtle)' : '#fff',
                              color: checked ? 'var(--color-brand)' : '#374151',
                              cursor: disabled ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {line.varietyName}
                            <span style={{ marginLeft: 4, fontSize: 'var(--fs-11)', color: '#9CA3AF' }}>{line.regions.join('/')}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* 派生区域（只读） */}
      <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 10 }}>
        <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 6 }}>
          授权区域（由药厂品种授权自动派生 · 只读，不可勾选）
        </div>
        <div style={{ fontSize: 'var(--fs-13)', color: derivedRegions.length > 0 ? '#374151' : '#9CA3AF' }}>
          {derivedRegions.length > 0 ? derivedRegions.join('、') : '—（选择药厂与品种后自动派生）'}
        </div>
      </div>
    </div>
  );
}

// ─── 已授权成员页签：授予 / 调整 / 回收（唯一授权入口） ───────────────────────

interface MemberGrantForm {
  userId: string;
  from: string;
  to: string;
  reason: string;
  pharmaIds: string[];
  varietyNames: string[];
  error: string;
}

interface MemberEditForm extends MemberGrantForm {
  assignmentId: string;
}

function RoleMembersTab({
  role, canEdit, addToast,
}: {
  role: SysRole;
  canEdit: boolean;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}) {
  const store = usePermission();
  const { assignments, users, orgs, roles, principal, revokeAssignment, createAssignment, updateAssignmentScope, previewReadOnly } = store;
  const isProvider = principal.realm === 'TENANT' && principal.tenantKind === 'provider';
  const tenantRootId = principal.realm === 'TENANT' ? principal.tenantId : '';

  // 合作模型与成员身份实时联动（药厂侧暂停/撤销、建档/调岗即时刷新）
  const [, bump] = useState(0);
  useEffect(() => {
    const unsubCoop = subscribeCooperation(() => bump(x => x + 1));
    const unsubMem = subscribeTenantMemberships(() => bump(x => x + 1));
    return () => { unsubCoop(); unsubMem(); };
  }, []);

  const [grant, setGrant] = useState<MemberGrantForm | null>(null);
  const [edit, setEdit] = useState<MemberEditForm | null>(null);
  const [revoke, setRevoke] = useState<{ assignmentId: string; reason: string; error: string } | null>(null);

  const members = assignments
    .filter(a => a.roleId === role.id && a.tenantId === tenantRootId)
    .slice()
    .sort((x, y) => (x.status === 'active' ? -1 : 1) - (y.status === 'active' ? -1 : 1));

  /** 名单来源 = 当前租户的 TenantMembership（不按 User 主档组织树反推） */
  const tenantUsers = useMemo(
    () => membershipsOfTenant(tenantRootId)
      .map(m => ({ user: users.find(u => u.id === m.userId), membership: m }))
      .filter((x): x is { user: (typeof users)[number]; membership: NonNullable<ReturnType<typeof membershipOfUserInTenant>> } => Boolean(x.user)),
    [tenantRootId, users],
  );
  const memberOrgName = (userId: string) => {
    const m = membershipOfUserInTenant(userId, tenantRootId);
    return orgs.find(o => o.id === m?.orgUnitId)?.name ?? m?.tenantName ?? '—';
  };

  /** 服务商可授予员工的药厂上限 = 合作生效 ∧ 品种业务授权有效（只收窄不扩大） */
  const grantablePharmas = useMemo(
    () => (isProvider ? grantablePharmasForProvider(tenantRootId) : []),
    [isProvider, tenantRootId],
  );

  const nameOf = (userId: string) => users.find(u => u.id === userId)?.name ?? userId;
  const identityOf = (userId: string) => identityLabel(role.name, memberOrgName(userId));

  function openGrant() {
    setGrant({ userId: '', from: todayISO(), to: '', reason: '', pharmaIds: [], varietyNames: [], error: '' });
  }

  function submitGrant() {
    if (!grant) return;
    if (!grant.userId) return setGrant({ ...grant, error: '请选择成员' });
    if (!grant.from) return setGrant({ ...grant, error: '请选择生效日期' });
    if (isProvider && grant.pharmaIds.length === 0) {
      return setGrant({ ...grant, error: '请勾选可处理药厂（业务范围至少一家药厂）' });
    }
    const result = createAssignment({
      userId: grant.userId,
      roleId: role.id,
      effectiveFrom: grant.from,
      effectiveTo: grant.to || undefined,
      reason: grant.reason.trim() || undefined,
      ...(isProvider ? { pharmaTenantIds: grant.pharmaIds, varietyNames: grant.varietyNames } : {}),
    });
    if (!result.ok) {
      setGrant({ ...grant, error: result.error || '授权失败' });
      return;
    }
    addToast({
      type: result.pendingReview ? 'warning' : 'success',
      title: result.pendingReview ? '已提交，待复核后生效' : '授权已生效',
      description: `${identityOf(grant.userId)}${isProvider ? ` · 可处理药厂 ${grant.pharmaIds.length} 家` : ''}`,
    });
    setGrant(null);
  }

  function submitEdit() {
    if (!edit) return;
    const result = updateAssignmentScope(edit.assignmentId, {
      effectiveFrom: edit.from,
      effectiveTo: edit.to || undefined,
      pharmaTenantIds: isProvider ? edit.pharmaIds : undefined,
      varietyNames: isProvider ? edit.varietyNames : undefined,
      reason: edit.reason.trim(),
    });
    if (!result.ok) {
      setEdit({ ...edit, error: result.error || '保存失败' });
      return;
    }
    addToast({ type: 'success', title: '授权范围已调整', description: '调整已写入操作审计。' });
    setEdit(null);
  }

  function submitRevoke() {
    if (!revoke) return;
    if (!revoke.reason.trim()) {
      setRevoke({ ...revoke, error: '请填写回收原因' });
      return;
    }
    const result = revokeAssignment(revoke.assignmentId, revoke.reason.trim());
    if (!result.ok) {
      setRevoke({ ...revoke, error: result.error || '回收失败' });
      return;
    }
    addToast({ type: 'success', title: '授权已回收', description: '记录转为「已回收」，历史保留可查。' });
    setRevoke(null);
  }

  const editTarget = edit ? assignments.find(a => a.id === edit.assignmentId) : undefined;
  const revokeTarget = revoke ? assignments.find(a => a.id === revoke.assignmentId) : undefined;
  const editDerivedRegions = edit && isProvider && edit.pharmaIds.length > 0
    ? derivedRegionCodesOfScope(tenantRootId, edit.pharmaIds, edit.varietyNames)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--fs-13)', color: '#667085', flex: 1, minWidth: 0 }}>
            本页签是「{role.name}」成员授予与回收的唯一入口：授予即写入生效期与数据范围，回收保留历史记录。
            {isProvider && ' 服务商成员的可处理药厂与品种以药厂授予本服务商的有效授权为上限（只收窄、不扩大）。'}
          </span>
          {canEdit && (
            <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={openGrant}>授予成员</Button>
          )}
        </div>
        {members.length === 0 ? (
          <EmptyState
            title="暂无成员拥有该角色"
            description={canEdit ? '点击「授予成员」为本企业成员分配该角色。' : '当前角色无授权管理权限。'}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
              <thead>
                <tr>
                  {[ '成员（身份展示）', '权限覆盖范围', ...(isProvider ? ['业务范围（实时健康度）'] : []), '生效期', '状态', '授权来源', '操作'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {members.map(a => {
                  const user = users.find(u => u.id === a.userId);
                  return (
                    <tr key={a.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{identityOf(a.userId)}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 1 }}>
                          {user?.account} · {user?.accountStatus === 'enabled' ? '账户启用' : '账户停用'}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{a.scopeOrgName}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 1 }}>{scopeLabel(a.scope)}</div>
                      </td>
                      {isProvider && (
                        <td style={tdStyle}>
                          {(a.pharmaTenantIds ?? []).length === 0 ? (
                            <span style={{ color: '#9CA3AF' }}>未分配</span>
                          ) : (
                            <div style={{ display: 'grid', gap: 4 }}>
                              {assignmentPharmaHealthCheck(a).map(h => (
                                <span
                                  key={h.pharmaTenantId}
                                  style={{
                                    ...chipStyle,
                                    width: 'fit-content',
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    ...(h.problem ? { background: '#FEF3E2', color: '#C77A16', border: '1px solid #FDE68A' } : {}),
                                  }}
                                  title={h.problem ? `授权保留但暂不可进入：${h.problem}` : '合作与业务授权有效'}
                                >
                                  {h.problem && <TriangleAlert size={11} aria-hidden />}
                                  {tenantNameOf(h.pharmaTenantId)}
                                  {(a.varietyNames ?? []).length > 0 && (
                                    <span style={{ color: '#9CA3AF' }}>·{(a.varietyNames ?? []).length} 品种</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      )}
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace" }}>
                        {a.effectiveFrom}{a.effectiveTo ? ` ~ ${a.effectiveTo}` : ' 起长期'}
                      </td>
                      <td style={tdStyle}><StatusTag status={grantStatusLabel(a.status)} size="sm" /></td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: 'var(--fs-12)' }}>由 {a.grantedBy} 于 {a.grantedAt} 授予</div>
                        {a.reason && <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', marginTop: 2 }}>原因：{a.reason}</div>}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {canEdit && (a.status === 'active' || a.status === 'pending_review') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEdit({
                                assignmentId: a.id,
                                userId: a.userId,
                                from: a.effectiveFrom,
                                to: a.effectiveTo ?? '',
                                reason: '',
                                pharmaIds: [...(a.pharmaTenantIds ?? [])],
                                varietyNames: [...(a.varietyNames ?? [])],
                                error: '',
                              })}
                            >
                              调整范围
                            </Button>
                          )}
                          {canEdit && (a.status === 'active' || a.status === 'pending_review') && (
                            <Button variant="ghost" size="sm" onClick={() => setRevoke({ assignmentId: a.id, reason: '', error: '' })}>回收</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
        授权即写入操作日志；回收保留历史记录（不是删除）。{previewReadOnly && '（预览模式只读）'}
        {roles.length === 0 && '（角色清单为空）'}
      </div>

      {/* 授予成员 */}
      {grant && (
        <Modal open title={`授予成员 · ${role.name}`} onClose={() => setGrant(null)} width={640}
          footer={
            <>
              <Button variant="outline" onClick={() => setGrant(null)}>取消</Button>
              <Button variant="primary" onClick={submitGrant}>确认授权</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {grant.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{grant.error}</div>}
            <Field label="成员" required>
              <select value={grant.userId} onChange={e => setGrant({ ...grant, userId: e.target.value, error: '' })} style={inputStyle}>
                <option value="">选择本企业成员</option>
                {tenantUsers.filter(({ user }) => user.accountStatus === 'enabled').map(({ user }) => (
                  <option key={user.id} value={user.id}>{user.name} · {user.account}（{memberOrgName(user.id)}）</option>
                ))}
              </select>
            </Field>
            {isProvider && (
              <BusinessScopeEditor
                providerTenantId={tenantRootId}
                providerName={principal.realm === 'TENANT' ? principal.tenantName : undefined}
                pharmaIds={grant.pharmaIds}
                varietyNames={grant.varietyNames}
                derivedRegions={grant.pharmaIds.length > 0 ? derivedRegionCodesOfScope(tenantRootId, grant.pharmaIds, grant.varietyNames) : []}
                grantablePharmas={grantablePharmas}
                onPharmaToggle={(id, next) => setGrant(g => g ? {
                  ...g,
                  pharmaIds: next ? [...new Set([...g.pharmaIds, id])] : g.pharmaIds.filter(x => x !== id),
                  varietyNames: next ? g.varietyNames : pruneVarietiesOnPharmaRemoval(tenantRootId, g.pharmaIds.filter(x => x !== id), g.varietyNames),
                  error: '',
                } : g)}
                onVarietyToggle={(v, next) => setGrant(g => g ? {
                  ...g,
                  varietyNames: next ? [...new Set([...g.varietyNames, v])] : g.varietyNames.filter(x => x !== v),
                } : g)}
              />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="生效日期" required>
                <input type="date" value={grant.from} onChange={e => setGrant({ ...grant, from: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="到期日期" hint="临时授权必填">
                <input type="date" value={grant.to} onChange={e => setGrant({ ...grant, to: e.target.value })} style={inputStyle} />
              </Field>
            </div>
            <Field label="授权原因" hint={isHighRiskRole(role) ? '高危角色必填；随审计保留' : '高危角色或临时授权必填；随审计保留'}>
              <textarea value={grant.reason} onChange={e => setGrant({ ...grant, reason: e.target.value })} rows={2} style={{ ...inputStyle, height: 'auto', padding: 10, resize: 'vertical' }} placeholder="例如：接替离职同事负责康宁试点" />
            </Field>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
              <ShieldAlert size={13} /> 授权人 {principal.name} · 授权时间取当前系统时间；记录写入企业审计日志
            </div>
          </div>
        </Modal>
      )}

      {/* 调整范围 */}
      {edit && editTarget && (
        <Modal open title={`调整授权范围 · ${role.name}`} onClose={() => setEdit(null)} width={620}
          footer={
            <>
              <Button variant="outline" onClick={() => setEdit(null)}>取消</Button>
              <Button variant="primary" onClick={submitEdit}>保存调整</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {edit.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{edit.error}</div>}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, fontSize: 'var(--fs-13)' }}>
              <strong>{identityOf(editTarget.userId)}</strong>
              <div style={{ color: '#9CA3AF', fontSize: 'var(--fs-12)', marginTop: 2 }}>原授权：由 {editTarget.grantedBy} 于 {editTarget.grantedAt} 授予 · {editTarget.scopeOrgName}（{scopeLabel(editTarget.scope)}）</div>
            </div>
            {isProvider && (
              <BusinessScopeEditor
                providerTenantId={tenantRootId}
                providerName={principal.realm === 'TENANT' ? principal.tenantName : undefined}
                pharmaIds={edit.pharmaIds}
                varietyNames={edit.varietyNames}
                derivedRegions={editDerivedRegions}
                grantablePharmas={grantablePharmas}
                onPharmaToggle={(id, next) => setEdit(g => g ? {
                  ...g,
                  pharmaIds: next ? [...new Set([...g.pharmaIds, id])] : g.pharmaIds.filter(x => x !== id),
                  varietyNames: next ? g.varietyNames : pruneVarietiesOnPharmaRemoval(tenantRootId, g.pharmaIds.filter(x => x !== id), g.varietyNames),
                  error: '',
                } : g)}
                onVarietyToggle={(v, next) => setEdit(g => g ? {
                  ...g,
                  varietyNames: next ? [...new Set([...g.varietyNames, v])] : g.varietyNames.filter(x => x !== v),
                } : g)}
              />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="生效日期">
                <input type="date" value={edit.from} onChange={e => setEdit({ ...edit, from: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="到期日期">
                <input type="date" value={edit.to} onChange={e => setEdit({ ...edit, to: e.target.value })} style={inputStyle} />
              </Field>
            </div>
            <Field label="调整原因" required hint="必填，随审计保留">
              <input value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value, error: '' })} style={inputStyle} placeholder="例如：项目结束，收回泽康授权" />
            </Field>
          </div>
        </Modal>
      )}

      {/* 回收 */}
      {revoke && revokeTarget && (
        <Modal open title={`回收授权 · ${role.name}`} onClose={() => setRevoke(null)} width={540}
          footer={
            <>
              <Button variant="outline" onClick={() => setRevoke(null)}>取消</Button>
              <Button variant="danger" onClick={submitRevoke}>确认回收</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {revoke.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{revoke.error}</div>}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, display: 'grid', gap: 6, fontSize: 'var(--fs-13)' }}>
              <div><span style={{ color: '#9CA3AF' }}>成员 </span><strong>{identityOf(revokeTarget.userId)}</strong></div>
              <div><span style={{ color: '#9CA3AF' }}>数据范围 </span>{revokeTarget.scopeOrgName} · {scopeLabel(revokeTarget.scope)}{isProvider && revokeTarget.pharmaTenantIds ? ` · 可处理药厂 ${revokeTarget.pharmaTenantIds.length} 家` : ''}</div>
              <div><span style={{ color: '#9CA3AF' }}>授权来源 </span>由 {revokeTarget.grantedBy} 于 {revokeTarget.grantedAt} 授予</div>
            </div>
            <InfoBanner tone="warning">回收后该成员下一次请求起失去此角色的全部能力；已分配药厂不再可见。历史保留可查（不是删除），不影响其他角色授权。</InfoBanner>
            <Field label="回收原因" required>
              <textarea value={revoke.reason} onChange={e => setRevoke({ ...revoke, reason: e.target.value, error: '' })} rows={2} style={{ ...inputStyle, height: 'auto', padding: 10, resize: 'vertical' }} placeholder="例如：岗位调整，不再承担该职责" />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

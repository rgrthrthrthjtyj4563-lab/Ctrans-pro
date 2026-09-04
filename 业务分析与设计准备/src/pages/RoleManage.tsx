import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, Eye, Plus, Shield, Trash2 } from 'lucide-react';
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
  VARIETY_OPTIONS,
  applyActionToggle,
  countGrantedUsers,
  grantStatusLabel,
  hasHighRiskGrant,
  orgPathLabel,
  scopeLabel,
  type FieldPolicyKind,
  type PageAction,
  type ResourcePage,
  type ScopeType,
  type SysRole,
  type SysRoleStatus,
} from '../data/permissions';
import type { ToastMessage } from '../components/Toast';
import type { NavigateFn } from '../types';
import {
  CheckCell, ChipSelect, Field, InfoBanner, RadioCard, RiskBadge, inputStyle, tdStyle, thStyle,
} from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navigate: NavigateFn;
}

const PAGE_SIZE = 10;
type DetailTab = 'basic' | 'pages' | 'scope' | 'fields' | 'members' | 'history';

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'pages', label: '页面与按钮权限' },
  { id: 'scope', label: '数据可见范围' },
  { id: 'fields', label: '敏感字段展示' },
  { id: 'basic', label: '基本信息' },
  { id: 'members', label: '已授权用户' },
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

export function RoleManage({ addToast, navigate }: Props) {
  const store = usePermission();
  const { roles, assignments, users, orgs, changeLogs, can, previewReadOnly } = store;
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({ status: 'enabled' });
  const [applied, setApplied] = useState<Record<string, string>>({ status: 'enabled' });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('pages');

  const [createOpen, setCreateOpen] = useState(false);
  const [copySource, setCopySource] = useState<SysRole | null>(null);
  const [formSourceId, setFormSourceId] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formScope, setFormScope] = useState<ScopeType>('PHARMA');
  const [formError, setFormError] = useState('');

  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    impact?: string;
    variant?: 'danger' | 'warning';
    onConfirm: () => void;
  } | null>(null);

  const canCreate = can('roles', 'create') && !previewReadOnly;
  const canEdit = can('roles', 'edit') && !previewReadOnly;
  const canDelete = can('roles', 'delete') && !previewReadOnly;

  const filtered = useMemo(() => {
    return roles.filter(r => {
      if (applied.name && !r.name.includes(applied.name)) return false;
      if (applied.kind && r.kind !== applied.kind) return false;
      if (applied.status && r.status !== applied.status) return false;
      return true;
    });
  }, [roles, applied]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const detail = roles.find(r => r.id === detailId) ?? null;
  const readonly = !detail || detail.kind === 'preset' || !canEdit;

  const stats = useMemo(() => ({
    preset: roles.filter(r => r.kind === 'preset').length,
    custom: roles.filter(r => r.kind === 'custom').length,
    enabled: roles.filter(r => r.status === 'enabled').length,
    members: new Set(assignments.filter(a => a.status === 'active').map(a => a.userId)).size,
  }), [roles, assignments]);

  function openCreate() {
    setFormSourceId(roles.find(r => r.id === 'role-pharma-sales')?.id ?? '');
    setFormName('');
    setFormDesc('');
    setFormScope('PHARMA');
    setFormError('');
    setCopySource(null);
    setCreateOpen(true);
  }

  function openCopy(role: SysRole) {
    setCopySource(role);
    setFormName(`${role.name}-副本`);
    setFormDesc(`从「${role.name}」复制的定制角色`);
    setFormScope(role.defaultScope);
    setFormError('');
    setCreateOpen(true);
  }

  function submitCreate() {
    const source = copySource ?? roles.find(r => r.id === formSourceId);
    const result = source
      ? store.copyRole(source.id, formName, formDesc)
      : store.createRole({ name: formName, description: formDesc, defaultScope: formScope });
    if (!result.ok) {
      setFormError(result.error || '保存失败');
      return;
    }
    addToast({
      type: 'success',
      title: copySource ? '角色已复制' : '角色已创建',
      description: `${formName}（草稿${source && !copySource ? `，从「${source.name}」复制` : '，默认无业务写权限'}）`,
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
        else addToast({ type: 'success', title: '角色已停用', description: `${role.name}` });
        setConfirm(null);
      },
    });
  }

  function askDelete(role: SysRole) {
    setConfirm({
      title: `删除「${role.name}」`,
      description: '仅草稿且未被授权的角色可以删除，删除后不可恢复。',
      variant: 'danger',
      onConfirm: () => {
        const r = store.deleteRole(role.id);
        if (!r.ok) addToast({ type: 'error', title: '无法删除', description: r.error });
        else {
          addToast({ type: 'success', title: '角色已删除' });
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
        onCopy={() => openCopy(detail)}
        onDisable={() => askDisable(detail)}
        onEnable={() => {
          const r = store.setRoleStatus(detail.id, 'enabled', '重新启用');
          if (!r.ok) addToast({ type: 'error', title: '无法启用', description: r.error });
          else addToast({ type: 'success', title: '角色已启用' });
        }}
        onDelete={() => askDelete(detail)}
        navigate={navigate}
        addToast={addToast}
        confirm={confirm}
        setConfirm={setConfirm}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="角色管理"
        description="以角色为模板配置页面、按钮、数据范围和敏感字段。预置角色只读，定制角色可从预置复制。"
        actions={canCreate ? (
          <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={openCreate}>新建角色</Button>
        ) : undefined}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <MetricCard title="预置角色" value={stats.preset} icon={Shield} compact />
          <MetricCard title="定制角色" value={stats.custom} icon={Shield} iconColor="#2F6BCE" iconBg="#EBF2FE" compact />
          <MetricCard title="启用中" value={stats.enabled} icon={Shield} iconColor="#248A5A" iconBg="#E6F5ED" compact />
          <MetricCard title="有效授权人数" value={stats.members} icon={Shield} iconColor="#C77A16" iconBg="#FEF3E2" compact />
        </div>

        <FilterBar
          fields={[
            { id: 'name', label: '角色名称', type: 'text', placeholder: '搜索角色名称' },
            { id: 'kind', label: '角色类型', type: 'select', options: [{ value: 'preset', label: '预置' }, { value: 'custom', label: '定制' }] },
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
              <thead>
                <tr>
                  {['角色名称', '类型', '状态', '已授权人数', '权限摘要', '默认数据范围', '最近修改人', '最近修改时间', '操作'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 0 }}><EmptyState title="没有符合条件的角色" description="调整筛选条件，或新建一个定制角色" /></td></tr>
                ) : pageData.map((role, idx) => {
                  const members = countGrantedUsers(role.id, assignments);
                  const summary = permSummary(role);
                  return (
                    <tr key={role.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{role.name}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>{role.description}</div>
                      </td>
                      <td style={tdStyle}>
                        <Tag label={role.kind === 'preset' ? '预置' : '定制'} color={role.kind === 'preset' ? 'brand' : 'info'} />
                      </td>
                      <td style={tdStyle}><StatusTag status={statusWord(role.status)} /></td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace" }}>{members}</td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#374151' }}>{summary.countText}</div>
                        {summary.riskText && (
                          <div style={{ marginTop: 4 }}><Tag label={summary.riskText} color="warning" /></div>
                        )}
                      </td>
                      <td style={tdStyle}>{scopeLabel(role.defaultScope)}</td>
                      <td style={tdStyle}>{role.updatedBy}</td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", color: '#667085', whiteSpace: 'nowrap' }}>{role.updatedAt}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => { setDetailId(role.id); setTab('pages'); }}>
                            {role.kind === 'preset' ? '查看' : '配置'}
                          </Button>
                          {canCreate && (
                            <Button variant="ghost" size="sm" icon={<Copy size={13} />} onClick={() => openCopy(role)}>复制</Button>
                          )}
                          {role.kind === 'custom' && role.status === 'enabled' && canEdit && (
                            <Button variant="ghost" size="sm" onClick={() => askDisable(role)}>停用</Button>
                          )}
                          {role.kind === 'custom' && role.status === 'draft' && canDelete && (
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
        copySource={copySource}
        sourceId={formSourceId}
        sourceOptions={roles.filter(r => r.status === 'enabled')}
        name={formName}
        desc={formDesc}
        scope={formScope}
        error={formError}
        onSource={setFormSourceId}
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
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/** 列表「权限摘要」：页面/操作计数 + 高危操作点名 */
function permSummary(role: SysRole): { countText: string; riskText: string } {
  let pages = 0;
  let writes = 0;
  const riskLabels = new Set<string>();
  for (const p of RESOURCE_PAGES) {
    const granted = role.pagePerms[p.id] ?? [];
    if (granted.length === 0) continue;
    pages += 1;
    for (const key of granted) {
      if (key === 'view') continue;
      writes += 1;
      const def = p.actions.find(a => a.key === key);
      if (def?.risk) riskLabels.add(def.label);
    }
  }
  const countText = `${pages} 个页面 · ${writes} 项操作`;
  const riskText = riskLabels.size > 0 ? `含${Array.from(riskLabels).join('、')} ${riskLabels.size} 项` : '';
  return { countText, riskText };
}

function statusWord(status: SysRoleStatus): '启用' | '停用' | '草稿' {
  return status === 'enabled' ? '启用' : status === 'disabled' ? '停用' : '草稿';
}

function RoleFormModal({
  open, copySource, sourceId, sourceOptions, name, desc, scope, error,
  onSource, onName, onDesc, onScope, onClose, onSubmit,
}: {
  open: boolean;
  copySource: SysRole | null;
  sourceId: string;
  sourceOptions: SysRole[];
  name: string;
  desc: string;
  scope: ScopeType;
  error: string;
  onSource: (v: string) => void;
  onName: (v: string) => void;
  onDesc: (v: string) => void;
  onScope: (v: ScopeType) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      open={open}
      title={copySource ? `复制角色 · ${copySource.name}` : '新建定制角色'}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={onSubmit}>{copySource ? '复制为定制角色' : '创建草稿'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {copySource ? (
          <InfoBanner>
            复制结果始终为定制角色。来源角色不受影响，可在复制后单独调整页面、按钮和数据范围。
          </InfoBanner>
        ) : (
          <InfoBanner>
            建议从相近角色复制后再微调，避免从空白矩阵逐格配置造成漏项。
          </InfoBanner>
        )}
        {error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{error}</div>}
        <Field label="角色名称" required>
          <input value={name} onChange={e => onName(e.target.value)} style={inputStyle} placeholder="同一租户内唯一" />
        </Field>
        {!copySource && (
          <Field label="从角色复制" hint="复制来源角色的页面、按钮、数据范围与字段策略；选「从空白开始」则默认无业务写权限">
            <select value={sourceId} onChange={e => onSource(e.target.value)} style={inputStyle}>
              <option value="">从空白开始（不推荐）</option>
              {sourceOptions.map(r => (
                <option key={r.id} value={r.id}>{r.name}（{r.kind === 'preset' ? '预置' : '定制'}）</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="角色说明">
          <textarea
            value={desc}
            onChange={e => onDesc(e.target.value)}
            rows={3}
            style={{ ...inputStyle, height: 'auto', padding: 10, resize: 'vertical' }}
            placeholder="给其他管理员看的职责说明"
          />
        </Field>
        {!copySource && !sourceId && (
          <Field label="默认数据范围" hint="可在角色详情中再调整">
            <select value={scope} onChange={e => onScope(e.target.value as ScopeType)} style={inputStyle}>
              {SCOPE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
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
  onBack, onCopy, onDisable, onEnable, onDelete, navigate, addToast, confirm, setConfirm,
}: {
  role: SysRole;
  tab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  readonly: boolean;
  previewReadOnly: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onBack: () => void;
  onCopy: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onDelete: () => void;
  navigate: NavigateFn;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  confirm: { title: string; description: string; impact?: string; variant?: 'danger' | 'warning'; onConfirm: () => void } | null;
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

  const members = assignments.filter(a => a.roleId === role.id);
  const activeMemberCount = new Set(members.filter(m => m.status === 'active').map(m => m.userId)).size;
  const history = changeLogs.filter(c => c.roleId === role.id);
  const sourceName = role.copiedFrom ? store.roles.find(r => r.id === role.copiedFrom)?.name : undefined;
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
            {canEdit && <Button variant="outline" size="md" icon={<Copy size={14} />} onClick={onCopy}>复制</Button>}
            {role.kind === 'custom' && role.status === 'enabled' && canEdit && (
              <Button variant="outline" size="md" onClick={onDisable}>停用</Button>
            )}
            {role.kind === 'custom' && role.status !== 'enabled' && canEdit && (
              <Button variant="outline" size="md" onClick={onEnable}>启用</Button>
            )}
            {role.kind === 'custom' && role.status === 'draft' && canDelete && (
              <Button variant="danger" size="md" icon={<Trash2 size={14} />} onClick={onDelete}>删除</Button>
            )}
            {!locked && (
              <Button variant="primary" size="md" disabled={!dirty} onClick={() => save()}>保存并发布</Button>
            )}
          </div>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <Tag label={role.kind === 'preset' ? '预置角色' : '定制角色'} color={role.kind === 'preset' ? 'brand' : 'info'} />
          <StatusTag status={statusWord(role.status)} />
          <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>版本 v{role.version}</span>
          <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>适用租户 {role.tenant}</span>
          <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>已授权 {activeMemberCount} 人</span>
          {sourceName && <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>复制自 {sourceName}</span>}
          {role.kind === 'preset' && (
            <span style={{ fontSize: 'var(--fs-12)', color: '#C77A16' }}>预置角色不可修改、删除或停用，请复制为定制角色后再调整</span>
          )}
        </div>

        {tab === 'pages' && (
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
        )}

        {tab === 'scope' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20 }}>
            <InfoBanner>
              角色模板只定义范围策略；授权时系统按策略与人员所属组织自动定位权限覆盖根节点（如「本药厂」锚定到药厂根节点）。例外跨组织权限请复制为定制角色，不在用户详情开放任意组织选择。
            </InfoBanner>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              {SCOPE_OPTIONS.map(opt => (
                <RadioCard
                  key={opt.value}
                  checked={draft.defaultScope === opt.value}
                  disabled={locked}
                  title={opt.label}
                  hint={opt.hint}
                  onClick={() => setDraft(d => ({ ...d, defaultScope: opt.value }))}
                />
              ))}
            </div>
            {draft.defaultScope === 'CUSTOM' && (
              <div style={{ marginTop: 20, display: 'grid', gap: 16 }}>
                <Field label="组织 / 药厂 / 服务商 / 工作组 / 部门">
                  <ChipSelect
                    disabled={locked}
                    values={[
                      ...draft.customScope.orgIds,
                      ...draft.customScope.pharmaIds,
                      ...draft.customScope.providerIds,
                      ...draft.customScope.groupIds,
                      ...draft.customScope.deptIds,
                    ]}
                    options={orgs.map(o => ({
                      value: o.id,
                      label: o.type === 'department' ? orgPathLabel(orgs, o.id) : o.name,
                    }))}
                    onChange={next => {
                      const pharmaIds = next.filter(id => orgs.find(o => o.id === id)?.type === 'pharma');
                      const providerIds = next.filter(id => orgs.find(o => o.id === id)?.type === 'provider');
                      const groupIds = next.filter(id => orgs.find(o => o.id === id)?.type === 'group');
                      const orgIds = next.filter(id => orgs.find(o => o.id === id)?.type === 'platform');
                      const deptIds = next.filter(id => orgs.find(o => o.id === id)?.type === 'department');
                      setDraft(d => ({ ...d, customScope: { ...d.customScope, orgIds, pharmaIds, providerIds, groupIds, deptIds } }));
                    }}
                  />
                </Field>
                <Field label="品种">
                  <ChipSelect
                    disabled={locked}
                    values={draft.customScope.varietyIds}
                    options={VARIETY_OPTIONS.map(v => ({ value: v, label: v }))}
                    onChange={varietyIds => setDraft(d => ({ ...d, customScope: { ...d.customScope, varietyIds } }))}
                  />
                </Field>
                <Field label="区域">
                  <ChipSelect
                    disabled={locked}
                    values={draft.customScope.regionCodes}
                    options={['陕西', '四川', '广东', '江苏', '浙江', '北京', '上海', '全国'].map(v => ({ value: v, label: v }))}
                    onChange={regionCodes => setDraft(d => ({ ...d, customScope: { ...d.customScope, regionCodes } }))}
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        {tab === 'fields' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px' }}>
              <InfoBanner>
                仅对已登记为敏感的字段开放配置。脱敏在服务端序列化前执行；隐藏字段前端不会收到原始值，列表也不展示列名。
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
        )}

        {tab === 'basic' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 760 }}>
            <Field label="角色名称" required>
              <input value={draft.name} disabled={locked} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="角色类型">
              <input value={role.kind === 'preset' ? '预置' : '定制'} disabled style={inputStyle} />
            </Field>
            <Field label="适用租户">
              <input value={role.tenant} disabled style={inputStyle} />
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
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 'var(--fs-13)', color: '#667085', flex: 1, minWidth: 0 }}>
                只读关联视图。角色的授予与回收统一在「用户与组织」的用户详情中完成。
              </span>
              <Button variant="primary" size="sm" onClick={() => navigate('departments', { userOrgRoleId: role.id })}>
                管理这些用户
              </Button>
            </div>
            {members.length === 0 ? (
              <EmptyState
                title="暂无用户拥有该角色"
                description="请前往『用户与组织』选择用户后分配角色。"
                action={
                  <Button variant="outline" size="sm" onClick={() => navigate('departments', { userOrgRoleId: role.id })}>
                    前往用户与组织
                  </Button>
                }
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr>
                      {['用户', '所属部门', '权限覆盖范围', '生效期', '授权状态', '授权人 / 时间'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((a, idx) => {
                      const user = users.find(u => u.id === a.userId);
                      return (
                        <tr key={a.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600 }}>{user?.name}</div>
                            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 1 }}>
                              {user?.account} · {user?.accountStatus === 'enabled' ? '账户启用' : '账户停用'}
                            </div>
                          </td>
                          <td style={tdStyle}>{user ? orgPathLabel(orgs, user.orgId) : '—'}</td>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 500 }}>{a.scopeOrgName}</div>
                            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 1 }}>{scopeLabel(a.scope)}</div>
                          </td>
                          <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                            {a.effectiveFrom}{a.effectiveTo ? ` ~ ${a.effectiveTo}` : ' 起长期'}
                          </td>
                          <td style={tdStyle}><StatusTag status={grantStatusLabel(a.status)} /></td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                            {a.grantedBy}
                            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>{a.grantedAt}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            {history.length === 0 ? (
              <EmptyState title="暂无变更记录" description="保存权限、启停或授权后将在此留痕" />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

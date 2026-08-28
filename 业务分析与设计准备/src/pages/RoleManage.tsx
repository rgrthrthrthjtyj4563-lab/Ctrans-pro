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
  hasHighRiskGrant,
  scopeLabel,
  type FieldPolicyKind,
  type PageAction,
  type ScopeType,
  type SysRole,
  type SysRoleStatus,
} from '../data/permissions';
import type { ToastMessage } from '../components/Toast';
import {
  CheckCell, ChipSelect, Field, InfoBanner, RadioCard, RiskBadge, inputStyle, tdStyle, thStyle,
} from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
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

export function RoleManage({ addToast }: Props) {
  const store = usePermission();
  const { roles, grants, users, orgs, changeLogs, can, previewReadOnly } = store;
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({ status: 'enabled' });
  const [applied, setApplied] = useState<Record<string, string>>({ status: 'enabled' });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('pages');

  const [createOpen, setCreateOpen] = useState(false);
  const [copySource, setCopySource] = useState<SysRole | null>(null);
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
    members: new Set(grants.filter(g => g.status === 'active').map(g => g.userId)).size,
  }), [roles, grants]);

  function openCreate() {
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
    const result = copySource
      ? store.copyRole(copySource.id, formName, formDesc)
      : store.createRole({ name: formName, description: formDesc, defaultScope: formScope });
    if (!result.ok) {
      setFormError(result.error || '保存失败');
      return;
    }
    addToast({ type: 'success', title: copySource ? '角色已复制' : '角色已创建', description: `${formName}（草稿，默认无业务写权限）` });
    setCreateOpen(false);
    if (result.role) {
      setDetailId(result.role.id);
      setTab('pages');
    }
  }

  function askDisable(role: SysRole) {
    const affected = users.filter(u => grants.some(g => g.roleId === role.id && g.userId === u.id && g.status === 'active'));
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>
                  {['角色名称', '类型', '状态', '已授权人数', '默认数据范围', '最近修改人', '最近修改时间', '操作'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 0 }}><EmptyState title="没有符合条件的角色" description="调整筛选条件，或新建一个定制角色" /></td></tr>
                ) : pageData.map((role, idx) => {
                  const members = countGrantedUsers(role.id, grants);
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
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function statusWord(status: SysRoleStatus): '启用' | '停用' | '草稿' {
  return status === 'enabled' ? '启用' : status === 'disabled' ? '停用' : '草稿';
}

function RoleFormModal({
  open, copySource, name, desc, scope, error, onName, onDesc, onScope, onClose, onSubmit,
}: {
  open: boolean;
  copySource: SysRole | null;
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
            新建定制角色默认没有业务写权限，保存后请在「页面与按钮权限」中勾选。
          </InfoBanner>
        )}
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
        {!copySource && (
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

function RoleDetail({
  role, tab, onTabChange, readonly, previewReadOnly, canEdit, canDelete, onBack, onCopy, onDisable, onEnable, onDelete, addToast, confirm, setConfirm,
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
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  confirm: { title: string; description: string; impact?: string; variant?: 'danger' | 'warning'; onConfirm: () => void } | null;
  setConfirm: (c: typeof confirm) => void;
}) {
  const store = usePermission();
  const { grants, users, orgs, changeLogs } = store;
  const [draft, setDraft] = useState<SysRole>(role);
  const locked = readonly || previewReadOnly;

  useEffect(() => {
    setDraft(role);
  }, [role]);

  const members = grants.filter(g => g.roleId === role.id);
  const history = changeLogs.filter(c => c.roleId === role.id);
  const sourceName = role.copiedFrom ? store.roles.find(r => r.id === role.copiedFrom)?.name : undefined;
  const dirty = JSON.stringify(draft) !== JSON.stringify(role);

  function save(force = false) {
    if (locked) return;
    if (!force && hasHighRiskGrant(role.pagePerms, draft.pagePerms)) {
      setConfirm({
        title: '确认授予高危权限',
        description: '本次保存包含删除、审核、导出等风险操作。保存后将立即影响已授权用户的下一次请求。',
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

  const modules = Array.from(new Set(RESOURCE_PAGES.map(p => p.module)));

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
          {sourceName && <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>复制自 {sourceName}</span>}
          {role.kind === 'preset' && (
            <span style={{ fontSize: 'var(--fs-12)', color: '#C77A16' }}>预置角色不可修改、删除或停用，请复制为定制角色后再调整</span>
          )}
        </div>

        {tab === 'pages' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
              <InfoBanner>
                按业务模块勾选页面和按钮。取消「查看页面」会同时取消该页全部按钮；勾选任一按钮会自动勾选查看。管理员无需输入权限编码。
              </InfoBanner>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>模块</th>
                    <th style={thStyle}>页面 / 说明</th>
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
                    return pages.map((p, i) => {
                      const granted = new Set(draft.pagePerms[p.id] ?? []);
                      return (
                        <tr key={p.id}>
                          {i === 0 && (
                            <td style={{ ...tdStyle, fontWeight: 600, color: '#667085', verticalAlign: 'top' }} rowSpan={pages.length}>
                              {mod}
                            </td>
                          )}
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>{p.description}</div>
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
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'scope' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20 }}>
            <InfoBanner>
              系统仅返回同时满足授权范围和业务归属的数据。例如服务商管理员只能看到本服务商、已授权品种和区域内的任务。
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
                <Field label="组织 / 药厂 / 服务商 / 工作组">
                  <ChipSelect
                    disabled={locked}
                    values={[
                      ...draft.customScope.orgIds,
                      ...draft.customScope.pharmaIds,
                      ...draft.customScope.providerIds,
                      ...draft.customScope.groupIds,
                    ]}
                    options={orgs.map(o => ({ value: o.id, label: `${o.name}` }))}
                    onChange={next => {
                      const pharmaIds = next.filter(id => orgs.find(o => o.id === id)?.type === 'pharma');
                      const providerIds = next.filter(id => orgs.find(o => o.id === id)?.type === 'provider');
                      const groupIds = next.filter(id => orgs.find(o => o.id === id)?.type === 'group');
                      const orgIds = next.filter(id => orgs.find(o => o.id === id)?.type === 'platform');
                      setDraft(d => ({ ...d, customScope: { ...d.customScope, orgIds, pharmaIds, providerIds, groupIds } }));
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
            {members.length === 0 ? (
              <EmptyState title="暂无授权用户" description="请到「用户授权」为该角色添加用户" />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['用户', '组织', '生效期', '数据范围', '授权状态', '授权人'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {members.map((g, idx) => {
                    const user = users.find(u => u.id === g.userId);
                    return (
                      <tr key={g.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{user?.name}</div>
                          <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{user?.account} · {user?.accountStatus === 'enabled' ? '账户启用' : '账户停用'}</div>
                        </td>
                        <td style={tdStyle}>{g.orgName}</td>
                        <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace" }}>
                          {g.effectiveFrom}{g.effectiveTo ? ` ~ ${g.effectiveTo}` : ' 起长期'}
                        </td>
                        <td style={tdStyle}>{scopeLabel(g.scope)}</td>
                        <td style={tdStyle}><StatusTag status={grantStatusWord(g.status)} /></td>
                        <td style={tdStyle}>{g.grantedBy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

function grantStatusWord(status: string): '启用' | '已过期' | '已回收' | '待复核' {
  if (status === 'expired') return '已过期';
  if (status === 'revoked') return '已回收';
  if (status === 'pending_review') return '待复核';
  return '启用';
}

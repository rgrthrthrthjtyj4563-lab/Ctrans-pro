/**
 * 角色与数据范围（企业管理精简闭环版）。
 *
 * 核心口径：
 * - 角色状态仅「启用 / 停用」（历史遗留草稿按停用展示，保留配置并允许手动启用）；
 * - 新建角色直接编辑名称、说明与权限，一次「保存」即生成并启用，取消不落库；
 * - 详情头部仅保留角色名、状态与操作；同一行提供「权限｜敏感字段｜已授权成员」三个页签；
 * - 权限与敏感字段共用右上角「保存」，切页签保留未保存编辑，返回列表有改动才提示放弃；
 * - 成员列表姓名/手机号/部门分列，状态与登录权限共用 resolveGrantStatus 同一日期口径；
 * - 新增授予去掉授权原因与例外跨部门管辖；编辑已有授权隐藏例外字段并按原样保留存量值。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Ban,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  Eye,
  FilePlus2,
  Folder,
  Info,
  Lock,
  Pencil,
  Search,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ADMIN_ROLE_IDS, usePermission } from '../context/PermissionContext';
import { BizScopeEditor } from '../components/BizScopeEditor';
import {
  countGrantedUsers,
  enterpriseRootOf,
  fieldPolicyLabel,
  filterResourcePagesForTenant,
  grantStatusLabel,
  isGrantActiveOrPending,
  isGrantEffective,
  localTodayIso,
  orgPathLabel,
  resolveGrantStatus,
  SENSITIVE_FIELDS,
  type BizScopeItem,
  type FieldPolicyKind,
  type PageAction,
  type ResolvedGrantStatus,
  type ResourcePage,
  type SysRole,
  type SysRoleStatus,
} from '../data/permissions';
import {
  MENU_ICONS,
  seedMenuItems,
  workspaceOfPrincipal,
  type MenuSeedItem,
} from '../data/menus';
import {
  membershipActive,
  membershipOfUserInTenant,
  membershipsOfTenant,
  subscribeTenantMemberships,
  validateBizScopes,
} from '../data/cooperationModel';
import { inputStyle } from './permUi';
import type { NavigateFn } from '../types';
import type { ToastMessage } from '../components/Toast';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navigate?: NavigateFn;
  /** 当前工作空间的菜单项（App 传入）；缺省回落到种子菜单 */
  menuItems?: MenuSeedItem[];
}

/** 导航同构分组：单页面目录作为顶层页面行，其余按目录分组 */
interface NavGroup {
  key: string;
  name: string;
  iconKey: string;
  pages: ResourcePage[];
  solo: boolean;
  other?: boolean;
}

interface Draft {
  name: string;
  description: string;
  pagePerms: Record<string, PageAction[]>;
  fieldPolicies: Record<string, FieldPolicyKind>;
}

type DetailTab = 'perm' | 'fields' | 'members';

/* ─── 状态胶囊与辅助组件 ──────────────────────────────────────────────────── */

function normalizeRoleStatus(status: SysRoleStatus): 'enabled' | 'disabled' {
  return status === 'enabled' ? 'enabled' : 'disabled';
}

function StatusPill({ status }: { status: SysRoleStatus }) {
  if (normalizeRoleStatus(status) === 'enabled') {
    return (
      <span className="rd-pill rd-pill--success">
        <CircleCheck size={13} aria-hidden /> 启用
      </span>
    );
  }
  return (
    <span className="rd-pill rd-pill--muted">
      <Ban size={13} aria-hidden /> 停用
    </span>
  );
}

function GrantPill({ status }: { status: ResolvedGrantStatus }) {
  if (status === 'active') {
    return <span className="rd-pill rd-pill--success"><CircleCheck size={13} aria-hidden /> {grantStatusLabel(status)}</span>;
  }
  if (status === 'revoked') {
    return <span className="rd-pill rd-pill--danger"><CircleX size={13} aria-hidden /> {grantStatusLabel(status)}</span>;
  }
  return <span className="rd-pill rd-pill--muted"><CircleAlert size={13} aria-hidden /> {grantStatusLabel(status)}</span>;
}

function NavIcon({ iconKey, size = 16 }: { iconKey: string; size?: number }) {
  const Icon = MENU_ICONS[iconKey] ?? Folder;
  return <Icon size={size} aria-hidden />;
}

/* ─── 草稿与差异判定 ──────────────────────────────────────────────────────── */

function makeDraft(role: SysRole): Draft {
  return {
    name: role.name,
    description: role.description,
    pagePerms: Object.fromEntries(
      Object.entries(role.pagePerms).map(([k, v]) => [k, [...v]]),
    ) as Record<string, PageAction[]>,
    fieldPolicies: { ...role.fieldPolicies },
  };
}

function makeEmptyDraft(baseFields: Record<string, FieldPolicyKind>): Draft {
  return {
    name: '',
    description: '',
    pagePerms: { dashboard: ['view'] },
    fieldPolicies: Object.fromEntries(
      SENSITIVE_FIELDS.map((f) => [f.key, baseFields[f.key] ?? ('hidden' as FieldPolicyKind)]),
    ),
  };
}

function pageLabelOf(page: ResourcePage, labels: Map<string, string>) {
  return labels.get(page.id) ?? page.name;
}

function hasDraftChanges(base: Draft, next: Draft, groups: NavGroup[]): boolean {
  if (next.name.trim() !== base.name.trim()) return true;
  if (next.description.trim() !== base.description.trim()) return true;
  for (const g of groups) {
    for (const p of g.pages) {
      const a = base.pagePerms[p.id] ?? [];
      const b = next.pagePerms[p.id] ?? [];
      if (a.length !== b.length) return true;
      for (const k of a) if (!b.includes(k)) return true;
    }
  }
  for (const f of SENSITIVE_FIELDS) {
    if ((next.fieldPolicies[f.key] ?? 'visible') !== (base.fieldPolicies[f.key] ?? 'visible')) {
      return true;
    }
  }
  return false;
}

function buildEditSummary(base: Draft, next: Draft, groups: NavGroup[]): string {
  const parts: string[] = [];
  if (next.name.trim() !== base.name.trim()) parts.push('改名');
  let add = 0;
  let del = 0;
  for (const g of groups) {
    for (const p of g.pages) {
      const before = new Set(base.pagePerms[p.id] ?? []);
      const after = new Set(next.pagePerms[p.id] ?? []);
      for (const k of after) if (!before.has(k)) add += 1;
      for (const k of before) if (!after.has(k)) del += 1;
    }
  }
  if (add > 0 || del > 0) parts.push(`权限 +${add}/-${del}`);
  const fieldChanged = SENSITIVE_FIELDS.some(
    (f) => (next.fieldPolicies[f.key] ?? 'visible') !== (base.fieldPolicies[f.key] ?? 'visible'),
  );
  if (fieldChanged) parts.push('调整敏感字段');
  return parts.join(' · ') || '保存配置';
}

/* ─── 三态分组复选框 ──────────────────────────────────────────────────────── */

function TriCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="rd-cb"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
    />
  );
}

/* ═════════════════════════ 角色列表页 ══════════════════════════════════════ */

export function RoleManage({ addToast, menuItems }: Props) {
  const store = usePermission();
  const { roles, assignments, orgs, can, previewReadOnly, principal, realmRoles } = store;
  const tenantRootId = principal.realm === 'TENANT' ? principal.tenantId : 'org-platform';
  const tenantRoot = orgs.find((o) => o.id === tenantRootId);
  const canEdit = can('roles', 'edit') && !previewReadOnly;
  const canCreate = can('roles', 'create') && !previewReadOnly;

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'enabled' | 'disabled'>('');
  const [creating, setCreating] = useState(false);
  const [detailRoleId, setDetailRoleId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('perm');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return realmRoles
      .filter((r) => (statusFilter ? normalizeRoleStatus(r.status) === statusFilter : true))
      .filter((r) => (kw ? r.name.toLowerCase().includes(kw) || r.description.toLowerCase().includes(kw) : true))
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'zh') : a.kind === 'preset' ? -1 : 1));
  }, [realmRoles, keyword, statusFilter]);

  const grantedCount = (roleId: string) =>
    countGrantedUsers(roleId, assignments.filter((a) => a.tenantId === tenantRootId));

  function submitDelete() {
    if (!deleteTarget) return;
    const role = roles.find((r) => r.id === deleteTarget);
    const r = store.deleteRole(deleteTarget, '删除自定义角色');
    if (!r.ok) {
      addToast({ type: 'error', title: '删除被拦截', description: r.error ?? '删除失败' });
      setDeleteTarget(null);
      return;
    }
    addToast({ type: 'success', title: '角色已删除', description: `「${role?.name}」已删除；历史授权记录保留可查。` });
    setDeleteTarget(null);
  }

  if (creating) {
    return (
      <RoleDetail
        mode="create"
        store={store}
        addToast={addToast}
        tab={detailTab === 'members' ? 'perm' : detailTab}
        onTabChange={setDetailTab}
        onBack={() => setCreating(false)}
        onCreated={(roleId) => {
          setCreating(false);
          setDetailRoleId(roleId);
          setDetailTab('perm');
        }}
        menuItems={menuItems}
      />
    );
  }

  const detailRole = detailRoleId ? roles.find((r) => r.id === detailRoleId) : null;

  if (detailRole) {
    return (
      <RoleDetail
        mode="edit"
        role={detailRole}
        store={store}
        addToast={addToast}
        tab={detailTab}
        onTabChange={setDetailTab}
        onBack={() => setDetailRoleId(null)}
        menuItems={menuItems}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="角色与数据范围"
        description={`「${tenantRoot?.name ?? '本企业'}」的角色权限与成员授权管理。`}
        actions={canCreate ? (
          <Button
            variant="primary"
            size="md"
            icon={<FilePlus2 size={14} />}
            onClick={() => {
              setDetailTab('perm');
              setCreating(true);
            }}
          >
            新建角色
          </Button>
        ) : undefined}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div className="rd-card" style={{ marginBottom: 12 }}>
          <div className="rd-filterbar">
            <div className="rd-search">
              <Search size={13} aria-hidden />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索角色名称或说明"
                aria-label="搜索角色"
              />
            </div>
            <div className="rd-seg-filter" role="group" aria-label="按状态筛选">
              {([['', '全部'], ['enabled', '启用'], ['disabled', '停用']] as const).map(([v, label]) => (
                <button
                  key={v || 'all'}
                  type="button"
                  aria-pressed={statusFilter === v}
                  onClick={() => setStatusFilter(v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="rd-list-count">
              共 <b className="font-mono-nums">{list.length}</b> 个角色
            </span>
          </div>
        </div>

        <div className="rd-card">
          {list.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="暂无符合条件的角色"
              description="调整搜索词或状态筛选后再试，或点击右上角「新建角色」创建自定义角色。"
            />
          ) : (
            <div className="rd-tbl-wrap">
              <table className="rd-tbl">
                <thead>
                  <tr>
                    {['角色名称', '状态', '已授权人数', '操作'].map((h) => (
                      <th key={h} scope="col" className={h === '已授权人数' || h === '操作' ? 'rd-num' : undefined}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const isEnabled = normalizeRoleStatus(r.status) === 'enabled';
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="rd-role-name">
                            <ShieldCheck size={16} aria-hidden />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <b>{r.name}</b>
                                {r.kind === 'preset' && <span className="rd-preset-badge">预置</span>}
                              </div>
                              {r.description && (
                                <div className="rd-cell-sub rd-role-desc" title={r.description}>{r.description}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td><StatusPill status={r.status} /></td>
                        <td className="rd-num font-mono-nums">{grantedCount(r.id)} 人</td>
                        <td>
                          <div className="rd-ops">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setDetailRoleId(r.id); setDetailTab('perm'); }}
                            >
                              {r.kind === 'preset' ? '查看权限' : '编辑'}
                            </Button>
                            {r.kind === 'custom' && canEdit && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const next: SysRoleStatus = isEnabled ? 'disabled' : 'enabled';
                                    const sr = store.setRoleStatus(r.id, next, next === 'enabled' ? '管理员启用' : '管理员停用');
                                    if (!sr.ok) {
                                      addToast({ type: 'error', title: '操作失败', description: sr.error });
                                    } else {
                                      addToast({
                                        type: 'success',
                                        title: next === 'enabled' ? '角色已启用' : '角色已停用',
                                        description: `「${r.name}」已切换为${next === 'enabled' ? '启用' : '停用'}状态。`,
                                      });
                                    }
                                  }}
                                >
                                  {isEnabled ? '停用' : '启用'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  style={{ color: 'var(--color-button-danger-hover)' }}
                                  onClick={() => setDeleteTarget(r.id)}
                                >
                                  删除
                                </Button>
                              </>
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
      </div>

      {deleteTarget && (
        <ConfirmDialog
          open
          title="删除自定义角色"
          description={`确认删除「${roles.find((r) => r.id === deleteTarget)?.name ?? ''}」？仍有有效或待生效授权的成员时会被拦截并引导先回收；历史授权记录保留可查。`}
          confirmLabel="确认删除"
          onConfirm={submitDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/* ═════════════════════════ 角色详情 / 新建 ═════════════════════════════════ */

function buildNavGroups(
  menuItems: MenuSeedItem[] | undefined,
  tenantKind: 'pharma' | 'provider',
): NavGroup[] {
  const pages = filterResourcePagesForTenant('TENANT', tenantKind);
  const allowed = workspaceOfPrincipal('TENANT', tenantKind);
  const items = (menuItems ?? seedMenuItems()).filter((m) => m.enabled && allowed.includes(m.workspace));
  const tops = items.filter((m) => m.parentId === null).sort((a, b) => a.sort - b.sort);
  const groups: NavGroup[] = [];
  const inMenu = new Set<string>();
  for (const top of tops) {
    if (top.type === 'page') {
      const p = pages.find((x) => x.id === top.pageId);
      if (!p) continue;
      inMenu.add(p.id);
      groups.push({ key: top.id, name: top.name, iconKey: top.iconKey ?? 'folder', pages: [p], solo: true });
      continue;
    }
    if (top.type === 'group') {
      const children = items.filter((m) => m.parentId === top.id).sort((a, b) => a.sort - b.sort);
      const groupPages = children
        .map((c) => pages.find((x) => x.id === c.pageId))
        .filter((p): p is ResourcePage => Boolean(p));
      if (groupPages.length === 0) continue;
      groupPages.forEach((p) => inMenu.add(p.id));
      groups.push({ key: top.id, name: top.name, iconKey: top.iconKey ?? 'folder', pages: groupPages, solo: false });
    }
  }
  const rest = pages.filter((p) => !inMenu.has(p.id));
  if (rest.length > 0) {
    groups.push({ key: 'other', name: '其他页面', iconKey: 'folder', pages: rest, solo: false, other: true });
  }
  return groups;
}

type RoleDetailProps = {
  store: ReturnType<typeof usePermission>;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  tab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  onBack: () => void;
  menuItems?: MenuSeedItem[];
} & (
  | { mode: 'create'; role?: undefined; onCreated: (roleId: string) => void }
  | { mode: 'edit'; role: SysRole; onCreated?: undefined }
);

function RoleDetail(props: RoleDetailProps) {
  const { mode, role, store, addToast, tab, onTabChange, onBack, menuItems } = props;
  const { roles, assignments, users, orgs, can, previewReadOnly, principal, tenantKind, mappedRole } = store;
  const [membershipVersion, bump] = useState(0);
  useEffect(() => subscribeTenantMemberships(() => bump((x) => x + 1)), []);

  const isCreate = mode === 'create';
  const tenantRootId = principal.realm === 'TENANT' ? principal.tenantId : 'org-platform';
  const currentTenantKind: 'pharma' | 'provider' = tenantKind === 'provider' ? 'provider' : 'pharma';
  const isPharmaTenant = currentTenantKind === 'pharma';
  const isPreset = !isCreate && role.kind === 'preset';
  const canEdit = isCreate
    ? can('roles', 'create') && !previewReadOnly
    : can('roles', 'edit') && !previewReadOnly && !isPreset;
  const canManageMembers = !isCreate && can('roles', 'edit') && !previewReadOnly;

  const baseDraft = useMemo<Draft>(
    () => (isCreate ? makeEmptyDraft(mappedRole.fieldPolicies) : makeDraft(role)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isCreate, role?.id, role?.version, role?.name, role?.description, role?.pagePerms, role?.fieldPolicies],
  );

  const [draft, setDraft] = useState<Draft>(baseDraft);
  const [profileModal, setProfileModal] = useState<{ name: string; description: string; error: string } | null>(null);
  const createNameInputRef = useRef<HTMLInputElement>(null);
  const [permQuery, setPermQuery] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberStatus, setMemberStatus] = useState<'effective' | 'all' | ResolvedGrantStatus>('effective');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    setDraft(baseDraft);
    setProfileModal(null);
    setPermQuery('');
    setMemberQuery('');
    setMemberStatus('effective');
    setProfileError('');
  }, [baseDraft, isCreate]);

  const groups = useMemo(
    () => buildNavGroups(menuItems, currentTenantKind),
    [menuItems, currentTenantKind],
  );
  const menuLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of (menuItems ?? seedMenuItems())) {
      if (m.type === 'page' && m.pageId && !map.has(m.pageId)) map.set(m.pageId, m.name);
    }
    return map;
  }, [menuItems]);

  const perms = canEdit ? draft.pagePerms : (role?.pagePerms ?? {});
  const fields = canEdit ? draft.fieldPolicies : (role?.fieldPolicies ?? {});
  const dirty = useMemo(
    () => (canEdit ? hasDraftChanges(baseDraft, draft, groups) : false),
    [canEdit, baseDraft, draft, groups],
  );

  const stats = useMemo(() => {
    let open = 0;
    let acts = 0;
    let risk = 0;
    let total = 0;
    for (const g of groups) {
      for (const p of g.pages) {
        total += 1;
        const ks = perms[p.id] ?? [];
        if (ks.length === 0) continue;
        open += 1;
        for (const k of ks) {
          if (k === 'view') continue;
          acts += 1;
          if (p.actions.find((a) => a.key === k)?.risk) risk += 1;
        }
      }
    }
    return { open, acts, risk, total };
  }, [groups, perms]);

  const today = localTodayIso();

  const roleAssignments = useMemo(
    () => (isCreate ? [] : assignments.filter((a) => a.roleId === role.id && a.tenantId === tenantRootId)),
    [isCreate, assignments, role?.id, tenantRootId],
  );

  const statusCounts = useMemo(() => {
    let active = 0;
    let pending = 0;
    let expired = 0;
    let revoked = 0;
    for (const a of roleAssignments) {
      const st = resolveGrantStatus(a, today);
      if (st === 'active') active += 1;
      else if (st === 'pending') pending += 1;
      else if (st === 'expired') expired += 1;
      else revoked += 1;
    }
    return { active, pending, expired, revoked };
  }, [roleAssignments, today]);

  const tenantMemberships = useMemo(
    () => membershipsOfTenant(tenantRootId).filter((m) => membershipActive(m)),
    [tenantRootId, membershipVersion],
  );
  const tenantDepts = useMemo(
    () => orgs.filter((o) => o.type === 'department' && enterpriseRootOf(orgs, o.id)?.id === tenantRootId),
    [orgs, tenantRootId],
  );
  const memberName = (userId: string) => users.find((u) => u.id === userId)?.name ?? userId;
  const memberPhone = (userId: string) => users.find((u) => u.id === userId)?.phone ?? '';
  const deptNameOf = (userId: string) => {
    const m = membershipOfUserInTenant(userId, tenantRootId);
    return orgs.find((o) => o.id === m?.orgUnitId)?.name ?? '未分配';
  };

  /* 弹窗状态 */
  interface GrantForm {
    userIds: string[];
    keyword: string;
    deptFilter: string;
    scopeMode: 'inherit_org' | 'custom';
    bizScopes: BizScopeItem[];
    error: string;
  }
  interface AdjustForm {
    assignmentId: string;
    scopeMode: 'inherit_org' | 'custom';
    bizScopes: BizScopeItem[];
    reason: string;
    error: string;
  }
  const [grantForm, setGrantForm] = useState<GrantForm | null>(null);
  const [adjustForm, setAdjustForm] = useState<AdjustForm | null>(null);
  const [revokeForm, setRevokeForm] = useState<{ assignmentId: string; error: string } | null>(null);

  /* ── 权限编辑 ── */
  function togglePage(page: ResourcePage, checked: boolean) {
    setDraft((prev) => {
      const next = { ...prev.pagePerms };
      if (checked) next[page.id] = page.actions.map((a) => a.key);
      else delete next[page.id];
      return { ...prev, pagePerms: next };
    });
  }

  function toggleAction(page: ResourcePage, action: PageAction, checked: boolean) {
    setDraft((prev) => {
      const next = { ...prev.pagePerms };
      const current = new Set<string>(next[page.id] ?? []);
      if (action === 'view' && !checked) {
        delete next[page.id];
      } else if (checked) {
        current.add('view');
        current.add(action);
        next[page.id] = page.actions.map((a) => a.key).filter((k) => current.has(k));
      } else {
        current.delete(action);
        if (current.size === 0) delete next[page.id];
        else next[page.id] = page.actions.map((a) => a.key).filter((k) => current.has(k));
      }
      return { ...prev, pagePerms: next };
    });
  }

  function toggleGroup(group: NavGroup, checked: boolean) {
    setDraft((prev) => {
      const next = { ...prev.pagePerms };
      for (const p of group.pages) {
        if (checked) next[p.id] = p.actions.map((a) => a.key);
        else delete next[p.id];
      }
      return { ...prev, pagePerms: next };
    });
  }

  function selectAllPages() {
    setDraft((prev) => ({
      ...prev,
      pagePerms: Object.fromEntries(groups.flatMap((g) => g.pages).map((p) => [p.id, p.actions.map((a) => a.key)])),
    }));
  }

  function confirmClearAllPages() {
    setDraft((prev) => ({ ...prev, pagePerms: { dashboard: ['view'] } }));
    setConfirmClearOpen(false);
  }

  /* ── 角色名称与说明编辑弹窗（仅编辑已有角色） ── */
  function openProfileModal() {
    setProfileModal({
      name: draft.name,
      description: draft.description,
      error: '',
    });
  }

  function submitProfileModal() {
    if (!profileModal || isCreate) return;
    const trimmedName = profileModal.name.trim();
    if (!trimmedName) {
      setProfileModal({ ...profileModal, error: '请填写角色名称' });
      return;
    }
    if (roles.some((x) => x.id !== role.id && x.realm === role.realm && x.name === trimmedName && (x.kind === 'preset' || x.tenantId === role.tenantId))) {
      setProfileModal({ ...profileModal, error: '本企业内角色名称必须唯一（含预置角色）' });
      return;
    }
    setDraft((prev) => ({
      ...prev,
      name: trimmedName,
      description: profileModal.description.trim(),
    }));
    setProfileError('');
    setProfileModal(null);
  }

  /* ── 保存（新建 / 编辑统一入口） ── */
  function handleSave() {
    if (!canEdit) return;
    const name = draft.name.trim();
    if (!name) {
      setProfileError('请填写角色名称');
      if (isCreate) {
        createNameInputRef.current?.focus();
      } else {
        setProfileModal({ name: draft.name, description: draft.description, error: '请填写角色名称' });
      }
      return;
    }

    if (isCreate) {
      const r = store.createRole({
        name,
        description: draft.description.trim(),
        defaultScope: isPharmaTenant ? 'PHARMA' : 'PROVIDER',
        pagePerms: draft.pagePerms,
        fieldPolicies: draft.fieldPolicies,
        status: 'enabled',
      });
      if (!r.ok || !r.role) {
        setProfileError(r.error ?? '保存失败');
        createNameInputRef.current?.focus();
        return;
      }
      setProfileError('');
      addToast({
        type: 'success',
        title: '角色已保存并启用',
        description: `「${name}」已创建并启用，可直接授予成员。`,
      });
      props.onCreated(r.role.id);
      return;
    }

    if (roles.some((x) => x.id !== role.id && x.realm === role.realm && x.name === name && (x.kind === 'preset' || x.tenantId === role.tenantId))) {
      const msg = '本企业内角色名称必须唯一（含预置角色）';
      setProfileError(msg);
      setProfileModal({ name: draft.name, description: draft.description, error: msg });
      return;
    }
    setProfileError('');
    const summary = buildEditSummary(baseDraft, draft, groups);
    const r = store.updateRole(
      role.id,
      {
        name,
        description: draft.description.trim(),
        pagePerms: draft.pagePerms,
        fieldPolicies: draft.fieldPolicies,
      },
      summary,
    );
    if (!r.ok) {
      addToast({ type: 'error', title: '保存失败', description: r.error });
      return;
    }
    setProfileModal(null);
    addToast({
      type: 'success',
      title: '已保存',
      description: normalizeRoleStatus(role.status) === 'enabled'
        ? `「${name}」的配置已更新并生效。`
        : `「${name}」的配置已更新（当前为停用状态，可在列表中手动启用）。`,
    });
  }

  function handleBack() {
    if (dirty) {
      setConfirmLeave(true);
      return;
    }
    onBack();
  }

  /* ── 成员表渲染数据 ── */
  const activeHolderIds = useMemo(
    () => new Set(roleAssignments.filter((a) => isGrantActiveOrPending(a, today)).map((a) => a.userId)),
    [roleAssignments, today],
  );

  const memberRows = useMemo(() => {
    const order: Record<ResolvedGrantStatus, number> = { active: 0, pending: 1, expired: 2, revoked: 3 };
    const kw = memberQuery.trim();
    return roleAssignments
      .map((a) => ({ assignment: a, resolvedStatus: resolveGrantStatus(a, today) }))
      .filter(({ resolvedStatus }) => {
        if (memberStatus === 'all') return true;
        if (memberStatus === 'effective') return resolvedStatus === 'active' || resolvedStatus === 'pending';
        return resolvedStatus === memberStatus;
      })
      .filter(({ assignment: a }) => {
        if (!kw) return true;
        const name = memberName(a.userId);
        const phone = memberPhone(a.userId);
        const dept = deptNameOf(a.userId);
        return name.includes(kw) || phone.includes(kw) || dept.includes(kw);
      })
      .sort(
        (x, y) =>
          order[x.resolvedStatus] - order[y.resolvedStatus] ||
          memberName(x.assignment.userId).localeCompare(memberName(y.assignment.userId), 'zh'),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleAssignments, memberStatus, memberQuery, users, orgs, tenantRootId, today]);

  const bizScopeText = (a: (typeof roleAssignments)[number]) => {
    if (a.bizScopeMode === 'inherit_org') return `继承部门（${deptNameOf(a.userId)}）`;
    if (a.bizScopeMode === 'custom') return `个人指定 ${(a.bizScopes ?? []).length} 家药厂`;
    if (a.pharmaTenantIds?.length) return `承接 ${a.pharmaTenantIds.length} 家药厂${a.varietyNames?.length ? ` · ${a.varietyNames.length} 品种` : ''}`;
    return '全服务商（管理员）';
  };

  /* ── 授予成员（支持预选，用于历史记录「重新授予」） ── */
  function openGrant(preselectUserIds: string[] = []) {
    setGrantForm({
      userIds: preselectUserIds,
      keyword: '',
      deptFilter: '',
      scopeMode: 'inherit_org',
      bizScopes: [],
      error: '',
    });
  }

  function submitGrant() {
    if (!grantForm || isCreate) return;
    const form = grantForm;
    if (form.userIds.length === 0) {
      setGrantForm({ ...form, error: '请至少勾选一名成员' });
      return;
    }
    if (!isPharmaTenant && form.scopeMode === 'custom') {
      if (form.bizScopes.length === 0) {
        setGrantForm({ ...form, error: '个人指定业务范围至少选择一家药厂' });
        return;
      }
      const errors = validateBizScopes(form.bizScopes, tenantRootId);
      if (errors.length > 0) {
        setGrantForm({ ...form, error: errors[0] });
        return;
      }
    }
    const r = store.batchGrantRole({
      userIds: form.userIds,
      roleId: role.id,
      effectiveFrom: localTodayIso(),
      scopeMode: 'dynamic',
      ...(isPharmaTenant
        ? {}
        : { bizScopeMode: form.scopeMode, ...(form.scopeMode === 'custom' ? { bizScopes: form.bizScopes } : {}) }),
    });
    const failed = r.failed ?? [];
    if (failed.length === form.userIds.length) {
      setGrantForm({ ...form, error: failed.map((f) => `${f.name}：${f.error}`).join('；') });
      return;
    }
    addToast({
      type: 'success',
      title: `已授予 ${form.userIds.length - failed.length} 名成员`,
      description: failed.length > 0
        ? `部分失败：${failed.map((f) => `${f.name}（${f.error}）`).join('；')}`
        : '已立即生效并写入审计日志。',
    });
    setGrantForm(null);
    onTabChange('members');
  }

  /* ── 调整范围（仅服务商侧） ── */
  function openAdjust(assignmentId: string) {
    const a = assignments.find((x) => x.id === assignmentId);
    if (!a) return;
    setAdjustForm({
      assignmentId,
      scopeMode: a.bizScopeMode ?? 'inherit_org',
      bizScopes: a.bizScopes ? a.bizScopes.map((s) => ({ ...s })) : [],
      reason: '',
      error: '',
    });
  }

  function submitAdjust() {
    if (!adjustForm) return;
    const form = adjustForm;
    if (!form.reason.trim()) {
      setAdjustForm({ ...form, error: '请填写调整原因（随审计保留）' });
      return;
    }
    if (!isPharmaTenant && form.scopeMode === 'custom') {
      if (form.bizScopes.length === 0) {
        setAdjustForm({ ...form, error: '个人指定业务范围至少选择一家药厂' });
        return;
      }
      const errors = validateBizScopes(form.bizScopes, tenantRootId);
      if (errors.length > 0) {
        setAdjustForm({ ...form, error: errors[0] });
        return;
      }
    }
    // 不提交 extraOrgIds，由写入层原样保留存量例外值
    const r = store.updateAssignmentScope(form.assignmentId, {
      reason: form.reason.trim(),
      scopeMode: 'dynamic',
      ...(isPharmaTenant
        ? {}
        : { bizScopeMode: form.scopeMode, ...(form.scopeMode === 'custom' ? { bizScopes: form.bizScopes } : {}) }),
    });
    if (!r.ok) {
      setAdjustForm({ ...form, error: r.error ?? '调整失败' });
      return;
    }
    addToast({ type: 'success', title: '授权范围已调整', description: '已保存并写入审计日志。' });
    setAdjustForm(null);
  }

  /* ── 移除成员授权 ── */
  function submitRevoke() {
    if (!revokeForm) return;
    const r = store.revokeAssignment(revokeForm.assignmentId);
    if (!r.ok) {
      setRevokeForm({ ...revokeForm, error: r.error ?? '移除失败' });
      return;
    }
    addToast({ type: 'success', title: '已移除成员授权', description: '历史记录保留在「已移除」筛选中，随时可重新授予。' });
    setRevokeForm(null);
  }

  /* ── 头部与页签 ── */
  const shownName = isCreate
    ? (draft.name.trim() || '新建角色')
    : (canEdit && draft.name.trim() ? draft.name.trim() : role.name);
  const shownDesc = isCreate
    ? draft.description.trim()
    : (canEdit ? draft.description.trim() : role.description);

  const isRoleEnabled = !isCreate && normalizeRoleStatus(role.status) === 'enabled';

  const note = isPreset && tab === 'perm'
    ? { tone: 'neutral' as const, icon: <Lock size={14} aria-hidden />, text: '系统预置角色为只读模板，不可修改权限、停用或删除；可在「已授权成员」页签管理成员。' }
    : !isCreate && !isRoleEnabled
      ? { tone: 'neutral' as const, icon: <Ban size={14} aria-hidden />, text: '该角色当前处于停用状态，保存配置不会自动启用；如需启用请在角色列表中操作。' }
      : null;

  const showSaveButton = canEdit && (isCreate || tab !== 'members' || dirty);

  const actions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {isCreate ? (
        <Button variant="outline" size="md" onClick={handleBack}>
          取消
        </Button>
      ) : (
        <Button variant="ghost" size="md" icon={<ArrowLeft size={14} />} onClick={handleBack}>
          返回列表
        </Button>
      )}
      {showSaveButton && (
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={!isCreate && !dirty}
        >
          {!isCreate && tab === 'members' ? '保存权限改动' : '保存'}
        </Button>
      )}
    </div>
  );

  const headerTabs = isCreate
    ? [
        { id: 'perm', label: '权限' },
        { id: 'fields', label: '敏感字段' },
      ]
    : [
        { id: 'perm', label: '权限', dot: dirty },
        { id: 'fields', label: '敏感字段' },
        { id: 'members', label: '已授权成员', count: statusCounts.active + statusCounts.pending },
      ];

  /* ── 权限树渲染 ── */
  function permTrail(g: NavGroup, q: string): ReactNode {
    const editable = canEdit;
    const matching = q
      ? g.pages.filter((p) => pageLabelOf(p, menuLabels).includes(q) || p.actions.some((a) => a.label.includes(q)))
      : editable
        ? g.pages
        : g.pages.filter((p) => (perms[p.id]?.length ?? 0) > 0);
    if (g.solo) {
      const p = g.pages[0];
      if (!matching.some((x) => x.id === p.id)) return null;
      return pageRow(p, g.iconKey);
    }
    if (matching.length === 0) return null;
    const openCount = g.pages.filter((p) => (perms[p.id]?.length ?? 0) > 0).length;
    const fullCount = g.pages.filter((p) => p.actions.length > 0 && p.actions.length === (perms[p.id]?.length ?? 0)).length;
    const all = fullCount === g.pages.length;
    return (
      <div key={g.key}>
        <div className="rd-group">
          {editable ? (
            <TriCheckbox
              checked={all}
              indeterminate={editable && openCount > 0 && !all}
              onChange={(next) => toggleGroup(g, next)}
              label={`全选「${g.name}」下的所有页面与操作`}
            />
          ) : (
            <span aria-hidden />
          )}
          <span className="rd-group-name">
            <NavIcon iconKey={g.iconKey} />
            {g.name}
            {g.other && <span className="rd-card-sub">不在左侧菜单中</span>}
          </span>
          <span className="rd-group-count">
            {editable ? <><b>{fullCount}</b> / {g.pages.length} 已全选</> : <><b>{openCount}</b> / {g.pages.length}</>}
          </span>
        </div>
        <div>{matching.map((p) => pageRow(p, undefined))}</div>
      </div>
    );
  }

  function pageRow(p: ResourcePage, soloIcon?: string): ReactNode {
    const ks = perms[p.id] ?? [];
    const label = pageLabelOf(p, menuLabels);
    const editable = canEdit;
    const granted = p.actions.filter((a) => ks.includes(a.key) && a.key !== 'view');
    let actsNode: ReactNode;
    if (editable) {
      const buttons = p.actions.filter((a) => a.key !== 'view');
      actsNode = buttons.length > 0 ? buttons.map((a) => (
        <button
          key={a.key}
          type="button"
          className={a.risk ? 'rd-act rd-act--risk' : 'rd-act'}
          aria-pressed={ks.includes(a.key)}
          onClick={() => toggleAction(p, a.key, !ks.includes(a.key))}
          title={a.risk ? `高危操作：${a.label}` : a.label}
        >
          <span className="rd-act-on"><Check size={13} aria-hidden /></span>
          {a.risk
            ? <span className="rd-act-off"><TriangleAlert size={13} aria-hidden /></span>
            : <span className="rd-act-off" />}
          {a.label}
        </button>
      )) : (
        <span className="rd-row-void">{ks.length > 0 ? '仅查看' : ''}</span>
      );
    } else if (ks.length === 0) {
      actsNode = <span className="rd-tag rd-tag--muted">未开放</span>;
    } else if (granted.length === 0) {
      actsNode = (
        <span className="rd-tag rd-tag--muted">
          {p.actions.length === 1 ? p.actions[0].label : '仅查看'}
        </span>
      );
    } else {
      actsNode = granted.map((a) => (
        <span key={a.key} className={a.risk ? 'rd-tag rd-tag--risk' : 'rd-tag'}>
          {a.risk && <TriangleAlert size={12} aria-hidden />}
          {a.label}
        </span>
      ));
    }
    return (
      <div key={p.id} className={soloIcon ? 'rd-row rd-row-solo' : 'rd-row'}>
        {editable ? (
          <label className="rd-row-cb">
            <input
              type="checkbox"
              className="rd-cb"
              checked={ks.length > 0}
              onChange={(e) => togglePage(p, e.target.checked)}
              aria-label={`访问「${label}」`}
            />
          </label>
        ) : (
          <span className={`rd-row-cb rd-readonly-mark ${ks.length > 0 ? 'rd-readonly-mark--on' : 'rd-readonly-mark--off'}`} role="img" aria-label={ks.length > 0 ? '已开放' : '未开放'}>
            {ks.length > 0 ? <CircleCheck size={16} aria-hidden /> : <CircleDashed size={16} aria-hidden />}
          </span>
        )}
        {soloIcon && <span className="rd-row-icon"><NavIcon iconKey={soloIcon} /></span>}
        <span className="rd-row-name" title={p.description}>{label}</span>
        <div className="rd-row-acts">{actsNode}</div>
      </div>
    );
  }

  const permBody = (() => {
    const q = permQuery.trim();
    const denied: ResourcePage[] = [];
    const elements: ReactNode[] = [];
    const groupElements: ReactNode[] = [];
    for (const g of groups) {
      if (canEdit) {
        const node = permTrail(g, q);
        if (node) groupElements.push(node);
      } else {
        const openPages = g.pages.filter((p) => (perms[p.id]?.length ?? 0) > 0);
        if (!q) denied.push(...g.pages.filter((p) => !openPages.includes(p)));
        const node = permTrail(g, q);
        if (node) groupElements.push(node);
      }
    }
    if (groupElements.length === 0) {
      elements.push(
        <div key="empty" className="rd-empty" style={{ padding: '36px 16px', textAlign: 'center' }}>
          <Search size={30} aria-hidden style={{ color: 'var(--color-text-3)' }} />
          <div style={{ marginTop: 10, fontSize: 'var(--fs-14)', fontWeight: 600 }}>没有匹配的页面或操作</div>
          <p className="rd-hint" style={{ margin: '6px auto 0', maxWidth: 420 }}>
            换个关键词试试，例如页面名称「任务执行」或操作名称「导出」。
          </p>
        </div>,
      );
    } else {
      elements.push(...groupElements);
    }
    if (!canEdit && denied.length > 0 && !q) {
      elements.push(
        <details key="denied" className="rd-denied">
          <summary>
            <ChevronRight size={14} aria-hidden />
            未开放 {denied.length} 个页面
            <span className="rd-hint">展开查看</span>
          </summary>
          <div className="rd-denied-list">
            {denied.map((p) => (
              <span key={p.id} className="rd-tag rd-tag--muted">{pageLabelOf(p, menuLabels)}</span>
            ))}
          </div>
        </details>,
      );
    }
    return elements;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title={isCreate ? '新建角色' : shownName}
        badges={
          isCreate ? undefined : (
            <>
              {isPreset && <span className="rd-preset-badge">预置</span>}
              <StatusPill status={role.status} />
              {canEdit && (
                <button
                  type="button"
                  className="rd-edit-name-btn"
                  onClick={openProfileModal}
                  title="编辑角色名称与说明"
                  aria-label="编辑角色名称与说明"
                >
                  <Pencil size={12} aria-hidden />
                  <span>编辑名称</span>
                </button>
              )}
            </>
          )
        }
        description={isCreate ? undefined : (shownDesc || undefined)}
        subHeader={
          isCreate && canEdit ? (
            <div className="rd-create-bar">
              <label className="rd-field">
                <span className="rd-field-label">角色名称<span className="rd-required" aria-hidden="true">*</span></span>
                <input
                  ref={createNameInputRef}
                  value={draft.name}
                  onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setProfileError(''); }}
                  style={inputStyle}
                  placeholder="例如：区域销售经理 / 合规审核员"
                  aria-invalid={Boolean(profileError)}
                  autoFocus
                />
                {profileError && <span className="rd-err" role="alert"><CircleAlert size={14} aria-hidden />{profileError}</span>}
              </label>
              <label className="rd-field">
                <span className="rd-field-label">角色说明</span>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  style={inputStyle}
                  placeholder="简述这个角色的职责边界（选填）"
                />
              </label>
            </div>
          ) : undefined
        }
        tabs={headerTabs}
        activeTab={tab}
        onTabChange={(id) => onTabChange(id as DetailTab)}
        actions={actions}
        wrapTitle
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 24px 24px' }}>
          {note && (
            <div className={`rd-note rd-note--${note.tone}`}>
              {note.icon}
              <span>{note.text}</span>
            </div>
          )}

          {tab === 'perm' && (
            <section className="rd-card" aria-labelledby="rd-h-perm">
              <div className="rd-card-head">
                <div className="rd-card-title">
                  <h2 id="rd-h-perm">页面与操作</h2>
                  <span className="rd-card-sub">
                    已开放 <b>{stats.open}</b> / {stats.total} 个页面，可执行 <b>{stats.acts}</b> 项操作
                    {stats.risk > 0 ? <>，其中 <b>{stats.risk}</b> 项为高危</> : '，无高危操作'}
                  </span>
                </div>
                <div className="rd-card-tools">
                  <div className="rd-search">
                    <Search size={13} aria-hidden />
                    <input
                      value={permQuery}
                      onChange={(e) => setPermQuery(e.target.value)}
                      placeholder="搜索页面或操作"
                      aria-label="搜索页面或操作"
                    />
                  </div>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="sm" onClick={selectAllPages}>全选</Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmClearOpen(true)}>清空全部权限</Button>
                    </>
                  )}
                </div>
              </div>
              <div className="rd-legend">
                <span>
                  {canEdit
                    ? '勾选页面即「查看页面」；勾选任一操作会自动包含查看'
                    : '标签为该角色可执行的操作；未列出的操作不可用'}
                </span>
                <span>
                  <span className="rd-risk-note"><TriangleAlert size={13} aria-hidden />高危操作</span>
                  将重点记录审计日志
                </span>
              </div>
              {permBody}
            </section>
          )}

          {tab === 'fields' && (
            <section className="rd-card" aria-labelledby="rd-h-field">
              <div className="rd-card-head">
                <div className="rd-card-title">
                  <h2 id="rd-h-field">敏感字段</h2>
                  <span className="rd-card-sub">持有该角色的成员在这些字段上看到的内容；同时持有多个角色时从严生效</span>
                </div>
                <span className="rd-card-sub">{fieldSummary(fields)}</span>
              </div>
              <div className="rd-sfield rd-sfield-head" aria-hidden="true">
                <span>字段</span>
                <span>成员看到的内容</span>
                <span>策略</span>
              </div>
              {SENSITIVE_FIELDS.map((f) => {
                const policy = fields[f.key] ?? 'visible';
                const shown = policy === 'visible' ? '原样显示' : policy === 'mask' ? f.maskExample : '不显示该字段';
                return (
                  <div key={f.key} className="rd-sfield">
                    <div>
                      <div className="rd-sfield-name">{f.name}</div>
                      <div className="rd-sfield-desc">{f.description}</div>
                    </div>
                    <div className="rd-sfield-view">
                      <span className="rd-hint">成员看到</span>
                      <code>{shown}</code>
                    </div>
                    <div>
                      {canEdit ? (
                        <div className="rd-seg" role="group" aria-label={`${f.name} 的显示策略`}>
                          {(['visible', 'mask', 'hidden'] as FieldPolicyKind[]).map((k) => (
                            <button
                              key={k}
                              type="button"
                              aria-pressed={policy === k}
                              onClick={() => setDraft({ ...draft, fieldPolicies: { ...draft.fieldPolicies, [f.key]: k } })}
                            >
                              {fieldPolicyLabel(k)}
                            </button>
                          ))}
                        </div>
                      ) : policy === 'visible' ? (
                        <span className="rd-hint">可见</span>
                      ) : (
                        <span className={`rd-pill ${policy === 'mask' ? 'rd-pill--brand' : 'rd-pill--neutral'}`}>
                          {policy === 'mask' ? <Eye size={13} aria-hidden /> : <Lock size={13} aria-hidden />}
                          {fieldPolicyLabel(policy)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {tab === 'members' && !isCreate && (
            <section className="rd-card" aria-labelledby="rd-h-members">
              <div className="rd-card-head">
                <div className="rd-card-title">
                  <h2 id="rd-h-members">已授权成员</h2>
                  <span className="rd-card-sub">
                    生效 {statusCounts.active} 人
                    {statusCounts.revoked > 0 ? ` · 已移除 ${statusCounts.revoked}` : ''}
                  </span>
                </div>
                <div className="rd-card-tools">
                  <div className="rd-search">
                    <Search size={13} aria-hidden />
                    <input
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      placeholder="搜索姓名 / 手机号 / 部门"
                      aria-label="搜索成员"
                    />
                  </div>
                  <select
                    value={memberStatus}
                    onChange={(e) => setMemberStatus(e.target.value as 'effective' | 'all' | ResolvedGrantStatus)}
                    aria-label="按授权状态筛选"
                    data-active={memberStatus !== 'effective'}
                    style={{
                      height: 32,
                      minWidth: 104,
                      padding: '0 8px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 6,
                      background: '#FFFFFF',
                      fontFamily: 'inherit',
                      fontSize: 'var(--fs-13)',
                      color: 'var(--color-text-1)',
                      fontWeight: memberStatus !== 'effective' ? 500 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    <option value="effective">生效中</option>
                    <option value="revoked">已移除</option>
                    <option value="all">全部记录</option>
                  </select>
                  {canManageMembers && isRoleEnabled && (
                    <Button variant="primary" size="sm" icon={<UserPlus size={13} />} onClick={() => openGrant()}>
                      授予成员
                    </Button>
                  )}
                </div>
              </div>

              {memberRows.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={memberQuery || memberStatus !== 'effective' ? '没有符合条件的成员' : '当前没有生效成员'}
                  description={
                    memberQuery || memberStatus !== 'effective'
                      ? '换个关键词，或切换状态筛选。'
                      : isRoleEnabled
                        ? '点击右上角「授予成员」将此角色授予企业成员。'
                        : '角色已停用，启用后才能新增授予。'
                  }
                  action={(memberQuery || memberStatus !== 'effective') ? {
                    label: '回到生效中',
                    onClick: () => { setMemberQuery(''); setMemberStatus('effective'); },
                  } : undefined}
                />
              ) : (
                <div className="rd-tbl-wrap">
                  <table className="rd-tbl">
                    <thead>
                      <tr>
                        {(isPharmaTenant
                          ? ['成员', '手机号', '部门', '状态', '操作']
                          : ['成员', '手机号', '部门', '业务范围', '状态', '操作']
                        ).map((h) => (
                          <th key={h} scope="col" className={h === '操作' ? 'rd-num' : undefined}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {memberRows.map(({ assignment: a, resolvedStatus }) => {
                        const operable = resolvedStatus === 'active';
                        const canRegrant = !operable && canManageMembers && isRoleEnabled && !activeHolderIds.has(a.userId);
                        return (
                          <tr key={a.id} className={operable ? undefined : 'rd-row-dim'}>
                            <td><b>{memberName(a.userId)}</b></td>
                            <td className="font-mono-nums">{memberPhone(a.userId) || '—'}</td>
                            <td>{deptNameOf(a.userId)}</td>
                            {!isPharmaTenant && <td>{bizScopeText(a)}</td>}
                            <td><GrantPill status={resolvedStatus} /></td>
                            <td>
                              <div className="rd-ops">
                                {operable && canManageMembers && (
                                  <>
                                    {!isPharmaTenant && (
                                      <Button variant="soft" size="sm" onClick={() => openAdjust(a.id)}>
                                        调整范围
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      style={{ color: 'var(--color-button-danger-hover)' }}
                                      onClick={() => setRevokeForm({ assignmentId: a.id, error: '' })}
                                    >
                                      移除
                                    </Button>
                                  </>
                                )}
                                {canRegrant && (
                                  <Button variant="ghost" size="sm" onClick={() => openGrant([a.userId])}>
                                    重新授予
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
              )}
            </section>
          )}
        </div>
      </div>

      {/* 授予成员弹窗（紧凑单栏选人 + 已选胶囊 + 生效期分区卡） */}
      {grantForm && !isCreate && (
        <Modal
          open
          title={`授予成员 · ${shownName}`}
          onClose={() => setGrantForm(null)}
          width={!isPharmaTenant && grantForm.scopeMode === 'custom' ? 700 : 620}
          footer={
            <>
              {grantForm.error ? (
                <span className="rd-err" role="alert" style={{ marginRight: 'auto' }}>
                  <CircleAlert size={14} aria-hidden />{grantForm.error}
                </span>
              ) : (
                <span className="rd-footer-meta">
                  {grantForm.userIds.length > 0
                    ? `已选 ${grantForm.userIds.length} 人，授予后立即生效`
                    : `共 ${tenantMemberships.length} 名企业成员可选`}
                </span>
              )}
              <Button variant="outline" onClick={() => setGrantForm(null)}>取消</Button>
              <Button variant="primary" onClick={submitGrant} disabled={grantForm.userIds.length === 0}>
                确认授予{grantForm.userIds.length > 0 ? ` (${grantForm.userIds.length})` : ''}
              </Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 14 }}>
            {(() => {
              const candidates = tenantMemberships.filter((m) => {
                const name = memberName(m.userId);
                const phone = memberPhone(m.userId);
                const dept = orgs.find((o) => o.id === m.orgUnitId)?.name ?? '';
                if (grantForm.deptFilter && m.orgUnitId !== grantForm.deptFilter) return false;
                const kw = grantForm.keyword.trim();
                if (kw && !name.includes(kw) && !phone.includes(kw) && !dept.includes(kw)) return false;
                return true;
              });
              return (
                <section className="rd-picker-single" aria-label="选择成员">
                  <div className="rd-picker-bar">
                    <div className="rd-search">
                      <Search size={13} aria-hidden />
                      <input
                        value={grantForm.keyword}
                        onChange={(e) => setGrantForm({ ...grantForm, keyword: e.target.value })}
                        placeholder="搜索姓名 / 手机号 / 部门"
                        aria-label="搜索成员"
                      />
                    </div>
                    <select
                      value={grantForm.deptFilter}
                      onChange={(e) => setGrantForm({ ...grantForm, deptFilter: e.target.value })}
                      aria-label="按部门筛选"
                    >
                      <option value="">全部部门</option>
                      {tenantDepts.map((o) => (
                        <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>
                      ))}
                    </select>
                  </div>

                  {grantForm.userIds.length > 0 && (
                    <div className="rd-selected-bar" aria-label="已选成员">
                      {grantForm.userIds.map((id) => (
                        <span key={id} className="rd-selected-chip">
                          {memberName(id)}
                          <button
                            type="button"
                            aria-label={`移除 ${memberName(id)}`}
                            onClick={() => setGrantForm({ ...grantForm, userIds: grantForm.userIds.filter((x) => x !== id) })}
                          >
                            <X size={12} aria-hidden />
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        className="rd-selected-clear"
                        onClick={() => setGrantForm({ ...grantForm, userIds: [] })}
                      >
                        清空
                      </button>
                    </div>
                  )}

                  <ul className="rd-plist-compact">
                    {candidates.length === 0 ? (
                      <li className="rd-slist-empty">没有匹配的成员</li>
                    ) : candidates.map((m) => {
                      const name = memberName(m.userId);
                      const phone = memberPhone(m.userId);
                      const has = activeHolderIds.has(m.userId);
                      const on = grantForm.userIds.includes(m.userId);
                      return (
                        <li key={m.id}>
                          <label className="rd-pitem-compact">
                            <input
                              type="checkbox"
                              className="rd-cb"
                              checked={on}
                              disabled={has}
                              onChange={(e) => setGrantForm({
                                ...grantForm,
                                error: '',
                                userIds: e.target.checked
                                  ? [...grantForm.userIds, m.userId]
                                  : grantForm.userIds.filter((x) => x !== m.userId),
                              })}
                            />
                            <span className="rd-pitem-main">
                              <b>{name}</b>
                              <span>{orgs.find((o) => o.id === m.orgUnitId)?.name ?? '未分配'}</span>
                            </span>
                            <span className="rd-pitem-right">
                              {has ? (
                                <span className="rd-pill rd-pill--neutral">已持有</span>
                              ) : (
                                <span className="font-mono-nums">{phone || '—'}</span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })()}

            {!isPharmaTenant && (
              <div className="rd-form-grid">
                <div className="rd-field rd-span2">
                  <span className="rd-field-label">业务范围</span>
                  <div className="rd-choice">
                    <label>
                      <input
                        type="radio"
                        name="rd-grant-scope"
                        checked={grantForm.scopeMode === 'inherit_org'}
                        onChange={() => setGrantForm({ ...grantForm, scopeMode: 'inherit_org', error: '' })}
                      />
                      <span>
                        <b>继承所属部门的业务范围</b>
                        <span>批量授予时，按各成员主属部门配置的药厂与品种分别继承</span>
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="rd-grant-scope"
                        checked={grantForm.scopeMode === 'custom'}
                        onChange={() => setGrantForm({ ...grantForm, scopeMode: 'custom', error: '' })}
                      />
                      <span>
                        <b>个人指定（只收窄不扩大）</b>
                        <span>在药厂授权给本服务商的范围内，按药厂 → 品种 → 区域收窄</span>
                      </span>
                    </label>
                  </div>
                  {grantForm.scopeMode === 'custom' && (
                    <BizScopeEditor
                      providerTenantId={tenantRootId}
                      value={grantForm.bizScopes}
                      onChange={(bizScopes) => setGrantForm({ ...grantForm, bizScopes, error: '' })}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* 调整有效期 / 调整范围弹窗 */}
      {adjustForm && (() => {
        const a = assignments.find((x) => x.id === adjustForm.assignmentId);
        if (!a) return null;
        const uName = memberName(a.userId);
        return (
          <Modal
            open
            title={`${isPharmaTenant ? '调整有效期' : '调整范围'} · ${uName}`}
            onClose={() => setAdjustForm(null)}
            width={720}
            footer={
              <>
                {adjustForm.error && (
                  <span className="rd-err" role="alert" style={{ marginRight: 'auto' }}>
                    <CircleAlert size={14} aria-hidden />{adjustForm.error}
                  </span>
                )}
                <Button variant="outline" onClick={() => setAdjustForm(null)}>取消</Button>
                <Button variant="primary" onClick={submitAdjust}>保存调整</Button>
              </>
            }
          >
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="rd-form-grid">
                {!isPharmaTenant && (
                  <div className="rd-field rd-span2">
                    <span className="rd-field-label">业务范围</span>
                    <div className="rd-choice">
                      <label>
                        <input
                          type="radio"
                          name="rd-adjust-scope"
                          checked={adjustForm.scopeMode === 'inherit_org'}
                          onChange={() => setAdjustForm({ ...adjustForm, scopeMode: 'inherit_org', error: '' })}
                        />
                        <span>
                          <b>继承所属部门的业务范围</b>
                          <span>跟随成员主属部门配置的药厂与品种</span>
                        </span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="rd-adjust-scope"
                          checked={adjustForm.scopeMode === 'custom'}
                          onChange={() => setAdjustForm({ ...adjustForm, scopeMode: 'custom', error: '' })}
                        />
                        <span>
                          <b>个人指定（只收窄不扩大）</b>
                          <span>在药厂授权范围内按药厂 → 品种 → 区域收窄</span>
                        </span>
                      </label>
                    </div>
                    {adjustForm.scopeMode === 'custom' && (
                      <BizScopeEditor
                        providerTenantId={tenantRootId}
                        value={adjustForm.bizScopes}
                        onChange={(bizScopes) => setAdjustForm({ ...adjustForm, bizScopes, error: '' })}
                      />
                    )}
                  </div>
                )}

                <label className="rd-field rd-span2">
                  <span className="rd-field-label">调整原因<span className="rd-required" aria-hidden="true">*</span></span>
                  <input
                    value={adjustForm.reason}
                    onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value, error: '' })}
                    style={inputStyle}
                    aria-invalid={Boolean(adjustForm.error) && !adjustForm.reason.trim()}
                  />
                  <span className="rd-hint">随审计记录保留。</span>
                </label>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* 移除成员授权确认弹窗（轻量二次确认，保留防锁死保护） */}
      {revokeForm && !isCreate && (() => {
        const a = assignments.find((x) => x.id === revokeForm.assignmentId);
        if (!a) return null;
        const remainingAdmins = new Set(
          assignments
            .filter((x) => x.id !== a.id && x.tenantId === tenantRootId && ADMIN_ROLE_IDS.includes(x.roleId) && isGrantEffective(x, today))
            .map((x) => x.userId),
        );
        const lock = ADMIN_ROLE_IDS.includes(role.id) && isGrantEffective(a, today) && remainingAdmins.size === 0;
        return (
          <Modal
            open
            title="移除成员"
            onClose={() => setRevokeForm(null)}
            width={440}
            footer={
              <>
                <Button variant="outline" onClick={() => setRevokeForm(null)}>取消</Button>
                <Button variant="danger" onClick={submitRevoke} disabled={lock}>确认移除</Button>
              </>
            }
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ width: 36, height: 36, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, background: 'var(--color-danger-bg)', color: 'var(--color-danger-fg)' }}>
                <CircleX size={18} aria-hidden />
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: 'var(--fs-15)', fontWeight: 600 }}>将 {memberName(a.userId)} 从「{shownName}」移除？</h2>
                <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-13)', color: 'var(--color-text-2)', lineHeight: 1.6 }}>
                  移除后立即失效；如需恢复，可在状态筛选「已移除」中点击「重新授予」。
                </p>
              </div>
            </div>
            {lock && (
              <p className="rd-err" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
                <CircleAlert size={14} aria-hidden />
                至少需保留一名有效企业管理员，防止系统锁死；请先授予其他成员管理员角色后再移除。
              </p>
            )}
            {revokeForm.error && (
              <p className="rd-err" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
                <CircleAlert size={14} aria-hidden />{revokeForm.error}
              </p>
            )}
          </Modal>
        );
      })()}

      {/* 编辑角色名称与说明轻量弹窗 */}
      {profileModal && (
        <Modal
          open
          title="编辑角色名称与说明"
          onClose={() => setProfileModal(null)}
          width={480}
          footer={
            <>
              <span className="rd-footer-meta">确认后需点击右上角「保存」统一生效</span>
              <Button variant="outline" onClick={() => setProfileModal(null)}>取消</Button>
              <Button variant="primary" onClick={submitProfileModal}>确认修改</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <label className="rd-field">
              <span className="rd-field-label">角色名称<span className="rd-required" aria-hidden="true">*</span></span>
              <input
                value={profileModal.name}
                onChange={(e) => setProfileModal({ ...profileModal, name: e.target.value, error: '' })}
                onKeyDown={(e) => { if (e.key === 'Enter') submitProfileModal(); }}
                style={inputStyle}
                placeholder="例如：区域销售经理 / 合规审核员"
                aria-invalid={Boolean(profileModal.error)}
                autoFocus
              />
              {profileModal.error && (
                <span className="rd-err" role="alert">
                  <CircleAlert size={14} aria-hidden />{profileModal.error}
                </span>
              )}
            </label>
            <label className="rd-field">
              <span className="rd-field-label">角色说明</span>
              <textarea
                value={profileModal.description}
                onChange={(e) => setProfileModal({ ...profileModal, description: e.target.value })}
                rows={3}
                placeholder="简述这个角色的职责边界（选填）"
                style={{ ...inputStyle, height: 'auto', padding: '8px 10px', resize: 'vertical' }}
              />
            </label>
          </div>
        </Modal>
      )}

      {/* 清空全部权限短确认 */}
      {confirmClearOpen && (
        <ConfirmDialog
          open
          title="清空全部权限"
          description="将清空该角色的页面和操作权限，保留首页。保存后生效。"
          confirmLabel="确认清空"
          cancelLabel="取消"
          variant="warning"
          onConfirm={confirmClearAllPages}
          onCancel={() => setConfirmClearOpen(false)}
        />
      )}

      {/* 有未保存内容时返回列表确认 */}
      {confirmLeave && (
        <ConfirmDialog
          open
          title={isCreate ? '放弃新建角色？' : '放弃未保存的更改？'}
          description={isCreate ? '当前填写的内容尚未保存，返回后不会生成角色记录。' : '当前页面有尚未保存的权限或字段配置，返回列表后将丢失。'}
          confirmLabel="放弃并返回"
          cancelLabel="继续编辑"
          variant="warning"
          onConfirm={() => { setConfirmLeave(false); onBack(); }}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}

function fieldSummary(fields: Record<string, FieldPolicyKind>) {
  const count = (k: FieldPolicyKind) => SENSITIVE_FIELDS.filter((f) => (fields[f.key] ?? 'visible') === k).length;
  const mask = count('mask');
  const hidden = count('hidden');
  if (mask + hidden === 0) return '全部可见';
  return `脱敏 ${mask} 项 · 隐藏 ${hidden} 项`;
}

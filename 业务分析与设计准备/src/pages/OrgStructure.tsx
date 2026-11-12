/**
 * 组织架构（2026-10-28 重构）：查看组织、理解人员归属、完成部门调整的完整入口。
 * 结构：左侧组织树（搜索部门 + 企业根节点 + 部门层级 / 服务商工作组）；
 *       右侧部门工作区（成员 / 下级部门 / 部门信息三个页签，默认「成员」）。
 * 三模块职责边界：
 * - 组织架构：这个人属于哪里。部门层级维护、成员归属查看与调整（添加已有成员、
 *   单人 / 批量调整部门均在本页完成，不再为一次调岗跳转用户管理）；
 * - 用户管理：账号本身（新建账号、启停、离职移除）。本页只提供明确命名的入口并带定位；
 * - 角色管理：这个人能做什么。本页只读展示有效角色，调整授权去「角色与数据范围」。
 * 规则要点：
 * - 负责区域配置在成员上（2026-10-27 修订），调岗不改变负责区域，本页只读展示；
 * - 树中人数 = 含下级成员总数；账号停用仍计入，已移除不计；搜索与筛选不影响人数；
 * - 挂在企业根节点的成员显示「企业直属」；仅无有效归属的成员进入「未分配成员」虚拟入口；
 * - 移动部门与调动成员是两个动作；删除部门前必须先消化成员、下级与业务引用（验收链等）。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Building2, ChevronDown, ChevronRight, CornerUpRight, MoreHorizontal, Pencil, Plus, Search,
  UserCheck, UserPlus, Users, X,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { StatusTag, Tag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import { useAcceptance } from '../context/AcceptanceContext';
import {
  ORG_TYPE_LABEL,
  deptDeleteBlockers,
  enterpriseRootOf,
  isDeptParentType,
  orgChildren,
  orgDescendantIds,
  orgPathLabel,
  resolveGroupLeader,
  sameLevelDeptNameExists,
  type DeptDeleteBlocker,
  type PermOrg,
  type PermUser,
  type TenantMembership,
} from '../data/permissions';
import type { ToastMessage } from '../components/Toast';
import { membershipOfUserInTenant, membershipsOfTenant, subscribeTenantMemberships } from '../data/cooperationModel';
import { canonicalRegions, hasPharmaAdminAssignment } from '../data/pharmaRegionScope';
import { REGION_NATIONWIDE } from '../constants';
import type { NavigateFn } from '../types';
import { Field, InfoBanner, inputStyle, tdStyle, thStyle } from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  /** 页面间导航（管理账号 → 用户管理；前往角色管理 / 执行链路配置）；未传时隐藏跨页入口 */
  navigate?: NavigateFn;
}

type TabId = 'members' | 'children' | 'info';
type Selection = { kind: 'org'; orgId: string } | { kind: 'unassigned' };

const iconBtnStyle = {
  width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', padding: 0, color: '#6B7280', cursor: 'pointer', borderRadius: 4, flexShrink: 0,
} as const;

const menuItemStyle = {
  display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 'var(--fs-13)',
  background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#374151',
} as const;

const menuBoxStyle = {
  position: 'absolute', top: '100%', right: 0, zIndex: 30, background: '#fff',
  border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  padding: 4, minWidth: 148,
} as const;

const chipStyle = {
  padding: '2px 8px', borderRadius: 999, fontSize: 'var(--fs-12)', background: '#F3F4F6', color: '#374151',
} as const;

const sectionTitleStyle = {
  fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 8,
} as const;

export function OrgStructure({ addToast, navigate }: Props) {
  const store = usePermission();
  const { orgs, users, assignments, roles, can, previewReadOnly, principal, groupLeaders } = store;
  const { config: acceptanceConfig } = useAcceptance();
  const tenantRootId = principal.realm === 'TENANT' ? principal.tenantId : 'org-platform';
  const tenantRoot = orgs.find(o => o.id === tenantRootId);
  const isProviderTenant = tenantRoot?.type === 'provider';
  const isPharmaTenant = principal.realm === 'TENANT' && principal.tenantKind === 'pharma';

  // ── 权限：部门维护（org-structure）与成员调动（复用用户管理既有校验）分开 ──
  const canDeptCreate = can('org-structure', 'create') && !previewReadOnly;
  const canDeptEdit = can('org-structure', 'edit') && !previewReadOnly;
  const canDeptDelete = can('org-structure', 'delete') && !previewReadOnly;
  const canMoveMembers = can('user-manage', 'edit') && !previewReadOnly;
  const canViewAccount = can('user-manage', 'view');
  const canManageRoles = can('roles', 'view');

  // ── 状态：选中视图 / 展开集合 / 树搜索 ──
  const [selection, setSelection] = useState<Selection>({ kind: 'org', orgId: tenantRootId });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([tenantRootId]));
  const [treeQuery, setTreeQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('members');
  const [menuOrgId, setMenuOrgId] = useState<string | null>(null);

  // ── 状态：成员页签筛选 ──
  const [memberKeyword, setMemberKeyword] = useState('');
  const [memberStatus, setMemberStatus] = useState('');
  const [includeChildren, setIncludeChildren] = useState(false);
  const [checkedUserIds, setCheckedUserIds] = useState<Set<string>>(() => new Set());
  const [expandedRoleUserIds, setExpandedRoleUserIds] = useState<Set<string>>(() => new Set());
  const [expandedRegionUserIds, setExpandedRegionUserIds] = useState<Set<string>>(() => new Set());

  // ── 状态：成员详情抽屉 / 调整成功提示 ──
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ count: number; targetId: string; targetName: string } | null>(null);

  // ── 状态：各弹窗 ──
  const [createDept, setCreateDept] = useState<{ parentId: string; name: string } | null>(null);
  const [editDept, setEditDept] = useState<{ orgId: string; name: string } | null>(null);
  const [moveDept, setMoveDept] = useState<{ orgId: string; targetId: string; reason: string } | null>(null);
  const [deleteDeptId, setDeleteDeptId] = useState<string | null>(null);
  const [createGroup, setCreateGroup] = useState<{ name: string; reason: string } | null>(null);
  const [renameGroup, setRenameGroup] = useState<{ orgId: string; name: string } | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<{ orgId: string; moveToId: string; reason: string; error: string } | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState<{ query: string; selected: Set<string>; error: string } | null>(null);
  const [moveDraft, setMoveDraft] = useState<{ userIds: string[]; targetId: string; error: string } | null>(null);

  // 成员归属按「当前租户成员身份的 orgUnit」统计（不读 User.orgId 主档）
  const [membershipVersion, bump] = useState(0);
  useEffect(() => subscribeTenantMemberships(() => bump(x => x + 1)), []);
  const memberships = useMemo(() => membershipsOfTenant(tenantRootId), [tenantRootId, membershipVersion]);

  // 切换企业（重新登录另一家企业）后：不残留上一企业的选中、详情与弹窗
  useEffect(() => {
    setSelection({ kind: 'org', orgId: tenantRootId });
    setExpanded(new Set([tenantRootId]));
    setTreeQuery('');
    setActiveTab('members');
    setMemberKeyword('');
    setMemberStatus('');
    setIncludeChildren(false);
    setCheckedUserIds(new Set());
    setDrawerUserId(null);
    setLastMove(null);
    setMenuOrgId(null);
    setCreateDept(null); setEditDept(null); setMoveDept(null); setDeleteDeptId(null);
    setCreateGroup(null); setRenameGroup(null); setDeleteGroup(null);
    setAddMemberOpen(null); setMoveDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantRootId]);

  /** 租户边界：本组织子树之外的节点不进入树与可选目标 */
  const tenantOrgIds = useMemo(() => new Set(orgDescendantIds(orgs, tenantRootId)), [orgs, tenantRootId]);
  const scopedOrgs = useMemo(() => orgs.filter(o => tenantOrgIds.has(o.id)), [orgs, tenantOrgIds]);

  const selectedOrg = selection.kind === 'org' ? (scopedOrgs.find(o => o.id === selection.orgId) ?? tenantRoot) : undefined;

  // 成员口径：账号停用（含身份冻结、待激活）仍属企业 → 计入；已移除不计
  const countable = useMemo(() => memberships.filter(m => m.status !== 'removed'), [memberships]);
  const directMemberCount = (orgId: string) => countable.filter(m => m.orgUnitId === orgId).length;
  const subtreeMemberCount = (orgId: string) => {
    const ids = new Set(orgDescendantIds(orgs, orgId));
    return countable.filter(m => ids.has(m.orgUnitId)).length;
  };

  /** 挂在树上找不到有效节点的成员 → 「未分配成员」虚拟入口（不是真实部门，不可编辑/删除） */
  const unassignedMembers = useMemo(
    () => countable.filter(m => !tenantOrgIds.has(m.orgUnitId)),
    [countable, tenantOrgIds],
  );

  /** 验收链当前生效的验收部门（按名引用，删除部门时阻止；药厂租户专用） */
  const acceptanceRefNames = useMemo(
    () => (isPharmaTenant ? acceptanceConfig.departments.slice(0, acceptanceConfig.levels) : []),
    [isPharmaTenant, acceptanceConfig],
  );

  /** 组长有效性（实时派生） */
  const leaderOfGroup = (groupId: string) =>
    resolveGroupLeader(groupId, groupLeaders[groupId], { users, assignments, memberships, tenantId: tenantRootId });

  /** 可挂成员的节点（目标选择、添加成员的目标口径） */
  const canHoldMembers = (org: PermOrg) =>
    org.type === 'pharma' || org.type === 'provider' || org.type === 'department' || org.type === 'group';

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** 定位部门：清搜索、展开祖先、选中；来自成员详情时切到成员页签并关抽屉 */
  function locateDept(orgId: string, opts?: { fromMember?: boolean }) {
    setTreeQuery('');
    setExpanded(prev => {
      const next = new Set(prev);
      let cur = orgs.find(o => o.id === orgId);
      const guard = new Set<string>();
      while (cur?.parentId && !guard.has(cur.id)) {
        guard.add(cur.id);
        next.add(cur.parentId);
        cur = orgs.find(o => o.id === cur!.parentId);
      }
      next.add(tenantRootId);
      return next;
    });
    setSelection({ kind: 'org', orgId });
    if (opts?.fromMember) setActiveTab('members');
    setDrawerUserId(null);
    setMenuOrgId(null);
  }

  // ── 组织树：搜索命中保留祖先路径并自动展开 ──
  const treeMatch = useMemo(() => {
    const q = treeQuery.trim().toLowerCase();
    if (!q) return null;
    const visible = new Set<string>();
    for (const org of scopedOrgs) {
      if (!org.name.toLowerCase().includes(q)) continue;
      for (const id of orgDescendantIds(scopedOrgs, org.id)) visible.add(id);
      let cur: PermOrg | undefined = org;
      const guard = new Set<string>();
      while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        visible.add(cur.id);
        cur = cur.parentId ? scopedOrgs.find(o => o.id === cur!.parentId) : undefined;
      }
    }
    return visible;
  }, [scopedOrgs, treeQuery]);

  function renderTreeNode(org: PermOrg, depth: number) {
    const children = orgChildren(scopedOrgs, org.id).filter(c => !treeMatch || treeMatch.has(c.id));
    const hasChildren = children.length > 0;
    const open = treeQuery ? true : expanded.has(org.id);
    const selected = selection.kind === 'org' && selection.orgId === org.id;
    const total = subtreeMemberCount(org.id);
    const leader = org.type === 'group' ? leaderOfGroup(org.id) : undefined;
    return (
      <div key={org.id}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 6px', paddingLeft: 6 + depth * 14, borderRadius: 6, cursor: 'pointer',
            background: selected ? 'var(--color-brand-subtle)' : 'transparent',
            color: selected ? 'var(--color-brand)' : 'var(--color-text-1)',
          }}
          onClick={() => { setSelection({ kind: 'org', orgId: org.id }); setMenuOrgId(null); }}
        >
          <button
            type="button" aria-label={open ? '折叠' : '展开'}
            onClick={e => { e.stopPropagation(); if (hasChildren) toggleExpand(org.id); }}
            style={{ ...iconBtnStyle, color: hasChildren ? '#9CA3AF' : 'transparent', cursor: hasChildren ? 'pointer' : 'default' }}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-13)', fontWeight: selected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {org.name}
            {leader && (
              <span
                title={leader.status === 'valid' ? `工作组组长：${leader.userName}` : '待指定组长（该组暂不能承接新的管理任务）'}
                style={{
                  fontSize: 'var(--fs-10)', padding: '1px 5px', borderRadius: 999, flexShrink: 0,
                  background: leader.status === 'valid' ? '#E6F5ED' : '#FEF3E2',
                  color: leader.status === 'valid' ? '#248A5A' : '#C77A16', fontWeight: 600,
                }}
              >
                {leader.status === 'valid' ? `组长·${leader.userName}` : '待指定组长'}
              </span>
            )}
          </span>
          <span
            title={`含下级成员总数 ${total} 人（账号停用仍计入，已移除不计）`}
            style={{
              minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#F3F4F6', color: '#374151',
              fontSize: 'var(--fs-11)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {total}
          </span>
        </div>
        {open && children.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  }

  // ── 成员页签数据 ──
  const userOf = (userId: string) => users.find(u => u.id === userId);
  const membershipOf = (userId: string) => membershipOfUserInTenant(userId, tenantRootId);

  interface MemberRow {
    membership: TenantMembership;
    user: PermUser;
    deptId: string;
  }

  const memberRows: MemberRow[] = useMemo(() => {
    const rows: MemberRow[] = [];
    const scope = selection.kind === 'unassigned'
      ? null
      : includeChildren
        ? new Set(orgDescendantIds(orgs, selectedOrg?.id ?? tenantRootId))
        : new Set([selectedOrg?.id ?? tenantRootId]);
    for (const m of countable) {
      if (selection.kind === 'unassigned') {
        if (tenantOrgIds.has(m.orgUnitId)) continue;
      } else if (!scope?.has(m.orgUnitId)) continue;
      const user = userOf(m.userId);
      if (!user) continue;
      rows.push({ membership: m, user, deptId: m.orgUnitId });
    }
    const kw = memberKeyword.trim().toLowerCase();
    return rows.filter(r =>
      (!kw || r.user.name.toLowerCase().includes(kw) || r.user.account.toLowerCase().includes(kw))
      && (!memberStatus || r.user.accountStatus === memberStatus)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, includeChildren, memberKeyword, memberStatus, countable, orgs, selectedOrg, tenantOrgIds, tenantRootId, users]);

  const visibleChecked = useMemo(
    () => memberRows.filter(r => checkedUserIds.has(r.user.id)).map(r => r.user.id),
    [memberRows, checkedUserIds],
  );

  const memberFiltersActive = Boolean(memberKeyword.trim() || memberStatus);

  /** 成员在本租户的全部生效角色名（角色 = 能做什么，在「角色与数据范围」维护） */
  const activeRoleNamesOf = (userId: string) =>
    assignments
      .filter(a => a.userId === userId && a.tenantId === tenantRootId && a.status === 'active')
      .map(a => roles.find(r => r.id === a.roleId)?.name)
      .filter((name): name is string => Boolean(name));

  const isPharmaAdminOf = (userId: string) =>
    isPharmaTenant && hasPharmaAdminAssignment(assignments.filter(a => a.userId === userId), tenantRootId);
  const memberRegionsOf = (userId: string) =>
    canonicalRegions(membershipOf(userId)?.responsibleRegions ?? []);

  const deptShortLabel = (orgId: string) => {
    if (!tenantOrgIds.has(orgId)) return '未分配';
    if (orgId === tenantRootId) return '企业直属';
    return orgs.find(o => o.id === orgId)?.name ?? '未分配';
  };
  const deptFullPath = (orgId: string) =>
    !tenantOrgIds.has(orgId) ? '无有效归属（未分配）' : orgPathLabel(orgs, orgId);

  const toggleSet = (setter: typeof setExpandedRoleUserIds) => (userId: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };
  const toggleRoleExpand = toggleSet(setExpandedRoleUserIds);
  const toggleRegionExpand = toggleSet(setExpandedRegionUserIds);
  const linkBtnStyle = {
    border: 'none', background: 'none', padding: 0, fontFamily: 'inherit',
    fontSize: 'var(--fs-13)', color: 'var(--color-brand)', cursor: 'pointer',
  } as const;

  const renderRoleCell = (userId: string) => {
    const names = activeRoleNamesOf(userId);
    if (names.length === 0) return <span style={{ color: '#9CA3AF' }}>未分配角色</span>;
    if (names.length <= 2) return names.join('、');
    const open = expandedRoleUserIds.has(userId);
    if (!open) {
      return (
        <button type="button" title={`展开全部 ${names.length} 个角色`} onClick={() => toggleRoleExpand(userId)} style={linkBtnStyle}>
          {names.slice(0, 2).join('、')}等 {names.length} 个
        </button>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span>{names.join('、')}</span>
        <button type="button" onClick={() => toggleRoleExpand(userId)} style={{ ...linkBtnStyle, fontSize: 'var(--fs-12)' }}>收起</button>
      </span>
    );
  };

  /** 负责区域单元格：药厂租户按成员个人属性渲染；服务商不显示该列 */
  const renderRegionCell = (userId: string) => {
    if (isPharmaAdminOf(userId)) {
      return <span title="企业管理员的区域固定全国，不受个人负责区域配置影响">全国（管理员例外）</span>;
    }
    const regions = memberRegionsOf(userId);
    if (regions.length === 0) return <Tag label="未配置" color="warning" />;
    if (regions.includes(REGION_NATIONWIDE)) return REGION_NATIONWIDE;
    if (regions.length <= 2) return regions.join('、');
    const open = expandedRegionUserIds.has(userId);
    if (!open) {
      return (
        <button type="button" title={`展开全部 ${regions.length} 个负责区域`} onClick={() => toggleRegionExpand(userId)} style={linkBtnStyle}>
          {regions.slice(0, 2).join('、')}等 {regions.length} 个
        </button>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span>{regions.join('、')}</span>
        <button type="button" onClick={() => toggleRegionExpand(userId)} style={{ ...linkBtnStyle, fontSize: 'var(--fs-12)' }}>收起</button>
      </span>
    );
  };

  // ── 成员调整（单人 / 批量共用一个弹窗；失败保留弹窗与已选内容） ──
  function openMoveDraft(userIds: string[]) {
    setLastMove(null);
    setMoveDraft({ userIds, targetId: '', error: '' });
  }

  const moveTargets = useMemo(() => {
    if (!moveDraft) return [] as PermOrg[];
    const currentIds = new Set(
      moveDraft.userIds.map(id => membershipOf(id)?.orgUnitId).filter((x): x is string => Boolean(x)),
    );
    // 单人调整不允许选当前部门；批量允许（已在该部门的成员自动跳过）
    const excludeSingle = moveDraft.userIds.length === 1 ? currentIds : new Set<string>();
    return scopedOrgs.filter(o => canHoldMembers(o) && !excludeSingle.has(o.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveDraft, scopedOrgs, memberships]);

  function submitMoveDraft() {
    if (!moveDraft) return;
    const target = scopedOrgs.find(o => o.id === moveDraft.targetId);
    if (!target) {
      setMoveDraft({ ...moveDraft, error: '目标节点不存在或已失效，请重新选择目标部门' });
      return;
    }
    let moved = 0;
    let skipped = 0;
    const failures: string[] = [];
    for (const userId of moveDraft.userIds) {
      const m = membershipOf(userId);
      if (!m) { failures.push(`${userOf(userId)?.name ?? userId}：已不是本企业成员`); continue; }
      if (m.orgUnitId === target.id) { skipped += 1; continue; }
      const result = store.setUserOrg({ userId, orgId: target.id });
      if (!result.ok) failures.push(`${userOf(userId)?.name ?? userId}：${result.error ?? '调整失败'}`);
      else moved += 1;
    }
    if (moved === 0) {
      setMoveDraft({ ...moveDraft, error: failures[0] ?? '没有成员被调整，请重试' });
      return;
    }
    setMoveDraft(null);
    setCheckedUserIds(new Set());
    setLastMove({ count: moved, targetId: target.id, targetName: target.name });
    addToast({
      type: failures.length > 0 ? 'warning' : 'success',
      title: `已将 ${moved} 名成员调整至「${target.name}」`,
      description: [
        isPharmaTenant ? '本次仅调整所属部门，角色和负责区域保持不变。' : '本次仅调整所属工作组，角色与数据范围保持不变。',
        skipped > 0 ? `${skipped} 人已在该部门，自动跳过。` : '',
        failures.length > 0 ? `失败 ${failures.length} 人：${failures.join('；')}` : '',
      ].filter(Boolean).join(''),
    });
  }

  // ── 添加已有成员（动作 A：实际是调整原归属，须在确认区写明） ──
  const addMemberTarget = addMemberOpen && selection.kind === 'org' ? selectedOrg : undefined;

  const addMemberRows = useMemo(() => {
    if (!addMemberOpen || !addMemberTarget) return [] as { membership: TenantMembership; user: PermUser }[];
    const q = addMemberOpen.query.trim().toLowerCase();
    return countable
      .map(m => ({ membership: m, user: userOf(m.userId) }))
      .filter((r): r is { membership: TenantMembership; user: PermUser } => Boolean(r.user))
      .filter(r => !q || r.user.name.toLowerCase().includes(q) || r.user.account.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMemberOpen, addMemberTarget, countable, users]);

  function submitAddMember() {
    if (!addMemberOpen || !addMemberTarget) return;
    const userIds = [...addMemberOpen.selected];
    if (userIds.length === 0) {
      setAddMemberOpen({ ...addMemberOpen, error: '请先勾选要加入的成员' });
      return;
    }
    const failures: string[] = [];
    let moved = 0;
    for (const userId of userIds) {
      const result = store.setUserOrg({ userId, orgId: addMemberTarget.id });
      if (!result.ok) failures.push(`${userOf(userId)?.name ?? userId}：${result.error ?? '调整失败'}`);
      else moved += 1;
    }
    if (moved === 0) {
      setAddMemberOpen({ ...addMemberOpen, error: failures[0] ?? '没有成员被调整，请重试' });
      return;
    }
    setAddMemberOpen(null);
    setLastMove({ count: moved, targetId: addMemberTarget.id, targetName: addMemberTarget.name });
    addToast({
      type: failures.length > 0 ? 'warning' : 'success',
      title: `已将 ${moved} 名成员调整至「${addMemberTarget.name}」`,
      description: `原所属部门已同步更新。${failures.length > 0 ? `失败 ${failures.length} 人：${failures.join('；')}` : isPharmaTenant ? '角色和负责区域保持不变。' : '角色与数据范围保持不变。'}`,
    });
  }

  // ── 部门维护 ──
  const deptParentOptions = (excludeIds: Set<string> = new Set()) =>
    scopedOrgs.filter(o => {
      if (!isDeptParentType(o.type)) return false;
      if (excludeIds.has(o.id)) return false;
      return enterpriseRootOf(scopedOrgs, o.id)?.id === tenantRootId;
    });

  function submitCreateDept() {
    if (!createDept) return;
    const result = store.addDepartment({ name: createDept.name, parentId: createDept.parentId });
    if (!result.ok) {
      addToast({ type: 'error', title: '新建部门失败', description: result.error });
      return;
    }
    if (result.org) {
      locateDept(result.org.id);
      setExpanded(prev => new Set([...prev, createDept.parentId, result.org!.id]));
    }
    addToast({ type: 'success', title: '已新建部门', description: createDept.name.trim() });
    setCreateDept(null);
  }

  function submitEditDept() {
    if (!editDept) return;
    const result = store.updateDepartment({ orgId: editDept.orgId, name: editDept.name });
    if (!result.ok) {
      addToast({ type: 'error', title: '保存失败', description: result.error });
      return;
    }
    addToast({ type: 'success', title: '部门信息已更新', description: editDept.name.trim() });
    setEditDept(null);
  }

  const moveDeptTarget = moveDept ? orgs.find(o => o.id === moveDept.targetId) : undefined;

  function submitMoveDept() {
    if (!moveDept) return;
    const result = store.updateDepartment({ orgId: moveDept.orgId, parentId: moveDept.targetId, reason: moveDept.reason.trim() || undefined });
    if (!result.ok) {
      addToast({ type: 'error', title: '调整失败', description: result.error });
      return;
    }
    addToast({
      type: 'success',
      title: '已调整部门层级',
      description: '该部门及其下级整体移动，成员仍归属原部门，组织路径已更新；角色和负责区域保持不变。',
    });
    const orgId = moveDept.orgId;
    setMoveDept(null);
    locateDept(orgId);
  }

  function submitCreateGroup() {
    if (!createGroup) return;
    const result = store.addWorkGroup({ name: createGroup.name, reason: createGroup.reason });
    if (!result.ok) {
      addToast({ type: 'error', title: '新建工作组失败', description: result.error });
      return;
    }
    if (result.org) {
      setSelection({ kind: 'org', orgId: result.org.id });
      setExpanded(prev => new Set([...prev, tenantRootId, result.org!.id]));
    }
    addToast({ type: 'success', title: '已新建工作组', description: `${createGroup.name.trim()} · 请在「工作组管理」指定组长后承接任务` });
    setCreateGroup(null);
  }

  function submitRenameGroup() {
    if (!renameGroup) return;
    const result = store.renameWorkGroup({ orgId: renameGroup.orgId, name: renameGroup.name });
    if (!result.ok) {
      addToast({ type: 'error', title: '重命名失败', description: result.error });
      return;
    }
    addToast({ type: 'success', title: '工作组已重命名', description: renameGroup.name.trim() });
    setRenameGroup(null);
  }

  function submitDeleteGroup() {
    if (!deleteGroup) return;
    const result = store.deleteWorkGroup({ orgId: deleteGroup.orgId, moveToId: deleteGroup.moveToId || undefined, reason: deleteGroup.reason });
    if (!result.ok) {
      setDeleteGroup({ ...deleteGroup, error: result.error || '删除失败' });
      return;
    }
    addToast({ type: 'success', title: '工作组已删除', description: '成员已按选择迁往目标节点；历史授权记录保留供审计。' });
    setDeleteGroup(null);
    if (selection.kind === 'org' && selection.orgId === deleteGroup.orgId) {
      setSelection({ kind: 'org', orgId: tenantRootId });
    }
  }

  const deleteDeptBlockers: DeptDeleteBlocker[] = useMemo(() => {
    if (!deleteDeptId) return [];
    return deptDeleteBlockers({ orgs, memberships, orgId: deleteDeptId, businessRefDeptNames: acceptanceRefNames });
  }, [deleteDeptId, orgs, memberships, acceptanceRefNames]);

  function submitDeleteDept() {
    if (!deleteDeptId) return;
    const result = store.deleteDepartment({ orgId: deleteDeptId, businessRefDeptNames: acceptanceRefNames });
    if (!result.ok) {
      addToast({ type: 'error', title: '无法删除该部门', description: result.error });
      // 前置校验被绕过（例如弹窗打开期间数据变化）：保留弹窗，blockers 实时刷新
      return;
    }
    const name = orgs.find(o => o.id === deleteDeptId)?.name ?? '';
    addToast({ type: 'success', title: '已删除部门', description: `「${name}」已删除；右侧已定位到原上级部门。` });
    const parentId = result.parent?.id ?? tenantRootId;
    setDeleteDeptId(null);
    locateDept(parentId);
  }

  const groupMoveTargets = deleteGroup
    ? orgs.filter(o => o.type === 'group' && o.parentId === tenantRootId && o.id !== deleteGroup.orgId)
    : [];

  // ── 右侧操作区（按节点类型与权限变化） ──
  const showAddMember = selection.kind === 'org' && selectedOrg && canHoldMembers(selectedOrg) && canMoveMembers;
  const showCreateChildDept = selection.kind === 'org' && selectedOrg && isDeptParentType(selectedOrg.type) && canDeptCreate;
  const showCreateGroup = selection.kind === 'org' && selectedOrg?.type === 'provider' && canDeptCreate;
  const showMoreMenu = selection.kind === 'org' && selectedOrg && (
    (selectedOrg.type === 'department' && (canDeptEdit || canDeptDelete))
    || (selectedOrg.type === 'group' && (canDeptEdit || canDeptDelete || can('workgroup-manage', 'view')))
  );

  const memberTableColumns = [
    '姓名 / 账号', '所属部门', '角色',
    ...(isPharmaTenant ? ['负责区域'] : []),
    '账号状态', '操作',
  ];

  const drawerUser = drawerUserId ? users.find(u => u.id === drawerUserId) : undefined;
  const drawerMembership = drawerUser ? membershipOf(drawerUser.id) : undefined;

  function renderMemberTable(rows: MemberRow[], emptyTitle: string, emptyDescription: string) {
    const allChecked = rows.length > 0 && rows.every(r => checkedUserIds.has(r.user.id));
    return (
      <div>
        {visibleChecked.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 8,
            background: 'var(--color-brand-subtle)', border: '1px solid var(--color-brand)', borderRadius: 8,
            fontSize: 'var(--fs-13)', color: 'var(--color-text-1)',
          }}>
            <span>已选 <strong>{visibleChecked.length}</strong> 人</span>
            {canMoveMembers && (
              <Button variant="primary" size="sm" onClick={() => openMoveDraft(visibleChecked)}>批量调整所属部门</Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setCheckedUserIds(new Set())}>取消选择</Button>
          </div>
        )}
        {lastMove && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 8,
            background: '#E6F5ED', border: '1px solid #9ED8B8', borderRadius: 8, fontSize: 'var(--fs-13)', color: '#1F6B45',
          }}>
            <span style={{ flex: 1 }}>已将 {lastMove.count} 名成员调整至「{lastMove.targetName}」，原部门人数与新部门人数已同步更新。</span>
            <Button variant="outline" size="sm" onClick={() => { locateDept(lastMove.targetId); setLastMove(null); }}>查看目标部门</Button>
            <button type="button" title="关闭提示" aria-label="关闭提示" onClick={() => setLastMove(null)} style={{ ...iconBtnStyle, color: '#1F6B45' }}>
              <X size={13} />
            </button>
          </div>
        )}
        {rows.length === 0 ? (
          memberFiltersActive ? (
            <EmptyState
              title="没有符合条件的人员"
              description={`筛选条件：${memberKeyword.trim() ? `关键词「${memberKeyword.trim()}」` : ''}${memberStatus ? `${memberKeyword.trim() ? ' · ' : ''}账号状态「${memberStatus === 'enabled' ? '启用' : '停用'}」` : ''}。`}
              action={{ label: '清除筛选', onClick: () => { setMemberKeyword(''); setMemberStatus(''); } }}
            />
          ) : (
            <EmptyState
              title={emptyTitle}
              description={emptyDescription}
              action={showAddMember && selectedOrg ? { label: '添加成员', onClick: () => setAddMemberOpen({ query: '', selected: new Set(), error: '' }) } : undefined}
            />
          )
        ) : (
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {canMoveMembers && (
                    <th style={{ ...thStyle, width: 36 }}>
                      <input
                        type="checkbox" aria-label="全选本页成员" checked={allChecked}
                        onChange={e => setCheckedUserIds(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) rows.forEach(r => next.add(r.user.id));
                          else rows.forEach(r => next.delete(r.user.id));
                          return next;
                        })}
                        style={{ accentColor: 'var(--color-brand)', width: 14, height: 14 }}
                      />
                    </th>
                  )}
                  {memberTableColumns.map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ membership, user, deptId }, idx) => (
                  <tr key={user.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    {canMoveMembers && (
                      <td style={tdStyle}>
                        <input
                          type="checkbox" aria-label={`选择 ${user.name}`} checked={checkedUserIds.has(user.id)}
                          onChange={e => setCheckedUserIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(user.id); else next.delete(user.id);
                            return next;
                          })}
                          style={{ accentColor: 'var(--color-brand)', width: 14, height: 14 }}
                        />
                      </td>
                    )}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => setDrawerUserId(user.id)} style={{ ...linkBtnStyle, fontWeight: 600 }}>
                        {user.name}
                      </button>
                      <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{user.account}</div>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button
                        type="button" title={deptFullPath(deptId)}
                        onClick={() => tenantOrgIds.has(deptId) && locateDept(deptId)}
                        style={{ ...linkBtnStyle, cursor: tenantOrgIds.has(deptId) ? 'pointer' : 'default', color: tenantOrgIds.has(deptId) ? 'var(--color-brand)' : '#9CA3AF' }}
                      >
                        {deptShortLabel(deptId)}
                      </button>
                    </td>
                    <td style={tdStyle}>{renderRoleCell(user.id)}</td>
                    {isPharmaTenant && <td style={tdStyle}>{renderRegionCell(user.id)}</td>}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <StatusTag status={user.accountStatus === 'enabled' ? '启用' : '停用'} size="sm" />
                      {membership.status === 'pending_activation' && <StatusTag status="待激活" size="sm" />}
                      {membership.status === 'frozen' && <StatusTag status="已冻结" size="sm" />}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <Button variant="ghost" size="sm" onClick={() => setDrawerUserId(user.id)}>查看成员</Button>
                      {canMoveMembers && (
                        <Button variant="ghost" size="sm" onClick={() => openMoveDraft([user.id])}>调整部门</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const childOrgs = selectedOrg ? orgChildren(scopedOrgs, selectedOrg.id) : [];
  const childTabLabel = selectedOrg?.type === 'provider' ? '下级工作组' : '下级部门';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="组织架构"
        description="管理企业部门层级与成员归属"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {canDeptCreate && isProviderTenant && (
              <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={() => setCreateGroup({ name: '', reason: '' })}>新建工作组</Button>
            )}
            {canDeptCreate && !isProviderTenant && (
              <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={() => setCreateDept({ parentId: selection.kind === 'org' && selectedOrg && isDeptParentType(selectedOrg.type) ? selectedOrg.id : tenantRootId, name: '' })}>
                新建部门
              </Button>
            )}
          </div>
        }
      />
      <div style={{ flex: 1, overflow: 'hidden', padding: 16, display: 'flex', gap: 12, minHeight: 0 }}>
        {/* 左：组织树（找部门、理解层级） */}
        <div style={{ width: 300, minWidth: 280, flexShrink: 0, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexShrink: 0 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={13} aria-hidden style={{ position: 'absolute', left: 8, top: 9, color: '#9CA3AF' }} />
              <input
                value={treeQuery} onChange={e => setTreeQuery(e.target.value)}
                placeholder="搜索部门" style={{ ...inputStyle, height: 30, paddingLeft: 26, fontSize: 'var(--fs-13)' }}
              />
            </div>
          </div>
          <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Building2 size={13} aria-hidden /> {tenantRoot?.name ?? '本企业'}
            <Tag label={tenantRoot ? ORG_TYPE_LABEL[tenantRoot.type] : ''} color="default" />
          </div>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {tenantRoot && renderTreeNode(tenantRoot, 0)}
            {treeQuery.trim() && (!treeMatch || treeMatch.size === 0) && (
              <div style={{ padding: '14px 6px', fontSize: 'var(--fs-13)', color: '#9CA3AF', lineHeight: 1.6 }}>
                没有名称包含「{treeQuery.trim()}」的部门。
                <button type="button" onClick={() => setTreeQuery('')} style={{ ...linkBtnStyle, marginLeft: 6 }}>清除搜索</button>
              </div>
            )}
          </div>
          {unassignedMembers.length > 0 && (
            <button
              type="button"
              onClick={() => { setSelection({ kind: 'unassigned' }); setMenuOrgId(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 8, flexShrink: 0,
                padding: '7px 8px', borderRadius: 6, border: '1px dashed var(--color-border)', background: '#FAFAFA',
                cursor: 'pointer', fontSize: 'var(--fs-13)',
                color: selection.kind === 'unassigned' ? 'var(--color-brand)' : '#667085',
                borderColor: selection.kind === 'unassigned' ? 'var(--color-brand)' : undefined,
              }}
            >
              <Users size={13} aria-hidden />
              <span style={{ flex: 1, textAlign: 'left' }}>未分配成员</span>
              <span style={{ fontSize: 'var(--fs-11)', fontWeight: 600, background: '#FEF3E2', color: '#C77A16', borderRadius: 999, padding: '1px 6px' }}>
                {unassignedMembers.length}
              </span>
            </button>
          )}
          <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', paddingTop: 8, flexShrink: 0, lineHeight: 1.5, borderTop: '1px solid #F3F4F6', marginTop: 8 }}>
            树中人数为该节点及全部下级的成员总数（含下级）；账号停用仍计入，已移除不计。
          </div>
        </div>

        {/* 右：部门工作区（先看人员，再看部门资料） */}
        <div style={{ flex: 1, minWidth: 0, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {selection.kind === 'unassigned' ? (
            <>
              <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 'var(--fs-16)', fontWeight: 600 }}>未分配成员</span>
                  <Tag label="虚拟节点 · 不可编辑或删除" color="warning" />
                </div>
                <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 6 }}>
                  以下成员的企业身份仍有效，但所属节点已不存在（如部门被裁撤）。请尽快为其调整所属部门。
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 12 }}>
                  <input value={memberKeyword} onChange={e => setMemberKeyword(e.target.value)} placeholder="姓名 / 账号" style={{ ...inputStyle, width: 160, height: 30 }} />
                  <select value={memberStatus} onChange={e => setMemberStatus(e.target.value)} style={{ ...inputStyle, width: 120, height: 30 }}>
                    <option value="">账号状态</option>
                    <option value="enabled">启用</option>
                    <option value="disabled">停用</option>
                  </select>
                  <span style={{ fontSize: 'var(--fs-12)', color: '#667085', marginLeft: 'auto' }}>共 <strong>{memberRows.length}</strong> 人</span>
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px', minHeight: 0 }}>
                {renderMemberTable(memberRows, '暂无未分配成员', '所有成员均有有效归属。')}
              </div>
            </>
          ) : !selectedOrg ? (
            <div style={{ padding: 20, color: '#9CA3AF', fontSize: 'var(--fs-13)' }}>从左侧选择组织节点查看详情</div>
          ) : (
            <>
              {/* 右侧顶部：当前对象始终清楚 */}
              <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--fs-16)', fontWeight: 600 }}>{selectedOrg.name}</span>
                  <StatusTag status={ORG_TYPE_LABEL[selectedOrg.type]} size="sm" />
                  {selectedOrg.type === 'group' && (() => {
                    const leader = leaderOfGroup(selectedOrg.id);
                    return leader.status === 'valid' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-12)', color: '#248A5A' }}>
                        <UserCheck size={13} aria-hidden /> 组长：{leader.userName}
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-12)', color: '#C77A16' }}>
                        <UserCheck size={13} aria-hidden /> 待指定组长（该组暂不能承接新的管理任务）
                      </span>
                    );
                  })()}
                </div>
                <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 4 }}>{orgPathLabel(orgs, selectedOrg.id)}</div>
                <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', marginTop: 6 }}>
                  直属 <strong>{directMemberCount(selectedOrg.id)}</strong> 人 · 含下级 <strong>{subtreeMemberCount(selectedOrg.id)}</strong> 人
                </div>

                {/* 右侧操作区：添加成员 / 新建下级 / 更多 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, position: 'relative' }}>
                  {showAddMember && (
                    <Button variant="primary" size="sm" icon={<UserPlus size={13} />} onClick={() => setAddMemberOpen({ query: '', selected: new Set(), error: '' })}>
                      添加成员
                    </Button>
                  )}
                  {showCreateChildDept && (
                    <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => setCreateDept({ parentId: selectedOrg.id, name: '' })}>
                      新建下级部门
                    </Button>
                  )}
                  {showCreateGroup && (
                    <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => setCreateGroup({ name: '', reason: '' })}>
                      新建工作组
                    </Button>
                  )}
                  {selectedOrg.type === 'group' && can('workgroup-manage', 'view') && navigate && (
                    <Button variant="outline" size="sm" onClick={() => navigate('workgroup-manage')}>
                      管理工作组
                    </Button>
                  )}
                  {showMoreMenu && (
                    <span onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                      <button
                        type="button" title="更多操作" aria-label="更多操作" onClick={() => setMenuOrgId(menuOrgId === selectedOrg.id ? null : selectedOrg.id)}
                        style={{ ...iconBtnStyle, border: '1px solid var(--color-border)', width: 28, height: 28 }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {menuOrgId === selectedOrg.id && (
                        <span style={menuBoxStyle}>
                          {selectedOrg.type === 'department' && canDeptEdit && (
                            <>
                              <button type="button" style={menuItemStyle} onClick={() => { setMenuOrgId(null); setEditDept({ orgId: selectedOrg.id, name: selectedOrg.name }); }}>
                                编辑部门信息
                              </button>
                              <button type="button" style={menuItemStyle} onClick={() => { setMenuOrgId(null); setMoveDept({ orgId: selectedOrg.id, targetId: selectedOrg.parentId ?? '', reason: '' }); }}>
                                调整上级部门
                              </button>
                            </>
                          )}
                          {selectedOrg.type === 'group' && canDeptEdit && (
                            <button type="button" style={menuItemStyle} onClick={() => { setMenuOrgId(null); setRenameGroup({ orgId: selectedOrg.id, name: selectedOrg.name }); }}>
                              重命名工作组
                            </button>
                          )}
                          {canDeptDelete && (
                            <button
                              type="button" style={{ ...menuItemStyle, color: '#C73A3A' }}
                              onClick={() => {
                                setMenuOrgId(null);
                                if (selectedOrg.type === 'department') setDeleteDeptId(selectedOrg.id);
                                else if (selectedOrg.type === 'group') setDeleteGroup({ orgId: selectedOrg.id, moveToId: '', reason: '', error: '' });
                              }}
                            >
                              删除{selectedOrg.type === 'group' ? '工作组' : '部门'}
                            </button>
                          )}
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {/* 页签 */}
                <div style={{ display: 'flex', gap: 2, marginTop: 12, borderBottom: '1px solid var(--color-border)' }}>
                  {([
                    ['members', '成员'],
                    ['children', `${childTabLabel}${childOrgs.length > 0 ? ` (${childOrgs.length})` : ''}`],
                    ['info', selectedOrg.type === 'group' ? '工作组信息' : '部门信息'],
                  ] as [TabId, string][]).map(([id, label]) => (
                    <button
                      key={id} type="button" onClick={() => setActiveTab(id)}
                      style={{
                        padding: '8px 12px', fontSize: 'var(--fs-13)', background: 'none', cursor: 'pointer',
                        border: 'none', borderBottom: activeTab === id ? '2px solid var(--color-brand)' : '2px solid transparent',
                        color: activeTab === id ? 'var(--color-brand)' : '#667085', fontWeight: activeTab === id ? 600 : 500,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 16px', minHeight: 0 }}>
                {activeTab === 'members' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      <input value={memberKeyword} onChange={e => setMemberKeyword(e.target.value)} placeholder="姓名 / 账号" style={{ ...inputStyle, width: 160, height: 30 }} />
                      <select value={memberStatus} onChange={e => setMemberStatus(e.target.value)} style={{ ...inputStyle, width: 120, height: 30 }}>
                        <option value="">账号状态</option>
                        <option value="enabled">启用</option>
                        <option value="disabled">停用</option>
                      </select>
                      {childOrgs.length > 0 && (
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#374151', cursor: 'pointer' }}>
                          <input
                            type="checkbox" checked={includeChildren} onChange={e => setIncludeChildren(e.target.checked)}
                            style={{ accentColor: 'var(--color-brand)', width: 14, height: 14 }}
                          />
                          包含下级部门成员
                        </label>
                      )}
                      <span style={{ fontSize: 'var(--fs-12)', color: '#667085', marginLeft: 'auto' }}>
                        {includeChildren && childOrgs.length > 0 ? '本部门及下级成员' : '直属成员'} · 共 <strong>{memberRows.length}</strong> 人
                        {includeChildren && childOrgs.length > 0 && '（成员实际归属见「所属部门」列）'}
                      </span>
                    </div>
                    {renderMemberTable(
                      memberRows,
                      '暂无直属成员',
                      showAddMember ? '该部门还没有直属成员，可添加已有成员或新建用户后加入。' : '该部门暂无直属成员。',
                    )}
                  </>
                )}

                {activeTab === 'children' && (
                  <div>
                    <div style={sectionTitleStyle}>
                      直接下级{selectedOrg.type === 'provider' ? '工作组' : '部门'}（不展开显示全部后代）
                    </div>
                    {childOrgs.length === 0 ? (
                      <EmptyState
                        title={`暂无下级${selectedOrg.type === 'provider' ? '工作组' : '部门'}`}
                        description={showCreateChildDept ? '可新建下级部门完善层级。' : showCreateGroup ? '可新建工作组承接任务。' : '当前节点没有下级。'}
                        action={showCreateChildDept && selectedOrg
                          ? { label: '新建下级部门', onClick: () => setCreateDept({ parentId: selectedOrg.id, name: '' }) }
                          : showCreateGroup ? { label: '新建工作组', onClick: () => setCreateGroup({ name: '', reason: '' }) } : undefined}
                      />
                    ) : (
                      <div style={{ display: 'grid', gap: 6, maxWidth: 560 }}>
                        {childOrgs.map(c => {
                          const leader = c.type === 'group' ? leaderOfGroup(c.id) : undefined;
                          return (
                            <button
                              key={c.id} type="button" onClick={() => { setSelection({ kind: 'org', orgId: c.id }); setExpanded(prev => new Set([...prev, selectedOrg.id])); }}
                              style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '9px 12px',
                                border: '1px solid var(--color-border)', borderRadius: 6, background: '#fff', cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              <span style={{ minWidth: 0 }}>
                                <span style={{ fontSize: 'var(--fs-13)', fontWeight: 500, display: 'block' }}>{c.name}</span>
                                {leader && (
                                  <span style={{ fontSize: 'var(--fs-11)', color: leader.status === 'valid' ? '#248A5A' : '#C77A16' }}>
                                    {leader.status === 'valid' ? `组长 · ${leader.userName}` : '待指定组长'}
                                  </span>
                                )}
                              </span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 'var(--fs-11)', color: '#9CA3AF', flexShrink: 0 }}>
                                <span title="不含下级">直属 {directMemberCount(c.id)} 人</span>
                                <span title="含全部下级">含下级 {subtreeMemberCount(c.id)} 人</span>
                                进入 →
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'info' && (
                  <div style={{ maxWidth: 620 }}>
                    <div style={sectionTitleStyle}>{selectedOrg.type === 'group' ? '工作组信息' : '部门信息'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <Field label="名称">{selectedOrg.name}</Field>
                      <Field label="类型">{String(ORG_TYPE_LABEL[selectedOrg.type])}</Field>
                      <Field label="所属企业">{enterpriseRootOf(orgs, selectedOrg.id)?.name ?? '—'}</Field>
                      <Field label={selectedOrg.type === 'group' ? '挂靠节点' : '上级部门'}>
                        {orgs.find(o => o.id === selectedOrg.parentId)?.name ?? '—（企业根节点）'}
                      </Field>
                      <Field label="完整路径" span>{orgPathLabel(orgs, selectedOrg.id)}</Field>
                      <Field label="人员归属" span>直属 {directMemberCount(selectedOrg.id)} 人 · 含下级 {subtreeMemberCount(selectedOrg.id)} 人</Field>
                      {selectedOrg.type === 'group' && (
                        <Field label="组长" span>
                          {(() => {
                            const leader = leaderOfGroup(selectedOrg.id);
                            return leader.status === 'valid'
                              ? `${leader.userName}（在组 · 账号启用）`
                              : '待指定组长（该组暂不能承接新的管理任务）';
                          })()}
                        </Field>
                      )}
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                      {selectedOrg.type === 'department' && canDeptEdit && (
                        <Button variant="outline" size="sm" icon={<Pencil size={13} />} onClick={() => setEditDept({ orgId: selectedOrg.id, name: selectedOrg.name })}>
                          编辑部门信息
                        </Button>
                      )}
                      {selectedOrg.type === 'group' && canDeptEdit && (
                        <Button variant="outline" size="sm" icon={<Pencil size={13} />} onClick={() => setRenameGroup({ orgId: selectedOrg.id, name: selectedOrg.name })}>
                          重命名工作组
                        </Button>
                      )}
                    </div>
                    {selectedOrg.type === 'pharma' && (
                      <div style={{ marginTop: 16, maxWidth: 560 }}>
                        <InfoBanner>
                          企业根节点固定在树顶部，不可删除或移动。挂在根节点上的成员显示为「企业直属」。
                        </InfoBanner>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 弹窗：新建部门（新建下级部门共用，上级预选当前部门） ── */}
      {createDept && (
        <Modal open title="新建部门" onClose={() => setCreateDept(null)} width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setCreateDept(null)}>取消</Button>
              <Button variant="primary" disabled={!createDept.name.trim()} onClick={submitCreateDept}>确认新建</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="所属企业">{enterpriseRootOf(orgs, createDept.parentId)?.name ?? '—'}</Field>
            <Field label="上级部门" required hint={orgPathLabel(orgs, createDept.parentId)}>
              <select value={createDept.parentId} onChange={e => setCreateDept({ ...createDept, parentId: e.target.value })} style={inputStyle}>
                {deptParentOptions().map(o => <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>)}
              </select>
            </Field>
            <Field label="部门名称" required hint={
              createDept.name.trim() && sameLevelDeptNameExists(orgs, createDept.parentId, createDept.name)
                ? '该上级下已存在同名部门'
                : '保存时自动去除首尾空格；同一上级下不能重名'
            }>
              <input value={createDept.name} onChange={e => setCreateDept({ ...createDept, name: e.target.value })} style={inputStyle} placeholder="例如：华北大区、西安办事处" />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：编辑部门（名称等实际支持的信息） ── */}
      {editDept && (
        <Modal open title="编辑部门信息" onClose={() => setEditDept(null)} width={480}
          footer={
            <>
              <Button variant="outline" onClick={() => setEditDept(null)}>取消</Button>
              <Button variant="primary" disabled={!editDept.name.trim()} onClick={submitEditDept}>保存</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="当前路径">{orgPathLabel(orgs, editDept.orgId)}</Field>
            <Field label="部门名称" required hint={
              editDept.name.trim() && sameLevelDeptNameExists(orgs, orgs.find(o => o.id === editDept.orgId)?.parentId ?? '', editDept.name, editDept.orgId)
                ? '该上级下已存在同名部门'
                : undefined
            }>
              <input value={editDept.name} onChange={e => setEditDept({ ...editDept, name: e.target.value })} style={inputStyle} />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：调整上级部门（与调动成员是两个动作） ── */}
      {moveDept && (
        <Modal open title="调整上级部门" onClose={() => setMoveDept(null)} width={540}
          footer={
            <>
              <Button variant="outline" onClick={() => setMoveDept(null)}>取消</Button>
              <Button variant="primary" disabled={!moveDept.targetId} onClick={submitMoveDept}>确认调整</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner tone="warning">
              当前部门及其下级<b>整体移动</b>，成员仍归属原部门，组织路径随之更新；成员的角色和负责区域保持不变。
            </InfoBanner>
            <Field label="原路径">{orgPathLabel(orgs, moveDept.orgId)}</Field>
            <Field label="新上级部门" required hint="只能选本企业内的节点；不能选自身或自身下级">
              <select value={moveDept.targetId} onChange={e => setMoveDept({ ...moveDept, targetId: e.target.value })} style={inputStyle}>
                <option value="">选择新上级</option>
                {deptParentOptions(new Set(orgDescendantIds(orgs, moveDept.orgId))).map(o => (
                  <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>
                ))}
              </select>
            </Field>
            {moveDeptTarget && (
              <Field label="移动后路径预览">
                <span style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)' }}>
                  {orgPathLabel(orgs, moveDeptTarget.id)} / {orgs.find(o => o.id === moveDept.orgId)?.name}
                </span>
              </Field>
            )}
            <Field label="调整原因" hint="选填，随审计保留">
              <input value={moveDept.reason} onChange={e => setMoveDept({ ...moveDept, reason: e.target.value })} style={inputStyle} placeholder="例如：大区合并" />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：删除部门（先检查：成员 / 下级 / 业务引用；满足才可确认） ── */}
      {deleteDeptId && (() => {
        const dept = orgs.find(o => o.id === deleteDeptId);
        return (
          <Modal open title={`删除部门 · ${dept?.name ?? ''}`} onClose={() => setDeleteDeptId(null)} width={560}
            footer={
              deleteDeptBlockers.length > 0 ? (
                <Button variant="outline" onClick={() => setDeleteDeptId(null)}>我知道了</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setDeleteDeptId(null)}>取消</Button>
                  <Button variant="danger" onClick={submitDeleteDept}>确认删除</Button>
                </>
              )
            }
          >
            <div style={{ display: 'grid', gap: 12 }}>
              {deleteDeptBlockers.length > 0 ? (
                <>
                  <InfoBanner tone="danger">删除前需要先处理以下事项；条件满足后本弹窗会自动放行。</InfoBanner>
                  {deleteDeptBlockers.map(b => (
                    <div key={b.kind} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)' }}>{b.message}</div>
                      {b.kind === 'members' && canMoveMembers && (
                        <div>
                          <Button variant="outline" size="sm" onClick={() => { setDeleteDeptId(null); setActiveTab('members'); setIncludeChildren(true); }}>
                            去调整成员归属
                          </Button>
                        </div>
                      )}
                      {b.kind === 'children' && (
                        <div style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>可在左侧树或「下级部门」页签逐个处理下级。</div>
                      )}
                      {b.kind === 'business-ref' && (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {(b.refs ?? []).map(ref => <div key={ref} style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>· {ref}</div>)}
                          {can('execution-chain', 'view') && navigate && (
                            <div><Button variant="outline" size="sm" onClick={() => navigate('execution-chain')}>前往执行链路配置</Button></div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <InfoBanner tone="warning">
                    将删除「{dept?.name}」（{orgPathLabel(orgs, deleteDeptId)}）。该部门当前无成员、无下级、无业务引用；
                    删除后右侧将定位到原上级部门。本操作不含「迁移成员 / 移动下级」等合并能力。
                  </InfoBanner>
                  <div style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>二次确认：点击「确认删除」后立即生效并写入审计。</div>
                </>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* ── 弹窗：新建工作组（服务商） ── */}
      {createGroup && (
        <Modal open title="新建工作组" onClose={() => setCreateGroup(null)} width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setCreateGroup(null)}>取消</Button>
              <Button variant="primary" disabled={!createGroup.name.trim()} onClick={submitCreateGroup}>创建</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>
              工作组是本服务商的组织节点（挂在 {tenantRoot?.name} 下）。此处仅创建节点；组长指定与任务承接在「工作组管理」维护。
            </InfoBanner>
            <Field label="工作组名称" required>
              <input value={createGroup.name} onChange={e => setCreateGroup({ ...createGroup, name: e.target.value })} style={inputStyle} placeholder="例如：西北推广一组" />
            </Field>
            <Field label="说明" hint="选填，随审计保留">
              <input value={createGroup.reason} onChange={e => setCreateGroup({ ...createGroup, reason: e.target.value })} style={inputStyle} placeholder="团队职责说明" />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：重命名工作组 ── */}
      {renameGroup && (
        <Modal open title="重命名工作组" onClose={() => setRenameGroup(null)} width={440}
          footer={
            <>
              <Button variant="outline" onClick={() => setRenameGroup(null)}>取消</Button>
              <Button variant="primary" disabled={!renameGroup.name.trim()} onClick={submitRenameGroup}>保存</Button>
            </>
          }
        >
          <Field label="工作组名称" required><input value={renameGroup.name} onChange={e => setRenameGroup({ ...renameGroup, name: e.target.value })} style={inputStyle} /></Field>
        </Modal>
      )}

      {/* ── 弹窗：删除工作组（成员需先迁移；组长调离/删除均经业务校验） ── */}
      {deleteGroup && (
        <Modal open title="删除工作组" onClose={() => setDeleteGroup(null)} width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setDeleteGroup(null)}>取消</Button>
              <Button variant="danger" disabled={!deleteGroup.reason.trim()} onClick={submitDeleteGroup}>确认删除</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {deleteGroup.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{deleteGroup.error}</div>}
            <InfoBanner tone="warning">
              删除仅移除团队节点；成员的历史授权记录保留为「已删除工作组」占位，审计可查。组内有成员时必须选择迁入节点。
            </InfoBanner>
            <Field label="成员去向" hint="组内有成员时必须选择迁入节点">
              <select value={deleteGroup.moveToId} onChange={e => setDeleteGroup({ ...deleteGroup, moveToId: e.target.value, error: '' })} style={inputStyle}>
                <option value="">（组内无成员或迁往服务商根节点）</option>
                {groupMoveTargets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="删除原因" required><input value={deleteGroup.reason} onChange={e => setDeleteGroup({ ...deleteGroup, reason: e.target.value, error: '' })} style={inputStyle} placeholder="例如：团队并入一组" /></Field>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：添加已有成员（动作 A：一名成员在一个企业只有一个组织归属） ── */}
      {addMemberOpen && addMemberTarget && (
        <Modal open title={`添加成员 · ${addMemberTarget.name}`} onClose={() => setAddMemberOpen(null)} width={620} maxHeight="78vh"
          footer={
            <>
              {can('user-manage', 'create') && canViewAccount && navigate && (
                <Button variant="ghost" onClick={() => navigate('user-manage', { createUserDefaultOrgId: addMemberTarget.id })}>
                  新建用户（前往用户管理）
                </Button>
              )}
              <Button variant="outline" onClick={() => setAddMemberOpen(null)}>取消</Button>
              <Button variant="primary" disabled={addMemberOpen.selected.size === 0} onClick={submitAddMember}>
                确认调整{addMemberOpen.selected.size > 0 ? ` ${addMemberOpen.selected.size} 人` : ''}
              </Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>
              本企业成员在同一时间只有一个组织归属：此处「添加」会把所选成员的所属部门<b>调整</b>为「{addMemberTarget.name}」，其原所属部门将同步更新。
              {isPharmaTenant ? '角色和负责区域保持不变。' : '角色与数据范围保持不变。'}
              已移除（离职等）成员不能通过本入口重新加入，请在「用户管理」使用重新加入流程。
            </InfoBanner>
            <input
              value={addMemberOpen.query} onChange={e => setAddMemberOpen({ ...addMemberOpen, query: e.target.value })}
              placeholder="搜索姓名 / 账号" style={{ ...inputStyle, height: 32 }}
            />
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, maxHeight: 300, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['', '姓名 / 账号', '当前部门', '账号状态'].map((h, i) => <th key={i} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {addMemberRows.length === 0 && (
                    <tr><td colSpan={4} style={{ ...tdStyle, color: '#9CA3AF' }}>没有符合条件的企业成员</td></tr>
                  )}
                  {addMemberRows.map(({ membership, user }, idx) => {
                    const inTarget = membership.orgUnitId === addMemberTarget.id;
                    const checked = addMemberOpen.selected.has(user.id);
                    return (
                      <tr key={user.id} style={{ background: checked ? 'var(--color-brand-subtle)' : idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ ...tdStyle, width: 36 }}>
                          <input
                            type="checkbox" aria-label={`选择 ${user.name}`} disabled={inTarget} checked={inTarget || checked}
                            onChange={e => setAddMemberOpen({
                              ...addMemberOpen,
                              selected: e.target.checked
                                ? new Set([...addMemberOpen.selected, user.id])
                                : new Set([...addMemberOpen.selected].filter(id => id !== user.id)),
                            })}
                            style={{ accentColor: 'var(--color-brand)', width: 14, height: 14 }}
                          />
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{user.name}</div>
                          <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{user.account}</div>
                        </td>
                        <td style={tdStyle}>
                          {inTarget ? <Tag label="已在本部门" color="success" /> : deptShortLabel(membership.orgUnitId)}
                        </td>
                        <td style={tdStyle}><StatusTag status={user.accountStatus === 'enabled' ? '启用' : '停用'} size="sm" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {addMemberOpen.selected.size > 0 && (
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', border: '1px dashed var(--color-border)', borderRadius: 8, padding: 10 }}>
                将 <strong>{addMemberOpen.selected.size}</strong> 名成员调整至「{addMemberTarget.name}」，原所属部门将同步更新。
              </div>
            )}
            {addMemberOpen.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{addMemberOpen.error}</div>}
          </div>
        </Modal>
      )}

      {/* ── 弹窗：调整所属部门（单人 / 批量；动作 B） ── */}
      {moveDraft && (() => {
        const target = scopedOrgs.find(o => o.id === moveDraft.targetId);
        return (
          <Modal open title={moveDraft.userIds.length > 1 ? `批量调整所属部门 · ${moveDraft.userIds.length} 人` : '调整所属部门'} onClose={() => setMoveDraft(null)} width={560}
            footer={
              <>
                <Button variant="outline" onClick={() => setMoveDraft(null)}>取消</Button>
                <Button variant="primary" disabled={!moveDraft.targetId} onClick={submitMoveDraft}>确认调整</Button>
              </>
            }
          >
            <div style={{ display: 'grid', gap: 12 }}>
              <InfoBanner>
                {isPharmaTenant
                  ? '本次仅调整成员所属部门，角色和负责区域保持不变（负责区域配置在成员上，调岗不改变）。'
                  : '本次仅调整成员所属工作组，角色与数据范围保持不变。'}
                跨企业调动不在此处理。
              </InfoBanner>
              <div>
                <div style={sectionTitleStyle}>本次调整人员（含原所属部门）</div>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, maxHeight: 180, overflow: 'auto' }}>
                  {moveDraft.userIds.map(userId => {
                    const user = userOf(userId);
                    const m = membershipOf(userId);
                    return (
                      <div key={userId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 12px', fontSize: 'var(--fs-13)', borderBottom: '1px solid #F3F4F6' }}>
                        <span style={{ fontWeight: 600 }}>{user?.name ?? userId}</span>
                        <span style={{ color: '#667085' }} title={m ? deptFullPath(m.orgUnitId) : undefined}>
                          原所属：{m ? deptShortLabel(m.orgUnitId) : '已不是本企业成员'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <Field label="调整到" required hint={target ? orgPathLabel(orgs, target.id) : '仅本企业内的有效节点可选'}>
                <select value={moveDraft.targetId} onChange={e => setMoveDraft({ ...moveDraft, targetId: e.target.value, error: '' })} style={inputStyle}>
                  <option value="">选择目标部门{isProviderTenant ? ' / 工作组' : ''}</option>
                  {moveTargets.map(o => <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>)}
                </select>
              </Field>
              {moveDraft.userIds.length > 1 && target && (
                <div style={{ fontSize: 'var(--fs-12)', color: '#667085', border: '1px dashed var(--color-border)', borderRadius: 8, padding: 8 }}>
                  将 {moveDraft.userIds.length} 名成员调整至「{target.name}」；已在目标部门的成员会自动跳过。
                </div>
              )}
              {moveDraft.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{moveDraft.error}</div>}
            </div>
          </Modal>
        );
      })()}

      {/* ── 成员详情抽屉：在当前页面查看，不再跳用户管理 ── */}
      {drawerUser && drawerMembership && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setDrawerUserId(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(17,24,39,0.28)', animation: 'orgFadeIn 150ms ease' }} />
          <aside
            role="dialog" aria-label={`成员详情 · ${drawerUser.name}`}
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 400, maxWidth: '92vw',
              background: '#fff', borderLeft: '1px solid var(--color-border)', boxShadow: '-12px 0 32px rgba(0,0,0,0.10)',
              display: 'flex', flexDirection: 'column', animation: 'orgDrawerIn 180ms ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 56, borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--color-brand), #2F6BCE)', color: '#fff',
                  fontSize: 'var(--fs-13)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{drawerUser.name.slice(0, 1)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600 }}>{drawerUser.name}</div>
                  <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{drawerUser.account}</div>
                </div>
              </div>
              <button type="button" title="关闭" aria-label="关闭成员详情" onClick={() => setDrawerUserId(null)} style={{ ...iconBtnStyle, width: 30, height: 30 }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gap: 18, alignContent: 'start' }}>
              {/* 基本信息（手机号 / 邮箱按用户管理查看权限展示） */}
              <section>
                <div style={sectionTitleStyle}>基本信息</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--fs-13)' }}>
                    <span style={{ color: '#667085', flexShrink: 0 }}>账号状态</span>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <StatusTag status={drawerUser.accountStatus === 'enabled' ? '启用' : '停用'} size="sm" />
                      {drawerMembership.status === 'pending_activation' && <StatusTag status="待激活" size="sm" />}
                      {drawerMembership.status === 'frozen' && <StatusTag status="已冻结" size="sm" />}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--fs-13)' }}>
                    <span style={{ color: '#667085', flexShrink: 0 }}>手机号</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {canViewAccount ? drawerUser.phone : <span style={{ color: '#9CA3AF' }}>无用户管理权限，不可查看</span>}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--fs-13)' }}>
                    <span style={{ color: '#667085', flexShrink: 0 }}>邮箱</span>
                    <span style={{ wordBreak: 'break-all', textAlign: 'right' }}>
                      {canViewAccount ? (drawerUser.email || '—') : <span style={{ color: '#9CA3AF' }}>无用户管理权限，不可查看</span>}
                    </span>
                  </div>
                </div>
              </section>

              {/* 组织归属 */}
              <section>
                <div style={sectionTitleStyle}>组织归属</div>
                <div style={{ display: 'grid', gap: 10, fontSize: 'var(--fs-13)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: '#667085', flexShrink: 0 }}>所属企业</span>
                    <span>{tenantRoot?.name ?? '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ color: '#667085', flexShrink: 0 }}>所属部门</span>
                    {tenantOrgIds.has(drawerMembership.orgUnitId) ? (
                      <button
                        type="button" title={`${deptFullPath(drawerMembership.orgUnitId)}（点击定位）`}
                        onClick={() => locateDept(drawerMembership.orgUnitId, { fromMember: true })}
                        style={{ ...linkBtnStyle, textAlign: 'right', fontWeight: 600 }}
                      >
                        {deptFullPath(drawerMembership.orgUnitId)}
                      </button>
                    ) : (
                      <span style={{ color: '#C77A16' }}>未分配（原节点已不存在）</span>
                    )}
                  </div>
                  {canMoveMembers && (
                    <div>
                      <Button variant="outline" size="sm" icon={<CornerUpRight size={13} />} onClick={() => openMoveDraft([drawerUser.id])}>
                        调整所属部门
                      </Button>
                    </div>
                  )}
                </div>
              </section>

              {/* 业务配置摘要（只读；调整入口在对应模块） */}
              <section>
                <div style={sectionTitleStyle}>业务配置摘要</div>
                <div style={{ display: 'grid', gap: 10, fontSize: 'var(--fs-13)' }}>
                  <div>
                    <div style={{ color: '#667085', marginBottom: 4 }}>有效角色（只读）</div>
                    {(() => {
                      const names = activeRoleNamesOf(drawerUser.id);
                      return names.length === 0 ? (
                        <span style={{ color: '#9CA3AF' }}>未分配角色</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {names.map(n => <span key={n} style={chipStyle}>{n}</span>)}
                        </div>
                      );
                    })()}
                    {canManageRoles && navigate && (
                      <div style={{ marginTop: 4 }}>
                        <button type="button" onClick={() => navigate('roles')} style={{ ...linkBtnStyle, fontSize: 'var(--fs-12)' }}>
                          前往角色管理调整授权 →
                        </button>
                      </div>
                    )}
                  </div>
                  {isPharmaTenant && (
                    <div>
                      <div style={{ color: '#667085', marginBottom: 4 }}>负责区域（药厂 · 配置在成员上）</div>
                      {(() => {
                        if (isPharmaAdminOf(drawerUser.id)) return <span>全国（管理员例外）</span>;
                        const regions = memberRegionsOf(drawerUser.id);
                        if (regions.length === 0) return <Tag label="未配置（区域受控业务数据不可见）" color="warning" />;
                        return <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{regions.map(r => <span key={r} style={chipStyle}>{r}</span>)}</div>;
                      })()}
                      <div style={{ marginTop: 4, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>调岗不改变负责区域；如需调整请在「用户管理」成员详情维护。</div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
              {canViewAccount && navigate && (
                <Button variant="outline" onClick={() => navigate('user-manage', { userDetailUserId: drawerUser.id })}>管理账号</Button>
              )}
              <Button variant="primary" onClick={() => setDrawerUserId(null)}>关闭</Button>
            </div>
          </aside>
          <style>{`
            @keyframes orgFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes orgDrawerIn { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          `}</style>
        </div>
      )}
    </div>
  );
}

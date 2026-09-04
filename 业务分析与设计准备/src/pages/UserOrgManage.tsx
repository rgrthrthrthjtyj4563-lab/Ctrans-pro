import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  CornerUpRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StatusTag, Tag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import {
  ORG_TYPE_LABEL,
  directUsers,
  enterpriseRootOf,
  grantStatusLabel,
  isDeptParentType,
  isHighRiskRole,
  latestAssignmentAt,
  orgChildren,
  orgDescendantIds,
  orgPathLabel,
  resolveGrantAnchor,
  sameLevelDeptNameExists,
  scopeLabel,
  summarizePerms,
  usersInSubtree,
  type GrantStatus,
  type PermOrg,
  type PermUser,
  type RoleAssignment,
} from '../data/permissions';
import type { NavFocus } from '../types';
import type { ToastMessage } from '../components/Toast';
import { Field, InfoBanner, inputStyle, tdStyle, thStyle } from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navFocus?: NavFocus;
}

type DetailTab = 'basic' | 'roles' | 'audit';
type AssignmentWithRole = RoleAssignment & { roleName: string };

const ASSIGNMENT_ORDER: Record<GrantStatus, number> = {
  active: 0,
  pending_review: 1,
  expired: 2,
  revoked: 3,
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const chipStyle = {
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 'var(--fs-12)',
  background: '#F3F4F6',
  color: '#374151',
} as const;

const iconBtnStyle = {
  width: 22,
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  padding: 0,
  color: '#6B7280',
  cursor: 'pointer',
  borderRadius: 4,
  flexShrink: 0,
} as const;

export function UserOrgManage({ addToast, navFocus }: Props) {
  const store = usePermission();
  const {
    orgs, users, assignments, roles, auditEvents, can, previewReadOnly,
    addDepartment, updateDepartment, setUserOrg, createUser, setUserStatus,
    createAssignment, revokeAssignment,
  } = store;

  const [selectedOrgId, setSelectedOrgId] = useState('org-pharma');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [includeChildren, setIncludeChildren] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [hasRoleFilter, setHasRoleFilter] = useState('');
  const [tab, setTab] = useState<DetailTab>('basic');

  // 组织树
  const [treeQuery, setTreeQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['org-platform', 'org-pharma', 'org-dept-sales', 'org-dept-northwest']),
  );
  const [hoveredOrgId, setHoveredOrgId] = useState<string | null>(null);
  const [menuOrgId, setMenuOrgId] = useState<string | null>(null);

  // 弹窗
  const [createDept, setCreateDept] = useState<{ parentId: string; name: string; showParentSelect: boolean } | null>(null);
  const [moveDept, setMoveDept] = useState<{ orgId: string; targetId: string; reason: string } | null>(null);
  const [renameDept, setRenameDept] = useState<{ orgId: string; name: string } | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState<{ name: string; account: string; phone: string; email: string; orgId: string; error: string } | null>(null);
  const [transferIn, setTransferIn] = useState<{ userId: string } | null>(null);
  const [moveUser, setMoveUser] = useState<{ userId: string; targetId: string; error: string } | null>(null);
  const [assign, setAssign] = useState<{ userId: string; roleId: string; from: string; to: string; reason: string; error: string } | null>(null);
  const [revoke, setRevoke] = useState<{ assignmentId: string; reason: string; error: string } | null>(null);
  const [disableUser, setDisableUser] = useState<{ userId: string; revokeAll: boolean } | null>(null);
  const [enableUserId, setEnableUserId] = useState<string | null>(null);

  const canCreate = can('departments', 'create') && !previewReadOnly;
  const canEdit = can('departments', 'edit') && !previewReadOnly;
  const canAssign = can('departments', 'create') && !previewReadOnly;
  const canRevoke = can('departments', 'delete') && !previewReadOnly;

  const selectedOrg = orgs.find(o => o.id === selectedOrgId);
  const selectedUser = users.find(u => u.id === selectedUserId) ?? null;

  // 角色管理「已授权用户」跳转：带入角色筛选
  useEffect(() => {
    const roleId = navFocus?.userOrgRoleId;
    if (!roleId) return;
    setRoleFilter(roleId);
    setIncludeChildren(true);
    setSelectedOrgId('org-platform');
    setSelectedUserId(null);
    setKeyword('');
    setStatusFilter('');
    setHasRoleFilter('');
  }, [navFocus]);

  // 用户被删除/不可见时清空选择
  useEffect(() => {
    if (selectedUserId && !users.some(u => u.id === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [users, selectedUserId]);

  const activeRoleIdsOf = (userId: string) =>
    new Set(assignments.filter(a => a.userId === userId && a.status === 'active').map(a => a.roleId));

  const people = useMemo(() => {
    if (!selectedOrg) return [];
    const inScope = includeChildren
      ? usersInSubtree(users, orgs, selectedOrg.id)
      : directUsers(users, selectedOrg.id);
    const kw = keyword.trim().toLowerCase();
    return inScope.filter(u => {
      if (kw && !(u.name.toLowerCase().includes(kw) || u.account.toLowerCase().includes(kw))) return false;
      if (statusFilter && u.accountStatus !== statusFilter) return false;
      if (roleFilter && !activeRoleIdsOf(u.id).has(roleFilter)) return false;
      if (hasRoleFilter === 'yes' && activeRoleIdsOf(u.id).size === 0) return false;
      if (hasRoleFilter === 'no' && activeRoleIdsOf(u.id).size > 0) return false;
      return true;
    });
  }, [assignments, hasRoleFilter, includeChildren, keyword, orgs, roleFilter, selectedOrg, statusFilter, users]);

  const directCount = selectedOrg ? directUsers(users, selectedOrg.id).length : 0;
  const subtreeCount = selectedOrg ? usersInSubtree(users, orgs, selectedOrg.id).length : 0;
  const roleFilterOptions = useMemo(() => {
    const used = new Set(assignments.map(a => a.roleId));
    return roles.filter(r => used.has(r.id));
  }, [assignments, roles]);

  // ─── 树渲染 ───────────────────────────────────────────────────────────────
  const tq = treeQuery.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!tq) return null;
    const hit = new Set<string>();
    for (const org of orgs) {
      if (!org.name.toLowerCase().includes(tq)) continue;
      for (const id of orgDescendantIds(orgs, org.id)) hit.add(id);
      let current: PermOrg | undefined = org;
      const guard = new Set<string>();
      while (current && !guard.has(current.id)) {
        guard.add(current.id);
        hit.add(current.id);
        current = current.parentId ? orgs.find(o => o.id === current!.parentId) : undefined;
      }
    }
    return hit;
  }, [orgs, tq]);

  const matchedUsers = useMemo(() => {
    if (!tq) return [];
    return users.filter(u => u.name.toLowerCase().includes(tq) || u.account.toLowerCase().includes(tq));
  }, [tq, users]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectOrg(id: string, userId: string | null = null) {
    setSelectedOrgId(id);
    setSelectedUserId(userId);
    setMenuOrgId(null);
    setTab('basic');
  }

  function renderTreeNode(org: PermOrg, depth: number): ReactNode {
    if (visibleIds && !visibleIds.has(org.id)) return null;
    const children = orgChildren(orgs, org.id);
    const visibleChildren = visibleIds ? children.filter(c => visibleIds.has(c.id)) : children;
    const hasChildren = visibleChildren.length > 0;
    const open = tq ? true : expanded.has(org.id);
    const selected = selectedOrgId === org.id;
    const direct = directUsers(users, org.id).length;
    const subtree = usersInSubtree(users, orgs, org.id).length;
    const showActions = (hoveredOrgId === org.id || selected || menuOrgId === org.id) && !previewReadOnly;
    return (
      <div key={org.id}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 6px',
            paddingLeft: 6 + depth * 14,
            borderRadius: 6,
            cursor: 'pointer',
            background: selected ? 'var(--color-brand-subtle)' : 'transparent',
            color: selected ? 'var(--color-brand)' : 'var(--color-text-1)',
          }}
          onMouseEnter={() => setHoveredOrgId(org.id)}
          onMouseLeave={() => { setHoveredOrgId(null); }}
          onClick={() => selectOrg(org.id)}
        >
          <button
            type="button"
            aria-label={open ? '折叠' : '展开'}
            onClick={e => { e.stopPropagation(); if (hasChildren) toggleExpand(org.id); }}
            style={{ ...iconBtnStyle, color: hasChildren ? '#9CA3AF' : 'transparent', cursor: hasChildren ? 'pointer' : 'default' }}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-13)', fontWeight: selected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {org.name}
          </span>
          {org.type !== 'department' && (
            <span style={{ fontSize: 'var(--fs-10)', color: '#9CA3AF', flexShrink: 0 }}>{ORG_TYPE_LABEL[org.type]}</span>
          )}
          <span
            title={subtree > direct ? `直属 ${direct} 人 · 含下级 ${subtree} 人` : `直属 ${direct} 人`}
            style={{
              minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
              background: '#F3F4F6', color: '#374151', fontSize: 'var(--fs-11)', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {direct}
          </span>
          {showActions && (
            <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              {canCreate && isDeptParentType(org.type) && (
                <button type="button" title="新建下级部门" style={iconBtnStyle} onClick={() => openCreateDept(org.id)}>
                  <Plus size={13} />
                </button>
              )}
              {canEdit && org.type === 'department' && (
                <button type="button" title="调整汇报上级" style={iconBtnStyle} onClick={() => setMoveDept({ orgId: org.id, targetId: org.parentId ?? '', reason: '' })}>
                  <CornerUpRight size={13} />
                </button>
              )}
              {canEdit && org.type === 'department' && (
                <button type="button" title="更多" style={iconBtnStyle} onClick={() => setMenuOrgId(menuOrgId === org.id ? null : org.id)}>
                  <MoreHorizontal size={13} />
                </button>
              )}
              {menuOrgId === org.id && (
                <span style={{
                  position: 'absolute', top: '100%', right: 0, zIndex: 30,
                  background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 96,
                }}>
                  <button
                    type="button"
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 'var(--fs-12)', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#374151' }}
                    onClick={e => { e.stopPropagation(); setMenuOrgId(null); setRenameDept({ orgId: org.id, name: org.name }); }}
                  >
                    重命名部门
                  </button>
                </span>
              )}
            </span>
          )}
        </div>
        {open && hasChildren && visibleChildren.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  }

  // ─── 弹窗动作 ─────────────────────────────────────────────────────────────
  function openCreateDept(parentId: string) {
    setCreateDept({ parentId, name: '', showParentSelect: false });
  }

  function openCreateUser() {
    const defaultOrg = selectedOrg && (isDeptParentType(selectedOrg.type) || selectedOrg.type === 'provider' || selectedOrg.type === 'group')
      ? selectedOrg.id
      : 'org-pharma';
    setCreateUserOpen({ name: '', account: '', phone: '', email: '', orgId: defaultOrg, error: '' });
  }

  function submitCreateDept() {
    if (!createDept) return;
    const result = addDepartment({ name: createDept.name, parentId: createDept.parentId });
    if (!result.ok) {
      addToast({ type: 'error', title: '新建部门失败', description: result.error });
      return;
    }
    if (result.org) {
      setExpanded(prev => new Set([...prev, createDept.parentId, result.org!.id]));
      selectOrg(result.org.id);
    }
    addToast({ type: 'success', title: '已新建部门', description: createDept.name });
    setCreateDept(null);
  }

  function submitRenameDept() {
    if (!renameDept) return;
    const result = updateDepartment({ orgId: renameDept.orgId, name: renameDept.name });
    if (!result.ok) {
      addToast({ type: 'error', title: '重命名失败', description: result.error });
      return;
    }
    addToast({ type: 'success', title: '部门已重命名', description: renameDept.name });
    setRenameDept(null);
  }

  const moveTarget = moveDept ? orgs.find(o => o.id === moveDept.targetId) : undefined;
  const moveImpact = useMemo(() => {
    if (!moveDept) return null;
    const org = orgs.find(o => o.id === moveDept.orgId);
    if (!org) return null;
    const descendants = orgDescendantIds(orgs, org.id);
    const childDeptCount = descendants.length - 1;
    const subtreePeople = usersInSubtree(users, orgs, org.id).length;
    const directPeople = directUsers(users, org.id).length;
    const scopeAssignments = assignments.filter(
      a => descendants.includes(a.scopeOrgId) && a.status === 'active',
    ).length;
    const deptChildScope = assignments.filter(
      a => descendants.includes(a.scopeOrgId) && a.status === 'active' && (a.scope === 'DEPT_AND_CHILD' || a.scope === 'DEPT'),
    ).length;
    return { org, childDeptCount, subtreePeople, directPeople, scopeAssignments, deptChildScope, highImpact: subtreePeople > 0 || scopeAssignments > 0 };
  }, [assignments, moveDept, orgs, users]);

  function submitMoveDept() {
    if (!moveDept || !moveImpact) return;
    if (moveImpact.highImpact && !moveDept.reason.trim()) {
      setMoveDept({ ...moveDept, reason: moveDept.reason });
      addToast({ type: 'error', title: '需要填写原因', description: '高影响变更（含人员或授权覆盖）必须填写调整原因。' });
      return;
    }
    const result = updateDepartment({ orgId: moveDept.orgId, parentId: moveDept.targetId, reason: moveDept.reason.trim() || undefined });
    if (!result.ok) {
      addToast({ type: 'error', title: '调整失败', description: result.error });
      return;
    }
    addToast({
      type: 'success',
      title: '已调整汇报上级',
      description: `${moveImpact.org.name} → ${moveTarget?.name ?? ''}。人员所属部门路径已变化，角色权限覆盖范围未自动迁移。`,
    });
    setMoveDept(null);
  }

  function submitCreateUser() {
    if (!createUserOpen) return;
    const name = createUserOpen.name.trim();
    const account = createUserOpen.account.trim();
    const phone = createUserOpen.phone.trim();
    const email = createUserOpen.email.trim();
    const fail = (error: string) => setCreateUserOpen({ ...createUserOpen, error });
    if (!account) return fail('请填写用户名');
    if (!name) return fail('请填写姓名');
    if (!phone) return fail('请填写手机号');
    if (!/^1\d{10}$/.test(phone)) return fail('手机号格式不正确，应为 1 开头的 11 位数字');
    if (!email) return fail('请填写邮箱');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('邮箱格式不正确');
    const result = createUser({ name, account, phone, email, orgId: createUserOpen.orgId });
    if (!result.ok) return fail(result.error || '新建用户失败');
    if (result.user) {
      setExpanded(prev => new Set([...prev, result.user!.orgId]));
      setSelectedOrgId(result.user.orgId);
      setSelectedUserId(result.user.id);
      setTab('basic');
    }
    addToast({ type: 'success', title: '已新建用户', description: `${name} · ${account}` });
    setCreateUserOpen(null);
  }

  const transferCandidates = useMemo(() => {
    if (!transferIn || !selectedOrg) return [];
    const root = enterpriseRootOf(orgs, selectedOrg.id);
    return users.filter(u => {
      if (u.orgId === selectedOrg.id) return false;
      const uRoot = enterpriseRootOf(orgs, u.orgId);
      return root && uRoot && uRoot.id === root.id;
    });
  }, [orgs, selectedOrg, transferIn, users]);

  function submitTransferIn() {
    if (!transferIn || !selectedOrg) return;
    const result = setUserOrg({ userId: transferIn.userId, orgId: selectedOrg.id });
    if (!result.ok) {
      addToast({ type: 'error', title: '调入失败', description: result.error });
      return;
    }
    const user = users.find(u => u.id === transferIn.userId);
    addToast({ type: 'success', title: '已调入', description: `${user?.name} 已调入 ${selectedOrg.name}。已有角色分配及权限覆盖范围保持不变。` });
    setTransferIn(null);
  }

  const moveUserTarget = moveUser ? orgs.find(o => o.id === moveUser.targetId) : undefined;
  const moveUserOptions = useMemo(() => {
    if (!moveUser) return [];
    const user = users.find(u => u.id === moveUser.userId);
    if (!user) return [];
    const root = enterpriseRootOf(orgs, user.orgId);
    return orgs.filter(o => {
      if (o.id === user.orgId) return false;
      if (!isDeptParentType(o.type) && o.type !== 'provider' && o.type !== 'group') return false;
      const oRoot = enterpriseRootOf(orgs, o.id);
      return root && oRoot && oRoot.id === root.id;
    });
  }, [moveUser, orgs, users]);

  const moveUserAssignments = useMemo(() => {
    if (!moveUser) return [] as AssignmentWithRole[];
    return assignments
      .filter(a => a.userId === moveUser.userId && a.status === 'active')
      .map(a => ({ ...a, roleName: roles.find(r => r.id === a.roleId)?.name ?? a.roleId }));
  }, [assignments, moveUser, roles]);

  const lastTransferAudit = useMemo(() => {
    if (!moveUser) return undefined;
    const user = users.find(u => u.id === moveUser.userId);
    if (!user) return undefined;
    return auditEvents.find(e => e.action === '用户调岗' && e.target.includes(user.name));
  }, [auditEvents, moveUser, users]);

  function submitMoveUser() {
    if (!moveUser) return;
    const result = setUserOrg({ userId: moveUser.userId, orgId: moveUser.targetId });
    if (!result.ok) {
      setMoveUser({ ...moveUser, error: result.error || '调整失败' });
      return;
    }
    const user = users.find(u => u.id === moveUser.userId);
    addToast({
      type: 'success',
      title: '已调整所属部门',
      description: `${user?.name} → ${moveUserTarget?.name}。仅变更人员所属部门，角色分配及权限覆盖范围保持不变。`,
    });
    setMoveUser(null);
  }

  const assignUser = assign ? users.find(u => u.id === assign.userId) : undefined;
  const assignRole = assign ? roles.find(r => r.id === assign.roleId) : undefined;
  const assignAnchor = assignUser && assignRole ? resolveGrantAnchor(orgs, assignUser.orgId, assignRole) : null;
  const assignHighRisk = assignRole ? isHighRiskRole(assignRole) : false;
  const assignTemporary = Boolean(assign?.to);
  const assignReasonRequired = assignHighRisk || assignTemporary;

  function submitAssign() {
    if (!assign) return;
    const result = createAssignment({
      userId: assign.userId,
      roleId: assign.roleId,
      effectiveFrom: assign.from,
      effectiveTo: assign.to || undefined,
      reason: assign.reason.trim() || undefined,
    });
    if (!result.ok) {
      setAssign({ ...assign, error: result.error || '授权失败' });
      return;
    }
    addToast({
      type: result.pendingReview ? 'warning' : 'success',
      title: result.pendingReview ? '已提交，待复核后生效' : '角色分配已生效',
      description: `${assignUser?.name} × ${assignRole?.name}`,
    });
    setAssign(null);
  }

  const revokeTarget = revoke ? assignments.find(a => a.id === revoke.assignmentId) : undefined;
  const revokeUser = revokeTarget ? users.find(u => u.id === revokeTarget.userId) : undefined;
  const revokeRole = revokeTarget ? roles.find(r => r.id === revokeTarget.roleId) : undefined;

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
    addToast({ type: 'success', title: '角色已回收', description: `${revokeUser?.name} × ${revokeRole?.name} · 历史保留可查` });
    setRevoke(null);
  }

  const disableTarget = disableUser ? users.find(u => u.id === disableUser.userId) : undefined;
  const disableActiveCount = disableUser
    ? assignments.filter(a => a.userId === disableUser.userId && a.status === 'active').length
    : 0;

  function submitDisableUser() {
    if (!disableUser) return;
    const result = setUserStatus(disableUser.userId, 'disabled', {
      reason: '管理员停用',
      revokeAssignments: disableUser.revokeAll,
    });
    if (!result.ok) {
      addToast({ type: 'error', title: '停用失败', description: result.error });
      return;
    }
    addToast({
      type: 'success',
      title: '账号已停用',
      description: disableUser.revokeAll && disableActiveCount > 0
        ? `已同步回收 ${disableActiveCount} 条有效角色分配。`
        : `有效角色 ${disableActiveCount} 条保留冻结记录，不再参与新会话计算。`,
    });
    setDisableUser(null);
  }

  // ─── 布局 ─────────────────────────────────────────────────────────────────
  const deptParentOptions = (enterpriseOrgId: string, excludeIds: Set<string> = new Set()) =>
    orgs.filter(o => {
      if (!isDeptParentType(o.type)) return false;
      if (excludeIds.has(o.id)) return false;
      const root = enterpriseRootOf(orgs, o.id);
      return root?.id === enterpriseOrgId;
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="用户与组织"
        description="管理账号、所属部门与角色；角色模板请在「角色管理」中维护。"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {canCreate && (
              <Button variant="outline" size="md" icon={<Plus size={14} />} onClick={() => openCreateDept(selectedOrg && isDeptParentType(selectedOrg.type) ? selectedOrg.id : 'org-pharma')}>
                新建部门
              </Button>
            )}
            {canCreate && (
              <Button variant="primary" size="md" icon={<UserPlus size={14} />} onClick={openCreateUser}>
                新建用户
              </Button>
            )}
          </div>
        }
      />

      <div style={{ flex: 1, overflow: 'hidden', padding: 16, display: 'flex', gap: 12, minHeight: 0 }}>
        {/* 左：组织树 */}
        <div style={{
          width: 280, minWidth: 240, flexShrink: 0, background: '#fff',
          border: '1px solid var(--color-border)', borderRadius: 8, padding: 12,
          display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 8 }}>组织</div>
          <div style={{ position: 'relative', marginBottom: 8, flexShrink: 0 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: 11, color: '#9CA3AF' }} />
            <input
              value={treeQuery}
              onChange={e => setTreeQuery(e.target.value)}
              placeholder="搜索企业、部门或人员"
              style={{ ...inputStyle, paddingLeft: 30 }}
            />
          </div>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {orgChildren(orgs).map(root => renderTreeNode(root, 0))}
            {tq && visibleIds && visibleIds.size === 0 && (
              <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', padding: '12px 8px' }}>没有匹配的组织</div>
            )}
            {tq && matchedUsers.length > 0 && (
              <div style={{ marginTop: 8, borderTop: '1px solid #F3F4F6', paddingTop: 8 }}>
                <div style={{ fontSize: 'var(--fs-11)', fontWeight: 600, color: '#9CA3AF', padding: '4px 8px' }}>命中人员</div>
                {matchedUsers.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      const org = orgs.find(o => o.id === u.orgId);
                      if (org) {
                        setExpanded(prev => {
                          const next = new Set(prev);
                          let cur: PermOrg | undefined = org;
                          const guard = new Set<string>();
                          while (cur && !guard.has(cur.id)) {
                            guard.add(cur.id);
                            next.add(cur.id);
                            cur = cur.parentId ? orgs.find(o => o.id === cur!.parentId) : undefined;
                          }
                          return next;
                        });
                        selectOrg(org.id, u.id);
                      }
                    }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%',
                      padding: '6px 8px', background: 'none', border: 'none', borderRadius: 6,
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', fontWeight: 500 }}>{u.name}</span>
                    <span style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.orgName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedOrg && (
            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', paddingTop: 8, flexShrink: 0, lineHeight: 1.5, borderTop: '1px solid #F3F4F6', marginTop: 8 }}>
              {orgPathLabel(orgs, selectedOrg.id)}
              <br />
              直属 {directCount} 人{subtreeCount > directCount ? ` · 含下级 ${subtreeCount} 人` : ''}
            </div>
          )}
        </div>

        {/* 中：人员列表 */}
        <div style={{ flex: 1, minWidth: 0, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>
                {selectedOrg?.name ?? '人员列表'}
              </span>
              <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>
                当前部门直属 <strong style={{ color: 'var(--color-text-1)' }}>{directCount}</strong> 人；含下级 <strong style={{ color: 'var(--color-text-1)' }}>{subtreeCount}</strong> 人
              </span>
              <label
                title="勾选后同时显示下级部门（含更深层级）的人员；仅影响本列表显示，不改变人员归属"
                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#374151', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={includeChildren}
                  onChange={e => setIncludeChildren(e.target.checked)}
                  style={{ accentColor: 'var(--color-brand)', width: 14, height: 14 }}
                />
                包含下级部门
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="姓名 / 账号"
                style={{ ...inputStyle, width: 150, height: 30 }}
              />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 110, height: 30 }}>
                <option value="">账号状态</option>
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ ...inputStyle, width: 160, height: 30 }}>
                <option value="">全部角色</option>
                {roleFilterOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select value={hasRoleFilter} onChange={e => setHasRoleFilter(e.target.value)} style={{ ...inputStyle, width: 110, height: 30 }}>
                <option value="">是否有角色</option>
                <option value="yes">有角色</option>
                <option value="no">无角色</option>
              </select>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {people.length === 0 ? (
              <EmptyState
                title="该部门暂未添加直属人员"
                description={selectedOrg?.type === 'department' ? undefined : '当前节点暂无直属人员，可开启「包含下级部门」查看子树人员。'}
                action={selectedOrg?.type === 'department' && canCreate ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="primary" size="sm" icon={<UserPlus size={13} />} onClick={openCreateUser}>新建用户</Button>
                    <Button variant="outline" size="sm" onClick={() => setTransferIn({ userId: '' })}>从现有部门调入</Button>
                  </div>
                ) : undefined}
              />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['姓名 / 账号', '所属部门', '账号状态', '角色', '最近授权', '操作'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((u, idx) => {
                    const activeRoleIds = activeRoleIdsOf(u.id);
                    const activeRoleNames = Array.from(activeRoleIds)
                      .map(id => roles.find(r => r.id === id)?.name)
                      .filter((n): n is string => Boolean(n));
                    return (
                      <tr
                        key={u.id}
                        onClick={() => { setSelectedUserId(u.id); setTab('basic'); }}
                        style={{
                          background: selectedUserId === u.id ? 'var(--color-brand-subtle)' : idx % 2 === 0 ? '#fff' : '#FAFAFA',
                          cursor: 'pointer',
                        }}
                      >
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                              background: 'linear-gradient(135deg, var(--color-brand), #2F6BCE)',
                              color: '#fff', fontSize: 'var(--fs-12)', fontWeight: 600,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}>{u.name.slice(0, 1)}</span>
                            <div>
                              <div style={{ fontWeight: 600 }}>{u.name}</div>
                              <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{u.account}</div>
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>{u.orgName}</td>
                        <td style={tdStyle}><StatusTag status={u.accountStatus === 'enabled' ? '启用' : '停用'} size="sm" /></td>
                        <td style={tdStyle}>
                          {activeRoleNames.length === 0 ? (
                            <span style={{ color: '#9CA3AF' }}>0 个</span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 'var(--fs-12)', color: '#667085', marginRight: 2 }}>{activeRoleNames.length} 个</span>
                              {activeRoleNames.slice(0, 2).map(n => <span key={n} style={chipStyle}>{n}</span>)}
                              {activeRoleNames.length > 2 && <span style={{ ...chipStyle, color: 'var(--color-brand)' }}>+{activeRoleNames.length - 2}</span>}
                            </div>
                          )}
                        </td>
                        <td style={{ ...tdStyle, color: '#667085', whiteSpace: 'nowrap' }}>{latestAssignmentAt(assignments, u.id) ?? '—'}</td>
                        <td style={tdStyle}>
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedUserId(u.id); setTab('basic'); }}>查看详情</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 右：用户详情 / 组织节点详情 */}
        {selectedUser ? (
          <UserDetailPanel
            user={selectedUser}
            tab={tab}
            onTabChange={setTab}
            assignments={assignments}
            roles={roles}
            orgs={orgs}
            auditEvents={auditEvents}
            canEdit={canEdit}
            canAssign={canAssign && selectedUser.accountStatus === 'enabled'}
            canRevoke={canRevoke}
            onAssign={() => setAssign({ userId: selectedUser.id, roleId: '', from: todayISO(), to: '', reason: '', error: '' })}
            onMoveOrg={() => setMoveUser({ userId: selectedUser.id, targetId: '', error: '' })}
            onDisable={() => setDisableUser({ userId: selectedUser.id, revokeAll: false })}
            onEnable={() => setEnableUserId(selectedUser.id)}
            onRevoke={assignmentId => setRevoke({ assignmentId, reason: '', error: '' })}
          />
        ) : (
          <OrgDetailPanel
            org={selectedOrg}
            orgs={orgs}
            users={users}
            auditEvents={auditEvents}
            onSelectOrg={selectOrg}
          />
        )}
      </div>

      {/* ── 弹窗：新建部门 ── */}
      {createDept && (
        <Modal
          open
          title="新建下级部门"
          onClose={() => setCreateDept(null)}
          width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setCreateDept(null)}>取消</Button>
              <Button variant="primary" onClick={submitCreateDept}>确认新建</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>
              部门表达企业内部的汇报与归属关系。药厂与服务商的合作关系不在部门树中维护。
            </InfoBanner>
            <Field label="所属企业">
              <input value={enterpriseRootOf(orgs, createDept.parentId)?.name ?? '—'} disabled style={inputStyle} />
            </Field>
            <Field label="上级部门" required hint={orgPathLabel(orgs, createDept.parentId)}>
              {createDept.showParentSelect ? (
                <select
                  value={createDept.parentId}
                  onChange={e => setCreateDept({ ...createDept, parentId: e.target.value })}
                  style={inputStyle}
                >
                  {deptParentOptions(enterpriseRootOf(orgs, createDept.parentId)?.id ?? '').map(o => (
                    <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>
                  ))}
                </select>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input value={orgs.find(o => o.id === createDept.parentId)?.name ?? ''} disabled style={inputStyle} />
                  <Button variant="outline" size="sm" onClick={() => setCreateDept({ ...createDept, showParentSelect: true })}>更换上级</Button>
                </div>
              )}
            </Field>
            <Field label="部门名称" required hint={
              createDept.name.trim() && sameLevelDeptNameExists(orgs, createDept.parentId, createDept.name)
                ? <span style={{ color: '#C73A3A' }}>该上级下已存在同名部门</span>
                : '实时校验同级重名'
            }>
              <input
                value={createDept.name}
                onChange={e => setCreateDept({ ...createDept, name: e.target.value })}
                style={inputStyle}
                placeholder="例如：华北大区、西安办事处"
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：重命名部门 ── */}
      {renameDept && (
        <Modal
          open
          title="重命名部门"
          onClose={() => setRenameDept(null)}
          width={480}
          footer={
            <>
              <Button variant="outline" onClick={() => setRenameDept(null)}>取消</Button>
              <Button variant="primary" onClick={submitRenameDept}>保存</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="当前路径">{orgPathLabel(orgs, renameDept.orgId)}</Field>
            <Field label="部门名称" required hint={
              renameDept.name.trim() && sameLevelDeptNameExists(orgs, orgs.find(o => o.id === renameDept.orgId)?.parentId ?? '', renameDept.name, renameDept.orgId)
                ? <span style={{ color: '#C73A3A' }}>该上级下已存在同名部门</span>
                : undefined
            }>
              <input value={renameDept.name} onChange={e => setRenameDept({ ...renameDept, name: e.target.value })} style={inputStyle} />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：调整汇报上级 ── */}
      {moveDept && moveImpact && (
        <Modal
          open
          title="调整汇报上级"
          onClose={() => setMoveDept(null)}
          width={560}
          footer={
            <>
              <Button variant="outline" onClick={() => setMoveDept(null)}>取消</Button>
              <Button variant="primary" onClick={submitMoveDept}>确认调整汇报上级</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 14, display: 'grid', gap: 8, fontSize: 'var(--fs-13)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#667085' }}>原上级</span>
                <strong>{orgs.find(o => o.id === moveImpact.org.parentId)?.name ?? '—'}</strong>
                <CornerUpRight size={14} style={{ color: '#9CA3AF' }} />
                <span style={{ color: '#667085' }}>新上级</span>
                <strong style={{ color: moveTarget ? 'var(--color-brand)' : '#C73A3A' }}>{moveTarget?.name ?? '请选择'}</strong>
              </div>
              <div style={{ color: '#667085' }}>
                随节点移动的下级部门 <strong style={{ color: 'var(--color-text-1)' }}>{moveImpact.childDeptCount}</strong> 个
                {' · '}直属人员 <strong style={{ color: 'var(--color-text-1)' }}>{moveImpact.directPeople}</strong> 人
                {' · '}子树人员 <strong style={{ color: 'var(--color-text-1)' }}>{moveImpact.subtreePeople}</strong> 人
              </div>
              <div style={{ color: '#667085' }}>
                以该部门为权限覆盖根节点的有效角色分配 <strong style={{ color: moveImpact.scopeAssignments > 0 ? '#C77A16' : 'var(--color-text-1)' }}>{moveImpact.scopeAssignments}</strong> 条
                {moveImpact.deptChildScope > 0 && <span style={{ color: '#C77A16' }}>（含本部门及下级范围 {moveImpact.deptChildScope} 条，实际覆盖集合可能变化）</span>}
              </div>
            </div>
            <InfoBanner tone="warning">
              人员所属部门路径会变化，角色权限覆盖范围不自动迁移；若范围策略含「本部门及下级」，其实际覆盖集合可能变化。
            </InfoBanner>
            <Field label="新上级" required>
              <select
                value={moveDept.targetId}
                onChange={e => setMoveDept({ ...moveDept, targetId: e.target.value })}
                style={inputStyle}
              >
                <option value="">选择同企业内的部门或药厂根节点</option>
                {deptParentOptions(enterpriseRootOf(orgs, moveDept.orgId)?.id ?? '', new Set(orgDescendantIds(orgs, moveDept.orgId))).map(o => (
                  <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>
                ))}
              </select>
            </Field>
            <Field label="调整原因" required={moveImpact.highImpact} hint={moveImpact.highImpact ? '高影响变更必须填写原因' : '选填'}>
              <textarea
                value={moveDept.reason}
                onChange={e => setMoveDept({ ...moveDept, reason: e.target.value })}
                rows={2}
                style={{ ...inputStyle, height: 'auto', padding: 10, resize: 'vertical' }}
                placeholder="例如：大区合并，西北大区划归销售二部"
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：新建用户 ── */}
      {createUserOpen && (
        <Modal
          open
          title="新建用户"
          onClose={() => setCreateUserOpen(null)}
          width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setCreateUserOpen(null)}>取消</Button>
              <Button variant="primary" onClick={submitCreateUser}>创建账号</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>
              创建后账号为启用状态、无任何角色。分配角色请在该用户详情的「角色与访问范围」中进行。
            </InfoBanner>
            {createUserOpen.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{createUserOpen.error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="用户名" required hint="用于登录，租户内唯一">
                <input
                  value={createUserOpen.account}
                  onChange={e => setCreateUserOpen({ ...createUserOpen, account: e.target.value, error: '' })}
                  style={inputStyle}
                  placeholder="例如：zhangsan"
                />
              </Field>
              <Field label="姓名" required>
                <input
                  value={createUserOpen.name}
                  onChange={e => setCreateUserOpen({ ...createUserOpen, name: e.target.value, error: '' })}
                  style={inputStyle}
                  placeholder="真实姓名"
                />
              </Field>
              <Field label="手机号" required hint="11 位手机号">
                <input
                  value={createUserOpen.phone}
                  onChange={e => setCreateUserOpen({ ...createUserOpen, phone: e.target.value, error: '' })}
                  style={inputStyle}
                  placeholder="例如：13901350000"
                  maxLength={11}
                />
              </Field>
              <Field label="邮箱" required>
                <input
                  value={createUserOpen.email}
                  onChange={e => setCreateUserOpen({ ...createUserOpen, email: e.target.value, error: '' })}
                  style={inputStyle}
                  placeholder="例如：zhangsan@company.com"
                />
              </Field>
            </div>
            <Field label="所属部门" required>
              <select
                value={createUserOpen.orgId}
                onChange={e => setCreateUserOpen({ ...createUserOpen, orgId: e.target.value })}
                style={inputStyle}
              >
                {orgs.filter(o => isDeptParentType(o.type) || o.type === 'provider' || o.type === 'group' || o.type === 'platform').map(o => (
                  <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>
                ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：从现有部门调入 ── */}
      {transferIn && (
        <Modal
          open
          title={`从现有部门调入 · ${selectedOrg?.name ?? ''}`}
          onClose={() => setTransferIn(null)}
          width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setTransferIn(null)}>取消</Button>
              <Button variant="primary" disabled={!transferIn.userId} onClick={submitTransferIn}>确认调入</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>
              调入仅变更人员所属部门。现有角色分配及权限覆盖范围保持不变；跨企业调岗会被拒绝。
            </InfoBanner>
            <Field label="选择人员" required hint="仅展示同企业内、当前不在本部门的人员">
              <select
                value={transferIn.userId}
                onChange={e => setTransferIn({ userId: e.target.value })}
                style={inputStyle}
              >
                <option value="">选择要调入的人员</option>
                {transferCandidates.map(u => (
                  <option key={u.id} value={u.id}>{u.name} · {u.account}（{u.orgName}）</option>
                ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：调整所属部门（调岗） ── */}
      {moveUser && (
        <Modal
          open
          title="调整所属部门"
          onClose={() => setMoveUser(null)}
          width={560}
          footer={
            <>
              <Button variant="outline" onClick={() => setMoveUser(null)}>取消</Button>
              <Button variant="primary" disabled={!moveUser.targetId} onClick={submitMoveUser}>确认调整</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>
              本操作仅变更人员所属部门。现有角色分配及权限覆盖范围保持不变；如需同步调整访问范围，请在「角色与访问范围」中重新分配对应角色。
            </InfoBanner>
            {moveUser.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{moveUser.error}</div>}
            <Field label="当前所属">
              {users.find(u => u.id === moveUser.userId)?.orgName ?? '—'}
              {lastTransferAudit && (
                <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 4 }}>
                  最近一次调岗：{lastTransferAudit.time} · {lastTransferAudit.beforeSummary} → {lastTransferAudit.afterSummary}
                </div>
              )}
            </Field>
            <Field label="调整到" required hint={moveUser.targetId ? orgPathLabel(orgs, moveUser.targetId) : '仅同企业内的部门/团队可选'}>
              <select
                value={moveUser.targetId}
                onChange={e => setMoveUser({ ...moveUser, targetId: e.target.value, error: '' })}
                style={inputStyle}
              >
                <option value="">选择目标部门</option>
                {moveUserOptions.map(o => (
                  <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>
                ))}
              </select>
            </Field>
            <div>
              <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6, fontWeight: 500 }}>
                有效角色与权限覆盖范围（调岗后保持不变）
              </div>
              {moveUserAssignments.length === 0 ? (
                <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>该用户暂无有效角色</div>
              ) : (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
                  {moveUserAssignments.map((a, idx) => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      padding: '8px 12px', background: idx % 2 === 0 ? '#fff' : '#FAFAFA',
                      borderTop: idx === 0 ? undefined : '1px solid #F3F4F6',
                    }}>
                      <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>{a.roleName}</span>
                      <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>{a.scopeOrgName} · {scopeLabel(a.scope)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：分配角色 ── */}
      {assign && (
        <Modal
          open
          title="分配角色"
          onClose={() => setAssign(null)}
          width={560}
          footer={
            <>
              <Button variant="outline" onClick={() => setAssign(null)}>取消</Button>
              <Button variant="primary" onClick={submitAssign}>确认分配</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {assign.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{assign.error}</div>}
            <Field label="用户">
              {assignUser ? `${assignUser.name} · ${assignUser.account} · ${assignUser.orgName}` : '—'}
            </Field>
            <Field label="角色" required>
              <select
                value={assign.roleId}
                onChange={e => setAssign({ ...assign, roleId: e.target.value, error: '' })}
                style={inputStyle}
              >
                <option value="">选择启用角色</option>
                {roles.filter(r => r.status === 'enabled').map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}（{r.kind === 'preset' ? '预置' : '定制'}{isHighRiskRole(r) ? ' · 高危' : ''}）
                  </option>
                ))}
              </select>
            </Field>
            {assignAnchor && (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: '8px 12px', fontSize: 'var(--fs-13)', color: '#667085', lineHeight: 1.6 }}>
                权限覆盖范围（按角色范围策略与人员所属组织自动推导，不可手工改写）：
                <strong style={{ color: 'var(--color-text-1)' }}> {scopeLabel(assignAnchor.scope)} · {assignAnchor.scopeOrgName}</strong>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="生效日期" required>
                <input type="date" value={assign.from} onChange={e => setAssign({ ...assign, from: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="到期日期" hint="临时授权必填">
                <input type="date" value={assign.to} onChange={e => setAssign({ ...assign, to: e.target.value })} style={inputStyle} />
              </Field>
            </div>
            <Field label={`授权理由${assignReasonRequired ? '' : '（选填）'}`} required={assignReasonRequired} hint={assignReasonRequired ? '高危角色或临时授权必须填写' : undefined}>
              <textarea
                value={assign.reason}
                onChange={e => setAssign({ ...assign, reason: e.target.value })}
                rows={2}
                style={{ ...inputStyle, height: 'auto', padding: 10, resize: 'vertical' }}
                placeholder="例如：接替离职同事负责西北大区结算复核"
              />
            </Field>
            {assignHighRisk && (
              <InfoBanner tone="warning">
                高危角色（全平台范围或含删除、审核、导出等操作）提交后进入待复核状态，双人复核通过后才生效。
              </InfoBanner>
            )}
          </div>
        </Modal>
      )}

      {/* ── 弹窗：回收角色 ── */}
      {revoke && revokeTarget && (
        <Modal
          open
          title="回收角色"
          onClose={() => setRevoke(null)}
          width={560}
          footer={
            <>
              <Button variant="outline" onClick={() => setRevoke(null)}>取消</Button>
              <Button variant="danger" onClick={submitRevoke}>确认回收</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {revoke.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{revoke.error}</div>}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 14, display: 'grid', gap: 8, fontSize: 'var(--fs-13)' }}>
              <KV label="用户" value={`${revokeUser?.name ?? ''} · ${revokeUser?.account ?? ''}`} />
              <KV label="角色" value={revokeRole?.name ?? revokeTarget.roleId} />
              <KV label="权限覆盖范围" value={`${revokeTarget.scopeOrgName} · ${scopeLabel(revokeTarget.scope)}`} />
              <KV label="生效期" value={`${revokeTarget.effectiveFrom}${revokeTarget.effectiveTo ? ` ~ ${revokeTarget.effectiveTo}` : ' 起长期'}`} />
              <KV label="受影响能力" value={revokeRole ? summarizePerms(revokeRole) : '—'} />
            </div>
            <Field label="回收原因" required>
              <textarea
                value={revoke.reason}
                onChange={e => setRevoke({ ...revoke, reason: e.target.value, error: '' })}
                rows={2}
                style={{ ...inputStyle, height: 'auto', padding: 10, resize: 'vertical' }}
                placeholder="例如：岗位调整，不再承担该职责"
              />
            </Field>
            <InfoBanner tone="warning">
              回收后，{revokeUser?.name ?? '该用户'}的下一次请求起将立即失去「{revokeRole?.name ?? '该角色'}」带来的全部能力：
              对应页面不再可见、按钮不可操作、该角色权限覆盖范围内的数据不再可见。
            </InfoBanner>
            <InfoBanner>
              该条分配转为「已回收」状态，历史与审计保留可查（不是删除）；不影响该用户其他角色分配，也不影响角色模板本身。
            </InfoBanner>
          </div>
        </Modal>
      )}

      {/* ── 弹窗：停用账号 ── */}
      {disableUser && (
        <Modal
          open
          title="停用账号"
          onClose={() => setDisableUser(null)}
          width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setDisableUser(null)}>取消</Button>
              <Button variant="danger" onClick={submitDisableUser}>确认停用</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 14, display: 'grid', gap: 8, fontSize: 'var(--fs-13)' }}>
              <KV label="用户" value={`${disableTarget?.name ?? ''} · ${disableTarget?.account ?? ''}`} />
              <KV label="有效角色" value={`${disableActiveCount} 条`} />
            </div>
            <InfoBanner tone="warning">
              停用后该账号禁止登录，全部有效角色不参与新会话计算；其当前活跃会话将在下一次请求时失效。
            </InfoBanner>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--fs-13)', color: '#374151', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={disableUser.revokeAll}
                disabled={disableActiveCount === 0}
                onChange={e => setDisableUser({ ...disableUser, revokeAll: e.target.checked })}
                style={{ accentColor: '#C73A3A', width: 15, height: 15, marginTop: 2 }}
              />
              <span>
                同步回收全部 {disableActiveCount} 条有效角色分配
                <span style={{ display: 'block', fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>
                  不勾选则保留冻结记录，启用账号后角色自动恢复参与计算
                </span>
              </span>
            </label>
          </div>
        </Modal>
      )}

      {enableUserId && (
        <ConfirmDialog
          open
          title="启用账号"
          description={`启用后 ${users.find(u => u.id === enableUserId)?.name ?? ''} 可重新登录，冻结的有效角色分配将恢复参与权限计算。`}
          confirmLabel="确认启用"
          onConfirm={() => {
            const result = setUserStatus(enableUserId, 'enabled', { reason: '管理员启用' });
            if (!result.ok) addToast({ type: 'error', title: '启用失败', description: result.error });
            else addToast({ type: 'success', title: '账号已启用' });
            setEnableUserId(null);
          }}
          onCancel={() => setEnableUserId(null)}
        />
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--fs-13)' }}>
      <span style={{ color: '#9CA3AF', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--color-text-1)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// ─── 右侧：用户详情 ───────────────────────────────────────────────────────────
function UserDetailPanel({
  user, tab, onTabChange, assignments, roles, orgs, auditEvents,
  canEdit, canAssign, canRevoke,
  onAssign, onMoveOrg, onDisable, onEnable, onRevoke,
}: {
  user: PermUser;
  tab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  assignments: RoleAssignment[];
  roles: { id: string; name: string; kind: 'preset' | 'custom' }[];
  orgs: PermOrg[];
  auditEvents: { time: string; action: string; target: string; reason: string; beforeSummary?: string; afterSummary?: string }[];
  canEdit: boolean;
  canAssign: boolean;
  canRevoke: boolean;
  onAssign: () => void;
  onMoveOrg: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onRevoke: (assignmentId: string) => void;
}) {
  const myAssignments: AssignmentWithRole[] = assignments
    .filter(a => a.userId === user.id)
    .map(a => ({ ...a, roleName: roles.find(r => r.id === a.roleId)?.name ?? a.roleId }))
    .sort((x, y) => ASSIGNMENT_ORDER[x.status] - ASSIGNMENT_ORDER[y.status]);
  const activeCount = myAssignments.filter(a => a.status === 'active').length;
  const myAudits = auditEvents.filter(e => e.target.includes(user.name)).slice(0, 30);
  const enterprise = enterpriseRootOf(orgs, user.orgId);

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'basic', label: '基本信息' },
    { id: 'roles', label: '角色与访问范围' },
    { id: 'audit', label: '操作记录' },
  ];

  return (
    <div style={{
      width: 360, flexShrink: 0, background: '#fff', border: '1px solid var(--color-border)',
      borderRadius: 8, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
    }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--color-brand), #2F6BCE)',
            color: '#fff', fontSize: 'var(--fs-15)', fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{user.name.slice(0, 1)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--fs-15)', fontWeight: 600 }}>{user.name}</span>
              <StatusTag status={user.accountStatus === 'enabled' ? '启用' : '停用'} size="sm" />
            </div>
            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{user.account}</div>
          </div>
        </div>
        <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 8, lineHeight: 1.5 }}>
          所属：{orgPathLabel(orgs, user.orgId)}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {canAssign ? (
            <Button variant="primary" size="sm" onClick={onAssign}>分配角色</Button>
          ) : user.accountStatus !== 'enabled' ? (
            <span style={{ fontSize: 'var(--fs-12)', color: '#C77A16', alignSelf: 'center' }}>账号已停用，启用后才能分配角色</span>
          ) : null}
          {canEdit && <Button variant="outline" size="sm" onClick={onMoveOrg}>调整所属部门</Button>}
          {canEdit && user.accountStatus === 'enabled' && (
            <Button variant="ghost" size="sm" onClick={onDisable}>停用账号</Button>
          )}
          {canEdit && user.accountStatus !== 'enabled' && (
            <Button variant="ghost" size="sm" onClick={onEnable}>启用账号</Button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            style={{
              flex: 1, padding: '9px 4px', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.id ? '2px solid var(--color-brand)' : '2px solid transparent',
              fontSize: 'var(--fs-12)', fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? 'var(--color-text-1)' : '#667085',
            }}
          >
            {t.label}{t.id === 'roles' && activeCount > 0 ? ` · ${activeCount}` : ''}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: 14 }}>
        {tab === 'basic' && (
          <div style={{ display: 'grid', gap: 4 }}>
            <KV label="姓名" value={user.name} />
            <KV label="用户名" value={user.account} />
            <KV label="手机号" value={user.phone || '—'} />
            <KV label="邮箱" value={user.email || '—'} />
            <KV label="所属企业" value={enterprise?.name ?? '—'} />
            <KV label="所属部门" value={orgPathLabel(orgs, user.orgId)} />
            <KV label="账号状态" value={user.accountStatus === 'enabled' ? '启用' : '停用'} />
            <KV label="创建时间" value={user.createdAt ?? '—'} />
            <KV label="最近登录" value={user.lastLoginAt ?? '—'} />
            <KV label="有效角色" value={`${activeCount} 条`} />
          </div>
        )}

        {tab === 'roles' && (
          myAssignments.length === 0 ? (
            <EmptyState title="暂无角色分配" description="点击上方「分配角色」为该用户授予角色。" />
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {myAssignments.map(a => (
                <div key={a.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, flex: 1, minWidth: 0 }}>{a.roleName}</span>
                    <StatusTag status={grantStatusLabel(a.status)} size="sm" />
                  </div>
                  <KV label="权限覆盖范围" value={`${a.scopeOrgName} · ${scopeLabel(a.scope)}`} />
                  <KV label="生效期" value={`${a.effectiveFrom}${a.effectiveTo ? ` ~ ${a.effectiveTo}` : ' 起长期'}`} />
                  <KV label="授权人" value={`${a.grantedBy} · ${a.grantedAt}`} />
                  {a.status === 'revoked' && a.revokedAt && <KV label="回收" value={`${a.revokedBy ?? '—'} · ${a.revokedAt}`} />}
                  {a.reason && <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', lineHeight: 1.5 }}>理由:{a.reason}</div>}
                  {canRevoke && (a.status === 'active' || a.status === 'pending_review') && (
                    <div>
                      <Button variant="ghost" size="sm" onClick={() => onRevoke(a.id)}>回收</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'audit' && (
          myAudits.length === 0 ? (
            <EmptyState title="暂无操作记录" description="该用户的调岗、账号状态、角色授予/回收将在此留痕。" />
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {myAudits.map(e => (
                <div key={`${e.time}-${e.action}-${e.target}`} style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>{e.action}</span>
                    <span style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{e.time}</span>
                  </div>
                  {(e.beforeSummary || e.afterSummary) && (
                    <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 2 }}>
                      {e.beforeSummary ?? '—'} → {e.afterSummary ?? '—'}
                    </div>
                  )}
                  {e.reason && <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>{e.reason}</div>}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── 右侧：组织节点详情（未选用户时） ────────────────────────────────────────
function OrgDetailPanel({
  org, orgs, users, auditEvents, onSelectOrg,
}: {
  org?: PermOrg;
  orgs: PermOrg[];
  users: PermUser[];
  auditEvents: { time: string; action: string; target: string; reason: string; beforeSummary?: string; afterSummary?: string }[];
  onSelectOrg: (id: string) => void;
}) {
  if (!org) {
    return (
      <div style={{
        width: 360, flexShrink: 0, background: '#fff', border: '1px solid var(--color-border)',
        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <EmptyState title="请选择组织节点" description="从左侧树选择企业或部门查看详情" />
      </div>
    );
  }
  const children = orgChildren(orgs, org.id);
  const direct = directUsers(users, org.id);
  const subtree = usersInSubtree(users, orgs, org.id).length;
  const enterprise = enterpriseRootOf(orgs, org.id);
  const changeLog = auditEvents
    .filter(e => e.target === org.name || e.target.includes(org.name))
    .slice(0, 3);

  return (
    <div style={{
      width: 360, flexShrink: 0, background: '#fff', border: '1px solid var(--color-border)',
      borderRadius: 8, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
    }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Building2 size={16} style={{ color: 'var(--color-brand)' }} />
          <span style={{ fontSize: 'var(--fs-15)', fontWeight: 600 }}>{org.name}</span>
          <Tag label={ORG_TYPE_LABEL[org.type]} color={org.type === 'department' ? 'default' : 'brand'} />
        </div>
        <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 8, lineHeight: 1.5 }}>
          {orgPathLabel(orgs, org.id)}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 'var(--fs-12)', color: '#667085' }}>
          <span>直属部门 <strong style={{ color: 'var(--color-text-1)' }}>{children.length}</strong></span>
          <span>直属人员 <strong style={{ color: 'var(--color-text-1)' }}>{direct.length}</strong></span>
          <span>含下级 <strong style={{ color: 'var(--color-text-1)' }}>{subtree}</strong> 人</span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: 14, display: 'grid', gap: 14, alignContent: 'start' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 8 }}>基本信息</div>
          <div style={{ display: 'grid', gap: 4 }}>
            <KV label="类型" value={ORG_TYPE_LABEL[org.type]} />
            <KV label="所属企业" value={enterprise?.name ?? '—'} />
            <KV label="当前上级" value={orgs.find(o => o.id === org.parentId)?.name ?? '—（企业根节点）'} />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 8 }}>下级部门</div>
          {children.length === 0 ? (
            <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>无下级部门</div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {children.map(c => {
                const cDirect = directUsers(users, c.id).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectOrg(c.id)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                      padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 6,
                      background: '#fff', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 'var(--fs-13)', fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF' }}>{cDirect} 人</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 8 }}>变更摘要</div>
          {changeLog.length === 0 ? (
            <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>暂无变更记录</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {changeLog.map(e => (
                <div key={`${e.time}-${e.action}`} style={{ borderLeft: '2px solid var(--color-border)', paddingLeft: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 'var(--fs-12)', fontWeight: 600 }}>{e.action}</span>
                    <span style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{e.time}</span>
                  </div>
                  <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 2 }}>
                    {e.beforeSummary ?? ''}{e.beforeSummary && e.afterSummary ? ' → ' : ''}{e.afterSummary ?? ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
          <Users size={13} /> 在中间人员列表选择一名用户可查看用户详情
        </div>
      </div>
    </div>
  );
}

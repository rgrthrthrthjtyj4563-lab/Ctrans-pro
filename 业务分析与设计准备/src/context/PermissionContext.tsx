import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Role } from '../types';
import type { AuthPrincipal } from '../auth/authTypes';
import { drainLoginAuditEvents } from '../auth/mockGateway';
import {
  PERM_ORGS,
  PERM_USERS,
  PRESET_ROLES,
  emptyCustomScope,
  enterpriseRootOf,
  isHighRiskRole,
  nextId,
  nowStamp,
  pageHasAction,
  perspectiveRoleOf,
  resolveGrantAnchor,
  sameLevelDeptNameExists,
  scopeLabel,
  seedAssignments,
  seedChangeLogs,
  seedCustomRoles,
  seedPermAudit,
  validateDeptParent,
  type FieldPolicyKind,
  type GrantStatus,
  type PageAction,
  type PermAuditEvent,
  type PermOrg,
  type PermUser,
  type RoleAssignment,
  type RoleChangeLog,
  type ScopeType,
  type SysRole,
  type SysRoleStatus,
} from '../data/permissions';

export interface PreviewState {
  roleId: string;
  orgId: string;
  userId?: string;
  startedAt: string;
}

/** 组织/用户/授权写操作的统一审计模块与资源键（见整改方案 §6.2） */
const MOD_USER_ORG = '用户与组织';

interface PermissionStore {
  roles: SysRole[];
  assignments: RoleAssignment[];
  users: PermUser[];
  orgs: PermOrg[];
  changeLogs: RoleChangeLog[];
  auditEvents: PermAuditEvent[];
  /** 已认证主体（当前用户 + 当前生效授权角色 + 数据范围） */
  principal: AuthPrincipal;
  /** 旧三类页面视角的兼容派生值；页面写操作正逐步改用 can()/组织类型判断 */
  loginRole: Role;
  mappedRole: SysRole;
  preview: PreviewState | null;
  effectiveRole: SysRole;
  previewReadOnly: boolean;
  can: (pageId: string, action?: PageAction) => boolean;
  visiblePages: Set<string>;
  startPreview: (state: Omit<PreviewState, 'startedAt'>) => void;
  exitPreview: () => void;
  createRole: (input: { name: string; description: string; defaultScope: ScopeType }) => { ok: boolean; error?: string; role?: SysRole };
  updateRole: (roleId: string, patch: Partial<SysRole>, summary: string) => { ok: boolean; error?: string };
  setRoleStatus: (roleId: string, status: SysRoleStatus, reason: string) => { ok: boolean; error?: string; affected?: PermUser[] };
  deleteRole: (roleId: string, reason?: string) => { ok: boolean; error?: string; affected?: PermUser[] };
  createAssignment: (input: { userId: string; roleId: string; effectiveFrom: string; effectiveTo?: string; reason?: string }) => { ok: boolean; error?: string; pendingReview?: boolean };
  revokeAssignment: (assignmentId: string, reason: string) => { ok: boolean; error?: string };
  createUser: (input: { name: string; account: string; phone: string; email: string; orgId: string }) => { ok: boolean; error?: string; user?: PermUser };
  setUserStatus: (userId: string, status: 'enabled' | 'disabled', opts?: { reason?: string; revokeAssignments?: boolean }) => { ok: boolean; error?: string };
  addDepartment: (input: { name: string; parentId: string }) => { ok: boolean; error?: string; org?: PermOrg };
  updateDepartment: (input: { orgId: string; name?: string; parentId?: string; reason?: string }) => { ok: boolean; error?: string };
  setUserOrg: (input: { userId: string; orgId: string }) => { ok: boolean; error?: string };
  logAudit: (partial: Partial<PermAuditEvent> & Pick<PermAuditEvent, 'action' | 'target' | 'module'>) => void;
}

const PermissionContext = createContext<PermissionStore | null>(null);

/** 运行时权限上下文：当前用户 + 当前生效授权角色 + 当前数据范围 */
export function PermissionProvider({ principal, children }: { principal: AuthPrincipal; children: ReactNode }) {
  const [roles, setRoles] = useState<SysRole[]>(() => [...PRESET_ROLES, ...seedCustomRoles]);
  const [assignments, setAssignments] = useState<RoleAssignment[]>(() => [...seedAssignments]);
  const [orgs, setOrgs] = useState<PermOrg[]>(() => [...PERM_ORGS]);
  const [users, setUsers] = useState<PermUser[]>(() => [...PERM_USERS]);
  // createAssignment 等回调需要读取「同一次事件里刚创建」的用户，闭包 state 会过期
  const usersRef = useRef(users);
  usersRef.current = users;
  const [changeLogs, setChangeLogs] = useState<RoleChangeLog[]>(() => [...seedChangeLogs]);
  const [auditEvents, setAuditEvents] = useState<PermAuditEvent[]>(
    // 登录成功/失败审计在认证网关内存中缓冲，壳挂载时并入操作日志
    () => [...drainLoginAuditEvents(), ...seedPermAudit],
  );
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const mappedRole = useMemo(
    () => roles.find(r => r.id === principal.roleId) ?? roles[0],
    [principal.roleId, roles],
  );
  const loginRole = useMemo(() => perspectiveRoleOf(mappedRole), [mappedRole]);
  const ACTOR = principal.name;

  const effectiveRole = useMemo(() => {
    if (!preview) return mappedRole;
    return roles.find(r => r.id === preview.roleId) ?? mappedRole;
  }, [preview, roles, mappedRole]);

  const logAudit = useCallback((partial: Partial<PermAuditEvent> & Pick<PermAuditEvent, 'action' | 'target' | 'module'>) => {
    const event: PermAuditEvent = {
      id: nextId('PE'),
      time: nowStamp(),
      actor: principal.name,
      actorRole: principal.roleName,
      org: principal.orgName,
      resource: partial.resource ?? `${partial.module}`,
      decision: '允许',
      reason: '',
      requestId: nextId('req'),
      ip: '10.4.21.8',
      result: '成功',
      ...partial,
    };
    setAuditEvents(prev => [event, ...prev]);
  }, [principal.name, principal.roleName, principal.orgName]);

  const pushLog = useCallback((roleId: string, action: string, summary: string, extra?: Partial<RoleChangeLog>) => {
    const role = roles.find(r => r.id === roleId);
    const entry: RoleChangeLog = {
      id: nextId('cl'),
      roleId,
      time: nowStamp(),
      actor: ACTOR,
      action,
      summary,
      version: (role?.version ?? 1),
      ...extra,
    };
    setChangeLogs(prev => [entry, ...prev]);
  }, [roles]);

  const can = useCallback((pageId: string, action: PageAction = 'view') => {
    return pageHasAction(effectiveRole, pageId, action);
  }, [effectiveRole]);

  const visiblePages = useMemo(() => {
    return new Set(
      Object.entries(effectiveRole.pagePerms)
        .filter(([, actions]) => actions.includes('view') || actions.length > 0)
        .map(([id]) => id),
    );
  }, [effectiveRole]);

  const startPreview = useCallback((state: Omit<PreviewState, 'startedAt'>) => {
    const startedAt = nowStamp();
    setPreview({ ...state, startedAt });
    const role = roles.find(r => r.id === state.roleId);
    logAudit({
      module: '角色预览',
      action: '角色预览',
      target: role?.name ?? state.roleId,
      roleName: role?.name,
      resource: 'role-preview.view',
      reason: `只读预览 · ${orgs.find(o => o.id === state.orgId)?.name ?? ''}`,
    });
  }, [logAudit, orgs, roles]);

  const exitPreview = useCallback(() => {
    if (preview) {
      const role = roles.find(r => r.id === preview.roleId);
      logAudit({
        module: '角色预览',
        action: '退出预览',
        target: role?.name ?? preview.roleId,
        roleName: role?.name,
        resource: 'role-preview.view',
        reason: '结束只读预览',
      });
    }
    setPreview(null);
  }, [logAudit, preview, roles]);

  const createRole = useCallback((input: { name: string; description: string; defaultScope: ScopeType }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const name = input.name.trim();
    if (!name) return { ok: false, error: '请填写角色名称' };
    if (roles.some(r => r.name === name && r.tenant === '百益健康科技')) {
      return { ok: false, error: '同一租户内角色名称必须唯一' };
    }
    const created: SysRole = {
      id: nextId('role-custom'),
      name,
      description: input.description.trim(),
      kind: 'custom',
      status: 'draft',
      tenant: '百益健康科技',
      defaultScope: input.defaultScope,
      customScope: emptyCustomScope(),
      version: 1,
      updatedBy: ACTOR,
      updatedAt: nowStamp(),
      pagePerms: { dashboard: ['view'] },
      fieldPolicies: Object.fromEntries(
        Object.keys(mappedRole.fieldPolicies).map(k => [k, 'hidden' as FieldPolicyKind]),
      ),
    };
    setRoles(prev => [created, ...prev]);
    pushLog(created.id, '新建角色', `创建草稿角色「${name}」`, { version: 1 });
    logAudit({ module: '角色管理', action: '新建角色', target: name, roleName: name, resource: 'roles.create', afterSummary: '草稿 · 无业务写权限' });
    return { ok: true, role: created };
  }, [logAudit, mappedRole.fieldPolicies, preview, pushLog, roles]);

  const updateRole = useCallback((roleId: string, patch: Partial<SysRole>, summary: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = roles.find(r => r.id === roleId);
    if (!current) return { ok: false, error: '角色不存在' };
    if (patch.name && roles.some(r => r.id !== roleId && r.name === patch.name)) {
      return { ok: false, error: '同一租户内角色名称必须唯一' };
    }
    const next: SysRole = {
      ...current,
      ...patch,
      version: current.version + 1,
      updatedBy: ACTOR,
      updatedAt: nowStamp(),
    };
    setRoles(prev => prev.map(r => (r.id === roleId ? next : r)));
    pushLog(roleId, '编辑角色', summary, {
      version: next.version,
      beforeSummary: `${current.defaultScope} / v${current.version}`,
      afterSummary: `${next.defaultScope} / v${next.version}`,
    });
    const affectedUsers = new Set(
      assignments.filter(a => a.roleId === roleId && a.status === 'active').map(a => a.userId),
    ).size;
    logAudit({
      module: '角色管理',
      action: '编辑角色',
      target: next.name,
      roleName: next.name,
      resource: 'roles.edit',
      beforeSummary: `v${current.version}`,
      afterSummary: `v${next.version} · ${summary} · 影响 ${affectedUsers} 名已授权用户`,
    });
    return { ok: true };
  }, [assignments, logAudit, preview, pushLog, roles]);

  const setRoleStatus = useCallback((roleId: string, status: SysRoleStatus, reason: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = roles.find(r => r.id === roleId);
    if (!current) return { ok: false, error: '角色不存在' };
    const affectedIds = assignments.filter(a => a.roleId === roleId && a.status === 'active').map(a => a.userId);
    const affected = users.filter(u => affectedIds.includes(u.id));
    setRoles(prev => prev.map(r => (r.id === roleId ? { ...r, status, version: r.version + 1, updatedBy: ACTOR, updatedAt: nowStamp() } : r)));
    pushLog(roleId, status === 'enabled' ? '启用角色' : '停用角色', reason, { version: current.version + 1 });
    logAudit({
      module: '角色管理',
      action: status === 'enabled' ? '启用角色' : '停用角色',
      target: current.name,
      roleName: current.name,
      resource: 'roles.edit',
      reason,
      afterSummary: `${status === 'enabled' ? '启用' : '停用'} · 影响 ${affected.length} 人`,
    });
    return { ok: true, affected };
  }, [assignments, logAudit, preview, pushLog, roles, users]);

  const deleteRole = useCallback((roleId: string, reason = '删除角色') => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = roles.find(r => r.id === roleId);
    if (!current) return { ok: false, error: '角色不存在' };
    // 高危删除守卫：仍有有效授权（active / 待复核）时阻止，须先在「用户与组织」回收；
    // 历史已回收 / 已过期的引用保留为记录，不阻止删除
    const activeAssignments = assignments.filter(
      a => a.roleId === roleId && (a.status === 'active' || a.status === 'pending_review'),
    );
    if (activeAssignments.length > 0) {
      const affected = users.filter(u => activeAssignments.some(a => a.userId === u.id));
      return {
        ok: false,
        error: `尚有 ${affected.length} 名用户持有该角色的有效授权，请先在「用户与组织」回收后再删除`,
        affected,
      };
    }
    const historyCount = assignments.filter(a => a.roleId === roleId).length;
    const statusWord: Record<SysRoleStatus, string> = { enabled: '启用', disabled: '停用', draft: '草稿' };
    setRoles(prev => prev.filter(r => r.id !== roleId));
    logAudit({
      module: '角色管理',
      action: '删除角色',
      target: current.name,
      roleName: current.name,
      resource: 'roles.delete',
      reason,
      beforeSummary: `${current.kind === 'preset' ? '预置' : '定制'} · ${statusWord[current.status]} · v${current.version}`,
      afterSummary: historyCount > 0 ? `已删除 · 保留 ${historyCount} 条历史授权记录` : '已删除 · 无历史授权',
    });
    return { ok: true };
  }, [assignments, logAudit, preview, roles, users]);

  const createAssignment = useCallback((input: { userId: string; roleId: string; effectiveFrom: string; effectiveTo?: string; reason?: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const user = usersRef.current.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const role = roles.find(r => r.id === input.roleId);
    if (!role) return { ok: false, error: '角色不存在' };
    if (role.status !== 'enabled') return { ok: false, error: '停用或草稿角色不可授予' };
    if (user.accountStatus !== 'enabled') {
      return { ok: false, error: '账号已停用，启用后才能分配角色' };
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      return { ok: false, error: '到期日期不能早于生效日期' };
    }
    if (
      principal.scope !== 'ALL_PLATFORM' &&
      (input.roleId === 'role-sys-admin' || input.roleId === 'role-platform-ops')
    ) {
      return { ok: false, error: '授权人不得授予超出自身管理边界的角色（平台级角色仅平台侧可授）' };
    }
    const highRisk = isHighRiskRole(role);
    const temporary = Boolean(input.effectiveTo);
    if ((highRisk || temporary) && !input.reason?.trim()) {
      return { ok: false, error: '高危角色或临时授权必须填写授权理由' };
    }
    const { scopeOrgId, scopeOrgName, scope } = resolveGrantAnchor(orgs, user.orgId, role);
    const dup = assignments.some(
      a => a.userId === input.userId && a.roleId === input.roleId && a.scopeOrgId === scopeOrgId && a.status === 'active',
    );
    if (dup) {
      return { ok: false, error: `该用户已在${scopeOrgName}范围拥有${role.name}角色` };
    }
    const pendingReview = highRisk;
    const assignment: RoleAssignment = {
      id: nextId('g'),
      userId: input.userId,
      roleId: input.roleId,
      scopeOrgId,
      scopeOrgName,
      scope,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      grantedBy: ACTOR,
      grantedAt: nowStamp(),
      status: pendingReview ? 'pending_review' : 'active',
      reason: input.reason?.trim(),
    };
    setAssignments(prev => [assignment, ...prev]);
    logAudit({
      module: MOD_USER_ORG,
      action: '授予角色',
      target: `${user.name} × ${role.name}`,
      roleName: role.name,
      resource: 'role-assignments.create',
      reason: input.reason?.trim() || '常规授权',
      afterSummary: pendingReview
        ? `待复核 · ${scopeOrgName} · ${scopeLabel(scope)}`
        : `${scopeOrgName} · ${scopeLabel(scope)}`,
    });
    return { ok: true, pendingReview };
  }, [assignments, logAudit, orgs, preview, principal.scope, roles]);

  const revokeAssignment = useCallback((assignmentId: string, reason: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = assignments.find(a => a.id === assignmentId);
    if (!current) return { ok: false, error: '角色分配不存在' };
    if (current.status === 'revoked') return { ok: false, error: '该分配已回收' };
    setAssignments(prev => prev.map(a => (
      a.id === assignmentId ? { ...a, status: 'revoked' as GrantStatus, reason: reason || a.reason, revokedBy: ACTOR, revokedAt: nowStamp() } : a
    )));
    const user = users.find(u => u.id === current.userId);
    const roleName = roles.find(r => r.id === current.roleId)?.name;
    logAudit({
      module: MOD_USER_ORG,
      action: '回收角色',
      target: `${user?.name ?? ''} × ${roleName}`,
      roleName,
      resource: 'role-assignments.revoke',
      reason,
      beforeSummary: `${current.scopeOrgName} · ${scopeLabel(current.scope)}`,
      afterSummary: '已回收 · 历史保留可查',
    });
    return { ok: true };
  }, [assignments, logAudit, preview, roles, users]);

  const createUser = useCallback((input: { name: string; account: string; phone: string; email: string; orgId: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const name = input.name.trim();
    const account = input.account.trim();
    const phone = input.phone.trim();
    const email = input.email.trim();
    if (!name) return { ok: false, error: '请填写姓名' };
    if (!account) return { ok: false, error: '请填写用户名' };
    if (!phone) return { ok: false, error: '请填写手机号' };
    if (!/^1\d{10}$/.test(phone)) return { ok: false, error: '手机号格式不正确，应为 1 开头的 11 位数字' };
    if (!email) return { ok: false, error: '请填写邮箱' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: '邮箱格式不正确' };
    if (users.some(u => u.account === account)) return { ok: false, error: '用户名已存在，同一租户内唯一' };
    if (users.some(u => u.phone === phone)) return { ok: false, error: '该手机号已绑定其他账号' };
    const target = orgs.find(o => o.id === input.orgId);
    if (!target) return { ok: false, error: '所属部门不存在' };
    const user: PermUser = {
      id: nextId('u'),
      name,
      account,
      phone,
      email,
      orgId: target.id,
      orgName: target.name,
      accountStatus: 'enabled',
      createdAt: nowStamp(),
    };
    setUsers(prev => [...prev, user]);
    // 同一事件里可能立即 createAssignment（新建用户即分配角色），闭包/渲染都拿不到新值，这里即时同步 ref
    usersRef.current = [...usersRef.current, user];
    logAudit({
      module: MOD_USER_ORG,
      action: '新建用户',
      target: `${name} · ${account}`,
      resource: 'users.create',
      afterSummary: `${target.name} · 启用 · ${phone.slice(0, 3)}****${phone.slice(-4)}`,
    });
    return { ok: true, user };
  }, [logAudit, orgs, preview, users]);

  const setUserStatus = useCallback((userId: string, status: 'enabled' | 'disabled', opts?: { reason?: string; revokeAssignments?: boolean }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const user = users.find(u => u.id === userId);
    if (!user) return { ok: false, error: '用户不存在' };
    if (user.accountStatus === status) return { ok: true };
    const activeCount = assignments.filter(a => a.userId === userId && a.status === 'active').length;
    if (status === 'disabled' && opts?.revokeAssignments && activeCount > 0) {
      const stamp = nowStamp();
      setAssignments(prev => prev.map(a => (
        a.userId === userId && a.status === 'active'
          ? { ...a, status: 'revoked' as GrantStatus, reason: '账号停用同步回收', revokedBy: ACTOR, revokedAt: stamp }
          : a
      )));
    }
    setUsers(prev => prev.map(u => (u.id === userId ? { ...u, accountStatus: status } : u)));
    logAudit({
      module: MOD_USER_ORG,
      action: status === 'disabled' ? '停用账号' : '启用账号',
      target: `${user.name} · ${user.account}`,
      resource: status === 'disabled' ? 'users.disable' : 'users.edit',
      reason: opts?.reason || (status === 'disabled' ? '管理员停用' : '管理员启用'),
      beforeSummary: user.accountStatus === 'enabled' ? '启用' : '停用',
      afterSummary: status === 'disabled'
        ? `停用 · 有效角色 ${activeCount} 条${opts?.revokeAssignments && activeCount > 0 ? ' · 已同步回收' : ' · 保留冻结记录'}`
        : '启用',
    });
    return { ok: true };
  }, [assignments, logAudit, preview, users]);

  const addDepartment = useCallback((input: { name: string; parentId: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const name = input.name.trim();
    if (!name) return { ok: false, error: '请填写部门名称' };
    const parentCheck = validateDeptParent(orgs, input.parentId);
    if (!parentCheck.ok) return parentCheck;
    if (sameLevelDeptNameExists(orgs, input.parentId, name)) {
      return { ok: false, error: '该上级下已存在同名部门' };
    }
    const parent = orgs.find(o => o.id === input.parentId)!;
    const org: PermOrg = {
      id: nextId('org-dept'),
      name,
      type: 'department',
      parentId: parent.id,
    };
    setOrgs(prev => [...prev, org]);
    logAudit({
      module: MOD_USER_ORG,
      action: '新建部门',
      target: name,
      resource: 'orgs.create',
      afterSummary: `${parent.name} / ${name}`,
    });
    return { ok: true, org };
  }, [logAudit, orgs, preview]);

  const updateDepartment = useCallback((input: { orgId: string; name?: string; parentId?: string; reason?: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = orgs.find(o => o.id === input.orgId);
    if (!current) return { ok: false, error: '部门不存在' };
    if (current.type !== 'department') return { ok: false, error: '只能调整部门节点的名称和上级' };
    const name = input.name !== undefined ? input.name.trim() : current.name;
    if (!name) return { ok: false, error: '请填写部门名称' };
    const parentId = input.parentId ?? current.parentId;
    if (!parentId) return { ok: false, error: '部门必须有上级' };
    const parentCheck = validateDeptParent(orgs, parentId, current.id);
    if (!parentCheck.ok) return parentCheck;
    const parent = orgs.find(o => o.id === parentId);
    const renamed = name !== current.name;
    const moved = parentId !== current.parentId;
    if (!renamed && !moved) return { ok: true };
    if (renamed && sameLevelDeptNameExists(orgs, parentId, name, current.id)) {
      return { ok: false, error: '该上级下已存在同名部门' };
    }
    setOrgs(prev => prev.map(o => (o.id === current.id ? { ...o, name, parentId } : o)));
    if (renamed) {
      setUsers(prev => prev.map(u => (u.orgId === current.id ? { ...u, orgName: name } : u)));
      setAssignments(prev => prev.map(a => (a.scopeOrgId === current.id ? { ...a, scopeOrgName: name } : a)));
    }
    logAudit({
      module: MOD_USER_ORG,
      action: moved ? '调整汇报上级' : '重命名部门',
      target: name,
      resource: moved ? 'orgs.move' : 'orgs.edit',
      reason: input.reason,
      beforeSummary: `${current.name} · ${orgs.find(o => o.id === current.parentId)?.name ?? ''}`,
      afterSummary: `${name} · ${parent?.name ?? ''}`,
    });
    return { ok: true };
  }, [logAudit, orgs, preview]);

  const setUserOrg = useCallback((input: { userId: string; orgId: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const user = users.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const target = orgs.find(o => o.id === input.orgId);
    if (!target) return { ok: false, error: '目标部门不存在' };
    if (target.type !== 'pharma' && target.type !== 'department' && target.type !== 'provider' && target.type !== 'group') {
      return { ok: false, error: '目标节点不可挂人' };
    }
    const fromRoot = enterpriseRootOf(orgs, user.orgId);
    const toRoot = enterpriseRootOf(orgs, target.id);
    if (!toRoot || !fromRoot || fromRoot.id !== toRoot.id) {
      return { ok: false, error: '用户所属企业不一致，不能直接调入' };
    }
    if (user.orgId === target.id) return { ok: true };
    setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, orgId: target.id, orgName: target.name } : u)));
    const activeCount = assignments.filter(a => a.userId === user.id && a.status === 'active').length;
    logAudit({
      module: MOD_USER_ORG,
      action: '用户调岗',
      target: `${user.name} → ${target.name}`,
      resource: 'users.edit',
      beforeSummary: user.orgName,
      afterSummary: target.name,
      reason: '仅变更人员所属部门；角色分配及权限覆盖范围保持不变',
    });
    void activeCount;
    return { ok: true };
  }, [assignments, logAudit, orgs, preview, users]);

  const value: PermissionStore = {
    roles,
    assignments,
    users,
    orgs,
    changeLogs,
    auditEvents,
    principal,
    loginRole,
    mappedRole,
    preview,
    effectiveRole,
    previewReadOnly: Boolean(preview),
    can,
    visiblePages,
    startPreview,
    exitPreview,
    createRole,
    updateRole,
    setRoleStatus,
    deleteRole,
    createAssignment,
    revokeAssignment,
    createUser,
    setUserStatus,
    addDepartment,
    updateDepartment,
    setUserOrg,
    logAudit,
  };

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermission() {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error('usePermission must be used within PermissionProvider');
  return ctx;
}

export function usePermissionOptional() {
  return useContext(PermissionContext);
}

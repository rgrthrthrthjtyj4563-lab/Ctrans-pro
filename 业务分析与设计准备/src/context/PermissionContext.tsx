import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Role } from '../types';
import type { AuthPrincipal } from '../auth/authTypes';
import { drainLoginAuditEvents } from '../auth/mockGateway';
import {
  PERM_ORGS,
  PERM_USERS,
  PRESET_ROLES,
  SEED_GROUP_LEADER_CHANGES,
  SEED_GROUP_LEADERS,
  emptyCustomScope,
  enterpriseRootOf,
  isHighRiskRole,
  nextId,
  nowStamp,
  pageHasAction,
  perspectiveRoleOf,
  resolveGrantAnchor,
  rolesOfRealm,
  rolesOfTenant,
  sameLevelDeptNameExists,
  scopeLabel,
  seedAssignments,
  seedChangeLogs,
  seedCustomRoles,
  seedPermAudit,
  tenantKindOfRoot,
  validateDeptParent,
  type AccessRealm,
  type FieldPolicyKind,
  type GrantStatus,
  type GroupLeaderChange,
  type GroupLeaderRecord,
  type PageAction,
  type PermAuditEvent,
  type PermOrg,
  type PermUser,
  type RoleAssignment,
  type RoleChangeLog,
  type ScopeType,
  type SysRole,
  type SysRoleStatus,
  type TenantKind,
} from '../data/permissions';
import {
  authorizedVarietyLinesOfPharma,
  derivedRegionCodesOfScope,
  grantablePharmasForProvider,
  membershipActive,
  membershipOfUserInTenant,
  subscribeTenantMemberships,
  upsertMembership,
} from '../data/cooperationModel';

export interface PreviewState {
  roleId: string;
  orgId: string;
  userId?: string;
  startedAt: string;
}

/** 用户/授权写操作的统一审计模块（组织写操作用 MOD_ORG） */
const MOD_USER_ORG = '用户与授权';
const MOD_ORG = '组织架构';
const MOD_AUTHZ = '角色与数据范围';

interface PermissionStore {
  roles: SysRole[];
  assignments: RoleAssignment[];
  users: PermUser[];
  orgs: PermOrg[];
  changeLogs: RoleChangeLog[];
  auditEvents: PermAuditEvent[];
  /** 已认证主体（平台/租户判别联合） */
  principal: AuthPrincipal;
  /** 当前身份权限域 */
  realm: AccessRealm;
  /** 当前是否平台身份（平台人员不进入租户内部配置） */
  isPlatform: boolean;
  /** 当前租户类型（仅租户身份） */
  tenantKind: TenantKind | null;
  /** 当前身份所在权限域的角色（平台角色与租户角色永不混列） */
  realmRoles: SysRole[];
  /** 旧三类页面视角的兼容派生值（仅 TENANT 域业务页面使用；平台身份为 null，平台页面用 realm+platformRoleId 判断） */
  loginRole: Role | null;
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
  createAssignment: (input: {
    userId: string;
    roleId: string;
    effectiveFrom: string;
    effectiveTo?: string;
    reason?: string;
    /** 服务商员工可处理药厂（唯一数据源；授予时不得超过药厂给服务商的有效范围） */
    pharmaTenantIds?: string[];
    /** 服务商员工可处理品种（在药厂已授权品种内收窄；缺省=该药厂全部已授权品种） */
    varietyNames?: string[];
    regionCodes?: string[];
    projectNames?: string[];
  }) => { ok: boolean; error?: string; pendingReview?: boolean };
  updateAssignmentScope: (
    assignmentId: string,
    patch: { effectiveFrom?: string; effectiveTo?: string; pharmaTenantIds?: string[]; varietyNames?: string[]; regionCodes?: string[]; projectNames?: string[]; reason: string },
  ) => { ok: boolean; error?: string };
  revokeAssignment: (assignmentId: string, reason: string) => { ok: boolean; error?: string };
  createUser: (input: { name: string; account: string; phone: string; email: string; orgId: string }) => { ok: boolean; error?: string; user?: PermUser };
  setUserStatus: (userId: string, status: 'enabled' | 'disabled', opts?: { reason?: string; revokeAssignments?: boolean }) => { ok: boolean; error?: string };
  addDepartment: (input: { name: string; parentId: string }) => { ok: boolean; error?: string; org?: PermOrg };
  updateDepartment: (input: { orgId: string; name?: string; parentId?: string; reason?: string }) => { ok: boolean; error?: string };
  /** 服务商内部业务团队（工作组）管理：只表达团队归属，不承载权限域概念 */
  addWorkGroup: (input: { name: string; reason?: string }) => { ok: boolean; error?: string; org?: PermOrg };
  renameWorkGroup: (input: { orgId: string; name: string; reason?: string }) => { ok: boolean; error?: string };
  deleteWorkGroup: (input: { orgId: string; moveToId?: string; reason: string }) => { ok: boolean; error?: string };
  setUserOrg: (input: { userId: string; orgId: string }) => { ok: boolean; error?: string };
  /** 工作组组长指定记录（组织节点 id → 记录；有效性由 resolveGroupLeader 实时派生） */
  groupLeaders: Record<string, GroupLeaderRecord>;
  /** 组长变更审计（工作组管理页展示；历史任务与审计不因组长变更删除） */
  groupLeaderChanges: GroupLeaderChange[];
  setGroupLeader: (input: { groupId: string; groupName: string; userId: string; reason: string }) => { ok: boolean; error?: string };
  logAudit: (partial: Partial<PermAuditEvent> & Pick<PermAuditEvent, 'action' | 'target' | 'module'>) => void;
}

const PermissionContext = createContext<PermissionStore | null>(null);

/**
 * 模块级页面操作审计缓冲：登出/换会话导致业务壳重建时，页面写入的操作审计
 * 不随组件状态销毁（与登录审计缓冲 drainLoginAuditEvents 同构）。页面操作
 * 审计跨会话累积（原型运行周期内）。
 */
const pageAuditBuffer: PermAuditEvent[] = [];

/**
 * 模块级登录审计镜像（2026-09-16）：登录链路事件（登录/默认登录/切换企业/
 * 退出撤销）原本只在「认证成功的那次挂载」并入、换会话即不可查——默认登录
 * 引入长会话与跨企业切换后，AC-10 要求这些记录在后续会话仍可查询，故与
 * 页面操作同构跨会话累积（上限截断防止无界增长）。
 */
const loginAuditBuffer: PermAuditEvent[] = [];
const LOGIN_AUDIT_BUFFER_CAP = 200;

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
    // 登录审计并入模块级镜像（跨会话可查）；页面操作审计跨会话保留；种子审计兜底展示
    () => {
      const drained = drainLoginAuditEvents();
      for (let i = drained.length - 1; i >= 0; i -= 1) loginAuditBuffer.unshift(drained[i]);
      if (loginAuditBuffer.length > LOGIN_AUDIT_BUFFER_CAP) {
        loginAuditBuffer.length = LOGIN_AUDIT_BUFFER_CAP;
      }
      return [...loginAuditBuffer, ...pageAuditBuffer, ...seedPermAudit];
    },
  );
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const realm = principal.realm;
  const isPlatform = realm === "PLATFORM";
  const tenantKind = principal.realm === "TENANT" ? principal.tenantKind : null;
  const principalTenantId = principal.realm === "TENANT" ? principal.tenantId : null;
  const principalTenantKind = principal.realm === "TENANT" ? principal.tenantKind : null;
  /** 权限域角色：平台角色与租户角色永不混列（验收 §13.10） */
  const realmRoles = useMemo(
    () => rolesOfTenant(roles, realm, realm === 'TENANT' ? principalTenantId : null),
    [roles, realm, principalTenantId],
  );
  const currentRoleId = principal.realm === "PLATFORM" ? principal.platformRoleId : principal.activeRoleId;

  const mappedRole = useMemo(
    () => roles.find(r => r.id === currentRoleId) ?? realmRoles[0],
    [currentRoleId, roles, realmRoles],
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
      actorRole: principal.realm === 'PLATFORM' ? principal.platformRoleName : principal.activeRoleName,
      org: principal.realm === 'PLATFORM' ? principal.workspaceName : principal.tenantName,
      resource: partial.resource ?? `${partial.module}`,
      decision: '允许',
      reason: '',
      requestId: nextId('req'),
      ip: '10.4.21.8',
      result: '成功',
      ...partial,
    };
    pageAuditBuffer.unshift(event);
    setAuditEvents(prev => [event, ...prev]);
  }, [principal]);

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
    // 名称唯一性按权限域 + 租户隔离：预置角色与本租户自定义角色之间不重名；
    // 其他租户的自定义角色互不可见、互不冲突
    const tenantVisible = (r: SysRole) => realm === 'PLATFORM' || r.tenantId == null || r.tenantId === principalTenantId;
    if (roles.some(r => r.name === name && r.realm === realm && tenantVisible(r))) {
      return { ok: false, error: realm === 'PLATFORM' ? '平台角色名称必须唯一' : '本企业内角色名称必须唯一（含预置角色）' };
    }
    const created: SysRole = {
      id: nextId('role-custom'),
      name,
      description: input.description.trim(),
      kind: 'custom',
      status: 'draft',
      realm,
      ...(realm === 'TENANT' && principalTenantId ? { tenantId: principalTenantId } : {}),
      ...(realm === 'TENANT' && tenantKind ? { appliesTo: [tenantKind] } : {}),
      defaultScope: realm === 'TENANT' && tenantKind === 'provider' && input.defaultScope === 'PHARMA' ? 'PROVIDER' : input.defaultScope,
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
    logAudit({ module: '角色与数据范围', action: '新建角色', target: name, roleName: name, resource: 'roles.create', afterSummary: '草稿 · 无业务写权限' });
    return { ok: true, role: created };
  }, [logAudit, mappedRole.fieldPolicies, preview, pushLog, realm, roles, tenantKind]);

  const updateRole = useCallback((roleId: string, patch: Partial<SysRole>, summary: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = roles.find(r => r.id === roleId);
    if (!current) return { ok: false, error: '角色不存在' };
    // 跨权限域 / 跨租户修改拦截：平台角色只能在平台域改；其他租户的自定义角色不可改
    if (current.realm !== realm) return { ok: false, error: '不可修改当前权限域之外的角色' };
    if (realm === 'TENANT' && current.tenantId != null && current.tenantId !== principalTenantId) {
      return { ok: false, error: '不可修改本企业之外的自定义角色' };
    }
    if (patch.name && roles.some(r => r.id !== roleId && r.name === patch.name && r.realm === current.realm && (realm === 'PLATFORM' || r.tenantId == null || r.tenantId === principalTenantId))) {
      return { ok: false, error: '本企业内角色名称必须唯一（含预置角色）' };
    }
    const next: SysRole = {
      ...current,
      ...patch,
      realm: current.realm,
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
      module: '角色与数据范围',
      action: '编辑角色',
      target: next.name,
      roleName: next.name,
      resource: 'roles.edit',
      beforeSummary: `v${current.version}`,
      afterSummary: `v${next.version} · ${summary} · 影响 ${affectedUsers} 名已授权用户`,
    });
    return { ok: true };
  }, [assignments, logAudit, preview, pushLog, realm, roles]);

  const setRoleStatus = useCallback((roleId: string, status: SysRoleStatus, reason: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = roles.find(r => r.id === roleId);
    if (!current) return { ok: false, error: '角色不存在' };
    if (current.realm !== realm) return { ok: false, error: '不可启停当前权限域之外的角色' };
    if (realm === 'TENANT' && current.tenantId != null && current.tenantId !== principalTenantId) {
      return { ok: false, error: '不可启停本企业之外的自定义角色' };
    }
    const affectedIds = assignments.filter(a => a.roleId === roleId && a.status === 'active').map(a => a.userId);
    const affected = users.filter(u => affectedIds.includes(u.id));
    setRoles(prev => prev.map(r => (r.id === roleId ? { ...r, status, version: r.version + 1, updatedBy: ACTOR, updatedAt: nowStamp() } : r)));
    pushLog(roleId, status === 'enabled' ? '启用角色' : '停用角色', reason, { version: current.version + 1 });
    logAudit({
      module: '角色与数据范围',
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
    if (current.realm !== realm) return { ok: false, error: '不可删除当前权限域之外的角色' };
    if (realm === 'TENANT' && current.tenantId != null && current.tenantId !== principalTenantId) {
      return { ok: false, error: '不可删除本企业之外的自定义角色' };
    }
    // 高危删除守卫：仍有有效授权（active / 待复核）时阻止，须先在「已授权成员」页签回收；
    // 历史已回收 / 已过期的引用保留为记录，不阻止删除
    const activeAssignments = assignments.filter(
      a => a.roleId === roleId && (a.status === 'active' || a.status === 'pending_review'),
    );
    if (activeAssignments.length > 0) {
      const affected = users.filter(u => activeAssignments.some(a => a.userId === u.id));
      return {
        ok: false,
        error: `尚有 ${affected.length} 名用户持有该角色的有效授权，请先在本页「已授权成员」页签回收后再删除`,
        affected,
      };
    }
    const historyCount = assignments.filter(a => a.roleId === roleId).length;
    const statusWord: Record<SysRoleStatus, string> = { enabled: '启用', disabled: '停用', draft: '草稿' };
    setRoles(prev => prev.filter(r => r.id !== roleId));
    logAudit({
      module: '角色与数据范围',
      action: '删除角色',
      target: current.name,
      roleName: current.name,
      resource: 'roles.delete',
      reason,
      beforeSummary: `${current.kind === 'preset' ? '预置' : '定制'} · ${statusWord[current.status]} · v${current.version}`,
      afterSummary: historyCount > 0 ? `已删除 · 保留 ${historyCount} 条历史授权记录` : '已删除 · 无历史授权',
    });
    return { ok: true };
  }, [assignments, logAudit, preview, realm, roles, users]);

  /**
   * 租户域唯一授权入口（「角色与数据范围」页 · 已授权成员页签）。平台人员
   * 不得调用本方法管理任何租户内部授权；授予时写入稳定 tenantId 边界。
   * 服务商员工可处理药厂 = assignment.pharmaTenantIds，授予时强制不得超出
   * 「药厂对服务商的有效合作与业务授权」上限（内部权限只收窄、不扩大）。
   */
  const createAssignment = useCallback((input: {
    userId: string;
    roleId: string;
    effectiveFrom: string;
    effectiveTo?: string;
    reason?: string;
    pharmaTenantIds?: string[];
    varietyNames?: string[];
    regionCodes?: string[];
    projectNames?: string[];
  }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) {
      return { ok: false, error: '平台身份不进入租户内部授权：请由企业管理员在租户工作空间内授予' };
    }
    const user = usersRef.current.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    // 成员边界（P0）：只认 TenantMembership——该用户在当前租户的有效成员身份。
    // 不再用 User.orgId / enterpriseRootOf 反推（双企业成员主档在另一家企业）。
    const membership = membershipOfUserInTenant(input.userId, principalTenantId);
    if (!membership) {
      return { ok: false, error: '该用户不是本企业成员（无 TenantMembership），先在「用户管理」建档' };
    }
    if (!membershipActive(membership)) {
      return { ok: false, error: '该成员身份已冻结，不可授予角色' };
    }
    const memberOrgId = membership.orgUnitId;
    const role = roles.find(r => r.id === input.roleId);
    if (!role) return { ok: false, error: '角色不存在' };
    if (role.realm !== 'TENANT') return { ok: false, error: '平台角色不可授予企业成员（平台权限域分离）' };
    if (role.appliesTo && principalTenantKind && !role.appliesTo.includes(principalTenantKind)) {
      return { ok: false, error: `角色「${role.name}」不适用于当前企业类型` };
    }
    if (role.status !== 'enabled') return { ok: false, error: '停用或草稿角色不可授予' };
    if (user.accountStatus !== 'enabled') {
      return { ok: false, error: '账号已停用，启用后才能分配角色' };
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      return { ok: false, error: '到期日期不能早于生效日期' };
    }
    // 可处理药厂/品种授予校验：只能在本服务商「合作生效 ∧ 业务授权有效」范围内收窄；
    // 区域不可勾选，由品种授权自动派生（derivedRegionCodesOfScope 只读回填）
    let derivedRegions: string[] | undefined;
    if (principalTenantKind === 'provider' && input.pharmaTenantIds && input.pharmaTenantIds.length > 0) {
      const grantable = new Set(grantablePharmasForProvider(principalTenantId));
      const over = input.pharmaTenantIds.filter(id => !grantable.has(id));
      if (over.length > 0) {
        return { ok: false, error: `「${over.map(id => orgs.find(o => o.id === id)?.name ?? id).join('、')}」当前合作未生效或业务授权已失效，服务商内部授权不能扩大药厂授予的范围` };
      }
      if (input.varietyNames && input.varietyNames.length > 0) {
        const allowed = new Set(
          input.pharmaTenantIds.flatMap(id => authorizedVarietyLinesOfPharma(principalTenantId, id).map(l => l.varietyName)),
        );
        const badVariety = input.varietyNames.filter(v => !allowed.has(v));
        if (badVariety.length > 0) {
          return { ok: false, error: `品种「${badVariety.join('、')}」不在药厂授予本服务商的有效品种范围内，不能授予员工` };
        }
      }
      derivedRegions = derivedRegionCodesOfScope(principalTenantId, input.pharmaTenantIds, input.varietyNames);
    }
    const highRisk = isHighRiskRole(role);
    const temporary = Boolean(input.effectiveTo);
    if ((highRisk || temporary) && !input.reason?.trim()) {
      return { ok: false, error: '高危角色或临时授权必须填写授权理由' };
    }
    // 范围锚点以成员身份所在部门为准（同一人在不同租户可锚定不同组织）
    const { scopeOrgId, scopeOrgName, scope } = resolveGrantAnchor(orgs, memberOrgId, role);
    const dup = assignments.some(
      a => a.tenantId === principalTenantId && a.userId === input.userId && a.roleId === input.roleId && a.scopeOrgId === scopeOrgId && a.status === 'active',
    );
    if (dup) {
      return { ok: false, error: `该用户已在${scopeOrgName}范围拥有${role.name}角色` };
    }
    const pendingReview = highRisk;
    const assignment: RoleAssignment = {
      id: nextId('g'),
      tenantId: principalTenantId,
      userId: input.userId,
      roleId: input.roleId,
      scopeOrgId,
      scopeOrgName,
      scope,
      ...(input.pharmaTenantIds && input.pharmaTenantIds.length > 0 ? { pharmaTenantIds: input.pharmaTenantIds } : {}),
      ...(input.varietyNames && input.varietyNames.length > 0 ? { varietyNames: input.varietyNames } : {}),
      ...(derivedRegions && derivedRegions.length > 0 ? { regionCodes: derivedRegions } : {}),
      ...(input.projectNames && input.projectNames.length > 0 ? { projectNames: input.projectNames } : {}),
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      grantedBy: ACTOR,
      grantedAt: nowStamp(),
      status: pendingReview ? 'pending_review' : 'active',
      reason: input.reason?.trim(),
    };
    setAssignments(prev => [assignment, ...prev]);
    logAudit({
      module: MOD_AUTHZ,
      action: '授予角色',
      target: `${user.name} × ${role.name}`,
      roleName: role.name,
      resource: 'role-assignments.create',
      reason: input.reason?.trim() || '常规授权',
      afterSummary: [
        pendingReview ? '待复核' : '生效',
        `${scopeOrgName} · ${scopeLabel(scope)}`,
        input.pharmaTenantIds && input.pharmaTenantIds.length > 0
          ? `可处理药厂 ${input.pharmaTenantIds.length} 家`
          : null,
      ].filter(Boolean).join(' · '),
    });
    return { ok: true, pendingReview };
  }, [assignments, logAudit, orgs, preview, principalTenantId, principalTenantKind, realm, roles]);

  /** 调整既有条授权的数据范围（可处理药厂/区域/项目/有效期）：同受「不扩大」上限约束 */
  const updateAssignmentScope = useCallback((assignmentId: string, patch: {
    effectiveFrom?: string;
    effectiveTo?: string;
    pharmaTenantIds?: string[];
    varietyNames?: string[];
    regionCodes?: string[];
    projectNames?: string[];
    reason: string;
  }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '平台身份不进入租户内部授权' };
    const current = assignments.find(a => a.id === assignmentId);
    if (!current) return { ok: false, error: '授权不存在' };
    if (current.tenantId !== principalTenantId) return { ok: false, error: '不能调整其他企业的授权记录' };
    if (!patch.reason.trim()) return { ok: false, error: '请填写调整原因（随审计保留）' };
    if (patch.effectiveTo && patch.effectiveTo < (patch.effectiveFrom ?? current.effectiveFrom)) {
      return { ok: false, error: '到期日期不能早于生效日期' };
    }
    let derivedRegions: string[] | undefined;
    if (principalTenantKind === 'provider' && patch.pharmaTenantIds && patch.pharmaTenantIds.length > 0) {
      const grantable = new Set(grantablePharmasForProvider(principalTenantId));
      const over = patch.pharmaTenantIds.filter(id => !grantable.has(id));
      if (over.length > 0) {
        return { ok: false, error: `「${over.map(id => orgs.find(o => o.id === id)?.name ?? id).join('、')}」当前合作未生效或业务授权已失效，不能授予员工` };
      }
      if (patch.varietyNames && patch.varietyNames.length > 0) {
        const allowed = new Set(
          patch.pharmaTenantIds.flatMap(id => authorizedVarietyLinesOfPharma(principalTenantId, id).map(l => l.varietyName)),
        );
        const badVariety = patch.varietyNames.filter(v => !allowed.has(v));
        if (badVariety.length > 0) {
          return { ok: false, error: `品种「${badVariety.join('、')}」不在药厂授予本服务商的有效品种范围内，不能授予员工` };
        }
      }
      derivedRegions = derivedRegionCodesOfScope(principalTenantId, patch.pharmaTenantIds, patch.varietyNames);
    }
    const next: RoleAssignment = {
      ...current,
      ...(patch.effectiveFrom ? { effectiveFrom: patch.effectiveFrom } : {}),
      effectiveTo: patch.effectiveTo,
      ...(patch.pharmaTenantIds ? { pharmaTenantIds: patch.pharmaTenantIds } : {}),
      ...(patch.varietyNames ? { varietyNames: patch.varietyNames } : {}),
      ...(derivedRegions ? { regionCodes: derivedRegions } : {}),
      ...(patch.projectNames ? { projectNames: patch.projectNames } : {}),
      reason: patch.reason.trim(),
    };
    setAssignments(prev => prev.map(a => (a.id === assignmentId ? next : a)));
    logAudit({
      module: MOD_AUTHZ,
      action: '调整授权范围',
      target: `${users.find(u => u.id === current.userId)?.name ?? ''} × ${roles.find(r => r.id === current.roleId)?.name ?? ''}`,
      resource: 'role-assignments.edit',
      reason: patch.reason.trim(),
      beforeSummary: `可处理药厂 ${(current.pharmaTenantIds ?? []).length} 家 · ${current.effectiveFrom}${current.effectiveTo ? ` ~ ${current.effectiveTo}` : ''}`,
      afterSummary: `可处理药厂 ${(patch.pharmaTenantIds ?? current.pharmaTenantIds ?? []).length} 家 · ${next.effectiveFrom}${next.effectiveTo ? ` ~ ${next.effectiveTo}` : ''}`,
    });
    return { ok: true };
  }, [assignments, logAudit, orgs, preview, principalTenantId, principalTenantKind, roles, users]);

  const revokeAssignment = useCallback((assignmentId: string, reason: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = assignments.find(a => a.id === assignmentId);
    if (!current) return { ok: false, error: '角色分配不存在' };
    if (realm !== 'TENANT' || current.tenantId !== principalTenantId) {
      return { ok: false, error: '只能回收本企业的授权记录' };
    }
    if (current.status === 'revoked') return { ok: false, error: '该分配已回收' };
    setAssignments(prev => prev.map(a => (
      a.id === assignmentId ? { ...a, status: 'revoked' as GrantStatus, reason: reason || a.reason, revokedBy: ACTOR, revokedAt: nowStamp() } : a
    )));
    const user = users.find(u => u.id === current.userId);
    const roleName = roles.find(r => r.id === current.roleId)?.name;
    logAudit({
      module: MOD_AUTHZ,
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
    // 成员建档边界：租户管理员只能在本企业组织树内建号；平台人员只能建平台账号
    const targetRoot = enterpriseRootOf(orgs, target.id);
    if (realm === 'TENANT') {
      if (!targetRoot || targetRoot.id !== principalTenantId) {
        return { ok: false, error: '只能在本企业组织内新建成员（租户边界）' };
      }
    } else if (targetRoot?.type !== 'platform') {
      return { ok: false, error: '平台账号只能挂在平台组织下' };
    }
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
    // P0：User 主档之外，必须写入「当前租户」的成员身份（授权/列表/调岗的边界都基于它）
    if (realm === 'TENANT' && principalTenantId) {
      upsertMembership({ userId: user.id, tenantId: principalTenantId, orgUnitId: target.id });
    }
    logAudit({
      module: MOD_USER_ORG,
      action: '新建用户',
      target: `${name} · ${account}`,
      resource: 'users.create',
      afterSummary: `${target.name} · 启用 · ${phone.slice(0, 3)}****${phone.slice(-4)}`,
    });
    return { ok: true, user };
  }, [logAudit, orgs, preview, principalTenantId, realm, users]);

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
    // 租户边界：部门只能建在当前企业组织树内
    const parentRoot = enterpriseRootOf(orgs, input.parentId);
    if (!parentRoot) return { ok: false, error: '上级节点不存在' };
    if (realm === 'TENANT' && parentRoot.id !== principalTenantId) {
      return { ok: false, error: '只能在本企业组织树内新建部门（租户边界）' };
    }
    if (realm === 'PLATFORM' && parentRoot.type !== 'platform') {
      return { ok: false, error: '平台组织只能挂在平台工作空间下' };
    }
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
      module: MOD_ORG,
      action: '新建部门',
      target: name,
      resource: 'orgs.create',
      afterSummary: `${parent.name} / ${name}`,
    });
    return { ok: true, org };
  }, [logAudit, orgs, preview, principalTenantId, realm]);

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
      module: MOD_ORG,
      action: moved ? '调整汇报上级' : '重命名部门',
      target: name,
      resource: moved ? 'orgs.move' : 'orgs.edit',
      reason: input.reason,
      beforeSummary: `${current.name} · ${orgs.find(o => o.id === current.parentId)?.name ?? ''}`,
      afterSummary: `${name} · ${parent?.name ?? ''}`,
    });
    return { ok: true };
  }, [logAudit, orgs, preview]);

  const addWorkGroup = useCallback((input: { name: string; reason?: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (principalTenantKind !== 'provider') return { ok: false, error: '仅服务商可维护工作组' };
    const name = input.name.trim();
    if (!name) return { ok: false, error: '请填写工作组名称' };
    if (orgs.some(o => o.type === 'group' && o.parentId === principalTenantId && o.name.trim() === name)) {
      return { ok: false, error: '本企业已存在同名工作组' };
    }
    const org: PermOrg = { id: nextId('org-group'), name, type: 'group', parentId: principalTenantId ?? undefined };
    setOrgs(prev => [...prev, org]);
    logAudit({
      module: '工作组管理',
      action: '新建工作组',
      target: name,
      resource: 'workgroups.create',
      reason: input.reason,
      afterSummary: `${principalTenantId ? orgs.find(o => o.id === principalTenantId)?.name : ''} / ${name}`,
    });
    return { ok: true, org };
  }, [logAudit, orgs, preview, principalTenantId, principalTenantKind]);

  const renameWorkGroup = useCallback((input: { orgId: string; name: string; reason?: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const cur = orgs.find(o => o.id === input.orgId);
    if (!cur || cur.type !== 'group') return { ok: false, error: '工作组不存在' };
    if (cur.parentId !== principalTenantId) return { ok: false, error: '只能调整本服务商的工作组' };
    const name = input.name.trim();
    if (!name) return { ok: false, error: '请填写工作组名称' };
    if (orgs.some(o => o.id !== cur.id && o.type === 'group' && o.parentId === principalTenantId && o.name.trim() === name)) {
      return { ok: false, error: '本企业已存在同名工作组' };
    }
    setOrgs(prev => prev.map(o => (o.id === cur.id ? { ...o, name } : o)));
    setUsers(prev => prev.map(u => (u.orgId === cur.id ? { ...u, orgName: name } : u)));
    setAssignments(prev => prev.map(a => (a.scopeOrgId === cur.id ? { ...a, scopeOrgName: name } : a)));
    logAudit({ module: '工作组管理', action: '重命名工作组', target: name, resource: 'workgroups.edit', reason: input.reason, beforeSummary: cur.name, afterSummary: name });
    return { ok: true };
  }, [logAudit, orgs, preview, principalTenantId]);

  const deleteWorkGroup = useCallback((input: { orgId: string; moveToId?: string; reason: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const cur = orgs.find(o => o.id === input.orgId);
    if (!cur || cur.type !== 'group') return { ok: false, error: '工作组不存在' };
    if (cur.parentId !== principalTenantId) return { ok: false, error: '只能删除本服务商的工作组' };
    const members = users.filter(u => u.orgId === cur.id);
    if (members.length > 0) {
      if (!input.moveToId) return { ok: false, error: `该工作组成员 ${members.length} 人，请先选择成员迁往的目标节点` };
      const target = orgs.find(o => o.id === input.moveToId);
      if (!target) return { ok: false, error: '目标节点不存在' };
      setUsers(prev => prev.map(u => (u.orgId === cur.id ? { ...u, orgId: target.id, orgName: target.name } : u)));
    }
    // 成员的历史授权记录保留（scopeOrgName 占位），不随节点删除而抹除审计
    setOrgs(prev => prev.filter(o => o.id !== cur.id));
    logAudit({
      module: '工作组管理',
      action: '删除工作组',
      target: cur.name,
      resource: 'workgroups.delete',
      reason: input.reason.trim(),
      beforeSummary: `成员 ${members.length} 人`,
      afterSummary: members.length > 0 ? `已迁往「${orgs.find(o => o.id === input.moveToId)?.name ?? ''}」· 工作组删除` : '已删除',
    });
    return { ok: true };
  }, [logAudit, orgs, preview, principalTenantId, users]);

  /**
   * 调岗（P0）：只调整该用户在【当前租户】成员身份的 orgUnitId。
   * User 主档 orgId 不动——同一自然人在其他企业的成员身份不受影响；
   * 角色分配与数据范围保持不变。
   */
  const setUserOrg = useCallback((input: { userId: string; orgId: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const user = users.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '平台工作人员归属由平台组织维护' };
    const membership = membershipOfUserInTenant(input.userId, principalTenantId);
    if (!membership) return { ok: false, error: '该用户不是本企业成员' };
    const target = orgs.find(o => o.id === input.orgId);
    if (!target) return { ok: false, error: '目标部门不存在' };
    if (target.type !== 'pharma' && target.type !== 'department' && target.type !== 'provider' && target.type !== 'group') {
      return { ok: false, error: '目标节点不可挂人' };
    }
    // 目标必须仍在当前租户组织树内（跨企业调岗走成员身份新建/回收，不在此操作）
    const toRoot = enterpriseRootOf(orgs, target.id);
    if (!toRoot || toRoot.id !== principalTenantId) {
      return { ok: false, error: '目标节点不在本企业组织树内（租户边界）' };
    }
    if (membership.orgUnitId === target.id) return { ok: true };
    const fromName = orgs.find(o => o.id === membership.orgUnitId)?.name ?? membership.orgUnitId;
    upsertMembership({ userId: input.userId, tenantId: principalTenantId, orgUnitId: target.id });
    logAudit({
      module: MOD_USER_ORG,
      action: '用户调岗',
      target: `${user.name} → ${target.name}`,
      resource: 'users.edit',
      beforeSummary: fromName,
      afterSummary: target.name,
      reason: '仅变更本企业成员身份的所属部门；User 主档与其他企业成员身份不变',
    });
    return { ok: true };
  }, [assignments, logAudit, orgs, preview, principalTenantId, realm, users]);

  /**
   * 指定/更换工作组组长（工作组管理页唯一入口）。前置校验与 4.2 组长规则一致：
   * 属于该工作组 ∧ 账号启用 ∧ 拥有生效「工作组组长」角色（未持有角色的成员
   * 会提示先在「角色与数据范围 · 已授权成员」授予）。变更写入本地审计记录。
   */
  const [groupLeaders, setGroupLeaders] = useState<Record<string, GroupLeaderRecord>>(() => ({ ...SEED_GROUP_LEADERS }));
  const [groupLeaderChanges, setGroupLeaderChanges] = useState<GroupLeaderChange[]>(() => [...SEED_GROUP_LEADER_CHANGES]);
  const setGroupLeader = useCallback((input: { groupId: string; groupName: string; userId: string; reason: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (principalTenantKind !== 'provider' || !principalTenantId) return { ok: false, error: '仅服务商可维护工作组组长' };
    if (!input.reason.trim()) return { ok: false, error: '请填写变更原因（随审计保留）' };
    const user = users.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '成员不存在' };
    const membership = membershipOfUserInTenant(input.userId, principalTenantId);
    if (!membership || !membershipActive(membership) || membership.orgUnitId !== input.groupId) {
      return { ok: false, error: `${user.name} 不属于「${input.groupName}」（组长必须属于本工作组）` };
    }
    if (user.accountStatus !== 'enabled') return { ok: false, error: `${user.name} 的账号已停用，不能担任组长` };
    const today = new Date().toISOString().slice(0, 10);
    const hasRole = assignments.some(
      a =>
        a.userId === user.id &&
        a.tenantId === principalTenantId &&
        a.roleId === 'role-group-lead' &&
        a.status === 'active' &&
        a.effectiveFrom <= today &&
        (!a.effectiveTo || a.effectiveTo >= today),
    );
    if (!hasRole) {
      return { ok: false, error: `${user.name} 尚未持有生效的「工作组组长」角色，请先在「角色与数据范围 · 已授权成员」页签授予后再指定` };
    }
    const prev = groupLeaders[input.groupId];
    const record: GroupLeaderRecord = {
      userId: input.userId,
      appointedAt: nowStamp(),
      appointedBy: ACTOR,
      reason: input.reason.trim(),
    };
    setGroupLeaders(prevMap => ({ ...prevMap, [input.groupId]: record }));
    const change: GroupLeaderChange = {
      id: nextId('glc'),
      groupId: input.groupId,
      groupName: input.groupName,
      at: nowStamp(),
      actor: ACTOR,
      summary: prev
        ? `组长由 ${users.find(u => u.id === prev.userId)?.name ?? prev.userId} 变更为 ${user.name} · 原因：${input.reason.trim()}`
        : `指定 ${user.name} 为工作组组长 · 原因：${input.reason.trim()}`,
    };
    setGroupLeaderChanges(prevList => [change, ...prevList]);
    logAudit({
      module: '工作组管理',
      action: prev ? '变更工作组组长' : '指定工作组组长',
      target: `${input.groupName} · ${user.name}`,
      roleName: '工作组组长',
      resource: 'workgroup-leader.edit',
      reason: input.reason.trim(),
      beforeSummary: prev ? `${users.find(u => u.id === prev.userId)?.name ?? prev.userId} · ${prev.appointedAt}` : '（未设置）',
      afterSummary: `${user.name} · ${record.appointedAt}`,
    });
    return { ok: true };
  }, [assignments, groupLeaders, logAudit, preview, principalTenantId, principalTenantKind, users]);

  const value: PermissionStore = {
    roles,
    assignments,
    users,
    orgs,
    changeLogs,
    auditEvents,
    principal,
    realm,
    isPlatform,
    tenantKind,
    realmRoles,
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
    updateAssignmentScope,
    revokeAssignment,
    createUser,
    setUserStatus,
    addDepartment,
    updateDepartment,
    addWorkGroup,
    renameWorkGroup,
    deleteWorkGroup,
    setUserOrg,
    groupLeaders,
    groupLeaderChanges,
    setGroupLeader,
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

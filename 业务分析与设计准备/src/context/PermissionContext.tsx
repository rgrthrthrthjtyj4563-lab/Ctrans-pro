import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { PageId, Role } from '../types';
import type { AuthPrincipal } from '../auth/authTypes';
import { drainLoginAuditEvents } from '../auth/mockGateway';
import {
  PERM_ORGS,
  PERM_USERS,
  PRESET_ROLES,
  deptDeleteBlockers,
  emptyCustomScope,
  enterpriseRootOf,
  filterResourcePagesForTenant,
  isGrantActiveOrPending,
  isGrantEffective,
  isHighRiskRole,
  localTodayIso,
  acceptanceDeptRefBlocker,
  mergeRolePerms,
  nextId,
  nextOrgId,
  nowStamp,
  orgDescendantIds,
  orgPathLabel,
  pageHasAction,
  perspectiveRoleOf,
  resolveGrantAnchor,
  resolveGrantStatus,
  rolesOfTenant,
  sameLevelDeptNameExists,
  scopeLabel,
  seedAssignments,
  seedChangeLogs,
  seedCustomRoles,
  seedPermAudit,
  validateDeptParent,
  type AccessRealm,
  type BizScopeItem,
  type DeptDeleteBlocker,
  type FieldPolicyKind,
  type GrantStatus,
  type MembershipStatus,
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
  derivedRegionCodesOfBizScopes,
  derivedRegionCodesOfScope,
  drainBindingAuditEvents,
  grantablePharmasForProvider,
  membershipActive,
  membershipOfUserInTenant,
  membershipsOfTenant,
  moveMembershipsBulk,
  rejoinMembership,
  removeMembership,
  setMembershipRegions,
  subscribeTenantMemberships,
  upsertMembership,
  validateBizScopes,
  activateMembership,
} from '../data/cooperationModel';
import {
  ACCOUNT_PATTERN,
  allOrgs,
  getTenantRegistrySnapshot,
  isAccountTakenInWorkspace,
  isPhoneTakenInWorkspace,
  removeRuntimeOrg,
  subscribeTenantRegistry,
  tenantQuotaInfo,
  upsertRuntimeOrg,
} from '../data/tenantRegistry';
import { canonicalRegionName, canonicalRegions } from '../data/pharmaRegionScope';
import {
  getTenantPackagesSnapshot,
  subscribeTenantPackages,
  tenantPackageMenuIds,
} from '../data/tenantPackages';

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

/** 租户管理员预置角色（防锁死保护按此判定「最后一名有效管理员」；
 * 2026-11 §3.2：带管理员权限的角色不进新建成员首屏，走成员详情「管理权限」单独操作） */
export const ADMIN_ROLE_IDS = ['role-pharma-admin', 'role-provider-admin'];

interface PermissionStore {
  roles: SysRole[];
  assignments: RoleAssignment[];
  users: PermUser[];
  orgs: PermOrg[];
  changeLogs: RoleChangeLog[];
  auditEvents: PermAuditEvent[];
  /** 已认证主体（软件服务方/租户判别联合） */
  principal: AuthPrincipal;
  /** 当前身份权限域 */
  realm: AccessRealm;
  /** 当前是否软件服务方身份（软件服务方人员不进入租户内部配置） */
  isPlatform: boolean;
  /** 当前租户类型（仅租户身份） */
  tenantKind: TenantKind | null;
  /** 当前身份所在权限域的角色（系统角色与租户角色永不混列） */
  realmRoles: SysRole[];
  /** 旧三类页面视角的兼容派生值（仅 TENANT 域业务页面使用；软件服务方身份为 null，系统管理后台页面用 realm+platformRoleId 判断） */
  loginRole: Role | null;
  mappedRole: SysRole;
  preview: PreviewState | null;
  effectiveRole: SysRole;
  previewReadOnly: boolean;
  can: (pageId: string, action?: PageAction) => boolean;
  visiblePages: Set<string>;
  startPreview: (state: Omit<PreviewState, 'startedAt'>) => void;
  exitPreview: () => void;
  createRole: (input: {
    name: string;
    description: string;
    defaultScope: ScopeType;
    pagePerms?: Record<string, PageAction[]>;
    fieldPolicies?: Record<string, FieldPolicyKind>;
    status?: SysRoleStatus;
  }) => { ok: boolean; error?: string; role?: SysRole };
  /** 保存角色配置；opts.publish=true 时「保存并发布」自动将 draft 流转为 enabled（消除草稿不可授予的死路） */
  updateRole: (roleId: string, patch: Partial<SysRole>, summary: string, opts?: { publish?: boolean }) => { ok: boolean; error?: string };
  /** 复制为自定义角色（预置角色只读，唯一的能力复用入口）：生成同配置的自定义草稿角色 */
  cloneRole: (roleId: string) => { ok: boolean; error?: string; role?: SysRole };
  setRoleStatus: (roleId: string, status: SysRoleStatus, reason: string) => { ok: boolean; error?: string; affected?: PermUser[] };
  deleteRole: (roleId: string, reason?: string) => { ok: boolean; error?: string; affected?: PermUser[] };
  /**
   * 租户域唯一授权入口（成员维度「角色与数据范围」共享同一数据源）。
   * 2026-11 拍板：彻底移除 pending_review 死锁——授权提交后直接 active，
   * 高危角色强制记录带高危标记的审计日志；服务商支持例外跨部门（extraOrgIds）、
   * 药厂品种范围（pharmaVarietyScope）与服务商结构化业务范围（bizScopeMode/bizScopes）。
   */
  createAssignment: (input: {
    userId: string;
    roleId: string;
    effectiveFrom: string;
    effectiveTo?: string;
    reason?: string;
    /** 服务商员工可处理药厂（兼容口径；结构化范围请传 bizScopeMode/bizScopes） */
    pharmaTenantIds?: string[];
    varietyNames?: string[];
    regionCodes?: string[];
    projectNames?: string[];
    /** 组织范围模式：dynamic=动态跟随成员当前部门（调岗自动切换）；custom=例外指定 */
    scopeMode?: 'dynamic' | 'custom';
    /** 例外跨部门管辖节点（区域总监分管多平行大区，避免角色爆炸） */
    extraOrgIds?: string[];
    /** 【药厂】管辖品种白名单（空/缺省=全部品种） */
    pharmaVarietyScope?: string[];
    /** 【服务商】业务范围模式：inherit_org=继承部门；custom=个人自定义收窄 */
    bizScopeMode?: 'inherit_org' | 'custom';
    bizScopes?: BizScopeItem[];
  }) => { ok: boolean; error?: string };
  updateAssignmentScope: (
    assignmentId: string,
    patch: {
      effectiveFrom?: string;
      effectiveTo?: string;
      pharmaTenantIds?: string[];
      varietyNames?: string[];
      regionCodes?: string[];
      projectNames?: string[];
      scopeMode?: 'dynamic' | 'custom';
      extraOrgIds?: string[];
      pharmaVarietyScope?: string[];
      bizScopeMode?: 'inherit_org' | 'custom';
      bizScopes?: BizScopeItem[];
      reason: string;
    },
  ) => { ok: boolean; error?: string };
  /** 移除/回收角色授权（含租户最后一名管理员防锁死校验；只允许本租户边界内操作） */
  revokeAssignment: (assignmentId: string, reason?: string) => { ok: boolean; error?: string };
  /**
   * 一站式新建成员（2026-11 拍板）：手机号为自然人唯一主键——
   * 平台已有该手机号时直接复用自然人并只建本租户 TenantMembership（一手机号多企业，
   * 绝不报「手机号已绑定其他账号」）；用户名/邮箱选填（缺省自动生成）；
   * roles 支持建号同时直接赋权一步生效（内部复用 createAssignment 全量校验）。
   */
  createUser: (input: {
    name: string;
    account?: string;
    phone: string;
    email?: string;
    orgId: string;
    jobTitle?: string;
    employeeNo?: string;
    secondaryOrgUnitIds?: string[];
    roles?: Array<Omit<Parameters<PermissionStore['createAssignment']>[0], 'userId'>>;
  }) => { ok: boolean; error?: string; user?: PermUser; reusedExistingUser?: boolean; grantedRoles?: number };
  /**
   * 成员状态变更（租户级冻结/解冻/办理离职，2026-11 拍板核心 P0）：
   * 只改当前租户 TenantMembership.status，绝对禁止触碰全局 PermUser.accountStatus；
   * revokeAssignments 时严格按 a.tenantId === 当前租户 回收，绝不回收自然人在其他企业的授权；
   * 防锁死：不能停用/离职自己，停用后本企业将无任何有效管理员时直接拦截。
   */
  setMemberStatus: (input: {
    userId: string;
    status: MembershipStatus;
    opts?: { reason?: string; revokeAssignments?: boolean };
  }) => { ok: boolean; error?: string; managedDeptNames?: string[] };
  /** 编辑成员资料（本企称谓）：姓名/邮箱（PermUser 层）+ 岗位/工号/部门（成员身份层） */
  updateMemberProfile: (input: {
    userId: string;
    name?: string;
    email?: string;
    jobTitle?: string;
    employeeNo?: string;
    orgUnitId?: string;
    secondaryOrgUnitIds?: string[];
  }) => { ok: boolean; error?: string; reanchored?: string[]; extraOrgIds?: string[] };
  /**
   * 修正成员手机号（2026-11-25 拍板 · 仅未激活可改）：
   * 建号不收验证码，管理员录错号可在成员激活前直接改；一旦激活，手机号即个人登录凭证，
   * 管理员不可修改（防顶号越权），只能由员工本人换绑，或移除该成员后重新建档。
   */
  correctMemberPhone: (input: { userId: string; phone: string }) => { ok: boolean; error?: string };
  /** 批量调整成员所属部门（动态组织范围自动重锚定；clearExtraScopes 时同步清空例外范围） */
  batchMoveMembers: (input: { userIds: string[]; orgId: string; clearExtraScopes?: boolean }) => { ok: boolean; error?: string; moved?: number };
  /** 批量授予角色（逐人走 createAssignment 全量校验；返回失败名单供提示） */
  batchGrantRole: (input: Omit<Parameters<PermissionStore['createAssignment']>[0], 'userId'> & { userIds: string[] }) => { ok: boolean; error?: string; failed?: Array<{ userId: string; name: string; error: string }> };
  /** 移除成员（终止本企业成员身份；自然人与其他企业身份不受影响） */
  removeTenantMember: (input: { userId: string; kind: string; note?: string }) => { ok: boolean; error?: string; revokedCount?: number };
  /** 移除/离职后重新加入：恢复为 active 成员并更新部门 */
  rejoinTenantMember: (input: { userId: string; orgId: string }) => { ok: boolean; error?: string };
  addDepartment: (input: { name: string; parentId: string; deptTag?: string }) => { ok: boolean; error?: string; org?: PermOrg };
  /**
   * 修改部门：改名与调整上级共用同一套同级重名规则；businessRefDeptNames 由页面传入
   * 当前生效验收配置引用的部门名——被引用部门禁止改名（删除见 deleteDepartment）。
   */
  updateDepartment: (input: { orgId: string; name?: string; parentId?: string; deptTag?: string; reason?: string; businessRefDeptNames?: string[] }) => { ok: boolean; error?: string };
  /**
   * 删除部门：企业根不可删；本部门及下级有成员、有直接下级、
   * 或被业务配置按名引用（businessRefDeptNames 由页面从验收链等配置收集）时阻止并返回
   * blockers；通过后删除节点、记墓碑并审计，返回原上级供页面回选。
   */
  deleteDepartment: (input: { orgId: string; businessRefDeptNames?: string[] }) => {
    ok: boolean; error?: string; blockers?: DeptDeleteBlocker[]; parent?: PermOrg;
  };
  /**
   * 停用/启用部门（支持停用归档）：停用有成员的部门必须提供迁移目标 moveToId，
   * 成员主/兼职部门一次性迁入（同步 TenantMembership，绝不碰旧 User.orgId）；
   * 停用级联到全部下级部门。
   */
  setDepartmentStatus: (input: { orgId: string; status: 'active' | 'disabled'; moveToId?: string; reason?: string }) => { ok: boolean; error?: string; memberCount?: number; movedCount?: number; blockedDeptNames?: string[] };
  /** 设置/更换部门负责人（本租户正常状态成员；变更原因写审计） */
  setDepartmentManager: (input: { orgId: string; userId: string | null; reason?: string }) => { ok: boolean; error?: string };
  /** 服务商部门默认业务承接范围（药厂→品种→收窄区域；成员授权选「继承部门」即生效） */
  setDepartmentBizScope: (input: { orgId: string; bizScope: BizScopeItem[] | null; reason?: string }) => { ok: boolean; error?: string };
  /** 成员负责区域（按人配置、调岗不变）：省级短名 / 「全国」；空数组 = 未配置（默认拒绝，角色不受影响） */
  setMemberRegions: (input: { userId: string; regions: string[]; reason?: string }) => { ok: boolean; error?: string; regions?: string[] };
  /** 调岗（单成员便捷入口）：动态组织范围自动重锚定；返回例外范围 id 供弹窗联动清理 */
  setUserOrg: (input: { userId: string; orgId: string; clearExtraScopes?: boolean }) => { ok: boolean; error?: string; reanchored?: string[]; extraOrgIds?: string[] };
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
  // 组织树从 registry 统一读口径水合（种子 + 运行时覆盖），与登录链路同源；
  // 部门 CRUD / 管理区域经 upsertRuntimeOrg 回写，刷新与重新登录后不丢（2026-10-27 P1）
  const [orgs, setOrgs] = useState<PermOrg[]>(() => allOrgs());
  const [users, setUsers] = useState<PermUser[]>(() => [...PERM_USERS]);
  // createAssignment 等回调需要读取「同一次事件里刚创建」的用户，闭包 state 会过期
  const usersRef = useRef(users);
  usersRef.current = users;
  /**
   * 平台自然人全量（手机号查重口径）：会话内新建用户 + 种子 + 租户注册中心运行时用户。
   * 一手机号多企业建档的查重必须覆盖三层，跨企业复用同一自然人。
   */
  const allUsersBase = useCallback(() => {
    const seen = new Set(usersRef.current.map(u => u.id));
    return [...usersRef.current, ...[...PERM_USERS, ...getTenantRegistrySnapshot().users].filter(u => !seen.has(u.id))];
  }, []);
  const [changeLogs, setChangeLogs] = useState<RoleChangeLog[]>(() => [...seedChangeLogs]);
  const [auditEvents, setAuditEvents] = useState<PermAuditEvent[]>(
    // 登录审计并入模块级镜像（跨会话可查）；页面操作审计跨会话保留；
    // 系统角色绑定审计缓冲（cooperationModel 数据层产生）同构并入；种子审计兜底展示
    () => {
      const drained = drainLoginAuditEvents();
      for (let i = drained.length - 1; i >= 0; i -= 1) loginAuditBuffer.unshift(drained[i]);
      if (loginAuditBuffer.length > LOGIN_AUDIT_BUFFER_CAP) {
        loginAuditBuffer.length = LOGIN_AUDIT_BUFFER_CAP;
      }
      return [...loginAuditBuffer, ...drainBindingAuditEvents(), ...pageAuditBuffer, ...seedPermAudit];
    },
  );
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const realm = principal.realm;
  const isPlatform = realm === "PLATFORM";
  const tenantKind = principal.realm === "TENANT" ? principal.tenantKind : null;
  const principalTenantId = principal.realm === "TENANT" ? principal.tenantId : null;
  const principalTenantKind = principal.realm === "TENANT" ? principal.tenantKind : null;
  /** 权限域角色：realm + tenantKind(appliesTo) + tenantId 三重隔离（2026-11 拍板） */
  const realmRoles = useMemo(
    () => rolesOfTenant(roles, realm, realm === 'TENANT' ? principalTenantId : null, principalTenantKind),
    [roles, realm, principalTenantId, principalTenantKind],
  );
  /** 全部生效角色 id（多角色合并口径；平台域恒单角色） */
  const currentRoleIds = useMemo(
    () => (principal.realm === "PLATFORM" ? [principal.platformRoleId] : principal.roleIds),
    [principal],
  );
  /** 主角色（首个生效角色）：视角派生与展示兜底，权限判定一律用 effectiveRole 并集 */
  const currentRoleId = currentRoleIds[0];

  const mappedRole = useMemo(
    () => roles.find(r => r.id === currentRoleId) ?? realmRoles[0],
    [currentRoleId, roles, realmRoles],
  );
  const loginRole = useMemo(() => perspectiveRoleOf(mappedRole), [mappedRole]);
  const ACTOR = principal.name;

  const effectiveRole = useMemo(() => {
    // 角色预览保持单角色只读语义：以被预览角色单独渲染
    if (preview) return roles.find(r => r.id === preview.roleId) ?? mappedRole;
    if (principal.realm !== "TENANT" || currentRoleIds.length <= 1) return mappedRole;
    const roleList = currentRoleIds
      .map(id => roles.find(r => r.id === id))
      .filter((r): r is SysRole => Boolean(r));
    if (roleList.length <= 1) return roleList[0] ?? mappedRole;
    // 同企业多角色自动合并：功能权限按权限点并集、字段策略从严（mergeRolePerms）
    const { pagePerms, fieldPolicies } = mergeRolePerms(roleList);
    return { ...roleList[0], id: "multi-role-merged", name: roleList.map(r => r.name).join(" + "), pagePerms, fieldPolicies };
  }, [preview, roles, mappedRole, principal.realm, currentRoleIds]);

  const logAudit = useCallback((partial: Partial<PermAuditEvent> & Pick<PermAuditEvent, 'action' | 'target' | 'module'>) => {
    const event: PermAuditEvent = {
      id: nextId('PE'),
      time: nowStamp(),
      actor: principal.name,
      actorRole:
        principal.realm === 'PLATFORM'
          ? principal.platformRoleName
          : principal.roleNames.join('+'),
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

  // 套餐/租户绑定变更联动（换绑或编辑套餐菜单集后 visiblePages 即时重算）
  const packagesSnap = useSyncExternalStore(subscribeTenantPackages, getTenantPackagesSnapshot);
  const registrySnap = useSyncExternalStore(subscribeTenantRegistry, getTenantRegistrySnapshot);
  void packagesSnap;
  void registrySnap;

  const visiblePages = useMemo(() => {
    const base = new Set(
      (Object.entries(effectiveRole.pagePerms) as [string, PageAction[]][])
        .filter(([, actions]) => actions.includes('view') || actions.length > 0)
        .map(([id]) => id),
    );
    // 租户套餐过滤（2026-09-18 套餐模型）：租户域可见菜单 = 角色权限 ∩ 所绑套餐菜单。
    // 角色预览不受套餐裁剪（预览的是角色能力，不代表该租户开通态）；不在册的
    // 种子登录身份无套餐约束（tenantPackageMenuIds 返回 null 时保持全量）。
    if (principal.realm === 'TENANT' && !preview && principalTenantId) {
      const allowed = tenantPackageMenuIds(principalTenantId);
      if (allowed) {
        for (const id of [...base]) {
          if (!allowed.has(id as PageId)) base.delete(id);
        }
      }
    }
    return base;
  }, [effectiveRole, principal, preview, principalTenantId, packagesSnap, registrySnap]);

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

  const createRole = useCallback((input: {
    name: string;
    description: string;
    defaultScope: ScopeType;
    pagePerms?: Record<string, PageAction[]>;
    fieldPolicies?: Record<string, FieldPolicyKind>;
    status?: SysRoleStatus;
  }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const name = input.name.trim();
    if (!name) return { ok: false, error: '请填写角色名称' };
    // 名称唯一性按权限域 + 租户隔离：预置角色与本租户自定义角色之间不重名；
    // 其他租户的自定义角色互不可见、互不冲突
    const tenantVisible = (r: SysRole) => realm === 'PLATFORM' || r.tenantId == null || r.tenantId === principalTenantId;
    if (roles.some(r => r.name === name && r.realm === realm && tenantVisible(r))) {
      return { ok: false, error: realm === 'PLATFORM' ? '系统角色名称必须唯一' : '本企业内角色名称必须唯一（含预置角色）' };
    }
    const nextStatus: SysRoleStatus = input.status ?? 'enabled';
    const nextPagePerms: Record<string, PageAction[]> = input.pagePerms
      ? Object.fromEntries(Object.entries(input.pagePerms).map(([k, v]) => [k, [...v]]))
      : { dashboard: ['view'] };
    const nextFieldPolicies: Record<string, FieldPolicyKind> = input.fieldPolicies
      ? { ...input.fieldPolicies }
      : Object.fromEntries(
        Object.keys(mappedRole.fieldPolicies).map(k => [k, 'hidden' as FieldPolicyKind]),
      );
    const created: SysRole = {
      id: nextId('role-custom'),
      name,
      description: input.description.trim(),
      kind: 'custom',
      status: nextStatus,
      realm,
      ...(realm === 'TENANT' && principalTenantId ? { tenantId: principalTenantId } : {}),
      ...(realm === 'TENANT' && tenantKind ? { appliesTo: [tenantKind] } : {}),
      defaultScope: realm === 'TENANT' && tenantKind === 'provider' && input.defaultScope === 'PHARMA' ? 'PROVIDER' : input.defaultScope,
      customScope: emptyCustomScope(),
      version: 1,
      updatedBy: ACTOR,
      updatedAt: nowStamp(),
      pagePerms: nextPagePerms,
      fieldPolicies: nextFieldPolicies,
    };
    setRoles(prev => [created, ...prev]);
    pushLog(created.id, '新建角色', `新建角色「${name}」`, { version: 1 });
    logAudit({
      module: MOD_AUTHZ,
      action: '新建角色',
      target: name,
      roleName: name,
      resource: 'roles.create',
      afterSummary: nextStatus === 'enabled' ? '启用' : '停用',
    });
    return { ok: true, role: created };
  }, [ACTOR, logAudit, mappedRole.fieldPolicies, preview, principalTenantId, pushLog, realm, roles, tenantKind]);

  const updateRole = useCallback((roleId: string, patch: Partial<SysRole>, summary: string, opts?: { publish?: boolean }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = roles.find(r => r.id === roleId);
    if (!current) return { ok: false, error: '角色不存在' };
    // 跨权限域 / 跨租户修改拦截：系统角色只能在软件服务方域改；其他租户的自定义角色不可改
    if (current.realm !== realm) return { ok: false, error: '不可修改当前权限域之外的角色' };
    if (realm === 'TENANT' && current.tenantId != null && current.tenantId !== principalTenantId) {
      return { ok: false, error: '不可修改本企业之外的自定义角色' };
    }
    // 预置角色只读（2026-11 拍板）：租户不可篡改全局模板，能力复用走「复制为自定义角色」
    if (current.kind === 'preset' && realm === 'TENANT') {
      return { ok: false, error: '系统预置角色只读，不可直接编辑；请使用「复制为自定义角色」后调整' };
    }
    if (patch.name && roles.some(r => r.id !== roleId && r.name === patch.name && r.realm === current.realm && (realm === 'PLATFORM' || r.tenantId == null || r.tenantId === principalTenantId))) {
      return { ok: false, error: '本企业内角色名称必须唯一（含预置角色）' };
    }
    // 「保存并发布」（2026-11 拍板）：草稿角色保存时自动流转为 enabled，立即可授予成员；
    // 已发布角色编辑后重新发布即时对已授权成员生效
    const nextStatus: SysRoleStatus = opts?.publish ? 'enabled' : (patch.status ?? current.status);
    const next: SysRole = {
      ...current,
      ...patch,
      status: nextStatus,
      realm: current.realm,
      version: current.version + 1,
      updatedBy: ACTOR,
      updatedAt: nowStamp(),
    };
    setRoles(prev => prev.map(r => (r.id === roleId ? next : r)));
    pushLog(roleId, '编辑角色', summary, {
      version: next.version,
      beforeSummary: `${current.defaultScope} / v${current.version}`,
      afterSummary: `${next.defaultScope} / v${next.version}${opts?.publish && current.status !== 'enabled' ? ' · 已发布启用' : ''}`,
    });
    const affectedUsers = new Set(
      assignments.filter(a => a.roleId === roleId && isGrantEffective(a)).map(a => a.userId),
    ).size;
    logAudit({
      module: MOD_AUTHZ,
      action: '编辑角色',
      target: next.name,
      roleName: next.name,
      resource: 'roles.edit',
      beforeSummary: current.status === 'enabled' ? '启用' : '停用',
      afterSummary: `${summary} · ${next.status === 'enabled' ? '启用' : '停用'} · 影响 ${affectedUsers} 名已授权用户`,
    });
    return { ok: true };
  }, [assignments, logAudit, preview, pushLog, realm, roles]);

  /**
   * 复制为自定义角色（预置角色只读模型下的能力复用唯一入口）：
   * 复制页面权限/字段策略/范围策略为草稿自定义角色（名称加「副本」后缀），
   * 租户可自由编辑、发布后授予成员。
   */
  const cloneRole = useCallback((roleId: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const source = roles.find(r => r.id === roleId);
    if (!source) return { ok: false, error: '角色不存在' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '仅租户身份可复制为自定义角色' };
    if (source.realm !== 'TENANT') return { ok: false, error: '系统角色不可复制为企业角色' };
    if (source.appliesTo && principalTenantKind && !source.appliesTo.includes(principalTenantKind)) {
      return { ok: false, error: '该角色不适用于当前企业类型' };
    }
    let name = `${source.name}（副本）`;
    let n = 2;
    const nameTaken = (candidate: string) =>
      roles.some(r => r.name === candidate && r.realm === realm && (r.tenantId == null || r.tenantId === principalTenantId));
    while (nameTaken(name)) {
      name = `${source.name}（副本${n}）`;
      n += 1;
    }
    const created: SysRole = {
      ...source,
      id: nextId('role-custom'),
      name,
      kind: 'custom',
      status: 'draft',
      tenantId: principalTenantId,
      ...(source.appliesTo ? { appliesTo: [...source.appliesTo] } : {}),
      version: 1,
      updatedBy: ACTOR,
      updatedAt: nowStamp(),
      pagePerms: Object.fromEntries(Object.entries(source.pagePerms).map(([k, v]) => [k, [...v]])),
      fieldPolicies: { ...source.fieldPolicies },
      customScope: { ...source.customScope },
    };
    setRoles(prev => [created, ...prev]);
    pushLog(created.id, '复制角色', `从「${source.name}」复制为自定义草稿角色`, { version: 1 });
    logAudit({
      module: MOD_AUTHZ,
      action: '复制角色',
      target: name,
      roleName: name,
      resource: 'roles.clone',
      reason: '从预置/既有角色复制',
      beforeSummary: `${source.name} · v${source.version}`,
      afterSummary: `${name} · 草稿 · 配置与源角色一致`,
    });
    return { ok: true, role: created };
  }, [ACTOR, logAudit, preview, principalTenantId, principalTenantKind, pushLog, realm, roles]);

  const setRoleStatus = useCallback((roleId: string, status: SysRoleStatus, reason: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = roles.find(r => r.id === roleId);
    if (!current) return { ok: false, error: '角色不存在' };
    if (current.realm !== realm) return { ok: false, error: '不可启停当前权限域之外的角色' };
    if (realm === 'TENANT' && current.tenantId != null && current.tenantId !== principalTenantId) {
      return { ok: false, error: '不可启停本企业之外的自定义角色' };
    }
    // 预置角色只读（2026-11 拍板）：禁停用
    if (current.kind === 'preset' && realm === 'TENANT') {
      return { ok: false, error: '系统预置角色只读，不可停用' };
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
    // 预置角色只读（2026-11 拍板）：禁删除
    if (current.kind === 'preset' && realm === 'TENANT') {
      return { ok: false, error: '系统预置角色只读，不可删除' };
    }
    // 高危删除守卫：仍有生效或未生效授权时阻止，须先在「已授权成员」页签回收；
    // 历史已回收 / 已过期的引用保留为记录，不阻止删除
    const activeAssignments = assignments.filter(
      a => a.roleId === roleId && isGrantActiveOrPending(a),
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
   * 租户域唯一授权入口（「角色与数据范围」页 · 已授权成员页签 + 用户管理成员维度共享）。
   * 软件服务方人员不得调用本方法管理任何租户内部授权；授予时写入稳定 tenantId 边界。
   * 2026-11 拍板：
   * - 彻底移除 pending_review 死锁——授权提交后直接 active，高危角色自动记录高危审计；
   * - scopeMode=dynamic 动态锚定成员当前部门（调岗自动切换）；
   * - 服务商结构化业务范围（继承部门 / 个人收窄）与药厂管辖品种按租户类型写入。
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
    scopeMode?: 'dynamic' | 'custom';
    extraOrgIds?: string[];
    pharmaVarietyScope?: string[];
    bizScopeMode?: 'inherit_org' | 'custom';
    bizScopes?: BizScopeItem[];
  }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) {
      return { ok: false, error: '软件服务方身份不进入租户内部授权：请由企业管理员在租户工作空间内授予' };
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
      return { ok: false, error: '该成员身份已冻结/离职，不可授予角色' };
    }
    const memberOrgId = membership.orgUnitId;
    const role = roles.find(r => r.id === input.roleId);
    if (!role) return { ok: false, error: '角色不存在' };
    if (role.realm !== 'TENANT') return { ok: false, error: '系统角色不可授予企业成员（软件服务方权限域分离）' };
    if (role.appliesTo && principalTenantKind && !role.appliesTo.includes(principalTenantKind)) {
      return { ok: false, error: `角色「${role.name}」不适用于当前企业类型` };
    }
    if (role.status !== 'enabled') return { ok: false, error: '停用或草稿角色不可授予' };
    // 全局账号停用（平台级处置，如违规封禁）与租户级冻结分离：前者不可授予，后者走 membershipActive 拦截
    if (user.accountStatus !== 'enabled') {
      return { ok: false, error: '该自然人账号已全局停用（平台级处置），不可授予角色' };
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      return { ok: false, error: '到期日期不能早于生效日期' };
    }
    // 例外跨部门（extraOrgIds）租户边界校验：只能选本企业组织树内节点
    const extraOrgIds = (input.extraOrgIds ?? []).filter(id =>
      enterpriseRootOf(orgs, id)?.id === principalTenantId && orgs.some(o => o.id === id),
    );
    // 【服务商】结构化业务范围：继承部门（服务端实时取交集，无需回填）/ 个人自定义收窄
    let bizScopeMode: 'inherit_org' | 'custom' | undefined;
    let bizScopes: BizScopeItem[] | undefined;
    let legacyPharmaIds = input.pharmaTenantIds;
    let legacyVarietyNames = input.varietyNames;
    let derivedRegions: string[] | undefined;
    if (principalTenantKind === 'provider' && (input.bizScopeMode === 'inherit_org' || input.bizScopeMode === 'custom')) {
      bizScopeMode = input.bizScopeMode;
      if (bizScopeMode === 'custom') {
        const cleaned = (input.bizScopes ?? []).map(s => ({
          pharmaTenantId: s.pharmaTenantId,
          varietyNames: [...s.varietyNames],
          regionCodes: [...s.regionCodes],
        }));
        const scopeErrors = validateBizScopes(cleaned, principalTenantId);
        if (scopeErrors.length > 0) return { ok: false, error: scopeErrors[0] };
        bizScopes = cleaned;
        // 兼容回填：pharmaTenantIds/varietyNames/regionCodes 供既有门页与业务页平滑读取
        legacyPharmaIds = cleaned.map(s => s.pharmaTenantId);
        legacyVarietyNames = [...new Set(cleaned.flatMap(s => s.varietyNames))];
        derivedRegions = derivedRegionCodesOfBizScopes(cleaned, principalTenantId);
      }
    } else if (principalTenantKind === 'provider' && legacyPharmaIds && legacyPharmaIds.length > 0) {
      // 兼容口径：仅选药厂（未切结构化编辑器）时仍按「不扩大」上限校验
      const grantable = new Set(grantablePharmasForProvider(principalTenantId));
      const over = legacyPharmaIds.filter(id => !grantable.has(id));
      if (over.length > 0) {
        return { ok: false, error: `「${over.map(id => orgs.find(o => o.id === id)?.name ?? id).join('、')}」当前合作未生效或业务授权已失效，服务商内部授权不能扩大药厂授予的范围` };
      }
      if (legacyVarietyNames && legacyVarietyNames.length > 0) {
        const allowed = new Set(
          legacyPharmaIds.flatMap(id => authorizedVarietyLinesOfPharma(principalTenantId, id).map(l => l.varietyName)),
        );
        const badVariety = legacyVarietyNames.filter(v => !allowed.has(v));
        if (badVariety.length > 0) {
          return { ok: false, error: `品种「${badVariety.join('、')}」不在药厂授予本服务商的有效品种范围内，不能授予员工` };
        }
      }
      derivedRegions = derivedRegionCodesOfScope(principalTenantId, legacyPharmaIds, legacyVarietyNames);
    }
    // 【药厂】管辖品种白名单（空=全部品种）
    const pharmaVarietyScope = principalTenantKind === 'pharma' && input.pharmaVarietyScope && input.pharmaVarietyScope.length > 0
      ? [...input.pharmaVarietyScope]
      : undefined;
    const highRisk = isHighRiskRole(role);
    // 范围锚点以成员身份所在部门为准（同一人在不同租户可锚定不同组织）；
    // scopeMode 缺省：DEPT/DEPT_AND_CHILD/SELF → dynamic（调岗自动切换），CUSTOM → custom
    const { scopeOrgId, scopeOrgName, scope } = resolveGrantAnchor(orgs, memberOrgId, role);
    const scopeMode: 'dynamic' | 'custom' = input.scopeMode ?? (role.defaultScope === 'CUSTOM' ? 'custom' : 'dynamic');
    const dup = assignments.some(
      a => a.tenantId === principalTenantId && a.userId === input.userId && a.roleId === input.roleId && isGrantActiveOrPending(a),
    );
    if (dup) {
      return { ok: false, error: `该用户已持有有效或待生效的「${role.name}」授权，请直接调整而非重复授予` };
    }
    const assignment: RoleAssignment = {
      id: nextId('g'),
      tenantId: principalTenantId,
      userId: input.userId,
      roleId: input.roleId,
      scopeOrgId,
      scopeOrgName,
      scope,
      scopeMode,
      ...(extraOrgIds.length > 0 ? { extraOrgIds } : {}),
      ...(pharmaVarietyScope ? { pharmaVarietyScope } : {}),
      ...(bizScopeMode ? { bizScopeMode } : {}),
      ...(bizScopes ? { bizScopes } : {}),
      ...(legacyPharmaIds && legacyPharmaIds.length > 0 ? { pharmaTenantIds: legacyPharmaIds } : {}),
      ...(legacyVarietyNames && legacyVarietyNames.length > 0 ? { varietyNames: legacyVarietyNames } : {}),
      ...(derivedRegions && derivedRegions.length > 0 ? { regionCodes: derivedRegions } : {}),
      ...(input.projectNames && input.projectNames.length > 0 ? { projectNames: input.projectNames } : {}),
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      grantedBy: ACTOR,
      grantedAt: nowStamp(),
      // 授权提交后按起止日期计算实际状态（未来生效为 pending，到日即生效）
      status: 'active',
      reason: input.reason?.trim() || undefined,
    };
    setAssignments(prev => [assignment, ...prev]);
    logAudit({
      module: MOD_AUTHZ,
      action: '授予角色',
      target: `${user.name} × ${role.name}`,
      roleName: role.name,
      resource: 'role-assignments.create',
      reason: [highRisk ? '高危授权' : null, input.reason?.trim() || null].filter(Boolean).join(' · ') || '常规授权',
      afterSummary: [
        '生效',
        // 药厂侧范围档位已退役：负责区域按成员配置（调岗不变），审计只留挂靠组织（服务商侧照旧记档位）
        principalTenantKind === 'pharma' ? `${scopeOrgName} · 负责区域按成员配置` : `${scopeOrgName} · ${scopeLabel(scope)}${scopeMode === 'dynamic' ? '（动态跟随部门）' : ''}`,
        extraOrgIds.length > 0 ? `例外管辖 ${extraOrgIds.length} 个部门` : null,
        principalTenantKind === 'pharma' && pharmaVarietyScope ? `管辖品种 ${pharmaVarietyScope.length} 个` : null,
        bizScopeMode === 'inherit_org' ? '业务范围=继承部门' : null,
        bizScopeMode === 'custom' ? `业务范围=个人指定（${bizScopes?.length ?? 0} 家药厂）` : null,
        legacyPharmaIds && legacyPharmaIds.length > 0 && !bizScopeMode ? `可处理药厂 ${legacyPharmaIds.length} 家` : null,
      ].filter(Boolean).join(' · '),
    });
    return { ok: true };
  }, [assignments, logAudit, orgs, preview, principalTenantId, principalTenantKind, realm, roles]);

  /** 调整既有授权的范围（组织模式/例外管辖/品种/结构化业务范围/有效期）：同受「不扩大」上限约束 */
  const updateAssignmentScope = useCallback((assignmentId: string, patch: {
    effectiveFrom?: string;
    effectiveTo?: string;
    pharmaTenantIds?: string[];
    varietyNames?: string[];
    regionCodes?: string[];
    projectNames?: string[];
    scopeMode?: 'dynamic' | 'custom';
    extraOrgIds?: string[];
    pharmaVarietyScope?: string[];
    bizScopeMode?: 'inherit_org' | 'custom';
    bizScopes?: BizScopeItem[];
    reason: string;
  }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '软件服务方身份不进入租户内部授权' };
    const current = assignments.find(a => a.id === assignmentId);
    if (!current) return { ok: false, error: '授权不存在' };
    if (current.tenantId !== principalTenantId) return { ok: false, error: '不能调整其他企业的授权记录' };
    if (!patch.reason.trim()) return { ok: false, error: '请填写调整原因（随审计保留）' };
    if (patch.effectiveTo && patch.effectiveTo < (patch.effectiveFrom ?? current.effectiveFrom)) {
      return { ok: false, error: '到期日期不能早于生效日期' };
    }
    const nextExtraOrgIds = patch.extraOrgIds
      ? patch.extraOrgIds.filter(id => enterpriseRootOf(orgs, id)?.id === principalTenantId && orgs.some(o => o.id === id))
      : undefined;
    let bizScopeMode: 'inherit_org' | 'custom' | undefined;
    let bizScopes: BizScopeItem[] | undefined;
    let legacyPharmaIds = patch.pharmaTenantIds;
    let legacyVarietyNames = patch.varietyNames;
    let derivedRegions: string[] | undefined;
    if (principalTenantKind === 'provider' && (patch.bizScopeMode === 'inherit_org' || patch.bizScopeMode === 'custom')) {
      bizScopeMode = patch.bizScopeMode;
      if (bizScopeMode === 'custom') {
        const cleaned = (patch.bizScopes ?? current.bizScopes ?? []).map(s => ({
          pharmaTenantId: s.pharmaTenantId,
          varietyNames: [...s.varietyNames],
          regionCodes: [...s.regionCodes],
        }));
        const scopeErrors = validateBizScopes(cleaned, principalTenantId);
        if (scopeErrors.length > 0) return { ok: false, error: scopeErrors[0] };
        bizScopes = cleaned;
        legacyPharmaIds = cleaned.map(s => s.pharmaTenantId);
        legacyVarietyNames = [...new Set(cleaned.flatMap(s => s.varietyNames))];
        derivedRegions = derivedRegionCodesOfBizScopes(cleaned, principalTenantId);
      } else {
        // 切回继承部门：清空个人结构化范围与兼容回填，运行时由部门配置实时派生
        legacyPharmaIds = undefined;
        legacyVarietyNames = undefined;
        derivedRegions = undefined;
      }
    } else if (principalTenantKind === 'provider' && legacyPharmaIds && legacyPharmaIds.length > 0) {
      const grantable = new Set(grantablePharmasForProvider(principalTenantId));
      const over = legacyPharmaIds.filter(id => !grantable.has(id));
      if (over.length > 0) {
        return { ok: false, error: `「${over.map(id => orgs.find(o => o.id === id)?.name ?? id).join('、')}」当前合作未生效或业务授权已失效，不能授予员工` };
      }
      if (legacyVarietyNames && legacyVarietyNames.length > 0) {
        const allowed = new Set(
          legacyPharmaIds.flatMap(id => authorizedVarietyLinesOfPharma(principalTenantId, id).map(l => l.varietyName)),
        );
        const badVariety = legacyVarietyNames.filter(v => !allowed.has(v));
        if (badVariety.length > 0) {
          return { ok: false, error: `品种「${badVariety.join('、')}」不在药厂授予本服务商的有效品种范围内，不能授予员工` };
        }
      }
      derivedRegions = derivedRegionCodesOfScope(principalTenantId, legacyPharmaIds, legacyVarietyNames);
    }
    const pharmaVarietyScope = principalTenantKind === 'pharma' && patch.pharmaVarietyScope
      ? [...patch.pharmaVarietyScope]
      : patch.pharmaVarietyScope === undefined ? undefined : [];
    const next: RoleAssignment = {
      ...current,
      ...(patch.effectiveFrom ? { effectiveFrom: patch.effectiveFrom } : {}),
      effectiveTo: patch.effectiveTo,
      ...(patch.scopeMode ? { scopeMode: patch.scopeMode } : {}),
      ...(nextExtraOrgIds ? { extraOrgIds: nextExtraOrgIds } : {}),
      ...(pharmaVarietyScope !== undefined ? { pharmaVarietyScope: pharmaVarietyScope.length > 0 ? pharmaVarietyScope : undefined } : {}),
      ...(bizScopeMode ? { bizScopeMode, ...(bizScopeMode === 'custom' && bizScopes ? { bizScopes } : { bizScopes: undefined }) } : {}),
      ...(legacyPharmaIds ? { pharmaTenantIds: legacyPharmaIds } : {}),
      ...(legacyVarietyNames ? { varietyNames: legacyVarietyNames } : {}),
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
      beforeSummary: [
        current.bizScopeMode === 'inherit_org' ? '业务范围=继承部门' : current.bizScopeMode === 'custom' ? `业务范围=个人指定（${current.bizScopes?.length ?? 0} 家药厂）` : `可处理药厂 ${(current.pharmaTenantIds ?? []).length} 家`,
        `${current.effectiveFrom}${current.effectiveTo ? ` ~ ${current.effectiveTo}` : ''}`,
      ].join(' · '),
      afterSummary: [
        next.bizScopeMode === 'inherit_org' ? '业务范围=继承部门' : next.bizScopeMode === 'custom' ? `业务范围=个人指定（${next.bizScopes?.length ?? 0} 家药厂）` : `可处理药厂 ${(next.pharmaTenantIds ?? []).length} 家`,
        `${next.effectiveFrom}${next.effectiveTo ? ` ~ ${next.effectiveTo}` : ''}`,
        (next.extraOrgIds?.length ?? 0) > 0 ? `例外管辖 ${next.extraOrgIds!.length} 个部门` : null,
      ].filter(Boolean).join(' · '),
    });
    return { ok: true };
  }, [assignments, logAudit, orgs, preview, principalTenantId, principalTenantKind, roles, users]);

  /** 租户有效管理员判定（防锁死保护的核心）：持预置管理员角色 ∧ 授权生效 ∧ 成员身份有效 ∧ 账号可用 */
  const effectiveAdminUserIds = useCallback((tenantId: string, excludeUserId?: string): string[] => {
    const today = localTodayIso();
    const ids = new Set<string>();
    for (const a of assignments) {
      if (a.tenantId !== tenantId) continue;
      if (!ADMIN_ROLE_IDS.includes(a.roleId)) continue;
      if (!isGrantEffective(a, today)) continue;
      if (excludeUserId && a.userId === excludeUserId) continue;
      if (!membershipActive(membershipOfUserInTenant(a.userId, tenantId))) continue;
      const acc = usersRef.current.find(u => u.id === a.userId);
      if (acc?.accountStatus !== 'enabled') continue;
      ids.add(a.userId);
    }
    return [...ids];
  }, [assignments]);

  const revokeAssignment = useCallback((assignmentId: string, reason?: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = assignments.find(a => a.id === assignmentId);
    if (!current) return { ok: false, error: '角色分配不存在' };
    if (realm !== 'TENANT' || current.tenantId !== principalTenantId) {
      return { ok: false, error: '只能移除本企业的授权记录' };
    }
    if (current.status === 'revoked') return { ok: false, error: '该授权已移除' };
    // 防锁死保护（2026-11 拍板）：移除后本企业将无任何有效管理员时直接阻断
    if (ADMIN_ROLE_IDS.includes(current.roleId)) {
      const remaining = effectiveAdminUserIds(principalTenantId, current.userId);
      if (remaining.length === 0) {
        return { ok: false, error: '至少需保留一名有效企业管理员，防止系统锁死；请先授予其他成员管理员角色后再移除' };
      }
    }
    const cleanReason = reason?.trim() || '管理员移除';
    setAssignments(prev => prev.map(a => (
      a.id === assignmentId ? { ...a, status: 'revoked' as GrantStatus, reason: cleanReason, revokedBy: ACTOR, revokedAt: nowStamp() } : a
    )));
    const user = users.find(u => u.id === current.userId);
    const roleName = roles.find(r => r.id === current.roleId)?.name;
    logAudit({
      module: MOD_AUTHZ,
      action: '移除角色成员',
      target: `${user?.name ?? ''} × ${roleName}`,
      roleName,
      resource: 'role-assignments.revoke',
      reason: cleanReason,
      beforeSummary: principalTenantKind === 'pharma'
        ? `${current.scopeOrgName} · 负责区域按成员配置`
        : `${current.scopeOrgName} · ${scopeLabel(current.scope)}`,
      afterSummary: '已移除 · 历史保留可查',
    });
    return { ok: true };
  }, [ACTOR, assignments, effectiveAdminUserIds, logAudit, preview, principalTenantId, principalTenantKind, realm, roles, users]);

  /**
   * 一站式新建成员（2026-11 拍板重构）：
   * - 手机号 = 自然人唯一主键。平台已有该手机号 → 直接复用自然人账号，只新建
   *   本租户 TenantMembership（一手机号多企业建档，绝不阻断；红线 3）；
   * - 用户名/邮箱选填：缺省自动生成（账号 = u+手机号，冲突自动追加序号）；
   * - roles：建号同时直接勾选角色一步生效（逐条复用 createAssignment 全量校验）；
   * - 本企业内已有同手机号有效成员 → 阻断（情况 C）。
   */
  const createUser = useCallback((input: {
    name: string;
    account?: string;
    phone: string;
    email?: string;
    orgId: string;
    jobTitle?: string;
    employeeNo?: string;
    secondaryOrgUnitIds?: string[];
    roles?: Array<Omit<Parameters<PermissionStore['createAssignment']>[0], 'userId'>>;
  }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) {
      return { ok: false, error: '软件服务方身份不进入租户成员建档' };
    }
    const name = input.name.trim();
    const phone = input.phone.trim();
    const email = input.email?.trim() ?? '';
    if (!name) return { ok: false, error: '请填写姓名' };
    if (!phone) return { ok: false, error: '请填写手机号' };
    if (!/^1\d{10}$/.test(phone)) return { ok: false, error: '手机号格式不正确，应为 1 开头的 11 位数字' };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: '邮箱格式不正确' };
    const target = orgs.find(o => o.id === input.orgId);
    if (!target) return { ok: false, error: '所属部门不存在' };
    // 成员建档边界：租户管理员只能在本企业组织树内建号
    const targetRoot = enterpriseRootOf(orgs, target.id);
    if (!targetRoot || targetRoot.id !== principalTenantId) {
      return { ok: false, error: '只能在本企业组织内新建成员（租户边界）' };
    }
    // 情况 C（阻断）：该手机号已在本企业且成员身份有效
    const existingMembership = membershipsOfTenant(principalTenantId).find(m => {
      const u = allUsersBase().find(x => x.id === m.userId);
      return u?.phone === phone && membershipActive(m);
    });
    if (existingMembership) {
      const u = allUsersBase().find(x => x.id === existingMembership.userId);
      return { ok: false, error: `该手机号已是本企业成员（${u?.name ?? ''} · ${orgs.find(o => o.id === existingMembership.orgUnitId)?.name ?? '—'}），不可重复建档` };
    }
    // 套餐用户限额
    const { quota, used } = tenantQuotaInfo(principalTenantId);
    if (quota != null) {
      const localExtra = usersRef.current.filter(
        (u) =>
          !PERM_USERS.some((s) => s.id === u.id) &&
          u.accountStatus !== 'disabled' &&
          enterpriseRootOf(orgs, u.orgId)?.id === principalTenantId,
      ).length;
      if (used + localExtra >= quota) {
        return { ok: false, error: `该租户用户数量限额 ${quota} 人已满（当前 ${used + localExtra} 人），请联系软件服务方调整限额` };
      }
    }
    // 情况 B（跨企业复用自然人）：手机号已注册平台账号但不在本企业 → 免重复注册
    const existingUser = allUsersBase().find(u => u.phone === phone);
    let user: PermUser;
    let reusedExistingUser = false;
    if (existingUser) {
      user = { ...existingUser, ...(email ? { email } : {}), ...(name !== existingUser.name ? { name } : {}) };
      reusedExistingUser = true;
      if (email || name !== existingUser.name) {
        setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, email: user.email, name: user.name } : u)));
        usersRef.current = usersRef.current.map(u => (u.id === user.id ? { ...u, email: user.email, name: user.name } : u));
      }
    } else {
      // 用户名选填：缺省自动生成（u+手机号），冲突追加序号；邮箱选填（缺省空串）
      let account = (input.account?.trim() || `u${phone}`).toLowerCase();
      if (!ACCOUNT_PATTERN.test(account)) account = `u${phone}`;
      let n = 1;
      const base = account;
      while (isAccountTakenInWorkspace(account, principalTenantId)) {
        account = `${base}${n}`;
        n += 1;
      }
      user = {
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
    }
    // P0：User 主档之外，必须写入「当前租户」的成员身份（授权/列表/调岗的边界都基于它）
    // 2026-11-25 拍板：后台建号不收验证码 → 新成员一律待激活，本人首次短信验证码登录时激活
    upsertMembership({
      userId: user.id,
      tenantId: principalTenantId,
      orgUnitId: target.id,
      jobTitle: input.jobTitle?.trim() || undefined,
      employeeNo: input.employeeNo?.trim() || undefined,
      status: 'pending_activation',
      ...(input.secondaryOrgUnitIds && input.secondaryOrgUnitIds.length > 0 ? { secondaryOrgUnitIds: input.secondaryOrgUnitIds } : {}),
    });
    logAudit({
      module: MOD_USER_ORG,
      action: reusedExistingUser ? '跨企业开通成员' : '新建用户',
      target: `${user.name} · ${user.account}`,
      resource: 'users.create',
      afterSummary: [
        `${target.name} · 待激活`,
        `${phone.slice(0, 3)}****${phone.slice(-4)}`,
        reusedExistingUser ? '复用平台自然人（其他企业身份不受影响）' : null,
        '首次短信验证码登录自动激活',
      ].filter(Boolean).join(' · '),
    });
    // 顺手赋权：建号同时直接勾选角色一步生效（逐条走 createAssignment 全量校验）
    let grantedRoles = 0;
    let grantError: string | undefined;
    for (const grant of input.roles ?? []) {
      const r = createAssignment({ ...grant, userId: user.id });
      if (!r.ok) {
        grantError = r.error;
        break;
      }
      grantedRoles += 1;
    }
    return { ok: true, user, reusedExistingUser, grantedRoles, ...(grantError ? { error: `成员已建档，但角色授予中断：${grantError}` } : {}) } as { ok: boolean; error?: string; user?: PermUser; reusedExistingUser?: boolean; grantedRoles?: number };
  }, [createAssignment, logAudit, orgs, preview, principalTenantId, realm]);

  /**
   * 成员状态变更（2026-11 拍板核心 P0 · 红线条 2）：
   * 只改当前租户 TenantMembership.status，绝不修改全局 PermUser.accountStatus；
   * 同步回收角色严格按 a.tenantId === 当前租户 过滤（绝不回收自然人在其他企业的授权）；
   * 防锁死：不能冻结/离职自己；冻结/离职后本企业无任何有效管理员时直接拦截。
   * 返回 managedDeptNames 供前端「负责人安全交接」向导提示。
   */
  const setMemberStatus = useCallback((input: {
    userId: string;
    status: MembershipStatus;
    opts?: { reason?: string; revokeAssignments?: boolean };
  }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '软件服务方身份不进入租户成员管理' };
    const user = users.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const membership = membershipOfUserInTenant(input.userId, principalTenantId);
    if (!membership) return { ok: false, error: '该用户不是本企业成员' };
    if (membership.status === input.status) return { ok: true };
    const leaving = input.status === 'frozen' || input.status === 'left' || input.status === 'removed';
    if (leaving && input.userId === principal.userId) {
      return { ok: false, error: '不能停用/离职当前登录账号自己' };
    }
    // 防锁死：该成员是有效管理员且停用后本企业无其他有效管理员 → 拦截
    if (leaving) {
      const isAdmin = effectiveAdminUserIds(principalTenantId).includes(input.userId);
      if (isAdmin && effectiveAdminUserIds(principalTenantId, input.userId).length === 0) {
        return { ok: false, error: '该成员是本企业唯一有效企业管理员，请先授予其他成员管理员角色后再停用/离职（防系统锁死）' };
      }
    }
    // 负责人检测：该成员担任部门负责人的节点（供安全交接向导提示）
    const managedDeptNames = orgs
      .filter(o => o.type === 'department' && o.managerUserId === input.userId && enterpriseRootOf(orgs, o.id)?.id === principalTenantId)
      .map(o => o.name);
    // 同步回收本企业有效角色（严格租户边界；红线 2：绝不触碰其他租户授权）
    let revokedCount = 0;
    if (leaving && input.opts?.revokeAssignments) {
      const activeCount = assignments.filter(a => a.userId === input.userId && a.tenantId === principalTenantId && a.status === 'active').length;
      if (activeCount > 0) {
        const stamp = nowStamp();
        setAssignments(prev => prev.map(a => (
          a.userId === input.userId && a.tenantId === principalTenantId && a.status === 'active'
            ? { ...a, status: 'revoked' as GrantStatus, reason: `成员${input.status === 'left' ? '离职' : '冻结'}同步回收（本企业）`, revokedBy: ACTOR, revokedAt: stamp }
            : a
        )));
        revokedCount = activeCount;
      }
    }
    upsertMembership({ userId: input.userId, tenantId: principalTenantId, status: input.status });
    const statusLabel = input.status === 'active' ? '解冻恢复' : input.status === 'frozen' ? '冻结' : '离职';
    logAudit({
      module: MOD_USER_ORG,
      action: `成员${statusLabel}`,
      target: `${user.name} · ${user.account}`,
      resource: 'memberships.status',
      reason: input.opts?.reason || `管理员操作 · ${statusLabel}`,
      beforeSummary: `${orgs.find(o => o.id === membership.orgUnitId)?.name ?? '—'} · ${membership.status}`,
      afterSummary: [
        input.status,
        revokedCount > 0 ? `已回收本企业有效授权 ${revokedCount} 条（严格租户边界）` : '授权记录保留',
        managedDeptNames.length > 0 ? `担任部门负责人：${managedDeptNames.join('、')}` : null,
        '仅本租户生效 · 自然人其他企业身份不受影响',
      ].filter(Boolean).join(' · '),
    });
    return { ok: true, managedDeptNames: managedDeptNames.length > 0 ? managedDeptNames : undefined };
  }, [ACTOR, assignments, effectiveAdminUserIds, logAudit, orgs, preview, principal, principalTenantId, realm, users]);

  /**
   * 编辑成员资料（成员维度）：姓名/邮箱（PermUser 层）+ 岗位/工号/主兼职部门（成员身份层）。
   * 调岗时动态组织范围自动重锚定（scopeMode=dynamic 的 DEPT/DEPT_AND_CHILD 授权
   * 即时切换到新部门）；返回 reanchored（重锚定的授权摘要）与 extraOrgIds（例外范围，
   * 供弹窗提示「同步清空」）。
   */
  const updateMemberProfile = useCallback((input: {
    userId: string;
    name?: string;
    email?: string;
    jobTitle?: string;
    employeeNo?: string;
    orgUnitId?: string;
    secondaryOrgUnitIds?: string[];
  }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '软件服务方身份不进入租户成员管理' };
    const user = users.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const membership = membershipOfUserInTenant(input.userId, principalTenantId);
    if (!membership) return { ok: false, error: '该用户不是本企业成员' };
    if (input.name !== undefined && !input.name.trim()) return { ok: false, error: '姓名不可为空' };
    if (input.email != null && input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      return { ok: false, error: '邮箱格式不正确' };
    }
    let target: PermOrg | undefined;
    if (input.orgUnitId !== undefined) {
      target = orgs.find(o => o.id === input.orgUnitId);
      if (!target) return { ok: false, error: '目标部门不存在' };
      const toRoot = enterpriseRootOf(orgs, target.id);
      if (!toRoot || toRoot.id !== principalTenantId) return { ok: false, error: '目标节点不在本企业组织树内（租户边界）' };
    }
    // 1) PermUser 层（仅本企称谓相关的姓名/邮箱；accountStatus 绝不在成员链路修改）
    if ((input.name !== undefined && input.name.trim() !== user.name) || (input.email !== undefined && input.email.trim() !== user.email)) {
      const nextUser = { ...user, ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.email !== undefined ? { email: input.email.trim() } : {}) };
      setUsers(prev => prev.map(u => (u.id === user.id ? nextUser : u)));
    }
    // 2) TenantMembership 层（岗位/工号/主兼职部门）
    const moved = input.orgUnitId !== undefined && target && target.id !== membership.orgUnitId;
    upsertMembership({
      userId: input.userId,
      tenantId: principalTenantId,
      ...(input.orgUnitId !== undefined ? { orgUnitId: target!.id } : {}),
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle.trim() || undefined } : {}),
      ...(input.employeeNo !== undefined ? { employeeNo: input.employeeNo.trim() || undefined } : {}),
      ...(input.secondaryOrgUnitIds !== undefined ? { secondaryOrgUnitIds: input.secondaryOrgUnitIds } : {}),
    });
    // 3) 调岗联动：动态组织范围授权自动重锚定（原部门数据即时剥离、新部门即时生效）
    let reanchored: string[] = [];
    let extraOrgIds: string[] = [];
    if (moved && target) {
      const fromName = orgs.find(o => o.id === membership.orgUnitId)?.name ?? membership.orgUnitId;
      const today = new Date().toISOString().slice(0, 10);
      const toMove = assignments.filter(a =>
        a.userId === input.userId &&
        a.tenantId === principalTenantId &&
        a.status === 'active' &&
        a.scopeMode === 'dynamic' &&
        (a.scope === 'DEPT' || a.scope === 'DEPT_AND_CHILD') &&
        a.scopeOrgId === membership.orgUnitId &&
        a.effectiveFrom <= today &&
        (!a.effectiveTo || a.effectiveTo >= today),
      );
      if (toMove.length > 0) {
        setAssignments(prev => prev.map(a => {
          if (!toMove.some(t => t.id === a.id)) return a;
          return { ...a, scopeOrgId: target.id, scopeOrgName: target.name };
        }));
        reanchored = toMove.map(a => `${roles.find(r => r.id === a.roleId)?.name ?? a.roleId} → ${target.name}（${scopeLabel(a.scope)}）`);
      }
      extraOrgIds = [
        ...new Set(assignments
          .filter(a => a.userId === input.userId && a.tenantId === principalTenantId && a.status === 'active')
          .flatMap(a => a.extraOrgIds ?? [])),
      ];
      logAudit({
        module: MOD_USER_ORG,
        action: '成员调岗',
        target: `${user.name} → ${target.name}`,
        resource: 'users.edit',
        beforeSummary: fromName,
        afterSummary: [
          target.name,
          reanchored.length > 0 ? `动态范围已切换 ${reanchored.length} 条授权` : '无动态范围授权',
          extraOrgIds.length > 0 ? '存在例外跨部门范围（可同步清空）' : null,
        ].filter(Boolean).join(' · '),
        reason: '仅变更本企业成员身份的所属部门；User 主档与其他企业成员身份不变',
      });
    } else if (input.jobTitle !== undefined || input.employeeNo !== undefined || input.secondaryOrgUnitIds !== undefined || (input.name !== undefined && input.name.trim() !== user.name)) {
      logAudit({
        module: MOD_USER_ORG,
        action: '编辑成员资料',
        target: user.name,
        resource: 'users.edit',
        afterSummary: [
          input.name !== undefined ? `姓名 ${user.name} → ${input.name.trim()}` : null,
          input.jobTitle !== undefined ? `岗位 → ${input.jobTitle.trim() || '（空）'}` : null,
          input.employeeNo !== undefined ? `工号 → ${input.employeeNo.trim() || '（空）'}` : null,
          input.secondaryOrgUnitIds !== undefined ? `兼职部门 ${input.secondaryOrgUnitIds.length} 个` : null,
        ].filter(Boolean).join(' · ') || '资料更新',
      });
    }
    return { ok: true, reanchored, extraOrgIds };
  }, [assignments, logAudit, orgs, preview, principalTenantId, realm, roles, users]);

  /**
   * 修正成员手机号（2026-11-25 拍板）：仅未激活成员可改。
   * 建号不收验证码，录错号由管理员在激活前直接修正；一旦激活（含本人首登激活），
   * 手机号即个人登录凭证，管理员不可修改——防「把张三的号改成自己的顶号登录」，
   * 改号只能走员工本人换绑（原号 + 新号双验证码），或移除该成员后重新建档。
   */
  const correctMemberPhone = useCallback((input: { userId: string; phone: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '软件服务方身份不进入租户成员管理' };
    const phone = input.phone.trim();
    if (!/^1\d{10}$/.test(phone)) return { ok: false, error: '手机号格式不正确，应为 1 开头的 11 位数字' };
    const user = usersRef.current.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const membership = membershipOfUserInTenant(input.userId, principalTenantId);
    if (!membership) return { ok: false, error: '该用户不是本企业成员' };
    if (membership.status === 'removed' || membership.status === 'left') return { ok: false, error: '该成员已处于终止状态' };
    if (membership.status === 'frozen') return { ok: false, error: '成员处于停用状态，不能修改手机号' };
    if (membership.status === 'active') {
      return { ok: false, error: '成员已激活，手机号是其个人登录凭证，企业管理员不可修改；如需换号请由员工本人在个人中心验证原手机号后换绑，或移除该成员后重新建档' };
    }
    // 平台自然人主键查重（跨企业复用同一自然人，不得重复注册）
    const existingUser = allUsersBase().find(u => u.phone === phone && u.id !== user.id);
    if (existingUser) {
      const existingMembership = membershipOfUserInTenant(existingUser.id, principalTenantId);
      if (existingMembership && membershipActive(existingMembership)) {
        return { ok: false, error: '该手机号已是本企业成员，不可重复建档' };
      }
      if (existingMembership) {
        return { ok: false, error: '该手机号已在本企业建档（含已移除成员），不可重复使用' };
      }
      // 平台已有该手机号但不属于本企业：复用自然人也意味着把本成员身份挂到那个自然人上，
      // 原型演示不做身份合并——提示改走「移除后重新建档」路径
      return { ok: false, error: '该手机号已注册为平台账号（属于其他企业），不能直接改绑；如需加入本企业请移除当前成员后重新建档' };
    }
    const oldPhone = user.phone;
    // 登录凭证修正在激活前：直接改 PermUser 主档手机号（登录识别按手机号定位自然人）
    setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, phone } : u)));
    usersRef.current = usersRef.current.map(u => (u.id === user.id ? { ...u, phone } : u));
    logAudit({
      module: MOD_USER_ORG,
      action: '修正手机号',
      target: `${user.name} · ${user.account}`,
      resource: 'users.edit',
      reason: '建号不收验证码 · 成员未激活前管理员可直接修正录错的手机号',
      beforeSummary: oldPhone.slice(0, 3) + '****' + oldPhone.slice(-4),
      afterSummary: phone.slice(0, 3) + '****' + phone.slice(-4),
    });
    return { ok: true };
  }, [allUsersBase, logAudit, preview, principalTenantId, realm]);

  /** 批量调部门：逐人复用 updateMemberProfile 的调岗联动（动态范围重锚定 + 例外清理） */
  const batchMoveMembers = useCallback((input: { userIds: string[]; orgId: string; clearExtraScopes?: boolean }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '软件服务方身份不进入租户成员管理' };
    const target = orgs.find(o => o.id === input.orgId);
    if (!target) return { ok: false, error: '目标部门不存在' };
    const toRoot = enterpriseRootOf(orgs, target.id);
    if (!toRoot || toRoot.id !== principalTenantId) return { ok: false, error: '目标节点不在本企业组织树内（租户边界）' };
    let moved = 0;
    let lastError: string | undefined;
    for (const userId of input.userIds) {
      const m = membershipOfUserInTenant(userId, principalTenantId);
      if (!m) {
        lastError = `${users.find(u => u.id === userId)?.name ?? userId} 不是本企业成员，已跳过`;
        continue;
      }
      if (input.clearExtraScopes) {
        // 同步清空例外跨部门范围（调岗防越权：旧部门/旧项目数据不再可见）
        setAssignments(prev => prev.map(a => (
          a.userId === userId && a.tenantId === principalTenantId && a.status === 'active' && (a.extraOrgIds?.length ?? 0) > 0
            ? { ...a, extraOrgIds: undefined, reason: `${a.reason ? `${a.reason} · ` : ''}调岗同步清空例外范围` }
            : a
        )));
      }
      const r = updateMemberProfile({ userId, orgUnitId: input.orgId });
      if (!r.ok) {
        lastError = r.error;
        continue;
      }
      moved += 1;
    }
    if (moved > 0) {
      logAudit({
        module: MOD_USER_ORG,
        action: '批量调岗',
        target: `${moved} 名成员 → ${target.name}`,
        resource: 'users.batch-move',
        reason: input.clearExtraScopes ? '已同步清空例外跨部门范围' : undefined,
        afterSummary: `${target.name} · 动态组织范围自动跟随新部门`,
      });
    }
    return { ok: moved > 0 || !lastError, error: lastError, moved };
  }, [logAudit, orgs, preview, principalTenantId, realm, updateMemberProfile, users]);

  /** 批量授予角色：逐人走 createAssignment 全量校验（成员边界/角色状态/范围上限），返回失败名单 */
  const batchGrantRole = useCallback((input: Omit<Parameters<PermissionStore['createAssignment']>[0], 'userId'> & { userIds: string[] }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const role = roles.find(r => r.id === input.roleId);
    if (!role) return { ok: false, error: '角色不存在' };
    const failed: Array<{ userId: string; name: string; error: string }> = [];
    let granted = 0;
    for (const userId of input.userIds) {
      const r = createAssignment({ ...input, userId, roleId: input.roleId });
      if (!r.ok) {
        failed.push({ userId, name: users.find(u => u.id === userId)?.name ?? userId, error: r.error ?? '授予失败' });
      } else {
        granted += 1;
      }
    }
    if (granted > 0) {
      logAudit({
        module: MOD_AUTHZ,
        action: '批量授予角色',
        target: `${role.name} × ${granted} 人`,
        roleName: role.name,
        resource: 'role-assignments.batch-create',
        reason: input.reason?.trim() || '批量授予',
        afterSummary: `成功 ${granted} 人${failed.length > 0 ? ` · 失败 ${failed.length} 人` : ''}（授权即生效）`,
      });
    }
    return { ok: granted > 0 || failed.length === 0, error: failed.length > 0 ? failed[0].error : undefined, failed };
  }, [createAssignment, logAudit, preview, roles, users]);

  /**
   * 移除成员（2026-09-18 成员生命周期补全，租户域唯一入口）：
   * 终止本企业成员身份 + 同步回收全部有效角色授权（历史留痕）；
   * 守卫：不能移除自己、不能移除企业唯一有效管理员、软件服务方身份不可调用。
   */
  const removeTenantMember = useCallback((input: { userId: string; kind: string; note?: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '软件服务方身份不进入租户成员管理' };
    if (input.userId === principal.userId) return { ok: false, error: '不能移除当前登录账号自己' };
    const user = users.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const membership = membershipOfUserInTenant(input.userId, principalTenantId);
    if (!membership) return { ok: false, error: '该用户不是本企业成员' };
    if (membership.status === 'removed' || membership.status === 'left') return { ok: false, error: '该成员已处于终止状态' };
    // 唯一有效企业管理员守卫（防锁死）：移除后企业将无人管理（按预置管理员角色的生效授权判定）
    const isAdmin = effectiveAdminUserIds(principalTenantId).includes(input.userId);
    if (isAdmin && effectiveAdminUserIds(principalTenantId, input.userId).length === 0) {
      return { ok: false, error: '该成员是本企业唯一有效企业管理员，请先授予其他成员管理员角色后再移除（防系统锁死）' };
    }
    // 同步回收全部有效角色授权（严格租户边界；历史保留占位）
    const activeCount = assignments.filter(a => a.userId === input.userId && a.tenantId === principalTenantId && a.status === 'active').length;
    if (activeCount > 0) {
      const stamp = nowStamp();
      setAssignments(prev => prev.map(a => (
        a.userId === input.userId && a.tenantId === principalTenantId && a.status === 'active'
          ? { ...a, status: 'revoked' as GrantStatus, reason: `成员移除同步回收（${input.kind}）`, revokedBy: ACTOR, revokedAt: stamp }
          : a
      )));
    }
    const result = removeMembership({ userId: input.userId, tenantId: principalTenantId, actor: ACTOR, kind: input.kind, note: input.note, status: input.kind === '离职' ? 'left' : 'removed' });
    if (!result.ok) return { ok: false, error: result.error };
    const fromOrg = orgs.find(o => o.id === membership.orgUnitId)?.name ?? membership.orgUnitId;
    logAudit({
      module: MOD_USER_ORG,
      action: '移除成员',
      target: `${user.name} · ${user.account}`,
      resource: 'memberships.remove',
      reason: `${input.kind}${input.note?.trim() ? `：${input.note.trim()}` : ''}`,
      beforeSummary: `${fromOrg} · 有效角色 ${activeCount} 条`,
      afterSummary: `已移除 · 本企业成员身份终止${activeCount > 0 ? ` · 已同步回收 ${activeCount} 条有效授权` : ''}（自然人账号与其他企业身份不受影响）`,
    });
    return { ok: true, revokedCount: activeCount };
  }, [ACTOR, assignments, effectiveAdminUserIds, logAudit, orgs, preview, principal, principalTenantId, realm, users]);

  /** 移除后重新加入（租户域唯一入口）：恢复 active 成员身份并更新部门归属 */
  const rejoinTenantMember = useCallback((input: { userId: string; orgId: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '软件服务方身份不进入租户成员管理' };
    const user = users.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const target = orgs.find(o => o.id === input.orgId);
    if (!target) return { ok: false, error: '目标部门不存在' };
    const toRoot = enterpriseRootOf(orgs, target.id);
    if (!toRoot || toRoot.id !== principalTenantId) return { ok: false, error: '只能恢复到本企业组织内（租户边界）' };
    const result = rejoinMembership({ userId: input.userId, tenantId: principalTenantId, orgUnitId: target.id });
    if (!result.ok) return { ok: false, error: result.error };
    const m = result.membership;
    logAudit({
      module: MOD_USER_ORG,
      action: '成员重新加入',
      target: `${user.name} · ${user.account}`,
      resource: 'memberships.rejoin',
      reason: '移除后重新加入',
      beforeSummary: `已移除${m?.removedAt ? `（${m.removedAt} 由 ${m.removedBy ?? '—'} 移除）` : ''}`,
      afterSummary: `恢复为有效成员 · ${target.name} · 历史授权需重新授予`,
    });
    return { ok: true };
  }, [logAudit, orgs, preview, principalTenantId, realm, users]);

  const addDepartment = useCallback((input: { name: string; parentId: string; deptTag?: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const name = input.name.trim();
    if (!name) return { ok: false, error: '请填写部门名称' };
    // 租户边界：部门只能建在当前企业组织树内（服务商根与部门下均可再建——多级部门树）
    const parentRoot = enterpriseRootOf(orgs, input.parentId);
    if (!parentRoot) return { ok: false, error: '上级节点不存在' };
    if (realm === 'TENANT' && parentRoot.id !== principalTenantId) {
      return { ok: false, error: '只能在本企业组织树内新建部门（租户边界）' };
    }
    if (realm === 'PLATFORM' && parentRoot.type !== 'platform') {
      return { ok: false, error: '软件服务方组织只能挂在系统管理后台下' };
    }
    const parentCheck = validateDeptParent(orgs, input.parentId);
    if (!parentCheck.ok) return parentCheck;
    if (sameLevelDeptNameExists(orgs, input.parentId, name)) {
      return { ok: false, error: '该上级下已存在同名部门' };
    }
    const parent = orgs.find(o => o.id === input.parentId)!;
    const org: PermOrg = {
      // 用现有组织树（含已持久化部门）的最大序号 +1：刷新后新增不重置、不撞已有 id
      id: nextOrgId([...orgs, ...allOrgs()]),
      name,
      type: 'department',
      parentId: parent.id,
      status: 'active',
      ...(input.deptTag?.trim() ? { deptTag: input.deptTag.trim() } : {}),
    };
    setOrgs(prev => [...prev, org]);
    upsertRuntimeOrg(org);
    logAudit({
      module: MOD_ORG,
      action: '新建部门',
      target: name,
      resource: 'orgs.create',
      afterSummary: `${parent.name} / ${name}${org.deptTag ? ` · ${org.deptTag}` : ''}`,
    });
    return { ok: true, org };
  }, [logAudit, orgs, preview, principalTenantId, realm]);

  const updateDepartment = useCallback((input: { orgId: string; name?: string; parentId?: string; deptTag?: string; reason?: string; businessRefDeptNames?: string[] }) => {
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
    const deptTag = input.deptTag !== undefined ? (input.deptTag.trim() || undefined) : current.deptTag;
    const renamed = name !== current.name;
    const moved = parentId !== current.parentId;
    const tagChanged = deptTag !== current.deptTag;
    if (!renamed && !moved && !tagChanged) return { ok: true };
    // 验收引用保护：被当前生效验收配置按名引用的部门禁止改名（仅调整上级不改名不受影响）
    if (renamed && (input.businessRefDeptNames ?? []).includes(current.name)) {
      return { ok: false, error: acceptanceDeptRefBlocker(current.name) };
    }
    // 同级重名统一规则：改名与调整上级都校验目标上级下的部门名
    if ((renamed || moved) && sameLevelDeptNameExists(orgs, parentId, name, current.id)) {
      return { ok: false, error: '该上级下已存在同名部门' };
    }
    setOrgs(prev => prev.map(o => (o.id === current.id ? { ...o, name, parentId, deptTag } : o)));
    upsertRuntimeOrg({ ...current, name, parentId, deptTag });
    if (renamed) {
      setUsers(prev => prev.map(u => (u.orgId === current.id ? { ...u, orgName: name } : u)));
      setAssignments(prev => prev.map(a => (a.scopeOrgId === current.id ? { ...a, scopeOrgName: name } : a)));
    }
    logAudit({
      module: MOD_ORG,
      action: moved ? '调整汇报上级' : tagChanged ? '调整部门标签' : '重命名部门',
      target: name,
      resource: moved ? 'orgs.move' : 'orgs.edit',
      reason: input.reason,
      beforeSummary: `${current.name}${current.deptTag ? ` · ${current.deptTag}` : ''} · ${orgs.find(o => o.id === current.parentId)?.name ?? ''}`,
      afterSummary: `${name}${deptTag ? ` · ${deptTag}` : ''} · ${parent?.name ?? ''}`,
    });
    return { ok: true };
  }, [logAudit, orgs, preview]);

  const deleteDepartment = useCallback((input: { orgId: string; businessRefDeptNames?: string[] }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = orgs.find(o => o.id === input.orgId);
    if (!current) return { ok: false, error: '部门不存在或已被删除，请刷新后重试' };
    if (realm === 'TENANT' && enterpriseRootOf(orgs, current.id)?.id !== principalTenantId) {
      return { ok: false, error: '只能删除本企业组织树内的部门（租户边界）' };
    }
    const tenantIdForMembers = realm === 'TENANT' ? principalTenantId : 'org-platform';
    const blockers = deptDeleteBlockers({
      orgs,
      memberships: membershipsOfTenant(tenantIdForMembers ?? ''),
      orgId: input.orgId,
      businessRefDeptNames: input.businessRefDeptNames ?? [],
    });
    if (blockers.length > 0) {
      return { ok: false, error: blockers[0].message, blockers };
    }
    const parent = current.parentId ? orgs.find(o => o.id === current.parentId) : undefined;
    setOrgs(prev => prev.filter(o => o.id !== current.id));
    removeRuntimeOrg(current.id);
    logAudit({
      module: MOD_ORG,
      action: '删除部门',
      target: current.name,
      resource: 'orgs.delete',
      beforeSummary: orgPathLabel(orgs, current.id),
      afterSummary: '已删除 · 无成员、无下级、无业务引用',
    });
    return { ok: true, parent };
  }, [logAudit, orgs, preview, principalTenantId, realm]);

  /**
   * 配置成员负责区域（2026-10-27 方向修订）：只改 membership.responsibleRegions，
   * 不动部门归属与角色授权（调岗也不改区域）。输入经 canonicalRegions 归一
   * （短名、去重；「全国」与具体省份互斥时只保留「全国」）；
   * 空数组 = 未配置（该成员看不到区域受控业务数据，角色不受影响）。
   * 仅药厂租户（服务商成员区域由品种授权派生，不单独配置）。
   */
  const setMemberRegions = useCallback((input: { userId: string; regions: string[]; reason?: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) {
      return { ok: false, error: '仅企业成员支持配置负责地区' };
    }
    const user = usersRef.current.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    const membership = membershipOfUserInTenant(input.userId, principalTenantId);
    if (!membership) return { ok: false, error: '该用户不是本企业成员' };
    const invalid = input.regions.filter(r => r.trim() && canonicalRegionName(r) === null);
    if (invalid.length > 0) return { ok: false, error: `无法识别的区域：${invalid.join('、')}` };
    const regions = canonicalRegions(input.regions);
    const before = canonicalRegions(membership.responsibleRegions ?? []);
    if (before.join('|') === regions.join('|')) return { ok: true, regions };
    const result = setMembershipRegions({ userId: input.userId, tenantId: principalTenantId, regions });
    if (!result.ok) return { ok: false, error: result.error };
    logAudit({
      module: MOD_USER_ORG,
      action: '配置负责区域',
      target: user.name,
      resource: 'memberships.regions',
      reason: input.reason,
      beforeSummary: before.length > 0 ? before.join('、') : '未配置',
      afterSummary: regions.length > 0 ? regions.join('、') : '未配置',
    });
    return { ok: true, regions };
  }, [logAudit, preview, principalTenantId, principalTenantKind, realm]);

  /**
   * 调岗（P0）：只调整该用户在【当前租户】成员身份的 orgUnitId。
   * User 主档 orgId 不动——同一自然人在其他企业的成员身份不受影响；
   * scopeMode=dynamic 的组织范围授权自动重锚定到新部门（调岗即切换数据范围）；
   * clearExtraScopes=true 时同步清空例外跨部门范围（防调岗后越权查看旧部门数据）。
   */
  const setUserOrg = useCallback((input: { userId: string; orgId: string; clearExtraScopes?: boolean }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const user = users.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '软件服务方工作人员归属由软件服务方组织维护' };
    const membership = membershipOfUserInTenant(input.userId, principalTenantId);
    if (!membership) return { ok: false, error: '该用户不是本企业成员' };
    const target = orgs.find(o => o.id === input.orgId);
    if (!target) return { ok: false, error: '目标部门不存在' };
    if (target.type !== 'pharma' && target.type !== 'department' && target.type !== 'provider') {
      return { ok: false, error: '目标节点不可挂人' };
    }
    // 目标必须仍在当前租户组织树内（跨企业调岗走成员身份新建/回收，不在此操作）
    const toRoot = enterpriseRootOf(orgs, target.id);
    if (!toRoot || toRoot.id !== principalTenantId) {
      return { ok: false, error: '目标节点不在本企业组织树内（租户边界）' };
    }
    if (membership.orgUnitId === target.id) return { ok: true };
    if (input.clearExtraScopes) {
      setAssignments(prev => prev.map(a => (
        a.userId === input.userId && a.tenantId === principalTenantId && a.status === 'active' && (a.extraOrgIds?.length ?? 0) > 0
          ? { ...a, extraOrgIds: undefined, reason: `${a.reason ? `${a.reason} · ` : ''}调岗同步清空例外范围` }
          : a
      )));
    }
    const r = updateMemberProfile({ userId: input.userId, orgUnitId: target.id });
    return { ok: r.ok, error: r.error, reanchored: r.reanchored, extraOrgIds: r.extraOrgIds };
  }, [orgs, preview, principalTenantId, realm, updateMemberProfile, users]);

  /**
   * 停用/启用部门（2026-11 拍板 · 停用归档模型）：
   * - 停用有正常成员的部门必须提供迁移目标 moveToId：成员主/兼职部门经
   *   moveMembershipsBulk 一次性迁入（同步 TenantMembership，绝不碰旧 User.orgId）；
   * - 停用级联到全部下级部门；企业根不可停用；
   * - 启用仅恢复本节点状态。
   */
  const setDepartmentStatus = useCallback((input: { orgId: string; status: 'active' | 'disabled'; moveToId?: string; reason?: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '软件服务方身份不进入租户组织管理' };
    const current = orgs.find(o => o.id === input.orgId);
    if (!current) return { ok: false, error: '部门不存在' };
    if (current.type !== 'department') return { ok: false, error: '企业根节点不可停用' };
    if (enterpriseRootOf(orgs, current.id)?.id !== principalTenantId) {
      return { ok: false, error: '只能操作本企业组织树内的部门（租户边界）' };
    }
    if (current.status === input.status) return { ok: true };
    if (input.status === 'disabled') {
      const subtreeIds = orgDescendantIds(orgs, current.id);
      const memberships = membershipsOfTenant(principalTenantId).filter(m => membershipActive(m));
      const memberCount = memberships.filter(m => subtreeIds.includes(m.orgUnitId) || m.secondaryOrgUnitIds?.some(id => subtreeIds.includes(id))).length;
      if (memberCount > 0) {
        const moveTarget = input.moveToId ? orgs.find(o => o.id === input.moveToId) : undefined;
        if (!input.moveToId) {
          return { ok: false, error: `该部门及下级仍有 ${memberCount} 名正常成员，请选择成员迁入的目标部门后再停用`, memberCount };
        }
        if (!moveTarget) return { ok: false, error: '迁移目标部门不存在' };
        if (subtreeIds.includes(moveTarget.id)) return { ok: false, error: '迁移目标不能是本部门或其下级部门' };
        if (enterpriseRootOf(orgs, moveTarget.id)?.id !== principalTenantId) return { ok: false, error: '迁移目标不在本企业组织树内（租户边界）' };
        if (moveTarget.status === 'disabled') return { ok: false, error: '迁移目标部门已停用，请选择正常状态的部门' };
        const movedCount = moveMembershipsBulk({ fromOrgIds: subtreeIds, toOrgId: moveTarget.id });
        const affected = memberships.filter(m => subtreeIds.includes(m.orgUnitId) || m.secondaryOrgUnitIds?.some(id => subtreeIds.includes(id)));
        // 动态组织范围授权同步重锚定到迁移目标（原部门即将停用，数据范围不得悬空）
        const today = new Date().toISOString().slice(0, 10);
        setAssignments(prev => prev.map(a => {
          if (a.status !== 'active' || a.scopeMode !== 'dynamic') return a;
          if (a.scope !== 'DEPT' && a.scope !== 'DEPT_AND_CHILD') return a;
          if (!subtreeIds.includes(a.scopeOrgId)) return a;
          return { ...a, scopeOrgId: moveTarget.id, scopeOrgName: moveTarget.name };
        }));
        logAudit({
          module: MOD_ORG,
          action: '停用部门',
          target: current.name,
          resource: 'orgs.status',
          reason: input.reason?.trim() || '停用归档',
          afterSummary: `${affected.length} 名成员已迁入「${moveTarget.name}」· 动态范围授权同步重锚定 · 停用级联 ${subtreeIds.length - 1} 个下级（迁移 ${movedCount} 条成员身份）`,
        });
      } else {
        logAudit({
          module: MOD_ORG,
          action: '停用部门',
          target: current.name,
          resource: 'orgs.status',
          reason: input.reason?.trim() || '停用归档',
          afterSummary: '无在职成员 · 已停用（历史数据与审计保留）',
        });
      }
    } else {
      logAudit({
        module: MOD_ORG,
        action: '启用部门',
        target: current.name,
        resource: 'orgs.status',
        reason: input.reason?.trim() || '重新启用',
        afterSummary: '已恢复为正常状态',
      });
    }
    const subtree = orgDescendantIds(orgs, current.id);
    setOrgs(prev => prev.map(o => (subtree.includes(o.id) ? { ...o, status: input.status } : o)));
    for (const id of subtree) {
      const o = orgs.find(x => x.id === id);
      if (o) upsertRuntimeOrg({ ...o, status: input.status });
    }
    return { ok: true };
  }, [assignments, logAudit, orgs, preview, principalTenantId, realm]);

  /** 设置/更换部门负责人（本租户正常状态成员；变更原因写审计；不校验管理类角色——岗位与角色分离） */
  const setDepartmentManager = useCallback((input: { orgId: string; userId: string | null; reason?: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId) return { ok: false, error: '软件服务方身份不进入租户组织管理' };
    const current = orgs.find(o => o.id === input.orgId);
    if (!current) return { ok: false, error: '部门不存在' };
    if (current.type !== 'department') return { ok: false, error: '仅部门节点可设置负责人' };
    if (enterpriseRootOf(orgs, current.id)?.id !== principalTenantId) {
      return { ok: false, error: '只能操作本企业组织树内的部门（租户边界）' };
    }
    if (input.userId) {
      const user = users.find(u => u.id === input.userId);
      if (!user) return { ok: false, error: '负责人不存在' };
      const m = membershipOfUserInTenant(input.userId, principalTenantId);
      if (!m || !membershipActive(m)) return { ok: false, error: `${user.name} 不是本企业正常状态成员，不能担任部门负责人` };
    }
    const prevName = current.managerUserId ? users.find(u => u.id === current.managerUserId)?.name ?? current.managerUserId : '（未设置）';
    const nextName = input.userId ? users.find(u => u.id === input.userId)?.name ?? input.userId : '（未设置）';
    const next: PermOrg = { ...current, managerUserId: input.userId ?? undefined };
    setOrgs(prev => prev.map(o => (o.id === current.id ? next : o)));
    upsertRuntimeOrg(next);
    logAudit({
      module: MOD_ORG,
      action: input.userId ? '设置部门负责人' : '清空部门负责人',
      target: current.name,
      resource: 'orgs.manager',
      reason: input.reason?.trim() || '部门负责人变更',
      beforeSummary: prevName,
      afterSummary: nextName,
    });
    return { ok: true };
  }, [logAudit, orgs, preview, principalTenantId, realm, users]);

  /**
   * 服务商部门默认业务承接范围（层级一继承的唯一配置入口）：
   * 药厂 → 品种 → 收窄区域；成员授权选「继承部门」时运行时与上游有效授权实时取交集。
   * 提交前经 validateBizScopes 全量校验（只收窄不扩大）。
   */
  const setDepartmentBizScope = useCallback((input: { orgId: string; bizScope: BizScopeItem[] | null; reason?: string }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    if (realm !== 'TENANT' || !principalTenantId || principalTenantKind !== 'provider') {
      return { ok: false, error: '部门业务承接范围仅服务商租户可配置' };
    }
    const current = orgs.find(o => o.id === input.orgId);
    if (!current) return { ok: false, error: '部门不存在' };
    if (current.type !== 'department') return { ok: false, error: '仅部门节点可配置业务承接范围' };
    if (enterpriseRootOf(orgs, current.id)?.id !== principalTenantId) {
      return { ok: false, error: '只能操作本企业组织树内的部门（租户边界）' };
    }
    const bizScope = (input.bizScope ?? []).filter(s => s.pharmaTenantId);
    if (bizScope.length > 0) {
      const errors = validateBizScopes(bizScope, principalTenantId);
      if (errors.length > 0) return { ok: false, error: errors[0] };
    }
    const next: PermOrg = { ...current, bizScope: bizScope.length > 0 ? bizScope : undefined };
    setOrgs(prev => prev.map(o => (o.id === current.id ? next : o)));
    upsertRuntimeOrg(next);
    logAudit({
      module: MOD_ORG,
      action: '配置部门业务承接范围',
      target: current.name,
      resource: 'orgs.biz-scope',
      reason: input.reason?.trim() || '部门业务范围调整',
      beforeSummary: (current.bizScope?.length ?? 0) > 0
        ? current.bizScope!.map(s => `${orgs.find(o => o.id === s.pharmaTenantId)?.name ?? s.pharmaTenantId} × ${s.varietyNames.length} 品种 × ${s.regionCodes.length} 区域`).join('；')
        : '（未配置）',
      afterSummary: bizScope.length > 0
        ? bizScope.map(s => `${orgs.find(o => o.id === s.pharmaTenantId)?.name ?? s.pharmaTenantId} × ${s.varietyNames.length || '全部'} 品种 × ${s.regionCodes.length || '全部'} 区域`).join('；')
        : '（已清空）',
    });
    return { ok: true };
  }, [logAudit, orgs, preview, principalTenantId, principalTenantKind, realm]);

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
    cloneRole,
    setRoleStatus,
    deleteRole,
    createAssignment,
    updateAssignmentScope,
    revokeAssignment,
    createUser,
    setMemberStatus,
    updateMemberProfile,
    correctMemberPhone,
    batchMoveMembers,
    batchGrantRole,
    removeTenantMember,
    rejoinTenantMember,
    addDepartment,
    updateDepartment,
    deleteDepartment,
    setDepartmentStatus,
    setDepartmentManager,
    setDepartmentBizScope,
    setMemberRegions,
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

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '../types';
import {
  LOGIN_ROLE_MAP,
  PERM_ORGS,
  PERM_USERS,
  PRESET_ROLES,
  countGrantedUsers,
  emptyCustomScope,
  nextId,
  nowStamp,
  pageHasAction,
  seedChangeLogs,
  seedCustomRoles,
  seedGrants,
  seedPermAudit,
  type CustomScope,
  type FieldPolicyKind,
  type GrantStatus,
  type PageAction,
  type PermAuditEvent,
  type PermOrg,
  type PermUser,
  type RoleChangeLog,
  type ScopeType,
  type SysRole,
  type SysRoleStatus,
  type UserGrant,
} from '../data/permissions';

export interface PreviewState {
  roleId: string;
  orgId: string;
  userId?: string;
  startedAt: string;
}

interface PermissionStore {
  roles: SysRole[];
  grants: UserGrant[];
  users: PermUser[];
  orgs: PermOrg[];
  changeLogs: RoleChangeLog[];
  auditEvents: PermAuditEvent[];
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
  copyRole: (sourceId: string, name: string, description: string) => { ok: boolean; error?: string; role?: SysRole };
  updateRole: (roleId: string, patch: Partial<SysRole>, summary: string) => { ok: boolean; error?: string };
  setRoleStatus: (roleId: string, status: SysRoleStatus, reason: string) => { ok: boolean; error?: string; affected?: PermUser[] };
  deleteRole: (roleId: string) => { ok: boolean; error?: string };
  createGrant: (input: Omit<UserGrant, 'id' | 'grantedAt' | 'grantedBy' | 'status'> & { status?: GrantStatus }) => { ok: boolean; error?: string };
  revokeGrant: (grantId: string, reason: string) => { ok: boolean; error?: string };
  logAudit: (partial: Partial<PermAuditEvent> & Pick<PermAuditEvent, 'action' | 'target' | 'module'>) => void;
}

const PermissionContext = createContext<PermissionStore | null>(null);

const ACTOR = '李航';
const ACTOR_ROLE = '药厂销售管理员';
const ACTOR_ORG = '百益制药';

export function PermissionProvider({ loginRole, children }: { loginRole: Role; children: ReactNode }) {
  const [roles, setRoles] = useState<SysRole[]>(() => [...PRESET_ROLES, ...seedCustomRoles]);
  const [grants, setGrants] = useState<UserGrant[]>(() => [...seedGrants]);
  const [changeLogs, setChangeLogs] = useState<RoleChangeLog[]>(() => [...seedChangeLogs]);
  const [auditEvents, setAuditEvents] = useState<PermAuditEvent[]>(() => [...seedPermAudit]);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const mappedRole = useMemo(() => {
    const id = LOGIN_ROLE_MAP[loginRole];
    return roles.find(r => r.id === id) ?? roles[0];
  }, [loginRole, roles]);

  const effectiveRole = useMemo(() => {
    if (!preview) return mappedRole;
    return roles.find(r => r.id === preview.roleId) ?? mappedRole;
  }, [preview, roles, mappedRole]);

  const logAudit = useCallback((partial: Partial<PermAuditEvent> & Pick<PermAuditEvent, 'action' | 'target' | 'module'>) => {
    const event: PermAuditEvent = {
      id: nextId('PE'),
      time: nowStamp(),
      actor: ACTOR,
      actorRole: ACTOR_ROLE,
      org: ACTOR_ORG,
      resource: partial.resource ?? `${partial.module}`,
      decision: '允许',
      reason: '',
      requestId: nextId('req'),
      ip: '10.4.21.8',
      result: '成功',
      ...partial,
    };
    setAuditEvents(prev => [event, ...prev]);
  }, []);

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
      reason: `只读预览 · ${PERM_ORGS.find(o => o.id === state.orgId)?.name ?? ''}`,
    });
  }, [logAudit, roles]);

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

  const copyRole = useCallback((sourceId: string, name: string, description: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const source = roles.find(r => r.id === sourceId);
    if (!source) return { ok: false, error: '来源角色不存在' };
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: '请填写角色名称' };
    if (roles.some(r => r.name === trimmed)) return { ok: false, error: '同一租户内角色名称必须唯一' };
    const created: SysRole = {
      ...source,
      id: nextId('role-custom'),
      name: trimmed,
      description: description.trim() || `从「${source.name}」复制`,
      kind: 'custom',
      status: 'draft',
      copiedFrom: source.id,
      version: 1,
      updatedBy: ACTOR,
      updatedAt: nowStamp(),
      pagePerms: { ...source.pagePerms },
      fieldPolicies: { ...source.fieldPolicies },
      customScope: { ...source.customScope, orgIds: [...source.customScope.orgIds], pharmaIds: [...source.customScope.pharmaIds], providerIds: [...source.customScope.providerIds], groupIds: [...source.customScope.groupIds], varietyIds: [...source.customScope.varietyIds], regionCodes: [...source.customScope.regionCodes] },
    };
    setRoles(prev => [created, ...prev]);
    pushLog(created.id, '复制角色', `从「${source.name}」复制`, { beforeSummary: source.name, afterSummary: '定制 / 草稿', version: 1 });
    logAudit({ module: '角色管理', action: '复制角色', target: trimmed, roleName: source.name, resource: 'roles.create', beforeSummary: source.name, afterSummary: '定制 / 草稿' });
    return { ok: true, role: created };
  }, [logAudit, preview, pushLog, roles]);

  const updateRole = useCallback((roleId: string, patch: Partial<SysRole>, summary: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = roles.find(r => r.id === roleId);
    if (!current) return { ok: false, error: '角色不存在' };
    if (current.kind === 'preset') return { ok: false, error: '预置角色只读，请复制后编辑' };
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
    logAudit({ module: '角色管理', action: '编辑角色', target: next.name, roleName: next.name, resource: 'roles.edit', beforeSummary: `v${current.version}`, afterSummary: `v${next.version} · ${summary}` });
    return { ok: true };
  }, [logAudit, preview, pushLog, roles]);

  const setRoleStatus = useCallback((roleId: string, status: SysRoleStatus, reason: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = roles.find(r => r.id === roleId);
    if (!current) return { ok: false, error: '角色不存在' };
    if (current.kind === 'preset') return { ok: false, error: '预置角色不可停用或删除' };
    const affectedIds = grants.filter(g => g.roleId === roleId && g.status === 'active').map(g => g.userId);
    const affected = PERM_USERS.filter(u => affectedIds.includes(u.id));
    setRoles(prev => prev.map(r => (r.id === roleId ? { ...r, status, version: r.version + 1, updatedBy: ACTOR, updatedAt: nowStamp() } : r)));
    pushLog(roleId, status === 'enabled' ? '启用角色' : '停用角色', reason, { version: current.version + 1 });
    logAudit({
      module: '角色管理',
      action: status === 'enabled' ? '启用角色' : '停用角色',
      target: current.name,
      roleName: current.name,
      resource: 'roles.edit',
      reason,
      afterSummary: `${status} · 影响 ${affected.length} 人`,
    });
    return { ok: true, affected };
  }, [grants, logAudit, preview, pushLog, roles]);

  const deleteRole = useCallback((roleId: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = roles.find(r => r.id === roleId);
    if (!current) return { ok: false, error: '角色不存在' };
    if (current.kind === 'preset') return { ok: false, error: '预置角色不可删除' };
    if (current.status !== 'draft') return { ok: false, error: '仅未发布的草稿角色可删除' };
    if (countGrantedUsers(roleId, grants) > 0 || grants.some(g => g.roleId === roleId)) {
      return { ok: false, error: '已被授权或引用的角色不可删除' };
    }
    setRoles(prev => prev.filter(r => r.id !== roleId));
    logAudit({ module: '角色管理', action: '删除角色', target: current.name, roleName: current.name, resource: 'roles.delete', reason: '删除未引用草稿' });
    return { ok: true };
  }, [grants, logAudit, preview, roles]);

  const createGrant = useCallback((input: Omit<UserGrant, 'id' | 'grantedAt' | 'grantedBy' | 'status'> & { status?: GrantStatus }) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const user = PERM_USERS.find(u => u.id === input.userId);
    if (!user) return { ok: false, error: '用户不存在' };
    if (user.account === 'lihang' && (input.roleId === 'role-sys-admin' || input.roleId === 'role-platform-ops')) {
      return { ok: false, error: '授权人不得授予超出自身管理边界的角色' };
    }
    const dup = grants.some(g => g.userId === input.userId && g.roleId === input.roleId && g.orgId === input.orgId && g.status === 'active');
    if (dup) return { ok: false, error: '该用户在此组织下已拥有相同角色' };
    const grant: UserGrant = {
      ...input,
      id: nextId('g'),
      grantedBy: ACTOR,
      grantedAt: nowStamp(),
      status: input.status ?? 'active',
    };
    setGrants(prev => [grant, ...prev]);
    const roleName = roles.find(r => r.id === input.roleId)?.name;
    logAudit({
      module: '用户授权',
      action: '用户授权',
      target: `${user.name} × ${roleName}`,
      roleName,
      resource: 'user-grants.create',
      afterSummary: `${grant.status} / ${grant.orgName}`,
    });
    return { ok: true };
  }, [grants, logAudit, preview, roles]);

  const revokeGrant = useCallback((grantId: string, reason: string) => {
    if (preview) return { ok: false, error: '预览模式禁止写操作' };
    const current = grants.find(g => g.id === grantId);
    if (!current) return { ok: false, error: '授权记录不存在' };
    setGrants(prev => prev.map(g => (g.id === grantId ? { ...g, status: 'revoked' as GrantStatus } : g)));
    const user = PERM_USERS.find(u => u.id === current.userId);
    const roleName = roles.find(r => r.id === current.roleId)?.name;
    logAudit({
      module: '用户授权',
      action: '回收授权',
      target: `${user?.name ?? ''} × ${roleName}`,
      roleName,
      resource: 'user-grants.delete',
      reason,
      beforeSummary: '有效',
      afterSummary: '已回收',
    });
    return { ok: true };
  }, [grants, logAudit, preview, roles]);

  const value: PermissionStore = {
    roles,
    grants,
    users: PERM_USERS,
    orgs: PERM_ORGS,
    changeLogs,
    auditEvents,
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
    copyRole,
    updateRole,
    setRoleStatus,
    deleteRole,
    createGrant,
    revokeGrant,
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

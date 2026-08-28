/**
 * 角色权限管理 — 单一事实源
 * 管理员只面对页面名称、按钮名称、数据范围和字段展示方式，不接触内部编码。
 */

import type { Role } from '../types';
import { REGION_OPTIONS } from '../constants';

export type ScopeType = 'ALL_PLATFORM' | 'PHARMA' | 'PROVIDER' | 'GROUP' | 'SELF' | 'CUSTOM';
export type SysRoleKind = 'preset' | 'custom';
export type SysRoleStatus = 'enabled' | 'disabled' | 'draft';
export type FieldPolicyKind = 'visible' | 'mask' | 'hidden';
export type GrantStatus = 'active' | 'expired' | 'revoked' | 'pending_review';
export type PageAction = 'view' | 'create' | 'edit' | 'delete' | 'submit' | 'approve' | 'export';
export type AuditDecision = '允许' | '拒绝';

export const PAGE_ACTION_META: { key: PageAction; label: string; risk?: boolean }[] = [
  { key: 'view', label: '查看页面' },
  { key: 'create', label: '新建' },
  { key: 'edit', label: '编辑' },
  { key: 'delete', label: '删除', risk: true },
  { key: 'submit', label: '提交/发起' },
  { key: 'approve', label: '审核/确认', risk: true },
  { key: 'export', label: '导出', risk: true },
];

export const SCOPE_OPTIONS: { value: ScopeType; label: string; hint: string }[] = [
  { value: 'ALL_PLATFORM', label: '全平台', hint: '可见全部租户与组织的数据' },
  { value: 'PHARMA', label: '本药厂', hint: '仅本药厂及下属执行数据' },
  { value: 'PROVIDER', label: '本服务商', hint: '仅本服务商承接范围内的数据' },
  { value: 'GROUP', label: '本工作组', hint: '仅本工作组辖区数据' },
  { value: 'SELF', label: '仅本人', hint: '仅本人填报与本人结算' },
  { value: 'CUSTOM', label: '指定范围', hint: '按组织、药厂、服务商、工作组、品种、区域交叉限定' },
];

export function scopeLabel(scope: ScopeType): string {
  return SCOPE_OPTIONS.find(s => s.value === scope)?.label ?? scope;
}

export interface PageActionDef {
  key: PageAction;
  label: string;
  code: string;
  risk?: boolean;
}

export interface ResourcePage {
  id: string;
  module: string;
  name: string;
  description: string;
  actions: PageActionDef[];
}

export interface SensitiveField {
  key: string;
  name: string;
  module: string;
  description: string;
  maskExample: string;
}

export interface CustomScope {
  orgIds: string[];
  pharmaIds: string[];
  providerIds: string[];
  groupIds: string[];
  varietyIds: string[];
  regionCodes: string[];
}

export interface SysRole {
  id: string;
  name: string;
  description: string;
  kind: SysRoleKind;
  status: SysRoleStatus;
  tenant: string;
  defaultScope: ScopeType;
  customScope: CustomScope;
  version: number;
  copiedFrom?: string;
  updatedBy: string;
  updatedAt: string;
  /** 页面 id → 已授权动作。未出现的页面视为无权限。 */
  pagePerms: Record<string, PageAction[]>;
  fieldPolicies: Record<string, FieldPolicyKind>;
}

export interface PermUser {
  id: string;
  name: string;
  account: string;
  orgId: string;
  orgName: string;
  accountStatus: 'enabled' | 'disabled';
}

export interface PermOrg {
  id: string;
  name: string;
  type: 'platform' | 'pharma' | 'provider' | 'group';
  parentId?: string;
}

export interface UserGrant {
  id: string;
  userId: string;
  roleId: string;
  orgId: string;
  orgName: string;
  scope: ScopeType;
  effectiveFrom: string;
  effectiveTo?: string;
  grantedBy: string;
  grantedAt: string;
  status: GrantStatus;
}

export interface RoleChangeLog {
  id: string;
  roleId: string;
  time: string;
  actor: string;
  action: string;
  summary: string;
  beforeSummary?: string;
  afterSummary?: string;
  version: number;
}

export interface PermAuditEvent {
  id: string;
  time: string;
  actor: string;
  actorRole: string;
  org: string;
  target: string;
  roleName?: string;
  module: string;
  action: string;
  resource: string;
  decision: AuditDecision;
  reason: string;
  beforeSummary?: string;
  afterSummary?: string;
  requestId: string;
  ip: string;
  result: '成功' | '失败';
}

function acts(pageId: string, keys: PageAction[]): PageActionDef[] {
  return keys.map(key => {
    const meta = PAGE_ACTION_META.find(m => m.key === key)!;
    const risk = meta.risk || (pageId === 'roles' && (key === 'create' || key === 'edit')) || key === 'approve';
    return {
      key,
      label: meta.label,
      code: `${pageId}.${key}`,
      risk: Boolean(risk || meta.risk),
    };
  });
}

export const RESOURCE_PAGES: ResourcePage[] = [
  { id: 'dashboard', module: '工作台', name: '工作台', description: '进入角色首页与待办总览', actions: acts('dashboard', ['view']) },
  { id: 'budget-plan', module: '业务管理', name: '预算计划', description: '查看与维护企业计划预算', actions: acts('budget-plan', ['view', 'create', 'edit', 'export']) },
  { id: 'task-dispatch', module: '业务管理', name: '任务执行', description: '任务创建、拆解、填报与进度', actions: acts('task-dispatch', ['view', 'create', 'edit', 'submit', 'export']) },
  { id: 'settlement', module: '业务管理', name: '结算明细', description: '结算单提交、确认与导出', actions: acts('settlement', ['view', 'submit', 'approve', 'export']) },
  { id: 'rep-filing', module: '企业用户管理', name: '医药代表备案管理', description: '代表建档、核验与催补备案', actions: acts('rep-filing', ['view', 'create', 'edit', 'approve', 'export']) },
  { id: 'vendor-access', module: '企业用户管理', name: '服务商准入管理', description: '服务商尽调、审批与复审', actions: acts('vendor-access', ['view', 'approve', 'export']) },
  { id: 'doctors', module: '主数据管理', name: '医生主数据', description: '医生档案查询', actions: acts('doctors', ['view', 'export']) },
  { id: 'varieties', module: '主数据管理', name: '品种管理', description: '品种建档与维护', actions: acts('varieties', ['view', 'create', 'edit']) },
  { id: 'variety-auth', module: '主数据管理', name: '品种授权', description: '按服务商与区域授权品种', actions: acts('variety-auth', ['view', 'create', 'edit', 'delete']) },
  { id: 'price-base', module: '价目管理', name: '基础价目表', description: '基础价目表价格与发包比例维护', actions: acts('price-base', ['view', 'edit']) },
  { id: 'price-gs', module: '价目管理', name: '公私分离价目表', description: '公私分离场景价格维护', actions: acts('price-gs', ['view', 'edit']) },
  { id: 'price-report', module: '价目管理', name: '报告价目表', description: '报告类价格与比例维护', actions: acts('price-report', ['view', 'edit']) },
  { id: 'inspection', module: '合规管理', name: '随检工作台', description: '发起与处理随检任务', actions: acts('inspection', ['view', 'submit', 'approve', 'export']) },
  { id: 'evidence-chain', module: '合规管理', name: '证据链复审', description: '证据链抽检与复审', actions: acts('evidence-chain', ['view', 'approve', 'export']) },
  { id: 'roles', module: '系统管理', name: '角色管理', description: '角色新建、复制、启停与权限配置', actions: acts('roles', ['view', 'create', 'edit', 'delete', 'export']) },
  { id: 'user-grants', module: '系统管理', name: '用户授权', description: '用户、角色、组织三方授权', actions: acts('user-grants', ['view', 'create', 'edit', 'delete']) },
  { id: 'perm-audit', module: '系统管理', name: '权限审计', description: '权限变更、越权与高危操作检索', actions: acts('perm-audit', ['view', 'export']) },
  { id: 'role-preview', module: '系统管理', name: '角色预览', description: '按角色只读预览菜单、按钮与字段', actions: acts('role-preview', ['view']) },
  { id: 'audit-log', module: '系统管理', name: '操作日志', description: '业务高风险操作审计', actions: acts('audit-log', ['view']) },
  { id: 'baiyee-ai', module: '工作台', name: 'baiyee-AI', description: '药厂运营智能查询、分析与受控业务开关', actions: acts('baiyee-ai', ['view', 'submit']) },
];

export const SENSITIVE_FIELDS: SensitiveField[] = [
  { key: 'doctor.name', name: '医生姓名', module: '医生主数据', description: '拜访、任务、证据中的医生姓名', maskExample: '张*' },
  { key: 'doctor.phone', name: '手机号', module: '主数据', description: '医生或联系人手机号', maskExample: '138****5678' },
  { key: 'user.idNo', name: '身份证件', module: '企业用户', description: '代表身份证等证件号码', maskExample: '610***********1234' },
  { key: 'user.bankAccount', name: '银行卡号', module: '结算', description: '收款账户', maskExample: '6222 **** **** 8890' },
  { key: 'settlement.amount', name: '精确结算金额', module: '结算明细', description: '结算单逐行与合计金额', maskExample: '￥1.2万' },
  { key: 'contact.info', name: '联系人信息', module: '企业用户', description: '服务商/药厂联系人姓名与电话', maskExample: '李* / 139****2210' },
  { key: 'evidence.pii', name: '证据附件个人信息', module: '证据链', description: '附件中可识别个人的信息', maskExample: '隐藏字段' },
];

export const emptyCustomScope = (): CustomScope => ({
  orgIds: [],
  pharmaIds: [],
  providerIds: [],
  groupIds: [],
  varietyIds: [],
  regionCodes: [],
});

const ALL_VISIBLE: Record<string, FieldPolicyKind> = Object.fromEntries(
  SENSITIVE_FIELDS.map(f => [f.key, 'visible' as FieldPolicyKind]),
);

function perms(entries: [string, PageAction[]][]): Record<string, PageAction[]> {
  return Object.fromEntries(entries);
}

const TENANT = '百益健康科技';
const ACTOR_ADMIN = '王敏';

function role(
  partial: Omit<SysRole, 'tenant' | 'customScope' | 'fieldPolicies' | 'version'> & {
    fieldPolicies?: Record<string, FieldPolicyKind>;
    customScope?: CustomScope;
    version?: number;
  },
): SysRole {
  return {
    tenant: TENANT,
    customScope: emptyCustomScope(),
    fieldPolicies: ALL_VISIBLE,
    version: 3,
    ...partial,
  };
}

const ALL_PAGES = RESOURCE_PAGES.map(p => [p.id, p.actions.map(a => a.key)] as [string, PageAction[]]);

export const PRESET_ROLES: SysRole[] = [
  role({
    id: 'role-platform-ops',
    name: '平台运营',
    description: '平台运营、规则配置、全局监控',
    kind: 'preset',
    status: 'enabled',
    defaultScope: 'ALL_PLATFORM',
    updatedBy: ACTOR_ADMIN,
    updatedAt: '2026-08-12 10:20',
    pagePerms: perms(ALL_PAGES),
  }),
  role({
    id: 'role-sys-admin',
    name: '系统管理员',
    description: '用户、角色、组织、权限审计管理',
    kind: 'preset',
    status: 'enabled',
    defaultScope: 'ALL_PLATFORM',
    updatedBy: ACTOR_ADMIN,
    updatedAt: '2026-08-12 10:20',
    pagePerms: perms([
      ['dashboard', ['view']],
      ['roles', ['view', 'create', 'edit', 'delete', 'export']],
      ['user-grants', ['view', 'create', 'edit', 'delete']],
      ['perm-audit', ['view', 'export']],
      ['role-preview', ['view']],
      ['audit-log', ['view']],
      ['baiyee-ai', ['view']],
    ]),
  }),
  role({
    id: 'role-account-admin',
    name: '账户管理员',
    description: '用户建档、启停、账户解锁',
    kind: 'preset',
    status: 'enabled',
    defaultScope: 'ALL_PLATFORM',
    updatedBy: ACTOR_ADMIN,
    updatedAt: '2026-08-12 10:20',
    pagePerms: perms([
      ['dashboard', ['view']],
      ['rep-filing', ['view', 'create', 'edit']],
      ['vendor-access', ['view']],
    ]),
    fieldPolicies: { ...ALL_VISIBLE, 'user.idNo': 'mask', 'user.bankAccount': 'mask', 'doctor.phone': 'mask' },
  }),
  role({
    id: 'role-pharma-sales',
    name: '药厂销售管理员',
    description: '预算、任务、价目、结算、业务分析',
    kind: 'preset',
    status: 'enabled',
    defaultScope: 'PHARMA',
    updatedBy: '李航',
    updatedAt: '2026-08-20 16:08',
    pagePerms: perms([
      ['dashboard', ['view']],
      ['budget-plan', ['view', 'create', 'edit', 'export']],
      ['task-dispatch', ['view', 'create', 'edit', 'submit', 'export']],
      ['settlement', ['view', 'approve', 'export']],
      ['doctors', ['view', 'export']],
      ['varieties', ['view', 'create', 'edit']],
      ['variety-auth', ['view', 'create', 'edit', 'delete']],
      ['price-base', ['view', 'edit']],
      ['price-gs', ['view', 'edit']],
      ['price-report', ['view', 'edit']],
      ['roles', ['view', 'create', 'edit']],
      ['user-grants', ['view', 'create', 'edit']],
      ['perm-audit', ['view']],
      ['role-preview', ['view']],
      ['audit-log', ['view']],
      ['baiyee-ai', ['view', 'submit']],
    ]),
  }),
  role({
    id: 'role-pharma-compliance',
    name: '药厂合规管理员',
    description: '风险、随检、准入、备案、证据链复审',
    kind: 'preset',
    status: 'enabled',
    defaultScope: 'PHARMA',
    updatedBy: '赵宁',
    updatedAt: '2026-08-18 09:40',
    pagePerms: perms([
      ['dashboard', ['view']],
      ['rep-filing', ['view', 'approve', 'export']],
      ['vendor-access', ['view', 'approve', 'export']],
      ['inspection', ['view', 'submit', 'approve', 'export']],
      ['evidence-chain', ['view', 'approve', 'export']],
      ['doctors', ['view']],
      ['audit-log', ['view']],
      ['baiyee-ai', ['view', 'submit']],
    ]),
    fieldPolicies: {
      ...ALL_VISIBLE,
      'settlement.amount': 'mask',
      'doctor.name': 'mask',
      'doctor.phone': 'mask',
      'user.idNo': 'mask',
      'evidence.pii': 'hidden',
    },
  }),
  role({
    id: 'role-provider-admin',
    name: '服务商管理员',
    description: '任务承接、分配、初审、结算',
    kind: 'preset',
    status: 'enabled',
    defaultScope: 'PROVIDER',
    updatedBy: '陈伟',
    updatedAt: '2026-08-15 11:12',
    pagePerms: perms([
      ['dashboard', ['view']],
      ['task-dispatch', ['view', 'edit', 'submit', 'export']],
      ['settlement', ['view', 'submit', 'export']],
      ['rep-filing', ['view', 'create', 'edit']],
      ['vendor-access', ['view']],
    ]),
    fieldPolicies: { ...ALL_VISIBLE, 'doctor.name': 'mask', 'doctor.phone': 'mask', 'user.idNo': 'mask' },
  }),
  role({
    id: 'role-group-lead',
    name: '工作组长',
    description: '工作组分派、初审、进度管理',
    kind: 'preset',
    status: 'enabled',
    defaultScope: 'GROUP',
    updatedBy: '陈伟',
    updatedAt: '2026-08-15 11:12',
    pagePerms: perms([
      ['dashboard', ['view']],
      ['task-dispatch', ['view', 'edit', 'submit', 'approve']],
    ]),
    fieldPolicies: { ...ALL_VISIBLE, 'doctor.name': 'mask', 'settlement.amount': 'hidden' },
  }),
  role({
    id: 'role-specialist',
    name: '服务专员',
    description: '本人填报、证据上传、本人结算查看',
    kind: 'preset',
    status: 'enabled',
    defaultScope: 'SELF',
    updatedBy: '陈伟',
    updatedAt: '2026-08-15 11:12',
    pagePerms: perms([
      ['dashboard', ['view']],
      ['task-dispatch', ['view', 'submit']],
      ['settlement', ['view']],
    ]),
    fieldPolicies: {
      ...ALL_VISIBLE,
      'doctor.name': 'mask',
      'doctor.phone': 'hidden',
      'settlement.amount': 'hidden',
      'user.idNo': 'hidden',
      'user.bankAccount': 'hidden',
      'evidence.pii': 'hidden',
    },
  }),
];

export const seedCustomRoles: SysRole[] = [
  role({
    id: 'role-custom-region-sales',
    name: '药厂区域销售经理',
    description: '从药厂销售管理员复制，限定陕西、四川区域',
    kind: 'custom',
    status: 'enabled',
    defaultScope: 'CUSTOM',
    customScope: {
      ...emptyCustomScope(),
      pharmaIds: ['org-pharma'],
      regionCodes: ['陕西', '四川'],
    },
    copiedFrom: 'role-pharma-sales',
    version: 2,
    updatedBy: '李航',
    updatedAt: '2026-08-24 15:06',
    pagePerms: { ...PRESET_ROLES.find(r => r.id === 'role-pharma-sales')!.pagePerms },
  }),
  role({
    id: 'role-custom-settle-review',
    name: '结算复核专员',
    description: '仅结算查看与导出，待发布草稿',
    kind: 'custom',
    status: 'draft',
    defaultScope: 'PHARMA',
    version: 1,
    updatedBy: '李航',
    updatedAt: '2026-08-25 09:18',
    pagePerms: perms([
      ['dashboard', ['view']],
      ['settlement', ['view', 'export']],
    ]),
    fieldPolicies: { ...ALL_VISIBLE, 'settlement.amount': 'visible' },
  }),
];

export const PERM_ORGS: PermOrg[] = [
  { id: 'org-platform', name: '百益健康科技', type: 'platform' },
  { id: 'org-pharma', name: '百益制药', type: 'pharma', parentId: 'org-platform' },
  { id: 'org-provider-east', name: '东方恒业推广有限公司', type: 'provider', parentId: 'org-pharma' },
  { id: 'org-provider-smart', name: '智联科技有限公司', type: 'provider', parentId: 'org-pharma' },
  { id: 'org-group-3', name: '工作组三', type: 'group', parentId: 'org-provider-east' },
  { id: 'org-group-1', name: '工作组一', type: 'group', parentId: 'org-provider-smart' },
];

export const PERM_USERS: PermUser[] = [
  { id: 'u-wangmin', name: '王敏', account: 'wangmin', orgId: 'org-platform', orgName: '百益健康科技', accountStatus: 'enabled' },
  { id: 'u-lihang', name: '李航', account: 'lihang', orgId: 'org-pharma', orgName: '百益制药', accountStatus: 'enabled' },
  { id: 'u-zhaoning', name: '赵宁', account: 'zhaoning', orgId: 'org-pharma', orgName: '百益制药', accountStatus: 'enabled' },
  { id: 'u-chenwei', name: '陈伟', account: 'chenwei', orgId: 'org-provider-east', orgName: '东方恒业推广有限公司', accountStatus: 'enabled' },
  { id: 'u-liuyang', name: '刘洋', account: 'liuyang', orgId: 'org-group-1', orgName: '工作组一', accountStatus: 'enabled' },
  { id: 'u-yangming', name: '杨明', account: 'yangming', orgId: 'org-group-3', orgName: '工作组三', accountStatus: 'enabled' },
  { id: 'u-huangfeng', name: '黄峰', account: 'huangfeng', orgId: 'org-group-3', orgName: '工作组三', accountStatus: 'enabled' },
  { id: 'u-wuchao', name: '吴超', account: 'wuchao', orgId: 'org-group-3', orgName: '工作组三', accountStatus: 'disabled' },
  { id: 'u-sunli', name: '孙丽', account: 'sunli', orgId: 'org-provider-east', orgName: '东方恒业推广有限公司', accountStatus: 'enabled' },
  { id: 'u-lichen', name: '李晨', account: 'lichen', orgId: 'org-provider-smart', orgName: '智联科技有限公司', accountStatus: 'enabled' },
];

export const seedGrants: UserGrant[] = [
  { id: 'g-01', userId: 'u-wangmin', roleId: 'role-sys-admin', orgId: 'org-platform', orgName: '百益健康科技', scope: 'ALL_PLATFORM', effectiveFrom: '2026-01-01', grantedBy: '系统预置', grantedAt: '2026-01-01 09:00', status: 'active' },
  { id: 'g-02', userId: 'u-wangmin', roleId: 'role-platform-ops', orgId: 'org-platform', orgName: '百益健康科技', scope: 'ALL_PLATFORM', effectiveFrom: '2026-01-01', grantedBy: '系统预置', grantedAt: '2026-01-01 09:00', status: 'active' },
  { id: 'g-03', userId: 'u-lihang', roleId: 'role-pharma-sales', orgId: 'org-pharma', orgName: '百益制药', scope: 'PHARMA', effectiveFrom: '2026-03-01', grantedBy: '王敏', grantedAt: '2026-03-01 10:12', status: 'active' },
  { id: 'g-04', userId: 'u-zhaoning', roleId: 'role-pharma-compliance', orgId: 'org-pharma', orgName: '百益制药', scope: 'PHARMA', effectiveFrom: '2026-03-01', grantedBy: '王敏', grantedAt: '2026-03-01 10:18', status: 'active' },
  { id: 'g-05', userId: 'u-chenwei', roleId: 'role-provider-admin', orgId: 'org-provider-east', orgName: '东方恒业推广有限公司', scope: 'PROVIDER', effectiveFrom: '2026-04-12', grantedBy: '李航', grantedAt: '2026-04-12 14:22', status: 'active' },
  { id: 'g-06', userId: 'u-liuyang', roleId: 'role-group-lead', orgId: 'org-group-1', orgName: '工作组一', scope: 'GROUP', effectiveFrom: '2026-05-08', grantedBy: '陈伟', grantedAt: '2026-05-08 09:30', status: 'active' },
  { id: 'g-07', userId: 'u-yangming', roleId: 'role-specialist', orgId: 'org-group-3', orgName: '工作组三', scope: 'SELF', effectiveFrom: '2026-06-01', grantedBy: '陈伟', grantedAt: '2026-06-01 11:05', status: 'active' },
  { id: 'g-08', userId: 'u-huangfeng', roleId: 'role-specialist', orgId: 'org-group-3', orgName: '工作组三', scope: 'SELF', effectiveFrom: '2026-06-01', grantedBy: '陈伟', grantedAt: '2026-06-01 11:06', status: 'active' },
  { id: 'g-09', userId: 'u-wuchao', roleId: 'role-specialist', orgId: 'org-group-3', orgName: '工作组三', scope: 'SELF', effectiveFrom: '2026-06-01', effectiveTo: '2026-08-01', grantedBy: '陈伟', grantedAt: '2026-06-01 11:07', status: 'expired' },
  { id: 'g-10', userId: 'u-sunli', roleId: 'role-specialist', orgId: 'org-provider-east', orgName: '东方恒业推广有限公司', scope: 'SELF', effectiveFrom: '2026-07-15', grantedBy: '陈伟', grantedAt: '2026-07-15 16:40', status: 'revoked' },
  { id: 'g-11', userId: 'u-lihang', roleId: 'role-custom-region-sales', orgId: 'org-pharma', orgName: '百益制药', scope: 'CUSTOM', effectiveFrom: '2026-08-24', grantedBy: '王敏', grantedAt: '2026-08-24 15:20', status: 'active' },
  { id: 'g-12', userId: 'u-lichen', roleId: 'role-specialist', orgId: 'org-provider-smart', orgName: '智联科技有限公司', scope: 'SELF', effectiveFrom: '2026-08-01', effectiveTo: '2026-09-30', grantedBy: '李航', grantedAt: '2026-08-01 10:00', status: 'active' },
];

export const seedChangeLogs: RoleChangeLog[] = [
  { id: 'cl-01', roleId: 'role-pharma-sales', time: '2026-08-20 16:08', actor: '李航', action: '发布权限', summary: '为结算明细增加导出', beforeSummary: '结算明细：查看、审核', afterSummary: '结算明细：查看、审核、导出', version: 3 },
  { id: 'cl-02', roleId: 'role-custom-region-sales', time: '2026-08-24 15:06', actor: '李航', action: '复制角色', summary: '从药厂销售管理员复制并限定陕西、四川', afterSummary: '数据范围=指定范围', version: 1 },
  { id: 'cl-03', roleId: 'role-custom-region-sales', time: '2026-08-24 15:20', actor: '王敏', action: '授权用户', summary: '授权李航', version: 2 },
  { id: 'cl-04', roleId: 'role-custom-settle-review', time: '2026-08-25 09:18', actor: '李航', action: '新建角色', summary: '创建草稿角色「结算复核专员」', version: 1 },
  { id: 'cl-05', roleId: 'role-pharma-compliance', time: '2026-08-18 09:40', actor: '赵宁', action: '字段策略', summary: '精确结算金额改为脱敏', beforeSummary: '可见', afterSummary: '脱敏', version: 3 },
];

export const seedPermAudit: PermAuditEvent[] = [
  { id: 'PE00080', time: '2026-08-26 09:12', actor: '李航', actorRole: '药厂销售管理员', org: '百益制药', target: '结算复核专员', roleName: '结算复核专员', module: '角色管理', action: '新建角色', resource: 'roles.create', decision: '允许', reason: '创建草稿', afterSummary: '草稿 / 本药厂', requestId: 'req-8260912', ip: '10.2.18.41', result: '成功' },
  { id: 'PE00079', time: '2026-08-25 18:04', actor: '陈伟', actorRole: '服务商管理员', org: '东方恒业推广有限公司', target: '预算计划', roleName: '服务商管理员', module: '预算计划', action: '越权访问', resource: 'budget-plan.view', decision: '拒绝', reason: '当前角色无页面查看权限', requestId: 'req-8251804', ip: '10.8.3.19', result: '失败' },
  { id: 'PE00078', time: '2026-08-25 16:22', actor: '王敏', actorRole: '系统管理员', org: '百益健康科技', target: '李航 × 药厂区域销售经理', roleName: '药厂区域销售经理', module: '用户授权', action: '用户授权', resource: 'user-grants.create', decision: '允许', reason: '区域销售授权', afterSummary: '有效 / 百益制药', requestId: 'req-8251622', ip: '10.2.18.41', result: '成功' },
  { id: 'PE00077', time: '2026-08-24 15:06', actor: '李航', actorRole: '药厂销售管理员', org: '百益制药', target: '药厂区域销售经理', roleName: '药厂销售管理员', module: '角色管理', action: '复制角色', resource: 'roles.create', decision: '允许', reason: '从预置角色复制', beforeSummary: '药厂销售管理员', afterSummary: '定制 / 指定范围', requestId: 'req-8241506', ip: '10.4.21.8', result: '成功' },
  { id: 'PE00076', time: '2026-08-24 11:40', actor: '赵宁', actorRole: '药厂合规管理员', org: '百益制药', target: '证据链复审导出', roleName: '药厂合规管理员', module: '证据链复审', action: '导出', resource: 'evidence-chain.export', decision: '允许', reason: '抽检底稿导出', requestId: 'req-8241140', ip: '10.4.21.33', result: '成功' },
  { id: 'PE00075', time: '2026-08-23 14:18', actor: '杨明', actorRole: '服务专员', org: '工作组三', target: '结算明细', roleName: '服务专员', module: '结算明细', action: '越权访问', resource: 'settlement.approve', decision: '拒绝', reason: '无审核/确认权限', requestId: 'req-8231418', ip: '10.9.12.7', result: '失败' },
  { id: 'PE00074', time: '2026-08-22 10:05', actor: '王敏', actorRole: '系统管理员', org: '百益健康科技', target: '角色预览 / 服务专员', roleName: '服务专员', module: '角色预览', action: '角色预览', resource: 'role-preview.view', decision: '允许', reason: '验收服务专员菜单', requestId: 'req-8221005', ip: '10.2.18.41', result: '成功' },
  { id: 'PE00073', time: '2026-08-20 16:08', actor: '李航', actorRole: '药厂销售管理员', org: '百益制药', target: '药厂销售管理员', roleName: '药厂销售管理员', module: '角色管理', action: '编辑角色', resource: 'roles.edit', decision: '允许', reason: '发布权限 v3', beforeSummary: '结算无导出', afterSummary: '结算含导出', requestId: 'req-8201608', ip: '10.4.21.8', result: '成功' },
  { id: 'PE00072', time: '2026-08-19 09:50', actor: '陈伟', actorRole: '服务商管理员', org: '东方恒业推广有限公司', target: '孙丽 × 服务专员', roleName: '服务专员', module: '用户授权', action: '回收授权', resource: 'user-grants.delete', decision: '允许', reason: '人员停用回收', beforeSummary: '有效', afterSummary: '已回收', requestId: 'req-8190950', ip: '10.8.3.19', result: '成功' },
  { id: 'PE00071', time: '2026-08-18 09:40', actor: '赵宁', actorRole: '药厂合规管理员', org: '百益制药', target: '药厂合规管理员 / 精确结算金额', roleName: '药厂合规管理员', module: '角色管理', action: '字段策略', resource: 'roles.edit', decision: '允许', reason: '业绩字段脱敏', beforeSummary: '可见', afterSummary: '脱敏', requestId: 'req-8180940', ip: '10.4.21.33', result: '成功' },
];

export const LOGIN_ROLE_MAP: Record<Role, string> = {
  '药厂销售部门': 'role-pharma-sales',
  '药厂合规部门': 'role-pharma-compliance',
  '服务提供商': 'role-provider-admin',
};

export const VARIETY_OPTIONS = ['阿托伐他汀钙片', '氨氯地平片', '奥美拉唑肠溶胶囊'];
export const REGION_SCOPE_OPTIONS = REGION_OPTIONS.slice(0, 12);

export function grantStatusLabel(status: GrantStatus): string {
  return { active: '有效', expired: '已过期', revoked: '已回收', pending_review: '待复核' }[status];
}

export function roleStatusLabel(status: SysRoleStatus): string {
  return { enabled: '启用', disabled: '停用', draft: '草稿' }[status];
}

export function fieldPolicyLabel(policy: FieldPolicyKind): string {
  return { visible: '可见', mask: '脱敏', hidden: '隐藏' }[policy];
}

export function countGrantedUsers(roleId: string, grants: UserGrant[]): number {
  return new Set(grants.filter(g => g.roleId === roleId && g.status === 'active').map(g => g.userId)).size;
}

export function pageHasAction(role: SysRole, pageId: string, action: PageAction): boolean {
  const list = role.pagePerms[pageId] ?? [];
  if (action === 'view') return list.includes('view') || list.length > 0;
  return list.includes('view') && list.includes(action);
}

export function visiblePageIds(role: SysRole): string[] {
  return Object.entries(role.pagePerms)
    .filter(([, actions]) => actions.includes('view') || actions.length > 0)
    .map(([id]) => id);
}

export function summarizePerms(role: SysRole): string {
  const pages = visiblePageIds(role).length;
  const writes = Object.values(role.pagePerms).flat().filter(a => a !== 'view').length;
  return `${pages} 个页面 · ${writes} 项操作 · ${scopeLabel(role.defaultScope)}`;
}

export function applyActionToggle(
  pagePerms: Record<string, PageAction[]>,
  page: ResourcePage,
  action: PageAction,
  checked: boolean,
): Record<string, PageAction[]> {
  const next = { ...pagePerms };
  const current = new Set(next[page.id] ?? []);
  if (action === 'view' && !checked) {
    delete next[page.id];
    return next;
  }
  if (checked) {
    current.add('view');
    current.add(action);
  } else {
    current.delete(action);
    if (action === 'view') current.clear();
  }
  if (current.size === 0) delete next[page.id];
  else next[page.id] = page.actions.map(a => a.key).filter(k => current.has(k));
  return next;
}

export function hasHighRiskGrant(
  prev: Record<string, PageAction[]>,
  next: Record<string, PageAction[]>,
): boolean {
  const riskKeys = new Set(
    RESOURCE_PAGES.flatMap(p => p.actions.filter(a => a.risk).map(a => `${p.id}.${a.key}`)),
  );
  for (const [pageId, actions] of Object.entries(next)) {
    for (const action of actions) {
      const key = `${pageId}.${action}`;
      if (!riskKeys.has(key)) continue;
      if (!(prev[pageId] ?? []).includes(action)) return true;
    }
  }
  return false;
}

let idSeq = 100;
export function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

export function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

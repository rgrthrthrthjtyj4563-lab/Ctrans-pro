/**
 * 角色权限管理 — 单一事实源
 * 管理员只面对页面名称、按钮名称、数据范围和字段展示方式，不接触内部编码。
 *
 * 多租户权限域（2026-09 重构 · 2026-09-15 收敛版）：
 * - AccessRealm 区分「系统权限域（软件服务方）」与「租户权限域」：软件服务方仅保留
 *   「贝医系统管理员」一个预置角色（租户开通、菜单管理、合作关系监管与系统审计），
 *   不进入任何租户内部配置；租户角色（TENANT_ROLES）只在药厂/服务商企业工作空间内生效。
 * - 角色只定义能力（页面/操作/字段 + 范围策略）；员工实际的角色授予、生效期
 *   与数据范围（含服务商成员可处理药厂/品种）统一在「角色与数据范围」页的
 *   「已授权成员」页签完成（UserRoleAssignment 为唯一数据源）。
 * - 租户侧授权一律携带 tenantId（稳定租户边界），不再由组织树反推。
 */

import type { Role } from "../types"
import { REGION_OPTIONS } from "../constants"

/** 权限域：系统管理后台（软件服务方） 或 租户企业（药厂/服务商） */
export type AccessRealm = "PLATFORM" | "TENANT"
/** 租户企业类型（软件服务方不算一种企业租户） */
export type TenantKind = "pharma" | "provider"

/** 租户角色的数据范围档位（软件服务方侧不使用本枚举，系统职责范围见 PlatformRoleBinding.dutyScope） */
export type ScopeType =
  | "PHARMA"
  | "PROVIDER"
  | "GROUP"
  | "DEPT"
  | "DEPT_AND_CHILD"
  | "SELF"
  | "MOBILE"
  | "CUSTOM"
export type SysRoleKind = "preset" | "custom"
export type SysRoleStatus = "enabled" | "disabled" | "draft"
export type FieldPolicyKind = "visible" | "mask" | "hidden"
export type GrantStatus = "active" | "expired" | "revoked" | "pending_review"
export type PageAction = "view" | "create" | "edit" | "delete" | "submit" | "approve" | "export"
export type AuditDecision = "允许" | "拒绝"

export const PAGE_ACTION_META: {
  key: PageAction
  label: string
  risk?: boolean
}[] = [
  { key: "view", label: "查看页面" },
  { key: "create", label: "新建" },
  { key: "edit", label: "编辑" },
  { key: "delete", label: "删除", risk: true },
  { key: "submit", label: "提交/发起" },
  { key: "approve", label: "审核/确认", risk: true },
  { key: "export", label: "导出", risk: true },
]

export const SCOPE_OPTIONS: { value: ScopeType; label: string; hint: string }[] =
  [
    { value: "PHARMA", label: "本药厂", hint: "仅本药厂及下属执行数据" },
    {
      value: "PROVIDER",
      label: "本服务商",
      hint: "仅本服务商承接范围内的数据",
    },
    { value: "GROUP", label: "本工作组", hint: "仅本工作组辖区数据" },
    {
      value: "DEPT",
      label: "本部门",
      hint: "仅授权生效组织这一节点，不含下级部门",
    },
    {
      value: "DEPT_AND_CHILD",
      label: "本部门及以下",
      hint: "授权生效组织及其全部下级部门",
    },
    { value: "SELF", label: "仅本人", hint: "仅本人填报与本人结算" },
    {
      value: "CUSTOM",
      label: "指定组织范围",
      hint: "仅本企业内部组织节点；业务范围（药厂/品种）在「已授权成员」按人授予",
    },
  ]

/**
 * 「移动端」不是数据范围（2026-09-15 拍板）：限制登录终端只能作为角色/账号的
 * 演示登录策略，不得混入数据范围选项。ScopeType 保留 "MOBILE" 仅为兼容历史
 * 数据读取（scopeLabel 给出兼容文案），选择器一律不再提供该档位。
 */
const SCOPE_LABEL_COMPAT: Partial<Record<ScopeType, string>> = {
  MOBILE: "仅本人（移动端策略）",
}

export function scopeLabel(scope: ScopeType): string {
  return SCOPE_OPTIONS.find((s) => s.value === scope)?.label ?? SCOPE_LABEL_COMPAT[scope] ?? scope
}

export interface PageActionDef {
  key: PageAction
  label: string
  code: string
  risk?: boolean
}

export interface ResourcePage {
  id: string
  module: string
  name: string
  description: string
  actions: PageActionDef[]
  /** 权限域过滤：缺省=两域通用（如工作台）。菜单与路由拦截统一按此判断，不再依赖旧视角名称。 */
  realms?: AccessRealm[]
  /** 租户类型过滤：仅 realm 含 TENANT 时生效，缺省=药厂/服务商皆可见 */
  tenantTypes?: TenantKind[]
}

export interface SensitiveField {
  key: string
  name: string
  module: string
  description: string
  maskExample: string
}

/**
 * 角色的组织数据范围（2026-09-16 拍板·方案B）：角色只承载组织范围；
 * 业务范围（药厂/品种/派生区域）是成员授权（RoleAssignment）的一部分，
 * 在各角色「已授权成员」页签按人授予——不在角色上配置。
 * pharmaIds/varietyIds 等遗留字段仅为兼容历史种子数据保留，不再被任何
 * 页面编辑或运行时读取。
 */
export interface CustomScope {
  orgIds: string[]
  pharmaIds: string[]
  providerIds: string[]
  groupIds: string[]
  deptIds: string[]
  varietyIds: string[]
  regionCodes: string[]
}

export interface SysRole {
  id: string
  name: string
  description: string
  kind: SysRoleKind
  status: SysRoleStatus
  /** 角色所属权限域：系统角色与租户角色永不混列 */
  realm: AccessRealm
  /**
   * 自定义角色的所属租户（租户隔离）：缺省 = 预置角色（可按租户类型复用，
   * 所有租户可见）；自定义角色只在所属租户内可见、可授予、可编辑。
   */
  tenantId?: string
  /** 仅 TENANT 角色：可授予的租户类型（缺省=两类皆可） */
  appliesTo?: TenantKind[]
  defaultScope: ScopeType
  customScope: CustomScope
  version: number
  updatedBy: string
  updatedAt: string
  /** 页面 id → 已授权动作。未出现的页面视为无权限。 */
  pagePerms: Record<string, PageAction[]>
  fieldPolicies: Record<string, FieldPolicyKind>
}

/** User：自然人（手机号=登录身份）。同一个自然人可在多个企业持有不同的 TenantMembership。 */
export interface PermUser {
  id: string
  name: string
  account: string
  phone: string
  email: string
  /** 用户当前所属组织/部门（人员归属，调岗会变化） */
  orgId: string
  orgName: string
  accountStatus: "enabled" | "disabled"
  createdAt?: string
  lastLoginAt?: string
}

/** OrgUnit：组织节点；type=platform/pharma 为企业根，group 为服务商内部业务团队 */
export interface PermOrg {
  id: string
  name: string
  type: "platform" | "pharma" | "provider" | "group" | "department"
  parentId?: string
}

/**
 * TenantMembership：用户加入某租户企业后形成的企业成员身份。
 * 登录身份 = 自然人 × 成员身份 × 生效授权角色；不通过组织名/角色名反推租户。
 */
export interface TenantMembership {
  id: string
  userId: string
  /** 租户企业根 orgId（药厂或服务商） */
  tenantId: string
  tenantName: string
  /** 成员在该租户内的组织归属节点（部门/工作组） */
  orgUnitId: string
  status: "active" | "frozen" | "pending_activation"
  joinedAt: string
}

/**
 * PlatformRoleBinding：软件服务方账号 ↔ 系统角色的授予记录（系统权限域内，独立于租户授权）。
 * dutyScope 用职责摘要表达管理边界（如「全部租户的开通与企业码管理」），不再写「某企业（全部租户）」。
 */
export interface PlatformRoleBinding {
  id: string
  userId: string
  platformRoleId: string
  dutyScope: string
  effectiveFrom: string
  effectiveTo?: string
  grantedBy: string
  grantedAt: string
  status: GrantStatus
  reason?: string
  revokedBy?: string
  revokedAt?: string
}

/**
 * UserRoleAssignment（RoleAssignment）：租户企业内，成员获得某角色及其数据范围的记录。
 * - tenantId 为稳定租户边界（不随组织树变化）；
 * - scopeOrgId 是组织数据权限覆盖根节点，与用户所属 orgId 两种语义：调岗不改写 scopeOrgId；
 * - pharmaTenantIds / varietyNames 是「服务商成员可处理哪些合作药厂、哪些品种」的唯一
 *   数据源（仅服务商租户使用），由「角色与数据范围」页的「已授权成员」页签授予，
 *   不得超过药厂授予服务商的合作与业务授权范围；区域由品种授权自动派生，不单独配置。
 */
export interface RoleAssignment {
  id: string
  /** 稳定租户边界：授权生效所属租户企业根 id */
  tenantId: string
  userId: string
  roleId: string
  /** 权限覆盖根节点（组织数据权限计算用），不随人员调岗变化 */
  scopeOrgId: string
  scopeOrgName: string
  scope: ScopeType
  /** 服务商员工可访问的合作药厂（药厂租户 id 集合；缺省=不适用） */
  pharmaTenantIds?: string[]
  /** 服务商员工可处理的品种（在药厂已授权给本服务商的品种内收窄；缺省=全部已授权品种） */
  varietyNames?: string[]
  /** 区域数据范围（由品种授权派生的只读展示，不作为配置入口） */
  regionCodes?: string[]
  /** 项目数据范围（展示与提示用） */
  projectNames?: string[]
  effectiveFrom: string
  effectiveTo?: string
  grantedBy: string
  grantedAt: string
  status: GrantStatus
  reason?: string
  revokedBy?: string
  revokedAt?: string
}

export interface RoleChangeLog {
  id: string
  roleId: string
  time: string
  actor: string
  action: string
  summary: string
  beforeSummary?: string
  afterSummary?: string
  version: number
}

export interface PermAuditEvent {
  id: string
  time: string
  actor: string
  actorRole: string
  org: string
  target: string
  roleName?: string
  module: string
  action: string
  resource: string
  decision: AuditDecision
  reason: string
  beforeSummary?: string
  afterSummary?: string
  requestId: string
  ip: string
  result: "成功" | "失败"
}

function acts(pageId: string, keys: PageAction[]): PageActionDef[] {
  return keys.map((key) => {
    const meta = PAGE_ACTION_META.find((m) => m.key === key)!
    const risk =
      meta.risk ||
      (pageId === "roles" && (key === "create" || key === "edit")) ||
      key === "approve"
    return {
      key,
      label: meta.label,
      code: `${pageId}.${key}`,
      risk: Boolean(risk || meta.risk),
    }
  })
}

export const RESOURCE_PAGES: ResourcePage[] = [
  {
    id: "dashboard",
    module: "工作台",
    name: "工作台",
    description: "进入角色首页与待办总览",
    actions: acts("dashboard", ["view"]),
  },
  {
    id: "budget-plan",
    module: "业务管理",
    name: "预算计划",
    description: "查看与维护企业计划预算",
    actions: acts("budget-plan", ["view", "create", "edit", "export"]),
  },
  {
    id: "task-dispatch",
    module: "业务管理",
    name: "任务执行",
    description: "任务创建、拆解、填报与进度",
    actions: acts("task-dispatch", [
      "view",
      "create",
      "edit",
      "submit",
      "export",
    ]),
  },
  {
    id: "hospital-visits",
    module: "业务管理",
    name: "医院拜访",
    description: "医院拜访记录填报、审核与查看（备案异常时学术拜访类动作被阻断）",
    actions: acts("hospital-visits", ["view", "approve", "export"]),
  },
  {
    id: "settlement",
    module: "业务管理",
    name: "结算明细",
    description: "结算单提交、确认与导出",
    actions: acts("settlement", ["view", "submit", "approve", "export"]),
  },
  {
    id: "rep-filing",
    module: "合作与授权",
    name: "服务人员备案",
    description: "服务专员备案台账与审核（备案属于业务资格：未备案不影响登录与查看，但不可发起学术拜访等业务动作）",
    actions: acts("rep-filing", [
      "view",
      "create",
      "edit",
      "approve",
      "export",
    ]),
  },
  {
    id: "vendor-access",
    module: "合作与授权",
    name: "服务商准入",
    description:
      "服务商提交准入资料，药厂合规审核通过或驳回（企业间合作关系的入口；准入通过后合作才生效）",
    actions: acts("vendor-access", ["view", "create", "edit", "submit", "approve"]),
    realms: ["TENANT"],
  },
  {
    id: "vendor-access-records",
    module: "合作与授权",
    name: "服务商准入提交记录",
    description: "服务商查看本企业准入资料的历次提交与审核结果",
    actions: acts("vendor-access-records", ["view"]),
    realms: ["TENANT"],
    tenantTypes: ["provider"],
  },
  {
    id: "doctors",
    module: "主数据管理",
    name: "医生主数据",
    description: "医生档案查询",
    actions: acts("doctors", ["view", "export"]),
  },
  {
    id: "varieties",
    module: "主数据管理",
    name: "品种管理",
    description: "品种建档与维护",
    actions: acts("varieties", ["view", "create", "edit"]),
  },
  {
    id: "variety-auth",
    module: "合作与授权",
    name: "业务授权",
    description: "药厂向服务商授予品种业务资格（企业间授权；仅合作生效的关系可授予；服务商成员的实际处理范围在「角色与数据范围 · 已授权成员」中二次收窄）",
    actions: acts("variety-auth", ["view", "create", "edit", "delete", "approve"]),
    realms: ["TENANT"],
    tenantTypes: ["pharma"],
  },
  {
    id: "pharma-cooperation",
    module: "合作与授权",
    name: "合作关系",
    description: "本药厂与各服务商的合作关系台账：生效、暂停、恢复、终止（暂停后服务商全员即时不可进入本药厂业务）",
    actions: acts("pharma-cooperation", ["view", "edit", "approve"]),
    realms: ["TENANT"],
    tenantTypes: ["pharma"],
  },
  {
    id: "provider-partners",
    module: "合作管理",
    name: "合作药厂与业务授权",
    description: "按药厂展示本服务商的合作状态、授权品种与内部使用范围（只读；合作与授权均由药厂控制）",
    actions: acts("provider-partners", ["view"]),
    realms: ["TENANT"],
    tenantTypes: ["provider"],
  },
  {
    id: "price-config",
    module: "价目管理",
    name: "价目表配置",
    description: "药厂绑定默认价目表，品种继承或解绑定制；一张表含基础/会议/报告/区域四个价格区",
    actions: acts("price-config", ["view", "edit"]),
  },
  {
    id: "roles",
    module: "企业管理",
    name: "角色与数据范围",
    description: "角色、页面权限、按钮权限、数据范围与角色成员授权的唯一可编辑入口（成员授予/回收在角色详情「已授权成员」页签）",
    actions: acts("roles", ["view", "create", "edit", "delete", "export"]),
    realms: ["TENANT"],
  },
  {
    id: "menus",
    module: "系统服务",
    name: "菜单管理",
    description: "软件服务方维护左侧导航的目录、页面绑定、排序与启停（菜单对所有租户生效；租户无权维护）",
    actions: acts("menus", ["view", "create", "edit"]),
    realms: ["PLATFORM"],
  },
  {
    id: "role-preview",
    module: "系统管理",
    name: "角色预览",
    description: "按角色只读预览菜单、按钮与字段",
    actions: acts("role-preview", ["view"]),
    realms: ["TENANT"],
  },
  {
    id: "org-structure",
    module: "企业管理",
    name: "组织架构",
    description: "本企业部门结构的维护（新建/重命名/调整上级）；组织只回答「这个人属于哪里」，不承载角色与权限",
    actions: acts("org-structure", ["view", "create", "edit", "delete"]),
    realms: ["TENANT"],
  },
  {
    id: "user-manage",
    module: "企业管理",
    name: "用户管理",
    description: "本企业成员账号：建档、启停、调岗与已分配角色只读查看；角色与数据范围在「角色与数据范围」页配置",
    actions: acts("user-manage", ["view", "create", "edit", "delete"]),
    realms: ["TENANT"],
  },
  {
    id: "workgroup-manage",
    module: "企业管理",
    name: "工作组管理",
    description: "服务商工作组的组长指定/变更与任务承接状态（工作组节点与成员归属在「组织架构」维护）",
    actions: acts("workgroup-manage", ["view", "edit"]),
    realms: ["TENANT"],
    tenantTypes: ["provider"],
  },
  {
    id: "audit-log",
    module: "企业管理",
    name: "企业审计日志",
    description: "本企业范围内的操作审计",
    actions: acts("audit-log", ["view"]),
    realms: ["TENANT"],
  },
  {
    id: "cooperation-supervision",
    module: "系统服务",
    name: "合作关系监管",
    description: "软件服务方只读监管各药厂—服务商合作关系与业务授权状态（不介入企业间授权决策）",
    actions: acts("cooperation-supervision", ["view", "export"]),
    realms: ["PLATFORM"],
  },
  {
    id: "platform-audit",
    module: "系统服务",
    name: "系统审计日志",
    description: "软件服务方操作与租户高风险操作审计",
    actions: acts("platform-audit", ["view"]),
    realms: ["PLATFORM"],
  },
  {
    id: "baiyee-ai",
    module: "工作台",
    name: "baiyee-AI",
    description: "药厂运营智能查询、分析与受控业务开关",
    actions: acts("baiyee-ai", ["view", "submit"]),
  },
  {
    id: "execution-chain",
    module: "系统管理",
    name: "执行链路配置",
    description: "配置任务执行链是否经过工作组",
    actions: acts("execution-chain", ["view", "edit"]),
  },
  {
    id: "business-switch",
    module: "系统管理",
    name: "药厂配置开关",
    description: "维护药厂业务合规模式、拜访留痕、定位与轨迹校验规则",
    actions: acts("business-switch", ["view", "edit"]),
  },
  {
    id: "performance-team",
    module: "绩效管理",
    name: "团队工作质量评价",
    description:
      "服务商给工作组打绩效（阶段一，质量系数校验）；直达批次服务商一对一给专员打；药厂不可见",
    actions: acts("performance-team", ["view", "submit", "export"]),
  },
  {
    id: "performance-specialist",
    module: "绩效管理",
    name: "服务专员绩效",
    description:
      "一专员一条记录；阶段二/直达一对一打绩效（工作量上限 X% + 四维评定）、查看详情与下载结算单",
    actions: acts("performance-specialist", ["view", "submit", "export"]),
  },
  {
    id: "performance-settings",
    module: "绩效管理",
    name: "绩效设置",
    description: "打绩效业务开关、评级模式与系数/权重/上限配置",
    actions: acts("performance-settings", ["view", "edit"]),
  },
  {
    id: "biz-detail-export",
    module: "统计管理",
    name: "业务明细导出",
    description:
      "按对账单与服务方生成业务明细导出报告：筛选统计口径、选择模板、单页预览并导出 PDF",
    actions: acts("biz-detail-export", ["view", "create", "export"]),
  },
  {
    id: "talk-script-variety",
    module: "话术管理",
    name: "品种话术维护",
    description:
      "按品种与拜访类别维护标准话术与客户反馈：查询、启停、科室规则、复制与导入导出；AI 生成入口跳转 baiyee-AI",
    actions: acts("talk-script-variety", ["view", "create", "edit", "delete", "export"]),
  },
  {
    id: "scenario-center",
    module: "扩展能力",
    name: "业务搭建中心",
    description:
      "低代码搭建自定义业务场景：表单字段、审批流程、权限与接口联动配置，发布成可用的业务模块（药厂管理员/合规/软件服务方可用，服务商不可见）",
    actions: acts("scenario-center", ["view", "create", "edit"]),
  },
  {
    id: "tenant-management",
    module: "系统服务",
    name: "租户管理",
    description:
      "软件服务方租户开户闭环：直接创建药厂/服务商租户并生成主企业码、首位管理员激活与租户生命周期管理（仅系统管理后台可见，软件服务方人员不进入租户内部配置）",
    actions: acts("tenant-management", ["view", "create", "edit", "approve"]),
    realms: ["PLATFORM"],
  },
]

export const SENSITIVE_FIELDS: SensitiveField[] = [
  {
    key: "doctor.name",
    name: "医生姓名",
    module: "医生主数据",
    description: "拜访、任务、证据中的医生姓名",
    maskExample: "张*",
  },
  {
    key: "doctor.phone",
    name: "手机号",
    module: "主数据",
    description: "医生或联系人手机号",
    maskExample: "138****5678",
  },
  {
    key: "user.idNo",
    name: "身份证件",
    module: "企业用户",
    description: "代表身份证等证件号码",
    maskExample: "610***********1234",
  },
  {
    key: "user.bankAccount",
    name: "银行卡号",
    module: "结算",
    description: "收款账户",
    maskExample: "6222 **** **** 8890",
  },
  {
    key: "settlement.amount",
    name: "精确结算金额",
    module: "结算明细",
    description: "结算单逐行与合计金额",
    maskExample: "￥1.2万",
  },
  {
    key: "contact.info",
    name: "联系人信息",
    module: "企业用户",
    description: "服务商/药厂联系人姓名与电话",
    maskExample: "李* / 139****2210",
  },
  {
    key: "evidence.pii",
    name: "证据附件个人信息",
    module: "证据链",
    description: "附件中可识别个人的信息",
    maskExample: "隐藏字段",
  },
]

export const emptyCustomScope = (): CustomScope => ({
  orgIds: [],
  pharmaIds: [],
  providerIds: [],
  groupIds: [],
  deptIds: [],
  varietyIds: [],
  regionCodes: [],
})

const ALL_VISIBLE: Record<string, FieldPolicyKind> = Object.fromEntries(
  SENSITIVE_FIELDS.map((f) => [f.key, "visible" as FieldPolicyKind]),
)

function perms(
  entries: [string, PageAction[]][],
): Record<string, PageAction[]> {
  return Object.fromEntries(entries)
}

const ACTOR_ADMIN = "王敏"

function role(
  partial: Omit<SysRole, "customScope" | "fieldPolicies" | "version"> & {
    fieldPolicies?: Record<string, FieldPolicyKind>
    customScope?: CustomScope
    version?: number
  },
): SysRole {
  return {
    customScope: emptyCustomScope(),
    fieldPolicies: ALL_VISIBLE,
    version: 3,
    ...partial,
  }
}


/**
 * 系统角色（realm=PLATFORM，软件服务方域）：仅保留「贝医系统管理员」一个预置角色，
 * 负责租户开通与企业码、菜单管理、合作关系监管与系统审计。系统角色不得持有
 * 任何租户内部页面（组织/用户/租户角色/数据范围/业务数据），也不得出现在
 * 企业角色页与企业菜单树中；软件服务方认证成功后直接进入系统工作台，无角色确认页。
 */
export const PLATFORM_ROLES: SysRole[] = [
  role({
    id: "role-sys-admin",
    name: "贝医系统管理员",
    description: "租户开通与企业码、菜单管理、合作关系监管与系统审计（软件服务方唯一预置角色，不属于任何企业租户）",
    kind: "preset",
    status: "enabled",
    realm: "PLATFORM",
    defaultScope: "CUSTOM",
    updatedBy: ACTOR_ADMIN,
    updatedAt: "2026-09-15 10:00",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["tenant-management", ["view", "create", "edit", "approve"]],
      ["menus", ["view", "create", "edit"]],
      ["cooperation-supervision", ["view", "export"]],
      ["platform-audit", ["view"]],
    ]),
  }),
]

/**
 * 租户角色（realm=TENANT）：只在药厂/服务商企业工作空间内生效。
 * 药厂本轮唯一后台管理角色=企业管理员（销售部/合规部等是组织节点，不是系统角色，
 * 页面按「企业管理员 · XX部门」展示）；原先由销售/合规预置角色决定的后台操作
 * 统一并入企业管理员。角色=能力模板；员工实际管理哪家药厂/品种由
 * UserRoleAssignment 的 pharmaTenantIds / varietyNames 决定。
 */
export const TENANT_ROLES: SysRole[] = [
  role({
    id: "role-pharma-admin",
    name: "企业管理员",
    description: "药厂唯一后台管理角色：本药厂业务管理、合作与授权、基础数据与企业管理（可属于销售部、合规部等任意部门）",
    kind: "preset",
    status: "enabled",
    realm: "TENANT",
    appliesTo: ["pharma"],
    defaultScope: "PHARMA",
    updatedBy: ACTOR_ADMIN,
    updatedAt: "2026-09-15 10:00",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["rep-filing", ["view", "create", "edit", "approve", "export"]],
      ["vendor-access", ["view", "approve"]],
      ["budget-plan", ["view", "create", "edit", "export"]],
      ["task-dispatch", ["view", "create", "edit", "submit", "export"]],
      ["hospital-visits", ["view", "export"]],
      ["settlement", ["view", "approve", "export"]],
      ["doctors", ["view", "export"]],
      ["varieties", ["view", "create", "edit"]],
      ["variety-auth", ["view", "create", "edit", "delete"]],
      ["pharma-cooperation", ["view", "edit", "approve"]],
      ["price-config", ["view", "edit"]],
      ["execution-chain", ["view", "edit"]],
      ["business-switch", ["view", "edit"]],
      ["biz-detail-export", ["view", "create", "export"]],
      ["talk-script-variety", ["view", "create", "edit", "delete", "export"]],
      ["scenario-center", ["view", "create", "edit"]],
      ["org-structure", ["view", "create", "edit", "delete"]],
      ["user-manage", ["view", "create", "edit", "delete"]],
      ["roles", ["view", "create", "edit", "delete"]],
      ["role-preview", ["view"]],
      ["audit-log", ["view"]],
      ["baiyee-ai", ["view", "submit"]],
    ]),
  }),
  role({
    id: "role-provider-admin",
    name: "服务商管理员",
    description: "任务承接分配、合作信息查看、本服务商组织/用户/角色与数据范围（业务数据按当前服务药厂与已授权品种过滤）",
    kind: "preset",
    status: "enabled",
    realm: "TENANT",
    appliesTo: ["provider"],
    defaultScope: "PROVIDER",
    updatedBy: "陈伟",
    updatedAt: "2026-09-15 10:00",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["task-dispatch", ["view", "edit", "submit", "export"]],
      ["hospital-visits", ["view", "approve"]],
      ["settlement", ["view", "submit", "export"]],
      ["rep-filing", ["view", "create", "edit"]],
      ["vendor-access", ["view", "create", "edit", "submit"]],
      ["vendor-access-records", ["view"]],
      ["provider-partners", ["view"]],
      ["performance-team", ["view", "submit", "export"]],
      ["performance-specialist", ["view", "submit", "export"]],
      ["performance-settings", ["view", "edit"]],
      ["biz-detail-export", ["view", "create", "export"]],
      ["org-structure", ["view", "create", "edit", "delete"]],
      ["user-manage", ["view", "create", "edit", "delete"]],
      ["workgroup-manage", ["view", "edit"]],
      ["roles", ["view", "create", "edit", "delete"]],
      ["role-preview", ["view"]],
      ["audit-log", ["view"]],
    ]),
    fieldPolicies: {
      ...ALL_VISIBLE,
      "doctor.name": "mask",
      "doctor.phone": "mask",
      "user.idNo": "mask",
    },
  }),
  role({
    id: "role-group-lead",
    name: "工作组组长",
    description: "承接本工作组管理任务并向组员分派；查看本组合作药厂与绩效（不是服务商管理员，不获得全服务商权限）",
    kind: "preset",
    status: "enabled",
    realm: "TENANT",
    appliesTo: ["provider"],
    defaultScope: "GROUP",
    updatedBy: "陈伟",
    updatedAt: "2026-08-15 11:12",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["task-dispatch", ["view", "edit", "submit", "approve"]],
      ["provider-partners", ["view"]],
      ["performance-team", ["view"]],
      ["performance-specialist", ["view", "submit"]],
    ]),
    fieldPolicies: {
      ...ALL_VISIBLE,
      "doctor.name": "mask",
      "settlement.amount": "hidden",
    },
  }),
  role({
    id: "role-specialist",
    name: "服务专员",
    description: "本人填报、证据上传、本人结算查看（业务动作受合作、业务授权与备案资格限制）",
    kind: "preset",
    status: "enabled",
    realm: "TENANT",
    appliesTo: ["provider"],
    defaultScope: "SELF",
    updatedBy: "陈伟",
    updatedAt: "2026-08-15 11:12",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["task-dispatch", ["view", "submit"]],
      ["hospital-visits", ["view"]],
      ["settlement", ["view"]],
      ["performance-specialist", ["view"]],
    ]),
    fieldPolicies: {
      ...ALL_VISIBLE,
      "doctor.name": "mask",
      "doctor.phone": "hidden",
      "settlement.amount": "hidden",
      "user.idNo": "hidden",
      "user.bankAccount": "hidden",
      "evidence.pii": "hidden",
    },
  }),
]

/** 全量预置角色（登录网关按 realm 取子集） */
export const PRESET_ROLES: SysRole[] = [...PLATFORM_ROLES, ...TENANT_ROLES]

export const seedCustomRoles: SysRole[] = [
  role({
    id: "role-custom-region-sales",
    name: "药厂区域销售经理",
    description:
      "数据范围为本部门及以下；授权挂在西北大区即可覆盖陕西、四川办事处",
    kind: "custom",
    status: "enabled",
    realm: "TENANT",
    tenantId: "org-pharma",
    appliesTo: ["pharma"],
    defaultScope: "DEPT_AND_CHILD",
    customScope: {
      ...emptyCustomScope(),
      pharmaIds: ["org-pharma"],
    },
    version: 2,
    updatedBy: "李航",
    updatedAt: "2026-08-24 15:06",
    pagePerms: {
      ...TENANT_ROLES.find((r) => r.id === "role-pharma-admin")!.pagePerms,
    },
  }),
  role({
    id: "role-custom-settle-review",
    name: "结算复核专员",
    description: "仅结算查看与导出，待发布草稿",
    kind: "custom",
    status: "draft",
    realm: "TENANT",
    tenantId: "org-pharma",
    appliesTo: ["pharma"],
    defaultScope: "PHARMA",
    version: 1,
    updatedBy: "李航",
    updatedAt: "2026-08-25 09:18",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["settlement", ["view", "export"]],
    ]),
    fieldPolicies: { ...ALL_VISIBLE, "settlement.amount": "visible" },
  }),
]

export const PERM_ORGS: PermOrg[] = [
  // 系统管理后台根：仅表达软件服务方内部组织（软件服务方不是企业租户；登录/权限一律按 realm 判定）
  { id: "org-platform", name: "贝医信息科技", type: "platform" },
  { id: "org-dept-platform-ops", name: "系统服务部", type: "department", parentId: "org-platform" },
  { id: "org-dept-platform-account", name: "客户成功部", type: "department", parentId: "org-platform" },
  // 药厂租户根：与其他药厂/服务商互为独立租户（合作关系不在组织树中表达）
  {
    id: "org-pharma",
    name: "百益制药",
    type: "pharma",
  },
  {
    id: "org-pharma-huakang",
    name: "华康药业",
    type: "pharma",
  },
  {
    id: "org-pharma-kangning",
    name: "康宁制药",
    type: "pharma",
  },
  {
    id: "org-pharma-zekang",
    name: "泽康药业",
    type: "pharma",
  },
  {
    id: "org-dept-it",
    name: "信息技术部",
    type: "department",
    parentId: "org-pharma",
  },
  {
    id: "org-dept-sales",
    name: "销售部",
    type: "department",
    parentId: "org-pharma",
  },
  {
    id: "org-dept-northwest",
    name: "西北大区",
    type: "department",
    parentId: "org-dept-sales",
  },
  {
    id: "org-dept-shaanxi",
    name: "陕西办事处",
    type: "department",
    parentId: "org-dept-northwest",
  },
  {
    id: "org-dept-sichuan",
    name: "四川办事处",
    type: "department",
    parentId: "org-dept-northwest",
  },
  {
    id: "org-dept-east",
    name: "华东大区",
    type: "department",
    parentId: "org-dept-sales",
  },
  {
    id: "org-dept-compliance",
    name: "合规部",
    type: "department",
    parentId: "org-pharma",
  },
  // 服务商与药厂是合作关系而非上下级：服务商作为独立企业根节点呈现（§2.3）
  {
    id: "org-provider-east",
    name: "东方恒业推广有限公司",
    type: "provider",
  },
  {
    id: "org-provider-smart",
    name: "智联科技有限公司",
    type: "provider",
  },
  {
    id: "org-provider-kangsheng",
    name: "康晟云服科技有限公司",
    type: "provider",
  },
  {
    id: "org-provider-yongtai",
    name: "永泰汇通推广有限公司",
    type: "provider",
  },
  {
    // 准入审核通过 → 创建合作关系 的演示服务商（尚无合作关系，见服务商准入 VA-002）
    id: "org-provider-yuanshan",
    name: "远山康达推广有限公司",
    type: "provider",
  },
  {
    id: "org-group-3",
    name: "工作组三",
    type: "group",
    parentId: "org-provider-east",
  },
  {
    // 东方恒业工作组一：尚未指定组长 → 「待指定组长」下派拦截演示
    id: "org-group-east-1",
    name: "工作组一",
    type: "group",
    parentId: "org-provider-east",
  },
  {
    // 东方恒业工作组二：尚未指定组长 → 「待指定组长」下派拦截演示
    id: "org-group-east-2",
    name: "工作组二",
    type: "group",
    parentId: "org-provider-east",
  },
  {
    id: "org-group-1",
    name: "工作组一",
    type: "group",
    parentId: "org-provider-smart",
  },
  {
    // 空组演示：尚未指定组长 → 「待指定组长」，不得接收新的管理任务
    id: "org-group-2",
    name: "工作组二",
    type: "group",
    parentId: "org-provider-smart",
  },
]

function nearestAncestorOfType(
  orgs: PermOrg[],
  orgId: string,
  type: PermOrg["type"],
): PermOrg | undefined {
  let current = orgs.find((o) => o.id === orgId)
  const guard = new Set<string>()
  while (current && !guard.has(current.id)) {
    guard.add(current.id)
    if (current.type === type) return current
    current = current.parentId
      ? orgs.find((o) => o.id === current!.parentId)
      : undefined
  }
  return undefined
}

export function resolveGrantAnchor(
  orgs: PermOrg[],
  userOrgId: string,
  role: SysRole,
): { scopeOrgId: string; scopeOrgName: string; scope: ScopeType } {
  const scope = role.defaultScope
  const current = orgs.find((o) => o.id === userOrgId)
  let hit: PermOrg | undefined
  if (scope === "PHARMA") {
    hit = nearestAncestorOfType(orgs, userOrgId, "pharma")
  } else if (scope === "PROVIDER") {
    hit = nearestAncestorOfType(orgs, userOrgId, "provider")
  } else if (scope === "GROUP" || scope === "SELF" || scope === "MOBILE") {
    hit = nearestAncestorOfType(orgs, userOrgId, "group")
  } else {
    hit = current
  }
  const org = hit ?? current
  return {
    scopeOrgId: org?.id ?? userOrgId,
    scopeOrgName: org?.name ?? "",
    scope,
  }
}

export const PERM_USERS: PermUser[] = [
  {
    // 软件服务方工作人员：不属于任何企业租户，软件服务方唯一预置角色=贝医系统管理员
    id: "u-wangmin",
    name: "王敏",
    account: "wangmin",
    phone: "13901350101",
    email: "wangmin@baiyee.com",
    orgId: "org-dept-platform-ops",
    orgName: "系统服务部",
    accountStatus: "enabled",
    createdAt: "2026-01-01 09:00",
    lastLoginAt: "2026-09-01 08:42",
  },
  {
    id: "u-lihang",
    name: "李航",
    account: "lihang",
    phone: "13901350102",
    email: "lihang@baiyee.com",
    orgId: "org-dept-northwest",
    orgName: "西北大区",
    accountStatus: "enabled",
    createdAt: "2026-02-18 10:20",
    lastLoginAt: "2026-09-02 17:05",
  },
  {
    id: "u-zhaoning",
    name: "赵宁",
    account: "zhaoning",
    phone: "13901350103",
    email: "zhaoning@baiyee.com",
    orgId: "org-dept-compliance",
    orgName: "合规部",
    accountStatus: "enabled",
    createdAt: "2026-02-20 14:00",
    lastLoginAt: "2026-09-01 09:15",
  },
  {
    id: "u-chenwei",
    name: "陈伟",
    account: "chenwei",
    phone: "13809120104",
    email: "chenwei@eastpromo.cn",
    orgId: "org-provider-east",
    orgName: "东方恒业推广有限公司",
    accountStatus: "enabled",
    createdAt: "2026-04-10 09:30",
    lastLoginAt: "2026-09-02 10:40",
  },
  {
    id: "u-liuyang",
    name: "刘洋",
    account: "liuyang",
    phone: "13809120105",
    email: "liuyang@smartlink.cn",
    orgId: "org-group-1",
    orgName: "工作组一",
    accountStatus: "enabled",
    createdAt: "2026-05-06 15:10",
    lastLoginAt: "2026-09-02 08:55",
  },
  {
    id: "u-yangming",
    name: "杨明",
    account: "yangming",
    phone: "13809120106",
    email: "yangming@eastpromo.cn",
    orgId: "org-group-3",
    orgName: "工作组三",
    accountStatus: "enabled",
    createdAt: "2026-05-28 11:00",
    lastLoginAt: "2026-09-01 19:22",
  },
  {
    id: "u-huangfeng",
    name: "黄峰",
    account: "huangfeng",
    phone: "13809120107",
    email: "huangfeng@eastpromo.cn",
    orgId: "org-group-3",
    orgName: "工作组三",
    accountStatus: "enabled",
    createdAt: "2026-05-28 11:02",
    lastLoginAt: "2026-08-30 09:10",
  },
  {
    id: "u-wuchao",
    name: "吴超",
    account: "wuchao",
    phone: "13809120108",
    email: "wuchao@eastpromo.cn",
    orgId: "org-group-3",
    orgName: "工作组三",
    accountStatus: "disabled",
    createdAt: "2026-05-28 11:05",
    lastLoginAt: "2026-08-01 16:48",
  },
  {
    id: "u-sunli",
    name: "孙丽",
    account: "sunli",
    phone: "13809120109",
    email: "sunli@eastpromo.cn",
    orgId: "org-provider-east",
    orgName: "东方恒业推广有限公司",
    accountStatus: "enabled",
    createdAt: "2026-07-14 10:00",
    lastLoginAt: "2026-08-19 09:40",
  },
  {
    id: "u-lichen",
    name: "李晨",
    account: "lichen",
    phone: "13702910110",
    email: "lichen@smartlink.cn",
    orgId: "org-provider-smart",
    orgName: "智联科技有限公司",
    accountStatus: "enabled",
    createdAt: "2026-07-30 13:30",
    lastLoginAt: "2026-09-02 14:20",
  },
  {
    id: "u-zhoukai",
    name: "周凯",
    account: "zhoukai",
    phone: "13901350111",
    email: "zhoukai@baiyee.com",
    orgId: "org-dept-shaanxi",
    orgName: "陕西办事处",
    accountStatus: "enabled",
    createdAt: "2026-03-12 09:45",
    lastLoginAt: "2026-08-31 18:02",
  },
  {
    // 药厂企业管理员演示账号：本药厂组织/用户/角色/授权与数据范围管理
    id: "u-shenyue",
    name: "沈悦",
    account: "shenyue",
    phone: "13901350121",
    email: "shenyue@baiyee.com",
    orgId: "org-dept-it",
    orgName: "信息技术部",
    accountStatus: "enabled",
    createdAt: "2026-04-01 09:00",
    lastLoginAt: "2026-09-14 15:20",
  },
  {
    // 多租户整改批次①演示：服务商侧待激活新成员（首次短信登录自动激活）
    id: "u-hejing",
    name: "何静",
    account: "hejing",
    phone: "13809120113",
    email: "hejing@eastpromo.cn",
    orgId: "org-group-3",
    orgName: "工作组三",
    accountStatus: "enabled",
    createdAt: "2026-09-10 09:00",
  },
  {
    // 多租户整改批次①演示：企业级冻结（东方恒业冻结、百益身份不受影响）
    id: "u-hanlei",
    name: "韩磊",
    account: "hanlei",
    phone: "13809120114",
    email: "hanlei@eastpromo.cn",
    orgId: "org-provider-east",
    orgName: "东方恒业推广有限公司",
    accountStatus: "enabled",
    createdAt: "2026-05-12 10:30",
    lastLoginAt: "2026-09-05 16:20",
  },
  {
    // 多租户整改批次①演示：名下服务药厂全部不可用的服务专员（门页空态）
    id: "u-sunqi",
    name: "孙琪",
    account: "sunqi",
    phone: "13809120115",
    email: "sunqi@eastpromo.cn",
    orgId: "org-group-3",
    orgName: "工作组三",
    accountStatus: "enabled",
    createdAt: "2026-09-08 14:00",
  },
]

/**
 * 系统角色绑定（软件服务方权限域；独立于租户授权）。软件服务方人员不是任何企业的租户成员。
 */
export const PLATFORM_BINDINGS: PlatformRoleBinding[] = [
  {
    id: "pb-01",
    userId: "u-wangmin",
    platformRoleId: "role-sys-admin",
    dutyScope: "系统管理：租户开通与企业码、菜单管理、合作关系监管、系统审计",
    effectiveFrom: "2026-01-01",
    grantedBy: "系统预置",
    grantedAt: "2026-01-01 09:00",
    status: "active",
  },
]

/**
 * 企业成员身份（TenantMembership）：自然人 × 租户。同一手机号可在多个企业
 * 持有不同成员身份、组织归属与权限（陈伟/韩磊为双企业演示）。
 * 软件服务方工作人员无租户成员身份；软件服务方侧运行时建租户的成员在登录链路按用户归属
 * 派生（见 cooperationModel.membershipsOfUser）。
 */
export const TENANT_MEMBERSHIPS: TenantMembership[] = [
  { id: "mb-01", userId: "u-lihang", tenantId: "org-pharma", tenantName: "百益制药", orgUnitId: "org-dept-northwest", status: "active", joinedAt: "2026-03-01" },
  { id: "mb-02", userId: "u-zhaoning", tenantId: "org-pharma", tenantName: "百益制药", orgUnitId: "org-dept-compliance", status: "active", joinedAt: "2026-03-01" },
  { id: "mb-03", userId: "u-zhoukai", tenantId: "org-pharma", tenantName: "百益制药", orgUnitId: "org-dept-shaanxi", status: "active", joinedAt: "2026-03-12" },
  { id: "mb-04", userId: "u-shenyue", tenantId: "org-pharma", tenantName: "百益制药", orgUnitId: "org-dept-it", status: "active", joinedAt: "2026-04-01" },
  { id: "mb-05", userId: "u-chenwei", tenantId: "org-provider-east", tenantName: "东方恒业推广有限公司", orgUnitId: "org-provider-east", status: "active", joinedAt: "2026-04-12" },
  { id: "mb-06", userId: "u-chenwei", tenantId: "org-pharma", tenantName: "百益制药", orgUnitId: "org-dept-compliance", status: "active", joinedAt: "2026-06-01" },
  { id: "mb-07", userId: "u-liuyang", tenantId: "org-provider-smart", tenantName: "智联科技有限公司", orgUnitId: "org-group-1", status: "active", joinedAt: "2026-05-08" },
  { id: "mb-08", userId: "u-yangming", tenantId: "org-provider-east", tenantName: "东方恒业推广有限公司", orgUnitId: "org-group-3", status: "active", joinedAt: "2026-06-01" },
  { id: "mb-09", userId: "u-huangfeng", tenantId: "org-provider-east", tenantName: "东方恒业推广有限公司", orgUnitId: "org-group-3", status: "active", joinedAt: "2026-06-01" },
  { id: "mb-10", userId: "u-wuchao", tenantId: "org-provider-east", tenantName: "东方恒业推广有限公司", orgUnitId: "org-group-3", status: "active", joinedAt: "2026-05-28" },
  { id: "mb-11", userId: "u-sunli", tenantId: "org-provider-east", tenantName: "东方恒业推广有限公司", orgUnitId: "org-provider-east", status: "active", joinedAt: "2026-07-14" },
  { id: "mb-12", userId: "u-lichen", tenantId: "org-provider-smart", tenantName: "智联科技有限公司", orgUnitId: "org-provider-smart", status: "active", joinedAt: "2026-07-30" },
  { id: "mb-13", userId: "u-hejing", tenantId: "org-provider-east", tenantName: "东方恒业推广有限公司", orgUnitId: "org-group-3", status: "pending_activation", joinedAt: "2026-09-10" },
  { id: "mb-14", userId: "u-hanlei", tenantId: "org-provider-east", tenantName: "东方恒业推广有限公司", orgUnitId: "org-provider-east", status: "frozen", joinedAt: "2026-05-12" },
  { id: "mb-15", userId: "u-hanlei", tenantId: "org-pharma", tenantName: "百益制药", orgUnitId: "org-dept-northwest", status: "active", joinedAt: "2026-06-15" },
  { id: "mb-16", userId: "u-sunqi", tenantId: "org-provider-east", tenantName: "东方恒业推广有限公司", orgUnitId: "org-group-3", status: "active", joinedAt: "2026-09-08" },
  // 双服务商演示：李晨同属智联（mb-12）与东方恒业——两边的角色、药厂范围互不串台
  { id: "mb-17", userId: "u-lichen", tenantId: "org-provider-east", tenantName: "东方恒业推广有限公司", orgUnitId: "org-group-3", status: "active", joinedAt: "2026-09-12" },
]

/**
 * 租户企业内的角色授权（UserRoleAssignment）。tenantId 为稳定租户边界；
 * 服务商侧的「可处理药厂」唯一数据源 = pharmaTenantIds（由药厂授予服务商的
 * 合作与业务授权限定上限，员工范围只能收窄，见「角色与数据范围 · 已授权成员」页签）。
 */
export const seedAssignments: RoleAssignment[] = [
  {
    id: "g-03",
    tenantId: "org-pharma",
    userId: "u-lihang",
    roleId: "role-pharma-admin",
    scopeOrgId: "org-pharma",
    scopeOrgName: "百益制药",
    scope: "PHARMA",
    effectiveFrom: "2026-03-01",
    grantedBy: "沈悦",
    grantedAt: "2026-03-01 10:12",
    status: "active",
  },
  {
    id: "g-04",
    tenantId: "org-pharma",
    userId: "u-zhaoning",
    roleId: "role-pharma-admin",
    scopeOrgId: "org-pharma",
    scopeOrgName: "百益制药",
    scope: "PHARMA",
    effectiveFrom: "2026-03-01",
    grantedBy: "沈悦",
    grantedAt: "2026-03-01 10:18",
    status: "active",
  },
  {
    id: "g-04b",
    tenantId: "org-pharma",
    userId: "u-shenyue",
    roleId: "role-pharma-admin",
    scopeOrgId: "org-pharma",
    scopeOrgName: "百益制药",
    scope: "PHARMA",
    effectiveFrom: "2026-04-01",
    grantedBy: "系统预置",
    grantedAt: "2026-04-01 09:00",
    status: "active",
    reason: "租户创建 · 首位企业管理员预置授权",
  },
  {
    id: "g-05",
    tenantId: "org-provider-east",
    userId: "u-chenwei",
    roleId: "role-provider-admin",
    scopeOrgId: "org-provider-east",
    scopeOrgName: "东方恒业推广有限公司",
    scope: "PROVIDER",
    effectiveFrom: "2026-04-12",
    grantedBy: "沈悦",
    grantedAt: "2026-04-12 14:22",
    status: "active",
  },
  {
    // 多租户演示：陈伟同时持有百益制药的企业管理员授权（独立成员身份 mb-06），
    // 登录时按认证企业只出本企业身份，双企业换企业编码演示
    id: "g-05b",
    tenantId: "org-pharma",
    userId: "u-chenwei",
    roleId: "role-pharma-admin",
    scopeOrgId: "org-pharma",
    scopeOrgName: "百益制药",
    scope: "PHARMA",
    effectiveFrom: "2026-06-01",
    grantedBy: "沈悦",
    grantedAt: "2026-06-01 09:30",
    status: "active",
  },
  {
    id: "g-06",
    tenantId: "org-provider-smart",
    userId: "u-liuyang",
    roleId: "role-group-lead",
    scopeOrgId: "org-group-1",
    scopeOrgName: "工作组一",
    scope: "GROUP",
    pharmaTenantIds: ["org-pharma"],
    effectiveFrom: "2026-05-08",
    grantedBy: "陈伟",
    grantedAt: "2026-05-08 09:30",
    status: "active",
  },
  {
    // 杨明：可处理百益/华康/康宁/泽康——药厂侧合作暂停与业务授权撤销会实时
    // 反映为不可进入（员工范围不扩大原则的演示样本）
    id: "g-07",
    tenantId: "org-provider-east",
    userId: "u-yangming",
    roleId: "role-specialist",
    scopeOrgId: "org-group-3",
    scopeOrgName: "工作组三",
    scope: "SELF",
    pharmaTenantIds: ["org-pharma", "org-pharma-huakang", "org-pharma-kangning", "org-pharma-zekang"],
    regionCodes: ["陕西省", "甘肃省"],
    projectNames: ["百益陕西推广项目", "华康甘肃试点项目"],
    effectiveFrom: "2026-06-01",
    grantedBy: "陈伟",
    grantedAt: "2026-06-01 11:05",
    status: "active",
  },
  {
    // 黄峰：仅百益一家 → 登录单药厂直达
    id: "g-08",
    tenantId: "org-provider-east",
    userId: "u-huangfeng",
    roleId: "role-specialist",
    scopeOrgId: "org-group-3",
    scopeOrgName: "工作组三",
    scope: "SELF",
    pharmaTenantIds: ["org-pharma"],
    regionCodes: ["陕西省"],
    effectiveFrom: "2026-06-01",
    grantedBy: "陈伟",
    grantedAt: "2026-06-01 11:06",
    status: "active",
  },
  {
    id: "g-09",
    tenantId: "org-provider-east",
    userId: "u-wuchao",
    roleId: "role-specialist",
    scopeOrgId: "org-group-3",
    scopeOrgName: "工作组三",
    scope: "SELF",
    pharmaTenantIds: ["org-pharma"],
    effectiveFrom: "2026-06-01",
    effectiveTo: "2026-08-01",
    grantedBy: "陈伟",
    grantedAt: "2026-06-01 11:07",
    status: "expired",
  },
  {
    id: "g-10",
    tenantId: "org-provider-east",
    userId: "u-sunli",
    roleId: "role-specialist",
    scopeOrgId: "org-provider-east",
    scopeOrgName: "东方恒业推广有限公司",
    scope: "SELF",
    pharmaTenantIds: ["org-pharma"],
    effectiveFrom: "2026-07-15",
    grantedBy: "陈伟",
    grantedAt: "2026-07-15 16:40",
    status: "revoked",
    reason: "人员停用回收",
    revokedBy: "陈伟",
    revokedAt: "2026-08-19 09:50",
  },
  {
    id: "g-11",
    tenantId: "org-pharma",
    userId: "u-lihang",
    roleId: "role-custom-region-sales",
    scopeOrgId: "org-dept-northwest",
    scopeOrgName: "西北大区",
    scope: "DEPT_AND_CHILD",
    effectiveFrom: "2026-08-24",
    grantedBy: "沈悦",
    grantedAt: "2026-08-24 15:20",
    status: "active",
    reason: "区域销售授权 · 西北大区",
  },
  {
    id: "g-12",
    tenantId: "org-provider-smart",
    userId: "u-lichen",
    roleId: "role-specialist",
    scopeOrgId: "org-provider-smart",
    scopeOrgName: "智联科技有限公司",
    scope: "SELF",
    pharmaTenantIds: ["org-pharma"],
    regionCodes: ["江苏省"],
    effectiveFrom: "2026-08-01",
    effectiveTo: "2026-09-30",
    grantedBy: "李晨",
    grantedAt: "2026-08-01 10:00",
    status: "active",
    reason: "临时支援 · 服务商专员",
  },
  {
    // 待激活新成员（东方恒业）的生效授权
    id: "g-14",
    tenantId: "org-provider-east",
    userId: "u-hejing",
    roleId: "role-group-lead",
    scopeOrgId: "org-group-3",
    scopeOrgName: "工作组三",
    scope: "GROUP",
    pharmaTenantIds: ["org-pharma", "org-pharma-huakang"],
    effectiveFrom: "2026-09-10",
    grantedBy: "陈伟",
    grantedAt: "2026-09-10 09:20",
    status: "active",
  },
  {
    // 韩磊双企业身份：东方恒业服务商管理员（该成员身份被冻结，见 mb-14/AUTH_PROFILES）
    id: "g-15",
    tenantId: "org-provider-east",
    userId: "u-hanlei",
    roleId: "role-provider-admin",
    scopeOrgId: "org-provider-east",
    scopeOrgName: "东方恒业推广有限公司",
    scope: "PROVIDER",
    effectiveFrom: "2026-05-12",
    grantedBy: "陈伟",
    grantedAt: "2026-05-12 10:40",
    status: "active",
  },
  {
    // 韩磊双企业身份：百益制药企业管理员（不受东方恒业冻结影响）
    id: "g-16",
    tenantId: "org-pharma",
    userId: "u-hanlei",
    roleId: "role-pharma-admin",
    scopeOrgId: "org-pharma",
    scopeOrgName: "百益制药",
    scope: "PHARMA",
    effectiveFrom: "2026-06-15",
    grantedBy: "沈悦",
    grantedAt: "2026-06-15 09:00",
    status: "active",
  },
  {
    // 李晨在东方恒业的名下药厂：仅华康（生效）；百益为 future 授权（2026-12-01 起，不提前生效）
    id: "g-18",
    tenantId: "org-provider-east",
    userId: "u-lichen",
    roleId: "role-specialist",
    scopeOrgId: "org-group-3",
    scopeOrgName: "工作组三",
    scope: "SELF",
    pharmaTenantIds: ["org-pharma-huakang"],
    regionCodes: ["甘肃省"],
    effectiveFrom: "2026-09-12",
    grantedBy: "陈伟",
    grantedAt: "2026-09-12 10:30",
    status: "active",
    reason: "东方恒业甘肃试点支援",
  },
  {
    // future 授权演示：生效日在未来 → 门页不得提前出现百益
    id: "g-19",
    tenantId: "org-provider-east",
    userId: "u-lichen",
    roleId: "role-specialist",
    scopeOrgId: "org-group-3",
    scopeOrgName: "工作组三",
    scope: "SELF",
    pharmaTenantIds: ["org-pharma"],
    regionCodes: ["陕西省"],
    effectiveFrom: "2026-12-01",
    grantedBy: "陈伟",
    grantedAt: "2026-09-12 10:32",
    status: "active",
    reason: "冬季 campaign 预授权（2026-12-01 生效）",
  },
  {
    // 孙琪：被授予的康宁（合作暂停）与泽康（业务授权已撤销）均不可进入 → 门页空态
    id: "g-17",
    tenantId: "org-provider-east",
    userId: "u-sunqi",
    roleId: "role-specialist",
    scopeOrgId: "org-group-3",
    scopeOrgName: "工作组三",
    scope: "SELF",
    pharmaTenantIds: ["org-pharma-kangning", "org-pharma-zekang"],
    effectiveFrom: "2026-09-08",
    grantedBy: "陈伟",
    grantedAt: "2026-09-08 14:10",
    status: "active",
  },
]

export const seedChangeLogs: RoleChangeLog[] = [
  {
    id: "cl-01",
    roleId: "role-pharma-admin",
    time: "2026-08-20 16:08",
    actor: "李航",
    action: "发布权限",
    summary: "为结算明细增加导出",
    beforeSummary: "结算明细：查看、审核",
    afterSummary: "结算明细：查看、审核、导出",
    version: 3,
  },
  {
    id: "cl-02",
    roleId: "role-custom-region-sales",
    time: "2026-08-24 15:06",
    actor: "李航",
    action: "复制角色",
    summary: "从企业管理员复制，数据范围改为本部门及以下",
    afterSummary: "数据范围=本部门及以下",
    version: 1,
  },
  {
    id: "cl-03",
    roleId: "role-custom-region-sales",
    time: "2026-08-24 15:20",
    actor: "王敏",
    action: "授权用户",
    summary: "授权李航 · 组织=西北大区 · 本部门及以下",
    version: 2,
  },
  {
    id: "cl-04",
    roleId: "role-custom-settle-review",
    time: "2026-08-25 09:18",
    actor: "李航",
    action: "新建角色",
    summary: "创建草稿角色「结算复核专员」",
    version: 1,
  },
  {
    id: "cl-05",
    roleId: "role-pharma-admin",
    time: "2026-08-18 09:40",
    actor: "赵宁",
    action: "字段策略",
    summary: "精确结算金额改为脱敏",
    beforeSummary: "可见",
    afterSummary: "脱敏",
    version: 3,
  },
]

export const seedPermAudit: PermAuditEvent[] = [
  {
    id: "PE00080",
    time: "2026-08-26 09:12",
    actor: "李航",
    actorRole: "企业管理员",
    org: "百益制药",
    target: "结算复核专员",
    roleName: "结算复核专员",
    module: "角色管理",
    action: "新建角色",
    resource: "roles.create",
    decision: "允许",
    reason: "创建草稿",
    afterSummary: "草稿 / 本药厂",
    requestId: "req-8260912",
    ip: "10.2.18.41",
    result: "成功",
  },
  {
    id: "PE00079",
    time: "2026-08-25 18:04",
    actor: "陈伟",
    actorRole: "服务商管理员",
    org: "东方恒业推广有限公司",
    target: "预算计划",
    roleName: "服务商管理员",
    module: "预算计划",
    action: "越权访问",
    resource: "budget-plan.view",
    decision: "拒绝",
    reason: "当前角色无页面查看权限",
    requestId: "req-8251804",
    ip: "10.8.3.19",
    result: "失败",
  },
  {
    id: "PE00078",
    time: "2026-08-25 16:22",
    actor: "王敏",
    actorRole: "贝医系统管理员",
    org: "贝医信息科技",
    target: "李航 × 药厂区域销售经理",
    roleName: "药厂区域销售经理",
    module: "用户授权",
    action: "用户授权",
    resource: "user-grants.create",
    decision: "允许",
    reason: "区域销售授权 · 西北大区",
    afterSummary: "有效 / 西北大区 · 本部门及以下",
    requestId: "req-8251622",
    ip: "10.2.18.41",
    result: "成功",
  },
  {
    id: "PE00077",
    time: "2026-08-24 15:06",
    actor: "李航",
    actorRole: "企业管理员",
    org: "百益制药",
    target: "药厂区域销售经理",
    roleName: "企业管理员",
    module: "角色管理",
    action: "复制角色",
    resource: "roles.create",
    decision: "允许",
    reason: "从预置角色复制",
    beforeSummary: "企业管理员",
    afterSummary: "定制 / 本部门及以下",
    requestId: "req-8241506",
    ip: "10.4.21.8",
    result: "成功",
  },
  {
    id: "PE00076",
    time: "2026-08-24 11:40",
    actor: "赵宁",
    actorRole: "企业管理员",
    org: "百益制药",
    target: "证据链复审导出",
    roleName: "企业管理员",
    module: "证据链复审",
    action: "导出",
    resource: "evidence-chain.export",
    decision: "允许",
    reason: "抽检底稿导出",
    requestId: "req-8241140",
    ip: "10.4.21.33",
    result: "成功",
  },
  {
    id: "PE00075",
    time: "2026-08-23 14:18",
    actor: "杨明",
    actorRole: "服务专员",
    org: "工作组三",
    target: "结算明细",
    roleName: "服务专员",
    module: "结算明细",
    action: "越权访问",
    resource: "settlement.approve",
    decision: "拒绝",
    reason: "无审核/确认权限",
    requestId: "req-8231418",
    ip: "10.9.12.7",
    result: "失败",
  },
  {
    id: "PE00074",
    time: "2026-08-22 10:05",
    actor: "王敏",
    actorRole: "贝医系统管理员",
    org: "贝医信息科技",
    target: "角色预览 / 服务专员",
    roleName: "服务专员",
    module: "角色预览",
    action: "角色预览",
    resource: "role-preview.view",
    decision: "允许",
    reason: "验收服务专员菜单",
    requestId: "req-8221005",
    ip: "10.2.18.41",
    result: "成功",
  },
  {
    id: "PE00073",
    time: "2026-08-20 16:08",
    actor: "李航",
    actorRole: "企业管理员",
    org: "百益制药",
    target: "企业管理员",
    roleName: "企业管理员",
    module: "角色管理",
    action: "编辑角色",
    resource: "roles.edit",
    decision: "允许",
    reason: "发布权限 v3",
    beforeSummary: "结算无导出",
    afterSummary: "结算含导出",
    requestId: "req-8201608",
    ip: "10.4.21.8",
    result: "成功",
  },
  {
    id: "PE00072",
    time: "2026-08-19 09:50",
    actor: "陈伟",
    actorRole: "服务商管理员",
    org: "东方恒业推广有限公司",
    target: "孙丽 × 服务专员",
    roleName: "服务专员",
    module: "用户授权",
    action: "回收授权",
    resource: "user-grants.delete",
    decision: "允许",
    reason: "人员停用回收",
    beforeSummary: "有效",
    afterSummary: "已回收",
    requestId: "req-8190950",
    ip: "10.8.3.19",
    result: "成功",
  },
  {
    id: "PE00071",
    time: "2026-08-18 09:40",
    actor: "赵宁",
    actorRole: "企业管理员",
    org: "百益制药",
    target: "企业管理员（合规） / 精确结算金额",
    roleName: "企业管理员",
    module: "角色管理",
    action: "字段策略",
    resource: "roles.edit",
    decision: "允许",
    reason: "业绩字段脱敏",
    beforeSummary: "可见",
    afterSummary: "脱敏",
    requestId: "req-8180940",
    ip: "10.4.21.33",
    result: "成功",
  },
]

/**
 * 真实授权角色（SysRole）→ 旧三类页面视角（Role）的兼容映射。
 * 菜单显示与路由拦截已统一按「权限域 + 功能权限（pagePerms）」判定，
 * 不再使用本映射；此映射仅服务于尚未迁移的页面内「视角分支」
 * （如任务执行按销售/服务商渲染不同操作），属过渡层。
 * 系统角色没有业务视角：仅为工作台兼容渲染给中性值，不代表业务操作权。
 */
export const PERSPECTIVE_BY_ROLE_ID: Record<string, Role> = {
  "role-custom-region-sales": "药厂销售部门",
  "role-pharma-admin": "药厂销售部门",
  "role-provider-admin": "服务提供商",
  "role-group-lead": "服务提供商",
  "role-specialist": "服务提供商",
}

/**
 * 运行期新建的定制角色按数据范围与页面能力推导视角（无登记时兜底）。
 * 系统角色没有业务视角：返回 null。系统管理后台页面一律以 realm + platformRoleId 判断，
 * 旧视角兼容逻辑只允许在 TENANT 域的业务页面内使用。
 */
export function perspectiveRoleOf(role: SysRole): Role | null {
  if (role.realm === "PLATFORM") return null
  const mapped = PERSPECTIVE_BY_ROLE_ID[role.id]
  if (mapped) return mapped
  if (role.defaultScope === "PROVIDER" || role.defaultScope === "GROUP" || role.defaultScope === "SELF" || role.defaultScope === "MOBILE")
    return "服务提供商"
  if (pageHasAction(role, "vendor-access", "approve") || role.name.includes("合规"))
    return "药厂合规部门"
  return "药厂销售部门"
}

/** 按权限域过滤角色（系统角色与租户角色永不混列） */
export function rolesOfRealm(roles: SysRole[], realm: AccessRealm): SysRole[] {
  return roles.filter((r) => r.realm === realm)
}

/**
 * 租户可见角色（自定义角色租户隔离）：预置角色（无 tenantId，按租户类型复用）
 * + 本租户创建的自定义角色。服务商 A 的自定义角色对服务商 B 与药厂租户不可见。
 */
export function rolesOfTenant(
  roles: SysRole[],
  realm: AccessRealm,
  tenantId: string | null,
): SysRole[] {
  return roles.filter(
    (r) => r.realm === realm && (r.tenantId == null || (tenantId != null && r.tenantId === tenantId)),
  )
}

/** 可授予某租户类型的角色（系统角色不出现在企业授权可选列表） */
export function tenantRolesForKind(roles: SysRole[], kind: TenantKind): SysRole[] {
  return roles.filter((r) => r.realm === "TENANT" && (!r.appliesTo || r.appliesTo.includes(kind)))
}

/** 企业租户根节点（药厂/服务商；软件服务方不是租户） */
export function tenantRoots(orgs: PermOrg[]): PermOrg[] {
  return orgs.filter((o) => o.type === "pharma" || o.type === "provider")
}

export function tenantKindOfRoot(org: PermOrg | undefined): TenantKind | null {
  if (!org) return null
  if (org.type === "pharma") return "pharma"
  if (org.type === "provider") return "provider"
  return null
}

export const VARIETY_OPTIONS = [
  "阿托伐他汀钙片",
  "氨氯地平片",
  "奥美拉唑肠溶胶囊",
]
export const REGION_SCOPE_OPTIONS = REGION_OPTIONS.slice(0, 12)

export function grantStatusLabel(status: GrantStatus): string {
  return {
    active: "生效",
    expired: "已过期",
    revoked: "已回收",
    pending_review: "待复核",
  }[status]
}

export function roleStatusLabel(status: SysRoleStatus): string {
  return { enabled: "启用", disabled: "停用", draft: "草稿" }[status]
}

export function fieldPolicyLabel(policy: FieldPolicyKind): string {
  return { visible: "可见", mask: "脱敏", hidden: "隐藏" }[policy]
}

export function countGrantedUsers(
  roleId: string,
  assignments: RoleAssignment[],
): number {
  return new Set(
    assignments
      .filter((a) => a.roleId === roleId && a.status === "active")
      .map((a) => a.userId),
  ).size
}

/** 含高危操作的角色按高危角色处理（授权需理由、走待复核） */
export function isHighRiskRole(role: SysRole): boolean {
  return RESOURCE_PAGES.some((p) =>
    (role.pagePerms[p.id] ?? []).some((key) =>
      p.actions.some((a) => a.key === key && a.risk),
    ),
  )
}

export function pageHasAction(
  role: SysRole,
  pageId: string,
  action: PageAction,
): boolean {
  const list = role.pagePerms[pageId] ?? []
  if (action === "view") return list.includes("view") || list.length > 0
  return list.includes("view") && list.includes(action)
}

export function visiblePageIds(role: SysRole): string[] {
  return Object.entries(role.pagePerms)
    .filter(([, actions]) => actions.includes("view") || actions.length > 0)
    .map(([id]) => id)
}

export function summarizePerms(role: SysRole): string {
  const pages = visiblePageIds(role).length
  const writes = Object.values(role.pagePerms)
    .flat()
    .filter((a) => a !== "view").length
  return `${pages} 个页面 · ${writes} 项操作 · ${scopeLabel(role.defaultScope)}`
}

export function applyActionToggle(
  pagePerms: Record<string, PageAction[]>,
  page: ResourcePage,
  action: PageAction,
  checked: boolean,
): Record<string, PageAction[]> {
  const next = { ...pagePerms }
  const current = new Set(next[page.id] ?? [])
  if (action === "view" && !checked) {
    delete next[page.id]
    return next
  }
  if (checked) {
    current.add("view")
    current.add(action)
  } else {
    current.delete(action)
    if (action === "view") current.clear()
  }
  if (current.size === 0) delete next[page.id]
  else
    next[page.id] = page.actions.map((a) => a.key).filter((k) => current.has(k))
  return next
}

export function hasHighRiskGrant(
  prev: Record<string, PageAction[]>,
  next: Record<string, PageAction[]>,
): boolean {
  const riskKeys = new Set(
    RESOURCE_PAGES.flatMap((p) =>
      p.actions.filter((a) => a.risk).map((a) => `${p.id}.${a.key}`),
    ),
  )
  for (const [pageId, actions] of Object.entries(next)) {
    for (const action of actions) {
      const key = `${pageId}.${action}`
      if (!riskKeys.has(key)) continue
      if (!(prev[pageId] ?? []).includes(action)) return true
    }
  }
  return false
}

export const ORG_TYPE_LABEL: Record<PermOrg["type"], string> = {
  platform: "软件服务方",
  pharma: "药厂",
  provider: "服务商",
  group: "工作组",
  department: "部门",
}

/** 工作组组长的指定记录（工作组管理页维护；有效性实时派生，不静态存储） */
export interface GroupLeaderRecord {
  userId: string
  appointedAt: string
  appointedBy: string
  reason?: string
}

/** 组长变更审计行（工作组管理页「变更记录」展示） */
export interface GroupLeaderChange {
  id: string
  groupId: string
  groupName: string
  at: string
  actor: string
  summary: string
}

/** 组长种子（组织节点 id → 指定记录）；工作组二故意不设组长（待指定演示） */
export const SEED_GROUP_LEADERS: Record<string, GroupLeaderRecord> = {
  "org-group-1": { userId: "u-liuyang", appointedAt: "2026-05-08 09:35", appointedBy: "陈伟", reason: "组建工作组时指定" },
  "org-group-3": { userId: "u-hejing", appointedAt: "2026-09-10 09:25", appointedBy: "陈伟", reason: "新任组长" },
}

export const SEED_GROUP_LEADER_CHANGES: GroupLeaderChange[] = [
  { id: "glc-01", groupId: "org-group-1", groupName: "工作组一", at: "2026-05-08 09:35", actor: "陈伟", summary: "指定 刘洋 为工作组组长（工作组组长 · 工作组一）" },
  { id: "glc-02", groupId: "org-group-3", groupName: "工作组三", at: "2026-09-10 09:25", actor: "陈伟", summary: "指定 何静 为工作组组长（新任组长）" },
]

export type GroupLeaderResolution =
  | { status: "valid"; userId: string; userName: string }
  | { status: "none" }
  | { status: "invalid"; userId: string; userName: string; reason: string }

/**
 * 工作组组长有效性（2026-09-15 拍板）：组长必须同时满足
 * ① 属于该工作组（成员身份 orgUnit = 本组）② 账号启用 ③ 拥有生效的「工作组组长」角色。
 * 任一不满足 → 该组「待指定组长」，不得接收新的管理任务；历史任务与审计保留。
 */
export function resolveGroupLeader(
  groupId: string,
  appointed: GroupLeaderRecord | undefined,
  ctx: {
    users: PermUser[]
    assignments: RoleAssignment[]
    memberships: TenantMembership[]
    tenantId: string
  },
): GroupLeaderResolution {
  if (!appointed) return { status: "none" }
  const user = ctx.users.find((u) => u.id === appointed.userId)
  if (!user) return { status: "invalid", userId: appointed.userId, userName: appointed.userId, reason: "组长账号不存在" }
  if (user.accountStatus !== "enabled") return { status: "invalid", userId: user.id, userName: user.name, reason: "组长账号已停用" }
  const membership = ctx.memberships.find(
    (m) => m.userId === user.id && m.tenantId === ctx.tenantId && m.status !== "frozen",
  )
  if (!membership || membership.orgUnitId !== groupId) {
    return { status: "invalid", userId: user.id, userName: user.name, reason: "组长已调离本工作组" }
  }
  const today = new Date().toISOString().slice(0, 10)
  const hasRole = ctx.assignments.some(
    (a) =>
      a.userId === user.id &&
      a.tenantId === ctx.tenantId &&
      a.roleId === "role-group-lead" &&
      a.status === "active" &&
      a.effectiveFrom <= today &&
      (!a.effectiveTo || a.effectiveTo >= today),
  )
  if (!hasRole) return { status: "invalid", userId: user.id, userName: user.name, reason: "组长角色已回收或失效" }
  return { status: "valid", userId: user.id, userName: user.name }
}

/**
 * 身份展示统一格式（2026-09-15 拍板）：`角色名称 · 所属部门或工作组`，
 * 例如「企业管理员 · 销售部」「工作组组长 · 西北推广一组」。
 * 中点是展示分隔符，不是角色名称的一部分；顶部身份区、用户详情、
 * 组织直属人员、任务承接人等所有身份位置统一使用。
 */
export function identityLabel(roleName: string, orgName?: string): string {
  return orgName && orgName.trim() ? `${roleName} · ${orgName.trim()}` : roleName
}

export function orgChildren(orgs: PermOrg[], parentId?: string): PermOrg[] {
  if (!parentId) return orgs.filter((o) => !o.parentId)
  return orgs.filter((o) => o.parentId === parentId)
}

export function orgDescendantIds(orgs: PermOrg[], orgId: string): string[] {
  const ids = [orgId]
  const walk = (id: string) => {
    for (const child of orgs.filter((o) => o.parentId === id)) {
      ids.push(child.id)
      walk(child.id)
    }
  }
  walk(orgId)
  return ids
}

export function orgPathLabel(orgs: PermOrg[], orgId: string): string {
  const parts: string[] = []
  let current = orgs.find((o) => o.id === orgId)
  const guard = new Set<string>()
  while (current && !guard.has(current.id)) {
    guard.add(current.id)
    parts.unshift(current.name)
    current = current.parentId
      ? orgs.find((o) => o.id === current!.parentId)
      : undefined
  }
  return parts.join(" / ")
}

export function usersInSubtree(
  users: PermUser[],
  orgs: PermOrg[],
  orgId: string,
): PermUser[] {
  const ids = new Set(orgDescendantIds(orgs, orgId))
  return users.filter((u) => ids.has(u.orgId))
}

export function isDeptParentType(type: PermOrg["type"]): boolean {
  return type === "pharma" || type === "department"
}

/** 节点直属人员（不含下级部门） */
export function directUsers(users: PermUser[], orgId: string): PermUser[] {
  return users.filter((u) => u.orgId === orgId)
}

/** 用户最近一次角色授予/回收时间（人员列表「最近授权」列） */
export function latestAssignmentAt(
  assignments: RoleAssignment[],
  userId: string,
): string | undefined {
  const mine = assignments.filter(
    (a) => a.userId === userId && (a.grantedAt || a.revokedAt),
  )
  if (mine.length === 0) return undefined
  return mine.reduce((latest, a) => {
    const t = a.revokedAt ?? a.grantedAt
    return t > latest ? t : latest
  }, mine[0].revokedAt ?? mine[0].grantedAt)
}

/** 向上找企业实体根节点（软件服务方/药厂/服务商），用于「同企业」规则 */
export function enterpriseRootOf(
  orgs: PermOrg[],
  orgId: string,
): PermOrg | undefined {
  let current = orgs.find((o) => o.id === orgId)
  const guard = new Set<string>()
  while (current && !guard.has(current.id)) {
    guard.add(current.id)
    if (current.type === "platform" || current.type === "pharma" || current.type === "provider") {
      return current
    }
    current = current.parentId
      ? orgs.find((o) => o.id === current!.parentId)
      : undefined
  }
  return undefined
}

/** 同一上级下是否已存在同名部门（新建/改名实时校验） */
export function sameLevelDeptNameExists(
  orgs: PermOrg[],
  parentId: string,
  name: string,
  excludeOrgId?: string,
): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  return orgs.some(
    (o) =>
      o.type === "department" &&
      o.parentId === parentId &&
      o.id !== excludeOrgId &&
      o.name.trim() === trimmed,
  )
}

export function validateDeptParent(
  orgs: PermOrg[],
  parentId: string,
  movingId?: string,
): { ok: boolean; error?: string } {
  const parent = orgs.find((o) => o.id === parentId)
  if (!parent) return { ok: false, error: "父节点不存在" }
  // 系统管理后台根也可挂部门（软件服务方内部组织）；服务商/工作组不挂部门（用工作组团队）
  const parentOk = isDeptParentType(parent.type) || parent.type === "platform"
  if (!parentOk) {
    return { ok: false, error: "部门只能挂在药厂、软件服务方或部门下，不能挂到服务商或工作组" }
  }
  if (movingId) {
    const moving = orgs.find((o) => o.id === movingId)
    if (!moving) return { ok: false, error: "部门不存在" }
    if (moving.type !== "department") {
      return { ok: false, error: "只能调整部门节点的名称和上级" }
    }
    if (parentId === movingId) return { ok: false, error: "不能把部门挂到自己下面" }
    if (orgDescendantIds(orgs, movingId).includes(parentId)) {
      return { ok: false, error: "不能把部门挂到自己的下级下面" }
    }
  }
  return { ok: true }
}

let idSeq = 100
export function nextId(prefix: string): string {
  idSeq += 1
  return `${prefix}-${idSeq}`
}

export function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 角色权限管理 — 单一事实源
 * 管理员只面对页面名称、按钮名称、数据范围和字段展示方式，不接触内部编码。
 */

import type { Role } from "../types"
import { REGION_OPTIONS } from "../constants"

export type ScopeType =
  | "ALL_PLATFORM"
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

export const SCOPE_OPTIONS: { value: ScopeType label: string hint: string }[] =
  [
    {
      value: "ALL_PLATFORM",
      label: "全平台",
      hint: "可见全部租户与组织的数据",
    },
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
      value: "MOBILE",
      label: "移动端",
      hint: "数据仅在移动端 App 生效；该角色账号不可登录 Web 后台",
    },
    {
      value: "CUSTOM",
      label: "指定范围",
      hint: "按组织、药厂、服务商、工作组、部门、品种、区域交叉限定",
    },
  ]

export function scopeLabel(scope: ScopeType): string {
  return SCOPE_OPTIONS.find((s) => s.value === scope)?.label ?? scope
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
}

export interface SensitiveField {
  key: string
  name: string
  module: string
  description: string
  maskExample: string
}

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
  tenant: string
  defaultScope: ScopeType
  customScope: CustomScope
  version: number
  updatedBy: string
  updatedAt: string
  /** 页面 id → 已授权动作。未出现的页面视为无权限。 */
  pagePerms: Record<string, PageAction[]>
  fieldPolicies: Record<string, FieldPolicyKind>
}

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

export interface PermOrg {
  id: string
  name: string
  type: "platform" | "pharma" | "provider" | "group" | "department"
  parentId?: string
}

/**
 * 角色分配：用户获得某角色及其有效期、权限覆盖范围的记录。
 * scopeOrgId 是数据权限覆盖根节点，与用户所属 orgId 是两种语义：调岗不改写 scopeOrgId。
 */
export interface RoleAssignment {
  id: string
  userId: string
  roleId: string
  /** 权限覆盖根节点（数据权限计算用），不随人员调岗变化 */
  scopeOrgId: string
  scopeOrgName: string
  scope: ScopeType
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
    description: "医院拜访记录填报、审核与查看",
    actions: acts("hospital-visits", ["view", "export"]),
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
    module: "合规管理",
    name: "医药代表备案管理",
    description: "代表名单、备案台账与到期提醒",
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
    module: "企业用户管理",
    name: "服务商准入",
    description:
      "服务商提交准入资料，药厂合规审核通过或驳回（双角色闭环，仅服务提供商与药厂合规部门参与）",
    actions: acts("vendor-access", ["view", "create", "edit", "submit", "approve"]),
  },
  {
    id: "vendor-access-records",
    module: "企业用户管理",
    name: "服务商准入提交记录",
    description: "服务商查看本企业准入资料的历次提交与审核结果",
    actions: acts("vendor-access-records", ["view"]),
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
    module: "主数据管理",
    name: "品种授权",
    description: "按服务商与区域授权品种",
    actions: acts("variety-auth", ["view", "create", "edit", "delete"]),
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
    module: "系统管理",
    name: "角色管理",
    description: "角色新建、复制、启停与权限配置",
    actions: acts("roles", ["view", "create", "edit", "delete", "export"]),
  },
  {
    id: "menus",
    module: "系统管理",
    name: "菜单管理",
    description: "维护左侧导航的目录、页面绑定、排序与启停",
    actions: acts("menus", ["view", "create", "edit"]),
  },
  {
    id: "role-preview",
    module: "系统管理",
    name: "角色预览",
    description: "按角色只读预览菜单、按钮与字段",
    actions: acts("role-preview", ["view"]),
  },
  {
    id: "departments",
    module: "系统管理",
    name: "用户与组织",
    description: "用户主数据、部门结构、人员调入调出、逐人角色分配",
    actions: acts("departments", ["view", "create", "edit", "delete"]),
  },
  {
    id: "audit-log",
    module: "系统管理",
    name: "操作日志",
    description: "业务高风险操作审计",
    actions: acts("audit-log", ["view"]),
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
      "低代码搭建自定义业务场景：表单字段、审批流程、权限与接口联动配置，发布成可用的业务模块（药厂管理员/合规/平台可用，服务商不可见）",
    actions: acts("scenario-center", ["view", "create", "edit"]),
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

const TENANT = "百益健康科技"
const ACTOR_ADMIN = "王敏"

function role(
  partial: Omit<SysRole, "tenant" | "customScope" | "fieldPolicies" | "version"> & {
    fieldPolicies?: Record<string, FieldPolicyKind>
    customScope?: CustomScope
    version?: number
  },
): SysRole {
  return {
    tenant: TENANT,
    customScope: emptyCustomScope(),
    fieldPolicies: ALL_VISIBLE,
    version: 3,
    ...partial,
  }
}

const ALL_PAGES = RESOURCE_PAGES.map(
  (p) => [p.id, p.actions.map((a) => a.key)] as [string, PageAction[]],
)

export const PRESET_ROLES: SysRole[] = [
  role({
    id: "role-platform-ops",
    name: "平台运营",
    description: "平台运营、规则配置、全局监控",
    kind: "preset",
    status: "enabled",
    defaultScope: "ALL_PLATFORM",
    updatedBy: ACTOR_ADMIN,
    updatedAt: "2026-08-12 10:20",
    pagePerms: perms(ALL_PAGES),
  }),
  role({
    id: "role-sys-admin",
    name: "系统管理员",
    description: "用户、角色、组织、权限审计管理",
    kind: "preset",
    status: "enabled",
    defaultScope: "ALL_PLATFORM",
    updatedBy: ACTOR_ADMIN,
    updatedAt: "2026-08-12 10:20",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["roles", ["view", "create", "edit", "delete", "export"]],
      ["menus", ["view", "create", "edit"]],
      ["role-preview", ["view"]],
      ["departments", ["view", "create", "edit", "delete"]],
      ["audit-log", ["view"]],
      ["baiyee-ai", ["view"]],
    ]),
  }),
  role({
    id: "role-account-admin",
    name: "账户管理员",
    description: "用户建档、启停、账户解锁",
    kind: "preset",
    status: "enabled",
    defaultScope: "ALL_PLATFORM",
    updatedBy: ACTOR_ADMIN,
    updatedAt: "2026-08-12 10:20",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["rep-filing", ["view", "create", "edit"]],
      ["audit-log", ["view"]],
    ]),
    fieldPolicies: {
      ...ALL_VISIBLE,
      "user.idNo": "mask",
      "user.bankAccount": "mask",
      "doctor.phone": "mask",
    },
  }),
  role({
    id: "role-pharma-sales",
    name: "药厂销售管理员",
    description: "预算、任务、价目、结算、业务分析",
    kind: "preset",
    status: "enabled",
    defaultScope: "PHARMA",
    updatedBy: "李航",
    updatedAt: "2026-08-20 16:08",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["rep-filing", ["view", "create", "edit"]],
      ["budget-plan", ["view", "create", "edit", "export"]],
      ["task-dispatch", ["view", "create", "edit", "submit", "export"]],
      ["hospital-visits", ["view", "export"]],
      ["settlement", ["view", "approve", "export"]],
      ["doctors", ["view", "export"]],
      ["varieties", ["view", "create", "edit"]],
      ["variety-auth", ["view", "create", "edit", "delete"]],
      ["price-config", ["view", "edit"]],
      ["execution-chain", ["view", "edit"]],
      ["business-switch", ["view", "edit"]],
      ["biz-detail-export", ["view", "create", "export"]],
      ["talk-script-variety", ["view", "create", "edit", "delete", "export"]],
      ["scenario-center", ["view", "create", "edit"]],
      ["roles", ["view", "create", "edit", "delete"]], // 原型演示授权：真实后端仅平台运营/系统管理员
      ["menus", ["view", "create", "edit"]], // 原型演示授权：真实后端仅平台运营/系统管理员
      ["role-preview", ["view"]],
      ["departments", ["view", "create", "edit", "delete"]],
      ["audit-log", ["view"]],
      ["baiyee-ai", ["view", "submit"]],
    ]),
  }),
  role({
    id: "role-pharma-compliance",
    name: "药厂合规管理员",
    description: "风险、准入、备案与拜访记录监督",
    kind: "preset",
    status: "enabled",
    defaultScope: "PHARMA",
    updatedBy: "赵宁",
    updatedAt: "2026-08-18 09:40",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["rep-filing", ["view", "approve", "export"]],
      ["vendor-access", ["view", "approve"]],
      ["doctors", ["view"]],
      ["audit-log", ["view"]],
      ["baiyee-ai", ["view", "submit"]],
      ["business-switch", ["view"]],
      ["biz-detail-export", ["view", "create", "export"]],
      ["scenario-center", ["view", "create", "edit"]],
    ]),
    fieldPolicies: {
      ...ALL_VISIBLE,
      "settlement.amount": "mask",
      "doctor.name": "mask",
      "doctor.phone": "mask",
      "user.idNo": "mask",
      "evidence.pii": "hidden",
    },
  }),
  role({
    id: "role-provider-admin",
    name: "服务商管理员",
    description: "任务承接、分配、初审、结算",
    kind: "preset",
    status: "enabled",
    defaultScope: "PROVIDER",
    updatedBy: "陈伟",
    updatedAt: "2026-08-15 11:12",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["task-dispatch", ["view", "edit", "submit", "export"]],
      ["hospital-visits", ["view"]],
      ["settlement", ["view", "submit", "export"]],
      ["rep-filing", ["view", "create", "edit"]],
      ["vendor-access", ["view", "create", "edit", "submit"]],
      ["vendor-access-records", ["view"]],
      ["variety-auth", ["view", "edit"]],
      ["performance-team", ["view", "submit", "export"]],
      ["performance-specialist", ["view", "submit", "export"]],
      ["performance-settings", ["view", "edit"]],
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
    name: "工作组长",
    description: "工作组分派、初审、进度管理",
    kind: "preset",
    status: "enabled",
    defaultScope: "GROUP",
    updatedBy: "陈伟",
    updatedAt: "2026-08-15 11:12",
    pagePerms: perms([
      ["dashboard", ["view"]],
      ["task-dispatch", ["view", "edit", "submit", "approve"]],
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
    description: "本人填报、证据上传、本人结算查看（仅移动端 App，不可登录 Web 后台）",
    kind: "preset",
    status: "enabled",
    defaultScope: "MOBILE",
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

export const seedCustomRoles: SysRole[] = [
  role({
    id: "role-custom-region-sales",
    name: "药厂区域销售经理",
    description:
      "数据范围为本部门及以下；授权挂在西北大区即可覆盖陕西、四川办事处",
    kind: "custom",
    status: "enabled",
    defaultScope: "DEPT_AND_CHILD",
    customScope: {
      ...emptyCustomScope(),
      pharmaIds: ["org-pharma"],
    },
    version: 2,
    updatedBy: "李航",
    updatedAt: "2026-08-24 15:06",
    pagePerms: {
      ...PRESET_ROLES.find((r) => r.id === "role-pharma-sales")!.pagePerms,
    },
  }),
  role({
    id: "role-custom-settle-review",
    name: "结算复核专员",
    description: "仅结算查看与导出，待发布草稿",
    kind: "custom",
    status: "draft",
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
  { id: "org-platform", name: "百益健康科技", type: "platform" },
  {
    id: "org-pharma",
    name: "百益制药",
    type: "pharma",
    parentId: "org-platform",
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
    id: "org-group-3",
    name: "工作组三",
    type: "group",
    parentId: "org-provider-east",
  },
  {
    id: "org-group-1",
    name: "工作组一",
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
  if (scope === "ALL_PLATFORM") {
    hit = nearestAncestorOfType(orgs, userOrgId, "platform")
  } else if (scope === "PHARMA") {
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
    id: "u-wangmin",
    name: "王敏",
    account: "wangmin",
    phone: "13901350101",
    email: "wangmin@baiyee.com",
    orgId: "org-platform",
    orgName: "百益健康科技",
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
    id: "u-zhengjie",
    name: "郑洁",
    account: "zhengjie",
    phone: "13901350112",
    email: "zhengjie@baiyee.com",
    orgId: "org-dept-east",
    orgName: "华东大区",
    accountStatus: "enabled",
    createdAt: "2026-03-15 10:30",
    lastLoginAt: "2026-09-01 11:26",
  },
]

export const seedAssignments: RoleAssignment[] = [
  {
    id: "g-01",
    userId: "u-wangmin",
    roleId: "role-sys-admin",
    scopeOrgId: "org-platform",
    scopeOrgName: "百益健康科技",
    scope: "ALL_PLATFORM",
    effectiveFrom: "2026-01-01",
    grantedBy: "系统预置",
    grantedAt: "2026-01-01 09:00",
    status: "active",
  },
  {
    id: "g-02",
    userId: "u-wangmin",
    roleId: "role-platform-ops",
    scopeOrgId: "org-platform",
    scopeOrgName: "百益健康科技",
    scope: "ALL_PLATFORM",
    effectiveFrom: "2026-01-01",
    grantedBy: "系统预置",
    grantedAt: "2026-01-01 09:00",
    status: "active",
  },
  {
    id: "g-03",
    userId: "u-lihang",
    roleId: "role-pharma-sales",
    scopeOrgId: "org-pharma",
    scopeOrgName: "百益制药",
    scope: "PHARMA",
    effectiveFrom: "2026-03-01",
    grantedBy: "王敏",
    grantedAt: "2026-03-01 10:12",
    status: "active",
  },
  {
    id: "g-04",
    userId: "u-zhaoning",
    roleId: "role-pharma-compliance",
    scopeOrgId: "org-pharma",
    scopeOrgName: "百益制药",
    scope: "PHARMA",
    effectiveFrom: "2026-03-01",
    grantedBy: "王敏",
    grantedAt: "2026-03-01 10:18",
    status: "active",
  },
  {
    id: "g-05",
    userId: "u-chenwei",
    roleId: "role-provider-admin",
    scopeOrgId: "org-provider-east",
    scopeOrgName: "东方恒业推广有限公司",
    scope: "PROVIDER",
    effectiveFrom: "2026-04-12",
    grantedBy: "李航",
    grantedAt: "2026-04-12 14:22",
    status: "active",
  },
  {
    id: "g-06",
    userId: "u-liuyang",
    roleId: "role-group-lead",
    scopeOrgId: "org-group-1",
    scopeOrgName: "工作组一",
    scope: "GROUP",
    effectiveFrom: "2026-05-08",
    grantedBy: "陈伟",
    grantedAt: "2026-05-08 09:30",
    status: "active",
  },
  {
    id: "g-07",
    userId: "u-yangming",
    roleId: "role-specialist",
    scopeOrgId: "org-group-3",
    scopeOrgName: "工作组三",
    scope: "MOBILE",
    effectiveFrom: "2026-06-01",
    grantedBy: "陈伟",
    grantedAt: "2026-06-01 11:05",
    status: "active",
  },
  {
    id: "g-08",
    userId: "u-huangfeng",
    roleId: "role-specialist",
    scopeOrgId: "org-group-3",
    scopeOrgName: "工作组三",
    scope: "MOBILE",
    effectiveFrom: "2026-06-01",
    grantedBy: "陈伟",
    grantedAt: "2026-06-01 11:06",
    status: "active",
  },
  {
    id: "g-09",
    userId: "u-wuchao",
    roleId: "role-specialist",
    scopeOrgId: "org-group-3",
    scopeOrgName: "工作组三",
    scope: "MOBILE",
    effectiveFrom: "2026-06-01",
    effectiveTo: "2026-08-01",
    grantedBy: "陈伟",
    grantedAt: "2026-06-01 11:07",
    status: "expired",
  },
  {
    id: "g-10",
    userId: "u-sunli",
    roleId: "role-specialist",
    scopeOrgId: "org-provider-east",
    scopeOrgName: "东方恒业推广有限公司",
    scope: "MOBILE",
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
    userId: "u-lihang",
    roleId: "role-custom-region-sales",
    scopeOrgId: "org-dept-northwest",
    scopeOrgName: "西北大区",
    scope: "DEPT_AND_CHILD",
    effectiveFrom: "2026-08-24",
    grantedBy: "王敏",
    grantedAt: "2026-08-24 15:20",
    status: "active",
    reason: "区域销售授权 · 西北大区",
  },
  {
    id: "g-12",
    userId: "u-lichen",
    roleId: "role-specialist",
    scopeOrgId: "org-provider-smart",
    scopeOrgName: "智联科技有限公司",
    scope: "MOBILE",
    effectiveFrom: "2026-08-01",
    effectiveTo: "2026-09-30",
    grantedBy: "李航",
    grantedAt: "2026-08-01 10:00",
    status: "active",
    reason: "临时支援 · 服务商专员",
  },
  {
    id: "g-13",
    userId: "u-zhengjie",
    roleId: "role-account-admin",
    scopeOrgId: "org-platform",
    scopeOrgName: "百益健康科技",
    scope: "ALL_PLATFORM",
    effectiveFrom: "2026-09-02",
    grantedBy: "王敏",
    grantedAt: "2026-09-02 09:36",
    status: "active",
    reason: "账户建档与解锁专职 · 预置授权",
  },
]

export const seedChangeLogs: RoleChangeLog[] = [
  {
    id: "cl-01",
    roleId: "role-pharma-sales",
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
    summary: "从药厂销售管理员复制，数据范围改为本部门及以下",
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
    roleId: "role-pharma-compliance",
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
    actorRole: "药厂销售管理员",
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
    actorRole: "系统管理员",
    org: "百益健康科技",
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
    actorRole: "药厂销售管理员",
    org: "百益制药",
    target: "药厂区域销售经理",
    roleName: "药厂销售管理员",
    module: "角色管理",
    action: "复制角色",
    resource: "roles.create",
    decision: "允许",
    reason: "从预置角色复制",
    beforeSummary: "药厂销售管理员",
    afterSummary: "定制 / 本部门及以下",
    requestId: "req-8241506",
    ip: "10.4.21.8",
    result: "成功",
  },
  {
    id: "PE00076",
    time: "2026-08-24 11:40",
    actor: "赵宁",
    actorRole: "药厂合规管理员",
    org: "百益制药",
    target: "证据链复审导出",
    roleName: "药厂合规管理员",
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
    actorRole: "系统管理员",
    org: "百益健康科技",
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
    actorRole: "药厂销售管理员",
    org: "百益制药",
    target: "药厂销售管理员",
    roleName: "药厂销售管理员",
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
    actorRole: "药厂合规管理员",
    org: "百益制药",
    target: "药厂合规管理员 / 精确结算金额",
    roleName: "药厂合规管理员",
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
 * 真实授权角色（SysRole）→ 旧三类登录视角（Role）的兼容映射。
 * 登录、菜单与权限判定一律以 SysRole + pagePerms 为准；此映射仅服务于
 * 尚未迁移的页面内「视角分支」（如任务执行按销售/服务商渲染不同操作），
 * 属于整改方案中「逐步替换」的过渡层，新增角色必须在此登记。
 */
export const PERSPECTIVE_BY_ROLE_ID: Record<string, Role> = {
  "role-pharma-sales": "药厂销售部门",
  "role-custom-region-sales": "药厂销售部门",
  "role-pharma-compliance": "药厂合规部门",
  "role-provider-admin": "服务提供商",
  "role-group-lead": "服务提供商",
  "role-specialist": "服务提供商",
  // 平台侧角色没有业务视角：页面访问已由 visiblePages 收敛到系统管理页，
  // 这里给中性视角仅为工作台/菜单兼容渲染，不代表获得业务操作权
  "role-platform-ops": "药厂销售部门",
  "role-sys-admin": "药厂销售部门",
  "role-account-admin": "药厂销售部门",
}

/** 运行期新建的定制角色按数据范围推导视角（无登记时兜底） */
export function perspectiveRoleOf(role: SysRole): Role {
  const mapped = PERSPECTIVE_BY_ROLE_ID[role.id]
  if (mapped) return mapped
  if (role.defaultScope === "PROVIDER" || role.defaultScope === "GROUP" || role.defaultScope === "SELF")
    return "服务提供商"
  if (pageHasAction(role, "vendor-access", "approve") || role.name.includes("合规"))
    return "药厂合规部门"
  return "药厂销售部门"
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

/** 全平台范围或含高危操作的角色按高危角色处理（授权需理由、走待复核） */
export function isHighRiskRole(role: SysRole): boolean {
  if (role.defaultScope === "ALL_PLATFORM") return true
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
  platform: "平台",
  pharma: "药厂",
  provider: "服务商",
  group: "工作组",
  department: "部门",
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

/** 向上找企业实体根节点（平台/药厂/服务商），用于「同企业」规则 */
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
  if (!isDeptParentType(parent.type)) {
    return { ok: false, error: "部门只能挂在药厂或部门下，不能挂到服务商或工作组" }
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

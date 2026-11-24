/**
 * 租户注册中心（软件服务方侧 · 运行时注册表，2026-09-15 深度审核整改版）。
 *
 * 职责：贝医系统管理员「直接创建租户（原子建租：生成全局唯一主企业码 + 首位管理员
 * 待激活 + 预置授权）→ 管理员首次登录激活 → 租户生命周期（正常 ⇄ 已暂停）」的
 * 全部 mock 数据与业务规则。药厂与服务商共用同一套机制，仅以 type 区分扩展字段
 * 与默认管理员角色；企业码不带任何业务语义。
 *
 * 2026-09-15 整改拍板（见《多租户平台企业码与服务商可见范围-深度审核与解决
 * 方案 0915》）：软件服务方直接创建、不套申请—审核—补正流程；一个租户只有一个
 * 主企业码（无别名码全链路）。
 *
 * 2026-11-24 按《租户管理需求文档（研发精简版）》对齐：
 * - 状态收敛为 正常 / 已暂停 两态，创建即正常，首位管理员可直接登录（不再有
 *   「待激活 → 首登激活租户」联动）；暂停 / 恢复操作原因必填（非空校验），
 *   标准原因码保留为快捷选项、配合必填说明写入审计。
 * - 主企业码：全局唯一、生成后不可修改，可查看与一键复制且复制不留痕；移除
 *   撞码重试日志、重复提交幂等回执与主码退役（retired）流转等冗余规则。
 * - 终止操作取消（「终止后 3–5 年清除数据」改业务侧人工处理，是否保留独立
 *   终止入口待与老总确认，见文档标黄项）。
 *
 * 生产口径（原型注释，勿当真实能力）：本文件的全部状态保存在内存 +
 * localStorage 演示；真实系统由服务端与数据库完成——主码唯一性用 DB 唯一
 * 约束保证、建租与发码在同一数据库事务内、localStorage 仅承载演示期数据，
 * 不承载任何安全语义。
 */

import type { PermOrg, PermUser, RoleAssignment, TenantMembership } from "./permissions"
import { PERM_ORGS, PERM_USERS, seedAssignments, nextId, nowStamp, enterpriseRootOf } from "./permissions"
import { ENTERPRISE_CODES } from "../auth/authProfiles"

// ─── 模型 ────────────────────────────────────────────────────────────────────

export type TenantType = "pharma" | "provider"

/** 租户生命周期（两态：创建即正常，正常 ⇄ 已暂停） */
export type TenantLifecycleStatus = "active" | "suspended"

/** 企业主体资料（通用字段 + 按类型的扩展字段；软件服务方留档与基础校验用，非审核流） */
export interface TenantSubjectProfile {
  legalName: string
  shortName: string
  /** 统一社会信用代码（18 位，全局查重） */
  uscc: string
  address: string
  contactName: string
  contactPhone: string
  /** 模拟附件（原型不产生真实文件）；服务商为选填 */
  licenseAttachment?: string
  remark?: string
  // 药厂扩展
  pharmaCategory?: string
  mahHolderFlag?: boolean
  licenseNo?: string
  licenseValidTo?: string
  // 服务商扩展（服务类型/经营范围已按 2026-09-15 拍板删除）
  bizOwner?: string
  complianceOwner?: string
  qualificationNo?: string
  qualificationValidTo?: string
}

export interface TenantAdminDesignee {
  name: string
  phone: string
  /** 登录账号（企业内唯一，2026-09-18 起由向导/弹窗填写；缺省回落 rt-手机后4位） */
  account?: string
  /** 2026-11-04 起开户界面不再录入所属部门（历史数据保留） */
  department?: string
  /** 展示用角色名（实际授权角色由租户类型推导） */
  roleLabel: string
}

export interface CodeRecord {
  code: string
  enterpriseId: string
  createdAt: string
  createdBy: string
}

export interface TenantRecord {
  id: string
  type: TenantType
  legalName: string
  shortName: string
  uscc: string
  /** 创建时原子创建的企业根节点 id */
  enterpriseOrgId: string
  primaryCode: string
  /** 主体资料（直接建租时录入，创建后只读） */
  profile: TenantSubjectProfile
  /** 首位管理员（激活前为待激活成员关系） */
  initialAdmin: {
    userId: string
    name: string
    phone: string
    /** 2026-11-04 起开户界面不再录入所属部门（历史数据保留） */
    department?: string
    roleLabel: string
    roleId: string
    memberStatus: "pending_activation" | "active"
    activatedAt?: string
  }
  status: TenantLifecycleStatus
  statusChangedAt: string
  /** 最近一次状态操作的原因码与说明（暂停/恢复均必填，写审计） */
  statusReasonCode?: string
  statusNote?: string
  /** 绑定的租户套餐 id（2026-09-18 移植套餐模型）；缺省回落默认套餐（tenantPackages 解析） */
  packageId?: string
  /** 开通截止日期（YYYY-MM-DD；缺省=永久有效，过期后登录被拒） */
  expireAt?: string
  /** 用户数量限额（-1 或缺省=不限制；建号入口按租户用户数校验） */
  userQuota?: number
  createdAt: string
  createdBy: string
}

export interface TenantAuditLine {
  id: string
  at: string
  actor: string
  reasonCode: string
  targetTenant: string
  code?: string
  detail?: string
}

interface TenantRegistryState {
  version: 5
  tenants: TenantRecord[]
  codes: CodeRecord[]
  /**
   * 运行时组织节点（2026-10-27 起为组织域唯一持久真源）：建租产生的企业根、
   * 页面新建的部门，以及对种子节点的覆盖副本（改名 / 调级 / 管理区域）。
   * allOrgs() 按 id 用本表覆盖 PERM_ORGS 种子，其余追加。
   */
  orgs: PermOrg[]
  users: PermUser[]
  assignments: RoleAssignment[]
  /** 运行时成员身份快照（调岗 / 建档 / 移除 / 重新加入后的全量；按 id 覆盖种子） */
  memberships: TenantMembership[]
  /**
   * 已删除组织节点墓碑（2026-10-28 组织架构改造）：种子节点无法通过过滤
   * state.orgs「删除」（allOrgs 会用种子回填），删除统一记墓碑；
   * 恢复演示数据时一并清空。
   */
  deletedOrgIds: string[]
  /** 租户侧操作流水（详情页「操作日志」页签展示；全局审计另走操作日志页） */
  activityLog: TenantAuditLine[]
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 主企业码字符集：8 位大写字母数字，排除易混 0/O、1/I，无业务语义 */
const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 8

/** 租户状态操作标准原因（暂停/恢复各一组，供弹窗快捷选择；需求文档 §2.1 要求原因必填） */
export const SUSPEND_REASON_OPTIONS = [
  { code: "CONTRACT_HOLD", label: "合作协议暂停" },
  { code: "RISK_INVESTIGATION", label: "涉合规风险调查" },
  { code: "ARREARS", label: "费用欠缴" },
  { code: "OWNER_REQUEST", label: "企业主动申请暂停" },
] as const

export const RESUME_REASON_OPTIONS = [
  { code: "CONTRACT_RESUMED", label: "合作协议恢复" },
  { code: "INVESTIGATION_CLEARED", label: "风险调查结论无碍" },
  { code: "ARREARS_CLEARED", label: "费用欠缴已结清" },
  { code: "OWNER_REQUEST", label: "企业主动申请恢复" },
] as const

/**
 * 旧数据原因码兜底映射（仅用于展示存量记录里不在上两组选项中的历史码，
 * 如终止时代遗留的 OPENING_VOIDED 等）
 */
const LEGACY_REASON_LABEL: Record<string, string> = {
  CONTRACT_HOLD: "合作协议暂停",
  RISK_INVESTIGATION: "涉合规风险调查",
  ARREARS: "费用欠缴",
  OWNER_REQUEST: "企业主动申请",
  CONTRACT_RESUMED: "合作协议恢复",
  INVESTIGATION_CLEARED: "风险调查结论无碍",
  ARREARS_CLEARED: "费用欠缴已结清",
}

export function legacyReasonLabel(code: string): string {
  return LEGACY_REASON_LABEL[code] ?? code
}

export const TENANT_STATUS_LABEL: Record<TenantLifecycleStatus, string> = {
  active: "正常",
  suspended: "已暂停",
}

/**
 * 已下线操作的原因码（2026-11-24 需求文档 §2.2 / §5.5）：ENT_CODE_COPIED =
 * 复制企业码不留痕；ENT_CODE_COLLISION_RETRIED = 撞码重试日志取消；
 * TENANT_TERMINATED = 终止操作已取消。读取历史流水时统一过滤，旧版本地
 * 数据升级时一并清除。
 */
export const RETIRED_AUDIT_REASONS: ReadonlySet<string> = new Set([
  "ENT_CODE_COPIED",
  "ENT_CODE_COLLISION_RETRIED",
  "TENANT_TERMINATED",
])

export const TENANT_TYPE_LABEL: Record<TenantType, string> = {
  pharma: "药厂",
  provider: "服务提供商",
}

/** 首位管理员默认授权角色：药厂→企业管理员；服务商→服务商管理员（共用机制、按类型区分） */
const ADMIN_ROLE_BY_TYPE: Record<TenantType, { roleId: string; roleLabel: string }> = {
  pharma: { roleId: "role-pharma-admin", roleLabel: "企业管理员" },
  provider: { roleId: "role-provider-admin", roleLabel: "服务商管理员" },
}

// ─── 持久化（localStorage 全容错；生产由服务端数据库承载） ──────────────────

// v3：2026-09-15 收敛版（软件服务方唯一角色/演示登录租户并入种子）；旧数据直接作废重建种子
// v4：2026-10-27 组织域持久化（部门 CRUD / 管理区域 / 成员身份进 registry）；v3 数据原地升级、不作废
// v5：2026-11-24 租户状态收敛为两态；v3/v4 数据原地升级（见 upgradeLifecycle）、不作废
const STORAGE_KEY = "baiyee-tenant-registry-v5"
const LEGACY_STORAGE_KEYS = ["baiyee-tenant-registry-v4", "baiyee-tenant-registry-v3"] as const

function buildSeedState(): TenantRegistryState {
  return {
    version: 5,
    // 演示种子：① 演示登录用药厂/服务商（与登录页企业码同一份登记，软件服务方必须可查）
    //          ② 运行时租户覆盖两态可验证路径（正常/已暂停）
    // 正常（朗盛）· 首位管理员待首登激活的药厂（云杏）/服务商（泰合）· 已暂停（启辰）
    tenants: [
      // ── 演示登录租户：与登录页企业码（authProfiles.ENTERPRISE_CODES）同一编号空间，
      //    系统管理后台「租户管理」必须能查到全部演示登录用租户（登录与软件服务方共用本登记数据）
      {
        id: "tenant-baiyi",
        type: "pharma",
        legalName: "百益制药有限公司",
        shortName: "百益制药",
        uscc: "91320100MA0B2C3D4E",
        enterpriseOrgId: "org-pharma",
        primaryCode: "E9K4P7X2",
        profile: {
          legalName: "百益制药有限公司",
          shortName: "百益制药",
          uscc: "91320100MA0B2C3D4E",
          address: "江苏省南京市江北新区药谷大道 99 号",
          contactName: "沈悦",
          contactPhone: "13901350121",
          licenseAttachment: "营业执照-百益制药.pdf（模拟附件）",
          remark: "演示登录药厂（企业码 E9K4P7X2）",
          pharmaCategory: "化学药品制剂",
          mahHolderFlag: true,
          licenseNo: "苏药监械生产许 20260001",
          licenseValidTo: "2030-06-30",
        },
        initialAdmin: {
          userId: "u-shenyue",
          name: "沈悦",
          phone: "13901350121",
          department: "信息技术部",
          roleLabel: "企业管理员",
          roleId: "role-pharma-admin",
          memberStatus: "active",
          activatedAt: "2026-04-01 09:00",
        },
        status: "active",
        statusChangedAt: "2026-04-01 09:00",
        createdAt: "2026-04-01 09:00",
        createdBy: "王敏",
      },
      {
        id: "tenant-east",
        type: "provider",
        legalName: "东方恒业推广有限公司",
        shortName: "东方恒业",
        uscc: "91440101MA02EFGH34",
        enterpriseOrgId: "org-provider-east",
        primaryCode: "W6HK2T9V",
        profile: {
          legalName: "东方恒业推广有限公司",
          shortName: "东方恒业",
          uscc: "91440101MA02EFGH34",
          address: "广州市天河区体育西路 55 号",
          contactName: "陈伟",
          contactPhone: "13809120104",
          licenseAttachment: "东方恒业-营业执照.pdf（模拟附件）",
          remark: "演示登录服务商（企业码 W6HK2T9V）",
          bizOwner: "陈伟",
          complianceOwner: "韩磊",
        },
        initialAdmin: {
          userId: "u-chenwei",
          name: "陈伟",
          phone: "13809120104",
          department: "运营部",
          roleLabel: "服务商管理员",
          roleId: "role-provider-admin",
          memberStatus: "active",
          activatedAt: "2026-04-12 09:00",
        },
        status: "active",
        statusChangedAt: "2026-04-12 09:00",
        createdAt: "2026-04-12 09:00",
        createdBy: "王敏",
      },
      {
        id: "tenant-smart",
        type: "provider",
        legalName: "智联科技有限公司",
        shortName: "智联科技",
        uscc: "91110108MA01ABCD12",
        enterpriseOrgId: "org-provider-smart",
        primaryCode: "F3JN7QX4",
        profile: {
          legalName: "智联科技有限公司",
          shortName: "智联科技",
          uscc: "91110108MA01ABCD12",
          address: "北京市海淀区中关村大街 1 号",
          contactName: "赵启明",
          contactPhone: "13809120130",
          licenseAttachment: "智联科技-营业执照.pdf（模拟附件）",
          remark: "演示登录服务商（企业码 F3JN7QX4）；准入资料在服务商准入模块维护",
          bizOwner: "赵启明",
          complianceOwner: "钱薇",
        },
        initialAdmin: {
          userId: "u-zhaoqiming",
          name: "赵启明",
          phone: "13809120130",
          department: "运营部",
          roleLabel: "服务商管理员",
          roleId: "role-provider-admin",
          memberStatus: "active",
          activatedAt: "2026-05-01 09:00",
        },
        status: "active",
        statusChangedAt: "2026-05-01 09:00",
        createdAt: "2026-05-01 09:00",
        createdBy: "王敏",
      },
      // ── 运行时租户：覆盖两态可验证路径
      {
        id: "tenant-langseng",
        type: "pharma",
        legalName: "朗盛生物制药有限公司",
        shortName: "朗盛生物",
        uscc: "91320191MA4WQ7LR8C",
        enterpriseOrgId: "org-rt-langseng",
        primaryCode: "N4PJ2XKM",
        profile: {
          legalName: "朗盛生物制药有限公司",
          shortName: "朗盛生物",
          uscc: "91320191MA4WQ7LR8C",
          address: "江苏省南京市江北新区研创园 12 号",
          contactName: "冯楠",
          contactPhone: "13809120120",
          licenseAttachment: "营业执照-朗盛生物.pdf（模拟附件）",
          pharmaCategory: "生物制品",
          mahHolderFlag: true,
          licenseNo: "苏药监械生产许 20260115",
          licenseValidTo: "2030-12-31",
        },
        initialAdmin: {
          userId: "u-rt-fengnan",
          name: "冯楠",
          phone: "13809120120",
          department: "总经理办公室",
          roleLabel: "企业管理员",
          roleId: "role-pharma-admin",
          memberStatus: "active",
          activatedAt: "2026-09-02 09:40",
        },
        status: "active",
        statusChangedAt: "2026-09-02 09:40",
        createdAt: "2026-09-01 15:30",
        createdBy: "王敏",
      },
      {
        id: "tenant-yunxing",
        type: "pharma",
        legalName: "云杏生物医药有限公司",
        shortName: "云杏生物",
        uscc: "91320115MA1XL8QN2D",
        enterpriseOrgId: "org-rt-yunxing",
        primaryCode: "R8NV3KQ2",
        profile: {
          legalName: "云杏生物医药有限公司",
          shortName: "云杏生物",
          uscc: "91320115MA1XL8QN2D",
          address: "江苏省南京市江宁区科学园乾德路 5 号",
          contactName: "周婷",
          contactPhone: "13809120116",
          licenseAttachment: "营业执照-云杏生物.pdf（模拟附件）",
          remark: "华东区域新增合作药厂",
          pharmaCategory: "化学药品制剂",
          mahHolderFlag: true,
          licenseNo: "苏药监械生产许 20260088",
          licenseValidTo: "2031-03-31",
        },
        initialAdmin: {
          userId: "u-rt-zhouting",
          name: "周婷",
          phone: "13809120116",
          department: "总经理办公室",
          roleLabel: "企业管理员",
          roleId: "role-pharma-admin",
          memberStatus: "pending_activation",
        },
        status: "active",
        statusChangedAt: "2026-09-11 11:05",
        createdAt: "2026-09-11 11:05",
        createdBy: "王敏",
      },
      {
        id: "tenant-taihe",
        type: "provider",
        legalName: "泰合医学推广有限公司",
        shortName: "泰合医学推广",
        uscc: "91330108MA6KJW3N5A",
        enterpriseOrgId: "org-rt-taihe",
        primaryCode: "C5RJ8W2N",
        profile: {
          legalName: "泰合医学推广有限公司",
          shortName: "泰合医学推广",
          uscc: "91330108MA6KJW3N5A",
          address: "浙江省杭州市滨江区江南大道 100 号",
          contactName: "骆佳",
          contactPhone: "13809120119",
          licenseAttachment: "",
          remark: "服务商首位管理员待首登激活演示路径",
          bizOwner: "骆佳",
          complianceOwner: "丁一鸣",
        },
        initialAdmin: {
          userId: "u-rt-luojia",
          name: "骆佳",
          phone: "13809120119",
          department: "运营部",
          roleLabel: "服务商管理员",
          roleId: "role-provider-admin",
          memberStatus: "pending_activation",
        },
        status: "active",
        statusChangedAt: "2026-09-12 10:20",
        createdAt: "2026-09-12 10:20",
        createdBy: "王敏",
      },
      {
        id: "tenant-qichen",
        type: "provider",
        legalName: "启辰推广服务有限公司",
        shortName: "启辰推广",
        uscc: "91440300MA5D4RJW9E",
        enterpriseOrgId: "org-rt-qichen",
        primaryCode: "H4TW9MXP",
        profile: {
          legalName: "启辰推广服务有限公司",
          shortName: "启辰推广",
          uscc: "91440300MA5D4RJW9E",
          address: "广东省深圳市福田区深南大道 2008 号",
          contactName: "郑亚楠",
          contactPhone: "13809120117",
          licenseAttachment: "营业执照-启辰推广.pdf（模拟附件）",
          bizOwner: "郑亚楠",
          complianceOwner: "曹敏",
        },
        initialAdmin: {
          userId: "u-rt-zhengyanan",
          name: "郑亚楠",
          phone: "13809120117",
          department: "综合管理部",
          roleLabel: "服务商管理员",
          roleId: "role-provider-admin",
          memberStatus: "active",
          activatedAt: "2026-08-20 09:12",
        },
        status: "suspended",
        statusChangedAt: "2026-09-10 10:00",
        statusReasonCode: "CONTRACT_HOLD",
        statusNote: "合作协议暂停，待续签后恢复（对外可展示文案）",
        createdAt: "2026-08-18 14:20",
        createdBy: "王敏",
      },
    ],
    codes: [
      { code: "N4PJ2XKM", enterpriseId: "org-rt-langseng", createdAt: "2026-09-01 15:30", createdBy: "王敏" },
      { code: "R8NV3KQ2", enterpriseId: "org-rt-yunxing", createdAt: "2026-09-11 11:05", createdBy: "王敏" },
      { code: "C5RJ8W2N", enterpriseId: "org-rt-taihe", createdAt: "2026-09-12 10:20", createdBy: "王敏" },
      { code: "H4TW9MXP", enterpriseId: "org-rt-qichen", createdAt: "2026-08-18 14:20", createdBy: "王敏" },
    ],
    orgs: [
      { id: "org-rt-langseng", name: "朗盛生物制药有限公司", type: "pharma" },
      { id: "org-rt-yunxing", name: "云杏生物医药有限公司", type: "pharma" },
      { id: "org-rt-taihe", name: "泰合医学推广有限公司", type: "provider" },
      { id: "org-rt-qichen", name: "启辰推广服务有限公司", type: "provider" },
    ],
    users: [
      {
        id: "u-rt-fengnan",
        name: "冯楠",
        account: "rt-fengnan",
        phone: "13809120120",
        email: "fengnan@langsengbio.com",
        orgId: "org-rt-langseng",
        orgName: "朗盛生物制药有限公司",
        accountStatus: "enabled",
        createdAt: "2026-09-01 15:30",
        lastLoginAt: "2026-09-14 09:12",
      },
      {
        id: "u-rt-zhouting",
        name: "周婷",
        account: "rt-zhouting",
        phone: "13809120116",
        email: "zhouting@yunxingbio.com",
        orgId: "org-rt-yunxing",
        orgName: "云杏生物医药有限公司",
        accountStatus: "enabled",
        createdAt: "2026-09-11 11:05",
      },
      {
        id: "u-rt-luojia",
        name: "骆佳",
        account: "rt-luojia",
        phone: "13809120119",
        email: "luojia@taihemedpromo.com",
        orgId: "org-rt-taihe",
        orgName: "泰合医学推广有限公司",
        accountStatus: "enabled",
        createdAt: "2026-09-12 10:20",
      },
      {
        id: "u-rt-zhengyanan",
        name: "郑亚楠",
        account: "rt-zhengyanan",
        phone: "13809120117",
        email: "zhengyanan@qichenpromo.com",
        orgId: "org-rt-qichen",
        orgName: "启辰推广服务有限公司",
        accountStatus: "enabled",
        createdAt: "2026-08-18 14:20",
        lastLoginAt: "2026-09-09 17:41",
      },
    ],
    assignments: [
      {
        id: "g-rt-01",
        tenantId: "org-rt-langseng",
        userId: "u-rt-fengnan",
        roleId: "role-pharma-admin",
        scopeOrgId: "org-rt-langseng",
        scopeOrgName: "朗盛生物制药有限公司",
        scope: "PHARMA",
        effectiveFrom: "2026-09-01",
        grantedBy: "王敏",
        grantedAt: "2026-09-01 15:30",
        status: "active",
        reason: "租户创建 · 首位管理员预置授权",
      },
      {
        id: "g-rt-02",
        tenantId: "org-rt-yunxing",
        userId: "u-rt-zhouting",
        roleId: "role-pharma-admin",
        scopeOrgId: "org-rt-yunxing",
        scopeOrgName: "云杏生物医药有限公司",
        scope: "PHARMA",
        effectiveFrom: "2026-09-11",
        grantedBy: "王敏",
        grantedAt: "2026-09-11 11:05",
        status: "active",
        reason: "租户创建 · 首位管理员预置授权",
      },
      {
        id: "g-rt-03",
        tenantId: "org-rt-taihe",
        userId: "u-rt-luojia",
        roleId: "role-provider-admin",
        scopeOrgId: "org-rt-taihe",
        scopeOrgName: "泰合医学推广有限公司",
        scope: "PROVIDER",
        effectiveFrom: "2026-09-12",
        grantedBy: "王敏",
        grantedAt: "2026-09-12 10:20",
        status: "active",
        reason: "租户创建 · 首位管理员预置授权",
      },
      {
        id: "g-rt-04",
        tenantId: "org-rt-qichen",
        userId: "u-rt-zhengyanan",
        roleId: "role-provider-admin",
        scopeOrgId: "org-rt-qichen",
        scopeOrgName: "启辰推广服务有限公司",
        scope: "PROVIDER",
        effectiveFrom: "2026-08-18",
        grantedBy: "王敏",
        grantedAt: "2026-08-18 14:20",
        status: "active",
        reason: "租户创建 · 首位管理员预置授权",
      },
    ],
    activityLog: [
      { id: nextId("tl"), at: "2026-09-02 09:40", actor: "冯楠", reasonCode: "TENANT_ACTIVATED", targetTenant: "朗盛生物", code: "N4PJ2XKM" },
      { id: nextId("tl"), at: "2026-09-10 10:00", actor: "王敏", reasonCode: "TENANT_SUSPENDED", targetTenant: "启辰推广", code: "H4TW9MXP", detail: "合作协议暂停：待续签后恢复" },
    ],
    memberships: [],
    deletedOrgIds: [],
  }
}

let state: TenantRegistryState = loadState()
const listeners = new Set<() => void>()

/** 可被原地升级的旧版数据（v3 / v4）：租户状态仍是旧四态取值，并带已下线的幂等/撞码演示字段 */
type LegacyRegistryState = Omit<TenantRegistryState, "version" | "tenants" | "memberships" | "deletedOrgIds"> & {
  version: number
  tenants: (Omit<TenantRecord, "status"> & { status: string })[]
  memberships?: TenantMembership[]
  deletedOrgIds?: string[]
  createIdempotency?: Record<string, { tenantId: string; requestId: string }>
  collisionDemoDone?: boolean
}

/**
 * v3/v4 → v5 原地升级（2026-11-24 状态收敛）：待激活租户转为正常；已终止租户在两态
 * 模型下无处安放，连同其企业根下的组织、用户、授权、企业码与流水一并移除；已下线
 * 操作（复制企业码 / 终止）的流水清除。组织、成员身份等其他数据原样保留。
 */
function upgradeLifecycle(legacy: LegacyRegistryState): TenantRegistryState {
  const droppedTenants = legacy.tenants.filter((t) => t.status === "terminated")
  const droppedNames = new Set(droppedTenants.map((t) => t.shortName))
  const droppedCodes = new Set(droppedTenants.map((t) => t.primaryCode))
  const droppedOrgIds = new Set(droppedTenants.map((t) => t.enterpriseOrgId))
  // 企业根下新建的部门随租户一并移除（按 parentId 逐层下钻，不依赖数组顺序）
  let grew = true
  while (grew) {
    grew = false
    for (const org of legacy.orgs) {
      if (!droppedOrgIds.has(org.id) && org.parentId && droppedOrgIds.has(org.parentId)) {
        droppedOrgIds.add(org.id)
        grew = true
      }
    }
  }
  // 剥离旧版已下线字段（幂等回执 / 撞码演示开关），企业码记录同步去掉 lifecycle
  const { createIdempotency: _idem, collisionDemoDone: _demo, ...rest } = legacy
  return {
    ...rest,
    version: 5,
    tenants: legacy.tenants
      .filter((t) => t.status !== "terminated")
      .map((t) => (t.status === "pending_activation" ? { ...t, status: "active" } : t)) as TenantRecord[],
    codes: legacy.codes
      .filter((c) => !droppedOrgIds.has(c.enterpriseId))
      .map(({ code, enterpriseId, createdAt, createdBy }) => ({ code, enterpriseId, createdAt, createdBy })),
    orgs: legacy.orgs.filter((o) => !droppedOrgIds.has(o.id)),
    users: legacy.users.filter((u) => !droppedOrgIds.has(u.orgId)),
    assignments: legacy.assignments.filter((a) => !droppedOrgIds.has(a.tenantId) && !droppedOrgIds.has(a.scopeOrgId)),
    activityLog: legacy.activityLog.filter(
      (l) =>
        !RETIRED_AUDIT_REASONS.has(l.reasonCode) &&
        !droppedNames.has(l.targetTenant) &&
        !(l.code !== undefined && droppedCodes.has(l.code)),
    ),
    memberships: (legacy.memberships ?? []).filter((m) => !droppedOrgIds.has(m.tenantId)),
    deletedOrgIds: legacy.deletedOrgIds ?? [],
  }
}

function loadState(): TenantRegistryState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TenantRegistryState
      if (parsed?.version === 5 && Array.isArray(parsed.tenants)) {
        // 同日早版 v5 数据可能带已下线字段（幂等/撞码演示）与已下线流水：读取时统一净化
        const { createIdempotency: _idem, collisionDemoDone: _demo, ...rest } = parsed as TenantRegistryState & {
          createIdempotency?: unknown
          collisionDemoDone?: unknown
        }
        return {
          ...rest,
          activityLog: rest.activityLog.filter((l) => !RETIRED_AUDIT_REASONS.has(l.reasonCode)),
          memberships: Array.isArray(parsed.memberships) ? parsed.memberships : [],
          deletedOrgIds: Array.isArray(parsed.deletedOrgIds) ? parsed.deletedOrgIds : [],
        }
      }
      return buildSeedState()
    }
    // v3 / v4 → v5 原地升级：组织 / 用户 / 授权 / 流水全部保留，仅收敛租户状态
    for (const key of LEGACY_STORAGE_KEYS) {
      const legacyRaw = window.localStorage.getItem(key)
      if (!legacyRaw) continue
      const parsed = JSON.parse(legacyRaw) as LegacyRegistryState
      if ((parsed?.version === 4 || parsed?.version === 3) && Array.isArray(parsed.tenants)) {
        const upgraded = upgradeLifecycle(parsed)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(upgraded))
        return upgraded
      }
    }
    return buildSeedState()
  } catch {
    return buildSeedState()
  }
}

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* 写失败静默降级：仅内存态演示 */
  }
}

function commit(next: Partial<TenantRegistryState>): void {
  state = { ...state, ...next }
  persist()
  listeners.forEach((cb) => cb())
}

/** 重置演示数据（仅租户管理页「恢复演示数据（仅演示）」使用；种子登录数据不受影响） */
export function resetTenantRegistry(): void {
  state = buildSeedState()
  persist()
  listeners.forEach((cb) => cb())
}

export function subscribeTenantRegistry(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getTenantRegistrySnapshot(): TenantRegistryState {
  return state
}

// ─── 统一只读视图（种子 + 运行时；mockGateway 的登录链路从这里取数） ────────

/**
 * 组织树唯一读口径：运行时表按 id 覆盖种子（种子部门的改名 / 调级 / 管理区域持久化
 * 都以覆盖副本形式进 state.orgs），不在种子里的运行时节点按原顺序追加。
 */
export function allOrgs(): PermOrg[] {
  const deleted = new Set(state.deletedOrgIds)
  const overrides = new Map(state.orgs.map((o) => [o.id, o] as const))
  const merged = PERM_ORGS.map((seed) => overrides.get(seed.id) ?? seed)
  const seedIds = new Set(PERM_ORGS.map((o) => o.id))
  for (const org of state.orgs) {
    if (!seedIds.has(org.id)) merged.push(org)
  }
  return merged.filter((o) => !deleted.has(o.id))
}

/**
 * 写入 / 覆盖一个运行时组织节点（部门新建、改名、调级、管理区域配置共用）。
 * 组织页 / PermissionContext 的部门 CRUD 必须经此落盘，否则登录链路看不见。
 */
export function upsertRuntimeOrg(org: PermOrg): void {
  const idx = state.orgs.findIndex((o) => o.id === org.id)
  const next = idx >= 0 ? state.orgs.map((o, i) => (i === idx ? { ...o, ...org } : o)) : [...state.orgs, org]
  commit({ orgs: next, deletedOrgIds: state.deletedOrgIds.filter((id) => id !== org.id) })
}

/**
 * 删除一个组织节点（组织架构页「删除部门」唯一落盘入口）。前置校验（无成员、
 * 无下级、无业务引用）由调用方完成；本函数只负责把运行时副本移走并记墓碑，
 * 保证刷新后种子节点不会被 allOrgs 回填。
 */
export function removeRuntimeOrg(orgId: string): void {
  commit({
    orgs: state.orgs.filter((o) => o.id !== orgId),
    deletedOrgIds: state.deletedOrgIds.includes(orgId) ? state.deletedOrgIds : [...state.deletedOrgIds, orgId],
  })
}

/** 运行时成员身份快照（cooperationModel 启动时据此覆盖种子 TENANT_MEMBERSHIPS） */
export function runtimeMemberships(): TenantMembership[] {
  return state.memberships
}

/** 成员身份全量快照落盘（cooperationModel 每次成员变更后调用；只持久化、不改语义） */
export function persistRuntimeMemberships(list: TenantMembership[]): void {
  commit({ memberships: list.map((m) => ({ ...m })) })
}

export function allUsers(): PermUser[] {
  return [...PERM_USERS, ...state.users]
}

export function allAssignments(): RoleAssignment[] {
  return [...seedAssignments, ...state.assignments]
}

/** 全量主企业码（种子 + 运行时；唯一性命名空间，无别名） */
export function allCodeRecords(): CodeRecord[] {
  const seedMapped: CodeRecord[] = ENTERPRISE_CODES.map((e) => ({
    code: e.code,
    enterpriseId: e.enterpriseId,
    createdAt: "2026-01-01 09:00",
    createdBy: "系统预置",
  }))
  return [...state.codes, ...seedMapped]
}

export interface ResolvedEnterprise {
  enterpriseId: string
  enterpriseName: string
  code: string
}

/**
 * 企业码解析（登录第一步消费）：仅未暂停租户可解析；其余一律返回 null，
 * 由调用方给统一失败文案（不暴露暂停原因）。
 */
export function resolveEnterpriseByCode(rawCode: string): ResolvedEnterprise | null {
  const code = rawCode.trim().toUpperCase()
  if (!code) return null
  const hit = allCodeRecords().find((c) => c.code.toUpperCase() === code)
  if (!hit) return null
  const tenant = state.tenants.find((t) => t.enterpriseOrgId === hit.enterpriseId)
  if (tenant && tenant.status === "suspended") return null
  const org = allOrgs().find((o) => o.id === hit.enterpriseId)
  if (!org) return null
  return {
    enterpriseId: org.id,
    enterpriseName: org.name,
    code: hit.code,
  }
}

/** 运行时企业级成员状态：首位管理员首次登录前为待激活（记在租户记录上，不在种子 AuthProfile） */
export function runtimeMemberStatus(userId: string, enterpriseId: string): "pending_activation" | undefined {
  const tenant = state.tenants.find((t) => t.enterpriseOrgId === enterpriseId)
  if (!tenant || tenant.initialAdmin.userId !== userId) return undefined
  return tenant.initialAdmin.memberStatus === "pending_activation" ? "pending_activation" : undefined
}

/**
 * 管理员首登激活：仅把首位管理员成员身份转为正常（租户创建即正常，状态不再联动）。
 * 原因码沿用 TENANT_ACTIVATED，以兼容已落盘的历史流水。
 */
export function completeRuntimeActivation(userId: string, enterpriseId: string): boolean {
  const tenant = state.tenants.find((t) => t.enterpriseOrgId === enterpriseId)
  if (!tenant || tenant.initialAdmin.userId !== userId) return false
  if (tenant.initialAdmin.memberStatus !== "pending_activation") return false
  commit({
    tenants: state.tenants.map((t) =>
      t.id === tenant.id
        ? { ...t, initialAdmin: { ...t.initialAdmin, memberStatus: "active", activatedAt: nowStamp() } }
        : t,
    ),
    activityLog: [
      { id: nextId("tl"), at: nowStamp(), actor: tenant.initialAdmin.name, reasonCode: "TENANT_ACTIVATED", targetTenant: tenant.shortName, code: tenant.primaryCode },
      ...state.activityLog,
    ],
  })
  return true
}

/** 登录链路校验用：租户是否允许日常登录（已暂停禁止新登录） */
export function tenantLoginAllowed(enterpriseId: string): boolean {
  const tenant = state.tenants.find((t) => t.enterpriseOrgId === enterpriseId)
  if (!tenant) return true
  return tenant.status !== "suspended"
}

// ─── 主企业码生成（全局唯一 + 冲突重试；生产为 DB 唯一约束 + 事务） ──────────

function randomCode(): string {
  let out = ""
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)]
  }
  return out
}

function isCodeTaken(code: string): boolean {
  const upper = code.toUpperCase()
  return allCodeRecords().some((c) => c.code.toUpperCase() === upper)
}

/**
 * 生成全局唯一主企业码：按全量命名空间（种子 + 运行时）查重、冲突自动重试，
 * 冲突码不外显、重试过程不留痕（2026-11-24 需求文档 §2.2）；生产由数据库
 * 唯一约束 + 事务保证。
 */
export function generateUniqueCode(): string {
  let code = randomCode()
  while (isCodeTaken(code)) code = randomCode()
  return code
}

// ─── 业务操作（全部返回审计流水，由调用方写入全局操作日志） ─────────────────

export interface OpResult {
  ok: boolean
  error?: string
  audits: TenantAuditLine[]
}

function audit(reasonCode: string, target: string, actor: string, extra?: { code?: string; detail?: string }): TenantAuditLine {
  return { id: nextId("tl"), at: nowStamp(), actor, reasonCode, targetTenant: target, ...extra }
}

export interface CreateTenantInput {
  type: TenantType
  profile: TenantSubjectProfile
  admin: TenantAdminDesignee
  /** 套餐与开通限制（2026-09-18 套餐模型；packageId 缺省回落默认套餐） */
  packageId?: string
  expireAt?: string
  userQuota?: number
  actor: string
}

export interface CreateTenantOutcome {
  ok: boolean
  error?: string
  tenant?: TenantRecord
  audits: TenantAuditLine[]
}

/** 该租户当前可登录的活跃成员数（状态操作审计里的受影响范围口径） */
function activeMemberCount(tenant: TenantRecord): number {
  return tenant.initialAdmin.memberStatus === "active" ? 1 : 0
}

/**
 * 直接创建租户（软件服务方侧主数据开户，无申请/审核流）：
 * 格式与重复主体校验由向导完成 → 原子创建企业根组织 + 全局唯一主码 +
 * 首位管理员（可直接登录）与预置授权 → 租户即「正常」→ 全程审计。
 */
export function createTenant(input: CreateTenantInput): CreateTenantOutcome {
  const uscc = input.profile.uscc.trim().toUpperCase()
  if (state.tenants.some((t) => t.uscc.toUpperCase() === uscc)) {
    return { ok: false, error: "该企业主体已存在租户，请先查看现有记录", audits: [] }
  }

  const adminRole = ADMIN_ROLE_BY_TYPE[input.type]
  const stamp = nowStamp()

  // 1) 生成全局唯一主码（冲突自动重试，冲突码不外显、不留痕）
  const code = generateUniqueCode()

  // 2) 原子创建：企业根 + 主码 + 首位管理员（用户 + 预置授权）+ 租户
  const enterpriseOrgId = `org-rt-${nextId("en").toLowerCase()}`
  const userId = `u-rt-${nextId("ua").toLowerCase()}`
  const tenantId = `tenant-${nextId("tn").toLowerCase()}`
  // 登录账号：企业内唯一口径。新租户命名空间全新不存在撞号，格式不合法时回落 rt-手机后4位
  const adminAccount = ACCOUNT_PATTERN.test(input.admin.account?.trim() ?? "")
    ? (input.admin.account as string).trim()
    : defaultRuntimeAccount(input.admin.phone)
  const org: PermOrg = { id: enterpriseOrgId, name: input.profile.legalName, type: input.type }
  const user: PermUser = {
    id: userId,
    name: input.admin.name,
    account: adminAccount,
    phone: input.admin.phone,
    email: "",
    orgId: enterpriseOrgId,
    orgName: input.profile.legalName,
    accountStatus: "enabled",
    createdAt: stamp,
  }
  const assignment: RoleAssignment = {
    id: nextId("g"),
    tenantId: enterpriseOrgId,
    userId,
    roleId: adminRole.roleId,
    scopeOrgId: enterpriseOrgId,
    scopeOrgName: input.profile.legalName,
    scope: input.type === "pharma" ? "PHARMA" : "PROVIDER",
    effectiveFrom: stamp.slice(0, 10),
    grantedBy: input.actor,
    grantedAt: stamp,
    status: "active",
    reason: "租户创建 · 首位管理员预置授权",
  }
  const tenant: TenantRecord = {
    id: tenantId,
    type: input.type,
    legalName: input.profile.legalName,
    shortName: input.profile.shortName,
    uscc,
    enterpriseOrgId,
    primaryCode: code,
    profile: { ...input.profile, uscc },
    initialAdmin: {
      userId,
      name: input.admin.name,
      phone: input.admin.phone,
      department: input.admin.department,
      roleLabel: adminRole.roleLabel,
      roleId: adminRole.roleId,
      memberStatus: "active",
      activatedAt: stamp,
    },
    status: "active",
    statusChangedAt: stamp,
    packageId: input.packageId,
    expireAt: input.expireAt || undefined,
    userQuota: input.userQuota,
    createdAt: stamp,
    createdBy: input.actor,
  }
  const codeRecord: CodeRecord = { code, enterpriseId: enterpriseOrgId, createdAt: stamp, createdBy: input.actor }
  const shortName = input.profile.shortName
  const audits: TenantAuditLine[] = [
    audit("TENANT_CREATED", shortName, input.actor, { code }),
    audit("ENT_CODE_PRIMARY_GENERATED", shortName, input.actor, { code }),
    audit("INITIAL_ADMIN_CREATED", shortName, input.actor, { detail: `${input.admin.name} · ${maskPhoneLocal(input.admin.phone)}` }),
    audit("TENANT_PACKAGE_BOUND", shortName, input.actor, {
      detail: `${input.packageId ? "绑定套餐" : "按默认套餐开通"}${input.expireAt ? ` · 有效期至 ${input.expireAt}` : " · 永久有效"}${input.userQuota != null && input.userQuota >= 0 ? ` · 用户限额 ${input.userQuota}` : ""}`,
    }),
  ]

  commit({
    tenants: [tenant, ...state.tenants],
    codes: [codeRecord, ...state.codes],
    orgs: [...state.orgs, org],
    users: [...state.users, user],
    assignments: [...state.assignments, assignment],
    activityLog: [...audits.slice().reverse(), ...state.activityLog],
  })
  return { ok: true, tenant, audits }
}

// ─── 租户生命周期（暂停 / 恢复，原因码 + 必填说明写审计） ────────────────────

/**
 * 暂停租户（2026-11-24 需求文档 §2.1：操作原因必填、非空校验；标准原因码
 * 为快捷选项，与说明一并写入审计）。暂停后全员禁止新登录，可恢复。
 */
export function suspendTenant(tenantId: string, reasonCode: string, note: string, actor: string): OpResult {
  const tenant = state.tenants.find((t) => t.id === tenantId)
  if (!tenant || tenant.status !== "active") return { ok: false, error: "仅正常状态租户可暂停", audits: [] }
  const reasonLabel = SUSPEND_REASON_OPTIONS.find((r) => r.code === reasonCode)?.label ?? reasonCode
  const affected = activeMemberCount(tenant)
  const line = audit("TENANT_SUSPENDED", tenant.shortName, actor, {
    code: tenant.primaryCode,
    detail: `${reasonLabel}${note ? `：${note}` : ""} · 受影响：${affected} 名活跃成员禁止新登录`,
  })
  commit({
    tenants: state.tenants.map((t) =>
      t.id === tenantId
        ? { ...t, status: "suspended", statusChangedAt: nowStamp(), statusReasonCode: reasonCode, statusNote: note }
        : t,
    ),
    // 暂停：主码解析随租户状态阻断（由 resolveEnterpriseByCode 判定）
    activityLog: [line, ...state.activityLog],
  })
  return { ok: true, audits: [line] }
}

/** 恢复租户（操作原因必填）：恢复后主码立即恢复登录解析，权限按当前状态重算 */
export function resumeTenant(tenantId: string, reasonCode: string, note: string, actor: string): OpResult {
  const tenant = state.tenants.find((t) => t.id === tenantId)
  if (!tenant || tenant.status !== "suspended") return { ok: false, error: "仅已暂停租户可恢复", audits: [] }
  const reasonLabel = RESUME_REASON_OPTIONS.find((r) => r.code === reasonCode)?.label ?? reasonCode
  const line = audit("TENANT_REACTIVATED", tenant.shortName, actor, {
    code: tenant.primaryCode,
    detail: `${reasonLabel}${note ? `：${note}` : ""} · 恢复后按成员、角色与业务授权当前状态重新计算权限`,
  })
  commit({
    tenants: state.tenants.map((t) =>
      t.id === tenantId
        ? { ...t, status: "active", statusChangedAt: nowStamp(), statusReasonCode: reasonCode, statusNote: note }
        : t,
    ),
    activityLog: [line, ...state.activityLog],
  })
  return { ok: true, audits: [line] }
}

// ─── 查重 ────────────────────────────────────────────────────────────────────

/** 统一社会信用代码查重（向导实时校验用） */
export function isUsccTaken(uscc: string): boolean {
  const target = uscc.trim().toUpperCase()
  return state.tenants.some((t) => t.uscc.toUpperCase() === target)
}

// ─── 套餐与开通限制（2026-09-18 移植 RuoYi 租户套餐模型） ─────────────────────

/**
 * 更换租户套餐（详情页操作）：套餐存在性/启用态由调用方（页面）经 tenantPackages
 * 校验，本函数只落字段与审计；换绑即时生效（visiblePages 实时按套餐求交）。
 */
export function changeTenantPackage(tenantId: string, packageId: string, packageLabel: string, actor: string): OpResult {
  const tenant = state.tenants.find((t) => t.id === tenantId)
  if (!tenant) return { ok: false, error: "租户不存在", audits: [] }
  const line = audit("TENANT_PACKAGE_CHANGED", tenant.shortName, actor, {
    detail: `套餐换绑为「${packageLabel}」，即时生效`,
  })
  commit({
    tenants: state.tenants.map((t) => (t.id === tenantId ? { ...t, packageId } : t)),
    activityLog: [line, ...state.activityLog],
  })
  return { ok: true, audits: [line] }
}

/** 按企业组织根 id 取租户记录（登录链路的过期/状态校验消费） */
export function tenantByEnterpriseOrgId(enterpriseOrgId: string): TenantRecord | undefined {
  return state.tenants.find((t) => t.enterpriseOrgId === enterpriseOrgId)
}

/** 租户开通是否已过期（expireAt 早于今天；缺省=永久） */
export function tenantExpired(tenant: TenantRecord): boolean {
  if (!tenant.expireAt) return false
  const today = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  const todayStr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`
  return tenant.expireAt < todayStr
}

/** 租户当前在册用户数（限额校验口径：种子 + 运行时用户，按企业组织根归集） */
export function tenantUserCount(enterpriseOrgId: string): number {
  return allUsers().filter((u) => u.orgId === enterpriseOrgId && u.accountStatus !== "disabled").length
}

/**
 * 建号限额信息（企业侧新建用户入口消费）：
 * quota=null 表示不限制；used=注册中心口径的在册用户数（调用方需自行加上
 * 本地会话新建、尚未落入注册中心的用户数后再与 quota 比较）。
 */
export function tenantQuotaInfo(enterpriseOrgId: string): { quota: number | null; used: number } {
  const tenant = state.tenants.find((t) => t.enterpriseOrgId === enterpriseOrgId)
  if (!tenant) return { quota: null, used: 0 }
  const quota = tenant.userQuota
  if (quota == null || quota < 0) return { quota: null, used: 0 }
  return { quota, used: tenantUserCount(enterpriseOrgId) }
}

// ─── 登录账号（account）共享校验（2026-09-18 账号密码登录整改） ──────────────
// 口径拍板：账号在企业内唯一——登录=企业编码+账号+密码联合定位；
// 同一账号可在不同企业重复。数据源恒为 allUsers()（种子 + 运行时，含 rt- 管理员）。

/** 登录账号格式：3-20 位小写字母/数字，可含 - 与 _（创建入口输入过滤与校验共用） */
export const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9_-]{2,19}$/

/** 运行时账号默认形态：rt- + 手机后 4 位（建租户首位管理员预填值，可改） */
export function defaultRuntimeAccount(phone: string): string {
  return `rt-${phone.slice(-4)}`
}

/**
 * 账号在本工作空间（企业）内是否已被占用。工作空间 id 即企业组织根 id
 * （平台=org-platform），用户按 orgId 上溯到企业根后比对；
 * 用户管理 / 建租户向导 / 变更首位管理员的实时校验与 PermissionContext.createUser
 * 落库兜底共用本函数，避免各自为政漏查 rt- 运行时账号。
 */
export function isAccountTakenInWorkspace(
  account: string,
  workspaceId: string,
  excludeUserId?: string,
): boolean {
  const target = account.trim().toLowerCase()
  if (!target) return false
  const orgs = allOrgs()
  return allUsers().some((u) => {
    if (u.id === excludeUserId) return false
    if (u.account.toLowerCase() !== target) return false
    return enterpriseRootOf(orgs, u.orgId)?.id === workspaceId
  })
}

/** 手机号在本工作空间内是否已被占用（与账号同口径：企业内唯一，跨企业允许分别建档） */
export function isPhoneTakenInWorkspace(
  phone: string,
  workspaceId: string,
  excludeUserId?: string,
): boolean {
  const target = phone.trim()
  if (!target) return false
  const orgs = allOrgs()
  return allUsers().some((u) => {
    if (u.id === excludeUserId) return false
    if (u.phone !== target) return false
    return enterpriseRootOf(orgs, u.orgId)?.id === workspaceId
  })
}

function maskPhoneLocal(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone
}

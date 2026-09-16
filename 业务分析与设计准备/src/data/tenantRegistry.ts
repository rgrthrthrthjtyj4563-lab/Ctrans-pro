/**
 * 租户注册中心（多租户平台侧 · 运行时注册表，2026-09-15 深度审核整改版）。
 *
 * 职责：平台系统管理员「直接创建租户（原子建租：生成全局唯一主企业码 + 首位管理员
 * 待激活 + 预置授权）→ 管理员首次登录激活 → 租户生命周期（待激活/正常/
 * 已暂停/已终止）」的全部 mock 数据与业务规则。药厂与服务商共用同一套机制，
 * 仅以 type 区分扩展字段与默认管理员角色；企业码不带任何业务语义。
 *
 * 2026-09-15 整改拍板（见《多租户平台企业码与服务商可见范围-深度审核与解决
 * 方案 0915》）：平台直接创建、不套申请—审核—补正流程；一个租户只有一个
 * 主企业码（无别名码全链路）；无「重发激活提醒」（首次登录本身即激活触发点）；
 * 状态机收敛为四态；暂停/恢复/终止一律要求原因码 + 说明并写审计。
 *
 * 生产口径（原型注释，勿当真实能力）：本文件的全部状态保存在内存 +
 * localStorage 演示；真实系统由服务端与数据库完成——主码唯一性用 DB 唯一
 * 约束保证、建租与发码在同一数据库事务内、localStorage 仅承载演示期数据，
 * 不承载任何安全语义。
 */

import type { PermOrg, PermUser, RoleAssignment } from "./permissions"
import { PERM_ORGS, PERM_USERS, seedAssignments, nextId, nowStamp } from "./permissions"
import { ENTERPRISE_CODES } from "../auth/authProfiles"

// ─── 模型 ────────────────────────────────────────────────────────────────────

export type TenantType = "pharma" | "provider"

/** 租户生命周期（四态：待激活 → 正常 ⇄ 已暂停 → 已终止） */
export type TenantLifecycleStatus =
  | "pending_activation"
  | "active"
  | "suspended"
  | "terminated"

/** 主企业码生命周期：active = 可解析；retired = 终止后永久保留、不得重新分配 */
export type CodeLifecycle = "active" | "retired"

/** 企业主体资料（通用字段 + 按类型的扩展字段；平台留档与基础校验用，非审核流） */
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
  complianceContact?: string
  // 服务商扩展（服务类型/经营范围已按 2026-09-15 拍板删除）
  bizOwner?: string
  complianceOwner?: string
  qualificationNo?: string
  qualificationValidTo?: string
}

export interface TenantAdminDesignee {
  name: string
  phone: string
  department: string
  /** 展示用角色名（实际授权角色由租户类型推导） */
  roleLabel: string
}

export interface CodeRecord {
  code: string
  enterpriseId: string
  lifecycle: CodeLifecycle
  createdAt: string
  createdBy: string
  note?: string
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
    department: string
    roleLabel: string
    roleId: string
    memberStatus: "pending_activation" | "active"
    activatedAt?: string
  }
  status: TenantLifecycleStatus
  statusChangedAt: string
  /** 最近一次状态操作的原因码与说明（暂停/恢复/终止均必填，写审计） */
  statusReasonCode?: string
  statusNote?: string
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
  version: 3
  tenants: TenantRecord[]
  codes: CodeRecord[]
  orgs: PermOrg[]
  users: PermUser[]
  assignments: RoleAssignment[]
  /** 租户侧操作流水（详情页「操作日志」页签展示；全局审计另走操作日志页） */
  activityLog: TenantAuditLine[]
  /** 幂等键（type+uscc）→ 已执行的建租结果（连续点击/刷新重放不重复建租） */
  createIdempotency: Record<string, { tenantId: string; requestId: string }>
  /** 发码冲突重演开关：首次运行时生成触发一次可演示的冲突重试 */
  collisionDemoDone: boolean
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 主企业码字符集：8 位大写字母数字，排除易混 0/O、1/I，无业务语义 */
const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 8

/** 租户暂停标准原因（暂停/恢复/终止均要求原因码 + 说明，方案 §3.4） */
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

export const TERMINATE_REASON_OPTIONS = [
  { code: "CONTRACT_ENDED", label: "合作协议终止" },
  { code: "SUBJECT_DEREGISTERED", label: "企业主体注销" },
  { code: "RISK_CONFIRMED", label: "合规风险坐实清退" },
  { code: "OWNER_REQUEST", label: "企业主动退出平台" },
] as const

export const TENANT_STATUS_LABEL: Record<TenantLifecycleStatus, string> = {
  pending_activation: "待激活",
  active: "正常",
  suspended: "已暂停",
  terminated: "已终止",
}

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

// v3：2026-09-15 收敛版（平台唯一角色/演示登录租户并入种子）；旧数据直接作废重建种子
const STORAGE_KEY = "baiyee-tenant-registry-v3"

function buildSeedState(): TenantRegistryState {
  return {
    version: 3,
    // 演示种子：① 演示登录用药厂/服务商（与登录页企业码同一份登记，平台必须可查）
    //          ② 运行时租户覆盖四态可验证路径（正常/待激活/已暂停/已终止）
    // 正常（朗盛）· 待激活药厂（云杏）· 待激活服务商（泰合）· 已暂停（启辰）· 已终止（泽江）
    tenants: [
      // ── 演示登录租户：与登录页企业码（authProfiles.ENTERPRISE_CODES）同一编号空间，
      //    平台「租户管理」必须能查到全部演示登录用租户（登录与平台共用本登记数据）
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
          complianceContact: "赵宁",
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
      // ── 运行时租户：覆盖四态可验证路径
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
          complianceContact: "许倩",
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
          complianceContact: "沈玉兰",
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
        status: "pending_activation",
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
          remark: "服务商待激活演示路径",
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
        status: "pending_activation",
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
      {
        id: "tenant-legacy-zejiang",
        type: "pharma",
        legalName: "泽江药业（已终止合作）",
        shortName: "泽江药业",
        uscc: "91320400MA0WJ3HT6F",
        enterpriseOrgId: "org-rt-zejiang",
        primaryCode: "7KQ2VXBM",
        profile: {
          legalName: "泽江药业（已终止合作）",
          shortName: "泽江药业",
          uscc: "91320400MA0WJ3HT6F",
          address: "江苏省常州市新北区汉江路 168 号",
          contactName: "邵峰",
          contactPhone: "13809120118",
          licenseAttachment: "营业执照-泽江药业.pdf（模拟附件）",
        },
        initialAdmin: {
          userId: "u-rt-shaofeng",
          name: "邵峰",
          phone: "13809120118",
          department: "行政部",
          roleLabel: "企业管理员",
          roleId: "role-pharma-admin",
          memberStatus: "active",
          activatedAt: "2025-02-10 10:00",
        },
        status: "terminated",
        statusChangedAt: "2026-06-30 18:00",
        statusReasonCode: "CONTRACT_ENDED",
        statusNote: "合作协议到期未续约，终止合作",
        createdAt: "2025-01-20 09:00",
        createdBy: "王敏",
      },
    ],
    codes: [
      { code: "N4PJ2XKM", enterpriseId: "org-rt-langseng", lifecycle: "active", createdAt: "2026-09-01 15:30", createdBy: "王敏" },
      { code: "R8NV3KQ2", enterpriseId: "org-rt-yunxing", lifecycle: "active", createdAt: "2026-09-11 11:05", createdBy: "王敏" },
      { code: "C5RJ8W2N", enterpriseId: "org-rt-taihe", lifecycle: "active", createdAt: "2026-09-12 10:20", createdBy: "王敏" },
      { code: "H4TW9MXP", enterpriseId: "org-rt-qichen", lifecycle: "active", createdAt: "2026-08-18 14:20", createdBy: "王敏" },
      // 已终止租户的主码：retired，永久保留、不得重新分配
      { code: "7KQ2VXBM", enterpriseId: "org-rt-zejiang", lifecycle: "retired", createdAt: "2025-01-20 09:00", createdBy: "王敏", note: "租户已终止，主码永久停用" },
    ],
    orgs: [
      { id: "org-rt-langseng", name: "朗盛生物制药有限公司", type: "pharma" },
      { id: "org-rt-yunxing", name: "云杏生物医药有限公司", type: "pharma" },
      { id: "org-rt-taihe", name: "泰合医学推广有限公司", type: "provider" },
      { id: "org-rt-qichen", name: "启辰推广服务有限公司", type: "provider" },
      { id: "org-rt-zejiang", name: "泽江药业（已终止合作）", type: "pharma" },
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
      {
        id: "u-rt-shaofeng",
        name: "邵峰",
        account: "rt-shaofeng",
        phone: "13809120118",
        email: "shaofeng@zejiangpharma.com",
        orgId: "org-rt-zejiang",
        orgName: "泽江药业（已终止合作）",
        accountStatus: "disabled",
        createdAt: "2025-01-20 09:00",
        lastLoginAt: "2026-06-29 15:02",
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
      {
        id: "g-rt-05",
        tenantId: "org-rt-zejiang",
        userId: "u-rt-shaofeng",
        roleId: "role-pharma-admin",
        scopeOrgId: "org-rt-zejiang",
        scopeOrgName: "泽江药业（已终止合作）",
        scope: "PHARMA",
        effectiveFrom: "2025-01-20",
        effectiveTo: "2026-06-30",
        grantedBy: "王敏",
        grantedAt: "2025-01-20 09:00",
        status: "revoked",
        revokedBy: "王敏",
        revokedAt: "2026-06-30 18:00",
        reason: "租户终止，授权回收",
      },
    ],
    activityLog: [
      { id: nextId("tl"), at: "2026-09-02 09:40", actor: "冯楠", reasonCode: "TENANT_ACTIVATED", targetTenant: "朗盛生物", code: "N4PJ2XKM" },
      { id: nextId("tl"), at: "2026-09-10 10:00", actor: "王敏", reasonCode: "TENANT_SUSPENDED", targetTenant: "启辰推广", code: "H4TW9MXP", detail: "合作协议暂停：待续签后恢复" },
      { id: nextId("tl"), at: "2026-06-30 18:00", actor: "王敏", reasonCode: "TENANT_TERMINATED", targetTenant: "泽江药业", code: "7KQ2VXBM", detail: "合作协议终止：企业码永久停用，历史记录保留" },
    ],
    createIdempotency: {},
    collisionDemoDone: false,
  }
}

let state: TenantRegistryState = loadState()
const listeners = new Set<() => void>()

function loadState(): TenantRegistryState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildSeedState()
    const parsed = JSON.parse(raw) as TenantRegistryState
    if (parsed?.version !== 3 || !Array.isArray(parsed.tenants)) {
      return buildSeedState()
    }
    return parsed
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

export function allOrgs(): PermOrg[] {
  return [...PERM_ORGS, ...state.orgs]
}

export function allUsers(): PermUser[] {
  return [...PERM_USERS, ...state.users]
}

export function allAssignments(): RoleAssignment[] {
  return [...seedAssignments, ...state.assignments]
}

/** 全量主企业码（含种子 + 运行时全部生命周期状态；唯一性命名空间，无别名） */
export function allCodeRecords(): CodeRecord[] {
  const seedMapped: CodeRecord[] = ENTERPRISE_CODES.map((e) => ({
    code: e.code,
    enterpriseId: e.enterpriseId,
    lifecycle: e.enabled ? "active" : "retired",
    createdAt: "2026-01-01 09:00",
    createdBy: "系统预置",
  }))
  return [...state.codes, ...seedMapped]
}

export interface ResolvedEnterprise {
  enterpriseId: string
  enterpriseName: string
  code: string
  lifecycle: CodeLifecycle
  tenantStatus: TenantLifecycleStatus | "seed"
}

/**
 * 企业码解析（登录第一步消费）：仅 lifecycle=active 且租户未暂停/终止时可解析；
 * 其余一律返回 null，由调用方给统一失败文案（不暴露暂停原因）。
 */
export function resolveEnterpriseByCode(rawCode: string): ResolvedEnterprise | null {
  const code = rawCode.trim().toUpperCase()
  if (!code) return null
  const hit = allCodeRecords().find((c) => c.code.toUpperCase() === code)
  if (!hit || hit.lifecycle !== "active") return null
  const tenant = state.tenants.find((t) => t.enterpriseOrgId === hit.enterpriseId)
  if (tenant && (tenant.status === "suspended" || tenant.status === "terminated")) return null
  const org = allOrgs().find((o) => o.id === hit.enterpriseId)
  if (!org) return null
  return {
    enterpriseId: org.id,
    enterpriseName: org.name,
    code: hit.code,
    lifecycle: hit.lifecycle,
    tenantStatus: tenant?.status ?? "seed",
  }
}

/** 运行时企业级成员状态（首位管理员待激活在租户记录上，不在种子 AuthProfile） */
export function runtimeMemberStatus(userId: string, enterpriseId: string): "pending_activation" | "frozen" | undefined {
  const tenant = state.tenants.find((t) => t.enterpriseOrgId === enterpriseId)
  if (!tenant || tenant.initialAdmin.userId !== userId) return undefined
  if (tenant.status === "terminated") return "frozen"
  return tenant.initialAdmin.memberStatus === "pending_activation" ? "pending_activation" : undefined
}

/** 管理员激活联动：成员转正常 + 租户 pending_activation → active */
export function completeRuntimeActivation(userId: string, enterpriseId: string): boolean {
  const tenant = state.tenants.find((t) => t.enterpriseOrgId === enterpriseId)
  if (!tenant || tenant.initialAdmin.userId !== userId) return false
  if (tenant.initialAdmin.memberStatus !== "pending_activation") return false
  commit({
    tenants: state.tenants.map((t) =>
      t.id === tenant.id
        ? {
            ...t,
            initialAdmin: { ...t.initialAdmin, memberStatus: "active", activatedAt: nowStamp() },
            status: "active",
            statusChangedAt: nowStamp(),
          }
        : t,
    ),
    activityLog: [
      { id: nextId("tl"), at: nowStamp(), actor: tenant.initialAdmin.name, reasonCode: "TENANT_ACTIVATED", targetTenant: tenant.shortName, code: tenant.primaryCode },
      ...state.activityLog,
    ],
  })
  return true
}

/** 登录链路校验用：租户是否允许日常登录（暂停/终止禁止新登录） */
export function tenantLoginAllowed(enterpriseId: string): boolean {
  const tenant = state.tenants.find((t) => t.enterpriseOrgId === enterpriseId)
  if (!tenant) return true
  return tenant.status !== "suspended" && tenant.status !== "terminated"
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
 * 生成全局唯一主企业码：按全量命名空间（种子 + 运行时，含 retired）查重、
 * 冲突自动重试且冲突码不展示给用户。每个演示周期首次生成时注入一次确定性
 * 冲突（先产出与退役码 7KQ2VXBM 相同的码）以演示 ENT_CODE_COLLISION_RETRIED
 * 审计与重试路径；生产由数据库唯一约束 + 事务保证。
 */
export function generateUniqueCode(): { code: string; collisions: number } {
  let collisions = 0
  let code = randomCode()
  if (!state.collisionDemoDone) {
    code = "7KQ2VXBM"
    commit({ collisionDemoDone: true })
  }
  while (isCodeTaken(code)) {
    collisions += 1
    code = randomCode()
  }
  return { code, collisions }
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
  actor: string
}

export interface CreateTenantOutcome {
  ok: boolean
  error?: string
  /** 幂等重放时 replayed=true，不重复建租/发码 */
  replayed: boolean
  tenant?: TenantRecord
  collisions: number
  audits: TenantAuditLine[]
}

/** 该租户当前可登录的活跃成员数（状态操作审计里的受影响范围口径） */
function activeMemberCount(tenant: TenantRecord): number {
  if (tenant.status === "terminated") return 0
  return tenant.initialAdmin.memberStatus === "active" ? 1 : 0
}

/**
 * 直接创建租户（平台侧主数据开户，无申请/审核流）：
 * 格式与重复主体校验由向导完成 → 原子创建企业根组织 + 全局唯一主码 +
 * 首位管理员待激活成员与预置授权 → 租户 pending_activation → 全程审计。
 * 幂等键绑定 type+uscc：连续点击、刷新后重放均返回同一租户。
 */
export function createTenant(input: CreateTenantInput): CreateTenantOutcome {
  const uscc = input.profile.uscc.trim().toUpperCase()
  if (state.tenants.some((t) => t.uscc.toUpperCase() === uscc)) {
    const idemKey = `${input.type}:${uscc}`
    const replay = state.createIdempotency[idemKey]
    if (replay) {
      const existing = state.tenants.find((t) => t.id === replay.tenantId)
      if (existing && existing.uscc.toUpperCase() === uscc) {
        return { ok: true, replayed: true, tenant: existing, collisions: 0, audits: [] }
      }
    }
    return { ok: false, error: "该企业主体已存在租户，请先查看现有记录", replayed: false, collisions: 0, audits: [] }
  }

  const adminRole = ADMIN_ROLE_BY_TYPE[input.type]
  const stamp = nowStamp()
  const idemKey = `${input.type}:${uscc}`

  // 1) 生成全局唯一主码（冲突自动重试，冲突码不外显）
  const { code, collisions } = generateUniqueCode()

  // 2) 原子创建：企业根 + 主码 + 首位管理员（用户 + 待激活状态 + 预置授权）+ 租户
  const enterpriseOrgId = `org-rt-${nextId("en").toLowerCase()}`
  const userId = `u-rt-${nextId("ua").toLowerCase()}`
  const tenantId = `tenant-${nextId("tn").toLowerCase()}`
  const org: PermOrg = { id: enterpriseOrgId, name: input.profile.legalName, type: input.type }
  const user: PermUser = {
    id: userId,
    name: input.admin.name,
    account: `rt-${input.admin.phone.slice(-4)}`,
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
      memberStatus: "pending_activation",
    },
    status: "pending_activation",
    statusChangedAt: stamp,
    createdAt: stamp,
    createdBy: input.actor,
  }
  const codeRecord: CodeRecord = { code, enterpriseId: enterpriseOrgId, lifecycle: "active", createdAt: stamp, createdBy: input.actor }
  const shortName = input.profile.shortName
  const audits: TenantAuditLine[] = [
    audit("TENANT_CREATED", shortName, input.actor, { code }),
    audit("ENT_CODE_PRIMARY_GENERATED", shortName, input.actor, { code }),
    ...(collisions > 0 ? [audit("ENT_CODE_COLLISION_RETRIED", shortName, input.actor, { code, detail: `冲突重试 ${collisions} 次后生成唯一码` })] : []),
    audit("INITIAL_ADMIN_CREATED", shortName, input.actor, { detail: `${input.admin.name} · ${maskPhoneLocal(input.admin.phone)}` }),
  ]

  commit({
    tenants: [tenant, ...state.tenants],
    codes: [codeRecord, ...state.codes],
    orgs: [...state.orgs, org],
    users: [...state.users, user],
    assignments: [...state.assignments, assignment],
    createIdempotency: { ...state.createIdempotency, [idemKey]: { tenantId, requestId: nextId("req") } },
    activityLog: [...audits.slice().reverse(), ...state.activityLog],
  })
  return { ok: true, replayed: false, tenant, collisions, audits }
}

// ─── 企业码复制审计（主码只读：仅复制与查看，无编辑/重生成/别名） ────────────

/** 企业码复制审计（复制动作本身在页面完成，这里只落审计） */
export function auditCodeCopy(code: string, actor: string): TenantAuditLine {
  const tenant = state.tenants.find((t) => t.primaryCode === code)
  const line = audit("ENT_CODE_COPIED", tenant?.shortName ?? "种子租户", actor, { code })
  commit({ activityLog: [line, ...state.activityLog] })
  return line
}

// ─── 租户生命周期（暂停/恢复/终止均要求原因码 + 说明，写审计） ────────────────

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
      t.id === tenantId ? { ...t, status: "suspended", statusChangedAt: nowStamp(), statusReasonCode: reasonCode, statusNote: note } : t,
    ),
    // 暂停：主码解析随租户状态阻断（lifecycle 保持 active，由 resolveEnterpriseByCode 判定）
    activityLog: [line, ...state.activityLog],
  })
  return { ok: true, audits: [line] }
}

export function resumeTenant(tenantId: string, reasonCode: string, note: string, actor: string): OpResult {
  const tenant = state.tenants.find((t) => t.id === tenantId)
  if (!tenant || tenant.status !== "suspended") return { ok: false, error: "仅已暂停租户可恢复", audits: [] }
  const reasonLabel = RESUME_REASON_OPTIONS.find((r) => r.code === reasonCode)?.label ?? reasonCode
  const line = audit("TENANT_REACTIVATED", tenant.shortName, actor, {
    code: tenant.primaryCode,
    detail: `${reasonLabel}${note ? `：${note}` : ""} · 恢复后按成员、角色与业务授权当前状态重新计算权限`,
  })
  commit({
    tenants: state.tenants.map((t) => t.id === tenantId ? { ...t, status: "active", statusChangedAt: nowStamp(), statusReasonCode: reasonCode, statusNote: note } : t),
    activityLog: [line, ...state.activityLog],
  })
  return { ok: true, audits: [line] }
}

export function terminateTenant(tenantId: string, reasonCode: string, note: string, actor: string): OpResult {
  const tenant = state.tenants.find((t) => t.id === tenantId)
  if (!tenant || tenant.status !== "suspended") return { ok: false, error: "仅已暂停租户可终止（先暂停再终止）", audits: [] }
  const reasonLabel = TERMINATE_REASON_OPTIONS.find((r) => r.code === reasonCode)?.label ?? reasonCode
  const line = audit("TENANT_TERMINATED", tenant.shortName, actor, {
    code: tenant.primaryCode,
    detail: `${reasonLabel}${note ? `：${note}` : ""} · 主企业码永久停用（retired），历史记录保留`,
  })
  commit({
    tenants: state.tenants.map((t) => t.id === tenantId ? { ...t, status: "terminated", statusChangedAt: nowStamp(), statusReasonCode: reasonCode, statusNote: note } : t),
    // 终止：主码 → retired，永久保留且不得重新分配
    codes: state.codes.map((c) => (c.enterpriseId === tenant.enterpriseOrgId ? { ...c, lifecycle: "retired" } : c)),
    activityLog: [line, ...state.activityLog],
  })
  return { ok: true, audits: [line] }
}

// ─── 首位管理员运维 ──────────────────────────────────────────────────────────

/** 变更首位管理员：旧邀请失效（回收预置授权），新管理员得到新的待激活关系 */
export function changeInitialAdmin(tenantId: string, admin: TenantAdminDesignee, reason: string, actor: string): OpResult {
  const tenant = state.tenants.find((t) => t.id === tenantId)
  if (!tenant || tenant.status !== "pending_activation") return { ok: false, error: "仅待激活租户可变更首位管理员", audits: [] }
  if (admin.phone === tenant.initialAdmin.phone) return { ok: false, error: "新管理员手机号与当前一致", audits: [] }
  const stamp = nowStamp()
  const adminRole = ADMIN_ROLE_BY_TYPE[tenant.type]
  const newUserId = `u-rt-${nextId("ua").toLowerCase()}`
  const lines = [
    audit("INITIAL_ADMIN_CHANGED", tenant.shortName, actor, {
      detail: `${tenant.initialAdmin.name} → ${admin.name} · ${maskPhoneLocal(admin.phone)}（旧邀请失效）${reason ? ` · 原因：${reason}` : ""}`,
    }),
  ]
  commit({
    tenants: state.tenants.map((t) =>
      t.id === tenantId
        ? {
            ...t,
            initialAdmin: {
              userId: newUserId,
              name: admin.name,
              phone: admin.phone,
              department: admin.department,
              roleLabel: adminRole.roleLabel,
              roleId: adminRole.roleId,
              memberStatus: "pending_activation",
            },
          }
        : t,
    ),
    // 旧管理员：授权回收 + 账号停用（邀请失效）；新管理员建档 + 待激活授权
    users: [
      ...state.users.map((u) => (u.id === tenant.initialAdmin.userId ? { ...u, accountStatus: "disabled" as const } : u)),
      {
        id: newUserId,
        name: admin.name,
        account: `rt-${admin.phone.slice(-4)}`,
        phone: admin.phone,
        email: "",
        orgId: tenant.enterpriseOrgId,
        orgName: tenant.legalName,
        accountStatus: "enabled" as const,
        createdAt: stamp,
      },
    ],
    assignments: [
      ...state.assignments.map((a) => (a.userId === tenant.initialAdmin.userId && a.scopeOrgId === tenant.enterpriseOrgId && a.status === "active"
        ? { ...a, status: "revoked" as const, revokedBy: actor, revokedAt: stamp, reason: "变更首位管理员，旧邀请失效" }
        : a)),
      {
        id: nextId("g"),
        tenantId: tenant.enterpriseOrgId,
        userId: newUserId,
        roleId: adminRole.roleId,
        scopeOrgId: tenant.enterpriseOrgId,
        scopeOrgName: tenant.legalName,
        scope: tenant.type === "pharma" ? ("PHARMA" as const) : ("PROVIDER" as const),
        effectiveFrom: stamp.slice(0, 10),
        grantedBy: actor,
        grantedAt: stamp,
        status: "active" as const,
        reason: "变更首位管理员 · 新待激活授权",
      },
    ],
    activityLog: [...lines, ...state.activityLog],
  })
  return { ok: true, audits: lines }
}

/** 统一社会信用代码查重（向导实时校验用） */
export function isUsccTaken(uscc: string): boolean {
  const target = uscc.trim().toUpperCase()
  return state.tenants.some((t) => t.uscc.toUpperCase() === target)
}

function maskPhoneLocal(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone
}

/**
 * 原型认证资料层：按 userId 保存「默认主角色 + 演示密码 + 扫码身份绑定」。
 * 只补充认证所需配置，不复制用户主数据（账号事实源仍是 PERM_USERS，
 * 角色事实源仍是 RoleAssignment），登录页也不得维护独立账号清单。
 */

import type { EnterpriseCodeEntry, QrIdentity } from "./authTypes"
import { PERM_USERS, PERM_ORGS } from "../data/permissions"
import { enterpriseRootOf } from "../data/permissions"

/** 演示环境统一固定密码（登录页明示，不作为真实安全能力；密码入口本期隐藏，代码保留） */
export const DEMO_PASSWORD = "demo123"

/**
 * 系统角色 id 集合（realm=PLATFORM 的全部预置角色，即软件服务方「贝医信息科技」侧）。
 * 仅作种子校验/兜底；
 * 运行时一律以 AuthPrincipal.realm 与 SysRole.realm 判定，不再按角色 id 集合推断。
 */
export const PLATFORM_ROLE_IDS = new Set(["role-sys-admin"])

/**
 * 企业编码登记表（原型口径：生产由贝医系统管理员在租户管理生成，8 位大写字母数字、
 * 排除易混字符 0/O、1/I、无业务语义；系统管理后台/药厂/服务商共用同一编号空间）。
 * 2026-09-15 拍板：一个企业只有一个主码，别名码全链路删除。
 * 软件服务方侧运行时新建租户的主码由 tenantRegistry 生成并即时并入解析。
 */
export const ENTERPRISE_CODES: EnterpriseCodeEntry[] = [
  { code: "M8QT3ZRN", enterpriseId: "org-platform", enabled: true },
  { code: "E9K4P7X2", enterpriseId: "org-pharma", enabled: true },
  { code: "W6HK2T9V", enterpriseId: "org-provider-east", enabled: true },
  { code: "F3JN7QX4", enterpriseId: "org-provider-smart", enabled: true },
]

export interface AuthProfile {
  userId: string
  /** 登录成功后默认进入的主角色（SysRole.id）；无生效授权时按账号状态拒绝 */
  defaultRoleId: string
  password: string
  /**
   * 企业级成员状态（原型口径，不改 PERM_USERS.accountStatus 枚举）：
   * 待激活 = 首次短信登录放行并激活（内存态，刷新回到待激活为预期）；
   * 冻结 = 该企业内拒绝登录，不影响同一自然人在其他企业的身份。
   * 披露时点 = 验证码校验成功之后。
   */
  memberStatusByEnterprise?: Record<string /*enterpriseId*/, "pending_activation" | "frozen">
}

/**
 * 仅覆盖「预期可登录演示」的账号；未列出的账号登录时走通用校验：
 * 停用 / 无生效授权 / 过期 / 已回收 —— 拒绝并给出原因。
 */
export const AUTH_PROFILES: Record<string, AuthProfile> = {
  "u-wangmin": { userId: "u-wangmin", defaultRoleId: "role-sys-admin", password: DEMO_PASSWORD },
  "u-shenyue": { userId: "u-shenyue", defaultRoleId: "role-pharma-admin", password: DEMO_PASSWORD },
  "u-lihang": { userId: "u-lihang", defaultRoleId: "role-pharma-admin", password: DEMO_PASSWORD },
  "u-zhaoning": { userId: "u-zhaoning", defaultRoleId: "role-pharma-admin", password: DEMO_PASSWORD },
  "u-chenwei": { userId: "u-chenwei", defaultRoleId: "role-provider-admin", password: DEMO_PASSWORD },
  "u-liuyang": { userId: "u-liuyang", defaultRoleId: "role-group-lead", password: DEMO_PASSWORD },
  "u-yangming": { userId: "u-yangming", defaultRoleId: "role-specialist", password: DEMO_PASSWORD },
  "u-huangfeng": { userId: "u-huangfeng", defaultRoleId: "role-specialist", password: DEMO_PASSWORD },
  "u-lichen": { userId: "u-lichen", defaultRoleId: "role-specialist", password: DEMO_PASSWORD },
  // 待激活新成员（东方恒业）：首次短信登录自动激活并 toast「账号已激活」
  "u-hejing": {
    userId: "u-hejing",
    defaultRoleId: "role-group-lead",
    password: DEMO_PASSWORD,
    memberStatusByEnterprise: { "org-provider-east": "pending_activation" },
  },
  // 企业级冻结演示：在东方恒业被冻结，百益制药身份不受影响
  "u-hanlei": {
    userId: "u-hanlei",
    defaultRoleId: "role-provider-admin",
    password: DEMO_PASSWORD,
    memberStatusByEnterprise: { "org-provider-east": "frozen" },
  },
  // 全不可用药厂的服务专员：认证通过进门页空态
  "u-sunqi": { userId: "u-sunqi", defaultRoleId: "role-specialist", password: DEMO_PASSWORD },
}

/**
 * 演示账号分组：按全流程测试主线划分（登录页速查与用户菜单「切换角色」共用），
 * 让测试时一眼定位「进哪个账号会看到什么场景」。
 */
export type DemoAccountGroupKey = "platform" | "pharma" | "provider" | "status"

export interface DemoAccountGroup {
  key: DemoAccountGroupKey
  label: string
  /** 分组补充说明（企业编码等速查信息） */
  hint: string
}

export const DEMO_ACCOUNT_GROUPS: DemoAccountGroup[] = [
  { key: "platform", label: "软件服务方", hint: "系统管理与开户闭环 · M8QT3ZRN" },
  { key: "pharma", label: "药厂侧 · 百益制药", hint: "E9K4P7X2" },
  { key: "provider", label: "服务商侧", hint: "东方恒业 W6HK2T9V · 智联 F3JN7QX4" },
  { key: "status", label: "登录状态与拦截演示", hint: "激活 / 冻结 / 空态" },
]

/** 登录页「演示账号」速查：由认证资料 + 用户主数据派生，不另行维护清单 */
export interface DemoAccountHint {
  userId: string
  account: string
  name: string
  roleName: string
  orgName: string
  /** 演示场景分组（标题见 DEMO_ACCOUNT_GROUPS） */
  group: DemoAccountGroupKey
  /** 场景短标签（1-2 个，标注该账号主要演示什么） */
  tags: string[]
  /** 该条演示场景对应的企业编码（登录卡第 1 步直接回填） */
  enterpriseCode: string
  /** 该账号手机号（登录卡第 2 步直接回填） */
  phone: string
  /** 一句话说明该账号演示的场景（速查表可点 ⓘ 展开完整内容） */
  scene: string
}

export const DEMO_ACCOUNT_HINTS: DemoAccountHint[] = [
  // ── 软件服务方（贝医） ──
  { userId: "u-wangmin", account: "wangmin", name: "王敏", roleName: "贝医系统管理员", orgName: "系统服务部", group: "platform", tags: ["系统工作台", "免角色确认"], enterpriseCode: "M8QT3ZRN", phone: "13901350101", scene: "软件服务方唯一预置角色：认证成功直接进入系统工作台（无角色确认页），管理租户/菜单/合作监管/系统审计" },
  // 软件服务方运行时建租户的待激活管理员（种子租户：云杏生物/泰合医学推广；「恢复演示数据」可复位重演）
  { userId: "u-rt-zhouting", account: "rt-zhouting", name: "周婷", roleName: "企业管理员", orgName: "云杏生物医药有限公司", group: "platform", tags: ["软件服务方开户·首登激活", "药厂租户"], enterpriseCode: "R8NV3KQ2", phone: "13809120116", scene: "待激活药厂管理员：验证码通过即激活并提示「账号已激活，欢迎加入」，单角色直入药厂工作台，租户转「正常」（配套王敏的建租户动作；服务商租户同类场景同理）" },
  // ── 药厂侧（百益制药） ──
  { userId: "u-shenyue", account: "shenyue", name: "沈悦", roleName: "企业管理员", orgName: "信息技术部", group: "pharma", tags: ["组织/用户/角色授权主线"], enterpriseCode: "E9K4P7X2", phone: "13901350121", scene: "药厂企业管理主线：本药厂组织架构、用户、角色与数据范围（唯一授权入口）" },
  { userId: "u-lihang", account: "lihang", name: "李航", roleName: "企业管理员", orgName: "西北大区", group: "pharma", tags: ["角色确认双选"], enterpriseCode: "E9K4P7X2", phone: "13901350102", scene: "「企业管理员 · 西北大区」；另持有定制角色「药厂区域销售经理」→ 角色确认页双选项" },
  { userId: "u-zhaoning", account: "zhaoning", name: "赵宁", roleName: "企业管理员", orgName: "合规部", group: "pharma", tags: ["备案/准入审核"], enterpriseCode: "E9K4P7X2", phone: "13901350103", scene: "「企业管理员 · 合规部」：备案审核、服务商准入审核（通过即创建合作关系）与合作关系暂停" },
  // ── 服务商侧 ──
  { userId: "u-chenwei", account: "chenwei", name: "陈伟", roleName: "服务商管理员", orgName: "东方恒业推广有限公司", group: "provider", tags: ["双企业身份", "配药厂范围"], enterpriseCode: "W6HK2T9V", phone: "13809120104", scene: "双企业身份：东方恒业编码登录=服务商管理员（可演示给员工配不同药厂范围）；百益制药编码（E9K4P7X2）登录=企业管理员 · 合规部" },
  { userId: "u-liuyang", account: "liuyang", name: "刘洋", roleName: "工作组组长", orgName: "工作组一", group: "provider", tags: ["任务分派与初审"], enterpriseCode: "F3JN7QX4", phone: "13809120105", scene: "工作组分派与初审（智联科技成员；用百益编码登录可演示非成员防枚举）" },
  { userId: "u-yangming", account: "yangming", name: "杨明", roleName: "服务专员", orgName: "工作组三", group: "provider", tags: ["选药厂门页·四状态", "专员执行"], enterpriseCode: "W6HK2T9V", phone: "13809120106", scene: "四卡门页：百益服务中 / 华康备案待审核（可进入+警告）/ 康宁合作暂停（禁用）/ 泽康业务授权已撤销（禁用）；专员名下仅一家可用药厂时不出选择列表、自动直达" },
  // ── 登录状态与拦截演示 ──
  { userId: "u-hejing", account: "hejing", name: "何静", roleName: "工作组组长", orgName: "工作组三", group: "status", tags: ["待激活·首登放行"], enterpriseCode: "W6HK2T9V", phone: "13809120113", scene: "待激活新成员：验证码校验成功后自动激活并提示「账号已激活，欢迎加入」" },
  { userId: "u-hanlei", account: "hanlei", name: "韩磊", roleName: "服务商管理员", orgName: "东方恒业推广有限公司", group: "status", tags: ["冻结拦截", "双企业对照"], enterpriseCode: "W6HK2T9V", phone: "13809120114", scene: "企业级成员身份冻结：东方恒业编码登录被拒（成员身份已冻结）；百益编码（E9K4P7X2）登录=企业管理员，不受影响" },
]

/**
 * 服务专员名下的服务药厂不在本文件静态维护：可进入药厂由 cooperationModel
 * 实时派生（员工被授予 ∧ 合作生效 ∧ 药厂对服务商业务授权有效）。
 * 状态口径：status = 合作语义（active/paused）；blockedKind = 硬阻断
 * （合作暂停/终止、业务授权撤销、未分配范围）；warningKind = 备案类警告
 * （不阻断进入，仅拦学术拜访）。员工可处理药厂的唯一配置入口 =
 * 「角色与数据范围」页的「已授权成员」页签（pharmaTenantIds / varietyNames）。
 */

/**
 * 模拟的外部扫码身份池（真实产品分别来自企业微信通讯录与微信开放平台 unionid）。
 * 未绑定身份演示「联系管理员完成绑定」；绑定到停用/过期账号的身份演示登录阻断。
 */
export const QR_IDENTITIES: QrIdentity[] = [
  // 企业微信
  { id: "wm-chenwei", source: "wecom", label: "陈伟 · 东方恒业（企业微信）", detail: "userid: CHEN_WEI", userId: "u-chenwei" },
  { id: "wm-wangmin", source: "wecom", label: "王敏 · 贝医信息（企业微信）", detail: "userid: WANG_MIN", userId: "u-wangmin", roleId: "role-sys-admin" },
  { id: "wm-zhaoning", source: "wecom", label: "赵宁 · 百益制药（企业微信）", detail: "userid: ZHAO_NING", userId: "u-zhaoning" },
  { id: "wm-unbound", source: "wecom", label: "外部成员（未绑定系统账号）", detail: "userid: EXTERNAL_9527" },
  // 微信开放平台
  { id: "wx-lihang", source: "wechat", label: "李航（微信）", detail: "unionid: oX9…-LH", userId: "u-lihang", roleId: "role-custom-region-sales" },
  { id: "wx-yangming", source: "wechat", label: "杨明（微信）", detail: "unionid: oX9…-YM", userId: "u-yangming" },
  { id: "wx-wuchao", source: "wechat", label: "吴超（微信）", detail: "unionid: oX9…-WC", userId: "u-wuchao" },
  { id: "wx-unbound", source: "wechat", label: "微信用户（未绑定系统账号）", detail: "unionid: oX9…-UN" },
]

export function enterpriseNameOfOrg(orgId: string): { id: string; name: string } {
  const root = enterpriseRootOf(PERM_ORGS, orgId)
  return { id: root?.id ?? "org-platform", name: root?.name ?? "贝医信息科技" }
}

const ENTERPRISE_TYPE_LABEL: Record<string, string> = {
  platform: "软件服务方",
  pharma: "药厂",
  provider: "服务提供商",
}

/** 企业根节点（含类型文案）：登录身份选择器展示「企业类型」用 */
export function enterpriseOfOrg(orgId: string): { id: string; name: string; type: string } {
  const root = enterpriseRootOf(PERM_ORGS, orgId)
  return {
    id: root?.id ?? "org-platform",
    name: root?.name ?? "贝医信息科技",
    type: ENTERPRISE_TYPE_LABEL[root?.type ?? "platform"] ?? "软件服务方",
  }
}

export function findUserById(userId: string) {
  return PERM_USERS.find((u) => u.id === userId)
}

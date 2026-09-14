/**
 * 原型认证资料层：按 userId 保存「默认主角色 + 演示密码 + 扫码身份绑定」。
 * 只补充认证所需配置，不复制用户主数据（账号事实源仍是 PERM_USERS，
 * 角色事实源仍是 RoleAssignment），登录页也不得维护独立账号清单。
 */

import type { QrIdentity, ServingPharma } from "./authTypes"
import { PERM_USERS, PERM_ORGS } from "../data/permissions"
import { enterpriseRootOf } from "../data/permissions"

/** 演示环境统一固定密码（登录页明示，不作为真实安全能力） */
export const DEMO_PASSWORD = "demo123"

/** 平台侧角色（进入平台管理工作台，而非某企业工作空间）；App 壳与身份确认页共用 */
export const PLATFORM_ROLE_IDS = new Set([
  "role-platform-ops",
  "role-sys-admin",
  "role-account-admin",
])

export interface AuthProfile {
  userId: string
  /** 登录成功后默认进入的主角色（SysRole.id）；无生效授权时按账号状态拒绝 */
  defaultRoleId: string
  password: string
}

/**
 * 仅覆盖「预期可登录演示」的账号；未列出的账号登录时走通用校验：
 * 停用 / 无生效授权 / 过期 / 已回收 —— 拒绝并给出原因。
 */
export const AUTH_PROFILES: Record<string, AuthProfile> = {
  "u-wangmin": { userId: "u-wangmin", defaultRoleId: "role-platform-ops", password: DEMO_PASSWORD },
  "u-lihang": { userId: "u-lihang", defaultRoleId: "role-pharma-sales", password: DEMO_PASSWORD },
  "u-zhaoning": { userId: "u-zhaoning", defaultRoleId: "role-pharma-compliance", password: DEMO_PASSWORD },
  "u-chenwei": { userId: "u-chenwei", defaultRoleId: "role-provider-admin", password: DEMO_PASSWORD },
  "u-liuyang": { userId: "u-liuyang", defaultRoleId: "role-group-lead", password: DEMO_PASSWORD },
  "u-yangming": { userId: "u-yangming", defaultRoleId: "role-specialist", password: DEMO_PASSWORD },
  "u-huangfeng": { userId: "u-huangfeng", defaultRoleId: "role-specialist", password: DEMO_PASSWORD },
  "u-lichen": { userId: "u-lichen", defaultRoleId: "role-specialist", password: DEMO_PASSWORD },
  "u-zhengjie": { userId: "u-zhengjie", defaultRoleId: "role-account-admin", password: DEMO_PASSWORD },
}

/** 登录页「演示账号」速查：由认证资料 + 用户主数据派生，不另行维护清单 */
export interface DemoAccountHint {
  userId: string
  account: string
  name: string
  roleName: string
  orgName: string
  /** 一句话说明该账号演示的场景 */
  scene: string
}

export const DEMO_ACCOUNT_HINTS: DemoAccountHint[] = [
  { userId: "u-wangmin", account: "wangmin", name: "王敏", roleName: "平台运营", orgName: "百益健康科技", scene: "平台侧全量页面；企业微信扫码则以「系统管理员」身份进入" },
  { userId: "u-lihang", account: "lihang", name: "李航", roleName: "药厂销售管理员", orgName: "西北大区", scene: "药厂销售主线；微信开放平台扫码则以定制角色「药厂区域销售经理」进入" },
  { userId: "u-zhaoning", account: "zhaoning", name: "赵宁", roleName: "药厂合规管理员", orgName: "合规部", scene: "备案审核与服务商准入审核" },
  { userId: "u-chenwei", account: "chenwei", name: "陈伟", roleName: "服务商管理员", orgName: "东方恒业推广有限公司", scene: "任务承接、绩效与准入资料；企业微信扫码可登录；双企业身份演示（东方恒业服务商管理员 / 百益制药药厂合规）" },
  { userId: "u-liuyang", account: "liuyang", name: "刘洋", roleName: "工作组长", orgName: "工作组一", scene: "工作组分派与初审" },
  { userId: "u-yangming", account: "yangming", name: "杨明", roleName: "服务专员", orgName: "工作组三", scene: "多药厂服务专员：后台登录后选择服务药厂进入对应业务范围（含一家合作暂停）" },
  { userId: "u-huangfeng", account: "huangfeng", name: "黄峰", roleName: "服务专员", orgName: "工作组三", scene: "单药厂服务专员：后台登录后自动收敛为唯一服务药厂" },
  { userId: "u-zhengjie", account: "zhengjie", name: "郑洁", roleName: "账户管理员", orgName: "华东大区", scene: "用户建档、启停与账户解锁" },
]

/**
 * 服务专员名下的服务药厂授权（多租户演示口径）：
 * 登录后由「选择服务药厂」步骤确定本次业务数据范围；列表为空或全部暂停的
 * 纯移动端账号维持「仅限移动端」拦截。药厂名与组织树/种子任务的持有方口径一致。
 */
export const SPECIALIST_SERVING_PHARMAS: Record<string, ServingPharma[]> = {
  "u-yangming": [
    {
      id: "pharma-baiyi",
      name: "百益制药",
      status: "active",
      workGroup: "工作组三",
      regions: "陕西省",
      lastUsedAt: "2026-09-10 18:32",
    },
    {
      id: "pharma-huakang",
      name: "华康药业",
      status: "active",
      workGroup: "西北推广组",
      regions: "陕西省、甘肃省",
      lastUsedAt: "2026-09-08 17:20",
    },
    {
      id: "pharma-kangning",
      name: "康宁制药",
      status: "paused",
      pausedAt: "2026-08-31",
      pausedReason: "合作授权已暂停",
    },
  ],
  "u-huangfeng": [
    { id: "pharma-baiyi", name: "百益制药", status: "active" },
  ],
}

/**
 * 模拟的外部扫码身份池（真实产品分别来自企业微信通讯录与微信开放平台 unionid）。
 * 未绑定身份演示「联系管理员完成绑定」；绑定到停用/过期账号的身份演示登录阻断。
 */
export const QR_IDENTITIES: QrIdentity[] = [
  // 企业微信
  { id: "wm-chenwei", source: "wecom", label: "陈伟 · 东方恒业（企业微信）", detail: "userid: CHEN_WEI", userId: "u-chenwei" },
  { id: "wm-wangmin", source: "wecom", label: "王敏 · 百益健康（企业微信）", detail: "userid: WANG_MIN", userId: "u-wangmin", roleId: "role-sys-admin" },
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
  return { id: root?.id ?? "org-platform", name: root?.name ?? "百益健康科技" }
}

const ENTERPRISE_TYPE_LABEL: Record<string, string> = {
  platform: "平台",
  pharma: "药厂",
  provider: "服务提供商",
}

/** 企业根节点（含类型文案）：登录身份选择器展示「企业类型」用 */
export function enterpriseOfOrg(orgId: string): { id: string; name: string; type: string } {
  const root = enterpriseRootOf(PERM_ORGS, orgId)
  return {
    id: root?.id ?? "org-platform",
    name: root?.name ?? "百益健康科技",
    type: ENTERPRISE_TYPE_LABEL[root?.type ?? "platform"] ?? "平台",
  }
}

export function findUserById(userId: string) {
  return PERM_USERS.find((u) => u.id === userId)
}

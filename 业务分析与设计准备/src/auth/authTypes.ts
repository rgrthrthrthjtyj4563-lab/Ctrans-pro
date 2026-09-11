/**
 * 前端认证契约（原型首期，由 Mock Gateway 实现）。
 * 生产接入时以下能力的校验全部移到服务端：密码校验、短信发送/校验、
 * 企业微信 OAuth、微信开放平台回调、二维码轮询、登录审计；
 * 令牌使用 HttpOnly Secure Cookie。本文件只定义页面依赖的稳定接口形状。
 */

import type { Role } from "../types"
import type { ScopeType } from "../data/permissions"

export type LoginMethod = "password" | "sms" | "qr"

/** 扫码来源：企业微信 / 微信开放平台（个人微信） */
export type QrSource = "wecom" | "wechat"

/** 已认证主体：一次登录解析出的「用户 + 生效授权角色 + 数据范围」 */
export interface AuthPrincipal {
  userId: string
  name: string
  account: string
  phone: string
  /** 人员归属组织（调岗可变） */
  orgId: string
  orgName: string
  /** 所属企业根节点（平台/药厂/服务商） */
  enterpriseId: string
  enterpriseName: string
  /** 生效授权角色（SysRole.id），登录即进入配置的默认主角色 */
  roleId: string
  roleName: string
  /** 本次生效授权记录与数据权限覆盖范围 */
  assignmentId: string
  scope: ScopeType
  scopeOrgId: string
  scopeOrgName: string
  /**
   * 本次进入的服务药厂（仅服务专员）：与所属企业并列的「当前业务数据范围」。
   * 选择/切换药厂不换账号、不重新认证；未选择时为空，由登录流程的药厂选择步骤补齐。
   */
  servingPharmaId?: string
  servingPharmaName?: string
  /** 旧三类页面视角的兼容派生值，仅供未迁移页面做渲染分支 */
  perspective: Role
}

/** 服务专员名下的一家电厂服务授权（登录后选择本次进入哪一家） */
export interface ServingPharma {
  id: string
  name: string
  /** active = 服务中；paused = 合作暂停（不可进入） */
  status: "active" | "paused"
  workGroup?: string
  regions?: string
  lastUsedAt?: string
  pausedAt?: string
  pausedReason?: string
}

export interface AuthSession {
  /** 每次登录唯一；用于在 React 树上强制重建会话 */
  id: string
  principal: AuthPrincipal
  method: LoginMethod
  qrSource?: QrSource
  loginAt: string
  /** 三步流第二步（身份确认）是否完成；新登录会话默认 false，确认页就地置 true */
  identityConfirmed?: boolean
  /** 待选服务药厂：仅服务专员未选择时由网关附带，选择后的换发会话不再携带 */
  pendingPharmas?: ServingPharma[]
}

/** 登录被拒时的定位信息：field 指回具体输入框，供 aria-live 播报 */
export type LoginFailureCode =
  | "account-empty"
  | "password-empty"
  | "user-not-found"
  | "password-wrong"
  | "account-disabled"
  | "no-active-assignment"
  | "assignment-expired"
  | "assignment-revoked"
  | "assignment-pending-review"
  | "phone-not-bound"
  | "sms-code-wrong"
  | "sms-code-expired"
  | "sms-attempts-exceeded"
  | "sms-not-requested"
  | "qr-expired"
  | "qr-not-scanned"
  | "qr-identity-unbound"
  | "role-mobile-only"

export interface LoginFailure {
  code: LoginFailureCode
  field?: "account" | "password" | "phone" | "code" | "qr"
  message: string
}

export type AuthResult =
  | { ok: true; session: AuthSession }
  | { ok: false; failure: LoginFailure }

export type QrLoginStatus =
  | "waiting" // 已生成，等待扫描
  | "scanned" // 已扫描，等待手机确认
  | "confirmed" // 已确认（结果由 poll 一次性返回）
  | "expired"

export interface QrLoginState {
  ticket: string
  source: QrSource
  status: QrLoginStatus
  /** 过期时间戳（ms），用于前端倒计时 */
  expiresAt: number
}

/** 模拟的外部扫码身份（企业微信/微信成员、微信开放平台 unionid 的替身） */
export interface QrIdentity {
  id: string
  source: QrSource
  label: string
  detail: string
  /** 未绑定身份为 undefined，扫码确认后按「联系管理员绑定」处理 */
  userId?: string
  /** 同一用户多身份时可指定以哪条生效授权进入 */
  roleId?: string
}

export interface AuthGateway {
  loginPassword(input: { account: string; password: string }): Promise<AuthResult>
  requestSms(input: { phone: string }): Promise<
    { ok: true; devCode: string; expiresIn: number } | { ok: false; failure: LoginFailure }
  >
  verifySms(input: { phone: string; code: string }): Promise<AuthResult>
  createQr(input: { source: QrSource }): Promise<{ ok: true; state: QrLoginState } | { ok: false; failure: LoginFailure }>
  refreshQr(ticket: string): Promise<{ ok: true; state: QrLoginState } | { ok: false; failure: LoginFailure }>
  /** 演示专用：把一次「外部扫码」注入票据（真实产品由 App 扫码回调驱动） */
  simulateScan(
    ticket: string,
    identityId: string,
  ): Promise<{ ok: true; state: QrLoginState } | { ok: false; failure: LoginFailure }>
  /** 前端轮询：waiting/scanned 原样返回；确认或失败时 result 一次性携带登录结果 */
  pollQr(ticket: string): Promise<{
    state: QrLoginState
    result: AuthResult | null
  }>
  /** 服务专员名下的服务药厂列表（切换场景使用；登录场景由会话 pendingPharmas 携带） */
  listServingPharmas(userId: string): Promise<ServingPharma[]>
  /** 免重新认证选择/切换服务药厂：换发新会话，session.id 变化使业务树重建、数据按所选药厂重置 */
  chooseServingPharma(input: {
    userId: string
    pharmaId: string
    /** 透传原登录方式，保持审计与会话口径连续 */
    method?: LoginMethod
    qrSource?: QrSource
  }): Promise<AuthResult>
  logout(session: AuthSession): Promise<void>
}

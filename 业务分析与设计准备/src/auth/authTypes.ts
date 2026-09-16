/**
 * 前端认证契约（多租户权限域重构版，由 Mock Gateway 实现）。
 *
 * 权限域分离（方案 §三.1）：
 * - realm=PLATFORM：平台工作空间。平台工作空间编码只复用同一登录形式，
 *   不把平台伪装成普通企业租户；平台身份不携带 tenantId/成员身份。
 * - realm=TENANT：药厂/服务商企业工作空间。登录身份 = 自然人 × 企业成员身份
 *   （TenantMembership）× 生效授权角色（activeRoleId）+ 实际数据范围
 *   （effectiveAssignmentIds 合并同一角色的多条授权）。
 *
 * 生产接入时以下能力的校验全部移到服务端：短信发送/校验、企业编码解析、
 * 企业内成员与账号状态拦截（均在验证码校验成功之后披露）、短信票据管理
 * （工作空间 × 手机号隔离）、登录审计；令牌使用 HttpOnly Secure Cookie。
 * 本文件只定义页面依赖的稳定接口形状（纯前端演示数据结构）。
 */

import type { Role } from "../types"
import type { AccessRealm, ScopeType, TenantKind } from "../data/permissions"

export type { AccessRealm }

export type LoginMethod = "password" | "sms" | "qr"

/** 扫码来源：企业微信 / 微信开放平台（个人微信）——本期登录入口隐藏，代码保留 */
export type QrSource = "wecom" | "wechat"

/** 平台工作空间名称（平台人员不显示为「某企业」） */
export const PLATFORM_WORKSPACE_NAME = "药合作平台"

interface PrincipalPerson {
  /** 自然人（User） */
  userId: string
  name: string
  account: string
  phone: string
  /** 人员主档归属组织（部门/工作组；调岗可变）——平台人员为平台组织节点 */
  orgId: string
  orgName: string
}

/** 平台权限域登录身份：平台角色 × 平台职责范围（无租户成员身份） */
export interface PlatformPrincipal extends PrincipalPerson {
  realm: "PLATFORM"
  /** 平台工作空间根 id（编码解析带入，换发身份时回传） */
  workspaceId: string
  /** 恒为「药合作平台」；页面顶部显示「当前工作空间」而非「认证企业」 */
  workspaceName: string
  platformRoleId: string
  platformRoleName: string
  /** 职责范围摘要（来自 PlatformRoleBinding.dutyScope），如「租户运营范围：全部租户的开通…」 */
  dutyScope: string
}

/** 租户权限域登录身份：成员身份 × 生效角色 × 实际数据范围 */
export interface TenantPrincipal extends PrincipalPerson {
  realm: "TENANT"
  /** 本次认证工作空间根 id（= tenantId，显式携带供换发回传） */
  workspaceId: string
  /** 当前企业租户（药厂或服务商的企业根 id） */
  tenantId: string
  tenantName: string
  tenantKind: TenantKind
  /** 企业成员身份（TenantMembership.id） */
  membershipId: string
  /** 本次生效的授权角色 */
  activeRoleId: string
  activeRoleName: string
  /** 该角色名下全部生效授权记录（同角色多范围时合并进同一身份） */
  effectiveAssignmentIds: string[]
  /** 组织数据范围（合并展示时取主档位） */
  scope: ScopeType
  scopeOrgId: string
  scopeOrgName: string
  /** 数据范围摘要（含服务商员工可处理药厂清单），角色确认页展示 */
  dataScopeSummary: string
  /**
   * 旧三类页面视角的兼容派生值：仅服务于 TENANT 域业务页面的渲染分支，
   * 菜单/路由/平台页面一律不使用（平台身份无业务视角，不带此字段）。
   */
  perspective: Role
  /**
   * 当前服务药厂（仅服务商侧业务身份）：一次业务会话只操作一家药厂数据；
   * 选择/切换药厂不换账号、不重新认证，仅更新本字段并重建业务树。
   */
  currentPharmaTenantId?: string
  currentPharmaName?: string
  /** 当前药厂上的备案类警告（可进入但拦学术拜访） */
  pharmaWarning?: WarningKind
}

/** 登录后的模拟身份：平台与租户两域判别联合（前端演示数据结构） */
export type AuthPrincipal = PlatformPrincipal | TenantPrincipal

export function isPlatformPrincipal(p: AuthPrincipal): p is PlatformPrincipal {
  return p.realm === "PLATFORM"
}

/** 两域统一取角色 id（平台角色 id / 租户生效角色 id） */
export function principalRoleId(p: AuthPrincipal): string {
  return p.realm === "PLATFORM" ? p.platformRoleId : p.activeRoleId
}

export function principalRoleName(p: AuthPrincipal): string {
  return p.realm === "PLATFORM" ? p.platformRoleName : p.activeRoleName
}

/** 工作空间展示名：平台=药合作平台；租户=企业名 */
export function principalWorkspaceName(p: AuthPrincipal): string {
  return p.realm === "PLATFORM" ? PLATFORM_WORKSPACE_NAME : p.tenantName
}

/** 当前服务药厂（仅租户身份且已选择时存在） */
export function currentPharmaOf(p: AuthPrincipal): { id: string; name: string } | undefined {
  if (p.realm !== "TENANT" || !p.currentPharmaTenantId) return undefined
  return { id: p.currentPharmaTenantId, name: p.currentPharmaName ?? p.currentPharmaTenantId }
}

/** 服务专员名下的一家电厂服务授权（登录后选择本次进入哪一家） */
export interface ServingPharma {
  /** 药厂租户 id（企业根） */
  id: string
  name: string
  /** 纯合作语义：active = 合作生效；paused = 合作暂停/终止（不可进入） */
  status: "active" | "paused"
  /**
   * 硬阻断原因：合作暂停/终止、业务授权撤销——不满足进入条件，
   * 但记录保留展示原因（与 warningKind 互斥语义，blockedKind 优先）。
   */
  blockedKind?: BlockedKind
  /**
   * 备案类警告（不参与进入判定——备案仅拦学术拜访，不拦进药厂）；
   * 门页以警告标识提示。
   */
  warningKind?: WarningKind
  workGroup?: string
  /** 业务授权中的服务区域摘要 */
  regions?: string
  lastUsedAt?: string
  pausedAt?: string
  /** 演示数据要求：只填适合对外展示的文案（生产为原因码→标准文案映射） */
  pausedReason?: string
  /** 授予来源说明（由谁在何时授予），门页与「我的数据范围」展示 */
  grantedByText?: string
}

/** 选药厂门页的硬阻断原因（禁止进入） */
export type BlockedKind = "cooperation_paused" | "cooperation_terminated" | "no_valid_variety" | "no_scope"

/** 选药厂门页的警告原因（可进入，仅拦学术拜访） */
export type WarningKind =
  | "filing_pending"
  | "filing_rejected"
  | "filing_expired"
  | "filing_suspended"

/**
 * 进入条件（派生判定，全链路统一口径）：合作生效且无硬阻断原因。
 * warningKind（备案类警告）不参与进入判定。
 */
export function enterablePharma(p: ServingPharma): boolean {
  return p.status === "active" && !p.blockedKind
}

/** 企业编码登记项（原型口径，生产由平台系统管理员在租户管理生成；平台/药厂/服务商共用编号空间；一个企业只有一个主码） */
export interface EnterpriseCodeEntry {
  /** 8 位大写字母数字，排除易混字符（0/O、1/I），无业务语义 */
  code: string
  /** 对应企业根节点 orgId（平台码对应平台工作空间根） */
  enterpriseId: string
  enabled: boolean
}

/**
 * 手机号/验证码通过后解析出的一个可登录身份选项。
 * 同一角色存在多条有效授权时合并为一条（assignmentIds 收集全部），
 * 平台身份与租户身份不会混列（realm 由认证工作空间决定）。
 */
export interface LoginIdentityOption {
  realm: AccessRealm
  /** 选项稳定键：TENANT=roleId@tenantId；PLATFORM=platformRoleId */
  key: string
  /** 生效授权记录集合（租户=RoleAssignment.id 集合；平台=PlatformRoleBinding.id 集合） */
  assignmentIds: string[]
  roleId: string
  roleName: string
  /** 功能权限摘要（如「12 个页面 · 31 项操作」） */
  permSummary: string
  /** 数据范围/职责范围摘要（合并展示文本） */
  scopeSummary: string
  /** 授权来源：授予人（多人合并为「等多人」） */
  grantedBy: string
  /** 最近一次授予时间 */
  grantedAt: string
  /** 生效起始日 */
  effectiveFrom: string
  // ── realm=TENANT ──
  tenantId?: string
  tenantName?: string
  tenantKind?: TenantKind
  membershipId?: string
  scope?: ScopeType
  /** 所属部门或工作组（身份展示「角色 · 部门/工作组」的右半段） */
  orgName?: string
  // ── realm=PLATFORM ──
  dutyScope?: string
}

export interface AuthSession {
  /** 每次登录唯一；用于在 React 树上强制重建会话 */
  id: string
  principal: AuthPrincipal
  method: LoginMethod
  qrSource?: QrSource
  loginAt: string
  /** 第二步（角色/身份确认）是否完成；单角色由网关直签 true，多角色默认 false */
  identityConfirmed?: boolean
  /** 该账号在本次认证工作空间内的可登录身份列表（≥2 时展示选择器） */
  identityOptions?: LoginIdentityOption[]
  /** 待选服务药厂：仅服务商业务身份未选择时由网关附带，选择后不再携带 */
  pendingPharmas?: ServingPharma[]
  /** 一次性提示（待激活账号首次登录激活成功）：由业务壳层挂载时消费并 toast */
  activationNotice?: string
  /** 本会话由「记住默认登录」恢复签发（免验证码直进默认工作空间） */
  restoredFrom?: "default-login"
}

/** 登录被拒时的定位信息：field 指回具体输入框，供 aria-live 播报 */
export type LoginFailureCode =
  | "account-empty"
  | "password-empty"
  | "enterprise-invalid"
  | "user-not-found"
  | "password-wrong"
  | "account-disabled"
  | "account-frozen"
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
  field?: "entcode" | "account" | "password" | "phone" | "code" | "qr"
  message: string
}

export type AuthResult =
  | { ok: true; session: AuthSession }
  | { ok: false; failure: LoginFailure }

// ─── 记住默认登录 + 切换企业（第一期默认登录与企业切换需求） ───────────────────

/**
 * 默认登录的设备侧记录（「记住默认登录」勾选且验证码验证成功后保存）。
 * 原型以本设备 localStorage 单记录承载；生产为服务端维护的受保护设备会话
 * （HttpOnly Secure Cookie + 服务端设备绑定），客户端不得以企业名/企业码
 * 作为授权依据——恢复时全部按成员关系与租户状态实时重校验，记录仅作定位。
 * 不保存验证码、密码或任何凭证本体；无痕模式/新设备天然不恢复。
 */
export interface DefaultLoginRecord {
  userId: string
  /** 记录指向的工作空间：平台根或租户企业根 */
  workspaceKind: "platform" | "tenant"
  workspaceId: string
  /** 仅展示用；进入授权以 workspaceId 实时校验为准 */
  workspaceName: string
  /** 最近一次进入的生效角色（恢复时仍有效则沿用，失效回退身份确认页） */
  activeRoleId?: string
  /** 服务商业务身份的最近服务药厂（恢复时仍可进入才沿用，否则重走选药厂） */
  currentPharmaTenantId?: string
  /** 本设备标识（审计用；首次保存时生成的稳定随机串） */
  deviceId: string
  savedAt: number
  /** savedAt + 有效期（30 天，可配置）；到期必须重新认证 */
  expiresAt: number
}

/**
 * 已登录用户可免重认证切换的一家有效企业（头像菜单「切换企业」列表项）。
 * 口径（FR-04/05）：成员关系 active、租户可登录（非待激活/暂停/终止）、
 * 且该企业内存在可登录身份；不满足的企业不展示、不暴露名称。
 */
export interface SwitchableEnterprise {
  workspaceId: string
  tenantName: string
  tenantKind: TenantKind
  membershipId: string
  /** 该企业内可登录身份摘要（展示「角色 · 部门」；多身份合并提示） */
  roleSummary: string
  /** 可登录身份数（≥2 时切换后走角色确认页） */
  identityCount: number
  isCurrent: boolean
  /**
   * 演示口径：进入该企业涉及敏感权限（企业管理员/合规/财务类），
   * 切换前须短信重新认证（AC-08；敏感清单为演示口径，待业务确认）。
   */
  requiresReauth: boolean
}

/** 默认登录恢复结果：失败时 notice 为回退到标准登录的一次性提示（可无） */
export type DefaultLoginRestoreResult =
  | { ok: true; session: AuthSession }
  | { ok: false; notice?: string }

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

/** 模拟的外部扫码身份（企业微信/微信开放平台 unionid 的替身） */
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
  /** 工作空间编码解析（登录卡第 1 步）：返回非敏感展示信息；不存在/停用统一失败，不区分 */
  resolveEnterprise(input: {
    code: string
  }): Promise<
    | {
        ok: true
        /** 平台码 = 平台工作空间根 id；企业码 = 租户企业根 id */
        enterpriseId: string
        enterpriseName: string
        /** 解析出的权限域：平台编码不伪装成普通企业租户 */
        realm: AccessRealm
        /** 顶部提示文案：「药合作平台」或企业名 */
        workspaceLabel: string
      }
    | { ok: false; failure: LoginFailure }
  >
  /**
   * 请求短信验证码：票据绑定工作空间（enterpriseId:phone 复合键）；
   * 请求阶段不做成员与状态判断——手机号格式合法一律统一成功态，
   * 非本企业成员返回演示「假码」（校验永远不通过，防枚举）。
   */
  requestSms(input: {
    enterpriseId: string
    phone: string
  }): Promise<
    | { ok: true; devCode: string; expiresIn: number }
    | { ok: false; failure: LoginFailure }
  >
  /**
   * 校验短信验证码：工作空间上下文贯穿；成员状态（冻结/停用/待激活）在校验成功后才披露。
   * rememberDefaultLogin（FR-01）：勾选且验证成功后，在本设备保存受保护的默认登录
   * 记录与默认工作空间（FR-02）；未勾选仅建立普通会话，不动已有记录。
   */
  verifySms(input: {
    enterpriseId: string
    phone: string
    code: string
    rememberDefaultLogin?: boolean
  }): Promise<AuthResult>
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
  /**
   * 业务身份名下的服务药厂列表（含不可用记录；切换场景使用）。
   * providerTenantId = 当前登录的服务商租户：同一自然人多家服务商的范围互不合并。
   */
  listServingPharmas(userId: string, providerTenantId: string): Promise<ServingPharma[]>
  /**
   * 第二步：角色确认——从本次认证工作空间内已解析的选项中按角色选定
   * （同角色多授权合并生效；免重新认证）。
   */
  chooseLoginIdentity(input: {
    userId: string
    roleId: string
    /** 本次认证工作空间根 id（平台码即平台根） */
    workspaceId: string
    /** 透传原登录方式，保持审计与会话口径连续 */
    method?: LoginMethod
    qrSource?: QrSource
  }): Promise<AuthResult>
  /**
   * 免重新认证选择/切换服务药厂：基于当前会话主体仅叠加 currentPharma 字段签发；
   * session.id 变化使业务树重建、数据按所选药厂重置。
   */
  chooseServingPharma(input: {
    userId: string
    pharmaId: string
    /** 当前会话主体（换发基础） */
    principal: AuthPrincipal
    /** 透传原登录方式，保持审计与会话口径连续 */
    method?: LoginMethod
    qrSource?: QrSource
  }): Promise<AuthResult>
  /**
   * 记住默认登录：应用启动时尝试恢复（FR-03）。校验链任一失败即清除本设备
   * 记录并撤销（FR-08），返回失败（notice 供登录页一次性提示）；
   * 成功则换发免验证码会话直进默认工作空间。
   */
  restoreDefaultLogin(): Promise<DefaultLoginRestoreResult>
  /**
   * 已登录用户的有效可切换企业列表（FR-05：仅成员关系与租户状态均有效、
   * 且该企业内存在可登录身份的企业；含当前企业标记）。
   */
  listSwitchableEnterprises(input: {
    userId: string
    /** 当前会话工作空间根 id（用于标记 isCurrent） */
    currentWorkspaceId: string
  }): Promise<SwitchableEnterprise[]>
  /**
   * 免重新认证切换企业（FR-06）：切换前再次校验目标成员关系/租户状态/可登录身份
   * （需求 §7），通过后换发目标企业上下文会话（session.id 变化使业务树整树重建，
   * 菜单、角色与数据范围按目标企业重载）；目标企业多身份回退角色确认、服务商
   * 业务身份附带待选药厂。成功且本设备存在默认登录记录时同步更新默认企业（FR-07）。
   */
  switchEnterprise(input: {
    userId: string
    targetWorkspaceId: string
    /** 当前会话工作空间根 id（审计「原企业」） */
    currentWorkspaceId: string
    /** 透传原登录方式，保持审计与会话口径连续 */
    method?: LoginMethod
  }): Promise<AuthResult>
  /**
   * 切换敏感权限企业前的短信重新认证（AC-08 演示口径）：只消费短信票据，
   * 不签发会话、不披露成员状态之外的信息；通过与否均写审计。
   */
  verifyReauthCode(input: {
    enterpriseId: string
    phone: string
    code: string
  }): Promise<{ ok: true } | { ok: false; failure: LoginFailure }>
  logout(session: AuthSession): Promise<void>
}

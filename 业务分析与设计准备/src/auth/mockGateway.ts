/**
 * Mock Gateway：前端认证契约的演示实现（多租户权限域重构版）。全部逻辑在内存中，
 * 无持久会话；刷新页面即重新登录。生产接入时本文件整体替换为真实接口适配层。
 *
 * 权限域口径（方案 §三/§六/§九）：
 * - 企业编码解析：系统管理后台编码复用同一登录形式，但解析为 realm=PLATFORM，
 *   不把软件服务方伪装成普通企业租户；普通企业编码 → 租户工作空间。
 * - 软件服务方人员通过 PlatformRoleBinding 获得系统角色（职责范围文本表达管理边界，
 *   不再出现「某企业（全部租户）」）；租户人员通过 TenantMembership + RoleAssignment
 *   获得成员身份与角色数据范围（tenantId 稳定边界）。
 * - 同一角色多条有效授权 → 身份选项合并为一条（effectiveAssignmentIds 全量收集）。
 * - 防枚举：非成员统一成功态 + 假码；账号状态拦截在验证码校验成功之后才披露。
 * - 登录审计 reason 存标准原因码；未认证成功阶段手机号一律脱敏；不记录验证码本体。
 */

import type {
  PermAuditEvent,
  PermUser,
  PlatformRoleBinding,
  RoleAssignment,
  ScopeType,
  SysRole,
} from "../data/permissions"
import {
  PERM_USERS,
  PRESET_ROLES,
  perspectiveRoleOf,
  seedCustomRoles,
  nextId,
  nowStamp,
  enterpriseRootOf,
  summarizePerms,
  scopeLabel,
  tenantKindOfRoot,
} from "../data/permissions"
import {
  allAssignments,
  allOrgs,
  allUsers,
  resolveEnterpriseByCode,
  runtimeMemberStatus,
  completeRuntimeActivation,
  tenantByEnterpriseOrgId,
  tenantExpired,
  tenantLoginAllowed,
} from "../data/tenantRegistry"
import {
  getPlatformBindings,
  grantedPharmasForUser,
  membershipOfUserInTenant,
  membershipsOfUser,
  tenantNameOf,
  visiblePharmasForUser,
} from "../data/cooperationModel"
import {
  AUTH_PROFILES,
  DEMO_PASSWORD,
  QR_IDENTITIES,
} from "./authProfiles"
import type {
  AccessRealm,
  AuthGateway,
  AuthPrincipal,
  AuthResult,
  AuthSession,
  DefaultLoginRecord,
  DefaultLoginRestoreResult,
  LoginFailure,
  LoginIdentityOption,
  PlatformPrincipal,
  QrIdentity,
  QrLoginState,
  QrSource,
  ServingPharma,
  SwitchableEnterprise,
  TenantPrincipal,
} from "./authTypes"
import {
  PLATFORM_WORKSPACE_NAME,
  enterablePharma,
} from "./authTypes"

const ALL_ROLES: SysRole[] = [...PRESET_ROLES, ...seedCustomRoles]

const SMS_TTL_MS = 5 * 60_000
const SMS_MAX_ATTEMPTS = 3
const QR_TTL_MS = 120_000
const QR_CONFIRM_MS = 1_800

/** 演示验证用：二维码票据创建/轮询计数（LOGIN_METHODS_EXPOSED.qr 关闭时应保持为 0） */
export const qrFlowDebug = { ticketsCreated: 0, polls: 0 }

function tick(ms = 160): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 未认证成功阶段的手机号脱敏（审计与提示统一口径） */
function maskPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone
}

/** 工作空间类型：系统管理后台根=platform；药厂/服务商根=对应租户类型 */
function workspaceKindOf(enterpriseId: string): "platform" | "pharma" | "provider" | null {
  const root = allOrgs().find((o) => o.id === enterpriseId)
  if (!root) return null
  if (root.type === "platform") return "platform"
  return tenantKindOfRoot(root)
}

function realmOfWorkspace(enterpriseId: string): AccessRealm | null {
  const kind = workspaceKindOf(enterpriseId)
  if (!kind) return null
  return kind === "platform" ? "PLATFORM" : "TENANT"
}

function roleOf(roleId: string): SysRole | undefined {
  return ALL_ROLES.find((r) => r.id === roleId)
}

/** 授予人合并展示（多人 → 「X 等N人」） */
function mergeGrantors(items: { grantedBy: string; grantedAt: string }[]): { grantedBy: string; grantedAt: string } {
  const names = [...new Set(items.map((i) => i.grantedBy))]
  const latest = items.reduce((x, y) => (y.grantedAt > x ? y.grantedAt : x), items[0]?.grantedAt ?? "")
  return { grantedBy: names.length > 1 ? `${names[0]} 等${names.length}人` : names[0] ?? "—", grantedAt: latest }
}

// ─── 生效授权判定（租户域） ──────────────────────────────────────────────────

interface AssignmentDecision {
  active: RoleAssignment[]
  /** 没有任何 active 记录时，给出最贴近事实的拒绝原因 */
  blocker?: LoginFailure
}

/** tenantId 存在时仅统计该租户边界内的授权（稳定边界，不再按组织树反推） */
function decideAssignments(userId: string, tenantId?: string): AssignmentDecision {
  const mine = allAssignments().filter((a) => {
    if (a.userId !== userId) return false
    if (!tenantId) return true
    return a.tenantId === tenantId
  })
  const today = todayIso()
  const active = mine.filter(
    (a) => a.status === "active" && (!a.effectiveTo || a.effectiveTo >= today),
  )
  if (active.length > 0) return { active }
  const dateExpired = mine.find(
    (a) => a.status === "active" && a.effectiveTo && a.effectiveTo < today,
  )
  if (dateExpired) {
    return {
      active: [],
      blocker: {
        code: "assignment-expired",
        message: "当前角色授权已失效，请重新登录或联系管理员",
      },
    }
  }
  if (mine.some((a) => a.status === "pending_review")) {
    return {
      active: [],
      blocker: {
        code: "assignment-pending-review",
        message: "角色授权正在复核中，通过后才能登录",
      },
    }
  }
  if (mine.some((a) => a.status === "expired")) {
    return { active: [], blocker: { code: "assignment-expired", message: "当前角色授权已失效，请重新登录或联系管理员" } }
  }
  if (mine.some((a) => a.status === "revoked")) {
    return { active: [], blocker: { code: "assignment-revoked", message: "当前角色授权已失效，请重新登录或联系管理员" } }
  }
  return {
    active: [],
    blocker: { code: "no-active-assignment", message: "当前账号在该企业没有可用角色，请联系企业管理员" },
  }
}

/** 系统角色绑定判定（软件服务方域；与租户授权完全分离） */
function decideBindings(userId: string): { active: PlatformRoleBinding[]; blocker?: LoginFailure } {
  const mine = getPlatformBindings().filter((b) => b.userId === userId)
  const today = todayIso()
  const active = mine.filter(
    (b) => b.status === "active" && (!b.effectiveTo || b.effectiveTo >= today),
  )
  if (active.length > 0) return { active }
  if (mine.length === 0) {
    return {
      active: [],
      blocker: { code: "no-active-assignment", message: "该手机号不是软件服务方工作人员，请改用所属企业编码登录" },
    }
  }
  return {
    active: [],
    blocker: { code: "assignment-revoked", message: "系统角色授权已失效，请联系贝医系统管理员" },
  }
}

/**
 * 生效授权/绑定 → 身份选项（按角色合并）。同一角色存在多条有效授权时只显示
 * 一条并合并展示可管理范围（方案 §六.2）；软件服务方选项与租户选项不混列。
 */
function identityOptionsFor(
  user: (typeof PERM_USERS)[number],
  realm: AccessRealm,
  workspaceId: string,
): LoginIdentityOption[] {
  const opts: LoginIdentityOption[] = []
  if (realm === "PLATFORM") {
    const { active } = decideBindings(user.id)
    const byRole = new Map<string, PlatformRoleBinding[]>()
    for (const b of active) {
      const role = roleOf(b.platformRoleId)
      if (!role || role.realm !== "PLATFORM" || role.status !== "enabled") continue
      byRole.set(b.platformRoleId, [...(byRole.get(b.platformRoleId) ?? []), b])
    }
    for (const [roleId, list] of byRole) {
      const role = roleOf(roleId)!
      const grantor = mergeGrantors(list)
      opts.push({
        realm: "PLATFORM",
        key: roleId,
        assignmentIds: list.map((b) => b.id),
        roleId,
        roleName: role.name,
        orgName: user.orgName,
        permSummary: summarizePerms(role).replace(/·.*$/, "").trim(),
        scopeSummary: [...new Set(list.map((b) => b.dutyScope))].join("；"),
        grantedBy: grantor.grantedBy,
        grantedAt: grantor.grantedAt,
        effectiveFrom: list.reduce((x, y) => (y.effectiveFrom < x ? y.effectiveFrom : x), list[0].effectiveFrom),
      })
    }
    return opts
  }
  const { active } = decideAssignments(user.id, workspaceId)
  const byRole = new Map<string, RoleAssignment[]>()
  for (const a of active) {
    const role = roleOf(a.roleId)
    if (!role || role.realm !== "TENANT" || role.status !== "enabled") continue
    // MOBILE 业务身份未分配任何药厂 → 不生成选项（由 resolvePrincipal 给出配置缺失拦截）
    byRole.set(a.roleId, [...(byRole.get(a.roleId) ?? []), a])
  }
  for (const [roleId, list] of byRole) {
    const role = roleOf(roleId)!
    const grantor = mergeGrantors(list)
    const scopeParts = [...new Set(list.map((a) => `${scopeLabel(a.scope)} · ${a.scopeOrgName}`))]
    const pharmaUnion = [...new Set(list.flatMap((a) => a.pharmaTenantIds ?? []))]
    const isProviderBusinessScope =
      role.appliesTo?.includes("provider") && role.defaultScope !== "PROVIDER"
    const scopeSummary =
      isProviderBusinessScope
        ? `${scopeParts.join("；")}｜可处理药厂：${pharmaUnion.length > 0 ? pharmaUnion.map((id) => tenantNameOf(id)).join("、") : "（未分配）"}`
        : scopeParts.join("；")
    const membershipOrgName = allOrgs().find(
      (o) => o.id === membershipsOfUser(user.id).find((m) => m.tenantId === workspaceId)?.orgUnitId,
    )?.name
    opts.push({
      realm: "TENANT",
      key: `${roleId}@${workspaceId}`,
      assignmentIds: list.map((a) => a.id),
      roleId,
      roleName: role.name,
      orgName: membershipOrgName,
      permSummary: summarizePerms(role).replace(/·[^·]*$/, "").trim(),
      scopeSummary,
      grantedBy: grantor.grantedBy,
      grantedAt: grantor.grantedAt,
      effectiveFrom: list.reduce((x, y) => (y.effectiveFrom < x ? y.effectiveFrom : x), list[0].effectiveFrom),
      tenantId: workspaceId,
      tenantName: tenantNameOf(workspaceId),
      tenantKind: tenantKindOfRoot(allOrgs().find((o) => o.id === workspaceId)) ?? "pharma",
      membershipId: membershipsOfUser(user.id).find((m) => m.tenantId === workspaceId)?.id ?? "",
      scope: list[0].scope,
    })
  }
  return opts
}

/** 全部身份选项 → 认证主体（租户域：成员身份 + 多角色权限并集 + 合并数据范围摘要） */
function buildTenantPrincipal(
  user: (typeof PERM_USERS)[number],
  opts: LoginIdentityOption[],
): TenantPrincipal | null {
  const workspaceId = opts[0].tenantId
  if (!workspaceId) return null
  const roles = opts.map((o) => roleOf(o.roleId)).filter((r): r is SysRole => Boolean(r))
  if (roles.length === 0) return null
  const membership = membershipsOfUser(user.id).find((m) => m.tenantId === workspaceId)
  const orgUnitId = membership?.orgUnitId ?? user.orgId
  const orgUnit = allOrgs().find((o) => o.id === orgUnitId)
  const allIds = new Set(opts.flatMap((o) => o.assignmentIds))
  const assignments = allAssignments().filter((a) => allIds.has(a.id))
  // 数据范围明细：按「范围根 × 档位」去重后的并集（展示用；行级过滤按授权全集计算）
  const scopeSeen = new Set<string>()
  const dataScopes = assignments.reduce<{ scope: ScopeType; scopeOrgId: string; scopeOrgName: string }[]>((acc, a) => {
    const key = `${a.scopeOrgId}|${a.scope}`
    if (scopeSeen.has(key)) return acc
    scopeSeen.add(key)
    acc.push({ scope: a.scope, scopeOrgId: a.scopeOrgId, scopeOrgName: a.scopeOrgName })
    return acc
  }, [])
  const perspective =
    roles.map((r) => perspectiveRoleOf(r)).find((p): p is NonNullable<ReturnType<typeof perspectiveRoleOf>> => Boolean(p)) ??
    "药厂销售部门"
  return {
    realm: "TENANT",
    userId: user.id,
    name: user.name,
    account: user.account,
    phone: user.phone,
    workspaceId,
    orgId: orgUnitId,
    orgName: orgUnit?.name ?? user.orgName,
    tenantId: workspaceId,
    tenantName: opts[0].tenantName ?? tenantNameOf(workspaceId),
    tenantKind: opts[0].tenantKind ?? tenantKindOfRoot(allOrgs().find((o) => o.id === workspaceId)) ?? "pharma",
    membershipId: membership?.id ?? "",
    roleIds: roles.map((r) => r.id),
    roleNames: roles.map((r) => r.name),
    jobTitle: membership?.jobTitle,
    effectiveAssignmentIds: [...allIds],
    dataScopes,
    dataScopeSummary: opts.map((o) => o.scopeSummary).join("；"),
    perspective,
  }
}

function buildPlatformPrincipal(
  user: (typeof PERM_USERS)[number],
  opt: LoginIdentityOption,
  workspaceId: string,
): PlatformPrincipal {
  const role = roleOf(opt.roleId)!
  return {
    realm: "PLATFORM",
    userId: user.id,
    name: user.name,
    account: user.account,
    phone: user.phone,
    orgId: user.orgId,
    orgName: user.orgName,
    workspaceId,
    workspaceName: PLATFORM_WORKSPACE_NAME,
    platformRoleId: role.id,
    platformRoleName: role.name,
    dutyScope: opt.scopeSummary,
  }
}

/**
 * 业务身份名下的待选服务药厂：只按【本次登录的服务商租户】计算——
 * 同一自然人属于多家服务商时，另一家的合作药厂绝不出现在本选择页。
 */
function pendingPharmasFor(user: (typeof PERM_USERS)[number], realm: AccessRealm, workspaceId: string): ServingPharma[] | undefined {
  if (realm !== "TENANT") return undefined
  const pharmas = visiblePharmasForUser(user.id, workspaceId)
  return pharmas.length > 0 ? pharmas : undefined
}

/**
 * 认证主体解析：工作空间 → 全部生效身份（按角色分组的授权概览）→ 多角色自动合并
 * 签发主体（+ 业务身份的药厂待选）。2026-09-18 起登录不再选择角色：同企业多角色
 * 权限取并集进同一会话；identityOptions 仅作为授权概览返回（切换企业列表等展示位用）。
 */
function resolvePrincipal(
  userId: string,
  realm: AccessRealm,
  workspaceId: string,
): {
  ok: true
  principal: AuthPrincipal
  identityOptions: LoginIdentityOption[]
  pendingPharmas?: ServingPharma[]
} | { ok: false; failure: LoginFailure } {
  const user = allUsers().find((u) => u.id === userId)
  if (!user) {
    return { ok: false, failure: { code: "user-not-found", field: "account", message: "账号不存在，请输入用户名或已绑定手机号" } }
  }
  if (user.accountStatus !== "enabled") {
    return { ok: false, failure: { code: "account-disabled", field: "account", message: "该账号已停用，请联系管理员" } }
  }
  if (realm === "PLATFORM") {
    const { blocker } = decideBindings(user.id)
    if (blocker) return { ok: false, failure: blocker }
  } else {
    const { blocker } = decideAssignments(user.id, workspaceId)
    if (blocker) return { ok: false, failure: blocker }
  }
  const identityOptions = identityOptionsFor(user, realm, workspaceId)
  if (identityOptions.length === 0) {
    return { ok: false, failure: { code: "no-active-assignment", message: "当前账号在该工作空间没有可用角色，请联系管理员" } }
  }

  // 服务商业务角色（服务专员/工作组组长）需有名下的服务药厂记录；
  // 仅当【全部】身份都是业务角色且药厂范围为空才拦截（服务商管理员默认覆盖全部有效授权药厂）
  if (realm === "TENANT" && identityOptions[0].tenantKind === "provider") {
    const anyNonBusiness = identityOptions.some((o) => {
      const role = roleOf(o.roleId)
      return !role?.appliesTo?.includes("provider") || role.defaultScope === "PROVIDER"
    })
    if (!anyNonBusiness) {
      const grantedEmpty = grantedPharmaUnion(user.id, workspaceId).length === 0
      if (grantedEmpty) {
        return {
          ok: false,
          failure: {
            code: "role-mobile-only",
            field: "account",
            message: "尚未获分配可处理的业务药厂范围，请联系服务商管理员在「角色与数据范围」的「已授权成员」页签配置",
          },
        }
      }
    }
  }

  const principal: AuthPrincipal | null =
    realm === "PLATFORM"
      ? buildPlatformPrincipal(user, identityOptions[0], workspaceId)
      : buildTenantPrincipal(user, identityOptions)
  if (!principal) {
    return { ok: false, failure: { code: "no-active-assignment", message: "当前账号没有可用角色，请联系管理员" } }
  }
  const pendingPharmas = pendingPharmasFor(user, realm, workspaceId)
  return {
    ok: true,
    principal,
    identityOptions,
    ...(pendingPharmas ? { pendingPharmas } : {}),
  }
}

/** 当前服务商租户内、日期窗口中的已授予药厂并集（future 授权不提前生效） */
function grantedPharmaUnion(userId: string, providerTenantId: string): string[] {
  return grantedPharmasForUser(userId, providerTenantId)?.pharmaTenantIds ?? []
}

// ─── 企业成员判定（登录第 2 步消费） ─────────────────────────────────────────

/**
 * 租户域成员判定：在该租户内有成员身份（种子/运行时派生）或有租户内授权；
 * 软件服务方域成员判定：有系统角色绑定。角色是否可登录由授权/绑定状态单独判定。
 */
function isWorkspaceMember(user: (typeof PERM_USERS)[number], realm: AccessRealm, workspaceId: string): boolean {
  if (realm === "PLATFORM") {
    return getPlatformBindings().some((b) => b.userId === user.id)
  }
  if (membershipsOfUser(user.id).some((m) => m.tenantId === workspaceId)) return true
  return allAssignments().some((a) => a.userId === user.id && a.tenantId === workspaceId)
}

/** 企业级成员状态激活内存态（同一运行周期有效；刷新回到资料层初始值为原型预期） */
const activatedMemberKeys = new Set<string>()

function memberStatusOf(
  userId: string,
  enterpriseId: string,
): "pending_activation" | "frozen" | "removed" | undefined {
  // 成员身份已被移除：最高优先级（终止态，覆盖种子冻结/待激活口径）
  if (membershipOfUserInTenant(userId, enterpriseId)?.status === "removed") return "removed"
  if (activatedMemberKeys.has(`${userId}:${enterpriseId}`)) return undefined
  const seedStatus = AUTH_PROFILES[userId]?.memberStatusByEnterprise?.[enterpriseId]
  if (seedStatus) return seedStatus
  return runtimeMemberStatus(userId, enterpriseId)
}

/** LoginFailure.code → 审计标准原因码 */
function auditCodeOf(failure: LoginFailure): string {
  const map: Record<LoginFailure["code"], string> = {
    "account-empty": "ACCOUNT_EMPTY",
    "password-empty": "PASSWORD_EMPTY",
    "enterprise-invalid": "ENT_CODE_INVALID",
    "user-not-found": "USER_NOT_FOUND",
    "password-wrong": "PASSWORD_WRONG",
    "account-locked": "ACCOUNT_LOCKED",
    "account-disabled": "ACCOUNT_DISABLED",
    "account-frozen": "ACCOUNT_FROZEN",
    "membership-removed": "MEMBERSHIP_REMOVED",
    "tenant-expired": "TENANT_EXPIRED",
    "no-active-assignment": "NO_ACTIVE_ASSIGNMENT",
    "assignment-expired": "ASSIGNMENT_EXPIRED",
    "assignment-revoked": "ASSIGNMENT_REVOKED",
    "assignment-pending-review": "ASSIGNMENT_PENDING_REVIEW",
    "phone-not-bound": "PHONE_INVALID",
    "sms-code-wrong": "SMS_WRONG",
    "sms-code-expired": "SMS_EXPIRED",
    "sms-attempts-exceeded": "SMS_ATTEMPTS_EXCEEDED",
    "sms-not-requested": "SMS_NOT_REQUESTED",
    "qr-expired": "QR_EXPIRED",
    "qr-not-scanned": "QR_NOT_SCANNED",
    "qr-identity-unbound": "QR_IDENTITY_UNBOUND",
    "role-mobile-only": "NO_SERVING_PHARMA",
  }
  return map[failure.code] ?? failure.code.toUpperCase()
}

// ─── 登录审计缓冲（业务壳挂载后并入「操作日志」） ────────────────────────────

const pendingLoginAudits: PermAuditEvent[] = []

function methodActionLabel(method: AuthSession["method"], qrSource?: QrSource): string {
  const actionMap = { password: "密码登录", sms: "短信验证码登录", qr: "扫码登录" } as const
  return (
    actionMap[method] +
    (qrSource ? `（${qrSource === "wecom" ? "企业微信" : "微信开放平台"}）` : "")
  )
}

interface AuthAuditContext {
  workspaceId?: string
  roleId?: string
  pharmaId?: string
  /** 自动脱敏后入上下文摘要；验证码本体任何情况下不入日志 */
  phone?: string
  /** 默认登录/企业切换事件的本设备标识（需求 §6 审计要求） */
  device?: string
  /** 租户套餐开通到期日（TENANT_EXPIRED 事件附注） */
  expireAt?: string
}

interface AuthAuditInput {
  action: string
  outcome: "成功" | "失败"
  /** 未认证阶段的展示标签（已认证传 principal） */
  actorLabel: string
  /** 标准原因码（如 SMS_SENT / ACCOUNT_FROZEN），不存中文文案 */
  reason: string
  resource?: string
  method?: AuthSession["method"]
  qrSource?: QrSource
  principal?: AuthPrincipal
  /** 覆盖 target（默认 principal.account / actorLabel） */
  target?: string
  /** 事件前值摘要（企业切换的原企业名等） */
  before?: string
  context?: AuthAuditContext
}

function pushAuthAudit(input: AuthAuditInput): void {
  const { context = {} } = input
  const ctxParts: string[] = []
  if (context.workspaceId) ctxParts.push(`workspace=${context.workspaceId}`)
  if (context.roleId) ctxParts.push(`roleId=${context.roleId}`)
  if (context.pharmaId) ctxParts.push(`pharmaId=${context.pharmaId}`)
  if (context.phone) ctxParts.push(`phone=${maskPhone(context.phone)}`)
  if (context.device) ctxParts.push(`device=${context.device}`)
  if (context.expireAt) ctxParts.push(`expireAt=${context.expireAt}`)
  const p = input.principal
  const actorRoleText = p
    ? p.realm === "PLATFORM"
      ? p.platformRoleName
      : p.roleNames.join("+")
    : "未认证"
  const event: PermAuditEvent = {
    id: nextId("PE"),
    time: nowStamp(),
    actor: p?.name ?? input.actorLabel,
    actorRole: actorRoleText,
    org: p ? (p.realm === "PLATFORM" ? PLATFORM_WORKSPACE_NAME : p.tenantName) : "—",
    target: input.target ?? p?.account ?? input.actorLabel,
    roleName: actorRoleText === "未认证" ? undefined : actorRoleText,
    module: "登录认证",
    action: input.action,
    resource: input.resource ?? "auth.login",
    decision: input.outcome === "成功" ? "允许" : "拒绝",
    reason: input.reason,
    ...(input.before ? { beforeSummary: input.before } : {}),
    ...(ctxParts.length > 0 ? { afterSummary: ctxParts.join(" · ") } : {}),
    requestId: nextId("req"),
    ip: "10.4.21.8",
    result: input.outcome,
  }
  pendingLoginAudits.unshift(event)
}

/** 供 PermissionProvider 挂载时一次性取出登录审计（含失败尝试） */
export function drainLoginAuditEvents(): PermAuditEvent[] {
  const drained = [...pendingLoginAudits]
  pendingLoginAudits.length = 0
  return drained
}

// ─── 会话工厂 ────────────────────────────────────────────────────────────────

function newSession(
  principal: AuthPrincipal,
  method: AuthSession["method"],
  qrSource?: QrSource,
  opts?: {
    pendingPharmas?: ServingPharma[]
    activationNotice?: string
    restoredFrom?: "default-login"
  },
): AuthSession {
  return {
    id: `sess-${Date.now()}-${nextId("n")}`,
    principal,
    method,
    qrSource,
    loginAt: nowStamp(),
    ...(opts?.pendingPharmas ? { pendingPharmas: opts.pendingPharmas } : {}),
    ...(opts?.activationNotice ? { activationNotice: opts.activationNotice } : {}),
    ...(opts?.restoredFrom ? { restoredFrom: opts.restoredFrom } : {}),
  }
}

function failWith(
  method: AuthSession["method"],
  actorLabel: string,
  failure: LoginFailure,
  qrSource?: QrSource,
  context?: AuthAuditContext,
): AuthResult {
  pushAuthAudit({
    action: methodActionLabel(method, qrSource),
    outcome: "失败",
    actorLabel,
    reason: auditCodeOf(failure),
    method,
    qrSource,
    context,
  })
  return { ok: false, failure }
}

function succeedWith(
  method: AuthSession["method"],
  principal: AuthPrincipal,
  qrSource?: QrSource,
  opts?: {
    pendingPharmas?: ServingPharma[]
    activationNotice?: string
    restoredFrom?: "default-login"
  },
): AuthResult {
  pushAuthAudit({
    action: methodActionLabel(method, qrSource),
    outcome: "成功",
    actorLabel: principal.account,
    reason: "LOGIN_SUCCESS",
    method,
    qrSource,
    principal,
  })
  return {
    ok: true,
    session: newSession(principal, method, qrSource, opts),
  }
}

// ─── 短信验证码（模拟：验证码直接回显，不发真实短信） ────────────────────────

/**
 * 票据绑定工作空间：键 = `${enterpriseId}:${phone}`——同一手机号在两个企业先后
 * 请求互不覆盖、互不串用；重发覆盖旧票据（旧验证码即失效）。
 * decoy = 防枚举「假码」：非本工作空间成员请求时返回的演示验证码永远校验不通过。
 */
interface SmsTicket {
  code: string
  decoy: boolean
  expiresAt: number
  attempts: number
  requestedAt: number
}
const smsTickets = new Map<string, SmsTicket>()

const DECOY_CODE = "__DECOY__"

const smsTicketKey = (enterpriseId: string, phone: string) => `${enterpriseId}:${phone}`

/**
 * 演示口径（用户 2026-09-15 拍板）：本企业成员的验证码固定为 123456；
 * 非成员的假码仍随机（且永不校验通过，防枚举口径不变）。
 */
const DEMO_SMS_CODE = "123456"

function generateDecoyCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/**
 * 票据校验（不含成员/状态判定）：过期/超次/错码返回定位失败（错码已递增次数），
 * 通过返回 null（由调用方消费票据）。登录与「切换企业重新认证」共用同一口径。
 */
function checkSmsTicket(ticket: SmsTicket, code: string): LoginFailure | null {
  if (Date.now() > ticket.expiresAt) {
    return { code: "sms-code-expired", field: "code", message: "验证码已失效，请重新获取" }
  }
  if (ticket.attempts >= SMS_MAX_ATTEMPTS) {
    return { code: "sms-attempts-exceeded", field: "code", message: "验证码输错次数过多，已作废，请重新获取" }
  }
  if (code !== ticket.code) {
    ticket.attempts += 1
    const left = SMS_MAX_ATTEMPTS - ticket.attempts
    return left > 0
      ? { code: "sms-code-wrong", field: "code", message: `验证码不正确，还可尝试 ${left} 次` }
      : { code: "sms-attempts-exceeded", field: "code", message: "验证码输错次数过多，已作废，请重新获取" }
  }
  return null
}

// ─── 扫码登录票据 ────────────────────────────────────────────────────────────

interface QrTicket extends QrLoginState {
  identityId?: string
  confirmAt?: number
  result: AuthResult | null
}
const qrTickets = new Map<string, QrTicket>()

function publicState(t: QrTicket): QrLoginState {
  return { ticket: t.ticket, source: t.source, status: t.status, expiresAt: t.expiresAt }
}

function identityOf(id: string): QrIdentity | undefined {
  return QR_IDENTITIES.find((i) => i.id === id)
}

/** 扫码回归链路：按自然人主归属解析工作空间（软件服务方人员=有系统角色绑定；否则=组织归属企业根） */
function workspaceOfUser(userId: string): { realm: AccessRealm; workspaceId: string } {
  if (getPlatformBindings().some((b) => b.userId === userId && b.status === "active")) {
    return { realm: "PLATFORM", workspaceId: "org-platform" }
  }
  const user = allUsers().find((u) => u.id === userId)
  const root = user ? enterpriseRootOf(allOrgs(), user.orgId) : undefined
  return { realm: "TENANT", workspaceId: root?.id ?? "org-pharma" }
}

// ─── 记住默认登录（第一期默认登录与企业切换需求；生产为服务端受保护设备会话） ──

/** 长期会话有效期：30 天（需求 §6 建议，可配置） */
const DEFAULT_LOGIN_TTL_MS = 30 * 24 * 60 * 60_000
const DEFAULT_LOGIN_KEY = "lg-default-login-v1"
const DEVICE_ID_KEY = "lg-device-id"

/** 本设备稳定标识（审计「设备标识」用；隐私模式降级为临时串） */
function ensureDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const id = `dev-${Math.random().toString(36).slice(2, 10)}`
    window.localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  } catch {
    return "dev-ephemeral"
  }
}

/** 容错读取：损坏/缺字段视为无记录（不阻断登录流程） */
function loadDefaultLogin(): DefaultLoginRecord | null {
  try {
    const raw = window.localStorage.getItem(DEFAULT_LOGIN_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null
    const r = parsed as DefaultLoginRecord
    if (typeof r.userId !== "string" || typeof r.workspaceId !== "string" || typeof r.expiresAt !== "number") {
      return null
    }
    return r
  } catch {
    return null
  }
}

function saveDefaultLogin(record: DefaultLoginRecord): void {
  try {
    window.localStorage.setItem(DEFAULT_LOGIN_KEY, JSON.stringify(record))
  } catch {
    /* 写失败静默降级（隐私模式仅内存会话） */
  }
}

function clearDefaultLoginStorage(): void {
  try {
    window.localStorage.removeItem(DEFAULT_LOGIN_KEY)
  } catch {
    /* 静默降级 */
  }
}

/**
 * 撤销默认登录（FR-08）：清除本设备记录并写审计；reason 为标准原因码
 * （USER_LOGOUT / EXPIRED / USER_INVALID / TENANT_BLOCKED / MEMBER_INVALID / ROLE_INVALID）。
 */
function revokeDefaultLoginRecord(
  reason: string,
  record: DefaultLoginRecord,
  principal?: AuthPrincipal,
): void {
  clearDefaultLoginStorage()
  pushAuthAudit({
    action: "默认登录撤销",
    outcome: "成功",
    actorLabel: principal?.account ?? record.userId,
    reason,
    resource: "auth.default-login",
    principal,
    target: record.workspaceName,
    context: { workspaceId: record.workspaceId, device: record.deviceId },
  })
}

/**
 * 默认登录记录同步：create=勾选「记住默认登录」且验证码验证成功（覆盖式新建 + 审计，
 * FR-01/02）；否则仅当本设备已存在该用户记录时同步最近工作上下文（FR-07 切换后更新
 * 默认企业）——未勾选的登录不新建、不续期（需求 5.1「未勾选仅建立普通会话」）。
 */
function upsertDefaultLoginFromSession(session: AuthSession, create?: boolean): void {
  const p = session.principal
  const deviceId = ensureDeviceId()
  if (create) {
    saveDefaultLogin({
      userId: p.userId,
      workspaceKind: p.realm === "PLATFORM" ? "platform" : "tenant",
      workspaceId: p.workspaceId,
      workspaceName: p.realm === "PLATFORM" ? PLATFORM_WORKSPACE_NAME : p.tenantName,
      ...(p.realm === "TENANT" && p.currentPharmaTenantId ? { currentPharmaTenantId: p.currentPharmaTenantId } : {}),
      deviceId,
      savedAt: Date.now(),
      expiresAt: Date.now() + DEFAULT_LOGIN_TTL_MS,
    })
    pushAuthAudit({
      action: "启用默认登录",
      outcome: "成功",
      actorLabel: p.account,
      reason: "DEFAULT_LOGIN_ENABLED",
      resource: "auth.default-login",
      principal: p,
      context: { workspaceId: p.workspaceId, device: deviceId },
    })
    return
  }
  const existing = loadDefaultLogin()
  if (!existing || existing.userId !== p.userId) return
  saveDefaultLogin({
    ...existing,
    workspaceKind: p.realm === "PLATFORM" ? "platform" : "tenant",
    workspaceId: p.workspaceId,
    workspaceName: p.realm === "PLATFORM" ? PLATFORM_WORKSPACE_NAME : p.tenantName,
    ...(p.realm === "TENANT" && p.currentPharmaTenantId ? { currentPharmaTenantId: p.currentPharmaTenantId } : { currentPharmaTenantId: undefined }),
    savedAt: Date.now(),
  })
}

/**
 * 恢复默认登录（FR-03 / 需求 §3.2、§7）：校验链任一失败 → 清记录 + 撤销审计 +
 * 返回失败（notice 供登录页一次性提示）；全部有效 → 免验证码换发会话直进默认
 * 工作空间。角色失效回退身份确认页；服务药厂失效回退选药厂门页。
 */
async function doRestoreDefaultLogin(): Promise<DefaultLoginRestoreResult> {
  await tick(220)
  const record = loadDefaultLogin()
  if (!record) return { ok: false }

  const fail = (reason: string, notice: string): DefaultLoginRestoreResult => {
    revokeDefaultLoginRecord(reason, record)
    return { ok: false, notice }
  }

  if (Date.now() > record.expiresAt) {
    return fail("EXPIRED", "记住的默认登录已超过 30 天有效期，请重新登录。")
  }
  const user = allUsers().find((u) => u.id === record.userId)
  if (!user || user.accountStatus !== "enabled") {
    return fail("USER_INVALID", "记住的默认登录已失效（账号不可用），请重新登录。")
  }
  if (record.workspaceKind === "tenant") {
    if (!tenantLoginAllowed(record.workspaceId)) {
      return fail("TENANT_BLOCKED", "默认企业当前不可用（已停用或暂停），请重新登录；如有疑问请联系管理员。")
    }
    const memberStatus = memberStatusOf(user.id, record.workspaceId)
    if (memberStatus || !membershipsOfUser(user.id).some((m) => m.tenantId === record.workspaceId)) {
      return fail("MEMBER_INVALID", "你在默认企业的成员身份已失效，请重新登录；如有疑问请联系企业管理员。")
    }
  }
  const realm: AccessRealm = record.workspaceKind === "platform" ? "PLATFORM" : "TENANT"
  const options = identityOptionsFor(user, realm, record.workspaceId)
  if (options.length === 0) {
    return fail("ROLE_INVALID", "你在默认企业已没有可用角色，请重新登录或联系管理员。")
  }
  const resolved = resolvePrincipal(user.id, realm, record.workspaceId)
  if (!resolved.ok) {
    return fail("ROLE_INVALID", "你在默认企业已没有可用角色，请重新登录或联系管理员。")
  }
  let principal = resolved.principal
  // 服务商业务身份：最近服务药厂仍可进入则沿用，否则丢弃（回退选药厂门页）
  if (principal.realm === "TENANT" && record.currentPharmaTenantId) {
    const target = visiblePharmasForUser(user.id, principal.tenantId).find(
      (p) => p.id === record.currentPharmaTenantId,
    )
    if (target && enterablePharma(target)) {
      principal = {
        ...principal,
        currentPharmaTenantId: target.id,
        currentPharmaName: target.name,
        ...(target.warningKind ? { pharmaWarning: target.warningKind } : { pharmaWarning: undefined }),
      }
    }
  }
  const hasPharma = principal.realm === "TENANT" && Boolean(principal.currentPharmaTenantId)
  const session = newSession(principal, "sms", undefined, {
    pendingPharmas: hasPharma ? undefined : resolved.pendingPharmas,
  })
  session.restoredFrom = "default-login"
  pushAuthAudit({
    action: "默认登录自动进入",
    outcome: "成功",
    actorLabel: user.account,
    reason: "DEFAULT_LOGIN_AUTO_ENTER",
    resource: "auth.default-login",
    principal,
    target: record.workspaceName,
    context: { workspaceId: record.workspaceId, device: record.deviceId },
  })
  return { ok: true, session }
}

/** 一次页面加载只恢复一次（StrictMode 双挂载复用同一结果，审计不重复） */
let restoreInFlight: Promise<DefaultLoginRestoreResult> | null = null

/** 切换增强认证的敏感角色（AC-08 演示口径，需求 §9 待业务确认最终清单）：
 * 企业管理员 / 服务商管理员（管理类岗位涉及成员、凭证与关键配置变更）。
 */
const SENSITIVE_SWITCH_ROLE_IDS = new Set(["role-pharma-admin", "role-provider-admin"])

// ─── 账号安全（2026-09-18 第一期缺口批次：修改密码 / 找回密码 / 账号锁定） ───

/** 密码规则：8-20 位，须同时包含字母与数字（页面校验与网关落库校验共用） */
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)\S{8,20}$/
export const PASSWORD_RULE_TEXT = "8-20 位，须同时包含字母和数字"

/**
 * 密码覆盖存储（演示口径）：初始密码统一 demo123（authProfiles）；
 * 修改/找回成功后按 userId 覆盖。生产为服务端加盐哈希，原型仅演示流转。
 */
const SECRETS_KEY = "baiyee-account-secrets-v1"

function loadSecretOverrides(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SECRETS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch {
    /* 损坏视为无覆盖 */
  }
  return {}
}

function saveSecretOverride(userId: string, password: string): void {
  const next = { ...loadSecretOverrides(), [userId]: password }
  try {
    window.localStorage.setItem(SECRETS_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式降级为仅本会话生效 */
  }
}

/** 登录与改密/找回共用的期望密码：覆盖值 > 账号资料 > 演示统一密码 */
function expectedPasswordOf(userId: string): string {
  return loadSecretOverrides()[userId] ?? AUTH_PROFILES[userId]?.password ?? DEMO_PASSWORD
}

export type PasswordChangeResult =
  | { ok: true }
  | { ok: false; error: string; field?: "old" | "new" | "confirm" }

/** 修改密码（登录态「账号与安全」入口）：旧密码验证 + 新密码规则校验，成功写审计 */
export async function changeLoginPassword(input: {
  principal: AuthPrincipal
  oldPassword: string
  newPassword: string
}): Promise<PasswordChangeResult> {
  await tick(200)
  const { principal, oldPassword, newPassword } = input
  if (!oldPassword) return { ok: false, error: "请输入当前密码", field: "old" }
  if (oldPassword !== expectedPasswordOf(principal.userId)) {
    pushAuthAudit({
      action: "修改密码",
      outcome: "失败",
      actorLabel: principal.account,
      reason: "PASSWORD_OLD_WRONG",
      resource: "auth.account-security",
      principal,
    })
    return { ok: false, error: "当前密码不正确", field: "old" }
  }
  if (!PASSWORD_PATTERN.test(newPassword)) {
    return { ok: false, error: `新密码不符合规则（${PASSWORD_RULE_TEXT}）`, field: "new" }
  }
  if (newPassword === oldPassword) {
    return { ok: false, error: "新密码不能与当前密码相同", field: "new" }
  }
  saveSecretOverride(principal.userId, newPassword)
  pushAuthAudit({
    action: "修改密码",
    outcome: "成功",
    actorLabel: principal.account,
    reason: "PASSWORD_CHANGED",
    resource: "auth.account-security",
    principal,
  })
  return { ok: true }
}

/**
 * 密码连续错误锁定：同一天然人账号（userId 维度，跨企业命名空间生效）
 * 连续错 5 次锁 15 分钟；成功登录 / 管理员解锁 / 找回密码重置均清零。
 * localStorage 持久化使刷新后锁定仍生效（演示可信度）；生产为服务端计数。
 */
const LOGIN_GUARD_KEY = "baiyee-login-guard-v1"
const PASSWORD_FAIL_LIMIT = 5
const PASSWORD_LOCK_MS = 15 * 60_000

interface LoginGuardEntry {
  count: number
  lockedUntil?: number
}

function loadLoginGuards(): Record<string, LoginGuardEntry> {
  try {
    const raw = window.localStorage.getItem(LOGIN_GUARD_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, LoginGuardEntry>
    }
  } catch {
    /* 损坏视为无记录 */
  }
  return {}
}

function saveLoginGuards(next: Record<string, LoginGuardEntry>): void {
  try {
    window.localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(next))
  } catch {
    /* 静默降级 */
  }
}

export interface LoginGuardInfo {
  locked: boolean
  /** 锁定剩余毫秒（locked=true 时有效） */
  remainMs: number
  /** 剩余可尝试次数（locked=false 时有效） */
  remainingAttempts: number
}

/** 登录守卫状态查询（用户管理「解锁登录」入口与登录链路共用） */
export function loginGuardOf(userId: string): LoginGuardInfo {
  const entry = loadLoginGuards()[userId]
  if (!entry) return { locked: false, remainMs: 0, remainingAttempts: PASSWORD_FAIL_LIMIT }
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return { locked: true, remainMs: entry.lockedUntil - Date.now(), remainingAttempts: 0 }
  }
  return { locked: false, remainMs: 0, remainingAttempts: Math.max(0, PASSWORD_FAIL_LIMIT - entry.count) }
}

function lockRemainText(remainMs: number): string {
  const minutes = Math.ceil(remainMs / 60_000)
  return minutes >= 1 ? `${minutes} 分钟` : "不足 1 分钟"
}

function registerPasswordFail(userId: string): LoginGuardInfo {
  const guards = loadLoginGuards()
  const entry = guards[userId] ?? { count: 0 }
  const count = entry.count + 1
  if (count >= PASSWORD_FAIL_LIMIT) {
    guards[userId] = { count, lockedUntil: Date.now() + PASSWORD_LOCK_MS }
  } else {
    guards[userId] = { count }
  }
  saveLoginGuards(guards)
  return loginGuardOf(userId)
}

function clearLoginGuard(userId: string): void {
  const guards = loadLoginGuards()
  if (!guards[userId]) return
  delete guards[userId]
  saveLoginGuards(guards)
}

/** 管理员解锁（用户管理入口）：清空失败计数与锁定，写登录审计 */
export async function unlockLoginGuard(
  userId: string,
  operatorLabel: string,
): Promise<{ ok: boolean; error?: string }> {
  await tick(160)
  const info = loginGuardOf(userId)
  if (!info.locked) return { ok: false, error: "该账号当前未处于锁定状态" }
  clearLoginGuard(userId)
  pushAuthAudit({
    action: "解锁登录",
    outcome: "成功",
    actorLabel: operatorLabel,
    reason: "LOGIN_UNLOCKED",
    resource: "auth.account-security",
    target: allUsers().find((u) => u.id === userId)?.account ?? userId,
  })
  return { ok: true }
}

// ─── 找回密码（登录页「忘记密码」入口，短信验证码重置） ──────────────────────

export type ResetTargetResolution =
  | { ok: true; phone: string; account: string; userId: string }
  | { ok: false; error: string }

/**
 * 找回密码第 1 步：在本企业命名空间内定位重置目标（登录账号或手机号）。
 * 账号停用（自然人 disabled）不可自助找回；定位成功后由调用方对目标手机号
 * 发送短信验证码（复用 requestSms 票据与防枚举假码机制）。
 */
export function resolveResetTarget(workspaceId: string, accountOrPhone: string): ResetTargetResolution {
  const raw = accountOrPhone.trim()
  if (!raw) return { ok: false, error: "请输入登录账号或手机号" }
  const orgs = allOrgs()
  const inWorkspace = (u: PermUser) => enterpriseRootOf(orgs, u.orgId)?.id === workspaceId
  let user: PermUser | undefined
  if (/^1\d{10}$/.test(raw)) {
    user = allUsers().find((u) => u.phone === raw && inWorkspace(u))
  } else {
    const lower = raw.toLowerCase()
    user = allUsers().find((u) => u.account.toLowerCase() === lower && inWorkspace(u))
  }
  if (!user) {
    return { ok: false, error: "本企业内未找到该账号，请核对后重试" }
  }
  if (user.accountStatus !== "enabled") {
    pushAuthAudit({
      action: "忘记密码重置",
      outcome: "失败",
      actorLabel: user.account,
      reason: "ACCOUNT_DISABLED",
      resource: "auth.account-security",
      context: { workspaceId },
    })
    return { ok: false, error: "该账号已停用，无法自助找回密码，请联系企业管理员" }
  }
  return { ok: true, phone: user.phone, account: user.account, userId: user.id }
}

/**
 * 找回密码第 2 步：消费短信票据 → 覆盖密码 + 清除登录锁定。
 * 票据校验与登录共用 checkSmsTicket（过期/超次/错码口径一致）。
 */
export async function resetLoginPassword(input: {
  workspaceId: string
  phone: string
  code: string
  newPassword: string
}): Promise<{ ok: true; account: string } | { ok: false; failure: LoginFailure }> {
  await tick(220)
  const trimmed = input.phone.trim()
  const key = smsTicketKey(input.workspaceId, trimmed)
  const ticket = smsTickets.get(key)
  const ctx: AuthAuditContext = { workspaceId: input.workspaceId, phone: trimmed }
  if (!ticket) {
    return { ok: false, failure: { code: "sms-not-requested", field: "code", message: "请先获取短信验证码" } }
  }
  const ticketFailure = checkSmsTicket(ticket, input.code)
  if (ticketFailure) {
    if (ticketFailure.code === "sms-code-expired" || ticketFailure.code === "sms-attempts-exceeded") {
      smsTickets.delete(key)
    }
    return { ok: false, failure: ticketFailure }
  }
  smsTickets.delete(key)
  const user = allUsers().find((u) => u.phone === trimmed)
  if (!user || !isWorkspaceMember(user, "TENANT", input.workspaceId) || user.accountStatus !== "enabled") {
    pushAuthAudit({
      action: "忘记密码重置",
      outcome: "失败",
      actorLabel: maskPhone(trimmed),
      reason: "RESET_TARGET_INVALID",
      resource: "auth.account-security",
      context: ctx,
    })
    return { ok: false, failure: { code: "sms-code-wrong", field: "code", message: "验证码不正确，请重新获取" } }
  }
  if (!PASSWORD_PATTERN.test(input.newPassword)) {
    return {
      ok: false,
      failure: { code: "password-wrong", field: "password", message: `新密码不符合规则（${PASSWORD_RULE_TEXT}），请重新获取验证码后再试` },
    }
  }
  saveSecretOverride(user.id, input.newPassword)
  clearLoginGuard(user.id)
  pushAuthAudit({
    action: "忘记密码重置",
    outcome: "成功",
    actorLabel: user.account,
    reason: "PASSWORD_RESET",
    resource: "auth.account-security",
    target: user.account,
    context: ctx,
  })
  return { ok: true, account: user.account }
}

// ─── 网关实现 ────────────────────────────────────────────────────────────────

export const authGateway: AuthGateway = {
  /**
   * 账号密码登录（2026-09-18 整改：企业内唯一账号口径）。
   * - 带 workspaceId（登录页步骤 2「密码登录」）：账号在该企业命名空间内定位，
   *   成员状态/首登激活/冻结/租户暂停口径与 verifySms 完全一致；
   * - 不带（用户菜单切换角色，无企业上下文）：全库首个匹配按主归属解析
   *   （演示账号账号名全局互异；数据源=allUsers，rt- 运行时账号可切）。
   * 防枚举：不存在/密码错/不属于当前企业统一「账号或密码不正确」，
   * 冻结与租户停用在凭据验证通过后才披露。
   */
  async loginPassword({ account, password, workspaceId, rememberDefaultLogin }) {
    await tick()
    const trimmed = account.trim()
    if (!trimmed) {
      return failWith("password", "", { code: "account-empty", field: "account", message: "请输入登录账号" })
    }
    if (!password) {
      return failWith("password", trimmed, { code: "password-empty", field: "password", message: "请输入密码" })
    }
    const lower = trimmed.toLowerCase()
    const candidates = allUsers().filter(
      (u) => u.account.toLowerCase() === lower || u.phone === trimmed,
    )
    const orgs = allOrgs()
    const user = workspaceId
      ? candidates.find((u) => enterpriseRootOf(orgs, u.orgId)?.id === workspaceId)
      : candidates[0]
    if (!user) {
      return failWith("password", trimmed, { code: "user-not-found", field: "account", message: "账号或密码不正确" })
    }
    // 密码连续错误锁定：锁定期内密码正确也拒绝（userId 维度，跨企业命名空间生效）
    const guard = loginGuardOf(user.id)
    if (guard.locked) {
      return failWith(
        "password",
        user.account,
        {
          code: "account-locked",
          field: "password",
          message: `密码连续输错次数过多，账号已锁定，请 ${lockRemainText(guard.remainMs)} 后重试，或改用短信验证码登录 / 找回密码`,
        },
      )
    }
    const expected = expectedPasswordOf(user.id)
    if (password !== expected) {
      const after = registerPasswordFail(user.id)
      if (after.locked) {
        pushAuthAudit({
          action: "账号锁定",
          outcome: "成功",
          actorLabel: user.account,
          reason: "PASSWORD_LOCK_TRIGGERED",
          resource: "auth.account-security",
          target: user.account,
        })
      }
      const message = after.locked
        ? `密码连续输错 ${PASSWORD_FAIL_LIMIT} 次，账号已锁定 15 分钟；可改用短信验证码登录或找回密码`
        : after.remainingAttempts <= 2
          ? `账号或密码不正确，还可尝试 ${after.remainingAttempts} 次`
          : "账号或密码不正确"
      return failWith("password", user.account, { code: "password-wrong", field: "password", message })
    }
    clearLoginGuard(user.id)
    const ws = workspaceId
      ? { realm: realmOfWorkspace(workspaceId) ?? ("TENANT" as const), workspaceId }
      : workspaceOfUser(user.id)
    // 租户暂停/终止：与短信路径同口径，按企业码停用统一文案拒绝
    if (ws.realm === "TENANT" && !tenantLoginAllowed(ws.workspaceId)) {
      return failWith(
        "password",
        user.account,
        { code: "enterprise-invalid", field: "entcode", message: "企业编码不存在或已停用，请核对后重试" },
      )
    }
    if (workspaceId && !isWorkspaceMember(user, ws.realm, ws.workspaceId)) {
      return failWith("password", user.account, { code: "user-not-found", field: "account", message: "账号或密码不正确" })
    }
    const memberStatus = memberStatusOf(user.id, ws.workspaceId)
    if (memberStatus === "frozen") {
      return failWith(
        "password",
        user.account,
        { code: "account-frozen", message: "该账号在本企业已被冻结，请联系企业管理员" },
      )
    }
    if (memberStatus === "removed") {
      return failWith(
        "password",
        user.account,
        { code: "membership-removed", message: "你在本企业的成员身份已被移除，如需恢复请联系企业管理员" },
      )
    }
    let activationNotice: string | undefined
    if (memberStatus === "pending_activation") {
      activatedMemberKeys.add(`${user.id}:${ws.workspaceId}`)
      activationNotice = "账号已激活，欢迎加入"
      pushAuthAudit({
        action: "首次登录激活",
        outcome: "成功",
        actorLabel: user.account,
        reason: "ACCOUNT_ACTIVATED",
        resource: "auth.account",
        context: { workspaceId: ws.workspaceId },
      })
      if (completeRuntimeActivation(user.id, ws.workspaceId)) {
        pushAuthAudit({
          action: "租户激活",
          outcome: "成功",
          actorLabel: user.account,
          reason: "TENANT_ACTIVATED",
          resource: "auth.tenant",
          context: { workspaceId: ws.workspaceId },
        })
      }
    }
    const resolved = resolvePrincipal(user.id, ws.realm, ws.workspaceId)
    if (!resolved.ok) return failWith("password", user.account, resolved.failure)
    const result = succeedWith("password", resolved.principal, undefined, {
      pendingPharmas: resolved.pendingPharmas,
      ...(activationNotice ? { activationNotice } : {}),
    })
    if (result.ok && rememberDefaultLogin) upsertDefaultLoginFromSession(result.session, true)
    else if (result.ok) upsertDefaultLoginFromSession(result.session)
    return result
  },

  /**
   * 工作空间编码解析（登录卡第 1 步）：后台编码 → 系统管理后台（realm=PLATFORM）；
   * 企业编码 → 租户工作空间。不存在/停用/租户暂停或终止统一失败文案，不区分（防探测）。
   */
  async resolveEnterprise({ code }) {
    await tick(120)
    const normalized = code.trim().toUpperCase()
    const resolved = resolveEnterpriseByCode(normalized)
    if (!resolved) {
      pushAuthAudit({
        action: "企业编码解析",
        outcome: "失败",
        actorLabel: "未认证",
        reason: "ENT_CODE_INVALID",
        resource: "auth.enterprise",
        target: normalized || "（空）",
      })
      return {
        ok: false,
        failure: {
          code: "enterprise-invalid",
          field: "entcode",
          message: "企业编码不存在或已停用，请核对后重试",
        },
      }
    }
    // 套餐开通期校验（2026-09-18 套餐模型）：过期租户在第一步即拦截，给明确续期指引
    const expiredTenant = tenantByEnterpriseOrgId(resolved.enterpriseId)
    if (expiredTenant && tenantExpired(expiredTenant)) {
      pushAuthAudit({
        action: "企业编码解析",
        outcome: "失败",
        actorLabel: "未认证",
        reason: "TENANT_EXPIRED",
        resource: "auth.enterprise",
        target: normalized,
        context: { workspaceId: resolved.enterpriseId, expireAt: expiredTenant.expireAt },
      })
      return {
        ok: false,
        failure: {
          code: "tenant-expired",
          field: "entcode",
          message: `该企业的系统开通已于 ${expiredTenant.expireAt} 到期，登录已停止；请联系软件服务方续期。`,
        },
      }
    }
    const realm = realmOfWorkspace(resolved.enterpriseId)
    if (!realm) {
      return {
        ok: false,
        failure: { code: "enterprise-invalid", field: "entcode", message: "企业编码不存在或已停用，请核对后重试" },
      }
    }
    const workspaceLabel = realm === "PLATFORM" ? PLATFORM_WORKSPACE_NAME : resolved.enterpriseName
    return {
      ok: true,
      enterpriseId: resolved.enterpriseId,
      enterpriseName: resolved.enterpriseName,
      realm,
      workspaceLabel,
    }
  },

  async requestSms({ enterpriseId, phone }) {
    await tick()
    const trimmed = phone.trim()
    if (!/^1\d{10}$/.test(trimmed)) {
      return {
        ok: false,
        failure: { code: "phone-not-bound", field: "phone", message: "请输入正确的 11 位手机号" },
      }
    }
    const realm = realmOfWorkspace(enterpriseId) ?? "TENANT"
    // 请求阶段不做成员与状态判断：格式合法一律统一成功态；
    // 非本工作空间成员返回随机假码（防枚举），成员状态在校验成功后才披露
    const user = allUsers().find((u) => u.phone === trimmed)
    const member = user ? isWorkspaceMember(user, realm, enterpriseId) : false
    const displayed = member ? DEMO_SMS_CODE : generateDecoyCode()
    smsTickets.set(smsTicketKey(enterpriseId, trimmed), {
      code: member ? displayed : DECOY_CODE,
      decoy: !member,
      expiresAt: Date.now() + SMS_TTL_MS,
      attempts: 0,
      requestedAt: Date.now(),
    })
    pushAuthAudit({
      action: "发送短信验证码",
      outcome: "成功",
      actorLabel: maskPhone(trimmed),
      reason: member ? "SMS_SENT" : "SMS_SENT_DECOY",
      resource: "auth.sms",
      target: maskPhone(trimmed),
      context: { workspaceId: enterpriseId, phone: trimmed },
    })
    return { ok: true, devCode: displayed, expiresIn: SMS_TTL_MS / 1000 }
  },

  async verifySms({ enterpriseId, phone, code, rememberDefaultLogin }) {
    await tick()
    const trimmed = phone.trim()
    const realm = realmOfWorkspace(enterpriseId) ?? "TENANT"
    const key = smsTicketKey(enterpriseId, trimmed)
    const ticket = smsTickets.get(key)
    const user = allUsers().find((u) => u.phone === trimmed)
    const smsCtx: AuthAuditContext = { workspaceId: enterpriseId, phone: trimmed }
    if (!ticket) {
      return failWith("sms", maskPhone(trimmed), { code: "sms-not-requested", field: "code", message: "请先获取短信验证码" }, undefined, smsCtx)
    }
    const ticketFailure = checkSmsTicket(ticket, code)
    if (ticketFailure) {
      if (ticketFailure.code === "sms-code-expired" || ticketFailure.code === "sms-attempts-exceeded") {
        smsTickets.delete(key)
      }
      return failWith("sms", maskPhone(trimmed), ticketFailure, undefined, smsCtx)
    }
    // 验证码校验成功 → 此后才做成员/账号状态判定与披露（防枚举口径）
    smsTickets.delete(key)
    // 租户暂停/终止：已有票据在暂停瞬间失效，按统一企业码停用口径拒绝
    if (realm === "TENANT" && !tenantLoginAllowed(enterpriseId)) {
      return failWith(
        "sms",
        maskPhone(trimmed),
        { code: "enterprise-invalid", field: "entcode", message: "企业编码不存在或已停用，请核对后重试" },
        undefined,
        smsCtx,
      )
    }
    if (!user || !isWorkspaceMember(user, realm, enterpriseId)) {
      return failWith(
        "sms",
        maskPhone(trimmed),
        { code: "sms-code-wrong", field: "code", message: "验证码不正确，还可尝试 2 次" },
        undefined,
        smsCtx,
      )
    }
    const memberStatus = memberStatusOf(user.id, enterpriseId)
    if (memberStatus === "frozen") {
      return failWith(
        "sms",
        user.account,
        { code: "account-frozen", message: "该账号在本企业已被冻结，请联系企业管理员" },
        undefined,
        smsCtx,
      )
    }
    if (memberStatus === "removed") {
      return failWith(
        "sms",
        user.account,
        { code: "membership-removed", message: "你在本企业的成员身份已被移除，如需恢复请联系企业管理员" },
        undefined,
        smsCtx,
      )
    }
    let activationNotice: string | undefined
    if (memberStatus === "pending_activation") {
      activatedMemberKeys.add(`${user.id}:${enterpriseId}`)
      activationNotice = "账号已激活，欢迎加入"
      pushAuthAudit({
        action: "首次登录激活",
        outcome: "成功",
        actorLabel: user.account,
        reason: "ACCOUNT_ACTIVATED",
        resource: "auth.account",
        context: smsCtx,
      })
      if (completeRuntimeActivation(user.id, enterpriseId)) {
        pushAuthAudit({
          action: "租户激活",
          outcome: "成功",
          actorLabel: user.account,
          reason: "TENANT_ACTIVATED",
          resource: "auth.tenant",
          context: { workspaceId: enterpriseId },
        })
      }
    }
    const resolved = resolvePrincipal(user.id, realm, enterpriseId)
    if (!resolved.ok) {
      return failWith("sms", user.account, resolved.failure, undefined, smsCtx)
    }
    const result = succeedWith("sms", resolved.principal, undefined, {
      pendingPharmas: resolved.pendingPharmas,
      ...(activationNotice ? { activationNotice } : {}),
    })
    // FR-01/02：勾选「记住默认登录」且验证成功 → 本设备保存默认登录（不含验证码本体）
    if (result.ok && rememberDefaultLogin) upsertDefaultLoginFromSession(result.session, true)
    return result
  },

  async createQr({ source }) {
    await tick(80)
    qrFlowDebug.ticketsCreated += 1
    const ticket = `qr-${source}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    const state: QrTicket = {
      ticket,
      source,
      status: "waiting",
      expiresAt: Date.now() + QR_TTL_MS,
      result: null,
    }
    qrTickets.set(ticket, state)
    return { ok: true, state: publicState(state) }
  },

  async refreshQr(ticket) {
    await tick(80)
    qrTickets.delete(ticket)
    const source: QrSource = ticket.includes("wecom") ? "wecom" : "wechat"
    const fresh: QrTicket = {
      ticket: `qr-${source}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      source,
      status: "waiting",
      expiresAt: Date.now() + QR_TTL_MS,
      result: null,
    }
    qrTickets.set(fresh.ticket, fresh)
    return { ok: true, state: publicState(fresh) }
  },

  async simulateScan(ticket, identityId) {
    const qr = qrTickets.get(ticket)
    if (!qr || qr.status !== "waiting") {
      return { ok: false, failure: { code: "qr-not-scanned", message: "二维码已失效，请刷新后重试" } }
    }
    if (Date.now() > qr.expiresAt) {
      qr.status = "expired"
      return { ok: false, failure: { code: "qr-expired", message: "二维码已过期" } }
    }
    const identity = identityOf(identityId)
    if (!identity) {
      return { ok: false, failure: { code: "qr-not-scanned", message: "未知扫码身份" } }
    }
    qr.identityId = identityId
    qr.status = "scanned"
    qr.confirmAt = Date.now() + QR_CONFIRM_MS
    return { ok: true, state: publicState(qr) }
  },

  async pollQr(ticket) {
    await tick(60)
    qrFlowDebug.polls += 1
    const qr = qrTickets.get(ticket)
    if (!qr) {
      return { state: { ticket, source: "wecom", status: "expired", expiresAt: 0 }, result: null }
    }
    if (qr.result) {
      const result = qr.result
      qrTickets.delete(ticket)
      return { state: publicState(qr), result }
    }
    if (Date.now() > qr.expiresAt) {
      qr.status = "expired"
      return { state: publicState(qr), result: null }
    }
    if (qr.status === "scanned" && qr.confirmAt && Date.now() >= qr.confirmAt) {
      const identity = identityOf(qr.identityId ?? "")
      if (!identity) {
        qr.result = { ok: false, failure: { code: "qr-identity-unbound", message: "扫码失败" } }
      } else if (!identity.userId) {
        const failure: LoginFailure = {
          code: "qr-identity-unbound",
          field: "qr",
          message: `扫码身份「${identity.label}」尚未绑定系统账号，请联系管理员完成绑定`,
        }
        pushAuthAudit({
          action: methodActionLabel("qr", identity.source),
          outcome: "失败",
          actorLabel: identity.detail,
          reason: auditCodeOf(failure),
          method: "qr",
          qrSource: identity.source,
        })
        qr.result = { ok: false, failure }
      } else {
        const ws = workspaceOfUser(identity.userId)
        const resolved = resolvePrincipal(identity.userId, ws.realm, ws.workspaceId)
        qr.result = resolved.ok
          ? succeedWith("qr", resolved.principal, identity.source, {
              pendingPharmas: resolved.pendingPharmas,
            })
          : failWith("qr", identity.label, resolved.failure, identity.source)
      }
      qr.status = "confirmed"
      return { state: publicState(qr), result: qr.result }
    }
    return { state: publicState(qr), result: null }
  },

  async listServingPharmas(userId, providerTenantId) {
    await tick(60)
    return visiblePharmasForUser(userId, providerTenantId).map((p) => ({ ...p }))
  },

  /**
   * 选择/切换服务药厂：基于当前会话主体仅叠加 currentPharma 字段签发。
   * 进入条件统一走 enterablePharma（备案警告不阻断）；被拒走 PHARMA_BLOCKED_<kind>。
   */
  async chooseServingPharma({ userId, pharmaId, principal, method, qrSource }) {
    await tick()
    if (principal.realm !== "TENANT") {
      return { ok: false, failure: { code: "no-active-assignment", message: "系统管理后台不进入药厂业务" } }
    }
    // 租户（所属服务商）暂停/终止时，认证类换发请求失效
    if (!tenantLoginAllowed(principal.tenantId)) {
      return {
        ok: false,
        failure: { code: "no-active-assignment", message: "当前已无法进入该药厂，权限信息已刷新" },
      }
    }
    const pharmas = visiblePharmasForUser(userId, principal.tenantId)
    const target = pharmas.find((p) => p.id === pharmaId)
    const isSwitch = Boolean(principal.currentPharmaTenantId)
    const action = isSwitch ? "切换服务药厂" : "选择服务药厂"
    if (!target || !enterablePharma(target)) {
      const kind = target?.blockedKind ?? "cooperation_paused"
      pushAuthAudit({
        action,
        outcome: "失败",
        actorLabel: principal.account,
        reason: `PHARMA_BLOCKED_${kind.toUpperCase()}`,
        resource: "auth.serving-pharma",
        principal,
        context: { pharmaId, workspaceId: principal.tenantId },
      })
      return {
        ok: false,
        failure: {
          code: "no-active-assignment",
          message: "当前已无法进入该药厂，权限信息已刷新",
        },
      }
    }
    const nextPrincipal: TenantPrincipal = {
      ...principal,
      currentPharmaTenantId: target.id,
      currentPharmaName: target.name,
      ...(target.warningKind ? { pharmaWarning: target.warningKind } : { pharmaWarning: undefined }),
    }
    const session = newSession(nextPrincipal, method ?? "sms", qrSource)
    pushAuthAudit({
      action,
      outcome: "成功",
      actorLabel: nextPrincipal.account,
      reason: isSwitch ? "PHARMA_SWITCHED" : "PHARMA_SELECTED",
      resource: "auth.serving-pharma",
      principal: nextPrincipal,
      context: { pharmaId: target.id, workspaceId: principal.tenantId },
    })
    // 默认登录已启用时同步最近服务药厂（需求 §3.2「沿用最近选择」）
    upsertDefaultLoginFromSession(session)
    return { ok: true, session }
  },

  /** 应用启动恢复默认登录；结果按页面加载缓存（StrictMode 双挂载不重复审计） */
  async restoreDefaultLogin(): Promise<DefaultLoginRestoreResult> {
    restoreInFlight ??= doRestoreDefaultLogin()
    return restoreInFlight
  },

  /**
   * 有效可切换企业列表（FR-05）：成员 active + 租户可登录 + 企业内存在可登录身份，
   * 三者任一不满足即不返回（不向用户暴露停用/未激活企业名称）。
   */
  async listSwitchableEnterprises({ userId, currentWorkspaceId }) {
    await tick(80)
    const user = allUsers().find((u) => u.id === userId)
    if (!user) return []
    const list: SwitchableEnterprise[] = []
    for (const m of membershipsOfUser(user.id)) {
      if (realmOfWorkspace(m.tenantId) !== "TENANT") continue
      if (!tenantLoginAllowed(m.tenantId)) continue
      if (memberStatusOf(user.id, m.tenantId)) continue
      const resolved = resolvePrincipal(user.id, "TENANT", m.tenantId)
      if (!resolved.ok) continue
      const opts = resolved.identityOptions
      const primary = opts[0]
      list.push({
        workspaceId: m.tenantId,
        tenantName: primary.tenantName ?? m.tenantName,
        tenantKind: primary.tenantKind ?? "pharma",
        membershipId: primary.membershipId ?? m.id,
        // 多角色合并进同一会话：摘要列全部角色 + 组织
        roleSummary: `${opts.map((o) => o.roleName).join(" · ")}${primary.orgName ? ` · ${primary.orgName}` : ""}`,
        identityCount: opts.length,
        isCurrent: m.tenantId === currentWorkspaceId,
        requiresReauth: opts.some((o) => SENSITIVE_SWITCH_ROLE_IDS.has(o.roleId)),
      })
    }
    return list
  },

  /**
   * 免重认证切换企业（FR-06）：切换前再次校验（需求 §7「切换期间目标企业权限变化」），
   * 失败停留当前企业并给出原因；成功换发目标企业上下文会话（业务树整树重建，
   * 目标企业多角色自动合并进同一会话）、服务商业务身份附带待选药厂；
   * 本设备默认登录已启用时同步更新默认企业（FR-07）。
   */
  async switchEnterprise({ userId, targetWorkspaceId, currentWorkspaceId, method }) {
    await tick()
    const user = allUsers().find((u) => u.id === userId)
    const beforeName = tenantNameOf(currentWorkspaceId)
    const targetName = tenantNameOf(targetWorkspaceId)
    const switchFail = (message: string, reason: string): AuthResult => {
      pushAuthAudit({
        action: "切换企业",
        outcome: "失败",
        actorLabel: user?.account ?? userId,
        reason,
        resource: "auth.enterprise-switch",
        target: targetName,
        before: beforeName,
        context: { workspaceId: targetWorkspaceId },
      })
      return { ok: false, failure: { code: "no-active-assignment", message } }
    }
    if (!user) {
      return switchFail("账号不存在，请重新登录", "USER_NOT_FOUND")
    }
    if (targetWorkspaceId === currentWorkspaceId) {
      return switchFail("目标企业即当前企业，无需切换", "ENTERPRISE_SAME")
    }
    if (realmOfWorkspace(targetWorkspaceId) !== "TENANT" || !tenantLoginAllowed(targetWorkspaceId)) {
      return switchFail("目标企业当前不可用（已停用或暂停），请刷新列表后重试", "ENTERPRISE_BLOCKED")
    }
    if (memberStatusOf(user.id, targetWorkspaceId)) {
      return switchFail("你在目标企业的成员身份已失效，无法切换", "ENTERPRISE_MEMBER_INVALID")
    }
    const resolved = resolvePrincipal(user.id, "TENANT", targetWorkspaceId)
    if (!resolved.ok) {
      return switchFail(resolved.failure.message, auditCodeOf(resolved.failure))
    }
    const session = newSession(resolved.principal, method ?? "sms", undefined, {
      pendingPharmas: resolved.pendingPharmas,
    })
    upsertDefaultLoginFromSession(session)
    pushAuthAudit({
      action: "切换企业",
      outcome: "成功",
      actorLabel: resolved.principal.account,
      reason: "ENTERPRISE_SWITCHED",
      resource: "auth.enterprise-switch",
      principal: resolved.principal,
      target: targetName,
      before: beforeName,
      context: { workspaceId: targetWorkspaceId, device: ensureDeviceId() },
    })
    return { ok: true, session }
  },

  /**
   * 切换敏感权限企业前的短信重新认证（AC-08 演示口径）：只消费票据不签发会话；
   * 票据校验与登录共用 checkSmsTicket（过期/超次/错码口径一致）。
   */
  async verifyReauthCode({ enterpriseId, phone, code }) {
    await tick()
    const trimmed = phone.trim()
    const key = smsTicketKey(enterpriseId, trimmed)
    const ticket = smsTickets.get(key)
    const user = allUsers().find((u) => u.phone === trimmed)
    const actorLabel = user?.account ?? maskPhone(trimmed)
    const reauthCtx: AuthAuditContext = { workspaceId: enterpriseId, phone: trimmed }
    const deny = (failure: LoginFailure, reason: string) => {
      pushAuthAudit({
        action: "切换企业重新认证",
        outcome: "失败",
        actorLabel,
        reason,
        resource: "auth.enterprise-switch",
        context: reauthCtx,
      })
      return { ok: false, failure }
    }
    if (!ticket) {
      return deny({ code: "sms-not-requested", field: "code", message: "请先获取短信验证码" }, "SMS_NOT_REQUESTED")
    }
    const ticketFailure = checkSmsTicket(ticket, code)
    if (ticketFailure) {
      if (ticketFailure.code === "sms-code-expired" || ticketFailure.code === "sms-attempts-exceeded") {
        smsTickets.delete(key)
      }
      return deny(ticketFailure, auditCodeOf(ticketFailure))
    }
    smsTickets.delete(key)
    pushAuthAudit({
      action: "切换企业重新认证",
      outcome: "成功",
      actorLabel,
      reason: "REAUTH_PASSED",
      resource: "auth.enterprise-switch",
      context: reauthCtx,
    })
    return { ok: true }
  },

  async logout(session) {
    await tick(60)
    const p = session.principal
    const roleText =
      p.realm === "PLATFORM" ? p.platformRoleName : p.roleNames.join("+")
    const event: PermAuditEvent = {
      id: nextId("PE"),
      time: nowStamp(),
      actor: p.name,
      actorRole: roleText,
      org: p.realm === "PLATFORM" ? PLATFORM_WORKSPACE_NAME : p.tenantName,
      target: p.account,
      roleName: roleText,
      module: "登录认证",
      action: "退出登录",
      resource: "auth.logout",
      decision: "允许",
      reason: "LOGOUT",
      requestId: nextId("req"),
      ip: "10.4.21.8",
      result: "成功",
    }
    pendingLoginAudits.unshift(event)
    // FR-08：主动退出登录 → 本设备默认登录立即失效（撤销审计）
    const record = loadDefaultLogin()
    if (record && record.userId === session.principal.userId) {
      revokeDefaultLoginRecord("USER_LOGOUT", record, session.principal)
    }
  },
}

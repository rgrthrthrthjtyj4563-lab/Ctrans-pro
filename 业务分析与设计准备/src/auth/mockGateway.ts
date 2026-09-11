/**
 * Mock Gateway：前端认证契约的演示实现。全部逻辑在内存中，无持久会话；
 * 刷新页面即重新登录。生产接入时本文件整体替换为真实接口适配层。
 */

import type { PermAuditEvent, RoleAssignment, SysRole } from "../data/permissions"
import {
  PERM_USERS,
  seedAssignments,
  PRESET_ROLES,
  seedCustomRoles,
  perspectiveRoleOf,
  nextId,
  nowStamp,
} from "../data/permissions"
import {
  AUTH_PROFILES,
  DEMO_PASSWORD,
  QR_IDENTITIES,
  SPECIALIST_SERVING_PHARMAS,
  enterpriseNameOfOrg,
} from "./authProfiles"
import type {
  AuthGateway,
  AuthPrincipal,
  AuthResult,
  AuthSession,
  LoginFailure,
  QrIdentity,
  QrLoginState,
  QrSource,
  ServingPharma,
} from "./authTypes"

const ALL_ROLES: SysRole[] = [...PRESET_ROLES, ...seedCustomRoles]

const SMS_TTL_MS = 5 * 60_000
const SMS_MAX_ATTEMPTS = 3
const QR_TTL_MS = 120_000
const QR_CONFIRM_MS = 1_800

function tick(ms = 160): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

interface AssignmentDecision {
  active: RoleAssignment[]
  /** 没有任何 active 记录时，给出最贴近事实的拒绝原因 */
  blocker?: LoginFailure
}

function decideAssignments(userId: string): AssignmentDecision {
  const mine = seedAssignments.filter((a) => a.userId === userId)
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
        message: `授权已于 ${dateExpired.effectiveTo} 到期，请联系管理员续期`,
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
    return {
      active: [],
      blocker: { code: "assignment-expired", message: "账号的角色授权已过期，请联系管理员" },
    }
  }
  if (mine.some((a) => a.status === "revoked")) {
    return {
      active: [],
      blocker: { code: "assignment-revoked", message: "账号的角色授权已被回收，请联系管理员" },
    }
  }
  return {
    active: [],
    blocker: { code: "no-active-assignment", message: "该账号尚未获得任何生效的角色授权，请联系管理员" },
  }
}

/** 账号 + 生效授权 → 认证主体；preferredRoleId 用于扫码身份指定进入的角色 */
function resolvePrincipal(
  userId: string,
  preferredRoleId?: string,
): { ok: true; principal: AuthPrincipal; pendingPharmas?: ServingPharma[] } | { ok: false; failure: LoginFailure } {
  const user = PERM_USERS.find((u) => u.id === userId)
  if (!user) {
    return { ok: false, failure: { code: "user-not-found", field: "account", message: "账号不存在，请输入用户名或已绑定手机号" } }
  }
  if (user.accountStatus !== "enabled") {
    return { ok: false, failure: { code: "account-disabled", field: "account", message: `账号「${user.name}」已停用，无法登录` } }
  }
  const { active, blocker } = decideAssignments(user.id)
  if (blocker) return { ok: false, failure: blocker }
  if (active.length > 0 && active.every((a) => a.scope === "MOBILE")) {
    // 多租户口径：纯移动端服务专员名下有生效中的服务药厂授权时放行，
    // 进入工作台前由「选择服务药厂」步骤确定业务范围；无授权的维持仅限移动端拦截
    const pharmas = SPECIALIST_SERVING_PHARMAS[user.id] ?? []
    if (!pharmas.some((p) => p.status === "active")) {
      return {
        ok: false,
        failure: {
          code: "role-mobile-only",
          field: "account",
          message: `账号「${user.name}」的服务专员角色仅限移动端使用，请使用药友料 App 登录`,
        },
      }
    }
  }

  let assignment = active[0]
  if (preferredRoleId) {
    const hit = active.find((a) => a.roleId === preferredRoleId)
    if (!hit) {
      return {
        ok: false,
        failure: {
          code: "no-active-assignment",
          field: "account",
          message: "该扫码身份指定的角色当前没有生效授权，请联系管理员",
        },
      }
    }
    assignment = hit
  } else {
    const profile = AUTH_PROFILES[user.id]
    if (profile) {
      assignment = active.find((a) => a.roleId === profile.defaultRoleId) ?? assignment
    }
  }
  const role = ALL_ROLES.find((r) => r.id === assignment.roleId)
  if (!role || role.status !== "enabled") {
    return { ok: false, failure: { code: "no-active-assignment", message: "当前生效的角色不可用，请联系管理员" } }
  }
  const enterprise = enterpriseNameOfOrg(user.orgId)
  // 名下配置了服务药厂授权的账号，登录会话附带待选列表（未配置的与普通账号一致直进）
  const pendingPharmas = SPECIALIST_SERVING_PHARMAS[user.id]
  return {
    ok: true,
    principal: {
      userId: user.id,
      name: user.name,
      account: user.account,
      phone: user.phone,
      orgId: user.orgId,
      orgName: user.orgName,
      enterpriseId: enterprise.id,
      enterpriseName: enterprise.name,
      roleId: role.id,
      roleName: role.name,
      assignmentId: assignment.id,
      scope: assignment.scope,
      scopeOrgId: assignment.scopeOrgId,
      scopeOrgName: assignment.scopeOrgName,
      perspective: perspectiveRoleOf(role),
    },
    ...(pendingPharmas && pendingPharmas.length > 0 ? { pendingPharmas } : {}),
  }
}

// ─── 登录审计缓冲（业务壳挂载后并入「操作日志」） ────────────────────────────

const pendingLoginAudits: PermAuditEvent[] = []

function pushLoginAudit(
  method: AuthSession["method"],
  outcome: "成功" | "失败",
  actorLabel: string,
  opts?: { principal?: AuthPrincipal; reason?: string; qrSource?: QrSource },
): void {
  const actionMap = { password: "密码登录", sms: "短信验证码登录", qr: "扫码登录" } as const
  const event: PermAuditEvent = {
    id: nextId("PE"),
    time: nowStamp(),
    actor: opts?.principal?.name ?? actorLabel,
    actorRole: opts?.principal?.roleName ?? "未认证",
    org: opts?.principal?.orgName ?? "—",
    target: opts?.principal?.account ?? actorLabel,
    roleName: opts?.principal?.roleName,
    module: "登录认证",
    action:
      actionMap[method] + (opts?.qrSource ? `（${opts.qrSource === "wecom" ? "企业微信" : "微信开放平台"}）` : ""),
    resource: "auth.login",
    decision: outcome === "成功" ? "允许" : "拒绝",
    reason: opts?.reason ?? (outcome === "成功" ? "认证通过" : "认证失败"),
    requestId: nextId("req"),
    ip: "10.4.21.8",
    result: outcome,
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
  opts?: { pendingPharmas?: ServingPharma[]; identityConfirmed?: boolean },
): AuthSession {
  return {
    id: `sess-${Date.now()}-${nextId("n")}`,
    principal,
    method,
    qrSource,
    loginAt: nowStamp(),
    ...(opts?.identityConfirmed !== undefined ? { identityConfirmed: opts.identityConfirmed } : {}),
    ...(opts?.pendingPharmas ? { pendingPharmas: opts.pendingPharmas } : {}),
  }
}

function failWith(
  method: AuthSession["method"],
  actorLabel: string,
  failure: LoginFailure,
  qrSource?: QrSource,
): AuthResult {
  pushLoginAudit(method, "失败", actorLabel, { reason: failure.message, qrSource })
  return { ok: false, failure }
}

function succeedWith(
  method: AuthSession["method"],
  principal: AuthPrincipal,
  qrSource?: QrSource,
  opts?: { pendingPharmas?: ServingPharma[] },
): AuthResult {
  pushLoginAudit(method, "成功", principal.account, { principal, qrSource })
  return { ok: true, session: newSession(principal, method, qrSource, opts) }
}

// ─── 短信验证码（模拟：验证码直接回显，不发真实短信） ────────────────────────

interface SmsTicket {
  code: string
  expiresAt: number
  attempts: number
  requestedAt: number
}
const smsTickets = new Map<string, SmsTicket>()

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
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

// ─── 网关实现 ────────────────────────────────────────────────────────────────

export const authGateway: AuthGateway = {
  async loginPassword({ account, password }) {
    await tick()
    const trimmed = account.trim()
    if (!trimmed) {
      return failWith("password", "", { code: "account-empty", field: "account", message: "请输入用户名或手机号" })
    }
    if (!password) {
      return failWith("password", trimmed, { code: "password-empty", field: "password", message: "请输入密码" })
    }
    const user = PERM_USERS.find(
      (u) => u.account === trimmed.toLowerCase() || u.phone === trimmed,
    )
    if (!user) {
      return failWith("password", trimmed, { code: "user-not-found", field: "account", message: "账号不存在，请输入用户名或已绑定手机号" })
    }
    const profile = AUTH_PROFILES[user.id]
    // 未登记的账号统一用演示密码兜底（随后仍会被停用/无授权校验阻断）
    const expected = profile?.password ?? DEMO_PASSWORD
    if (password !== expected) {
      return failWith("password", user.account, { code: "password-wrong", field: "password", message: "密码不正确（演示环境固定密码见左侧提示）" })
    }
    const resolved = resolvePrincipal(user.id)
    if (!resolved.ok) return failWith("password", user.account, resolved.failure)
    return succeedWith("password", resolved.principal, undefined, {
      pendingPharmas: resolved.pendingPharmas,
    })
  },

  async requestSms({ phone }) {
    await tick()
    const trimmed = phone.trim()
    if (!/^1\d{10}$/.test(trimmed)) {
      return { ok: false, failure: { code: "phone-not-bound", field: "phone", message: "请输入 1 开头的 11 位手机号" } }
    }
    const user = PERM_USERS.find((u) => u.phone === trimmed)
    if (!user) {
      return { ok: false, failure: { code: "phone-not-bound", field: "phone", message: "该手机号未绑定任何系统账号" } }
    }
    const resolvedUser = resolvePrincipal(user.id)
    if (!resolvedUser.ok) {
      return { ok: false, failure: resolvedUser.failure }
    }
    const code = generateCode()
    smsTickets.set(trimmed, { code, expiresAt: Date.now() + SMS_TTL_MS, attempts: 0, requestedAt: Date.now() })
    return { ok: true, devCode: code, expiresIn: SMS_TTL_MS / 1000 }
  },

  async verifySms({ phone, code }) {
    await tick()
    const trimmed = phone.trim()
    const ticket = smsTickets.get(trimmed)
    const user = PERM_USERS.find((u) => u.phone === trimmed)
    if (!ticket) {
      return failWith("sms", trimmed, { code: "sms-not-requested", field: "code", message: "请先获取短信验证码" })
    }
    if (Date.now() > ticket.expiresAt) {
      smsTickets.delete(trimmed)
      return failWith("sms", trimmed, { code: "sms-code-expired", field: "code", message: "验证码已失效，请重新获取" })
    }
    if (ticket.attempts >= SMS_MAX_ATTEMPTS) {
      smsTickets.delete(trimmed)
      return failWith("sms", trimmed, { code: "sms-attempts-exceeded", field: "code", message: "验证码输错次数过多已作废，请重新获取" })
    }
    if (code !== ticket.code) {
      ticket.attempts += 1
      const left = SMS_MAX_ATTEMPTS - ticket.attempts
      return failWith(
        "sms",
        trimmed,
        left > 0
          ? { code: "sms-code-wrong", field: "code", message: `验证码不正确，还可尝试 ${left} 次` }
          : { code: "sms-attempts-exceeded", field: "code", message: "验证码输错次数过多已作废，请重新获取" },
      )
    }
    smsTickets.delete(trimmed)
    if (!user) {
      return failWith("sms", trimmed, { code: "user-not-found", field: "phone", message: "账号不存在" })
    }
    const resolved = resolvePrincipal(user.id)
    if (!resolved.ok) return failWith("sms", user.account, resolved.failure)
    return succeedWith("sms", resolved.principal, undefined, {
      pendingPharmas: resolved.pendingPharmas,
    })
  },

  async createQr({ source }) {
    await tick(80)
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
        pushLoginAudit("qr", "失败", identity.detail, { reason: failure.message, qrSource: identity.source })
        qr.result = { ok: false, failure }
      } else {
        const resolved = resolvePrincipal(identity.userId, identity.roleId)
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

  async listServingPharmas(userId) {
    await tick(60)
    return (SPECIALIST_SERVING_PHARMAS[userId] ?? []).map((p) => ({ ...p }))
  },

  async chooseServingPharma({ userId, pharmaId, method, qrSource }) {
    await tick()
    const user = PERM_USERS.find((u) => u.id === userId)
    if (!user) {
      return { ok: false, failure: { code: "user-not-found", field: "account", message: "账号不存在" } }
    }
    const pharmas = SPECIALIST_SERVING_PHARMAS[userId] ?? []
    const target = pharmas.find((p) => p.id === pharmaId)
    if (!target) {
      return { ok: false, failure: { code: "no-active-assignment", message: "该药厂不在当前账号的服务授权内" } }
    }
    if (target.status === "paused") {
      return {
        ok: false,
        failure: { code: "no-active-assignment", message: `${target.name}的合作授权已暂停，请联系管理员` },
      }
    }
    const resolved = resolvePrincipal(userId)
    if (!resolved.ok) return { ok: false, failure: resolved.failure }
    const principal: AuthPrincipal = {
      ...resolved.principal,
      servingPharmaId: target.id,
      servingPharmaName: target.name,
    }
    const session = newSession(principal, method ?? "password", qrSource, {
      identityConfirmed: true,
    })
    pendingLoginAudits.unshift({
      id: nextId("PE"),
      time: nowStamp(),
      actor: principal.name,
      actorRole: principal.roleName,
      org: principal.orgName,
      target: principal.account,
      roleName: principal.roleName,
      module: "登录认证",
      action: "选择服务药厂",
      resource: "auth.serving-pharma",
      decision: "允许",
      reason: `进入${target.name}业务范围（所属企业不变：${principal.enterpriseName}）`,
      requestId: nextId("req"),
      ip: "10.4.21.8",
      result: "成功",
    })
    return { ok: true, session }
  },

  async logout(session) {
    await tick(60)
    const event: PermAuditEvent = {
      id: nextId("PE"),
      time: nowStamp(),
      actor: session.principal.name,
      actorRole: session.principal.roleName,
      org: session.principal.orgName,
      target: session.principal.account,
      roleName: session.principal.roleName,
      module: "登录认证",
      action: "退出登录",
      resource: "auth.logout",
      decision: "允许",
      reason: "用户主动退出，会话即销毁",
      requestId: nextId("req"),
      ip: "10.4.21.8",
      result: "成功",
    }
    pendingLoginAudits.unshift(event)
  },
}


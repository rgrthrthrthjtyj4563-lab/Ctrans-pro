/**
 * 企业间业务授权模型（药厂 ↔ 服务商）＋ 租户与成员身份聚合视图。
 *
 * 权限分层（重构方案 §三.4）：
 *   ① ProviderPharmaRelationship —— 药厂与服务商的合作关系（药厂控制：生效/暂停/终止）；
 *   ② BusinessAuthorization —— 药厂授予服务商的品种/项目/区域业务资格（药厂控制，可撤销）；
 *   ③ UserRoleAssignment.pharmaTenantIds / varietyNames —— 服务商管理员授予员工
 *      可处理哪些合作药厂与品种（只能收窄，不能扩大药厂给服务商的资格；
 *      唯一入口「角色与数据范围」页的「已授权成员」页签）；
 *   ④ FilingRecord —— 服务专员备案（业务资格：不阻断进入药厂，只拦学术拜访）。
 *
 * 员工可进入药厂（登录门页唯一派生口径）：
 *   员工被授予该药厂 ∧ 合作关系生效 ∧ 该药厂对服务商的业务授权有效
 *
 * 生产口径（原型注释）：真实系统由服务端逐请求过滤；localStorage 仅承载演示期数据。
 */

import type { BlockedKind, ServingPharma, TenantPrincipal, WarningKind } from "../auth/authTypes"
import { PLATFORM_WORKSPACE_NAME } from "../auth/authTypes"
import type { PermAuditEvent, PlatformRoleBinding, RoleAssignment, TenantKind, TenantMembership } from "./permissions"
import { PLATFORM_BINDINGS, PRESET_ROLES, TENANT_MEMBERSHIPS, enterpriseRootOf, nextId, nowStamp, seedCustomRoles } from "./permissions"
import { allOrgs, allUsers, allAssignments, tenantLoginAllowed } from "./tenantRegistry"

// ─── 系统角色绑定（运行期内存态；登录网关与软件服务方账号页共享同一事实源） ─────────

let platformBindings: PlatformRoleBinding[] = PLATFORM_BINDINGS.map((b) => ({ ...b }))
const bindingListeners = new Set<() => void>()

/** 登录链路与软件服务方账号页统一读取 */
export function getPlatformBindings(): PlatformRoleBinding[] {
  return platformBindings
}

export function subscribePlatformBindings(cb: () => void): () => void {
  bindingListeners.add(cb)
  return () => bindingListeners.delete(cb)
}

export function grantPlatformBinding(input: {
  userId: string
  platformRoleId: string
  dutyScope: string
  actor: string
  reason: string
}): { ok: boolean; error?: string; binding?: PlatformRoleBinding } {
  if (!input.dutyScope.trim()) return { ok: false, error: "请填写职责范围" }
  if (!input.reason.trim()) return { ok: false, error: "请填写授予原因" }
  const today = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  const now = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())} ${p(today.getHours())}:${p(today.getMinutes())}`
  const binding: PlatformRoleBinding = {
    id: `pb-${Date.now().toString(36)}`,
    userId: input.userId,
    platformRoleId: input.platformRoleId,
    dutyScope: input.dutyScope.trim(),
    effectiveFrom: now.slice(0, 10),
    grantedBy: input.actor,
    grantedAt: now,
    status: "active",
    reason: input.reason.trim(),
  }
  platformBindings = [binding, ...platformBindings]
  bindingListeners.forEach((cb) => cb())
  pushBindingAudit({
    actor: input.actor,
    action: "授予系统角色绑定",
    target: `${allUsers().find((u) => u.id === input.userId)?.name ?? input.userId} × ${input.platformRoleId}`,
    resource: "platform-bindings.grant",
    reason: input.reason.trim(),
    afterSummary: `职责范围：${input.dutyScope.trim()} · 生效 ${binding.effectiveFrom}`,
  })
  return { ok: true, binding }
}

export function revokePlatformBinding(bindingId: string, actor: string, reason: string): { ok: boolean; error?: string } {
  const cur = platformBindings.find((b) => b.id === bindingId)
  if (!cur) return { ok: false, error: "绑定不存在" }
  if (cur.status !== "active") return { ok: false, error: "该绑定已回收" }
  if (!reason.trim()) return { ok: false, error: "请填写回收原因" }
  const today = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  const now = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())} ${p(today.getHours())}:${p(today.getMinutes())}`
  platformBindings = platformBindings.map((b) =>
    b.id === bindingId ? { ...b, status: "revoked" as const, revokedBy: actor, revokedAt: now, reason: reason.trim() } : b,
  )
  bindingListeners.forEach((cb) => cb())
  pushBindingAudit({
    actor,
    action: "回收系统角色绑定",
    target: `${allUsers().find((u) => u.id === cur.userId)?.name ?? cur.userId} × ${cur.platformRoleId}`,
    resource: "platform-bindings.revoke",
    reason: reason.trim(),
    beforeSummary: `职责范围：${cur.dutyScope} · ${cur.grantedAt} 授予`,
    afterSummary: "已回收 · 历史保留可查",
  })
  return { ok: true }
}

// ─── 系统角色绑定审计缓冲（2026-09-18 审计盲区补全） ─────────────────────────
// 绑定的授予/回收发生在纯数据层（无 React 上下文），与登录审计同构：写入模块级
// 缓冲，PermissionProvider 挂载时一次性并入审计页（跨会话可查）。

const pendingBindingAudits: PermAuditEvent[] = []

function pushBindingAudit(input: {
  actor: string
  action: string
  target: string
  resource: string
  reason: string
  beforeSummary?: string
  afterSummary?: string
}): void {
  pendingBindingAudits.unshift({
    id: nextId("PE"),
    time: nowStamp(),
    actor: input.actor,
    actorRole: "贝医系统管理员",
    org: PLATFORM_WORKSPACE_NAME,
    target: input.target,
    module: "系统角色绑定",
    action: input.action,
    resource: input.resource,
    decision: "允许",
    reason: input.reason,
    ...(input.beforeSummary ? { beforeSummary: input.beforeSummary } : {}),
    ...(input.afterSummary ? { afterSummary: input.afterSummary } : {}),
    requestId: nextId("req"),
    ip: "10.4.21.8",
    result: "成功",
  })
}

/** PermissionProvider 挂载时一次性取出绑定审计（与 drainLoginAuditEvents 同构） */
export function drainBindingAuditEvents(): PermAuditEvent[] {
  const drained = [...pendingBindingAudits]
  pendingBindingAudits.length = 0
  return drained
}

// ─── 租户与成员身份聚合（种子 + 软件服务方侧运行时建租户） ─────────────────────

export interface Tenant {
  id: string
  name: string
  kind: TenantKind
}

/** 全部企业租户（软件服务方不是租户；含运行时注册的租户企业根） */
export function allTenants(): Tenant[] {
  return allOrgs()
    .filter((o) => o.type === "pharma" || o.type === "provider")
    .map((o) => ({ id: o.id, name: o.name, kind: o.type === "pharma" ? "pharma" : "provider" }))
}

export function tenantById(id: string): Tenant | undefined {
  return allTenants().find((t) => t.id === id)
}

export function tenantNameOf(id: string): string {
  return tenantById(id)?.name ?? id
}

/**
 * 用户的成员身份：种子 TENANT_MEMBERSHIPS + 运行时租户成员派生
 * （租户注册表里的用户按其组织归属根节点派生一条成员身份）。
 */
/**
 * 租户成员关系运行时 store：种子 TENANT_MEMBERSHIPS + 软件服务方侧运行时租户成员派生。
 * 这是「用户属于哪个租户、挂在哪个部门」的唯一权威——授权、调岗、列表展示
 * 一律从这里读，不得再用 User.orgId / enterpriseRootOf(User.orgId) 反推。
 */
let tenantMembershipState: TenantMembership[] = TENANT_MEMBERSHIPS.map((m) => ({ ...m }))
const membershipListeners = new Set<() => void>()

function notifyMembershipChange(): void {
  membershipListeners.forEach((cb) => cb())
}

/** 全量成员身份（含运行时租户按用户组织归属根派生的成员关系） */
export function getTenantMemberships(): TenantMembership[] {
  const out = [...tenantMembershipState]
  for (const user of allUsers()) {
    const root = enterpriseRootOf(allOrgs(), user.orgId)
    if (!root || (root.type !== "pharma" && root.type !== "provider")) continue
    if (out.some((m) => m.userId === user.id && m.tenantId === root.id)) continue
    out.push({
      id: `mb-rt-${user.id}-${root.id}`,
      userId: user.id,
      tenantId: root.id,
      tenantName: root.name,
      orgUnitId: user.orgId,
      status: "active",
      joinedAt: user.createdAt?.slice(0, 10) ?? "2026-09-15",
    })
  }
  return out
}

export function subscribeTenantMemberships(cb: () => void): () => void {
  membershipListeners.add(cb)
  return () => membershipListeners.delete(cb)
}

export function membershipsOfUser(userId: string): TenantMembership[] {
  return getTenantMemberships().filter((m) => m.userId === userId)
}

/** 用户在某租户的成员身份（无则 undefined；双企业成员各有一条） */
export function membershipOfUserInTenant(userId: string, tenantId: string): TenantMembership | undefined {
  return getTenantMemberships().find((m) => m.userId === userId && m.tenantId === tenantId)
}

/** 某租户的全部成员身份（授权页/用户管理/组织架构的名单来源） */
export function membershipsOfTenant(tenantId: string): TenantMembership[] {
  return getTenantMemberships().filter((m) => m.tenantId === tenantId)
}

/**
 * 成员身份是否参与权限计算：冻结成员不得进入租户与选择合作药厂；
 * 待激活由登录激活流程单独拦截（激活后参与计算）；
 * 已移除成员（2026-09-18）身份终止，不再出现在名单与授权入口。
 */
export function membershipActive(m: TenantMembership | undefined): boolean {
  return Boolean(m && m.status !== "frozen" && m.status !== "removed")
}

/**
 * 移除成员（2026-09-18 成员生命周期补全）：终止该用户在【本企业】的成员身份。
 * 口径：只动 membership，不动 PermUser——自然人账号、其他企业身份、历史授权
 * 记录全部保留；登录链路经 memberStatusOf 感知 removed 拒绝进入本企业。
 * 运行时派生成员（如建租首位管理员）没有显式记录：补写一条显式 removed 记录，
 * 防止 getTenantMemberships 的派生逻辑把移除状态重新生成为 active。
 */
export function removeMembership(input: {
  userId: string
  tenantId: string
  actor: string
  /** 原因分类：离职 / 误建 / 其他 */
  kind: string
  note?: string
}): { ok: boolean; error?: string } {
  const idx = tenantMembershipState.findIndex((m) => m.userId === input.userId && m.tenantId === input.tenantId)
  if (idx >= 0) {
    if (tenantMembershipState[idx].status === "removed") return { ok: false, error: "该成员已处于移除状态" }
    tenantMembershipState = tenantMembershipState.map((m, i) =>
      i === idx
        ? {
            ...m,
            status: "removed" as const,
            removedAt: nowStamp(),
            removedBy: input.actor,
            removedKind: input.kind,
            ...(input.note?.trim() ? { removedNote: input.note.trim() } : {}),
          }
        : m,
    )
  } else {
    const root = allOrgs().find((o) => o.id === input.tenantId)
    tenantMembershipState = [
      {
        id: `mb-rt-${input.userId}-${input.tenantId}`,
        userId: input.userId,
        tenantId: input.tenantId,
        tenantName: root?.name ?? input.tenantId,
        orgUnitId: allUsers().find((u) => u.id === input.userId)?.orgId ?? input.tenantId,
        status: "removed",
        joinedAt: todayIso(),
        removedAt: nowStamp(),
        removedBy: input.actor,
        removedKind: input.kind,
        ...(input.note?.trim() ? { removedNote: input.note.trim() } : {}),
      },
      ...tenantMembershipState,
    ]
  }
  notifyMembershipChange()
  return { ok: true }
}

/**
 * 重新加入（移除后恢复）：仅 removed 成员可恢复；恢复为 active 并更新部门，
 * 移除留痕字段保留（removedAt/By/Kind 供追溯），rejoinedAt 记录恢复时间。
 */
export function rejoinMembership(input: {
  userId: string
  tenantId: string
  orgUnitId: string
}): { ok: boolean; error?: string; membership?: TenantMembership } {
  const idx = tenantMembershipState.findIndex((m) => m.userId === input.userId && m.tenantId === input.tenantId)
  if (idx < 0) return { ok: false, error: "该用户在本企业没有可恢复的成员记录，请直接新建用户" }
  if (tenantMembershipState[idx].status !== "removed") return { ok: false, error: "仅已移除的成员可重新加入" }
  const next: TenantMembership = {
    ...tenantMembershipState[idx],
    orgUnitId: input.orgUnitId,
    status: "active",
    rejoinedAt: nowStamp(),
  }
  tenantMembershipState = tenantMembershipState.map((m, i) => (i === idx ? next : m))
  notifyMembershipChange()
  return { ok: true, membership: next }
}

/** 新建成员（用户建档时写入当前租户的成员身份）或调整成员部门（调岗） */
export function upsertMembership(input: { userId: string; tenantId: string; orgUnitId: string; tenantName?: string }): TenantMembership {
  const idx = tenantMembershipState.findIndex((m) => m.userId === input.userId && m.tenantId === input.tenantId)
  if (idx >= 0) {
    const next = { ...tenantMembershipState[idx], orgUnitId: input.orgUnitId }
    tenantMembershipState = tenantMembershipState.map((m, i) => (i === idx ? next : m))
    notifyMembershipChange()
    return next
  }
  const org = allOrgs().find((o) => o.id === input.orgUnitId)
  const created: TenantMembership = {
    id: `mb-rt-${input.userId}-${input.tenantId}`,
    userId: input.userId,
    tenantId: input.tenantId,
    tenantName: input.tenantName ?? org?.name ?? input.tenantId,
    orgUnitId: input.orgUnitId,
    status: "active",
    joinedAt: todayIso(),
  }
  tenantMembershipState = [created, ...tenantMembershipState]
  notifyMembershipChange()
  return created
}

// ─── 合作关系（药厂控制） ─────────────────────────────────────────────────────

export type RelationshipStatus = "active" | "paused" | "terminated"

/** 外部准入导入的可追溯信息（source=manual 时由导入流程写入；存量数据缺省 = 未记录） */
export interface RelationshipImportMeta {
  importBatchId?: string
  /** 导入时间（合作生效日 = 导入当天，不代表外部实际审核通过日期） */
  importedAt?: string
  importedBy?: string
  /** 导入声明原文（审核责任由本厂承担） */
  declaration?: string
}

export interface ProviderPharmaRelationship {
  id: string
  pharmaTenantId: string
  providerTenantId: string
  /** 合作生效起点（准入联动=准入通过日；线下导入=导入当天） */
  effectiveFrom: string
  status: RelationshipStatus
  /** 关系来源：access=服务商准入审核通过联动（缺省值，存量兼容）；manual=药厂外部已准入批量导入 */
  source?: "access" | "manual"
  importMeta?: RelationshipImportMeta
  pausedAt?: string
  terminatedAt?: string
  /** 只填适合对外展示的文案（生产为原因码→标准文案映射） */
  pausedReason?: string
  terminatedReason?: string
  lastUsedAt?: string
}

/** 关系来源展示标签（2026-10-20 服务商管理整合：manual=外部准入 / access=平台准入） */
export function relationshipSourceLabel(source?: "access" | "manual"): string {
  return source === "manual" ? "外部准入" : "平台准入"
}

/** 业务授权（药厂 → 服务商：品种/项目/区域资格） */
export type BusinessAuthKind = "variety" | "project" | "region"
export type BusinessAuthStatus = "active" | "revoked" | "expired"

export interface BusinessAuthorization {
  id: string
  relationshipId: string
  kind: BusinessAuthKind
  items: string[]
  /**
   * 品种授权的行级区域（kind=variety 时可选）：与旧 VarietyProviderAuth 的
   * provider×品种×区域三元组对齐；缺省 = 该关系全部区域授权（kind=region）。
   */
  lineRegions?: string[]
  status: BusinessAuthStatus
  /** 生效期（独立字段）：起始日期；缺省 = 授予当日 */
  effectiveFrom?: string
  /** 生效期（独立字段）：失效日期；到期后授权自动转为「已失效」 */
  effectiveTo?: string
  grantedBy: string
  grantedAt: string
  revokedAt?: string
  revokedBy?: string
  reason?: string
}

/** 授权的运行时生效状态：撤销优先，其次按生效期判定到期 */
export function businessAuthRuntimeStatus(auth: BusinessAuthorization): BusinessAuthStatus {
  if (auth.status === "revoked") return "revoked"
  if (auth.effectiveTo && auth.effectiveTo < todayIso()) return "expired"
  return "active"
}

/** 人员备案记录（业务资格；不阻断登录与进入药厂，仅拦学术拜访等业务动作） */
export interface FilingRecord {
  id: string
  userId: string
  pharmaTenantId: string
  status: "approved" | "pending" | "rejected" | "expired" | "suspended"
  validUntil?: string
  note?: string
}

export interface CooperationCooperationAudit {
  reasonCode: string
  target: string
  detail?: string
}

interface CooperationState {
  /** v2：2026-10-16 东方恒业品种授权扩到 20 个（任务创建多选规模演示），旧存储自动重播种子 */
  version: 2
  relationships: ProviderPharmaRelationship[]
  authorizations: BusinessAuthorization[]
  filings: FilingRecord[]
}

const STORAGE_KEY = "baiyee-cooperation-v1"

function buildSeedState(): CooperationState {
  return {
    version: 2,
    relationships: [
      // 东方恒业（org-provider-east）与四家药厂
      { id: "rel-baiyi-east", pharmaTenantId: "org-pharma", providerTenantId: "org-provider-east", effectiveFrom: "2026-05-01", status: "active", lastUsedAt: "2026-09-10 18:32" },
      { id: "rel-huakang-east", pharmaTenantId: "org-pharma-huakang", providerTenantId: "org-provider-east", effectiveFrom: "2026-06-10", status: "active", lastUsedAt: "2026-09-08 17:20" },
      // 康宁：合作暂停演示（药厂侧暂停 → 全员即时不可进入，员工授权无法绕过）
      { id: "rel-kangning-east", pharmaTenantId: "org-pharma-kangning", providerTenantId: "org-provider-east", effectiveFrom: "2026-07-01", status: "paused", pausedAt: "2026-08-31", pausedReason: "合作已暂停，待续签后恢复" },
      // 泽康：业务授权已撤销演示（合作生效，但品种资格被药厂收回）
      { id: "rel-zekang-east", pharmaTenantId: "org-pharma-zekang", providerTenantId: "org-provider-east", effectiveFrom: "2026-07-20", status: "active" },
      // 智联科技与百益：外部准入演示行（2026-10-20 服务商管理整合——种子按外部已准入
      // 导入口径演示「合作中 / 外部准入」；仅无存量存储的新浏览器生效，不清空已有演示数据）
      {
        id: "rel-baiyi-smart",
        pharmaTenantId: "org-pharma",
        providerTenantId: "org-provider-smart",
        effectiveFrom: "2026-05-15",
        status: "active",
        source: "manual",
        importMeta: {
          importBatchId: "imp-seed-2026-05-15",
          importedAt: "2026-05-15 10:20",
          importedBy: "李航",
          declaration: "本批次服务商均已由本厂完成准入审核，相关材料在本厂自有系统或线下渠道留存备查，审核责任由本厂承担。",
        },
      },
      // 康晟云服 / 永泰汇通与百益（统一业务授权后承载既有任务链口径）
      { id: "rel-baiyi-kangsheng", pharmaTenantId: "org-pharma", providerTenantId: "org-provider-kangsheng", effectiveFrom: "2026-03-01", status: "active", lastUsedAt: "2026-09-02 15:10" },
      { id: "rel-baiyi-yongtai", pharmaTenantId: "org-pharma", providerTenantId: "org-provider-yongtai", effectiveFrom: "2026-02-01", status: "active", lastUsedAt: "2026-08-28 10:00" },
      // 泰合医学与百益（2026-09-21 准入演示）：合作生效但无任何业务授权——
      // 演示「准入通过后待品种授权」衔接提示（门页/任务过滤按 品种授权 拦截）
      { id: "rel-baiyi-taihe", pharmaTenantId: "org-pharma", providerTenantId: "org-rt-taihe", effectiveFrom: "2026-08-05", status: "active" },
    ],
    authorizations: [
      // 百益 × 东方恒业：品种行级区域对齐任务链口径（阿托伐他汀·陕西 / 氨氯地平·广东 / 奥美拉唑·广东）
      { id: "ba-01", relationshipId: "rel-baiyi-east", kind: "variety", items: ["阿托伐他汀钙片"], lineRegions: ["陕西省"], status: "active", grantedBy: "李航", grantedAt: "2026-05-06 10:00" },
      { id: "ba-01b", relationshipId: "rel-baiyi-east", kind: "variety", items: ["氨氯地平片"], lineRegions: ["广东省"], status: "active", grantedBy: "李航", grantedAt: "2026-05-06 10:01" },
      { id: "ba-01c", relationshipId: "rel-baiyi-east", kind: "variety", items: ["奥美拉唑肠溶胶囊"], lineRegions: ["广东省"], status: "active", grantedBy: "李航", grantedAt: "2026-05-06 10:01" },
      // 2026-10-16 扩容：东方恒业品种授权到 20 个，演示任务创建「多品种可搜索多选」规模
      // （品种见 mockData V-007~V-020；雷贝拉唑挂专科价目表=跨表演示，氟伐他汀/瑞舒伐他汀/辛伐他汀无有效价目表=禁选演示）。
      // demoBizPairs（拜访/绩效演示矩阵）未跟扩：新品种无历史拜访/绩效数据属预期。
      { id: "ba-01d", relationshipId: "rel-baiyi-east", kind: "variety", items: ["二甲双胍缓释片", "缬沙坦胶囊", "硝苯地平控释片", "美托洛尔缓释片", "氯沙坦钾片", "非洛地平缓释片", "格列美脲片", "瑞格列奈片", "西格列汀片", "达格列净片", "铝碳酸镁咀嚼片", "莫沙必利片", "恩替卡韦分散片"], lineRegions: ["陕西省"], status: "active", grantedBy: "李航", grantedAt: "2026-05-06 10:05" },
      { id: "ba-01e", relationshipId: "rel-baiyi-east", kind: "variety", items: ["雷贝拉唑钠肠溶片"], lineRegions: ["陕西省"], status: "active", grantedBy: "李航", grantedAt: "2026-05-06 10:06" },
      { id: "ba-01f", relationshipId: "rel-baiyi-east", kind: "variety", items: ["瑞舒伐他汀钙片", "辛伐他汀片", "氟伐他汀钠胶囊"], lineRegions: ["陕西省"], status: "active", grantedBy: "李航", grantedAt: "2026-05-06 10:07" },
      { id: "ba-02", relationshipId: "rel-baiyi-east", kind: "region", items: ["陕西省"], status: "active", grantedBy: "李航", grantedAt: "2026-05-06 10:02" },
      { id: "ba-03", relationshipId: "rel-baiyi-east", kind: "project", items: ["百益陕西推广项目"], status: "active", grantedBy: "李航", grantedAt: "2026-05-06 10:04" },
      { id: "ba-04", relationshipId: "rel-huakang-east", kind: "variety", items: ["奥美拉唑肠溶胶囊"], lineRegions: ["陕西省", "甘肃省"], status: "active", grantedBy: "华康-王岚", grantedAt: "2026-06-15 09:30" },
      { id: "ba-05", relationshipId: "rel-huakang-east", kind: "region", items: ["陕西省", "甘肃省"], status: "active", grantedBy: "华康-王岚", grantedAt: "2026-06-15 09:32" },
      { id: "ba-06", relationshipId: "rel-kangning-east", kind: "variety", items: ["氨氯地平片"], status: "active", grantedBy: "康宁-高翔", grantedAt: "2026-07-05 14:00" },
      // 泽康：品种授权已被药厂撤销 → 员工即使被授予该药厂也不可进入
      { id: "ba-07", relationshipId: "rel-zekang-east", kind: "variety", items: ["酒石酸美托洛尔片"], status: "revoked", grantedBy: "泽康-秦峰", grantedAt: "2026-07-25 10:10", revokedAt: "2026-09-10 16:40", revokedBy: "泽康-秦峰", reason: "合作范围调整，品种推广资格收回" },
      // 百益 × 智联（对齐旧 AUTH-001/009/010：阿托伐他汀 4 区域 / 二甲双胍 陕苏 / 辛伐他汀 陕）
      { id: "ba-08", relationshipId: "rel-baiyi-smart", kind: "variety", items: ["阿托伐他汀钙片"], lineRegions: ["陕西省", "江苏省", "浙江省", "广东省"], status: "active", grantedBy: "李航", grantedAt: "2026-05-20 11:00" },
      { id: "ba-08b", relationshipId: "rel-baiyi-smart", kind: "variety", items: ["二甲双胍缓释片"], lineRegions: ["陕西省", "江苏省"], status: "active", grantedBy: "李航", grantedAt: "2026-05-20 11:01" },
      { id: "ba-08c", relationshipId: "rel-baiyi-smart", kind: "variety", items: ["辛伐他汀片"], lineRegions: ["陕西省"], status: "active", grantedBy: "李航", grantedAt: "2026-05-20 11:01" },
      { id: "ba-09", relationshipId: "rel-baiyi-smart", kind: "region", items: ["江苏省"], status: "active", grantedBy: "李航", grantedAt: "2026-05-20 11:02" },
      // 百益 × 康晟云服（对齐旧 AUTH-002/005/006）
      { id: "ba-10", relationshipId: "rel-baiyi-kangsheng", kind: "variety", items: ["二甲双胍缓释片"], lineRegions: ["山东省"], status: "active", grantedBy: "李航", grantedAt: "2026-03-01 09:00" },
      { id: "ba-10b", relationshipId: "rel-baiyi-kangsheng", kind: "variety", items: ["奥美拉唑肠溶胶囊"], lineRegions: ["浙江省"], status: "active", grantedBy: "李航", grantedAt: "2026-03-01 09:01" },
      { id: "ba-10c", relationshipId: "rel-baiyi-kangsheng", kind: "variety", items: ["氨氯地平片"], lineRegions: ["北京"], status: "active", grantedBy: "李航", grantedAt: "2026-03-01 09:02" },
      // 百益 × 永泰汇通（对齐旧 AUTH-003/008）
      { id: "ba-11", relationshipId: "rel-baiyi-yongtai", kind: "variety", items: ["二甲双胍缓释片"], lineRegions: ["北京"], status: "active", grantedBy: "李航", grantedAt: "2026-02-01 09:00" },
      { id: "ba-11b", relationshipId: "rel-baiyi-yongtai", kind: "variety", items: ["瑞舒伐他汀钙片"], lineRegions: ["全国"], status: "active", grantedBy: "李航", grantedAt: "2026-02-01 09:01" },
    ],
    filings: [
      // 杨明 × 华康：备案待审核 → 门页警告卡（可进入、不可学术拜访）
      { id: "fr-01", userId: "u-yangming", pharmaTenantId: "org-pharma-huakang", status: "pending", note: "备案材料审核中" },
      { id: "fr-02", userId: "u-yangming", pharmaTenantId: "org-pharma", status: "approved", validUntil: "2027-06-01" },
      { id: "fr-03", userId: "u-huangfeng", pharmaTenantId: "org-pharma", status: "approved", validUntil: "2027-03-01" },
      { id: "fr-04", userId: "u-lichen", pharmaTenantId: "org-pharma", status: "approved", validUntil: "2026-12-31" },
    ],
  }
}

let state: CooperationState = loadState()
const listeners = new Set<() => void>()

/**
 * 数据修订号：每次 commit/重置/跨 tab 同步自增。业务页的会话范围 memo 以它为依赖，
 * 使「暂停合作 / 撤销授权」对已登录会话即时生效（默认拒绝，而非下次登录才拦截）。
 */
let revision = 0

/** 当前修订号（供 useSyncExternalStore 读取；仅因数据变化而变化） */
export function cooperationRevision(): number {
  return revision
}

function loadState(): CooperationState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildSeedState()
    const parsed = JSON.parse(raw) as CooperationState
    if (parsed?.version !== 2 || !Array.isArray(parsed.relationships)) return buildSeedState()
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

function commit(next: Partial<CooperationState>): void {
  state = { ...state, ...next }
  revision += 1
  persist()
  listeners.forEach((cb) => cb())
}

/** 恢复演示数据（合作关系/业务授权页「恢复演示数据（仅演示）」入口） */
export function resetCooperationModel(): void {
  state = buildSeedState()
  revision += 1
  persist()
  listeners.forEach((cb) => cb())
}

export function subscribeCooperation(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getCooperationSnapshot(): CooperationState {
  return state
}

// 跨标签页同步：另一 tab 的合作暂停/授权撤销写入 localStorage 后，本 tab 重载内存态
// 并通知订阅者（纯前端演示口径；无后端推送）。
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return
    state = loadState()
    revision += 1
    listeners.forEach((cb) => cb())
  })
}

// ─── 只读视图 ────────────────────────────────────────────────────────────────

export function relationshipsOfProvider(providerTenantId: string): ProviderPharmaRelationship[] {
  return state.relationships.filter((r) => r.providerTenantId === providerTenantId)
}

export function relationshipsOfPharma(pharmaTenantId: string): ProviderPharmaRelationship[] {
  return state.relationships.filter((r) => r.pharmaTenantId === pharmaTenantId)
}

export function relationshipBetween(pharmaTenantId: string, providerTenantId: string): ProviderPharmaRelationship | undefined {
  // 取该方向「最新」一条：终止后重建的历史记录在前（append 顺序），旧 terminated 不应遮蔽新关系
  const of = state.relationships.filter((r) => r.pharmaTenantId === pharmaTenantId && r.providerTenantId === providerTenantId)
  return of[of.length - 1]
}

export function authorizationsOfRelationship(relationshipId: string): BusinessAuthorization[] {
  return state.authorizations.filter((a) => a.relationshipId === relationshipId)
}

/** 关系上某类业务资格是否存在有效授权（kind=variety 为进入药厂业务的前置） */
export function hasActiveAuthorization(relationshipId: string, kind: BusinessAuthKind): BusinessAuthorization | undefined {
  return state.authorizations.find((a) => a.relationshipId === relationshipId && a.kind === kind && a.status === "active")
}

export function activeAuthSummaryOfRelationship(relationshipId: string): { varieties: string[]; projects: string[]; regions: string[] } {
  const out = { varieties: [] as string[], projects: [] as string[], regions: [] as string[] }
  for (const a of authorizationsOfRelationship(relationshipId)) {
    if (businessAuthRuntimeStatus(a) !== "active") continue
    if (a.kind === "variety") out.varieties.push(...a.items)
    if (a.kind === "project") out.projects.push(...a.items)
    if (a.kind === "region") out.regions.push(...a.items)
  }
  return out
}

export function relationshipStatusLabel(status: RelationshipStatus): string {
  return { active: "合作生效", paused: "合作暂停", terminated: "合作终止" }[status]
}

/**
 * 药厂 × 服务商方向的品种授权衔接判定（准入通过后的闭环检查）：
 * granted = 合作生效且已有有效品种授权（服务商可承接业务）
 * missing = 合作生效但无品种授权（服务商无法进入药厂业务，需在「业务授权」配置）
 */
export function varietyAuthStateOf(pharmaTenantId: string, providerTenantId: string): "granted" | "missing" {
  const rel = relationshipBetween(pharmaTenantId, providerTenantId)
  if (!rel || rel.status !== "active") return "missing"
  return hasActiveAuthorization(rel.id, "variety") ? "granted" : "missing"
}

export function businessAuthKindLabel(kind: BusinessAuthKind): string {
  return { variety: "品种", project: "项目", region: "区域" }[kind]
}

export function businessAuthStatusLabel(status: BusinessAuthStatus): string {
  return { active: "生效", revoked: "已撤销", expired: "已失效" }[status]
}

// ─── 派生：员工可进入的药厂（登录门页与工作台唯一数据源） ─────────────────────

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 员工在【指定服务商租户】内被授予的可处理药厂（P0 口径）。
 * 同一自然人可属于多家服务商：范围只按当前 providerTenantId 计算，绝不跨服务商合并。
 * 进入计算的四重校验（任一不满足即不产生药厂）：
 *   ① TenantMembership 有效（成员身份存在且未冻结）；
 *   ② RoleAssignment 生效（status=active）；
 *   ③ 日期窗口：effectiveFrom <= 今天，effectiveTo 为空或 >= 今天（future 授权不提前生效）；
 *   ④ 授权属于该 providerTenantId（稳定租户边界）。
 * 合作关系与业务授权的有效性在 visiblePharmasForUser 中逐药厂判定。
 */
export function grantedPharmasForUser(
  userId: string,
  providerTenantId: string,
): { pharmaTenantIds: string[]; workGroupNames: string[] } | null {
  const user = allUsers().find((u) => u.id === userId)
  if (!user || user.accountStatus !== "enabled") return null
  const membership = membershipOfUserInTenant(userId, providerTenantId)
  if (!membership || !membershipActive(membership)) return null
  const today = todayIso()
  const pharmaIds = new Set<string>()
  const groups: string[] = []
  let isProviderAdminScope = false
  for (const a of allAssignments()) {
    if (a.userId !== userId) continue
    if (a.tenantId !== providerTenantId) continue
    if (a.status !== "active") continue
    if (a.effectiveFrom > today) continue
    if (a.effectiveTo && a.effectiveTo < today) continue
    if (!groups.includes(a.scopeOrgName)) groups.push(a.scopeOrgName)
    if (a.pharmaTenantIds) {
      for (const id of a.pharmaTenantIds) pharmaIds.add(id)
    } else {
      // 服务商管理员（PROVIDER 档）：名下药厂 = 本服务商全部有效授权药厂
      const role = [...PRESET_ROLES, ...seedCustomRoles].find((r) => r.id === a.roleId)
      if (role?.defaultScope === "PROVIDER") isProviderAdminScope = true
    }
  }
  if (isProviderAdminScope) {
    for (const id of grantablePharmasForProvider(providerTenantId)) pharmaIds.add(id)
  }
  return { pharmaTenantIds: [...pharmaIds], workGroupNames: groups }
}

function filingWarning(userId: string, pharmaTenantId: string): WarningKind | undefined {
  const rec = state.filings.find((f) => f.userId === userId && f.pharmaTenantId === pharmaTenantId)
  if (!rec || rec.status === "approved") return undefined
  if (rec.status === "pending") return "filing_pending"
  if (rec.status === "rejected") return "filing_rejected"
  if (rec.status === "expired") return "filing_expired"
  return "filing_suspended"
}

/**
 * 员工可访问药厂列表（门页卡片；不可进入的记录保留展示原因）：
 *   员工被授予 ∧ 合作生效 ∧ 业务授权有效 → 可进入
 *   合作暂停/终止、业务授权撤销 → 禁用卡（blockedKind）
 *   备案缺失/待审核 → 警告卡（warningKind，可进入但拦学术拜访）
 */
export function visiblePharmasForUser(userId: string, providerTenantId: string): ServingPharma[] {
  const user = allUsers().find((u) => u.id === userId)
  if (!user || user.accountStatus !== "enabled") return []
  // 成员身份停用/冻结：不可进入任何药厂（登录链路已拦截，此处兜底）
  const membership = membershipOfUserInTenant(userId, providerTenantId)
  if (!membership || !membershipActive(membership)) return []
  const granted = grantedPharmasForUser(userId, providerTenantId)
  if (!granted) return []
  if (!tenantLoginAllowed(providerTenantId)) return []
  const out: ServingPharma[] = []
  for (const pharmaTenantId of granted.pharmaTenantIds) {
    const rel = relationshipBetween(pharmaTenantId, providerTenantId)
    const name = tenantNameOf(pharmaTenantId)
    const auths = rel ? activeAuthSummaryOfRelationship(rel.id) : null
    const regions = auths && auths.regions.length > 0 ? auths.regions.join("、") : undefined
    const varieties = auths ? auths.varieties : []
    const workGroup = granted.workGroupNames[0]
    const base: ServingPharma = {
      id: pharmaTenantId,
      name,
      status: rel ? (rel.status === "active" ? "active" : "paused") : "paused",
      ...(workGroup ? { workGroup } : {}),
      ...(regions ? { regions } : {}),
      ...(rel?.lastUsedAt ? { lastUsedAt: rel.lastUsedAt } : {}),
      ...(rel?.pausedAt ? { pausedAt: rel.pausedAt } : {}),
      ...(rel?.pausedReason ? { pausedReason: rel.pausedReason } : {}),
    }
    if (!rel || rel.status === "terminated") {
      out.push({ ...base, blockedKind: "cooperation_terminated", pausedReason: rel?.terminatedReason ?? "本服务商与该药厂不存在生效合作关系" })
      continue
    }
    if (rel.status === "paused") {
      out.push({ ...base, blockedKind: "cooperation_paused" })
      continue
    }
    if (varieties.length === 0) {
      const revokedAuth = authorizationsOfRelationship(rel.id).find((a) => a.kind === "variety" && a.status === "revoked")
      out.push({
        ...base,
        blockedKind: "no_valid_variety",
        pausedReason: revokedAuth
          ? `业务授权已撤销：${revokedAuth.reason ?? "药厂收回本服务商的该品种推广资格"}`
          : "药厂尚未对本服务商授予有效品种资格",
      })
      continue
    }
    const warning = filingWarning(userId, pharmaTenantId)
    out.push({ ...base, ...(warning ? { warningKind: warning } : {}) })
  }
  return out
}

/** 软件服务方合作关系监管用：全部关系 + 授权状态展开 */
export function allRelationshipRows(): Array<{
  relationship: ProviderPharmaRelationship
  pharmaName: string
  providerName: string
  varietyItems: string[]
  varietyAuthStatus: BusinessAuthStatus | "none"
}> {
  return state.relationships.map((r) => {
    const varietyAuth = authorizationsOfRelationship(r.id).find((a) => a.kind === "variety")
    return {
      relationship: r,
      pharmaName: tenantNameOf(r.pharmaTenantId),
      providerName: tenantNameOf(r.providerTenantId),
      varietyItems: varietyAuth && varietyAuth.status === "active" ? varietyAuth.items : [],
      varietyAuthStatus: varietyAuth ? varietyAuth.status : "none",
    }
  })
}

// ─── 药厂侧操作（合作关系暂停/恢复/终止；业务授权撤销/重授） ───────────────────

function nowStampLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export interface CoopOpResult {
  ok: boolean
  error?: string
  audits: CooperationCooperationAudit[]
}

/** 暂停合作（药厂→服务商）：暂停后服务商全员即时不可进入（派生实时判定，员工授权无法绕过） */
export function pauseRelationship(relationshipId: string, reason: string, actor: string): CoopOpResult {
  const rel = state.relationships.find((r) => r.id === relationshipId)
  if (!rel) return { ok: false, error: "合作关系不存在", audits: [] }
  if (rel.status !== "active") return { ok: false, error: "仅生效中的合作可暂停", audits: [] }
  if (!reason.trim()) return { ok: false, error: "请填写暂停原因（对外展示文案）", audits: [] }
  commit({
    relationships: state.relationships.map((r) =>
      r.id === relationshipId ? { ...r, status: "paused", pausedAt: todayIso(), pausedReason: reason.trim() } : r,
    ),
  })
  return {
    ok: true,
    audits: [{ reasonCode: "COOPERATION_PAUSED", target: tenantNameOf(rel.providerTenantId), detail: `原因：${reason.trim()} · 该服务商全员即时不可进入本药厂业务；已进入会话在下一次请求时失效` }],
  }
}

export function resumeRelationship(relationshipId: string, reason: string, actor: string): CoopOpResult {
  const rel = state.relationships.find((r) => r.id === relationshipId)
  if (!rel) return { ok: false, error: "合作关系不存在", audits: [] }
  if (rel.status !== "paused") return { ok: false, error: "仅已暂停合作可恢复", audits: [] }
  if (!reason.trim()) return { ok: false, error: "请填写恢复原因", audits: [] }
  commit({
    relationships: state.relationships.map((r) =>
      r.id === relationshipId ? { ...r, status: "active", pausedAt: undefined, pausedReason: undefined } : r,
    ),
  })
  return {
    ok: true,
    audits: [{ reasonCode: "COOPERATION_RESUMED", target: tenantNameOf(rel.providerTenantId), detail: `原因：${reason.trim()} · 恢复后按成员、员工授权与业务授权当前状态重新计算可进入范围` }],
  }
}

export function terminateRelationship(relationshipId: string, reason: string, actor: string): CoopOpResult {
  const rel = state.relationships.find((r) => r.id === relationshipId)
  if (!rel) return { ok: false, error: "合作关系不存在", audits: [] }
  if (rel.status === "terminated") return { ok: false, error: "合作已终止", audits: [] }
  if (!reason.trim()) return { ok: false, error: "请填写终止原因", audits: [] }
  commit({
    relationships: state.relationships.map((r) =>
      r.id === relationshipId ? { ...r, status: "terminated", terminatedAt: todayIso(), terminatedReason: reason.trim(), pausedAt: undefined, pausedReason: undefined } : r,
    ),
    // 终止：该关系下全部业务授权同步失效
    authorizations: state.authorizations.map((a) =>
      a.relationshipId === relationshipId && a.status === "active"
        ? { ...a, status: "revoked" as BusinessAuthStatus, revokedAt: nowStampLocal(), revokedBy: actor, reason: `合作终止联动：${reason.trim()}` }
        : a,
    ),
  })
  return {
    ok: true,
    audits: [{ reasonCode: "COOPERATION_TERMINATED", target: tenantNameOf(rel.providerTenantId), detail: `原因：${reason.trim()} · 该关系下业务授权全部撤销；员工授权记录保留供审计` }],
  }
}

export function revokeBusinessAuth(authId: string, reason: string, actor: string): CoopOpResult {
  const auth = state.authorizations.find((a) => a.id === authId)
  if (!auth) return { ok: false, error: "授权不存在", audits: [] }
  if (businessAuthRuntimeStatus(auth) !== "active") return { ok: false, error: "仅有效授权可撤销", audits: [] }
  const rel = state.relationships.find((r) => r.id === auth.relationshipId)
  if (rel && rel.status !== "active") {
    return { ok: false, error: "合作关系未生效，不能撤销业务授权；终止合作将自动撤销全部授权", audits: [] }
  }
  if (!reason.trim()) return { ok: false, error: "请填写撤销原因", audits: [] }
  commit({
    authorizations: state.authorizations.map((a) =>
      a.id === authId ? { ...a, status: "revoked", revokedAt: nowStampLocal(), revokedBy: actor, reason: reason.trim() } : a,
    ),
  })
  return {
    ok: true,
    audits: [{ reasonCode: "BUSINESS_AUTH_REVOKED", target: `${businessAuthKindLabel(auth.kind)}：${auth.items.join("、")}`, detail: `原因：${reason.trim()} · 服务商全员对应业务即时不可操作` }],
  }
}

export interface GrantBusinessAuthInput {
  relationshipId: string
  kind: BusinessAuthKind
  items: string[]
  reason: string
  actor: string
  /** 品种授权的行级区域（kind=variety 可选；不选 = 回退关系级区域授权） */
  lineRegions?: string[]
  /** 生效期：起始（缺省=授予当日）与失效（可选；到期自动转「已失效」） */
  effectiveFrom?: string
  effectiveTo?: string
}

/**
 * 准入审核通过 → 创建或激活对应「药厂—服务商」合作关系（2026-09-15 拍板：
 * 只改申请状态不算完成）。规则：
 * - 无合作关系 → 创建生效关系（effectiveFrom=今天，来源=准入审核通过）；
 * - 已暂停 → 激活（恢复），审计注明来源；
 * - 已生效 → 幂等返回（不重复创建）；
 * - 已终止 → 新建一条生效关系（历史终止关系保留供审计）。
 */
export function ensureRelationshipFromAccess(input: {
  pharmaTenantId: string
  providerTenantId: string
  actor: string
}): CoopOpResult & { created?: boolean } {
  const rel = relationshipBetween(input.pharmaTenantId, input.providerTenantId)
  if (!rel) {
    const created: ProviderPharmaRelationship = {
      id: `rel-access-${Date.now().toString(36)}`,
      pharmaTenantId: input.pharmaTenantId,
      providerTenantId: input.providerTenantId,
      effectiveFrom: todayIso(),
      status: "active",
      source: "access",
    }
    commit({ relationships: [...state.relationships, created] })
    return {
      ok: true,
      created: true,
      audits: [{
        reasonCode: "COOPERATION_CREATED_BY_ACCESS",
        target: `${tenantNameOf(input.providerTenantId)} × ${tenantNameOf(input.pharmaTenantId)}`,
        detail: `准入审核通过（操作者：${input.actor}）· 已创建并生效合作关系；药厂可配置品种业务授权`,
      }],
    }
  }
  if (rel.status === "active") {
    return {
      ok: true,
      audits: [{
        reasonCode: "COOPERATION_ALREADY_ACTIVE",
        target: tenantNameOf(rel.providerTenantId),
        detail: "合作关系已生效（幂等，未重复创建）",
      }],
    }
  }
  if (rel.status === "paused") {
    commit({
      relationships: state.relationships.map((r) =>
        r.id === rel.id ? { ...r, status: "active" as RelationshipStatus, pausedAt: undefined, pausedReason: undefined } : r,
      ),
    })
    return {
      ok: true,
      audits: [{
        reasonCode: "COOPERATION_RESUMED_BY_ACCESS",
        target: tenantNameOf(rel.providerTenantId),
        detail: `准入审核通过（操作者：${input.actor}）· 已恢复合作生效；恢复后按成员、员工授权与业务授权当前状态重新计算可进入范围`,
      }],
    }
  }
  // terminated：新建一条生效关系（历史终止关系保留供审计）
  const created: ProviderPharmaRelationship = {
    id: `rel-access-${Date.now().toString(36)}`,
    pharmaTenantId: input.pharmaTenantId,
    providerTenantId: input.providerTenantId,
    effectiveFrom: todayIso(),
    status: "active",
    source: "access",
  }
  commit({ relationships: [...state.relationships, created] })
  return {
    ok: true,
    created: true,
    audits: [{
      reasonCode: "COOPERATION_RECREATED_BY_ACCESS",
      target: `${tenantNameOf(input.providerTenantId)} × ${tenantNameOf(input.pharmaTenantId)}`,
      detail: `准入审核通过（操作者：${input.actor}）· 历史合作已终止，已新建生效合作关系；终止记录保留供审计`,
    }],
  }
}

/**
 * 药厂线下准入批量导入 → 直接建立生效合作关系（2026-10-16：存量合作商标识审查
 * 已线下完成，跳过系统准入流程）。与准入联动不同：
 * - 已生效 → 报错（导入校验层应已拦截，此处防御）；
 * - 已暂停 → 报错引导走「恢复合作」（不静默恢复，避免绕过暂停原因管理）；
 * - 已终止 → 新建生效关系（历史保留）；
 * - 无关系 → 新建生效关系（source=manual，合作生效日=导入当天）。
 */
export function createRelationshipDirect(input: {
  pharmaTenantId: string
  providerTenantId: string
  actor: string
}): CoopOpResult & { created?: boolean } {
  const rel = relationshipBetween(input.pharmaTenantId, input.providerTenantId)
  if (rel?.status === "active") {
    return { ok: false, error: `与「${tenantNameOf(rel.providerTenantId)}」的合作关系已生效，无需重复建立`, audits: [] }
  }
  if (rel?.status === "paused") {
    return { ok: false, error: `与「${tenantNameOf(rel.providerTenantId)}」的合作处于暂停中，请恢复合作而非重复导入`, audits: [] }
  }
  const created: ProviderPharmaRelationship = {
    id: `rel-manual-${Date.now().toString(36)}`,
    pharmaTenantId: input.pharmaTenantId,
    providerTenantId: input.providerTenantId,
    effectiveFrom: todayIso(),
    status: "active",
    source: "manual",
  }
  commit({ relationships: [...state.relationships, created] })
  return {
    ok: true,
    created: true,
    audits: [{
      reasonCode: rel ? "COOPERATION_RECREATED_BY_MANUAL_IMPORT" : "COOPERATION_CREATED_BY_MANUAL_IMPORT",
      target: `${tenantNameOf(input.providerTenantId)} × ${tenantNameOf(input.pharmaTenantId)}`,
      detail: `线下准入批量导入（操作者：${input.actor}）${rel ? "· 历史合作已终止，已新建生效合作关系" : "· 已建立并生效合作关系；药厂可配置品种业务授权"}`,
    }],
  }
}

/**
 * 外部已准入批量导入（2026-10-20 服务商管理整合）：与逐行 createRelationshipDirect 不同，
 * 在同一份内存快照上**先全量复验、后一次性 commit**——任一行不通过则整批不写入，
 * 从 store 层杜绝「预览校验通过但提交中途状态变化」造成的半批导入。
 * 每行生成一条审计（含历史终止重建场景）；导入批次、时间、操作人、声明写入 importMeta。
 */
export function importRelationshipsBatch(input: {
  pharmaTenantId: string
  rows: Array<{ providerTenantId: string }>
  actor: string
  importBatchId: string
  declaration: string
}): CoopOpResult & { created?: ProviderPharmaRelationship[] } {
  if (input.rows.length === 0) return { ok: false, error: "导入名单为空", audits: [] }
  if (!input.declaration.trim()) return { ok: false, error: "缺少导入声明", audits: [] }
  // 第一遍：对同一份 state 全量复验（active 阻止 / paused 引导恢复 / 名单内重复），
  // 同时记下各行是否存在历史终止关系（commit 前捕获，供审计 reasonCode 判定）
  const seen = new Set<string>()
  const hadTerminatedOf: boolean[] = []
  for (const row of input.rows) {
    const name = tenantNameOf(row.providerTenantId)
    if (seen.has(row.providerTenantId)) {
      return { ok: false, error: `名单内重复：${name}`, audits: [] }
    }
    seen.add(row.providerTenantId)
    const rel = relationshipBetween(input.pharmaTenantId, row.providerTenantId)
    hadTerminatedOf.push(rel?.status === "terminated")
    if (rel?.status === "active") {
      return { ok: false, error: `与「${name}」的合作关系已生效（${relationshipSourceLabel(rel.source)}），无需重复导入`, audits: [] }
    }
    if (rel?.status === "paused") {
      return { ok: false, error: `与「${name}」的合作处于暂停中，请恢复合作而非重复导入`, audits: [] }
    }
  }
  // 第二遍：构建全部新关系，一次 commit（整批原子）
  const importedAt = nowStampLocal()
  const created: ProviderPharmaRelationship[] = input.rows.map((row) => ({
    id: `rel-manual-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`,
    pharmaTenantId: input.pharmaTenantId,
    providerTenantId: row.providerTenantId,
    effectiveFrom: todayIso(),
    status: "active" as const,
    source: "manual" as const,
    importMeta: {
      importBatchId: input.importBatchId,
      importedAt,
      importedBy: input.actor,
      declaration: input.declaration.trim(),
    },
  }))
  commit({ relationships: [...state.relationships, ...created] })
  const audits = created.map((c, i) => ({
    reasonCode: hadTerminatedOf[i] ? "COOPERATION_RECREATED_BY_MANUAL_IMPORT" : "COOPERATION_CREATED_BY_MANUAL_IMPORT",
    target: `${tenantNameOf(c.providerTenantId)} × ${tenantNameOf(input.pharmaTenantId)}`,
    detail: `外部已准入导入（批次 ${input.importBatchId} · 操作者：${input.actor}）${hadTerminatedOf[i] ? "· 历史合作已终止，已新建生效合作关系；终止记录保留供审计" : "· 已建立并生效合作关系；品种业务授权另行配置"}`,
  }))
  return { ok: true, created, audits }
}

export function grantBusinessAuth(input: GrantBusinessAuthInput): CoopOpResult {
  const rel = state.relationships.find((r) => r.id === input.relationshipId)
  if (!rel) return { ok: false, error: "合作关系不存在", audits: [] }
  if (rel.status !== "active") return { ok: false, error: "合作未生效，不能授予业务资格", audits: [] }
  if (input.items.length === 0) return { ok: false, error: "请填写授权内容", audits: [] }
  if (!input.reason.trim()) return { ok: false, error: "请填写授予原因", audits: [] }
  const effectiveFrom = input.effectiveFrom?.trim() || todayIso()
  if (input.effectiveTo?.trim() && input.effectiveTo.trim() < effectiveFrom) {
    return { ok: false, error: "失效日期不能早于生效日期", audits: [] }
  }
  const auth: BusinessAuthorization = {
    id: `ba-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`,
    relationshipId: input.relationshipId,
    kind: input.kind,
    items: input.items,
    lineRegions: input.kind === "variety" && input.lineRegions && input.lineRegions.length > 0 ? input.lineRegions : undefined,
    status: "active",
    effectiveFrom,
    effectiveTo: input.effectiveTo?.trim() || undefined,
    grantedBy: input.actor,
    grantedAt: nowStampLocal(),
  }
  commit({ authorizations: [...state.authorizations, auth] })
  return {
    ok: true,
    audits: [{ reasonCode: "BUSINESS_AUTH_GRANTED", target: `${businessAuthKindLabel(input.kind)}：${input.items.join("、")}`, detail: `授予 ${tenantNameOf(rel.providerTenantId)} · 原因：${input.reason.trim()}` }],
  }
}

// ─── 服务商侧「角色与数据范围 · 已授权成员」校验（员工范围不得扩大） ───────────

/** 服务商当前可授予员工的药厂上限 = 合作生效 ∧ 品种业务授权有效的药厂 */
export function grantablePharmasForProvider(providerTenantId: string): string[] {
  return relationshipsOfProvider(providerTenantId)
    .filter((r) => r.status === "active" && hasActiveAuthorization(r.id, "variety"))
    .map((r) => r.pharmaTenantId)
}

/** 关系状态对员工授权的影响说明（展示在授权页/门页） */
export function assignmentPharmaHealthCheck(assignment: RoleAssignment): { pharmaTenantId: string; problem?: string }[] {
  const root = enterpriseRootOf(allOrgs(), assignment.scopeOrgId)
  const providerTenantId = assignment.tenantId ?? root?.id
  if (!providerTenantId || !assignment.pharmaTenantIds) return []
  const today = todayIso()
  const inWindow = assignment.effectiveFrom <= today && (!assignment.effectiveTo || assignment.effectiveTo >= today)
  return assignment.pharmaTenantIds.map((pharmaTenantId) => {
    if (!inWindow) {
      return {
        pharmaTenantId,
        problem: assignment.effectiveFrom > today ? `未到生效日（${assignment.effectiveFrom} 起）` : "授权已过期",
      }
    }
    const rel = relationshipBetween(pharmaTenantId, providerTenantId)
    if (!rel || rel.status === "terminated") return { pharmaTenantId, problem: "无生效合作关系" }
    if (rel.status === "paused") return { pharmaTenantId, problem: "合作已暂停" }
    if (!hasActiveAuthorization(rel.id, "variety")) return { pharmaTenantId, problem: "业务授权已撤销" }
    return { pharmaTenantId }
  })
}

/**
 * 服务商「指定范围」业务范围的固定层级（2026-09-15 拍板）：
 *   药厂 → 当前服务商（只读，自动带入）→ 已授权品种
 * - 药厂列表仅展示「合作生效 ∧ 存在有效品种授权」的药厂（grantablePharmasForProvider）；
 * - 品种仅展示该药厂有效授权给当前服务商的品种；
 * - 区域不提供勾选：由品种授权行（lineRegions，缺省回退关系级区域授权）自动派生、只读展示。
 */
export interface GrantedVarietyLine {
  varietyName: string
  /** 该品种授权行的派生区域（品种行级区域，缺省回退关系级区域授权） */
  regions: string[]
}

/** 某药厂当前有效授权给服务商的品种行（合作暂停/终止或授权撤销的实时排除） */
export function authorizedVarietyLinesOfPharma(
  providerTenantId: string,
  pharmaTenantId: string,
): GrantedVarietyLine[] {
  const rel = relationshipBetween(pharmaTenantId, providerTenantId)
  if (!rel || rel.status !== "active") return []
  const relRegions = activeAuthSummaryOfRelationship(rel.id).regions
  const out: GrantedVarietyLine[] = []
  for (const auth of authorizationsOfRelationship(rel.id)) {
    if (auth.kind !== "variety" || businessAuthRuntimeStatus(auth) !== "active") continue
    const regions = auth.lineRegions && auth.lineRegions.length > 0 ? auth.lineRegions : relRegions
    for (const varietyName of auth.items) out.push({ varietyName, regions })
  }
  return out
}

/**
 * 取消勾选某药厂后的品种剪枝（角色授予/调整成员范围共用）：
 * 保留「剩余已选药厂授权品种并集」内 的品种——剔除仅属于被取消药厂的品种，
 * 共有品种与其他药厂品种保留；剩余药厂为空则清空全部品种。
 */
export function pruneVarietiesOnPharmaRemoval(
  providerTenantId: string,
  nextPharmaIds: string[],
  prevVarietyNames: string[],
): string[] {
  if (nextPharmaIds.length === 0) return []
  const remaining = new Set<string>()
  for (const pharmaTenantId of nextPharmaIds) {
    for (const line of authorizedVarietyLinesOfPharma(providerTenantId, pharmaTenantId)) {
      remaining.add(line.varietyName)
    }
  }
  return prevVarietyNames.filter((v) => remaining.has(v))
}

/**
 * 服务商成员数据范围的派生区域（只读展示用）：给定药厂集合（与可选品种集合），
 * 返回品种授权自动派生的区域并集。区域不可由服务商二次勾选。
 */
export function derivedRegionCodesOfScope(
  providerTenantId: string,
  pharmaTenantIds: string[],
  varietyNames?: string[],
): string[] {
  const out = new Set<string>()
  for (const pharmaTenantId of pharmaTenantIds) {
    for (const line of authorizedVarietyLinesOfPharma(providerTenantId, pharmaTenantId)) {
      if (varietyNames && varietyNames.length > 0 && !varietyNames.includes(line.varietyName)) continue
      line.regions.forEach((r) => out.add(r))
    }
  }
  return [...out]
}

/**
 * 服务商成员在当前服务药厂下的可用业务范围（任务/拜访/结算/绩效/导出统一过滤口径）：
 * 当前服务商租户 → 药厂品种授权（有效）→ 成员授权收窄（pharmaTenantIds / varietyNames）。
 * 返回 null 表示该成员在该药厂无可用业务范围。
 */
export function servingBizScopeOfAssignment(
  assignment: RoleAssignment,
  pharmaTenantId: string,
): { varietyNames: string[]; regions: string[] } | null {
  // PROVIDER 档（服务商管理员）不配置 pharmaTenantIds：与门页 grantedPharmasForUser
  // 同口径——名下药厂 = 本服务商全部有效授权药厂，范围 = 当前药厂的全部有效品种
  // 授权（品种级收窄 varietyNames 仍生效；授权失效时下方 lines 为空自然拒绝）。
  const providerAdminScope =
    (!assignment.pharmaTenantIds || assignment.pharmaTenantIds.length === 0) &&
    ([...PRESET_ROLES, ...seedCustomRoles].find((r) => r.id === assignment.roleId)?.defaultScope === "PROVIDER")
  if (!providerAdminScope) {
    if (!assignment.pharmaTenantIds || assignment.pharmaTenantIds.length === 0) return null
    if (!assignment.pharmaTenantIds.includes(pharmaTenantId)) return null
  }
  const lines = authorizedVarietyLinesOfPharma(assignment.tenantId, pharmaTenantId)
  if (lines.length === 0) return null
  const limit = assignment.varietyNames && assignment.varietyNames.length > 0 ? assignment.varietyNames : undefined
  const scoped = limit ? lines.filter((l) => limit.includes(l.varietyName)) : lines
  if (scoped.length === 0) return null
  return {
    varietyNames: [...new Set(scoped.map((l) => l.varietyName))],
    regions: [...new Set(scoped.flatMap((l) => l.regions))],
  }
}

/** 当前会话业务范围（服务商侧业务页统一过滤口径 §8.1） */
export interface ServingBizScope {
  pharmaTenantId: string
  pharmaName: string
  /** 本次会话可处理品种（角色授权收窄后） */
  varietyNames: string[]
  /** 品种授权派生区域（只读） */
  regions: string[]
}

/**
 * 服务商成员在当前会话服务药厂下的业务范围：
 * 当前服务商租户 → 当前成员 → 当前有效角色（effectiveAssignmentIds）→
 * 当前会话服务药厂 → 已授权品种 → 品种授权派生区域。
 * 非服务商身份或未选药厂返回 null（页面不过滤）。
 */
export function servingScopeOfPrincipal(
  principal: TenantPrincipal,
  assignments: RoleAssignment[],
): ServingBizScope | null {
  if (principal.tenantKind !== "provider" || !principal.currentPharmaTenantId) return null
  const varieties = new Set<string>()
  const regions = new Set<string>()
  for (const id of principal.effectiveAssignmentIds) {
    const assignment = assignments.find((a) => a.id === id)
    if (!assignment) continue
    const scope = servingBizScopeOfAssignment(assignment, principal.currentPharmaTenantId)
    if (!scope) continue
    scope.varietyNames.forEach((v) => varieties.add(v))
    scope.regions.forEach((r) => regions.add(r))
  }
  if (varieties.size === 0) return null
  return {
    pharmaTenantId: principal.currentPharmaTenantId,
    pharmaName: principal.currentPharmaName ?? tenantNameOf(principal.currentPharmaTenantId),
    varietyNames: [...varieties],
    regions: [...regions],
  }
}

/** 区域名归一化（去掉省市后缀），用于任务/拜访区域与服务范围的宽松匹配 */
export function normalizeRegionName(name: string): string {
  return name.replace(/(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区|特别行政区)$/g, "")
}

/**
 * 品种名归一化：业务数据常用商品名（如「阿托伐他汀钙片(20mg)」），授权登记用
 * 通用名（「阿托伐他汀钙片」）。过滤时按通用名口径宽松匹配（去掉规格后缀）。
 */
export function normalizeVarietyName(name: string): string {
  return name.replace(/[(（][^)）]*[)）]/g, "").trim()
}

/** 业务记录品种是否落在会话已授权品种范围内（通用名口径） */
export function varietyInScope(varietyName: string, scopeVarietyNames: string[]): boolean {
  if (scopeVarietyNames.length === 0) return true
  const normalized = normalizeVarietyName(varietyName)
  return scopeVarietyNames.some((v) => normalizeVarietyName(v) === normalized)
}

// ─── 统一业务授权读取适配层（P0-3：任务/拜访/品种过滤与门页同源） ─────────────

/** 有效品种授权行（provider × 品种 × 区域），与旧 VarietyProviderAuth 口径对齐 */
export interface EffectiveProviderAuthRow {
  id: string
  providerTenantId: string
  /** 服务商企业名（与任务/预算数据中的 provider 名称一致） */
  provider: string
  varietyNames: string[]
  /** 品种行区域；缺省回退该关系的区域授权 */
  regions: string[]
}

/**
 * 唯一业务授权事实源的统一读取函数：药厂「业务授权」页、服务商「合作药厂与业务授权」、
 * 服务专员门页、任务/预算/拜访的品种过滤全部从这里（或其再包装）取数。
 * 撤销（revoked）/过期授权与暂停合作关系下的授权实时排除。
 */
export function effectiveProviderAuthRows(): EffectiveProviderAuthRow[] {
  const rows: EffectiveProviderAuthRow[] = []
  for (const rel of state.relationships) {
    if (rel.status !== "active") continue
    const provider = tenantNameOf(rel.providerTenantId)
    const relRegions = activeAuthSummaryOfRelationship(rel.id).regions
    for (const auth of authorizationsOfRelationship(rel.id)) {
      if (auth.kind !== "variety" || businessAuthRuntimeStatus(auth) !== "active") continue
      rows.push({
        id: auth.id,
        providerTenantId: rel.providerTenantId,
        provider,
        varietyNames: [...auth.items],
        regions: auth.lineRegions && auth.lineRegions.length > 0 ? [...auth.lineRegions] : relRegions,
      })
    }
  }
  return rows
}

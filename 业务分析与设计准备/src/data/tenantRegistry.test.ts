import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  RETIRED_AUDIT_REASONS,
  TENANT_STATUS_LABEL,
  createTenant,
  getTenantRegistrySnapshot,
  resetTenantRegistry,
  resumeTenant,
  suspendTenant,
  tenantLoginAllowed,
  type TenantRecord,
} from "./tenantRegistry"

// 2026-11-24《租户管理需求文档（研发精简版）》对齐回归：
// 两态状态机、创建即正常（首位管理员可直接登录）、暂停/恢复必填原因、
// 复制不留痕、无撞码重试日志 / 幂等回执 / 主码退役流转；旧数据加载时原地升级。

const ACTOR = "王敏"

function newTenant(index: number) {
  const r = createTenant({
    type: "pharma",
    profile: {
      legalName: `测试药厂${index}有限公司`,
      shortName: `测试药厂${index}`,
      uscc: `91320100MA0TEST0${String(index).padStart(2, "0")}`,
      address: "江苏省南京市江北新区药谷大道 1 号",
      contactName: "联系人",
      contactPhone: "13901350100",
    },
    admin: { name: "管理员", phone: `139013501${String(index).padStart(2, "0")}`, roleLabel: "企业管理员" },
    actor: ACTOR,
  })
  if (!r.ok || !r.tenant) throw new Error(r.error ?? "建租失败")
  return r
}

function tenantOf(id: string): TenantRecord {
  return getTenantRegistrySnapshot().tenants.find((t) => t.id === id)!
}

describe("租户状态收敛与开户即生效", () => {
  beforeEach(() => resetTenantRegistry())

  it("状态只剩正常 / 已暂停，种子租户全部落在两态内", () => {
    expect(Object.keys(TENANT_STATUS_LABEL).sort()).toEqual(["active", "suspended"])
    const statuses = new Set(getTenantRegistrySnapshot().tenants.map((t) => t.status))
    expect([...statuses].every((s) => s === "active" || s === "suspended")).toBe(true)
    expect(statuses.has("suspended")).toBe(true)
  })

  it("创建即正常：首位管理员可直接登录；主企业码 8 位且不含易混字符", () => {
    const r = newTenant(1)
    const t = r.tenant!
    expect(t.status).toBe("active")
    expect(t.initialAdmin.memberStatus).toBe("active")
    expect(t.initialAdmin.activatedAt).toBeTruthy()
    expect(tenantLoginAllowed(t.enterpriseOrgId)).toBe(true)
    // 字符表排除 0/O、1/I（需求文档 §2.2）
    expect(t.primaryCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
  })

  it("重复主体直接阻断（无幂等重放回执）", () => {
    const first = newTenant(2)
    const dup = createTenant({
      type: "pharma",
      profile: { ...first.tenant!.profile },
      admin: { name: "管理员", phone: "13901350999", roleLabel: "企业管理员" },
      actor: ACTOR,
    })
    expect(dup.ok).toBe(false)
    expect(dup.error).toContain("已存在租户")
  })

  it("生命周期只剩暂停 / 恢复：标准原因码 + 必填说明落审计，暂停阻断登录、恢复放行", () => {
    const { id, enterpriseOrgId } = newTenant(3).tenant!
    expect(suspendTenant(id, "CONTRACT_HOLD", "合作协议暂停，走查", ACTOR).ok).toBe(true)
    expect(tenantOf(id).status).toBe("suspended")
    expect(tenantOf(id).statusReasonCode).toBe("CONTRACT_HOLD")
    expect(tenantOf(id).statusNote).toBe("合作协议暂停，走查")
    expect(tenantLoginAllowed(enterpriseOrgId)).toBe(false)
    expect(suspendTenant(id, "CONTRACT_HOLD", "合作协议暂停，走查", ACTOR).ok).toBe(false)

    expect(resumeTenant(id, "CONTRACT_RESUMED", "续签完成恢复合作", ACTOR).ok).toBe(true)
    expect(tenantOf(id).status).toBe("active")
    expect(tenantOf(id).statusReasonCode).toBe("CONTRACT_RESUMED")
    expect(tenantLoginAllowed(enterpriseOrgId)).toBe(true)
    expect(resumeTenant(id, "CONTRACT_RESUMED", "续签完成恢复合作", ACTOR).ok).toBe(false)
  })

  it("流水里不出现已下线操作的原因码（复制 / 撞码重试 / 终止）", () => {
    expect([...RETIRED_AUDIT_REASONS].sort()).toEqual([
      "ENT_CODE_COLLISION_RETRIED",
      "ENT_CODE_COPIED",
      "TENANT_TERMINATED",
    ])
    newTenant(4)
    newTenant(5)
    const codes = getTenantRegistrySnapshot().activityLog.map((l) => l.reasonCode)
    expect(codes.length).toBeGreaterThan(0)
    expect(codes.some((c) => RETIRED_AUDIT_REASONS.has(c))).toBe(false)
  })
})

describe("旧版本地数据加载时原地升级", () => {
  it("v4 → v5：待激活转正常；已终止租户连同从属记录移除；下线流水与字段清除；其余保留", async () => {
    resetTenantRegistry()
    const legacyKey = "baiyee-tenant-registry-v4"
    const currentKey = "baiyee-tenant-registry-v5"
    const snap = getTenantRegistrySnapshot()
    const kept = snap.tenants.find((t) => t.id === "tenant-langseng")!
    const pending = snap.tenants.find((t) => t.id === "tenant-yunxing")!

    window.localStorage.setItem(legacyKey, JSON.stringify({
      ...snap,
      version: 4,
      tenants: [
        { ...pending, status: "pending_activation" },
        { ...kept, id: "tenant-old", shortName: "旧租户", status: "terminated", enterpriseOrgId: "org-rt-old", primaryCode: "OLD0CODE1" },
        kept,
      ],
      // 子部门排在企业根之前：下钻不能依赖数组顺序
      orgs: [
        ...snap.orgs,
        { id: "dept-old", name: "旧租户销售部", type: "department", parentId: "org-rt-old" },
        { id: "org-rt-old", name: "旧租户有限公司", type: "pharma" },
      ],
      codes: [
        ...snap.codes,
        // 已终止租户的退役码 → 随租户移除；在册租户的多余码 → 保留但剥掉 lifecycle
        { code: "OLD0CODE1", enterpriseId: "org-rt-old", lifecycle: "retired", createdAt: "2025-01-01 09:00", createdBy: ACTOR },
        { code: "KEPT0CODE", enterpriseId: kept.enterpriseOrgId, lifecycle: "retired", createdAt: "2025-01-01 09:00", createdBy: ACTOR },
      ],
      users: [
        ...snap.users,
        { id: "u-old", name: "旧管理员", account: "rt-old", phone: "13800000000", email: "", orgId: "dept-old", orgName: "旧租户有限公司", accountStatus: "enabled", createdAt: "2025-01-01 09:00" },
      ],
      assignments: [
        ...snap.assignments,
        { id: "g-old", tenantId: "org-rt-old", userId: "u-old", roleId: "role-pharma-admin", scopeOrgId: "org-rt-old", scopeOrgName: "旧租户有限公司", scope: "PHARMA", effectiveFrom: "2025-01-01", grantedBy: ACTOR, grantedAt: "2025-01-01 09:00", status: "active", reason: "租户创建 · 首位管理员预置授权" },
      ],
      memberships: [
        { id: "mb-old", userId: "u-old", tenantId: "org-rt-old", tenantName: "旧租户有限公司", orgUnitId: "dept-old", status: "active", joinedAt: "2025-01-01" },
      ],
      activityLog: [
        { id: "tl-copy", at: "2026-09-13 10:00", actor: ACTOR, reasonCode: "ENT_CODE_COPIED", targetTenant: kept.shortName, code: kept.primaryCode },
        { id: "tl-term", at: "2026-06-30 18:00", actor: ACTOR, reasonCode: "TENANT_TERMINATED", targetTenant: "旧租户", code: "OLD0CODE1" },
        { id: "tl-susp", at: "2026-09-10 10:00", actor: ACTOR, reasonCode: "TENANT_SUSPENDED", targetTenant: "启辰推广", code: "H4TW9MXP" },
      ],
      // v4 的已下线字段：升级后应整体剥离
      createIdempotency: { "pharma:91320000MA0OLD0001": { tenantId: "tenant-old", requestId: "req-1" } },
      collisionDemoDone: true,
      deletedOrgIds: ["dept-gone"],
    }))
    window.localStorage.removeItem(currentKey)

    vi.resetModules()
    const fresh = await import("./tenantRegistry")
    const upgraded = fresh.getTenantRegistrySnapshot()

    expect(upgraded.version).toBe(5)
    expect(upgraded.tenants.find((t) => t.id === pending.id)?.status).toBe("active")
    expect(upgraded.tenants.find((t) => t.id === kept.id)).toBeTruthy()
    expect(upgraded.tenants.some((t) => t.id === "tenant-old")).toBe(false)
    expect(upgraded.codes.some((c) => c.code === "OLD0CODE1")).toBe(false)
    expect(upgraded.codes.some((c) => c.code === "KEPT0CODE")).toBe(true)
    expect(upgraded.codes.every((c) => !("lifecycle" in c))).toBe(true)
    expect(upgraded.orgs.some((o) => o.id === "org-rt-old" || o.id === "dept-old")).toBe(false)
    expect(upgraded.users.some((u) => u.id === "u-old")).toBe(false)
    expect(upgraded.assignments.some((a) => a.id === "g-old")).toBe(false)
    expect(upgraded.memberships.some((m) => m.id === "mb-old")).toBe(false)
    expect("createIdempotency" in upgraded).toBe(false)
    expect("collisionDemoDone" in upgraded).toBe(false)
    expect(upgraded.deletedOrgIds).toEqual(["dept-gone"])
    expect(upgraded.activityLog.map((l) => l.id)).toEqual(["tl-susp"])
    // 升级结果已落盘到 v5 键：下次加载直接命中，不再重复升级
    expect(JSON.parse(window.localStorage.getItem(currentKey)!).version).toBe(5)
  })

  it("同日早版 v5 数据读取时净化：剥离下线字段与下线流水", async () => {
    resetTenantRegistry()
    const snap = getTenantRegistrySnapshot()
    window.localStorage.setItem("baiyee-tenant-registry-v5", JSON.stringify({
      ...snap,
      createIdempotency: { "pharma:X": { tenantId: "t1", requestId: "r1" } },
      collisionDemoDone: true,
      activityLog: [
        { id: "tl-old-copy", at: "2026-11-24 09:00", actor: ACTOR, reasonCode: "ENT_CODE_COPIED", targetTenant: "朗盛生物", code: "N4PJ2XKM" },
        { id: "tl-old-coll", at: "2026-11-24 09:00", actor: ACTOR, reasonCode: "ENT_CODE_COLLISION_RETRIED", targetTenant: "朗盛生物", code: "N4PJ2XKM" },
        { id: "tl-keep", at: "2026-09-10 10:00", actor: ACTOR, reasonCode: "TENANT_SUSPENDED", targetTenant: "启辰推广", code: "H4TW9MXP" },
      ],
    }))
    vi.resetModules()
    const fresh = await import("./tenantRegistry")
    const s = fresh.getTenantRegistrySnapshot()
    expect("createIdempotency" in s).toBe(false)
    expect("collisionDemoDone" in s).toBe(false)
    expect(s.activityLog.map((l) => l.id)).toEqual(["tl-keep"])
  })
})

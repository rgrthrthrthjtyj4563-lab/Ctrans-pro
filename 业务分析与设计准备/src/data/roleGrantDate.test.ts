import { describe, expect, it } from "vitest"
import {
  countGrantedUsers,
  grantStatusLabel,
  isGrantEffective,
  resolveGrantStatus,
  roleStatusLabel,
  type RoleAssignment,
} from "./permissions"

function makeAssignment(patch: Partial<RoleAssignment>): RoleAssignment {
  return {
    id: "g-test",
    tenantId: "org-pharma",
    userId: "u-test",
    roleId: "role-pharma-rep",
    scopeOrgId: "org-pharma",
    scopeOrgName: "华东大区",
    scope: "PHARMA",
    effectiveFrom: "2026-11-25",
    grantedBy: "管理员",
    grantedAt: "2026-11-25 10:00",
    status: "active",
    ...patch,
  }
}

describe("角色与授权状态口径（授予即生效，移除即失效）", () => {
  it("active 授权直接生效，不再受生效期/到期日切分", () => {
    const a = makeAssignment({ status: "active" })
    expect(resolveGrantStatus(a)).toBe("active")
    expect(isGrantEffective(a)).toBe(true)
    expect(grantStatusLabel(resolveGrantStatus(a))).toBe("生效")
  })

  it("已移除授权不再授予权限，文案显示为「已移除」", () => {
    const revoked = makeAssignment({ status: "revoked" })
    expect(resolveGrantStatus(revoked)).toBe("revoked")
    expect(isGrantEffective(revoked)).toBe(false)
    expect(grantStatusLabel(resolveGrantStatus(revoked))).toBe("已移除")
  })

  it("历史已过期记录仍保持兼容可读且不授予权限", () => {
    const expired = makeAssignment({ status: "expired" })
    expect(resolveGrantStatus(expired)).toBe("expired")
    expect(isGrantEffective(expired)).toBe(false)
    expect(grantStatusLabel(resolveGrantStatus(expired))).toBe("已过期")
  })

  it("countGrantedUsers 仅统计当前生效的去重人数", () => {
    const list: RoleAssignment[] = [
      makeAssignment({ id: "g1", userId: "u1", status: "active" }),
      makeAssignment({ id: "g2", userId: "u2", status: "revoked" }),
      makeAssignment({ id: "g3", userId: "u3", status: "expired" }),
      makeAssignment({ id: "g4", userId: "u1", status: "active" }),
    ]
    expect(countGrantedUsers("role-pharma-rep", list)).toBe(1)
  })

  it("历史草稿角色对外展示为停用", () => {
    expect(roleStatusLabel("draft")).toBe("停用")
    expect(roleStatusLabel("disabled")).toBe("停用")
    expect(roleStatusLabel("enabled")).toBe("启用")
  })
})


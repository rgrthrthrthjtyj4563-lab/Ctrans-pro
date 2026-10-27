/**
 * 验收审核人身份（2026-10-27 整改方案 §4 阶段 4 · D7）。
 *
 * 验收链配置只记每级的部门名（AcceptanceChainConfig.departments）。比对口径：审核人所属部门
 * **或其上级部门链**里含本级配置部门即可审——配置选「销售部」意指整个销售体系，西北大区 /
 * 陕西办事处的成员组织上属于销售部；预置企业管理员可越过。
 * 本 hook 把登录态（PermissionContext）翻成 reviewBatch 需要的 reviewerDepartment / reviewerIsAdmin，
 * 并给页面一个 checkLevel 用来提前禁用入口按钮——校验本体仍在 AcceptanceContext.reviewBatch 里兜底
 * （那里按同一口径比对 reviewerDepartmentChain）。
 */
import { useMemo, useSyncExternalStore } from "react"
import { usePermission } from "../context/PermissionContext"
import { useAcceptance } from "../context/AcceptanceContext"
import type { TenantPrincipal } from "../auth/authTypes"
import type { PermOrg } from "../data/permissions"
import { membershipOfUserInTenant, membershipRevision, subscribeTenantMemberships } from "../data/cooperationModel"
import { hasPharmaAdminAssignment } from "../data/pharmaRegionScope"

export interface AcceptanceReviewerIdentity {
  name: string
  /** 实际所属部门名（叶子节点）；未分配部门为空串 */
  department: string
  /** 所属部门及其全部上级部门名（不含企业根），用于与配置部门比对 */
  departmentChain: string[]
  isAdmin: boolean
  /** 本人能否审核第 level 级：部门链含配置部门，或企业管理员 */
  checkLevel: (level: number) => { ok: boolean; reason?: string; expectedDepartment?: string }
}

/** 从成员所属节点向上收集部门名，到企业根为止（不含根） */
export function departmentChainOf(orgs: readonly PermOrg[], orgUnitId: string | undefined): string[] {
  const chain: string[] = []
  let cur = orgUnitId ? orgs.find((o) => o.id === orgUnitId) : undefined
  let guard = 0
  while (cur && cur.type !== "pharma" && cur.type !== "provider" && cur.type !== "platform" && guard < 32) {
    chain.push(cur.name)
    cur = cur.parentId ? orgs.find((o) => o.id === cur!.parentId) : undefined
    guard += 1
  }
  return chain
}

export function useAcceptanceReviewer(): AcceptanceReviewerIdentity {
  const { principal, orgs, assignments } = usePermission()
  const { config } = useAcceptance()
  const memberRevision = useSyncExternalStore(subscribeTenantMemberships, membershipRevision, membershipRevision)

  return useMemo<AcceptanceReviewerIdentity>(() => {
    const tenant = principal.realm === "TENANT" ? (principal as TenantPrincipal) : null
    const membership = tenant ? membershipOfUserInTenant(tenant.userId, tenant.tenantId) : undefined
    const orgUnitId = membership?.orgUnitId ?? principal.orgId
    const departmentChain = departmentChainOf(orgs, orgUnitId)
    const department = departmentChain[0] ?? ""
    const isAdmin = tenant
      ? hasPharmaAdminAssignment(assignments.filter((a) => a.userId === tenant.userId), tenant.tenantId)
      : false
    const checkLevel = (level: number) => {
      const expectedDepartment = config.departments[level - 1]
      if (isAdmin || !expectedDepartment || departmentChain.includes(expectedDepartment)) return { ok: true, expectedDepartment }
      return {
        ok: false,
        expectedDepartment,
        reason: `第 ${level} 级验收部门为「${expectedDepartment}」，您所属部门为「${department || "未分配"}」`,
      }
    }
    return { name: principal.name, department, departmentChain, isAdmin, checkLevel }
    // memberRevision：调岗后部门即时生效
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal, orgs, assignments, config.departments, memberRevision])
}

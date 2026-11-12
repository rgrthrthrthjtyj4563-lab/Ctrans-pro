import { describe, expect, it } from 'vitest'
import {
  PERM_ORGS,
  PERM_USERS,
  TENANT_MEMBERSHIPS,
  deptDeleteBlockers,
  orgDescendantIds,
  type PermOrg,
  type TenantMembership,
} from './permissions'
import { allOrgs, removeRuntimeOrg, upsertRuntimeOrg } from './tenantRegistry'

// 组织架构改造（2026-10-28）：部门删除前置校验、删除墓碑持久化、演示数据口径。

const orgs: PermOrg[] = [
  { id: 'root', name: '测试药厂', type: 'pharma' },
  { id: 'sales', name: '销售部', type: 'department', parentId: 'root' },
  { id: 'east', name: '华东大区', type: 'department', parentId: 'sales' },
  { id: 'empty', name: '空部门', type: 'department', parentId: 'root' },
]

function membership(userId: string, orgUnitId: string, status: TenantMembership['status'] = 'active'): TenantMembership {
  return { id: `mb-${userId}`, userId, tenantId: 'root', tenantName: '测试药厂', orgUnitId, status, joinedAt: '2026-01-01' }
}

describe('department delete blockers', () => {
  it('refuses the enterprise root and non-department nodes', () => {
    const [blocker] = deptDeleteBlockers({ orgs, memberships: [], orgId: 'root', businessRefDeptNames: [] })
    expect(blocker.kind).toBe('root')
    expect(deptDeleteBlockers({ orgs, memberships: [], orgId: 'missing', businessRefDeptNames: [] })[0].kind).toBe('root')
  })

  it('counts members in the whole subtree, including disabled identities, but not removed ones', () => {
    const memberships = [
      membership('a', 'east'),
      membership('b', 'east', 'frozen'),
      membership('c', 'sales', 'removed'),
    ]
    const blockers = deptDeleteBlockers({ orgs, memberships, orgId: 'sales', businessRefDeptNames: [] })
    const members = blockers.find(b => b.kind === 'members')
    expect(members?.message).toContain('2 名成员')
    expect(blockers.some(b => b.kind === 'children')).toBe(true)
  })

  it('blocks on business references and names where to look', () => {
    const blockers = deptDeleteBlockers({ orgs, memberships: [], orgId: 'sales', businessRefDeptNames: ['销售部'] })
    const ref = blockers.find(b => b.kind === 'business-ref')
    expect(ref?.refs?.[0]).toContain('执行链路配置')
    expect(ref?.refs?.[0]).toContain('销售部')
  })

  it('allows deletion only when members, children and references are all clear', () => {
    expect(deptDeleteBlockers({ orgs, memberships: [membership('x', 'sales')], orgId: 'empty', businessRefDeptNames: ['销售部'] })).toEqual([])
    expect(deptDeleteBlockers({ orgs, memberships: [membership('x', 'empty')], orgId: 'empty', businessRefDeptNames: [] })).toHaveLength(1)
  })
})

describe('deleted department tombstone', () => {
  it('hides a seed department after removal and restores it on re-upsert', () => {
    const seed = PERM_ORGS.find(o => o.id === 'org-dept-east')!
    expect(allOrgs().some(o => o.id === seed.id)).toBe(true)
    removeRuntimeOrg(seed.id)
    expect(allOrgs().some(o => o.id === seed.id)).toBe(false)
    expect(orgDescendantIds(allOrgs(), 'org-dept-sales')).not.toContain(seed.id)
    upsertRuntimeOrg(seed)
    expect(allOrgs().some(o => o.id === seed.id)).toBe(true)
  })
})

describe('organization demo seed', () => {
  const pharmaMembers = TENANT_MEMBERSHIPS.filter(m => m.tenantId === 'org-pharma' && m.status !== 'removed')
  const pharmaOrgIds = new Set(orgDescendantIds(PERM_ORGS, 'org-pharma'))

  it('keeps a disabled account inside the department head count', () => {
    const suhang = PERM_USERS.find(u => u.id === 'u-suhang')
    expect(suhang?.accountStatus).toBe('disabled')
    expect(pharmaMembers.some(m => m.userId === 'u-suhang' && m.orgUnitId === 'org-dept-sales')).toBe(true)
  })

  it('exposes exactly one unassigned member whose unit no longer exists', () => {
    const unassigned = pharmaMembers.filter(m => !pharmaOrgIds.has(m.orgUnitId))
    expect(unassigned.map(m => m.userId)).toEqual(['u-linyiming'])
  })

  it('keeps 华东大区 empty for the empty-department demo state', () => {
    const eastIds = new Set(orgDescendantIds(PERM_ORGS, 'org-dept-east'))
    expect(pharmaMembers.some(m => eastIds.has(m.orgUnitId))).toBe(false)
  })
})

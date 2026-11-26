import { describe, expect, it } from 'vitest'
import {
  PERM_ORGS,
  PERM_USERS,
  TENANT_MEMBERSHIPS,
  acceptanceDeptRefBlocker,
  deptDeleteBlockers,
  isMembershipUnassigned,
  nextOrgId,
  orgDescendantIds,
  sameLevelDeptNameExists,
  validateDeptParent,
  type PermOrg,
  type TenantMembership,
} from './permissions'
import { activeAcceptanceDepartments } from './acceptanceData'
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

// 组织架构原型整改（2026-11-25）：部门 id 稳定唯一、移动同级重名、待分配成员、人数口径、验收引用。

describe('department id generation across refreshes', () => {
  it('derives the next id from existing persisted departments instead of a session counter', () => {
    const tree: PermOrg[] = [
      { id: 'root', name: '测试药厂', type: 'pharma' },
      { id: 'org-dept-101', name: 'A', type: 'department', parentId: 'root' },
      { id: 'org-dept-107', name: 'B', type: 'department', parentId: 'org-dept-101' },
      { id: 'org-dept-sales', name: '销售部', type: 'department', parentId: 'root' },
    ]
    expect(nextOrgId(tree)).toBe('org-dept-108')
    const created: PermOrg = { id: nextOrgId(tree), name: 'C', type: 'department', parentId: 'org-dept-107' }
    // 第二次新增（模拟刷新后计数器归零）继续递增，不与已持久化部门撞 id
    expect(nextOrgId([...tree, created])).toBe('org-dept-109')
    expect(tree.some(o => o.id === nextOrgId(tree))).toBe(false)
  })
})

describe('same-level duplicate names on move', () => {
  const tree: PermOrg[] = [
    { id: 'root', name: '测试药厂', type: 'pharma' },
    { id: 'sales', name: '销售部', type: 'department', parentId: 'root' },
    { id: 'west', name: '西北大区', type: 'department', parentId: 'sales' },
    { id: 'sichuan', name: '四川办事处', type: 'department', parentId: 'west' },
    { id: 'spare', name: '四川办事处', type: 'department', parentId: 'root' },
  ]

  it('checks the target parent when only the parent changes', () => {
    // 把根下的「四川办事处」挂到西北大区 → 目标上级下已存在同名部门
    expect(sameLevelDeptNameExists(tree, 'west', '四川办事处', 'spare')).toBe(true)
    // 改名同样走这套规则（改名成「销售部」在根下重名）
    expect(sameLevelDeptNameExists(tree, 'root', '销售部', 'spare')).toBe(true)
    // 未改名的同级重名判定排除自身后不误报
    expect(sameLevelDeptNameExists(tree, 'root', '四川办事处', 'spare')).toBe(false)
  })

  it('still refuses moving a department under itself or its own descendants', () => {
    expect(validateDeptParent(tree, 'sales', 'sales').ok).toBe(false)
    expect(validateDeptParent(tree, 'sichuan', 'west').ok).toBe(false)
    expect(validateDeptParent(tree, 'root', 'spare').ok).toBe(true)
  })
})

describe('head count / delete rules for departed members', () => {
  it('ignores left and removed memberships but keeps frozen members', () => {
    const memberships = [
      membership('a', 'east', 'active'),
      membership('b', 'east', 'frozen'),
      membership('c', 'sales', 'left'),
      membership('d', 'sales', 'removed'),
    ]
    const blockers = deptDeleteBlockers({ orgs, memberships, orgId: 'sales', businessRefDeptNames: [] })
    expect(blockers.find(b => b.kind === 'members')?.message).toContain('2 名成员')
    const eastBlockers = deptDeleteBlockers({ orgs, memberships, orgId: 'east', businessRefDeptNames: [] })
    expect(eastBlockers.find(b => b.kind === 'members')?.message).toContain('2 名成员')
  })
})

describe('acceptance reference protection', () => {
  it('only enabled levels of the live config are referenced (draft/defaults do not count)', () => {
    expect(activeAcceptanceDepartments({ levels: 1, departments: ['销售部', '合规部'] })).toEqual(['销售部'])
    expect(activeAcceptanceDepartments({ levels: 2, departments: ['销售部', '合规部'] })).toEqual(['销售部', '合规部'])
    expect(activeAcceptanceDepartments({ levels: 3, departments: ['销售部'] })).toEqual(['销售部'])
  })

  it('blocks a referenced department and points at the publish entry', () => {
    const blocker = deptDeleteBlockers({
      orgs,
      memberships: [],
      orgId: 'empty',
      businessRefDeptNames: ['空部门'],
    }).find(b => b.kind === 'business-ref')
    expect(blocker?.message).toBe(acceptanceDeptRefBlocker('空部门'))
    expect(blocker?.message).toContain('执行链路配置')
    expect(blocker?.message).toContain('发布')
  })
})

describe('unassigned members', () => {
  it('treats a member whose unit is no longer in the tenant tree as unassigned', () => {
    expect(isMembershipUnassigned(orgs, membership('u-linyiming', 'northeast-legacy'), 'root')).toBe(true)
    expect(isMembershipUnassigned(orgs, membership('u-zhouqian', 'east'), 'root')).toBe(false)
  })

  it('keeps the seeded demo member as the only unassigned one under the enterprise root', () => {
    const pharmaMembers = TENANT_MEMBERSHIPS.filter(m => m.tenantId === 'org-pharma' && m.status !== 'removed' && m.status !== 'left')
    const unassigned = pharmaMembers.filter(m => isMembershipUnassigned(PERM_ORGS, m, 'org-pharma'))
    expect(unassigned.map(m => m.userId)).toEqual(['u-linyiming'])
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

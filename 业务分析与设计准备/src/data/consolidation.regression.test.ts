import { describe, expect, it } from 'vitest'
import {
  membershipOfUserInTenant,
  setMembershipRegions,
  upsertMembership,
} from './cooperationModel'
import {
  pharmaRegionScopeOfMember,
  regionsIntersect,
  resolveRowRegions,
} from './pharmaRegionScope'
import { monthsCovered, nearestTier } from '../domain/taskV4'

// Cross-feature contracts protected when merging task creation, visits and member regions.
describe('consolidated member-region behavior', () => {
  it('moving a member preserves regions and their other enterprise identity', () => {
    const userId = 'consolidation-test-member'
    upsertMembership({ userId, tenantId: 'org-pharma', orgUnitId: 'org-pharma-sales' })
    upsertMembership({ userId, tenantId: 'org-pharma-huakang', orgUnitId: 'org-pharma-huakang' })
    expect(setMembershipRegions({ userId, tenantId: 'org-pharma', regions: ['陕西', '宁夏'] }).ok).toBe(true)
    const before = structuredClone(membershipOfUserInTenant(userId, 'org-pharma')!)
    const other = structuredClone(membershipOfUserInTenant(userId, 'org-pharma-huakang')!)
    upsertMembership({ userId, tenantId: 'org-pharma', orgUnitId: 'org-pharma' })
    const after = membershipOfUserInTenant(userId, 'org-pharma')!
    expect(after).toEqual({ ...before, orgUnitId: 'org-pharma' })
    expect(membershipOfUserInTenant(userId, 'org-pharma-huakang')).toEqual(other)
    expect(pharmaRegionScopeOfMember({ regions: after.responsibleRegions, isPharmaAdmin: false }))
      .toEqual({ mode: 'REGIONS', regions: ['陕西', '宁夏'] })
  })

  it('an ordinary member without regions cannot see even a nationwide task', () => {
    const scope = pharmaRegionScopeOfMember({ regions: undefined, isPharmaAdmin: false })
    expect(scope.mode).toBe('NONE')
    expect(regionsIntersect(scope, ['全国'])).toBe(false)
  })

  it('a multi-province task matches on any responsible province without department inference', () => {
    const scope = pharmaRegionScopeOfMember({ regions: ['陕西省', '宁夏回族自治区'], isPharmaAdmin: false })
    expect(regionsIntersect(scope, ['陕西', '四川'])).toBe(true)
    expect(regionsIntersect(scope, ['四川'])).toBe(false)
    expect(regionsIntersect(scope, ['全国'])).toBe(true)
  })

  it('resolves visit rows from taskId but never fabricates regions from provider or variety', () => {
    const taskRegionsOf = (id: string) => id === 'task-test' ? ['陕西', '四川'] : undefined
    expect(resolveRowRegions({ taskId: 'task-test' }, { taskRegionsOf })).toEqual(['陕西', '四川'])
    expect(resolveRowRegions({ taskId: 'missing', provider: 'provider-test', variety: 'variety-test' }, { taskRegionsOf })).toBeNull()
    expect(resolveRowRegions({ region: '宁夏', taskId: 'task-test' }, { taskRegionsOf })).toEqual(['宁夏'])
  })

  it('keeps the configured administrator regional exception', () => {
    expect(pharmaRegionScopeOfMember({ regions: [], isPharmaAdmin: true })).toEqual({ mode: 'ALL', regions: ['全国'] })
  })
})

describe('consolidated batch task creation', () => {
  it('floors indivisible budget amounts to integer quantities without overspending', () => {
    const tier = nearestTier(1199, 300)
    expect(tier.qty).toBe(3)
    expect(tier.amount).toBe(900)
  })

  it('preserves exactly divisible amounts', () => {
    const tier = nearestTier(1200, 300)
    expect(tier.qty).toBe(4)
    expect(tier.amount).toBe(1200)
    expect(tier.rounded).toBe(false)
  })

  it('handles year-spanning settlement periods and invalid historical date values', () => {
    expect(monthsCovered('2026-12-01', '2027-02-28')).toEqual(['2026-12', '2027-01', '2027-02'])
    expect(monthsCovered(null as unknown as string, '2027-02-28')).toEqual([])
    expect(monthsCovered(123 as unknown as string, '2027-02-28')).toEqual([])
  })
})

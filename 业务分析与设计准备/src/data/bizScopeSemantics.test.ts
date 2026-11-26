import { describe, expect, it } from 'vitest'
import {
  cleanBizScopesOnPharmaToggle,
  validateBizScopes,
} from './cooperationModel'
import { bizScopeModeOf, type BizScopeItem } from './permissions'

// 2026-11 §4 空选语义（验收 A07）：「全部 / 指定」显式区分；指定模式取消最后一项
// 保持空选、提示至少选一项、不能保存；「全部」必须显式选择且继续受上游约束。

const PROVIDER = 'org-provider-east' // 东方恒业推广有限公司（演示数据）

describe('bizScopeModeOf · 口径推断', () => {
  it('显式声明优先于数组内容', () => {
    expect(bizScopeModeOf([], 'all')).toBe('all')
    expect(bizScopeModeOf(['奥美拉唑肠溶胶囊'], 'pick')).toBe('pick')
  })

  it('旧数据（无 mode）按数组回推：空=全部、非空=指定', () => {
    expect(bizScopeModeOf([], undefined)).toBe('all')
    expect(bizScopeModeOf(['奥美拉唑肠溶胶囊'], undefined)).toBe('pick')
  })
})

describe('cleanBizScopesOnPharmaToggle · 勾选即显式全部', () => {
  it('勾选药厂产生显式 all 条目；取消勾选无残留', () => {
    const added = cleanBizScopesOnPharmaToggle([], 'org-pharma', true, PROVIDER)
    expect(added).toEqual([
      { pharmaTenantId: 'org-pharma', varietyNames: [], regionCodes: [], varietyMode: 'all', regionMode: 'all' },
    ])
    expect(cleanBizScopesOnPharmaToggle(added, 'org-pharma', false, PROVIDER)).toEqual([])
  })
})

describe('validateBizScopes · 指定模式空选不可保存', () => {
  it('显式 pick + 空品种清单 → 判错且提示切换口径', () => {
    const scopes: BizScopeItem[] = [
      { pharmaTenantId: 'org-pharma', varietyNames: [], regionCodes: [], varietyMode: 'pick', regionMode: 'all' },
    ]
    const errors = validateBizScopes(scopes, PROVIDER)
    expect(errors.some(e => e.includes('至少选择一个品种'))).toBe(true)
  })

  it('显式 pick + 空区域清单 → 判错且提示切换口径', () => {
    const scopes: BizScopeItem[] = [
      { pharmaTenantId: 'org-pharma', varietyNames: ['奥美拉唑肠溶胶囊'], regionCodes: [], varietyMode: 'pick', regionMode: 'pick' },
    ]
    const errors = validateBizScopes(scopes, PROVIDER)
    expect(errors.some(e => e.includes('至少选择一个区域'))).toBe(true)
  })

  it('显式 all + 空清单 = 全部已授权，校验通过（继续受上游实时约束）', () => {
    const scopes: BizScopeItem[] = [
      { pharmaTenantId: 'org-pharma', varietyNames: [], regionCodes: [], varietyMode: 'all', regionMode: 'all' },
    ]
    expect(validateBizScopes(scopes, PROVIDER)).toEqual([])
  })

  it('旧数据（无 mode、空数组）保持「全部」口径可用，不被新校验误伤', () => {
    const scopes: BizScopeItem[] = [
      { pharmaTenantId: 'org-pharma', varietyNames: [], regionCodes: [] },
    ]
    expect(validateBizScopes(scopes, PROVIDER)).toEqual([])
  })

  it('指定模式取消最后一省后提交仍被拦截（A07 主路径：仅陕西→取消最后一省）', () => {
    const scopes: BizScopeItem[] = [
      { pharmaTenantId: 'org-pharma', varietyNames: [], regionCodes: [], varietyMode: 'all', regionMode: 'pick' },
    ]
    const errors = validateBizScopes(scopes, PROVIDER)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.includes('至少选择一个区域'))).toBe(true)
  })
})

/**
 * 药厂侧区域范围（2026-10-27《药厂数据范围按部门区域重构-整改优化方案》§2 D1–D5）。
 *
 * 三层模型：角色 = 能做什么 + 字段脱敏；部门 = 管哪些区域；成员授权 = 给谁、哪个角色、生效期。
 * 本模块只回答「这个药厂成员能看哪些省」与「这一行数据落在哪些省」：
 * - 成员区域 = 所属部门 managedRegions；含「全国」= ALL；空 / 未配置 = NONE（默认拒绝）；
 *   预置「企业管理员」固定 ALL，是唯一例外（D1）。
 * - 行区域按 D2 顺序解析：① 行自带 regions/region → ② taskId → 任务服务地区 →
 *   ③ (服务商, 品种) → 本药厂授予该服务商该品种的区域（品种授权链）→ ④ 解析不出 = 不可见。
 * - 匹配是任务级（D3）：行区域与成员区域有交集即可见；行区域含「全国」对任何有区域的成员可见（D5）。
 *
 * 与服务商侧 `regionNamesInScope` 的区别：那边「行未标区域 = 放行」，这边「解析不出 = 拒绝」。
 * 两套语义各自服务默认口径，不要互相替换。
 */
import { PROVINCES, REGION_NATIONWIDE } from "../constants"
import type { PermOrg, RoleAssignment } from "./permissions"
import {
  authorizedVarietyLinesOfPharma,
  normalizeRegionName,
  normalizeVarietyName,
  relationshipsOfPharma,
  tenantNameOf,
} from "./cooperationModel"

export type PharmaRegionMode = "ALL" | "NONE" | "REGIONS"

export interface PharmaRegionScope {
  mode: PharmaRegionMode
  /** 规范短名；ALL 时为 ["全国"]，NONE 时为 [] */
  regions: string[]
}

/** 预置药厂企业管理员角色 id（permissions.PRESET_ROLES）——区域固定全量的唯一例外 */
export const PHARMA_ADMIN_ROLE_ID = "role-pharma-admin"

export const REGION_SCOPE_ALL: PharmaRegionScope = { mode: "ALL", regions: [REGION_NATIONWIDE] }
export const REGION_SCOPE_NONE: PharmaRegionScope = { mode: "NONE", regions: [] }

const PROVINCE_SET = new Set<string>(PROVINCES)

/** 任意写法（「陕西省」「宁夏回族自治区」「全国」）→ 规范短名；不在词表内返回 null */
export function canonicalRegionName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  if (trimmed === REGION_NATIONWIDE) return REGION_NATIONWIDE
  const short = normalizeRegionName(trimmed)
  return PROVINCE_SET.has(short) ? short : null
}

/**
 * 规范化一组区域：归一短名、去重、剔除词表外项；
 * 含「全国」时按 D1 互斥规则只保留「全国」。
 */
export function canonicalRegions(input: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of input) {
    const c = canonicalRegionName(raw)
    if (c && !out.includes(c)) out.push(c)
  }
  return out.includes(REGION_NATIONWIDE) ? [REGION_NATIONWIDE] : out
}

/** 部门节点 → 区域范围：含「全国」= ALL；空 / 缺省 = NONE；否则 REGIONS */
export function regionScopeOfOrg(org: Pick<PermOrg, "managedRegions"> | undefined): PharmaRegionScope {
  const regions = canonicalRegions(org?.managedRegions ?? [])
  if (regions.length === 0) return REGION_SCOPE_NONE
  if (regions.includes(REGION_NATIONWIDE)) return REGION_SCOPE_ALL
  return { mode: "REGIONS", regions }
}

/** 授权记录中是否含本租户有效的药厂企业管理员授权 */
export function hasPharmaAdminAssignment(assignments: readonly RoleAssignment[], tenantId: string): boolean {
  return assignments.some((a) => a.roleId === PHARMA_ADMIN_ROLE_ID && a.tenantId === tenantId && a.status === "active")
}

/** 成员区域范围：企业管理员固定全量（D1 唯一例外）；否则 = 所属部门的管理区域 */
export function pharmaRegionScopeOfMember(input: {
  orgs: readonly PermOrg[]
  orgUnitId: string | undefined
  isPharmaAdmin: boolean
}): PharmaRegionScope {
  if (input.isPharmaAdmin) return REGION_SCOPE_ALL
  const org = input.orgUnitId ? input.orgs.find((o) => o.id === input.orgUnitId) : undefined
  return regionScopeOfOrg(org)
}

export function regionScopeLabel(scope: PharmaRegionScope): string {
  if (scope.mode === "ALL") return REGION_NATIONWIDE
  if (scope.mode === "NONE") return "未配置"
  return scope.regions.join("、")
}

/**
 * 行区域 ∩ 成员区域（D3 任务级：命中任一省即可见；D5「全国」语义）。
 * 行区域为空由调用方按「解析不出 = 拒绝」处理，本函数不放行空集。
 */
export function regionsIntersect(scope: PharmaRegionScope, rowRegions: readonly string[]): boolean {
  if (scope.mode === "NONE") return false
  if (rowRegions.length === 0) return false
  if (scope.mode === "ALL") return true
  const mine = new Set(scope.regions.map((r) => normalizeRegionName(r)))
  return rowRegions.some((r) => {
    const t = r.trim()
    if (!t) return false
    if (t === REGION_NATIONWIDE) return true
    return mine.has(normalizeRegionName(t))
  })
}

/** 业务行的区域解析输入（各页按自身数据结构映射；字段越具体优先级越高，见 D2） */
export interface PharmaRegionRow {
  /** 行自带的多值区域（任务 regions、预算 regions、工作台任务 regions） */
  regions?: readonly string[]
  /** 行自带的单值区域（服务项目 / 结算明细行 region） */
  region?: string
  /** 所属任务（拜访 / 验收材料包 / 结算单经任务取区域） */
  taskId?: string
  /** 行所属服务商企业名（无区域字段的对象走品种授权链解析） */
  provider?: string
  /** 行品种（单值） */
  variety?: string
  /** 行品种（多值） */
  varieties?: readonly string[]
}

export interface PharmaRegionResolverContext {
  /** taskId → 任务服务地区（页面自备任务数据；缺省时跳过 ② 步） */
  taskRegionsOf?: (taskId: string) => readonly string[] | undefined
  /** (服务商名, 品种) → 本药厂授予该服务商该品种的区域（授权链；缺省时跳过 ③ 步） */
  authorizedRegionsOf?: (providerName: string, variety: string) => readonly string[] | undefined
}

/**
 * D2 行区域解析。返回 null 表示解析不出（药厂侧默认拒绝）；空数组视同 null。
 */
export function resolveRowRegions(row: PharmaRegionRow, ctx: PharmaRegionResolverContext): string[] | null {
  if (row.regions && row.regions.length > 0) return [...row.regions]
  if (row.region && row.region.trim()) return [row.region]
  if (row.taskId && ctx.taskRegionsOf) {
    const fromTask = ctx.taskRegionsOf(row.taskId)
    if (fromTask && fromTask.length > 0) return [...fromTask]
  }
  if (row.provider && ctx.authorizedRegionsOf) {
    const varieties = row.varieties && row.varieties.length > 0 ? row.varieties : row.variety ? [row.variety] : []
    const union = new Set<string>()
    for (const v of varieties) {
      const fromAuth = ctx.authorizedRegionsOf(row.provider, v)
      fromAuth?.forEach((r) => union.add(r))
    }
    if (union.size > 0) return [...union]
  }
  return null
}

/**
 * 构建 (服务商名, 品种) → 本药厂授予该服务商该品种的区域 的查询。
 * 按药厂建一次索引（服务商名 → 租户 id；授权行按服务商缓存）；合作 / 授权数据变化后需重建
 * （调用方以 cooperationRevision 为依赖重建即可）。只认合作生效且授权有效的服务商——
 * 合作暂停 / 终止、授权撤销的服务商按「解析不出」处理，与服务商侧口径一致。
 */
export function createAuthorizedRegionsLookup(
  pharmaTenantId: string,
): (providerName: string, variety: string) => string[] | undefined {
  const providerIdByName = new Map<string, string>()
  for (const rel of relationshipsOfPharma(pharmaTenantId)) {
    providerIdByName.set(tenantNameOf(rel.providerTenantId), rel.providerTenantId)
  }
  const linesCache = new Map<string, ReturnType<typeof authorizedVarietyLinesOfPharma>>()
  return (providerName, variety) => {
    const providerId = providerIdByName.get(providerName.trim())
    if (!providerId) return undefined
    let lines = linesCache.get(providerId)
    if (!lines) {
      lines = authorizedVarietyLinesOfPharma(providerId, pharmaTenantId)
      linesCache.set(providerId, lines)
    }
    const wanted = normalizeVarietyName(variety)
    const regions = new Set<string>()
    for (const line of lines) {
      if (normalizeVarietyName(line.varietyName) === wanted) line.regions.forEach((r) => regions.add(r))
    }
    return regions.size > 0 ? [...regions] : undefined
  }
}

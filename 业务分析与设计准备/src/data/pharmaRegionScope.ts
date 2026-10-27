/**
 * 药厂侧区域范围（2026-10-27 方向修订：**区域按成员配置，与部门无关**）。
 *
 * 三层职责：组织架构管人员属于哪个部门；**用户管理管每个人负责哪些区域**；角色管理管每个人能做什么。
 * - 成员区域 = TenantMembership.responsibleRegions（用户详情「编辑负责区域」维护，调岗不变）；
 *   含「全国」= ALL；未配置/空 = NONE（默认拒绝）；预置「企业管理员」固定 ALL，是唯一例外。
 * - 行区域解析只认可靠锚点：① 行自带 regions/region → ② taskId → 任务服务地区 → ③ 解析不出 = 不可见。
 *   **不做**「服务商×品种 → 授权区域」推断——那是服务商被授权的范围，不等于该条数据实际发生的区域；
 *   无锚点的数据对普通区域成员隐藏，管理员可见（页面可标「区域待确认」）。
 * - 匹配是任务级（D3 沿用）：行区域与成员区域有交集即可见；行区域含「全国」对任何有区域的成员可见（D5）。
 *   能看整单 ≠ 有金额/导出/审核权限——那些由角色决定。
 *
 * 与服务商侧 `regionNamesInScope` 的区别：那边「行未标区域 = 放行」，这里「解析不出 = 拒绝」。
 */
import { PROVINCES, REGION_NATIONWIDE } from "../constants"
import { normalizeRegionName } from "./cooperationModel"
import type { RoleAssignment } from "./permissions"

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
 * 含「全国」时按互斥规则只保留「全国」。
 */
export function canonicalRegions(input: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of input) {
    const c = canonicalRegionName(raw)
    if (c && !out.includes(c)) out.push(c)
  }
  return out.includes(REGION_NATIONWIDE) ? [REGION_NATIONWIDE] : out
}

/** 授权记录中是否含本租户有效的药厂企业管理员授权 */
export function hasPharmaAdminAssignment(assignments: readonly RoleAssignment[], tenantId: string): boolean {
  return assignments.some((a) => a.roleId === PHARMA_ADMIN_ROLE_ID && a.tenantId === tenantId && a.status === "active")
}

/** 成员区域范围：企业管理员固定全量（唯一例外）；否则 = 该成员自己配置的负责区域 */
export function pharmaRegionScopeOfMember(input: {
  /** TenantMembership.responsibleRegions 原值（未配置传 undefined） */
  regions: readonly string[] | undefined
  isPharmaAdmin: boolean
}): PharmaRegionScope {
  if (input.isPharmaAdmin) return REGION_SCOPE_ALL
  const regions = canonicalRegions(input.regions ?? [])
  if (regions.length === 0) return REGION_SCOPE_NONE
  if (regions.includes(REGION_NATIONWIDE)) return REGION_SCOPE_ALL
  return { mode: "REGIONS", regions }
}

export function regionScopeLabel(scope: PharmaRegionScope): string {
  if (scope.mode === "ALL") return REGION_NATIONWIDE
  if (scope.mode === "NONE") return "未配置"
  return scope.regions.join("、")
}

/**
 * 行区域 ∩ 成员区域（任务级：命中任一省即可见；「全国」语义见上）。
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

/** 业务行的区域解析输入（各页按自身数据结构映射；字段越具体优先级越高） */
export interface PharmaRegionRow {
  /** 行自带的多值区域（任务 regions、预算 regions、工作台任务 regions） */
  regions?: readonly string[]
  /** 行自带的单值区域（服务项目 / 结算明细行 region） */
  region?: string
  /** 所属任务（拜访 / 验收材料包 / 结算单经任务取区域——唯一可靠的无自有区域锚点） */
  taskId?: string
  /**
   * 以下字段**当前不参与区域解析**（2026-10-27 方向修订）：服务商被授权的省份 ≠ 该条数据
   * 实际发生的区域，按授权链推断属「乱推断」。保留字段形状供页面映射与后续逐项接入
   * （阶段三按数据归属逐页核查后，可靠锚点另行补充）。
   */
  provider?: string
  variety?: string
  varieties?: readonly string[]
}

export interface PharmaRegionResolverContext {
  /** taskId → 任务服务地区（页面自备任务数据；缺省时跳过 ② 步） */
  taskRegionsOf?: (taskId: string) => readonly string[] | undefined
}

/**
 * 行区域解析：① 行自带 regions/region → ② taskId → 任务服务地区 → ③ null。
 * 返回 null 表示解析不出（药厂侧默认拒绝，管理员例外可见）。
 */
export function resolveRowRegions(row: PharmaRegionRow, ctx: PharmaRegionResolverContext): string[] | null {
  if (row.regions && row.regions.length > 0) return [...row.regions]
  if (row.region && row.region.trim()) return [row.region]
  if (row.taskId && ctx.taskRegionsOf) {
    const fromTask = ctx.taskRegionsOf(row.taskId)
    if (fromTask && fromTask.length > 0) return [...fromTask]
  }
  return null
}

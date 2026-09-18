/**
 * 租户套餐事实源（2026-09-18 移植 RuoYi-Vue-Plus 租户套餐模型）。
 *
 * 套餐 = 一组菜单（页面级 pageId）的集合：软件服务方在「租户套餐管理」页新建/
 * 编辑套餐并勾选关联菜单，租户绑定套餐后其用户可见菜单 = 角色权限 ∩ 套餐菜单
 * （过滤在 PermissionContext.visiblePages 统一落地，换绑/编辑即时生效，无同步动作）。
 *
 * 统一套餐池（不区分租户类型）：菜单树按药厂/服务商工作空间分组展示，同一页面
 * 两边各绑菜单项时共用同一 pageId。租户侧兼容口径：TenantRecord 未写 packageId
 * 的存量数据一律回落默认套餐，行为不变（不升存储版本）。
 *
 * 数据为 mock（localStorage 演示），生产由服务端与数据库承载；菜单树结构不在
 * 本层维护（页面从 menus.ts 种子实时构建），本层只存扁平 pageId 集合。
 */
import type { PageId } from "../types";
import { seedMenuItems } from "./menus";
import { getTenantRegistrySnapshot } from "./tenantRegistry";

export interface TenantPackage {
  id: string
  name: string
  /** 关联菜单（页面级 pageId；含 dashboard=业务工作台等租户侧页面） */
  menuIds: PageId[]
  remark?: string
  status: "enabled" | "disabled"
  /** 默认套餐：新建租户/换绑的缺省选项，不可删除（名称与菜单可编辑） */
  isDefault?: boolean
  createdAt: string
  createdBy: string
}

export interface SaveTenantPackageInput {
  id?: string
  name: string
  menuIds: PageId[]
  remark?: string
  actor: string
}

export interface PackageOpResult {
  ok: boolean
  error?: string
  pack?: TenantPackage
}

interface TenantPackageState {
  version: 1
  packages: TenantPackage[]
}

const STORAGE_KEY = "baiyee-tenant-packages-v1"

function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 租户侧全部可选页面（药厂/服务商/共享工作空间的 page 型菜单项，平台侧不含） */
function tenantFacinigPageIds(): PageId[] {
  const ids = new Set<PageId>()
  for (const m of seedMenuItems()) {
    if (m.type !== "page" || !m.pageId) continue
    if (m.workspace === "platform") continue
    ids.add(m.pageId as PageId)
  }
  return [...ids]
}

/** 精简演示套餐在默认全量基础上裁掉的页面（演示套餐差异用） */
const LITE_EXCLUDED: PageId[] = [
  "hospital-visits",
  "biz-detail-export",
  "talk-script-variety",
  "baiyee-ai",
  "scenario-center",
]

function buildSeedState(): TenantPackageState {
  const all = tenantFacinigPageIds()
  return {
    version: 1,
    packages: [
      {
        id: "pkg-default",
        name: "默认套餐",
        menuIds: all,
        remark: "含全部租户侧功能菜单；存量租户未显式绑定套餐时一律按本套餐开通。",
        status: "enabled",
        isDefault: true,
        createdAt: "2026-09-18 09:00",
        createdBy: "贝医系统管理员",
      },
      {
        id: "pkg-lite",
        name: "精简套餐（演示）",
        menuIds: all.filter((id) => !LITE_EXCLUDED.includes(id)),
        remark: "演示用：不含医院拜访、业务明细导出、品种话术维护、baiyee-AI 与业务搭建中心。",
        status: "enabled",
        createdAt: "2026-09-18 09:00",
        createdBy: "贝医系统管理员",
      },
    ],
  }
}

let state: TenantPackageState = loadState()
const listeners = new Set<() => void>()

function loadState(): TenantPackageState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildSeedState()
    const parsed = JSON.parse(raw) as TenantPackageState
    if (parsed?.version !== 1 || !Array.isArray(parsed.packages)) return buildSeedState()
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

function commit(next: TenantPackageState): void {
  state = next
  persist()
  listeners.forEach((cb) => cb())
}

/** 重置演示数据（仅套餐页「恢复演示数据（仅演示）」使用） */
export function resetTenantPackages(): void {
  commit(buildSeedState())
}

export function subscribeTenantPackages(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getTenantPackagesSnapshot(): TenantPackageState {
  return state
}

export function listTenantPackages(): TenantPackage[] {
  return [...state.packages]
}

export function getTenantPackageById(id: string): TenantPackage | undefined {
  return state.packages.find((p) => p.id === id)
}

/** 新建/编辑套餐（名称唯一校验；编辑时 id 必须存在；默认套餐标记不随编辑丢失） */
export function saveTenantPackage(input: SaveTenantPackageInput): PackageOpResult {
  const name = input.name.trim()
  if (!name) return { ok: false, error: "请输入套餐名称" }
  if (!input.menuIds.length) return { ok: false, error: "请至少勾选一个关联菜单" }
  if (state.packages.some((p) => p.name === name && p.id !== input.id)) {
    return { ok: false, error: "套餐名称已存在，请换一个名称" }
  }
  const menuIds = [...new Set(input.menuIds)]
  if (input.id) {
    const existing = state.packages.find((p) => p.id === input.id)
    if (!existing) return { ok: false, error: "套餐不存在或已被删除，请刷新后重试" }
    const next: TenantPackage = {
      ...existing,
      name,
      menuIds,
      remark: input.remark?.trim() || undefined,
    }
    commit({ ...state, packages: state.packages.map((p) => (p.id === input.id ? next : p)) })
    return { ok: true, pack: next }
  }
  const pack: TenantPackage = {
    id: `pkg-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name,
    menuIds,
    remark: input.remark?.trim() || undefined,
    status: "enabled",
    createdAt: nowStamp(),
    createdBy: input.actor,
  }
  commit({ ...state, packages: [pack, ...state.packages] })
  return { ok: true, pack }
}

/** 停用后的套餐不可再被新建租户/换绑选中；已绑租户不受影响（仍按其菜单集生效） */
export function setTenantPackageStatus(id: string, status: "enabled" | "disabled"): PackageOpResult {
  const existing = state.packages.find((p) => p.id === id)
  if (!existing) return { ok: false, error: "套餐不存在或已被删除" }
  if (existing.status === status) return { ok: false, error: "套餐已是该状态" }
  const next = { ...existing, status }
  commit({ ...state, packages: state.packages.map((p) => (p.id === id ? next : p)) })
  return { ok: true, pack: next }
}

/** 当前绑定该套餐的租户数（删除保护用；含待激活/正常/已暂停，不含已终止） */
export function boundTenantCount(id: string): number {
  return getTenantRegistrySnapshot().tenants.filter(
    (t) => t.status !== "terminated" && resolvePackageIdOf(t.packageId) === id,
  ).length
}

/** 删除保护：默认套餐与仍有租户绑定的套餐不可删 */
export function deleteTenantPackage(id: string): PackageOpResult {
  const existing = state.packages.find((p) => p.id === id)
  if (!existing) return { ok: false, error: "套餐不存在或已被删除" }
  if (existing.isDefault) return { ok: false, error: "默认套餐不可删除（存量租户按它回落开通）" }
  const bound = boundTenantCount(id)
  if (bound > 0) return { ok: false, error: `仍有 ${bound} 个租户绑定该套餐，请先换绑后再删除` }
  commit({ ...state, packages: state.packages.filter((p) => p.id !== id) })
  return { ok: true, pack: existing }
}

/** 套餐 id 归一：空/已删除的 packageId 一律回落默认套餐（存量兼容口径） */
function resolvePackageIdOf(packageId: string | undefined): string {
  if (packageId && state.packages.some((p) => p.id === packageId)) return packageId
  const fallback = state.packages.find((p) => p.isDefault)
  return fallback?.id ?? state.packages[0]?.id ?? ""
}

/** 按租户定位（兼容 TenantRecord.id 与企业组织根 id 两种口径——principal.tenantId 是后者） */
function tenantLookup(tenantId: string) {
  const snap = getTenantRegistrySnapshot()
  return snap.tenants.find((t) => t.id === tenantId || t.enterpriseOrgId === tenantId)
}

/**
 * 租户 → 套餐菜单集（visiblePages 过滤消费）：
 * 返回 null 表示无套餐约束（租户不在册的种子登录身份/套餐池为空的兜底，正常不会发生）。
 * 已停用套餐仍按其菜单集生效（停用只影响「能否再被选中」，不影响存量绑定）。
 */
export function tenantPackageMenuIds(tenantId: string): Set<PageId> | null {
  const tenant = tenantLookup(tenantId)
  if (!tenant) return null
  const pack = state.packages.find((p) => p.id === resolvePackageIdOf(tenant.packageId))
  if (!pack) return null
  return new Set(pack.menuIds)
}

/** 租户 → 套餐（换绑弹窗/详情展示消费；同样走默认回落） */
export function packageOfTenant(tenantId: string): TenantPackage | undefined {
  const tenant = tenantLookup(tenantId)
  if (!tenant) return undefined
  return state.packages.find((p) => p.id === resolvePackageIdOf(tenant.packageId))
}

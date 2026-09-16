/**
 * 会话业务范围统一入口（服务商业务页默认拒绝口径，2026-09-16 P0-C）。
 *
 * 所有服务商业务页（任务/结算/拜访/绩效/预算/导出）一律从本 hook 取过滤口径：
 *   当前服务商 + 当前服务药厂 + 已授权品种（品种授权收窄）+ 品种派生区域。
 * - 依赖合作数据修订号（useCooperationRevision）：暂停合作/撤销授权/跨 tab 同步
 *   会立即重算范围——授权失效对「已登录会话」即时生效；
 * - 服务商会话没有有效业务范围（未选药厂、授权被收回、角色范围失效）时
 *   denied=true，业务页必须渲染无权限空态，不得回退展示未过滤数据；
 * - 药厂会话按本厂过滤（一次会话只操作一家药厂数据）；
 * - 平台会话不经业务页渲染，本 hook 对其返回全通过（页面不对其开放）。
 */
import { useMemo, useSyncExternalStore } from "react";
import {
  cooperationRevision,
  normalizeRegionName,
  servingScopeOfPrincipal,
  subscribeCooperation,
  varietyInScope,
  type ServingBizScope,
} from "../data/cooperationModel";
import { usePermission } from "../context/PermissionContext";
import type { TenantPrincipal } from "../auth/authTypes";

/** 合作数据修订号：cooperationModel 每次 commit/重置/跨 tab 同步自增 */
export function useCooperationRevision(): number {
  return useSyncExternalStore(subscribeCooperation, cooperationRevision, cooperationRevision);
}

/** 业务行的范围判定输入（各页按自身数据结构映射到该形状） */
export interface ServingBizRow {
  /** 行所属服务商企业名 */
  provider: string;
  /** 行归属药厂（持有人）名称；任务/结算经关联任务取值 */
  holderPharma?: string;
  /** 行品种（单值，业务数据常用商品名含规格） */
  variety?: string;
  /** 行品种（多值，如任务承载品种清单） */
  varieties?: string[];
  /** 行区域（单值） */
  region?: string;
  /** 行区域（多值） */
  regions?: string[];
}

/** 区域匹配：范围为空=不限；行未标注区域=不因区域排除；「全国」双向直通 */
export function regionNamesInScope(rowRegions: string[] | undefined, scopeRegions: string[]): boolean {
  if (scopeRegions.length === 0) return true;
  if (!rowRegions || rowRegions.length === 0) return true;
  return rowRegions.some(
    (r) => r === "全国" || scopeRegions.some((s) => s === "全国" || normalizeRegionName(s) === normalizeRegionName(r)),
  );
}

export interface ServingScopeView {
  /** 服务商会话且无有效业务范围 → 默认拒绝 */
  denied: boolean;
  /** 服务商有效业务范围（denied 时为 null；非服务商会话也为 null） */
  scope: ServingBizScope | null;
  /** 服务商会话（TENANT · provider） */
  isProviderSession: boolean;
  /** 药厂会话（TENANT · pharma） */
  isPharmaSession: boolean;
  /** 服务商四要素匹配（provider + 当前药厂 + 品种 + 派生区域）；denied 时恒 false */
  matchesProviderRow: (row: ServingBizRow) => boolean;
  /** 药厂会话本厂匹配（行归属本药厂才可见；未标注归属的行不可见） */
  matchesPharmaRow: (row: { holderPharma?: string }) => boolean;
}

export function useServingScope(): ServingScopeView {
  const { principal, assignments } = usePermission();
  const revision = useCooperationRevision();

  return useMemo<ServingScopeView>(() => {
    const tenant = principal.realm === "TENANT" ? (principal as TenantPrincipal) : null;
    const isProviderSession = tenant?.tenantKind === "provider";
    const isPharmaSession = tenant?.tenantKind === "pharma";
    const scope = isProviderSession ? servingScopeOfPrincipal(tenant, assignments) : null;
    const denied = isProviderSession && !scope;

    const matchesProviderRow = (row: ServingBizRow): boolean => {
      if (denied) return false;
      if (!tenant || !scope) return false;
      if (row.provider !== tenant.tenantName) return false;
      // 行必须归属当前服务药厂（未标注归属的行不可见——默认拒绝，不放宽）
      if (row.holderPharma !== scope.pharmaName) return false;
      const varieties = row.varieties ?? (row.variety !== undefined ? [row.variety] : undefined);
      if (varieties && varieties.length > 0 && !varieties.some((v) => varietyInScope(v, scope.varietyNames))) {
        return false;
      }
      const regions = row.regions ?? (row.region !== undefined ? [row.region] : undefined);
      return regionNamesInScope(regions, scope.regions);
    };

    const matchesPharmaRow = (row: { holderPharma?: string }): boolean => {
      if (!isPharmaSession || !tenant) return false;
      return row.holderPharma === tenant.tenantName;
    };

    return {
      denied,
      scope,
      isProviderSession,
      isPharmaSession,
      matchesProviderRow,
      matchesPharmaRow,
    };
    // revision：合作数据变化（暂停/撤销/跨tab）时强制重算范围
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal, assignments, revision]);
}

/** 服务商业务页统一无权限空态文案（默认拒绝口径） */
export const NO_BIZ_SCOPE_TITLE = "当前无可访问的业务数据";
export function noBizScopeDescription(pharmaName?: string): string {
  return pharmaName
    ? `与「${pharmaName}」的合作、产品授权或角色范围已失效，请重新选择服务药厂或联系企业管理员。`
    : "当前合作、产品授权或角色范围已失效，请重新选择服务药厂或联系企业管理员。";
}

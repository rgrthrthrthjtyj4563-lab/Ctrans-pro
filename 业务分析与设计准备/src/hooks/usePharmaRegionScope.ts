/**
 * 药厂侧会话区域范围统一入口（2026-10-27 方向修订：**区域按成员配置**；与服务商侧 useServingScope 同构、语义反转）。
 *
 * 药厂业务页（任务 / 结算 / 预算 / 导出 / 工作台 / 验收 / 拜访 / 绩效）一律从本 hook 取区域口径：
 *   成员区域 = 该成员自己配置的负责区域（TenantMembership.responsibleRegions，用户详情维护，调岗不变）；
 *   预置企业管理员固定 ALL；未配置 = NONE → denied，页面必须渲染空态，不得回退展示未过滤数据。
 * - 行区域只认可靠锚点（行自带 → taskId → 任务地区），解析不出 = 不可见（默认拒绝）；
 *   不做服务商×品种授权链推断（授权范围 ≠ 数据实际发生区域）。
 * - 匹配是任务级（D3）：行区域与成员区域有交集即整行可见；能看整单 ≠ 有金额/导出/审核权限（角色决定）。
 * - 服务商 / 软件服务方会话：本 hook 不过滤（matchesRow 恒 true），服务商侧仍走 useServingScope；
 *   两个 hook 在页面里是「叠加」而非替代。
 */
import { useMemo, useSyncExternalStore } from "react";
import { usePermission } from "../context/PermissionContext";
import type { TenantPrincipal } from "../auth/authTypes";
import { membershipOfUserInTenant, membershipRevision, subscribeTenantMemberships } from "../data/cooperationModel";
import {
  REGION_SCOPE_ALL,
  hasPharmaAdminAssignment,
  pharmaRegionScopeOfMember,
  regionScopeLabel,
  regionsIntersect,
  resolveRowRegions,
  type PharmaRegionRow,
  type PharmaRegionScope,
} from "../data/pharmaRegionScope";

export type { PharmaRegionRow, PharmaRegionScope } from "../data/pharmaRegionScope";

export interface PharmaRegionScopeOptions {
  /**
   * 页面自备任务数据：taskId → 任务服务地区。拜访 / 验收材料包 / 结算单等经任务取区域的
   * 页面必传；传稳定引用（useCallback / useMemo），否则每次渲染都会重建匹配器。
   */
  taskRegionsOf?: (taskId: string) => readonly string[] | undefined;
}

export interface PharmaRegionScopeView {
  /** 药厂会话（TENANT · pharma）；其它会话本 hook 不过滤 */
  isPharmaSession: boolean;
  /** 成员区域范围；非药厂会话固定 ALL */
  scope: PharmaRegionScope;
  /** 药厂会话且 scope.mode === "NONE" → 页面渲染无权限空态 */
  denied: boolean;
  /** 展示文案：全国 / 陕西、宁夏 / 未配置 */
  label: string;
  /** 行是否可见（非药厂会话恒 true；药厂 ALL 恒 true；NONE 恒 false；REGIONS 按 D2/D3） */
  matchesRow: (row: PharmaRegionRow) => boolean;
  /** 行区域解析结果（分组 / 汇总 / 导出复用；解析不出返回 null） */
  regionsOfRow: (row: PharmaRegionRow) => string[] | null;
  /** 单个区域名是否在成员区域内（D3 预留明细级裁剪扩展点） */
  matchesRegion: (region: string) => boolean;
}

const PASS_THROUGH: PharmaRegionScopeView = {
  isPharmaSession: false,
  scope: REGION_SCOPE_ALL,
  denied: false,
  label: regionScopeLabel(REGION_SCOPE_ALL),
  matchesRow: () => true,
  regionsOfRow: () => null,
  matchesRegion: () => true,
};

export function usePharmaRegionScope(opts: PharmaRegionScopeOptions = {}): PharmaRegionScopeView {
  const { principal, assignments } = usePermission();
  const memberRevision = useSyncExternalStore(subscribeTenantMemberships, membershipRevision, membershipRevision);
  const taskRegionsOf = opts.taskRegionsOf;

  return useMemo<PharmaRegionScopeView>(() => {
    const tenant = principal.realm === "TENANT" ? (principal as TenantPrincipal) : null;
    if (!tenant || tenant.tenantKind !== "pharma") return PASS_THROUGH;

    // 区域按成员配置：membershipRevision 订阅保证「编辑负责区域」对已登录会话即时生效
    const membership = membershipOfUserInTenant(tenant.userId, tenant.tenantId);
    const isPharmaAdmin = hasPharmaAdminAssignment(
      assignments.filter((a) => a.userId === tenant.userId),
      tenant.tenantId,
    );
    const scope = pharmaRegionScopeOfMember({
      regions: membership?.responsibleRegions,
      isPharmaAdmin,
    });
    const ctx = { taskRegionsOf };

    const regionsOfRow = (row: PharmaRegionRow) => resolveRowRegions(row, ctx);
    const matchesRow = (row: PharmaRegionRow): boolean => {
      if (scope.mode === "NONE") return false;
      if (scope.mode === "ALL") return true;
      const rowRegions = regionsOfRow(row);
      return rowRegions ? regionsIntersect(scope, rowRegions) : false;
    };

    return {
      isPharmaSession: true,
      scope,
      denied: scope.mode === "NONE",
      label: regionScopeLabel(scope),
      matchesRow,
      regionsOfRow,
      matchesRegion: (region) => regionsIntersect(scope, [region]),
    };
    // memberRevision：编辑负责区域 / 调岗后即时重算（区域源是成员身份，与组织树无关）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal, assignments, taskRegionsOf, memberRevision]);
}

/** 药厂业务页统一无区域空态文案（默认拒绝口径；说明原因与下一步，见 UI_RULES §5） */
export const NO_REGION_SCOPE_TITLE = "当前无可查看的区域业务数据";
export const NO_REGION_SCOPE_DESCRIPTION =
  "您所在部门尚未配置管理区域，或您尚未分配到部门。请联系企业管理员在「企业管理 → 组织架构」为部门配置管理区域后再试。";

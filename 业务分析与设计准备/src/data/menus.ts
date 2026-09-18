/**
 * 菜单事实源（多租户权限架构重构版）。
 *
 * 三棵工作空间菜单树（软件服务方 / 药厂 / 服务商）互不串台：菜单项以 workspace 标注
 * 归属工作空间；软件服务方菜单不出现在药厂/服务商后台，反之亦然。可见性判定为
 *   workspace 命中当前身份权限域 ∧ 角色功能权限（pagePerms 含该页 view）
 * 不再依赖旧「三类视角」或角色名兼容逻辑（App 统一计算）。
 */
import {
  Building2,
  LayoutDashboard,
  Sparkles,
  ClipboardList,
  FileText,
  Award,
  Users,
  UserCheck,
  Database,
  Table2,
  Shield,
  Folder,
  BarChart3,
  MessageSquare,
  Blocks,
  Handshake,
  type LucideIcon,
} from 'lucide-react';
import type { MenuItem } from '../types';

/** 菜单项归属工作空间：软件服务方/药厂/服务商/全共享 */
export type MenuWorkspace = 'platform' | 'pharma' | 'provider' | 'any';

export const MENU_ICONS: Record<string, LucideIcon> = {
  'building-2': Building2,
  'layout-dashboard': LayoutDashboard,
  sparkles: Sparkles,
  'clipboard-list': ClipboardList,
  'file-text': FileText,
  award: Award,
  users: Users,
  'user-check': UserCheck,
  database: Database,
  'table-2': Table2,
  shield: Shield,
  folder: Folder,
  'bar-chart-3': BarChart3,
  'message-square': MessageSquare,
  blocks: Blocks,
  handshake: Handshake,
};

/** 菜单种子项（扩展 workspace：驱动三工作空间过滤） */
export type MenuSeedItem = MenuItem & { workspace: MenuWorkspace };

const STAMP = '2026-09-15 10:00';
const ACTOR = '贝医系统管理员';

function item(
  partial: Omit<MenuSeedItem, 'updatedAt' | 'updatedBy' | 'enabled'> & { enabled?: boolean },
): MenuSeedItem {
  return {
    enabled: true,
    updatedAt: STAMP,
    updatedBy: ACTOR,
    ...partial,
  };
}

const SEED_MENU_ITEMS: MenuSeedItem[] = [
  // ── 系统管理后台（固定五项：租户管理 / 租户套餐管理 / 菜单管理 / 合作关系监管 / 系统审计日志）
  // 2026-09-18 系统工作台移除（暂无实际意义）；同批新增租户套餐管理（移植 RuoYi 套餐模型）
  item({ id: 'menu-tenant-management', name: '租户管理', type: 'page', parentId: null, pageId: 'tenant-management', section: '', iconKey: 'building-2', sort: 1, workspace: 'platform' }),
  item({ id: 'menu-tenant-package', name: '租户套餐管理', type: 'page', parentId: null, pageId: 'tenant-package', section: '', iconKey: 'award', sort: 2, workspace: 'platform' }),
  item({ id: 'menu-menus-sys', name: '菜单管理', type: 'page', parentId: null, pageId: 'menus', section: '', iconKey: 'shield', sort: 3, workspace: 'platform' }),
  item({ id: 'menu-cooperation-supervision', name: '合作关系监管', type: 'page', parentId: null, pageId: 'cooperation-supervision', section: '', iconKey: 'handshake', sort: 4, workspace: 'platform' }),
  item({ id: 'menu-platform-audit', name: '系统审计日志', type: 'page', parentId: null, pageId: 'platform-audit', section: '', iconKey: 'file-text', sort: 5, workspace: 'platform' }),

  // ── 药厂 / 服务商共享：业务工作台 ──────────────────────────────────────────
  // 业务工作台分属两个租户工作空间（软件服务方侧已无工作台首页，两树互不串台）
  item({ id: 'menu-dashboard', name: '业务工作台', type: 'page', parentId: null, pageId: 'dashboard', section: '', iconKey: 'layout-dashboard', sort: 1, badge: 8, workspace: 'pharma' }),
  item({ id: 'menu-p-dashboard', name: '业务工作台', type: 'page', parentId: null, pageId: 'dashboard', section: '', iconKey: 'layout-dashboard', sort: 1, workspace: 'provider' }),

  // ── 药厂业务管理 ───────────────────────────────────────────────────────────
  item({ id: 'group-biz', name: '业务管理', type: 'group', parentId: null, section: '', iconKey: 'clipboard-list', sort: 2, workspace: 'pharma' }),
  item({ id: 'menu-budget-plan', name: '预算计划', type: 'page', parentId: 'group-biz', pageId: 'budget-plan', sort: 1, workspace: 'pharma' }),
  item({ id: 'menu-task-dispatch', name: '任务执行', type: 'page', parentId: 'group-biz', pageId: 'task-dispatch', sort: 2, workspace: 'pharma' }),
  item({ id: 'menu-hospital-visits', name: '医院拜访', type: 'page', parentId: 'group-biz', pageId: 'hospital-visits', sort: 3, workspace: 'pharma' }),
  item({ id: 'menu-settlement', name: '结算明细', type: 'page', parentId: 'group-biz', pageId: 'settlement', sort: 4, workspace: 'pharma' }),
  item({ id: 'menu-biz-detail-export', name: '业务明细导出', type: 'page', parentId: 'group-biz', pageId: 'biz-detail-export', sort: 5, workspace: 'pharma' }),
  item({ id: 'menu-talk-script-variety', name: '品种话术维护', type: 'page', parentId: 'group-biz', pageId: 'talk-script-variety', sort: 6, workspace: 'pharma' }),
  item({ id: 'menu-baiyee-ai', name: 'baiyee-AI', type: 'page', parentId: 'group-biz', pageId: 'baiyee-ai', sort: 7, workspace: 'pharma' }),

  // ── 药厂：合作与授权 ───────────────────────────────────────────────────────
  item({ id: 'group-coop', name: '合作与授权', type: 'group', parentId: null, section: '', iconKey: 'handshake', sort: 3, workspace: 'pharma' }),
  item({ id: 'menu-vendor-access', name: '服务商准入', type: 'page', parentId: 'group-coop', pageId: 'vendor-access', sort: 1, workspace: 'pharma' }),
  item({ id: 'menu-pharma-cooperation', name: '合作关系', type: 'page', parentId: 'group-coop', pageId: 'pharma-cooperation', sort: 2, workspace: 'pharma' }),
  item({ id: 'menu-variety-auth', name: '业务授权', type: 'page', parentId: 'group-coop', pageId: 'variety-auth', sort: 3, workspace: 'pharma' }),
  item({ id: 'menu-rep-filing', name: '服务人员备案', type: 'page', parentId: 'group-coop', pageId: 'rep-filing', sort: 4, workspace: 'pharma' }),

  // ── 药厂：基础数据 ─────────────────────────────────────────────────────────
  item({ id: 'group-basedata', name: '基础数据', type: 'group', parentId: null, section: '', iconKey: 'database', sort: 4, workspace: 'pharma' }),
  item({ id: 'menu-varieties', name: '品种信息', type: 'page', parentId: 'group-basedata', pageId: 'varieties', sort: 1, workspace: 'pharma' }),
  item({ id: 'menu-doctors', name: '医生主数据', type: 'page', parentId: 'group-basedata', pageId: 'doctors', sort: 2, workspace: 'pharma' }),
  item({ id: 'menu-price-config', name: '价目表配置', type: 'page', parentId: 'group-basedata', pageId: 'price-config', sort: 3, workspace: 'pharma' }),
  item({ id: 'menu-execution-chain', name: '执行链路配置', type: 'page', parentId: 'group-basedata', pageId: 'execution-chain', sort: 4, workspace: 'pharma' }),
  item({ id: 'menu-business-switch', name: '药厂配置开关', type: 'page', parentId: 'group-basedata', pageId: 'business-switch', sort: 5, workspace: 'pharma' }),

  // ── 药厂：扩展能力 ─────────────────────────────────────────────────────────
  item({ id: 'menu-scenario-center', name: '业务搭建中心', type: 'page', parentId: null, pageId: 'scenario-center', section: '', iconKey: 'blocks', sort: 5, workspace: 'pharma' }),

  // ── 服务商业务管理 ─────────────────────────────────────────────────────────
  item({ id: 'group-provider-biz', name: '业务管理', type: 'group', parentId: null, section: '', iconKey: 'clipboard-list', sort: 2, workspace: 'provider' }),
  item({ id: 'menu-p-task', name: '任务执行', type: 'page', parentId: 'group-provider-biz', pageId: 'task-dispatch', sort: 1, workspace: 'provider' }),
  item({ id: 'menu-p-visits', name: '医院拜访', type: 'page', parentId: 'group-provider-biz', pageId: 'hospital-visits', sort: 2, workspace: 'provider' }),
  item({ id: 'menu-p-settlement', name: '结算明细', type: 'page', parentId: 'group-provider-biz', pageId: 'settlement', sort: 3, workspace: 'provider' }),
  item({ id: 'menu-performance-team', name: '团队工作质量评价', type: 'page', parentId: 'group-provider-biz', pageId: 'performance-team', sort: 4, workspace: 'provider' }),
  item({ id: 'menu-performance-specialist', name: '服务专员绩效', type: 'page', parentId: 'group-provider-biz', pageId: 'performance-specialist', sort: 5, workspace: 'provider' }),
  item({ id: 'menu-performance-settings', name: '绩效设置', type: 'page', parentId: 'group-provider-biz', pageId: 'performance-settings', sort: 6, workspace: 'provider' }),
  item({ id: 'menu-p-biz-export', name: '业务明细导出', type: 'page', parentId: 'group-provider-biz', pageId: 'biz-detail-export', sort: 7, workspace: 'provider' }),

  // ── 服务商：合作管理 ───────────────────────────────────────────────────────
  item({ id: 'group-provider-coop', name: '合作管理', type: 'group', parentId: null, section: '', iconKey: 'handshake', sort: 3, workspace: 'provider' }),
  item({ id: 'menu-p-vendor-access', name: '准入申请', type: 'page', parentId: 'group-provider-coop', pageId: 'vendor-access', sort: 1, workspace: 'provider' }),
  item({ id: 'menu-p-vendor-records', name: '提交记录', type: 'page', parentId: 'group-provider-coop', pageId: 'vendor-access-records', sort: 2, workspace: 'provider' }),
  item({ id: 'menu-provider-partners', name: '合作药厂与业务授权', type: 'page', parentId: 'group-provider-coop', pageId: 'provider-partners', sort: 3, workspace: 'provider' }),

  // ── 企业管理（药厂 + 服务商共有；服务商多一个工作组管理） ───────────────────
  item({ id: 'group-enterprise', name: '企业管理', type: 'group', parentId: null, section: '', iconKey: 'users', sort: 6, workspace: 'any' }),
  item({ id: 'menu-org-structure', name: '组织架构', type: 'page', parentId: 'group-enterprise', pageId: 'org-structure', sort: 1, workspace: 'any' }),
  item({ id: 'menu-user-manage', name: '用户管理', type: 'page', parentId: 'group-enterprise', pageId: 'user-manage', sort: 2, workspace: 'any' }),
  item({ id: 'menu-workgroup-manage', name: '工作组管理', type: 'page', parentId: 'group-enterprise', pageId: 'workgroup-manage', sort: 3, workspace: 'provider' }),
  item({ id: 'menu-roles', name: '角色与数据范围', type: 'page', parentId: 'group-enterprise', pageId: 'roles', sort: 4, workspace: 'any' }),
  item({ id: 'menu-audit-log', name: '企业审计日志', type: 'page', parentId: 'group-enterprise', pageId: 'audit-log', sort: 5, workspace: 'any' }),
];

export function seedMenuItems(): MenuSeedItem[] {
  return SEED_MENU_ITEMS.map((m) => ({ ...m }));
}

/** MenuItem 列表（供 MenuManage 等按 MenuItem 形状消费的旧接口） */
export function seedMenuItemsAsMenuItems(): MenuItem[] {
  return SEED_MENU_ITEMS.map((m) => {
    const { workspace: _workspace, ...rest } = m;
    return rest;
  });
}

/** 按当前身份工作空间过滤：软件服务方只见 platform/any；药厂只见 pharma/any；服务商只见 provider/any */
export function workspaceOfPrincipal(realm: 'PLATFORM' | 'TENANT', tenantKind: 'pharma' | 'provider' | null): MenuWorkspace[] {
  if (realm === 'PLATFORM') return ['platform', 'any'];
  return [tenantKind ?? 'any', 'any'];
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  disabled?: boolean;
  children?: { id: string; label: string; badge?: number; disabled?: boolean }[];
}

function toNavItem(item: MenuItem, all: MenuItem[]): NavItem {
  const icon = MENU_ICONS[item.iconKey ?? ''] ?? Folder;
  if (item.type === 'page') {
    return {
      id: item.pageId ?? item.id,
      label: item.name,
      icon,
      badge: item.badge,
      disabled: item.displayDisabled || undefined,
    };
  }
  const children = all
    .filter((c) => c.parentId === item.id)
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map((c) => ({
      id: c.pageId ?? c.id,
      label: c.name,
      badge: c.badge,
      disabled: c.displayDisabled || undefined,
    }));
  return {
    id: item.id,
    label: item.name,
    icon,
    disabled: item.displayDisabled || undefined,
    children,
  };
}

export function buildNavGroups(items: MenuItem[]): { label?: string; items: NavItem[] }[] {
  const tops = items
    .filter((i) => i.parentId === null)
    .slice()
    .sort((a, b) => a.sort - b.sort);

  const groups: { label?: string; items: NavItem[] }[] = [];
  let current: { label?: string; items: NavItem[] } | null = null;

  for (const top of tops) {
    const section = top.section ?? '';
    if (!current || (current.label ?? '') !== section) {
      current = section ? { label: section, items: [] } : { items: [] };
      groups.push(current);
    }
    current.items.push(toNavItem(top, items));
  }
  return groups;
}

// 保留 BarChart3/MessageSquare 的导入以免被 tree-shake 判定为未使用图标注册缺口（扩展位）
void BarChart3;
void MessageSquare;

import {
  LayoutDashboard,
  Sparkles,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Award,
  Users,
  Receipt,
  UserCheck,
  Database,
  Settings,
  Table2,
  Shield,
  Folder,
  BarChart3,
  MessageSquare,
  Blocks,
  type LucideIcon,
} from 'lucide-react';
import type { MenuItem } from '../types';

export const MENU_ICONS: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  sparkles: Sparkles,
  'circle-dollar-sign': CircleDollarSign,
  'clipboard-list': ClipboardList,
  'file-text': FileText,
  award: Award,
  users: Users,
  receipt: Receipt,
  'user-check': UserCheck,
  database: Database,
  settings: Settings,
  'table-2': Table2,
  shield: Shield,
  folder: Folder,
  'bar-chart-3': BarChart3,
  'message-square': MessageSquare,
  blocks: Blocks,
};

const STAMP = '2026-09-04 10:40';
const ACTOR = '李航';

function item(
  partial: Omit<MenuItem, 'updatedAt' | 'updatedBy' | 'enabled'> & { enabled?: boolean },
): MenuItem {
  return {
    enabled: true,
    updatedAt: STAMP,
    updatedBy: ACTOR,
    ...partial,
  };
}

/** 2026-09-04 按需求重排：三棵登录角色树的全集；结算明细/医生主数据/角色预览整体砍掉 */
/** 2026-09-04 服务商准入收敛双角色：服务商端独立菜单组；合规端更名「服务商准入审核」；药厂销售不参与 */
const SEED_MENU_ITEMS: MenuItem[] = [
  item({
    id: 'menu-dashboard',
    name: '工作台',
    type: 'page',
    parentId: null,
    pageId: 'dashboard',
    section: '',
    iconKey: 'layout-dashboard',
    sort: 1,
    badge: 8,
    hideForRoles: ['服务提供商'],
  }),
  item({
    id: 'menu-baiyee-ai',
    name: 'baiyee-AI',
    type: 'page',
    parentId: null,
    pageId: 'baiyee-ai',
    section: '',
    iconKey: 'sparkles',
    sort: 2,
  }),
  item({
    id: 'group-vendor-access',
    name: '服务商准入',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'shield',
    sort: 3,
    hideForRoles: ['药厂销售部门', '药厂合规部门'],
  }),
  item({
    id: 'menu-vendor-access-mine',
    name: '我的准入资料',
    type: 'page',
    parentId: 'group-vendor-access',
    pageId: 'vendor-access',
    sort: 1,
    hideForRoles: ['药厂销售部门', '药厂合规部门'],
  }),
  item({
    id: 'menu-vendor-access-records',
    name: '提交记录',
    type: 'page',
    parentId: 'group-vendor-access',
    pageId: 'vendor-access-records',
    sort: 2,
    hideForRoles: ['药厂销售部门', '药厂合规部门'],
  }),
  item({
    id: 'group-task',
    name: '任务管理',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'clipboard-list',
    sort: 4,
  }),
  item({
    id: 'menu-budget-plan',
    name: '预算计划',
    type: 'page',
    parentId: 'group-task',
    pageId: 'budget-plan',
    sort: 1,
  }),
  item({
    id: 'menu-task-dispatch',
    name: '任务执行',
    type: 'page',
    parentId: 'group-task',
    pageId: 'task-dispatch',
    sort: 2,
  }),
  item({
    id: 'group-bizdata',
    name: '业务数据',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'file-text',
    sort: 5,
  }),
  item({
    id: 'menu-hospital-visits',
    name: '医院拜访',
    type: 'page',
    parentId: 'group-bizdata',
    pageId: 'hospital-visits',
    sort: 1,
  }),
  item({
    id: 'group-variety',
    name: '品种管理',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'database',
    sort: 6,
  }),
  item({
    id: 'menu-varieties',
    name: '品种信息',
    type: 'page',
    parentId: 'group-variety',
    pageId: 'varieties',
    sort: 1,
  }),
  item({
    id: 'menu-variety-auth',
    name: '品种授权',
    type: 'page',
    parentId: 'group-variety',
    pageId: 'variety-auth',
    sort: 2,
    hideForRoles: ['服务提供商'],
  }),
  item({
    id: 'group-price',
    name: '价目管理',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'table-2',
    sort: 7,
  }),
  item({
    id: 'menu-price-config',
    name: '价目表配置',
    type: 'page',
    parentId: 'group-price',
    pageId: 'price-config',
    sort: 1,
  }),
  item({
    id: 'group-admin',
    name: '系统管理',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'shield',
    sort: 8,
  }),
  item({
    id: 'menu-menus-sys',
    name: '菜单管理',
    type: 'page',
    parentId: 'group-admin',
    pageId: 'menus',
    sort: 1,
  }),
  item({
    id: 'menu-audit-log',
    name: '操作日志',
    type: 'page',
    parentId: 'group-admin',
    pageId: 'audit-log',
    sort: 2,
    hideForRoles: ['药厂合规部门'],
  }),
  item({
    id: 'menu-execution-chain',
    name: '执行链路配置',
    type: 'page',
    parentId: 'group-admin',
    pageId: 'execution-chain',
    sort: 3,
  }),
  item({
    id: 'menu-business-switch',
    name: '药厂配置开关',
    type: 'page',
    parentId: 'group-admin',
    pageId: 'business-switch',
    sort: 4,
    hideForRoles: ['服务提供商'],
  }),
  item({
    id: 'group-perm',
    name: '权限管理',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'users',
    sort: 9,
  }),
  item({
    id: 'menu-roles',
    name: '角色管理',
    type: 'page',
    parentId: 'group-perm',
    pageId: 'roles',
    sort: 1,
  }),
  item({
    id: 'menu-menus-perm',
    name: '菜单管理',
    type: 'page',
    parentId: 'group-perm',
    pageId: 'menus',
    sort: 2,
  }),
  item({
    id: 'menu-departments',
    name: '用户与组织',
    type: 'page',
    parentId: 'group-perm',
    pageId: 'departments',
    sort: 3,
  }),
  item({
    id: 'group-compliance',
    name: '合规管理',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'user-check',
    sort: 10,
  }),
  item({
    id: 'menu-rep-filing',
    name: '医药代表备案管理',
    type: 'page',
    parentId: 'group-compliance',
    pageId: 'rep-filing',
    sort: 1,
    hideForRoles: ['服务提供商'],
  }),
  item({
    id: 'menu-vendor-access',
    name: '服务商准入审核',
    type: 'page',
    parentId: 'group-compliance',
    pageId: 'vendor-access',
    sort: 2,
    hideForRoles: ['服务提供商', '药厂销售部门'],
  }),
  item({
    id: 'group-performance',
    name: '绩效管理',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'award',
    sort: 11,
  }),
  item({
    id: 'menu-performance-team',
    name: '团队工作质量评价',
    type: 'page',
    parentId: 'group-performance',
    pageId: 'performance-team',
    sort: 1,
  }),
  item({
    id: 'menu-performance-specialist',
    name: '服务专员绩效',
    type: 'page',
    parentId: 'group-performance',
    pageId: 'performance-specialist',
    sort: 2,
  }),
  item({
    id: 'menu-performance-settings',
    name: '绩效设置',
    type: 'page',
    parentId: 'group-performance',
    pageId: 'performance-settings',
    sort: 3,
  }),
  item({
    id: 'group-stats',
    name: '统计管理',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'bar-chart-3',
    sort: 12,
  }),
  item({
    id: 'menu-biz-detail-export',
    name: '业务明细导出',
    type: 'page',
    parentId: 'group-stats',
    pageId: 'biz-detail-export',
    sort: 1,
    hideForRoles: ['服务提供商'],
  }),
  /** 2026-09-10 话术管理板块：药厂销售专属（AI 生成与积分在 baiyee-AI，两药厂角色可用） */
  item({
    id: 'group-talk-script',
    name: '话术管理',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'message-square',
    sort: 13,
    hideForRoles: ['服务提供商', '药厂合规部门'],
  }),
  item({
    id: 'menu-talk-script-variety',
    name: '品种话术维护',
    type: 'page',
    parentId: 'group-talk-script',
    pageId: 'talk-script-variety',
    sort: 1,
    hideForRoles: ['服务提供商', '药厂合规部门'],
  }),
  /** 2026-09-11 扩展能力板块：低代码业务搭建中心（药厂两侧 + 平台可见，服务商不参与搭建） */
  item({
    id: 'group-ext',
    name: '扩展能力',
    type: 'group',
    parentId: null,
    section: '',
    iconKey: 'blocks',
    sort: 14,
    hideForRoles: ['服务提供商'],
  }),
  item({
    id: 'menu-scenario-center',
    name: '业务搭建中心',
    type: 'page',
    parentId: 'group-ext',
    pageId: 'scenario-center',
    sort: 1,
    hideForRoles: ['服务提供商'],
  }),
];

export function seedMenuItems(): MenuItem[] {
  return SEED_MENU_ITEMS.map(m => ({ ...m }));
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
    .filter(c => c.parentId === item.id)
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map(c => ({
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
    .filter(i => i.parentId === null)
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

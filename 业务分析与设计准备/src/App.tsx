import { useState, useCallback, useEffect } from 'react';
import {
  LayoutDashboard, ClipboardList,
  Database, Settings, Shield,
  ChevronDown, ChevronRight, Bell, Search, LogOut,
  Building2, Archive,
  ChevronLeft, Users, CircleDollarSign, UserCheck,
  ShieldCheck, FileSearch,
  Sparkles,
} from 'lucide-react';
import { Dashboard } from './pages/Dashboard';
import { VisitManagement } from './pages/VisitManagement';
import { TaskExecution } from './pages/TaskExecution';
import { BudgetPlanPage } from './pages/BudgetPlan';
import { BudgetAnalysis } from './pages/BudgetAnalysis';
import { VarietyManage } from './pages/VarietyManage';
import { VarietyAuth } from './pages/VarietyAuth';
import { PriceConfig } from './pages/PriceConfig';
import { DoctorMaster } from './pages/DoctorMaster';
import { Settlement } from './pages/Settlement';
import { AuditLog } from './pages/AuditLog';
import { InspectionWorkbench } from './pages/InspectionWorkbench';
import { EvidenceChainReview } from './pages/EvidenceChainReview';
import { RepFilingManage } from './pages/RepFilingManage';
import { VendorAccessManage } from './pages/VendorAccessManage';
import { RoleManage } from './pages/RoleManage';
import { UserGrantManage } from './pages/UserGrantManage';
import { PermissionAudit } from './pages/PermissionAudit';
import { RolePreview } from './pages/RolePreview';
import { PreviewBanner } from './pages/permUi';
import { BaiyeeAI } from './pages/BaiyeeAI';
import { BrandLogo } from './components/Brand';
import { ToastContainer } from './components/Toast';
import type { ToastMessage } from './components/Toast';
import { getRoleDashboardData } from './data/mockData';
import { TaskDataProvider } from './context/TaskDataContext';
import { PermissionProvider, usePermission } from './context/PermissionContext';
import { RESOURCE_PAGES } from './data/permissions';
import type { NavFocus, NavigateFn, PageId, Role } from './types';

// ─── Nav structure ────────────────────────────────────────────────────────────
interface NavItem {
  id: PageId | string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  disabled?: boolean;
  children?: { id: PageId; label: string; badge?: number; disabled?: boolean }[];
}

const navGroups: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { id: 'dashboard', label: '工作台', icon: LayoutDashboard, badge: 8 },
      { id: 'baiyee-ai', label: 'baiyee-AI', icon: Sparkles },
    ],
  },
  {
    label: '业务管理',
    items: [
      { id: 'budget-plan', label: '预算计划', icon: CircleDollarSign },
      { id: 'task-dispatch', label: '任务执行', icon: ClipboardList },
    ],
  },
  {
    label: '合规管理',
    items: [
      { id: 'inspection', label: '随检工作台', icon: ShieldCheck },
      { id: 'evidence-chain', label: '证据链复审', icon: FileSearch },
    ],
  },
  {
    items: [
      {
        id: 'enterprise-user-group', label: '企业用户管理', icon: UserCheck,
        children: [
          { id: 'rep-filing', label: '医药代表备案管理' },
          { id: 'vendor-access', label: '服务商准入管理' },
        ],
      },
    ],
  },
  {
    label: '主数据',
    items: [
      {
        id: 'master-group', label: '主数据管理', icon: Database,
        children: [
          { id: 'doctors', label: '医生主数据' },
          { id: 'varieties', label: '品种管理' },
          { id: 'variety-auth', label: '品种授权' },
          { id: 'enterprise-users', label: '企业用户', disabled: true },
        ],
      },
    ],
  },
  {
    label: '配置 & 分析',
    items: [
      {
        id: 'config-group', label: '规则配置', icon: Settings,
        children: [
          { id: 'business-switch', label: '药厂业务开关', disabled: true },
          { id: 'price-config', label: '价目配置' },
        ],
      },
      {
        id: 'admin-group', label: '系统管理', icon: Shield,
        children: [
          { id: 'roles', label: '角色管理' },
          { id: 'user-grants', label: '用户授权' },
          { id: 'perm-audit', label: '权限审计' },
          { id: 'role-preview', label: '角色预览' },
          { id: 'departments', label: '机构部门', disabled: true },
          { id: 'audit-log', label: '操作日志' },
        ],
      },
    ],
  },
];

const pageLabels: Record<string, string> = {
  dashboard: '工作台',
  'hospital-visits': '医院拜访管理',
  'commercial-visits': '商业拜访管理',
  'pharmacy-visits': '药房拜访管理',
  meetings: '会议活动',
  surveys: '调研管理',
  'budget-plan': '预算计划',
  analytics: '预算执行分析',
  'task-dispatch': '任务执行',
  doctors: '医生主数据',
  varieties: '品种管理',
  'variety-auth': '品种授权',
  'enterprise-users': '企业用户',
  'rep-filing': '医药代表备案管理',
  'vendor-access': '服务商准入管理',
  settlement: '结算明细',
  inspection: '随检工作台',
  'evidence-chain': '证据链复审',
  'business-switch': '药厂业务开关',
  'price-config': '价目配置',
  roles: '角色管理',
  'user-grants': '用户授权',
  'perm-audit': '权限审计',
  'role-preview': '角色预览',
  departments: '机构部门',
  'audit-log': '操作日志',
  'baiyee-ai': 'baiyee-AI',
};

const pageSections: Record<string, string> = {
  'hospital-visits': '业务填报',
  'commercial-visits': '业务填报',
  'pharmacy-visits': '业务填报',
  meetings: '业务填报',
  surveys: '业务填报',
  'budget-plan': '业务管理',
  analytics: '业务管理',
  'task-dispatch': '业务管理',
  settlement: '绩效结算',
  inspection: '合规管理',
  'evidence-chain': '合规管理',
  doctors: '主数据管理',
  varieties: '主数据管理',
  'variety-auth': '主数据管理',
  'enterprise-users': '主数据管理',
  'rep-filing': '企业用户管理',
  'vendor-access': '企业用户管理',
  'business-switch': '规则配置',
  'price-config': '规则配置',
  roles: '系统管理',
  'user-grants': '系统管理',
  'perm-audit': '系统管理',
  'role-preview': '系统管理',
  departments: '系统管理',
  'audit-log': '系统管理',
};

// ─── Sidebar item ─────────────────────────────────────────────────────────────
function NavLeaf({
  id, label, active, badge, disabled, collapsed, onClick, icon: Icon,
}: {
  id: string; label: string; active: boolean; badge?: number;
  disabled?: boolean; collapsed: boolean; onClick: () => void;
  icon?: typeof LayoutDashboard;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: collapsed ? '8px' : '7px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: disabled ? '#374151' : active ? '#4ADE80' : '#D1D5DB',
        background: active ? 'rgba(74,222,128,0.10)' : 'none',
        border: 'none',
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 120ms ease',
        textAlign: 'left',
        position: 'relative',
        lineHeight: 1,
      }}
      onMouseEnter={e => { if (!disabled && !active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={e => { if (!disabled && !active) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
    >
      {active && !collapsed && (
        <span style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 3,
          height: 20,
          background: '#4ADE80',
          borderRadius: '0 2px 2px 0',
        }} />
      )}
      {Icon && <Icon size={16} style={{ color: disabled ? '#374151' : active ? '#4ADE80' : '#6B7280', flexShrink: 0 }} />}
      {!collapsed && <span style={{ marginLeft: active ? 4 : 0 }}>{label}</span>}
      {collapsed && !Icon && <span style={{ fontSize: 11, color: active ? '#4ADE80' : '#9CA3AF' }}>{label.slice(0, 2)}</span>}
      {badge !== undefined && !collapsed && (
        <span style={{
          marginLeft: 'auto',
          fontSize: 10,
          fontWeight: 700,
          minWidth: 18,
          height: 18,
          borderRadius: '9px',
          background: '#C73A3A',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 4px',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function NavGroup({
  item, currentPage, collapsed, expanded, onToggle, onNavigate,
}: {
  item: NavItem; currentPage: PageId; collapsed: boolean;
  expanded: boolean; onToggle: () => void; onNavigate: (id: PageId) => void;
}) {
  const Icon = item.icon;
  const childActive = item.children?.some(c => c.id === currentPage);

  if (!item.children) {
    return (
      <NavLeaf
        id={item.id}
        label={item.label}
        active={currentPage === item.id}
        badge={item.badge}
        disabled={item.disabled}
        collapsed={collapsed}
        icon={item.icon}
        onClick={() => onNavigate(item.id as PageId)}
      />
    );
  }

  return (
    <div>
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: collapsed ? '8px' : '8px 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          fontSize: 13,
          fontWeight: childActive ? 600 : 400,
          color: childActive ? '#E5E7EB' : '#9CA3AF',
          background: 'none',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'all 120ms ease',
          textAlign: 'left',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        <Icon size={16} style={{ color: childActive ? '#4ADE80' : '#6B7280', flexShrink: 0 }} />
        {!collapsed && (
          <>
            <span style={{ flex: 1 }}>{item.label}</span>
            <ChevronDown
              size={13}
              style={{
                color: '#4B5563',
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 150ms ease',
              }}
            />
          </>
        )}
      </button>

      {expanded && !collapsed && (
        <div style={{ marginLeft: 14, marginTop: 2, marginBottom: 2 }}>
          {item.children.map(child => (
            <NavLeaf
              key={child.id}
              id={child.id}
              label={child.label}
              active={currentPage === child.id}
              badge={child.badge}
              disabled={child.disabled}
              collapsed={false}
              onClick={() => onNavigate(child.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stub page ────────────────────────────────────────────────────────────────
function StubPage({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 12,
      color: '#9CA3AF',
    }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '12px',
        background: '#F3F4F6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Archive size={24} style={{ color: '#9CA3AF' }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>{title}</div>
      <div style={{ fontSize: 13, color: '#9CA3AF', maxWidth: 320, textAlign: 'center', lineHeight: 1.6 }}>
        {description || '此页面在首批交付范围内，即将上线。请联系产品经理了解上线时间。'}
      </div>
      <div style={{
        padding: '6px 14px',
        background: '#FEF3E2',
        border: '1px solid #FDE68A',
        borderRadius: '6px',
        fontSize: 12,
        color: '#C77A16',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
      }}>
        即将上线 · 功能开发中
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [currentRole, setCurrentRole] = useState<Role>('药厂销售部门');
  return (
    <TaskDataProvider>
      <PermissionProvider loginRole={currentRole}>
        <AppShell currentRole={currentRole} setCurrentRole={setCurrentRole} />
      </PermissionProvider>
    </TaskDataProvider>
  );
}

function AppShell({
  currentRole,
  setCurrentRole,
}: {
  currentRole: Role;
  setCurrentRole: (role: Role) => void;
}) {
  const { visiblePages, preview, effectiveRole, exitPreview, orgs, users, logAudit } = usePermission();
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['master-group', 'config-group', 'enterprise-user-group', 'admin-group'])
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [navFocus, setNavFocus] = useState<NavFocus>({});

  const addToast = useCallback((msg: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { ...msg, id }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const navigate: NavigateFn = (page, focus) => {
    const controlled = RESOURCE_PAGES.some(p => p.id === page);
    if (controlled && page !== 'dashboard' && !visiblePages.has(page)) {
      logAudit({
        module: pageLabels[page] || page,
        action: '越权访问',
        target: pageLabels[page] || page,
        resource: `${page}.view`,
        decision: '拒绝',
        reason: '当前角色无页面查看权限',
        result: '失败',
      });
      addToast({ type: 'error', title: '无权访问该页面', description: '已写入权限审计，无法通过菜单或快捷入口绕过。' });
      return;
    }
    const group = navGroups
      .flatMap(g => g.items)
      .find(item => item.children?.some(c => c.id === page) || item.id === page);
    if (group && group.children) {
      setExpandedGroups(prev => new Set([...prev, group.id]));
    }
    setNavFocus(focus ?? {});
    setCurrentPage(page);
  };

  function toggleGroup(id: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderPage() {
    switch (currentPage) {
      case 'dashboard':        return <Dashboard navigate={navigate} role={currentRole} addToast={addToast} />;
      case 'hospital-visits':  return <VisitManagement addToast={addToast} />;
      case 'commercial-visits': return <VisitManagement addToast={addToast} />;
      case 'pharmacy-visits':  return <VisitManagement addToast={addToast} />;
      case 'budget-plan':       return <BudgetPlanPage addToast={addToast} currentRole={currentRole} navigate={navigate} />;
      case 'analytics':         return <BudgetAnalysis currentRole={currentRole} navigate={navigate} focus={navFocus} />;
      case 'task-dispatch':    return <TaskExecution addToast={addToast} navigate={navigate} currentRole={currentRole} navFocus={navFocus} />;
      case 'doctors':          return <DoctorMaster />;
      case 'varieties':        return <VarietyManage addToast={addToast} currentRole={currentRole} />;
      case 'variety-auth':     return <VarietyAuth addToast={addToast} currentRole={currentRole} />;
      case 'price-config':     return <PriceConfig addToast={addToast} currentRole={currentRole} />;
      case 'settlement':       return <Settlement addToast={addToast} currentRole={currentRole} navigate={navigate} />;
      case 'inspection':       return <InspectionWorkbench addToast={addToast} />;
      case 'evidence-chain':   return <EvidenceChainReview addToast={addToast} />;
      case 'audit-log':        return <AuditLog />;
      case 'rep-filing':       return <RepFilingManage addToast={addToast} currentRole={currentRole} />;
      case 'vendor-access':    return <VendorAccessManage addToast={addToast} currentRole={currentRole} />;
      case 'roles':            return <RoleManage addToast={addToast} />;
      case 'user-grants':      return <UserGrantManage addToast={addToast} />;
      case 'perm-audit':       return <PermissionAudit />;
      case 'role-preview':     return <RolePreview addToast={addToast} navigate={navigate} />;
      case 'baiyee-ai':        return <BaiyeeAI navigate={navigate} />;
      default:                 return <StubPage title={pageLabels[currentPage] || currentPage} />;
    }
  }

  const SIDEBAR_W = sidebarCollapsed ? 60 : 240;
  const notificationCount = getRoleDashboardData(currentRole).unreadCount;

  const breadcrumb = [
    pageSections[currentPage] && pageSections[currentPage],
    pageLabels[currentPage],
  ].filter(Boolean);

  const roles: Role[] = ['药厂合规部门', '药厂销售部门', '服务提供商'];

  const visibleNavGroups = navGroups
    .map(group => ({
      ...group,
      items: group.items
        .map(item => {
          if (!item.children) {
            if (item.disabled) return item;
            return visiblePages.has(item.id) ? item : null;
          }
          const children = item.children.filter(c => c.disabled || visiblePages.has(c.id));
          if (!children.some(c => !c.disabled && visiblePages.has(c.id))) return null;
          return { ...item, children };
        })
        .filter((item): item is NavItem => item !== null),
    }))
    .filter(group => group.items.length > 0);

  useEffect(() => {
    const controlled = RESOURCE_PAGES.some(p => p.id === currentPage);
    if (controlled && currentPage !== 'dashboard' && !visiblePages.has(currentPage)) {
      setCurrentPage('dashboard');
    }
  }, [visiblePages, currentPage]);

  const previewOrgName = preview ? (orgs.find(o => o.id === preview.orgId)?.name ?? '') : '';
  const previewUserName = preview?.userId ? users.find(u => u.id === preview.userId)?.name : undefined;
  const isBaiyeeAI = currentPage === 'baiyee-ai';

  return (
    <div style={{ display: 'flex', height: '100%', background: isBaiyeeAI ? '#F7F7F5' : '#F5F7F8', overflow: 'hidden' }}>

      {/* Unmount original chrome on baiyee-AI. Do not hide with CSS: a later `display:'flex'` in this object previously overrode `none`. */}
      {!isBaiyeeAI && (
      <aside style={{
        display: 'flex',
        width: SIDEBAR_W,
        flexShrink: 0,
        background: '#111827',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 200ms cubic-bezier(0.25,0.46,0.45,0.94)',
        position: 'relative',
        zIndex: showUserMenu ? 60 : 10,
      }}>
        {/* Logo */}
        <div style={{
          padding: sidebarCollapsed ? '16px 8px' : '16px 16px',
          borderBottom: '1px solid #1F2937',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}>
          <BrandLogo collapsed={sidebarCollapsed} />
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          {visibleNavGroups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 4 }}>
              {group.label && !sidebarCollapsed && (
                <div style={{
                  padding: '10px 8px 4px',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#4B5563',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}>
                  {group.label}
                </div>
              )}
              {group.label && sidebarCollapsed && gi > 0 && (
                <div style={{ height: 1, background: '#1F2937', margin: '8px 4px' }} />
              )}
              {group.items.map(item => (
                <NavGroup
                  key={item.id}
                  item={item}
                  currentPage={currentPage}
                  collapsed={sidebarCollapsed}
                  expanded={expandedGroups.has(item.id)}
                  onToggle={() => toggleGroup(item.id)}
                  onNavigate={navigate}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed(v => !v)}
          style={{
            position: 'absolute',
            right: -12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#1F2937',
            border: '1px solid #374151',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9CA3AF',
            zIndex: 20,
          }}
          title={sidebarCollapsed ? '展开导航' : '折叠导航'}
        >
          {sidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Bottom: user */}
        <div style={{
          borderTop: '1px solid #1F2937',
          padding: sidebarCollapsed ? '12px 8px' : '12px 12px',
          flexShrink: 0,
        }}>
          {/* Sync status */}
          {!sidebarCollapsed && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 10,
              padding: '4px 8px',
              borderRadius: '4px',
              background: 'rgba(74,222,128,0.06)',
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#4ADE80',
                boxShadow: '0 0 6px rgba(74,222,128,0.6)',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 11, color: '#4B5563' }}>数据已同步 · 09:30</span>
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px',
                background: 'none',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
            >
              <div style={{
                width: 30,
                height: 30,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #176B5B, #2F6BCE)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}>
                运
              </div>
              {!sidebarCollapsed && (
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#E5E7EB', lineHeight: 1 }}>演示账号</div>
                  <div style={{ fontSize: 11, color: '#4ADE80', marginTop: 2 }}>{currentRole}</div>
                </div>
              )}
            </button>

            {showUserMenu && !sidebarCollapsed && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                background: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                padding: '8px',
                marginBottom: 4,
                boxShadow: '0 8px 24px rgba(0,0,0,0.30)',
                zIndex: 100,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px', marginBottom: 4 }}>
                  角色切换
                </div>
                {roles.map(role => (
                  <button
                    key={role}
                    onClick={() => {
                      if (preview) exitPreview();
                      setCurrentRole(role);
                      setShowUserMenu(false);
                      setCurrentPage('dashboard');
                      addToast({ type: 'info', title: `已切换角色：${role}`, description: '菜单与首页已按当前角色权限刷新。' });
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      padding: '7px 8px',
                      fontSize: 13,
                      color: currentRole === role ? '#4ADE80' : '#D1D5DB',
                      background: currentRole === role ? 'rgba(74,222,128,0.08)' : 'none',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      gap: 8,
                    }}
                    onMouseEnter={e => { if (currentRole !== role) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { if (currentRole !== role) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  >
                    <Users size={13} /> {role}
                  </button>
                ))}
                <div style={{ height: 1, background: '#374151', margin: '8px 0' }} />
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '7px 8px',
                    fontSize: 13,
                    color: '#C73A3A',
                    background: 'none',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    gap: 8,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(199,58,58,0.08)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >
                  <LogOut size={13} /> 退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {preview && !isBaiyeeAI && (
          <PreviewBanner
            roleName={effectiveRole.name}
            orgName={previewOrgName}
            userName={previewUserName}
            onExit={() => { exitPreview(); setCurrentPage('role-preview'); addToast({ type: 'info', title: '已退出预览模式' }); }}
          />
        )}

        {/* Top bar */}
        {!isBaiyeeAI && <header style={{
          height: 52,
          background: '#FFFFFF',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 12,
          flexShrink: 0,
          zIndex: 5,
        }}>
          {/* Breadcrumb */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            {breadcrumb.map((crumb, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <ChevronRight size={13} style={{ color: '#D1D5DB' }} />}
                <span style={{
                  fontSize: 13,
                  color: i === breadcrumb.length - 1 ? '#1F2937' : '#9CA3AF',
                  fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
                }}>
                  {crumb}
                </span>
              </span>
            ))}
            {breadcrumb.length === 0 && (
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>工作台</span>
            )}
          </nav>

          {/* Global search */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 32,
            padding: '0 12px',
            background: '#F9FAFB',
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
            width: 240,
            cursor: 'text',
          }}>
            <Search size={13} style={{ color: '#9CA3AF', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>全局搜索…</span>
            <span style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: '#D1D5DB',
              padding: '1px 5px',
              border: '1px solid #E5E7EB',
              borderRadius: '3px',
              fontFamily: "'JetBrains Mono', monospace",
            }}>⌘K</span>
          </div>

          {/* Notification */}
          <button
            aria-label={`消息中心，当前 ${notificationCount} 条待处理`}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '8px',
              background: 'none',
              border: '1px solid #E5E7EB',
              cursor: 'pointer',
              color: '#6B7280',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <Bell size={16} />
            <span style={{
              position: 'absolute',
              top: 3,
              right: 3,
              minWidth: 16,
              height: 16,
              borderRadius: '9999px',
              background: '#C73A3A',
              border: '1px solid #fff',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
            }}>
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          </button>

          {/* Enterprise + role */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 12px',
            height: 36,
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            cursor: 'pointer',
            background: '#F9FAFB',
          }}>
            <Building2 size={14} style={{ color: '#9CA3AF' }} />
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>百益健康科技</span>
            <span style={{
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: '9999px',
              background: '#E8F4F1',
              color: '#176B5B',
              fontWeight: 600,
            }}>
              {currentRole}
            </span>
          </div>
        </header>}

        {/* Page content */}
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: isBaiyeeAI ? 'hidden' : 'auto' }}>
          {renderPage()}
        </main>
      </div>

      {/* Toast notifications */}
      <ToastContainer messages={toasts} onDismiss={dismissToast} />

      {/* Close user menu on outside click */}
      {showUserMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </div>
  );
}

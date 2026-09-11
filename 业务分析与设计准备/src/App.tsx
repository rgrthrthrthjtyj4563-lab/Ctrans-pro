import { useState, useCallback, useEffect, useMemo, useRef, createContext, useContext, type ReactNode } from "react"
import {
  ChevronDown,
  ChevronRight,
  Bell,
  Search,
  LogOut,
  Building2,
  Archive,
  ChevronLeft,
  Smartphone,
  TabletSmartphone,
  Repeat,
  Presentation,
  type LucideIcon,
} from "lucide-react"
import { Dashboard } from "./pages/Dashboard"
import { VisitManagement } from "./pages/VisitManagement"
import { TaskExecution } from "./pages/TaskExecution"
import { BudgetPlanPage } from "./pages/BudgetPlan"
import { BudgetAnalysis } from "./pages/BudgetAnalysis"
import { VarietyManage } from "./pages/VarietyManage"
import { VarietyAuth } from "./pages/VarietyAuth"
import { PriceTableConfig } from "./pages/PriceTableConfig"
import { DoctorMaster } from "./pages/DoctorMaster"
import { Settlement } from "./pages/Settlement"
import { AuditLog } from "./pages/AuditLog"
import { RepFilingManage } from "./pages/RepFilingManage"
import { VendorAccessManage } from "./pages/VendorAccessManage"
import { RoleManage } from "./pages/RoleManage"
import { RolePreview } from "./pages/RolePreview"
import { UserOrgManage } from "./pages/UserOrgManage"
import { ExecutionChainConfig } from "./pages/ExecutionChainConfig"
import { MenuManage } from "./pages/MenuManage"
import { PerformanceTeamQuality } from "./pages/PerformanceTeamQuality"
import { PerformanceSpecialist } from "./pages/PerformanceSpecialist"
import { PerformanceSettings } from "./pages/PerformanceSettings"
import { PreviewBanner } from "./pages/permUi"
import { BaiyeeAI } from "./pages/BaiyeeAI"
import { RepAppointmentMobileDemo } from "./pages/RepAppointmentMobileDemo"
import { FullMobileDemo } from "./pages/FullMobileDemo"
import { PharmaConfigSwitch } from "./pages/PharmaConfigSwitch"
import { BizDetailExport } from "./pages/BizDetailExport"
import { BrandLogo } from "./components/Brand"
import { DisplaySettingsMenu } from "./components/DisplaySettingsMenu"
import { ToastContainer } from "./components/Toast"
import type { ToastMessage } from "./components/Toast"
import { getRoleDashboardData, getPlatformWorkbenchData } from "./data/mockData"
import { TaskDataProvider } from "./context/TaskDataContext"
import { DisplayPreferenceProvider } from "./context/DisplayPreferenceContext"
import { PermissionProvider, usePermission } from "./context/PermissionContext"
import { VendorAccessProvider } from "./context/VendorAccessContext"
import { RepFilingProvider } from "./context/RepFilingContext"
import { RESOURCE_PAGES } from "./data/permissions"
import { buildNavGroups, seedMenuItems, type NavItem } from "./data/menus"
import { AuthProvider, useAuth } from "./auth/AuthProvider"
import { LoginPage } from "./auth/LoginPage"
import { authGateway } from "./auth/mockGateway"
import { DEMO_ACCOUNT_HINTS, DEMO_PASSWORD, PLATFORM_ROLE_IDS } from "./auth/authProfiles"
import { IdentityConfirmGate } from "./auth/IdentityConfirmGate"
import { PharmaGate } from "./auth/PharmaGate"
import type { AuthPrincipal, ServingPharma } from "./auth/authTypes"
import type { MenuItem, NavFocus, NavigateFn, PageId } from "./types"

const pageLabels: Record<string, string> = {
  dashboard: "工作台",
  "hospital-visits": "医院拜访管理",
  "commercial-visits": "商业拜访管理",
  "pharmacy-visits": "药房拜访管理",
  meetings: "会议活动",
  surveys: "调研管理",
  "budget-plan": "预算计划",
  analytics: "预算执行分析",
  "task-dispatch": "任务执行",
  doctors: "医生主数据",
  varieties: "品种信息",
  "variety-auth": "品种授权",
  "rep-filing": "医药代表备案管理",
  "vendor-access": "服务商准入",
  "vendor-access-records": "提交记录",
  settlement: "结算明细",
  "business-switch": "药厂配置开关",
  "price-config": "价目表配置",
  roles: "角色管理",
  menus: "菜单管理",
  "role-preview": "角色预览",
  departments: "用户与组织",
  "audit-log": "操作日志",
  "execution-chain": "执行链路配置",
  "performance-team": "团队工作质量评价",
  "performance-specialist": "服务专员绩效",
  "performance-settings": "绩效设置",
  "biz-detail-export": "业务明细导出",
  "baiyee-ai": "baiyee-AI",
}

const pageSections: Record<string, string> = {
  "hospital-visits": "业务数据",
  "commercial-visits": "业务数据",
  "pharmacy-visits": "业务数据",
  meetings: "业务数据",
  surveys: "业务数据",
  "budget-plan": "任务管理",
  analytics: "任务管理",
  "task-dispatch": "任务管理",
  settlement: "绩效管理",
  "performance-team": "绩效管理",
  "performance-specialist": "绩效管理",
  "performance-settings": "绩效管理",
  doctors: "品种管理",
  varieties: "品种管理",
  "variety-auth": "品种管理",
  "rep-filing": "合规管理",
  "vendor-access": "合规管理",
  "vendor-access-records": "服务商准入",
  "business-switch": "系统管理",
  "price-config": "价目管理",
  roles: "权限管理",
  menus: "系统管理",
  "role-preview": "权限管理",
  departments: "权限管理",
  "audit-log": "系统管理",
  "execution-chain": "系统管理",
  "biz-detail-export": "统计管理",
}

// ─── Sidebar item ─────────────────────────────────────────────────────────────
function NavLeaf({
  id,
  label,
  active,
  badge,
  disabled,
  collapsed,
  onClick,
  icon: Icon,
}: {
  id: string
  label: string
  active: boolean
  badge?: number
  disabled?: boolean
  collapsed: boolean
  onClick: () => void
  icon?: LucideIcon
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={collapsed ? label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: collapsed ? "8px" : "7px 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        fontSize: "var(--fs-13)",
        fontWeight: active ? 600 : 400,
        color: disabled
          ? "#374151"
          : active
            ? "var(--color-sidebar-accent)"
            : "var(--color-sidebar-text)",
        background: active
          ? "color-mix(in srgb, var(--color-sidebar-accent) 10%, transparent)"
          : "none",
        border: "none",
        borderRadius: "6px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "all 120ms ease",
        textAlign: "left",
        position: "relative",
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active)
          (e.currentTarget as HTMLButtonElement).style.background =
            "rgba(255,255,255,0.06)"
      }}
      onMouseLeave={(e) => {
        if (!disabled && !active)
          (e.currentTarget as HTMLButtonElement).style.background = "none"
      }}
    >
      {active && !collapsed && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: 3,
            height: 20,
            background: "var(--color-sidebar-accent)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      )}
      {Icon && (
        <Icon
          size={16}
          style={{
            color: disabled
              ? "#374151"
              : active
                ? "var(--color-sidebar-accent)"
                : "#6B7280",
            flexShrink: 0,
          }}
        />
      )}
      {!collapsed && (
        <span style={{ marginLeft: active ? 4 : 0 }}>{label}</span>
      )}
      {collapsed && !Icon && (
        <span
          style={{
            fontSize: "var(--fs-11)",
            color: active ? "var(--color-sidebar-accent)" : "#9CA3AF",
          }}
        >
          {label.slice(0, 2)}
        </span>
      )}
      {badge !== undefined && !collapsed && (
        <span
          style={{
            marginLeft: "auto",
            fontSize: "var(--fs-10)",
            fontWeight: 700,
            minWidth: 18,
            height: 18,
            borderRadius: "9px",
            background: "#C73A3A",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

function NavGroup({
  item,
  currentPage,
  collapsed,
  expanded,
  onToggle,
  onNavigate,
}: {
  item: NavItem
  currentPage: PageId
  collapsed: boolean
  expanded: boolean
  onToggle: () => void
  onNavigate: (id: PageId) => void
}) {
  const Icon = item.icon
  const childActive = item.children?.some((c) => c.id === currentPage)

  // 窄条模式下目录的悬停浮层：fixed 定位，避开 aside 的 overflow 裁剪
  const leaveTimer = useRef<number | null>(null)
  const [flyoutAt, setFlyoutAt] = useState<{ x: number; y: number } | null>(
    null,
  )
  const openFlyout = (e: {
    currentTarget: HTMLButtonElement
  }) => {
    if (!collapsed || !item.children) return
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    const rect = e.currentTarget.getBoundingClientRect()
    const flyoutH = item.children.length * 34 + 44
    setFlyoutAt({
      x: rect.right + 6,
      y: Math.max(8, Math.min(rect.top - 4, window.innerHeight - flyoutH - 8)),
    })
  }
  const scheduleCloseFlyout = () => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => setFlyoutAt(null), 140)
  }

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
    )
  }

  return (
    <div>
      <button
        onClick={onToggle}
        title={collapsed ? item.label : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: collapsed ? "8px" : "8px 12px",
          justifyContent: collapsed ? "center" : "flex-start",
          fontSize: "var(--fs-13)",
          fontWeight: childActive ? 600 : 400,
          color: childActive ? "#E5E7EB" : "#9CA3AF",
          background: "none",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          transition: "all 120ms ease",
          textAlign: "left",
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background =
            "rgba(255,255,255,0.04)"
          openFlyout(e)
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = "none"
          scheduleCloseFlyout()
        }}
      >
        <Icon
          size={16}
          style={{
            color: childActive ? "var(--color-sidebar-accent)" : "#6B7280",
            flexShrink: 0,
          }}
        />
        {!collapsed && (
          <>
            <span style={{ flex: 1 }}>{item.label}</span>
            <ChevronDown
              size={13}
              style={{
                color: "#4B5563",
                transform: expanded ? "rotate(180deg)" : "none",
                transition: "transform 150ms ease",
              }}
            />
          </>
        )}
      </button>

      {expanded && !collapsed && (
        <div style={{ marginLeft: 14, marginTop: 2, marginBottom: 2 }}>
          {item.children.map((child) => (
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

      {collapsed && flyoutAt && item.children && (
        <div
          style={{
            position: "fixed",
            left: flyoutAt.x,
            top: flyoutAt.y,
            minWidth: 176,
            padding: "6px",
            background: "var(--color-sidebar-elev)",
            border: "1px solid var(--color-sidebar-line)",
            borderRadius: 8,
            boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
            zIndex: 300,
          }}
          onMouseEnter={() => {
            if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
          }}
          onMouseLeave={scheduleCloseFlyout}
        >
          <div
            style={{
              padding: "6px 8px 4px",
              fontSize: "var(--fs-11)",
              fontWeight: 700,
              color: "#9CA3AF",
              whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </div>
          {item.children.map((child) => (
            <NavLeaf
              key={child.id}
              id={child.id}
              label={child.label}
              active={currentPage === child.id}
              badge={child.badge}
              disabled={child.disabled}
              collapsed={false}
              onClick={() => {
                setFlyoutAt(null)
                onNavigate(child.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Stub page ────────────────────────────────────────────────────────────────
function StubPage({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 12,
        color: "#9CA3AF",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "12px",
          background: "#F3F4F6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Archive size={24} style={{ color: "#9CA3AF" }} />
      </div>
      <div
        style={{ fontSize: "var(--fs-16)", fontWeight: 600, color: "#374151" }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: "var(--fs-13)",
          color: "#9CA3AF",
          maxWidth: 320,
          textAlign: "center",
          lineHeight: 1.6,
        }}
      >
        {description ||
          "此页面在首批交付范围内，即将上线。请联系产品经理了解上线时间。"}
      </div>
      <div
        style={{
          padding: "6px 14px",
          background: "#FEF3E2",
          border: "1px solid #FDE68A",
          borderRadius: "6px",
          fontSize: "var(--fs-12)",
          color: "#C77A16",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 4,
        }}
      >
        即将上线 · 功能开发中
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
/**
 * 登录三步流：认证（密码/短信/扫码）→ 身份确认 → 服务专员选择服务药厂 → 业务壳。
 * Workbench 以 session.id 为 key —— 登出、换账号或切换服务药厂时整棵业务树
 * （含内存数据）重建；身份确认只置会话标记，不换发会话。
 */

/** 会话级 Toast：挂在 Workbench 外层，切换服务药厂重建业务树时提示不丢失 */
const SessionToastContext = createContext<(msg: Omit<ToastMessage, "id">) => void>(() => {})

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  )
}

function Root() {
  const { session, setSession, signOut } = useAuth()
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = `root-toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { ...msg, id }])
  }, [])
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  let content: ReactNode
  if (!session) {
    content = <LoginPage />
  } else if (!session.identityConfirmed) {
    content = (
      <IdentityConfirmGate
        session={session}
        onConfirm={() => setSession({ ...session, identityConfirmed: true })}
        onChangeAccount={() => void signOut()}
      />
    )
  } else if (session.pendingPharmas && session.pendingPharmas.length > 0) {
    content = (
      <PharmaGate
        principal={session.principal}
        pharmas={session.pendingPharmas}
        mode="first"
        onEnter={async (pharmaId) => {
          const result = await authGateway.chooseServingPharma({
            userId: session.principal.userId,
            pharmaId,
            method: session.method,
            qrSource: session.qrSource,
          })
          if (result.ok) {
            setSession(result.session)
            return true
          }
          addToast({ type: "error", title: "进入失败", description: result.failure.message })
          return false
        }}
        onChangeAccount={() => void signOut()}
      />
    )
  } else {
    content = <Workbench key={session.id} principal={session.principal} />
  }

  return (
    <SessionToastContext.Provider value={addToast}>
      {content}
      <ToastContainer messages={toasts} onDismiss={dismissToast} />
    </SessionToastContext.Provider>
  )
}

/** 平台侧角色走管理工作台；其余按旧三类视角落在药厂/服务商工作台（集合定义在 authProfiles） */

function dashboardVariantOf(principal: AuthPrincipal): "pharma" | "provider" | "platform" {
  if (PLATFORM_ROLE_IDS.has(principal.roleId)) return "platform"
  return principal.perspective === "服务提供商" ? "provider" : "pharma"
}

function Workbench({ principal }: { principal: AuthPrincipal }) {
  return (
    <DisplayPreferenceProvider>
      <TaskDataProvider>
        <PermissionProvider principal={principal}>
          <VendorAccessProvider>
            <RepFilingProvider>
              <AppShell />
            </RepFilingProvider>
          </VendorAccessProvider>
        </PermissionProvider>
      </TaskDataProvider>
    </DisplayPreferenceProvider>
  )
}

function AppShell() {
  const {
    visiblePages,
    preview,
    effectiveRole,
    exitPreview,
    orgs,
    users,
    logAudit,
    principal,
    loginRole: currentRole,
  } = usePermission()
  const { session, setSession, signOut } = useAuth()
  const dashboardVariant = dashboardVariantOf(principal)
  const [currentPage, setCurrentPage] = useState<PageId>("dashboard")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => seedMenuItems())
  // 先按登录角色过滤菜单项再构建导航树：同一页面可被多个角色各自的菜单项绑定
  // （vendor-access 双入口），必须用菜单项级可见性，不能在树建成后按页 ID 合并判断
  const roleVisibleMenuItems = useMemo(
    () =>
      menuItems.filter(
        (m) => m.enabled && !(m.hideForRoles ?? []).includes(currentRole),
      ),
    [menuItems, currentRole],
  )
  const navGroups = useMemo(
    () => buildNavGroups(roleVisibleMenuItems),
    [roleVisibleMenuItems],
  )
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(seedMenuItems().filter((m) => m.type === "group").map((m) => m.id)),
  )
  // Toast 走会话级容器（Root）：切换服务药厂重建业务树时提示不丢失
  const addToast = useContext(SessionToastContext)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [navFocus, setNavFocus] = useState<NavFocus>({})
  const [mobileDemoOpen, setMobileDemoOpen] = useState(false)
  const [mobileDemoShown, setMobileDemoShown] = useState(false)
  const mobileDemoCloseTimer = useRef<number | null>(null)
  // 完整移动端演示：iframe 加载 public/mobile-app 构建产物
  const [fullMobileDemoOpen, setFullMobileDemoOpen] = useState(false)
  const [fullMobileDemoShown, setFullMobileDemoShown] = useState(false)
  const fullMobileDemoCloseTimer = useRef<number | null>(null)

  // Toast 容器已上移到 Root（SessionToastContext），AppShell 不再自带
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null)
  // 切换服务药厂（免重新认证）：浮层选药厂 → 网关换发会话 → 业务树重建、数据重置
  const [pharmaSwitchOpen, setPharmaSwitchOpen] = useState(false)
  const [switchPharmas, setSwitchPharmas] = useState<ServingPharma[] | null>(null)
  const openPharmaSwitch = useCallback(async () => {
    if (!principal.servingPharmaName) return
    setShowUserMenu(false)
    setSwitchPharmas(null)
    setPharmaSwitchOpen(true)
    setSwitchPharmas(await authGateway.listServingPharmas(principal.userId))
  }, [principal.userId, principal.servingPharmaName])
  const handleSwitchPharma = useCallback(
    async (pharmaId: string) => {
      if (!session) return false
      const result = await authGateway.chooseServingPharma({
        userId: session.principal.userId,
        pharmaId,
        method: session.method,
        qrSource: session.qrSource,
      })
      if (result.ok) {
        setPharmaSwitchOpen(false)
        setSession(result.session)
        addToast({
          type: "success",
          title: `已切换至${result.session.principal.servingPharmaName}`,
          description: "所属企业与人员身份不变，业务数据已按所选药厂重置。",
        })
        return true
      }
      addToast({ type: "error", title: "切换失败", description: result.failure.message })
      return false
    },
    [session, setSession, addToast],
  )
  // 演示环境一键切换角色：复用密码登录网关换发新会话；
  // session.id 变化使 Workbench 整树重建，自动回到新角色工作台（数据重置为种子态）
  const switchAccount = useCallback(
    async (account: string) => {
      setSwitchingAccount(account)
      const result = await authGateway.loginPassword({
        account,
        password: DEMO_PASSWORD,
      })
      setSwitchingAccount(null)
      if (!result.ok) {
        addToast({
          type: "error",
          title: "切换失败",
          description: result.failure.message,
        })
        return
      }
      setShowUserMenu(false)
      setSession(result.session)
    },
    [addToast, setSession],
  )

  const navigate: NavigateFn = (page, focus) => {
    const controlled = RESOURCE_PAGES.some((p) => p.id === page)
    if (controlled && page !== "dashboard" && !visiblePages.has(page)) {
      logAudit({
        module: pageLabels[page] || page,
        action: "越权访问",
        target: pageLabels[page] || page,
        resource: `${page}.view`,
        decision: "拒绝",
        reason: "当前角色无页面查看权限",
        result: "失败",
      })
      addToast({
        type: "error",
        title: "无权访问该页面",
        description: "已写入权限审计，无法通过菜单或快捷入口绕过。",
      })
      return
    }
    const group = navGroups
      .flatMap((g) => g.items)
      .find(
        (item) => item.children?.some((c) => c.id === page) || item.id === page,
      )
    if (group && group.children) {
      setExpandedGroups((prev) => new Set([...prev, group.id]))
    }
    setNavFocus(focus ?? {})
    setCurrentPage(page)
  }

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderPage() {
    switch (currentPage) {
      case "dashboard":
        return (
          <Dashboard
            navigate={navigate}
            variant={dashboardVariant}
            addToast={addToast}
          />
        )
      case "hospital-visits":
        return <VisitManagement addToast={addToast} currentRole={currentRole} />
      case "commercial-visits":
        return <VisitManagement addToast={addToast} currentRole={currentRole} />
      case "pharmacy-visits":
        return <VisitManagement addToast={addToast} currentRole={currentRole} />
      case "budget-plan":
        return (
          <BudgetPlanPage
            addToast={addToast}
            currentRole={currentRole}
            navigate={navigate}
          />
        )
      case "analytics":
        return (
          <BudgetAnalysis
            currentRole={currentRole}
            navigate={navigate}
            focus={navFocus}
          />
        )
      case "task-dispatch":
        return (
          <TaskExecution
            addToast={addToast}
            navigate={navigate}
            currentRole={currentRole}
            navFocus={navFocus}
          />
        )
      case "doctors":
        return <DoctorMaster />
      case "varieties":
        return <VarietyManage addToast={addToast} currentRole={currentRole} />
      case "variety-auth":
        return <VarietyAuth addToast={addToast} currentRole={currentRole} />
      case "price-config":
        return <PriceTableConfig addToast={addToast} currentRole={currentRole} />
      case "settlement":
        return (
          <Settlement
            addToast={addToast}
            currentRole={currentRole}
            navigate={navigate}
          />
        )
      case "audit-log":
        return <AuditLog />
      case "menus":
        return <MenuManage menuItems={menuItems} onChange={setMenuItems} addToast={addToast} />
      case "rep-filing":
        return <RepFilingManage addToast={addToast} currentRole={currentRole} />
      case "vendor-access":
        return (
          <VendorAccessManage addToast={addToast} currentRole={currentRole} />
        )
      case "vendor-access-records":
        return (
          <VendorAccessManage
            addToast={addToast}
            currentRole={currentRole}
            view="records"
          />
        )
      case "roles":
        return <RoleManage addToast={addToast} navigate={navigate} />
      case "role-preview":
        return <RolePreview addToast={addToast} navigate={navigate} />
      case "departments":
        return <UserOrgManage addToast={addToast} navFocus={navFocus} />
      case "execution-chain":
        return (
          <ExecutionChainConfig addToast={addToast} currentRole={currentRole} />
        )
      case "performance-team":
        return <PerformanceTeamQuality addToast={addToast} />
      case "performance-specialist":
        return <PerformanceSpecialist addToast={addToast} />
      case "performance-settings":
        return <PerformanceSettings addToast={addToast} operator={principal.name} />
      case "business-switch":
        return <PharmaConfigSwitch addToast={addToast} currentRole={currentRole} />
      case "biz-detail-export":
        return (
          <BizDetailExport addToast={addToast} currentRole={currentRole} />
        )
      case "baiyee-ai":
        return <BaiyeeAI navigate={navigate} />
      default:
        return <StubPage title={pageLabels[currentPage] || currentPage} />
    }
  }

  const SIDEBAR_W = sidebarCollapsed ? 60 : 240
  const notificationCount =
    dashboardVariant === "platform"
      ? getPlatformWorkbenchData(principal.roleId, principal.roleName).unreadCount
      : getRoleDashboardData(currentRole).unreadCount

  // 面包屑优先取当前角色可见的菜单项名称与所属目录（vendor-access 双角色各有入口名）
  const menuMetaByPage = useMemo(() => {
    const map = new Map<string, { name: string; section: string }>()
    for (const m of menuItems) {
      if (m.type !== "page" || !m.pageId) continue
      if (!m.enabled || (m.hideForRoles ?? []).includes(currentRole)) continue
      if (map.has(m.pageId)) continue
      const parent = menuItems.find((p) => p.id === m.parentId)
      map.set(m.pageId, { name: m.name, section: parent?.name ?? "" })
    }
    return map
  }, [menuItems, currentRole])

  const breadcrumb = (() => {
    const meta = menuMetaByPage.get(currentPage)
    return [
      meta?.section || pageSections[currentPage],
      meta?.name || pageLabels[currentPage],
    ].filter(Boolean)
  })()

  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => {
          if (!item.children) {
            if (item.disabled) return item
            return visiblePages.has(item.id) ? item : null
          }
          const children = item.children.filter(
            (c) => c.disabled || visiblePages.has(c.id),
          )
          // 改造前行为：目录至少要有一个「非置灰且有查看权限」的子项才显示，
          // 仅剩置灰项的目录整组隐藏
          if (!children.some((c) => !c.disabled && visiblePages.has(c.id)))
            return null
          return { ...item, children }
        })
        .filter((item): item is NavItem => item !== null),
    }))
    .filter((group) => group.items.length > 0)

  useEffect(() => {
    const controlled = RESOURCE_PAGES.some((p) => p.id === currentPage)
    if (
      controlled &&
      currentPage !== "dashboard" &&
      !visiblePages.has(currentPage)
    ) {
      setCurrentPage("dashboard")
    }
  }, [visiblePages, currentPage])

  const previewOrgName = preview
    ? (orgs.find((o) => o.id === preview.orgId)?.name ?? "")
    : ""
  const previewUserName = preview?.userId
    ? users.find((u) => u.id === preview.userId)?.name
    : undefined
  const isBaiyeeAI = currentPage === "baiyee-ai"
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const demoMs = reducedMotion ? 0 : 200

  function openMobileDemo() {
    if (mobileDemoCloseTimer.current) {
      window.clearTimeout(mobileDemoCloseTimer.current)
      mobileDemoCloseTimer.current = null
    }
    setShowUserMenu(false)
    setMobileDemoOpen(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setMobileDemoShown(true))
    })
  }

  function closeMobileDemo() {
    setMobileDemoShown(false)
    if (mobileDemoCloseTimer.current)
      window.clearTimeout(mobileDemoCloseTimer.current)
    mobileDemoCloseTimer.current = window.setTimeout(() => {
      setMobileDemoOpen(false)
      mobileDemoCloseTimer.current = null
    }, demoMs)
  }

  function openFullMobileDemo() {
    if (fullMobileDemoCloseTimer.current) {
      window.clearTimeout(fullMobileDemoCloseTimer.current)
      fullMobileDemoCloseTimer.current = null
    }
    setShowUserMenu(false)
    setFullMobileDemoOpen(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setFullMobileDemoShown(true))
    })
  }

  function closeFullMobileDemo() {
    setFullMobileDemoShown(false)
    if (fullMobileDemoCloseTimer.current)
      window.clearTimeout(fullMobileDemoCloseTimer.current)
    fullMobileDemoCloseTimer.current = window.setTimeout(() => {
      setFullMobileDemoOpen(false)
      fullMobileDemoCloseTimer.current = null
    }, demoMs)
  }

  useEffect(() => {
    if (!mobileDemoOpen && !fullMobileDemoOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (mobileDemoOpen) closeMobileDemo()
      if (fullMobileDemoOpen) closeFullMobileDemo()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mobileDemoOpen, fullMobileDemoOpen, demoMs])

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        background: isBaiyeeAI ? "#F7F7F5" : "#F5F7F8",
        overflow: "hidden",
      }}
    >
      {/* Unmount original chrome on baiyee-AI. Do not hide with CSS: a later `display:'flex'` in this object previously overrode `none`. */}
      {!isBaiyeeAI && (
        <aside
          style={{
            display: "flex",
            width: SIDEBAR_W,
            flexShrink: 0,
            background: "var(--color-sidebar)",
            flexDirection: "column",
            overflow: "hidden",
            transition: "width 200ms cubic-bezier(0.25,0.46,0.45,0.94)",
            position: "relative",
            zIndex: showUserMenu ? 60 : 10,
          }}
        >
          {/* Logo */}
          <div
            style={{
              padding: sidebarCollapsed ? "16px 8px" : "16px 16px",
              borderBottom: "1px solid var(--color-sidebar-divider)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <BrandLogo collapsed={sidebarCollapsed} />
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, overflow: "auto", padding: "8px" }}>
            {visibleNavGroups.map((group, gi) => (
              <div key={gi} style={{ marginBottom: 4 }}>
                {group.label && !sidebarCollapsed && (
                  <div
                    style={{
                      padding: "10px 8px 4px",
                      fontSize: "var(--fs-10)",
                      fontWeight: 700,
                      color: "#4B5563",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {group.label}
                  </div>
                )}
                {group.label && sidebarCollapsed && gi > 0 && (
                  <div
                    style={{
                      height: 1,
                      background: "var(--color-sidebar-divider)",
                      margin: "8px 4px",
                    }}
                  />
                )}
                {group.items.map((item) => (
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
            onClick={() => setSidebarCollapsed((v) => !v)}
            style={{
              position: "absolute",
              right: -12,
              top: "50%",
              transform: "translateY(-50%)",
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "var(--color-sidebar-elev)",
              border: "1px solid var(--color-sidebar-line)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9CA3AF",
              zIndex: 20,
            }}
            title={sidebarCollapsed ? "展开导航" : "折叠导航"}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronLeft size={12} />
            )}
          </button>

          {/* Bottom: user */}
          <div
            style={{
              borderTop: "1px solid var(--color-sidebar-divider)",
              padding: sidebarCollapsed ? "12px 8px" : "12px 12px",
              flexShrink: 0,
            }}
          >
            {/* Sync status */}
            {!sidebarCollapsed && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 10,
                  padding: "4px 8px",
                  borderRadius: "4px",
                  background:
                    "color-mix(in srgb, var(--color-sidebar-accent) 6%, transparent)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--color-sidebar-accent)",
                    boxShadow:
                      "0 0 6px color-mix(in srgb, var(--color-sidebar-accent) 60%, transparent)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "var(--fs-11)", color: "#4B5563" }}>
                  数据已同步 · 09:30
                </span>
              </div>
            )}

            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px",
                  background: "none",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(255,255,255,0.04)"
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.background =
                    "none"
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "8px",
                    background:
                      "linear-gradient(135deg, var(--color-brand), #2F6BCE)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "var(--fs-13)",
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {principal.name.slice(0, 1)}
                </div>
                {!sidebarCollapsed && (
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "var(--fs-13)",
                        fontWeight: 500,
                        color: "var(--color-sidebar-text)",
                        lineHeight: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {principal.name}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--fs-11)",
                        color: "var(--color-sidebar-accent)",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={`${principal.orgName} · ${principal.roleName}`}
                    >
                      {principal.roleName}
                    </div>
                  </div>
                )}
              </button>

              {showUserMenu && !sidebarCollapsed && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: 0,
                    right: 0,
                    background: "var(--color-sidebar-elev)",
                    border: "1px solid var(--color-sidebar-line)",
                    borderRadius: "8px",
                    padding: "8px",
                    marginBottom: 4,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.30)",
                    zIndex: 100,
                  }}
                >
                  <div
                    style={{
                      padding: "6px 8px 8px",
                      borderBottom: "1px solid var(--color-sidebar-line)",
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "var(--fs-13)",
                        fontWeight: 600,
                        color: "var(--color-sidebar-text)",
                      }}
                    >
                      {principal.name}
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: "var(--fs-11)",
                          fontWeight: 400,
                          color: "#6B7280",
                        }}
                      >
                        {principal.account}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "var(--fs-11)",
                        color: "var(--color-sidebar-accent)",
                        marginTop: 3,
                      }}
                    >
                      {principal.roleName} · {principal.orgName}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--fs-11)",
                        color: "#6B7280",
                        marginTop: 2,
                      }}
                    >
                      数据范围：{principal.scopeOrgName}
                    </div>
                    {principal.servingPharmaName && (
                      <div
                        style={{
                          fontSize: "var(--fs-11)",
                          color: "var(--color-sidebar-accent)",
                          marginTop: 2,
                        }}
                      >
                        当前服务药厂：{principal.servingPharmaName}
                      </div>
                    )}
                  </div>
                  {principal.servingPharmaName && principal.roleName === "服务专员" && (
                    <button
                      type="button"
                      onClick={() => void openPharmaSwitch()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        padding: "7px 8px",
                        fontSize: "var(--fs-13)",
                        color: "var(--color-sidebar-text)",
                        background: "none",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        textAlign: "left",
                        gap: 8,
                        marginBottom: 4,
                      }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.background =
                          "rgba(255,255,255,0.04)"
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.background =
                          "none"
                      }}
                    >
                      <Building2 size={13} /> 切换服务药厂 · {principal.servingPharmaName}
                    </button>
                  )}
                  <div
                    style={{
                      fontSize: "var(--fs-11)",
                      fontWeight: 600,
                      color: "#4B5563",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "4px 8px",
                      marginBottom: 4,
                    }}
                  >
                    演示场景
                  </div>
                  <button
                    type="button"
                    onClick={openMobileDemo}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      padding: "7px 8px",
                      fontSize: "var(--fs-13)",
                      color: "var(--color-sidebar-text)",
                      background: "none",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      textAlign: "left",
                      gap: 8,
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(255,255,255,0.04)"
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background =
                        "none"
                    }}
                  >
                    <Smartphone size={13} /> 医药代表移动端
                  </button>
                  <button
                    type="button"
                    onClick={openFullMobileDemo}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      padding: "7px 8px",
                      fontSize: "var(--fs-13)",
                      color: "var(--color-sidebar-text)",
                      background: "none",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      textAlign: "left",
                      gap: 8,
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(255,255,255,0.04)"
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background =
                        "none"
                    }}
                  >
                    <TabletSmartphone size={13} /> 完整移动端
                  </button>
                  <div
                    style={{
                      fontSize: "var(--fs-11)",
                      fontWeight: 600,
                      color: "#4B5563",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "4px 8px",
                      marginTop: 6,
                      marginBottom: 2,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Repeat size={11} /> 切换角色
                  </div>
                  <div
                    style={{
                      fontSize: "var(--fs-11)",
                      color: "#6B7280",
                      padding: "0 8px 4px",
                    }}
                  >
                    切换后回到对应工作台，演示数据重置
                  </div>
                  <div
                    style={{
                      maxHeight: 216,
                      overflowY: "auto",
                      marginBottom: 2,
                    }}
                  >
                    {DEMO_ACCOUNT_HINTS.filter(
                      (hint) => hint.userId !== principal.userId,
                    ).map((hint) => (
                      <button
                        key={hint.userId}
                        type="button"
                        disabled={switchingAccount !== null}
                        onClick={() => void switchAccount(hint.account)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          width: "100%",
                          padding: "6px 8px",
                          background: "none",
                          border: "none",
                          borderRadius: "4px",
                          cursor:
                            switchingAccount !== null ? "wait" : "pointer",
                          textAlign: "left",
                          opacity: switchingAccount === hint.account ? 0.6 : 1,
                        }}
                        onMouseEnter={(e) => {
                          ;(
                            e.currentTarget as HTMLButtonElement
                          ).style.background = "rgba(255,255,255,0.04)"
                        }}
                        onMouseLeave={(e) => {
                          ;(e.currentTarget as HTMLButtonElement).style.background =
                            "none"
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: "var(--fs-13)",
                              color: "var(--color-sidebar-text)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {hint.name}
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: "var(--fs-11)",
                                color: "#6B7280",
                              }}
                            >
                              {hint.account}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "var(--fs-11)",
                              color: "var(--color-sidebar-accent)",
                              marginTop: 2,
                            }}
                          >
                            {hint.roleName} · {hint.orgName}
                          </div>
                        </div>
                        {switchingAccount === hint.account && (
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: "var(--fs-11)",
                              color: "#6B7280",
                              flexShrink: 0,
                            }}
                          >
                            切换中…
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div
                    style={{
                      height: 1,
                      background: "var(--color-sidebar-line)",
                      margin: "8px 0",
                    }}
                  />
                  <button
                    onClick={() => {
                      // 统一登出：销毁内存会话，业务壳整树卸载回到登录页
                      setShowUserMenu(false)
                      void signOut()
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      padding: "7px 8px",
                      fontSize: "var(--fs-13)",
                      color: "#C73A3A",
                      background: "none",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      textAlign: "left",
                      gap: 8,
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(199,58,58,0.08)"
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background =
                        "none"
                    }}
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
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {preview && !isBaiyeeAI && (
          <PreviewBanner
            roleName={effectiveRole.name}
            orgName={previewOrgName}
            userName={previewUserName}
            onExit={() => {
              exitPreview()
              setCurrentPage("role-preview")
              addToast({ type: "info", title: "已退出预览模式" })
            }}
          />
        )}

        {/* Top bar */}
        {!isBaiyeeAI && (
          <header
            style={{
              height: 52,
              background: "#FFFFFF",
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              gap: 12,
              flexShrink: 0,
              zIndex: 5,
            }}
          >
            {/* Breadcrumb */}
            <nav
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flex: 1,
                minWidth: 0,
              }}
            >
              {breadcrumb.map((crumb, i) => (
                <span
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  {i > 0 && (
                    <ChevronRight size={13} style={{ color: "#D1D5DB" }} />
                  )}
                  <span
                    style={{
                      fontSize: "var(--fs-13)",
                      color:
                        i === breadcrumb.length - 1
                          ? "var(--color-text-1)"
                          : "#9CA3AF",
                      fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
                    }}
                  >
                    {crumb}
                  </span>
                </span>
              ))}
              {breadcrumb.length === 0 && (
                <span
                  style={{
                    fontSize: "var(--fs-13)",
                    fontWeight: 600,
                    color: "var(--color-text-1)",
                  }}
                >
                  工作台
                </span>
              )}
              <button
                type="button"
                className="project-intro-entry"
                onClick={() => window.open("/project-intro/index.html", "_blank", "noopener,noreferrer")}
                title="打开药合作系统重构项目介绍"
              >
                <Presentation size={15} strokeWidth={2.2} />
                <span>项目介绍</span>
                <span className="project-intro-entry__pulse" aria-hidden="true" />
              </button>
            </nav>

            {/* Global search */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 32,
                padding: "0 12px",
                background: "#F9FAFB",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                width: 240,
                cursor: "text",
              }}
            >
              <Search size={13} style={{ color: "#9CA3AF", flexShrink: 0 }} />
              <span style={{ fontSize: "var(--fs-13)", color: "#9CA3AF" }}>
                全局搜索…
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: "var(--fs-11)",
                  color: "#D1D5DB",
                  padding: "1px 5px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "3px",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                ⌘K
              </span>
            </div>

            {/* Display preferences (personal, all roles) */}
            <DisplaySettingsMenu
              onNotice={(title) => addToast({ type: "info", title })}
            />

            {/* Notification */}
            <button
              aria-label={`消息中心，当前 ${notificationCount} 条待处理`}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: "8px",
                background: "none",
                border: "1px solid var(--color-border)",
                cursor: "pointer",
                color: "#6B7280",
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background =
                  "#F9FAFB"
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background =
                  "none"
              }}
            >
              <Bell size={16} />
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  right: 3,
                  minWidth: 16,
                  height: 16,
                  borderRadius: "9999px",
                  background: "#C73A3A",
                  border: "1px solid #fff",
                  color: "#fff",
                  fontSize: "var(--fs-10)",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 3px",
                }}
              >
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            </button>

            {/* Enterprise + role */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 12px",
                height: 36,
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                cursor: "pointer",
                background: "#F9FAFB",
              }}
            >
              <Building2 size={14} style={{ color: "#9CA3AF" }} />
              <span
                style={{
                  fontSize: "var(--fs-13)",
                  color: "#374151",
                  fontWeight: 500,
                }}
              >
                {principal.enterpriseName}
              </span>
              <span
                style={{
                  fontSize: "var(--fs-11)",
                  padding: "2px 6px",
                  borderRadius: "9999px",
                  background: "var(--color-brand-subtle)",
                  color: "var(--color-brand)",
                  fontWeight: 600,
                }}
              >
                {principal.roleName}
              </span>
              {principal.servingPharmaName && (
                <span
                  title="当前服务药厂：本次业务数据范围，可在用户菜单切换"
                  style={{
                    fontSize: "var(--fs-11)",
                    padding: "2px 6px",
                    borderRadius: "9999px",
                    background: "var(--color-info-bg)",
                    color: "var(--color-info-fg)",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Building2 size={11} /> 服务药厂 · {principal.servingPharmaName}
                </span>
              )}
            </div>
          </header>
        )}

        {/* Page content */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: isBaiyeeAI ? "hidden" : "auto",
          }}
        >
          {renderPage()}
        </main>
      </div>

      {mobileDemoOpen && (
        <div
          className="demo-scene-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            opacity: mobileDemoShown ? 1 : 0,
            transition: reducedMotion ? "none" : `opacity ${demoMs}ms ease`,
          }}
        >
          <RepAppointmentMobileDemo
            onExit={closeMobileDemo}
            reducedMotion={reducedMotion}
          />
        </div>
      )}

      {fullMobileDemoOpen && (
        <div
          className="demo-scene-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            opacity: fullMobileDemoShown ? 1 : 0,
            transition: reducedMotion ? "none" : `opacity ${demoMs}ms ease`,
          }}
        >
          <FullMobileDemo onExit={closeFullMobileDemo} />
        </div>
      )}

      {/* 切换服务药厂浮层（免重新认证；确认后换发会话整树重建） */}
      {pharmaSwitchOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            background: "var(--color-canvas)",
            overflow: "auto",
          }}
        >
          {switchPharmas ? (
            <PharmaGate
              principal={principal}
              pharmas={switchPharmas}
              mode="switch"
              onEnter={handleSwitchPharma}
              onClose={() => setPharmaSwitchOpen(false)}
            />
          ) : (
            <div
              style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-2)",
                fontSize: "var(--fs-14)",
              }}
            >
              正在加载服务药厂…
            </div>
          )}
        </div>
      )}

      {/* Toast 容器在 Root 层（SessionToastContext） */}

      {/* Close user menu on outside click */}
      {showUserMenu && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50 }}
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </div>
  )
}

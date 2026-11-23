/**
 * 租户管理（软件服务方侧 · 2026-09-15 深度审核整改版）。
 *
 * 贝医系统管理员的开户闭环（直接创建、无申请审核流）：
 * 新建药厂/服务商（三步向导：类型 → 企业资料 → 首位管理员）→ 确认创建即
 * 原子建租（自动生成全局唯一主企业码 + 首位管理员待激活）→ 管理员首次登录
 * 激活联动 → 租户暂停/恢复/终止（一律原因码 + 说明 + 审计）。
 *
 * 2026-09-15 整改拍板：无申请/审核/驳回/补正；一个租户一个主企业码（无别名
 * 码、无重发激活提醒）；状态机四态（待激活/正常/已暂停/已终止）；状态操作
 * 收敛到详情头部；详情内容卡按「套餐与开通 / 主体资料 / 管理员信息」选项卡切换。
 *
 * 数据全部来自运行时注册表（mock，localStorage 演示），生产环境由服务端与
 * 数据库完成（见 tenantRegistry.ts 头注）。页面可见性由角色页面权限收敛：
 * 仅贝医系统管理员可见可访问；本页操作走操作日志（标准原因码）。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Factory,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
  X,
  XCircle,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { Pagination } from "../components/Pagination";
import { usePermission } from "../context/PermissionContext";
import {
  getTenantRegistrySnapshot,
  subscribeTenantRegistry,
  createTenant,
  auditCodeCopy,
  suspendTenant,
  resumeTenant,
  terminateTenant,
  changeInitialAdmin,
  changeTenantPackage,
  tenantExpired,
  isUsccTaken,
  resetTenantRegistry,
  ACCOUNT_PATTERN,
  defaultRuntimeAccount,
  isAccountTakenInWorkspace,
  SUSPEND_REASON_OPTIONS,
  RESUME_REASON_OPTIONS,
  TERMINATE_REASON_OPTIONS,
  TENANT_STATUS_LABEL,
  TENANT_TYPE_LABEL,
  type TenantAdminDesignee,
  type TenantAuditLine,
  type TenantRecord,
  type TenantSubjectProfile,
  type TenantType,
} from "../data/tenantRegistry";
import {
  getTenantPackagesSnapshot,
  listTenantPackages,
  packageOfTenant,
  subscribeTenantPackages,
} from "../data/tenantPackages";

const PAGE_SIZE = 8;

/** 审计原因码 → 操作日志 action 文案 */
const AUDIT_ACTION_LABEL: Record<string, string> = {
  TENANT_CREATED: "正式租户创建",
  ENT_CODE_PRIMARY_GENERATED: "主企业码生成",
  ENT_CODE_COLLISION_RETRIED: "企业码冲突重试",
  ENT_CODE_COPIED: "企业码复制",
  INITIAL_ADMIN_CREATED: "首位管理员创建",
  INITIAL_ADMIN_CHANGED: "首位管理员变更",
  TENANT_PACKAGE_BOUND: "租户套餐绑定",
  TENANT_PACKAGE_CHANGED: "租户套餐换绑",
  TENANT_ACTIVATED: "租户激活",
  TENANT_SUSPENDED: "租户暂停",
  TENANT_REACTIVATED: "租户恢复",
  TENANT_TERMINATED: "租户终止",
};

/** 状态原因码 → 文案（暂停/恢复/终止共用查询） */
function statusReasonLabel(code: string): string {
  return (
    SUSPEND_REASON_OPTIONS.find((o) => o.code === code)?.label ??
    RESUME_REASON_OPTIONS.find((o) => o.code === code)?.label ??
    TERMINATE_REASON_OPTIONS.find((o) => o.code === code)?.label ??
    code
  );
}

/** 复制兜底：clipboard API 不可用（如未聚焦/权限）时退回 execCommand；两者都失败返回 false */
async function copyTextWithFallback(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

const maskPhone = (phone: string) =>
  phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone;

/** 窄屏断点（与业务后台壳层一致） */
function useIsCompact(): boolean {
  const [compact, setCompact] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const on = () => setCompact(window.innerWidth < 1024);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return compact;
}

// ─── 小组件 ──────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: TenantRecord["status"] }) {
  const map: Record<TenantRecord["status"], { bg: string; fg: string; icon: ReactNode }> = {
    pending_activation: { bg: "#E0F2FE", fg: "#0369A1", icon: <UserCog size={12} /> },
    active: { bg: "#DCFCE7", fg: "#15803D", icon: <CheckCircle2 size={12} /> },
    suspended: { bg: "#FEF3E2", fg: "#B45309", icon: <PauseCircle size={12} /> },
    terminated: { bg: "#F3F4F6", fg: "#6B7280", icon: <Ban size={12} /> },
  };
  const s = map[status];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: "var(--fs-12)", fontWeight: 500, padding: "2px 8px", borderRadius: 999,
        background: s.bg, color: s.fg, whiteSpace: "nowrap",
      }}
    >
      {s.icon}
      {TENANT_STATUS_LABEL[status]}
    </span>
  );
}

function CodeText({ code }: { code: string }) {
  return (
    <code
      className="font-mono-nums"
      title={code}
      style={{ fontSize: "var(--fs-13)", fontWeight: 600, letterSpacing: "0.06em", color: "#0F4C81", background: "rgba(15,76,129,0.06)", padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap" }}
    >
      {code}
    </code>
  );
}

const fieldLabel: React.CSSProperties = { display: "block", fontSize: "var(--fs-13)", fontWeight: 500, color: "#374151", marginBottom: 6 };
const fieldInput: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px", border: "1px solid var(--color-border)",
  borderRadius: 8, fontSize: "var(--fs-14)", fontFamily: "inherit", color: "var(--color-text-1)",
  background: "#FFFFFF", outline: "none",
};
const errPill: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, marginTop: 6,
  fontSize: "var(--fs-12)", color: "#C73A3A",
};

function Field({
  id, label, error, children, required, hint,
}: {
  id: string; label: string; error?: string; required?: boolean; hint?: string; children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} style={fieldLabel}>
        {label}
        {required && <span style={{ color: "#C73A3A", marginLeft: 2 }} aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <div style={{ fontSize: "var(--fs-12)", color: "#9CA3AF", marginTop: 4 }}>{hint}</div>}
      {error && (
        <div id={`err-${id}`} style={errPill} role="alert">
          <AlertTriangle size={13} aria-hidden />
          {error}
        </div>
      )}
    </div>
  );
}

function inputProps(id: string, error?: string) {
  return {
    id,
    className: "tm-field",
    "aria-invalid": Boolean(error) || undefined,
    "aria-describedby": error ? `err-${id}` : undefined,
    style: { ...fieldInput, ...(error ? { borderColor: "#DC2626" } : {}) },
  } as const;
}

// ─── 主页面 ──────────────────────────────────────────────────────────────────

export function TenantManagement({ addToast }: { addToast: (msg: { type: "success" | "error" | "info"; title: string; description?: string }) => void }) {
  const registry = useSyncExternalStore(subscribeTenantRegistry, getTenantRegistrySnapshot);
  // 套餐池变更（编辑菜单集/换绑）联动列表重渲染
  useSyncExternalStore(subscribeTenantPackages, getTenantPackagesSnapshot);
  const { logAudit, principal } = usePermission();
  const compact = useIsCompact();

  // 搜索（防抖）与筛选
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [page, setPage] = useState(1);
  const searchTimer = useRef<number | null>(null);

  // 抽屉/向导状态
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailTenantId, setDetailTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => {
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
    }
  }, [searchInput])

  const tenants = useMemo(
    () => [...registry.tenants].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)),
    [registry.tenants],
  );

  const filtered = useMemo(
    () =>
      tenants.filter((t) => {
        const q = search.toUpperCase();
        if (q && !t.legalName.toUpperCase().includes(q) && !t.uscc.toUpperCase().includes(q) && !t.primaryCode.includes(q)) return false;
        if (fType && t.type !== fType) return false;
        if (fStatus && t.status !== fStatus) return false;
        return true;
      }),
    [tenants, search, fType, fStatus],
  );

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    const list: { key: TenantRecord["status"] | "total"; label: string; value: number; color: string; bg: string }[] = [
      { key: "pending_activation", label: "待激活", value: tenants.filter((t) => t.status === "pending_activation").length, color: "#0369A1", bg: "#E0F2FE" },
      { key: "active", label: "正常", value: tenants.filter((t) => t.status === "active").length, color: "#15803D", bg: "#DCFCE7" },
      { key: "suspended", label: "已暂停", value: tenants.filter((t) => t.status === "suspended").length, color: "#B45309", bg: "#FEF3E2" },
      { key: "terminated", label: "已终止", value: tenants.filter((t) => t.status === "terminated").length, color: "#6B7280", bg: "#F3F4F6" },
    ];
    return list;
  }, [tenants]);

  /** 注册表操作 → 全局操作日志（标准原因码） */
  const flushAudits = useCallback(
    (audits: { reasonCode: string; targetTenant: string; code?: string; detail?: string }[]) => {
      audits.forEach((a) =>
        logAudit({
          module: "租户管理",
          action: AUDIT_ACTION_LABEL[a.reasonCode] ?? "租户管理操作",
          target: a.code ? `${a.targetTenant} · ${a.code}` : a.targetTenant,
          resource: "tenant.management",
          reason: a.reasonCode,
          decision: "允许",
          result: "成功",
          ...(a.detail ? { afterSummary: a.detail } : {}),
        }),
      );
    },
    [logAudit],
  );

  const detailTenant = registry.tenants.find((t) => t.id === detailTenantId) ?? null;
  const hasAnyFilter = Boolean(search || fType || fStatus);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="租户管理"
        description="软件服务方开户闭环：直接创建药厂/服务商租户（自动生成全局唯一主企业码与待激活首位管理员）、管理员激活联动与租户生命周期管理。"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="tm-ghost-btn"
              title="仅演示环境提供：重置本浏览器内的租户注册表模拟数据（不影响登录种子数据）"
              onClick={() => {
                resetTenantRegistry();
                addToast({ type: "info", title: "演示数据已重置（仅演示）", description: "本页租户注册表恢复到初始演示状态（重置本地模拟数据，不影响登录种子数据）。" });
              }}
            >
              <RefreshCw size={14} aria-hidden />
              恢复演示数据（仅演示）
            </button>
            <button
              type="button"
              className="tm-primary-btn"
              onClick={() => setWizardOpen(true)}
            >
              <Plus size={15} aria-hidden />
              新建租户
            </button>
          </div>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {/* 状态统计（可点击筛选；「正常」由首位管理员首次登录激活获得，不能直接创建） */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
          {stats.map((s) => {
            const active = fStatus === s.key;
            return (
              <button
                key={s.key}
                type="button"
                className="tm-stat-card"
                aria-pressed={active}
                style={{ background: active ? s.bg : "#FFFFFF", borderColor: active ? s.color : "var(--color-border)" }}
                onClick={() => {
                  setPage(1);
                  setFStatus((v) => (v === s.key ? "" : (s.key as string)));
                }}
              >
                <span style={{ fontSize: "var(--fs-12)", color: "#6B7280" }}>{s.label}</span>
                <span style={{ fontSize: "var(--fs-22)", fontWeight: 700, color: s.color }}>{s.value}</span>
              </button>
            );
          })}
        </div>

        {/* 搜索 + 筛选 */}
        <div className="tm-filterbar" style={{ marginBottom: 12 }}>
          <div className="tm-search">
            <Search size={14} aria-hidden />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索企业名称 / 统一社会信用代码 / 主企业码"
              aria-label="搜索租户"
            />
            {searchInput && (
              <button type="button" aria-label="清空搜索" onClick={() => setSearchInput("")}>
                <X size={13} aria-hidden />
              </button>
            )}
          </div>
          <select value={fType} onChange={(e) => { setFType(e.target.value); setPage(1) }} aria-label="筛选租户类型">
            <option value="">全部类型</option>
            <option value="pharma">药厂</option>
            <option value="provider">服务提供商</option>
          </select>
          <select value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1) }} aria-label="筛选租户状态">
            <option value="">全部状态</option>
            <option value="pending_activation">待激活</option>
            <option value="active">正常</option>
            <option value="suspended">已暂停</option>
            <option value="terminated">已终止</option>
          </select>
          {hasAnyFilter && (
            <button type="button" className="tm-ghost-btn" onClick={() => { setSearchInput(""); setFType(""); setFStatus(""); setPage(1) }}>
              重置
            </button>
          )}
        </div>

        {/* 列表：桌面表格 / 窄屏卡片（不压扁、不裁切） */}
        {pageData.length === 0 ? (
          <div style={{ background: "#FFFFFF", border: "1px solid var(--color-border)", borderRadius: 8 }}>
            {tenants.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="尚无租户"
                description="点击右上角「新建租户」直接创建第一个药厂或服务提供商。"
                hint="药厂与服务商共用同一套开户与企业码生成机制。"
              />
            ) : (
              <EmptyState
                title="没有符合筛选条件的租户"
                description="调整搜索词或筛选条件后重试。"
                action={
                  <button type="button" className="tm-ghost-btn" onClick={() => { setSearchInput(""); setFType(""); setFStatus(""); setPage(1) }}>
                    清除全部筛选
                  </button>
                }
              />
            )}
          </div>
        ) : compact ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pageData.map((t) => (
              <div key={t.id} className="tm-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--fs-14)", fontWeight: 600, color: "var(--color-text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.legalName}>
                      {t.legalName}
                    </div>
                  </div>
                  <StatusPill status={t.status} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
                  <span className="tm-chip">{TENANT_TYPE_LABEL[t.type]}</span>
                  {(() => {
                    const pkg = packageOfTenant(t.id);
                    return pkg ? <span className="tm-chip">套餐：{pkg.name}（{pkg.menuIds.length} 项）</span> : null;
                  })()}
                  <CodeText code={t.primaryCode} />
                  <span className="tm-chip font-mono-nums" title={t.uscc}>{t.uscc}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" className="tm-ghost-btn tm-btn-sm" onClick={() => setDetailTenantId(t.id)}>详情</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: "#FFFFFF", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "auto" }}>
            <table className="tm-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1160 }}>
              <thead>
                <tr>
                  {["企业名称", "类型", "统一社会信用代码", "主企业码", "套餐与开通", "租户状态", "创建时间", "操作"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <button type="button" className="tm-name-btn" title={t.legalName} onClick={() => setDetailTenantId(t.id)}>
                        {t.legalName}
                      </button>
                    </td>
                    <td>{TENANT_TYPE_LABEL[t.type]}</td>
                    <td>
                      <code className="font-mono-nums tm-uscc" title={t.uscc}>{t.uscc}</code>
                    </td>
                    <td><CodeText code={t.primaryCode} /></td>
                    <td>
                      {(() => {
                        const pkg = packageOfTenant(t.id);
                        const expired = tenantExpired(t);
                        return (
                          <div
                            style={{ fontSize: "var(--fs-13)", color: expired ? "#C73A3A" : "var(--color-text-1)", fontWeight: expired ? 600 : undefined }}
                            title={pkg?.remark}
                          >
                            {pkg ? `${pkg.name} · ${pkg.menuIds.length} 项` : "—"}
                            {expired && <span className="font-mono-nums"> · 已过期 {t.expireAt}</span>}
                          </div>
                        );
                      })()}
                    </td>
                    <td><StatusPill status={t.status} /></td>
                    <td className="font-mono-nums tm-time">{t.createdAt}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, whiteSpace: "nowrap" }}>
                        <button type="button" className="tm-row-btn" onClick={() => setDetailTenantId(t.id)}>
                          详情
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <div style={{ marginTop: 12 }}>
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
          </div>
        )}
      </div>

      {/* 新建租户向导（直接创建，不保存草稿） */}
      {wizardOpen && (
        <TenantWizard
          actor={principal.name}
          onClose={() => setWizardOpen(false)}
          addToast={addToast}
          flushAudits={flushAudits}
          onOpenDetail={(tenantId) => { setWizardOpen(false); setDetailTenantId(tenantId) }}
        />
      )}

      {/* 租户详情 */}
      {detailTenant && (
        <TenantDetailDrawer
          tenantId={detailTenant.id}
          actor={principal.name}
          onClose={() => setDetailTenantId(null)}
          addToast={addToast}
          flushAudits={flushAudits}
        />
      )}
    </div>
  );
}

// ─── 新建租户向导（直接创建） ────────────────────────────────────────────────

const PHARMA_CATEGORIES = ["化学药品制剂", "中药与天然药", "生物制品", "原料药", "药械组合"];

// ─── 工商信息自动带出（演示模拟） ────────────────────────────────────────────
// 生产环境应在服务端对接企查查/天眼查等工商数据 API，按企业名称查询工商
// 登记信息（统一社会信用代码 + 注册地址）；演示原型用本地模拟：优先命中已建
// 租户的登记数据，否则按名称哈希生成一组稳定的演示数据，让「输入企业名称 →
// 自动带出信用代码与注册地址」可走通。

const LOOKUP_REGIONS = [
  "江苏省南京市江宁区", "浙江省杭州市滨江区", "上海市浦东新区张江高科技园区",
  "北京市北京经济技术开发区", "广东省广州市黄埔区科学城", "四川省成都市高新区",
];
const LOOKUP_ROADS = ["科学园乾德路", "生物医药园创新大道", "生命科学园康泰路", "产业新城聚合路", "医药产业园研新路"];
/** 模拟信用代码字符集（统一社会信用代码字符表，不含 I/O/S/V/Z） */
const SIM_USCC_CHARS = "0123456789ABCDEFGHJKLMNPQRTUWXY";

interface EnterpriseRegistryRecord { uscc: string; address: string }

/** 模拟工商库按名称查询登记信息；名称过短视为查询不到 */
function lookupEnterpriseRecord(key: string): EnterpriseRegistryRecord | null {
  const k = key.trim();
  if (k.length < 4) return null;
  const hit = getTenantRegistrySnapshot().tenants.find(
    (t) => t.legalName.includes(k),
  );
  if (hit) return { uscc: hit.uscc, address: hit.profile.address };
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  const address = `${LOOKUP_REGIONS[h % LOOKUP_REGIONS.length]}${LOOKUP_ROADS[(h >>> 3) % LOOKUP_ROADS.length]}${(h % 188) + 1} 号`;
  // 91 开头的 18 位模拟信用代码；若与已建租户撞号则顺移种子重生成
  let seed = h;
  let uscc = "";
  do {
    uscc = `91${Array.from({ length: 16 }, () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return SIM_USCC_CHARS[seed % SIM_USCC_CHARS.length];
    }).join("")}`;
  } while (isUsccTaken(uscc));
  return { uscc, address };
}

interface WizardForm {
  type: TenantType
  legalName: string
  uscc: string
  address: string
  contactName: string
  contactPhone: string
  licenseAttachment: string
  remark: string
  pharmaCategory: string
  mahHolderFlag: boolean
  bizOwner: string
  complianceOwner: string
  qualificationNo: string
  qualificationValidTo: string
  adminName: string
  adminAccount: string
  adminPhone: string
  /** 套餐与开通限制（2026-09-18 套餐模型） */
  packageId: string
  expireAt: string
}

/** 向导缺省套餐：默认套餐，缺则第一个启用套餐 */
function defaultPackageChoice(): string {
  const list = listTenantPackages();
  return (list.find((p) => p.isDefault) ?? list.find((p) => p.status === "enabled"))?.id ?? "";
}

const emptyForm = (type: TenantType): WizardForm => ({
  type,
  legalName: "", uscc: "", address: "", contactName: "", contactPhone: "",
  licenseAttachment: "", remark: "",
  pharmaCategory: "", mahHolderFlag: true,
  bizOwner: "", complianceOwner: "", qualificationNo: "", qualificationValidTo: "",
  adminName: "", adminAccount: "", adminPhone: "",
  packageId: defaultPackageChoice(), expireAt: "",
});

function TenantWizard({
  actor, onClose, addToast, flushAudits, onOpenDetail,
}: {
  actor: string;
  onClose: () => void;
  addToast: (msg: { type: "success" | "error" | "info"; title: string; description?: string }) => void;
  flushAudits: (audits: { reasonCode: string; targetTenant: string; code?: string; detail?: string }[]) => void;
  onOpenDetail: (tenantId: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(() => emptyForm("pharma"));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [created, setCreated] = useState<{ tenant: TenantRecord; replayed: boolean } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  // 脏检查：向导打开后任何输入即视为有未保存内容
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<WizardForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  // 工商登记信息自动带出（演示模拟企查查）：法定名称失焦即查，也可点「查询」；带出信用代码 + 注册地址
  const [addrLookup, setAddrLookup] = useState<{ status: "idle" | "searching" | "found" | "notfound"; key: string }>({ status: "idle", key: "" });
  const addrTimer = useRef<number | null>(null);
  useEffect(() => () => { if (addrTimer.current !== null) window.clearTimeout(addrTimer.current) }, []);
  const runAddressLookup = (rawKey: string) => {
    const key = rawKey.trim();
    if (addrTimer.current !== null) window.clearTimeout(addrTimer.current);
    if (!key) { setAddrLookup({ status: "idle", key: "" }); return; }
    setAddrLookup({ status: "searching", key });
    addrTimer.current = window.setTimeout(() => {
      const rec = lookupEnterpriseRecord(key);
      setAddrLookup({ status: rec ? "found" : "notfound", key });
      if (rec) {
        set({ uscc: rec.uscc, address: rec.address });
        setErrors((e) => {
          if (!e.address && !e.uscc) return e;
          const rest = { ...e };
          delete rest.address;
          delete rest.uscc;
          return rest;
        });
      }
    }, 650);
  };

  const steps = ["选择企业类型", "填写企业资料", "套餐与开通限制", "指定首位管理员"];

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.legalName.trim()) errs.legalName = "请输入企业法定名称";
      if (!/^[0-9A-Z]{18}$/.test(form.uscc.trim().toUpperCase())) errs.uscc = "请输入 18 位统一社会信用代码（数字与大写字母）";
      else if (isUsccTaken(form.uscc)) errs.uscc = "该企业主体已存在租户，请先查看现有记录";
      if (!form.address.trim()) errs.address = "请输入企业注册地址";
      if (!form.contactName.trim()) errs.contactName = "请输入联系人姓名";
      if (!/^1\d{10}$/.test(form.contactPhone.trim())) errs.contactPhone = "请输入正确的 11 位手机号";
      if (form.type !== "pharma") {
        if (!form.bizOwner.trim()) errs.bizOwner = "请输入业务负责人";
        if (!form.complianceOwner.trim()) errs.complianceOwner = "请输入合规负责人";
      }
    }
    if (s === 2) {
      if (!form.packageId) errs.packageId = "请选择租户套餐";
    }
    if (s === 3) {
      if (!form.adminName.trim()) errs.adminName = "请输入管理员姓名";
      // 登录账号（企业内唯一口径）：新租户为全新命名空间，只做格式校验；
      // 留空时由 createTenant 回落 rt-手机后4位
      if (form.adminAccount.trim() && !ACCOUNT_PATTERN.test(form.adminAccount.trim())) {
        errs.adminAccount = "账号须为 3-20 位小写字母/数字，可含 - 与 _";
      }
      if (!/^1\d{10}$/.test(form.adminPhone.trim())) errs.adminPhone = "请输入正确的 11 位手机号";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildProfile = (): TenantSubjectProfile => ({
    legalName: form.legalName.trim(),
    // 企业简称已从界面移除；注册表的 shortName 字段保留（种子数据与审计标签沿用），按法定名称回填
    shortName: form.legalName.trim(),
    uscc: form.uscc.trim().toUpperCase(),
    address: form.address.trim(),
    contactName: form.contactName.trim(),
    contactPhone: form.contactPhone.trim(),
    licenseAttachment: form.licenseAttachment || undefined,
    remark: form.remark.trim() || undefined,
      ...(form.type === "pharma"
        ? {
            pharmaCategory: form.pharmaCategory || undefined,
            mahHolderFlag: form.mahHolderFlag,
          }
      : {
          bizOwner: form.bizOwner.trim(),
          complianceOwner: form.complianceOwner.trim(),
          qualificationNo: form.qualificationNo.trim(),
          qualificationValidTo: form.qualificationValidTo,
        }),
  });

  const buildAdmin = (): TenantAdminDesignee => ({
    name: form.adminName.trim(),
    phone: form.adminPhone.trim(),
    account: form.adminAccount.trim() || defaultRuntimeAccount(form.adminPhone.trim()),
    roleLabel: form.type === "pharma" ? "企业管理员" : "服务商管理员",
  });

  const submit = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 900)); // 正在创建租户并生成主企业码…
    try {
      const result = createTenant({
        type: form.type,
        profile: buildProfile(),
        admin: buildAdmin(),
        actor,
        packageId: form.packageId || undefined,
        expireAt: form.expireAt || undefined,
      });
      if (!result.ok || !result.tenant) {
        addToast({ type: "error", title: "创建失败", description: result.error ?? "暂时无法创建租户，请稍后重试" });
        setBusy(false);
        return;
      }
      flushAudits(result.audits);
      setCreated({ tenant: result.tenant, replayed: result.replayed });
    } catch {
      addToast({ type: "error", title: "暂时无法创建租户，请稍后重试" });
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (code: string) => {
    const ok = await copyTextWithFallback(code);
    if (ok) {
      setCopyState("ok");
      window.setTimeout(() => setCopyState("idle"), 1600);
      flushAudits([auditCodeCopy(code, actor)]);
      addToast({ type: "success", title: "企业码已复制，并已记录操作日志" });
    } else {
      setCopyState("fail");
      addToast({ type: "error", title: "复制失败", description: "请手动选中文本复制。" });
    }
  };

  // 创建完成页（方案 §3.2）：企业名称、类型、主企业码、首位管理员、状态待激活
  if (created) {
    return (
      <Modal open title="租户已创建，主企业码已生成" width={520} onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {created.replayed && (
            <div className="tm-note tm-note--info" role="note">
              <AlertTriangle size={14} aria-hidden />
              <span>该主体已创建过租户：以下为已存在的主企业码与首位管理员，<b>未重复创建</b>（幂等保护生效）。</span>
            </div>
          )}
          <dl className="tm-confirm-grid">
            <dt>企业名称</dt><dd>{created.tenant.legalName}</dd>
            <dt>租户类型</dt><dd>{TENANT_TYPE_LABEL[created.tenant.type]}</dd>
            <dt>主企业码</dt>
            <dd><CodeText code={created.tenant.primaryCode} /></dd>
            <dt>绑定套餐</dt>
            <dd>
              {(() => {
                const pkg = packageOfTenant(created.tenant.id);
                return pkg ? `${pkg.name}（${pkg.menuIds.length} 项功能）` : "—";
              })()}
            </dd>
            <dt>开通有效期</dt>
            <dd className="font-mono-nums">{created.tenant.expireAt || "永久有效"}</dd>
            <dt>首位管理员</dt><dd>{created.tenant.initialAdmin.name} · <span className="font-mono-nums">{maskPhone(created.tenant.initialAdmin.phone)}</span></dd>
            <dt>当前状态</dt><dd><StatusPill status={created.tenant.status} /></dd>
          </dl>
          <div className="tm-note tm-note--warn" role="note">
            <AlertTriangle size={14} aria-hidden />
            <span>主企业码生成后<b>不可修改、不可重新生成</b>。请将企业码交付给首位管理员；管理员用「企业码 + 手机号 + 验证码」首次登录即完成激活（演示验证码 123456）。</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" className="tm-ghost-btn" onClick={() => void copyCode(created.tenant.primaryCode)}>
              {copyState === "ok" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              复制企业码
            </button>
            <button type="button" className="tm-ghost-btn" onClick={() => onOpenDetail(created.tenant.id)}>查看租户详情</button>
            <button type="button" className="tm-primary-btn" onClick={onClose}>返回列表</button>
          </div>
        </div>
      </Modal>
    );
  }

  const stepBody = (
    <>
      {step === 0 && (
        <div role="radiogroup" aria-label="选择租户类型" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {([
            { key: "pharma" as const, title: "药厂", desc: "药品上市许可持有人/生产企业；开通后可进行服务商准入审核、品种授权与人员备案", icon: <Factory size={22} /> },
            { key: "provider" as const, title: "服务提供商", desc: "推广服务企业；开通后可管理工作组与服务专员，需向药厂发起准入申请建立合作", icon: <Building2 size={22} /> },
          ]).map((opt) => {
            const selected = form.type === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={selected}
                className="tm-typecard"
                style={selected ? { borderColor: "var(--color-brand)", boxShadow: "0 0 0 3px rgba(47,107,206,0.12)" } : undefined}
                onClick={() => set({ type: opt.key })}
              >
                <span style={{ color: selected ? "var(--color-brand)" : "#6B7280" }}>{opt.icon}</span>
                <span style={{ fontSize: "var(--fs-15)", fontWeight: 600, color: "var(--color-text-1)" }}>{opt.title}</span>
                <span style={{ fontSize: "var(--fs-12)", color: "#6B7280", lineHeight: 1.6 }}>{opt.desc}</span>
                {selected && (
                  <span style={{ position: "absolute", top: 10, right: 10, color: "var(--color-brand)" }} aria-hidden>
                    <CheckCircle2 size={18} />
                  </span>
                )}
              </button>
            );
          })}
          <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: "var(--fs-12)", color: "#9CA3AF", lineHeight: 1.7 }}>
            药厂与服务商共用同一套开户与企业码生成机制，类型仅影响扩展资质字段、默认管理员角色与后续业务权限；企业码本身不含类型等业务含义。
          </p>
        </div>
      )}

      {step === 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", columnGap: 16, rowGap: 16 }}>
          <Field id="wf-legalName" label="企业法定名称" required error={errors.legalName} hint="失焦或点「查询」自动带出信用代码与注册地址">
            <div style={{ display: "flex", gap: 8 }}>
              <input
                {...inputProps("wf-legalName", errors.legalName)}
                value={form.legalName}
                onChange={(e) => set({ legalName: e.target.value })}
                onBlur={(e) => runAddressLookup(e.currentTarget.value)}
                placeholder="与营业执照一致"
              />
              <button
                type="button"
                className="tm-ghost-btn"
                style={{ height: 40, flexShrink: 0 }}
                disabled={addrLookup.status === "searching"}
                onClick={() => runAddressLookup(form.legalName)}
                title="按企业名称查询工商登记信息（演示模拟企查查）"
              >
                {addrLookup.status === "searching"
                  ? <LoaderCircle size={14} style={{ animation: "spin 0.7s linear infinite" }} aria-hidden />
                  : <Search size={14} aria-hidden />}
                查询
              </button>
            </div>
          </Field>
          <Field
            id="wf-uscc"
            label="统一社会信用代码"
            required
            error={errors.uscc}
            hint={addrLookup.status === "found" ? "已按企业名称自动带出（工商登记 · 演示模拟），可核对修改" : "18 位，全局查重"}
          >
            <input
              {...inputProps("wf-uscc", errors.uscc)}
              className="tm-field font-mono-nums"
              value={form.uscc}
              onChange={(e) => {
                set({ uscc: e.target.value.toUpperCase() });
                if (addrLookup.status !== "idle") setAddrLookup({ status: "idle", key: "" });
              }}
              placeholder="91320191MA4WQ7LR8C"
              maxLength={18}
              style={{ ...fieldInput, letterSpacing: "0.04em", ...(errors.uscc ? { borderColor: "#DC2626" } : {}) }}
            />
          </Field>
          <Field
            id="wf-address"
            label="企业注册地址"
            required
            error={errors.address}
            hint={
              addrLookup.status === "searching" ? `正在按「${addrLookup.key}」查询工商登记信息…`
                : addrLookup.status === "found" ? "已按企业名称自动带出（工商登记 · 演示模拟），可核对修改"
                : addrLookup.status === "notfound" ? `未查询到「${addrLookup.key}」的工商登记信息，请手动填写`
                : "填写企业名称后自动带出，也可手动填写"
            }
          >
            <input
              {...inputProps("wf-address", errors.address)}
              value={form.address}
              onChange={(e) => {
                set({ address: e.target.value });
                if (addrLookup.status !== "idle") setAddrLookup({ status: "idle", key: "" });
              }}
              placeholder="省市 + 详细地址"
            />
          </Field>
          <Field id="wf-contactName" label="企业联系人姓名" required error={errors.contactName}>
            <input {...inputProps("wf-contactName", errors.contactName)} value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} />
          </Field>
          <Field id="wf-contactPhone" label="企业联系人手机号" required error={errors.contactPhone}>
            <input {...inputProps("wf-contactPhone", errors.contactPhone)} className="tm-field font-mono-nums" value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value.replace(/\D/g, "") })} maxLength={11} placeholder="11 位手机号" style={{ ...fieldInput, ...(errors.contactPhone ? { borderColor: "#DC2626" } : {}) }} />
          </Field>
          <Field
            id="wf-license"
            label="营业执照或证明材料（选填）"
            hint="选填；原型使用模拟附件，不产生真实文件"
          >
            <div style={{ display: "flex", gap: 8 }}>
              <input {...inputProps("wf-license")} value={form.licenseAttachment} readOnly placeholder="未选择材料" style={{ ...fieldInput, background: "#F9FAFB" }} />
              <button type="button" className="tm-ghost-btn" style={{ height: 40, flexShrink: 0 }} onClick={() => set({ licenseAttachment: `营业执照-${form.legalName || "新租户"}.pdf（模拟附件）` })}>
                模拟上传
              </button>
              {form.licenseAttachment && (
                <button type="button" className="tm-ghost-btn" style={{ height: 40, flexShrink: 0 }} onClick={() => set({ licenseAttachment: "" })} aria-label="清除已上传材料">
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>
          </Field>
          <Field id="wf-remark" label="备注" hint="选填">
            <input id="wf-remark" className="tm-field" style={fieldInput} value={form.remark} onChange={(e) => set({ remark: e.target.value })} placeholder="补充说明（选填）" />
          </Field>

          {form.type === "pharma" ? (
            <>
              <Field id="wf-pharmaCategory" label="主体分类" hint="选填">
                <select id="wf-pharmaCategory" className="tm-field" style={fieldInput} value={form.pharmaCategory} onChange={(e) => set({ pharmaCategory: e.target.value })}>
                  <option value="">请选择（选填）</option>
                  {PHARMA_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field id="wf-mah" label="药品上市许可持有人 / 生产企业标识" required>
                <select id="wf-mah" className="tm-field" style={fieldInput} value={form.mahHolderFlag ? "yes" : "no"} onChange={(e) => set({ mahHolderFlag: e.target.value === "yes" })}>
                  <option value="yes">是 · 上市许可持有人（MAH）</option>
                  <option value="no">否 · 受托生产企业</option>
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field id="wf-bizOwner" label="业务负责人" required error={errors.bizOwner}>
                <input {...inputProps("wf-bizOwner", errors.bizOwner)} value={form.bizOwner} onChange={(e) => set({ bizOwner: e.target.value })} />
              </Field>
              <Field id="wf-complianceOwner" label="合规负责人" required error={errors.complianceOwner}>
                <input {...inputProps("wf-complianceOwner", errors.complianceOwner)} value={form.complianceOwner} onChange={(e) => set({ complianceOwner: e.target.value })} />
              </Field>
              <Field id="wf-qualificationNo" label="相关资质编号" hint="按原型需要模拟，选填">
                <input id="wf-qualificationNo" className="tm-field" value={form.qualificationNo} style={fieldInput} onChange={(e) => set({ qualificationNo: e.target.value })} />
              </Field>
              <Field id="wf-qualificationValidTo" label="资质有效期至" hint="按原型需要模拟，选填">
                <input id="wf-qualificationValidTo" className="tm-field font-mono-nums" style={fieldInput} type="date" value={form.qualificationValidTo} onChange={(e) => set({ qualificationValidTo: e.target.value })} />
              </Field>
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", columnGap: 16, rowGap: 16 }}>
          <Field
            id="wf-package"
            label="租户套餐"
            required
            error={errors.packageId}
            hint="决定该租户可见的功能菜单；创建后可在详情页更换"
          >
            <select
              {...inputProps("wf-package", errors.packageId)}
              value={form.packageId}
              onChange={(e) => set({ packageId: e.target.value })}
            >
              <option value="">请选择租户套餐</option>
              {listTenantPackages().filter((p) => p.status === "enabled").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.isDefault ? "（默认）" : ""} · {p.menuIds.length} 项功能
                </option>
              ))}
            </select>
          </Field>
          <Field id="wf-expireAt" label="开通有效期至" hint="留空 = 永久有效；到期后该租户登录被拒绝">
            <input
              id="wf-expireAt"
              className="tm-field font-mono-nums"
              style={fieldInput}
              type="date"
              value={form.expireAt}
              onChange={(e) => set({ expireAt: e.target.value })}
            />
          </Field>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", columnGap: 16, rowGap: 16 }}>
            <Field id="wf-adminName" label="管理员姓名" required error={errors.adminName}>
              <input {...inputProps("wf-adminName", errors.adminName)} value={form.adminName} onChange={(e) => set({ adminName: e.target.value })} />
            </Field>
            <Field
              id="wf-adminAccount"
              label="登录账号"
              error={errors.adminAccount}
              hint="用于账号密码登录，企业内唯一；随手机号预填可修改"
            >
              <input
                {...inputProps("wf-adminAccount", errors.adminAccount)}
                className="tm-field"
                value={form.adminAccount}
                onChange={(e) => set({ adminAccount: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                maxLength={20}
                placeholder="如 rt-0116"
              />
            </Field>
            <Field id="wf-adminPhone" label="管理员手机号" required error={errors.adminPhone} hint="仅代表联系方式控制权，不作为租户主键；首位登录后自动激活">
              <input
                {...inputProps("wf-adminPhone", errors.adminPhone)}
                className="tm-field font-mono-nums"
                value={form.adminPhone}
                onChange={(e) => {
                  const phone = e.target.value.replace(/\D/g, "");
                  // 登录账号跟随手机号预填，但用户改过（≠旧预填值）则不打扰
                  const previousAuto = defaultRuntimeAccount(form.adminPhone);
                  const nextAccount = !form.adminAccount || form.adminAccount === previousAuto
                    ? defaultRuntimeAccount(phone)
                    : form.adminAccount;
                  set({ adminPhone: phone, adminAccount: nextAccount });
                }}
                maxLength={11}
                placeholder="11 位手机号"
                style={{ ...fieldInput, ...(errors.adminPhone ? { borderColor: "#DC2626" } : {}) }}
              />
            </Field>
            <Field id="wf-adminRole" label="管理员角色" hint="由租户类型自动确定，不可修改">
              <input id="wf-adminRole" className="tm-field" style={{ ...fieldInput, background: "#F9FAFB" }} value={form.type === "pharma" ? "企业管理员" : "服务商管理员"} readOnly />
            </Field>
          </div>
          <dl className="tm-confirm-grid">
            <dt>租户类型</dt><dd>{TENANT_TYPE_LABEL[form.type]}</dd>
            <dt>企业法定名称</dt><dd>{form.legalName || "—"}</dd>
            <dt>统一社会信用代码</dt><dd className="font-mono-nums">{form.uscc || "—"}</dd>
            <dt>企业联系人</dt><dd>{form.contactName || "—"} · <span className="font-mono-nums">{form.contactPhone || "—"}</span></dd>
            <dt>绑定套餐</dt>
            <dd>
              {(() => {
                const pkg = listTenantPackages().find((p) => p.id === form.packageId);
                return pkg ? `${pkg.name} · ${pkg.menuIds.length} 项功能` : "—";
              })()}
            </dd>
            <dt>开通有效期</dt>
            <dd className="font-mono-nums">{form.expireAt || "永久有效"}</dd>
            <dt>首位管理员</dt><dd>{form.adminName || "—"} · <span className="font-mono-nums">{form.adminAccount || (form.adminPhone ? defaultRuntimeAccount(form.adminPhone) : "—")}</span> · <span className="font-mono-nums">{form.adminPhone || "—"}</span></dd>
          </dl>
          <div className="tm-note tm-note--brand" role="note">
            <ShieldCheck size={14} aria-hidden />
            <span>确认创建后，系统将生成<b>不可修改的主企业码</b>，并创建首位管理员<b>待激活</b>账号；租户初始状态为「待激活」，首位管理员首次登录（短信验证码或账号密码）通过后自动激活。</span>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <Modal
        open
        title="新建租户"
        width={720}
        onClose={() => {
          if (busy) return; // 提交中阻止误关闭
          if (dirty) setConfirmDiscard(true);
          else onClose();
        }}
      >
        {/* 步骤条 */}
        <ol className="tm-steps" aria-label="向导步骤">
          {steps.map((label, i) => (
            <li key={label} className={`tm-step${i < step ? " tm-step--done" : ""}${i === step ? " tm-step--active" : ""}`} aria-current={i === step ? "step" : undefined}>
              <span className="tm-stepnum" aria-hidden>{i < step ? "✓" : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div style={{ minHeight: 200 }}>{stepBody}</div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" className="tm-ghost-btn" disabled={busy || step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            <ChevronLeft size={14} aria-hidden />
            上一步
          </button>
          <button
            type="button"
            className="tm-primary-btn"
            disabled={busy}
            onClick={() => {
              if (step < 3) {
                if (validateStep(step)) setStep((s) => s + 1);
                return;
              }
              if (validateStep(3)) void submit();
            }}
          >
            {busy ? (
              <LoaderCircle size={15} style={{ animation: "spin 0.7s linear infinite" }} aria-hidden />
            ) : step < 3 ? (
              <ChevronRight size={15} aria-hidden />
            ) : (
              <Check size={15} aria-hidden />
            )}
            {busy ? "正在创建租户并生成企业码…" : step < 3 ? "下一步" : "确认创建"}
          </button>
        </div>
      </Modal>

      {confirmDiscard && (
        <Modal open title="放弃本次填写？" width={420} onClose={() => setConfirmDiscard(false)}>
          <p style={{ margin: "0 0 16px", fontSize: "var(--fs-14)", color: "#374151", lineHeight: 1.7 }}>
            向导中已填写的资料尚未创建租户，放弃后将丢失本次输入。
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="tm-ghost-btn" onClick={() => setConfirmDiscard(false)}>继续填写</button>
            <button type="button" className="tm-danger-btn" onClick={() => { setConfirmDiscard(false); onClose() }}>放弃</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── 租户详情抽屉 ────────────────────────────────────────────────────────────

function TenantDetailDrawer({
  tenantId, actor, onClose, addToast, flushAudits,
}: {
  tenantId: string;
  actor: string;
  onClose: () => void;
  addToast: (msg: { type: "success" | "error" | "info"; title: string; description?: string }) => void;
  flushAudits: (audits: { reasonCode: string; targetTenant: string; code?: string; detail?: string }[]) => void;
}) {
  const registry = useSyncExternalStore(subscribeTenantRegistry, getTenantRegistrySnapshot);
  // 套餐池/绑定变更联动（packageOfTenant 读双 store）
  useSyncExternalStore(subscribeTenantPackages, getTenantPackagesSnapshot);
  const tenant = registry.tenants.find((t) => t.id === tenantId);
  const [busy, setBusy] = useState<string | null>(null);

  // 状态操作弹窗（暂停/恢复/终止均要求原因码 + 说明）
  const [statusAction, setStatusAction] = useState<"suspend" | "resume" | "terminate" | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [reasonErr, setReasonErr] = useState<string | null>(null);

  const [adminChangeOpen, setAdminChangeOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ name: "", account: "", phone: "", reason: "" });
  const [adminErr, setAdminErr] = useState<Record<string, string>>({});

  // 更换套餐弹窗
  const [pkgChangeOpen, setPkgChangeOpen] = useState(false);
  const [pkgChoice, setPkgChoice] = useState("");
  const [pkgErr, setPkgErr] = useState<string | null>(null);

  // 详情内容卡片选项卡
  const [detailTab, setDetailTab] = useState<"package" | "profile" | "admin" | "log">("package");
  useEffect(() => {
    setDetailTab("package");
  }, [tenantId]);

  if (!tenant) return null;
  const p = tenant.profile;
  const pkg = packageOfTenant(tenant.id);
  const expired = tenantExpired(tenant);

  // 汇总本租户的操作日志（实时操作流水 + 种子租户的初始基线记录）
  const tenantLog = (() => {
    const rawLogs = registry.activityLog.filter(
      (l) => l.targetTenant === tenant.shortName || l.code === tenant.primaryCode,
    );
    const hasCreated = rawLogs.some((l) => l.reasonCode === "TENANT_CREATED");
    if (hasCreated) return rawLogs;
    const seedBaseline: TenantAuditLine[] = [];
    if (
      tenant.status === "terminated" &&
      !rawLogs.some((l) => l.reasonCode === "TENANT_TERMINATED")
    ) {
      seedBaseline.push({
        id: `seed-term-${tenant.id}`,
        at: tenant.statusChangedAt,
        actor: tenant.createdBy,
        reasonCode: "TENANT_TERMINATED",
        targetTenant: tenant.shortName,
        code: tenant.primaryCode,
        detail: `${tenant.statusReasonCode ? statusReasonLabel(tenant.statusReasonCode) : "合作协议终止"}${tenant.statusNote ? `：${tenant.statusNote}` : ""} · 主企业码永久停用（retired）`,
      });
    } else if (
      tenant.status === "suspended" &&
      !rawLogs.some((l) => l.reasonCode === "TENANT_SUSPENDED")
    ) {
      seedBaseline.push({
        id: `seed-susp-${tenant.id}`,
        at: tenant.statusChangedAt,
        actor: tenant.createdBy,
        reasonCode: "TENANT_SUSPENDED",
        targetTenant: tenant.shortName,
        code: tenant.primaryCode,
        detail: `${tenant.statusReasonCode ? statusReasonLabel(tenant.statusReasonCode) : "合作协议暂停"}${tenant.statusNote ? `：${tenant.statusNote}` : ""}`,
      });
    }
    if (
      tenant.initialAdmin.memberStatus === "active" &&
      !rawLogs.some((l) => l.reasonCode === "TENANT_ACTIVATED")
    ) {
      seedBaseline.push({
        id: `seed-act-${tenant.id}`,
        at: tenant.initialAdmin.activatedAt ?? tenant.statusChangedAt,
        actor: tenant.initialAdmin.name,
        reasonCode: "TENANT_ACTIVATED",
        targetTenant: tenant.shortName,
        code: tenant.primaryCode,
        detail: `首位管理员「${tenant.initialAdmin.name}」首次登录完成激活，租户转为正常状态`,
      });
    }
    seedBaseline.push({
      id: `seed-create-${tenant.id}`,
      at: tenant.createdAt,
      actor: tenant.createdBy,
      reasonCode: "TENANT_CREATED",
      targetTenant: tenant.shortName,
      code: tenant.primaryCode,
      detail: `${TENANT_TYPE_LABEL[tenant.type]} · 生成主企业码 ${tenant.primaryCode} · 预置首位管理员 ${tenant.initialAdmin.name}（${maskPhone(tenant.initialAdmin.phone)}）`,
    });
    return [...rawLogs, ...seedBaseline];
  })();

  const copyCode = async (code: string) => {
    const ok = await copyTextWithFallback(code);
    if (ok) {
      flushAudits([auditCodeCopy(code, actor)]);
      addToast({ type: "success", title: "企业码已复制，并已记录操作日志" });
    } else {
      addToast({ type: "error", title: "复制失败", description: "请手动选中文本复制。" });
    }
  };

  const run = async (key: string, fn: () => void) => {
    setBusy(key);
    await new Promise((r) => setTimeout(r, 550));
    fn();
    setBusy(null);
  };

  const openStatusAction = (action: "suspend" | "resume" | "terminate") => {
    const first =
      action === "suspend" ? SUSPEND_REASON_OPTIONS[0].code
        : action === "resume" ? RESUME_REASON_OPTIONS[0].code
          // 待激活终止默认「开户作废」；已暂停终止默认「合作协议终止」
          : tenant.status === "pending_activation"
            ? TERMINATE_REASON_OPTIONS.find((o) => o.code === "OPENING_VOIDED")?.code ?? TERMINATE_REASON_OPTIONS[0].code
            : TERMINATE_REASON_OPTIONS.find((o) => o.code === "CONTRACT_ENDED")?.code ?? TERMINATE_REASON_OPTIONS[0].code
    setReasonCode(first as string);
    setReasonNote("");
    setReasonErr(null);
    setStatusAction(action);
  };

  const runStatusAction = () => {
    if (!reasonNote.trim()) {
      setReasonErr("请填写说明（必填，随审计记录保留）");
      return;
    }
    const action = statusAction;
    setStatusAction(null);
    if (!action) return;
    void run(action, () => {
      const r =
        action === "suspend"
          ? suspendTenant(tenant.id, reasonCode, reasonNote.trim(), actor)
          : action === "resume"
            ? resumeTenant(tenant.id, reasonCode, reasonNote.trim(), actor)
            : terminateTenant(tenant.id, reasonCode, reasonNote.trim(), actor)
      if (r.ok) {
        flushAudits(r.audits);
        const titles = { suspend: "租户已暂停", resume: "租户已恢复", terminate: "租户已终止" } as const
        addToast({ type: "success", title: titles[action], description: "原因与说明已写入操作日志。" });
      }
    });
  };

  const reasonOptions =
    statusAction === "suspend" ? SUSPEND_REASON_OPTIONS : statusAction === "resume" ? RESUME_REASON_OPTIONS : TERMINATE_REASON_OPTIONS;

  return (
    <>
      <Modal open title={`租户详情 · ${tenant.legalName}`} width={720} onClose={onClose}>
        {/* 页头卡：企业身份 + 主企业码 + 状态元信息在左，生命周期动作在右 */}
        <div className="tm-detail-head">
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <div style={{ fontSize: "var(--fs-16)", fontWeight: 600, color: "var(--color-text-1)", lineHeight: 1.4 }} title={tenant.legalName}>{tenant.legalName}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
              <span className="tm-chip">{TENANT_TYPE_LABEL[tenant.type]}</span>
              <StatusPill status={tenant.status} />
              <CodeText code={tenant.primaryCode} />
              <button type="button" className="tm-icon-btn" aria-label="复制主企业码" title="复制主企业码" onClick={() => void copyCode(tenant.primaryCode)}>
                <Copy size={13} aria-hidden />
              </button>
              {tenant.status === "terminated" && <span className="tm-chip tm-chip--muted">已退役 · 永久停用</span>}
            </div>
            {tenant.statusReasonCode && (
              <div style={{ marginTop: 8, fontSize: "var(--fs-12)", color: "#6B7280", lineHeight: 1.7 }}>
                最近原因：{statusReasonLabel(tenant.statusReasonCode)}{tenant.statusNote ? `（${tenant.statusNote}）` : ""}
              </div>
            )}
            <div style={{ marginTop: 2, fontSize: "var(--fs-12)", color: "#9CA3AF", lineHeight: 1.7 }}>
              主企业码全局唯一、系统生成，仅可查看和复制；租户终止后永久保留且不得分配给其他企业。
            </div>
          </div>
          {/* 生命周期主操作（变更首位管理员在「管理员信息」选项卡） */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {tenant.status === "pending_activation" && (
              <button type="button" className="tm-danger-btn" disabled={busy !== null} onClick={() => openStatusAction("terminate")}>
                <Ban size={14} aria-hidden />
                终止租户
              </button>
            )}
            {tenant.status === "active" && (
              <>
                <button type="button" className="tm-warn-btn" disabled={busy !== null} onClick={() => openStatusAction("suspend")}>
                  <PauseCircle size={14} aria-hidden />
                  暂停租户
                </button>
                <button type="button" className="tm-danger-btn" disabled={busy !== null} onClick={() => openStatusAction("terminate")}>
                  <Ban size={14} aria-hidden />
                  终止租户
                </button>
              </>
            )}
            {tenant.status === "suspended" && (
              <>
                <button type="button" className="tm-primary-btn" disabled={busy !== null} onClick={() => openStatusAction("resume")}>
                  <PlayCircle size={14} aria-hidden />
                  恢复租户
                </button>
                <button type="button" className="tm-danger-btn" disabled={busy !== null} onClick={() => openStatusAction("terminate")}>
                  <Ban size={14} aria-hidden />
                  终止租户
                </button>
              </>
            )}
          </div>
        </div>

        {/* 内容选项卡：套餐与开通 / 主体资料 / 管理员信息 / 操作日志 */}
        <div className="tm-tabs" role="tablist" aria-label="租户详情内容分区">
          {([
            ["package", "套餐与开通"],
            ["profile", "主体资料"],
            ["admin", "管理员信息"],
            ["log", "操作日志"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              id={`tm-detail-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={detailTab === key}
              aria-controls={`tm-detail-panel-${key}`}
              className={detailTab === key ? "tm-tab tm-tab--active" : "tm-tab"}
              onClick={() => setDetailTab(key)}
            >
              {label}
              {key === "log" && (
                <span
                  className="font-mono-nums"
                  style={{
                    marginLeft: 5,
                    padding: "1px 6px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: detailTab === "log" ? "rgba(47, 107, 206, 0.12)" : "#F3F4F6",
                    color: detailTab === "log" ? "var(--color-brand, #2F6BCE)" : "#6B7280",
                  }}
                >
                  {tenantLog.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div>
          {/* 选项卡 1：套餐与开通（动作在卡头右侧） */}
          {detailTab === "package" && (
            <section
              id="tm-detail-panel-package"
              role="tabpanel"
              aria-labelledby="tm-detail-tab-package"
              className="tm-sec"
            >
              <div className="tm-sec-head">
                <h4 className="tm-sec-title">套餐与开通</h4>
                {tenant.status !== "terminated" && (
                  <button
                    type="button"
                    className="tm-ghost-btn tm-btn-sm"
                    disabled={busy !== null}
                    onClick={() => {
                      const current = packageOfTenant(tenant.id);
                      setPkgChoice(current?.id ?? "");
                      setPkgErr(null);
                      setPkgChangeOpen(true);
                    }}
                  >
                    <RefreshCw size={13} aria-hidden />
                    更换套餐
                  </button>
                )}
              </div>
              <dl className="tm-confirm-grid">
                <dt>绑定套餐</dt>
                <dd>
                  {pkg ? `${pkg.name} · ${pkg.menuIds.length} 项功能` : "—"}
                  {!tenant.packageId && <span className="tm-sub">（未显式绑定，按默认套餐回落开通）</span>}
                </dd>
                <dt>开通有效期</dt>
                <dd className="font-mono-nums" style={expired ? { color: "#C73A3A" } : undefined}>
                  {tenant.expireAt ? (expired ? `已过期（${tenant.expireAt} 起）` : `至 ${tenant.expireAt}`) : "永久有效"}
                </dd>
              </dl>
            </section>
          )}

          {/* 选项卡 2：主体资料（工商登记信息，只读） */}
          {detailTab === "profile" && (
            <section
              id="tm-detail-panel-profile"
              role="tabpanel"
              aria-labelledby="tm-detail-tab-profile"
              className="tm-sec"
            >
              <div className="tm-sec-head">
                <h4 className="tm-sec-title">主体资料</h4>
                <span className="tm-sub" style={{ marginTop: 0 }}>创建后只读</span>
              </div>
              <dl className="tm-confirm-grid">
                <dt>企业法定名称</dt><dd>{tenant.legalName}</dd>
                <dt>统一社会信用代码</dt><dd className="font-mono-nums">{tenant.uscc}</dd>
                <dt>注册地址</dt><dd>{p.address}</dd>
                <dt>企业联系人</dt><dd>{p.contactName} · <span className="font-mono-nums" style={{ fontWeight: 400 }}>{p.contactPhone}</span></dd>
                <dt>创建时间 / 创建人</dt><dd className="font-mono-nums">{tenant.createdAt} · {tenant.createdBy}</dd>
                {tenant.type === "pharma" ? (
                  <>
                    <dt>主体分类</dt><dd>{p.pharmaCategory || "—"}（{p.mahHolderFlag ? "MAH 持有人" : "受托生产"}）</dd>
                  </>
                ) : (
                  <>
                    <dt>业务负责人</dt><dd>{p.bizOwner || "—"}</dd>
                    <dt>合规负责人</dt><dd>{p.complianceOwner || "—"}</dd>
                    <dt>资质编号</dt><dd>{p.qualificationNo || "—"}{p.qualificationValidTo ? ` · 至 ${p.qualificationValidTo}` : ""}</dd>
                  </>
                )}
                <dt>证明材料</dt><dd>{p.licenseAttachment || "未上传（选填）"}</dd>
                {p.remark && (<><dt>备注</dt><dd>{p.remark}</dd></>)}
              </dl>
            </section>
          )}

          {/* 选项卡 3：管理员信息（动作在卡头右侧） */}
          {detailTab === "admin" && (
            <section
              id="tm-detail-panel-admin"
              role="tabpanel"
              aria-labelledby="tm-detail-tab-admin"
              className="tm-sec"
            >
              <div className="tm-sec-head">
                <h4 className="tm-sec-title">管理员信息</h4>
                {tenant.status === "pending_activation" && (
                  <button type="button" className="tm-ghost-btn tm-btn-sm" disabled={busy !== null} onClick={() => { setAdminForm({ name: "", account: "", phone: "", reason: "" }); setAdminErr({}); setAdminChangeOpen(true) }}>
                    <UserCog size={13} aria-hidden />
                    变更
                  </button>
                )}
              </div>
              <dl className="tm-confirm-grid">
                <dt>姓名</dt><dd>{tenant.initialAdmin.name}</dd>
                <dt>手机号</dt><dd className="font-mono-nums">{maskPhone(tenant.initialAdmin.phone)}</dd>
                <dt>管理员角色</dt><dd>{tenant.initialAdmin.roleLabel}</dd>
                <dt>成员状态</dt><dd>{tenant.initialAdmin.memberStatus === "pending_activation" ? "待激活（首次登录自动激活）" : `已激活 · ${tenant.initialAdmin.activatedAt ?? "—"}`}</dd>
              </dl>
              {tenant.status === "pending_activation" && (
                <div className="tm-sec-foot">
                  <span style={{ fontSize: "var(--fs-12)", color: "#9CA3AF", lineHeight: 1.7 }}>
                    仅待激活阶段可变更；租户激活后由该企业管理员自行维护企业成员，软件服务方不代配企业内部权限。
                  </span>
                </div>
              )}
            </section>
          )}

          {/* 选项卡 4：操作日志（生命周期与配置变更记录） */}
          {detailTab === "log" && (
            <section
              id="tm-detail-panel-log"
              role="tabpanel"
              aria-labelledby="tm-detail-tab-log"
              className="tm-sec"
            >
              <div className="tm-sec-head">
                <h4 className="tm-sec-title">操作日志</h4>
                <span className="tm-sub" style={{ marginTop: 0 }}>
                  共 {tenantLog.length} 条记录 · 按时间倒序
                </span>
              </div>
              {tenantLog.length === 0 ? (
                <div className="tm-empty-inline" style={{ marginTop: 8 }}>
                  暂无本租户的操作记录。
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, maxHeight: 360, overflowY: "auto" }}>
                  {tenantLog.map((l) => {
                    const chipTone =
                      l.reasonCode === "TENANT_TERMINATED"
                        ? "tm-chip tm-chip--danger"
                        : l.reasonCode === "TENANT_SUSPENDED"
                          ? "tm-chip tm-chip--warn"
                          : l.reasonCode === "TENANT_REACTIVATED" || l.reasonCode === "TENANT_ACTIVATED"
                            ? "tm-chip tm-chip--ok"
                            : "tm-chip tm-chip--primary";
                    const dotColor =
                      l.reasonCode === "TENANT_TERMINATED"
                        ? "#C73A3A"
                        : l.reasonCode === "TENANT_SUSPENDED"
                          ? "#B45309"
                          : l.reasonCode === "TENANT_REACTIVATED" || l.reasonCode === "TENANT_ACTIVATED"
                            ? "#15803D"
                            : "#2F6BCE";
                    return (
                      <div
                        key={l.id}
                        className="tm-history-item"
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          padding: "10px 12px",
                          background: "#FAFAFA",
                          border: "1px solid #F3F4F6",
                          borderRadius: 8,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: dotColor,
                            marginTop: 7,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span className={chipTone}>
                                {AUDIT_ACTION_LABEL[l.reasonCode] ?? "租户管理操作"}
                              </span>
                              <span className="tm-chip font-mono-nums" style={{ fontSize: 11, padding: "1px 8px" }}>
                                {l.reasonCode}
                              </span>
                            </div>
                            <span className="font-mono-nums" style={{ fontSize: "var(--fs-12)", color: "#6B7280" }}>
                              {l.actor} · {l.at}
                            </span>
                          </div>
                          {l.detail && (
                            <div style={{ marginTop: 6, fontSize: "var(--fs-13)", color: "#374151", lineHeight: 1.6 }}>
                              {l.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {tenant.status === "terminated" && (
            <div className="tm-note tm-note--warn" role="note" style={{ marginTop: 12 }}>
              <Ban size={14} aria-hidden />
              <span>该租户已终止：只读查看，不能恢复；主企业码 {tenant.primaryCode} 永久保留且不得分配给其他企业。</span>
            </div>
          )}
        </div>
      </Modal>

      {/* 更换套餐（即时生效，写审计） */}
      {pkgChangeOpen && (
        <Modal
          open
          title={`更换套餐 · ${tenant.legalName}`}
          width={480}
          onClose={() => { if (busy === null) setPkgChangeOpen(false) }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(() => {
              const current = packageOfTenant(tenant.id);
              const options = listTenantPackages().filter((p) => p.status === "enabled");
              const target = options.find((p) => p.id === pkgChoice);
              return (
                <>
                  <p style={{ margin: 0, fontSize: "var(--fs-14)", color: "#374151", lineHeight: 1.7 }}>
                    当前套餐：<b>{current?.name ?? "—"}</b>（{current?.menuIds.length ?? 0} 项功能）。
                    换绑后该租户用户的可见菜单<b>即时</b>按新套餐裁剪/恢复；已停用套餐不可选。
                  </p>
                  <div>
                    <label htmlFor="pkg-choice" style={fieldLabel}>
                      目标套餐<span style={{ color: "#C73A3A", marginLeft: 2 }} aria-hidden>*</span>
                    </label>
                    <select
                      id="pkg-choice"
                      className="tm-field"
                      value={pkgChoice}
                      onChange={(e) => { setPkgChoice(e.target.value); setPkgErr(null) }}
                      style={fieldInput}
                    >
                      <option value="">请选择目标套餐</option>
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.isDefault ? "（默认）" : ""} · {p.menuIds.length} 项功能
                        </option>
                      ))}
                    </select>
                    {target?.remark && <div style={{ fontSize: "var(--fs-12)", color: "#9CA3AF", marginTop: 4 }}>{target.remark}</div>}
                    {pkgErr && (
                      <div role="alert" style={errPill}>
                        <AlertTriangle size={13} aria-hidden />
                        {pkgErr}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button type="button" className="tm-ghost-btn" disabled={busy !== null} onClick={() => setPkgChangeOpen(false)}>取消</button>
                    <button
                      type="button"
                      className="tm-primary-btn"
                      disabled={busy !== null}
                      onClick={() => {
                        const targetPkg = listTenantPackages().find((x) => x.id === pkgChoice);
                        if (!targetPkg) {
                          setPkgErr("请选择目标套餐");
                          return;
                        }
                        if (targetPkg.id === current?.id) {
                          setPkgErr("目标套餐与当前一致，无需换绑");
                          return;
                        }
                        void run("pkg", () => {
                          const r = changeTenantPackage(tenant.id, targetPkg.id, targetPkg.name, actor);
                          if (r.ok) {
                            flushAudits(r.audits);
                            setPkgChangeOpen(false);
                            addToast({ type: "success", title: "套餐已更换", description: `「${tenant.legalName}」已换绑「${targetPkg.name}」，该租户菜单即时生效。` });
                          } else {
                            addToast({ type: "error", title: "换绑失败", description: r.error });
                          }
                        });
                      }}
                    >
                      <RefreshCw size={14} aria-hidden />
                      确认换绑
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* 状态操作：暂停 / 恢复 / 终止（原因码 + 说明均必填，写审计） */}
      {statusAction && (
        <Modal
          open
          title={`${statusAction === "suspend" ? "暂停" : statusAction === "resume" ? "恢复" : "终止"}租户 · ${tenant.legalName}`}
          width={480}
          onClose={() => { if (busy === null) setStatusAction(null) }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {statusAction === "terminate" && (
              <div className="tm-note tm-note--warn" role="note">
                <AlertTriangle size={14} aria-hidden />
                <span>
                  终止后<b>不可恢复</b>，主企业码 {tenant.primaryCode} 永久停用（retired），历史记录保留。
                  {tenant.status === "pending_activation" && "该租户尚未激活，终止即开户作废，首位管理员的待激活邀请一并失效。"}
                  {tenant.status === "active" && "该租户当前处于正常使用状态，终止后所有在册成员将立即被阻断登录。"}
                </span>
              </div>
            )}
            {statusAction === "suspend" && (
              <div className="tm-note tm-note--warn" role="note">
                <AlertTriangle size={14} aria-hidden />
                <span>暂停后该租户成员将无法新登录，主企业码暂停解析；历史数据不删除。恢复后按成员、角色与业务授权当前状态重新计算权限。</span>
              </div>
            )}
            {statusAction === "resume" && (
              <div className="tm-note tm-note--brand" role="note">
                <ShieldCheck size={14} aria-hidden />
                <span>恢复后主企业码立即恢复登录解析；成员仍需满足有效账号和角色授权条件，权限按当前状态重新计算。</span>
              </div>
            )}
            <div>
              <label htmlFor="st-reason" style={fieldLabel}>原因（标准原因码）<span style={{ color: "#C73A3A", marginLeft: 2 }} aria-hidden>*</span></label>
              <select id="st-reason" className="tm-field" style={fieldInput} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                {reasonOptions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="st-note" style={fieldLabel}>说明<span style={{ color: "#C73A3A", marginLeft: 2 }} aria-hidden>*</span></label>
              <textarea
                id="st-note"
                className="tm-field"
                style={{ ...fieldInput, height: 84, padding: "8px 12px", resize: "vertical", ...(reasonErr ? { borderColor: "#DC2626" } : {}) }}
                value={reasonNote}
                aria-invalid={Boolean(reasonErr)}
                aria-describedby={reasonErr ? "err-st-note" : undefined}
                onChange={(e) => { setReasonNote(e.target.value); if (reasonErr) setReasonErr(null) }}
                placeholder="必填；随审计记录保留（含受影响成员范围），不向登录侧外显内部审批意见"
              />
              {reasonErr && (
                <div id="err-st-note" style={errPill} role="alert">
                  <AlertTriangle size={13} aria-hidden />
                  {reasonErr}
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="tm-ghost-btn" disabled={busy !== null} onClick={() => setStatusAction(null)}>取消</button>
              <button
                type="button"
                className={statusAction === "resume" ? "tm-primary-btn" : "tm-danger-btn"}
                disabled={busy !== null}
                onClick={runStatusAction}
              >
                {busy === statusAction ? <LoaderCircle size={14} style={{ animation: "spin 0.7s linear infinite" }} aria-hidden /> : null}
                确认{statusAction === "suspend" ? "暂停" : statusAction === "resume" ? "恢复" : "终止"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 变更首位管理员（必填变更原因） */}
      {adminChangeOpen && (
        <Modal open title="变更首位管理员" width={460} onClose={() => { if (busy === null) setAdminChangeOpen(false) }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="tm-note tm-note--warn" role="note">
              <AlertTriangle size={14} aria-hidden />
              <span>变更后旧邀请立即失效（旧账号停用、预置授权回收），新管理员获得新的待激活关系；租户保持「待激活」状态，全过程写审计。</span>
            </div>
            <Field id="ca-name" label="新管理员姓名" required error={adminErr.name}>
              <input {...inputProps("ca-name", adminErr.name)} value={adminForm.name} onChange={(e) => setAdminForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field
              id="ca-account"
              label="登录账号"
              required
              error={adminErr.account}
              hint="企业内唯一；随手机号预填可修改，用于账号密码登录"
            >
              <input
                {...inputProps("ca-account", adminErr.account)}
                className="tm-field"
                value={adminForm.account}
                onChange={(e) => setAdminForm((f) => ({ ...f, account: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") }))}
                maxLength={20}
                style={{ ...fieldInput, ...(adminErr.account ? { borderColor: "#DC2626" } : {}) }}
              />
            </Field>
            <Field id="ca-phone" label="新管理员手机号" required error={adminErr.phone}>
              <input
                {...inputProps("ca-phone", adminErr.phone)}
                className="tm-field font-mono-nums"
                value={adminForm.phone}
                onChange={(e) => {
                  const phone = e.target.value.replace(/\D/g, "");
                  setAdminForm((f) => {
                    const previousAuto = defaultRuntimeAccount(f.phone);
                    const nextAccount = !f.account || f.account === previousAuto ? defaultRuntimeAccount(phone) : f.account;
                    return { ...f, phone, account: nextAccount };
                  });
                }}
                maxLength={11}
                style={{ ...fieldInput, ...(adminErr.phone ? { borderColor: "#DC2626" } : {}) }}
              />
            </Field>
            <Field id="ca-reason" label="变更原因" required error={adminErr.reason}>
              <input {...inputProps("ca-reason", adminErr.reason)} value={adminForm.reason} onChange={(e) => setAdminForm((f) => ({ ...f, reason: e.target.value }))} placeholder="必填；随审计记录保留" />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="tm-ghost-btn" disabled={busy !== null} onClick={() => setAdminChangeOpen(false)}>取消</button>
              <button type="button" className="tm-primary-btn" disabled={busy !== null} onClick={() => {
                const errs: Record<string, string> = {};
                if (!adminForm.name.trim()) errs.name = "请输入姓名";
                if (!ACCOUNT_PATTERN.test(adminForm.account.trim())) errs.account = "账号须为 3-20 位小写字母/数字，可含 - 与 _";
                else if (isAccountTakenInWorkspace(adminForm.account.trim(), tenant.enterpriseOrgId)) errs.account = "该账号在本企业已存在，请更换";
                if (!/^1\d{10}$/.test(adminForm.phone)) errs.phone = "请输入正确的 11 位手机号";
                if (!adminForm.reason.trim()) errs.reason = "请输入变更原因";
                setAdminErr(errs);
                if (Object.keys(errs).length > 0) return;
                void run("change-admin", () => {
                  const r = changeInitialAdmin(tenant.id, { name: adminForm.name.trim(), phone: adminForm.phone, account: adminForm.account.trim(), roleLabel: tenant.initialAdmin.roleLabel }, adminForm.reason.trim(), actor);
                  setAdminChangeOpen(false);
                  if (r.ok) { flushAudits(r.audits); addToast({ type: "success", title: "首位管理员已变更", description: "旧邀请已失效，新管理员待激活。" }); }
                });
              }}>
                确认变更
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

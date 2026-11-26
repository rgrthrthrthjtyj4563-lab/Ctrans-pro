/**
 * 租户管理（软件服务方侧 · 2026-09-15 深度审核整改版）。
 *
 * 贝医系统管理员的开户闭环（直接创建、无申请审核流）：
 * 新建药厂/服务商（四步向导：类型 → 企业资料 → 套餐与开通限制 → 首位管理员）→
 * 确认创建即原子建租（自动生成全局唯一主企业码 + 首位管理员待激活）→ 管理员
 * 首次登录激活其成员身份 → 租户暂停/恢复（一律原因码 + 说明 + 审计）。
 *
 * 2026-09-15 整改拍板：无申请/审核/驳回/补正；一个租户一个主企业码（无别名
 * 码、无重发激活提醒）；状态操作收敛到详情头部；详情内容卡按「套餐与开通 /
 * 主体资料 / 管理员信息 / 操作日志」选项卡切换。
 *
 * 2026-11-24 状态收敛：租户仅保留正常 / 已暂停两态，创建即正常；待激活、已终止
 * 两类状态及激活、终止操作取消。同轮调整：列表去掉状态统计卡片；复制企业码
 * 不写操作日志；新建向导的企业名称 / 信用代码 / 注册地址改为纯手动录入。
 *
 * 2026-11-25 套餐与有效期合并入口：卡头「更换套餐」升级为「更换套餐 / 有效期」，
 * 两项各自可选、至少改一项；有效期一有变化标准原因码 + 说明必填（与暂停/恢复
 * 同构），写审计。详情「操作日志」口径不变（仍只收状态变更），有效期调整只进
 * 全局操作日志。
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
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Factory,
  LoaderCircle,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
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
  suspendTenant,
  resumeTenant,
  changeTenantOpening,
  updateTenantProfile,
  tenantExpired,
  isUsccTaken,
  resetTenantRegistry,
  ACCOUNT_PATTERN,
  defaultRuntimeAccount,
  legacyReasonLabel,
  SUSPEND_REASON_OPTIONS,
  RESUME_REASON_OPTIONS,
  EXPIRE_REASON_OPTIONS,
  expireLabel,
  todayStr,
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
  INITIAL_ADMIN_CREATED: "首位管理员创建",
  TENANT_PACKAGE_BOUND: "租户套餐绑定",
  TENANT_PACKAGE_CHANGED: "租户套餐换绑",
  TENANT_EXPIRE_CHANGED: "租户有效期调整",
  TENANT_PROFILE_UPDATED: "主体资料更新",
  // 原因码沿用历史取值；租户创建即正常，首登只激活首位管理员的成员身份
  TENANT_ACTIVATED: "首位管理员激活",
  TENANT_SUSPENDED: "租户暂停",
  TENANT_REACTIVATED: "租户恢复",
};

/** 详情「操作日志」收录口径：仅租户状态变更（创建 / 暂停 / 恢复），其余操作只进全局操作日志 */
const STATUS_LOG_REASONS: ReadonlySet<string> = new Set(["TENANT_CREATED", "TENANT_SUSPENDED", "TENANT_REACTIVATED"]);

/** 状态原因码 → 文案（现行暂停/恢复标准选项；不在选项中的历史码走旧映射兜底） */
function statusReasonLabel(code: string): string {
  return (
    SUSPEND_REASON_OPTIONS.find((o) => o.code === code)?.label ??
    RESUME_REASON_OPTIONS.find((o) => o.code === code)?.label ??
    legacyReasonLabel(code)
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
    active: { bg: "#DCFCE7", fg: "#15803D", icon: <CheckCircle2 size={12} /> },
    suspended: { bg: "#FEF3E2", fg: "#B45309", icon: <PauseCircle size={12} /> },
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
const radioLabel: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 40, fontSize: "var(--fs-14)", color: "var(--color-text-1)", cursor: "pointer" };
const radioInput: React.CSSProperties = { width: 16, height: 16, margin: 0, accentColor: "var(--color-brand, #2F6BCE)", cursor: "pointer" };

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

  const resetFilters = () => {
    setSearchInput("");
    setFType("");
    setFStatus("");
    setPage(1);
  };

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
        description="软件服务方开户闭环：直接创建药厂/服务商租户（一次完成开户并生成全局唯一主企业码，创建即正常生效、首位管理员可直接登录），支持套餐换绑、有效期调整与暂停/恢复生命周期管理。"
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
        {/* 搜索 + 筛选：一行极简工具条，控件统一 32px 高；「全部」态为占位灰 */}
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
          <select data-active={fType ? "true" : "false"} value={fType} onChange={(e) => { setFType(e.target.value); setPage(1) }} aria-label="筛选租户类型">
            <option value="">全部类型</option>
            <option value="pharma">药厂</option>
            <option value="provider">服务提供商</option>
          </select>
          <select data-active={fStatus ? "true" : "false"} value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1) }} aria-label="筛选租户状态">
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="suspended">已暂停</option>
          </select>
          {hasAnyFilter && (
            <button type="button" className="tm-filterbar-reset" onClick={resetFilters}>
              <RotateCcw size={13} aria-hidden />
              重置
            </button>
          )}
          <span className="tm-filterbar-count">
            共 <strong className="font-mono-nums">{filtered.length}</strong> 家
          </span>
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
                  <button type="button" className="tm-ghost-btn" onClick={resetFilters}>
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
                  {["企业法定名称", "类型", "统一社会信用代码", "主企业码", "套餐与有效期", "租户状态", "创建时间", "操作"].map((h) => (
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

// 2026-11-24：取消「按企业名称查询工商登记信息」的带出逻辑（原为演示模拟企查查），
// 企业法定名称 / 统一社会信用代码 / 企业注册地址一律手动录入。

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
  const [created, setCreated] = useState<{ tenant: TenantRecord } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  // 脏检查：向导打开后任何输入即视为有未保存内容
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<WizardForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  const steps = ["选择企业类型", "填写企业资料", "套餐与开通限制", "指定首位管理员"];

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      // 2026-11-25：企业资料字段全部选填——仅在已填写时做格式与查重校验
      if (form.uscc.trim()) {
        if (!/^[0-9A-Z]{18}$/.test(form.uscc.trim().toUpperCase())) errs.uscc = "请输入 18 位统一社会信用代码（数字与大写字母）";
        else if (isUsccTaken(form.uscc)) errs.uscc = "该企业主体已存在租户，请先查看现有记录";
      }
      if (form.contactPhone.trim() && !/^1\d{10}$/.test(form.contactPhone.trim())) errs.contactPhone = "请输入正确的 11 位手机号";
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
      setCreated({ tenant: result.tenant });
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
      addToast({ type: "success", title: "企业码已复制" });
    } else {
      setCopyState("fail");
      addToast({ type: "error", title: "复制失败", description: "请手动选中文本复制。" });
    }
  };

  // 创建完成页（方案 §3.2）：企业名称、类型、主企业码、首位管理员、当前状态
  if (created) {
    return (
      <Modal open title="租户已创建，主企业码已生成" width={520} onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            { key: "provider" as const, title: "服务提供商", desc: "推广服务企业；开通后可管理多级部门与服务专员，需向药厂发起准入申请建立合作", icon: <Building2 size={22} /> },
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
          <Field id="wf-legalName" label="企业法定名称" hint="选填">
            <input
              {...inputProps("wf-legalName", errors.legalName)}
              value={form.legalName}
              onChange={(e) => set({ legalName: e.target.value })}
              placeholder="与营业执照一致"
            />
          </Field>
          <Field id="wf-uscc" label="统一社会信用代码" hint="选填" error={errors.uscc}>
            <input
              {...inputProps("wf-uscc", errors.uscc)}
              className="tm-field font-mono-nums"
              value={form.uscc}
              onChange={(e) => set({ uscc: e.target.value.toUpperCase() })}
              placeholder="91320191MA4WQ7LR8C"
              maxLength={18}
              style={{ ...fieldInput, letterSpacing: "0.04em", ...(errors.uscc ? { borderColor: "#DC2626" } : {}) }}
            />
          </Field>
          <Field id="wf-address" label="企业注册地址" hint="选填">
            <input
              {...inputProps("wf-address", errors.address)}
              value={form.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="省市 + 详细地址"
            />
          </Field>
          <Field id="wf-contactName" label="企业联系人姓名" hint="选填">
            <input {...inputProps("wf-contactName", errors.contactName)} value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} />
          </Field>
          <Field id="wf-contactPhone" label="企业联系人手机号" hint="选填" error={errors.contactPhone}>
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
              <Field id="wf-mah" label="药品上市许可持有人 / 生产企业标识" hint="选填">
                <select id="wf-mah" className="tm-field" style={fieldInput} value={form.mahHolderFlag ? "yes" : "no"} onChange={(e) => set({ mahHolderFlag: e.target.value === "yes" })}>
                  <option value="yes">是 · 上市许可持有人（MAH）</option>
                  <option value="no">否 · 销售企业</option>
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field id="wf-bizOwner" label="业务负责人" hint="选填">
                <input {...inputProps("wf-bizOwner", errors.bizOwner)} value={form.bizOwner} onChange={(e) => set({ bizOwner: e.target.value })} />
              </Field>
              <Field id="wf-complianceOwner" label="合规负责人" hint="选填">
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
            <Field id="wf-expireAt" label="开通有效期至" hint="留空 = 永久有效；到期后该租户登录被拒绝，创建后可在详情页调整">
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
            <span>确认创建后，系统将生成<b>不可修改的主企业码</b>；租户直接生效为「正常」状态，首位管理员可凭手机号验证码或登录账号直接登录使用。</span>
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

/**
 * 主体资料编辑表单（2026-11-25）：字段与新建向导一致；创建时间 / 创建人、
 * 主企业码、企业类型不可编辑。保存时保留 profile 中未在表单暴露的历史字段
 * （如药厂生产许可证编号/有效期）。
 */
interface SubjectProfileForm {
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
}

function profileFormOf(tenant: TenantRecord): SubjectProfileForm {
  const p = tenant.profile
  return {
    legalName: p.legalName,
    uscc: p.uscc,
    address: p.address,
    contactName: p.contactName,
    contactPhone: p.contactPhone,
    licenseAttachment: p.licenseAttachment ?? "",
    remark: p.remark ?? "",
    pharmaCategory: p.pharmaCategory ?? "",
    mahHolderFlag: p.mahHolderFlag ?? true,
    bizOwner: p.bizOwner ?? "",
    complianceOwner: p.complianceOwner ?? "",
    qualificationNo: p.qualificationNo ?? "",
    qualificationValidTo: p.qualificationValidTo ?? "",
  }
}

/** 更换套餐 / 有效期弹窗表单（null = 未打开） */
interface OpeningForm {
  packageId: string;
  /** 有效期口径：限期（expireAt 必填）/ 永久 */
  expireMode: "date" | "permanent";
  expireAt: string;
  /** 有效期变化时必填：标准原因码 + 说明 */
  reasonCode: string;
  note: string;
}

/** 有效期到期文案（缩短 / 由永久改限时的提示用）：按日历日差，避免夏令时影响 */
function expireDueText(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [ty, tm, td] = todayStr().split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  return days <= 0 ? "今天到期" : days === 1 ? "明天到期" : `${days} 天后到期`;
}

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

  // 状态操作弹窗（暂停/恢复：标准原因码快捷选择 + 说明必填，写审计）
  const [statusAction, setStatusAction] = useState<"suspend" | "resume" | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [reasonErr, setReasonErr] = useState<string | null>(null);

  // 更换套餐 / 有效期弹窗（表单为 null = 未打开）
  const [openingForm, setOpeningForm] = useState<OpeningForm | null>(null);
  const [openingErrors, setOpeningErrors] = useState<Record<string, string>>({});

  // 详情内容卡片选项卡
  const [detailTab, setDetailTab] = useState<"package" | "profile" | "admin" | "log">("package");
  // 主体资料编辑态（2026-11-25：只读 → 可编辑）
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileForm, setProfileForm] = useState<SubjectProfileForm | null>(null);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setDetailTab("package");
    setProfileEditing(false);
    setProfileForm(null);
    setProfileErrors({});
  }, [tenantId]);

  if (!tenant) return null;
  const p = tenant.profile;
  const pkg = packageOfTenant(tenant.id);
  const expired = tenantExpired(tenant);

  // 汇总本租户的操作日志：仅收录租户状态变更（创建 / 暂停 / 恢复），
  // 套餐、有效期、管理员、企业码等其余操作只进全局操作日志；种子租户补初始基线
  const tenantLog = (() => {
    const rawLogs = registry.activityLog.filter(
      (l) =>
        STATUS_LOG_REASONS.has(l.reasonCode) &&
        (l.targetTenant === tenant.shortName || l.code === tenant.primaryCode),
    );
    const hasCreated = rawLogs.some((l) => l.reasonCode === "TENANT_CREATED");
    if (hasCreated) return rawLogs;
    const seedBaseline: TenantAuditLine[] = [];
    if (
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
      addToast({ type: "success", title: "企业码已复制" });
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

  // ── 主体资料编辑（2026-11-25） ──
  const patchProfile = (patch: Partial<SubjectProfileForm>) => {
    setProfileForm((f) => (f ? { ...f, ...patch } : f));
    setProfileErrors((errs) => {
      const next = { ...errs };
      Object.keys(patch).forEach((key) => delete next[key]);
      return next;
    });
  };

  const validateProfile = (form: SubjectProfileForm): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (form.uscc.trim()) {
      if (!/^[0-9A-Z]{18}$/.test(form.uscc.trim().toUpperCase())) {
        errs.uscc = "请输入 18 位统一社会信用代码（数字与大写字母）";
      } else if (isUsccTaken(form.uscc, tenant.id)) {
        errs.uscc = "该企业主体已存在租户，请先查看现有记录";
      }
    }
    if (form.contactPhone.trim() && !/^1\d{10}$/.test(form.contactPhone.trim())) {
      errs.contactPhone = "请输入正确的 11 位手机号";
    }
    return errs;
  };

  const startProfileEdit = () => {
    setProfileForm(profileFormOf(tenant));
    setProfileErrors({});
    setProfileEditing(true);
  };

  const cancelProfileEdit = () => {
    setProfileEditing(false);
    setProfileForm(null);
    setProfileErrors({});
  };

  const saveProfile = () => {
    if (!profileForm) return;
    const errs = validateProfile(profileForm);
    setProfileErrors(errs);
    if (Object.keys(errs).length > 0) return;

    // 保留表单未暴露的历史字段（药厂生产许可证编号/有效期等），仅覆盖可编辑项
    const nextProfile: TenantSubjectProfile = {
      ...tenant.profile,
      legalName: profileForm.legalName.trim(),
      uscc: profileForm.uscc.trim().toUpperCase(),
      address: profileForm.address.trim(),
      contactName: profileForm.contactName.trim(),
      contactPhone: profileForm.contactPhone.trim(),
      licenseAttachment: profileForm.licenseAttachment || undefined,
      remark: profileForm.remark.trim() || undefined,
    };
    if (tenant.type === "pharma") {
      nextProfile.pharmaCategory = profileForm.pharmaCategory || undefined;
      nextProfile.mahHolderFlag = profileForm.mahHolderFlag;
    } else {
      nextProfile.bizOwner = profileForm.bizOwner.trim() || undefined;
      nextProfile.complianceOwner = profileForm.complianceOwner.trim() || undefined;
      nextProfile.qualificationNo = profileForm.qualificationNo.trim() || undefined;
      nextProfile.qualificationValidTo = profileForm.qualificationValidTo || undefined;
    }

    void run("profile", () => {
      const r = updateTenantProfile(tenant.id, nextProfile, actor);
      if (r.ok) {
        flushAudits(r.audits);
        cancelProfileEdit();
        addToast({
          type: "success",
          title: "主体资料已更新",
          description: "变更已保存并写入全局操作日志。",
        });
      } else {
        addToast({ type: "error", title: "保存失败", description: r.error });
      }
    });
  };

  const profileDirty =
    profileForm !== null && JSON.stringify(profileForm) !== JSON.stringify(profileFormOf(tenant));

  const openStatusAction = (action: "suspend" | "resume") => {
    const first = action === "suspend" ? SUSPEND_REASON_OPTIONS[0].code : RESUME_REASON_OPTIONS[0].code;
    setReasonCode(first);
    setReasonNote("");
    setReasonErr(null);
    setStatusAction(action);
  };

  const runStatusAction = () => {
    if (!reasonNote.trim()) {
      setReasonErr("请填写说明（必填，随操作日志保留）");
      return;
    }
    const action = statusAction;
    setStatusAction(null);
    if (!action) return;
    void run(action, () => {
      const r =
        action === "suspend"
          ? suspendTenant(tenant.id, reasonCode, reasonNote.trim(), actor)
          : resumeTenant(tenant.id, reasonCode, reasonNote.trim(), actor);
      if (r.ok) {
        flushAudits(r.audits);
        const titles = { suspend: "租户已暂停", resume: "租户已恢复" } as const
        addToast({ type: "success", title: titles[action], description: "原因与说明已写入操作日志。" });
      }
    });
  };

  // ── 更换套餐 / 有效期（2026-11-25）：两项各自可选、至少改一项；有效期变化时原因必填 ──
  const today = todayStr();
  const currentExpireAt = tenant.expireAt ?? "";
  const nextExpireAt = openingForm
    ? openingForm.expireMode === "date"
      ? openingForm.expireAt
      : ""
    : currentExpireAt;
  const pkgChanged = openingForm !== null && openingForm.packageId !== (pkg?.id ?? "");
  const expireChanged = openingForm !== null && nextExpireAt !== currentExpireAt;
  const openingDirty = pkgChanged || expireChanged;
  // 当前套餐已停用时仍列为选项（标注已停用）保证下拉回显；停用只约束「能否再被新选」
  const enabledPkgs = listTenantPackages().filter((p) => p.status === "enabled");
  const pkgOptions = pkg && !enabledPkgs.some((p) => p.id === pkg.id) ? [pkg, ...enabledPkgs] : enabledPkgs;
  const targetPkg = openingForm ? pkgOptions.find((p) => p.id === openingForm.packageId) : undefined;
  // 有效期日期随填随验：限期必填、不得早于今天（过去的日期等于立即停用，应走「暂停租户」）。
  // 「永久有效」与「限期但日期为空」的 nextExpireAt 同为空串，必须先按口径排除前者
  const expireDateError =
    !expireChanged || openingForm?.expireMode === "permanent"
      ? null
      : !nextExpireAt
        ? "请选择有效期日期"
        : nextExpireAt < today
          ? "有效期不得早于今天；如需立即停用请使用「暂停租户」"
          : null;
  // 缩短 / 由永久改限期 → 提示到期后果；仅限期口径适用（永久有效没有「到期」）。
  // 已过期租户另有过期提示（新日期不早于今天，两者互斥）
  const expireShortened =
    expireChanged &&
    openingForm?.expireMode === "date" &&
    !expireDateError &&
    (!tenant.expireAt || nextExpireAt < tenant.expireAt);

  const patchOpening = (patch: Partial<OpeningForm>) => {
    setOpeningForm((f) => (f ? { ...f, ...patch } : f));
    // 说明 / 套餐的错误在提交时重算：任何改动先清掉旧错误（日期错误随填随验，不在此列）
    setOpeningErrors({});
  };

  const submitOpening = () => {
    if (!openingForm) return;
    const errs: Record<string, string> = {};
    if (pkgChanged && !targetPkg) errs.packageId = "请选择目标套餐";
    if (expireChanged && !openingForm.note.trim()) errs.note = "请填写说明（必填，随操作日志保留）";
    setOpeningErrors(errs);
    if (expireDateError || Object.keys(errs).length > 0) return;

    // 提交前定格表单：run 有演示延时，期间表单可能继续变化。
    // 套餐只在真正改动时提交：存量租户未显式绑定（回落默认套餐）时，原样传回
    // 当前套餐会被数据层判成换绑（默认套餐 id ≠ 空），凭空多一条换绑流水
    const { reasonCode, note } = openingForm;
    const pkgTarget = pkgChanged ? targetPkg : undefined;
    // 过期租户把有效期调到今天及以后即恢复登录（已暂停租户另受状态约束，不在此承诺）
    const willRestoreLogin = expired && tenant.status === "active";
    void run("opening", () => {
      const r = changeTenantOpening(
        tenant.id,
        {
          ...(pkgTarget ? { package: { id: pkgTarget.id, label: pkgTarget.name } } : {}),
          ...(expireChanged ? { expire: { to: nextExpireAt || null, reasonCode, note: note.trim() } } : {}),
        },
        actor,
      );
      if (r.ok) {
        flushAudits(r.audits);
        setOpeningForm(null);
        const changes = [
          pkgTarget ? `已换绑「${pkgTarget.name}」，该租户菜单即时生效` : "",
          expireChanged ? `有效期 ${expireLabel(tenant.expireAt)} → ${expireLabel(nextExpireAt)}` : "",
        ].filter(Boolean).join("；");
        addToast({
          type: "success",
          title: pkgTarget && expireChanged ? "套餐与有效期已更新" : pkgTarget ? "套餐已更换" : "有效期已调整",
          description:
            `「${tenant.legalName}」${changes}。` +
            (expireChanged ? "原因与说明已写入操作日志。" : "") +
            (willRestoreLogin ? "该租户登录已恢复。" : ""),
        });
      } else {
        addToast({ type: "error", title: "变更失败", description: r.error });
      }
    });
  };

  const reasonOptions =
    statusAction === "suspend" ? SUSPEND_REASON_OPTIONS : RESUME_REASON_OPTIONS;

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
            </div>
            {(tenant.statusReasonCode || tenant.statusNote) && (
              <div style={{ marginTop: 8, fontSize: "var(--fs-12)", color: "#6B7280", lineHeight: 1.7 }}>
                最近原因：{statusReasonLabel(tenant.statusReasonCode ?? "")}{tenant.statusNote ? `（${tenant.statusNote}）` : ""}
              </div>
            )}
            <div style={{ marginTop: 2, fontSize: "var(--fs-12)", color: "#9CA3AF", lineHeight: 1.7 }}>
              主企业码全局唯一、系统生成，仅可查看和复制。
            </div>
          </div>
          {/* 生命周期主操作（变更首位管理员在「管理员信息」选项卡） */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {tenant.status === "active" && (
              <button type="button" className="tm-warn-btn" disabled={busy !== null} onClick={() => openStatusAction("suspend")}>
                <PauseCircle size={14} aria-hidden />
                暂停租户
              </button>
            )}
            {tenant.status === "suspended" && (
              <button type="button" className="tm-primary-btn" disabled={busy !== null} onClick={() => openStatusAction("resume")}>
                <PlayCircle size={14} aria-hidden />
                恢复租户
              </button>
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
                <button
                  type="button"
                  className="tm-ghost-btn tm-btn-sm"
                  disabled={busy !== null}
                  onClick={() => {
                    setOpeningForm({
                      packageId: pkg?.id ?? "",
                      expireMode: tenant.expireAt ? "date" : "permanent",
                      expireAt: tenant.expireAt ?? "",
                      reasonCode: EXPIRE_REASON_OPTIONS[0].code,
                      note: "",
                    });
                    setOpeningErrors({});
                  }}
                >
                  <RefreshCw size={13} aria-hidden />
                  更换套餐 / 有效期
                </button>
              </div>
              <dl className="tm-confirm-grid">
                <dt>绑定套餐</dt>
                <dd>
                  {pkg ? `${pkg.name} · ${pkg.menuIds.length} 项功能` : "—"}
                  {!tenant.packageId && <span className="tm-sub">（未显式绑定，按默认套餐回落开通）</span>}
                </dd>
                <dt>开通有效期</dt>
                <dd className="font-mono-nums" style={expired ? { color: "#C73A3A" } : undefined}>
                  {expired ? `已过期（${tenant.expireAt} 起）` : expireLabel(tenant.expireAt)}
                </dd>
              </dl>
              {expired && (
                <div className="tm-note tm-note--warn" role="note" style={{ marginTop: 8 }}>
                  <AlertTriangle size={14} aria-hidden />
                  <span>该租户已过期，当前无法登录；通过「更换套餐 / 有效期」延长后立即恢复。</span>
                </div>
              )}
            </section>
          )}

          {/* 选项卡 2：主体资料（2026-11-25 起可编辑：卡头「编辑」→ 表单 → 保存/取消） */}
          {detailTab === "profile" && (
            <section
              id="tm-detail-panel-profile"
              role="tabpanel"
              aria-labelledby="tm-detail-tab-profile"
              className="tm-sec"
            >
              <div className="tm-sec-head">
                <div style={{ minWidth: 0 }}>
                  <h4 className="tm-sec-title">主体资料</h4>
                  <span className="tm-sub" style={{ marginTop: 2, display: "block" }}>
                    {profileEditing
                      ? "编辑中 · 保存后立即生效，变更写入操作日志"
                      : "创建后可在本页签维护企业主体信息"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {profileEditing ? (
                    <>
                      <button
                        type="button"
                        className="tm-ghost-btn tm-btn-sm"
                        disabled={busy !== null}
                        onClick={cancelProfileEdit}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="tm-primary-btn tm-btn-sm"
                        disabled={busy !== null || !profileDirty}
                        onClick={saveProfile}
                      >
                        {busy === "profile" ? (
                          <LoaderCircle size={13} style={{ animation: "spin 0.7s linear infinite" }} aria-hidden />
                        ) : (
                          <Check size={13} aria-hidden />
                        )}
                        {busy === "profile" ? "正在保存…" : "保存"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="tm-ghost-btn tm-btn-sm"
                      disabled={busy !== null}
                      onClick={startProfileEdit}
                    >
                      <Pencil size={13} aria-hidden />
                      编辑
                    </button>
                  )}
                </div>
              </div>

              {profileEditing && profileForm ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                      columnGap: 16,
                      rowGap: 16,
                      paddingTop: 14,
                    }}
                  >
                    <Field id="tp-legalName" label="企业法定名称">
                      <input
                        {...inputProps("tp-legalName")}
                        value={profileForm.legalName}
                        onChange={(e) => patchProfile({ legalName: e.target.value })}
                        placeholder="与营业执照一致"
                      />
                    </Field>
                    <Field id="tp-uscc" label="统一社会信用代码" error={profileErrors.uscc} hint="18 位数字与大写字母；全局唯一">
                      <input
                        {...inputProps("tp-uscc", profileErrors.uscc)}
                        className="tm-field font-mono-nums"
                        value={profileForm.uscc}
                        onChange={(e) => patchProfile({ uscc: e.target.value.toUpperCase() })}
                        placeholder="91320191MA4WQ7LR8C"
                        maxLength={18}
                        style={{ ...fieldInput, letterSpacing: "0.04em", ...(profileErrors.uscc ? { borderColor: "#DC2626" } : {}) }}
                      />
                    </Field>
                    <Field id="tp-address" label="企业注册地址">
                      <input
                        {...inputProps("tp-address")}
                        value={profileForm.address}
                        onChange={(e) => patchProfile({ address: e.target.value })}
                        placeholder="省市 + 详细地址"
                      />
                    </Field>
                    <Field id="tp-contactName" label="企业联系人姓名">
                      <input
                        {...inputProps("tp-contactName")}
                        value={profileForm.contactName}
                        onChange={(e) => patchProfile({ contactName: e.target.value })}
                      />
                    </Field>
                    <Field id="tp-contactPhone" label="企业联系人手机号" error={profileErrors.contactPhone}>
                      <input
                        {...inputProps("tp-contactPhone", profileErrors.contactPhone)}
                        className="tm-field font-mono-nums"
                        value={profileForm.contactPhone}
                        onChange={(e) => patchProfile({ contactPhone: e.target.value.replace(/\D/g, "") })}
                        maxLength={11}
                        placeholder="11 位手机号"
                        style={{ ...fieldInput, ...(profileErrors.contactPhone ? { borderColor: "#DC2626" } : {}) }}
                      />
                    </Field>
                    <Field id="tp-license" label="营业执照或证明材料" hint="原型使用模拟附件，不产生真实文件">
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          {...inputProps("tp-license")}
                          value={profileForm.licenseAttachment}
                          readOnly
                          placeholder="未选择材料"
                          style={{ ...fieldInput, background: "#F9FAFB" }}
                        />
                        <button
                          type="button"
                          className="tm-ghost-btn"
                          style={{ height: 40, flexShrink: 0 }}
                          disabled={busy !== null}
                          onClick={() =>
                            patchProfile({
                              licenseAttachment: `营业执照-${profileForm.legalName || tenant.legalName || "租户"}.pdf（模拟附件）`,
                            })
                          }
                        >
                          模拟上传
                        </button>
                        {profileForm.licenseAttachment && (
                          <button
                            type="button"
                            className="tm-ghost-btn"
                            style={{ height: 40, flexShrink: 0 }}
                            disabled={busy !== null}
                            onClick={() => patchProfile({ licenseAttachment: "" })}
                            aria-label="清除已上传材料"
                          >
                            <X size={14} aria-hidden />
                          </button>
                        )}
                      </div>
                    </Field>
                    <Field id="tp-remark" label="备注">
                      <input
                        {...inputProps("tp-remark")}
                        value={profileForm.remark}
                        onChange={(e) => patchProfile({ remark: e.target.value })}
                        placeholder="补充说明（选填）"
                      />
                    </Field>

                    {tenant.type === "pharma" ? (
                      <>
                        <Field id="tp-pharmaCategory" label="主体分类">
                          <select
                            id="tp-pharmaCategory"
                            className="tm-field"
                            style={fieldInput}
                            value={profileForm.pharmaCategory}
                            onChange={(e) => patchProfile({ pharmaCategory: e.target.value })}
                          >
                            <option value="">请选择（选填）</option>
                            {PHARMA_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </Field>
                        <Field id="tp-mah" label="药品上市许可持有人 / 生产企业标识">
                          <select
                            id="tp-mah"
                            className="tm-field"
                            style={fieldInput}
                            value={profileForm.mahHolderFlag ? "yes" : "no"}
                            onChange={(e) => patchProfile({ mahHolderFlag: e.target.value === "yes" })}
                          >
                            <option value="yes">是 · 上市许可持有人（MAH）</option>
                            <option value="no">否 · 销售企业</option>
                          </select>
                        </Field>
                      </>
                    ) : (
                      <>
                        <Field id="tp-bizOwner" label="业务负责人">
                          <input
                            {...inputProps("tp-bizOwner")}
                            value={profileForm.bizOwner}
                            onChange={(e) => patchProfile({ bizOwner: e.target.value })}
                          />
                        </Field>
                        <Field id="tp-complianceOwner" label="合规负责人">
                          <input
                            {...inputProps("tp-complianceOwner")}
                            value={profileForm.complianceOwner}
                            onChange={(e) => patchProfile({ complianceOwner: e.target.value })}
                          />
                        </Field>
                        <Field id="tp-qualificationNo" label="相关资质编号">
                          <input
                            id="tp-qualificationNo"
                            className="tm-field"
                            value={profileForm.qualificationNo}
                            onChange={(e) => patchProfile({ qualificationNo: e.target.value })}
                            style={fieldInput}
                          />
                        </Field>
                        <Field id="tp-qualificationValidTo" label="资质有效期至">
                          <input
                            id="tp-qualificationValidTo"
                            className="tm-field font-mono-nums"
                            style={fieldInput}
                            type="date"
                            value={profileForm.qualificationValidTo}
                            onChange={(e) => patchProfile({ qualificationValidTo: e.target.value })}
                          />
                        </Field>
                      </>
                    )}
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: "1px solid #F3F4F6",
                      fontSize: "var(--fs-12)",
                      color: "#9CA3AF",
                      lineHeight: 1.7,
                    }}
                  >
                    创建时间 / 创建人：<span className="font-mono-nums">{tenant.createdAt}</span> · {tenant.createdBy}（不可修改）
                  </div>
                </>
              ) : (
                <dl className="tm-confirm-grid">
                  <dt>企业法定名称</dt><dd>{tenant.legalName}</dd>
                  <dt>统一社会信用代码</dt><dd className="font-mono-nums">{tenant.uscc || "—"}</dd>
                  <dt>注册地址</dt><dd>{p.address || "—"}</dd>
                  <dt>企业联系人</dt>
                  <dd>
                    {p.contactName || "—"}
                    {p.contactPhone && <span className="font-mono-nums" style={{ fontWeight: 400 }}> · {p.contactPhone}</span>}
                  </dd>
                  <dt>创建时间 / 创建人</dt><dd className="font-mono-nums">{tenant.createdAt} · {tenant.createdBy}</dd>
                  {tenant.type === "pharma" ? (
                    <>
                      <dt>主体分类</dt><dd>{p.pharmaCategory || "—"}（{p.mahHolderFlag ? "MAH 持有人" : "销售企业"}）</dd>
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
              )}
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
                <span className="tm-sub" style={{ marginTop: 0 }}>只读 · 企业内部成员由企业管理员自行维护</span>
              </div>
              <dl className="tm-confirm-grid">
                <dt>姓名</dt><dd>{tenant.initialAdmin.name}</dd>
                <dt>手机号</dt><dd className="font-mono-nums">{maskPhone(tenant.initialAdmin.phone)}</dd>
                <dt>登录账号</dt><dd className="font-mono-nums">{registry.users.find((u) => u.id === tenant.initialAdmin.userId)?.account ?? "—"}</dd>
                <dt>管理员角色</dt><dd>{tenant.initialAdmin.roleLabel}</dd>
              </dl>
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
                  仅记录状态变更（创建 / 暂停 / 恢复）· 共 {tenantLog.length} 条 · 按时间倒序
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
                      l.reasonCode === "TENANT_SUSPENDED"
                        ? "tm-chip tm-chip--warn"
                        : l.reasonCode === "TENANT_REACTIVATED"
                          ? "tm-chip tm-chip--ok"
                          : "tm-chip tm-chip--primary";
                    const dotColor =
                      l.reasonCode === "TENANT_SUSPENDED"
                        ? "#B45309"
                        : l.reasonCode === "TENANT_REACTIVATED"
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
        </div>
      </Modal>

      {/* 更换套餐 / 有效期（两项各自可选、至少改一项；有效期变化时原因必填；即时生效，写审计）。
          原因字段按需出现会撑高内容：动作放固定底栏，内容区滚动时「确认变更」始终可见 */}
      {openingForm && (
        <Modal
          open
          title={`更换套餐 / 有效期 · ${tenant.legalName}`}
          width={520}
          onClose={() => { if (busy === null) setOpeningForm(null) }}
          footer={
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="tm-ghost-btn" disabled={busy !== null} onClick={() => setOpeningForm(null)}>取消</button>
              <button
                type="button"
                className="tm-primary-btn"
                disabled={busy !== null || !openingDirty}
                onClick={submitOpening}
              >
                {busy === "opening" ? (
                  <LoaderCircle size={14} style={{ animation: "spin 0.7s linear infinite" }} aria-hidden />
                ) : (
                  <RefreshCw size={14} aria-hidden />
                )}
                确认变更
              </button>
            </div>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, fontSize: "var(--fs-14)", color: "#374151", lineHeight: 1.7 }}>
              当前套餐：<b>{pkg?.name ?? "—"}</b>（{pkg?.menuIds.length ?? 0} 项功能）。套餐与有效期互不影响，
              可只改其中一项；换绑后该租户用户的可见菜单<b>即时</b>按新套餐裁剪/恢复。
            </p>
            <div>
              <label htmlFor="pkg-choice" style={fieldLabel}>目标套餐</label>
              <select
                id="pkg-choice"
                className="tm-field"
                style={{ ...fieldInput, ...(openingErrors.packageId ? { borderColor: "#DC2626" } : {}) }}
                value={openingForm.packageId}
                aria-invalid={Boolean(openingErrors.packageId)}
                aria-describedby={openingErrors.packageId ? "err-pkg-choice" : undefined}
                onChange={(e) => patchOpening({ packageId: e.target.value })}
              >
                {!pkg && <option value="">请选择目标套餐</option>}
                {pkgOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.isDefault ? "（默认）" : ""}{p.status === "disabled" ? "（已停用）" : ""} · {p.menuIds.length} 项功能
                  </option>
                ))}
              </select>
              {targetPkg?.remark && <div style={{ fontSize: "var(--fs-12)", color: "#9CA3AF", marginTop: 4 }}>{targetPkg.remark}</div>}
              {openingErrors.packageId && (
                <div id="err-pkg-choice" style={errPill} role="alert">
                  <AlertTriangle size={13} aria-hidden />
                  {openingErrors.packageId}
                </div>
              )}
            </div>
            <div>
              <div id="op-expire-label" style={fieldLabel}>有效期</div>
              <div
                role="radiogroup"
                aria-labelledby="op-expire-label"
                aria-describedby="op-expire-hint"
                style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}
              >
                <label style={radioLabel}>
                  <input
                    type="radio"
                    name="op-expire-mode"
                    checked={openingForm.expireMode === "date"}
                    onChange={() => patchOpening({ expireMode: "date" })}
                    style={radioInput}
                  />
                  有效期至
                </label>
                {openingForm.expireMode === "date" && (
                  <input
                    id="op-expire-at"
                    type="date"
                    min={today}
                    className="tm-field font-mono-nums"
                    style={{ ...fieldInput, width: 172, ...(expireDateError ? { borderColor: "#DC2626" } : {}) }}
                    value={openingForm.expireAt}
                    aria-invalid={Boolean(expireDateError)}
                    aria-describedby={expireDateError ? "err-op-expire-at" : "op-expire-hint"}
                    onChange={(e) => patchOpening({ expireAt: e.target.value })}
                  />
                )}
                <label style={radioLabel}>
                  <input
                    type="radio"
                    name="op-expire-mode"
                    checked={openingForm.expireMode === "permanent"}
                    onChange={() => patchOpening({ expireMode: "permanent" })}
                    style={radioInput}
                  />
                  永久有效
                </label>
              </div>
              {expireDateError ? (
                <div id="err-op-expire-at" style={errPill} role="alert">
                  <AlertTriangle size={13} aria-hidden />
                  {expireDateError}
                </div>
              ) : (
                <div id="op-expire-hint" style={{ fontSize: "var(--fs-12)", color: "#9CA3AF", marginTop: 4 }}>
                  {openingForm.expireMode === "date" && !openingForm.expireAt
                    ? "请选择截止日期；截止日当天仍可使用，到期后该租户无法登录。"
                    : "截止日当天仍可使用，到期后该租户无法登录；调整后即时生效。"}
                </div>
              )}
              {expired && (
                <div className="tm-note tm-note--warn" role="note" style={{ marginTop: 8 }}>
                  <AlertTriangle size={14} aria-hidden />
                  <span>该租户已过期（{tenant.expireAt} 起），当前无法登录；延长有效期后立即恢复。</span>
                </div>
              )}
              {expireShortened && openingForm && (
                <div className="tm-note tm-note--warn" role="note" style={{ marginTop: 8 }}>
                  <AlertTriangle size={14} aria-hidden />
                  <span>
                    {tenant.expireAt ? "有效期缩短" : "由永久有效改为限期"}：{expireDueText(openingForm.expireAt)}，到期后该租户将无法登录。
                  </span>
                </div>
              )}
            </div>
            {/* 变更预览：确认前摆明「改了什么」；无变更时说明确认按钮为何不可用 */}
            <div style={{ padding: "8px 12px", background: "#F9FAFB", border: "1px solid #F3F4F6", borderRadius: 8, fontSize: "var(--fs-13)", color: "#374151", lineHeight: 1.7 }}>
              {openingDirty ? (
                <>
                  {pkgChanged && <div>套餐：<b>{pkg?.name}</b> → <b>{targetPkg?.name ?? "—"}</b></div>}
                  {expireChanged && <div>有效期：<b>{expireLabel(tenant.expireAt)}</b> → <b>{expireLabel(nextExpireAt)}</b></div>}
                </>
              ) : (
                <span style={{ color: "#6B7280" }}>尚未变更：调整套餐或有效期后即可确认。</span>
              )}
            </div>
            {expireChanged && (
              <>
                <div>
                  <label htmlFor="op-reason" style={fieldLabel}>原因（标准原因码）<span style={{ color: "#C73A3A", marginLeft: 2 }} aria-hidden>*</span></label>
                  <select id="op-reason" className="tm-field" style={fieldInput} value={openingForm.reasonCode} onChange={(e) => patchOpening({ reasonCode: e.target.value })}>
                    {EXPIRE_REASON_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="op-note" style={fieldLabel}>说明<span style={{ color: "#C73A3A", marginLeft: 2 }} aria-hidden>*</span></label>
                  <textarea
                    id="op-note"
                    className="tm-field"
                    style={{ ...fieldInput, height: 84, padding: "8px 12px", resize: "vertical", ...(openingErrors.note ? { borderColor: "#DC2626" } : {}) }}
                    value={openingForm.note}
                    aria-invalid={Boolean(openingErrors.note)}
                    aria-describedby={openingErrors.note ? "err-op-note" : undefined}
                    onChange={(e) => patchOpening({ note: e.target.value })}
                    placeholder="必填；随操作日志保留（如续签合同编号、补偿依据）"
                  />
                  {openingErrors.note && (
                    <div id="err-op-note" style={errPill} role="alert">
                      <AlertTriangle size={13} aria-hidden />
                      {openingErrors.note}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* 状态操作：暂停 / 恢复（原因码 + 说明均必填，写审计） */}
      {statusAction && (
        <Modal
          open
          title={`${statusAction === "suspend" ? "暂停" : "恢复"}租户 · ${tenant.legalName}`}
          width={480}
          onClose={() => { if (busy === null) setStatusAction(null) }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                确认{statusAction === "suspend" ? "暂停" : "恢复"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

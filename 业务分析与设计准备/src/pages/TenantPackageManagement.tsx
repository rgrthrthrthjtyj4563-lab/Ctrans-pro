/**
 * 租户套餐管理（软件服务方侧 · 2026-09-18 移植 RuoYi-Vue-Plus 套餐模型）。
 *
 * 套餐 = 一组菜单（页面级功能）的集合，是租户功能开通的总开关：
 * 新建/编辑套餐时勾选「关联菜单」（树形、父子联动、按工作空间分区），
 * 租户在租户管理侧绑定套餐后，其用户可见菜单 = 角色权限 ∩ 套餐菜单，
 * 变更即时生效（无同步动作）。停用只影响「能否再被选中」，不影响存量绑定；
 * 默认套餐与仍有租户绑定的套餐不可删除。
 *
 * 数据来自运行时套餐池（mock，localStorage 演示），生产由服务端与数据库承载
 * （见 tenantPackages.ts 头注）。仅贝医系统管理员可见可访问；操作走操作日志。
 */
import { useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import {
  Award,
  ChevronDown,
  ChevronRight,
  ListTree,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { usePermission } from "../context/PermissionContext";
import { seedMenuItems, type MenuSeedItem } from "../data/menus";
import {
  boundTenantCount,
  deleteTenantPackage,
  getTenantPackagesSnapshot,
  listTenantPackages,
  resetTenantPackages,
  saveTenantPackage,
  setTenantPackageStatus,
  subscribeTenantPackages,
  type TenantPackage,
} from "../data/tenantPackages";
import type { PageId } from "../types";

// ─── 菜单树构建（编辑弹窗消费；按工作空间三区展示，页面级 pageId 勾选） ──────

interface TreeLeaf {
  kind: "leaf";
  menuItemId: string;
  label: string;
  pageId: PageId;
}
interface TreeGroup {
  kind: "group";
  menuItemId: string;
  label: string;
  children: TreeLeaf[];
}
type TreeTop = TreeLeaf | TreeGroup;

interface MenuZone {
  key: string;
  label: string;
  hint: string;
  tops: TreeTop[];
}

/** 租户侧菜单树：药厂工作空间 / 服务商工作空间 / 企业通用（两域共享）三区 */
function buildMenuZones(): MenuZone[] {
  const items = seedMenuItems().filter((m) => m.enabled && m.workspace !== "platform");
  const zoneOf = (ws: MenuSeedItem["workspace"]): MenuZone["key"] =>
    ws === "pharma" ? "pharma" : ws === "provider" ? "provider" : "shared";
  const zones: Record<string, MenuZone> = {
    pharma: { key: "pharma", label: "药厂工作空间", hint: "仅药厂租户可见这部分功能", tops: [] },
    provider: { key: "provider", label: "服务商工作空间", hint: "仅服务商租户可见这部分功能", tops: [] },
    shared: { key: "shared", label: "企业通用（药厂 + 服务商）", hint: "两域租户共用", tops: [] },
  };
  const sorted = items.slice().sort((a, b) => a.sort - b.sort);
  for (const top of sorted.filter((m) => m.parentId === null)) {
    const zone = zones[zoneOf(top.workspace)];
    if (top.type === "page" && top.pageId) {
      zone.tops.push({ kind: "leaf", menuItemId: top.id, label: top.name, pageId: top.pageId as PageId });
    } else if (top.type === "group") {
      const children = sorted
        .filter((m) => m.parentId === top.id && m.type === "page" && m.pageId)
        .map((m) => ({ kind: "leaf" as const, menuItemId: m.id, label: m.name, pageId: m.pageId as PageId }));
      if (children.length) zone.tops.push({ kind: "group", menuItemId: top.id, label: top.name, children });
    }
  }
  return Object.values(zones).filter((z) => z.tops.length > 0);
}

function zonePageIds(zone: MenuZone): PageId[] {
  const ids = new Set<PageId>();
  for (const top of zone.tops) {
    if (top.kind === "leaf") ids.add(top.pageId);
    else top.children.forEach((c) => ids.add(c.pageId));
  }
  return [...ids];
}

// ─── 页面 ────────────────────────────────────────────────────────────────────

export function TenantPackageManagement({ addToast }: { addToast: (msg: { type: "success" | "error" | "info"; title: string; description?: string }) => void }) {
  const snapshot = useSyncExternalStore(subscribeTenantPackages, getTenantPackagesSnapshot);
  const { logAudit, principal } = usePermission();
  const zones = useMemo(buildMenuZones, []);
  const actor = principal.realm === "PLATFORM" ? principal.platformRoleName : "贝医系统管理员";

  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TenantPackage | null>(null);
  const [deleting, setDeleting] = useState<TenantPackage | null>(null);

  const packages = useMemo(
    () =>
      listTenantPackages()
        .filter((p) => {
          const q = search.trim().toUpperCase();
          if (q && !p.name.toUpperCase().includes(q) && !(p.remark ?? "").toUpperCase().includes(q)) return false;
          if (fStatus && p.status !== fStatus) return false;
          return true;
        })
        .sort((a, b) => (a.isDefault ? -1 : b.isDefault ? 1 : a.createdAt < b.createdAt ? 1 : -1)),
    [snapshot, search, fStatus],
  );
  const hasAnyFilter = Boolean(search || fStatus);

  /** 套餐操作 → 全局操作日志（标准口径） */
  const audit = (action: string, target: string, summary?: string) => {
    logAudit({
      module: "租户套餐管理",
      action,
      target,
      resource: "tenant.package",
      decision: "允许",
      result: "成功",
      ...(summary ? { afterSummary: summary } : {}),
    });
  };

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (p: TenantPackage) => {
    setEditing(p);
    setEditorOpen(true);
  };

  const toggleStatus = (p: TenantPackage) => {
    const next = p.status === "enabled" ? "disabled" : "enabled";
    const result = setTenantPackageStatus(p.id, next);
    if (!result.ok) {
      addToast({ type: "error", title: "操作失败", description: result.error });
      return;
    }
    audit(
      next === "disabled" ? "套餐停用" : "套餐启用",
      p.name,
      next === "disabled"
        ? "已停用：新建租户与换绑不可再选中该套餐；已绑定租户不受影响，仍按其菜单集生效。"
        : "已启用：恢复可被新建租户与换绑选中。",
    );
    addToast({
      type: "success",
      title: next === "disabled" ? "套餐已停用" : "套餐已启用",
      description: next === "disabled" ? "已绑定的租户不受影响，仍按该套餐的菜单集生效。" : undefined,
    });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const result = deleteTenantPackage(deleting.id);
    if (!result.ok) {
      addToast({ type: "error", title: "删除失败", description: result.error });
      return;
    }
    audit("套餐删除", deleting.name, `已删除；关联菜单 ${deleting.menuIds.length} 项（删除前已确认无租户绑定）。`);
    addToast({ type: "success", title: "套餐已删除", description: "删除前已确认无租户绑定，无存量影响。" });
    setDeleting(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="租户套餐管理"
        description="套餐是一组菜单（功能）的集合：新建套餐时勾选关联菜单，租户绑定套餐后其可见菜单=角色权限∩套餐菜单，变更即时生效；停用只影响能否再被选中，不影响已绑定租户。"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="tm-ghost-btn"
              title="仅演示环境提供：重置本浏览器内的套餐池模拟数据（不影响租户注册表）"
              onClick={() => {
                resetTenantPackages();
                addToast({ type: "info", title: "演示数据已重置（仅演示）", description: "套餐池恢复到初始演示状态（租户注册表不受影响）。" });
              }}
            >
              <RefreshCw size={14} aria-hidden />
              恢复演示数据（仅演示）
            </button>
            <button type="button" className="tm-primary-btn" onClick={openCreate}>
              <Plus size={15} aria-hidden />
              新建套餐
            </button>
          </div>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        <div className="tm-filterbar" style={{ marginBottom: 12 }}>
          <div className="tm-search">
            <Search size={14} aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索套餐名称 / 备注"
              aria-label="搜索套餐"
            />
            {search && (
              <button type="button" aria-label="清空搜索" onClick={() => setSearch("")}>
                <X size={13} aria-hidden />
              </button>
            )}
          </div>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="筛选套餐状态">
            <option value="">全部状态</option>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
          {hasAnyFilter && (
            <button type="button" className="tm-ghost-btn" onClick={() => { setSearch(""); setFStatus(""); }}>
              重置
            </button>
          )}
        </div>

        {packages.length === 0 ? (
          <div style={{ background: "#FFFFFF", border: "1px solid var(--color-border)", borderRadius: 8 }}>
            <EmptyState
              icon={Package}
              title="没有符合条件的套餐"
              description={hasAnyFilter ? "调整搜索词或筛选条件后重试。" : "点击右上角「新建套餐」创建第一个功能套餐。"}
              action={
                hasAnyFilter ? (
                  <button type="button" className="tm-ghost-btn" onClick={() => { setSearch(""); setFStatus(""); }}>
                    清除全部筛选
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div style={{ background: "#FFFFFF", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "auto" }}>
            <table className="tm-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead>
                <tr>
                  {["套餐名称", "状态", "关联菜单数", "绑定租户数", "备注", "创建时间", "操作"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {packages.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--color-text-1)" }}>{p.name}</span>
                      {p.isDefault && (
                        <span
                          title="默认套餐：新建租户与换绑的缺省选项；存量租户未显式绑定套餐时按它回落开通"
                          style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--fs-12)", fontWeight: 600, padding: "1px 8px", borderRadius: 999, background: "#E0F2FE", color: "#0369A1", whiteSpace: "nowrap" }}
                        >
                          <ShieldCheck size={11} aria-hidden />
                          默认
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusPill status={p.status} />
                    </td>
                    <td>
                      <span className="font-mono-nums" title={menuNamesOf(p.menuIds).join("、")}>
                        {p.menuIds.length} 项
                      </span>
                      <div className="tm-sub">页面级功能</div>
                    </td>
                    <td>
                      <span className="font-mono-nums">{boundTenantCount(p.id)}</span>
                      <div className="tm-sub">待激活/正常/暂停</div>
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      <span className="tm-sub" style={{ color: "#6B7280", marginTop: 0 }} title={p.remark}>{p.remark || "—"}</span>
                    </td>
                    <td>
                      <span className="tm-time">{p.createdAt}</span>
                      <div className="tm-sub">{p.createdBy}</div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, whiteSpace: "nowrap" }}>
                        <button type="button" className="tm-row-btn" onClick={() => openEdit(p)}>编辑</button>
                        <button type="button" className="tm-row-btn" onClick={() => toggleStatus(p)}>
                          {p.status === "enabled" ? "停用" : "启用"}
                        </button>
                        <button
                          type="button"
                          className="tm-row-btn tm-row-btn--danger"
                          disabled={p.isDefault}
                          title={p.isDefault ? "默认套餐不可删除（存量租户按它回落开通）" : undefined}
                          onClick={() => setDeleting(p)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="tm-note tm-note--info" role="note" style={{ marginTop: 12 }}>
          <ListTree size={14} aria-hidden />
          <span>
            套餐在<b>租户管理</b>侧绑定（新建租户向导或详情页「更换套餐」）；绑定后该租户用户的可见菜单即时按套餐裁剪，
            直跳未开通页面会被拦截并写入权限审计。统一套餐池对药厂/服务商通用，菜单树中各工作空间分区只对对应类型租户生效。
          </span>
        </div>
      </div>

      <PackageEditor
        key={editing?.id ?? "create"}
        open={editorOpen}
        editing={editing}
        zones={zones}
        actor={actor}
        onClose={() => setEditorOpen(false)}
        onSaved={(p, created) => {
          audit(created ? "套餐创建" : "套餐编辑", p.name, `关联菜单 ${p.menuIds.length} 项${p.remark ? `；备注：${p.remark}` : ""}`);
          addToast({ type: "success", title: created ? "套餐已创建" : "套餐已保存", description: "绑定该套餐的租户菜单已即时生效。" });
          setEditorOpen(false);
        }}
        addToast={addToast}
      />

      <Modal
        open={Boolean(deleting)}
        title="删除套餐"
        width={440}
        onClose={() => setDeleting(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="tm-ghost-btn" onClick={() => setDeleting(null)}>取消</button>
            <button type="button" className="tm-danger-btn" onClick={confirmDelete}>
              <Trash2 size={14} aria-hidden />
              确认删除
            </button>
          </div>
        }
      >
        {deleting && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "var(--fs-14)", color: "#374151" }}>
            <p style={{ margin: 0 }}>
              将删除套餐 <b>{deleting.name}</b>（关联菜单 {deleting.menuIds.length} 项）。
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#6B7280", fontSize: "var(--fs-13)", lineHeight: 1.8 }}>
              <li>当前绑定租户数：{boundTenantCount(deleting.id)}（大于 0 时无法删除，需先在租户管理换绑）</li>
              <li>删除后不可恢复；未被任何租户绑定时无存量影响</li>
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── 状态徽章 ────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: TenantPackage["status"] }) {
  const enabled = status === "enabled";
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: "var(--fs-12)", fontWeight: 500, padding: "2px 8px", borderRadius: 999,
        background: enabled ? "#DCFCE7" : "#F3F4F6",
        color: enabled ? "#15803D" : "#6B7280",
        whiteSpace: "nowrap",
      }}
    >
      {enabled ? "启用" : "停用"}
    </span>
  );
}

/** pageId → 菜单名（悬停清单用；同页多名取第一个） */
function menuNamesOf(pageIds: PageId[]): string[] {
  const map = new Map<PageId, string>();
  for (const m of seedMenuItems()) {
    if (m.type !== "page" || !m.pageId || m.workspace === "platform") continue
    if (!map.has(m.pageId as PageId)) map.set(m.pageId as PageId, m.name)
  }
  return pageIds.map((id) => map.get(id) ?? id)
}

// ─── 新建/编辑弹窗（关联菜单树：三区分组、父子联动、全选/展开收起） ──────────

function TriCheck({
  state, label, hint, onChange, bold,
}: {
  state: "all" | "partial" | "none";
  label: string;
  hint?: string;
  onChange: () => void;
  bold?: boolean;
}) {
  return (
    <label
      style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
      onClick={(e) => {
        e.preventDefault();
        onChange();
      }}
    >
      <span
        role="checkbox"
        aria-checked={state === "all" ? true : state === "partial" ? "mixed" : false}
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onChange();
          }
        }}
        style={{
          width: 16, height: 16, borderRadius: 4, border: "1px solid",
          borderColor: state === "none" ? "#D0D5DD" : "#2F6BCE",
          background: state === "all" ? "#2F6BCE" : "#FFFFFF",
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        {state === "all" ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M1.5 5.2 4 7.7 8.5 2.6" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : state === "partial" ? (
          <Minus size={10} color="#2F6BCE" aria-hidden />
        ) : null}
      </span>
      <span style={{ fontWeight: bold ? 600 : 400, fontSize: "var(--fs-13)", color: "#374151" }}>
        {label}
        {hint && <span style={{ marginLeft: 6, fontSize: "var(--fs-12)", color: "#9CA3AF", fontWeight: 400 }}>{hint}</span>}
      </span>
    </label>
  );
}

function PackageEditor({
  open, editing, zones, actor, onClose, onSaved, addToast,
}: {
  open: boolean;
  editing: TenantPackage | null;
  zones: MenuZone[];
  actor: string;
  onClose: () => void;
  onSaved: (pack: TenantPackage, created: boolean) => void;
  addToast: (msg: { type: "success" | "error" | "info"; title: string; description?: string }) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [remark, setRemark] = useState(editing?.remark ?? "");
  const [selected, setSelected] = useState<Set<PageId>>(() => new Set(editing?.menuIds ?? []));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groupTops = zones.flatMap((z) => z.tops.filter((t): t is TreeGroup => t.kind === "group"));
  const allCollapsed = groupTops.length > 0 && groupTops.every((t) => collapsed.has(t.menuItemId));

  const togglePage = (id: PageId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleIds = (ids: PageId[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  };
  const stateOf = (ids: PageId[]): "all" | "partial" | "none" => {
    const count = ids.filter((id) => selected.has(id)).length;
    return count === 0 ? "none" : count === ids.length ? "all" : "partial";
  };

  const save = () => {
    if (!name.trim()) {
      setError("请输入套餐名称");
      return;
    }
    if (selected.size === 0) {
      setError("请至少勾选一个关联菜单");
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      const result = saveTenantPackage({
        id: editing?.id,
        name: name.trim(),
        menuIds: [...selected],
        remark: remark.trim() || undefined,
        actor,
      });
      setBusy(false);
      if (!result.ok || !result.pack) {
        setError(result.error ?? "保存失败，请稍后重试");
        addToast({ type: "error", title: "保存失败", description: result.error });
        return;
      }
      onSaved(result.pack, !editing);
    }, 350);
  };

  return (
    <Modal
      open={open}
      title={editing ? `编辑套餐：${editing.name}` : "新建套餐"}
      width={680}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="tm-ghost-btn" onClick={onClose}>取消</button>
          <button type="button" className="tm-primary-btn" disabled={busy} onClick={save}>
            {busy ? "保存中…" : "保 存"}
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label htmlFor="pkg-name" style={{ display: "block", fontSize: "var(--fs-13)", fontWeight: 500, color: "#374151", marginBottom: 6 }}>
            套餐名称<span style={{ color: "#C73A3A", marginLeft: 2 }} aria-hidden>*</span>
          </label>
          <input
            id="pkg-name"
            className="tm-field"
            value={name}
            maxLength={30}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder="如：标准版 / 专业版"
            style={{ width: "100%", height: 40, padding: "0 12px", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: "var(--fs-14)", fontFamily: "inherit", color: "var(--color-text-1)", background: "#FFFFFF", outline: "none" }}
          />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: "var(--fs-13)", fontWeight: 500, color: "#374151" }}>
              关联菜单<span style={{ color: "#C73A3A", marginLeft: 2 }} aria-hidden>*</span>
              <span style={{ marginLeft: 8, fontSize: "var(--fs-12)", color: "#9CA3AF", fontWeight: 400 }}>
                已选 {selected.size} 项页面功能；父子联动勾选
              </span>
            </span>
            <button
              type="button"
              className="tm-ghost-btn tm-btn-sm"
              onClick={() => {
                setCollapsed((prev) => {
                  if (allCollapsed) return new Set();
                  const next = new Set<string>();
                  groupTops.forEach((t) => next.add(t.menuItemId));
                  return next;
                });
              }}
            >
              {allCollapsed ? "展开全部" : "收起全部"}
            </button>
          </div>
          <div
            style={{
              border: "1px solid var(--color-border)", borderRadius: 8, background: "#FFFFFF",
              maxHeight: 320, overflow: "auto", padding: "10px 14px",
            }}
          >
            {zones.map((zone) => {
              const ids = zonePageIds(zone);
              const st = stateOf(ids);
              return (
                <div key={zone.key} style={{ padding: "8px 0" }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      borderBottom: "1px solid #F1F5F9", paddingBottom: 6, marginBottom: 4,
                    }}
                  >
                    <TriCheck state={st} label={zone.label} hint={`（${zone.hint}）`} bold onChange={() => toggleIds(ids)} />
                    <span style={{ fontSize: "var(--fs-12)", color: "#9CA3AF" }} className="font-mono-nums">
                      {ids.filter((id) => selected.has(id)).length}/{ids.length}
                    </span>
                  </div>
                  {zone.tops.map((top) =>
                    top.kind === "leaf" ? (
                      <div key={top.menuItemId} style={{ padding: "5px 0 5px 10px" }}>
                        <TriCheck state={selected.has(top.pageId) ? "all" : "none"} label={top.label} onChange={() => togglePage(top.pageId)} />
                      </div>
                    ) : (
                      <GroupNode key={top.menuItemId} group={top} selected={selected} stateOf={stateOf} toggleIds={toggleIds} togglePage={togglePage} collapsed={collapsed} setCollapsed={setCollapsed} />
                    ),
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="pkg-remark" style={{ display: "block", fontSize: "var(--fs-13)", fontWeight: 500, color: "#374151", marginBottom: 6 }}>备注</label>
          <textarea
            id="pkg-remark"
            className="tm-field"
            value={remark}
            maxLength={120}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="选填：说明套餐定位与适用对象"
            rows={2}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: "var(--fs-14)", fontFamily: "inherit", color: "var(--color-text-1)", background: "#FFFFFF", outline: "none", resize: "vertical" }}
          />
        </div>

        {error && (
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-12)", color: "#C73A3A" }}>
            <Award size={13} aria-hidden />
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function GroupNode({
  group, selected, stateOf, toggleIds, togglePage, collapsed, setCollapsed,
}: {
  group: TreeGroup;
  selected: Set<PageId>;
  stateOf: (ids: PageId[]) => "all" | "partial" | "none";
  toggleIds: (ids: PageId[]) => void;
  togglePage: (id: PageId) => void;
  collapsed: Set<string>;
  setCollapsed: Dispatch<SetStateAction<Set<string>>>;
}) {
  const ids = group.children.map((c) => c.pageId);
  const st = stateOf(ids);
  const isCollapsed = collapsed.has(group.menuItemId);
  return (
    <div style={{ padding: "4px 0 4px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          aria-label={isCollapsed ? `展开 ${group.label}` : `收起 ${group.label}`}
          onClick={() =>
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (next.has(group.menuItemId)) next.delete(group.menuItemId);
              else next.add(group.menuItemId);
              return next;
            })
          }
          style={{ display: "inline-flex", alignItems: "center", border: "none", background: "none", cursor: "pointer", padding: 2, color: "#6B7280" }}
        >
          {isCollapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </button>
        <TriCheck state={st} label={group.label} bold onChange={() => toggleIds(ids)} />
      </div>
      {!isCollapsed && (
        <div style={{ padding: "2px 0 2px 26px" }}>
          {group.children.map((c) => (
            <div key={c.menuItemId} style={{ padding: "4px 0" }}>
              <TriCheck state={selected.has(c.pageId) ? "all" : "none"} label={c.label} onChange={() => togglePage(c.pageId)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

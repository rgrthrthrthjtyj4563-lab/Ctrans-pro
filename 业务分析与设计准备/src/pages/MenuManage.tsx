import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Folder,
  ListTree,
  PencilLine,
  Plus,
  Power,
  PowerOff,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Button, IconButton } from '../components/Button';
import { StatusTag, Tag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import { RESOURCE_PAGES, nextId, nowStamp } from '../data/permissions';
import { MENU_ICONS } from '../data/menus';
import type { MenuItem, MenuType, PageId } from '../types';
import type { ToastMessage } from '../components/Toast';
import { Field, InfoBanner, RadioCard, inputStyle } from './permUi';

type ToastInput = Omit<ToastMessage, 'id'>;

interface Props {
  menuItems: MenuItem[];
  onChange: (next: MenuItem[]) => void;
  addToast: (t: ToastInput) => void;
}

type EditorMode = 'idle' | 'create-group' | 'create-page' | 'edit';

interface Draft {
  mode: EditorMode;
  editingId: string | null;
  type: MenuType;
  name: string;
  iconKey: string;
  parentId: string;
  pageId: string;
  enabled: boolean;
}

const ACTOR = '李航';
const MODULE = '菜单管理';

const cardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  overflow: 'hidden',
};

const idleDraft: Draft = {
  mode: 'idle',
  editingId: null,
  type: 'group',
  name: '',
  iconKey: 'folder',
  parentId: '',
  pageId: '',
  enabled: true,
};

function stamp<T extends MenuItem>(item: T): T {
  return { ...item, updatedAt: nowStamp(), updatedBy: ACTOR };
}

function siblingsOf(items: MenuItem[], parentId: string | null): MenuItem[] {
  return items
    .filter(i => i.parentId === parentId)
    .slice()
    .sort((a, b) => a.sort - b.sort);
}

function compactSort(items: MenuItem[], parentId: string | null): MenuItem[] {
  const ordered = siblingsOf(items, parentId).map((s, idx) => ({ ...s, sort: idx + 1 }));
  const map = new Map(ordered.map(s => [s.id, s]));
  return items.map(i => map.get(i.id) ?? i);
}

function pageNameOf(pageId?: string): string {
  if (!pageId) return '—';
  return RESOURCE_PAGES.find(p => p.id === pageId)?.name ?? pageId;
}

function itemSummary(item: MenuItem): string {
  if (item.type === 'group') return `${item.name} / 目录`;
  return `${item.name} / ${pageNameOf(item.pageId)}`;
}

function newGroupDraft(): Draft {
  return {
    ...idleDraft,
    mode: 'create-group',
    type: 'group',
    iconKey: 'folder',
    enabled: true,
  };
}

function newPageDraft(parentId: string): Draft {
  return {
    ...idleDraft,
    mode: 'create-page',
    type: 'page',
    parentId,
    enabled: true,
    iconKey: '',
  };
}

function draftFromItem(item: MenuItem): Draft {
  return {
    mode: 'edit',
    editingId: item.id,
    type: item.type,
    name: item.name,
    iconKey: item.iconKey ?? (item.type === 'group' ? 'folder' : ''),
    parentId: item.parentId ?? '',
    pageId: item.pageId ?? '',
    enabled: item.enabled,
  };
}

export function MenuManage({ menuItems, onChange, addToast }: Props) {
  const { can, previewReadOnly, logAudit } = usePermission();
  const canCreate = can('menus', 'create') && !previewReadOnly;
  const canEdit = can('menus', 'edit') && !previewReadOnly;

  const [draft, setDraft] = useState<Draft>(idleDraft);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(menuItems.filter(m => m.type === 'group' && m.parentId === null).map(m => m.id)),
  );

  const tops = useMemo(() => siblingsOf(menuItems, null), [menuItems]);
  const groups = useMemo(
    () => tops.filter(t => t.type === 'group').slice().sort((a, b) => a.sort - b.sort),
    [tops],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of menuItems) {
      if (!item.parentId) continue;
      const list = map.get(item.parentId) ?? [];
      list.push(item);
      map.set(item.parentId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sort - b.sort);
    return map;
  }, [menuItems]);

  const selected = draft.editingId ? menuItems.find(m => m.id === draft.editingId) ?? null : null;
  const isTopLevelPage = draft.mode === 'edit' && selected?.type === 'page' && selected.parentId === null;
  const formOpen = draft.mode !== 'idle';
  const formReadOnly = draft.mode === 'edit' ? !canEdit : !canCreate;

  useEffect(() => {
    if (draft.mode === 'edit' && draft.editingId && !menuItems.some(m => m.id === draft.editingId)) {
      setDraft(idleDraft);
    }
  }, [menuItems, draft.mode, draft.editingId]);

  function commit(next: MenuItem[]) {
    onChange(next);
  }

  function audit(partial: {
    action: string;
    target: string;
    resource: 'menus.create' | 'menus.edit';
    beforeSummary?: string;
    afterSummary?: string;
  }) {
    logAudit({ module: MODULE, ...partial });
  }

  function selectItem(item: MenuItem) {
    setDraft(draftFromItem(item));
    if (item.type === 'group') {
      setExpanded(prev => new Set([...prev, item.id]));
    }
  }

  function startCreateGroup() {
    setDraft(newGroupDraft());
  }

  function startCreatePage(parentId?: string) {
    const fallback = groups[0]?.id ?? '';
    setDraft(newPageDraft(parentId ?? fallback));
    if (parentId) setExpanded(prev => new Set([...prev, parentId]));
  }

  function validate(): string | null {
    const name = draft.name.trim();
    if (!name) return '请填写菜单名称';
    const parentId = draft.type === 'group' ? null : (isTopLevelPage ? null : draft.parentId || null);
    if (draft.type === 'page' && !isTopLevelPage && !parentId) return '请选择上级目录';
    if (draft.type === 'page' && !draft.pageId) return '请选择关联页面';
    const dup = menuItems.some(m =>
      m.id !== draft.editingId
      && m.parentId === parentId
      && m.name.trim() === name,
    );
    if (dup) return '同一父级下菜单名称不能重复';
    // 2026-09-04 起允许同一页面绑定多个启用菜单（如「菜单管理」同时挂在系统管理与权限管理下），不再做占用拦截
    return null;
  }

  function save() {
    const error = validate();
    if (error) {
      addToast({ type: 'error', title: '无法保存', description: error });
      return;
    }
    const name = draft.name.trim();
    const now = nowStamp();

    if (draft.mode === 'create-group') {
      const parentId = null;
      const sort = siblingsOf(menuItems, parentId).length + 1;
      const created: MenuItem = {
        id: nextId('group'),
        name,
        type: 'group',
        parentId,
        iconKey: draft.iconKey || 'folder',
        sort,
        enabled: draft.enabled,
        updatedAt: now,
        updatedBy: ACTOR,
      };
      commit([...menuItems, created]);
      setExpanded(prev => new Set([...prev, created.id]));
      audit({
        action: '新增目录',
        target: name,
        resource: 'menus.create',
        afterSummary: `目录 · 图标 ${created.iconKey}`,
      });
      addToast({ type: 'success', title: '已新增目录', description: name });
      setDraft(draftFromItem(created));
      return;
    }

    if (draft.mode === 'create-page') {
      const parentId = draft.parentId;
      const parent = menuItems.find(m => m.id === parentId);
      const pageId = draft.pageId as PageId;
      const sort = siblingsOf(menuItems, parentId).length + 1;
      const preferredId = `menu-${pageId}`;
      const id = menuItems.some(m => m.id === preferredId) ? nextId('menu') : preferredId;
      const created: MenuItem = {
        id,
        name,
        type: 'page',
        parentId,
        pageId,
        sort,
        enabled: draft.enabled,
        updatedAt: now,
        updatedBy: ACTOR,
      };
      commit([...menuItems, created]);
      audit({
        action: '新增菜单',
        target: name,
        resource: 'menus.create',
        afterSummary: `${parent?.name ?? '目录'} / ${pageNameOf(pageId)}`,
      });
      addToast({ type: 'success', title: '已新增页面菜单', description: `${parent?.name ?? ''} / ${name}` });
      setDraft(draftFromItem(created));
      return;
    }

    if (draft.mode === 'edit' && selected) {
      const nextParentId = selected.type === 'group' || isTopLevelPage
        ? selected.parentId
        : (draft.parentId || null);
      let next = menuItems.map(m => {
        if (m.id !== selected.id) return m;
        const patched: MenuItem = stamp({
          ...m,
          name,
          enabled: draft.enabled,
          iconKey: m.type === 'group' ? (draft.iconKey || 'folder') : m.iconKey,
          pageId: m.type === 'page' ? (draft.pageId as PageId) : undefined,
          parentId: nextParentId,
        });
        return patched;
      });
      if (selected.type === 'page' && !isTopLevelPage && nextParentId !== selected.parentId) {
        next = compactSort(next, selected.parentId);
        const maxSort = siblingsOf(next, nextParentId).filter(s => s.id !== selected.id).length;
        next = next.map(m => m.id === selected.id ? { ...m, sort: maxSort + 1 } : m);
        next = compactSort(next, nextParentId);
      }
      const updated = next.find(m => m.id === selected.id)!;
      commit(next);
      audit({
        action: '编辑菜单',
        target: name,
        resource: 'menus.edit',
        beforeSummary: itemSummary(selected),
        afterSummary: itemSummary(updated),
      });
      addToast({ type: 'success', title: '已保存', description: name });
      setDraft(draftFromItem(updated));
    }
  }

  function move(item: MenuItem, dir: -1 | 1) {
    if (!canEdit) return;
    const siblings = siblingsOf(menuItems, item.parentId);
    const idx = siblings.findIndex(s => s.id === item.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;
    const neighbor = siblings[swapIdx];
    const swapped = [...siblings];
    [swapped[idx], swapped[swapIdx]] = [swapped[swapIdx], swapped[idx]];
    const reindexed = swapped.map((s, i) => {
      const sort = i + 1;
      if (s.id === item.id || s.id === neighbor.id) return stamp({ ...s, sort });
      return sort === s.sort ? s : { ...s, sort };
    });
    const map = new Map(reindexed.map(s => [s.id, s]));
    commit(menuItems.map(m => map.get(m.id) ?? m));
    audit({
      action: '菜单排序',
      target: item.name,
      resource: 'menus.edit',
      afterSummary: `与 ${neighbor.name} 交换位置`,
    });
    addToast({ type: 'success', title: dir === -1 ? '已上移' : '已下移', description: `${item.name} ↔ ${neighbor.name}` });
  }

  function toggleEnabled(item: MenuItem) {
    if (!canEdit) return;
    const nextEnabled = !item.enabled;
    const next = menuItems.map(m => m.id === item.id ? stamp({ ...m, enabled: nextEnabled }) : m);
    commit(next);
    audit({
      action: nextEnabled ? '启用菜单' : '停用菜单',
      target: item.name,
      resource: 'menus.edit',
      beforeSummary: nextEnabled ? '停用' : '启用',
      afterSummary: nextEnabled ? '启用' : '停用',
    });
    addToast({
      type: 'success',
      title: nextEnabled ? '已启用' : '已停用',
      description: item.type === 'group' && !nextEnabled
        ? '停用目录后其下子菜单保持自身状态，侧栏不再渲染该目录。'
        : item.name,
    });
    if (draft.editingId === item.id) {
      setDraft(prev => ({ ...prev, enabled: nextEnabled }));
    }
  }

  function changeSummary(): string {
    if (draft.mode === 'create-group') {
      return `将新增目录「${draft.name.trim() || '未命名'}」，图标 ${draft.iconKey || 'folder'}，${draft.enabled ? '启用' : '停用'}。`;
    }
    if (draft.mode === 'create-page') {
      const parentName = menuItems.find(m => m.id === draft.parentId)?.name ?? '未选目录';
      return `将在「${parentName}」下新增菜单「${draft.name.trim() || '未命名'}」，绑定 ${pageNameOf(draft.pageId)}。`;
    }
    if (draft.mode === 'edit' && selected) {
      const bits: string[] = [];
      if (draft.name.trim() !== selected.name) bits.push(`名称 ${selected.name} → ${draft.name.trim()}`);
      if (selected.type === 'group' && (draft.iconKey || 'folder') !== (selected.iconKey ?? 'folder')) {
        bits.push(`图标 ${selected.iconKey ?? 'folder'} → ${draft.iconKey || 'folder'}`);
      }
      if (selected.type === 'page' && draft.pageId !== (selected.pageId ?? '')) {
        bits.push(`页面 ${pageNameOf(selected.pageId)} → ${pageNameOf(draft.pageId)}`);
      }
      if (selected.type === 'page' && !isTopLevelPage && draft.parentId !== (selected.parentId ?? '')) {
        const from = menuItems.find(m => m.id === selected.parentId)?.name ?? '—';
        const to = menuItems.find(m => m.id === draft.parentId)?.name ?? '—';
        bits.push(`上级 ${from} → ${to}`);
      }
      if (draft.enabled !== selected.enabled) bits.push(draft.enabled ? '启用' : '停用');
      return bits.length ? `本次变更：${bits.join('；')}。` : '未修改字段，保存将刷新更新时间。';
    }
    return '';
  }

  function renderRow(item: MenuItem, depth: number, siblingIndex: number, siblingCount: number) {
    const selectedRow = draft.editingId === item.id;
    const Icon = MENU_ICONS[item.iconKey ?? ''] ?? Folder;
    const kids = childrenByParent.get(item.id) ?? [];
    const isGroup = item.type === 'group';
    const open = expanded.has(item.id);
    const isFirst = siblingIndex === 0;
    const isLast = siblingIndex === siblingCount - 1;

    return (
      <div key={item.id}>
        <div
          onClick={() => selectItem(item)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 8px',
            paddingLeft: 8 + depth * 16,
            borderRadius: 6,
            cursor: 'pointer',
            background: selectedRow ? 'var(--color-brand-subtle)' : 'transparent',
            border: selectedRow ? '1px solid color-mix(in srgb, var(--color-brand) 35%, transparent)' : '1px solid transparent',
          }}
        >
          {isGroup ? (
            <button
              type="button"
              title={open ? '折叠' : '展开'}
              aria-label={open ? '折叠' : '展开'}
              onClick={e => {
                e.stopPropagation();
                setExpanded(prev => {
                  const next = new Set(prev);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                });
              }}
              style={{
                width: 18,
                height: 18,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                padding: 0,
                color: '#9CA3AF',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span style={{ width: 18, flexShrink: 0 }} />
          )}
          {depth === 0 && <Icon size={14} style={{ color: 'var(--color-brand)', flexShrink: 0 }} aria-hidden />}
          <span style={{
            flex: 1,
            minWidth: 0,
            fontSize: 'var(--fs-13)',
            fontWeight: selectedRow ? 600 : 500,
            color: 'var(--color-text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {item.name}
          </span>
          <StatusTag status={item.enabled ? '启用' : '已停用'} size="sm" />
          {item.displayDisabled && <Tag label="置灰展示" />}
          <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {isGroup && (
              <IconButton
                size="sm"
                icon={<Plus size={13} />}
                title="新增子菜单"
                aria-label="新增子菜单"
                disabled={!canCreate}
                onClick={() => startCreatePage(item.id)}
              />
            )}
            <IconButton
              size="sm"
              icon={<PencilLine size={13} />}
              title="编辑"
              aria-label="编辑"
              disabled={previewReadOnly}
              onClick={() => selectItem(item)}
            />
            <IconButton
              size="sm"
              icon={<ArrowUp size={13} />}
              title="上移"
              aria-label="上移"
              disabled={!canEdit || isFirst}
              onClick={() => move(item, -1)}
            />
            <IconButton
              size="sm"
              icon={<ArrowDown size={13} />}
              title="下移"
              aria-label="下移"
              disabled={!canEdit || isLast}
              onClick={() => move(item, 1)}
            />
            <IconButton
              size="sm"
              icon={item.enabled ? <PowerOff size={13} /> : <Power size={13} />}
              title={item.enabled ? '停用' : '启用'}
              aria-label={item.enabled ? '停用' : '启用'}
              disabled={!canEdit}
              onClick={() => toggleEnabled(item)}
            />
          </span>
        </div>
        {isGroup && open && kids.map((child, i) => renderRow(child, depth + 1, i, kids.length))}
      </div>
    );
  }

  const IconPreview = MENU_ICONS[draft.iconKey] ?? Folder;
  const formTitle = draft.mode === 'create-group'
    ? '新增目录'
    : draft.mode === 'create-page'
      ? '新增页面菜单'
      : draft.type === 'group'
        ? '编辑目录'
        : '编辑页面菜单';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="菜单管理"
        description="维护左侧导航的目录、页面绑定、排序与启停；页面可见性仍由角色权限决定"
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ ...cardStyle, width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{
              display: 'flex',
              gap: 8,
              padding: 12,
              borderBottom: '1px solid var(--color-border)',
              flexWrap: 'wrap',
            }}>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={13} />}
                disabled={!canCreate}
                onClick={startCreateGroup}
              >
                新增目录
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Plus size={13} />}
                disabled={!canCreate || groups.length === 0}
                onClick={() => startCreatePage()}
              >
                新增页面菜单
              </Button>
            </div>
            <div style={{ padding: 8, maxHeight: 'calc(100vh - 220px)', overflow: 'auto' }}>
              {tops.map((item, i) => renderRow(item, 0, i, tops.length))}
            </div>
          </div>

          <div style={{ ...cardStyle, flex: 1, minWidth: 0, padding: 20 }}>
            {!formOpen ? (
              <EmptyState
                icon={ListTree}
                title="在左侧选择一个菜单项，或新增目录 / 页面菜单"
                description="菜单只决定侧栏怎么展示；角色有没有页面查看权限，仍由角色管理配置。"
              />
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 'var(--fs-16)', fontWeight: 600 }}>{formTitle}</div>
                  {selected && (
                    <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: 'var(--font-mono)' }}>
                      更新于 {selected.updatedAt} · {selected.updatedBy}
                    </span>
                  )}
                </div>

                {draft.type === 'group' && (
                  <InfoBanner>
                    停用目录时，其下子菜单保持自身启停状态，不会被级联改写；侧栏将隐藏整个目录，直到重新启用。
                  </InfoBanner>
                )}
                {draft.type === 'page' && (
                  <InfoBanner>
                    同一页面可以绑定多个菜单入口（如「菜单管理」同时挂在 系统管理 与 权限管理 下）。菜单启用不等于人人可见，当前角色仍需拥有该页面的查看权限。
                  </InfoBanner>
                )}

                <div style={{ display: 'grid', gap: 16, marginTop: 16, maxWidth: 560 }}>
                  <Field label="菜单名称" required>
                    <input
                      value={draft.name}
                      disabled={formReadOnly}
                      onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
                      placeholder={draft.type === 'group' ? '例如：系统管理' : '例如：角色管理'}
                      style={inputStyle}
                    />
                  </Field>

                  {draft.type === 'group' && (
                    <Field label="图标" hint="一级目录在侧栏展示该图标；默认 folder">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 36,
                          height: 36,
                          borderRadius: 6,
                          border: '1px solid var(--color-border)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#F9FAFB',
                          flexShrink: 0,
                        }}>
                          <IconPreview size={16} style={{ color: 'var(--color-brand)' }} aria-hidden />
                        </span>
                        <select
                          value={draft.iconKey}
                          disabled={formReadOnly}
                          onChange={e => setDraft(prev => ({ ...prev, iconKey: e.target.value }))}
                          style={inputStyle}
                        >
                          {Object.keys(MENU_ICONS).map(key => (
                            <option key={key} value={key}>{key}</option>
                          ))}
                        </select>
                      </div>
                    </Field>
                  )}

                  {draft.type === 'page' && (
                    <Field label="上级目录" required={!isTopLevelPage}>
                      {isTopLevelPage ? (
                        <input value="（一级独立入口）" disabled style={inputStyle} />
                      ) : (
                        <select
                          value={draft.parentId}
                          disabled={formReadOnly}
                          onChange={e => setDraft(prev => ({ ...prev, parentId: e.target.value }))}
                          style={inputStyle}
                        >
                          <option value="">请选择目录</option>
                          {groups.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      )}
                    </Field>
                  )}

                  {draft.type === 'page' && (
                    <Field label="关联页面" required hint="只能绑定已有页面，不能在此创建新页面">
                      <select
                        value={draft.pageId}
                        disabled={formReadOnly}
                        onChange={e => setDraft(prev => ({ ...prev, pageId: e.target.value }))}
                        style={inputStyle}
                      >
                        <option value="">请选择页面</option>
                        {RESOURCE_PAGES.map(p => {
                          const current = selected?.pageId === p.id;
                          return (
                            <option key={p.id} value={p.id}>
                              {p.module} / {p.name}{current ? '（当前）' : ''}
                            </option>
                          );
                        })}
                        {draft.pageId && !RESOURCE_PAGES.some(p => p.id === draft.pageId) && (
                          <option value={draft.pageId}>
                            其他 / {selected?.name ?? draft.pageId}（当前）
                          </option>
                        )}
                      </select>
                    </Field>
                  )}

                  <Field label="启用状态">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <RadioCard
                        checked={draft.enabled}
                        disabled={formReadOnly}
                        title="启用"
                        hint="侧栏按角色查看权限显示"
                        onClick={() => setDraft(prev => ({ ...prev, enabled: true }))}
                      />
                      <RadioCard
                        checked={!draft.enabled}
                        disabled={formReadOnly}
                        title="停用"
                        hint={draft.type === 'group' ? '侧栏隐藏整组，子菜单状态保留' : '所有角色侧栏均不显示'}
                        onClick={() => setDraft(prev => ({ ...prev, enabled: false }))}
                      />
                    </div>
                  </Field>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: '1px solid var(--color-border)',
                }}>
                  <div style={{ fontSize: 'var(--fs-12)', color: '#667085', lineHeight: 1.6, flex: 1 }}>
                    {changeSummary()}
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    disabled={formReadOnly}
                    onClick={save}
                  >
                    保存
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FilePlus2,
  Layers,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { StatusTag } from '../../components/StatusTag';
import type { ToastMessage } from '../../components/Toast';
import type { AccessItemKind, AccessTemplateItem, PharmaAccessTemplate } from '../../types';
import {
  DEFAULT_ACCESS_TEMPLATE_ITEMS,
  kindLabel,
  useVendorAccess,
  type TemplateInitSource,
} from '../../context/VendorAccessContext';
import { usePermission } from '../../context/PermissionContext';
import {
  ACCESS_KIND_GROUPS,
  AuditPointsBox,
  FileChip,
  GroupHeader,
  ItemMetaRow,
  KindBadge,
  RefMaterialTag,
  mono,
} from './shared';

/**
 * 药厂侧 · 准入模板配置（页签二）
 * 内置默认模板惰性初始化 → 多套模板、同时仅一套启用（启用切换二次确认 / 启用中不可删）。
 * 模板内容完全自定义：项增删改（编号/分组/类型/必传/文件类型/份数/参考材料/审核点）。
 */

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  pharmaTenantId: string;
  pharmaName: string;
  /** 作为「服务商准入」页内页签嵌入：列表视图不渲染内部 PageHeader（页头与页签由宿主页提供） */
  embedded?: boolean;
}

export function TemplateTab({ addToast, pharmaTenantId, pharmaName, embedded }: Props) {
  const {
    ensureTemplatesFor,
    templatesOf,
    createTemplate,
    renameTemplate,
    deleteTemplate,
    enableTemplate,
    saveItem,
    removeItem,
    removeGroup,
    moveItem,
  } = useVendorAccess();
  const { can } = usePermission();
  const canEdit = can('vendor-access', 'edit');

  // 惰性初始化：首次进入且本厂无模板时，以系统默认模板初始化「默认模板」
  useEffect(() => {
    ensureTemplatesFor(pharmaTenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmaTenantId]);

  const templates = templatesOf(pharmaTenantId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = templates.find((t) => t.id === editingId) ?? null;

  const [createOpen, setCreateOpen] = useState(false);
  const [enableId, setEnableId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [itemModal, setItemModal] = useState<null | { mode: 'create' } | { mode: 'edit'; item: AccessTemplateItem }>(null);
  const [addDefaultOpen, setAddDefaultOpen] = useState(false);
  const [groupDelete, setGroupDelete] = useState<string | null>(null);

  const enableTarget = enableId ? templates.find((t) => t.id === enableId) : null;
  const deleteTarget = deleteId ? templates.find((t) => t.id === deleteId) : null;

  function run(op: () => { ok: boolean; error?: string }, okMsg: { title: string; description?: string }) {
    const res = op();
    if (res.ok) addToast({ type: 'success', ...okMsg });
    else addToast({ type: 'error', title: res.error ?? '操作失败' });
    return res.ok;
  }

  // ── 编辑器视图 ──
  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PageHeader
          title="编辑准入模板"
          description="模板内容完全自定义；切换启用前服务商新申请按启用中模板生成清单。"
          dataRange={pharmaName}
        />
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>← 返回模板列表</Button>
            <input
              value={editing.name}
              disabled={!canEdit}
              onChange={(e) => renameTemplate(pharmaTenantId, editing.id, e.target.value)}
              style={{
                fontSize: 'var(--fs-16)', fontWeight: 700, color: 'var(--color-text-1)',
                border: '1px solid transparent', borderRadius: 6, padding: '3px 8px', background: 'transparent',
                outline: 'none', minWidth: 160,
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-strong)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
            />
            {editing.enabled ? <StatusTag status="启用" /> : <StatusTag status="停用" />}
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-2)' }}>
              共 {editing.items.length} 项（必传 {editing.items.filter((i) => i.required).length} 项）
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {canEdit && (
                <>
                  <Button variant="outline" size="sm" icon={<FilePlus2 size={13} />} onClick={() => setAddDefaultOpen(true)}>
                    添加默认模板项
                  </Button>
                  <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setItemModal({ mode: 'create' })}>
                    新增项
                  </Button>
                </>
              )}
            </span>
          </div>

          {editing.items.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="模板暂无准入项"
              description="从系统默认模板快速添加，或新增自定义项。"
              action={canEdit ? { label: '添加默认模板项', onClick: () => setAddDefaultOpen(true) } : undefined}
            />
          ) : (
            <TemplateItemsEditor
              template={editing}
              canEdit={canEdit}
              onEdit={(item) => setItemModal({ mode: 'edit', item })}
              onRemove={(key) => run(() => removeItem(pharmaTenantId, editing.id, key), { title: '已删除准入项' })}
              onMove={(key, dir) => moveItem(pharmaTenantId, editing.id, key, dir)}
              onRemoveGroup={(group) => setGroupDelete(group)}
            />
          )}
        </div>

        {itemModal && (
          <ItemEditModal
            existingGroups={[...new Set(editing.items.map((i) => i.group))]}
            knownGroups={editing.knownGroups}
            existingKeys={editing.items.map((i) => i.key)}
            init={itemModal.mode === 'edit' ? itemModal.item : null}
            onClose={() => setItemModal(null)}
            onSave={(item) => {
              if (run(() => saveItem(pharmaTenantId, editing.id, item), { title: itemModal.mode === 'edit' ? '已保存准入项' : '已新增准入项' })) {
                setItemModal(null);
              }
            }}
          />
        )}

        {/* 删除大项确认（组内项一并删除；组名保留供新建项重选） */}
        <Modal
          open={!!groupDelete}
          title="删除大项"
          onClose={() => setGroupDelete(null)}
          width={460}
          footer={
            <>
              <Button variant="outline" onClick={() => setGroupDelete(null)}>取消</Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (groupDelete && run(() => removeGroup(pharmaTenantId, editing.id, groupDelete), { title: '已删除大项' })) setGroupDelete(null);
                }}
              >
                确认删除
              </Button>
            </>
          }
        >
          {(() => {
            const groupItems = groupDelete ? editing.items.filter((i) => i.group === groupDelete) : [];
            return (
              <>
                <div style={{ fontSize: 'var(--fs-14)', lineHeight: 1.7 }}>
                  确认删除大项「<strong>{groupDelete}</strong>」？其下 <strong>{groupItems.length}</strong> 个准入项（必传 {groupItems.filter((i) => i.required).length} 项）将一并删除。
                </div>
                <div style={{ marginTop: 8, fontSize: 'var(--fs-12)', color: '#9CA3AF', lineHeight: 1.7 }}>
                  删除后可在「新增项 → 所属分组」中重新选择该大项并重建内容；已提交的申请按快照留存，不受影响。
                </div>
              </>
            );
          })()}
        </Modal>

        <Modal
          open={addDefaultOpen}
          title="添加系统默认模板项"
          onClose={() => setAddDefaultOpen(false)}
          width={560}
          footer={
            <>
              <Button variant="outline" onClick={() => setAddDefaultOpen(false)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const present = new Set(editing.items.map((i) => i.key));
                  const picks = (addDefaultPicks.current ?? []).filter((k) => !present.has(k));
                  const defs = DEFAULT_ACCESS_TEMPLATE_ITEMS.filter((d) => picks.includes(d.key));
                  let fail = false;
                  for (const def of defs) {
                    const res = saveItem(pharmaTenantId, editing.id, { ...def, key: `${def.key}-c${Date.now().toString(36)}`.slice(0, 40), builtin: true });
                    if (!res.ok) {
                      addToast({ type: 'error', title: res.error ?? '添加失败' });
                      fail = true;
                      break;
                    }
                  }
                  if (!fail) {
                    addToast({ type: 'success', title: `已添加 ${defs.length} 项默认模板项` });
                    setAddDefaultOpen(false);
                  }
                }}
              >
                添加所选项
              </Button>
            </>
          }
        >
          <AddDefaultPicker template={editing} onPicksChange={(picks) => (addDefaultPicks.current = picks)} />
        </Modal>
      </div>
    );
  }

  // ── 模板卡列表视图 ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {!embedded && (
        <PageHeader title="准入模板" description="配置本厂准入要求：可维护多套模板，同时仅一套启用；服务商申请按启用中模板生成清单。" dataRange={pharmaName} />
      )}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', marginBottom: 14, borderRadius: 8, background: 'var(--color-brand-subtle)', border: '1px solid color-mix(in srgb, var(--color-brand) 22%, transparent)', fontSize: 'var(--fs-13)', color: 'var(--color-brand)' }}>
          说明：药厂可维护多套准入模板以适应不同合作场景，但同时仅允许一套处于「启用中」——服务商发起新申请时，将按当前唯一启用模板生成材料清单；切换模板不影响在途申请（提交时点快照）。
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              canEdit={canEdit}
              onEdit={() => setEditingId(t.id)}
              onEnable={() => setEnableId(t.id)}
              onDelete={() => setDeleteId(t.id)}
            />
          ))}
          {canEdit && (
            <button
              onClick={() => setCreateOpen(true)}
              style={{
                border: '1.5px dashed var(--color-border-strong)', borderRadius: 8, background: 'none',
                minHeight: 168, cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-text-2)',
              }}
            >
              <Plus size={22} style={{ color: 'var(--color-text-3)' }} />
              <span style={{ fontSize: 'var(--fs-14)', fontWeight: 600 }}>新建模板</span>
              <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)' }}>从系统默认模板初始化或完全自定义</span>
            </button>
          )}
        </div>
      </div>

      {/* 新建模板（名称 + 初始化方式） */}
      <CreateTemplateModal
        open={createOpen}
        templates={templates}
        onClose={() => setCreateOpen(false)}
        onCreate={(name, init) => {
          if (run(() => createTemplate(pharmaTenantId, name, init), { title: '已新建模板', description: '继续添加准入项后可启用。' })) {
            setCreateOpen(false);
          }
        }}
      />

      {/* 切换启用确认 */}
      <Modal
        open={!!enableTarget}
        title="切换启用模板"
        onClose={() => setEnableId(null)}
        width={460}
        footer={
          <>
            <Button variant="outline" onClick={() => setEnableId(null)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (enableId && run(() => enableTemplate(pharmaTenantId, enableId), { title: '已切换启用模板' })) setEnableId(null);
              }}
            >
              确认启用
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 'var(--fs-14)', lineHeight: 1.7 }}>
          确认将「{enableTarget?.name}」设为启用中模板？
        </div>
        <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 6, background: '#FEF3E2', fontSize: 'var(--fs-12)', color: '#92400E', lineHeight: 1.7 }}>
          切换后服务商<b>新申请</b>将按「{enableTarget?.name}」清单执行；<b>在途申请按提交时点快照审核，不受影响</b>。
        </div>
      </Modal>

      {/* 删除确认（启用中不可删） */}
      <Modal
        open={!!deleteTarget}
        title="删除模板"
        onClose={() => setDeleteId(null)}
        width={420}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteId(null)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteId && run(() => deleteTemplate(pharmaTenantId, deleteId), { title: '已删除模板' })) setDeleteId(null);
              }}
            >
              确认删除
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 'var(--fs-14)', lineHeight: 1.7 }}>
          确认删除模板「{deleteTarget?.name}」（共 {deleteTarget?.items.length ?? 0} 项）？
        </div>
        <div style={{ marginTop: 8, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
          已提交的申请按快照留存，不受模板删除影响。
        </div>
      </Modal>
    </div>
  );
}

const addDefaultPicks: { current: string[] | null } = { current: null };

// ─── 模板卡 ───────────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  canEdit,
  onEdit,
  onEnable,
  onDelete,
}: {
  template: PharmaAccessTemplate;
  canEdit: boolean;
  onEdit: () => void;
  onEnable: () => void;
  onDelete: () => void;
}) {
  const groups = [...new Set(template.items.map((i) => i.group))];
  const requiredCount = template.items.filter((i) => i.required).length;
  return (
    <div
      style={{
        position: 'relative', background: '#fff', borderRadius: 8,
        border: template.enabled ? '1.5px solid var(--color-brand)' : '1px solid var(--color-border)',
        padding: 16, opacity: template.enabled ? 1 : 0.62, display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      {template.enabled && (
        <span
          style={{
            position: 'absolute', top: -10, left: 14, padding: '2px 10px', borderRadius: 999,
            background: 'var(--color-brand)', color: '#fff', fontSize: 'var(--fs-11)', fontWeight: 700,
          }}
        >
          当前启用 · 服务商申请按本模板
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: template.enabled ? 4 : 0 }}>
        <span style={{ fontSize: 'var(--fs-15)', fontWeight: 700, color: 'var(--color-text-1)' }}>{template.name}</span>
        {template.enabled ? <StatusTag status="启用" /> : <StatusTag status="停用" />}
      </div>
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {groups.map((g) => (
            <span key={g} style={{ fontSize: 'var(--fs-11)', padding: '1px 8px', borderRadius: 999, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)' }}>
              {g} ({template.items.filter((i) => i.group === g).length})
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)' }}>
        清单项合计：<strong>{template.items.length}</strong> 项（必传 {requiredCount} 项）
      </div>
      <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF' }}>
        {template.updatedAt ? `${template.updatedAt} 由 ${template.updatedBy ?? '—'} 更新` : '尚未编辑'}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto', flexWrap: 'wrap' }}>
        <Button variant={template.enabled ? 'soft' : 'primary'} size="sm" onClick={onEdit}>进入编辑项</Button>
        {!template.enabled && canEdit && <Button variant="outline" size="sm" onClick={onEnable}>启用</Button>}
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={13} />}
          disabled={template.enabled || !canEdit}
          title={template.enabled ? '启用中的模板不可删除，请先切换其他模板' : undefined}
          onClick={onDelete}
          style={template.enabled ? { color: '#C0C6CF' } : { color: '#C73A3A' }}
        >
          删除
        </Button>
      </div>
    </div>
  );
}

// ─── 模板编辑器：分组分区 + 项行 ───────────────────────────────────────────────

function TemplateItemsEditor({
  template,
  canEdit,
  onEdit,
  onRemove,
  onMove,
  onRemoveGroup,
}: {
  template: PharmaAccessTemplate;
  canEdit: boolean;
  onEdit: (item: AccessTemplateItem) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onRemoveGroup: (group: string) => void;
}) {
  const groups = useMemo(() => [...new Set(template.items.map((i) => i.group))], [template.items]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map((group, gi) => {
        const items = template.items.filter((i) => i.group === group);
        const requiredCount = items.filter((i) => i.required).length;
        const hasChecklist = items.some((i) => i.kind === 'checklist');
        return (
          <div key={group}>
            <GroupHeader
              name={`${String(gi + 1).padStart(2, '0')} ${group}`}
              count={items.length}
              right={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 'var(--fs-11)', color: 'var(--color-text-3)' }}>必传 {requiredCount} 项</span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={12} />}
                      disabled={hasChecklist}
                      title={hasChecklist ? '该大项包含系统内置核查项，不可整组删除' : `删除大项「${group}」及其下 ${items.length} 项`}
                      onClick={() => onRemoveGroup(group)}
                      style={hasChecklist ? { color: '#C0C6CF' } : { color: '#C73A3A' }}
                    >
                      删除大项
                    </Button>
                  )}
                </span>
              }
            />
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              {items.map((item, idx) => {
                const isLast = idx === items.length - 1;
                const points = (item.checkPoints ?? '').split('\n').filter((s) => s.trim()).length;
                return (
                  <div key={item.key} style={{ padding: '12px 14px', borderBottom: isLast ? 'none' : '1px solid #F3F4F6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <ItemMetaRow item={item} source />
                    </div>
                    {item.templateRef?.enforced && (
                        <span style={{ fontSize: 'var(--fs-11)', padding: '1px 8px', borderRadius: 999, background: 'var(--color-brand)', color: '#fff', fontWeight: 600 }}>
                          必用模板
                        </span>
                      )}
                      {canEdit && (
                        <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          {item.kind !== 'checklist' && (
                            <Button variant="ghost" size="sm" icon={<Pencil size={12} />} onClick={() => onEdit(item)}>编辑</Button>
                          )}
                          <Button variant="ghost" size="sm" icon={<ArrowUp size={12} />} disabled={idx === 0} aria-label={`上移${item.name}`} onClick={() => onMove(item.key, -1)} />
                          <Button variant="ghost" size="sm" icon={<ArrowDown size={12} />} disabled={isLast} aria-label={`下移${item.name}`} onClick={() => onMove(item.key, 1)} />
                          {item.kind !== 'checklist' && (
                            <Button variant="ghost" size="sm" icon={<Trash2 size={12} />} style={{ color: '#C73A3A' }} aria-label={`删除${item.name}`} onClick={() => onRemove(item.key)} />
                          )}
                        </span>
                      )}
                    </div>
                    <div style={{ margin: '7px 0 0 38px', display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start' }}>
                      {item.templateRef && <RefMaterialTag refMat={item.templateRef} />}
                      {points > 0 && <AuditPointsBox item={item} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 新建模板弹窗 ─────────────────────────────────────────────────────────────

function CreateTemplateModal({
  open,
  templates,
  onClose,
  onCreate,
}: {
  open: boolean;
  templates: PharmaAccessTemplate[];
  onClose: () => void;
  onCreate: (name: string, init: TemplateInitSource) => void;
}) {
  const [name, setName] = useState('');
  const [initType, setInitType] = useState<'blank' | 'default' | 'copy'>('default');
  const [copyFrom, setCopyFrom] = useState<string>('');
  useEffect(() => {
    if (open) {
      setName('');
      setInitType('default');
      setCopyFrom('');
    }
  }, [open]);
  return (
    <Modal
      open={open}
      title="新建准入模板"
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={name.trim().length < 2} onClick={() => onCreate(name.trim(), initType === 'copy' ? { type: 'copy', sourceTemplateId: copyFrom } : { type: initType })}>
            创建模板
          </Button>
        </>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, marginBottom: 6 }}>模板名称 <span style={{ color: '#C73A3A' }}>*</span></div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：标准合作 / 重点合作"
          style={{ width: '100%', border: '1px solid var(--color-border-strong)', borderRadius: 6, padding: '8px 10px', fontSize: 'var(--fs-13)', outline: 'none' }}
        />
      </div>
      <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, marginBottom: 6 }}>初始化方式</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {([
          { key: 'default', title: '从系统默认模板开始', desc: `预置 ${DEFAULT_ACCESS_TEMPLATE_ITEMS.length} 项通用准入项，可自由增删改` },
          { key: 'blank', title: '空白模板', desc: '不预置任何项，完全自定义' },
          { key: 'copy', title: '复制现有模板', desc: '以本厂已有模板为底稿' },
        ] as const).map((opt) => (
          <label
            key={opt.key}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
              border: initType === opt.key ? '1.5px solid var(--color-brand)' : '1px solid var(--color-border)',
              borderRadius: 8, cursor: 'pointer', background: initType === opt.key ? 'var(--color-brand-subtle)' : '#fff',
            }}
          >
            <input type="radio" name="va-init" checked={initType === opt.key} onChange={() => setInitType(opt.key)} style={{ marginTop: 2, accentColor: 'var(--color-brand)' }} />
            <div>
              <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>{opt.title}</div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-2)', marginTop: 2 }}>{opt.desc}</div>
              {opt.key === 'copy' && initType === 'copy' && (
                <select
                  value={copyFrom}
                  onChange={(e) => setCopyFrom(e.target.value)}
                  style={{ marginTop: 8, border: '1px solid var(--color-border-strong)', borderRadius: 6, padding: '6px 8px', fontSize: 'var(--fs-13)' }}
                >
                  <option value="">选择来源模板…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}（{t.items.length} 项）</option>
                  ))}
                </select>
              )}
            </div>
          </label>
        ))}
      </div>
    </Modal>
  );
}

// ─── 添加默认模板项选择器 ─────────────────────────────────────────────────────

function AddDefaultPicker({ template, onPicksChange }: { template: PharmaAccessTemplate; onPicksChange: (picks: string[]) => void }) {
  const present = new Set(template.items.map((i) => i.key));
  const available = DEFAULT_ACCESS_TEMPLATE_ITEMS.filter((d) => !present.has(d.key));
  const [picks, setPicks] = useState<string[]>(available.map((d) => d.key));
  useEffect(() => {
    onPicksChange(picks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks]);
  if (available.length === 0) {
    return <EmptyState title="默认模板项均已存在" description="当前模板已包含全部系统默认模板项。" />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {available.map((d) => (
        <label key={d.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={picks.includes(d.key)}
            onChange={(e) => setPicks((p) => (e.target.checked ? [...p, d.key] : p.filter((k) => k !== d.key)))}
            style={{ marginTop: 2, accentColor: 'var(--color-brand)' }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>{d.name}</span>
              <KindBadge kind={d.kind} />
              <span style={{ fontSize: 'var(--fs-11)', color: d.required ? '#C73A3A' : '#98A2B3' }}>{d.required ? '必传' : '选传'}</span>
            </div>
            <div style={{ fontSize: 'var(--fs-11)', color: 'var(--color-text-3)', marginTop: 2 }}>{d.group} · {kindLabel(d.kind)}</div>
          </div>
        </label>
      ))}
    </div>
  );
}

// ─── 项编辑弹窗（kind 动态字段：文件类=单份 / 图片类=数量）────────────────────

function ItemEditModal({
  init,
  existingGroups,
  knownGroups,
  existingKeys,
  onClose,
  onSave,
}: {
  init: AccessTemplateItem | null;
  existingGroups: string[];
  /** 历史出现过的分组名（含已整组删除的大项），新建项时可重新选择 */
  knownGroups?: string[];
  existingKeys: string[];
  onClose: () => void;
  onSave: (item: AccessTemplateItem) => void;
}) {
  const [kind, setKind] = useState<AccessItemKind>(init?.kind ?? 'file');
  const [group, setGroup] = useState(init?.group ?? '证照资质');
  const [name, setName] = useState(init?.name ?? '');
  const [required, setRequired] = useState(init?.required ?? true);
  const [minCount, setMinCount] = useState(init?.minCount ?? 3);
  const [refOn, setRefOn] = useState(!!init?.templateRef);
  const [refEnforced, setRefEnforced] = useState(init?.templateRef?.enforced ?? false);
  const [refFile, setRefFile] = useState(init?.templateRef?.fileName ?? '');
  const [refNote, setRefNote] = useState(init?.templateRef?.note ?? '');
  const [checkPoints, setCheckPoints] = useState(init?.checkPoints ?? '');
  const [purpose, setPurpose] = useState(init?.purpose ?? '');
  const [options, setOptions] = useState<string[]>(init?.options ?? []);
  const [optionDraft, setOptionDraft] = useState('');
  const [error, setError] = useState('');
  const refFileInputRef = useRef<HTMLInputElement>(null);

  const isUpload = kind === 'file' || kind === 'image';
  const isImage = kind === 'image';

  function save() {
    if (!name.trim()) { setError('请填写项名称'); return; }
    if (kind === 'form-select' && options.length < 2) { setError('单选项须配置至少 2 个选项'); return; }
    if (refOn && !refFile.trim()) { setError('请上传参考材料文件'); return; }
    onSave({
      key: init?.key ?? `it-${Date.now().toString(36)}`,
      group: group.trim() || '未分组',
      name: name.trim(),
      kind,
      required,
      ...(isImage ? { minCount: Math.max(1, minCount) } : {}),
      ...(isUpload && refOn ? { templateRef: { fileName: refFile.trim(), note: refNote.trim() || undefined, enforced: refEnforced } } : {}),
      checkPoints: checkPoints.trim() || undefined,
      purpose: purpose.trim() || undefined,
      ...(kind === 'form-select' ? { options: [...options] } : {}),
      builtin: init?.builtin,
    });
  }

  const groupCandidates = [...new Set([...existingGroups, ...(knownGroups ?? []), '证照资质', '人员与社保', '经营场地', '制度与承诺', '财务资料', '外部核查'])];

  return (
    <Modal
      open
      title={init ? '编辑准入项' : '新增准入项'}
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={save}>{init ? '保存修改' : '添加到模板'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 项类型（上传两类 + 填写四类） */}
        <div>
          <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, marginBottom: 6 }}>项类型 <span style={{ color: '#C73A3A' }}>*</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ACCESS_KIND_GROUPS.map((g) => (
              <div key={g.title} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ width: 44, fontSize: 'var(--fs-11)', color: 'var(--color-text-3)', fontWeight: 600, flexShrink: 0 }}>{g.title}</span>
                {g.kinds.map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
                      borderRadius: 6, cursor: 'pointer', fontSize: 'var(--fs-12)', fontWeight: 600,
                      border: kind === k ? '1.5px solid var(--color-brand)' : '1px solid var(--color-border)',
                      background: kind === k ? 'var(--color-brand-subtle)' : '#fff',
                      color: kind === k ? 'var(--color-brand)' : 'var(--color-text-2)',
                    }}
                  >
                    <KindBadge kind={k} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* 基础字段（名称首位） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={fieldLabelStyle}>
            <span>项名称 <span style={{ color: '#C73A3A' }}>*</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：廉洁合规承诺书" style={fieldInputStyle} />
          </label>
          <label style={fieldLabelStyle}>
            <span>所属分组</span>
            <input value={group} onChange={(e) => setGroup(e.target.value)} list="va-group-list" style={fieldInputStyle} />
            <datalist id="va-group-list">
              {groupCandidates.map((g) => <option key={g} value={g} />)}
            </datalist>
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)' }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} style={{ accentColor: 'var(--color-brand)', width: 15, height: 15 }} />
          必传/必填（服务商提交时强制校验）
        </label>

        {/* 上传类配置区：文件类=单份说明 / 图片类=数量设置 */}
        {isUpload && (
          isImage ? (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>图片数量</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)', fontWeight: 600 }}>
                  最少张数
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0, border: '1px solid var(--color-border-strong)', borderRadius: 6, overflow: 'hidden' }}>
                    <button onClick={() => setMinCount((v) => Math.max(1, v - 1))} style={{ border: 'none', background: '#F9FAFB', cursor: 'pointer', padding: '5px 10px', fontSize: 'var(--fs-14)' }}>−</button>
                    <span style={{ minWidth: 36, textAlign: 'center', fontFamily: mono, fontSize: 'var(--fs-13)' }}>{Math.max(1, minCount)}</span>
                    <button onClick={() => setMinCount((v) => v + 1)} style={{ border: 'none', background: '#F9FAFB', cursor: 'pointer', padding: '5px 10px', fontSize: 'var(--fs-14)' }}>＋</button>
                  </span>
                </div>
                <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)' }}>
                  服务商可上传一张或多张，须满足最少张数；提交校验提示：已传 n / 至少 {Math.max(1, minCount)} 张
                </span>
              </div>
            </div>
          ) : (
            <div style={{ padding: '9px 12px', borderRadius: 8, background: '#F9FAFB', border: '1px solid var(--color-border)', fontSize: 'var(--fs-12)', color: 'var(--color-text-2)', lineHeight: 1.7 }}>
              文件类：服务商仅可上传 <strong style={{ color: 'var(--color-text-1)' }}>1 份</strong>文件；选择文件时支持批量勾选，系统仅保留一份，重新选择即替换。
            </div>
          )
        )}

        {/* 参考材料（上传样例文件自动读取文件名 + 参考说明） */}
        {isUpload && (
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)', fontWeight: 600 }}>
              <input type="checkbox" checked={refOn} onChange={(e) => setRefOn(e.target.checked)} style={{ accentColor: 'var(--color-brand)', width: 15, height: 15 }} />
              挂载参考材料（上传样例文件供服务商下载）
            </label>
            {refOn && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <input
                  ref={refFileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (picked?.name) setRefFile(picked.name);
                    e.target.value = '';
                  }}
                />
                {refFile.trim() ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <FileChip name={refFile} onRemove={() => setRefFile('')} />
                    <Button variant="ghost" size="sm" icon={<Upload size={12} />} onClick={() => refFileInputRef.current?.click()}>
                      重新上传
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => refFileInputRef.current?.click()}
                    style={{
                      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      padding: '18px 16px', borderRadius: 8, cursor: 'pointer',
                      border: '1.5px dashed var(--color-border-strong)', background: '#FAFBFC', color: '#667085',
                    }}
                  >
                    <Upload size={18} style={{ color: 'var(--color-brand)' }} />
                    <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>上传参考材料文件</span>
                    <span style={{ fontSize: 'var(--fs-12)' }}>上传后自动读取文件名；原型仅记录文件名，不做真实文件解析</span>
                  </button>
                )}
                <label style={fieldLabelStyle}>
                  <span style={{ whiteSpace: 'nowrap' }}>参考说明（选填）</span>
                  <input value={refNote} onChange={(e) => setRefNote(e.target.value)} placeholder="如：请下载后签署盖章上传" style={{ ...fieldInputStyle, minWidth: 0 }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)', padding: '8px 10px', borderRadius: 6, background: 'var(--color-brand-subtle)' }}>
                  <input type="checkbox" checked={refEnforced} onChange={(e) => setRefEnforced(e.target.checked)} style={{ accentColor: 'var(--color-brand)', width: 15, height: 15 }} />
                  <span style={{ fontWeight: 600, color: 'var(--color-brand)' }}>必须使用该模板</span>
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-2)' }}>（开启后服务商端以强提示展示，如指定年度承诺书模版）</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* form-select 选项 */}
        {kind === 'form-select' && (
          <div>
            <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, marginBottom: 6 }}>选项（至少 2 个）</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {options.map((opt, i) => (
                <span key={`${opt}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: '#F3F4F6', fontSize: 'var(--fs-12)' }}>
                  {opt}
                  <button onClick={() => setOptions((p) => p.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#C73A3A', fontWeight: 700 }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={optionDraft}
                onChange={(e) => setOptionDraft(e.target.value)}
                placeholder="输入选项文字后回车添加"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && optionDraft.trim()) {
                    e.preventDefault();
                    setOptions((p) => [...p, optionDraft.trim()]);
                    setOptionDraft('');
                  }
                }}
                style={{ ...fieldInputStyle, maxWidth: 320 }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!optionDraft.trim()}
                onClick={() => {
                  setOptions((p) => [...p, optionDraft.trim()]);
                  setOptionDraft('');
                }}
              >
                添加
              </Button>
            </div>
          </div>
        )}

        {/* 审核点 / 用途 */}
        <label style={fieldLabelStyle}>
          审核点（选填；每行一条，服务商提交前可见，审核员逐条对照）
          <textarea
            value={checkPoints}
            onChange={(e) => setCheckPoints(e.target.value)}
            rows={3}
            placeholder={'1.须加盖公章；\n2.人数须满足合作要求；\n3.须在有效期内。'}
            style={{ ...fieldInputStyle, resize: 'vertical' }}
          />
        </label>
        <label style={fieldLabelStyle}>
          资料用途（选填）
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="说明该材料用于核验什么" style={fieldInputStyle} />
        </label>

        {error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-12)' }}>{error}</div>}
      </div>
    </Modal>
  );
}

const fieldLabelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)',
};

const fieldInputStyle: CSSProperties = {
  border: '1px solid var(--color-border-strong)', borderRadius: 6, padding: '8px 10px',
  fontSize: 'var(--fs-13)', outline: 'none', fontWeight: 400, background: '#fff',
};

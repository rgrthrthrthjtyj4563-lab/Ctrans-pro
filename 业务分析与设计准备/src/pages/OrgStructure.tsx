/**
 * 组织架构（极简精致树形表）：仅保留基础查询、新增、修改、删除。
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { usePermission } from '../context/PermissionContext';
import { useAcceptance } from '../context/AcceptanceContext';
import { activeAcceptanceDepartments } from '../data/acceptanceData';
import {
  enterpriseRootOf,
  isDeptParentType,
  isMembershipUnassigned,
  orgChildren,
  orgDescendantIds,
  orgPathLabel,
  type PermOrg,
} from '../data/permissions';
import { membershipsOfTenant, subscribeTenantMemberships } from '../data/cooperationModel';
import type { NavigateFn } from '../types';
import type { ToastMessage } from '../components/Toast';
import { Field, inputStyle } from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navigate?: NavigateFn;
}

type DeptForm =
  | { mode: 'create'; parentId: string; name: string }
  | { mode: 'edit'; orgId: string; parentId: string; name: string };

const cardStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  boxShadow: 'var(--shadow-xs)',
  overflow: 'hidden',
} as const;

const headCellStyle = {
  padding: '12px 16px',
  textAlign: 'left' as const,
  fontSize: 'var(--fs-12)',
  fontWeight: 500,
  color: 'var(--color-text-2)',
  background: '#FAFBFC',
  borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap' as const,
};

const bodyCellStyle = {
  padding: '13px 16px',
  fontSize: 'var(--fs-13)',
  color: 'var(--color-text-1)',
  borderBottom: '1px solid #F1F3F5',
  verticalAlign: 'middle' as const,
};

const actionBtnStyle = {
  background: 'none',
  border: 'none',
  padding: '4px 6px',
  borderRadius: 6,
  fontSize: 'var(--fs-13)',
  fontWeight: 500,
  color: 'var(--color-brand)',
  cursor: 'pointer',
  transition: 'background 150ms ease',
} as const;

export function OrgStructure({ addToast }: Props) {
  const store = usePermission();
  const { config: acceptanceConfig } = useAcceptance();
  const { orgs, can, previewReadOnly, principal } = store;
  const tenantRootId = principal.realm === 'TENANT' ? principal.tenantId : 'org-platform';
  const tenantRoot = orgs.find(o => o.id === tenantRootId);

  const [membershipVersion, bump] = useState(0);
  useEffect(() => subscribeTenantMemberships(() => bump(x => x + 1)), []);

  const [keyword, setKeyword] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([tenantRootId]));
  const [form, setForm] = useState<DeptForm | null>(null);
  const [deleting, setDeleting] = useState<PermOrg | null>(null);

  const canCreate = can('org-structure', 'create') && !previewReadOnly;
  const canEdit = can('org-structure', 'edit') && !previewReadOnly;
  const canDelete = can('org-structure', 'delete') && !previewReadOnly;

  const tenantOrgIds = useMemo(() => new Set(orgDescendantIds(orgs, tenantRootId)), [orgs, tenantRootId]);
  const scopedOrgs = useMemo(() => orgs.filter(o => tenantOrgIds.has(o.id)), [orgs, tenantOrgIds]);

  const activeMemberships = useMemo(
    () => membershipsOfTenant(tenantRootId).filter(m => m.status !== 'removed' && m.status !== 'left'),
    [tenantRootId, membershipVersion],
  );
  /** 当前生效验收配置引用的部门名（改名/删除的唯一拦截口径，未发布草稿不参与） */
  const acceptanceDeptNames = useMemo(
    () => activeAcceptanceDepartments(acceptanceConfig),
    [acceptanceConfig],
  );
  /** 待分配成员：原部门已被删除/裁撤，只计入企业根节点人数 */
  const unassignedCount = useMemo(
    () => activeMemberships.filter(m => isMembershipUnassigned(scopedOrgs, m, tenantRootId)).length,
    [activeMemberships, scopedOrgs, tenantRootId],
  );
  const directCount = (orgId: string) => activeMemberships.filter(m => m.orgUnitId === orgId).length;
  const totalCount = (orgId: string) => {
    const subIds = new Set(orgDescendantIds(scopedOrgs, orgId));
    const inTree = activeMemberships.filter(m => subIds.has(m.orgUnitId)).length;
    // 企业根节点统计该企业现有成员，含待分配成员
    return orgId === tenantRootId ? inTree + unassignedCount : inTree;
  };

  useEffect(() => {
    setExpanded(new Set(scopedOrgs.map(o => o.id)));
  }, [tenantRootId]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (kw) {
      return scopedOrgs
        .filter(o => o.name.toLowerCase().includes(kw))
        .map(org => ({ org, depth: 0, hasChildren: false }));
    }
    const list: { org: PermOrg; depth: number; hasChildren: boolean }[] = [];
    const walk = (node: PermOrg, depth: number) => {
      const children = orgChildren(scopedOrgs, node.id);
      list.push({ org: node, depth, hasChildren: children.length > 0 });
      if (expanded.has(node.id)) {
        children.forEach(c => walk(c, depth + 1));
      }
    };
    if (tenantRoot) walk(tenantRoot, 0);
    return list;
  }, [expanded, keyword, scopedOrgs, tenantRoot]);

  const allParentIds = useMemo(
    () => scopedOrgs.filter(o => orgChildren(scopedOrgs, o.id).length > 0).map(o => o.id),
    [scopedOrgs],
  );
  const isAllExpanded = allParentIds.length > 0 && expanded.size >= allParentIds.length;

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandAll = () => {
    setExpanded(isAllExpanded ? new Set([tenantRootId]) : new Set(allParentIds));
  };

  const parentOptions = (excludeId?: string) => {
    const exclude = excludeId ? new Set(orgDescendantIds(scopedOrgs, excludeId)) : new Set<string>();
    return scopedOrgs.filter(o => {
      if (exclude.has(o.id)) return false;
      if (!isDeptParentType(o.type) && o.type !== 'platform') return false;
      return enterpriseRootOf(scopedOrgs, o.id)?.id === tenantRootId;
    });
  };

  function submitForm() {
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      addToast({ type: 'error', title: '请输入部门名称' });
      return;
    }
    if (form.mode === 'create') {
      const res = store.addDepartment({ name, parentId: form.parentId });
      if (!res.ok) return addToast({ type: 'error', title: res.error || '新增失败' });
      setExpanded(prev => new Set([...prev, form.parentId]));
      addToast({ type: 'success', title: '已新增部门' });
    } else {
      const res = store.updateDepartment({
        orgId: form.orgId,
        name,
        parentId: form.parentId,
        businessRefDeptNames: acceptanceDeptNames,
      });
      if (!res.ok) return addToast({ type: 'error', title: res.error || '修改失败' });
      addToast({ type: 'success', title: '已保存修改' });
    }
    setForm(null);
  }

  function confirmDelete() {
    if (!deleting) return;
    const res = store.deleteDepartment({ orgId: deleting.id, businessRefDeptNames: acceptanceDeptNames });
    if (!res.ok) {
      const others = (res.blockers ?? []).slice(1).map(b => b.message);
      addToast({
        type: 'error',
        title: res.error || '存在下级部门或成员，无法删除',
        description: others.length > 0 ? others.join('；') : undefined,
      });
    } else {
      addToast({ type: 'success', title: '已删除部门' });
    }
    setDeleting(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-canvas)' }}>
      <PageHeader
        title="组织架构"
        actions={canCreate ? (
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={15} />}
            onClick={() => setForm({ mode: 'create', parentId: tenantRootId, name: '' })}
          >
            新增部门
          </Button>
        ) : undefined}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={cardStyle}>
          {/* 顶部工具栏 */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}>
            <div style={{ position: 'relative', width: 240 }}>
              <Search
                size={14}
                aria-hidden
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }}
              />
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="搜索部门名称"
                style={{ ...inputStyle, height: 34, paddingLeft: 32, borderRadius: 8 }}
              />
            </div>
            {keyword && (
              <Button variant="ghost" size="sm" onClick={() => setKeyword('')}>重置</Button>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-2)' }}>
                共 <strong style={{ color: 'var(--color-text-1)', fontWeight: 600 }}>{scopedOrgs.length}</strong> 个节点
              </span>
              {allParentIds.length > 0 && (
                <Button variant="outline" size="sm" onClick={toggleExpandAll}>
                  {isAllExpanded ? '全部折叠' : '全部展开'}
                </Button>
              )}
            </div>
          </div>

          {/* 树形表格 */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headCellStyle}>部门名称</th>
                <th style={{ ...headCellStyle, width: 140 }}>成员数</th>
                <th style={{ ...headCellStyle, width: 110 }}>状态</th>
                <th style={{ ...headCellStyle, width: 200, textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ org, depth, hasChildren }) => {
                const isRoot = org.id === tenantRootId;
                const open = expanded.has(org.id);
                const isDisabled = org.status === 'disabled';
                const hovered = hoveredId === org.id;
                const direct = directCount(org.id);
                const total = totalCount(org.id);
                const canAddChild = canCreate && !isDisabled && (isDeptParentType(org.type) || org.type === 'platform');

                return (
                  <tr
                    key={org.id}
                    onMouseEnter={() => setHoveredId(org.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      background: hovered ? '#F8FAFB' : '#FFFFFF',
                      transition: 'background 120ms ease',
                    }}
                  >
                    <td style={bodyCellStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: depth * 24 }}>
                        {hasChildren ? (
                          <button
                            type="button"
                            aria-label={open ? '折叠' : '展开'}
                            onClick={() => toggleExpand(org.id)}
                            style={{
                              width: 22,
                              height: 22,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: 'none',
                              background: hovered ? '#EEF1F4' : 'transparent',
                              borderRadius: 5,
                              color: '#6B7280',
                              cursor: 'pointer',
                              padding: 0,
                              flexShrink: 0,
                            }}
                          >
                            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        ) : (
                          <span style={{
                            width: 22,
                            height: 22,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <span style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: isRoot ? 'var(--color-brand)' : '#D1D5DB',
                            }} />
                          </span>
                        )}
                        <span style={{
                          fontWeight: isRoot ? 600 : 500,
                          fontSize: isRoot ? 'var(--fs-14)' : 'var(--fs-13)',
                          color: isDisabled ? 'var(--color-text-3)' : 'var(--color-text-1)',
                        }}>
                          {org.name}
                        </span>
                      </div>
                    </td>
                    <td style={bodyCellStyle}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span
                          className="font-mono-nums"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 24,
                            height: 22,
                            padding: '0 8px',
                            borderRadius: 999,
                            fontSize: 'var(--fs-12)',
                            fontWeight: 500,
                            background: total > 0 ? 'var(--color-brand-subtle)' : '#F3F4F6',
                            color: total > 0 ? 'var(--color-brand)' : 'var(--color-text-3)',
                          }}
                        >
                          {total}
                        </span>
                        {hasChildren && direct !== total && (
                          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)' }}>
                            直属 {direct}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={bodyCellStyle}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 'var(--fs-12)',
                        fontWeight: 500,
                        color: isDisabled ? 'var(--color-text-3)' : 'var(--color-success-fg)',
                      }}>
                        <span style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: isDisabled ? '#9CA3AF' : 'var(--color-success-fg)',
                        }} />
                        {isDisabled ? '已停用' : '启用'}
                      </span>
                    </td>
                    <td style={{ ...bodyCellStyle, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {canAddChild && (
                          <button
                            type="button"
                            style={actionBtnStyle}
                            onClick={() => setForm({ mode: 'create', parentId: org.id, name: '' })}
                          >
                            新增下级
                          </button>
                        )}
                        {canEdit && !isRoot && (
                          <button
                            type="button"
                            style={actionBtnStyle}
                            onClick={() => setForm({ mode: 'edit', orgId: org.id, parentId: org.parentId ?? tenantRootId, name: org.name })}
                          >
                            修改
                          </button>
                        )}
                        {canDelete && !isRoot && (
                          <button
                            type="button"
                            style={{ ...actionBtnStyle, color: 'var(--color-danger-fg)' }}
                            onClick={() => setDeleting(org)}
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal
          open
          title={form.mode === 'create' ? '新增部门' : '修改部门'}
          onClose={() => setForm(null)}
          width={440}
          footer={
            <>
              <Button variant="outline" onClick={() => setForm(null)}>取消</Button>
              <Button variant="primary" onClick={submitForm}>保存</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <Field label="上级部门" required>
              <select
                value={form.parentId}
                onChange={e => setForm({ ...form, parentId: e.target.value })}
                style={{ ...inputStyle, height: 38, borderRadius: 8 }}
              >
                {parentOptions(form.mode === 'edit' ? form.orgId : undefined).map(o => (
                  <option key={o.id} value={o.id}>{orgPathLabel(scopedOrgs, o.id)}</option>
                ))}
              </select>
            </Field>
            <Field label="部门名称" required>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                style={{ ...inputStyle, height: 38, borderRadius: 8 }}
                placeholder="例如：华东大区、市场部"
                autoFocus
              />
            </Field>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          open
          title="删除部门"
          description={`确定删除部门「${deleting.name}」吗？若存在下级部门或成员将无法删除。`}
          confirmLabel="确认删除"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

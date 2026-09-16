/**
 * 组织架构（唯一组织配置入口）：回答「这个人/部门/工作组属于哪里」。
 * 负责企业根、部门、工作组（服务商）节点的建立、上下级与成员归属展示；
 * 节点详情展示直属人员明细（姓名/账号、身份展示、账号状态、最近登录/授权）
 * 与工作组组长。角色能力与人员授权统一在「角色与数据范围」；企业间合作关系
 * 不在组织树中维护。租户边界：树只展示当前企业租户（或平台工作空间）子树。
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CornerUpRight, MoreHorizontal, Pencil, Plus, UserCheck, Users } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { StatusTag, Tag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import {
  ORG_TYPE_LABEL,
  enterpriseRootOf,
  identityLabel,
  isDeptParentType,
  latestAssignmentAt,
  orgChildren,
  orgDescendantIds,
  orgPathLabel,
  resolveGroupLeader,
  sameLevelDeptNameExists,
  type PermOrg,
} from '../data/permissions';
import type { ToastMessage } from '../components/Toast';
import { membershipsOfTenant, subscribeTenantMemberships } from '../data/cooperationModel';
import { Field, InfoBanner, inputStyle, tdStyle, thStyle } from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

const iconBtnStyle = {
  width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', padding: 0, color: '#6B7280', cursor: 'pointer', borderRadius: 4, flexShrink: 0,
} as const;

export function OrgStructure({ addToast }: Props) {
  const store = usePermission();
  const { orgs, users, assignments, can, previewReadOnly, principal, groupLeaders } = store;
  const tenantRootId = principal.realm === 'TENANT' ? principal.tenantId : 'org-platform';
  const tenantRoot = orgs.find(o => o.id === tenantRootId);
  const isProviderTenant = tenantRoot?.type === 'provider';

  const [selectedOrgId, setSelectedOrgId] = useState<string>(tenantRootId);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([tenantRootId]));
  const [hoveredOrgId, setHoveredOrgId] = useState<string | null>(null);
  const [menuOrgId, setMenuOrgId] = useState<string | null>(null);
  const [createDept, setCreateDept] = useState<{ parentId: string; name: string } | null>(null);
  const [moveDept, setMoveDept] = useState<{ orgId: string; targetId: string; reason: string } | null>(null);
  const [renameDept, setRenameDept] = useState<{ orgId: string; name: string } | null>(null);
  const [createGroup, setCreateGroup] = useState<{ name: string; reason: string } | null>(null);
  const [renameGroup, setRenameGroup] = useState<{ orgId: string; name: string } | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<{ orgId: string; moveToId: string; reason: string; error: string } | null>(null);

  const canCreate = can('org-structure', 'create') && !previewReadOnly;
  const canEdit = can('org-structure', 'edit') && !previewReadOnly;

  // 成员归属按「当前租户成员身份的 orgUnit」统计（不读 User.orgId 主档）
  const [, bump] = useState(0);
  useEffect(() => subscribeTenantMemberships(() => bump(x => x + 1)), []);
  const memberships = membershipsOfTenant(tenantRootId);
  const directMemberCount = (orgId: string) => memberships.filter(m => m.orgUnitId === orgId).length;

  /** 租户边界：本组织子树之外的节点不进入树与可选上级 */
  const tenantOrgIds = useMemo(() => new Set(orgDescendantIds(orgs, tenantRootId)), [orgs, tenantRootId]);
  const scopedOrgs = useMemo(() => orgs.filter(o => tenantOrgIds.has(o.id)), [orgs, tenantOrgIds]);

  const selectedOrg = scopedOrgs.find(o => o.id === selectedOrgId) ?? tenantRoot;

  /** 组长有效性（实时派生） */
  const leaderOfGroup = (groupId: string) =>
    resolveGroupLeader(groupId, groupLeaders[groupId], { users, assignments, memberships, tenantId: tenantRootId });

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderTreeNode(org: PermOrg, depth: number) {
    const children = orgChildren(scopedOrgs, org.id);
    const hasChildren = children.length > 0;
    const open = expanded.has(org.id);
    const selected = selectedOrgId === org.id;
    const direct = directMemberCount(org.id);
    const showActions = (hoveredOrgId === org.id || selected || menuOrgId === org.id) && !previewReadOnly;
    const leader = org.type === 'group' ? leaderOfGroup(org.id) : undefined;
    return (
      <div key={org.id}>
        <div
          style={{
            position: 'relative', display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 6px', paddingLeft: 6 + depth * 14, borderRadius: 6, cursor: 'pointer',
            background: selected ? 'var(--color-brand-subtle)' : 'transparent',
            color: selected ? 'var(--color-brand)' : 'var(--color-text-1)',
          }}
          onMouseEnter={() => setHoveredOrgId(org.id)}
          onMouseLeave={() => setHoveredOrgId(null)}
          onClick={() => { setSelectedOrgId(org.id); setMenuOrgId(null); }}
        >
          <button
            type="button" aria-label={open ? '折叠' : '展开'}
            onClick={e => { e.stopPropagation(); if (hasChildren) toggleExpand(org.id); }}
            style={{ ...iconBtnStyle, color: hasChildren ? '#9CA3AF' : 'transparent', cursor: hasChildren ? 'pointer' : 'default' }}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-13)', fontWeight: selected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {org.name}
            {leader && (
              <span
                title={leader.status === 'valid' ? `工作组组长：${leader.userName}` : '待指定组长（禁止下派新的管理任务）'}
                style={{
                  fontSize: 'var(--fs-10)', padding: '1px 5px', borderRadius: 999, flexShrink: 0,
                  background: leader.status === 'valid' ? '#E6F5ED' : '#FEF3E2',
                  color: leader.status === 'valid' ? '#248A5A' : '#C77A16', fontWeight: 600,
                }}
              >
                {leader.status === 'valid' ? `组长·${leader.userName}` : '待指定组长'}
              </span>
            )}
          </span>
          <span style={{ fontSize: 'var(--fs-10)', color: '#9CA3AF', flexShrink: 0 }}>{ORG_TYPE_LABEL[org.type]}</span>
          <span
            title={`直属 ${direct} 人`}
            style={{
              minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#F3F4F6', color: '#374151',
              fontSize: 'var(--fs-11)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {direct}
          </span>
          {showActions && (
            <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              {canCreate && isDeptParentType(org.type) && (
                <button type="button" title="新建下级部门" style={iconBtnStyle} onClick={() => setCreateDept({ parentId: org.id, name: '' })}>
                  <Plus size={13} />
                </button>
              )}
              {canCreate && isProviderTenant && org.type === 'provider' && (
                <button type="button" title="新建工作组" style={iconBtnStyle} onClick={() => setCreateGroup({ name: '', reason: '' })}>
                  <Plus size={13} />
                </button>
              )}
              {canEdit && org.type === 'department' && (
                <>
                  <button type="button" title="调整汇报上级" style={iconBtnStyle} onClick={() => setMoveDept({ orgId: org.id, targetId: org.parentId ?? '', reason: '' })}>
                    <CornerUpRight size={13} />
                  </button>
                  <button type="button" title="更多" style={iconBtnStyle} onClick={() => setMenuOrgId(menuOrgId === org.id ? null : org.id)}>
                    <MoreHorizontal size={13} />
                  </button>
                </>
              )}
              {canEdit && org.type === 'group' && (
                <button type="button" title="更多（重命名/删除工作组）" style={iconBtnStyle} onClick={() => setMenuOrgId(menuOrgId === org.id ? null : org.id)}>
                  <MoreHorizontal size={13} />
                </button>
              )}
              {menuOrgId === org.id && org.type === 'department' && (
                <span style={{
                  position: 'absolute', top: '100%', right: 0, zIndex: 30, background: '#fff',
                  border: '1px solid var(--color-border)', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 110,
                }}>
                  <button
                    type="button"
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 'var(--fs-12)', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#374151' }}
                    onClick={e => { e.stopPropagation(); setMenuOrgId(null); setRenameDept({ orgId: org.id, name: org.name }); }}
                  >
                    重命名部门
                  </button>
                </span>
              )}
              {menuOrgId === org.id && org.type === 'group' && (
                <span style={{
                  position: 'absolute', top: '100%', right: 0, zIndex: 30, background: '#fff',
                  border: '1px solid var(--color-border)', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 110,
                }}>
                  <button
                    type="button"
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 'var(--fs-12)', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#374151' }}
                    onClick={e => { e.stopPropagation(); setMenuOrgId(null); setRenameGroup({ orgId: org.id, name: org.name }); }}
                  >
                    重命名工作组
                  </button>
                  <button
                    type="button"
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 'var(--fs-12)', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#C73A3A' }}
                    onClick={e => { e.stopPropagation(); setMenuOrgId(null); setDeleteGroup({ orgId: org.id, moveToId: '', reason: '', error: '' }); }}
                  >
                    删除工作组
                  </button>
                </span>
              )}
            </span>
          )}
        </div>
        {open && children.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  }

  function submitCreateDept() {
    if (!createDept) return;
    const result = store.addDepartment({ name: createDept.name, parentId: createDept.parentId });
    if (!result.ok) {
      addToast({ type: 'error', title: '新建部门失败', description: result.error });
      return;
    }
    if (result.org) {
      setExpanded(prev => new Set([...prev, createDept.parentId, result.org!.id]));
      setSelectedOrgId(result.org.id);
    }
    addToast({ type: 'success', title: '已新建部门', description: createDept.name });
    setCreateDept(null);
  }

  function submitRenameDept() {
    if (!renameDept) return;
    const result = store.updateDepartment({ orgId: renameDept.orgId, name: renameDept.name });
    if (!result.ok) {
      addToast({ type: 'error', title: '重命名失败', description: result.error });
      return;
    }
    addToast({ type: 'success', title: '部门已重命名', description: renameDept.name });
    setRenameDept(null);
  }

  function submitMoveDept() {
    if (!moveDept) return;
    const result = store.updateDepartment({ orgId: moveDept.orgId, parentId: moveDept.targetId, reason: moveDept.reason.trim() || undefined });
    if (!result.ok) {
      addToast({ type: 'error', title: '调整失败', description: result.error });
      return;
    }
    addToast({ type: 'success', title: '已调整汇报上级', description: '人员归属路径已变化；角色数据范围不自动迁移。' });
    setMoveDept(null);
  }

  function submitCreateGroup() {
    if (!createGroup) return;
    const result = store.addWorkGroup({ name: createGroup.name, reason: createGroup.reason });
    if (!result.ok) {
      addToast({ type: 'error', title: '新建工作组失败', description: result.error });
      return;
    }
    if (result.org) {
      setExpanded(prev => new Set([...prev, tenantRootId, result.org!.id]));
      setSelectedOrgId(result.org.id);
    }
    addToast({ type: 'success', title: '已新建工作组', description: `${createGroup.name} · 请在「工作组管理」指定组长后承接任务` });
    setCreateGroup(null);
  }

  function submitRenameGroup() {
    if (!renameGroup) return;
    const result = store.renameWorkGroup({ orgId: renameGroup.orgId, name: renameGroup.name });
    if (!result.ok) {
      addToast({ type: 'error', title: '重命名失败', description: result.error });
      return;
    }
    addToast({ type: 'success', title: '工作组已重命名', description: renameGroup.name });
    setRenameGroup(null);
  }

  function submitDeleteGroup() {
    if (!deleteGroup) return;
    const result = store.deleteWorkGroup({ orgId: deleteGroup.orgId, moveToId: deleteGroup.moveToId || undefined, reason: deleteGroup.reason });
    if (!result.ok) {
      setDeleteGroup({ ...deleteGroup, error: result.error || '删除失败' });
      return;
    }
    addToast({ type: 'success', title: '工作组已删除', description: '历史授权记录保留供审计' });
    setDeleteGroup(null);
  }

  const deptParentOptions = (excludeIds: Set<string> = new Set()) =>
    scopedOrgs.filter(o => {
      if (!isDeptParentType(o.type)) return false;
      if (excludeIds.has(o.id)) return false;
      return enterpriseRootOf(scopedOrgs, o.id)?.id === tenantRootId;
    });

  const moveTarget = moveDept ? orgs.find(o => o.id === moveDept.targetId) : undefined;

  /** 直属人员明细（按成员身份 orgUnit；身份展示统一「角色 · 部门/工作组」） */
  const directMembers = selectedOrg
    ? memberships
        .filter(m => m.orgUnitId === selectedOrg.id)
        .map(m => ({ membership: m, user: users.find(u => u.id === m.userId) }))
        .filter((x): x is { membership: (typeof memberships)[number]; user: NonNullable<(typeof users)[number]> } => Boolean(x.user))
    : [];
  const identityOfMember = (userId: string) => {
    const active = assignments.find(a => a.userId === userId && a.tenantId === tenantRootId && a.status === 'active');
    const roleName = active ? store.roles.find(r => r.id === active.roleId)?.name : undefined;
    const orgName = orgs.find(o => o.id === (memberships.find(m => m.userId === userId && m.tenantId === tenantRootId)?.orgUnitId))?.name;
    return roleName ? identityLabel(roleName, orgName) : `（未分配角色）${orgName ? ` · ${orgName}` : ''}`;
  };

  const groupMoveTargets = deleteGroup
    ? orgs.filter(o => o.type === 'group' && o.parentId === tenantRootId && o.id !== deleteGroup.orgId)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="组织架构"
        description="管理本企业的部门、工作组与人员归属；节点详情展示直属人员明细与工作组组长。角色与数据范围请到「角色与数据范围」（唯一授权入口）。"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {canCreate && isProviderTenant && (
              <Button variant="outline" size="md" icon={<Plus size={14} />} onClick={() => setCreateGroup({ name: '', reason: '' })}>新建工作组</Button>
            )}
            {canCreate && !isProviderTenant && (
              <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={() => setCreateDept({ parentId: selectedOrg?.id ?? tenantRootId, name: '' })}>
                新建部门
              </Button>
            )}
          </div>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', gap: 12, minHeight: 0 }}>
        {/* 左：组织树 */}
        <div style={{ width: 320, minWidth: 280, flexShrink: 0, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 8 }}>
            组织 · {tenantRoot?.name ?? '本企业'}
            <Tag label="租户边界内" color="default" />
          </div>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {tenantRoot && renderTreeNode(tenantRoot, 0)}
          </div>
          {selectedOrg && (
            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', paddingTop: 8, flexShrink: 0, lineHeight: 1.5, borderTop: '1px solid #F3F4F6', marginTop: 8 }}>
              {orgPathLabel(orgs, selectedOrg.id)}
            </div>
          )}
        </div>

        {/* 右：节点详情 */}
        <div style={{ flex: 1, minWidth: 0, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: 20, overflow: 'auto' }}>
          {!selectedOrg ? (
            <div style={{ color: '#9CA3AF', fontSize: 'var(--fs-13)' }}>从左侧选择组织节点查看详情</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--fs-16)', fontWeight: 600 }}>{selectedOrg.name}</span>
                <StatusTag status={ORG_TYPE_LABEL[selectedOrg.type]} size="sm" />
                {selectedOrg.type === 'group' && (() => {
                  const leader = leaderOfGroup(selectedOrg.id);
                  return leader.status === 'valid' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-12)', color: '#248A5A' }}>
                      <UserCheck size={13} aria-hidden /> 组长：{identityLabel('工作组组长', selectedOrg.name)} = {leader.userName}
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-12)', color: '#C77A16' }}>
                      <UserCheck size={13} aria-hidden /> 待指定组长（禁止下派新的管理任务；请在「工作组管理」指定）
                    </span>
                  );
                })()}
              </div>
              <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 6 }}>{orgPathLabel(orgs, selectedOrg.id)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16, maxWidth: 560 }}>
                <Field label="类型">{String(ORG_TYPE_LABEL[selectedOrg.type])}</Field>
                <Field label="所属企业">{enterpriseRootOf(orgs, selectedOrg.id)?.name ?? '—'}</Field>
                <Field label="当前上级">{orgs.find(o => o.id === selectedOrg.parentId)?.name ?? '—（企业根节点）'}</Field>
                <Field label="直属人员">直属 {directMembers.length} 人（明细见下表）</Field>
              </div>

              {/* 直属人员明细（不只显示人数） */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 8 }}>
                  <Users size={13} aria-hidden /> 直属人员明细（不含下级部门）
                </div>
                {directMembers.length === 0 ? (
                  <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>本节点暂无直属人员；可在「用户管理」建档或调岗入本节点。</div>
                ) : (
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>{['姓名 / 账号', '身份展示', '账号状态', '最近登录', '最近授权'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {directMembers.map(({ user }, idx) => (
                          <tr key={user.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                            <td style={tdStyle}>
                              <div style={{ fontWeight: 600 }}>{user.name}</div>
                              <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{user.account}</div>
                            </td>
                            <td style={tdStyle}>{identityOfMember(user.id)}</td>
                            <td style={tdStyle}><StatusTag status={user.accountStatus === 'enabled' ? '启用' : '停用'} size="sm" /></td>
                            <td style={{ ...tdStyle, color: '#667085', whiteSpace: 'nowrap' }}>{user.lastLoginAt ?? '—'}</td>
                            <td style={{ ...tdStyle, color: '#667085', whiteSpace: 'nowrap' }}>{latestAssignmentAt(assignments, user.id) ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 8 }}>下级节点</div>
                {orgChildren(scopedOrgs, selectedOrg.id).length === 0 ? (
                  <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>无下级节点</div>
                ) : (
                  <div style={{ display: 'grid', gap: 4, maxWidth: 420 }}>
                    {orgChildren(scopedOrgs, selectedOrg.id).map(c => (
                      <button
                        key={c.id} type="button" onClick={() => { setSelectedOrgId(c.id); setExpanded(prev => new Set([...prev, selectedOrg.id])); }}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 10px',
                          border: '1px solid var(--color-border)', borderRadius: 6, background: '#fff', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: 'var(--fs-13)', fontWeight: 500 }}>{c.name}</span>
                        <span style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF' }}>{directMemberCount(c.id)} 人 · {ORG_TYPE_LABEL[c.type]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedOrg.type === 'provider' && (
                <div style={{ marginTop: 16, maxWidth: 560 }}>
                  <InfoBanner>
                    工作组是本服务商的组织节点：在此新建、重命名或删除（成员归属用「用户管理」调岗）；
                    组长指定与任务承接状态在「工作组管理」维护，组织页不重复配置。
                  </InfoBanner>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 弹窗：新建部门 */}
      {createDept && (
        <Modal open title="新建下级部门" onClose={() => setCreateDept(null)} width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setCreateDept(null)}>取消</Button>
              <Button variant="primary" onClick={submitCreateDept}>确认新建</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>部门表达企业内部的汇报与归属关系；药厂与服务商的合作关系不在部门树中维护。</InfoBanner>
            <Field label="所属企业">{enterpriseRootOf(orgs, createDept.parentId)?.name ?? '—'}</Field>
            <Field label="上级部门" required hint={orgPathLabel(orgs, createDept.parentId)}>
              <input value={orgs.find(o => o.id === createDept.parentId)?.name ?? ''} disabled style={inputStyle} />
            </Field>
            <Field label="部门名称" required hint={
              createDept.name.trim() && sameLevelDeptNameExists(orgs, createDept.parentId, createDept.name)
                ? '该上级下已存在同名部门'
                : '实时校验同级重名'
            }>
              <input value={createDept.name} onChange={e => setCreateDept({ ...createDept, name: e.target.value })} style={inputStyle} placeholder="例如：华北大区、西安办事处" />
            </Field>
          </div>
        </Modal>
      )}

      {/* 弹窗：新建工作组（服务商根节点下） */}
      {createGroup && (
        <Modal open title="新建工作组" onClose={() => setCreateGroup(null)} width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setCreateGroup(null)}>取消</Button>
              <Button variant="primary" onClick={submitCreateGroup}>创建</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>工作组是本服务商的组织节点（挂在 {tenantRoot?.name} 下）：此处仅创建节点；成员归属用「用户管理」调岗进入，组长在「工作组管理」指定。</InfoBanner>
            <Field label="工作组名称" required>
              <input value={createGroup.name} onChange={e => setCreateGroup({ ...createGroup, name: e.target.value })} style={inputStyle} placeholder="例如：西北推广一组" />
            </Field>
            <Field label="说明" hint="选填，随审计保留">
              <input value={createGroup.reason} onChange={e => setCreateGroup({ ...createGroup, reason: e.target.value })} style={inputStyle} placeholder="团队职责说明" />
            </Field>
          </div>
        </Modal>
      )}

      {/* 弹窗：重命名部门 */}
      {renameDept && (
        <Modal open title="重命名部门" onClose={() => setRenameDept(null)} width={480}
          footer={
            <>
              <Button variant="outline" onClick={() => setRenameDept(null)}>取消</Button>
              <Button variant="primary" onClick={submitRenameDept}>保存</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="当前路径">{orgPathLabel(orgs, renameDept.orgId)}</Field>
            <Field label="部门名称" required>
              <input value={renameDept.name} onChange={e => setRenameDept({ ...renameDept, name: e.target.value })} style={inputStyle} />
            </Field>
          </div>
        </Modal>
      )}

      {/* 弹窗：重命名工作组 */}
      {renameGroup && (
        <Modal open title="重命名工作组" onClose={() => setRenameGroup(null)} width={440}
          footer={
            <>
              <Button variant="outline" onClick={() => setRenameGroup(null)}>取消</Button>
              <Button variant="primary" onClick={submitRenameGroup}>保存</Button>
            </>
          }
        >
          <Field label="工作组名称" required><input value={renameGroup.name} onChange={e => setRenameGroup({ ...renameGroup, name: e.target.value })} style={inputStyle} /></Field>
        </Modal>
      )}

      {/* 弹窗：删除工作组 */}
      {deleteGroup && (
        <Modal open title="删除工作组" onClose={() => setDeleteGroup(null)} width={520}
          footer={<><Button variant="outline" onClick={() => setDeleteGroup(null)}>取消</Button><Button variant="danger" onClick={submitDeleteGroup}>确认删除</Button></>}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {deleteGroup.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{deleteGroup.error}</div>}
            <InfoBanner tone="warning">删除仅移除团队节点；成员的授权记录保留为历史（展示为「已删除工作组」占位），审计可查。</InfoBanner>
            <Field label="成员去向" hint="组内有成员时必须选择迁入节点">
              <select value={deleteGroup.moveToId} onChange={e => setDeleteGroup({ ...deleteGroup, moveToId: e.target.value, error: '' })} style={inputStyle}>
                <option value="">（组内无成员或迁往服务商根节点）</option>
                {groupMoveTargets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="删除原因" required><input value={deleteGroup.reason} onChange={e => setDeleteGroup({ ...deleteGroup, reason: e.target.value, error: '' })} style={inputStyle} placeholder="例如：团队并入一组" /></Field>
          </div>
        </Modal>
      )}

      {/* 弹窗：调整汇报上级 */}
      {moveDept && (
        <Modal open title="调整汇报上级" onClose={() => setMoveDept(null)} width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setMoveDept(null)}>取消</Button>
              <Button variant="primary" disabled={!moveDept.targetId} onClick={submitMoveDept}>确认调整</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner tone="warning">人员所属部门路径会变化，角色权限覆盖范围不自动迁移。</InfoBanner>
            <Field label="新上级" required hint={moveTarget ? orgPathLabel(orgs, moveTarget.id) : '仅本企业内的部门可选'}>
              <select value={moveDept.targetId} onChange={e => setMoveDept({ ...moveDept, targetId: e.target.value })} style={inputStyle}>
                <option value="">选择本部门</option>
                {deptParentOptions(new Set(orgDescendantIds(orgs, moveDept.orgId))).map(o => (
                  <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>
                ))}
              </select>
            </Field>
            <Field label="调整原因" hint="选填">
              <input value={moveDept.reason} onChange={e => setMoveDept({ ...moveDept, reason: e.target.value })} style={inputStyle} placeholder="例如：大区合并" />
            </Field>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
              <Users size={13} /> 直属与下级人员随节点移动；不改变任何人的角色与数据范围
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

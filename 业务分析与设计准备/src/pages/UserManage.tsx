/**
 * 用户管理：本企业成员账号的唯一维护入口（User × TenantMembership）。
 * 只管理账号本身：建档、启停、调岗与已分配角色只读查看；角色授予/回收与
 * 数据范围（含可处理药厂/品种）统一在「角色与数据范围」页的「已授权成员」
 * 页签完成，本页不得修改任何权限范围。列表与建档范围锁定当前租户组织子树。
 * 服务专员建档保留备案档案生成（备案=业务资格，不是登录权限）。
 */
import { useEffect, useMemo, useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StatusTag } from '../components/StatusTag';
import { usePermission } from '../context/PermissionContext';
import {
  enterpriseRootOf,
  grantStatusLabel,
  isDeptParentType,
  latestAssignmentAt,
  orgDescendantIds,
  orgPathLabel,
  scopeLabel,
} from '../data/permissions';
import type { NavFocus } from '../types';
import type { ToastMessage } from '../components/Toast';
import {
  membershipOfUserInTenant,
  membershipsOfTenant,
  subscribeTenantMemberships,
} from '../data/cooperationModel';
import { Field, InfoBanner, inputStyle, tdStyle, thStyle } from './permUi';
import { useRepFiling } from '../context/RepFilingContext';
import { nowText } from './complianceUi';
import {
  CURRENT_PLEDGE_TEMPLATE,
  EDU_OPTIONS,
  MED_MAJORS,
  MAH_ID,
  MAH_NAME,
  allocRepId,
  deriveEmployment,
} from '../data/complianceData';
import type { Representative } from '../types';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navFocus?: NavFocus;
}

const chipStyle = {
  padding: '2px 8px', borderRadius: 999, fontSize: 'var(--fs-12)', background: '#F3F4F6', color: '#374151',
} as const;

export function UserManage({ addToast }: Props) {
  const store = usePermission();
  const { orgs, users, assignments, roles, can, previewReadOnly, principal } = store;
  const repFiling = useRepFiling();
  // P0：名单与部门展示基于 TenantMembership（建档/调岗实时刷新）
  const [, bump] = useState(0);
  useEffect(() => subscribeTenantMemberships(() => bump(x => x + 1)), []);
  const tenantRootId = principal.realm === 'TENANT' ? principal.tenantId : 'org-platform';
  const tenantRoot = orgs.find(o => o.id === tenantRootId);

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [includeChildren, setIncludeChildren] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState<{
    name: string; account: string; phone: string; email: string; orgId: string; error: string;
    createRep: boolean;
    gender: '男' | '女'; photoFile: string; idNo: string;
    education: string; major: string; school: string; eduProof: string;
    pledgeDate: string; pledgeFile: string; employStart: string; employEnd: string;
  } | null>(null);
  const [moveUser, setMoveUser] = useState<{ userId: string; targetId: string; error: string } | null>(null);
  const [disableUser, setDisableUser] = useState<{ userId: string; revokeAll: boolean } | null>(null);
  const [enableUserId, setEnableUserId] = useState<string | null>(null);

  const canCreate = can('user-manage', 'create') && !previewReadOnly;
  const canEdit = can('user-manage', 'edit') && !previewReadOnly;

  const memberships = useMemo(() => membershipsOfTenant(tenantRootId), [tenantRootId]);
  const tenantUserIds = useMemo(
    () => memberships.map(m => users.find(u => u.id === m.userId)).filter((u): u is (typeof users)[number] => Boolean(u)),
    [memberships, users],
  );
  const memberOrgName = (userId: string) => {
    const m = membershipOfUserInTenant(userId, tenantRootId);
    return orgs.find(o => o.id === m?.orgUnitId)?.name ?? m?.tenantName ?? '—';
  };
  const memberOrgId = (userId: string) => membershipOfUserInTenant(userId, tenantRootId)?.orgUnitId ?? '';

  useEffect(() => {
    if (selectedUserId && !tenantUserIds.some(u => u.id === selectedUserId)) setSelectedUserId(null);
  }, [selectedUserId, tenantUserIds]);

  const people = useMemo(() => {
    // 范围=成员身份 orgUnit（含下级时按本租户子树），不再是 User.orgId 主档
    const scopeIds = includeChildren ? new Set(orgDescendantIds(orgs, tenantRootId)) : new Set([tenantRootId]);
    const kw = keyword.trim().toLowerCase();
    return tenantUserIds.filter(u => {
      if (!scopeIds.has(memberOrgId(u.id))) return false;
      if (kw && !(u.name.toLowerCase().includes(kw) || u.account.toLowerCase().includes(kw))) return false;
      if (statusFilter && u.accountStatus !== statusFilter) return false;
      return true;
    });
  }, [includeChildren, keyword, orgs, statusFilter, tenantRootId, tenantUserIds]);

  const selectedUser = users.find(u => u.id === selectedUserId) ?? null;
  const userAssignments = (userId: string) =>
    assignments
      .filter(a => a.userId === userId && a.tenantId === tenantRootId)
      .map(a => ({ ...a, roleName: roles.find(r => r.id === a.roleId)?.name ?? '（已删除角色）' }));

  function missingRepFields(): string[] {
    if (!createUserOpen?.createRep) return [];
    const f = createUserOpen;
    const miss: string[] = [];
    if (!f.photoFile) miss.push('照片');
    if (!f.idNo) miss.push('证件号');
    if (!EDU_OPTIONS.includes(f.education)) miss.push('学历须大专及以上');
    if (!f.major) miss.push('专业');
    if (!f.school) miss.push('毕业院校');
    if (!f.eduProof) miss.push('学历证明');
    if (!f.employStart || !f.employEnd) miss.push('合同起止日期');
    if (!f.pledgeDate || !f.pledgeFile) miss.push('合规承诺');
    return miss;
  }

  function submitCreateUser() {
    if (!createUserOpen) return;
    const name = createUserOpen.name.trim();
    const account = createUserOpen.account.trim();
    const phone = createUserOpen.phone.trim();
    const email = createUserOpen.email.trim();
    const fail = (error: string) => setCreateUserOpen({ ...createUserOpen, error });
    if (!account) return fail('请填写用户名');
    if (!name) return fail('请填写姓名');
    if (!phone) return fail('请填写手机号');
    if (!/^1\d{10}$/.test(phone)) return fail('手机号格式不正确，应为 1 开头的 11 位数字');
    if (!email) return fail('请填写邮箱');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('邮箱格式不正确');
    const targetOrg = orgs.find(o => o.id === createUserOpen.orgId);
    if (!targetOrg) return fail('请选择所属部门');
    if (enterpriseRootOf(orgs, targetOrg.id)?.id !== tenantRootId) return fail('只能挂在本企业组织下（租户边界）');
    if (createUserOpen.createRep) {
      const miss = missingRepFields();
      if (miss.length) return fail(`服务专员备案档案仍缺必填项：${miss.join('、')}`);
      if (repFiling.reps.some(r => r.idNo === createUserOpen.idNo.trim())) return fail('证件号已存在于代表备案档案，须唯一');
    }
    const result = store.createUser({ name, account, phone, email, orgId: createUserOpen.orgId });
    if (!result.ok) return fail(result.error || '新建用户失败');
    if (createUserOpen.createRep && result.user) {
      const emp = deriveEmployment(orgs, createUserOpen.orgId);
      const rep: Representative = {
        id: allocRepId(repFiling.reps),
        name,
        gender: createUserOpen.gender,
        photoFile: createUserOpen.photoFile.trim(),
        idNo: createUserOpen.idNo.trim(),
        mobile: phone,
        email,
        employmentType: emp.employmentType,
        mah: MAH_NAME,
        mahId: MAH_ID,
        provider: emp.providerName,
        providerId: emp.providerId,
        userId: result.user.id,
        employStart: createUserOpen.employStart,
        employEnd: createUserOpen.employEnd,
        education: createUserOpen.education,
        major: createUserOpen.major,
        school: createUserOpen.school.trim(),
        eduProof: createUserOpen.eduProof.trim(),
        pledgeVersion: CURRENT_PLEDGE_TEMPLATE,
        pledgeDate: createUserOpen.pledgeDate,
        pledgeFile: createUserOpen.pledgeFile.trim(),
        filingNo: '',
        filingReceipt: '',
        filingValidUntil: '',
        status: '待审核',
        operations: [{ at: nowText(), by: principal.name, action: '提交审核', note: '创建服务专员用户时生成备案档案' }],
      };
      repFiling.addRep(rep);
      addToast({ type: 'success', title: '已新建服务专员', description: `${name} · ${account} · 备案档案待合规审核；角色与可处理药厂请在「角色与数据范围」授予（REP：${rep.id}）` });
    } else {
      addToast({ type: 'success', title: '已新建用户', description: `${name} · ${account} · 未分配角色，可在「角色与数据范围」对应角色的「已授权成员」页签授予` });
    }
    setCreateUserOpen(null);
  }

  const moveUserTarget = moveUser ? orgs.find(o => o.id === moveUser.targetId) : undefined;
  const moveUserOptions = useMemo(() => {
    if (!moveUser) return [];
    const user = users.find(u => u.id === moveUser.userId);
    if (!user) return [];
    return orgs.filter(o => {
      if (o.id === user.orgId) return false;
      if (!isDeptParentType(o.type) && o.type !== 'provider' && o.type !== 'group' && o.type !== 'platform') return false;
      return enterpriseRootOf(orgs, o.id)?.id === tenantRootId;
    });
  }, [moveUser, orgs, tenantRootId, users]);

  function submitMoveUser() {
    if (!moveUser) return;
    const result = store.setUserOrg({ userId: moveUser.userId, orgId: moveUser.targetId });
    if (!result.ok) {
      setMoveUser({ ...moveUser, error: result.error || '调整失败' });
      return;
    }
    const user = users.find(u => u.id === moveUser.userId);
    addToast({ type: 'success', title: '已调整所属部门', description: `${user?.name} → ${moveUserTarget?.name}。仅变更归属；角色与数据范围保持不变，需调整请前往「角色与数据范围」。` });
    setMoveUser(null);
  }

  const disableTarget = disableUser ? users.find(u => u.id === disableUser.userId) : undefined;
  const disableActiveCount = disableUser
    ? assignments.filter(a => a.userId === disableUser.userId && a.status === 'active').length
    : 0;

  function submitDisableUser() {
    if (!disableUser) return;
    const result = store.setUserStatus(disableUser.userId, 'disabled', { reason: '管理员停用', revokeAssignments: disableUser.revokeAll });
    if (!result.ok) {
      addToast({ type: 'error', title: '停用失败', description: result.error });
      return;
    }
    addToast({
      type: 'success',
      title: '账号已停用',
      description: disableUser.revokeAll && disableActiveCount > 0
        ? `已同步回收 ${disableActiveCount} 条有效角色分配。`
        : `有效角色 ${disableActiveCount} 条保留冻结记录，不再参与新会话计算。`,
    });
    setDisableUser(null);
  }

  const defaultOrgOptions = () =>
    orgs.filter(o => {
      if (enterpriseRootOf(orgs, o.id)?.id !== tenantRootId) return false;
      return isDeptParentType(o.type) || o.type === 'provider' || o.type === 'group' || o.type === 'platform';
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="用户管理"
        description={`维护「${tenantRoot?.name ?? '本企业'}」的成员账号（建档、启停、调岗）；角色与数据范围为只读展示，调整请前往「角色与数据范围」。`}
        actions={canCreate ? (
          <Button variant="primary" size="md" icon={<UserPlus size={14} />} onClick={() => setCreateUserOpen({
            name: '', account: '', phone: '', email: '', orgId: defaultOrgOptions()[0]?.id ?? tenantRootId, error: '',
            createRep: false, gender: '男', photoFile: '', idNo: '', education: '本科', major: '', school: '', eduProof: '',
            pledgeDate: '', pledgeFile: '', employStart: '', employEnd: '',
          })}>
            新建用户
          </Button>
        ) : undefined}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="姓名 / 账号" style={{ ...inputStyle, width: 160, height: 30 }} />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 110, height: 30 }}>
              <option value="">账号状态</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
            <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeChildren} onChange={e => setIncludeChildren(e.target.checked)} style={{ accentColor: 'var(--color-brand)', width: 14, height: 14 }} />
              含下级部门人员
            </label>
            <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>共 <strong>{people.length}</strong> 人</span>
          </div>
          {people.length === 0 ? (
            <EmptyState title="本企业暂无成员账号" description="点击「新建用户」创建第一个成员。" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['姓名 / 账号', '手机号', '所属部门', '账号状态', '有效角色', '最近授权', '操作'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {people.map((u, idx) => {
                  const active = userAssignments(u.id).filter(a => a.status === 'active');
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedUserId(u.id)}
                      style={{ background: selectedUserId === u.id ? 'var(--color-brand-subtle)' : idx % 2 === 0 ? '#fff' : '#FAFAFA', cursor: 'pointer' }}
                    >
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                            background: 'linear-gradient(135deg, var(--color-brand), #2F6BCE)', color: '#fff',
                            fontSize: 'var(--fs-12)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}>{u.name.slice(0, 1)}</span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{u.name}</div>
                            <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{u.account}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace" }}>{u.phone}</td>
                      <td style={tdStyle}>{memberOrgName(u.id)}</td>
                      <td style={tdStyle}><StatusTag status={u.accountStatus === 'enabled' ? '启用' : '停用'} size="sm" /></td>
                      <td style={tdStyle}>
                        {active.length === 0 ? <span style={{ color: '#9CA3AF' }}>0 个</span> : (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {active.map(a => <span key={a.id} style={chipStyle}>{a.roleName}</span>)}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: '#667085', whiteSpace: 'nowrap' }}>{latestAssignmentAt(assignments, u.id) ?? '—'}</td>
                      <td style={tdStyle}>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedUserId(u.id)}>查看详情</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 用户详情弹窗（账号维度；角色只读引导） */}
      {selectedUser && (
        <Modal open title={`用户详情 · ${selectedUser.name}`} onClose={() => setSelectedUserId(null)} width={620}
          footer={
            <div style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
              {canEdit && selectedUser.accountStatus === 'enabled' && (
                <Button variant="ghost" onClick={() => setDisableUser({ userId: selectedUser.id, revokeAll: false })}>停用账号</Button>
              )}
              {canEdit && selectedUser.accountStatus !== 'enabled' && (
                <Button variant="outline" onClick={() => setEnableUserId(selectedUser.id)}>启用账号</Button>
              )}
              {canEdit && selectedUser.accountStatus === 'enabled' && (
                <Button variant="outline" onClick={() => setMoveUser({ userId: selectedUser.id, targetId: '', error: '' })}>调整所属部门</Button>
              )}
              <Button variant="primary" onClick={() => setSelectedUserId(null)}>关闭</Button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="姓名">{selectedUser.name}</Field>
            <Field label="用户名">{selectedUser.account}</Field>
            <Field label="手机号">{selectedUser.phone}</Field>
            <Field label="邮箱">{selectedUser.email || '—'}</Field>
            <Field label="所属企业">{tenantRoot?.name ?? '—'}</Field>
            <Field label="本企业所属部门">{orgPathLabel(orgs, memberOrgId(selectedUser.id))}</Field>
            <Field label="创建时间">{selectedUser.createdAt ?? '—'}</Field>
            <Field label="最近登录">{selectedUser.lastLoginAt ?? '—'}</Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', marginBottom: 8 }}>角色与数据范围（只读；在「角色与数据范围」页对应角色的「已授权成员」页签调整）</div>
            {userAssignments(selectedUser.id).length === 0 ? (
              <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>该成员尚无角色授权</div>
            ) : (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                {userAssignments(selectedUser.id).map((a, i) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', background: i % 2 === 0 ? '#fff' : '#FAFAFA', borderTop: i === 0 ? undefined : '1px solid #F3F4F6', fontSize: 'var(--fs-13)' }}>
                    <span style={{ fontWeight: 600 }}>{a.roleName}</span>
                    <span style={{ color: '#667085' }}>{a.scopeOrgName} · {scopeLabel(a.scope)}{a.pharmaTenantIds && a.pharmaTenantIds.length > 0 ? ` · 可处理药厂 ${a.pharmaTenantIds.length} 家` : ''}{a.varietyNames && a.varietyNames.length > 0 ? ` · ${a.varietyNames.length} 个品种` : ''}</span>
                    <StatusTag status={grantStatusLabel(a.status)} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* 新建用户 */}
      {createUserOpen && (
        <Modal open title="新建用户" onClose={() => setCreateUserOpen(null)} width={660}
          footer={
            <>
              <Button variant="outline" onClick={() => setCreateUserOpen(null)}>取消</Button>
              <Button variant="primary" onClick={submitCreateUser}>{createUserOpen.createRep ? '创建账号并生成备案档案' : '创建账号'}</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>创建的是「{tenantRoot?.name ?? '本企业'}」的成员账号（租户边界内）。角色与可处理药厂/品种在创建完成后于「角色与数据范围」页授予（本页不修改任何权限范围）。</InfoBanner>
            {createUserOpen.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{createUserOpen.error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="用户名" required hint="用于登录，全局唯一">
                <input value={createUserOpen.account} onChange={e => setCreateUserOpen({ ...createUserOpen, account: e.target.value, error: '' })} style={inputStyle} placeholder="例如：zhangsan" />
              </Field>
              <Field label="姓名" required>
                <input value={createUserOpen.name} onChange={e => setCreateUserOpen({ ...createUserOpen, name: e.target.value, error: '' })} style={inputStyle} placeholder="真实姓名" />
              </Field>
              <Field label="手机号" required hint="11 位手机号（自然人登录身份）">
                <input value={createUserOpen.phone} onChange={e => setCreateUserOpen({ ...createUserOpen, phone: e.target.value.replace(/\D/g, ''), error: '' })} style={inputStyle} maxLength={11} placeholder="例如：13901350000" />
              </Field>
              <Field label="邮箱" required>
                <input value={createUserOpen.email} onChange={e => setCreateUserOpen({ ...createUserOpen, email: e.target.value })} style={inputStyle} placeholder="zhangsan@company.com" />
              </Field>
            </div>
            <Field label="所属部门 / 团队" required>
              <select value={createUserOpen.orgId} onChange={e => setCreateUserOpen({ ...createUserOpen, orgId: e.target.value })} style={inputStyle}>
                {defaultOrgOptions().map(o => <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>)}
              </select>
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)', cursor: 'pointer' }}>
              <input type="checkbox" checked={createUserOpen.createRep} onChange={e => setCreateUserOpen({ ...createUserOpen, createRep: e.target.checked })} style={{ accentColor: 'var(--color-brand)', width: 15, height: 15 }} />
              同时生成服务专员备案档案（该成员将从事学术拜访业务；备案状态由合规审核）
            </label>
            {createUserOpen.createRep && (
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="性别" required>
                    <select value={createUserOpen.gender} onChange={e => setCreateUserOpen({ ...createUserOpen, gender: e.target.value as '男' | '女' })} style={inputStyle}><option>男</option><option>女</option></select>
                  </Field>
                  <Field label="照片" required><input value={createUserOpen.photoFile} onChange={e => setCreateUserOpen({ ...createUserOpen, photoFile: e.target.value })} style={inputStyle} placeholder="照片文件名" /></Field>
                  <Field label="证件号" required><input value={createUserOpen.idNo} onChange={e => setCreateUserOpen({ ...createUserOpen, idNo: e.target.value })} style={inputStyle} /></Field>
                  <Field label="所属服务商" hint="按所属组织自动推导">
                    <input value={deriveEmployment(orgs, createUserOpen.orgId).providerName} disabled style={{ ...inputStyle, color: '#667085', background: '#F9FAFB' }} />
                  </Field>
                  <Field label="学历" required>
                    <select value={createUserOpen.education} onChange={e => setCreateUserOpen({ ...createUserOpen, education: e.target.value })} style={inputStyle}>{EDU_OPTIONS.map(x => <option key={x}>{x}</option>)}</select>
                  </Field>
                  <Field label="专业" required>
                    <select value={createUserOpen.major} onChange={e => setCreateUserOpen({ ...createUserOpen, major: e.target.value })} style={inputStyle}>
                      <option value="">请选择</option>{MED_MAJORS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </Field>
                  <Field label="毕业院校" required><input value={createUserOpen.school} onChange={e => setCreateUserOpen({ ...createUserOpen, school: e.target.value })} style={inputStyle} /></Field>
                  <Field label="学历证明" required><input value={createUserOpen.eduProof} onChange={e => setCreateUserOpen({ ...createUserOpen, eduProof: e.target.value })} style={inputStyle} placeholder="附件文件名" /></Field>
                  <Field label="合同开始" required><input type="date" value={createUserOpen.employStart} onChange={e => setCreateUserOpen({ ...createUserOpen, employStart: e.target.value })} style={inputStyle} /></Field>
                  <Field label="合同结束" required><input type="date" value={createUserOpen.employEnd} onChange={e => setCreateUserOpen({ ...createUserOpen, employEnd: e.target.value })} style={inputStyle} /></Field>
                  <Field label="承诺签署日期" required><input type="date" value={createUserOpen.pledgeDate} onChange={e => setCreateUserOpen({ ...createUserOpen, pledgeDate: e.target.value })} style={inputStyle} /></Field>
                  <Field label="承诺附件" required><input value={createUserOpen.pledgeFile} onChange={e => setCreateUserOpen({ ...createUserOpen, pledgeFile: e.target.value })} style={inputStyle} placeholder="附件文件名" /></Field>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
              <Users size={13} /> 同一个手机号可在多家企业分别建档成员身份；此处仅创建当前企业的成员
            </div>
          </div>
        </Modal>
      )}

      {/* 调整所属部门 */}
      {moveUser && (
        <Modal open title="调整所属部门" onClose={() => setMoveUser(null)} width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setMoveUser(null)}>取消</Button>
              <Button variant="primary" disabled={!moveUser.targetId} onClick={submitMoveUser}>确认调整</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>仅变更人员归属节点；<b>归属变化不自动调整角色与数据范围</b>（如需调整请前往「角色与数据范围」）。跨企业调入会被拒绝。</InfoBanner>
            {moveUser.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{moveUser.error}</div>}
            <Field label="当前所属">{users.find(u => u.id === moveUser.userId)?.orgName ?? '—'}</Field>
            <Field label="调整到" required>
              <select value={moveUser.targetId} onChange={e => setMoveUser({ ...moveUser, targetId: e.target.value, error: '' })} style={inputStyle}>
                <option value="">选择目标部门/团队</option>
                {moveUserOptions.map(o => <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>)}
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {/* 停用账号 */}
      {disableUser && (
        <Modal open title="停用账号" onClose={() => setDisableUser(null)} width={520}
          footer={
            <>
              <Button variant="outline" onClick={() => setDisableUser(null)}>取消</Button>
              <Button variant="danger" onClick={submitDisableUser}>确认停用</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 14, display: 'grid', gap: 8, fontSize: 'var(--fs-13)' }}>
              <div><span style={{ color: '#9CA3AF' }}>用户 </span><strong>{disableTarget?.name} · {disableTarget?.account}</strong></div>
              <div><span style={{ color: '#9CA3AF' }}>有效角色 </span>{disableActiveCount} 条</div>
            </div>
            <InfoBanner tone="warning">停用后该自然人禁止登录；全部有效角色不参与新会话计算。其当前活跃会话在下一次请求时失效。</InfoBanner>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--fs-13)', cursor: 'pointer' }}>
              <input type="checkbox" checked={disableUser.revokeAll} disabled={disableActiveCount === 0} onChange={e => setDisableUser({ ...disableUser, revokeAll: e.target.checked })} style={{ accentColor: '#C73A3A', width: 15, height: 15, marginTop: 2 }} />
              <span>同步回收全部 {disableActiveCount} 条有效角色分配<span style={{ display: 'block', fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>不勾选则保留冻结记录，启用账号后角色恢复参与计算</span></span>
            </label>
          </div>
        </Modal>
      )}

      {enableUserId && (
        <ConfirmDialog
          open
          title="启用账号"
          description={`启用后 ${users.find(u => u.id === enableUserId)?.name ?? ''} 可重新登录，冻结的有效角色分配恢复参与权限计算。`}
          confirmLabel="确认启用"
          onConfirm={() => {
            const result = store.setUserStatus(enableUserId, 'enabled', { reason: '管理员启用' });
            if (!result.ok) addToast({ type: 'error', title: '启用失败', description: result.error });
            else addToast({ type: 'success', title: '账号已启用' });
            setEnableUserId(null);
          }}
          onCancel={() => setEnableUserId(null)}
        />
      )}
    </div>
  );
}

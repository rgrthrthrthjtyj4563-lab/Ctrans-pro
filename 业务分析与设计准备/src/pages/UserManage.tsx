/**
 * 用户管理：本企业成员账号的唯一维护入口（User × TenantMembership）。
 * 只管理账号本身：建档、启停、调岗与已分配角色只读查看；角色授予/回收与
 * 数据范围（含可处理药厂/品种）统一在「角色与数据范围」页的「已授权成员」
 * 页签完成，本页不得修改任何权限范围。列表与建档范围锁定当前租户组织子树。
 * 服务专员建档保留备案档案生成（备案=业务资格，不是登录权限）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Lock, UserMinus, UserPlus, Upload, Users } from 'lucide-react';
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
  membershipActive,
  membershipOfUserInTenant,
  membershipsOfTenant,
  subscribeTenantMemberships,
} from '../data/cooperationModel';
import { ACCOUNT_PATTERN, isAccountTakenInWorkspace, isPhoneTakenInWorkspace, tenantQuotaInfo } from '../data/tenantRegistry';
import { loginGuardOf, unlockLoginGuard } from '../auth/mockGateway';
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

/** 批量导入的解析行（校验错误挂在 error 上；有错则全批驳回） */
type ImportRow = {
  line: number;
  account: string;
  name: string;
  phone: string;
  dept: string;
  email: string;
  error?: string;
};

export function UserManage({ addToast }: Props) {
  const store = usePermission();
  const { orgs, users, assignments, roles, can, previewReadOnly, principal } = store;
  const repFiling = useRepFiling();
  // P0：名单与部门展示基于 TenantMembership（建档/调岗实时刷新）
  const [membershipVersion, bump] = useState(0);
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
  // ── 2026-09-18 成员生命周期补全：移除 / 重新加入 / 批量导入 / 登录解锁 ──
  const [removeUser, setRemoveUser] = useState<{ userId: string; kind: string; note: string; error: string } | null>(null);
  const [rejoinUser, setRejoinUser] = useState<{ userId: string; orgId: string; error: string } | null>(null);
  const [importOpen, setImportOpen] = useState<{ raw: string } | null>(null);
  const [unlockUserId, setUnlockUserId] = useState<string | null>(null);

  const canCreate = can('user-manage', 'create') && !previewReadOnly;
  const canEdit = can('user-manage', 'edit') && !previewReadOnly;

  const memberships = useMemo(() => membershipsOfTenant(tenantRootId), [tenantRootId, membershipVersion]);
  const tenantUserIds = useMemo(
    () => memberships.map(m => users.find(u => u.id === m.userId)).filter((u): u is (typeof users)[number] => Boolean(u)),
    [memberships, users],
  );
  const memberOrgName = (userId: string) => {
    const m = membershipOfUserInTenant(userId, tenantRootId);
    return orgs.find(o => o.id === m?.orgUnitId)?.name ?? m?.tenantName ?? '—';
  };
  const memberOrgId = (userId: string) => membershipOfUserInTenant(userId, tenantRootId)?.orgUnitId ?? '';
  /** 成员身份（含 removed）：行展示与操作分支的依据 */
  const membershipOf = (userId: string) => membershipOfUserInTenant(userId, tenantRootId);
  const isRemovedMember = (userId: string) => membershipOf(userId)?.status === 'removed';
  const isLoginLocked = (userId: string) => loginGuardOf(userId).locked;

  useEffect(() => {
    if (selectedUserId && !tenantUserIds.some(u => u.id === selectedUserId)) setSelectedUserId(null);
  }, [selectedUserId, tenantUserIds]);

  const people = useMemo(() => {
    // 范围=成员身份 orgUnit（含下级时按本租户子树），不再是 User.orgId 主档。
    // 默认隐藏「已移除」成员；筛选=已移除 时反向只读展示移除名单。
    const scopeIds = includeChildren ? new Set(orgDescendantIds(orgs, tenantRootId)) : new Set([tenantRootId]);
    const kw = keyword.trim().toLowerCase();
    return tenantUserIds.filter(u => {
      if (!scopeIds.has(memberOrgId(u.id))) return false;
      if (kw && !(u.name.toLowerCase().includes(kw) || u.account.toLowerCase().includes(kw))) return false;
      if (statusFilter === 'removed') {
        if (!isRemovedMember(u.id)) return false;
      } else {
        if (isRemovedMember(u.id)) return false;
        if (statusFilter && u.accountStatus !== statusFilter) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeChildren, keyword, orgs, statusFilter, tenantRootId, tenantUserIds, memberships, membershipVersion]);

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
    // 账号口径（2026-09-18）：企业内唯一 + 格式规则；用于账号密码登录（登录=企业编码+账号+密码）
    if (!ACCOUNT_PATTERN.test(account)) return fail('账号须为 3-20 位小写字母/数字，可含 - 与 _');
    // 已移除成员识别（2026-09-18 重新加入入口②）：输入命中已移除成员的账号/手机号时
    // 引导重新加入，而不是提示"已存在"
    const removedHit = memberships.find(m => {
      if (m.status !== 'removed') return false;
      const u = users.find(x => x.id === m.userId);
      return Boolean(u && (u.phone === createUserOpen.phone.trim() || u.account.toLowerCase() === account.toLowerCase()));
    });
    if (removedHit) {
      const u = users.find(x => x.id === removedHit.userId);
      if (u && (ACCOUNT_PATTERN.test(account) || /^1\d{10}$/.test(createUserOpen.phone.trim()))) {
        setCreateUserOpen(null);
        setRejoinUser({ userId: u.id, orgId: removedHit.orgUnitId, error: '' });
        addToast({ type: 'info', title: '发现已移除的同名成员', description: `${u.name}（${u.account}）曾于 ${removedHit.removedAt ?? '—'} 被移除，可直接重新加入并保留历史记录。` });
        return;
      }
    }
    if (isAccountTakenInWorkspace(account, tenantRootId)) return fail('该账号在本企业已存在，请更换');
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

  // ── 批量导入成员（2026-09-18）：粘贴解析 → 逐行校验 → 有错全驳 → 确认导入 ──
  const importRows = useMemo(() => {
    if (!importOpen) return [] as ImportRow[];
    const deptOptions = defaultOrgOptions();
    const lines = importOpen.raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const seenAccounts = new Set<string>();
    const seenPhones = new Set<string>();
    const rows: ImportRow[] = [];
    lines.forEach((line, i) => {
      const cols = line.split(/\t|,|，/).map(c => c.trim());
      // 首行为表头（同时含「账号」「姓名」字样）时自动跳过
      if (i === 0 && cols.some(c => c.includes('账号')) && cols.some(c => c.includes('姓名'))) return;
      const row: ImportRow = {
        line: rows.length + 1,
        account: (cols[0] ?? '').toLowerCase(),
        name: cols[1] ?? '',
        phone: cols[2] ?? '',
        dept: cols[3] ?? '',
        email: cols[4] ?? '',
      };
      const errs: string[] = [];
      if (!ACCOUNT_PATTERN.test(row.account)) errs.push('账号格式不符（3-20 位小写字母/数字，可含 - _）');
      else if (seenAccounts.has(row.account)) errs.push('账号在文件内重复');
      else if (isAccountTakenInWorkspace(row.account, tenantRootId)) errs.push('账号在本企业已存在');
      if (!row.name) errs.push('缺少姓名');
      if (!/^1\d{10}$/.test(row.phone)) errs.push('手机号格式不符');
      else if (seenPhones.has(row.phone)) errs.push('手机号在文件内重复');
      else if (isPhoneTakenInWorkspace(row.phone, tenantRootId)) {
        const removedPhone = memberships.some(m => m.status === 'removed' && users.find(x => x.id === m.userId)?.phone === row.phone);
        errs.push(removedPhone ? '该手机号对应已移除成员，请单独使用「重新加入」' : '手机号在本企业已存在');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errs.push('邮箱格式不符');
      if (!row.dept) errs.push('缺少部门');
      else {
        const matched = deptOptions.filter(o => o.name === row.dept || orgPathLabel(orgs, o.id) === row.dept);
        if (matched.length === 0) errs.push('部门不存在（须为本企业组织内部门）');
        else if (matched.length > 1) errs.push('部门名称不唯一，请使用完整路径');
      }
      if (errs.length > 0) row.error = errs.join('；');
      seenAccounts.add(row.account);
      seenPhones.add(row.phone);
      rows.push(row);
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importOpen, memberships, orgs, tenantRootId, users, membershipVersion]);

  // 套餐用户限额（file 级校验）：超限警示并阻止导入（行级由 createUser 兜底）
  const quotaWarn = useMemo(() => {
    if (importRows.length === 0 || !importRows.every(r => !r.error)) return null;
    const { quota, used } = tenantQuotaInfo(tenantRootId);
    if (quota == null) return null;
    return used + importRows.length > quota
      ? `导入后将在册 ${used + importRows.length} 人，超出租户用户限额 ${quota} 人；请减少行数或联系软件服务方调整限额。`
      : null;
  }, [importRows, tenantRootId]);

  const importValid = importRows.length > 0 && importRows.every(r => !r.error) && !quotaWarn;

  function submitImport() {
    if (!importValid) return;
    let ok = 0;
    for (const row of importRows) {
      const deptOptions = defaultOrgOptions();
      const target = deptOptions.find(o => o.name === row.dept || orgPathLabel(orgs, o.id) === row.dept);
      const result = store.createUser({ name: row.name, account: row.account, phone: row.phone, email: row.email, orgId: target?.id ?? tenantRootId });
      if (!result.ok) {
        addToast({ type: 'error', title: '批量导入中断', description: `第 ${row.line} 行导入失败：${result.error}（前 ${ok} 行已建档成功）` });
        setImportOpen(null);
        return;
      }
      ok += 1;
    }
    store.logAudit({
      module: '用户与授权',
      action: '批量导入成员',
      target: `共 ${importRows.length} 行`,
      resource: 'users.import',
      reason: '批量导入',
      afterSummary: `校验通过 ${importRows.length} 行 · 成功建档 ${ok} 人 · 驳回 0 行`,
    });
    addToast({ type: 'success', title: '批量导入完成', description: `成功建档 ${ok} 人；角色与数据范围请前往「角色与数据范围」授予。` });
    setImportOpen(null);
  }

  function downloadImportTemplate() {
    addToast({ type: 'info', title: '模板下载（演示）', description: '原型不生成文件（演示）。列顺序：登录账号, 姓名, 手机号, 部门, 邮箱；支持从 Excel 复制后直接粘贴。' });
  }

  function submitRemoveUser() {
    if (!removeUser) return;
    if (removeUser.kind === '其他' && !removeUser.note.trim()) {
      setRemoveUser({ ...removeUser, error: '选择「其他」时请填写补充说明' });
      return;
    }
    const result = store.removeTenantMember({ userId: removeUser.userId, kind: removeUser.kind, note: removeUser.note.trim() || undefined });
    if (!result.ok) {
      setRemoveUser({ ...removeUser, error: result.error || '移除失败' });
      return;
    }
    const target = users.find(u => u.id === removeUser.userId);
    addToast({
      type: 'success',
      title: '成员已移除',
      description: `${target?.name} 在本企业的成员身份已终止${result.revokedCount ? `，已同步回收 ${result.revokedCount} 条有效授权` : ''}；可在「已移除成员」筛选中重新加入。`,
    });
    setRemoveUser(null);
  }

  function submitRejoinUser() {
    if (!rejoinUser) return;
    const result = store.rejoinTenantMember({ userId: rejoinUser.userId, orgId: rejoinUser.orgId });
    if (!result.ok) {
      setRejoinUser({ ...rejoinUser, error: result.error || '重新加入失败' });
      return;
    }
    const target = users.find(u => u.id === rejoinUser.userId);
    addToast({ type: 'success', title: '成员已重新加入', description: `${target?.name} 已恢复为本企业有效成员；请前往「角色与数据范围」重新授予角色。` });
    setRejoinUser(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="用户管理"
        description={`维护「${tenantRoot?.name ?? '本企业'}」的成员账号（建档、启停、调岗）；角色与数据范围为只读展示，调整请前往「角色与数据范围」。`}
        actions={canCreate ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="md" icon={<Upload size={14} />} onClick={() => setImportOpen({ raw: '' })}>
              批量导入
            </Button>
            <Button variant="primary" size="md" icon={<UserPlus size={14} />} onClick={() => setCreateUserOpen({
              name: '', account: '', phone: '', email: '', orgId: defaultOrgOptions()[0]?.id ?? tenantRootId, error: '',
              createRep: false, gender: '男', photoFile: '', idNo: '', education: '本科', major: '', school: '', eduProof: '',
              pledgeDate: '', pledgeFile: '', employStart: '', employEnd: '',
            })}>
              新建用户
            </Button>
          </div>
        ) : undefined}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="姓名 / 账号" style={{ ...inputStyle, width: 160, height: 30 }} />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 130, height: 30 }}>
              <option value="">账号状态</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
              <option value="removed">已移除成员</option>
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
                      <td style={tdStyle}>
                        {memberOrgName(u.id)}
                        {isRemovedMember(u.id) && (
                          <div style={{ fontSize: 'var(--fs-11)', color: '#C73A3A', marginTop: 2 }}>
                            {membershipOf(u.id)?.removedKind ?? '已移除'} · {membershipOf(u.id)?.removedBy ?? '—'}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          <StatusTag status={u.accountStatus === 'enabled' ? '启用' : '停用'} size="sm" />
                          {isRemovedMember(u.id) && <StatusTag status="已移除" size="sm" />}
                          {isLoginLocked(u.id) && !isRemovedMember(u.id) && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: '11px', background: '#FEF3E2', color: '#C77A16' }}>
                              <Lock size={10} aria-hidden /> 登录锁定
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        {active.length === 0 ? <span style={{ color: '#9CA3AF' }}>0 个</span> : (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {active.map(a => <span key={a.id} style={chipStyle}>{a.roleName}</span>)}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: '#667085', whiteSpace: 'nowrap' }}>{latestAssignmentAt(assignments, u.id) ?? '—'}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedUserId(u.id)}>查看详情</Button>
                          {canEdit && isRemovedMember(u.id) && (
                            <Button variant="outline" size="sm" onClick={() => setRejoinUser({ userId: u.id, orgId: membershipOf(u.id)?.orgUnitId ?? tenantRootId, error: '' })}>重新加入</Button>
                          )}
                          {canEdit && isLoginLocked(u.id) && !isRemovedMember(u.id) && (
                            <Button variant="ghost" size="sm" onClick={() => setUnlockUserId(u.id)}>解锁登录</Button>
                          )}
                        </div>
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
      {selectedUser && (() => {
        const detailMembership = membershipOf(selectedUser.id);
        const detailRemoved = detailMembership?.status === 'removed';
        const detailLocked = isLoginLocked(selectedUser.id);
        const removeActiveCount = userAssignments(selectedUser.id).filter(a => a.status === 'active').length;
        return (
        <Modal open title={`用户详情 · ${selectedUser.name}`} onClose={() => setSelectedUserId(null)} width={620}
          footer={
            <div style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {canEdit && detailLocked && !detailRemoved && (
                <Button variant="ghost" onClick={() => setUnlockUserId(selectedUser.id)}>解锁登录</Button>
              )}
              {canEdit && detailRemoved && (
                <Button variant="outline" onClick={() => {
                  setRejoinUser({ userId: selectedUser.id, orgId: detailMembership?.orgUnitId ?? tenantRootId, error: '' });
                  setSelectedUserId(null);
                }}>重新加入</Button>
              )}
              {canEdit && !detailRemoved && selectedUser.accountStatus === 'enabled' && (
                <Button variant="ghost" onClick={() => setDisableUser({ userId: selectedUser.id, revokeAll: false })}>停用账号</Button>
              )}
              {canEdit && !detailRemoved && selectedUser.accountStatus !== 'enabled' && (
                <Button variant="outline" onClick={() => setEnableUserId(selectedUser.id)}>启用账号</Button>
              )}
              {canEdit && !detailRemoved && selectedUser.accountStatus === 'enabled' && (
                <Button variant="outline" onClick={() => setMoveUser({ userId: selectedUser.id, targetId: '', error: '' })}>调整所属部门</Button>
              )}
              {canEdit && !detailRemoved && selectedUser.id !== principal.userId && (
                <Button variant="danger" onClick={() => {
                  setRemoveUser({ userId: selectedUser.id, kind: '离职', note: '', error: '' });
                  setSelectedUserId(null);
                }}>移除成员</Button>
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
            {detailLocked && (
              <Field label="登录状态">
                <span style={{ color: '#C77A16', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Lock size={13} aria-hidden /> 密码连续输错已锁定（连错 5 次锁 15 分钟，可解锁或等自动解除）
                </span>
              </Field>
            )}
            {detailRemoved && (
              <Field label="移除记录">
                <span style={{ color: '#C73A3A' }}>
                  {detailMembership?.removedKind ?? '—'}
                  {detailMembership?.removedNote ? `：${detailMembership.removedNote}` : ''}
                  {` · ${detailMembership?.removedAt ?? '—'} · ${detailMembership?.removedBy ?? '—'}`}
                  {detailMembership?.rejoinedAt ? '' : '（可重新加入）'}
                </span>
              </Field>
            )}
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
          {detailRemoved && removeActiveCount > 0 && (
            <div style={{ marginTop: 10, fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>
              该成员已移除：名下 {removeActiveCount} 条授权记录已同步回收（历史保留），重新加入后需重新授予角色。
            </div>
          )}
        </Modal>
        );
      })()}

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
              <Field label="登录账号" required hint="用于账号密码登录，本企业内唯一">
                <input
                  value={createUserOpen.account}
                  onChange={e => setCreateUserOpen({ ...createUserOpen, account: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''), error: '' })}
                  style={inputStyle}
                  maxLength={20}
                  placeholder="例如：zhangsan"
                />
                {createUserOpen.account && ACCOUNT_PATTERN.test(createUserOpen.account.trim()) && isAccountTakenInWorkspace(createUserOpen.account, tenantRootId) && (
                  <div style={{ color: '#C73A3A', fontSize: 'var(--fs-12)', marginTop: 4 }}>该账号在本企业已存在，请更换</div>
                )}
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
              <Users size={13} /> 同一个手机号可在多家企业分别建档成员身份；此处仅创建当前企业的成员。初始密码统一 demo123（演示）
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

      {/* 移除成员（2026-09-18）：终止本企业成员身份，与「停用账号」并行存在 */}
      {removeUser && (() => {
        const target = users.find(u => u.id === removeUser.userId);
        const rmActive = assignments.filter(a => a.userId === removeUser.userId && a.tenantId === tenantRootId && a.status === 'active').length;
        return (
          <Modal open title="移除成员" onClose={() => setRemoveUser(null)} width={520}
            footer={
              <>
                <Button variant="outline" onClick={() => setRemoveUser(null)}>取消</Button>
                <Button variant="danger" onClick={submitRemoveUser}>确认移除</Button>
              </>
            }
          >
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 14, display: 'grid', gap: 8, fontSize: 'var(--fs-13)' }}>
                <div><span style={{ color: '#9CA3AF' }}>成员 </span><strong>{target?.name} · {target?.account}</strong></div>
                <div><span style={{ color: '#9CA3AF' }}>有效角色授权 </span>{rmActive} 条（移除时同步回收，历史保留可查）</div>
              </div>
              <InfoBanner tone="warning">
                移除终止的是该成员在「{tenantRoot?.name ?? '本企业'}」的<b>成员身份</b>：立即无法登录本企业。其自然人账号、
                其他企业的成员身份与历史记录<b>不受影响</b>。与「停用账号」不同：移除后成员从默认名单移除，
                可在「已移除成员」筛选中「重新加入」恢复。
              </InfoBanner>
              {removeUser.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{removeUser.error}</div>}
              <Field label="移除原因" required>
                <select value={removeUser.kind} onChange={e => setRemoveUser({ ...removeUser, kind: e.target.value, error: '' })} style={inputStyle}>
                  <option value="离职">离职</option>
                  <option value="误建">误建</option>
                  <option value="其他">其他</option>
                </select>
              </Field>
              <Field label="补充说明" hint="选择「其他」时必填；随审计保留">
                <textarea
                  value={removeUser.note}
                  onChange={e => setRemoveUser({ ...removeUser, note: e.target.value, error: '' })}
                  style={{ ...inputStyle, height: 64, padding: 8 }}
                  placeholder="补充说明（可选）"
                />
              </Field>
            </div>
          </Modal>
        );
      })()}

      {/* 重新加入（移除后恢复）：恢复 active 成员身份并选择部门，移除留痕保留 */}
      {rejoinUser && (() => {
        const target = users.find(u => u.id === rejoinUser.userId);
        const m = membershipOf(rejoinUser.userId);
        return (
          <Modal open title="重新加入" onClose={() => setRejoinUser(null)} width={520}
            footer={
              <>
                <Button variant="outline" onClick={() => setRejoinUser(null)}>取消</Button>
                <Button variant="primary" disabled={!rejoinUser.orgId} onClick={submitRejoinUser}>确认重新加入</Button>
              </>
            }
          >
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 14, display: 'grid', gap: 6, fontSize: 'var(--fs-13)' }}>
                <div><span style={{ color: '#9CA3AF' }}>成员 </span><strong>{target?.name} · {target?.account}</strong></div>
                <div style={{ color: '#667085' }}>
                  上次移除：{m?.removedKind ?? '—'} · {m?.removedAt ?? '—'} · {m?.removedBy ?? '—'}{m?.removedNote ? `：${m.removedNote}` : ''}
                </div>
              </div>
              <InfoBanner>
                重新加入恢复其在本企业的成员身份（历史移除记录保留可查）；此前的角色授权已随移除回收，
                需在「角色与数据范围」重新授予。
              </InfoBanner>
              {rejoinUser.error && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)' }}>{rejoinUser.error}</div>}
              <Field label="所属部门 / 团队" required>
                <select value={rejoinUser.orgId} onChange={e => setRejoinUser({ ...rejoinUser, orgId: e.target.value, error: '' })} style={inputStyle}>
                  {defaultOrgOptions().map(o => <option key={o.id} value={o.id}>{orgPathLabel(orgs, o.id)}</option>)}
                </select>
              </Field>
            </div>
          </Modal>
        );
      })()}

      {/* 批量导入成员（2026-09-18）：粘贴解析 → 逐行校验 → 有错全驳 → 确认导入 */}
      {importOpen && (
        <Modal open title="批量导入成员" onClose={() => setImportOpen(null)} width={720}
          footer={
            <>
              <Button variant="outline" onClick={() => setImportOpen(null)}>取消</Button>
              <Button variant="primary" disabled={!importValid} onClick={submitImport}>
                {importValid ? `确认导入 ${importRows.length} 人` : '存在错误行，全部驳回'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBanner>
              粘贴表格内容（CSV / Excel 复制均可），列顺序：<b>登录账号, 姓名, 手机号, 部门, 邮箱</b>；首行为表头时自动跳过。
              <button
                type="button"
                onClick={downloadImportTemplate}
                style={{ marginLeft: 6, border: 'none', background: 'none', color: 'var(--color-brand)', cursor: 'pointer', fontSize: 'var(--fs-12)', fontWeight: 600, textDecoration: 'underline', padding: 0 }}
              >
                下载模板（演示）
              </button>
            </InfoBanner>
            <textarea
              value={importOpen.raw}
              onChange={e => setImportOpen({ raw: e.target.value })}
              style={{ ...inputStyle, height: 92, padding: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)', resize: 'vertical' }}
              placeholder={'zhangsan, 张三, 13901350000, 销售部, zhangsan@company.com\nlisi, 李四, 13901350001, 市场部, lisi@company.com'}
            />
            {importRows.length === 0 ? (
              <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>
                粘贴后自动解析并逐行校验：账号/手机号企业内唯一、部门须为本企业组织内节点、不超租户用户限额。
              </div>
            ) : (
              <>
                {quotaWarn && <InfoBanner tone="warning">{quotaWarn}</InfoBanner>}
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'auto', maxHeight: 280 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>{['行', '账号', '姓名', '手机号', '部门', '校验结果'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {importRows.map(r => (
                        <tr key={r.line} style={{ background: r.error ? '#FFF7F7' : undefined }}>
                          <td style={tdStyle}>{r.line}</td>
                          <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace" }}>{r.account}</td>
                          <td style={tdStyle}>{r.name}</td>
                          <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace" }}>{r.phone}</td>
                          <td style={tdStyle}>{r.dept || '—'}</td>
                          <td style={{ ...tdStyle, color: r.error ? '#C73A3A' : '#248A5A', fontSize: 'var(--fs-12)' }}>{r.error ?? '✓ 通过'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>
                  校验通过 {importRows.filter(r => !r.error).length} 行 · 错误 {importRows.filter(r => r.error).length} 行；
                  存在任何错误行时<b>全部驳回</b>（须修正后重新粘贴），避免半批导入。
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* 解锁登录（2026-09-18 账号安全）：清除密码连错锁定 */}
      {unlockUserId && (
        <ConfirmDialog
          open
          title="解锁登录"
          description={`解除 ${users.find(u => u.id === unlockUserId)?.name ?? ''}（${users.find(u => u.id === unlockUserId)?.account ?? ''}）的密码连错锁定；解锁后该成员可立即使用密码登录。`}
          confirmLabel="确认解锁"
          onConfirm={() => {
            const target = users.find(u => u.id === unlockUserId);
            void unlockLoginGuard(unlockUserId, principal.name).then(result => {
              if (!result.ok) addToast({ type: 'error', title: '解锁失败', description: result.error });
              else addToast({ type: 'success', title: '已解锁登录', description: `${target?.name ?? ''} 的登录锁定已解除，操作已记录审计。` });
              setUnlockUserId(null);
              bump(x => x + 1);
            });
          }}
          onCancel={() => setUnlockUserId(null)}
        />
      )}
    </div>
  );
}

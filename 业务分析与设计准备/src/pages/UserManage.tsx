/**
 * 用户管理（精致左树右表 + 方案 A 负责地区）：基础查询、新增、修改、启停、删除与负责地区配置。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AnchoredPopover } from '../components/AnchoredPopover';
import { MultiSelect } from '../components/MultiSelect';
import { usePermission } from '../context/PermissionContext';
import { REGION_NATIONWIDE } from '../constants';
import { ACCOUNT_PATTERN } from '../data/tenantRegistry';
import {
  enterpriseRootOf,
  isDeptParentType,
  isMembershipUnassigned,
  orgChildren,
  orgDescendantIds,
  orgPathLabel,
  type PermOrg,
  type PermUser,
} from '../data/permissions';
import {
  membershipOfUserInTenant,
  membershipsOfTenant,
  subscribeTenantMemberships,
} from '../data/cooperationModel';
import type { NavFocus } from '../types';
import type { ToastMessage } from '../components/Toast';
import { Field, inputStyle } from './permUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  navFocus?: NavFocus;
}

interface UserForm {
  mode: 'create' | 'edit';
  userId?: string;
  account: string;
  name: string;
  phone: string;
  email: string;
  orgId: string;
  roleIds: string[];
  regions: string[];
  /** 手机号是否允许编辑：未激活可改（录错号在激活前修正）；已激活为个人登录凭证，管理员不可改 */
  phoneEditable: boolean;
  error: string;
}

/** 常用大区快捷预设（一键勾选对应省份，完整覆盖 34 个省级行政区） */
const REGION_PRESETS: { label: string; provinces: string[] }[] = [
  { label: '全国', provinces: [REGION_NATIONWIDE] },
  { label: '华东', provinces: ['上海', '江苏', '浙江', '安徽', '福建', '江西', '山东'] },
  { label: '华北', provinces: ['北京', '天津', '河北', '山西', '内蒙古'] },
  { label: '华南', provinces: ['广东', '广西', '海南'] },
  { label: '华中', provinces: ['河南', '湖北', '湖南'] },
  { label: '西南', provinces: ['重庆', '四川', '贵州', '云南', '西藏'] },
  { label: '西北', provinces: ['陕西', '甘肃', '青海', '宁夏', '新疆'] },
  { label: '东北', provinces: ['辽宁', '吉林', '黑龙江'] },
  { label: '港澳台', provinces: ['香港', '澳门', '台湾'] },
];

const cardStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  boxShadow: 'var(--shadow-xs)',
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
  padding: '12px 16px',
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

/** 柔和头像底色（按姓名哈希，低饱和度不刺眼） */
const AVATAR_TONES = [
  { bg: '#E8F4F1', fg: '#176B5B' },
  { bg: '#EBF2FE', fg: '#2F6BCE' },
  { bg: '#FEF3E2', fg: '#B4690E' },
  { bg: '#F3EEFB', fg: '#6B46C1' },
  { bg: '#EEF2F6', fg: '#475467' },
];

function avatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

/** 将省份列表归纳为更易读的摘要（若完整命中某个大区则直接展示大区名） */
function summarizeRegions(regions: string[]): string[] {
  if (regions.length === 0) return [];
  if (regions.includes(REGION_NATIONWIDE)) return [REGION_NATIONWIDE];
  const remaining = new Set(regions);
  const labels: string[] = [];
  for (const preset of REGION_PRESETS) {
    if (preset.label === '全国') continue;
    if (preset.provinces.every(p => remaining.has(p))) {
      labels.push(preset.label);
      preset.provinces.forEach(p => remaining.delete(p));
    }
  }
  remaining.forEach(p => labels.push(p));
  return labels;
}

/** 地区标签样式：命中的「全国」用品牌色，大区 / 省份用中性底 */
function regionTagStyle(label: string): CSSProperties {
  const nationwide = label === REGION_NATIONWIDE;
  return {
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 'var(--fs-12)',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    background: nationwide ? 'var(--color-brand-subtle)' : 'var(--color-neutral-bg)',
    color: nationwide ? 'var(--color-brand)' : 'var(--color-neutral-fg)',
  };
}

/** 摘要标签若完整命中某个大区，返回该大区（用于展开省份明细）；散省份与「全国」无需展开 */
function regionPresetOf(label: string) {
  return REGION_PRESETS.find(p => p.label !== REGION_NATIONWIDE && p.label === label);
}

/** 「+N」浮框：该成员的全部负责地区；完整命中的大区附省份明细 */
function RegionOverflowPopover({
  labels,
  anchorRef,
  onClose,
}: {
  labels: string[];
  anchorRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const presets = labels.map(regionPresetOf).filter((p): p is NonNullable<ReturnType<typeof regionPresetOf>> => Boolean(p));
  return (
    <AnchoredPopover anchorRef={anchorRef} onClose={onClose}>
      <div
        role="dialog"
        aria-label="负责地区"
        style={{ padding: 12, minWidth: 200, maxWidth: 320, minHeight: 0, overflow: 'auto', display: 'grid', gap: 10 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>负责地区</span>
          <span className="font-mono-nums" style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)' }}>
            共 {labels.length} 项
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {labels.map(label => <span key={label} style={regionTagStyle(label)}>{label}</span>)}
        </div>
        {presets.length > 0 && (
          <div style={{ display: 'grid', gap: 4, paddingTop: 10, borderTop: '1px solid #F1F3F5', fontSize: 'var(--fs-12)', lineHeight: 1.6, color: 'var(--color-text-2)' }}>
            {presets.map(p => (
              <div key={p.label}>
                <span style={{ color: 'var(--color-text-1)', fontWeight: 500 }}>{p.label}</span>：{p.provinces.join('、')}
              </div>
            ))}
          </div>
        )}
      </div>
    </AnchoredPopover>
  );
}

export function UserManage({ addToast }: Props) {
  const store = usePermission();
  const { orgs, users, assignments, roles, realmRoles, can, previewReadOnly, principal } = store;
  const tenantRootId = principal.realm === 'TENANT' ? principal.tenantId : 'org-platform';
  const tenantRoot = orgs.find(o => o.id === tenantRootId);
  const isTenant = principal.realm === 'TENANT';
  /** 负责地区只对药厂租户有意义：服务商成员的可处理范围由品种授权派生，不按人配置 */
  const showRegions = isTenant && tenantRoot?.type === 'pharma';

  const [membershipVersion, bump] = useState(0);
  useEffect(() => subscribeTenantMemberships(() => bump(x => x + 1)), []);

  const [deptFilter, setDeptFilter] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>(tenantRootId);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([tenantRootId]));
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [regionSearch, setRegionSearch] = useState('');
  const [showProvinceGrid, setShowProvinceGrid] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm | null>(null);
  const [deleting, setDeleting] = useState<PermUser | null>(null);
  /** 正在展开「更多负责地区」浮框的成员 */
  const [regionPopoverFor, setRegionPopoverFor] = useState<string | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  /** 待确认停用的成员 */
  const [freezing, setFreezing] = useState<PermUser | null>(null);

  const canCreate = can('user-manage', 'create') && !previewReadOnly;
  const canEdit = can('user-manage', 'edit') && !previewReadOnly;
  const canDelete = can('user-manage', 'delete') && !previewReadOnly;

  const tenantOrgIds = useMemo(() => new Set(orgDescendantIds(orgs, tenantRootId)), [orgs, tenantRootId]);
  const scopedOrgs = useMemo(() => orgs.filter(o => tenantOrgIds.has(o.id)), [orgs, tenantOrgIds]);

  useEffect(() => {
    setSelectedOrgId(tenantRootId);
    setExpanded(new Set(scopedOrgs.map(o => o.id)));
  }, [tenantRootId]);

  const activeMemberships = useMemo(
    () => membershipsOfTenant(tenantRootId).filter(m => m.status !== 'removed' && m.status !== 'left'),
    [tenantRootId, membershipVersion],
  );

  const memberOrgId = (userId: string) =>
    membershipOfUserInTenant(userId, tenantRootId)?.orgUnitId
    ?? users.find(u => u.id === userId)?.orgId
    ?? '';

  /** 主属部门仍是本企业组织树内节点才返回；原部门已被删除 = 待分配 */
  const memberEffectiveOrgId = (userId: string): string | undefined => {
    const id = memberOrgId(userId);
    return scopedOrgs.some(o => o.id === id) ? id : undefined;
  };

  const memberOrgName = (userId: string) =>
    orgs.find(o => o.id === memberEffectiveOrgId(userId))?.name ?? '—';

  const memberRegions = (userId: string): string[] =>
    membershipOfUserInTenant(userId, tenantRootId)?.responsibleRegions ?? [];

  const isUserEnabled = (u: PermUser) => {
    if (!isTenant) return u.accountStatus === 'enabled';
    const m = membershipOfUserInTenant(u.id, tenantRootId);
    return m ? m.status !== 'frozen' : u.accountStatus === 'enabled';
  };

  /** 是否待激活（2026-11-25 拍板：后台建号不收验证码，首登短信验证码激活） */
  const isPendingActivation = (u: PermUser) =>
    membershipOfUserInTenant(u.id, tenantRootId)?.status === 'pending_activation';

  const tenantUsers = useMemo(() => {
    if (!isTenant) return users.filter(u => tenantOrgIds.has(u.orgId));
    return activeMemberships
      .map(m => users.find(u => u.id === m.userId))
      .filter((u): u is PermUser => Boolean(u));
  }, [activeMemberships, isTenant, tenantOrgIds, users]);

  /** 待分配成员：原部门已被删除/裁撤，不再出现在本企业组织树内 */
  const unassignedIds = useMemo(
    () => new Set(tenantUsers
      .filter(u => isMembershipUnassigned(scopedOrgs, membershipOfUserInTenant(u.id, tenantRootId), tenantRootId))
      .map(u => u.id)),
    [scopedOrgs, tenantRootId, tenantUsers],
  );

  const deptUserCount = (orgId: string) => {
    const ids = new Set(orgDescendantIds(scopedOrgs, orgId));
    const inSubtree = tenantUsers.filter(u => {
      const memberOrg = memberEffectiveOrgId(u.id);
      return Boolean(memberOrg) && ids.has(memberOrg!);
    }).length;
    // 企业根节点统计该企业现有成员，包含待分配成员
    return orgId === tenantRootId ? inSubtree + unassignedIds.size : inSubtree;
  };

  const people = useMemo(() => {
    const scopeIds = new Set(orgDescendantIds(scopedOrgs, selectedOrgId || tenantRootId));
    const kw = keyword.trim().toLowerCase();
    const preset = REGION_PRESETS.find(p => p.label === regionFilter);
    return tenantUsers.filter(u => {
      // 待分配成员挂在企业根节点：只在根节点选中时进入列表（搜索/筛选照常生效）
      if (unassignedIds.has(u.id)) {
        if ((selectedOrgId || tenantRootId) !== tenantRootId) return false;
      } else if (!scopeIds.has(memberEffectiveOrgId(u.id) ?? '')) {
        return false;
      }
      if (kw && !(u.name.toLowerCase().includes(kw) || u.account.toLowerCase().includes(kw) || u.phone.includes(kw))) return false;
      if (statusFilter === 'enabled' && (!isUserEnabled(u) || isPendingActivation(u))) return false;
      if (statusFilter === 'disabled' && isUserEnabled(u)) return false;
      if (statusFilter === 'pending' && !isPendingActivation(u)) return false;
      if (regionFilter && preset) {
        const regs = memberRegions(u.id);
        if (preset.label === '全国') {
          if (!regs.includes(REGION_NATIONWIDE)) return false;
        } else {
          const hit = regs.includes(REGION_NATIONWIDE) || preset.provinces.some(p => regs.includes(p));
          if (!hit) return false;
        }
      }
      return true;
    });
  }, [keyword, membershipVersion, regionFilter, scopedOrgs, selectedOrgId, statusFilter, tenantRootId, tenantUsers, unassignedIds]);

  const orgOptions = useMemo(
    () => scopedOrgs.filter(o =>
      enterpriseRootOf(scopedOrgs, o.id)?.id === tenantRootId
      && (isDeptParentType(o.type) || o.type === 'platform'),
    ),
    [scopedOrgs, tenantRootId],
  );

  const grantableRoles = useMemo(
    () => realmRoles.filter(r => r.status === 'enabled'),
    [realmRoles],
  );

  const userActiveAssignments = (userId: string) =>
    assignments.filter(a => a.userId === userId && a.tenantId === tenantRootId && a.status === 'active');

  const userRoleNames = (userId: string) =>
    userActiveAssignments(userId)
      .map(a => roles.find(r => r.id === a.roleId)?.name)
      .filter((n): n is string => Boolean(n));

  const roleOptions = useMemo(
    () => grantableRoles.map(r => ({ value: r.id, label: r.name })),
    [grantableRoles],
  );

  /** 该成员在本企业担任负责人的部门（停用确认时提示交接） */
  const managedDeptNames = (userId: string) =>
    orgs
      .filter(o => o.type === 'department' && o.managerUserId === userId && enterpriseRootOf(orgs, o.id)?.id === tenantRootId)
      .map(o => o.name);

  function openCreate() {
    setRegionSearch('');
    setShowProvinceGrid(false);
    setForm({
      mode: 'create',
      account: '',
      name: '',
      phone: '',
      email: '',
      orgId: selectedOrgId || orgOptions[0]?.id || tenantRootId,
      roleIds: [],
      regions: [],
      phoneEditable: true,
      error: '',
    });
  }

  function openEdit(u: PermUser) {
    setRegionSearch('');
    setShowProvinceGrid(false);
    const membership = membershipOfUserInTenant(u.id, tenantRootId);
    setForm({
      mode: 'edit',
      userId: u.id,
      account: u.account,
      name: u.name,
      phone: u.phone,
      email: u.email,
      orgId: memberEffectiveOrgId(u.id) || tenantRootId,
      roleIds: Array.from(new Set(userActiveAssignments(u.id).map(a => a.roleId))),
      regions: [...memberRegions(u.id)],
      // 未激活可改（激活前修正录错的号）；已激活为个人登录凭证，管理员不可改
      phoneEditable: membership?.status === 'pending_activation',
      error: '',
    });
  }

  function toggleProvince(province: string) {
    if (!form) return;
    const base = form.regions.filter(r => r !== REGION_NATIONWIDE);
    const next = base.includes(province)
      ? base.filter(r => r !== province)
      : [...base, province];
    setForm({ ...form, regions: next, error: '' });
  }

  function togglePreset(preset: { label: string; provinces: string[] }) {
    if (!form) return;
    if (preset.label === '全国') {
      const next = form.regions.includes(REGION_NATIONWIDE) ? [] : [REGION_NATIONWIDE];
      setForm({ ...form, regions: next, error: '' });
      return;
    }
    const base = form.regions.filter(r => r !== REGION_NATIONWIDE);
    const allSelected = preset.provinces.every(p => base.includes(p));
    const next = allSelected
      ? base.filter(p => !preset.provinces.includes(p))
      : Array.from(new Set([...base, ...preset.provinces]));
    setForm({ ...form, regions: next, error: '' });
  }

  function submitForm() {
    if (!form) return;
    const fail = (error: string) => setForm({ ...form, error });
    // 分配角色、负责地区均为必选：不再存在「未配置 / —」成员状态
    if (!form.name.trim()) return fail('请填写姓名');
    if (!form.phone.trim()) return fail('请填写手机号');
    if (isTenant && grantableRoles.length > 0 && form.roleIds.length === 0) return fail('请至少选择一个角色');
    if (showRegions && form.regions.length === 0) return fail('请至少选择一个负责地区');
    // 用户名必填（仅新建可输；编辑态锁定）：格式必须满足账号规则，避免被自动改写成 u+手机号
    if (form.mode === 'create') {
      const account = form.account.trim();
      if (!account) return fail('请填写用户名');
      if (!ACCOUNT_PATTERN.test(account)) return fail('用户名需为 3-20 位，仅限小写字母、数字、下划线或连字符，且以字母或数字开头');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (form.mode === 'create') {
      const res = store.createUser({
        account: form.account.trim(),
        name: form.name,
        phone: form.phone,
        email: form.email.trim() || undefined,
        orgId: form.orgId,
        roles: isTenant ? form.roleIds.map(roleId => ({ roleId, effectiveFrom: today })) : undefined,
      });
      if (!res.ok) return fail(res.error || '新增失败');
      if (showRegions && res.user) {
        const regRes = store.setMemberRegions({ userId: res.user.id, regions: form.regions });
        if (!regRes.ok) return fail(regRes.error || '负责地区保存失败');
      }
      addToast({ type: 'success', title: '已新增用户' });
    } else if (form.userId) {
      // 手机号变更（仅未激活成员可选）：单独走 correctMemberPhone 的全套校验与审计
      if (form.phoneEditable) {
        const target = tenantUsers.find(u => u.id === form.userId);
        if (target && form.phone !== target.phone) {
          const phoneRes = store.correctMemberPhone({ userId: form.userId, phone: form.phone });
          if (!phoneRes.ok) return fail(phoneRes.error || '手机号修改失败');
        }
      }
      const res = store.updateMemberProfile({
        userId: form.userId,
        name: form.name,
        email: form.email,
        orgUnitId: form.orgId,
      });
      if (!res.ok) return fail(res.error || '修改失败');
      if (isTenant) {
        // 同步角色差异：先加后减，避免误触发唯一管理员拦截
        const currentActive = userActiveAssignments(form.userId);
        const currentIds = new Set(currentActive.map(a => a.roleId));
        const targetIds = new Set(form.roleIds);
        for (const roleId of form.roleIds) {
          if (!currentIds.has(roleId)) {
            const grantRes = store.createAssignment({ userId: form.userId, roleId, effectiveFrom: today });
            if (!grantRes.ok) return fail(grantRes.error || '分配角色失败');
          }
        }
        for (const a of currentActive) {
          if (!targetIds.has(a.roleId)) {
            const revokeRes = store.revokeAssignment(a.id, '用户管理调整角色');
            if (!revokeRes.ok) return fail(revokeRes.error || '移除角色失败');
          }
        }
        const regRes = store.setMemberRegions({ userId: form.userId, regions: form.regions });
        if (!regRes.ok) return fail(regRes.error || '负责地区保存失败');
      }
      addToast({ type: 'success', title: '已保存修改' });
    }
    setForm(null);
  }

  /** 启用直接生效；停用须经 ConfirmDialog 二次确认后调用 */
  function applyStatus(u: PermUser, next: 'active' | 'frozen') {
    const res = store.setMemberStatus({ userId: u.id, status: next });
    if (!res.ok) return addToast({ type: 'error', title: res.error || '操作失败' });
    addToast({ type: 'success', title: next === 'frozen' ? '已停用账号' : '已启用账号' });
  }

  function confirmFreeze() {
    if (!freezing) return;
    applyStatus(freezing, 'frozen');
    setFreezing(null);
  }

  function confirmDelete() {
    if (!deleting) return;
    const res = store.removeTenantMember({ userId: deleting.id, kind: '删除' });
    if (!res.ok) addToast({ type: 'error', title: res.error || '删除失败' });
    else addToast({ type: 'success', title: '已删除用户' });
    setDeleting(null);
  }

  function renderTree(org: PermOrg, depth: number) {
    const children = orgChildren(scopedOrgs, org.id);
    const open = expanded.has(org.id);
    const active = selectedOrgId === org.id;
    const kw = deptFilter.trim().toLowerCase();
    const visible = !kw || org.name.toLowerCase().includes(kw) || children.some(c => c.name.toLowerCase().includes(kw));
    if (!visible) return null;
    const count = deptUserCount(org.id);
    return (
      <div key={org.id}>
        <div
          onClick={() => setSelectedOrgId(org.id)}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '7px 10px',
            paddingLeft: 8 + depth * 14,
            marginBottom: 2,
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 'var(--fs-13)',
            background: active ? 'var(--color-brand-subtle)' : 'transparent',
            color: active ? 'var(--color-brand)' : 'var(--color-text-1)',
            fontWeight: active ? 600 : 400,
            transition: 'background 120ms ease',
          }}
        >
          {active && (
            <span style={{
              position: 'absolute',
              left: 0,
              top: 6,
              bottom: 6,
              width: 3,
              borderRadius: 99,
              background: 'var(--color-brand)',
            }} />
          )}
          {children.length > 0 ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setExpanded(prev => {
                  const next = new Set(prev);
                  if (next.has(org.id)) next.delete(org.id);
                  else next.add(org.id);
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
                background: 'none',
                color: active ? 'var(--color-brand)' : '#9CA3AF',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span style={{ width: 18, display: 'inline-block', flexShrink: 0 }} />
          )}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {org.name}
          </span>
          <span
            className="font-mono-nums"
            style={{
              fontSize: 'var(--fs-12)',
              color: active ? 'var(--color-brand)' : 'var(--color-text-3)',
              flexShrink: 0,
            }}
          >
            {count}
          </span>
        </div>
        {open && children.map(c => renderTree(c, depth + 1))}
      </div>
    );
  }

  const selectedOrgName = scopedOrgs.find(o => o.id === selectedOrgId)?.name ?? tenantRoot?.name ?? '';
  const hasFilters = Boolean(keyword || statusFilter || regionFilter || selectedOrgId !== tenantRootId);
  const freezingDepts = freezing ? managedDeptNames(freezing.id) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-canvas)' }}>
      <PageHeader
        title="用户管理"
        actions={canCreate ? (
          <Button variant="primary" size="md" icon={<Plus size={15} />} onClick={openCreate}>
            新增用户
          </Button>
        ) : undefined}
      />

      <div style={{ flex: 1, overflow: 'hidden', padding: '20px 24px', display: 'flex', gap: 16, minHeight: 0 }}>
        {/* 左：部门导航卡 */}
        <div style={{
          ...cardStyle,
          width: 248,
          flexShrink: 0,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minHeight: 0,
        }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              aria-hidden
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }}
            />
            <input
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              placeholder="搜索部门"
              style={{ ...inputStyle, height: 34, paddingLeft: 32, borderRadius: 8 }}
            />
          </div>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {tenantRoot && renderTree(tenantRoot, 0)}
          </div>
        </div>

        {/* 右：用户列表卡 */}
        <div style={{
          ...cardStyle,
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* 工具栏 */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}>
            <div style={{ position: 'relative', width: 220 }}>
              <Search
                size={14}
                aria-hidden
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }}
              />
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="姓名 / 用户名 / 手机号"
                style={{ ...inputStyle, height: 34, paddingLeft: 32, borderRadius: 8 }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ ...inputStyle, width: 112, height: 34, borderRadius: 8 }}
            >
              <option value="">全部状态</option>
              <option value="enabled">启用</option>
              <option value="pending">待激活</option>
              <option value="disabled">停用</option>
            </select>

            {showRegions && (
              <select
                value={regionFilter}
                onChange={e => setRegionFilter(e.target.value)}
                style={{ ...inputStyle, width: 120, height: 34, borderRadius: 8 }}
              >
                <option value="">全部地区</option>
                {REGION_PRESETS.map(p => (
                  <option key={p.label} value={p.label}>{p.label}</option>
                ))}
              </select>
            )}

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKeyword('');
                  setStatusFilter('');
                  setRegionFilter('');
                  setSelectedOrgId(tenantRootId);
                }}
              >
                重置
              </Button>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-12)', color: 'var(--color-text-2)' }}>
              <span>{selectedOrgName}</span>
              <span style={{ color: '#D1D5DB' }}>·</span>
              <span>共 <strong style={{ color: 'var(--color-text-1)', fontWeight: 600 }}>{people.length}</strong> 人</span>
            </div>
          </div>

          {/* 表格 */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {people.length === 0 ? (
              <EmptyState title="暂无符合条件的用户" description="可调整筛选条件或点击右上角新增用户。" />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={headCellStyle}>成员</th>
                    <th style={headCellStyle}>部门</th>
                    <th style={headCellStyle}>手机号</th>
                    {showRegions && <th style={headCellStyle}>负责地区</th>}
                    <th style={headCellStyle}>角色</th>
                    <th style={{ ...headCellStyle, width: 92 }}>状态</th>
                    <th style={{ ...headCellStyle, width: 168, textAlign: 'right' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map(u => {
                    const enabled = isUserEnabled(u);
                    const pending = isPendingActivation(u);
                    const hovered = hoveredId === u.id;
                    const tone = avatarTone(u.name);
                    const rNames = userRoleNames(u.id);
                    const rawRegions = memberRegions(u.id);
                    const regSummary = summarizeRegions(rawRegions);
                    return (
                      <tr
                        key={u.id}
                        onMouseEnter={() => setHoveredId(u.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{
                          background: hovered || regionPopoverFor === u.id ? '#F8FAFB' : '#FFFFFF',
                          transition: 'background 120ms ease',
                        }}
                      >
                        <td style={bodyCellStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background: tone.bg,
                              color: tone.fg,
                              fontSize: 'var(--fs-13)',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {u.name.slice(0, 1)}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 500, color: 'var(--color-text-1)', lineHeight: 1.35 }}>{u.name}</div>
                              <div className="font-mono-nums" style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)', lineHeight: 1.3 }}>
                                {u.account}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={bodyCellStyle}>
                          {unassignedIds.has(u.id) ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: 'var(--fs-12)',
                                fontWeight: 500,
                                background: 'var(--color-warning-bg)',
                                color: 'var(--color-warning-fg)',
                              }}
                            >
                              待分配
                            </span>
                          ) : (
                            memberOrgName(u.id)
                          )}
                        </td>
                        <td className="font-mono-nums" style={{ ...bodyCellStyle, color: 'var(--color-text-2)' }}>{u.phone}</td>
                        {showRegions && (
                          // 有折叠时改由「+N」浮框承载完整信息，避免原生 title 重复提示
                          <td style={bodyCellStyle} title={regSummary.length > 2 ? undefined : rawRegions.join('、')}>
                            {regSummary.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                {regSummary.slice(0, 2).map(label => (
                                  <span key={label} style={regionTagStyle(label)}>{label}</span>
                                ))}
                                {regSummary.length > 2 && (
                                  <button
                                    ref={regionPopoverFor === u.id ? moreBtnRef : undefined}
                                    type="button"
                                    title="查看全部负责地区"
                                    aria-label={`查看全部负责地区，共 ${regSummary.length} 项`}
                                    aria-haspopup="dialog"
                                    aria-expanded={regionPopoverFor === u.id}
                                    onClick={() => setRegionPopoverFor(regionPopoverFor === u.id ? null : u.id)}
                                    onMouseEnter={e => {
                                      if (regionPopoverFor === u.id) return;
                                      e.currentTarget.style.background = '#E5E7EB';
                                      e.currentTarget.style.color = 'var(--color-text-1)';
                                    }}
                                    onMouseLeave={e => {
                                      if (regionPopoverFor === u.id) return;
                                      e.currentTarget.style.background = 'var(--color-neutral-bg)';
                                      e.currentTarget.style.color = 'var(--color-text-2)';
                                    }}
                                    style={{
                                      padding: '2px 6px',
                                      borderRadius: 6,
                                      fontSize: 'var(--fs-12)',
                                      fontFamily: 'inherit',
                                      whiteSpace: 'nowrap',
                                      border: 'none',
                                      background: regionPopoverFor === u.id ? '#E5E7EB' : 'var(--color-neutral-bg)',
                                      color: regionPopoverFor === u.id ? 'var(--color-text-1)' : 'var(--color-text-2)',
                                      cursor: 'pointer',
                                      transition: 'background 120ms ease, color 120ms ease',
                                    }}
                                  >
                                    +{regSummary.length - 2}
                                  </button>
                                )}
                              </div>
                            )}
                            {regionPopoverFor === u.id && (
                              <RegionOverflowPopover
                                labels={regSummary}
                                anchorRef={moreBtnRef}
                                onClose={() => setRegionPopoverFor(null)}
                              />
                            )}
                          </td>
                        )}
                        <td style={{ ...bodyCellStyle, color: 'var(--color-text-2)' }}>
                          {rNames.join('、')}
                        </td>
                        <td style={bodyCellStyle}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 'var(--fs-12)',
                            fontWeight: 500,
                            color: pending ? 'var(--color-warning-fg)' : enabled ? 'var(--color-success-fg)' : 'var(--color-text-3)',
                          }}>
                            <span style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: pending ? 'var(--color-warning-fg)' : enabled ? 'var(--color-success-fg)' : '#9CA3AF',
                            }} />
                            {pending ? '待激活' : enabled ? '启用' : '停用'}
                          </span>
                        </td>
                        <td style={{ ...bodyCellStyle, textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {canEdit && (
                              <button type="button" style={actionBtnStyle} onClick={() => openEdit(u)}>修改</button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                style={{ ...actionBtnStyle, color: enabled ? 'var(--color-text-2)' : 'var(--color-brand)' }}
                                onClick={() => (enabled ? setFreezing(u) : applyStatus(u, 'active'))}
                              >
                                {enabled ? '停用' : '启用'}
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                style={{ ...actionBtnStyle, color: 'var(--color-danger-fg)' }}
                                onClick={() => setDeleting(u)}
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
            )}
          </div>
        </div>
      </div>

      {/* 新增 / 修改弹窗（宽敞单栏上下平铺，负责地区内联展开无浮层遮挡） */}
      {form && (
        <Modal
          open
          title={form.mode === 'create' ? '新增用户' : '修改用户'}
          onClose={() => setForm(null)}
          width={680}
          maxHeight="86vh"
          footer={
            <>
              <Button variant="outline" onClick={() => setForm(null)}>取消</Button>
              <Button variant="primary" onClick={submitForm}>保存</Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 18 }}>
            {form.error && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'var(--color-danger-bg)',
                color: 'var(--color-danger-fg)',
                fontSize: 'var(--fs-13)',
              }}>
                {form.error}
              </div>
            )}

            {/* 1. 基本信息 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="姓名" required>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value, error: '' })}
                  style={{ ...inputStyle, height: 38, borderRadius: 8 }}
                  placeholder="请输入姓名"
                  autoFocus
                />
              </Field>
              <Field
                label="手机号"
                required
                hint={
                  form.phoneEditable
                    ? '建号不收验证码：成员未激活前可直接改，本人首次短信验证码登录后自动激活。'
                    : '已激活成员为个人登录凭证，企业管理员不可修改；需换号由本人登录后换绑，或移除该成员后重新建档。'
                }
              >
                <input
                  value={form.phone}
                  disabled={!form.phoneEditable}
                  maxLength={11}
                  onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, ''), error: '' })}
                  style={{
                    ...inputStyle,
                    height: 38,
                    borderRadius: 8,
                    background: form.phoneEditable ? '#fff' : '#F9FAFB',
                    color: form.phoneEditable ? 'var(--color-text-1)' : 'var(--color-text-2)',
                  }}
                  placeholder="11 位手机号"
                />
              </Field>
              <Field
                label="用户名"
                required
                hint="3-20 位，仅限小写字母、数字、下划线或连字符，以字母或数字开头"
              >
                <input
                  value={form.account}
                  disabled={form.mode === 'edit'}
                  onChange={e => setForm({ ...form, account: e.target.value, error: '' })}
                  style={{
                    ...inputStyle,
                    height: 38,
                    borderRadius: 8,
                    background: form.mode === 'edit' ? '#F9FAFB' : '#fff',
                    color: form.mode === 'edit' ? 'var(--color-text-2)' : 'var(--color-text-1)',
                  }}
                  placeholder="请输入用户名"
                />
              </Field>
              <Field label="邮箱">
                <input
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value, error: '' })}
                  style={{ ...inputStyle, height: 38, borderRadius: 8 }}
                  placeholder="选填"
                />
              </Field>
              <Field
                label="归属部门"
                required
                span
                hint={form.mode === 'edit' && form.userId && unassignedIds.has(form.userId)
                  ? '原部门已不存在，请重新选择有效的归属部门'
                  : undefined}
              >
                <select
                  value={form.orgId}
                  onChange={e => setForm({ ...form, orgId: e.target.value, error: '' })}
                  style={{ ...inputStyle, height: 38, borderRadius: 8 }}
                >
                  {orgOptions.map(o => <option key={o.id} value={o.id}>{orgPathLabel(scopedOrgs, o.id)}</option>)}
                </select>
              </Field>
            </div>

            {/* 2. 分配角色 */}
            {isTenant && grantableRoles.length > 0 && (
              <div style={{ borderTop: '1px solid #F1F3F5', paddingTop: 16, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--color-text-2)' }}>
                    分配角色<span style={{ color: '#C73A3A', marginLeft: 2 }}>*</span>
                  </span>
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)' }}>
                    {form.roleIds.length > 0 ? `已选 ${form.roleIds.length} 项` : '必选 · 可多选'}
                  </span>
                </div>
                <MultiSelect
                  label="分配角色"
                  options={roleOptions}
                  value={form.roleIds}
                  onChange={roleIds => setForm({ ...form, roleIds, error: '' })}
                  placeholder="请选择角色（必选）"
                />
              </div>
            )}

            {/* 3. 负责地区（必选；常规区块，大区直选 + 按需展开省份微调，随弹窗自然滚动） */}
            {showRegions && (
              <div style={{ borderTop: '1px solid #F1F3F5', paddingTop: 16, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--color-text-2)' }}>
                      负责地区<span style={{ color: '#C73A3A', marginLeft: 2 }}>*</span>
                    </span>
                    <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)' }}>
                      {form.regions.includes(REGION_NATIONWIDE)
                        ? '全国不限'
                        : form.regions.length > 0
                          ? `已选 ${summarizeRegions(form.regions).join('、')}`
                          : '必选 · 可多选'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      onClick={() => setShowProvinceGrid(v => !v)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 'var(--fs-12)',
                        fontWeight: 500,
                        color: 'var(--color-brand)',
                        cursor: 'pointer',
                      }}
                    >
                      {showProvinceGrid ? '收起省份' : '按省份微调'}
                    </button>
                  </div>
                </div>

                {/* 大区一键直选条 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {REGION_PRESETS.map(preset => {
                    const isNationwide = form.regions.includes(REGION_NATIONWIDE);
                    const selected = preset.label === '全国'
                      ? isNationwide
                      : !isNationwide && preset.provinces.every(p => form.regions.includes(p));
                    const partial = preset.label !== '全国'
                      && !isNationwide
                      && !selected
                      && preset.provinces.some(p => form.regions.includes(p));
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => togglePreset(preset)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          fontSize: 'var(--fs-12)',
                          fontWeight: 500,
                          cursor: 'pointer',
                          border: selected
                            ? '1px solid var(--color-brand)'
                            : partial
                              ? '1px solid #99D5C6'
                              : '1px solid var(--color-border)',
                          background: selected
                            ? 'var(--color-brand-subtle)'
                            : partial
                              ? '#F2FAF7'
                              : '#FFFFFF',
                          color: selected || partial ? 'var(--color-brand)' : 'var(--color-text-1)',
                          transition: 'all 120ms ease',
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* 按需原地展开的省份网格（内联流式，随弹窗滚动，不裁切） */}
                {showProvinceGrid && (
                  <div style={{
                    background: '#FAFBFC',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 10,
                  }}>
                    <div style={{ position: 'relative', width: 220 }}>
                      <Search
                        size={14}
                        aria-hidden
                        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }}
                      />
                      <input
                        value={regionSearch}
                        onChange={e => setRegionSearch(e.target.value)}
                        placeholder="搜索省份"
                        style={{ ...inputStyle, height: 32, paddingLeft: 30, borderRadius: 8 }}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {REGION_PRESETS.slice(1).map(group => {
                        const q = regionSearch.trim();
                        const matchGroup = !q || group.label.includes(q);
                        const visibleProvinces = matchGroup
                          ? group.provinces
                          : group.provinces.filter(p => p.includes(q));
                        if (visibleProvinces.length === 0) return null;
                        const isNationwide = form.regions.includes(REGION_NATIONWIDE);
                        return (
                          <div
                            key={group.label}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '52px minmax(0, 1fr)',
                              gap: 8,
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--color-text-3)', fontWeight: 500 }}>
                              {group.label}
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {visibleProvinces.map(province => {
                                const checked = isNationwide || form.regions.includes(province);
                                return (
                                  <button
                                    key={province}
                                    type="button"
                                    onClick={() => toggleProvince(province)}
                                    style={{
                                      padding: '3px 9px',
                                      borderRadius: 6,
                                      fontSize: 'var(--fs-12)',
                                      fontWeight: checked ? 500 : 400,
                                      cursor: 'pointer',
                                      border: checked ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
                                      background: checked ? 'var(--color-brand-subtle)' : '#FFFFFF',
                                      color: checked ? 'var(--color-brand)' : 'var(--color-text-1)',
                                      transition: 'all 120ms ease',
                                    }}
                                  >
                                    {province}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {freezing && (
        <ConfirmDialog
          open
          title="停用账号"
          description={`确定停用「${freezing.name}」吗？`}
          impact={[
            '停用后该成员将无法登录本企业；已分配的角色与负责地区会保留，可随时重新启用。',
            freezingDepts.length > 0
              ? `该成员担任「${freezingDepts.join('、')}」负责人，请提前安排好工作交接。`
              : '',
          ].filter(Boolean).join(' ')}
          confirmLabel="确认停用"
          variant="warning"
          onConfirm={confirmFreeze}
          onCancel={() => setFreezing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title="删除用户"
          description={`确定删除用户「${deleting.name}」吗？`}
          confirmLabel="确认删除"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

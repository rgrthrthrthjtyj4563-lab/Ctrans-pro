import { useMemo, useState } from 'react';
import { CalendarClock, Ban } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatusTag } from '../components/StatusTag';
import { Pagination } from '../components/Pagination';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { MetricCard } from '../components/MetricCard';
import { FieldGroup, FieldItem } from '../components/DetailDrawer';
import type { ToastMessage } from '../components/Toast';
import type { Representative, RepresentativeStatus, Role } from '../types';
import {
  CURRENT_PLEDGE_TEMPLATE,
  EDU_OPTIONS,
  MED_MAJORS,
  daysUntil,
  emptyRepresentative,
  maskIdNo,
  maskMobile,
  seedVendors,
  vendorNameOf,
} from '../data/complianceData';
import { usePermission } from '../context/PermissionContext';
import { useRepFiling } from '../context/RepFilingContext';
import { Field, inputStyle, nowText, today } from './complianceUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole?: Role;
}

const PAGE_SIZE = 10;
const REP_STATUSES: RepresentativeStatus[] = ['待审核', '已驳回', '已备案', '已停用'];
const EXPIRY_WINDOW = 30;

function plusOneYear(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 备案到期情形：仅对已备案且有到期日的代表有意义 */
function expiryOf(rep: Representative): { days: number | null; expiring: boolean; expired: boolean } {
  if (rep.status !== '已备案' || !rep.filingValidUntil) return { days: null, expiring: false, expired: false };
  const days = daysUntil(rep.filingValidUntil);
  return {
    days,
    expiring: days !== null && days >= 0 && days <= EXPIRY_WINDOW,
    expired: days !== null && days < 0,
  };
}

export function RepFilingManage({ addToast }: Props) {
  const { can, principal, users } = usePermission();
  const isCompliance = can('rep-filing', 'approve');
  const canWrite = can('rep-filing', 'create') || can('rep-filing', 'edit');
  const canSeeFullId = isCompliance;

  const { reps: rows, updateRep } = useRepFiling();
  const [vendors] = useState(() => seedVendors.map((v) => ({ ...v })));

  function accountOf(userId: string | null): string {
    if (!userId) return '';
    return users.find((u) => u.id === userId)?.account ?? '';
  }
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});

  const [detail, setDetail] = useState<Representative | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyRepresentative());
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [reviewTarget, setReviewTarget] = useState<Representative | null>(null);
  const [review, setReview] = useState({ filingNo: '', filingReceipt: '', validUntil: '', reason: '' });

  const [stopTarget, setStopTarget] = useState<Representative | null>(null);
  const [stop, setStop] = useState({ reason: '离职', note: '' });

  const stats = useMemo(() => {
    let expiring = 0;
    let expired = 0;
    rows.forEach((r) => {
      const e = expiryOf(r);
      if (e.expiring) expiring += 1;
      if (e.expired) expired += 1;
    });
    return { expiring, expired };
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (applied.name && !r.name.includes(applied.name) && !r.idNo.includes(applied.name)) return false;
    if (applied.status && r.status !== applied.status) return false;
    if (applied.provider && (r.providerId || '') !== applied.provider) return false;
    if (applied.expiry) {
      const e = expiryOf(r);
      if (applied.expiry === '30天内到期' && !e.expiring) return false;
      if (applied.expiry === '已到期' && !e.expired) return false;
    }
    return true;
  }), [rows, applied]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function patch(id: string, updater: (r: Representative) => Representative) {
    updateRep(id, updater);
    setDetail((d) => (d && d.id === id ? updater(d) : d));
  }

  function op(action: string, note?: string): Representative['operations'] {
    return [{ at: nowText(), by: principal.name, action, note }];
  }

  const providerOptions = vendors.map((v) => ({ value: v.id, label: v.name }));
  const filterFields = [
    { id: 'name', label: '姓名 / 证件号', type: 'text' as const, placeholder: '姓名或证件号' },
    { id: 'status', label: '状态', type: 'select' as const, options: [{ value: '', label: '全部' }, ...REP_STATUSES.map((s) => ({ value: s, label: s }))] },
    { id: 'provider', label: '所属服务商', type: 'select' as const, options: [{ value: '', label: '全部' }, ...providerOptions] },
    { id: 'expiry', label: '备案到期', type: 'select' as const, options: [{ value: '', label: '全部' }, { value: '30天内到期', label: '30 天内到期' }, { value: '已到期', label: '已到期' }] },
  ];

  function setF<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openEdit(r: Representative) {
    const { id: _id, ...rest } = r;
    setEditingId(r.id);
    setForm(rest);
    setFormError('');
    setFormOpen(true);
  }

  function missingFields(f: typeof form): string[] {
    const miss: string[] = [];
    if (!f.name) miss.push('姓名');
    if (!f.photoFile) miss.push('照片');
    if (!f.idNo) miss.push('证件号');
    if (!f.mobile) miss.push('手机号');
    if (!f.email) miss.push('邮箱');
    if (f.employmentType === '服务商派遣' && !f.providerId) miss.push('所属服务商');
    if (!f.employStart || !f.employEnd) miss.push('合同起止日期');
    if (!EDU_OPTIONS.includes(f.education)) miss.push('学历须大专及以上');
    if (!f.major) miss.push('专业');
    if (!f.school) miss.push('毕业院校');
    if (!f.eduProof) miss.push('学历证明');
    if (!f.pledgeDate || !f.pledgeFile) miss.push('合规承诺');
    return miss;
  }

  function saveForm() {
    const miss = missingFields(form);
    if (miss.length) {
      setFormError(`仍缺必填项：${miss.join('、')}`);
      return;
    }
    const dup = rows.find((r) => r.idNo === form.idNo && r.id !== editingId);
    if (dup) {
      setFormError(`证件号唯一，已存在于 ${dup.id} ${dup.name}`);
      return;
    }
    const providerName = form.employmentType === 'MAH直聘' ? 'MAH直聘' : vendorNameOf(vendors, form.providerId);
    if (!editingId) return;
    const was = rows.find((r) => r.id === editingId);
    const wasFiled = was?.status === '已备案';
    patch(editingId, (r) => ({
      ...r,
      ...form,
      provider: providerName,
      providerId: form.employmentType === 'MAH直聘' ? null : form.providerId,
      status: wasFiled ? '已备案' : '待审核',
      reviewNote: wasFiled ? r.reviewNote : undefined,
      operations: wasFiled
        ? [...op('修改备案信息', '信息已变更，需在 30 日内在国家平台同步变更'), ...r.operations]
        : [...op('重新提交审核'), ...r.operations],
    }));
    addToast(
      wasFiled
        ? { type: 'info', title: '备案信息已修改', description: '请在 30 日内到国家备案平台同步变更' }
        : { type: 'success', title: '已重新提交审核', description: form.name },
    );
    setFormOpen(false);
  }

  function openReview(r: Representative) {
    setReviewTarget(r);
    setReview({ filingNo: '', filingReceipt: '', validUntil: plusOneYear(today()), reason: '' });
  }

  function approveReview() {
    if (!reviewTarget) return;
    if (!review.filingNo.trim() || !review.filingReceipt.trim() || !review.validUntil) {
      addToast({ type: 'warning', title: '通过前须回填备案号、备案回执与备案到期日' });
      return;
    }
    const target = reviewTarget;
    patch(target.id, (r) => ({
      ...r,
      filingNo: review.filingNo.trim(),
      filingReceipt: review.filingReceipt.trim(),
      filingValidUntil: review.validUntil,
      filingApprovedAt: nowText(),
      filingApprovedBy: principal.name,
      status: '已备案',
      reviewNote: undefined,
      operations: [...op('审核通过', `备案号 ${review.filingNo.trim()}，有效期至 ${review.validUntil}`), ...r.operations],
    }));
    addToast({ type: 'success', title: '审核通过，备案已登记', description: `${target.name} · ${review.filingNo.trim()}` });
    setReviewTarget(null);
  }

  function rejectReview() {
    if (!reviewTarget) return;
    if (!review.reason.trim()) {
      addToast({ type: 'warning', title: '请填写驳回原因' });
      return;
    }
    const target = reviewTarget;
    patch(target.id, (r) => ({
      ...r,
      status: '已驳回',
      reviewNote: review.reason.trim(),
      operations: [...op('驳回', review.reason.trim()), ...r.operations],
    }));
    addToast({ type: 'warning', title: '已驳回', description: `${target.name}，可修改后重新提交` });
    setReviewTarget(null);
  }

  function confirmStop() {
    if (!stopTarget) return;
    const target = stopTarget;
    patch(target.id, (r) => ({
      ...r,
      status: '已停用',
      stopReason: stop.note.trim() ? `${stop.reason}：${stop.note.trim()}` : stop.reason,
      operations: [...op('停用', stop.reason), ...r.operations],
    }));
    addToast({ type: 'warning', title: '代表已停用', description: '请在 30 日内到国家备案平台注销该代表备案' });
    setStopTarget(null);
  }

  const current = detail ? (rows.find((r) => r.id === detail.id) ?? detail) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="医药代表备案管理"
        description="药厂侧代表备案台账与到期提醒。人员新增请前往「系统管理 → 用户与组织」新建用户并分配「服务专员」角色。"
        dataRange="本企业全部代表"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '320px', marginBottom: 12 }}>
          <MetricCard
            compact
            title="备案到期提醒"
            value={stats.expiring + stats.expired}
            unit="人"
            subtitle={`30 天内到期 ${stats.expiring} · 已过期 ${stats.expired}`}
            icon={CalendarClock}
            iconColor={stats.expired ? '#C73A3A' : '#C77A16'}
            iconBg={stats.expired ? '#FEECEC' : '#FEF3E2'}
            urgency={stats.expired ? 'danger' : stats.expiring ? 'warning' : 'normal'}
            onClick={() => {
              const next = { expiry: stats.expired > 0 ? '已到期' : '30天内到期' };
              setFilters(next);
              setApplied(next);
              setPage(1);
            }}
          />
        </div>

        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={(id, val) => setFilters((p) => ({ ...p, [id]: val }))}
          onSearch={() => { setApplied(filters); setPage(1); }}
          onReset={() => { setFilters({}); setApplied({}); setPage(1); }}
          stats={<span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>共 <strong style={{ color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 名代表</span>}
        />

        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>
                  {['代表', '证件号', '雇佣 / 服务商', '备案号', '备案到期', '状态', '操作'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 0 }}><EmptyState title="暂无代表" description="调整筛选或新建代表档案" /></td></tr>
                ) : pageData.map((r, idx) => {
                  const e = expiryOf(r);
                  return (
                    <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>
                          {r.id}{accountOf(r.userId) ? ` · ${accountOf(r.userId)}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top', fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)', color: '#667085' }}>
                        {canSeeFullId ? r.idNo : maskIdNo(r.idNo)}
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        <div>{r.employmentType}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{r.providerId ? r.provider : r.mah}</div>
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top', fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)' }}>{r.filingNo || '—'}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        {r.status === '已备案' && r.filingValidUntil ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)', color: e.expired ? '#C73A3A' : '#374151' }}>{r.filingValidUntil}</span>
                            {e.expired && <StatusTag status="已过期" size="sm" />}
                            {!e.expired && e.expiring && <StatusTag status="即将到期" size="sm" />}
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}><StatusTag status={r.status} /></td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <Button variant="ghost" size="sm" onClick={() => setDetail(r)}>查看</Button>
                          {canWrite && ['待审核', '已驳回', '已备案'].includes(r.status) && (
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>编辑</Button>
                          )}
                          {isCompliance && r.status === '待审核' && (
                            <Button variant="ghost" size="sm" onClick={() => openReview(r)}>审核</Button>
                          )}
                          {isCompliance && r.status === '已备案' && (
                            <Button variant="ghost" size="sm" onClick={() => { setStopTarget(r); setStop({ reason: '离职', note: '' }); }}>停用</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 16px' }}>
            {pageData.length > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />}
          </div>
        </div>
      </div>

      <Modal open={!!current} title={current ? `代表档案 · ${current.name}` : ''} onClose={() => setDetail(null)} width={720} footer={
        <>
          <Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>
          {canWrite && ['待审核', '已驳回', '已备案'].includes(current?.status ?? '') && current && (
            <Button variant="secondary" onClick={() => { openEdit(current); setDetail(null); }}>编辑</Button>
          )}
        </>
      }>
        {current && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <StatusTag status={current.status} />
              {current.status === '已备案' && current.filingValidUntil && expiryOf(current).expired && <StatusTag status="已过期" size="sm" />}
              {current.status === '已备案' && current.filingValidUntil && expiryOf(current).expiring && !expiryOf(current).expired && <StatusTag status="即将到期" size="sm" />}
              <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{current.id} · 关联账号 {accountOf(current.userId) || '—'}</span>
            </div>
            <FieldGroup title="基本信息">
              <FieldItem label="姓名" value={current.name} />
              <FieldItem label="性别" value={current.gender} />
              <FieldItem label="照片" value={current.photoFile || '—'} />
              <FieldItem label="证件号" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{canSeeFullId ? current.idNo : maskIdNo(current.idNo)}</span>} />
              <FieldItem label="手机号" value={canSeeFullId ? current.mobile : maskMobile(current.mobile)} />
              <FieldItem label="邮箱" value={current.email} />
            </FieldGroup>
            <FieldGroup title="雇佣关系">
              <FieldItem label="雇佣类型" value={current.employmentType} />
              <FieldItem label="所属 MAH" value={`${current.mah}（${current.mahId}）`} />
              <FieldItem label="服务商" value={current.providerId ? `${current.provider}（${current.providerId}）` : 'MAH直聘'} />
              <FieldItem label="合同起止" value={current.employStart && current.employEnd ? `${current.employStart} ~ ${current.employEnd}` : '—'} />
            </FieldGroup>
            <FieldGroup title="资质与承诺">
              <FieldItem label="学历 / 专业" value={`${current.education} · ${current.major}`} />
              <FieldItem label="毕业院校" value={current.school} />
              <FieldItem label="学历证明" value={current.eduProof || '—'} />
              <FieldItem label="承诺书" value={`${current.pledgeVersion} · ${current.pledgeDate || '—'} · ${current.pledgeFile || '—'}`} span />
            </FieldGroup>
            <FieldGroup title="国家备案">
              <FieldItem label="备案号" value={current.filingNo || '待取得'} />
              <FieldItem label="备案回执" value={current.filingReceipt || '—'} />
              <FieldItem label="备案到期" value={current.filingValidUntil || '—'} />
              <FieldItem label="审核通过" value={current.filingApprovedAt ? `${current.filingApprovedBy} · ${current.filingApprovedAt}` : '—'} />
              {current.reviewNote && <FieldItem label="驳回原因" value={current.reviewNote} span />}
              {current.stopReason && <FieldItem label="停用原因" value={current.stopReason} span />}
            </FieldGroup>
            <FieldGroup title="操作记录">
              <div>
                {current.operations.length === 0 ? (
                  <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>暂无记录</div>
                ) : current.operations.map((o, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: 'var(--fs-12)', borderBottom: '1px dashed #F0F1F3' }}>
                    <span style={{ color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{o.at}</span>
                    <span style={{ fontWeight: 600, flexShrink: 0 }}>{o.action}</span>
                    <span style={{ color: '#667085' }}>{o.by}{o.note ? ` · ${o.note}` : ''}</span>
                  </div>
                ))}
              </div>
            </FieldGroup>
          </div>
        )}
      </Modal>

      <Modal open={formOpen} title={editingId ? '编辑代表档案' : '新建代表档案'} onClose={() => setFormOpen(false)} width={720} footer={
        <>
          <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
          <Button variant="primary" onClick={saveForm}>{rows.find((r) => r.id === editingId)?.status === '已备案' ? '保存修改' : '重新提交审核'}</Button>
        </>
      }>
        {formError && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)', marginBottom: 12 }}>{formError}</div>}
        <FieldGroup title="基本信息">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="姓名" required><input value={form.name} onChange={(e) => setF('name', e.target.value)} style={inputStyle} /></Field>
            <Field label="性别" required>
              <select value={form.gender} onChange={(e) => setF('gender', e.target.value as Representative['gender'])} style={inputStyle}><option>男</option><option>女</option></select>
            </Field>
            <Field label="照片" required><input value={form.photoFile} onChange={(e) => setF('photoFile', e.target.value)} placeholder="照片文件名" style={inputStyle} /></Field>
            <Field label="证件号" required><input value={form.idNo} onChange={(e) => setF('idNo', e.target.value)} style={inputStyle} /></Field>
            <Field label="手机号" required><input value={form.mobile} onChange={(e) => setF('mobile', e.target.value)} style={inputStyle} /></Field>
            <Field label="邮箱" required><input value={form.email} onChange={(e) => setF('email', e.target.value)} style={inputStyle} /></Field>
          </div>
        </FieldGroup>
        <FieldGroup title="雇佣关系">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="雇佣类型" required>
              <select value={form.employmentType} onChange={(e) => setF('employmentType', e.target.value as Representative['employmentType'])} style={inputStyle}>
                <option>服务商派遣</option><option>MAH直聘</option>
              </select>
            </Field>
            <Field label="所属服务商" required={form.employmentType === '服务商派遣'}>
              <select
                value={form.providerId || ''}
                disabled={form.employmentType === 'MAH直聘'}
                onChange={(e) => setF('providerId', e.target.value || null)}
                style={{ ...inputStyle, background: form.employmentType === 'MAH直聘' ? '#F9FAFB' : undefined }}
              >
                <option value="">请选择</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="合同开始" required><input type="date" value={form.employStart} onChange={(e) => setF('employStart', e.target.value)} style={inputStyle} /></Field>
            <Field label="合同结束" required><input type="date" value={form.employEnd} onChange={(e) => setF('employEnd', e.target.value)} style={inputStyle} /></Field>
          </div>
        </FieldGroup>
        <FieldGroup title="资质与合规承诺">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="学历" required>
              <select value={form.education} onChange={(e) => setF('education', e.target.value)} style={inputStyle}>
                {EDU_OPTIONS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="专业" required>
              <select value={form.major} onChange={(e) => setF('major', e.target.value)} style={inputStyle}>
                <option value="">请选择</option>
                {MED_MAJORS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="毕业院校" required><input value={form.school} onChange={(e) => setF('school', e.target.value)} style={inputStyle} /></Field>
            <Field label="学历证明" required><input value={form.eduProof} onChange={(e) => setF('eduProof', e.target.value)} placeholder="附件文件名" style={inputStyle} /></Field>
            <Field label="承诺书版本"><input value={CURRENT_PLEDGE_TEMPLATE} disabled style={{ ...inputStyle, color: '#667085', background: '#F9FAFB' }} /></Field>
            <Field label="签署日期" required><input type="date" value={form.pledgeDate} onChange={(e) => setF('pledgeDate', e.target.value)} style={inputStyle} /></Field>
            <Field label="承诺附件" required><input value={form.pledgeFile} onChange={(e) => setF('pledgeFile', e.target.value)} placeholder="附件文件名" style={inputStyle} /></Field>
          </div>
        </FieldGroup>
      </Modal>

      <Modal open={!!reviewTarget} title={reviewTarget ? `审核 · ${reviewTarget.name}` : ''} onClose={() => setReviewTarget(null)} width={640} footer={
        <>
          <Button variant="outline" onClick={() => setReviewTarget(null)}>取消</Button>
          <Button variant="danger" icon={<Ban size={14} />} onClick={rejectReview}>驳回</Button>
          <Button variant="primary" onClick={approveReview}>通过并登记备案</Button>
        </>
      }>
        {reviewTarget && (
          <div>
            <FieldGroup title="档案摘要">
              <FieldItem label="证件号" value={canSeeFullId ? reviewTarget.idNo : maskIdNo(reviewTarget.idNo)} />
              <FieldItem label="学历 / 专业" value={`${reviewTarget.education} · ${reviewTarget.major}`} />
              <FieldItem label="雇佣 / 服务商" value={`${reviewTarget.employmentType} · ${reviewTarget.provider}`} />
              <FieldItem label="合同起止" value={`${reviewTarget.employStart} ~ ${reviewTarget.employEnd}`} />
              <FieldItem label="承诺书" value={`${reviewTarget.pledgeVersion} · ${reviewTarget.pledgeDate}`} span />
            </FieldGroup>
            <FieldGroup title="通过：登记国家备案结果">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="国家备案号" required span><input value={review.filingNo} onChange={(e) => setReview((s) => ({ ...s, filingNo: e.target.value }))} placeholder="备案专员在国家平台提交后取得" style={inputStyle} /></Field>
                <Field label="备案回执" required span><input value={review.filingReceipt} onChange={(e) => setReview((s) => ({ ...s, filingReceipt: e.target.value }))} placeholder="备案信息表或回执文件名" style={inputStyle} /></Field>
                <Field label="备案到期日" required span><input type="date" value={review.validUntil} onChange={(e) => setReview((s) => ({ ...s, validUntil: e.target.value }))} style={inputStyle} /></Field>
              </div>
            </FieldGroup>
            <FieldGroup title="驳回">
              <Field label="驳回原因" required><textarea value={review.reason} onChange={(e) => setReview((s) => ({ ...s, reason: e.target.value }))} rows={3} style={{ ...inputStyle, height: 'auto', padding: 10 }} placeholder="填写后点击「驳回」" /></Field>
            </FieldGroup>
          </div>
        )}
      </Modal>

      <Modal open={!!stopTarget} title={stopTarget ? `停用 · ${stopTarget.name}` : ''} onClose={() => setStopTarget(null)} width={480} footer={
        <>
          <Button variant="outline" onClick={() => setStopTarget(null)}>取消</Button>
          <Button variant="danger" onClick={confirmStop}>确认停用</Button>
        </>
      }>
        <Field label="停用原因" required>
          <select value={stop.reason} onChange={(e) => setStop((s) => ({ ...s, reason: e.target.value }))} style={inputStyle}>
            <option>离职</option><option>停止授权</option><option>其他</option>
          </select>
        </Field>
        <div style={{ height: 10 }} />
        <Field label="补充说明"><textarea value={stop.note} onChange={(e) => setStop((s) => ({ ...s, note: e.target.value }))} rows={3} style={{ ...inputStyle, height: 'auto', padding: 10 }} /></Field>
        <div style={{ marginTop: 12, padding: '8px 10px', background: '#FEF3E2', borderRadius: 6, fontSize: 'var(--fs-12)', color: '#C77A16' }}>
          停用后不可恢复为已备案；请在 30 日内到国家备案平台注销该代表备案。
        </div>
      </Modal>
    </div>
  );
}

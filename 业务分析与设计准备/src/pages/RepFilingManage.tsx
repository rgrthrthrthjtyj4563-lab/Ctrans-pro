import { useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarClock, ExternalLink, FileCheck, Plus, RefreshCw, Upload, UserX } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatusTag, Tag } from '../components/StatusTag';
import { Pagination } from '../components/Pagination';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { MetricCard } from '../components/MetricCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FieldGroup, FieldItem } from '../components/DetailDrawer';
import { FileChip } from './vendor-access/shared';
import type { ToastMessage } from '../components/Toast';
import type { Representative, Role, TrainingLink, TrainingRecord } from '../types';
import {
  CURRENT_PLEDGE_TEMPLATE,
  EDU_OPTIONS,
  MED_MAJORS,
  PLATFORM_FILING_TRUTH,
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
const EXPIRY_WINDOW = 30;

/** 台账展示态：存储态（未备案 / 已备案 / 已注销）+ 按授权截止日期推导的 即将到期 / 已过期 */
const LEDGER_STATUSES = ['已备案', '即将到期', '已过期', '未备案', '已注销'] as const;
type LedgerStatus = (typeof LEDGER_STATUSES)[number];

interface UploadForm {
  kind: '考核' | '培训';
  title: string;
  repIds: string[];
  date: string;
  note: string;
  files: string[];
  links: TrainingLink[];
}

function plusOneYear(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function displayStatusOf(rep: Representative): LedgerStatus {
  if (rep.status === '未备案') return '未备案';
  if (rep.status === '已注销') return '已注销';
  if (rep.filingValidUntil) {
    const days = daysUntil(rep.filingValidUntil);
    if (days !== null && days < 0) return '已过期';
    if (days !== null && days <= EXPIRY_WINDOW) return '即将到期';
  }
  return '已备案';
}

function allocTrainingId(records: TrainingRecord[]): string {
  const max = records.reduce((m, r) => {
    const n = Number(r.id.replace(/^TR-/, ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `TR-${String(max + 1).padStart(3, '0')}`;
}

const emptyUpload = (): UploadForm => ({ kind: '考核', title: '', repIds: [], date: today(), note: '', files: [], links: [] });

export function RepFilingManage({ addToast }: Props) {
  const { can, principal, users } = usePermission();
  const canWrite = can('rep-filing', 'create') || can('rep-filing', 'edit');
  const canSeeFullId = can('rep-filing', 'edit');

  const { reps: rows, updateRep, trainingRecords, addTrainingRecord, removeTrainingRecord } = useRepFiling();
  const [vendors] = useState(() => seedVendors.map((v) => ({ ...v })));

  const [activeTab, setActiveTab] = useState<'ledger' | 'training'>('ledger');

  function accountOf(userId: string | null): string {
    if (!userId) return '';
    return users.find((u) => u.id === userId)?.account ?? '';
  }

  // ===== 备案台账 =====
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);

  const [detail, setDetail] = useState<Representative | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyRepresentative());
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [deadlineTarget, setDeadlineTarget] = useState<Representative | null>(null);
  const [deadline, setDeadline] = useState('');

  // ===== 考核培训留底 =====
  const [tPage, setTPage] = useState(1);
  const [tFilters, setTFilters] = useState<Record<string, string>>({});
  const [tApplied, setTApplied] = useState<Record<string, string>>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [upload, setUpload] = useState<UploadForm>(emptyUpload);
  const [uploadError, setUploadError] = useState('');
  const [repSearch, setRepSearch] = useState('');
  const [trainingDetail, setTrainingDetail] = useState<TrainingRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrainingRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const lastSyncAt = useMemo(
    () => rows.reduce((m, r) => (r.syncedAt && r.syncedAt > m ? r.syncedAt : m), ''),
    [rows],
  );

  const stats = useMemo(() => {
    const s: Record<LedgerStatus, number> = { '已备案': 0, '即将到期': 0, '已过期': 0, '未备案': 0, '已注销': 0 };
    rows.forEach((r) => { s[displayStatusOf(r)] += 1; });
    return s;
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (applied.name && !r.name.includes(applied.name) && !r.idNo.includes(applied.name)) return false;
    if (applied.status && displayStatusOf(r) !== applied.status) return false;
    return true;
  }), [rows, applied]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const tFiltered = useMemo(() => trainingRecords.filter((rec) => {
    if (tApplied.kind && rec.kind !== tApplied.kind) return false;
    if (tApplied.rep && !rec.repIds.includes(tApplied.rep)) return false;
    if (tApplied.kw && !rec.title.includes(tApplied.kw) && !(rec.note ?? '').includes(tApplied.kw)) return false;
    return true;
  }), [trainingRecords, tApplied]);

  const tPageData = tFiltered.slice((tPage - 1) * PAGE_SIZE, tPage * PAGE_SIZE);

  function patch(id: string, updater: (r: Representative) => Representative) {
    updateRep(id, updater);
    setDetail((d) => (d && d.id === id ? updater(d) : d));
  }

  function op(action: string, note?: string): Representative['operations'] {
    return [{ at: nowText(), by: principal.name, action, note }];
  }

  /** 同步备案状态：按国家平台真值表收敛（模拟联查 700ms），状态有变化才记操作记录 */
  function runSync() {
    if (syncing) return;
    setSyncing(true);
    window.setTimeout(() => {
      const stamp = nowText();
      let changed = 0;
      rows.forEach((r) => {
        const truth = PLATFORM_FILING_TRUTH[r.id] ?? { status: '未备案' as const };
        updateRep(r.id, (prev) => {
          const next = { ...prev, syncedAt: stamp };
          if (truth.status === '已备案' && prev.status !== '已备案') {
            changed += 1;
            return {
              ...next,
              status: '已备案' as const,
              filingNo: truth.filingNo ?? prev.filingNo,
              filingValidUntil: prev.filingValidUntil || plusOneYear(today()),
              operations: [
                { at: stamp, by: '系统', action: '同步备案状态', note: `国家平台已备案，备案号 ${truth.filingNo ?? ''}，授权截止日期默认 +1 年，可手动调整` },
                ...prev.operations,
              ],
            };
          }
          if (truth.status === '已注销' && prev.status !== '已注销') {
            changed += 1;
            return {
              ...next,
              status: '已注销' as const,
              operations: [{ at: stamp, by: '系统', action: '同步备案状态', note: '国家平台显示已注销' }, ...prev.operations],
            };
          }
          return next;
        });
      });
      setSyncing(false);
      addToast({
        type: 'success',
        title: '备案状态已同步',
        description: changed > 0 ? `${changed} 名专员状态有更新（新备案已自动带出备案号）` : '国家平台备案状态无变化',
      });
    }, 700);
  }

  const filterFields = [
    { id: 'name', label: '姓名 / 身份证号', type: 'text' as const, placeholder: '姓名或身份证号' },
    { id: 'status', label: '备案状态', type: 'select' as const, options: [{ value: '', label: '全部' }, ...LEDGER_STATUSES.map((s) => ({ value: s, label: s }))] },
  ];

  const repOptions = rows.map((r) => ({ value: r.id, label: r.name }));
  const tFilterFields = [
    { id: 'kind', label: '类型', type: 'select' as const, options: [{ value: '', label: '全部' }, { value: '考核', label: '考核' }, { value: '培训', label: '培训' }] },
    { id: 'rep', label: '专员', type: 'select' as const, options: [{ value: '', label: '全部' }, ...repOptions] },
    { id: 'kw', label: '关键词', type: 'text' as const, placeholder: '标题或说明' },
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

  function openDeadline(r: Representative) {
    setDeadlineTarget(r);
    setDeadline(r.filingValidUntil || plusOneYear(today()));
  }

  function missingFields(f: typeof form): string[] {
    const miss: string[] = [];
    if (!f.name) miss.push('姓名');
    if (!f.photoFile) miss.push('照片');
    if (!f.idNo) miss.push('身份证号');
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
      setFormError(`身份证号唯一，已存在于 ${dup.id} ${dup.name}`);
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
      operations: wasFiled
        ? [...op('修改备案信息', '信息已变更，需在 30 日内在国家平台同步变更'), ...r.operations]
        : [...op('修改留底信息'), ...r.operations],
    }));
    addToast(
      wasFiled
        ? { type: 'info', title: '备案信息已修改', description: '请在 30 日内到国家备案平台同步变更' }
        : { type: 'success', title: '留底信息已保存', description: form.name },
    );
    setFormOpen(false);
  }

  function saveDeadline() {
    if (!deadlineTarget) return;
    if (!deadline) {
      addToast({ type: 'warning', title: '请选择授权截止日期' });
      return;
    }
    const target = deadlineTarget;
    patch(target.id, (r) => ({
      ...r,
      filingValidUntil: deadline,
      operations: [...op('设置授权截止日期', `授权截止日期设为 ${deadline}`), ...r.operations],
    }));
    addToast({ type: 'success', title: '授权截止日期已保存', description: `${target.name} · ${deadline}，到期前 30 天将自动提醒` });
    setDeadlineTarget(null);
  }

  // ===== 考核培训留底：上传 / 删除 =====
  function openUpload() {
    setUpload(emptyUpload());
    setUploadError('');
    setRepSearch('');
    setUploadOpen(true);
  }

  function toggleRep(id: string) {
    setUpload((u) => ({
      ...u,
      repIds: u.repIds.includes(id) ? u.repIds.filter((x) => x !== id) : [...u.repIds, id],
    }));
  }

  function setLink(i: number, key: keyof TrainingLink, value: string) {
    setUpload((u) => ({ ...u, links: u.links.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)) }));
  }

  function submitUpload() {
    const u = upload;
    const fail = (error: string) => setUploadError(error);
    if (!u.title.trim()) return fail('请填写标题');
    if (u.repIds.length === 0) return fail('请选择涉及的专员');
    if (!u.date) return fail('请选择完成日期');
    const badLink = u.links.some((l) => (l.name.trim() || l.url.trim()) && !(l.name.trim() && l.url.trim()));
    if (badLink) return fail('链接附件须同时填写名称与地址（未填完整的行请补全或删除）');
    const validLinks = u.links.filter((l) => l.name.trim() && l.url.trim());
    if (u.files.length === 0 && validLinks.length === 0) return fail('请至少上传一个文档附件或填写一个链接附件');
    const record: TrainingRecord = {
      id: allocTrainingId(trainingRecords),
      kind: u.kind,
      title: u.title.trim(),
      repIds: u.repIds,
      date: u.date,
      note: u.note.trim() || undefined,
      files: u.files,
      links: validLinks.map((l) => ({ name: l.name.trim(), url: l.url.trim() })),
      uploadedBy: principal.name,
      uploadedAt: nowText(),
    };
    addTrainingRecord(record);
    addToast({ type: 'success', title: '留底记录已上传', description: `${record.title} · ${record.repIds.length} 名专员` });
    setUploadOpen(false);
  }

  function nameOf(repId: string): string {
    return rows.find((r) => r.id === repId)?.name ?? repId;
  }

  function repsLabel(repIds: string[]): string {
    if (repIds.length <= 2) return repIds.map(nameOf).join('、');
    return `${nameOf(repIds[0])}、${nameOf(repIds[1])} 等 ${repIds.length} 人`;
  }

  const current = detail ? (rows.find((r) => r.id === detail.id) ?? detail) : null;
  const currentTrainings = useMemo(
    () => (current ? trainingRecords.filter((rec) => rec.repIds.includes(current.id)) : []),
    [current, trainingRecords],
  );
  const repSearchHit = repSearch.trim()
    ? rows.filter((r) => r.name.includes(repSearch.trim()) || r.id.toLowerCase().includes(repSearch.trim().toLowerCase()))
    : rows;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="医药代表备案管理"
        description="备案由药厂在国家备案平台操作，本系统留底并实时同步备案状态；人员新增请前往「系统管理 → 用户与组织」。"
        dataRange="本企业全部代表"
        updatedAt={activeTab === 'ledger' ? (lastSyncAt ? `最近同步 ${lastSyncAt}` : '尚未同步') : undefined}
        tabs={[
          { id: 'ledger', label: '备案台账', count: rows.length },
          { id: 'training', label: '考核培训留底', count: trainingRecords.length },
        ]}
        activeTab={activeTab}
        onTabChange={(t) => { setActiveTab(t as 'ledger' | 'training'); setPage(1); setTPage(1); }}
        actions={activeTab === 'ledger' ? (
          <Button variant="secondary" icon={<RefreshCw size={14} />} loading={syncing} onClick={runSync}>同步备案状态</Button>
        ) : canWrite ? (
          <Button variant="primary" icon={<Plus size={14} />} onClick={openUpload}>上传留底记录</Button>
        ) : undefined}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {activeTab === 'ledger' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
              <MetricCard compact title="已备案" value={stats['已备案']} unit="人" icon={FileCheck} iconColor="#248A5A" iconBg="#E6F5ED"
                onClick={() => { const next = { status: '已备案' }; setFilters(next); setApplied(next); setPage(1); }} />
              <MetricCard compact title="即将到期（30 天内）" value={stats['即将到期']} unit="人" icon={CalendarClock} iconColor="#C77A16" iconBg="#FEF3E2" urgency={stats['即将到期'] ? 'warning' : 'normal'}
                onClick={() => { const next = { status: '即将到期' }; setFilters(next); setApplied(next); setPage(1); }} />
              <MetricCard compact title="已过期" value={stats['已过期']} unit="人" icon={AlertCircle} iconColor="#C73A3A" iconBg="#FEECEC" urgency={stats['已过期'] ? 'danger' : 'normal'}
                onClick={() => { const next = { status: '已过期' }; setFilters(next); setApplied(next); setPage(1); }} />
              <MetricCard compact title="未备案" value={stats['未备案']} unit="人" icon={UserX} iconColor="#667085" iconBg="#F3F4F6"
                onClick={() => { const next = { status: '未备案' }; setFilters(next); setApplied(next); setPage(1); }} />
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
                      {['专员姓名', '身份证号', '备案号', '授权截止日期', '备案状态', '最近同步', '操作'].map((h) => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.length === 0 ? (
                      <tr><td colSpan={7} style={{ padding: 0 }}><EmptyState title="暂无代表" description="调整筛选，或在「系统管理 → 用户与组织」新建服务专员生成留底档案" /></td></tr>
                    ) : pageData.map((r, idx) => {
                      const ds = displayStatusOf(r);
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
                          <td style={{ padding: '10px 12px', verticalAlign: 'top', fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)' }}>{r.filingNo || '—'}</td>
                          <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                            {r.status === '已备案' && r.filingValidUntil ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)', color: ds === '已过期' ? '#C73A3A' : '#374151' }}>{r.filingValidUntil}</span>
                                {ds === '已过期' && <StatusTag status="已过期" size="sm" />}
                                {ds === '即将到期' && <StatusTag status="即将到期" size="sm" />}
                              </div>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', verticalAlign: 'top' }}><StatusTag status={ds} /></td>
                          <td style={{ padding: '10px 12px', verticalAlign: 'top', fontSize: 'var(--fs-11)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{r.syncedAt || '—'}</td>
                          <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              <Button variant="ghost" size="sm" onClick={() => setDetail(r)}>查看</Button>
                              {canWrite && r.status !== '已注销' && (
                                <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>编辑</Button>
                              )}
                              {canWrite && r.status === '已备案' && (
                                <Button variant="ghost" size="sm" onClick={() => openDeadline(r)}>设置截止日期</Button>
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
          </>
        ) : (
          <>
            <FilterBar
              fields={tFilterFields}
              values={tFilters}
              onChange={(id, val) => setTFilters((p) => ({ ...p, [id]: val }))}
              onSearch={() => { setTApplied(tFilters); setTPage(1); }}
              onReset={() => { setTFilters({}); setTApplied({}); setTPage(1); }}
              stats={<span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>共 <strong style={{ color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>{tFiltered.length}</strong> 条留底</span>}
            />

            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr>
                      {['类型', '标题 / 说明', '涉及专员', '完成日期', '附件', '上传人 / 时间', '操作'].map((h) => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 'var(--fs-12)', fontWeight: 600, color: '#667085', background: '#F9FAFB', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tPageData.length === 0 ? (
                      <tr><td colSpan={7} style={{ padding: 0 }}><EmptyState title="暂无留底记录" description="点击右上角「上传留底记录」，上传专员的考核 / 培训材料（文档或链接）" /></td></tr>
                    ) : tPageData.map((rec, idx) => (
                      <tr key={rec.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                          <Tag label={rec.kind} color={rec.kind === '考核' ? 'info' : 'success'} />
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 600 }}>{rec.title}</div>
                          {rec.note && <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 2 }}>{rec.note}</div>}
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top', fontSize: 'var(--fs-13)' }} title={rec.repIds.map(nameOf).join('、')}>
                          {repsLabel(rec.repIds)}
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top', fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)' }}>{rec.date}</td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top', fontSize: 'var(--fs-12)', color: '#667085' }}>
                          {rec.files.length > 0 && <span>{rec.files.length} 文档</span>}
                          {rec.files.length > 0 && rec.links.length > 0 && ' · '}
                          {rec.links.length > 0 && <span>{rec.links.length} 链接</span>}
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                          <div>{rec.uploadedBy}</div>
                          <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{rec.uploadedAt}</div>
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Button variant="ghost" size="sm" onClick={() => setTrainingDetail(rec)}>查看</Button>
                            {canWrite && (
                              <Button variant="ghost" size="sm" style={{ color: '#C73A3A' }} onClick={() => setDeleteTarget(rec)}>删除</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '0 16px' }}>
                {tPageData.length > 0 && <Pagination page={tPage} pageSize={PAGE_SIZE} total={tFiltered.length} onChange={setTPage} />}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 备案留底档案详情 */}
      <Modal open={!!current} title={current ? `代表留底档案 · ${current.name}` : ''} onClose={() => setDetail(null)} width={720} footer={
        <>
          <Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>
          {canWrite && current && current.status !== '已注销' && (
            <Button variant="secondary" onClick={() => { openEdit(current); setDetail(null); }}>编辑</Button>
          )}
        </>
      }>
        {current && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <StatusTag status={displayStatusOf(current)} />
              <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{current.id} · 关联账号 {accountOf(current.userId) || '—'}</span>
            </div>
            <FieldGroup title="基本信息">
              <FieldItem label="姓名" value={current.name} />
              <FieldItem label="性别" value={current.gender} />
              <FieldItem label="照片" value={current.photoFile || '—'} />
              <FieldItem label="身份证号" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{canSeeFullId ? current.idNo : maskIdNo(current.idNo)}</span>} />
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
            <FieldGroup title="备案留底（同步自国家备案平台）">
              <FieldItem label="备案号" value={current.filingNo || '未取得'} />
              <FieldItem label="授权截止日期" value={current.filingValidUntil || '—'} />
              <FieldItem label="备案状态" value={<StatusTag status={displayStatusOf(current)} />} />
              <FieldItem label="最近同步" value={current.syncedAt || '尚未同步'} />
              {current.cancelReason && <FieldItem label="注销原因" value={current.cancelReason} span />}
            </FieldGroup>
            <FieldGroup title="考核培训记录">
              {currentTrainings.length === 0 ? (
                <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>暂无记录，可在「考核培训留底」页签上传</div>
              ) : currentTrainings.map((rec) => (
                <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 'var(--fs-12)', borderBottom: '1px dashed #F0F1F3' }}>
                  <Tag label={rec.kind} color={rec.kind === '考核' ? 'info' : 'success'} />
                  <span style={{ fontWeight: 600 }}>{rec.title}</span>
                  <span style={{ color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{rec.date}</span>
                </div>
              ))}
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

      {/* 编辑留底档案 */}
      <Modal open={formOpen} title={editingId ? '编辑代表留底档案' : ''} onClose={() => setFormOpen(false)} width={720} footer={
        <>
          <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
          <Button variant="primary" onClick={saveForm}>保存留底信息</Button>
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
            <Field label="身份证号" required><input value={form.idNo} onChange={(e) => setF('idNo', e.target.value)} style={inputStyle} /></Field>
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

      {/* 设置授权截止日期 */}
      <Modal open={!!deadlineTarget} title={deadlineTarget ? `设置授权截止日期 · ${deadlineTarget.name}` : ''} onClose={() => setDeadlineTarget(null)} width={520} footer={
        <>
          <Button variant="outline" onClick={() => setDeadlineTarget(null)}>取消</Button>
          <Button variant="primary" onClick={saveDeadline}>保存</Button>
        </>
      }>
        <Field label="授权截止日期" required>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={inputStyle} />
        </Field>
        <div style={{ marginTop: 12, padding: '8px 10px', background: '#FEF3E2', borderRadius: 6, fontSize: 'var(--fs-12)', color: '#C77A16', lineHeight: 1.6 }}>
          国家对医药代表备案无统一有效期年限，请按合同期 / 授权期限填写。到期前 30 天系统自动提醒；停止授权或专员离职后，须在 30 日内到国家平台注销备案。
        </div>
      </Modal>

      {/* 上传考核 / 培训留底记录 */}
      <Modal open={uploadOpen} title="上传考核 / 培训留底记录" onClose={() => setUploadOpen(false)} width={720} footer={
        <>
          <Button variant="outline" onClick={() => setUploadOpen(false)}>取消</Button>
          <Button variant="primary" onClick={submitUpload}>提交留底</Button>
        </>
      }>
        {uploadError && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)', marginBottom: 12 }}>{uploadError}</div>}
        <FieldGroup title="类型与标题">
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
              {(['考核', '培训'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setUpload((u) => ({ ...u, kind: k }))}
                  style={{ padding: '7px 0', flex: 1, fontSize: 'var(--fs-13)', border: 'none', cursor: 'pointer', background: upload.kind === k ? 'var(--color-brand)' : '#fff', color: upload.kind === k ? '#fff' : '#667085' }}>
                  {k}
                </button>
              ))}
            </div>
            <input value={upload.title} onChange={(e) => setUpload((u) => ({ ...u, title: e.target.value }))} placeholder="如：2026 年 Q3 产品知识考核" style={inputStyle} />
          </div>
        </FieldGroup>
        <FieldGroup title="涉及专员（可多选）">
          <div style={{ gridColumn: '1 / -1' }}>
            {upload.repIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>已选 {upload.repIds.length} 人：</span>
                {upload.repIds.map((id) => (
                  <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontWeight: 500 }}>
                    {nameOf(id)}
                    <button type="button" onClick={() => toggleRep(id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-brand)', padding: 0, lineHeight: 1, fontSize: 13 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input value={repSearch} onChange={(e) => setRepSearch(e.target.value)} placeholder="搜索专员姓名" style={{ ...inputStyle, flex: 1 }} />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-13)', color: '#374151', cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}>
                <input
                  type="checkbox"
                  checked={repSearchHit.length > 0 && repSearchHit.every((r) => upload.repIds.includes(r.id))}
                  onChange={() => {
                    const allPicked = repSearchHit.length > 0 && repSearchHit.every((r) => upload.repIds.includes(r.id));
                    setUpload((u) => ({
                      ...u,
                      repIds: allPicked
                        ? u.repIds.filter((id) => !repSearchHit.some((r) => r.id === id))
                        : Array.from(new Set([...u.repIds, ...repSearchHit.map((r) => r.id)])),
                    }));
                  }}
                />
                全选
              </label>
            </div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, maxHeight: 200, overflowY: 'auto' }}>
              {repSearchHit.length === 0 ? (
                <div style={{ padding: 12, fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>未找到匹配的专员</div>
              ) : repSearchHit.map((r) => (
                <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #F3F4F6' }}>
                  <input type="checkbox" checked={upload.repIds.includes(r.id)} onChange={() => toggleRep(r.id)} />
                  <span style={{ fontWeight: 500, fontSize: 'var(--fs-13)' }}>{r.name}</span>
                  <span style={{ marginLeft: 'auto' }}><StatusTag status={displayStatusOf(r)} size="sm" /></span>
                </label>
              ))}
            </div>
          </div>
        </FieldGroup>
        <FieldGroup title="完成日期与说明">
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <Field label="完成日期" required><input type="date" value={upload.date} onChange={(e) => setUpload((u) => ({ ...u, date: e.target.value }))} style={inputStyle} /></Field>
            <Field label="说明"><input value={upload.note} onChange={(e) => setUpload((u) => ({ ...u, note: e.target.value }))} placeholder="如：满分 100 分、80 分合格，均通过" style={inputStyle} /></Field>
          </div>
        </FieldGroup>
        <FieldGroup title="附件（文档与链接至少一项）">
          <div style={{ gridColumn: '1 / -1' }}>
            <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => {
              const picked = Array.from(e.target.files ?? []).map((f) => f.name).filter(Boolean);
              if (picked.length) setUpload((u) => ({ ...u, files: [...u.files, ...picked.filter((n) => !u.files.includes(n))] }));
              e.target.value = '';
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => fileInputRef.current?.click()}>上传文档</Button>
              <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setUpload((u) => ({ ...u, links: [...u.links, { name: '', url: '' }] }))}>添加链接</Button>
            </div>
            {(upload.files.length > 0 || upload.links.some((l) => l.name.trim() || l.url.trim())) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upload.files.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {upload.files.map((f) => (
                      <FileChip key={f} name={f} onRemove={() => setUpload((u) => ({ ...u, files: u.files.filter((x) => x !== f) }))} />
                    ))}
                  </div>
                )}
                {upload.links.map((l, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 26px', gap: 8 }}>
                    <input value={l.name} onChange={(e) => setLink(i, 'name', e.target.value)} placeholder="链接名称，如 课程回放" style={inputStyle} />
                    <input value={l.url} onChange={(e) => setLink(i, 'url', e.target.value)} placeholder="https://…" style={inputStyle} />
                    <button type="button" onClick={() => setUpload((u) => ({ ...u, links: u.links.filter((_, idx) => idx !== i) }))}
                      title="删除此链接" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#C73A3A', fontSize: 15 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </FieldGroup>
      </Modal>

      {/* 留底记录详情 */}
      <Modal open={!!trainingDetail} title={trainingDetail ? `${trainingDetail.kind}留底 · ${trainingDetail.title}` : ''} onClose={() => setTrainingDetail(null)} width={640} footer={
        <Button variant="outline" onClick={() => setTrainingDetail(null)}>关闭</Button>
      }>
        {trainingDetail && (
          <div>
            <FieldGroup title="基本信息">
              <FieldItem label="类型" value={<Tag label={trainingDetail.kind} color={trainingDetail.kind === '考核' ? 'info' : 'success'} />} />
              <FieldItem label="完成日期" value={trainingDetail.date} />
              <FieldItem label="上传人" value={trainingDetail.uploadedBy} />
              <FieldItem label="上传时间" value={trainingDetail.uploadedAt} />
              {trainingDetail.note && <FieldItem label="说明" value={trainingDetail.note} span />}
            </FieldGroup>
            <FieldGroup title={`涉及专员（${trainingDetail.repIds.length} 人）`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {trainingDetail.repIds.map((id) => (
                  <span key={id} style={{ padding: '3px 10px', borderRadius: 999, background: '#F3F4F6', color: '#374151', fontSize: 'var(--fs-12)' }}>
                    {nameOf(id)}
                  </span>
                ))}
              </div>
            </FieldGroup>
            <FieldGroup title="附件">
              {trainingDetail.files.length === 0 && trainingDetail.links.length === 0 ? (
                <div style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>无附件</div>
              ) : (
                <div>
                  {trainingDetail.files.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: trainingDetail.links.length ? 8 : 0 }}>
                      {trainingDetail.files.map((f) => <FileChip key={f} name={f} />)}
                    </div>
                  )}
                  {trainingDetail.links.map((l, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 'var(--fs-12)', borderBottom: '1px dashed #F0F1F3' }}>
                      <ExternalLink size={13} style={{ color: '#2F6BCE', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>{l.name}</span>
                      <span style={{ color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</span>
                    </div>
                  ))}
                </div>
              )}
            </FieldGroup>
          </div>
        )}
      </Modal>

      {/* 删除留底记录 */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="删除留底记录"
        description={`确定删除「${deleteTarget?.title ?? ''}」？删除后不可恢复，专员的备案留底档案不受影响。`}
        confirmLabel="确认删除"
        variant="danger"
        onConfirm={() => {
          if (!deleteTarget) return;
          removeTrainingRecord(deleteTarget.id);
          addToast({ type: 'info', title: '留底记录已删除', description: deleteTarget.title });
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

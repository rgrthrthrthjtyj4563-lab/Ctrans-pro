import { useMemo, useState } from 'react';
import {
  ShieldCheck, Snowflake, ClipboardCheck, FileSearch, RefreshCw, Plus, BadgeCheck, Ban,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatusTag } from '../components/StatusTag';
import { Pagination } from '../components/Pagination';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { MetricCard } from '../components/MetricCard';
import { FieldGroup, FieldItem } from '../components/DetailDrawer';
import { formatCNY, REGION_OPTIONS } from '../constants';
import type { ToastMessage } from '../components/Toast';
import type {
  EligibilityResult,
  Role,
  SelectionRecord,
  Vendor,
  VendorCreditCompliance,
  VendorRiskGrade,
  VendorStatus,
} from '../types';
import {
  DEMO_VENDOR_ID,
  SERVICE_TYPES,
  actorOf,
  allocAccessNo,
  allocLogId,
  allocSelId,
  allocVendorId,
  canFinalApprove,
  checkSettlementEligibility,
  checkVendorEligibility,
  emptyVendor,
  maskAccount,
  maskMobile,
  seedRepresentatives,
  seedVendors,
  vendorNameOf,
} from '../data/complianceData';
import { Field, InfoBanner, Stepper, Tabs, EligibilityPanel, inputStyle, tdStyle, thStyle, nowText, today } from './complianceUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole: Role;
}

const PAGE_SIZE = 8;
const VENDOR_STATUSES: VendorStatus[] = [
  '草稿', '待提交', '尽调中', '审批中', '补件中', '驳回', '准入通过', '可合作', '复审中', '限制合作', '冻结', '退出',
];
type DetailTab = '主体' | '信用' | '选聘' | '尽调' | '合同' | '人员' | '履约' | '审计';

export function VendorAccessManage({ addToast, currentRole }: Props) {
  const actor = actorOf(currentRole);
  const isCompliance = currentRole === '药厂合规部门';
  const isSales = currentRole === '药厂销售部门';
  const isVendor = currentRole === '服务提供商';
  const canWrite = isSales || isVendor;
  const canApprove = isCompliance;
  const canSeeAccount = isCompliance;

  const [rows, setRows] = useState<Vendor[]>(() => seedVendors.map((v) => ({ ...v })));
  const [reps] = useState(() => seedRepresentatives.map((r) => ({ ...r })));
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});

  const [detail, setDetail] = useState<Vendor | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('主体');

  const [formOpen, setFormOpen] = useState(false);
  const [formStep, setFormStep] = useState(0);
  const [form, setForm] = useState(emptyVendor());
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeReason, setFreezeReason] = useState('');
  const [exitOpen, setExitOpen] = useState(false);
  const [exitReason, setExitReason] = useState('');
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exception, setException] = useState({ reason: '', until: '', supervision: '' });

  const [checkOpen, setCheckOpen] = useState(false);
  const [checkKind, setCheckKind] = useState<'project' | 'settlement'>('project');
  const [checkMode, setCheckMode] = useState<'新增' | '存量'>('新增');
  const [checkInput, setCheckInput] = useState({ serviceType: '学术推广', region: '陕西', date: today(), amount: 80000, projectId: '', assignedRepIds: '' as string, payeeName: '', payeeNo: '' });
  const [checkResult, setCheckResult] = useState<EligibilityResult | null>(null);

  const [creditForm, setCreditForm] = useState<VendorCreditCompliance | null>(null);
  const [selOpen, setSelOpen] = useState(false);
  const [selForm, setSelForm] = useState({ method: '比价' as SelectionRecord['method'], processNote: '', awardReason: '', exceptionReason: '', evidence: '选聘记录.pdf' });

  const scoped = useMemo(() => (isVendor ? rows.filter((v) => v.id === DEMO_VENDOR_ID) : rows), [rows, isVendor]);

  const filtered = useMemo(() => scoped.filter((v) => {
    if (applied.name && !v.name.includes(applied.name) && !v.creditCode.includes(applied.name)) return false;
    if (applied.status && v.status !== applied.status) return false;
    if (applied.risk && v.riskGrade !== applied.risk) return false;
    if (applied.service && !v.serviceTypes.includes(applied.service)) return false;
    return true;
  }), [scoped, applied]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => ({
    coop: scoped.filter((v) => v.status === '可合作').length,
    dd: scoped.filter((v) => ['尽调中', '审批中', '补件中'].includes(v.status)).length,
    frozen: scoped.filter((v) => ['冻结', '限制合作'].includes(v.status)).length,
    review: scoped.filter((v) => v.status === '复审中').length,
    high: scoped.filter((v) => v.riskGrade === '高风险').length,
  }), [scoped]);

  function patch(id: string, updater: (v: Vendor) => Vendor) {
    setRows((prev) => prev.map((v) => (v.id === id ? updater(v) : v)));
    setDetail((d) => (d && d.id === id ? updater(d) : d));
  }

  function pushLog(cur: Vendor, action: string, comment?: string, extra?: { before?: string; after?: string }) {
    return [{
      id: allocLogId(rows.flatMap((v) => v.timeline.map((t) => t.id))),
      time: nowText(),
      operator: actor.name,
      operatorId: actor.id,
      role: currentRole,
      action,
      comment,
      ...extra,
    }, ...cur.timeline];
  }

  function setF<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function creditReady(c: VendorCreditCompliance | null): boolean {
    if (!c) return false;
    if (!c.antiBriberyPledgeFile || !c.antiBriberyPledgeDate) return false;
    if (c.illegalCheck === '待核验' || c.dishonestCheck === '待核验') return false;
    if (c.illegalCheck === '未通过' || c.lawsuitRisk === '有-未披露') return false;
    return true;
  }

  function selectionReady(v: { selectionRecords: SelectionRecord[] }): boolean {
    if (v.selectionRecords.length === 0) return false;
    return v.selectionRecords.some((s) => s.method !== '例外' || !!s.exceptionReason);
  }

  function missingAccess(f: typeof form): string[] {
    const miss: string[] = [];
    if (!f.name || !f.creditCode || !f.legalRep || !f.address) miss.push('主体信息');
    if (!f.actualController) miss.push('实际控制人');
    if (!f.shareholding) miss.push('股权结构');
    if (!f.principalName) miss.push('负责人');
    if (!f.bankName || !f.bankAccount) miss.push('财税结算');
    if (!f.contact) miss.push('合规联系人');
    if (!creditReady(f.creditCompliance)) miss.push('合规信用');
    if (!selectionReady(f)) miss.push('至少一条选聘记录或例外审批');
    return miss;
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyVendor(), initiatorId: actor.id, initiatorName: actor.name });
    setFormStep(0);
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(v: Vendor) {
    const { id: _id, ...rest } = v;
    setEditingId(v.id);
    setForm(rest);
    setFormStep(0);
    setFormError('');
    setFormOpen(true);
  }

  function saveForm(asSubmit: boolean) {
    if (asSubmit) {
      const miss = missingAccess(form);
      if (miss.length) {
        setFormError(`提交引入申请前仍缺：${miss.join('、')}`);
        return;
      }
    }
    const dup = rows.find((v) => v.creditCode && v.creditCode === form.creditCode && v.id !== editingId);
    if (form.creditCode && dup) {
      setFormError(`统一社会信用代码唯一，已存在于 ${dup.id}`);
      return;
    }
    const status: VendorStatus = asSubmit ? '尽调中' : '草稿';
    if (editingId) {
      patch(editingId, (v) => ({
        ...v, ...form,
        status: asSubmit ? '尽调中' : v.status === '草稿' ? '草稿' : v.status,
        timeline: pushLog(v, asSubmit ? '提交' : '修改', undefined, { before: v.status, after: asSubmit ? '尽调中' : v.status }),
      }));
    } else {
      const created: Vendor = {
        id: allocVendorId(rows),
        ...form,
        status,
        timeline: [{ id: allocLogId(rows.flatMap((v) => v.timeline.map((t) => t.id))), time: nowText(), operator: actor.name, operatorId: actor.id, role: currentRole, action: asSubmit ? '提交' : '创建', after: status }],
      };
      setRows((prev) => [created, ...prev]);
    }
    addToast({ type: 'success', title: asSubmit ? '已提交服务商引入，进入尽调' : '已保存草稿' });
    setFormOpen(false);
  }

  function approvalChain(grade: VendorRiskGrade): string {
    if (grade === '低风险') return '业务负责人 → 采购 → 合规';
    if (grade === '中风险') return '业务负责人 → 采购 → 法务 → 合规';
    return '业务负责人 → 采购 → 法务 → 合规负责人 → 管理层（高风险例外）';
  }

  function startApproval(v: Vendor) {
    if (v.missingDocs.length) {
      addToast({ type: 'warning', title: '存在缺件，不能进入准入审批', description: v.missingDocs.join('、') });
      return;
    }
    patch(v.id, (cur) => ({
      ...cur,
      status: '审批中',
      timeline: pushLog(cur, '尽调', `风险评级 ${cur.riskGrade}`, { before: cur.status, after: '审批中' }),
    }));
    addToast({ type: 'info', title: '尽调完成，已进入审批', description: approvalChain(v.riskGrade) });
  }

  function tryApproveAccess(v: Vendor) {
    if (canFinalApprove(actor.id, v.initiatorId)) {
      addToast({ type: 'error', title: '终审被拒绝', description: canFinalApprove(actor.id, v.initiatorId) || '' });
      return;
    }
    if (!creditReady(v.creditCompliance) || !selectionReady(v)) {
      addToast({ type: 'error', title: '不能准入通过', description: '须具备合规信用（核验通过）以及至少一条选聘记录或例外审批' });
      return;
    }
    if (v.riskGrade === '高风险' && (!v.exceptionReason || !v.exceptionUntil || !v.enhancedSupervision)) {
      setException({ reason: v.exceptionReason || '', until: v.exceptionUntil || '', supervision: v.enhancedSupervision || '' });
      setExceptionOpen(true);
      addToast({ type: 'warning', title: '高风险默认不准入', description: '请填写例外理由、期限、强化监督三项' });
      return;
    }
    commitApprove(v, v);
  }

  function commitApprove(v: Vendor, extra: Partial<Vendor>) {
    const y = new Date().getFullYear() + (v.riskGrade === '中风险' ? 0 : 1);
    const valid = v.riskGrade === '中风险' ? `${y}-02-28` : `${y}-08-31`;
    const accessNo = v.accessNo || allocAccessNo(rows.map((x) => x.accessNo).filter(Boolean));
    patch(v.id, (cur) => ({
      ...cur,
      ...extra,
      status: cur.contracts.some((c) => c.status === '已生效') ? '可合作' : '准入通过',
      accessNo,
      accessValidUntil: valid,
      reviewDue: valid,
      timeline: pushLog(cur, '准入', cur.contracts.some((c) => c.status === '已生效') ? '准入通过且合同已生效' : '准入通过，合同未生效前不得创建营销项目', { before: cur.status, after: cur.contracts.some((c) => c.status === '已生效') ? '可合作' : '准入通过' }),
    }));
    addToast({ type: 'success', title: v.contracts.some((c) => c.status === '已生效') ? '可合作' : '准入通过（待合同生效）' });
    setExceptionOpen(false);
  }

  function activateContract(contractId: string) {
    if (!detail) return;
    patch(detail.id, (cur) => {
      const contracts = cur.contracts.map((c) => c.id === contractId ? { ...c, status: '已生效' as const } : c);
      return {
        ...cur,
        contracts,
        status: cur.status === '准入通过' ? '可合作' : cur.status,
        timeline: pushLog(cur, '准入', '合同生效，可分配项目', { before: cur.status, after: cur.status === '准入通过' ? '可合作' : cur.status }),
      };
    });
    addToast({ type: 'success', title: '合同已标记生效' });
  }

  function confirmReject() {
    if (!detail || !rejectReason.trim()) return;
    patch(detail.id, (cur) => ({ ...cur, status: '驳回', timeline: pushLog(cur, '审核驳回', rejectReason, { before: cur.status, after: '驳回' }) }));
    addToast({ type: 'warning', title: '引入申请已驳回' });
    setRejectOpen(false);
  }

  function confirmFreeze() {
    if (!detail || !freezeReason.trim()) return;
    if (detail.incidents.some((i) => i.status !== '已结案' && i.risk === '高') === false) {
      /* freeze still allowed */
    }
    patch(detail.id, (cur) => ({ ...cur, status: '冻结', timeline: pushLog(cur, '冻结', freezeReason, { before: cur.status, after: '冻结', }) }));
    addToast({ type: 'error', title: '服务商已冻结', description: '阻断新项目、代表分配和结算申请' });
    setFreezeOpen(false);
  }

  function confirmExit() {
    if (!detail || !exitReason.trim()) return;
    patch(detail.id, (cur) => ({ ...cur, status: '退出', timeline: pushLog(cur, '退出', exitReason, { before: cur.status, after: '退出' }) }));
    addToast({ type: 'info', title: '已退出合作' });
    setExitOpen(false);
  }

  function startReview(v: Vendor) {
    patch(v.id, (cur) => ({ ...cur, status: '复审中', timeline: pushLog(cur, '复审', '触发复审', { before: cur.status, after: '复审中' }) }));
    addToast({ type: 'info', title: '已进入复审', description: '新增项目 BLOCK；存量结算 MANUAL_REVIEW' });
  }

  function passReview(v: Vendor) {
    if (canFinalApprove(actor.id, v.initiatorId)) {
      addToast({ type: 'error', title: '终审被拒绝', description: canFinalApprove(actor.id, v.initiatorId) || '' });
      return;
    }
    patch(v.id, (cur) => ({ ...cur, status: '可合作', timeline: pushLog(cur, '复审', '复审通过', { before: cur.status, after: '可合作' }) }));
    addToast({ type: 'success', title: '复审通过' });
  }

  function runCheck() {
    if (!detail) return;
    const latest = rows.find((r) => r.id === detail.id) ?? detail;
    if (checkKind === 'project') {
      const assigned = checkInput.assignedRepIds.split(/[,，\s]+/).filter(Boolean);
      setCheckResult(checkVendorEligibility(latest, {
        serviceType: checkInput.serviceType,
        region: checkInput.region,
        date: checkInput.date,
        amount: checkInput.amount,
        assignedRepIds: assigned.length ? assigned : latest.repIds,
        mode: checkMode,
      }, reps));
    } else {
      const project = latest.projects.find((p) => p.id === checkInput.projectId) ?? latest.projects[0];
      const patched = project ? {
        ...project,
        payeeAccountName: checkInput.payeeName || project.payeeAccountName,
        payeeAccountNo: checkInput.payeeNo || project.payeeAccountNo,
      } : undefined;
      setCheckResult(checkSettlementEligibility(latest, patched, reps));
    }
  }

  function saveCredit() {
    if (!detail || !creditForm) return;
    patch(detail.id, (cur) => ({ ...cur, creditCompliance: creditForm, timeline: pushLog(cur, '修改', '更新合规信用') }));
    addToast({ type: 'success', title: '合规信用已保存' });
  }

  function addSelection() {
    if (!detail) return;
    if (selForm.method === '例外' && !selForm.exceptionReason) {
      addToast({ type: 'warning', title: '例外选聘必须填写理由' });
      return;
    }
    const rec: SelectionRecord = {
      id: allocSelId(rows.flatMap((v) => v.selectionRecords.map((s) => s.id))),
      vendorId: detail.id,
      demandNo: `XQ-2026-${detail.id.slice(-3)}`,
      method: selForm.method,
      processNote: selForm.processNote,
      awardReason: selForm.awardReason,
      exceptionReason: selForm.exceptionReason,
      evidenceFiles: [selForm.evidence],
      createdAt: nowText(),
    };
    patch(detail.id, (cur) => ({ ...cur, selectionRecords: [rec, ...cur.selectionRecords], timeline: pushLog(cur, '修改', `新增选聘 ${rec.id}`) }));
    addToast({ type: 'success', title: '选聘记录已添加' });
    setSelOpen(false);
  }

  const filterFields = [
    { id: 'name', label: '服务商 / 信用代码', type: 'text' as const, placeholder: '名称或统一社会信用代码' },
    { id: 'status', label: '主状态', type: 'select' as const, options: VENDOR_STATUSES.map((s) => ({ value: s, label: s })) },
    { id: 'risk', label: '风险等级', type: 'select' as const, options: ['低风险', '中风险', '高风险'].map((s) => ({ value: s, label: s })) },
    { id: 'service', label: '服务类型', type: 'select' as const, options: SERVICE_TYPES.map((s) => ({ value: s, label: s })) },
  ];

  const current = detail ? (rows.find((v) => v.id === detail.id) ?? detail) : null;
  const cap = (v: Vendor) => ({ project: v.status === '可合作', settle: v.status === '可合作' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="服务商准入管理"
        description="尽职调查、风险评级、准入审批、合同履约与结算前置校验。未准入、复审失效或冻结的服务商不可承接项目和结算。"
        dataRange={isVendor ? vendorNameOf(rows, DEMO_VENDOR_ID) : '本企业全部服务商'}
        actions={canWrite ? <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={openCreate}>引入服务商</Button> : undefined}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <InfoBanner>当前操作人 {actor.name}（{actor.id}）。高风险须例外三要素。复审中：新增项目 BLOCK，存量结算 MANUAL_REVIEW。</InfoBanner>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 12 }}>
          <MetricCard compact title="可合作" value={stats.coop} icon={BadgeCheck} />
          <MetricCard compact title="尽调 / 审批中" value={stats.dd} icon={ClipboardCheck} iconColor="#C77A16" iconBg="#FEF3E2" urgency={stats.dd ? 'warning' : 'normal'} />
          <MetricCard compact title="复审中" value={stats.review} icon={FileSearch} iconColor="#C77A16" iconBg="#FEF3E2" />
          <MetricCard compact title="冻结 / 限制" value={stats.frozen} icon={Snowflake} iconColor="#C73A3A" iconBg="#FEECEC" urgency={stats.frozen ? 'danger' : 'normal'} />
          <MetricCard compact title="高风险主体" value={stats.high} icon={ShieldCheck} iconColor="#C73A3A" iconBg="#FEECEC" />
        </div>

        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={(id, val) => setFilters((p) => ({ ...p, [id]: val }))}
          onSearch={() => { setApplied(filters); setPage(1); }}
          onReset={() => { setFilters({}); setApplied({}); setPage(1); }}
          stats={<span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>共 <strong style={{ color: 'var(--color-text-1)', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 家服务商</span>}
        />

        <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1240 }}>
              <thead>
                <tr>
                  {['服务商', '信用代码', '状态', '风险', '准入编号 / 有效期', '合同', '名下代表', '可分配 / 可结算', '操作'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={9}><EmptyState title="暂无服务商" description="发起引入申请后在此跟踪尽调与准入" /></td></tr>
                ) : pageData.map((v, idx) => {
                  const c = cap(v);
                  return (
                    <tr key={v.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{v.name}</div>
                        <div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF' }}>{v.id} · {v.serviceTypes.join('、')}</div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)' }}>{v.creditCode}</td>
                      <td style={tdStyle}><StatusTag status={v.status as never} /></td>
                      <td style={tdStyle}><StatusTag status={v.riskGrade as never} /></td>
                      <td style={tdStyle}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)' }}>{v.accessNo || '—'}</div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{v.accessValidUntil || '未准入'}</div>
                      </td>
                      <td style={tdStyle}>{v.contracts.filter((x) => x.status === '已生效').length}/{v.contracts.length}</td>
                      <td style={tdStyle}>{v.repIds.length}</td>
                      <td style={tdStyle}>
                        <span style={{ color: c.project ? '#248A5A' : '#C73A3A', fontSize: 'var(--fs-12)', fontWeight: 600 }}>
                          {c.project ? '可分配' : '不可分配'} / {c.settle ? '可结算' : '不可结算'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <Button variant="ghost" size="sm" onClick={() => { setDetail(v); setDetailTab('主体'); setCreditForm(v.creditCompliance); }}>查看</Button>
                          {canWrite && ['草稿', '待提交', '补件中', '驳回'].includes(v.status) && (
                            <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>编辑</Button>
                          )}
                          {canApprove && v.status === '尽调中' && <Button variant="ghost" size="sm" onClick={() => startApproval(v)}>提交审批</Button>}
                          {canApprove && v.status === '审批中' && <Button variant="ghost" size="sm" onClick={() => tryApproveAccess(v)}>准入</Button>}
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

      <Modal open={!!current} title={current ? `服务商档案 · ${current.name}` : ''} onClose={() => setDetail(null)} width={980} footer={current && (
        <>
          <Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>
          {canApprove && current.status === '尽调中' && <Button variant="secondary" onClick={() => startApproval(current)}>尽调完成并提交审批</Button>}
          {canApprove && current.status === '审批中' && (
            <>
              <Button variant="outline" onClick={() => { setRejectOpen(true); setRejectReason(''); }}>驳回</Button>
              <Button variant="primary" icon={<BadgeCheck size={14} />} onClick={() => tryApproveAccess(current)}>审批准入</Button>
            </>
          )}
          {canApprove && current.status === '可合作' && (
            <>
              <Button variant="outline" onClick={() => startReview(current)}>发起复审</Button>
              <Button variant="danger" icon={<Snowflake size={14} />} onClick={() => { setFreezeOpen(true); setFreezeReason(''); }}>冻结</Button>
              <Button variant="danger" icon={<Ban size={14} />} onClick={() => { setExitOpen(true); setExitReason(''); }}>退出</Button>
            </>
          )}
          {canApprove && current.status === '复审中' && <Button variant="primary" onClick={() => passReview(current)}>复审通过</Button>}
          <Button variant="primary" icon={<ShieldCheck size={14} />} onClick={() => { setCheckKind('project'); setCheckResult(null); setCheckInput((c) => ({ ...c, payeeName: current.name, payeeNo: current.bankAccount, assignedRepIds: current.repIds.join(',') })); setCheckOpen(true); }}>
            项目 / 结算校验
          </Button>
        </>
      )}>
        {current && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <StatusTag status={current.status as never} />
                  <StatusTag status={current.riskGrade as never} />
                  <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{current.id} · 发起人 {current.initiatorName}（{current.initiatorId}）</span>
                </div>
                <div style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>审批链：{approvalChain(current.riskGrade)} · 复审到期 {current.reviewDue || '—'}</div>
              </div>
              {current.incidents.some((i) => i.status !== '已结案' && i.risk === '高') && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: '#FEECEC', color: '#C73A3A', fontSize: 'var(--fs-12)', fontWeight: 600 }}>未结案高风险事件，高风险操作已阻断</div>
              )}
            </div>

            <Tabs
              value={detailTab}
              onChange={(id) => { setDetailTab(id as DetailTab); if (id === '信用') setCreditForm(current.creditCompliance); }}
              items={[
                { id: '主体', label: '主体资料' },
                { id: '信用', label: '合规信用' },
                { id: '选聘', label: '选聘记录', count: current.selectionRecords.length },
                { id: '尽调', label: '尽调评级' },
                { id: '合同', label: '合同', count: current.contracts.length },
                { id: '人员', label: '人员', count: current.repIds.length },
                { id: '履约', label: '履约结算', count: current.projects.length },
                { id: '审计', label: '审计轨迹' },
              ]}
            />

            {detailTab === '主体' && (
              <FieldGroup title="主体信息">
                <FieldItem label="公司名称" value={current.name} />
                <FieldItem label="统一社会信用代码" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{current.creditCode}</span>} />
                <FieldItem label="法定代表人" value={current.legalRep} />
                <FieldItem label="实际控制人 / 股权" value={`${current.actualController} / ${current.shareholding || '—'}`} />
                <FieldItem label="负责人" value={`${current.principalName || '—'} ${current.principalMobile || ''}`} />
                <FieldItem label="开票能力 / 场地" value={`${current.invoiceAbility || '—'} / ${current.siteDesc || '—'}`} />
                <FieldItem label="账号" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{canSeeAccount ? current.bankAccount : maskAccount(current.bankAccount)}</span>} />
                <FieldItem label="联系电话" value={canSeeAccount ? current.contactMobile : maskMobile(current.contactMobile)} />
              </FieldGroup>
            )}

            {detailTab === '信用' && (
              <>
                <InfoBanner tone="warning">行政处罚/失信未核验或诉讼未披露时不能准入。</InfoBanner>
                {creditForm ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="承诺书文件"><input value={creditForm.antiBriberyPledgeFile} onChange={(e) => setCreditForm({ ...creditForm, antiBriberyPledgeFile: e.target.value })} style={inputStyle} /></Field>
                    <Field label="签署日期"><input type="date" value={creditForm.antiBriberyPledgeDate} onChange={(e) => setCreditForm({ ...creditForm, antiBriberyPledgeDate: e.target.value })} style={inputStyle} /></Field>
                    <Field label="违法核验">
                      <select value={creditForm.illegalCheck} onChange={(e) => setCreditForm({ ...creditForm, illegalCheck: e.target.value as VendorCreditCompliance['illegalCheck'] })} style={inputStyle}>
                        <option>待核验</option><option>通过</option><option>未通过</option>
                      </select>
                    </Field>
                    <Field label="失信核验">
                      <select value={creditForm.dishonestCheck} onChange={(e) => setCreditForm({ ...creditForm, dishonestCheck: e.target.value as VendorCreditCompliance['dishonestCheck'] })} style={inputStyle}>
                        <option>待核验</option><option>通过</option><option>未通过</option>
                      </select>
                    </Field>
                    <Field label="诉讼风险">
                      <select value={creditForm.lawsuitRisk} onChange={(e) => setCreditForm({ ...creditForm, lawsuitRisk: e.target.value as VendorCreditCompliance['lawsuitRisk'] })} style={inputStyle}>
                        <option>无</option><option>有-已披露</option><option>有-未披露</option>
                      </select>
                    </Field>
                    <div />
                    {canApprove && <Button variant="primary" onClick={saveCredit}>保存合规信用</Button>}
                  </div>
                ) : (
                  <EmptyState title="未录入合规信用" description="准入前必须完成承诺书与三项核验" action={canApprove ? { label: '开始录入', onClick: () => setCreditForm({ antiBriberyPledgeFile: '', antiBriberyPledgeDate: '', illegalCheck: '待核验', dishonestCheck: '待核验', lawsuitRisk: '无', evidenceFiles: [], checkedAt: today() }) } : undefined} />
                )}
              </>
            )}

            {detailTab === '选聘' && (
              <>
                {canWrite || canApprove ? <div style={{ marginBottom: 12 }}><Button size="sm" variant="primary" onClick={() => setSelOpen(true)}>新增选聘记录</Button></div> : null}
                {current.selectionRecords.length === 0 ? <EmptyState title="无选聘记录" description="须至少一条比价/邀标/评审，或填写例外理由" /> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>{['编号', '方式', '过程', '定标依据', '例外理由'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {current.selectionRecords.map((s) => (
                        <tr key={s.id}>
                          <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)' }}>{s.id}</td>
                          <td style={tdStyle}>{s.method}</td>
                          <td style={tdStyle}>{s.processNote}</td>
                          <td style={tdStyle}>{s.awardReason}</td>
                          <td style={tdStyle}>{s.exceptionReason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}

            {detailTab === '尽调' && (
              <FieldGroup title="评级结论">
                <FieldItem label="综合得分" value={<span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{current.riskScore}</span>} />
                <FieldItem label="风险等级" value={<StatusTag status={current.riskGrade as never} />} />
                <FieldItem label="尽调编号" value={current.dueDiligence?.id || '—'} />
                <FieldItem label="确认人" value={current.dueDiligence ? `${current.dueDiligence.confirmedByName}（${current.dueDiligence.confirmedById}）` : '—'} />
              </FieldGroup>
            )}

            {detailTab === '合同' && (
              current.contracts.length === 0 ? <EmptyState title="暂无合同" description="准入通过且合同生效后才能分配项目" /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['内部ID / 合同号', '服务类型', '区域', '期限', '金额上限', '状态', '操作'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {current.contracts.map((c) => (
                      <tr key={c.id}>
                        <td style={{ ...tdStyle, fontSize: 'var(--fs-12)' }}>{c.id}<br />{c.contractNo}</td>
                        <td style={tdStyle}>{(c.serviceTypes || []).join('、')}</td>
                        <td style={tdStyle}>{c.regions.join('、')}</td>
                        <td style={{ ...tdStyle, fontSize: 'var(--fs-12)' }}>{c.startDate} ~ {c.endDate}</td>
                        <td style={tdStyle}>{formatCNY(c.amountCap)}</td>
                        <td style={tdStyle}><StatusTag status={(c.status === '已生效' ? '已通过' : c.status === '草案' ? '草稿' : '已撤销') as never} /></td>
                        <td style={tdStyle}>{canApprove && c.status === '草案' && <Button variant="ghost" size="sm" onClick={() => activateContract(c.id)}>标记生效</Button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {detailTab === '人员' && (
              current.repIds.length === 0 ? <EmptyState title="暂无关联代表" description="人员必须通过代表个人准入后才能绑定" /> : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {current.repIds.map((id) => {
                    const n = reps.find((r) => r.id === id)?.name || id;
                    return <span key={id} style={{ padding: '6px 12px', background: '#F3F4F6', borderRadius: 6, fontSize: 'var(--fs-13)' }}>{n}（{id}）</span>;
                  })}
                </div>
              )
            )}

            {detailTab === '履约' && (
              current.projects.length === 0 ? <EmptyState title="暂无项目" description="冻结、复审失效或退出后阻断新项目" /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['项目', '区域 / 类型', '代表', '验收 / 成果', '收款户名', '金额'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {current.projects.map((p) => (
                      <tr key={p.id}>
                        <td style={tdStyle}>{p.projectNo}<div style={{ fontSize: 'var(--fs-11)', color: '#9CA3AF' }}>{p.id} · {p.name}</div></td>
                        <td style={tdStyle}>{p.region} / {p.serviceType}</td>
                        <td style={{ ...tdStyle, fontSize: 'var(--fs-12)' }}>{p.assignedRepIds.join('、') || '—'}</td>
                        <td style={tdStyle}>{p.acceptance} · {(p.deliverables || []).length} 份成果</td>
                        <td style={{ ...tdStyle, fontSize: 'var(--fs-12)' }}>{p.payeeAccountName || '—'}</td>
                        <td style={tdStyle}>{formatCNY(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {detailTab === '审计' && current.timeline.map((e, idx) => (
              <div key={e.id} style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
                {idx < current.timeline.length - 1 && <div style={{ position: 'absolute', left: 7, top: 16, bottom: 0, width: 2, background: '#E5E7EB' }} />}
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--color-brand-subtle)', border: '2px solid var(--color-brand)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>{e.action} · {e.id}</div>
                  <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>{e.operator}（{e.operatorId || '—'}） · {e.time}</div>
                  {(e.before || e.after) && <div style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>{e.before} → {e.after}</div>}
                  {e.comment && <div style={{ marginTop: 6, fontSize: 'var(--fs-13)', background: '#F9FAFB', padding: '8px 10px', borderRadius: 6 }}>{e.comment}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={formOpen} title={editingId ? '编辑服务商资料' : '引入服务商'} onClose={() => setFormOpen(false)} width={760} footer={
        <>
          <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
          {formStep > 0 && <Button variant="ghost" onClick={() => setFormStep((s) => s - 1)}>上一步</Button>}
          {formStep < 2 && <Button variant="primary" onClick={() => setFormStep((s) => s + 1)}>下一步</Button>}
          {formStep === 2 && (
            <>
              <Button variant="secondary" onClick={() => saveForm(false)}>保存草稿</Button>
              <Button variant="primary" onClick={() => saveForm(true)}>提交引入申请</Button>
            </>
          )}
        </>
      }>
        <Stepper steps={['主体与控制关系', '资质财税合规', '人员选聘']} current={formStep} />
        {formError && <div style={{ color: '#C73A3A', fontSize: 'var(--fs-13)', marginBottom: 12 }}>{formError}</div>}
        {formStep === 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="公司名称" required><input value={form.name} onChange={(e) => setF('name', e.target.value)} style={inputStyle} /></Field>
            <Field label="统一社会信用代码" required><input value={form.creditCode} onChange={(e) => setF('creditCode', e.target.value)} style={inputStyle} /></Field>
            <Field label="法定代表人" required><input value={form.legalRep} onChange={(e) => setF('legalRep', e.target.value)} style={inputStyle} /></Field>
            <Field label="实际控制人" required><input value={form.actualController} onChange={(e) => setF('actualController', e.target.value)} style={inputStyle} /></Field>
            <Field label="股权结构" required span><input value={form.shareholding} onChange={(e) => setF('shareholding', e.target.value)} style={inputStyle} /></Field>
            <Field label="负责人" required><input value={form.principalName} onChange={(e) => setF('principalName', e.target.value)} style={inputStyle} /></Field>
            <Field label="负责人电话"><input value={form.principalMobile} onChange={(e) => setF('principalMobile', e.target.value)} style={inputStyle} /></Field>
            <Field label="注册地址" required span><input value={form.address} onChange={(e) => setF('address', e.target.value)} style={inputStyle} /></Field>
          </div>
        )}
        {formStep === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="开户行" required><input value={form.bankName} onChange={(e) => setF('bankName', e.target.value)} style={inputStyle} /></Field>
            <Field label="账号" required><input value={form.bankAccount} onChange={(e) => setF('bankAccount', e.target.value)} style={inputStyle} /></Field>
            <Field label="开票能力"><input value={form.invoiceAbility} onChange={(e) => setF('invoiceAbility', e.target.value)} style={inputStyle} /></Field>
            <Field label="场地"><input value={form.siteDesc} onChange={(e) => setF('siteDesc', e.target.value)} style={inputStyle} /></Field>
          </div>
        )}
        {formStep === 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="合规联系人" required><input value={form.contact} onChange={(e) => setF('contact', e.target.value)} style={inputStyle} /></Field>
            <Field label="联系电话"><input value={form.contactMobile} onChange={(e) => setF('contactMobile', e.target.value)} style={inputStyle} /></Field>
            <div style={{ gridColumn: '1 / -1', fontSize: 'var(--fs-12)', color: '#667085' }}>提交引入前须在详情页补齐合规信用与选聘记录。草稿可先保存。</div>
          </div>
        )}
      </Modal>

      <Modal open={checkOpen} title={current ? `${checkKind === 'project' ? '项目准入' : '结算准入'}校验 · ${current.name}` : '校验'} onClose={() => setCheckOpen(false)} width={860} footer={<Button variant="outline" onClick={() => setCheckOpen(false)}>关闭</Button>}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <Button variant={checkKind === 'project' ? 'primary' : 'outline'} size="sm" onClick={() => { setCheckKind('project'); setCheckResult(null); }}>checkVendorEligibility</Button>
          <Button variant={checkKind === 'settlement' ? 'primary' : 'outline'} size="sm" onClick={() => { setCheckKind('settlement'); setCheckResult(null); }}>checkSettlementEligibility</Button>
          {checkKind === 'project' && (
            <>
              <Button variant={checkMode === '新增' ? 'primary' : 'outline'} size="sm" onClick={() => setCheckMode('新增')}>新增</Button>
              <Button variant={checkMode === '存量' ? 'primary' : 'outline'} size="sm" onClick={() => setCheckMode('存量')}>存量</Button>
            </>
          )}
        </div>
        {checkKind === 'project' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Field label="服务类型">
              <select value={checkInput.serviceType} onChange={(e) => setCheckInput((c) => ({ ...c, serviceType: e.target.value }))} style={inputStyle}>
                {SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="区域">
              <select value={checkInput.region} onChange={(e) => setCheckInput((c) => ({ ...c, region: e.target.value }))} style={inputStyle}>
                {REGION_OPTIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="日期"><input type="date" value={checkInput.date} onChange={(e) => setCheckInput((c) => ({ ...c, date: e.target.value }))} style={inputStyle} /></Field>
            <Field label="预算金额"><input type="number" value={checkInput.amount} onChange={(e) => setCheckInput((c) => ({ ...c, amount: Number(e.target.value) }))} style={inputStyle} /></Field>
            <Field label="拟分配代表 ID（逗号分隔）" span><input value={checkInput.assignedRepIds} onChange={(e) => setCheckInput((c) => ({ ...c, assignedRepIds: e.target.value }))} style={inputStyle} placeholder="REP-001,REP-006" /></Field>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Field label="选择项目" span>
              <select value={checkInput.projectId} onChange={(e) => setCheckInput((c) => ({ ...c, projectId: e.target.value }))} style={inputStyle}>
                <option value="">（默认首个项目）</option>
                {current?.projects.map((p) => <option key={p.id} value={p.id}>{p.projectNo} · 验收{p.acceptance} · 成果{(p.deliverables || []).length}</option>)}
              </select>
            </Field>
            <Field label="收款户名"><input value={checkInput.payeeName} onChange={(e) => setCheckInput((c) => ({ ...c, payeeName: e.target.value }))} style={inputStyle} /></Field>
            <Field label="收款账号"><input value={checkInput.payeeNo} onChange={(e) => setCheckInput((c) => ({ ...c, payeeNo: e.target.value }))} style={inputStyle} /></Field>
          </div>
        )}
        <Button variant="primary" icon={<RefreshCw size={14} />} onClick={runCheck}>执行校验</Button>
        <div style={{ height: 12 }} />
        {checkResult && <EligibilityPanel result={checkResult} />}
      </Modal>

      <Modal open={exceptionOpen} title="高风险例外准入" onClose={() => setExceptionOpen(false)} width={520} footer={
        <>
          <Button variant="outline" onClick={() => setExceptionOpen(false)}>取消</Button>
          <Button variant="primary" disabled={!exception.reason || !exception.until || !exception.supervision} onClick={() => current && commitApprove(current, { exceptionReason: exception.reason, exceptionUntil: exception.until, enhancedSupervision: exception.supervision })}>提交例外并准入</Button>
        </>
      }>
        <InfoBanner tone="warning">三项均必填，缺一不可准入。</InfoBanner>
        <Field label="例外理由" required><textarea value={exception.reason} onChange={(e) => setException((s) => ({ ...s, reason: e.target.value }))} rows={3} style={{ ...inputStyle, height: 'auto', padding: 10 }} /></Field>
        <div style={{ height: 8 }} />
        <Field label="例外期限" required><input type="date" value={exception.until} onChange={(e) => setException((s) => ({ ...s, until: e.target.value }))} style={inputStyle} /></Field>
        <div style={{ height: 8 }} />
        <Field label="强化监督措施" required><input value={exception.supervision} onChange={(e) => setException((s) => ({ ...s, supervision: e.target.value }))} style={inputStyle} /></Field>
      </Modal>

      <Modal open={selOpen} title="新增选聘记录" onClose={() => setSelOpen(false)} width={520} footer={
        <><Button variant="outline" onClick={() => setSelOpen(false)}>取消</Button><Button variant="primary" onClick={addSelection}>保存</Button></>
      }>
        <Field label="方式">
          <select value={selForm.method} onChange={(e) => setSelForm((s) => ({ ...s, method: e.target.value as SelectionRecord['method'] }))} style={inputStyle}>
            <option>比价</option><option>邀标</option><option>评审</option><option>例外</option>
          </select>
        </Field>
        <div style={{ height: 8 }} />
        <Field label="过程说明"><input value={selForm.processNote} onChange={(e) => setSelForm((s) => ({ ...s, processNote: e.target.value }))} style={inputStyle} /></Field>
        <div style={{ height: 8 }} />
        <Field label="定标依据"><input value={selForm.awardReason} onChange={(e) => setSelForm((s) => ({ ...s, awardReason: e.target.value }))} style={inputStyle} /></Field>
        {selForm.method === '例外' && (
          <><div style={{ height: 8 }} /><Field label="例外理由" required><input value={selForm.exceptionReason} onChange={(e) => setSelForm((s) => ({ ...s, exceptionReason: e.target.value }))} style={inputStyle} /></Field></>
        )}
      </Modal>

      <Modal open={rejectOpen} title="驳回引入" onClose={() => setRejectOpen(false)} width={480} footer={
        <><Button variant="outline" onClick={() => setRejectOpen(false)}>取消</Button><Button variant="danger" onClick={confirmReject} disabled={!rejectReason.trim()}>确认驳回</Button></>
      }>
        <Field label="驳回原因" required><textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} style={{ ...inputStyle, height: 'auto', padding: 10 }} /></Field>
      </Modal>
      <Modal open={freezeOpen} title="冻结服务商" onClose={() => setFreezeOpen(false)} width={480} footer={
        <><Button variant="outline" onClick={() => setFreezeOpen(false)}>取消</Button><Button variant="danger" onClick={confirmFreeze} disabled={!freezeReason.trim()}>确认冻结</Button></>
      }>
        <Field label="冻结原因" required><textarea value={freezeReason} onChange={(e) => setFreezeReason(e.target.value)} rows={4} style={{ ...inputStyle, height: 'auto', padding: 10 }} /></Field>
      </Modal>
      <Modal open={exitOpen} title="退出合作" onClose={() => setExitOpen(false)} width={480} footer={
        <><Button variant="outline" onClick={() => setExitOpen(false)}>取消</Button><Button variant="danger" onClick={confirmExit} disabled={!exitReason.trim()}>确认退出</Button></>
      }>
        <Field label="退出原因" required><textarea value={exitReason} onChange={(e) => setExitReason(e.target.value)} rows={4} style={{ ...inputStyle, height: 'auto', padding: 10 }} /></Field>
      </Modal>
    </div>
  );
}

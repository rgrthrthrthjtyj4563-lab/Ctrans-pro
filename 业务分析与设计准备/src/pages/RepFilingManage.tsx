import { useMemo, useState } from 'react';
import {
  Plus, ShieldCheck, Ban, FileSearch, BadgeCheck, UserPlus, ClipboardCheck, Snowflake, RefreshCw,
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
import type { ToastMessage } from '../components/Toast';
import type {
  AuthApprovalStatus,
  ComplianceIncident,
  DemoActivity,
  EligibilityResult,
  FilingVerifyMethod,
  FilingVerifyResult,
  Representative,
  RepresentativeStatus,
  Role,
} from '../types';
import {
  ACTORS,
  CURRENT_PLEDGE_TEMPLATE,
  DEMO_VENDOR_ID,
  MAH_ID,
  PRODUCT_IDS,
  PRODUCT_THERAPY,
  actorOf,
  allocActivityId,
  allocAuthId,
  allocAuthNo,
  allocIncidentId,
  allocIncidentNo,
  allocLogId,
  allocRepId,
  allocTrnId,
  allocVerifyId,
  allocVerifyTask,
  canFinalApprove,
  canRepJoinActivity,
  checkRepresentativeEligibility,
  emptyIncident,
  emptyRepresentative,
  fakeHash,
  hasActiveAuth,
  maskIdNo,
  maskMobile,
  reminderHit,
  seedActivities,
  seedRepresentatives,
  seedVendors,
  vendorNameOf,
} from '../data/complianceData';
import { varieties } from '../data/mockData';
import { REGION_OPTIONS } from '../constants';
import { Field, InfoBanner, Stepper, Tabs, EligibilityPanel, inputStyle, tdStyle, thStyle, nowText, today } from './complianceUi';

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentRole: Role;
}

const PAGE_SIZE = 10;
const REP_STATUSES: RepresentativeStatus[] = [
  '草稿', '待合规确认', '补件中', '合格', '待备案提交', '已备案', '提交失败', '变更待提交', '删除待提交', '已删除', '冻结', '整改中', '复核中', '失效', '退出', '驳回',
];
const MED_MAJORS = ['药学', '临床医学', '药物制剂', '护理学', '预防医学', '中药学', '药理学', '生物制药', '相关专业'];
type DetailTab = '档案' | '备案核验' | '授权' | '培训承诺' | '违规' | '活动' | '审计';

type AuthorizationIndicator = '有效授权' | '范围待确认' | '授权将到期' | '授权已失效';

function authorizationIndicator(rep: Representative, date: string): AuthorizationIndicator {
  const live = rep.authorizations.filter((a) => a.approvalStatus === '通过' && !a.superseded);
  if (live.some((a) => a.startDate <= date && a.endDate >= date)) {
    const nearest = live.filter((a) => a.endDate >= date).sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
    const days = nearest ? Math.ceil((Date.parse(`${nearest.endDate}T00:00:00`) - Date.parse(`${date}T00:00:00`)) / 86400000) : 0;
    return days <= 30 ? '授权将到期' : '有效授权';
  }
  return live.length > 0 ? '授权已失效' : '范围待确认';
}

function activeAuthorizations(rep: Representative, date: string) {
  return rep.authorizations.filter((a) => a.approvalStatus === '通过' && !a.superseded && a.startDate <= date && a.endDate >= date);
}

function allLogIds(reps: Representative[]): string[] {
  return reps.flatMap((r) => r.timeline.map((t) => t.id));
}

export function RepFilingManage({ addToast, currentRole }: Props) {
  const actor = actorOf(currentRole);
  const isCompliance = currentRole === '药厂合规部门';
  const isSales = currentRole === '药厂销售部门';
  const isVendor = currentRole === '服务提供商';
  const canSeeFullId = isCompliance;
  const canWrite = isSales;
  const canApprove = isCompliance;

  const [rows, setRows] = useState<Representative[]>(() => seedRepresentatives.map((r) => ({ ...r })));
  const [vendors] = useState(() => seedVendors.map((v) => ({ ...v })));
  const [activities, setActivities] = useState<DemoActivity[]>(() => seedActivities.map((a) => ({ ...a })));
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});

  const [detail, setDetail] = useState<Representative | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('档案');
  const [asReviewer2, setAsReviewer2] = useState(false);
  const effectiveActor = asReviewer2 && isCompliance ? ACTORS.compliance2 : actor;

  const [formOpen, setFormOpen] = useState(false);
  const [formStep, setFormStep] = useState(0);
  const [form, setForm] = useState(emptyRepresentative());
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verify, setVerify] = useState({ queryKey: '', result: '有效' as FilingVerifyResult, method: '人工核验' as FilingVerifyMethod, evidence: '备案平台查询截图.png', summary: '' });

  const [authOpen, setAuthOpen] = useState(false);
  const [authForm, setAuthForm] = useState({ replaceAuthNo: '', products: [] as string[], therapyAreas: [] as string[], regions: [] as string[], startDate: '', endDate: '', fileName: '授权文件.pdf' });

  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeReason, setFreezeReason] = useState('');
  const [freezeEvidence, setFreezeEvidence] = useState('');
  const [rectifyOpen, setRectifyOpen] = useState(false);
  const [rectify, setRectify] = useState({ measure: '', owner: '', due: '' });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [rejectTarget, setRejectTarget] = useState<Representative | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [supplyTarget, setSupplyTarget] = useState<Representative | null>(null);
  const [supplyNote, setSupplyNote] = useState('');

  const [checkOpen, setCheckOpen] = useState(false);
  const [checkInput, setCheckInput] = useState({ product: varieties[0], therapyArea: '心血管', region: '陕西', date: today(), hospital: '北京协和医院' });
  const [checkResult, setCheckResult] = useState<EligibilityResult | null>(null);

  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incident, setIncident] = useState(emptyIncident());


  const scoped = useMemo(() => {
    if (!isVendor) return rows;
    return rows.filter((r) => r.providerId === DEMO_VENDOR_ID);
  }, [rows, isVendor]);

  const filtered = useMemo(() => scoped.filter((r) => {
    if (applied.name && !r.name.includes(applied.name) && !r.filingNo.includes(applied.name)) return false;
    if (applied.status && r.status !== applied.status) return false;
    if (applied.provider && r.providerId !== applied.provider) return false;
    if (applied.filing && r.filingStatus !== applied.filing) return false;
    if (applied.employment && r.employmentType !== applied.employment) return false;
    return true;
  }), [scoped, applied]);

  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => ({
    enabled: scoped.filter((r) => r.status === '启用').length,
    pending: scoped.filter((r) => ['待合规确认', '补件中', '待备案提交', '变更待提交', '删除待提交'].includes(r.status)).length,
    frozen: scoped.filter((r) => ['冻结', '整改中', '复核中'].includes(r.status)).length,
    expiring: scoped.filter((r) => reminderHit(r.authorizations.find((a) => a.approvalStatus === '通过' && !a.superseded)?.endDate || '', [60, 30, 7])).length,
    active: scoped.filter((r) => canRepJoinActivity(r)).length,
  }), [scoped]);

  function patch(id: string, updater: (r: Representative) => Representative) {
    setRows((prev) => prev.map((r) => (r.id === id ? updater(r) : r)));
    setDetail((d) => (d && d.id === id ? updater(d) : d));
  }

  function pushLog(cur: Representative, action: string, comment?: string, extra?: { before?: string; after?: string; approvalId?: string; evidenceHash?: string }) {
    return [{
      id: allocLogId(allLogIds(rows).concat(cur.timeline.map((t) => t.id))),
      time: nowText(),
      operator: effectiveActor.name,
      operatorId: effectiveActor.id,
      role: currentRole,
      action,
      comment,
      ...extra,
    }, ...cur.timeline];
  }

  function denySelfApprove(record: Representative): boolean {
    const err = canFinalApprove(effectiveActor.id, record.initiatorId, record.unfreezeReviewerId);
    if (err) {
      addToast({ type: 'error', title: '终审被拒绝', description: err });
      return true;
    }
    if (!isCompliance) {
      addToast({ type: 'error', title: '终审被拒绝', description: '仅合规角色可终审' });
      return true;
    }
    return false;
  }

  function missingAccessFields(f: typeof form): string[] {
    const miss: string[] = [];
    if (!f.name) miss.push('姓名');
    if (!f.gender) miss.push('性别');
    if (!f.photoFile) miss.push('照片');
    if (!f.idNo) miss.push('证件号');
    if (!f.mobile) miss.push('手机号');
    if (!f.email) miss.push('邮箱');
    if (!f.providerId && f.employmentType !== 'MAH直聘') miss.push('所属服务商');
    if (!f.employStart || !f.employEnd) miss.push('雇佣起止日期');
    if (!f.contractOrAuthNo || !f.agreementFile) miss.push('劳动合同或授权书');
    if (!f.education || !f.major || !f.school || !f.eduProof) miss.push('学历证明');
    if (!['大专', '本科', '硕士', '博士'].includes(f.education)) miss.push('学历须大专及以上');
    if (!f.trainingDate || !f.trainingValidUntil || !f.trainingCert || (f.examScore ?? 0) < 60) miss.push('培训考核');
    if (!f.pledgeDate || !f.pledgeFile) miss.push('合规承诺');
    if (f.pledgeVersion !== CURRENT_PLEDGE_TEMPLATE) miss.push(`承诺书须为 ${CURRENT_PLEDGE_TEMPLATE}`);
    return miss;
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyRepresentative(), initiatorId: actor.id, initiatorName: actor.name, providerId: isVendor ? DEMO_VENDOR_ID : DEMO_VENDOR_ID });
    setFormStep(0);
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(r: Representative) {
    const { id: _id, ...rest } = r;
    setEditingId(r.id);
    setForm(rest);
    setFormStep(0);
    setFormError('');
    setFormOpen(true);
  }

  function saveForm(asSubmit: boolean) {
    if (asSubmit) {
      const miss = missingAccessFields(form);
      if (miss.length) {
        setFormError(`提交准入审批前仍缺：${miss.join('、')}`);
        return;
      }
    }
    const dup = rows.find((r) => r.idNo && r.idNo === form.idNo && r.id !== editingId);
    if (form.idNo && dup) {
      setFormError(`证件号唯一，已存在于 ${dup.id} ${dup.name}`);
      return;
    }
    const providerName = vendorNameOf(vendors, form.providerId);
    const trainings = form.trainingDate ? [{
      id: allocTrnId(rows.flatMap((r) => r.trainings.map((t) => t.id))),
      repId: editingId || 'pending',
      planName: form.trainingPlan || '',
      completedAt: form.trainingDate,
      examScore: form.examScore ?? 0,
      validUntil: form.trainingValidUntil || '',
      certFile: form.trainingCert || '',
    }] : [];
    if (editingId) {
      patch(editingId, (r) => ({
        ...r,
        ...form,
        provider: providerName,
        trainings: trainings.length ? trainings.map((t) => ({ ...t, repId: r.id })) : r.trainings,
        status: asSubmit ? '待合规确认' : r.status === '草稿' ? '草稿' : r.status,
        timeline: pushLog(r, asSubmit ? '提交' : '修改', asSubmit ? '提交合规确认' : '保存档案', { before: r.status, after: asSubmit ? '待合规确认' : r.status }),
      }));
    } else {
      const id = allocRepId(rows);
      const created: Representative = {
        id,
        ...form,
        provider: providerName,
        trainings: trainings.map((t) => ({ ...t, repId: id })),
        status: asSubmit ? '待合规确认' : '草稿',
        timeline: [{
          id: allocLogId(allLogIds(rows)),
          time: nowText(),
          operator: actor.name,
          operatorId: actor.id,
          role: currentRole,
          action: asSubmit ? '提交' : '创建',
          after: asSubmit ? '待合规确认' : '草稿',
        }],
      };
      setRows((prev) => [created, ...prev]);
    }
    addToast({ type: 'success', title: asSubmit ? '已提交合规确认' : '档案已保存', description: form.name });
    setFormOpen(false);
  }

  function approve(r: Representative) {
    if (denySelfApprove(r)) return;
    const enable = hasActiveAuth(r);
    patch(r.id, (cur) => ({
      ...cur,
      status: enable ? '待备案提交' : '合格',
      timeline: pushLog(cur, '合规确认通过', enable ? '资格与推广范围已确认，待登记国家平台备案结果' : '资格已确认，待补充推广范围', { before: cur.status, after: enable ? '待备案提交' : '合格' }),
    }));
    addToast({ type: enable ? 'success' : 'warning', title: enable ? '待登记国家备案结果' : '合规已通过，待确认推广范围' });
  }

  function confirmReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    if (denySelfApprove(rejectTarget)) return;
    patch(rejectTarget.id, (cur) => ({
      ...cur,
      status: '驳回',
      timeline: pushLog(cur, '审核驳回', rejectReason, { before: cur.status, after: '驳回' }),
    }));
    addToast({ type: 'warning', title: '已驳回准入' });
    setRejectTarget(null);
    setRejectReason('');
  }

  function confirmSupply() {
    if (!supplyTarget) return;
    patch(supplyTarget.id, (cur) => ({
      ...cur,
      status: '补件中',
      timeline: pushLog(cur, '补件', supplyNote || '请补齐必传资料', { before: cur.status, after: '补件中' }),
    }));
    addToast({ type: 'info', title: '已要求补件' });
    setSupplyTarget(null);
  }

  function confirmFreeze() {
    if (!detail || !freezeReason.trim() || !freezeEvidence.trim()) return;
    const pending = activities.filter((a) => a.repId === detail.id && a.status === '未开始').map((a) => a.id);
    setActivities((prev) => prev.map((a) => a.repId === detail.id && a.status === '未开始' ? { ...a, status: '不可执行' } : a));
    patch(detail.id, (cur) => ({
      ...cur,
      status: '冻结',
      freezeReason,
      freezeEvidence,
      blockedActivityIds: pending,
      timeline: pushLog(cur, '冻结', freezeReason, { before: cur.status, after: '冻结', evidenceHash: fakeHash(freezeEvidence) }),
    }));
    addToast({ type: 'error', title: '代表已冻结', description: `${pending.length} 条未开始活动已标记为不可执行` });
    setFreezeOpen(false);
  }

  function confirmRectify() {
    if (!detail || !rectify.measure || !rectify.owner || !rectify.due) return;
    patch(detail.id, (cur) => ({
      ...cur,
      status: '整改中',
      rectification: rectify.measure,
      rectificationOwner: rectify.owner,
      rectificationDue: rectify.due,
      timeline: pushLog(cur, '修改', `登记整改：${rectify.measure}`, { before: cur.status, after: '整改中' }),
    }));
    addToast({ type: 'info', title: '已进入整改中' });
    setRectifyOpen(false);
  }

  function submitToReview() {
    if (!detail || !detail.investigationConclusion && !reviewNote) {
      if (!detail?.rectification) {
        addToast({ type: 'warning', title: '请先完成整改登记' });
        return;
      }
    }
    if (!detail) return;
    const conclusion = reviewNote || detail.investigationConclusion || '整改材料已提交复核';
    patch(detail.id, (cur) => ({
      ...cur,
      status: '复核中',
      investigationConclusion: conclusion,
      unfreezeReviewerId: effectiveActor.id,
      timeline: pushLog(cur, '解冻', conclusion, { before: cur.status, after: '复核中' }),
    }));
    addToast({ type: 'info', title: '已提交复核', description: '终审须由另一名合规复核人操作' });
    setReviewOpen(false);
    setReviewNote('');
  }

  function secondUnfreeze(r: Representative) {
    if (effectiveActor.id === r.initiatorId || effectiveActor.id === r.unfreezeReviewerId) {
      addToast({ type: 'error', title: '终审被拒绝', description: '终审人不得为发起人或调查/提交复核人' });
      return;
    }
    if (effectiveActor.id !== ACTORS.compliance2.id) {
      addToast({ type: 'error', title: '请切换「以复核人身份确认」', description: '当前会话是第一合规，不能自己解冻' });
      return;
    }
    patch(r.id, (cur) => ({
      ...cur,
      status: hasActiveAuth(cur) ? '启用' : '合格',
      timeline: pushLog(cur, '解冻', '双人复核通过，解除冻结', { before: cur.status, after: hasActiveAuth(cur) ? '启用' : '合格' }),
    }));
    addToast({ type: 'success', title: '解冻已生效' });
  }

  function submitVerify() {
    if (!detail) return;
    if (!verify.queryKey.trim() || !verify.evidence.trim()) {
      addToast({ type: 'warning', title: '请填写国家备案号并上传备案回执' });
      return;
    }
    patch(detail.id, (cur) => ({
      ...cur,
      filingNo: verify.queryKey.trim(),
      filingStatus: '已备案',
      filingSubmittedAt: nowText(),
      filingSubmittedBy: effectiveActor.name,
      filingReceipt: verify.evidence,
      status: '已备案',
      timeline: pushLog(cur, '登记备案结果', `国家备案号：${verify.queryKey.trim()}`, { evidenceHash: fakeHash(verify.evidence), after: '已备案' }),
    }));
    addToast({ type: 'success', title: '国家备案结果已登记' });
    setVerifyOpen(false);
  }

  function submitAuth() {
    if (!detail) return;
    if (!authForm.products.length || !authForm.regions.length || !authForm.startDate || !authForm.endDate) {
      addToast({ type: 'warning', title: '请完整填写授权范围与有效期' });
      return;
    }
    const cap = [detail.employEnd, detail.trainingValidUntil].filter(Boolean).sort()[0];
    if (cap && authForm.endDate > cap) {
      addToast({ type: 'warning', title: '授权结束日不得超过雇佣或培训有效期', description: cap });
      return;
    }
    const allAuths = rows.flatMap((r) => r.authorizations);
    const old = authForm.replaceAuthNo ? detail.authorizations.find((a) => a.authNo === authForm.replaceAuthNo && a.approvalStatus === '通过' && !a.superseded) : undefined;
    const authNo = old?.authNo || allocAuthNo(allAuths.map((a) => a.authNo));
    const version = old ? old.version + 1 : 1;
    const id = version > 1 ? `${allocAuthId(allAuths.map((a) => a.id))}-V${version}` : allocAuthId(allAuths.map((a) => a.id));
    patch(detail.id, (cur) => ({
      ...cur,
      filingStatus: cur.status === '已备案' ? '变更待提交' : cur.filingStatus,
      status: cur.status === '已备案' ? '变更待提交' : cur.status,
      authorizations: [{
        id, authNo, version, mahId: cur.mahId,
        productIds: authForm.products.map((p) => PRODUCT_IDS[p] || p),
        products: authForm.products, therapyAreas: authForm.therapyAreas, regions: authForm.regions,
        startDate: authForm.startDate, endDate: authForm.endDate, approvalStatus: '待审' as AuthApprovalStatus,
        fileName: authForm.fileName,
      }, ...cur.authorizations],
      timeline: pushLog(cur, '提交', `新增授权 ${authNo} V${version}`),
    }));
    addToast({ type: 'success', title: '授权申请已提交', description: old ? `将替代 ${old.authNo} V${old.version}` : authNo });
    setAuthOpen(false);
  }

  function decideAuth(authId: string, pass: boolean) {
    if (!detail) return;
    if (denySelfApprove(detail)) return;
    patch(detail.id, (cur) => {
      const target = cur.authorizations.find((a) => a.id === authId);
      let nextAuths = cur.authorizations.map((a) => a.id === authId ? { ...a, approvalStatus: (pass ? '通过' : '驳回') as AuthApprovalStatus } : a);
      if (pass && target) {
        nextAuths = nextAuths.map((a) => {
          if (a.authNo === target.authNo && a.id !== authId && a.approvalStatus === '通过' && !a.superseded) {
            return { ...a, superseded: true, supersededById: authId, approvalStatus: '撤销' as AuthApprovalStatus };
          }
          return a;
        });
      }
      const readyForFiling = (cur.status === '合格' || cur.status === '待合规确认') && pass && nextAuths.some((a) => a.approvalStatus === '通过' && !a.superseded);
      return {
        ...cur,
        authorizations: nextAuths,
        status: readyForFiling ? '待备案提交' : cur.status,
        timeline: pushLog(cur, pass ? '审核通过' : '审核驳回', pass ? '推广范围已确认，待登记国家备案结果' : '推广范围驳回', { after: readyForFiling ? '待备案提交' : cur.status }),
      };
    });
    addToast({ type: pass ? 'success' : 'warning', title: pass ? '推广范围已确认' : '推广范围已驳回' });
  }

  function runCheck() {
    if (!detail) return;
    const latest = rows.find((r) => r.id === detail.id) ?? detail;
    const vendor = vendors.find((v) => v.id === latest.providerId);
    setCheckResult(checkRepresentativeEligibility(latest, checkInput, vendor));
  }

  function simulateActivity() {
    if (!detail) return;
    const latest = rows.find((r) => r.id === detail.id) ?? detail;
    const vendor = vendors.find((v) => v.id === latest.providerId);
    const result = checkRepresentativeEligibility(latest, {
      product: latest.authorizations.find((a) => a.approvalStatus === '通过' && !a.superseded)?.products[0] || varieties[0],
      therapyArea: latest.authorizations.find((a) => a.approvalStatus === '通过' && !a.superseded)?.therapyAreas[0] || '心血管',
      region: latest.authorizations.find((a) => a.approvalStatus === '通过' && !a.superseded)?.regions[0] || '陕西',
      date: today(),
      hospital: '演示医院',
    }, vendor);
    if (result.verdict === 'BLOCK') {
      addToast({ type: 'error', title: '新活动无法提交', description: result.hits.filter((h) => h.result === 'BLOCK').map((h) => h.code).join('、') });
      return;
    }
    const id = allocActivityId(activities.map((a) => a.id));
    setActivities((prev) => [{ id, repId: latest.id, name: `模拟活动 ${id}`, startDate: today(), status: '未开始' }, ...prev]);
    addToast({ type: 'success', title: '已登记未开始活动', description: id });
  }

  function submitIncident() {
    if (!detail || !incident.type || !incident.fact || !incident.occurredAt || !incident.initialMeasure) {
      addToast({ type: 'warning', title: '请填写类型、事实、发生日期与初步措施' });
      return;
    }
    if (incident.risk === '高' && incident.evidenceFiles.length === 0) {
      addToast({ type: 'warning', title: '高风险必须上传证据' });
      return;
    }
    const id = allocIncidentId(rows.flatMap((r) => r.incidents.map((i) => i.id)));
    const no = allocIncidentNo(rows.flatMap((r) => r.incidents.map((i) => i.incidentNo)));
    const rec: ComplianceIncident = {
      ...incident,
      id,
      incidentNo: no,
      relatedRepId: detail.id,
      relatedRep: detail.name,
      relatedVendorId: detail.providerId || undefined,
      relatedVendor: detail.provider,
      relatedMahId: MAH_ID,
    };
    patch(detail.id, (cur) => ({
      ...cur,
      incidents: [rec, ...cur.incidents],
      status: incident.risk === '高' ? '冻结' : cur.status,
      timeline: pushLog(cur, '创建', `上报违规 ${no}`, { after: incident.risk === '高' ? '冻结' : cur.status }),
    }));
    if (incident.risk === '高') {
      setActivities((prev) => prev.map((a) => a.repId === detail.id && a.status === '未开始' ? { ...a, status: '不可执行' } : a));
    }
    addToast({ type: incident.risk === '高' ? 'error' : 'success', title: `事件 ${no} 已上报` });
    setIncidentOpen(false);
    setIncident(emptyIncident());
  }

  const providerOptions = vendors.map((v) => ({ value: v.id, label: v.name }));
  const filterFields = [
    { id: 'name', label: '代表 / 备案号', type: 'text' as const, placeholder: '姓名或备案号' },
    { id: 'status', label: '主状态', type: 'select' as const, options: REP_STATUSES.map((s) => ({ value: s, label: s })) },
    { id: 'provider', label: '所属服务商', type: 'select' as const, options: providerOptions },
    { id: 'filing', label: '备案状态', type: 'select' as const, options: ['有效', '未核验', '待核验', '失效', '无结果', '异常待人工确认'].map((s) => ({ value: s, label: s })) },
    { id: 'employment', label: '雇佣类型', type: 'select' as const, options: ['MAH直聘', '服务商派遣', '授权推广'].map((s) => ({ value: s, label: s })) },
  ];

  function setF<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const current = detail ? (rows.find((r) => r.id === detail.id) ?? detail) : null;
  const currentActs = current ? activities.filter((a) => a.repId === current.id) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="医药代表备案管理"
        description="药厂侧代表建档、合规确认、推广范围确认及国家备案结果登记。"
        dataRange={isVendor ? vendorNameOf(vendors, DEMO_VENDOR_ID) : '本企业全部代表'}
        actions={canWrite ? <Button variant="primary" size="md" icon={<UserPlus size={14} />} onClick={openCreate}>新建代表</Button> : undefined}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <InfoBanner>本模块仅演示药厂内部操作：备案专员完成国家平台操作后，在此登记备案号与回执；不连接国家平台接口。当前操作人 {actor.name}（{actor.id}）。</InfoBanner>
        {isCompliance && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12, color: '#374151' }}>
            <input type="checkbox" checked={asReviewer2} onChange={(e) => setAsReviewer2(e.target.checked)} />
            以复核人身份确认（{ACTORS.compliance2.id} {ACTORS.compliance2.name}）
          </label>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 12 }}>
          <MetricCard compact title="启用中" value={stats.enabled} icon={BadgeCheck} />
          <MetricCard compact title="待处理准入" value={stats.pending} icon={ClipboardCheck} iconColor="#C77A16" iconBg="#FEF3E2" urgency={stats.pending ? 'warning' : 'normal'} />
          <MetricCard compact title="冻结 / 整改" value={stats.frozen} icon={Snowflake} iconColor="#C73A3A" iconBg="#FEECEC" urgency={stats.frozen ? 'danger' : 'normal'} />
          <MetricCard compact title="30 天内授权到期" value={stats.expiring} icon={FileSearch} iconColor="#C77A16" iconBg="#FEF3E2" />
          <MetricCard compact title="可参与活动" value={stats.active} icon={ShieldCheck} subtitle="已备案且授权有效" />
        </div>

        <FilterBar
          fields={filterFields}
          values={filters}
          onChange={(id, val) => setFilters((p) => ({ ...p, [id]: val }))}
          onSearch={() => { setApplied(filters); setPage(1); }}
          onReset={() => { setFilters({}); setApplied({}); setPage(1); }}
          stats={<span style={{ fontSize: 13, color: '#667085' }}>共 <strong style={{ color: '#1F2937', fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</strong> 名代表</span>}
        />

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
              <thead>
                <tr>
                  {['代表', '证件号', '雇佣 / 服务商', '主状态', '备案号 / 状态', '培训有效期', '有效授权', '可参与活动', '操作'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr><td colSpan={9}><EmptyState title="暂无代表" description="调整筛选或新建代表档案" /></td></tr>
                ) : pageData.map((r, idx) => {
                  const join = canRepJoinActivity(r);
                  const auth = authorizationIndicator(r, today());
                  return (
                    <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>{r.id}</div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#667085' }}>
                        {canSeeFullId ? r.idNo : maskIdNo(r.idNo)}
                      </td>
                      <td style={tdStyle}>
                        <div>{r.employmentType}</div>
                        <div style={{ fontSize: 12, color: '#9CA3AF' }}>{r.providerId ? r.provider : r.mah}</div>
                      </td>
                      <td style={tdStyle}><StatusTag status={r.status as never} /></td>
                      <td style={tdStyle}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, marginBottom: 4 }}>{r.filingNo || '待取得'}</div>
                        <StatusTag status={r.filingStatus as never} size="sm" />
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{r.trainingValidUntil || '—'}</td>
                      <td style={tdStyle}><StatusTag status={auth} size="sm" /></td>
                      <td style={tdStyle}>
                        <span style={{ color: join ? '#248A5A' : '#C73A3A', fontWeight: 600, fontSize: 12 }}>{join ? '是 · 限授权范围' : '否'}</span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <Button variant="ghost" size="sm" onClick={() => { setDetail(r); setDetailTab('档案'); }}>查看</Button>
                          {canWrite && ['草稿', '待合规确认', '补件中', '驳回'].includes(r.status) && (
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>编辑</Button>
                          )}
                          {canApprove && r.status === '待合规确认' && (
                            <Button variant="ghost" size="sm" onClick={() => approve(r)}>通过</Button>
                          )}
                          {canApprove && r.status === '启用' && (
                            <Button variant="ghost" size="sm" onClick={() => { setDetail(r); setFreezeReason(''); setFreezeEvidence(''); setFreezeOpen(true); }}>冻结</Button>
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

      <Modal
        open={!!current}
        title={current ? `代表档案 · ${current.name}` : ''}
        onClose={() => setDetail(null)}
        width={960}
        footer={current && (
          <>
            <Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>
            {canWrite && ['草稿', '待合规确认', '补件中', '驳回'].includes(current.status) && (
              <Button variant="secondary" onClick={() => openEdit(current)}>编辑资料</Button>
            )}
            {canApprove && current.status === '待合规确认' && (
              <>
                <Button variant="outline" onClick={() => { setSupplyTarget(current); setSupplyNote(''); }}>要求补件</Button>
                <Button variant="danger" onClick={() => { setRejectTarget(current); setRejectReason(''); }}>驳回</Button>
                <Button variant="primary" icon={<BadgeCheck size={14} />} onClick={() => approve(current)}>准入通过</Button>
              </>
            )}
            {canApprove && ['启用', '已备案'].includes(current.status) && (
              <Button variant="danger" icon={<Ban size={14} />} onClick={() => { setFreezeReason(''); setFreezeEvidence(''); setFreezeOpen(true); }}>冻结</Button>
            )}
            {canApprove && current.status === '冻结' && (
              <Button variant="outline" onClick={() => { setRectify({ measure: '', owner: '', due: '' }); setRectifyOpen(true); }}>登记整改</Button>
            )}
            {canApprove && current.status === '整改中' && (
              <Button variant="outline" onClick={() => { setReviewNote(current.investigationConclusion || ''); setReviewOpen(true); }}>提交复核</Button>
            )}
            {canApprove && current.status === '复核中' && (
              <Button variant="primary" onClick={() => secondUnfreeze(current)}>复核解冻（第二人）</Button>
            )}
            <Button variant="primary" icon={<ShieldCheck size={14} />} onClick={() => { setCheckResult(null); setCheckOpen(true); }}>活动准入校验</Button>
          </>
        )}
      >
        {current && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <StatusTag status={current.status as never} />
                  <StatusTag status={current.filingStatus as never} />
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>{current.id} · {current.mahId} · 发起人 {current.initiatorName}（{current.initiatorId}）</span>
                </div>
                <div style={{ fontSize: 13, color: '#667085' }}>
                  {current.employmentType} · {current.provider} · 备案号 {current.filingNo || '待取得'} · <StatusTag status={authorizationIndicator(current, today())} size="sm" />
                </div>
              </div>
              <div style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, height: 'fit-content',
                background: canRepJoinActivity(current) ? '#E6F5ED' : '#FEECEC',
                color: canRepJoinActivity(current) ? '#248A5A' : '#C73A3A',
              }}>
                {canRepJoinActivity(current) ? '可参与活动（限授权范围）' : '不可参与活动'}
              </div>
            </div>

            <Tabs
              value={detailTab}
              onChange={(id) => setDetailTab(id as DetailTab)}
              items={[
                { id: '档案', label: '档案' },
                { id: '备案核验', label: '国家备案', count: current.verifications.length },
                { id: '授权', label: '授权', count: current.authorizations.length },
                { id: '培训承诺', label: '培训与承诺' },
                { id: '违规', label: '违规处置', count: current.incidents.length },
                { id: '活动', label: '活动', count: currentActs.length },
                { id: '审计', label: '审计轨迹' },
              ]}
            />

            {detailTab === '档案' && (
              <>
                <FieldGroup title="基本信息">
                  <FieldItem label="姓名" value={current.name} />
                  <FieldItem label="证件号" value={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{canSeeFullId ? current.idNo : maskIdNo(current.idNo)}</span>} />
                  <FieldItem label="手机号" value={canSeeFullId ? current.mobile : maskMobile(current.mobile)} />
                  <FieldItem label="邮箱" value={current.email} />
                </FieldGroup>
                <FieldGroup title="雇佣关系">
                  <FieldItem label="雇佣/授权类型" value={current.employmentType} />
                  <FieldItem label="MAH" value={`${current.mah}（${current.mahId}）`} />
                  <FieldItem label="服务商" value={current.providerId ? `${current.provider}（${current.providerId}）` : 'MAH直聘'} />
                  <FieldItem label="起止日期" value={`${current.employStart} ~ ${current.employEnd}`} />
                </FieldGroup>
                <FieldGroup title="国家备案">
                  <FieldItem label="备案号" value={current.filingNo || '待取得'} />
                  <FieldItem label="备案状态" value={<StatusTag status={current.filingStatus as never} />} />
                  <FieldItem label="登记时间" value={current.filingSubmittedAt || '—'} />
                  <FieldItem label="备案回执" value={current.filingReceipt || '未上传'} />
                </FieldGroup>
                <FieldGroup title="推广授权">
                  <FieldItem label="有效授权" value={<StatusTag status={authorizationIndicator(current, today())} />} />
                  <FieldItem label="合同/授权书编号" value={current.contractOrAuthNo || activeAuthorizations(current, today())[0]?.authNo || '—'} />
                  <FieldItem label="当前授权范围" value={activeAuthorizations(current, today()).length ? activeAuthorizations(current, today()).map((a) => `${a.regions.join('、')} · 至 ${a.endDate}`).join('；') : '—'} span />
                </FieldGroup>
                <FieldGroup title="风险核验">
                  <FieldItem label="结果" value={current.riskCheckResult} />
                  <FieldItem label="日期" value={current.riskCheckDate || '—'} />
                  <FieldItem label="证据" value={current.riskCheckEvidence || '未上传'} span />
                </FieldGroup>
              </>
            )}

            {detailTab === '备案核验' && (
              <>
                <InfoBanner tone="warning">备案专员在国家平台完成操作后，回填备案号与回执。推广范围发生变更后，需要重新登记变更结果。</InfoBanner>
                <FieldGroup title="当前国家备案信息">
                  <FieldItem label="备案号" value={current.filingNo || '待取得'} />
                  <FieldItem label="备案状态" value={<StatusTag status={current.filingStatus as never} />} />
                  <FieldItem label="登记时间" value={current.filingSubmittedAt || '—'} />
                  <FieldItem label="备案回执" value={current.filingReceipt || '未上传'} />
                </FieldGroup>
                {canApprove && ['待备案提交', '变更待提交'].includes(current.status) && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <Button variant="primary" size="sm" icon={<FileSearch size={13} />} onClick={() => {
                      setVerify({ queryKey: current.filingNo || '', result: '有效', method: '人工核验', evidence: '', summary: '' });
                      setVerifyOpen(true);
                    }}>登记国家备案结果</Button>
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['任务号', '备案号', '结果', '登记方式', '登记人', '时间', '证据'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {current.verifications.length === 0 ? (
                      <tr><td colSpan={7} style={{ ...tdStyle, color: '#9CA3AF' }}>暂无历史备案记录</td></tr>
                    ) : current.verifications.map((v) => (
                      <tr key={v.id}>
                        <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{v.taskNo}</td>
                        <td style={tdStyle}>{v.queryKey}</td>
                        <td style={tdStyle}><StatusTag status={v.result as never} /></td>
                        <td style={tdStyle}>{v.method}</td>
                        <td style={tdStyle}>{v.verifier}</td>
                        <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{v.verifiedAt}</td>
                        <td style={tdStyle}>{v.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {detailTab === '授权' && (
              <>
                <InfoBanner>变更须创建新版本并保留同一授权号。新版本通过后旧版本 superseded 并终止。</InfoBanner>
                {(canWrite || canApprove) && ['合格', '待合规确认', '待备案提交', '已备案', '变更待提交'].includes(current.status) && (
                  <div style={{ marginBottom: 12 }}>
                    <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => {
                      const live = current.authorizations.find((a) => a.approvalStatus === '通过' && !a.superseded);
                      setAuthForm({
                        replaceAuthNo: live?.authNo || '',
                        products: [], therapyAreas: [], regions: [],
                        startDate: current.employStart, endDate: current.employEnd,
                        fileName: `授权文件-${current.name}.pdf`,
                      });
                      setAuthOpen(true);
                    }}>新增 / 变更授权</Button>
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['授权编号', '版本', '责任MAH', '产品', '区域', '有效期', '审批', '操作'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {current.authorizations.length === 0 ? (
                      <tr><td colSpan={8} style={{ ...tdStyle, color: '#9CA3AF' }}>暂无授权。合格代表在授权通过前不能启用。</td></tr>
                    ) : [...current.authorizations].sort((a, b) => a.authNo.localeCompare(b.authNo) || b.version - a.version).map((a) => (
                      <tr key={a.id} style={{ opacity: a.superseded ? 0.55 : 1 }}>
                        <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{a.authNo}</td>
                        <td style={tdStyle}>V{a.version}{a.superseded ? ' · 历史' : ''}</td>
                        <td style={tdStyle}>{a.mahId}</td>
                        <td style={tdStyle}>{a.products.join('、')}</td>
                        <td style={tdStyle}>{a.regions.join('、')}</td>
                        <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{a.startDate} ~ {a.endDate}</td>
                        <td style={tdStyle}><StatusTag status={a.approvalStatus as never} /></td>
                        <td style={tdStyle}>
                          {canApprove && a.approvalStatus === '待审' && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <Button variant="ghost" size="sm" onClick={() => decideAuth(a.id, true)}>通过</Button>
                              <Button variant="ghost" size="sm" onClick={() => decideAuth(a.id, false)}>驳回</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {detailTab === '培训承诺' && (
              <FieldGroup title="培训考核与合规承诺">
                <FieldItem label="培训计划" value={current.trainingPlan} />
                <FieldItem label="成绩 / 有效期" value={`${current.examScore || '—'} / ${current.trainingValidUntil || '—'}`} />
                <FieldItem label="承诺书版本" value={current.pledgeVersion || '—'} />
                <FieldItem label="当前有效模板" value={CURRENT_PLEDGE_TEMPLATE} />
              </FieldGroup>
            )}

            {detailTab === '违规' && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Button variant="primary" size="sm" onClick={() => { setIncident({ ...emptyIncident(), relatedRepId: current.id }); setIncidentOpen(true); }}>上报事件</Button>
                </div>
                {current.incidents.length === 0 ? (
                  <EmptyState title="无违规事件" description="高风险将立即冻结代表及未开始活动" />
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>{['事件编号', '来源', '类型', '等级', '关联', '措施 / 期限', '状态'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {current.incidents.map((i) => (
                        <tr key={i.id}>
                          <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{i.incidentNo}</td>
                          <td style={tdStyle}>{i.source}</td>
                          <td style={tdStyle}>{i.type}</td>
                          <td style={tdStyle}><StatusTag status={(i.risk === '高' ? '高风险' : i.risk === '中' ? '中风险' : '低风险') as never} /></td>
                          <td style={{ ...tdStyle, fontSize: 12 }}>{[i.relatedRepId, i.relatedVendorId, i.relatedProjectId].filter(Boolean).join(' / ') || '—'}</td>
                          <td style={{ ...tdStyle, fontSize: 12 }}>{i.initialMeasure} · {i.dueDate || '—'}</td>
                          <td style={tdStyle}>{i.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}

            {detailTab === '活动' && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Button variant="primary" size="sm" onClick={simulateActivity}>模拟提交新活动</Button>
                </div>
                {currentActs.length === 0 ? <EmptyState title="无演示活动" description="冻结时未开始活动会标为不可执行" /> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>{['活动编号', '名称', '开始日', '状态'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {currentActs.map((a) => (
                        <tr key={a.id}>
                          <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{a.id}</td>
                          <td style={tdStyle}>{a.name}</td>
                          <td style={tdStyle}>{a.startDate}</td>
                          <td style={tdStyle}><StatusTag status={a.status as never} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}

            {detailTab === '审计' && (
              <div>
                {current.timeline.map((e, idx) => (
                  <div key={e.id} style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
                    {idx < current.timeline.length - 1 && <div style={{ position: 'absolute', left: 7, top: 16, bottom: 0, width: 2, background: '#E5E7EB' }} />}
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#E8F4F1', border: '2px solid #176B5B', flexShrink: 0, zIndex: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{e.action} · {e.id}</div>
                      <div style={{ fontSize: 12, color: '#9CA3AF' }}>{e.operator}（{e.operatorId || '—'}） · {e.role} · {e.time}</div>
                      {(e.before || e.after) && <div style={{ fontSize: 12, color: '#667085' }}>{e.before || '—'} → {e.after || '—'}</div>}
                      {e.approvalId && <div style={{ fontSize: 12, color: '#667085' }}>审批单 {e.approvalId}</div>}
                      {e.comment && <div style={{ marginTop: 6, fontSize: 13, background: '#F9FAFB', padding: '8px 10px', borderRadius: 6 }}>{e.comment}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={formOpen} title={editingId ? '编辑代表档案' : '新建代表档案'} onClose={() => setFormOpen(false)} width={760} footer={
        <>
          <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
          {formStep > 0 && <Button variant="ghost" onClick={() => setFormStep((s) => s - 1)}>上一步</Button>}
          {formStep < 2 && <Button variant="primary" onClick={() => setFormStep((s) => s + 1)}>下一步</Button>}
          {formStep === 2 && (
            <>
              <Button variant="secondary" onClick={() => saveForm(false)}>保存草稿</Button>
              <Button variant="primary" onClick={() => saveForm(true)}>提交合规确认</Button>
            </>
          )}
        </>
      }>
        <Stepper steps={['基本信息与雇佣', '学历培训承诺', '合同/授权资料']} current={formStep} />
        {formError && <div style={{ color: '#C73A3A', fontSize: 13, marginBottom: 12 }}>{formError}</div>}
        {formStep === 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="姓名" required><input value={form.name} onChange={(e) => setF('name', e.target.value)} style={inputStyle} /></Field>
            <Field label="性别" required><select value={form.gender || ''} onChange={(e) => setF('gender', e.target.value as Representative['gender'])} style={inputStyle}><option value="">请选择</option><option>男</option><option>女</option></select></Field>
            <Field label="照片" required><input value={form.photoFile || ''} onChange={(e) => setF('photoFile', e.target.value)} placeholder="照片文件名" style={inputStyle} /></Field>
            <Field label="证件号" required><input value={form.idNo} onChange={(e) => setF('idNo', e.target.value)} style={inputStyle} /></Field>
            <Field label="手机号" required><input value={form.mobile} onChange={(e) => setF('mobile', e.target.value)} style={inputStyle} /></Field>
            <Field label="邮箱" required><input value={form.email} onChange={(e) => setF('email', e.target.value)} style={inputStyle} /></Field>
            <Field label="雇佣/授权类型" required>
              <select value={form.employmentType} onChange={(e) => setF('employmentType', e.target.value as Representative['employmentType'])} style={inputStyle}>
                <option>MAH直聘</option><option>服务商派遣</option><option>授权推广</option>
              </select>
            </Field>
            <Field label="所属服务商">
              <select value={form.providerId || ''} onChange={(e) => setF('providerId', e.target.value || null)} style={inputStyle}>
                <option value="">MAH直聘</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="雇佣开始" required><input type="date" value={form.employStart} onChange={(e) => setF('employStart', e.target.value)} style={inputStyle} /></Field>
            <Field label="雇佣结束" required><input type="date" value={form.employEnd} onChange={(e) => setF('employEnd', e.target.value)} style={inputStyle} /></Field>
          </div>
        )}
        {formStep === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="学历" required>
              <select value={form.education} onChange={(e) => setF('education', e.target.value)} style={inputStyle}>
                {['大专', '本科', '硕士', '博士', '高中'].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="专业" required>
              <select value={form.major} onChange={(e) => setF('major', e.target.value)} style={inputStyle}>
                <option value="">请选择</option>
                {MED_MAJORS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="毕业院校" required><input value={form.school} onChange={(e) => setF('school', e.target.value)} style={inputStyle} /></Field>
            <Field label="学历证明" required><input value={form.eduProof} onChange={(e) => setF('eduProof', e.target.value)} style={inputStyle} /></Field>
            <Field label="培训计划" required><input value={form.trainingPlan} onChange={(e) => setF('trainingPlan', e.target.value)} style={inputStyle} /></Field>
            <Field label="培训完成日期" required><input type="date" value={form.trainingDate} onChange={(e) => setF('trainingDate', e.target.value)} style={inputStyle} /></Field>
            <Field label="考试成绩" required><input type="number" value={form.examScore || ''} onChange={(e) => setF('examScore', Number(e.target.value))} style={inputStyle} /></Field>
            <Field label="培训有效期" required><input type="date" value={form.trainingValidUntil} onChange={(e) => setF('trainingValidUntil', e.target.value)} style={inputStyle} /></Field>
            <Field label="培训证书" required><input value={form.trainingCert} onChange={(e) => setF('trainingCert', e.target.value)} style={inputStyle} /></Field>
            <Field label="承诺书版本" required><input value={form.pledgeVersion} onChange={(e) => setF('pledgeVersion', e.target.value)} style={inputStyle} /></Field>
            <Field label="签署日期" required><input type="date" value={form.pledgeDate} onChange={(e) => setF('pledgeDate', e.target.value)} style={inputStyle} /></Field>
            <Field label="承诺附件" required><input value={form.pledgeFile} onChange={(e) => setF('pledgeFile', e.target.value)} style={inputStyle} /></Field>
          </div>
        )}
        {formStep === 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="劳动合同/授权书编号" required><input value={form.contractOrAuthNo || ''} onChange={(e) => setF('contractOrAuthNo', e.target.value)} style={inputStyle} /></Field>
            <Field label="合同/授权书附件" required><input value={form.agreementFile || ''} onChange={(e) => setF('agreementFile', e.target.value)} style={inputStyle} /></Field>
            <Field label="备案号" span><input value="待取得（国家平台完成备案后由备案专员回填）" disabled style={{ ...inputStyle, color: '#667085', background: '#F9FAFB' }} /></Field>
            <InfoBanner tone="warning">国家备案号始终可见：新建时显示“待取得”；备案专员完成国家平台操作后，在详情页「国家备案」中登记正式备案号与回执。</InfoBanner>
          </div>
        )}
      </Modal>

      <Modal open={verifyOpen} title="登记国家备案结果" onClose={() => setVerifyOpen(false)} width={560} footer={
        <><Button variant="outline" onClick={() => setVerifyOpen(false)}>取消</Button><Button variant="primary" onClick={submitVerify}>确认登记</Button></>
      }>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="国家备案号" required span><input value={verify.queryKey} onChange={(e) => setVerify((v) => ({ ...v, queryKey: e.target.value }))} style={inputStyle} /></Field>
          <Field label="备案回执" required span><input value={verify.evidence} onChange={(e) => setVerify((v) => ({ ...v, evidence: e.target.value }))} placeholder="备案信息表或回执文件名" style={inputStyle} /></Field>
        </div>
      </Modal>

      <Modal open={authOpen} title="新增 / 变更代表授权" onClose={() => setAuthOpen(false)} width={640} footer={
        <><Button variant="outline" onClick={() => setAuthOpen(false)}>取消</Button><Button variant="primary" onClick={submitAuth}>提交授权审批</Button></>
      }>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="替代已有授权号（变更时必选）" span>
            <select value={authForm.replaceAuthNo} onChange={(e) => setAuthForm((f) => ({ ...f, replaceAuthNo: e.target.value }))} style={inputStyle}>
              <option value="">全新授权号</option>
              {[...new Set((current?.authorizations || []).map((a) => a.authNo))].map((n) => <option key={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="药品/产品" span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {varieties.map((v) => {
                const on = authForm.products.includes(v);
                return (
                  <button key={v} type="button" onClick={() => {
                    const products = on ? authForm.products.filter((x) => x !== v) : [...authForm.products, v];
                    setAuthForm((f) => ({ ...f, products, therapyAreas: [...new Set(products.map((p) => PRODUCT_THERAPY[p]).filter(Boolean))] }));
                  }} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${on ? '#176B5B' : '#E5E7EB'}`, background: on ? '#E8F4F1' : '#fff', color: on ? '#176B5B' : '#374151', fontSize: 12, cursor: 'pointer' }}>{v}</button>
                );
              })}
            </div>
          </Field>
          <Field label="开始日期" required><input type="date" value={authForm.startDate} onChange={(e) => setAuthForm((f) => ({ ...f, startDate: e.target.value }))} style={inputStyle} /></Field>
          <Field label="结束日期" required><input type="date" value={authForm.endDate} onChange={(e) => setAuthForm((f) => ({ ...f, endDate: e.target.value }))} style={inputStyle} /></Field>
          <Field label="推广区域" span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflow: 'auto' }}>
              {REGION_OPTIONS.map((r) => {
                const on = authForm.regions.includes(r);
                return (
                  <button key={r} type="button" onClick={() => setAuthForm((f) => ({ ...f, regions: on ? f.regions.filter((x) => x !== r) : [...f.regions, r] }))} style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid ${on ? '#176B5B' : '#E5E7EB'}`, background: on ? '#E8F4F1' : '#fff', color: on ? '#176B5B' : '#374151', fontSize: 12, cursor: 'pointer' }}>{r}</button>
                );
              })}
            </div>
          </Field>
        </div>
      </Modal>

      <Modal open={checkOpen} title={current ? `活动准入校验 · ${current.name}` : '活动准入校验'} onClose={() => setCheckOpen(false)} width={820} footer={<Button variant="outline" onClick={() => setCheckOpen(false)}>关闭</Button>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <Field label="产品">
            <select value={checkInput.product} onChange={(e) => {
              const product = e.target.value;
              setCheckInput((c) => ({ ...c, product, therapyArea: PRODUCT_THERAPY[product] || c.therapyArea }));
            }} style={inputStyle}>
              {varieties.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="治疗领域"><input value={checkInput.therapyArea} onChange={(e) => setCheckInput((c) => ({ ...c, therapyArea: e.target.value }))} style={inputStyle} /></Field>
          <Field label="活动区域">
            <select value={checkInput.region} onChange={(e) => setCheckInput((c) => ({ ...c, region: e.target.value }))} style={inputStyle}>
              {REGION_OPTIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="活动日期"><input type="date" value={checkInput.date} onChange={(e) => setCheckInput((c) => ({ ...c, date: e.target.value }))} style={inputStyle} /></Field>
        </div>
        <Button variant="primary" icon={<RefreshCw size={14} />} onClick={runCheck}>执行 checkRepresentativeEligibility</Button>
        <div style={{ height: 12 }} />
        {checkResult && <EligibilityPanel result={checkResult} />}
      </Modal>

      <Modal open={freezeOpen} title="冻结代表" onClose={() => setFreezeOpen(false)} width={480} footer={
        <><Button variant="outline" onClick={() => setFreezeOpen(false)}>取消</Button><Button variant="danger" onClick={confirmFreeze} disabled={!freezeReason.trim() || !freezeEvidence.trim()}>确认冻结</Button></>
      }>
        <InfoBanner tone="warning">未开始活动将标记为不可执行。解冻须走 冻结→整改中→复核中，且终审人不得为发起人。</InfoBanner>
        <Field label="冻结原因" required><textarea value={freezeReason} onChange={(e) => setFreezeReason(e.target.value)} rows={3} style={{ ...inputStyle, height: 'auto', padding: 10 }} /></Field>
        <div style={{ height: 8 }} />
        <Field label="证据附件" required><input value={freezeEvidence} onChange={(e) => setFreezeEvidence(e.target.value)} style={inputStyle} /></Field>
      </Modal>

      <Modal open={rectifyOpen} title="登记整改" onClose={() => setRectifyOpen(false)} width={480} footer={
        <><Button variant="outline" onClick={() => setRectifyOpen(false)}>取消</Button><Button variant="primary" onClick={confirmRectify} disabled={!rectify.measure || !rectify.owner || !rectify.due}>进入整改中</Button></>
      }>
        <Field label="整改措施" required><textarea value={rectify.measure} onChange={(e) => setRectify((s) => ({ ...s, measure: e.target.value }))} rows={3} style={{ ...inputStyle, height: 'auto', padding: 10 }} /></Field>
        <div style={{ height: 8 }} />
        <Field label="责任人" required><input value={rectify.owner} onChange={(e) => setRectify((s) => ({ ...s, owner: e.target.value }))} style={inputStyle} /></Field>
        <div style={{ height: 8 }} />
        <Field label="完成期限" required><input type="date" value={rectify.due} onChange={(e) => setRectify((s) => ({ ...s, due: e.target.value }))} style={inputStyle} /></Field>
      </Modal>

      <Modal open={reviewOpen} title="提交解冻复核" onClose={() => setReviewOpen(false)} width={480} footer={
        <><Button variant="outline" onClick={() => setReviewOpen(false)}>取消</Button><Button variant="primary" onClick={submitToReview}>进入复核中</Button></>
      }>
        <Field label="调查结论" required><textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={4} style={{ ...inputStyle, height: 'auto', padding: 10 }} /></Field>
      </Modal>

      <Modal open={!!rejectTarget} title="驳回准入" onClose={() => setRejectTarget(null)} width={480} footer={
        <><Button variant="outline" onClick={() => setRejectTarget(null)}>取消</Button><Button variant="danger" onClick={confirmReject} disabled={!rejectReason.trim()}>确认驳回</Button></>
      }>
        <Field label="驳回原因" required><textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} style={{ ...inputStyle, height: 'auto', padding: 10 }} /></Field>
      </Modal>

      <Modal open={!!supplyTarget} title="要求补件" onClose={() => setSupplyTarget(null)} width={480} footer={
        <><Button variant="outline" onClick={() => setSupplyTarget(null)}>取消</Button><Button variant="primary" onClick={confirmSupply}>发送补件通知</Button></>
      }>
        <Field label="缺件说明"><textarea value={supplyNote} onChange={(e) => setSupplyNote(e.target.value)} rows={4} style={{ ...inputStyle, height: 'auto', padding: 10 }} /></Field>
      </Modal>

      <Modal open={incidentOpen} title="上报违规事件" onClose={() => setIncidentOpen(false)} width={640} footer={
        <><Button variant="outline" onClick={() => setIncidentOpen(false)}>取消</Button><Button variant="primary" onClick={submitIncident}>提交</Button></>
      }>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="来源" required>
            <select value={incident.source} onChange={(e) => setIncident((s) => ({ ...s, source: e.target.value as ComplianceIncident['source'] }))} style={inputStyle}>
              {['内审', '投诉', '监管', '业务发现', '系统预警'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="风险等级" required>
            <select value={incident.risk} onChange={(e) => setIncident((s) => ({ ...s, risk: e.target.value as ComplianceIncident['risk'] }))} style={inputStyle}>
              <option>高</option><option>中</option><option>低</option>
            </select>
          </Field>
          <Field label="类型" required><input value={incident.type} onChange={(e) => setIncident((s) => ({ ...s, type: e.target.value }))} style={inputStyle} /></Field>
          <Field label="发生日期" required><input type="date" value={incident.occurredAt} onChange={(e) => setIncident((s) => ({ ...s, occurredAt: e.target.value }))} style={inputStyle} /></Field>
          <Field label="事实描述" required span><textarea value={incident.fact} onChange={(e) => setIncident((s) => ({ ...s, fact: e.target.value }))} rows={3} style={{ ...inputStyle, height: 'auto', padding: 10 }} /></Field>
          <Field label="初步措施" required span><input value={incident.initialMeasure} onChange={(e) => setIncident((s) => ({ ...s, initialMeasure: e.target.value }))} style={inputStyle} /></Field>
          <Field label="证据文件名"><input value={incident.evidenceFiles[0] || ''} onChange={(e) => setIncident((s) => ({ ...s, evidenceFiles: e.target.value ? [e.target.value] : [] }))} style={inputStyle} /></Field>
          <Field label="完成期限"><input type="date" value={incident.dueDate} onChange={(e) => setIncident((s) => ({ ...s, dueDate: e.target.value }))} style={inputStyle} /></Field>
          <Field label="关联项目 ID"><input value={incident.relatedProjectId || ''} onChange={(e) => setIncident((s) => ({ ...s, relatedProjectId: e.target.value }))} style={inputStyle} /></Field>
          <Field label="关联合同 ID"><input value={incident.relatedContractId || ''} onChange={(e) => setIncident((s) => ({ ...s, relatedContractId: e.target.value }))} style={inputStyle} /></Field>
        </div>
      </Modal>
    </div>
  );
}

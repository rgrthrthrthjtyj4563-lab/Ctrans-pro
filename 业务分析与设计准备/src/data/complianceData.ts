import type {
  AcceptanceRecord,
  Actor,
  ComplianceAuditEvent,
  ComplianceIncident,
  DemoActivity,
  EligibilityHit,
  EligibilityResult,
  EligibilityVerdict,
  FilingBatchTask,
  Representative,
  RepAuthorization,
  RepTraining,
  Role,
  SelectionRecord,
  Vendor,
  VendorContract,
  VendorCreditCompliance,
  VendorDocument,
  VendorDueDiligence,
  VendorProject,
} from '../types';
import { DEMO_HOLDER, DEMO_PROVIDER, providers, varieties } from './mockData';

export const MAH_NAME = DEMO_HOLDER;
export const MAH_ID = 'MAH-001';
export const DEMO_VENDOR_ID = 'VND-001';
export const CURRENT_PLEDGE_TEMPLATE = '反商业贿赂承诺书 V2026.1';
export const BIZ_YEAR = 2026;
export const THERAPY_AREAS = ['心血管', '内分泌', '消化', '肿瘤'] as const;
export const SERVICE_TYPES = ['学术推广', '会议组织', '问卷调研', '分析报告'] as const;

export const PRODUCT_THERAPY: Record<string, string> = {
  '阿托伐他汀钙片(20mg)': '心血管',
  '二甲双胍缓释片(500mg)': '内分泌',
  '奥美拉唑肠溶胶囊(20mg)': '消化',
  '氨氯地平片(5mg)': '心血管',
  '瑞舒伐他汀钙片(10mg)': '心血管',
};

export const PRODUCT_IDS: Record<string, string> = {
  '阿托伐他汀钙片(20mg)': 'V-001',
  '二甲双胍缓释片(500mg)': 'V-002',
  '奥美拉唑肠溶胶囊(20mg)': 'V-003',
  '氨氯地平片(5mg)': 'V-004',
  '瑞舒伐他汀钙片(10mg)': 'V-005',
};

export const ACTORS = {
  sales: { id: 'U-SALES-01', name: '李强', role: '药厂销售部门' },
  compliance: { id: 'U-COMP-01', name: '周敏', role: '药厂合规部门' },
  compliance2: { id: 'U-COMP-02', name: '吴岚', role: '合规复核人' },
  vendor: { id: 'U-VND-01', name: '钱薇', role: '服务提供商' },
} as const;

export function actorOf(role: Role): Actor {
  if (role === '药厂合规部门') return ACTORS.compliance;
  if (role === '服务提供商') return ACTORS.vendor;
  return ACTORS.sales;
}

export function canFinalApprove(actorId: string, initiatorId: string, previousAssigneeId?: string): string | null {
  if (actorId === initiatorId) return '同一用户发起的申请不能由本人完成最终审批';
  if (previousAssigneeId && actorId === previousAssigneeId) return '终审人不得与上一审批人为同一人';
  return null;
}

export function bizToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysUntil(date: string, from = bizToday()): number | null {
  if (!date) return null;
  const a = Date.parse(`${date}T00:00:00`);
  const b = Date.parse(`${from}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

export function reminderHit(date: string, windows: number[]): { days: number; window: number | 'expired' } | null {
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < 0) return { days, window: 'expired' };
  const hit = windows.find((w) => days <= w);
  if (hit === undefined) return null;
  return { days, window: hit };
}

export function nextNumeric(existing: string[], regex: RegExp, pad: number): string {
  let max = 0;
  for (const s of existing) {
    const m = s.match(regex);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return String(max + 1).padStart(pad, '0');
}

export function allocRepId(rows: { id: string }[]) {
  return `REP-${nextNumeric(rows.map((r) => r.id), /^REP-(\d+)/, 3)}`;
}
export function allocVendorId(rows: { id: string }[]) {
  return `VND-${nextNumeric(rows.map((r) => r.id), /^VND-(\d+)/, 3)}`;
}
export function allocAuthId(existing: string[]) {
  return `AUTH-R-${nextNumeric(existing, /^AUTH-R-(\d+)/, 3)}`;
}
export function allocAuthNo(existing: string[]) {
  return `SQ-${BIZ_YEAR}-${nextNumeric(existing, /SQ-\d+-(\d+)/, 3)}`;
}
export function allocVerifyId(existing: string[]) {
  return `VF-${nextNumeric(existing, /^VF-(\d+)/, 3)}`;
}
export function allocVerifyTask(existing: string[]) {
  return `HY-${BIZ_YEAR}-${nextNumeric(existing, /HY-\d+-(\d+)/, 3)}`;
}
export function allocAccessNo(existing: string[]) {
  return `ZR-${BIZ_YEAR}-${nextNumeric(existing, /ZR-\d+-(\d+)/, 4)}`;
}
export function allocIncidentId(existing: string[]) {
  return `INC-${nextNumeric(existing, /^INC-(\d+)/, 3)}`;
}
export function allocIncidentNo(existing: string[]) {
  return `WF-${BIZ_YEAR}-${nextNumeric(existing, /WF-\d+-(\d+)/, 3)}`;
}
export function allocLogId(existing: string[]) {
  return `LOG-${nextNumeric(existing, /^LOG-(\d+)/, 4)}`;
}
export function allocBatchId(existing: string[]) {
  return `BVF-${nextNumeric(existing, /^BVF-(\d+)/, 3)}`;
}
export function allocActivityId(existing: string[]) {
  return `ACT-${nextNumeric(existing, /^ACT-(\d+)/, 3)}`;
}
export function allocSelId(existing: string[]) {
  return `SEL-${nextNumeric(existing, /^SEL-(\d+)/, 3)}`;
}
export function allocTrnId(existing: string[]) {
  return `TRN-${nextNumeric(existing, /^TRN-(\d+)/, 3)}`;
}
export function allocDocId(vendorId: string, existing: string[]) {
  const seq = vendorId.replace(/\D/g, '').padStart(3, '0');
  return `DOC-${seq}-${nextNumeric(existing, /DOC-\d+-(\d+)/, 2)}`;
}

export function fakeHash(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `sha256:${h.toString(16).padStart(8, '0')}`;
}

export function vendorNameOf(vendors: Vendor[], id: string | null): string {
  if (!id) return 'MAH直聘';
  return vendors.find((v) => v.id === id)?.name || '—';
}
export function repNameOf(reps: Representative[], id: string): string {
  return reps.find((r) => r.id === id)?.name || id;
}

let logSeq = 0;
function ev(time: string, operator: string, role: string, action: string, comment?: string, extra?: Partial<ComplianceAuditEvent>): ComplianceAuditEvent {
  logSeq += 1;
  return {
    id: `LOG-${String(logSeq).padStart(4, '0')}`,
    time,
    operator,
    role,
    action,
    comment,
    operatorId: extra?.operatorId,
    before: extra?.before,
    after: extra?.after,
    approvalId: extra?.approvalId,
    evidenceHash: extra?.evidenceHash,
  };
}

function auth(partial: Omit<RepAuthorization, 'mahId' | 'productIds'> & Partial<Pick<RepAuthorization, 'mahId' | 'productIds'>>): RepAuthorization {
  return {
    ...partial,
    mahId: partial.mahId || MAH_ID,
    productIds: partial.productIds?.length ? partial.productIds : partial.products.map((p) => PRODUCT_IDS[p] || p),
  };
}

function trn(id: string, repId: string, plan: string, completedAt: string, score: number, validUntil: string, cert: string): RepTraining {
  return { id, repId, planName: plan, completedAt, examScore: score, validUntil, certFile: cert };
}

function credit(ok: boolean, date = '2026-01-10'): VendorCreditCompliance | null {
  if (!ok) return null;
  return {
    antiBriberyPledgeFile: '反商业贿赂承诺书.pdf',
    antiBriberyPledgeDate: date,
    illegalCheck: '通过',
    dishonestCheck: '通过',
    lawsuitRisk: '无',
    evidenceFiles: ['信用核验截图.png'],
    checkedAt: date,
  };
}

function sel(id: string, vendorId: string, method: SelectionRecord['method'], note: string): SelectionRecord {
  return {
    id,
    vendorId,
    demandNo: `XQ-2026-${id.slice(-3)}`,
    method,
    processNote: note,
    awardReason: '综合评分最优且价格不偏离市场基准',
    evidenceFiles: ['比价记录.pdf'],
    createdAt: '2026-01-08',
  };
}

function dd(id: string, vendorId: string, total: number, grade: Vendor['riskGrade']): VendorDueDiligence {
  return {
    id,
    vendorId,
    scoreSubject: Math.round(total * 0.3),
    scoreRelated: Math.round(total * 0.25),
    scoreNature: Math.round(total * 0.2),
    scoreTax: Math.round(total * 0.15),
    scoreHistory: Math.round(total * 0.1),
    totalScore: total,
    suggestedGrade: grade,
    confirmedGrade: grade,
    confirmedById: ACTORS.compliance.id,
    confirmedByName: ACTORS.compliance.name,
    confirmedAt: '2026-03-01',
  };
}

export const seedRepresentatives: Representative[] = [
  {
    id: 'REP-001', name: '张伟', idType: '身份证', idNo: '110101198803151234', mobile: '13812340001', email: 'zhangwei@zhilian.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: DEMO_PROVIDER, providerId: 'VND-001',
    initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    employStart: '2025-01-01', employEnd: '2026-12-31',
    education: '本科', major: '药学', school: '中国药科大学', eduProof: '学历证明-张伟.pdf',
    trainings: [trn('TRN-001', 'REP-001', '2026 医药代表合规培训', '2026-03-12', 92, '2027-03-11', '培训证书-ZW-2026.pdf')],
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-03-12', pledgeFile: '承诺书-张伟.pdf',
    filingNo: 'YB-BJ-2026-10021', filingStatus: '有效', filingVerifiedAt: '2026-06-01 10:20',
    riskCheckResult: '通过', riskCheckDate: '2026-03-10', riskCheckEvidence: '风险核验回执-张伟.png', riskCheckOperator: ACTORS.compliance.name,
    status: '启用', nextVerifyDate: '2026-08-30',
    authorizations: [
      auth({ id: 'AUTH-R-001', authNo: 'SQ-2026-001', version: 2, mahId: MAH_ID, productIds: ['V-001', 'V-004'], products: ['阿托伐他汀钙片(20mg)', '氨氯地平片(5mg)'], therapyAreas: ['心血管'], regions: ['陕西', '江苏', '浙江', '广东'], startDate: '2026-04-01', endDate: '2026-12-31', approvalStatus: '通过', fileName: '授权文件-张伟-V2.pdf' }),
      auth({ id: 'AUTH-R-001-V1', authNo: 'SQ-2026-001', version: 1, mahId: MAH_ID, productIds: ['V-001'], products: ['阿托伐他汀钙片(20mg)'], therapyAreas: ['心血管'], regions: ['陕西', '江苏'], startDate: '2026-01-01', endDate: '2026-03-31', approvalStatus: '撤销', fileName: '授权文件-张伟-V1.pdf', superseded: true, supersededById: 'AUTH-R-001' }),
    ],
    verifications: [{ id: 'VF-001', taskNo: 'HY-2026-061', queryKey: 'YB-BJ-2026-10021', result: '有效', method: '人工核验', verifier: '周敏', verifiedAt: '2026-06-01 10:20', nextDate: '2026-08-30', evidence: '备案平台截图-061.png', summary: '姓名、MAH、备案号一致，状态有效' }],
    incidents: [],
    timeline: [
      ev('2025-12-20 09:00', '李强', '业务负责人', '创建', undefined, { operatorId: ACTORS.sales.id, after: '草稿' }),
      ev('2026-03-12 16:10', '李强', '业务负责人', '提交', '提交准入审批', { operatorId: ACTORS.sales.id, before: '草稿', after: '审核中' }),
      ev('2026-03-15 11:02', '周敏', 'MAH 合规管理员', '审核通过', undefined, { operatorId: ACTORS.compliance.id, before: '审核中', after: '合格' }),
      ev('2026-04-01 09:30', '周敏', 'MAH 合规管理员', '准入', '授权 V2 审批通过，状态变更为启用', { operatorId: ACTORS.compliance.id, before: '合格', after: '启用', approvalId: 'APV-2026-0001' }),
      ev('2026-06-01 10:20', '周敏', 'MAH 合规管理员', '核验', '定期复核通过', { operatorId: ACTORS.compliance.id, evidenceHash: fakeHash('备案平台截图-061.png') }),
    ],
  },
  {
    id: 'REP-002', name: '李强', idType: '身份证', idNo: '320102198511220018', mobile: '13900001234', email: 'liqiang@baiyi.com',
    employmentType: 'MAH直聘', mah: MAH_NAME, mahId: MAH_ID, provider: 'MAH直聘', providerId: null,
    initiatorId: ACTORS.sales.id, initiatorName: '王芳',
    employStart: '2024-06-01', employEnd: '2027-05-31',
    education: '硕士', major: '临床医学', school: '南京医科大学', eduProof: '学历证明-李强.pdf',
    trainings: [trn('TRN-002', 'REP-002', '2026 医药代表合规培训', '2026-02-20', 88, '2027-02-19', '培训证书-LQ-2026.pdf')],
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-02-20', pledgeFile: '承诺书-李强.pdf',
    filingNo: 'YB-JS-2026-08812', filingStatus: '有效', filingVerifiedAt: '2026-07-08 15:00',
    riskCheckResult: '通过', riskCheckDate: '2026-02-18', riskCheckEvidence: '风险核验-李强.png', riskCheckOperator: '周敏',
    status: '启用', nextVerifyDate: '2026-10-06',
    authorizations: [auth({ id: 'AUTH-R-002', authNo: 'SQ-2026-008', version: 1, mahId: MAH_ID, productIds: ['V-002'], products: ['二甲双胍缓释片(500mg)'], therapyAreas: ['内分泌'], regions: ['江苏', '浙江'], startDate: '2026-03-01', endDate: '2026-12-31', approvalStatus: '通过', fileName: '授权文件-李强.pdf' })],
    verifications: [{ id: 'VF-002', taskNo: 'HY-2026-078', queryKey: `${MAH_NAME} + 李强`, result: '有效', method: '人工核验', verifier: '周敏', verifiedAt: '2026-07-08 15:00', nextDate: '2026-10-06', evidence: '备案平台截图-078.png', summary: 'MAH+姓名查询一致' }],
    incidents: [],
    timeline: [ev('2026-02-25 14:40', '周敏', 'MAH 合规管理员', '审核通过', undefined, { operatorId: ACTORS.compliance.id, after: '启用' })],
  },
  {
    id: 'REP-003', name: '王芳', idType: '身份证', idNo: '440106199204080056', mobile: '13700005678', email: 'wangfang@dongfang.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '东方恒业推广有限公司', providerId: 'VND-002',
    initiatorId: ACTORS.sales.id, initiatorName: '陈静',
    employStart: '2026-05-01', employEnd: '2026-12-31',
    education: '本科', major: '药物制剂', school: '广东药科大学', eduProof: '学历证明-王芳.pdf',
    trainings: [trn('TRN-003', 'REP-003', '2026 医药代表合规培训', '2026-05-08', 85, '2027-05-07', '培训证书-WF-2026.pdf')],
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-05-08', pledgeFile: '承诺书-王芳.pdf',
    filingNo: 'YB-GD-2026-13044', filingStatus: '有效', filingVerifiedAt: '2026-05-10 09:40',
    riskCheckResult: '通过', riskCheckDate: '2026-05-09', riskCheckEvidence: '风险核验-王芳.png', riskCheckOperator: '周敏',
    status: '审核中', nextVerifyDate: '2026-08-08',
    authorizations: [],
    verifications: [{ id: 'VF-003', taskNo: 'HY-2026-090', queryKey: 'YB-GD-2026-13044', result: '有效', method: '人工核验', verifier: '周敏', verifiedAt: '2026-05-10 09:40', nextDate: '2026-08-08', evidence: '备案平台截图-090.png', summary: '备案有效' }],
    incidents: [],
    timeline: [ev('2026-05-12 17:05', '陈静', '业务负责人', '提交', '提交准入审批，待合规审核', { operatorId: ACTORS.sales.id, after: '审核中' })],
  },
  {
    id: 'REP-004', name: '刘洋', idType: '身份证', idNo: '370102199001120033', mobile: '13611112222', email: 'liuyang@kangsheng.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '康晟云服科技有限公司', providerId: 'VND-003',
    initiatorId: ACTORS.sales.id, initiatorName: '杨明',
    employStart: '2026-04-01', employEnd: '2026-12-31',
    education: '大专', major: '护理学', school: '山东医学高等专科学校', eduProof: '',
    trainings: [trn('TRN-004', 'REP-004', '2026 医药代表合规培训', '2026-04-15', 80, '2027-04-14', '培训证书-LY-2026.pdf')],
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-04-15', pledgeFile: '承诺书-刘洋.pdf',
    filingNo: 'YB-SD-2026-07701', filingStatus: '有效', filingVerifiedAt: '2026-04-18 13:10',
    riskCheckResult: '通过', riskCheckDate: '2026-04-16', riskCheckEvidence: '风险核验-刘洋.png', riskCheckOperator: '周敏',
    status: '补件中', nextVerifyDate: '2026-07-17',
    authorizations: [], verifications: [], incidents: [],
    timeline: [ev('2026-04-20 10:30', '周敏', 'MAH 合规管理员', '补件', '学历证明缺失，请于 5 个工作日内补传', { operatorId: ACTORS.compliance.id, after: '补件中' })],
  },
  {
    id: 'REP-005', name: '陈静', idType: '身份证', idNo: '330106198712030021', mobile: '13588889999', email: 'chenjing@yongtai.com',
    employmentType: '授权推广', mah: MAH_NAME, mahId: MAH_ID, provider: '永泰汇通推广有限公司', providerId: 'VND-004',
    initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    employStart: '2026-03-01', employEnd: '2026-12-31',
    education: '本科', major: '药学', school: '浙江大学', eduProof: '学历证明-陈静.pdf',
    trainings: [trn('TRN-005', 'REP-005', '2026 医药代表合规培训', '2026-03-20', 90, '2027-03-19', '培训证书-CJ-2026.pdf')],
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-03-20', pledgeFile: '承诺书-陈静.pdf',
    filingNo: 'YB-ZJ-2026-05518', filingStatus: '有效', filingVerifiedAt: '2026-03-22 11:00',
    riskCheckResult: '通过', riskCheckDate: '2026-03-21', riskCheckEvidence: '风险核验-陈静.png', riskCheckOperator: '周敏',
    status: '合格', nextVerifyDate: '2026-06-20',
    authorizations: [auth({ id: 'AUTH-R-005', authNo: 'SQ-2026-019', version: 1, mahId: MAH_ID, productIds: ['V-005'], products: ['瑞舒伐他汀钙片(10mg)'], therapyAreas: ['心血管'], regions: ['全国'], startDate: '2026-08-01', endDate: '2026-12-31', approvalStatus: '待审', fileName: '授权文件-陈静.pdf' })],
    verifications: [], incidents: [],
    timeline: [ev('2026-03-25 09:40', '周敏', 'MAH 合规管理员', '审核通过', '准入合格，待授权审批通过后启用', { operatorId: ACTORS.compliance.id, after: '合格' })],
  },
  {
    id: 'REP-006', name: '杨明', idType: '身份证', idNo: '510104198609150042', mobile: '13477776666', email: 'yangming@zhilian.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: DEMO_PROVIDER, providerId: 'VND-001',
    initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    employStart: '2025-08-01', employEnd: '2026-12-31',
    education: '本科', major: '预防医学', school: '四川大学', eduProof: '学历证明-杨明.pdf',
    trainings: [trn('TRN-006', 'REP-006', '2026 医药代表合规培训', '2026-01-10', 86, '2027-01-09', '培训证书-YM-2026.pdf')],
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-01-10', pledgeFile: '承诺书-杨明.pdf',
    filingNo: 'YB-SC-2025-20110', filingStatus: '有效', filingVerifiedAt: '2026-05-02 16:00',
    riskCheckResult: '通过', riskCheckDate: '2026-01-08', riskCheckEvidence: '风险核验-杨明.png', riskCheckOperator: '周敏',
    status: '冻结', nextVerifyDate: '2026-08-01',
    freezeReason: '超授权学术推广', freezeEvidence: '投诉工单-WF-2026-014.pdf',
    authorizations: [auth({ id: 'AUTH-R-006', authNo: 'SQ-2026-011', version: 1, mahId: MAH_ID, productIds: ['V-001'], products: ['阿托伐他汀钙片(20mg)'], therapyAreas: ['心血管'], regions: ['陕西'], startDate: '2026-01-15', endDate: '2026-12-31', approvalStatus: '通过', fileName: '授权文件-杨明.pdf' })],
    verifications: [],
    incidents: [{
      id: 'INC-001', incidentNo: 'WF-2026-014', source: '投诉', type: '超授权学术推广', risk: '高', status: '调查中',
      occurredAt: '2026-08-10', foundAt: '2026-08-12', fact: '在未授权区域组织科室会，已暂停未开始活动。',
      relatedRep: '杨明', relatedVendor: DEMO_PROVIDER, relatedRepId: 'REP-006', relatedVendorId: 'VND-001', relatedMahId: MAH_ID,
      relatedProjectId: 'PRJ-001', relatedContractId: 'CT-001',
      evidenceFiles: ['投诉工单-WF-2026-014.pdf'], initialMeasure: '立即冻结代表及未开始活动',
      investigationConclusion: '', rectification: '', ownerId: ACTORS.compliance.id, ownerName: '周敏', dueDate: '2026-08-31', reviewConclusion: '',
    }],
    timeline: [ev('2026-08-12 18:05', '系统', '系统预警', '冻结', '高风险违规事件 WF-2026-014，自动冻结', { before: '启用', after: '冻结' })],
  },
  {
    id: 'REP-007', name: '赵磊', idType: '身份证', idNo: '610103198402110067', mobile: '13366665555', email: 'zhaolei@zhilian.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: DEMO_PROVIDER, providerId: 'VND-001',
    initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    employStart: '2025-02-01', employEnd: '2026-12-31',
    education: '本科', major: '药学', school: '西安交通大学', eduProof: '学历证明-赵磊.pdf',
    trainings: [trn('TRN-007', 'REP-007', '2025 医药代表合规培训', '2025-06-01', 78, '2026-05-31', '培训证书-ZL-2025.pdf')],
    pledgeVersion: '反商业贿赂承诺书 V2025.2', pledgeDate: '2025-06-01', pledgeFile: '承诺书-赵磊.pdf',
    filingNo: 'YB-SN-2025-04420', filingStatus: '有效', filingVerifiedAt: '2026-04-01 09:00',
    riskCheckResult: '通过', riskCheckDate: '2025-05-28', riskCheckEvidence: '风险核验-赵磊.png', riskCheckOperator: '周敏',
    status: '失效', nextVerifyDate: '2026-07-01',
    authorizations: [auth({ id: 'AUTH-R-007', authNo: 'SQ-2025-044', version: 1, mahId: MAH_ID, productIds: ['V-001'], products: ['阿托伐他汀钙片(20mg)'], therapyAreas: ['心血管'], regions: ['陕西'], startDate: '2025-07-01', endDate: '2026-06-30', approvalStatus: '过期', fileName: '授权文件-赵磊.pdf' })],
    verifications: [], incidents: [],
    timeline: [ev('2026-06-01 00:00', '系统', '规则引擎', '修改', '培训有效期届满，主状态自动转为失效', { before: '启用', after: '失效' })],
  },
  {
    id: 'REP-008', name: '孙丽', idType: '身份证', idNo: '210102199508220089', mobile: '13255554444', email: 'sunli@dongfang.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '东方恒业推广有限公司', providerId: 'VND-002',
    initiatorId: ACTORS.sales.id, initiatorName: '陈静',
    employStart: '2026-08-01', employEnd: '2026-12-31',
    education: '本科', major: '生物制药', school: '沈阳药科大学', eduProof: '',
    trainings: [],
    pledgeVersion: '', pledgeDate: '', pledgeFile: '',
    filingNo: '', filingStatus: '未核验', filingVerifiedAt: '',
    riskCheckResult: '待核验', riskCheckDate: '', riskCheckEvidence: '', riskCheckOperator: '',
    status: '草稿', nextVerifyDate: '',
    authorizations: [], verifications: [], incidents: [],
    timeline: [ev('2026-08-20 15:40', '陈静', '业务负责人', '创建', '资料未齐，暂存草稿', { operatorId: ACTORS.sales.id, after: '草稿' })],
  },
  {
    id: 'REP-009', name: '黄峰', idType: '身份证', idNo: '420106198910050011', mobile: '13144443333', email: 'huangfeng@kangsheng.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '康晟云服科技有限公司', providerId: 'VND-003',
    initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    employStart: '2025-09-01', employEnd: '2026-12-31',
    education: '本科', major: '药学', school: '武汉大学', eduProof: '学历证明-黄峰.pdf',
    trainings: [trn('TRN-009', 'REP-009', '2026 医药代表合规培训', '2026-01-08', 83, '2027-01-07', '培训证书-HF-2026.pdf')],
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-01-08', pledgeFile: '承诺书-黄峰.pdf',
    filingNo: 'YB-HB-2025-16602', filingStatus: '有效', filingVerifiedAt: '2026-06-10 10:00',
    riskCheckResult: '通过', riskCheckDate: '2026-01-06', riskCheckEvidence: '风险核验-黄峰.png', riskCheckOperator: '周敏',
    status: '整改中', nextVerifyDate: '2026-09-08',
    rectification: '补齐培训签到表缺页', rectificationOwner: '黄峰', rectificationDue: '2026-08-30',
    authorizations: [auth({ id: 'AUTH-R-009', authNo: 'SQ-2026-022', version: 1, mahId: MAH_ID, productIds: ['V-003'], products: ['奥美拉唑肠溶胶囊(20mg)'], therapyAreas: ['消化'], regions: ['浙江'], startDate: '2026-02-01', endDate: '2026-12-31', approvalStatus: '通过', fileName: '授权文件-黄峰.pdf' })],
    verifications: [],
    incidents: [{
      id: 'INC-002', incidentNo: 'WF-2026-009', source: '内审', type: '培训记录不完整', risk: '低', status: '整改中',
      occurredAt: '2026-07-20', foundAt: '2026-07-22', fact: '抽检发现培训签到表缺页，限期补齐。',
      relatedRep: '黄峰', relatedVendor: '康晟云服科技有限公司', relatedRepId: 'REP-009', relatedVendorId: 'VND-003', relatedMahId: MAH_ID,
      evidenceFiles: ['抽检记录.pdf'], initialMeasure: '限期整改', investigationConclusion: '资料缺页属实',
      rectification: '补齐签到表', ownerId: 'REP-009', ownerName: '黄峰', dueDate: '2026-08-30', reviewConclusion: '',
    }],
    timeline: [ev('2026-07-22 16:10', '周敏', 'MAH 合规管理员', '修改', '低风险预警，限期整改', { operatorId: ACTORS.compliance.id, after: '整改中' })],
  },
  {
    id: 'REP-010', name: '吴超', idType: '身份证', idNo: '350102199203180074', mobile: '13022221111', email: 'wuchao@yongtai.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '永泰汇通推广有限公司', providerId: 'VND-004',
    initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    employStart: '2025-11-01', employEnd: '2026-12-31',
    education: '本科', major: '中药学', school: '福建中医药大学', eduProof: '学历证明-吴超.pdf',
    trainings: [trn('TRN-010', 'REP-010', '2026 医药代表合规培训', '2026-02-01', 91, '2027-01-31', '培训证书-WC-2026.pdf')],
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-02-01', pledgeFile: '承诺书-吴超.pdf',
    filingNo: 'YB-FJ-2025-19033', filingStatus: '有效', filingVerifiedAt: '2026-06-02 09:10',
    riskCheckResult: '通过', riskCheckDate: '2026-01-30', riskCheckEvidence: '风险核验-吴超.png', riskCheckOperator: '周敏',
    status: '启用', nextVerifyDate: '2026-08-31',
    authorizations: [auth({ id: 'AUTH-R-010', authNo: 'SQ-2026-030', version: 1, mahId: MAH_ID, productIds: ['V-005'], products: ['瑞舒伐他汀钙片(10mg)'], therapyAreas: ['心血管'], regions: ['全国'], startDate: '2026-03-01', endDate: '2026-12-31', approvalStatus: '通过', fileName: '授权文件-吴超.pdf' })],
    verifications: [], incidents: [],
    timeline: [ev('2026-02-10 11:00', '周敏', 'MAH 合规管理员', '审核通过', undefined, { operatorId: ACTORS.compliance.id, after: '启用' })],
  },
  {
    id: 'REP-011', name: '周宁', idType: '身份证', idNo: '310115198001090015', mobile: '13988880000', email: 'zhouning@exited.com',
    employmentType: 'MAH直聘', mah: MAH_NAME, mahId: MAH_ID, provider: 'MAH直聘', providerId: null,
    initiatorId: ACTORS.sales.id, initiatorName: '王芳',
    employStart: '2022-01-01', employEnd: '2026-03-31',
    education: '硕士', major: '药理学', school: '复旦大学', eduProof: '学历证明-周宁.pdf',
    trainings: [trn('TRN-011', 'REP-011', '2025 医药代表合规培训', '2025-01-10', 95, '2026-01-09', '培训证书-ZN-2025.pdf')],
    pledgeVersion: '反商业贿赂承诺书 V2025.2', pledgeDate: '2025-01-10', pledgeFile: '承诺书-周宁.pdf',
    filingNo: 'YB-SH-2022-00018', filingStatus: '失效', filingVerifiedAt: '2026-04-01 09:00',
    riskCheckResult: '通过', riskCheckDate: '2025-01-08', riskCheckEvidence: '风险核验-周宁.png', riskCheckOperator: '周敏',
    status: '退出', nextVerifyDate: '',
    authorizations: [], verifications: [], incidents: [],
    timeline: [ev('2026-04-01 10:00', '王芳', '业务负责人', '退出', '劳动关系终止，停止授权', { after: '退出' })],
  },
  {
    id: 'REP-012', name: '马超', idType: '身份证', idNo: '130102199607210028', mobile: '15800001111', email: 'machao@boxin.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '博远医药咨询有限公司', providerId: 'VND-006',
    initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    employStart: '2026-07-01', employEnd: '2026-12-31',
    education: '高中', major: '—', school: '—', eduProof: '',
    trainings: [],
    pledgeVersion: '', pledgeDate: '', pledgeFile: '',
    filingNo: '', filingStatus: '未核验', filingVerifiedAt: '',
    riskCheckResult: '未通过', riskCheckDate: '2026-07-20', riskCheckEvidence: '风险核验-马超-未通过.png', riskCheckOperator: '周敏',
    status: '驳回', nextVerifyDate: '',
    authorizations: [], verifications: [], incidents: [],
    timeline: [ev('2026-07-20 14:00', '周敏', 'MAH 合规管理员', '审核驳回', '学历未达大专及以上，且存在未解除风险记录', { operatorId: ACTORS.compliance.id, after: '驳回' })],
  },
];

function contract(p: VendorContract): VendorContract {
  return { ...p, serviceTypes: p.serviceTypes.length ? p.serviceTypes : p.serviceScope.split('、').filter(Boolean) };
}

function project(p: Omit<VendorProject, 'deliverables' | 'assignedRepIds' | 'payeeAccountName' | 'payeeAccountNo'> & Partial<VendorProject>): VendorProject {
  return {
    assignedRepIds: p.assignedRepIds || [],
    payeeAccountName: p.payeeAccountName || '',
    payeeAccountNo: p.payeeAccountNo || '',
    deliverables: p.deliverables || [],
    ...p,
  };
}

export const seedVendors: Vendor[] = [
  {
    id: 'VND-001', name: DEMO_PROVIDER, creditCode: '91110108MA01ABCD12', legalRep: '赵启明',
    address: '北京市海淀区中关村大街 1 号', establishedAt: '2016-04-18', businessScope: '医药信息咨询、学术会议服务、市场推广',
    actualController: '赵启明', shareholding: '赵启明 70%，钱薇 30%', invoiceAbility: '增值税专用发票', siteDesc: '北京办公室 800㎡',
    principalName: '赵启明', principalMobile: '13800001000',
    relatedPartyDeclared: true, relatedPartyHit: false, staffSize: 86,
    bankName: '工商银行北京中关村支行', bankAccount: '0200001234567890123', taxType: '一般纳税人',
    serviceTypes: ['学术推广', '会议组织'], regions: ['陕西', '江苏', '浙江', '广东'],
    riskGrade: '低风险', riskScore: 22, status: '可合作', accessNo: 'ZR-2025-0018', accessValidUntil: '2027-03-31', reviewDue: '2027-03-31',
    contact: '钱薇', contactMobile: '13800001111', initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    missingDocs: [],
    documents: [
      { id: 'DOC-001-01', category: '主体', name: '营业执照', validUntil: '2030-04-17', status: '有效' },
      { id: 'DOC-001-02', category: '合规', name: '反商业贿赂承诺书', validUntil: '2027-03-31', status: '有效' },
      { id: 'DOC-001-03', category: '财税', name: '开户许可证', validUntil: '2029-12-31', status: '有效' },
    ],
    contracts: [contract({ id: 'CT-001', contractNo: 'HT-2026-ZL-01', serviceScope: '学术推广、会议组织', serviceTypes: ['学术推广', '会议组织'], regions: ['陕西', '江苏', '浙江', '广东'], startDate: '2026-01-01', endDate: '2026-12-31', amountCap: 2800000, status: '已生效', antiBriberyClause: true, auditClause: true })],
    projects: [
      project({ id: 'PRJ-001', projectNo: 'PJ-2026-088', name: '阿托伐他汀陕苏推广', region: '陕西', serviceType: '学术推广', status: '执行中', acceptance: '未验收', amount: 180000, assignedRepIds: ['REP-001'], payeeAccountName: DEMO_PROVIDER, payeeAccountNo: '0200001234567890123', unitPrice: 200, marketBenchmark: 200, deliverables: [] }),
      project({ id: 'PRJ-002', projectNo: 'PJ-2026-061', name: 'Q2 科室会', region: '江苏', serviceType: '会议组织', status: '已验收', acceptance: '通过', amount: 64000, assignedRepIds: ['REP-001'], payeeAccountName: DEMO_PROVIDER, payeeAccountNo: '0200001234567890123', unitPrice: 2000, marketBenchmark: 2000, deliverables: ['签到表.pdf', '会议纪要.pdf'] }),
    ],
    repIds: ['REP-001', 'REP-006', 'REP-007'],
    creditCompliance: credit(true, '2026-01-05'),
    selectionRecords: [sel('SEL-001', 'VND-001', '比价', '三家比价，智联综合分最高')],
    dueDiligence: dd('DD-001', 'VND-001', 22, '低风险'),
    acceptances: [{
      id: 'ACC-001', projectId: 'PRJ-002', vendorId: 'VND-001', serviceContent: 'Q2 科室会',
      serviceDateStart: '2026-04-01', serviceDateEnd: '2026-06-30', location: '南京',
      participantRepIds: ['REP-001'], deliverables: ['签到表.pdf', '会议纪要.pdf'], expenseVouchers: ['发票-061.pdf'],
      businessOpinion: '通过', complianceSample: '未抽检', performanceScore: 86, conclusion: '通过', createdAt: '2026-07-02',
    }],
    incidents: [],
    timeline: [
      ev('2025-02-10 09:00', '李强', '业务负责人', '创建', undefined, { operatorId: ACTORS.sales.id, after: '草稿' }),
      ev('2025-03-18 11:00', '周敏', 'MAH 合规管理员', '准入', undefined, { operatorId: ACTORS.compliance.id, after: '可合作', approvalId: 'APV-2025-0018' }),
    ],
  },
  {
    id: 'VND-002', name: '东方恒业推广有限公司', creditCode: '91440101MA02EFGH34', legalRep: '刘国栋',
    address: '广州市天河区珠江新城 88 号', establishedAt: '2018-09-01', businessScope: '药品市场推广、会议会展服务',
    actualController: '刘国栋', shareholding: '刘国栋 100%', invoiceAbility: '增值税专用发票', siteDesc: '广州办公室',
    principalName: '刘国栋', principalMobile: '13600002000',
    relatedPartyDeclared: true, relatedPartyHit: false, staffSize: 42,
    bankName: '招商银行广州分行', bankAccount: '7559123456789012', taxType: '一般纳税人',
    serviceTypes: ['学术推广'], regions: ['广东'],
    riskGrade: '中风险', riskScore: 48, status: '可合作', accessNo: 'ZR-2025-0066', accessValidUntil: '2026-12-31', reviewDue: '2026-12-31',
    contact: '何欣', contactMobile: '13600002222', initiatorId: ACTORS.sales.id, initiatorName: '陈静',
    missingDocs: [],
    documents: [
      { id: 'DOC-002-01', category: '主体', name: '营业执照', validUntil: '2029-08-31', status: '有效' },
      { id: 'DOC-002-02', category: '合规', name: '反商业贿赂承诺书', validUntil: '2026-12-31', status: '有效' },
    ],
    contracts: [contract({ id: 'CT-002', contractNo: 'HT-2026-DF-03', serviceScope: '学术推广', serviceTypes: ['学术推广'], regions: ['广东'], startDate: '2026-01-01', endDate: '2026-12-31', amountCap: 900000, status: '已生效', antiBriberyClause: true, auditClause: true })],
    projects: [project({ id: 'PRJ-003', projectNo: 'PJ-2026-102', name: '奥美拉唑广东推广', region: '广东', serviceType: '学术推广', status: '执行中', acceptance: '未验收', amount: 120000, assignedRepIds: ['REP-003'], payeeAccountName: '东方恒业推广有限公司', payeeAccountNo: '7559123456789012' })],
    repIds: ['REP-003', 'REP-008'],
    creditCompliance: credit(true, '2025-06-01'),
    selectionRecords: [sel('SEL-002', 'VND-002', '邀标', '定向邀标两家')],
    dueDiligence: dd('DD-002', 'VND-002', 48, '中风险'),
    acceptances: [], incidents: [],
    timeline: [ev('2025-06-20 16:00', '周敏', 'MAH 合规管理员', '准入', '中风险，复审周期 6 个月，结算抽检', { operatorId: ACTORS.compliance.id, after: '可合作' })],
  },
  {
    id: 'VND-003', name: '康晟云服科技有限公司', creditCode: '91370100MA03IJKL56', legalRep: '孙嘉',
    address: '济南市历下区奥体西路 9 号', establishedAt: '2019-11-12', businessScope: '医药信息科技、市场调研',
    actualController: '孙嘉', shareholding: '孙嘉 60%，韩雪 40%', invoiceAbility: '增值税专用发票', siteDesc: '济南办公室',
    principalName: '孙嘉', principalMobile: '13700003000',
    relatedPartyDeclared: true, relatedPartyHit: false, staffSize: 35,
    bankName: '建设银行济南历下支行', bankAccount: '3705012345678900123', taxType: '一般纳税人',
    serviceTypes: ['学术推广', '问卷调研'], regions: ['山东', '浙江', '北京'],
    riskGrade: '中风险', riskScore: 51, status: '复审中', accessNo: 'ZR-2025-0091', accessValidUntil: '2026-08-31', reviewDue: '2026-08-31',
    contact: '韩雪', contactMobile: '13700003333', initiatorId: ACTORS.sales.id, initiatorName: '杨明',
    missingDocs: ['最近一次行政处罚查询凭证'],
    documents: [
      { id: 'DOC-003-01', category: '主体', name: '营业执照', validUntil: '2028-11-11', status: '有效' },
      { id: 'DOC-003-02', category: '合规', name: '反商业贿赂承诺书', validUntil: '2026-08-31', status: '即将到期' },
    ],
    contracts: [contract({ id: 'CT-003', contractNo: 'HT-2026-KS-02', serviceScope: '学术推广、问卷调研', serviceTypes: ['学术推广', '问卷调研'], regions: ['山东', '浙江', '北京'], startDate: '2026-01-01', endDate: '2026-12-31', amountCap: 760000, status: '已生效', antiBriberyClause: true, auditClause: true })],
    projects: [project({ id: 'PRJ-004', projectNo: 'PJ-2026-077', name: '二甲双胍山东推广', region: '山东', serviceType: '学术推广', status: '执行中', acceptance: '未验收', amount: 88000, assignedRepIds: ['REP-009'], payeeAccountName: '康晟云服科技有限公司', payeeAccountNo: '3705012345678900123' })],
    repIds: ['REP-004', 'REP-009'],
    creditCompliance: credit(true, '2025-08-01'),
    selectionRecords: [sel('SEL-003', 'VND-003', '评审', '评审委员会打分')],
    dueDiligence: dd('DD-003', 'VND-003', 51, '中风险'),
    acceptances: [], incidents: [],
    timeline: [ev('2026-08-01 00:00', '系统', '规则引擎', '复审', '准入有效期将至，自动进入复审', { before: '可合作', after: '复审中' })],
  },
  {
    id: 'VND-004', name: '永泰汇通推广有限公司', creditCode: '91330000MA04MNOP78', legalRep: '郑伟',
    address: '杭州市西湖区文三路 259 号', establishedAt: '2021-03-08', businessScope: '市场推广、信息咨询',
    actualController: '郑伟', shareholding: '郑伟 100%', invoiceAbility: '增值税普通发票', siteDesc: '杭州联合办公',
    principalName: '郑伟', principalMobile: '13500004000',
    relatedPartyDeclared: true, relatedPartyHit: false, staffSize: 18,
    bankName: '杭州银行西湖支行', bankAccount: '3301001234567890', taxType: '一般纳税人',
    serviceTypes: ['学术推广', '分析报告'], regions: ['全国'],
    riskGrade: '低风险', riskScore: 28, status: '尽调中', accessNo: '', accessValidUntil: '', reviewDue: '',
    contact: '徐岚', contactMobile: '13500004444', initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    missingDocs: ['过往项目清单', '核心人员资质'],
    documents: [
      { id: 'DOC-004-01', category: '主体', name: '营业执照', validUntil: '2031-03-07', status: '有效' },
      { id: 'DOC-004-02', category: '合规', name: '反商业贿赂承诺书', validUntil: '', status: '缺失' },
    ],
    contracts: [contract({ id: 'CT-004', contractNo: 'HT-2026-YT-01', serviceScope: '学术推广', serviceTypes: ['学术推广'], regions: ['全国'], startDate: '2026-09-01', endDate: '2026-12-31', amountCap: 500000, status: '草案', antiBriberyClause: true, auditClause: true })],
    projects: [],
    repIds: ['REP-005', 'REP-010'],
    creditCompliance: credit(true, '2026-08-01'),
    selectionRecords: [sel('SEL-004', 'VND-004', '比价', '两家比价')],
    dueDiligence: dd('DD-004', 'VND-004', 28, '低风险'),
    acceptances: [], incidents: [],
    timeline: [ev('2026-08-12 09:00', '采购部', '采购', '尽调', '商业尽调进行中', { after: '尽调中' })],
  },
  {
    id: 'VND-005', name: '瑞康达医学服务有限公司', creditCode: '91110000MA05QRST90', legalRep: '高远',
    address: '北京市朝阳区建国路 88 号', establishedAt: '2024-01-15', businessScope: '医学会议、医院拜访服务',
    actualController: '高远', shareholding: '高远 100%', invoiceAbility: '暂无专票', siteDesc: '共享工位',
    principalName: '高远', principalMobile: '13900005555',
    relatedPartyDeclared: false, relatedPartyHit: true, staffSize: 9,
    bankName: '民生银行朝阳支行', bankAccount: '0100009876543210', taxType: '小规模纳税人',
    serviceTypes: ['会议组织', '学术推广'], regions: ['北京', '河北'],
    riskGrade: '高风险', riskScore: 81, status: '审批中', accessNo: '', accessValidUntil: '', reviewDue: '',
    contact: '高远', contactMobile: '13900005555', initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    missingDocs: ['关联关系申报表', '选聘比价记录'],
    documents: [{ id: 'DOC-005-01', category: '主体', name: '营业执照', validUntil: '2034-01-14', status: '有效' }],
    contracts: [], projects: [], repIds: [],
    creditCompliance: { antiBriberyPledgeFile: '', antiBriberyPledgeDate: '', illegalCheck: '待核验', dishonestCheck: '待核验', lawsuitRisk: '有-未披露', evidenceFiles: [], checkedAt: '' },
    selectionRecords: [],
    dueDiligence: dd('DD-005', 'VND-005', 81, '高风险'),
    acceptances: [], incidents: [],
    timeline: [ev('2026-08-15 10:00', '李强', '业务负责人', '提交', '高风险例外准入申请', { operatorId: ACTORS.sales.id, after: '审批中' })],
  },
  {
    id: 'VND-006', name: '博远医药咨询有限公司', creditCode: '91120116MA06UVWX12', legalRep: '吴磊',
    address: '天津市滨海新区开发区 3 大街', establishedAt: '2015-07-22', businessScope: '医药咨询、市场调研',
    actualController: '吴磊', shareholding: '吴磊 100%', invoiceAbility: '增值税专用发票', siteDesc: '天津办公室',
    principalName: '吴磊', principalMobile: '13800006000',
    relatedPartyDeclared: true, relatedPartyHit: false, staffSize: 24,
    bankName: '农业银行天津开发区支行', bankAccount: '1200001122334455', taxType: '一般纳税人',
    serviceTypes: ['问卷调研', '分析报告'], regions: ['天津', '河北'],
    riskGrade: '中风险', riskScore: 55, status: '冻结', accessNo: 'ZR-2024-0044', accessValidUntil: '2026-12-31', reviewDue: '2026-09-30',
    contact: '潘悦', contactMobile: '13800006666', initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    missingDocs: [],
    documents: [{ id: 'DOC-006-01', category: '主体', name: '营业执照', validUntil: '2027-07-21', status: '有效' }],
    contracts: [contract({ id: 'CT-006', contractNo: 'HT-2025-BY-08', serviceScope: '问卷调研', serviceTypes: ['问卷调研'], regions: ['天津', '河北'], startDate: '2025-01-01', endDate: '2026-12-31', amountCap: 420000, status: '已生效', antiBriberyClause: true, auditClause: true })],
    projects: [project({ id: 'PRJ-006', projectNo: 'PJ-2026-011', name: 'Q1 问卷调研', region: '天津', serviceType: '问卷调研', status: '待验收', acceptance: '未验收', amount: 36000, assignedRepIds: ['REP-012'], payeeAccountName: '博远医药咨询有限公司', payeeAccountNo: '1200001122334455' })],
    repIds: ['REP-012'],
    creditCompliance: credit(true, '2024-03-01'),
    selectionRecords: [sel('SEL-006', 'VND-006', '评审', '2024 年选聘')],
    dueDiligence: dd('DD-006', 'VND-006', 55, '中风险'),
    acceptances: [],
    incidents: [{
      id: 'INC-003', incidentNo: 'WF-2026-021', source: '监管', type: '行政处罚', risk: '高', status: '调查中',
      occurredAt: '2026-08-05', foundAt: '2026-08-08', fact: '市场监管局通报商业贿赂调查，系统自动冻结。',
      relatedVendor: '博远医药咨询有限公司', relatedVendorId: 'VND-006', relatedMahId: MAH_ID,
      relatedProjectId: 'PRJ-006', relatedContractId: 'CT-006',
      evidenceFiles: ['监管通报.pdf'], initialMeasure: '冻结服务商',
      investigationConclusion: '', rectification: '', ownerId: ACTORS.compliance.id, ownerName: '周敏', dueDate: '2026-09-15', reviewConclusion: '',
    }],
    timeline: [ev('2026-08-08 19:12', '系统', '系统预警', '冻结', '高风险违规 WF-2026-021', { before: '可合作', after: '冻结' })],
  },
  {
    id: 'VND-007', name: '星海市场研究有限公司', creditCode: '91310000MA07YZAB34', legalRep: '林雪',
    address: '上海市浦东新区世纪大道 100 号', establishedAt: '2020-05-06', businessScope: '市场研究、数据分析',
    actualController: '林雪', shareholding: '', invoiceAbility: '', siteDesc: '',
    principalName: '', principalMobile: '',
    relatedPartyDeclared: true, relatedPartyHit: false, staffSize: 12,
    bankName: '浦发银行上海分行', bankAccount: '3100005566778899', taxType: '一般纳税人',
    serviceTypes: ['问卷调研', '分析报告'], regions: ['上海', '江苏'],
    riskGrade: '低风险', riskScore: 0, status: '草稿', accessNo: '', accessValidUntil: '', reviewDue: '',
    contact: '林雪', contactMobile: '13600007777', initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    missingDocs: ['营业执照', '反商业贿赂承诺书', '开户资料', '选聘记录', '合同草案'],
    documents: [], contracts: [], projects: [], repIds: [],
    creditCompliance: null, selectionRecords: [], dueDiligence: null, acceptances: [], incidents: [],
    timeline: [ev('2026-08-22 11:30', '李强', '业务负责人', '创建', undefined, { operatorId: ACTORS.sales.id, after: '草稿' })],
  },
  {
    id: 'VND-008', name: '华信推广服务有限公司', creditCode: '91440300MA08CDEF56', legalRep: '丁力',
    address: '深圳市南山区科技园路 10 号', establishedAt: '2012-10-10', businessScope: '市场推广',
    actualController: '丁力', shareholding: '丁力 100%', invoiceAbility: '增值税专用发票', siteDesc: '深圳办公室',
    principalName: '丁力', principalMobile: '13500008888',
    relatedPartyDeclared: true, relatedPartyHit: false, staffSize: 40,
    bankName: '平安银行深圳分行', bankAccount: '4400009988776655', taxType: '一般纳税人',
    serviceTypes: ['学术推广'], regions: ['广东', '福建'],
    riskGrade: '中风险', riskScore: 44, status: '退出', accessNo: 'ZR-2023-0012', accessValidUntil: '2026-03-31', reviewDue: '',
    contact: '丁力', contactMobile: '13500008888', initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
    missingDocs: [],
    documents: [{ id: 'DOC-008-01', category: '主体', name: '营业执照', validUntil: '2028-10-09', status: '有效' }],
    contracts: [contract({ id: 'CT-008', contractNo: 'HT-2023-HX-01', serviceScope: '学术推广', serviceTypes: ['学术推广'], regions: ['广东', '福建'], startDate: '2023-04-01', endDate: '2026-03-31', amountCap: 1600000, status: '已终止', antiBriberyClause: true, auditClause: true })],
    projects: [project({ id: 'PRJ-008', projectNo: 'PJ-2025-199', name: '历史推广项目', region: '广东', serviceType: '学术推广', status: '已关闭', acceptance: '通过', amount: 210000, assignedRepIds: [], payeeAccountName: '华信推广服务有限公司', payeeAccountNo: '4400009988776655', deliverables: ['结项报告.pdf'] })],
    repIds: [],
    creditCompliance: credit(true, '2023-04-01'),
    selectionRecords: [sel('SEL-008', 'VND-008', '比价', '2023 年选聘')],
    dueDiligence: dd('DD-008', 'VND-008', 44, '中风险'),
    acceptances: [], incidents: [],
    timeline: [ev('2026-03-31 18:00', '周敏', 'MAH 合规管理员', '退出', '合同到期且不再续约，保留历史档案', { operatorId: ACTORS.compliance.id, after: '退出' })],
  },
];

export const seedBatchTasks: FilingBatchTask[] = [];

export const PRODUCT_OPTIONS = varieties.map((v) => ({ value: v, label: v }));
export const PROVIDER_OPTIONS = providers.map((p) => ({ value: p, label: p }));

export function maskIdNo(idNo: string): string {
  if (!idNo || idNo.length < 8) return idNo || '—';
  return `${idNo.slice(0, 4)}${'*'.repeat(Math.max(idNo.length - 8, 4))}${idNo.slice(-4)}`;
}
export function maskMobile(mobile: string): string {
  if (!mobile || mobile.length < 7) return mobile || '—';
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
}
export function maskAccount(account: string): string {
  if (!account || account.length < 8) return account || '—';
  return `${account.slice(0, 4)}${'*'.repeat(account.length - 8)}${account.slice(-4)}`;
}

export function hasActiveAuth(rep: Representative, date = bizToday()): boolean {
  return rep.authorizations.some((a) =>
    a.approvalStatus === '通过' && !a.superseded && a.startDate <= date && a.endDate >= date
  );
}

export function canRepJoinActivity(rep: Representative): boolean {
  return (rep.status === '已备案' || rep.status === '启用') && hasActiveAuth(rep) && (rep.filingStatus === '已备案' || rep.filingStatus === '有效');
}

function worst(a: EligibilityVerdict, b: EligibilityVerdict): EligibilityVerdict {
  const rank = { PASS: 0, MANUAL_REVIEW: 1, BLOCK: 2 };
  return rank[b] > rank[a] ? b : a;
}

function fold(hits: EligibilityHit[]): EligibilityVerdict {
  let verdict: EligibilityVerdict = 'PASS';
  hits.forEach((h) => {
    if (h.result === 'BLOCK' || h.result === 'MANUAL_REVIEW') verdict = worst(verdict, h.result);
  });
  return verdict;
}

export function checkRepresentativeEligibility(
  rep: Representative,
  input: { product: string; therapyArea: string; region: string; date: string; vendor?: string; hospital?: string },
  vendor?: Vendor,
): EligibilityResult {
  const hits: EligibilityHit[] = [];
  const push = (code: string, rule: string, result: EligibilityHit['result'], detail: string) => {
    hits.push({ code, rule, result, detail });
  };

  if (rep.status !== '已备案' && rep.status !== '启用') push('REP-001', '代表未完成备案', 'BLOCK', `当前状态：${rep.status}`);
  else push('REP-001', '代表未完成备案', 'OK', '已完成国家备案登记');

  if (rep.filingStatus !== '已备案' && rep.filingStatus !== '有效') {
    push('REP-002', '备案状态无效', 'BLOCK', `备案状态：${rep.filingStatus}`);
  } else push('REP-002', '备案状态无效或超过复核期限', 'OK', '备案有效且未超期');

  const trainingExpired = !rep.trainingValidUntil || rep.trainingValidUntil < input.date;
  const pledgeBad = !rep.pledgeDate || rep.pledgeVersion !== CURRENT_PLEDGE_TEMPLATE;
  if (trainingExpired || pledgeBad || (rep.examScore ?? 0) < 60) {
    push('REP-003', '培训、考核或合规承诺失效', 'BLOCK', trainingExpired ? `培训有效期至 ${rep.trainingValidUntil || '—'}` : pledgeBad ? `承诺书须为 ${CURRENT_PLEDGE_TEMPLATE}` : '成绩不合格');
  } else push('REP-003', '培训、考核或合规承诺失效', 'OK', `培训有效至 ${rep.trainingValidUntil}`);

  const covering = rep.authorizations.filter((a) =>
    a.approvalStatus === '通过' && !a.superseded && a.startDate <= input.date && a.endDate >= input.date
  );
  if (covering.length === 0) push('REP-004', '无覆盖活动日期的有效授权', 'BLOCK', `活动日期 ${input.date} 无有效授权`);
  else push('REP-004', '无覆盖活动日期的有效授权', 'OK', `命中授权 ${covering.map((a) => a.authNo).join('、')}`);

  const mahOk = covering.every((a) => a.mahId === rep.mahId);
  const scopeOk = covering.some((a) =>
    (a.products.includes(input.product) || a.productIds.includes(PRODUCT_IDS[input.product])) &&
    (a.therapyAreas.includes(input.therapyArea) || a.therapyAreas.length === 0) &&
    (a.regions.includes(input.region) || a.regions.includes('全国'))
  );
  if (covering.length > 0 && (!scopeOk || !mahOk)) {
    push('REP-005', '产品/治疗领域/区域超出授权', 'BLOCK', !mahOk ? '责任 MAH 与雇佣关系不一致' : `${input.product} / ${input.therapyArea} / ${input.region} 不在授权范围`);
  } else if (covering.length > 0) {
    push('REP-005', '产品/治疗领域/区域超出授权', 'OK', '产品、治疗领域、区域均在授权内');
  }

  const vendorBlocked = !!vendor && (
    ['冻结', '退出', '限制合作'].includes(vendor.status)
    || (!!vendor.accessValidUntil && vendor.accessValidUntil < input.date && vendor.status !== '复审中')
  );
  if (vendorBlocked) push('REP-006', '代表所属服务商冻结、退出或复审失效', 'BLOCK', `服务商状态：${vendor!.status}`);
  else push('REP-006', '代表所属服务商冻结、退出或复审失效', 'OK', vendor ? `服务商 ${vendor.status}` : '无所属服务商或直聘');

  const openMajor = rep.incidents.some((i) => i.risk === '高' && i.status !== '已结案');
  if (openMajor) push('REP-007', '代表存在未结案重大违规', 'BLOCK', '存在未结案高风险违规事件');
  else push('REP-007', '代表存在未结案重大违规', 'OK', '无未结案重大违规');

  if (!input.hospital) push('REP-008', '医疗机构准入状态未知或不允许', 'MANUAL_REVIEW', '未提供医疗机构，需人工确认');
  else push('REP-008', '医疗机构准入状态未知或不允许', 'OK', `医疗机构：${input.hospital}`);

  return { verdict: fold(hits), hits };
}

export function checkVendorEligibility(
  vendor: Vendor,
  input: { serviceType: string; region: string; date: string; amount?: number; assignedRepIds?: string[]; mode?: '新增' | '存量' },
  reps: Representative[] = [],
): EligibilityResult {
  const hits: EligibilityHit[] = [];
  const push = (code: string, rule: string, result: EligibilityHit['result'], detail: string) => {
    hits.push({ code, rule, result, detail });
  };
  const mode = input.mode || '新增';

  if (['冻结', '退出', '限制合作'].includes(vendor.status)) {
    push('VND-001', '服务商状态不是「可合作」', 'BLOCK', `当前状态：${vendor.status}`);
  } else if (vendor.status === '复审中') {
    if (mode === '新增') push('VND-001', '服务商状态不是「可合作」', 'BLOCK', '复审中禁止新增项目');
    else push('VND-001', '服务商状态不是「可合作」', 'MANUAL_REVIEW', '复审中存量项目须人工复核');
  } else if (vendor.status !== '可合作') {
    push('VND-001', '服务商状态不是「可合作」', 'BLOCK', `当前状态：${vendor.status}`);
  } else {
    push('VND-001', '服务商状态不是「可合作」', 'OK', '可合作');
  }

  if (!vendor.accessValidUntil || vendor.accessValidUntil < input.date) {
    push('VND-002', '准入或复审有效期已过', 'BLOCK', `有效期至 ${vendor.accessValidUntil || '—'}`);
  } else push('VND-002', '准入或复审有效期已过', 'OK', `有效期至 ${vendor.accessValidUntil}`);

  const activeContract = vendor.contracts.find((c) => c.status === '已生效' && c.startDate <= input.date && c.endDate >= input.date);
  const types = activeContract?.serviceTypes?.length ? activeContract.serviceTypes : (activeContract?.serviceScope ? activeContract.serviceScope.split('、') : []);
  if (!activeContract) {
    push('VND-003', '无有效合同或合同服务范围不匹配', 'BLOCK', '无覆盖该日期的已生效合同');
  } else if (!types.includes(input.serviceType)) {
    push('VND-003', '无有效合同或合同服务范围不匹配', 'BLOCK', `合同范围：${types.join('、')}`);
  } else {
    push('VND-003', '无有效合同或合同服务范围不匹配', 'OK', activeContract.contractNo);
  }

  const regionOk = !activeContract || activeContract.regions.includes(input.region) || activeContract.regions.includes('全国');
  const typeOk = !activeContract || types.includes(input.serviceType);
  if (activeContract && (!regionOk || !typeOk)) {
    push('VND-004', '项目区域、服务类型超出合同范围', 'BLOCK', `${input.region} / ${input.serviceType}`);
  } else push('VND-004', '项目区域、服务类型超出合同范围', 'OK', '区域与服务类型匹配');

  const assigned = input.assignedRepIds || [];
  if (assigned.length === 0) {
    push('VND-005', '拟分配代表不满足 REP-001 至 REP-007', 'MANUAL_REVIEW', '未指定拟分配代表');
  } else {
    const blocked: string[] = [];
    assigned.forEach((id) => {
      const r = reps.find((x) => x.id === id);
      if (!r) { blocked.push(`${id} 不存在`); return; }
      const el = checkRepresentativeEligibility(r, {
        product: r.authorizations.find((a) => a.approvalStatus === '通过' && !a.superseded)?.products[0] || input.serviceType,
        therapyArea: r.authorizations.find((a) => a.approvalStatus === '通过' && !a.superseded)?.therapyAreas[0] || '',
        region: input.region,
        date: input.date,
        hospital: '演示医院',
      }, vendor);
      const hard = el.hits.filter((h) => h.result === 'BLOCK' && /^REP-00[1-7]$/.test(h.code));
      if (hard.length) blocked.push(`${r.name}(${id}): ${hard.map((h) => h.code).join(',')}`);
    });
    if (blocked.length) push('VND-005', '拟分配代表不满足 REP-001 至 REP-007', 'BLOCK', blocked.join('；'));
    else push('VND-005', '拟分配代表不满足 REP-001 至 REP-007', 'OK', assigned.join('、'));
  }

  if (input.amount && activeContract && input.amount > activeContract.amountCap) {
    push('VND-006', '预算或单价超出合同/比价结果', 'MANUAL_REVIEW', `申请超过合同上限 ${activeContract.amountCap.toLocaleString()}`);
  } else push('VND-006', '预算或单价超出合同/比价结果', 'OK', '未超出合同上限');

  return { verdict: fold(hits), hits };
}

export function checkSettlementEligibility(
  vendor: Vendor,
  project?: VendorProject,
  reps: Representative[] = [],
): EligibilityResult {
  const hits: EligibilityHit[] = [];
  const push = (code: string, rule: string, result: EligibilityHit['result'], detail: string) => {
    hits.push({ code, rule, result, detail });
  };

  if (['冻结', '退出'].includes(vendor.status) || !vendor.accessValidUntil) {
    push('SET-001', '服务商状态为冻结、退出或准入失效', 'BLOCK', `状态 ${vendor.status}`);
  } else if (vendor.status === '复审中' || vendor.status === '限制合作') {
    push('SET-001', '服务商状态为冻结、退出或准入失效', 'MANUAL_REVIEW', `${vendor.status}，存量结算须人工复核`);
  } else {
    push('SET-001', '服务商状态为冻结、退出或准入失效', 'OK', vendor.status);
  }

  const contract = vendor.contracts.find((c) => c.status === '已生效');
  if (!contract) {
    push('SET-002', '合同无效、已超期或费用超合同上限', 'BLOCK', '无已生效合同');
  } else if (project && project.amount > contract.amountCap) {
    push('SET-002', '合同无效、已超期或费用超合同上限', 'BLOCK', '费用超合同上限');
  } else {
    push('SET-002', '合同无效、已超期或费用超合同上限', 'OK', contract.contractNo);
  }

  if (!project) push('SET-003', '无对应项目/活动审批记录', 'BLOCK', '未选择项目');
  else push('SET-003', '无对应项目/活动审批记录', 'OK', project.projectNo);

  const noDeliverable = !project || project.acceptance !== '通过' || (project.deliverables && project.deliverables.length === 0);
  if (!project || project.acceptance !== '通过') {
    push('SET-004', '无完整履约成果或业务验收未通过', 'BLOCK', project ? `验收：${project.acceptance}` : '无履约验收');
  } else if (noDeliverable) {
    push('SET-004', '无完整履约成果或业务验收未通过', 'BLOCK', '无履约成果附件');
  } else {
    push('SET-004', '无完整履约成果或业务验收未通过', 'OK', '业务验收通过且成果齐全');
  }

  if (!project || project.assignedRepIds.length === 0) {
    push('SET-005', '涉及代表存在活动时点备案/授权失效', 'MANUAL_REVIEW', '项目未绑定代表');
  } else {
    const date = bizToday();
    const bad = project.assignedRepIds.map((id) => {
      const r = reps.find((x) => x.id === id);
      if (!r) return `${id} 缺失`;
      if (r.filingStatus !== '有效' || !hasActiveAuth(r, date)) return `${r.name} 备案/授权失效`;
      return null;
    }).filter(Boolean);
    if (bad.length) push('SET-005', '涉及代表存在活动时点备案/授权失效', 'BLOCK', bad.join('；'));
    else push('SET-005', '涉及代表存在活动时点备案/授权失效', 'OK', '活动时点代表备案与授权有效');
  }

  if (!project) {
    push('SET-006', '收款账户与已审核主体不一致', 'BLOCK', '未提供收款账户，不得默认放行');
  } else {
    const nameOk = project.payeeAccountName.replace(/\s/g, '') === vendor.name.replace(/\s/g, '');
    const noOk = !project.payeeAccountNo || project.payeeAccountNo === vendor.bankAccount;
    if (!project.payeeAccountName || !project.payeeAccountNo) {
      push('SET-006', '收款账户与已审核主体不一致', 'BLOCK', '未提供收款账户，不得默认放行');
    } else if (!nameOk || !noOk) {
      push('SET-006', '收款账户与已审核主体不一致', 'BLOCK', `户名 ${project.payeeAccountName} / 账号与已审主体不一致`);
    } else {
      push('SET-006', '收款账户与已审核主体不一致', 'OK', '户名户号与主体一致');
    }
  }

  if (project && contract && project.amount > contract.amountCap) {
    push('SET-007', '单价或总价明显偏离合同/市场基准', 'MANUAL_REVIEW', '总价超过合同上限');
  } else if (project?.unitPrice && project.marketBenchmark && project.unitPrice > project.marketBenchmark * 1.2) {
    push('SET-007', '单价或总价明显偏离合同/市场基准', 'MANUAL_REVIEW', `单价 ${project.unitPrice} 超过基准 20%`);
  } else {
    push('SET-007', '单价或总价明显偏离合同/市场基准', 'OK', '未偏离');
  }

  const open = vendor.incidents.some((i) => i.status !== '已结案');
  if (open) {
    push('SET-008', '命中未结案违规、投诉或整改', vendor.incidents.some((i) => i.risk === '高') ? 'BLOCK' : 'MANUAL_REVIEW', '存在未结案事件');
  } else push('SET-008', '命中未结案违规、投诉或整改', 'OK', '无未结案事件');

  return { verdict: fold(hits), hits };
}

export const emptyRepresentative = (): Omit<Representative, 'id'> => ({
  name: '', idType: '身份证', idNo: '', mobile: '', email: '',
  employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: DEMO_PROVIDER, providerId: DEMO_VENDOR_ID,
  initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
  employStart: '', employEnd: '',
  education: '本科', major: '', school: '', eduProof: '',
  trainingPlan: '2026 医药代表合规培训', trainingDate: '', examScore: 0, trainingValidUntil: '', trainingCert: '', trainings: [],
  pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '', pledgeFile: '',
  filingNo: '', filingStatus: '待提交', filingVerifiedAt: '',
  riskCheckResult: '待核验', riskCheckDate: '', riskCheckEvidence: '', riskCheckOperator: '',
  status: '草稿', nextVerifyDate: '',
  authorizations: [], verifications: [], incidents: [], timeline: [],
});

export const seedActivities: DemoActivity[] = [];

export const emptyVendor = (): Omit<Vendor, 'id'> => ({
  name: '', creditCode: '', legalRep: '', address: '', establishedAt: '', businessScope: '',
  actualController: '', shareholding: '', invoiceAbility: '', siteDesc: '', principalName: '', principalMobile: '',
  relatedPartyDeclared: true, relatedPartyHit: false, staffSize: 0,
  bankName: '', bankAccount: '', taxType: '一般纳税人',
  serviceTypes: ['学术推广'], regions: [],
  riskGrade: '低风险', riskScore: 0, status: '草稿',
  accessNo: '', accessValidUntil: '', reviewDue: '',
  contact: '', contactMobile: '', initiatorId: ACTORS.sales.id, initiatorName: ACTORS.sales.name,
  documents: [], contracts: [], projects: [], repIds: [],
  creditCompliance: null, selectionRecords: [], dueDiligence: null, acceptances: [],
  incidents: [], timeline: [], missingDocs: [],
});

export function emptyIncident(): Omit<ComplianceIncident, 'id' | 'incidentNo'> {
  return {
    source: '业务发现', type: '', risk: '中', status: '调查中',
    occurredAt: '', foundAt: bizToday(), fact: '',
    evidenceFiles: [], initialMeasure: '', investigationConclusion: '',
    rectification: '', ownerId: '', ownerName: '', dueDate: '', reviewConclusion: '',
    relatedMahId: MAH_ID,
  };
}

export type { AcceptanceRecord, VendorDocument };

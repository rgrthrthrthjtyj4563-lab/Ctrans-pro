import type {
  AcceptanceRecord,
  Actor,
  ComplianceAuditEvent,
  ComplianceIncident,
  EligibilityHit,
  EligibilityResult,
  EligibilityVerdict,
  Representative,
  Role,
  SelectionRecord,
  Vendor,
  VendorContract,
  VendorCreditCompliance,
  VendorDocument,
  VendorDueDiligence,
  VendorProject,
} from '../types';
import { DEMO_HOLDER, DEMO_PROVIDER } from './mockData';

export const MAH_NAME = DEMO_HOLDER;
export const MAH_ID = 'MAH-001';
export const DEMO_VENDOR_ID = 'VND-001';
export const EDU_OPTIONS = ['大专', '本科', '硕士', '博士'];
export const MED_MAJORS = ['药学', '临床医学', '药物制剂', '护理学', '预防医学', '中药学', '药理学', '生物制药', '相关专业'];

export const CURRENT_PLEDGE_TEMPLATE = '反商业贿赂承诺书 V2026.1';
export const BIZ_YEAR = 2026;
export const SERVICE_TYPES = ['学术推广', '会议组织', '问卷调研', '分析报告'] as const;

export const ACTORS = {
  sales: { id: 'U-SALES-01', name: '李强', role: '药厂销售部门' },
  compliance: { id: 'U-COMP-01', name: '周敏', role: '药厂合规部门' },
  vendor: { id: 'U-VND-01', name: '钱薇', role: '服务提供商' },
} as const;

export function actorOf(role: Role): Actor {
  if (role === '药厂合规部门') return ACTORS.compliance;
  if (role === '服务提供商') return ACTORS.vendor;
  return ACTORS.sales;
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
export function allocAccessNo(existing: string[]) {
  return `ZR-${BIZ_YEAR}-${nextNumeric(existing, /ZR-\d+-(\d+)/, 4)}`;
}
export function allocSelId(existing: string[]) {
  return `SEL-${nextNumeric(existing, /^SEL-(\d+)/, 3)}`;
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
    id: 'REP-001', name: '张伟', gender: '男', photoFile: '照片-张伟.jpg', idNo: '110101198803151234', mobile: '13812340001', email: 'zhangwei@zhilian.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: DEMO_PROVIDER, providerId: 'VND-001',
    userId: null,
    employStart: '2025-01-01', employEnd: '2026-12-31',
    education: '本科', major: '药学', school: '中国药科大学', eduProof: '学历证明-张伟.pdf',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-03-12', pledgeFile: '承诺书-张伟.pdf',
    filingNo: 'YB-BJ-2026-10021', filingReceipt: '备案信息表-张伟.pdf', filingValidUntil: '2027-03-31',
    filingApprovedAt: '2026-03-18 10:20', filingApprovedBy: ACTORS.compliance.name, status: '已备案',
    operations: [
      { at: '2026-03-10 09:00', by: ACTORS.sales.name, action: '提交审核' },
      { at: '2026-03-18 10:20', by: ACTORS.compliance.name, action: '审核通过', note: '备案号 YB-BJ-2026-10021，有效期至 2027-03-31' },
    ],
  },
  {
    id: 'REP-002', name: '李强', gender: '男', photoFile: '照片-李强.jpg', idNo: '320102198511220018', mobile: '13900001234', email: 'liqiang@baiyi.com',
    employmentType: 'MAH直聘', mah: MAH_NAME, mahId: MAH_ID, provider: 'MAH直聘', providerId: null,
    userId: null,
    employStart: '2024-06-01', employEnd: '2027-05-31',
    education: '硕士', major: '临床医学', school: '南京医科大学', eduProof: '学历证明-李强.pdf',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-02-20', pledgeFile: '承诺书-李强.pdf',
    filingNo: 'YB-JS-2026-08812', filingReceipt: '备案信息表-李强.pdf', filingValidUntil: '2027-06-30',
    filingApprovedAt: '2026-02-25 15:00', filingApprovedBy: ACTORS.compliance.name, status: '已备案',
    operations: [
      { at: '2026-02-18 14:00', by: ACTORS.sales.name, action: '提交审核' },
      { at: '2026-02-25 15:00', by: ACTORS.compliance.name, action: '审核通过', note: '备案号 YB-JS-2026-08812' },
    ],
  },
  {
    id: 'REP-003', name: '王芳', gender: '女', photoFile: '照片-王芳.jpg', idNo: '440106199204080056', mobile: '13700005678', email: 'wangfang@dongfang.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '东方恒业推广有限公司', providerId: 'VND-002',
    userId: null,
    employStart: '2025-03-01', employEnd: '2026-09-30',
    education: '本科', major: '药学', school: '广东药科大学', eduProof: '学历证明-王芳.pdf',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2025-09-05', pledgeFile: '承诺书-王芳.pdf',
    filingNo: 'YB-GD-2025-30156', filingReceipt: '备案信息表-王芳.pdf', filingValidUntil: '2026-09-25',
    filingApprovedAt: '2025-09-10 11:00', filingApprovedBy: ACTORS.compliance.name, status: '已备案',
    operations: [
      { at: '2025-09-01 09:30', by: ACTORS.sales.name, action: '提交审核' },
      { at: '2025-09-10 11:00', by: ACTORS.compliance.name, action: '审核通过', note: '备案号 YB-GD-2025-30156' },
    ],
  },
  {
    id: 'REP-004', name: '刘洋', gender: '男', photoFile: '照片-刘洋.jpg', idNo: '370102199001120033', mobile: '13611112222', email: 'liuyang@kangsheng.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '康晟云服科技有限公司', providerId: 'VND-003',
    userId: null,
    employStart: '2025-07-01', employEnd: '2027-06-30',
    education: '本科', major: '药物制剂', school: '沈阳药科大学', eduProof: '学历证明-刘洋.pdf',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2025-10-12', pledgeFile: '承诺书-刘洋.pdf',
    filingNo: 'YB-SD-2025-40233', filingReceipt: '备案信息表-刘洋.pdf', filingValidUntil: '2026-10-08',
    filingApprovedAt: '2025-10-15 09:40', filingApprovedBy: ACTORS.compliance.name, status: '已备案',
    operations: [
      { at: '2025-10-09 10:00', by: ACTORS.sales.name, action: '提交审核' },
      { at: '2025-10-15 09:40', by: ACTORS.compliance.name, action: '审核通过', note: '备案号 YB-SD-2025-40233' },
    ],
  },
  {
    id: 'REP-005', name: '陈静', gender: '女', photoFile: '照片-陈静.jpg', idNo: '330106198712030021', mobile: '13588889999', email: 'chenjing@yongtai.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '永泰汇通推广有限公司', providerId: 'VND-004',
    userId: null,
    employStart: '2024-09-01', employEnd: '2026-08-31',
    education: '大专', major: '药学', school: '浙江医药高等专科学校', eduProof: '学历证明-陈静.pdf',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2025-08-15', pledgeFile: '承诺书-陈静.pdf',
    filingNo: 'YB-ZJ-2025-50077', filingReceipt: '备案信息表-陈静.pdf', filingValidUntil: '2026-08-20',
    filingApprovedAt: '2025-08-18 14:30', filingApprovedBy: ACTORS.compliance.name, status: '已备案',
    operations: [
      { at: '2025-08-12 09:00', by: ACTORS.sales.name, action: '提交审核' },
      { at: '2025-08-18 14:30', by: ACTORS.compliance.name, action: '审核通过', note: '备案号 YB-ZJ-2025-50077' },
    ],
  },
  {
    id: 'REP-006', name: '杨明', gender: '男', photoFile: '照片-杨明.jpg', idNo: '510104198609150042', mobile: '13477776666', email: 'yangming@zhilian.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: DEMO_PROVIDER, providerId: 'VND-001',
    userId: 'u-yangming',
    employStart: '2026-09-01', employEnd: '2028-08-31',
    education: '本科', major: '临床医学', school: '四川大学华西医学中心', eduProof: '学历证明-杨明.pdf',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-09-02', pledgeFile: '承诺书-杨明.pdf',
    filingNo: '', filingReceipt: '', filingValidUntil: '',
    status: '待审核',
    operations: [
      { at: '2026-09-06 10:15', by: ACTORS.sales.name, action: '提交审核' },
    ],
  },
  {
    id: 'REP-007', name: '赵磊', gender: '男', photoFile: '照片-赵磊.jpg', idNo: '610103198402110067', mobile: '13366665555', email: 'zhaolei@zhilian.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: DEMO_PROVIDER, providerId: 'VND-001',
    userId: null,
    employStart: '2026-08-01', employEnd: '2028-07-31',
    education: '本科', major: '中药学', school: '陕西中医药大学', eduProof: '学历证明-赵磊.pdf',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-08-05', pledgeFile: '承诺书-赵磊.pdf',
    filingNo: '', filingReceipt: '', filingValidUntil: '',
    status: '待审核',
    operations: [
      { at: '2026-09-01 09:00', by: ACTORS.sales.name, action: '提交审核' },
    ],
  },
  {
    id: 'REP-008', name: '孙丽', gender: '女', photoFile: '照片-孙丽.jpg', idNo: '210102199508220089', mobile: '13255554444', email: 'sunli@dongfang.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '东方恒业推广有限公司', providerId: 'VND-002',
    userId: 'u-sunli',
    employStart: '2026-07-01', employEnd: '2028-06-30',
    education: '本科', major: '预防医学', school: '大连医科大学', eduProof: '',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-07-10', pledgeFile: '承诺书-孙丽.pdf',
    filingNo: '', filingReceipt: '', filingValidUntil: '',
    status: '已驳回', reviewNote: '学历证明附件不清晰，请重新上传后再提交',
    operations: [
      { at: '2026-07-08 09:00', by: ACTORS.sales.name, action: '提交审核' },
      { at: '2026-07-12 16:40', by: ACTORS.compliance.name, action: '驳回', note: '学历证明附件不清晰' },
    ],
  },
  {
    id: 'REP-009', name: '黄峰', gender: '男', photoFile: '照片-黄峰.jpg', idNo: '420106198910050011', mobile: '13144443333', email: 'huangfeng@kangsheng.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '康晟云服科技有限公司', providerId: 'VND-003',
    userId: 'u-huangfeng',
    employStart: '2025-05-01', employEnd: '2027-04-30',
    education: '硕士', major: '药理学', school: '华中科技大学同济医学院', eduProof: '学历证明-黄峰.pdf',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-01-08', pledgeFile: '承诺书-黄峰.pdf',
    filingNo: 'YB-HB-2026-60019', filingReceipt: '备案信息表-黄峰.pdf', filingValidUntil: '2026-12-31',
    filingApprovedAt: '2026-01-12 10:00', filingApprovedBy: ACTORS.compliance.name, status: '已备案',
    operations: [
      { at: '2026-01-05 09:30', by: ACTORS.sales.name, action: '提交审核' },
      { at: '2026-01-12 10:00', by: ACTORS.compliance.name, action: '审核通过', note: '备案号 YB-HB-2026-60019' },
    ],
  },
  {
    id: 'REP-010', name: '吴超', gender: '男', photoFile: '照片-吴超.jpg', idNo: '350102199203180074', mobile: '13022221111', email: 'wuchao@yongtai.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '永泰汇通推广有限公司', providerId: 'VND-004',
    userId: 'u-wuchao',
    employStart: '2024-10-01', employEnd: '2026-09-30',
    education: '本科', major: '生物制药', school: '福州大学', eduProof: '学历证明-吴超.pdf',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2025-12-01', pledgeFile: '承诺书-吴超.pdf',
    filingNo: 'YB-FJ-2025-70104', filingReceipt: '备案信息表-吴超.pdf', filingValidUntil: '2026-11-30',
    filingApprovedAt: '2025-12-05 11:20', filingApprovedBy: ACTORS.compliance.name,
    status: '已停用', stopReason: '离职',
    operations: [
      { at: '2025-11-28 09:00', by: ACTORS.sales.name, action: '提交审核' },
      { at: '2025-12-05 11:20', by: ACTORS.compliance.name, action: '审核通过', note: '备案号 YB-FJ-2025-70104' },
      { at: '2026-08-20 10:00', by: ACTORS.compliance.name, action: '停用', note: '离职；请在国家平台注销备案' },
    ],
  },
  {
    id: 'REP-011', name: '周宁', gender: '女', photoFile: '照片-周宁.jpg', idNo: '310115198001090015', mobile: '13988880000', email: 'zhouning@exited.com',
    employmentType: 'MAH直聘', mah: MAH_NAME, mahId: MAH_ID, provider: 'MAH直聘', providerId: null,
    userId: null,
    employStart: '2023-04-01', employEnd: '2026-03-31',
    education: '本科', major: '药学', school: '复旦大学药学院', eduProof: '学历证明-周宁.pdf',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2025-04-01', pledgeFile: '承诺书-周宁.pdf',
    filingNo: 'YB-SH-2023-80321', filingReceipt: '备案信息表-周宁.pdf', filingValidUntil: '2026-03-31',
    filingApprovedAt: '2025-04-03 09:00', filingApprovedBy: ACTORS.compliance.name,
    status: '已停用', stopReason: '停止授权',
    operations: [
      { at: '2023-04-03 09:00', by: ACTORS.compliance.name, action: '审核通过', note: '备案号 YB-SH-2023-80321' },
      { at: '2026-03-25 15:00', by: ACTORS.compliance.name, action: '停用', note: '停止授权，档案保留' },
    ],
  },
  {
    id: 'REP-012', name: '马超', gender: '男', photoFile: '照片-马超.jpg', idNo: '130102199607210028', mobile: '15800001111', email: 'machao@boxin.com',
    employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: '博远医药咨询有限公司', providerId: 'VND-006',
    userId: null,
    employStart: '2025-11-01', employEnd: '2027-10-31',
    education: '本科', major: '药学', school: '河北医科大学', eduProof: '学历证明-马超.pdf',
    pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '2026-02-01', pledgeFile: '承诺书-马超.pdf',
    filingNo: 'YB-TJ-2026-90215', filingReceipt: '备案信息表-马超.pdf', filingValidUntil: '2027-01-15',
    filingApprovedAt: '2026-02-05 10:30', filingApprovedBy: ACTORS.compliance.name, status: '已备案',
    operations: [
      { at: '2026-01-30 09:00', by: ACTORS.sales.name, action: '提交审核' },
      { at: '2026-02-05 10:30', by: ACTORS.compliance.name, action: '审核通过', note: '备案号 YB-TJ-2026-90215' },
    ],
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

/** 代表当前是否可参与推广：已备案且未过备案到期日。供拜访等模块调用。 */
export function isRepUsable(rep: Representative, date = bizToday()): boolean {
  return rep.status === '已备案' && !!rep.filingValidUntil && rep.filingValidUntil >= date;
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
    push('VND-005', '拟分配代表未完成备案或备案已过期', 'MANUAL_REVIEW', '未指定拟分配代表');
  } else {
    const blocked: string[] = [];
    assigned.forEach((id) => {
      const r = reps.find((x) => x.id === id);
      if (!r) { blocked.push(`${id} 不存在`); return; }
      if (!isRepUsable(r, input.date)) blocked.push(`${r.name}(${id}) 未备案或备案已过期`);
    });
    if (blocked.length) push('VND-005', '拟分配代表未完成备案或备案已过期', 'BLOCK', blocked.join('；'));
    else push('VND-005', '拟分配代表未完成备案或备案已过期', 'OK', assigned.join('、'));
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
    push('SET-005', '涉及代表备案已过期或未备案', 'MANUAL_REVIEW', '项目未绑定代表');
  } else {
    const bad = project.assignedRepIds.map((id) => {
      const r = reps.find((x) => x.id === id);
      if (!r) return `${id} 缺失`;
      if (!isRepUsable(r)) return `${r.name} 备案已过期或未备案`;
      return null;
    }).filter(Boolean);
    if (bad.length) push('SET-005', '涉及代表备案已过期或未备案', 'BLOCK', bad.join('；'));
    else push('SET-005', '涉及代表备案已过期或未备案', 'OK', '代表备案均在有效期内');
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

/** D3 推导：由所属组织推导雇佣类型与服务商（服务商/工作组树下→派遣+上溯服务商；否则 MAH 直聘） */
export function deriveEmployment(
  orgs: { id: string; name: string; type: string; parentId?: string | null }[],
  orgId: string,
): { employmentType: 'MAH直聘' | '服务商派遣'; providerName: string; providerId: string | null } {
  let cur = orgs.find((o) => o.id === orgId);
  while (cur) {
    if (cur.type === 'provider') {
      const vendor = seedVendors.find((v) => v.name === cur!.name);
      return { employmentType: '服务商派遣', providerName: cur.name, providerId: vendor?.id ?? null };
    }
    cur = cur.parentId ? orgs.find((o) => o.id === cur!.parentId) : undefined;
  }
  return { employmentType: 'MAH直聘', providerName: 'MAH直聘', providerId: null };
}

export const emptyRepresentative = (): Omit<Representative, 'id'> => ({
  name: '', gender: '男', photoFile: '', idNo: '', mobile: '', email: '',
  employmentType: '服务商派遣', mah: MAH_NAME, mahId: MAH_ID, provider: DEMO_PROVIDER, providerId: DEMO_VENDOR_ID,
  userId: null,
  employStart: '', employEnd: '',
  education: '本科', major: '', school: '', eduProof: '',
  pledgeVersion: CURRENT_PLEDGE_TEMPLATE, pledgeDate: '', pledgeFile: '',
  filingNo: '', filingReceipt: '', filingValidUntil: '',
  status: '待审核',
  operations: [],
});

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

export type { AcceptanceRecord, VendorDocument };

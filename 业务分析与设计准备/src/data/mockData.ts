import type {
  VisitRecord,
  Doctor,
  AuditLogEntry,
  AuditStatus,
  DashboardRoleData,
  Role,
  EvidenceChainRecord,
  RepFilingAnalysis,
  Variety,
  VarietyProviderAuth,
  PriceItem,
  PriceRatio,
  ReportPrice,
  BudgetPlan,
  Task,
  ServiceItem,
} from '../types';

const auditStatuses: AuditStatus[] = ['草稿', '待审核', '已通过', '已驳回', '已打绩效', '已结算', '已撤销'];

export const DEMO_PROVIDER = '智联科技有限公司';
export const DEMO_HOLDER = '百益健康科技';

export const specialists = ['张伟', '李强', '王芳', '刘洋', '陈静', '杨明', '赵磊', '孙丽', '黄峰', '吴超'];
export const providers = ['智联科技有限公司', '东方恒业推广有限公司', '康晟云服科技有限公司', '永泰汇通推广有限公司'];
export const workGroups = ['业务一组', '业务二组', '业务三组', '业务四组', '业务五组'];
export const hospitals = [
  { name: '北京协和医院', grade: '三级甲等' as const },
  { name: '上海瑞金医院', grade: '三级甲等' as const },
  { name: '广州中山医院', grade: '三级甲等' as const },
  { name: '杭州市第一人民医院', grade: '三级乙等' as const },
  { name: '南京鼓楼医院', grade: '三级甲等' as const },
  { name: '苏州大学附属医院', grade: '三级甲等' as const },
  { name: '宁波市第二医院', grade: '二级甲等' as const },
  { name: '绍兴市人民医院', grade: '二级甲等' as const },
];
export const departments = ['心内科', '内分泌科', '神经内科', '消化内科', '肿瘤科', '呼吸内科', '风湿免疫科'];
export const varieties = [
  '阿托伐他汀钙片(20mg)',
  '二甲双胍缓释片(500mg)',
  '奥美拉唑肠溶胶囊(20mg)',
  '氨氯地平片(5mg)',
  '瑞舒伐他汀钙片(10mg)',
];
export const visitCategories = ['学术拜访', '日常拜访', '跟踪巡访服务', '信息收集和调研'];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomAmount() {
  return randomInt(3, 25) * 100;
}

const visiteeNames = ['王主任', '李医生', '张教授', '陈主任', '刘医生', '赵副主任', '周医生', '吴教授'];
const visitPeriods = ['08:00-12:00', '12:00-14:00', '14:00-18:00', '18:00-20:00'];
const doctorNames = ['王建国', '李晓明', '张丽华', '刘志远', '陈美娟', '杨晓东', '赵文博', '孙洁', '黄志强', '吴敏'];

function generateDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function generateDateTime(daysAgo: number, hour: number, minute: number): string {
  return `${generateDate(daysAgo)} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export const visitRecords: VisitRecord[] = Array.from({ length: 60 }, (_, i) => {
  const h = randomItem(hospitals);
  const daysAgo = randomInt(0, 30);
  const startHour = randomInt(8, 17);
  const startMin = Math.random() > 0.35 ? 0 : randomInt(1, 59);
  const durationMins = randomInt(30, 90);
  const endHour = startHour + Math.floor((startMin + durationMins) / 60);
  const endMin = (startMin + durationMins) % 60;
  const statuses: AuditStatus[] = ['待审核', '待审核', '已通过', '已通过', '已通过', '已驳回', '已打绩效', '已结算', '草稿'];
  const auditStatus = randomItem(statuses);
  const performanceStatuses: AuditStatus[] = auditStatus === '已打绩效' || auditStatus === '已结算' ? [auditStatus] : auditStatus === '已通过' ? ['已通过'] : ['草稿'];

  return {
    id: `VR${String(1000 + i).padStart(5, '0')}`,
    no: i + 1,
    specialist: randomItem(specialists),
    provider: randomItem(providers),
    workGroup: randomItem(workGroups),
    hospital: h.name,
    hospitalGrade: h.grade,
    department: randomItem(departments),
    visitee: randomItem(visiteeNames),
    variety: randomItem(varieties),
    visitPeriod: randomItem(visitPeriods),
    startTime: generateDateTime(daysAgo, startHour, startMin),
    startOnTime: startMin === 0,
    endTime: generateDateTime(daysAgo, endHour, endMin),
    endOnTime: endMin === 0,
    performanceStatus: randomItem(performanceStatuses),
    auditStatus,
    auditComment: auditStatus === '已驳回' ? '拜访内容描述不详细，请补充学术交流细节。' : '',
    amount: randomAmount(),
    visitCategory: randomItem(visitCategories),
  };
});

// ===== 品种 / 授权 / 价目（确定性） =====

export const seedVarieties: Variety[] = [
  { id: 'V-001', genericName: '阿托伐他汀钙片', tradeName: '阿托伐他汀钙片(20mg)', approvalNo: '国药准字H20051408', dosageForm: '片剂', spec: '20mg', package: '7片/板×2板/盒', unit: '盒', holder: DEMO_HOLDER, manufacturer: '百益制药', validUntil: '2028-12-31' },
  { id: 'V-002', genericName: '二甲双胍缓释片', tradeName: '二甲双胍缓释片(500mg)', approvalNo: '国药准字H20040153', dosageForm: '缓释片', spec: '500mg', package: '20片/瓶', unit: '瓶', holder: DEMO_HOLDER, manufacturer: '百益制药', validUntil: '2027-06-30' },
  { id: 'V-003', genericName: '奥美拉唑肠溶胶囊', tradeName: '奥美拉唑肠溶胶囊(20mg)', approvalNo: '国药准字H20033394', dosageForm: '肠溶胶囊', spec: '20mg', package: '7粒/板×2板/盒', unit: '盒', holder: DEMO_HOLDER, manufacturer: '百益制药', validUntil: '2028-03-31' },
  { id: 'V-004', genericName: '氨氯地平片', tradeName: '氨氯地平片(5mg)', approvalNo: '国药准字H20020390', dosageForm: '片剂', spec: '5mg', package: '7片/板×4板/盒', unit: '盒', holder: DEMO_HOLDER, manufacturer: '百益制药', validUntil: '2029-01-31' },
  { id: 'V-005', genericName: '瑞舒伐他汀钙片', tradeName: '瑞舒伐他汀钙片(10mg)', approvalNo: '国药准字H20080687', dosageForm: '片剂', spec: '10mg', package: '7片/板×1板/盒', unit: '盒', holder: DEMO_HOLDER, manufacturer: '百益制药', validUntil: '2028-09-30' },
];

export function varietyDisplayName(v: Variety): string {
  return v.tradeName;
}

export const seedAuths: VarietyProviderAuth[] = [
  { id: 'AUTH-001', provider: '智联科技有限公司', varietyId: 'V-001', varietyName: '阿托伐他汀钙片(20mg)', holder: DEMO_HOLDER, regions: ['陕西', '江苏', '浙江', '广东'] },
  { id: 'AUTH-002', provider: '康晟云服科技有限公司', varietyId: 'V-002', varietyName: '二甲双胍缓释片(500mg)', holder: DEMO_HOLDER, regions: ['山东'] },
  { id: 'AUTH-003', provider: '永泰汇通推广有限公司', varietyId: 'V-002', varietyName: '二甲双胍缓释片(500mg)', holder: DEMO_HOLDER, regions: ['北京'] },
  { id: 'AUTH-004', provider: '东方恒业推广有限公司', varietyId: 'V-003', varietyName: '奥美拉唑肠溶胶囊(20mg)', holder: DEMO_HOLDER, regions: ['广东'] },
  { id: 'AUTH-005', provider: '康晟云服科技有限公司', varietyId: 'V-003', varietyName: '奥美拉唑肠溶胶囊(20mg)', holder: DEMO_HOLDER, regions: ['浙江'] },
  { id: 'AUTH-006', provider: '康晟云服科技有限公司', varietyId: 'V-004', varietyName: '氨氯地平片(5mg)', holder: DEMO_HOLDER, regions: ['北京'] },
  { id: 'AUTH-007', provider: '东方恒业推广有限公司', varietyId: 'V-004', varietyName: '氨氯地平片(5mg)', holder: DEMO_HOLDER, regions: ['广东'] },
  { id: 'AUTH-008', provider: '永泰汇通推广有限公司', varietyId: 'V-005', varietyName: '瑞舒伐他汀钙片(10mg)', holder: DEMO_HOLDER, regions: ['全国'] },
  // 演示：智联同时覆盖二甲双胍 · 陕西/江苏，支撑多品种多地区任务
  { id: 'AUTH-009', provider: '智联科技有限公司', varietyId: 'V-002', varietyName: '二甲双胍缓释片(500mg)', holder: DEMO_HOLDER, regions: ['陕西', '江苏'] },
];

/** 所选省份必须都被该服务商覆盖（含「全国」授权） */
export function filterAuthorizedProviders(
  auths: VarietyProviderAuth[],
  varietyName: string,
  regions: string[],
): string[] {
  if (!varietyName || regions.length === 0) return [];
  const rows = auths.filter((a) => a.varietyName === varietyName);
  return [...new Set(rows.filter((a) => {
    if (a.regions.includes('全国')) return true;
    if (regions.includes('全国')) return a.regions.includes('全国');
    return regions.every((r) => a.regions.includes(r));
  }).map((a) => a.provider))];
}

export function isPairAuthorized(
  auths: VarietyProviderAuth[],
  provider: string,
  varietyName: string,
  region: string,
): boolean {
  return filterAuthorizedProviders(auths, varietyName, [region]).includes(provider);
}

/** 某服务商已授权的品种 */
export function varietiesOfProvider(auths: VarietyProviderAuth[], provider: string): string[] {
  return [...new Set(auths.filter((a) => a.provider === provider).map((a) => a.varietyName))];
}

/** 某服务商在所选品种上覆盖的地区（含全国） */
export function regionsOfProvider(
  auths: VarietyProviderAuth[],
  provider: string,
  varieties?: string[],
): string[] {
  const rows = auths.filter((a) => a.provider === provider && (!varieties?.length || varieties.includes(a.varietyName)));
  return [...new Set(rows.flatMap((a) => a.regions))];
}

const PRICE_DEFS: { category: '市场推广服务'; name: string; amount: number; unit: string; isContractAmount: boolean; isPreset: boolean; ratio: number }[] = [
  { category: '市场推广服务', name: '医院拜访', amount: 200, unit: '次', isContractAmount: true, isPreset: true, ratio: 40 },
  { category: '市场推广服务', name: '商业拜访', amount: 300, unit: '次', isContractAmount: true, isPreset: false, ratio: 10 },
  { category: '市场推广服务', name: '科室会议', amount: 2000, unit: '场', isContractAmount: true, isPreset: true, ratio: 30 },
  { category: '市场推广服务', name: '学术推广', amount: 500, unit: '次', isContractAmount: true, isPreset: true, ratio: 20 },
];

const REPORT_PRICE_DEFS: { reportType: '分析报告服务' | '问卷调研与分析服务'; name: string; amount: number; unit: string; ratio: number }[] = [
  { reportType: '分析报告服务', name: '临床应用研究报告', amount: 15000, unit: '份', ratio: 30 },
  { reportType: '分析报告服务', name: '联合用药研究报告', amount: 15000, unit: '份', ratio: 30 },
  { reportType: '问卷调研与分析服务', name: '问卷样本量', amount: 20, unit: '份', ratio: 20 },
  { reportType: '问卷调研与分析服务', name: '分析总结', amount: 3000, unit: '份', ratio: 20 },
];

function pricesFor(varietyId: string): { items: PriceItem[]; ratios: PriceRatio[]; reports: ReportPrice[] } {
  const items = PRICE_DEFS.map((d, i) => ({
    id: `PI-${varietyId}-${i + 1}`,
    varietyId,
    category: d.category,
    name: d.name,
    amount: d.amount,
    unit: d.unit,
    isContractAmount: d.isContractAmount,
    isPreset: d.isPreset,
  }));
  const ratios = PRICE_DEFS.map((d, i) => ({
    id: `PR-${varietyId}-${i + 1}`,
    varietyId,
    name: d.name,
    ratio: d.ratio,
  }));
  const reports = REPORT_PRICE_DEFS.map((d, i) => ({
    id: `RP-${varietyId}-${i + 1}`,
    varietyId,
    reportType: d.reportType,
    name: d.name,
    amount: d.amount,
    unit: d.unit,
    ratio: d.ratio,
  }));
  return { items, ratios, reports };
}

const allPrice = seedVarieties.map((v) => pricesFor(v.id));
export const seedPriceItems: PriceItem[] = allPrice.flatMap((p) => p.items);
export const seedPriceRatios: PriceRatio[] = allPrice.flatMap((p) => p.ratios);
export const seedReportPrices: ReportPrice[] = allPrice.flatMap((p) => p.reports);

// ===== 预算计划（只表达企业计划；含 月度合计≠年度预算、某月=0 两种示例） =====

function evenMonths(yearAmount: number): number[] {
  const base = Math.floor(yearAmount / 12);
  const months = Array.from({ length: 12 }, () => base);
  months[11] += yearAmount - base * 12;
  return months;
}

export const seedBudgetPlans: BudgetPlan[] = [
  {
    // 月度合计 540,000 ≠ 年度预算 600,000，页面提示差异、不阻断
    id: 'BP-001', year: 2026, provider: '智联科技有限公司',
    varieties: ['阿托伐他汀钙片(20mg)', '二甲双胍缓释片(500mg)'],
    regions: ['陕西', '江苏', '浙江', '广东'],
    yearAmount: 600000,
    months: [40000, 40000, 40000, 40000, 40000, 40000, 50000, 80000, 50000, 40000, 40000, 40000],
    updatedAt: '2026-03-12 10:00',
  },
  {
    id: 'BP-002', year: 2026, provider: '东方恒业推广有限公司',
    varieties: ['奥美拉唑肠溶胶囊(20mg)', '氨氯地平片(5mg)'],
    regions: ['广东'],
    yearAmount: 240000, months: evenMonths(240000), updatedAt: '2026-01-08 09:50',
  },
  {
    // 11、12 月未排预算，分析页显示「无预算」
    id: 'BP-003', year: 2026, provider: '康晟云服科技有限公司',
    varieties: ['二甲双胍缓释片(500mg)', '奥美拉唑肠溶胶囊(20mg)', '氨氯地平片(5mg)'],
    regions: ['山东', '浙江', '北京'],
    yearAmount: 180000,
    months: [18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000, 0, 0],
    updatedAt: '2026-01-08 10:00',
  },
  {
    id: 'BP-004', year: 2026, provider: '永泰汇通推广有限公司',
    varieties: ['瑞舒伐他汀钙片(10mg)', '二甲双胍缓释片(500mg)'],
    regions: ['全国'],
    yearAmount: 150000, months: evenMonths(150000), updatedAt: '2026-01-08 10:10',
  },
];

type ItemDef = [category: ServiceItem['category'], name: string, unitPrice: number, unit: string, qty: number];

function buildItems(prefix: string, variety: string, defs: ItemDef[]): ServiceItem[] {
  return defs.map((d, i) => ({
    id: `${prefix}-SI-${i + 1}`,
    variety,
    category: d[0],
    name: d[1],
    unitPrice: d[2],
    unit: d[3],
    qty: d[4],
    amount: d[2] * d[4],
  }));
}

const V_ATOR = '阿托伐他汀钙片(20mg)';
const V_METF = '二甲双胍缓释片(500mg)';
const V_OME = '奥美拉唑肠溶胶囊(20mg)';
const V_AMLO = '氨氯地平片(5mg)';
const V_ROSU = '瑞舒伐他汀钙片(10mg)';

// ===== 任务 9 条：全状态 + 跨月 + 按月+工作组结算 + 多品种多地区演示 =====
export const seedTasks: Task[] = [
  {
    id: 'TR-001', taskNo: 'TK-2026-0001', taskName: `${V_ATOR}_百益健康科技`,
    varieties: [V_ATOR], provider: '智联科技有限公司', regions: ['陕西'],
    startDate: '2026-09-01', endDate: '2026-09-30',
    planAmount: 60000, settledAmount: 0, remainingVoided: false,
    taskStatus: '待确认', reconStatus: '未发起',
    createdAt: '2026-08-20 10:00', createdBy: '李强',
    serviceItems: buildItems('TR-001', V_ATOR, [
      ['市场推广服务', '医院拜访', 200, '次', 120],
      ['市场推广服务', '科室会议', 2000, '场', 9],
      ['市场推广服务', '学术推广', 500, '次', 36],
    ]),
    workgroupSplits: [], workloadAssigns: [], reports: [], settlements: [],
  },
  {
    id: 'TR-002', taskNo: 'TK-2026-0002', taskName: `${V_METF}_百益健康科技`,
    varieties: [V_METF], provider: '康晟云服科技有限公司', regions: ['山东'],
    startDate: '2026-08-05', endDate: '2026-09-30',
    planAmount: 45000, settledAmount: 0, remainingVoided: false,
    taskStatus: '执行中', reconStatus: '未发起',
    createdAt: '2026-08-07 09:30', createdBy: '李强',
    serviceItems: buildItems('TR-002', V_METF, [
      ['市场推广服务', '医院拜访', 200, '次', 90],
      ['市场推广服务', '商业拜访', 300, '次', 40],
      ['市场推广服务', '学术推广', 500, '次', 30],
    ]),
    workgroupSplits: [], workloadAssigns: [], reports: [], settlements: [],
  },
  {
    id: 'TR-003', taskNo: 'TK-2026-0003', taskName: `${V_OME}_百益健康科技`,
    varieties: [V_OME], provider: '东方恒业推广有限公司', regions: ['广东'],
    startDate: '2026-08-01', endDate: '2026-09-30',
    planAmount: 104000, settledAmount: 0, remainingVoided: false,
    taskStatus: '执行中', reconStatus: '未发起',
    createdAt: '2026-07-25 11:00', createdBy: '李强',
    serviceItems: buildItems('TR-003', V_OME, [
      ['市场推广服务', '医院拜访', 200, '次', 140],
      ['市场推广服务', '科室会议', 2000, '场', 10],
      ['分析报告服务', '临床应用研究报告', 15000, '份', 2],
      ['问卷调研与分析服务', '问卷样本量', 20, '份', 1000],
      ['问卷调研与分析服务', '分析总结', 3000, '份', 2],
    ]),
    workgroupSplits: [
      { id: 'TR-003-WG-1', workGroup: '业务一组', variety: V_OME, region: '广东', amount: 60000, startDate: '2026-08-01', endDate: '2026-09-30' },
      { id: 'TR-003-WG-2', workGroup: '业务二组', variety: V_OME, region: '广东', amount: 44000, startDate: '2026-08-01', endDate: '2026-09-30' },
    ],
    workloadAssigns: [], reports: [], settlements: [],
  },
  {
    id: 'TR-004', taskNo: 'TK-2026-0004', taskName: `${V_ATOR}_百益健康科技`,
    varieties: [V_ATOR], provider: '智联科技有限公司', regions: ['陕西'],
    startDate: '2026-07-01', endDate: '2026-09-30',
    planAmount: 120000, settledAmount: 36000, remainingVoided: false,
    taskStatus: '执行中', reconStatus: '对账中',
    createdAt: '2026-06-28 09:20', createdBy: '李强',
    serviceItems: buildItems('TR-004', V_ATOR, [
      ['市场推广服务', '医院拜访', 200, '次', 260],
      ['市场推广服务', '商业拜访', 300, '次', 60],
      ['市场推广服务', '科室会议', 2000, '场', 15],
      ['市场推广服务', '学术推广', 500, '次', 40],
    ]),
    workgroupSplits: [
      { id: 'TR-004-WG-1', workGroup: '业务一组', variety: V_ATOR, region: '陕西', amount: 70000, startDate: '2026-07-01', endDate: '2026-09-30' },
      { id: 'TR-004-WG-2', workGroup: '业务二组', variety: V_ATOR, region: '陕西', amount: 50000, startDate: '2026-07-01', endDate: '2026-09-30' },
    ],
    workloadAssigns: [
      { id: 'TR-004-WL-1', workGroup: '业务一组', specialist: '张伟', variety: V_ATOR, region: '陕西', category: '市场推广服务', itemName: '医院拜访', workload: 120, amount: 24000, progress: '已完成', serviceMonth: '2026-07', settledBillNo: 'JS-2026-0004-01' },
      { id: 'TR-004-WL-2', workGroup: '业务一组', specialist: '李强', variety: V_ATOR, region: '陕西', category: '市场推广服务', itemName: '科室会议', workload: 6, amount: 12000, progress: '已完成', serviceMonth: '2026-07', settledBillNo: 'JS-2026-0004-01' },
      { id: 'TR-004-WL-3', workGroup: '业务二组', specialist: '王芳', variety: V_ATOR, region: '陕西', category: '市场推广服务', itemName: '医院拜访', workload: 80, amount: 16000, progress: '已完成', serviceMonth: '2026-08', settledBillNo: 'JS-2026-0004-02' },
      { id: 'TR-004-WL-4', workGroup: '业务二组', specialist: '陈静', variety: V_ATOR, region: '陕西', category: '市场推广服务', itemName: '学术推广', workload: 20, amount: 10000, progress: '待审核', serviceMonth: '2026-08' },
      { id: 'TR-004-WL-5', workGroup: '业务三组', specialist: '杨明', variety: V_ATOR, region: '陕西', category: '市场推广服务', itemName: '商业拜访', workload: 30, amount: 9000, progress: '未完成', serviceMonth: '2026-09' },
    ],
    reports: [],
    settlements: [
      {
        id: 'SB-004-1', billNo: 'JS-2026-0004-01', contractNo: 'HT-2026-BY-001',
        workGroup: '业务一组', servicePeriod: '2026-07-01 ~ 2026-09-30',
        serviceMonth: '2026-07', madeAt: '2026-08-02', provider: '智联科技有限公司',
        lines: [
          { id: 'SB-004-1-L1', variety: V_ATOR, region: '陕西', serviceType: '市场推广服务', serviceItem: '医院拜访', serviceAmount: 24000, actualAmount: 24000, remark: '' },
          { id: 'SB-004-1-L2', variety: V_ATOR, region: '陕西', serviceType: '市场推广服务', serviceItem: '科室会议', serviceAmount: 12000, actualAmount: 12000, remark: '' },
        ],
        finalAmount: 36000, confirmed: true, confirmedAt: '2026-08-05', confirmedBy: '李强',
        paymentVoucher: '付款凭证-JS-2026-0004-01.pdf',
      },
      {
        id: 'SB-004-2', billNo: 'JS-2026-0004-02', contractNo: 'HT-2026-BY-001',
        workGroup: '业务二组', servicePeriod: '2026-07-01 ~ 2026-09-30',
        serviceMonth: '2026-08', madeAt: '2026-08-20', provider: '智联科技有限公司',
        lines: [
          { id: 'SB-004-2-L1', variety: V_ATOR, region: '陕西', serviceType: '市场推广服务', serviceItem: '医院拜访', serviceAmount: 16000, actualAmount: 16000, remark: '' },
        ],
        finalAmount: 16000, confirmed: false,
      },
    ],
  },
  {
    id: 'TR-005', taskNo: 'TK-2026-0005', taskName: `${V_OME}_百益健康科技`,
    varieties: [V_OME], provider: '东方恒业推广有限公司', regions: ['广东'],
    startDate: '2026-07-01', endDate: '2026-08-31',
    planAmount: 46000, settledAmount: 0, remainingVoided: false,
    taskStatus: '执行中', reconStatus: '未发起',
    createdAt: '2026-07-02 14:00', createdBy: '李强',
    serviceItems: buildItems('TR-005', V_OME, [
      ['分析报告服务', '临床应用研究报告', 15000, '份', 2],
      ['问卷调研与分析服务', '问卷样本量', 20, '份', 500],
      ['问卷调研与分析服务', '分析总结', 3000, '份', 2],
    ]),
    workgroupSplits: [], workloadAssigns: [],
    reports: [
      { id: 'TR-005-RP-1', name: '奥美拉唑广东市场分析报告.pdf', uploadedAt: '2026-08-18 16:20', uploadedBy: '东方恒业推广有限公司', status: '待审核', comment: '' },
    ],
    settlements: [],
  },
  {
    id: 'TR-006', taskNo: 'TK-2026-0006', taskName: `${V_ROSU}_百益健康科技`,
    varieties: [V_ROSU], provider: '永泰汇通推广有限公司', regions: ['四川'],
    startDate: '2026-06-01', endDate: '2026-06-30',
    planAmount: 40000, settledAmount: 40000, remainingVoided: false,
    taskStatus: '已结算', reconStatus: '已结算',
    createdAt: '2026-05-28 11:00', createdBy: '李强',
    serviceItems: buildItems('TR-006', V_ROSU, [
      ['市场推广服务', '医院拜访', 200, '次', 100],
      ['市场推广服务', '科室会议', 2000, '场', 5],
      ['市场推广服务', '学术推广', 500, '次', 20],
    ]),
    workgroupSplits: [
      { id: 'TR-006-WG-1', workGroup: '业务三组', variety: V_ROSU, region: '四川', amount: 40000, startDate: '2026-06-01', endDate: '2026-06-30' },
    ],
    workloadAssigns: [
      { id: 'TR-006-WL-1', workGroup: '业务三组', specialist: '刘洋', variety: V_ROSU, region: '四川', category: '市场推广服务', itemName: '医院拜访', workload: 100, amount: 20000, progress: '已完成', serviceMonth: '2026-06', settledBillNo: 'JS-2026-0006-01' },
      { id: 'TR-006-WL-2', workGroup: '业务三组', specialist: '赵磊', variety: V_ROSU, region: '四川', category: '市场推广服务', itemName: '科室会议', workload: 5, amount: 10000, progress: '已完成', serviceMonth: '2026-06', settledBillNo: 'JS-2026-0006-01' },
      { id: 'TR-006-WL-3', workGroup: '业务三组', specialist: '孙丽', variety: V_ROSU, region: '四川', category: '市场推广服务', itemName: '学术推广', workload: 20, amount: 10000, progress: '已完成', serviceMonth: '2026-06', settledBillNo: 'JS-2026-0006-01' },
    ],
    reports: [],
    settlements: [
      {
        id: 'SB-006-1', billNo: 'JS-2026-0006-01', contractNo: 'HT-2026-BY-001',
        workGroup: '业务三组', servicePeriod: '2026-06-01 ~ 2026-06-30',
        serviceMonth: '2026-06', madeAt: '2026-07-02', provider: '永泰汇通推广有限公司',
        lines: [
          { id: 'SB-006-1-L1', variety: V_ROSU, region: '四川', serviceType: '市场推广服务', serviceItem: '医院拜访', serviceAmount: 20000, actualAmount: 20000, remark: '' },
          { id: 'SB-006-1-L2', variety: V_ROSU, region: '四川', serviceType: '市场推广服务', serviceItem: '科室会议', serviceAmount: 10000, actualAmount: 10000, remark: '' },
          { id: 'SB-006-1-L3', variety: V_ROSU, region: '四川', serviceType: '市场推广服务', serviceItem: '学术推广', serviceAmount: 10000, actualAmount: 10000, remark: '' },
        ],
        finalAmount: 40000, confirmed: true, confirmedAt: '2026-07-05', confirmedBy: '李强',
        paymentVoucher: '付款凭证-JS-2026-0006-01.pdf',
      },
    ],
  },
  {
    id: 'TR-007', taskNo: 'TK-2026-0007', taskName: `${V_ATOR}_百益健康科技`,
    varieties: [V_ATOR], provider: '智联科技有限公司', regions: ['陕西'],
    startDate: '2026-05-01', endDate: '2026-06-30',
    planAmount: 60000, settledAmount: 39000, remainingVoided: true,
    taskStatus: '已结算', reconStatus: '已结算',
    createdAt: '2026-04-28 10:00', createdBy: '李强',
    serviceItems: buildItems('TR-007', V_ATOR, [
      ['市场推广服务', '医院拜访', 200, '次', 130],
      ['市场推广服务', '科室会议', 2000, '场', 8],
      ['市场推广服务', '商业拜访', 300, '次', 20],
      ['市场推广服务', '学术推广', 500, '次', 24],
    ]),
    workgroupSplits: [
      { id: 'TR-007-WG-1', workGroup: '业务一组', variety: V_ATOR, region: '陕西', amount: 60000, startDate: '2026-05-01', endDate: '2026-06-30' },
    ],
    workloadAssigns: [
      { id: 'TR-007-WL-1', workGroup: '业务一组', specialist: '张伟', variety: V_ATOR, region: '陕西', category: '市场推广服务', itemName: '医院拜访', workload: 80, amount: 16000, progress: '已完成', serviceMonth: '2026-05', settledBillNo: 'JS-2026-0007-01' },
      { id: 'TR-007-WL-2', workGroup: '业务一组', specialist: '李强', variety: V_ATOR, region: '陕西', category: '市场推广服务', itemName: '科室会议', workload: 4, amount: 8000, progress: '已完成', serviceMonth: '2026-05', settledBillNo: 'JS-2026-0007-01' },
      { id: 'TR-007-WL-3', workGroup: '业务一组', specialist: '王芳', variety: V_ATOR, region: '陕西', category: '市场推广服务', itemName: '医院拜访', workload: 50, amount: 10000, progress: '已完成', serviceMonth: '2026-06', settledBillNo: 'JS-2026-0007-02' },
      { id: 'TR-007-WL-4', workGroup: '业务一组', specialist: '陈静', variety: V_ATOR, region: '陕西', category: '市场推广服务', itemName: '商业拜访', workload: 20, amount: 6000, progress: '已完成', serviceMonth: '2026-06', settledBillNo: 'JS-2026-0007-02' },
      { id: 'TR-007-WL-5', workGroup: '业务一组', specialist: '杨明', variety: V_ATOR, region: '陕西', category: '市场推广服务', itemName: '学术推广', workload: 24, amount: 12000, progress: '已完成', serviceMonth: '2026-06' },
    ],
    reports: [],
    settlements: [
      {
        id: 'SB-007-1', billNo: 'JS-2026-0007-01', contractNo: 'HT-2026-BY-001',
        workGroup: '业务一组', servicePeriod: '2026-05-01 ~ 2026-06-30',
        serviceMonth: '2026-05', madeAt: '2026-06-03', provider: '智联科技有限公司',
        lines: [
          { id: 'SB-007-1-L1', variety: V_ATOR, region: '陕西', serviceType: '市场推广服务', serviceItem: '医院拜访', serviceAmount: 16000, actualAmount: 16000, remark: '' },
          { id: 'SB-007-1-L2', variety: V_ATOR, region: '陕西', serviceType: '市场推广服务', serviceItem: '科室会议', serviceAmount: 8000, actualAmount: 8000, remark: '' },
        ],
        finalAmount: 24000, confirmed: true, confirmedAt: '2026-06-05', confirmedBy: '李强',
        paymentVoucher: '付款凭证-JS-2026-0007-01.pdf',
      },
      {
        id: 'SB-007-2', billNo: 'JS-2026-0007-02', contractNo: 'HT-2026-BY-001',
        workGroup: '业务一组', servicePeriod: '2026-05-01 ~ 2026-06-30',
        serviceMonth: '2026-06', madeAt: '2026-07-08', provider: '智联科技有限公司',
        lines: [
          { id: 'SB-007-2-L1', variety: V_ATOR, region: '陕西', serviceType: '市场推广服务', serviceItem: '医院拜访', serviceAmount: 10000, actualAmount: 10000, remark: '' },
          { id: 'SB-007-2-L2', variety: V_ATOR, region: '陕西', serviceType: '市场推广服务', serviceItem: '商业拜访', serviceAmount: 6000, actualAmount: 5000, remark: '一次商业拜访未达执行标准，与服务商确认按 ￥5,000 结算' },
        ],
        finalAmount: 15000, confirmed: true, confirmedAt: '2026-07-10', confirmedBy: '李强',
        paymentVoucher: '付款凭证-JS-2026-0007-02.pdf',
      },
    ],
  },
  {
    id: 'TR-008', taskNo: 'TK-2026-0008', taskName: `${V_AMLO}_百益健康科技`,
    varieties: [V_AMLO], provider: '康晟云服科技有限公司', regions: ['北京'],
    startDate: '2026-08-10', endDate: '2026-08-31',
    planAmount: 24000, settledAmount: 0, remainingVoided: false,
    taskStatus: '已撤销', reconStatus: '未发起',
    createdAt: '2026-08-09 15:00', createdBy: '李强',
    serviceItems: buildItems('TR-008', V_AMLO, [
      ['市场推广服务', '医院拜访', 200, '次', 60],
      ['市场推广服务', '学术推广', 500, '次', 24],
    ]),
    workgroupSplits: [], workloadAssigns: [], reports: [], settlements: [],
  },
  {
    // 多品种 + 多地区演示：智联 · 阿托伐他汀/二甲双胍 · 陕西/江苏；已按工作组拆解并完成 8 月一组结算
    id: 'TR-009', taskNo: 'TK-2026-0009', taskName: `${V_ATOR}、${V_METF}_百益健康科技`,
    varieties: [V_ATOR, V_METF], provider: '智联科技有限公司', regions: ['陕西', '江苏'],
    startDate: '2026-08-01', endDate: '2026-10-31',
    planAmount: 28000, settledAmount: 6000, remainingVoided: false,
    taskStatus: '执行中', reconStatus: '未发起',
    createdAt: '2026-07-30 09:00', createdBy: '李强',
    serviceItems: [
      ...buildItems('TR-009A', V_ATOR, [
        ['市场推广服务', '医院拜访', 200, '次', 50],
        ['市场推广服务', '科室会议', 2000, '场', 2],
      ]),
      ...buildItems('TR-009B', V_METF, [
        ['市场推广服务', '医院拜访', 200, '次', 40],
      ]),
    ],
    workgroupSplits: [
      { id: 'TR-009-WG-1', workGroup: '业务一组', variety: V_ATOR, region: '陕西', amount: 10000, startDate: '2026-08-01', endDate: '2026-09-30' },
      { id: 'TR-009-WG-2', workGroup: '业务一组', variety: V_ATOR, region: '江苏', amount: 4000, startDate: '2026-08-01', endDate: '2026-10-31' },
      { id: 'TR-009-WG-3', workGroup: '业务二组', variety: V_METF, region: '江苏', amount: 8000, startDate: '2026-08-01', endDate: '2026-10-31' },
      { id: 'TR-009-WG-4', workGroup: '业务二组', variety: V_METF, region: '陕西', amount: 6000, startDate: '2026-09-01', endDate: '2026-10-31' },
    ],
    workloadAssigns: [
      { id: 'TR-009-WL-1', workGroup: '业务一组', specialist: '张伟', variety: V_ATOR, region: '陕西', category: '市场推广服务', itemName: '医院拜访', workload: 30, amount: 6000, progress: '已完成', serviceMonth: '2026-08', settledBillNo: 'JS-2026-0009-01' },
      { id: 'TR-009-WL-2', workGroup: '业务一组', specialist: '李强', variety: V_ATOR, region: '江苏', category: '市场推广服务', itemName: '科室会议', workload: 2, amount: 4000, progress: '已完成', serviceMonth: '2026-08' },
      { id: 'TR-009-WL-3', workGroup: '业务二组', specialist: '王芳', variety: V_METF, region: '江苏', category: '市场推广服务', itemName: '医院拜访', workload: 40, amount: 8000, progress: '已完成', serviceMonth: '2026-08' },
      { id: 'TR-009-WL-4', workGroup: '业务二组', specialist: '陈静', variety: V_METF, region: '陕西', category: '市场推广服务', itemName: '医院拜访', workload: 20, amount: 4000, progress: '待审核', serviceMonth: '2026-09' },
    ],
    reports: [],
    settlements: [
      {
        id: 'SB-009-1', billNo: 'JS-2026-0009-01', contractNo: 'HT-2026-BY-001',
        workGroup: '业务一组', servicePeriod: '2026-08-01 ~ 2026-10-31',
        serviceMonth: '2026-08', madeAt: '2026-08-22', provider: '智联科技有限公司',
        lines: [
          { id: 'SB-009-1-L1', variety: V_ATOR, region: '陕西', serviceType: '市场推广服务', serviceItem: '医院拜访', serviceAmount: 6000, actualAmount: 6000, remark: '' },
        ],
        finalAmount: 6000, confirmed: true, confirmedAt: '2026-08-23', confirmedBy: '李强',
        paymentVoucher: '付款凭证-JS-2026-0009-01.pdf',
      },
    ],
  },
];

const tierLabels = ['KOL A类', 'KOL B类', '普通医生', '潜力医生'];
const tagPool = ['高处方量', '学术影响力强', '新品接受度高', '需重点维护', '价格敏感', '院内推广重点'];

export const doctors: Doctor[] = Array.from({ length: 40 }, (_, i) => ({
  id: `DR${String(3000 + i).padStart(5, '0')}`,
  name: randomItem(doctorNames) + (i % 3 === 0 ? '（同名）' : ''),
  title: randomItem(['主任医师', '副主任医师', '主治医师', '住院医师']),
  hospital: randomItem(hospitals).name,
  department: randomItem(departments),
  tier: randomItem(tierLabels),
  tags: Array.from({ length: randomInt(1, 3) }, () => randomItem(tagPool)),
  cooperationStatus: randomItem(['合作中', '合作中', '合作中', '暂停合作', '未合作'] as const),
  lastVisit: generateDate(randomInt(1, 60)),
  visitCount: randomInt(2, 24),
}));

const modules = ['医院拜访管理', '任务执行', '结算单据', '医生主数据', '角色管理', '系统配置'];
const actions = ['新建', '修改', '删除', '审核通过', '审核驳回', '提交', '导出', '批量修改'];
const roles = ['药厂销售部门', '药厂合规部门', '服务提供商'];

export const auditLogs: AuditLogEntry[] = Array.from({ length: 80 }, (_, i) => {
  const action = randomItem(actions);
  const module = randomItem(modules);
  return {
    id: `AL${String(5000 + i).padStart(5, '0')}`,
    time: generateDateTime(randomInt(0, 14), randomInt(8, 22), randomInt(0, 59)),
    operator: randomItem(specialists),
    role: randomItem(roles),
    module,
    action,
    target: `${module}记录 #${randomInt(1000, 9999)}`,
    beforeState: ['修改', '审核通过', '审核驳回'].includes(action) ? randomItem(auditStatuses) : undefined,
    afterState: ['修改', '审核通过', '审核驳回'].includes(action) ? randomItem(auditStatuses) : undefined,
    ip: `10.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`,
    result: Math.random() > 0.05 ? '成功' : '失败',
  };
});

export const roleDashboardData: Record<Role, DashboardRoleData> = {
  '药厂销售部门': {
    role: '药厂销售部门',
    headline: '销售执行总览',
    subtitle: '今天最值得关注的是任务进度、预算执行与超期填报。',
    unreadCount: 11,
    metrics: [
      { id: 'pm-1', title: '今日拜访量', value: 126, unit: '次', delta: 18, deltaLabel: '较昨日', subtitle: '目标 140 次', icon: 'clipboard', actionLabel: '查看拜访', target: 'hospital-visits' },
      { id: 'pm-2', title: '有效拜访率', value: '82%', delta: 4, deltaLabel: '较昨日', subtitle: '达标线 80%', icon: 'percent', iconColor: '#248A5A', iconBg: '#E6F5ED', actionLabel: '查看质量', target: 'hospital-visits' },
      { id: 'pm-3', title: '任务执行进度', value: '5/8', delta: 1, deltaLabel: '执行中/全部', subtitle: '待确认 1 条', icon: 'progress', iconColor: '#C73A3A', iconBg: '#FEECEC', urgency: 'danger', actionLabel: '查看任务', target: 'task-dispatch' },
      { id: 'pm-4', title: '未结算任务计划金额', value: '￥33.9万', subtitle: '5 条任务未结清', icon: 'wallet', iconColor: '#C77A16', iconBg: '#FEF3E2', urgency: 'warning', actionLabel: '查看分析', target: 'budget-plan' },
      { id: 'pm-5', title: '超期未填报', value: 9, unit: '人', delta: 2, deltaLabel: '新增', icon: 'alert', iconColor: '#C73A3A', iconBg: '#FEECEC', urgency: 'danger', actionLabel: '催办填报', target: 'hospital-visits' },
    ],
    insights: [
      {
        id: 'pm-ai-1',
        title: '业务四组执行落后',
        conclusion: '业务四组 3 个任务进度落后时间进度 15%，本周目标存在失约风险。',
        basis: '命中规则：任务完成率 < 时间进度 - 10%。',
        dataRange: '业务四组 3 个任务，近 7 日',
        confidence: '高',
        suggestion: '优先催办责任工作组，并检查是否需要调整资源分配。',
        actionLabel: '查看任务',
        target: 'task-dispatch',
        confirmationNote: 'AI 只提示进度风险，是否催办与调整资源需人工确认。',
        severity: 'risk',
      },
      {
        id: 'pm-ai-2',
        title: '陕西 5-7 月推广费用低于月度预算',
        conclusion: '阿托伐他汀钙片(20mg) · 陕西 · 市场推广服务，5-7 月已结算实际 ￥75,000，同期月度预算 ￥90,000，偏离额 -￥15,000。',
        basis: '偏离额 = 已结算实际 − 月度预算。',
        dataRange: '2026 年 5-7 月已确认结算单',
        confidence: '高',
        suggestion: '结合未结算任务计划金额判断是否需要调整后续月度预算。',
        actionLabel: '查看分析',
        target: 'budget-plan',
        confirmationNote: '偏离数字仅供判断，是否调整预算由人工决策。',
        severity: 'info',
      },
      {
        id: 'pm-ai-3',
        title: '服务商证据链通过率偏低',
        conclusion: '东方恒业推广有限公司近 3 日证据链通过率仅 72%，低于自营团队 16 个点。',
        basis: '命中规则：服务商与自营团队通过率差值 > 10%。',
        dataRange: '近 3 日拜访与初审结果',
        confidence: '中',
        suggestion: '先查看存疑标签明细，再决定是否要求专项整改。',
        actionLabel: '查看拜访',
        target: 'hospital-visits',
        confirmationNote: 'AI 不自动判定违规，需人工复核后再处理。',
        severity: 'info',
      },
    ],
    queue: [
      { id: 'pm-q-1', name: '智联科技 · 阿托伐他汀任务 TK-2026-0004', type: '确认结算单', deadline: '2026-08-25 12:00', risk: 'overdue', assignee: '李强', lastAction: '昨天 · 对账中', actionLabel: '去确认', target: 'task-dispatch', note: '待确认结算单 ￥36,000' },
      { id: 'pm-q-2', name: '超期未填报专员 9 人', type: '任务提醒', deadline: '2026-08-22 18:00', risk: 'risk', assignee: '各服务商', lastAction: '1 小时前 · 系统提醒', actionLabel: '查看名单', target: 'hospital-visits' },
      { id: 'pm-q-3', name: '报告待审核 · TK-2026-0005', type: '审核报告', deadline: '2026-08-24 10:00', risk: 'attention', assignee: '李强', lastAction: '30 分钟前 · 服务商已上传', actionLabel: '去审核', target: 'task-dispatch' },
      { id: 'pm-q-4', name: '东方恒业推广有限公司 · 证据链通过率偏低', type: '质量关注', deadline: '2026-08-24 17:00', risk: 'normal', assignee: '陈静', lastAction: '今天 · 生成对比', actionLabel: '查看明细', target: 'hospital-visits' },
    ],
    messages: [
      { id: 'pm-m-1', type: '任务提醒', title: '1 条任务待确认', summary: 'TK-2026-0001 等待服务商确认，期间可撤销。', time: '8 分钟前', unread: true, reminderLevel: '1天提醒', actionLabel: '去查看', target: 'task-dispatch' },
      { id: 'pm-m-2', type: '任务提醒', title: '陕西 5-7 月推广偏离 -￥15,000', summary: '已结算实际 ￥75,000 / 月度预算 ￥90,000。', time: '15 分钟前', unread: true, actionLabel: '看分析', target: 'budget-plan' },
      { id: 'pm-m-3', type: '审批待办', title: '1 份报告待审核', summary: '奥美拉唑广东市场分析报告.pdf', time: '42 分钟前', actionLabel: '去审核', target: 'task-dispatch' },
      { id: 'pm-m-4', type: '转办通知', title: '服务商转办 2 条异常拜访', summary: '需确认是否升级处置。', time: '1 小时前', actionLabel: '查看转办', target: 'hospital-visits' },
    ],
    quickActions: [
      { id: 'pm-a-1', label: '任务执行', description: '处理待确认与对账中任务', target: 'task-dispatch' },
      { id: 'pm-a-2', label: '预算计划', description: '维护年度与月度预算', target: 'budget-plan' },
      { id: 'pm-a-3', label: '医院拜访', description: '检查证据链问题', target: 'hospital-visits' },
    ],
    recentOperations: [
      { id: 'pm-r-1', action: '创建任务', target: 'TK-2026-0001', user: '李强', time: '12 分钟前', color: '#176B5B' },
      { id: 'pm-r-2', action: '结算完结', target: 'TK-2026-0007', user: '李强', time: '34 分钟前', color: '#248A5A' },
      { id: 'pm-r-3', action: '调整预算', target: '阿托伐他汀 · 陕西 · 市场推广服务', user: '李强', time: '1 小时前', color: '#C77A16' },
      { id: 'pm-r-4', action: '导出', target: '组别执行对比', user: '药厂销售部门', time: '2 小时前', color: '#2F6BCE' },
    ],
    trend: {
      title: '近 7 日拜访趋势',
      subtitle: '今日已完成 126 次，低于目标 14 次',
      points: [
        { label: '08/16', value: 112 },
        { label: '08/17', value: 118 },
        { label: '08/18', value: 131 },
        { label: '08/19', value: 125 },
        { label: '08/20', value: 139 },
        { label: '08/21', value: 108 },
        { label: '08/22', value: 126 },
      ],
      summary: [
        { id: 'pm-s-1', label: '有效拜访', value: '82%', tone: 'success' },
        { id: 'pm-s-2', label: '时间进度', value: '68%', tone: 'brand' },
        { id: 'pm-s-3', label: '未结算任务', value: '￥33.9万', tone: 'warning' },
      ],
    },
    ranking: {
      title: '组别排名',
      items: [
        { id: 'pm-rank-1', label: 'TOP1 业务一组', value: '91%', hint: '拜访有效率', tone: 'success', progress: 91 },
        { id: 'pm-rank-2', label: 'TOP2 业务三组', value: '87%', hint: '任务兑现率', tone: 'brand', progress: 87 },
        { id: 'pm-rank-3', label: '垫底 业务四组', value: '64%', hint: '3 个任务落后', tone: 'danger', progress: 64 },
      ],
    },
    comparisonTable: {
      title: '双队伍执行对比',
      columns: ['任务完成率', '证据链通过率', '超期率'],
      rows: [
        { name: '自营团队', values: ['86%', '93%', '4%'], tone: 'success' },
        { name: '智联科技有限公司', values: ['81%', '88%', '6%'], tone: 'brand' },
        { name: '东方恒业推广有限公司', values: ['74%', '72%', '11%'], tone: 'danger' },
        { name: '康晟云服科技有限公司', values: ['79%', '84%', '7%'], tone: 'warning' },
      ],
    },
    spotlight: {
      title: '销售侧关注点',
      items: [
        { id: 'pm-sp-1', label: '本周需催办', value: '8 项', hint: '落后时间进度', tone: 'danger', progress: 72 },
        { id: 'pm-sp-2', label: '预算覆盖', value: '5 行', hint: '年度+月度预算已维护', tone: 'success', progress: 48 },
        { id: 'pm-sp-3', label: '需重点跟进服务商', value: '2 家', hint: '证据链通过率偏低', tone: 'warning', progress: 39 },
      ],
    },
  },
  '药厂合规部门': {
    role: '药厂合规部门',
    headline: '合规风险工作台',
    subtitle: '今天优先判断哪里可能出事、哪些事件必须立即处理。',
    unreadCount: 4,
    metrics: [
      { id: 'pc-rep', title: '专员异常备案', value: 2, unit: '人', subtitle: '未备案专员的推广提交会被系统自动拦截', icon: 'users', iconColor: '#C73A3A', iconBg: '#FEECEC', urgency: 'danger', actionLabel: '查看备案分析', target: 'dashboard', source: '备案数据核验' },
      { id: 'pc-supplier', title: '供应商准入待审', value: 4, unit: '家', subtitle: '准入待审 · 准入管理页首批未开放', icon: 'building', iconColor: '#C77A16', iconBg: '#FEF3E2', urgency: 'warning', actionLabel: '去审批', target: 'audit-log', source: '准入档案' },
      { id: 'pc-inspect', title: '待随检任务', value: 9, unit: '项', subtitle: '今日推荐 · 高风险任务已置顶', icon: 'camera', iconColor: '#2F6BCE', iconBg: '#EBF2FE', actionLabel: '进入随检', target: 'inspection', source: '随检引擎' },
      { id: 'pc-evidence', title: '证据链 AI 存疑待审', value: 6, unit: '条', subtitle: 'AI 一次自动审核存疑，待人工复审', icon: 'file-search', iconColor: '#C77A16', iconBg: '#FEF3E2', urgency: 'warning', actionLabel: '去复审', target: 'evidence-chain', source: '证据链一次自动审核' },
    ],
    insights: [
      {
        id: 'pc-ai-2',
        title: '供应商资质临近到期',
        conclusion: '东方恒业推广有限公司 30 天内将有 3 项资质到期，可能影响后续任务执行。',
        basis: '命中规则：资质有效期 <= 30 天。',
        dataRange: '供应商准入档案，更新于今日 08:20',
        confidence: '高',
        suggestion: '优先发起续证提醒，并核对是否仍在承接关键任务。',
        actionLabel: '查看准入',
        target: 'audit-log',
        confirmationNote: '是否暂停准入资格需合规管理员人工决策。',
        severity: 'attention',
      },
      {
        id: 'pc-ai-4',
        title: '证据存疑集中于业务三组',
        conclusion: '业务三组跟踪巡访任务证据存疑集中（3 条），建议优先复审。',
        basis: '命中规则：近 7 日同任务类型存疑记录 ≥ 3 条，且集中于同一工作组。',
        dataRange: '近 7 日证据链一次自动审核结果，更新于今日 09:00',
        confidence: '高',
        suggestion: '优先复审业务三组跟踪巡访存疑记录，并核对该组证据采集流程是否整改。',
        actionLabel: '去复审',
        target: 'evidence-chain',
        confirmationNote: '复审通过或退回需合规管理员人工裁定。',
        severity: 'risk',
      },
    ],
    queue: [
      { id: 'pc-q-1', name: '专员李晨 · 未备案，待补备案', type: '备案管理', deadline: '2026-08-24 18:00', risk: 'overdue', assignee: '合规管理员', lastAction: '30 分钟前 · 催补备案提醒', actionLabel: '处理备案', target: 'dashboard', note: '橙色审批门槛' },
      { id: 'pc-q-2', name: '供应商准入 #SP-2026-08-12', type: '审批待办', deadline: '2026-08-22 17:00', risk: 'risk', assignee: '合规管理员', lastAction: '1 小时前 · 补件完成', actionLabel: '查看审批', target: 'audit-log', note: '橙色审批门槛' },
      { id: 'pc-q-3', name: '随检任务池 · 今日推荐 9 条', type: '随检通知', deadline: '2026-08-23 09:00', risk: 'attention', assignee: '随检组', lastAction: '今天 · 待认领', actionLabel: '进入随检', target: 'inspection', note: '蓝色风控建议' },
      { id: 'pc-q-4', name: '证据链存疑 · 业务三组跟踪巡访 3 条', type: '证据复审', deadline: '2026-08-23 18:00', risk: 'normal', assignee: '合规管理员', lastAction: '今天 · AI 自动标注', actionLabel: '去复审', target: 'evidence-chain', note: '蓝色风控建议' },
    ],
    quickActions: [
      { id: 'pc-a-1', label: '随检工作台', description: '优先处理今日推荐任务', target: 'inspection' },
      { id: 'pc-a-2', label: '审批供应商准入', description: '处理补件与资质核验', target: 'audit-log' },
      { id: 'pc-a-3', label: '证据链存疑复审', description: '优先处理业务三组集中存疑', target: 'evidence-chain' },
    ],
    recentOperations: [
      { id: 'pc-r-1', action: '发起随检', target: '随检任务 QA-0081', user: '药厂合规部门', time: '29 分钟前', color: '#2F6BCE' },
      { id: 'pc-r-2', action: '复审通过', target: '证据记录 EV-1019', user: '陈静', time: '40 分钟前', color: '#248A5A' },
      { id: 'pc-r-3', action: '退回补件', target: '供应商准入 SP-2026-08-12', user: '王芳', time: '50 分钟前', color: '#C77A16' },
      { id: 'pc-r-4', action: '催补备案', target: '专员李晨', user: '药厂合规部门', time: '1 小时前', color: '#C73A3A' },
    ],
    trend: {
      title: '近 30 日风险趋势',
      subtitle: '高危风险本周上升，需要加密抽检',
      points: [
        { label: '第1周', value: 9 },
        { label: '第2周', value: 11 },
        { label: '第3周', value: 14 },
        { label: '第4周', value: 16 },
        { label: '本周', value: 19 },
      ],
      summary: [
        { id: 'pc-s-2', label: '监管政策', value: '7 件', tone: 'warning' },
        { id: 'pc-s-3', label: '风控提示', value: '9 件', tone: 'info' },
      ],
    },
    distribution: {
      title: '四对象维度分布',
      items: [
        { id: 'pc-d-1', label: '备案状态异常', value: '2 人', hint: '未备案 · 推广提交将被自动拦截', tone: 'danger', progress: 20 },
        { id: 'pc-d-2', label: '准入 · 资质', value: '41 件', hint: '准入待审 4 家 · 资质临期 37 件', tone: 'warning', progress: 55 },
        { id: 'pc-d-3', label: '随检覆盖', value: '9 项', hint: '今日推荐 · 待认领', tone: 'info', progress: 45 },
        { id: 'pc-d-4', label: '证据存疑', value: '6 条', hint: '业务三组跟踪巡访集中 3 条', tone: 'brand', progress: 60 },
      ],
    },
    spotlight: {
      title: '重点对象',
      items: [
        { id: 'pc-sp-1', label: '专员 · 李晨', value: '未备案', hint: '待补备案 · 提交将被系统拦截', tone: 'danger', progress: 90 },
        { id: 'pc-sp-2', label: '供应商 · 东方恒业推广有限公司', value: '资质 30 天临期', hint: '3 项资质待续证', tone: 'warning', progress: 65 },
        { id: 'pc-sp-3', label: '随检 · 业务一组学术拜访', value: '风险分 92', hint: '定位漂移 + 异常时间', tone: 'warning', progress: 92 },
        { id: 'pc-sp-4', label: '证据 · 业务三组跟踪巡访', value: '3 条存疑', hint: '建议优先复审', tone: 'info', progress: 70 },
      ],
    },
    inspectionWorkbench: {
      recommended: [
        { id: 'pc-i-1', label: '业务一组 · 学术拜访', value: '风险分 92', hint: '定位漂移 + 异常时间', tone: 'danger' },
        { id: 'pc-i-2', label: '业务四组 · 文献分享', value: '风险分 86', hint: '拍照时间逆序', tone: 'warning' },
        { id: 'pc-i-3', label: '业务三组 · 跟踪巡访', value: '风险分 81', hint: '证据链缺失', tone: 'info' },
      ],
      active: [
        { id: 'pc-i-4', label: '随检任务 QA-0081', value: '进行中', hint: '摄像头在线 / 定位正常', tone: 'success' },
        { id: 'pc-i-5', label: '随检任务 QA-0084', value: '进行中', hint: '定位弱信号，需关注', tone: 'warning' },
      ],
      pending: [
        { id: 'pc-i-6', label: '抽检结果待处理', value: '4 条', hint: '2 条待人工裁定', tone: 'brand' },
        { id: 'pc-i-7', label: '复核待关闭', value: '3 条', hint: '涉及供应商准入', tone: 'danger' },
      ],
    },
  },
  '服务提供商': {
    role: '服务提供商',
    headline: '服务商交付驾驶舱',
    subtitle: '今天重点看承接工作量、下属执行质量与本月结算兑现。',
    unreadCount: 8,
    metrics: [
      { id: 'sp-1', title: '承接任务数', value: 3, unit: '个', delta: 1, deltaLabel: '本周新增', icon: 'briefcase', actionLabel: '查看任务', target: 'task-dispatch' },
      { id: 'sp-2', title: '待分配工作量', value: 1, unit: '项', delta: 0, deltaLabel: '待处理', icon: 'users', actionLabel: '去分配', target: 'task-dispatch' },
      { id: 'sp-3', title: '在岗服务专员', value: 42, unit: '人', delta: 2, deltaLabel: '较上周', icon: 'user-check', actionLabel: '查看专员', target: 'settlement' },
      { id: 'sp-4', title: '本月结算金额', value: '￥4.0万', delta: 0, deltaLabel: '已确认', icon: 'coins', iconColor: '#248A5A', iconBg: '#E6F5ED', actionLabel: '查看结算', target: 'settlement' },
      { id: 'sp-5', title: '待初审数据', value: 27, unit: '条', delta: 6, deltaLabel: '新增', icon: 'file-search', iconColor: '#C77A16', iconBg: '#FEF3E2', urgency: 'warning', actionLabel: '进入初审', target: 'hospital-visits' },
      { id: 'sp-6', title: '超期未填报专员', value: 5, unit: '人', delta: 2, deltaLabel: '新增', icon: 'alert', iconColor: '#C73A3A', iconBg: '#FEECEC', urgency: 'danger', actionLabel: '查看名单', target: 'hospital-visits' },
    ],
    insights: [
      {
        id: 'sp-ai-1',
        title: '存疑记录集中',
        conclusion: '待初审池中有 9 条记录命中 AI 存疑标签，主要集中在照片清晰度不足。',
        basis: '命中规则：证据链图片模糊度评分 < 阈值。',
        dataRange: '今日待初审数据 27 条',
        confidence: '高',
        suggestion: '优先分配给经验较高的工作组长复核，避免反复驳回。',
        actionLabel: '查看初审池',
        target: 'hospital-visits',
        confirmationNote: 'AI 仅做预审分流，不自动判定通过或驳回。',
        severity: 'attention',
      },
      {
        id: 'sp-ai-2',
        title: '工作组负荷失衡',
        conclusion: '业务二组工作量占比 38%，明显高于其他组，存在超期风险。',
        basis: '命中规则：单组负荷占比 > 平均值 1.5 倍。',
        dataRange: '本周任务与专员排班数据',
        confidence: '中',
        suggestion: '调整待分配工作量，优先向业务三组和业务五组倾斜。',
        actionLabel: '查看任务分配',
        target: 'task-dispatch',
        confirmationNote: '是否调整排班需管理者人工确认。',
        severity: 'info',
      },
      {
        id: 'sp-ai-3',
        title: '结算金额可提升',
        conclusion: '若本周内清理 5 条超期未填报记录，本月预计可多确认结算 ￥3.8 万。',
        basis: '命中规则：超期未填报导致工作量暂缓结算。',
        dataRange: '2026-08 当前结算池',
        confidence: '高',
        suggestion: '今天优先催办超期专员，并安排工作组长跟踪。',
        actionLabel: '查看结算池',
        target: 'settlement',
        confirmationNote: '预测金额仅供参考，最终结算以人工审核结果为准。',
        severity: 'risk',
      },
    ],
    queue: [
      { id: 'sp-q-1', name: '待确认任务 TK-2026-0001', type: '确认任务', deadline: '2026-08-22 11:00', risk: 'overdue', assignee: '智联科技有限公司', lastAction: '今天 · 药厂已创建', actionLabel: '去确认', target: 'task-dispatch' },
      { id: 'sp-q-2', name: '超期未填报专员 5 人', type: '任务提醒', deadline: '2026-08-22 18:00', risk: 'risk', assignee: '工作组长', lastAction: '1 小时前 · 已催办一次', actionLabel: '查看名单', target: 'hospital-visits' },
      { id: 'sp-q-3', name: 'TK-2026-0004 对账中', type: '结算单据', deadline: '2026-08-23 10:00', risk: 'attention', assignee: '服务提供商', lastAction: '今天 · 已发起结算', actionLabel: '去查看', target: 'task-dispatch' },
      { id: 'sp-q-4', name: '本月结算批次 #SET-0822', type: '结算单据', deadline: '2026-08-24 16:00', risk: 'normal', assignee: '财务专员', lastAction: '今天 · 待初审完成', actionLabel: '查看结算', target: 'settlement' },
    ],
    messages: [
      { id: 'sp-m-1', type: '任务提醒', title: '9 条待初审记录命中 AI 存疑', summary: '建议优先分配有经验的工作组长。', time: '7 分钟前', unread: true, reminderLevel: '1小时提醒', actionLabel: '查看队列', target: 'hospital-visits' },
      { id: 'sp-m-2', type: '任务提醒', title: '1 条任务待确认', summary: 'TK-2026-0001 阿托伐他汀 · 陕西。', time: '18 分钟前', unread: true, actionLabel: '去确认', target: 'task-dispatch' },
      { id: 'sp-m-3', type: '审批待办', title: '2 条任务转派待确认', summary: '涉及业务二组负荷平衡。', time: '35 分钟前', actionLabel: '去确认', target: 'task-dispatch' },
      { id: 'sp-m-4', type: '转办通知', title: '药厂销售部门转办 1 条异常任务', summary: '需内部排查执行过程。', time: '1 小时前', actionLabel: '查看详情', target: 'task-dispatch' },
    ],
    quickActions: [
      { id: 'sp-a-1', label: '查看待确认任务', description: '确认后进入执行中', target: 'task-dispatch' },
      { id: 'sp-a-2', label: '进入待初审池', description: '优先处理 AI 存疑', target: 'hospital-visits' },
      { id: 'sp-a-3', label: '查看本月结算', description: '跟踪结算兑现', target: 'settlement' },
    ],
    recentOperations: [
      { id: 'sp-r-1', action: '发起结算', target: 'TK-2026-0004', user: '服务提供商', time: '11 分钟前', color: '#176B5B' },
      { id: 'sp-r-2', action: '初审驳回', target: '拜访记录 VR01102', user: '刘洋', time: '28 分钟前', color: '#C73A3A' },
      { id: 'sp-r-3', action: '拆分任务包', target: 'TK-2026-0004 · 业务一组/二组', user: '服务提供商', time: '46 分钟前', color: '#2F6BCE' },
      { id: 'sp-r-4', action: '催办', target: '超期未填报专员 2 人', user: '工作组长', time: '1 小时前', color: '#C77A16' },
    ],
    trend: {
      title: '任务 / 工作量趋势',
      subtitle: '本周接单增加，但待初审同步上升',
      points: [
        { label: '周一', value: 12 },
        { label: '周二', value: 15 },
        { label: '周三', value: 17 },
        { label: '周四', value: 14 },
        { label: '周五', value: 19 },
        { label: '周六', value: 16 },
        { label: '今天', value: 18 },
      ],
      summary: [
        { id: 'sp-s-1', label: '承接任务', value: '3 个', tone: 'brand' },
        { id: 'sp-s-2', label: '待初审', value: '27 条', tone: 'warning' },
        { id: 'sp-s-3', label: '超期未填报', value: '5 人', tone: 'danger' },
      ],
    },
    ranking: {
      title: '工作组排名',
      items: [
        { id: 'sp-rank-1', label: 'TOP1 业务三组', value: '94%', hint: '任务完成率', tone: 'success', progress: 94 },
        { id: 'sp-rank-2', label: 'TOP2 业务五组', value: '89%', hint: '证据链通过率', tone: 'brand', progress: 89 },
        { id: 'sp-rank-3', label: '关注 业务二组', value: '68%', hint: '负荷偏高', tone: 'warning', progress: 68 },
      ],
    },
    spotlight: {
      title: '初审视角',
      items: [
        { id: 'sp-sp-1', label: '照片清晰度不足', value: '6 条', tone: 'warning', progress: 56 },
        { id: 'sp-sp-2', label: '定位漂移', value: '2 条', tone: 'danger', progress: 19 },
        { id: 'sp-sp-3', label: '证据链缺项', value: '1 条', tone: 'info', progress: 11 },
      ],
    },
  },
};

export function getRoleDashboardData(role: Role): DashboardRoleData {
  return roleDashboardData[role];
}

export const evidenceChainRecords: EvidenceChainRecord[] = [
  { id: 'ev-1', taskNo: 'VR-2031', specialist: '杨明', provider: '东方恒业推广有限公司', workGroup: '业务三组', visitType: '跟踪巡访服务', time: '今天 09:12', aiTags: ['照片清晰度不足', '证据缺失'] },
  { id: 'ev-2', taskNo: 'VR-2034', specialist: '黄峰', provider: '东方恒业推广有限公司', workGroup: '业务三组', visitType: '跟踪巡访服务', time: '今天 08:47', aiTags: ['任务关联断裂'] },
  { id: 'ev-3', taskNo: 'VR-2036', specialist: '吴超', provider: '东方恒业推广有限公司', workGroup: '业务三组', visitType: '跟踪巡访服务', time: '昨天 17:30', aiTags: ['证据缺失'] },
  { id: 'ev-4', taskNo: 'VR-2019', specialist: '张伟', provider: '智联科技有限公司', workGroup: '业务一组', visitType: '学术拜访', time: '昨天 15:20', aiTags: ['照片清晰度不足'] },
  { id: 'ev-5', taskNo: 'VR-2022', specialist: '刘洋', provider: '智联科技有限公司', workGroup: '业务四组', visitType: '日常拜访', time: '昨天 11:05', aiTags: ['照片清晰度不足', '证据缺失'] },
  { id: 'ev-6', taskNo: 'VR-2008', specialist: '陈静', provider: '永泰汇通推广有限公司', workGroup: '业务五组', visitType: '信息收集和调研', time: '2 天前 16:40', aiTags: ['任务关联断裂'] },
];

export const repFilingAnalysis: RepFilingAnalysis = {
  summary: { unfiled: 2 },
  top: [
    { id: 'rf-1', name: '李晨', provider: '智联科技有限公司', status: '未备案', action: '催补备案' },
    { id: 'rf-2', name: '孙丽', provider: '东方恒业推广有限公司', status: '未备案', action: '催补备案' },
  ],
};

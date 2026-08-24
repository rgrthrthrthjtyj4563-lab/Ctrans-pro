import type {
  VisitRecord,
  PromotionTask,
  Doctor,
  SettlementRecord,
  AuditLogEntry,
  AuditStatus,
  TaskExecStatus,
  TaskPackage,
  MonthlyBudget,
  DashboardRoleData,
  Role,
  EvidenceChainRecord,
  RepFilingAnalysis,
} from '../types';

const auditStatuses: AuditStatus[] = ['草稿', '待审核', '已通过', '已驳回', '已打绩效', '已结算', '已撤销'];

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

const taskTypes = ['学术推广', '产品讲解', '文献分享', '病例讨论', '科室会议'];
const doctorNames = ['王建国', '李晓明', '张丽华', '刘志远', '陈美娟', '杨晓东', '赵文博', '孙洁', '黄志强', '吴敏'];
const lastActions = ['提交拜访记录', '更新任务进度', '发起审核', '查看详情', '修改拜访信息'];

export const promotionTasks: PromotionTask[] = Array.from({ length: 45 }, (_, i) => {
  const riskLevels: PromotionTask['riskLevel'][] = ['normal', 'normal', 'attention', 'attention', 'risk', 'overdue'];
  const riskLevel = randomItem(riskLevels);
  // 条25 七态：逾期/风险/需关注必在途（待执行或执行中），正常任务覆盖全七态
  const statusMap: Record<string, TaskExecStatus> = {
    overdue: '执行中',
    risk: '执行中',
    attention: randomItem(['待执行', '执行中'] as TaskExecStatus[]),
    normal: randomItem(['待分解', '待下发', '待执行', '执行中', '执行中', '已完成', '已完成', '任务取消', '任务终止'] as TaskExecStatus[]),
  };
  const deadline = riskLevel === 'overdue'
    ? generateDate(-randomInt(1, 5))
    : riskLevel === 'risk'
    ? generateDate(randomInt(1, 3))
    : riskLevel === 'attention'
    ? generateDate(randomInt(4, 7))
    : generateDate(randomInt(8, 30));

  return {
    id: `PT${String(2000 + i).padStart(5, '0')}`,
    taskNo: `TK-2026-${String(1000 + i)}`,
    doctor: randomItem(doctorNames),
    hospital: randomItem(hospitals).name,
    taskType: randomItem(taskTypes),
    assignee: randomItem(specialists),
    deadline,
    status: statusMap[riskLevel],
    lastAction: randomItem(lastActions),
    riskLevel,
    amount: randomInt(5, 50) * 200,
    progress: randomInt(0, 100),
  };
});

// ─── 预算三层数据（确定性静态数组，所有金额可人工复算）────────────────────
// 口径字典：预算额 / 已分配 / 执行中 / 已执行 / 已结算 / 已释放 / 可用余额
// 公式：可用余额 = 预算额 − 已分配 + 已释放；已分配 = Σ 非取消任务包 budgetOccupied
// 当前原型仅展开任务包关联的 7/8/9 三个月，其余月份留待预算总览页一轮补齐

export const monthlyBudgets: MonthlyBudget[] = [
  {
    // 7 月已关账：allocated = #PK-028 占用 96,000；已释放 = #PK-029 取消回溯 12,000
    id: 'BUD-2026-07', year: 2026, month: 7, monthLabel: '2026-07',
    budgetAmount: 110000, allocatedAmount: 96000, releasedAmount: 12000,
    availableAmount: 26000, // 110000 − 96000 + 12000
    executingAmount: 0, executedAmount: 88000, settledAmount: 88000,
    status: '已关账', timeProgress: 100,
  },
  {
    // 8 月焦点月：allocated = #PK-031~#PK-038 占用合计 369,000；已释放 = #PK-039 取消回溯 15,000
    id: 'BUD-2026-08', year: 2026, month: 8, monthLabel: '2026-08',
    budgetAmount: 400000, allocatedAmount: 369000, releasedAmount: 15000,
    availableAmount: 46000, // 400000 − 369000 + 15000
    executingAmount: 43300, executedAmount: 106300, settledAmount: 51500, // Σ 任务包实绩三口径
    status: '执行中', timeProgress: 77, // 按 8/24 当日
  },
  {
    // 9 月已分解：allocated = #PK-040 占用 42,000
    id: 'BUD-2026-09', year: 2026, month: 9, monthLabel: '2026-09',
    budgetAmount: 420000, allocatedAmount: 42000, releasedAmount: 0,
    availableAmount: 378000, // 420000 − 42000 + 0
    executingAmount: 0, executedAmount: 0, settledAmount: 0,
    status: '已分解', timeProgress: 0,
  },
];

export const taskPackages: TaskPackage[] = [
  // ── 7 月（已关账）──────────────────────────────────────────────
  {
    id: 'TP-028', packageNo: '#PK-028', monthBudgetId: 'BUD-2026-07',
    annualTaskName: '2026 心血管线学术推广', provider: '智联科技有限公司',
    variety: '阿托伐他汀钙片(20mg)', region: '华东',
    budgetOccupied: 96000, executingAmount: 0, executedAmount: 88000, settledAmount: 88000,
    progress: 100, deadline: '2026-07-28', status: '结算确认', riskLevel: 'normal',
    taskIds: ['PT02027', 'PT02028', 'PT02029'],
  },
  {
    id: 'TP-029', packageNo: '#PK-029', monthBudgetId: 'BUD-2026-07',
    annualTaskName: '2026 消化线产品覆盖提升', provider: '东方恒业推广有限公司',
    variety: '奥美拉唑肠溶胶囊(20mg)', region: '华南',
    budgetOccupied: 12000, executingAmount: 0, executedAmount: 0, settledAmount: 0,
    progress: 15, deadline: '2026-07-25', status: '已取消', riskLevel: 'normal',
    taskIds: ['PT02033'], // 取消回溯：占用额 12,000 已全额释放（条18）
  },
  // ── 8 月（焦点月）─────────────────────────────────────────────
  {
    id: 'TP-031', packageNo: '#PK-031', monthBudgetId: 'BUD-2026-08',
    annualTaskName: '2026 心血管线学术推广', provider: '智联科技有限公司',
    variety: '阿托伐他汀钙片(20mg)', region: '华东',
    budgetOccupied: 86000, executingAmount: 21500, executedAmount: 38700, settledAmount: 0,
    progress: 58, deadline: '2026-08-22', status: '执行中', riskLevel: 'overdue',
    taskIds: ['PT02000', 'PT02001', 'PT02002', 'PT02003', 'PT02004'],
  },
  {
    id: 'TP-032', packageNo: '#PK-032', monthBudgetId: 'BUD-2026-08',
    annualTaskName: '2026 糖尿病线覆盖提升', provider: '自营·业务一组',
    variety: '二甲双胍缓释片(500mg)', region: '华东',
    budgetOccupied: 60000, executingAmount: 12000, executedAmount: 30000, settledAmount: 0,
    progress: 72, deadline: '2026-08-28', status: '执行中', riskLevel: 'normal',
    taskIds: ['PT02005', 'PT02006', 'PT02007', 'PT02008'],
  },
  {
    id: 'TP-033', packageNo: '#PK-033', monthBudgetId: 'BUD-2026-08',
    annualTaskName: '2026 消化线产品覆盖提升', provider: '东方恒业推广有限公司',
    variety: '奥美拉唑肠溶胶囊(20mg)', region: '华南',
    budgetOccupied: 45000, executingAmount: 9800, executedAmount: 28400, settledAmount: 0,
    progress: 85, deadline: '2026-08-26', status: '证据上交', riskLevel: 'attention',
    taskIds: ['PT02009', 'PT02010', 'PT02011'],
  },
  {
    id: 'TP-034', packageNo: '#PK-034', monthBudgetId: 'BUD-2026-08',
    annualTaskName: '2026 心血管线学术推广', provider: '康晟云服科技有限公司',
    variety: '氨氯地平片(5mg)', region: '华北',
    budgetOccupied: 52000, executingAmount: 0, executedAmount: 0, settledAmount: 0,
    progress: 0, deadline: '2026-09-05', status: '待承接', riskLevel: 'normal',
    taskIds: ['PT02012', 'PT02013', 'PT02014'],
  },
  {
    id: 'TP-035', packageNo: '#PK-035', monthBudgetId: 'BUD-2026-08',
    annualTaskName: '2026 心血管线学术推广', provider: '永泰汇通推广有限公司',
    variety: '瑞舒伐他汀钙片(10mg)', region: '西南',
    budgetOccupied: 38000, executingAmount: 0, executedAmount: 0, settledAmount: 0,
    progress: 0, deadline: '2026-09-10', status: '已承接', riskLevel: 'normal',
    taskIds: ['PT02015', 'PT02016'],
  },
  {
    id: 'TP-036', packageNo: '#PK-036', monthBudgetId: 'BUD-2026-08',
    annualTaskName: '2026 心血管线学术推广', provider: '智联科技有限公司',
    variety: '阿托伐他汀钙片(20mg)', region: '华南',
    budgetOccupied: 30000, executingAmount: 0, executedAmount: 6200, settledAmount: 0,
    progress: 100, deadline: '2026-08-20', status: '已初审', riskLevel: 'normal',
    taskIds: ['PT02017', 'PT02018', 'PT02019'],
  },
  {
    id: 'TP-037', packageNo: '#PK-037', monthBudgetId: 'BUD-2026-08',
    annualTaskName: '2026 糖尿病线覆盖提升', provider: '自营·业务三组',
    variety: '二甲双胍缓释片(500mg)', region: '华北',
    budgetOccupied: 25000, executingAmount: 0, executedAmount: 0, settledAmount: 18500,
    progress: 100, deadline: '2026-08-15', status: '已打绩效', riskLevel: 'normal',
    taskIds: ['PT02020', 'PT02021'],
  },
  {
    id: 'TP-038', packageNo: '#PK-038', monthBudgetId: 'BUD-2026-08',
    annualTaskName: '2026 消化线产品覆盖提升', provider: '康晟云服科技有限公司',
    variety: '奥美拉唑肠溶胶囊(20mg)', region: '华东',
    budgetOccupied: 33000, executingAmount: 0, executedAmount: 0, settledAmount: 33000,
    progress: 100, deadline: '2026-08-10', status: '结算确认', riskLevel: 'normal',
    taskIds: ['PT02022', 'PT02023', 'PT02024'],
  },
  {
    id: 'TP-039', packageNo: '#PK-039', monthBudgetId: 'BUD-2026-08',
    annualTaskName: '2026 心血管线学术推广', provider: '东方恒业推广有限公司',
    variety: '氨氯地平片(5mg)', region: '华南',
    budgetOccupied: 15000, executingAmount: 0, executedAmount: 3000, settledAmount: 0,
    progress: 20, deadline: '2026-08-18', status: '已取消', riskLevel: 'risk',
    taskIds: ['PT02025', 'PT02026'], // 取消回溯：占用额 15,000 已全额释放（条18）
  },
  // ── 9 月（已分解待发包）───────────────────────────────────────
  {
    id: 'TP-040', packageNo: '#PK-040', monthBudgetId: 'BUD-2026-09',
    annualTaskName: '2026 心血管线学术推广', provider: '永泰汇通推广有限公司',
    variety: '瑞舒伐他汀钙片(10mg)', region: '华东',
    budgetOccupied: 42000, executingAmount: 0, executedAmount: 0, settledAmount: 0,
    progress: 0, deadline: '2026-09-20', status: '待承接', riskLevel: 'normal',
    taskIds: [], // 尚未分解至任务
  },
];

// 承接方维度（双队伍：自营团队 + 外部服务商）
export const taskPackageProviders = Array.from(new Set(taskPackages.map(p => p.provider)));

// 穿透第 2 跳反查：任务 → 所属任务包
export function getTaskPackageByTaskId(taskId: string): TaskPackage | undefined {
  return taskPackages.find(p => p.taskIds.includes(taskId));
}

// 口径自检：任一数字不满足公式即返回警告（页面侧 console.warn），保证演示可信
// 公式：已分配 = Σ 非取消任务包占用额；可用余额 = 预算额 − 已分配 + 已释放
export function verifyBudgetCaliber(): string[] {
  const warnings: string[] = [];
  monthlyBudgets.forEach((m) => {
    const allocated = taskPackages
      .filter((p) => p.monthBudgetId === m.id && p.status !== '已取消')
      .reduce((s, p) => s + p.budgetOccupied, 0);
    if (allocated !== m.allocatedAmount) {
      warnings.push(`${m.id} 已分配口径不符：Σ活跃任务包占用额 ${allocated} ≠ 账本值 ${m.allocatedAmount}`);
    }
    const available = m.budgetAmount - m.allocatedAmount + m.releasedAmount;
    if (available !== m.availableAmount) {
      warnings.push(`${m.id} 可用余额口径不符：预算额−已分配+已释放 = ${available} ≠ 账本值 ${m.availableAmount}`);
    }
  });
  return warnings;
}

export function runBudgetCaliberCheck(): void {
  const warnings = verifyBudgetCaliber();
  if (warnings.length === 0) {
    console.info('[预算口径自检] 通过：可用余额 = 预算额 − 已分配 + 已释放，已分配 = Σ活跃任务包占用额');
  } else {
    warnings.forEach(w => console.warn('[预算口径自检]', w));
  }
}

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

export const settlementRecords: SettlementRecord[] = Array.from({ length: 35 }, (_, i) => {
  const statuses: AuditStatus[] = ['待审核', '待审核', '已通过', '已驳回', '已结算', '已结算'];
  const status = randomItem(statuses);
  return {
    id: `ST${String(4000 + i).padStart(5, '0')}`,
    statementNo: `STMT-2026${String(7 + Math.floor(i / 12)).padStart(2, '0')}-${String(1000 + i)}`,
    specialist: randomItem(specialists),
    provider: randomItem(providers),
    workGroup: randomItem(workGroups),
    period: `2026-${String(Math.floor(i / 5) + 6).padStart(2, '0')}`,
    variety: randomItem(varieties),
    amount: randomInt(10, 100) * 200,
    status,
    auditComment: status === '已驳回' ? '工作量数据与拜访记录不符，请核查。' : '',
    createdAt: generateDate(randomInt(5, 60)),
    settledAt: status === '已结算' ? generateDate(randomInt(1, 10)) : undefined,
  };
});

const modules = ['医院拜访管理', '推广任务', '结算单据', '医生主数据', '角色管理', '系统配置'];
const actions = ['新建', '修改', '删除', '审核通过', '审核驳回', '提交', '导出', '批量修改'];
const roles = ['药厂管理员', '药厂合规管理员', '服务提供商'];

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

export const dashboardStats = {
  pendingThisWeek: 47,
  pendingDelta: +12,
  nearDeadline: 8,
  nearDeadlineDelta: +3,
  completedVisits: 234,
  completedVisitsDelta: +18,
  pendingSettlement: 128400,
  pendingSettlementDelta: -6200,
};

export const aiInsights = [
  {
    id: 'ai-001',
    title: '8 个推广任务临近逾期',
    summary: '全公司有 8 个推广任务将在 3 日内截止，当前进度均低于 60%，存在逾期风险。',
    basis: '任务截止时间、当前完成进度及最近一次拜访记录综合判断。',
    dataRange: '全公司，2026-08-21 09:30',
    updatedAt: '2026-08-21 09:30',
    confidence: 92,
    suggestion: '优先查看并人工确认，建议与负责人沟通加快推进。',
    severity: 'risk' as const,
  },
  {
    id: 'ai-002',
    title: '整点拜访比例异常偏高',
    summary: '本月医院拜访中，整点开始记录占比 41%，高于系统配置阈值（30%），可能存在数据填报规律性异常。',
    basis: '拜访开始时间分布分析，基于近 30 天 2,847 条拜访记录。',
    dataRange: '全公司，2026-07-22 至 2026-08-21',
    updatedAt: '2026-08-21 06:00',
    confidence: 78,
    suggestion: '建议人工抽查核实相关拜访记录，确认真实性后再进行绩效结算。',
    severity: 'attention' as const,
  },
  {
    id: 'ai-003',
    title: '3 份结算单据金额存疑',
    summary: '发现 3 份结算单据中工作量金额与拜访记录测算值差异超过 20%，建议人工复核。',
    basis: '结算单金额与系统拜访记录自动测算值交叉比对。',
    dataRange: '2026-08 结算周期',
    updatedAt: '2026-08-20 18:00',
    confidence: 85,
    suggestion: '打开结算详情，查看金额依据，人工确认或驳回。',
    severity: 'attention' as const,
  },
];

export const priorityQueue = [
  { id: 'pq-01', name: '业务一组 · 阿托伐他汀推广任务', type: '推广任务', deadline: '2026-08-19', risk: 'overdue' as const, assignee: '张伟', lastAction: '3天前 · 提交拜访记录', amount: 8600 },
  { id: 'pq-02', name: '上海瑞金医院 · 产品讲解任务', type: '推广任务', deadline: '2026-08-22', risk: 'risk' as const, assignee: '李强', lastAction: '1天前 · 查看任务详情', amount: 4200 },
  { id: 'pq-03', name: '北京协和医院 · 科室会议', type: '会议活动', deadline: '2026-08-23', risk: 'risk' as const, assignee: '王芳', lastAction: '5小时前 · 更新进度', amount: 3800 },
  { id: 'pq-04', name: 'STMT-202607-1042 · 结算审核', type: '结算单据', deadline: '2026-08-24', risk: 'attention' as const, assignee: '陈静', lastAction: '2天前 · 发起审核', amount: 24600 },
  { id: 'pq-05', name: '广州中山医院 · 文献分享任务', type: '推广任务', deadline: '2026-08-25', risk: 'attention' as const, assignee: '刘洋', lastAction: '3天前 · 修改拜访信息', amount: 2800 },
  { id: 'pq-06', name: '南京鼓楼医院 · 病例讨论会', type: '会议活动', deadline: '2026-08-27', risk: 'normal' as const, assignee: '杨明', lastAction: '今天 · 新建记录', amount: 1900 },
];

export const roleDashboardData: Record<Role, DashboardRoleData> = {
  '药厂管理员': {
    role: '药厂管理员',
    headline: '销售执行总览',
    subtitle: '今天最值得关注的是执行进度、预算偏差与超期填报。',
    unreadCount: 11,
    metrics: [
      { id: 'pm-1', title: '今日拜访量', value: 126, unit: '次', delta: 18, deltaLabel: '较昨日', subtitle: '目标 140 次', icon: 'clipboard', actionLabel: '查看拜访', target: 'hospital-visits' },
      { id: 'pm-2', title: '有效拜访率', value: '82%', delta: 4, deltaLabel: '较昨日', subtitle: '达标线 80%', icon: 'percent', iconColor: '#248A5A', iconBg: '#E6F5ED', actionLabel: '查看质量', target: 'hospital-visits' },
      { id: 'pm-3', title: '任务包执行进度', value: '61/88', delta: 7, deltaLabel: '已完成/总包', subtitle: '落后时间进度 9%', icon: 'progress', iconColor: '#C73A3A', iconBg: '#FEECEC', urgency: 'danger', actionLabel: '查看任务包', target: 'promotion-tasks' },
      { id: 'pm-4', title: '预算执行率', value: '78%', delta: 6, deltaLabel: '较周初', subtitle: '时间进度 68%', icon: 'wallet', iconColor: '#C77A16', iconBg: '#FEF3E2', urgency: 'warning', actionLabel: '查看预算', target: 'settlement' },
      { id: 'pm-5', title: '超期未填报', value: 9, unit: '人', delta: 2, deltaLabel: '新增', icon: 'alert', iconColor: '#C73A3A', iconBg: '#FEECEC', urgency: 'danger', actionLabel: '催办填报', target: 'hospital-visits' },
    ],
    insights: [
      {
        id: 'pm-ai-1',
        title: '业务四组执行落后',
        conclusion: '业务四组 3 个任务包进度落后时间进度 15%，本周目标存在失约风险。',
        basis: '命中规则：任务完成率 < 时间进度 - 10%。',
        dataRange: '业务四组 3 个任务包，近 7 日',
        confidence: '高',
        suggestion: '优先催办责任工作组，并检查是否需要调整资源分配。',
        actionLabel: '查看任务包',
        target: 'promotion-tasks',
        confirmationNote: 'AI 只提示进度风险，是否催办与调整资源需人工确认。',
        severity: 'risk',
      },
      {
        id: 'pm-ai-2',
        title: '预算跑赢时间进度',
        conclusion: '公司产品线预算执行率 84%，较时间进度高出 12 个点，存在月末压缩空间不足。',
        basis: '命中规则：预算执行率 - 时间进度 > 10%。',
        dataRange: '2026-08 月度预算，公司产品线',
        confidence: '高',
        suggestion: '查看高消耗任务包，确认是否存在提前集中执行。',
        actionLabel: '查看结算',
        target: 'settlement',
        confirmationNote: '预算预警仅供判断，后续是否调整预算由人工决策。',
        severity: 'attention',
      },
      {
        id: 'pm-ai-3',
        title: '服务商证据链通过率偏低',
        conclusion: 'XXX科技有限公司近 3 日证据链通过率仅 72%，低于自营团队 16 个点。',
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
      { id: 'pm-q-1', name: '业务四组 · 阿托伐他汀任务包 #PK-031', type: '推广任务', deadline: '2026-08-22 12:00', risk: 'overdue', assignee: '业务四组', lastAction: '昨天 · 进度仍 58%', actionLabel: '立即催办', target: 'promotion-tasks', note: '落后时间进度 15%' },
      { id: 'pm-q-2', name: '超期未填报专员 9 人', type: '任务提醒', deadline: '2026-08-22 18:00', risk: 'risk', assignee: '各服务商', lastAction: '1 小时前 · 系统提醒', actionLabel: '查看名单', target: 'hospital-visits' },
      { id: 'pm-q-3', name: '8 月预算偏离包 #BUD-22', type: '预算预警', deadline: '2026-08-23 10:00', risk: 'attention', assignee: '李强', lastAction: '30 分钟前 · 预警触发', actionLabel: '查看预算', target: 'settlement' },
      { id: 'pm-q-4', name: 'XXX科技有限公司 · 证据链通过率偏低', type: '质量关注', deadline: '2026-08-24 17:00', risk: 'normal', assignee: '陈静', lastAction: '今天 · 生成对比', actionLabel: '查看明细', target: 'hospital-visits' },
    ],
    messages: [
      { id: 'pm-m-1', type: '任务提醒', title: '5 个任务包进入 1 天提醒', summary: '需要确认是否已安排跟进资源。', time: '8 分钟前', unread: true, reminderLevel: '1天提醒', actionLabel: '去查看', target: 'promotion-tasks' },
      { id: 'pm-m-2', type: '预算预警', title: '公司产品线预算执行率高于时间进度', summary: '当前 84%，较时间进度高 12 个点。', time: '15 分钟前', unread: true, actionLabel: '看预算', target: 'settlement' },
      { id: 'pm-m-3', type: '审批待办', title: '3 条任务调整待审批', summary: '均涉及资源重分配。', time: '42 分钟前', actionLabel: '去审批', target: 'promotion-tasks' },
      { id: 'pm-m-4', type: '转办通知', title: '服务商转办 2 条异常拜访', summary: '需确认是否升级处置。', time: '1 小时前', actionLabel: '查看转办', target: 'hospital-visits' },
    ],
    quickActions: [
      { id: 'pm-a-1', label: '任务执行', description: '处理落后任务包', target: 'promotion-tasks' },
      { id: 'pm-a-2', label: '预算管理', description: '定位高消耗任务', target: 'settlement' },
      { id: 'pm-a-3', label: '医院拜访', description: '检查证据链问题', target: 'hospital-visits' },
    ],
    recentOperations: [
      { id: 'pm-r-1', action: '批量催办', target: '业务四组任务包 3 个', user: '药厂管理员', time: '12 分钟前', color: '#176B5B' },
      { id: 'pm-r-2', action: '审批通过', target: '任务调整单 ADJ-218', user: '李强', time: '34 分钟前', color: '#248A5A' },
      { id: 'pm-r-3', action: '发起预算核查', target: '公司产品线', user: '王芳', time: '1 小时前', color: '#C77A16' },
      { id: 'pm-r-4', action: '导出', target: '组别执行对比', user: '药厂管理员', time: '2 小时前', color: '#2F6BCE' },
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
        { id: 'pm-s-3', label: '预算执行', value: '78%', tone: 'warning' },
      ],
    },
    ranking: {
      title: '组别排名',
      items: [
        { id: 'pm-rank-1', label: 'TOP1 业务一组', value: '91%', hint: '拜访有效率', tone: 'success', progress: 91 },
        { id: 'pm-rank-2', label: 'TOP2 业务三组', value: '87%', hint: '任务兑现率', tone: 'brand', progress: 87 },
        { id: 'pm-rank-3', label: '垫底 业务四组', value: '64%', hint: '3 个任务包落后', tone: 'danger', progress: 64 },
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
        { id: 'pm-sp-1', label: '本周需催办', value: '8 包', hint: '落后时间进度', tone: 'danger', progress: 72 },
        { id: 'pm-sp-2', label: '预算健康区间', value: '3 组', hint: '执行率接近时间进度', tone: 'success', progress: 48 },
        { id: 'pm-sp-3', label: '需重点跟进服务商', value: '2 家', hint: '证据链通过率偏低', tone: 'warning', progress: 39 },
      ],
    },
  },
  '药厂合规管理员': {
    role: '药厂合规管理员',
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
        conclusion: '东方恒业推广有限公司 30 天内将有 3 项资质到期，可能影响后续任务下发。',
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
      { id: 'pc-r-1', action: '发起随检', target: '任务包 QA-0081', user: '合规管理员', time: '29 分钟前', color: '#2F6BCE' },
      { id: 'pc-r-2', action: '复审通过', target: '证据记录 EV-1019', user: '陈静', time: '40 分钟前', color: '#248A5A' },
      { id: 'pc-r-3', action: '退回补件', target: '供应商准入 SP-2026-08-12', user: '王芳', time: '50 分钟前', color: '#C77A16' },
      { id: 'pc-r-4', action: '催补备案', target: '专员李晨', user: '合规管理员', time: '1 小时前', color: '#C73A3A' },
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
      { id: 'sp-1', title: '承接任务数', value: 36, unit: '个', delta: 4, deltaLabel: '本周新增', icon: 'briefcase', actionLabel: '查看任务', target: 'promotion-tasks' },
      { id: 'sp-2', title: '待分配工作量', value: 18, unit: '项', delta: 3, deltaLabel: '待处理', icon: 'users', actionLabel: '去分配', target: 'promotion-tasks' },
      { id: 'sp-3', title: '在岗服务专员', value: 42, unit: '人', delta: 2, deltaLabel: '较上周', icon: 'user-check', actionLabel: '查看专员', target: 'settlement' },
      { id: 'sp-4', title: '本月结算金额', value: '¥56.8万', delta: 12000, deltaLabel: '较上月', icon: 'coins', iconColor: '#248A5A', iconBg: '#E6F5ED', actionLabel: '查看结算', target: 'settlement' },
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
        target: 'promotion-tasks',
        confirmationNote: '是否调整排班需管理者人工确认。',
        severity: 'info',
      },
      {
        id: 'sp-ai-3',
        title: '结算金额可提升',
        conclusion: '若本周内清理 5 条超期未填报记录，本月预计可多确认结算 ¥3.8 万。',
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
      { id: 'sp-q-1', name: '待初审记录 #VR01102 · 照片清晰度不足', type: '初审队列', deadline: '2026-08-22 11:00', risk: 'overdue', assignee: '业务二组', lastAction: '2 小时前 · AI 标记存疑', actionLabel: '立即初审', target: 'hospital-visits' },
      { id: 'sp-q-2', name: '超期未填报专员 5 人', type: '任务提醒', deadline: '2026-08-22 18:00', risk: 'risk', assignee: '工作组长', lastAction: '1 小时前 · 已催办一次', actionLabel: '查看名单', target: 'hospital-visits' },
      { id: 'sp-q-3', name: '待分配工作量 18 项', type: '任务分配', deadline: '2026-08-23 10:00', risk: 'attention', assignee: '服务提供商', lastAction: '今天 · 新增 6 项', actionLabel: '去分配', target: 'promotion-tasks' },
      { id: 'sp-q-4', name: '本月结算批次 #SET-0822', type: '结算单据', deadline: '2026-08-24 16:00', risk: 'normal', assignee: '财务专员', lastAction: '今天 · 待初审完成', actionLabel: '查看结算', target: 'settlement' },
    ],
    messages: [
      { id: 'sp-m-1', type: '任务提醒', title: '9 条待初审记录命中 AI 存疑', summary: '建议优先分配有经验的工作组长。', time: '7 分钟前', unread: true, reminderLevel: '1小时提醒', actionLabel: '查看队列', target: 'hospital-visits' },
      { id: 'sp-m-2', type: '预算预警', title: '8 月管理费用使用率 82%', summary: '较时间进度高 9 个点。', time: '18 分钟前', unread: true, actionLabel: '查看结算', target: 'settlement' },
      { id: 'sp-m-3', type: '审批待办', title: '2 条任务包转派待确认', summary: '涉及业务二组负荷平衡。', time: '35 分钟前', actionLabel: '去确认', target: 'promotion-tasks' },
      { id: 'sp-m-4', type: '转办通知', title: '药厂管理员转办 1 条异常任务包', summary: '需内部排查执行过程。', time: '1 小时前', actionLabel: '查看详情', target: 'promotion-tasks' },
    ],
    quickActions: [
      { id: 'sp-a-1', label: '查看待分配工作量', description: '平衡组内负荷', target: 'promotion-tasks' },
      { id: 'sp-a-2', label: '进入待初审池', description: '优先处理 AI 存疑', target: 'hospital-visits' },
      { id: 'sp-a-3', label: '查看本月结算', description: '跟踪结算兑现', target: 'settlement' },
    ],
    recentOperations: [
      { id: 'sp-r-1', action: '分配任务', target: '业务三组新增 4 项', user: '服务提供商', time: '11 分钟前', color: '#176B5B' },
      { id: 'sp-r-2', action: '初审驳回', target: '拜访记录 VR01102', user: '刘洋', time: '28 分钟前', color: '#C73A3A' },
      { id: 'sp-r-3', action: '发起结算', target: '批次 SET-0822', user: '财务专员', time: '46 分钟前', color: '#2F6BCE' },
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
        { id: 'sp-s-1', label: '承接任务', value: '36 个', tone: 'brand' },
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
  { id: 'ev-1', taskNo: 'VR-2031', specialist: '杨明', provider: 'XXX科技有限公司', workGroup: '业务三组', visitType: '跟踪巡访服务', time: '今天 09:12', aiTags: ['照片清晰度不足', '证据缺失'] },
  { id: 'ev-2', taskNo: 'VR-2034', specialist: '黄峰', provider: 'XXX科技有限公司', workGroup: '业务三组', visitType: '跟踪巡访服务', time: '今天 08:47', aiTags: ['任务关联断裂'] },
  { id: 'ev-3', taskNo: 'VR-2036', specialist: '吴超', provider: 'XXX科技有限公司', workGroup: '业务三组', visitType: '跟踪巡访服务', time: '昨天 17:30', aiTags: ['证据缺失'] },
  { id: 'ev-4', taskNo: 'VR-2019', specialist: '张伟', provider: 'XXX科技有限公司', workGroup: '业务一组', visitType: '学术拜访', time: '昨天 15:20', aiTags: ['照片清晰度不足'] },
  { id: 'ev-5', taskNo: 'VR-2022', specialist: '刘洋', provider: 'XXX科技有限公司', workGroup: '业务四组', visitType: '日常拜访', time: '昨天 11:05', aiTags: ['照片清晰度不足', '证据缺失'] },
  { id: 'ev-6', taskNo: 'VR-2008', specialist: '陈静', provider: 'XXX科技有限公司', workGroup: '业务五组', visitType: '信息收集和调研', time: '2 天前 16:40', aiTags: ['任务关联断裂'] },
];

export const repFilingAnalysis: RepFilingAnalysis = {
  summary: { unfiled: 2 },
  top: [
    { id: 'rf-1', name: '李晨', provider: '智联科技有限公司', status: '未备案', action: '催补备案' },
    { id: 'rf-2', name: '孙丽', provider: '东方恒业推广有限公司', status: '未备案', action: '催补备案' },
  ],
};

/**
 * 类型定义 — 贝医药合作系统
 *
 * 铁律（全站统一，违反即返工）：
 *   1. 货币：人民币、单位元；符号一律全角 ￥（U+FFE5）；
 *      显示统一走 constants.ts 的 formatCNY / cny。
 *   2. 弹框：确认 / 调整 / 详情 / 创建一律居中 Modal。
 *   3. 区域：落库值 = 省级行政区或「全国」。
 *   4. 角色两套：登录切换器仅三项（Role）；业务链四类（BizRole）只出现在数据与权限矩阵。
 *   5. 状态只用手册 7 词（数据层）：任务=待确认/执行中/已结算/已撤销；对账=未发起/对账中/已结算；报告=待审核/通过/驳回。
 *      展示层可映射为主状态（待服务商确认/执行中/待药厂处理/已结算/已撤销）+辅助状态（对账中/报告待审核）。
 *   6. 金额字段：链路只用手册词——服务总金额（=计划总金额）、已结算金额、剩余可结算金额、发包金额、工作量；
 *      预算计划/预算执行分析两页专属：年度预算/月度预算/已结算实际/偏离额/偏离率/未结算任务计划金额。
 */

// ===== 审核状态（拜访绩效 / 结算统计共用；与任务状态分离） =====
export type AuditStatus =
  | '草稿'
  | '待审核'
  | '已通过'
  | '已驳回'
  | '已打绩效'
  | '已结算'
  | '已撤销';

export type RiskLevel = 'normal' | 'attention' | 'risk' | 'overdue';

// ===== 手册状态（全文只这些，一个不加） =====

/** 任务状态 */
export type TaskStatus = '待确认' | '执行中' | '已结算' | '已撤销';

/** 对账状态（与任务状态两列并行） */
export type ReconStatus = '未发起' | '对账中' | '已结算';

/** 报告状态（仅报告类） */
export type ReportStatus = '待审核' | '通过' | '驳回';

/** 工作量进度（专员侧，手册原词） */
export type WorkloadProgress = '已完成' | '待审核' | '未完成';

/** 工作量分配情况（列表列） */
export type WorkloadStage = '未拆解' | '已拆解到工作组' | '已分配到专员';

// ===== 登录角色 / 业务角色（两套，禁止混用） =====

/** 登录切换角色（部门视角），仅三项。业务链仍是 药厂 → 服务提供商 → 工作组 → 服务专员 */
export type Role =
  | '药厂销售部门'
  | '药厂合规部门'
  | '服务提供商';

/** 业务角色（mock 数据，不出现在登录切换器） */
export type BizRole =
  | '药厂'
  | '服务提供商'
  | '工作组'
  | '服务专员';

export type VisitType = '医院拜访' | '商业拜访' | '药房拜访';

export type HospitalGrade = '三级甲等' | '三级乙等' | '二级甲等' | '二级乙等' | '其他';

export interface VisitRecord {
  id: string;
  no: number;
  specialist: string;
  provider: string;
  workGroup: string;
  hospital: string;
  hospitalGrade: HospitalGrade;
  department: string;
  visitee: string;
  variety: string;
  visitPeriod: string;
  startTime: string;
  startOnTime: boolean;
  endTime: string;
  endOnTime: boolean;
  performanceStatus: AuditStatus;
  auditStatus: AuditStatus;
  auditComment: string;
  amount: number;
  visitCategory: string;
}

// ===== 预算计划（只表达企业计划，不阻断任务创建/执行/结算） =====

/**
 * 预算行：年度 + 服务商 + 品种集合 + 地区集合，含 12 个月度预算。
 * 唯一键 = 年度 + 服务商。实际结算金额（actualAmount）由已确认结算单派生，不落库。
 */
export interface BudgetPlan {
  id: string;
  year: number;
  /** 服务提供商（单值） */
  provider: string;
  /** 覆盖品种（多选） */
  varieties: string[];
  /** 覆盖地区（多选，省级或全国） */
  regions: string[];
  yearAmount: number;
  /** 1-12 月预算，长度 12 */
  months: number[];
  updatedAt: string;
}

// ===== 品种 / 授权 / 价目 =====

export interface Variety {
  id: string;
  genericName: string;
  tradeName: string;
  approvalNo: string;
  dosageForm: string;
  spec: string;
  package: string;
  unit: string;
  holder: string;
  manufacturer: string;
  validUntil: string;
}

/** 服务提供商品种授权：同一品种同一区域仅一家服务商 */
export interface VarietyProviderAuth {
  id: string;
  provider: string;
  varietyId: string;
  varietyName: string;
  holder: string;
  regions: string[];
}

export interface PriceItem {
  id: string;
  varietyId: string;
  category: string;
  name: string;
  amount: number;
  unit: string;
  isContractAmount: boolean;
  isPreset: boolean;
}

export interface PriceRatio {
  id: string;
  varietyId: string;
  name: string;
  ratio: number;
}

export interface ReportPrice {
  id: string;
  varietyId: string;
  /** 价目类别：分析报告服务 / 问卷调研与分析服务 */
  reportType: string;
  /** 服务项目名，如 临床应用研究报告、问卷样本量 */
  name: string;
  amount: number;
  unit: string;
  ratio: number;
}

// ===== 任务执行一条链 =====

/** 价目类别 = 服务类型：市场推广服务（推广组）；分析报告服务、问卷调研与分析服务（报告组） */
export type ServiceCategory = '市场推广服务' | '分析报告服务' | '问卷调研与分析服务';

export interface ServiceItem {
  id: string;
  /** 归属品种（任务可含多品种，服务表按品种拆开） */
  variety: string;
  category: ServiceCategory;
  name: string;
  unitPrice: number;
  unit: string;
  qty: number;
  amount: number;
}

/** 拆解粒度 = 单品种 + 单地区 + 工作组 */
export interface WorkgroupSplit {
  id: string;
  workGroup: string;
  variety: string;
  region: string;
  amount: number;
  startDate: string;
  endDate: string;
}

/** 任务量：专员执行记录；「已完成」=已审核，可选入结算。粒度 = 单品种 + 单地区 */
export interface WorkloadAssign {
  id: string;
  workGroup: string;
  specialist: string;
  variety: string;
  region: string;
  category: ServiceCategory;
  itemName: string;
  workload: number;
  amount: number;
  progress: WorkloadProgress;
  /** 执行归属月份，格式 YYYY-MM */
  serviceMonth: string;
  /** 已选入的结算单号；未选入为空 */
  settledBillNo?: string;
}

export interface ReportFile {
  id: string;
  name: string;
  uploadedAt: string;
  uploadedBy: string;
  status: ReportStatus;
  comment: string;
}

export interface SettlementLine {
  id: string;
  variety: string;
  region: string;
  serviceType: string;
  serviceItem: string;
  serviceAmount: number;
  actualAmount: number;
  remark: string;
}

export interface SettlementBill {
  id: string;
  billNo: string;
  contractNo: string;
  /** 一张结算单对应一个工作组 */
  workGroup: string;
  servicePeriod: string;
  /** 执行归属月份：一张结算单只对应一个月份，格式 YYYY-MM */
  serviceMonth: string;
  madeAt: string;
  provider: string;
  lines: SettlementLine[];
  finalAmount: number;
  confirmed: boolean;
  confirmedAt?: string;
  confirmedBy?: string;
  paymentVoucher?: string;
}

export interface Task {
  id: string;
  taskNo: string;
  /** 自动生成：商品名_规格_持有人（多品种用顿号连接） */
  taskName: string;
  varieties: string[];
  provider: string;
  /** 服务地区：多选省级行政区 */
  regions: string[];
  /** 推广时间（起止日期） */
  startDate: string;
  endDate: string;
  /** 三张服务表合计：服务总金额（=计划总金额）= Σ serviceItems.amount */
  planAmount: number;
  /** Σ 历次结算单最终结算金额 */
  settledAmount: number;
  /** 结算完结后剩余作废、不计统计 */
  remainingVoided: boolean;
  taskStatus: TaskStatus;
  reconStatus: ReconStatus;
  createdAt: string;
  createdBy: string;
  serviceItems: ServiceItem[];
  workgroupSplits: WorkgroupSplit[];
  workloadAssigns: WorkloadAssign[];
  reports: ReportFile[];
  settlements: SettlementBill[];
}

export interface CreateTaskInput {
  varieties: string[];
  provider: string;
  regions: string[];
  startDate: string;
  endDate: string;
  serviceItems: ServiceItem[];
}

export interface CreateBudgetPlanInput {
  year: number;
  provider: string;
  varieties: string[];
  regions: string[];
  yearAmount: number;
  months?: number[];
}

export interface CreateAuthInput {
  provider: string;
  varietyId: string;
  regions: string[];
}

export interface NavFocus {
  taskId?: string;
  budgetAnalysis?: { budgetPlanId: string; year: number; provider: string };
}

export type NavigateFn = (page: PageId, focus?: NavFocus) => void;

export interface Doctor {
  id: string;
  name: string;
  title: string;
  hospital: string;
  department: string;
  tier: string;
  tags: string[];
  cooperationStatus: '合作中' | '暂停合作' | '未合作';
  phone?: string;
  lastVisit: string;
  visitCount: number;
}

export interface AuditLogEntry {
  id: string;
  time: string;
  operator: string;
  role: string;
  module: string;
  action: string;
  target: string;
  beforeState?: string;
  afterState?: string;
  ip: string;
  result: '成功' | '失败';
}

export type PageId =
  | 'dashboard'
  | 'hospital-visits'
  | 'commercial-visits'
  | 'pharmacy-visits'
  | 'meetings'
  | 'surveys'
  | 'budget-plan'
  | 'analytics'
  | 'task-dispatch'
  | 'doctors'
  | 'varieties'
  | 'variety-auth'
  | 'enterprise-users'
  | 'settlement'
  | 'inspection'
  | 'evidence-chain'
  | 'business-switch'
  | 'price-config'
  | 'roles'
  | 'departments'
  | 'audit-log';

export type DashboardSeverity = 'risk' | 'attention' | 'info';
export type DashboardConfidence = '高' | '中' | '低';
export type MessageType = '任务提醒' | '随检通知' | '审批待办' | '转办通知';
export type ReminderLevel = '3天提醒' | '1天提醒' | '1小时提醒' | '已超期';
export type AlertLayer = '监管政策' | '风控提示';
export type DashboardMetricIcon =
  | 'clipboard'
  | 'percent'
  | 'progress'
  | 'wallet'
  | 'alert'
  | 'shield'
  | 'file-search'
  | 'building'
  | 'users'
  | 'check'
  | 'camera'
  | 'coins'
  | 'user-check'
  | 'clock'
  | 'briefcase'
  | 'receipt';

export interface DashboardMetric {
  id: string;
  title: string;
  value: string | number;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  subtitle?: string;
  icon: DashboardMetricIcon;
  iconColor?: string;
  iconBg?: string;
  urgency?: 'normal' | 'warning' | 'danger';
  actionLabel: string;
  target: PageId;
  source?: string;
}

export interface DashboardInsight {
  id: string;
  title: string;
  conclusion: string;
  basis: string;
  dataRange: string;
  confidence: DashboardConfidence;
  suggestion: string;
  actionLabel: string;
  target: PageId;
  confirmationNote: string;
  severity: DashboardSeverity;
}

export interface DashboardQueueItem {
  id: string;
  name: string;
  type: string;
  deadline: string;
  risk: RiskLevel;
  assignee: string;
  lastAction: string;
  actionLabel: string;
  target: PageId;
  note?: string;
}

export interface DashboardMessage {
  id: string;
  type: MessageType;
  title: string;
  summary: string;
  time: string;
  unread?: boolean;
  reminderLevel?: ReminderLevel;
  alertLayer?: AlertLayer;
  actionLabel: string;
  target: PageId;
}

export interface DashboardQuickAction {
  id: string;
  label: string;
  description: string;
  target: PageId;
}

export interface DashboardRecentOperation {
  id: string;
  action: string;
  target: string;
  user: string;
  time: string;
  color: string;
}

export interface DashboardStatItem {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  progress?: number;
}

export interface DashboardComparisonTable {
  title: string;
  columns: string[];
  rows: { name: string; values: string[]; tone?: 'brand' | 'warning' | 'danger' | 'success' }[];
}

export interface DashboardInspectionWorkbench {
  recommended: DashboardStatItem[];
  active: DashboardStatItem[];
  pending: DashboardStatItem[];
}

export interface DashboardRoleData {
  role: Role;
  headline: string;
  subtitle: string;
  unreadCount: number;
  metrics: DashboardMetric[];
  insights: DashboardInsight[];
  queue: DashboardQueueItem[];
  messages?: DashboardMessage[];
  quickActions: DashboardQuickAction[];
  recentOperations: DashboardRecentOperation[];
  trend: {
    title: string;
    subtitle?: string;
    points: { label: string; value: number }[];
    summary: DashboardStatItem[];
  };
  ranking?: {
    title: string;
    items: DashboardStatItem[];
  };
  distribution?: {
    title: string;
    items: DashboardStatItem[];
  };
  comparisonTable?: DashboardComparisonTable;
  inspectionWorkbench?: DashboardInspectionWorkbench;
  taskList?: DashboardMessage[];
  spotlight?: {
    title: string;
    items: DashboardStatItem[];
  };
}

export interface EvidenceChainRecord {
  id: string;
  taskNo: string;
  specialist: string;
  provider: string;
  workGroup: string;
  visitType: string;
  time: string;
  aiTags: string[];
}

export type RepFilingStatus = '未备案';
export type RepFilingAction = '催补备案';

export interface RepFilingItem {
  id: string;
  name: string;
  provider: string;
  status: RepFilingStatus;
  action: RepFilingAction;
}

export interface RepFilingAnalysis {
  summary: {
    unfiled: number;
  };
  top: RepFilingItem[];
}

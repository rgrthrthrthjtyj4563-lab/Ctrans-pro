export type AuditStatus =
  | '草稿'
  | '待审核'
  | '已通过'
  | '已驳回'
  | '已打绩效'
  | '已结算'
  | '已撤销';

export type RiskLevel = 'normal' | 'attention' | 'risk' | 'overdue';

// 任务七态状态机（设计文档条25）：待分解 → 待下发 → 待执行 → 执行中 → 已完成；
// 执行中/待执行可经审批进入 任务取消（额度自动释放回溯）或 任务终止（已发生部分冻结待结算）
export type TaskExecStatus =
  | '待分解'
  | '待下发'
  | '待执行'
  | '执行中'
  | '已完成'
  | '任务取消'
  | '任务终止';

// 任务包状态机（设计文档 2.3）：发包 → 承接 → 执行 → 证据上交 → 初审 → 打绩效 → 结算确认；已取消为终态
export type TaskPackageStatus =
  | '待承接'
  | '已承接'
  | '执行中'
  | '证据上交'
  | '已初审'
  | '已打绩效'
  | '结算确认'
  | '已取消';

export type Role =
  | '药厂管理员'
  | '药厂合规管理员'
  | '服务提供商';

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

export interface PromotionTask {
  id: string;
  taskNo: string;
  doctor: string;
  hospital: string;
  taskType: string;
  assignee: string;
  deadline: string;
  status: TaskExecStatus; // 条25 七态
  lastAction: string;
  riskLevel: RiskLevel;
  amount: number;
  progress: number;
}

// 月度预算（额度账本 + 实绩账本双账本分列，设计文档 2.2/2.3）
// 口径公式：可用余额 = 预算额 − 已分配 + 已释放；已分配 = Σ 非取消任务包占用额
export interface MonthlyBudget {
  id: string;                  // 'BUD-2026-08'
  year: number;
  month: number;
  monthLabel: string;          // '2026-08'
  // 额度账本
  budgetAmount: number;        // 预算额
  allocatedAmount: number;     // 已分配 = Σ 活跃任务包 budgetOccupied
  releasedAmount: number;      // 已释放（条18 取消/终止回溯）
  availableAmount: number;     // 可用余额 = budgetAmount - allocatedAmount + releasedAmount
  // 实绩账本（只读汇总）
  executingAmount: number;     // 执行中（待审）
  executedAmount: number;      // 已执行（已审）
  settledAmount: number;       // 已结算（结算单已确认）
  status: '未分解' | '已分解' | '执行中' | '已关账';
  timeProgress: number;        // 时间进度 0-100
}

// 月度任务包（条21 全字段；占用额属额度账本，实绩三口径属实绩账本，永不混用）
export interface TaskPackage {
  id: string;
  packageNo: string;           // '#PK-031' 风格
  monthBudgetId: string;       // 关联月度预算（条15 关联关系）
  annualTaskName: string;      // 关联年度任务（条20/21）
  provider: string;            // '自营·业务一组' 或 providers 之一（双队伍）
  variety: string;
  region: string;
  budgetOccupied: number;      // 占用额（额度账本）
  executingAmount: number;     // 执行中（待审）
  executedAmount: number;      // 已执行（已审）
  settledAmount: number;       // 已结算（结算单已确认）
  progress: number;            // 执行进度 0-100（工作量口径，条26）
  deadline: string;
  status: TaskPackageStatus;
  riskLevel: RiskLevel;
  taskIds: string[];           // 关联 promotionTasks.id（穿透第 2 跳）
}

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

export interface SettlementRecord {
  id: string;
  statementNo: string;
  specialist: string;
  provider: string;
  workGroup: string;
  period: string;
  variety: string;
  amount: number;
  status: AuditStatus;
  auditComment: string;
  createdAt: string;
  settledAt?: string;
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
  | 'promotion-tasks'
  | 'task-dispatch'
  | 'doctors'
  | 'varieties'
  | 'enterprise-users'
  | 'settlement'
  | 'inspection'
  | 'evidence-chain'
  | 'business-switch'
  | 'price-config'
  | 'roles'
  | 'departments'
  | 'audit-log'
  | 'analytics';

export type DashboardSeverity = 'risk' | 'attention' | 'info';
export type DashboardConfidence = '高' | '中' | '低';
export type MessageType = '任务提醒' | '预算预警' | '随检通知' | '审批待办' | '转办通知';
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

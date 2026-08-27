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

/** 价目类别 = 服务类型：市场推广服务（推广组）；分析报告服务、问卷调研与分析服务（报告组） */
export type ServiceCategory = '市场推广服务' | '分析报告服务' | '问卷调研与分析服务';

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
  /** 当前生效标准价目表；空字符串表示未绑定。不得用价目明细比对推断。 */
  activePriceBookId: string;
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
  /** 归属的标准价目表 */
  priceBookId: string;
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
  priceBookId: string;
  name: string;
  ratio: number;
}

export interface ReportPrice {
  id: string;
  varietyId: string;
  priceBookId: string;
  /** 价目类别：分析报告服务 / 问卷调研与分析服务 */
  reportType: string;
  /** 服务项目名，如 临床应用研究报告、问卷样本量 */
  name: string;
  amount: number;
  unit: string;
  ratio: number;
}

export type PriceBookStatus = '生效' | '草稿' | '已失效';

/** 价目表服务规则（推广 + 报告） */
export interface PriceBookRule {
  id: string;
  category: ServiceCategory;
  name: string;
  amount: number;
  unit: string;
  isContractAmount: boolean;
  isPreset: boolean;
  ratio: number;
}

/**
 * 标准价目表。品种通过 activePriceBookId 显式绑定，禁止用明细比对推断同一性。
 */
export interface PriceBook {
  id: string;
  name: string;
  version: string;
  status: PriceBookStatus;
  effectiveFrom: string;
  rules: PriceBookRule[];
}

export type RoundingMode = 'nearest';

/** 全局单价/数量/金额联动与取整规则 */
export interface UnitPriceAdjustRule {
  enabled: boolean;
  /** 相对建议单价的最小调整比例，默认 -0.3 */
  minAdjustRatio: number;
  /** 相对建议单价的最大调整比例，默认 +0.3 */
  maxAdjustRatio: number;
  roundingMode: RoundingMode;
  hint: string;
}

export interface SettlementPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface RoundingLog {
  id: string;
  time: string;
  variety: string;
  region: string;
  itemName: string;
  beforeAmount: number;
  beforeQty: number;
  unitPrice: number;
  afterAmount: number;
  afterQty: number;
  reason: string;
}

export interface PriceAdjustLog {
  id: string;
  time: string;
  variety: string;
  region: string;
  itemName: string;
  suggestedUnitPrice: number;
  actualUnitPrice: number;
  suggestedAmount: number;
  actualAmount: number;
  reason: string;
}

export interface TaskOpsLog {
  id: string;
  time: string;
  operator: string;
  role: string;
  action: string;
  detail: string;
  beforeState?: string;
  afterState?: string;
}

export interface SettlementBillVersion {
  version: number;
  time: string;
  operator: string;
  action: string;
  snapshot: {
    confirmed: boolean;
    voided: boolean;
    finalAmount: number;
    lines: SettlementLine[];
  };
}

export const SETTLEMENT_DECLARATION_VERSION = 'DECL-2026-V1';
export const SETTLEMENT_DECLARATION_TEXT =
  '本人确认已核对本期结算明细：逐服务项目实际结算金额均在计划金额的 50%—150% 范围内；如有调整，调整原因已与服务商达成一致。确认后立即生效，不可直接修改，仅可通过受控回退处理。';

// ===== 任务执行一条链 =====

export interface ServiceItem {
  id: string;
  /** 归属品种（任务可含多品种，服务表按品种拆开） */
  variety: string;
  /** 归属地区；服务项目必须落到具体品种 × 地区 */
  region: string;
  category: ServiceCategory;
  name: string;
  unitPrice: number;
  unit: string;
  qty: number;
  amount: number;
  suggestedUnitPrice: number;
  suggestedAmount: number;
  adjustReason?: string;
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
  /** 兼容服务商发起页：可含多个工作组，不再作为结算单唯一边界 */
  workGroup: string;
  /** 药厂预设结算周期 */
  settlementPeriodId: string;
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
  /** 逻辑失效，禁止物理删除 */
  voided: boolean;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  financeLocked: boolean;
  declarationAccepted?: boolean;
  declarationVersion?: string;
  /** 服务商申请金额（确认前明细合计） */
  appliedAmount: number;
  /** 确认后实际 − 申请 */
  adjustAmount: number;
  versions: SettlementBillVersion[];
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
  /** 创建时锁定的标准价目表（显式 ID，不用明细比对） */
  priceBookId: string;
  /** 完整价目表快照；后续修改价目表不得影响既有任务 */
  priceBookSnapshot: PriceBook;
  /** 预算推荐总金额（仅提示） */
  recommendedAmount: number;
  recommendedConfigured: boolean;
  /** 服务商确认后锁定任务计划、单价和价目表快照 */
  planLocked: boolean;
  /** 三张服务表合计：服务总金额（=计划总金额）= Σ serviceItems.amount */
  planAmount: number;
  /** Σ 已确认且未作废结算单最终结算金额 */
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
  settlementPeriods: SettlementPeriod[];
  roundingLogs: RoundingLog[];
  priceAdjustLogs: PriceAdjustLog[];
  opsLogs: TaskOpsLog[];
}

export interface CreateTaskInput {
  varieties: string[];
  provider: string;
  regions: string[];
  startDate: string;
  endDate: string;
  serviceItems: ServiceItem[];
  settlementPeriods: Omit<SettlementPeriod, 'id'>[];
  roundingLogs?: RoundingLog[];
  priceAdjustLogs?: PriceAdjustLog[];
}

export interface ConfirmSettlementInput {
  declarationAccepted: boolean;
  declarationVersion: string;
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
  | 'rep-filing'
  | 'vendor-access'
  | 'settlement'
  | 'inspection'
  | 'evidence-chain'
  | 'business-switch'
  | 'price-config'
  | 'roles'
  | 'user-grants'
  | 'perm-audit'
  | 'role-preview'
  | 'departments'
  | 'audit-log'
  | 'baiyee-ai';

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

// ===== 药厂销售部门 · 销售运营工作台（P1 首页重组） =====
// 依据《药厂销售部门首页优化文档 V1.0》：待办/关注分离、任务交付概览、
// 指标口径修正（执行中≠完成进度、金额分阶段、里程碑判延误）。

/** 全局筛选周期；日期按租户业务时区（Asia/Shanghai）解释 */
export type WorkbenchPeriod = '本周' | '本月' | '本季度';

/** 我的待办：事项未完成 + 当前用户是处理人 + 具备动作权限 */
export interface WorkbenchTodo {
  id: string;
  taskId: string;
  /** 业务对象：任务名（完整名称详情查看） */
  taskName: string;
  /** 单据类型：结算单 / 报告 / 任务 等 */
  docType: string;
  /** 待办原因：直接描述，不用「单据语义」 */
  reason: string;
  /** 期限状态：已逾期 X 天 / 今天到期 / 剩余 X 天 */
  dueState: string;
  overdue: boolean;
  dueToday?: boolean;
  /** 当前处理人；不用「各服务商」这类模糊指代 */
  owner: string;
  primaryAction: string;
  target: PageId;
}

/** 重点关注事件等级：紧急=经确认的重大交付影响；普通逾期不自动升级 */
export type FocusSeverity = '紧急' | '需关注' | '信息';
export type FocusState = '待处理' | '处理中' | '待复核';

export interface WorkbenchFocusEvent {
  id: string;
  severity: FocusSeverity;
  title: string;
  taskId?: string;
  provider?: string;
  /** 数据依据：命中的规则与样本 */
  basis: string;
  /** 影响范围 */
  impact: string;
  state: FocusState;
  occurredAt: string;
  actionLabel: string;
  target: PageId;
}

/** 交付项：任务按服务类型约定的交付目标；判延误只看里程碑，不看日历进度 */
export interface WorkbenchDeliverable {
  id: string;
  name: string;
  unit: string;
  target: number;
  accepted: number;
  /** 交付/验收期限（YYYY-MM-DD） */
  dueDate: string;
}

/** 首页任务概览行；跨月任务不按月份复制，按任务唯一 ID 统计 */
export interface WorkbenchTask {
  id: string;
  taskNo: string;
  name: string;
  varieties: string[];
  regions: string[];
  provider: string;
  startDate: string;
  endDate: string;
  status: TaskStatus;
  deliverables: WorkbenchDeliverable[];
  /** 当前有效异常类型标签；空 = 无异常 */
  anomalies: string[];
  /** 下一到期事项文案；空 = 未设置阶段计划 */
  nextDueLabel: string;
}

/** AI 分析五段式：发现 / 证据 / 原因 / 建议 / 操作；仅提示不裁决 */
export interface WorkbenchAIAnalysis {
  id: string;
  /** 紧凑摘要（一行） */
  summary: string;
  finding: string;
  evidence: string;
  /** 已验证事实与待核实假设分开 */
  cause: string;
  suggestion: string;
  actions: { label: string; target: PageId }[];
  /** AI 生成时间；与业务数据截至时间分开 */
  generatedAt: string;
}

export interface SalesWorkbenchData {
  headline: string;
  /** 业务数据截至时间 */
  dataAsOf: string;
  filterOptions: {
    varieties: string[];
    regions: string[];
    providers: string[];
  };
  todos: WorkbenchTodo[];
  focusEvents: WorkbenchFocusEvent[];
  tasks: WorkbenchTask[];
  ai: WorkbenchAIAnalysis;
  quickActions: DashboardQuickAction[];
}

export interface DashboardRoleData {
  role: Role;
  headline: string;
  subtitle: string;
  unreadCount: number;
  metrics: DashboardMetric[];
  /** 药厂销售部门 P1 工作台数据；存在时首页按工作台布局渲染 */
  salesWorkbench?: SalesWorkbenchData;
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

// ===== 医药代表备案 / 服务商准入 =====

export type RepresentativeStatus =
  | '草稿'
  | '待合规确认'
  | '待提交'
  | '审核中'
  | '补件中'
  | '合格'
  | '待备案提交'
  | '已备案'
  | '提交失败'
  | '变更待提交'
  | '删除待提交'
  | '已删除'
  | '启用'
  | '冻结'
  | '整改中'
  | '复核中'
  | '失效'
  | '退出'
  | '驳回';

export type EmploymentType = 'MAH直聘' | '服务商派遣' | '授权推广';

export type FilingVerifyResult = '有效' | '无结果' | '失效' | '异常待人工确认' | '待核验';
export type FilingVerifyMethod = '人工核验' | '接口核验' | '批量复核';
export type NmpaFilingStatus = '待提交' | '已备案' | '提交失败' | '变更待提交' | '删除待提交' | '已删除';

export type AuthApprovalStatus = '待审' | '通过' | '驳回' | '撤销' | '过期';

export type VendorStatus =
  | '草稿'
  | '待提交'
  | '尽调中'
  | '审批中'
  | '补件中'
  | '驳回'
  | '准入通过'
  | '可合作'
  | '复审中'
  | '限制合作'
  | '冻结'
  | '退出';

export type VendorRiskGrade = '低风险' | '中风险' | '高风险';

export type EligibilityVerdict = 'PASS' | 'BLOCK' | 'MANUAL_REVIEW';

export type IncidentSource = '内审' | '投诉' | '监管' | '业务发现' | '系统预警';
export type IncidentRisk = '高' | '中' | '低';
export type IncidentStatus = '调查中' | '整改中' | '已结案';

export type ApprovalBizType =
  | '代表准入'
  | '代表授权'
  | '代表解冻'
  | '服务商准入'
  | '服务商复审'
  | '服务商解冻'
  | '高风险例外'
  | '项目验收'
  | '结算例外';

export type ApprovalStepDecision = '待审' | '通过' | '驳回' | '转办';

export interface ApprovalStep {
  seq: number;
  role: string;
  assigneeId: string;
  assigneeName: string;
  decision: ApprovalStepDecision;
  comment?: string;
  decidedAt?: string;
}

export interface ApprovalInstance {
  id: string;
  bizType: ApprovalBizType;
  bizId: string;
  initiatorId: string;
  initiatorName: string;
  steps: ApprovalStep[];
  currentSeq: number;
  status: '审批中' | '已通过' | '已驳回' | '已撤回';
  createdAt: string;
}

export type SelectionMethod = '邀标' | '比价' | '评审' | '例外';

export interface SelectionRecord {
  id: string;
  vendorId: string;
  demandNo: string;
  method: SelectionMethod;
  processNote: string;
  awardReason: string;
  exceptionReason?: string;
  evidenceFiles: string[];
  createdAt: string;
}

export interface AcceptanceRecord {
  id: string;
  projectId: string;
  vendorId: string;
  serviceContent: string;
  serviceDateStart: string;
  serviceDateEnd: string;
  location: string;
  participantRepIds: string[];
  deliverables: string[];
  expenseVouchers: string[];
  businessOpinion: '通过' | '不通过' | '待审';
  complianceSample?: '命中抽检-通过' | '命中抽检-不通过' | '未抽检';
  performanceScore?: number;
  conclusion: '通过' | '不通过' | '待审';
  createdAt: string;
}

export interface VendorDueDiligence {
  id: string;
  vendorId: string;
  scoreSubject: number;
  scoreRelated: number;
  scoreNature: number;
  scoreTax: number;
  scoreHistory: number;
  totalScore: number;
  suggestedGrade: VendorRiskGrade;
  confirmedGrade: VendorRiskGrade;
  confirmedById: string;
  confirmedByName: string;
  confirmedAt: string;
}

export interface VendorCreditCompliance {
  antiBriberyPledgeFile: string;
  antiBriberyPledgeDate: string;
  illegalCheck: '通过' | '未通过' | '待核验';
  dishonestCheck: '通过' | '未通过' | '待核验';
  lawsuitRisk: '无' | '有-已披露' | '有-未披露';
  evidenceFiles: string[];
  checkedAt: string;
}

export interface RepTraining {
  id: string;
  repId: string;
  planName: string;
  completedAt: string;
  examScore: number;
  validUntil: string;
  certFile: string;
}

/** 前端演示用活动记录；后续可由活动模块替代。 */
export interface DemoActivity {
  id: string;
  repId: string;
  name: string;
  startDate: string;
  status: '未开始' | '进行中' | '已结束' | '不可执行';
}

export interface FilingBatchTask {
  id: string;
  createdAt: string;
  creatorId: string;
  repIds: string[];
  items: { repId: string; result: FilingVerifyResult; evidence?: string }[];
}

export interface Actor {
  id: string;
  name: string;
  role: string;
}

export interface ComplianceAuditEvent {
  id: string;
  time: string;
  operator: string;
  operatorId?: string;
  role: string;
  action: string;
  comment?: string;
  before?: string;
  after?: string;
  approvalId?: string;
  evidenceHash?: string;
}

export interface RepAuthorization {
  id: string;
  authNo: string;
  version: number;
  mahId: string;
  productIds: string[];
  products: string[];
  therapyAreas: string[];
  regions: string[];
  startDate: string;
  endDate: string;
  approvalStatus: AuthApprovalStatus;
  fileName: string;
  superseded?: boolean;
  supersededById?: string;
}

export interface RepFilingVerification {
  id: string;
  taskNo: string;
  queryKey: string;
  result: FilingVerifyResult;
  method: FilingVerifyMethod;
  verifier: string;
  verifiedAt: string;
  nextDate: string;
  evidence: string;
  summary: string;
}

export interface ComplianceIncident {
  id: string;
  incidentNo: string;
  source: IncidentSource;
  type: string;
  risk: IncidentRisk;
  status: IncidentStatus;
  occurredAt: string;
  foundAt: string;
  fact: string;
  relatedRep?: string;
  relatedVendor?: string;
  relatedRepId?: string;
  relatedVendorId?: string;
  relatedMahId?: string;
  relatedProjectId?: string;
  relatedContractId?: string;
  evidenceFiles: string[];
  initialMeasure: string;
  investigationConclusion: string;
  rectification: string;
  ownerId: string;
  ownerName: string;
  dueDate: string;
  reviewConclusion: string;
}

export interface Representative {
  id: string;
  name: string;
  gender?: '男' | '女';
  photoFile?: string;
  idType: string;
  idNo: string;
  mobile: string;
  email: string;
  employmentType: EmploymentType;
  mah: string;
  mahId: string;
  provider: string;
  providerId: string | null;
  initiatorId: string;
  initiatorName: string;
  employStart: string;
  employEnd: string;
  contractOrAuthNo?: string;
  agreementFile?: string;
  education: string;
  major: string;
  school: string;
  eduProof: string;
  /** 兼容当前备案页表单；培训历史仍以 trainings 为准。 */
  trainingPlan?: string;
  trainingDate?: string;
  examScore?: number;
  trainingValidUntil?: string;
  trainingCert?: string;
  trainings: RepTraining[]; // 导入数据，页面内不手填；有效期与成绩以最新一条为准
  pledgeVersion: string; // 以下三项由承诺库同步，页面内不手填
  pledgeDate: string;
  pledgeFile: string;
  filingNo: string;
  filingStatus: FilingVerifyResult | NmpaFilingStatus | '未核验';
  filingVerifiedAt: string;
  filingSubmittedAt?: string;
  filingSubmittedBy?: string;
  filingReceipt?: string;
  riskCheckResult: '通过' | '未通过' | '待核验';
  riskCheckDate: string;
  riskCheckEvidence: string;
  riskCheckOperator: string;
  status: RepresentativeStatus;
  nextVerifyDate: string;
  blockedActivityIds?: string[];
  freezeReason?: string;
  freezeEvidence?: string;
  rectification?: string;
  rectificationOwner?: string;
  rectificationDue?: string;
  investigationConclusion?: string;
  unfreezeReviewerId?: string;
  currentApprovalId?: string;
  authorizations: RepAuthorization[];
  verifications: RepFilingVerification[];
  incidents: ComplianceIncident[];
  timeline: ComplianceAuditEvent[];
}

export interface VendorDocument {
  id: string;
  category: string;
  name: string;
  validUntil: string;
  status: '有效' | '即将到期' | '已过期' | '缺失';
}

export interface VendorContract {
  id: string;
  contractNo: string;
  serviceScope: string;
  serviceTypes: string[];
  regions: string[];
  startDate: string;
  endDate: string;
  amountCap: number;
  status: '草案' | '已生效' | '已超期' | '已终止';
  antiBriberyClause: boolean;
  auditClause?: boolean;
}

export interface VendorProject {
  id: string;
  projectNo: string;
  name: string;
  region: string;
  serviceType: string;
  status: '执行中' | '待验收' | '已验收' | '已关闭';
  acceptance: '未验收' | '通过' | '不通过';
  amount: number;
  assignedRepIds: string[];
  payeeAccountName: string;
  payeeAccountNo: string;
  unitPrice?: number;
  marketBenchmark?: number;
  deliverables: string[];
}

export interface Vendor {
  id: string;
  name: string;
  creditCode: string;
  legalRep: string;
  address: string;
  establishedAt: string;
  businessScope: string;
  actualController: string;
  shareholding: string;
  invoiceAbility: string;
  siteDesc: string;
  principalName: string;
  principalMobile: string;
  relatedPartyDeclared: boolean;
  relatedPartyHit: boolean;
  staffSize: number;
  bankName: string;
  bankAccount: string;
  taxType: string;
  serviceTypes: string[];
  regions: string[];
  riskGrade: VendorRiskGrade;
  riskScore: number;
  status: VendorStatus;
  accessNo: string;
  accessValidUntil: string;
  reviewDue: string;
  contact: string;
  contactMobile: string;
  initiatorId: string;
  initiatorName: string;
  documents: VendorDocument[];
  contracts: VendorContract[];
  projects: VendorProject[];
  repIds: string[];
  creditCompliance: VendorCreditCompliance | null;
  selectionRecords: SelectionRecord[];
  dueDiligence: VendorDueDiligence | null;
  acceptances: AcceptanceRecord[];
  exceptionReason?: string;
  exceptionUntil?: string;
  enhancedSupervision?: string;
  currentApprovalId?: string;
  incidents: ComplianceIncident[];
  timeline: ComplianceAuditEvent[];
  missingDocs: string[];
}

export interface EligibilityHit {
  code: string;
  rule: string;
  result: EligibilityVerdict | 'OK';
  detail: string;
}

export interface EligibilityResult {
  verdict: EligibilityVerdict;
  hits: EligibilityHit[];
}

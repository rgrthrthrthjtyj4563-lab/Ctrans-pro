/**
 * 业务搭建中心（扩展能力）— 模拟数据
 * 场景台账、最近活动、接口映射与同步记录；口径来自「开始设计2」设计稿，
 * 2026-09-11 移植进主原型（浅色主题）。
 */

export type ScenarioStatus = 'published' | 'draft' | 'archived'
export type ScenarioCategory =
  | 'compliance'
  | 'business'
  | 'finance'
  | 'risk'
  | 'personnel'

export interface Scenario {
  id: string
  name: string
  description: string
  status: ScenarioStatus
  category: ScenarioCategory
  creator: string
  updatedAt: string
  fieldCount: number
  nodeCount: number
  userCount: number
  version: string
}

export const SCENARIO_STATUS_LABEL: Record<ScenarioStatus, string> = {
  published: '已发布',
  draft: '草稿',
  archived: '已归档',
}

export const SCENARIO_CATEGORY_LABEL: Record<ScenarioCategory, string> = {
  compliance: '合规管理',
  business: '业务申请',
  finance: '财务结算',
  risk: '风险事件',
  personnel: '人员管理',
}

/** 分类主色（浅色底上可读的深色系） */
export const SCENARIO_CATEGORY_COLOR: Record<ScenarioCategory, string> = {
  compliance: '#0E7490',
  business: '#2F6BCE',
  finance: '#248A5A',
  risk: '#C77A16',
  personnel: '#7C3AED',
}

export const scenarios: Scenario[] = [
  {
    id: '1',
    name: '学术会议申请',
    description: '医学学术会议的完整申请流程，含预算审批、合规审核和材料备案',
    status: 'published',
    category: 'compliance',
    creator: '张明华',
    updatedAt: '2026-09-10 14:32',
    fieldCount: 18,
    nodeCount: 6,
    userCount: 142,
    version: 'v2.3',
  },
  {
    id: '2',
    name: '供应商风险事件',
    description: '供应商合规风险事件上报、处置、跟踪和复盘的标准化处理流程',
    status: 'published',
    category: 'risk',
    creator: '李雪梅',
    updatedAt: '2026-09-09 11:20',
    fieldCount: 24,
    nodeCount: 8,
    userCount: 58,
    version: 'v1.8',
  },
  {
    id: '3',
    name: '代表合规培训记录',
    description: '医药代表合规培训完成情况记录，关联备案模块和品种授权',
    status: 'published',
    category: 'personnel',
    creator: '王建国',
    updatedAt: '2026-09-08 16:45',
    fieldCount: 12,
    nodeCount: 4,
    userCount: 315,
    version: 'v3.1',
  },
  {
    id: '4',
    name: '市场活动备案',
    description: '市场推广活动事前备案、资料审核和合规确认，支持多层级审批配置',
    status: 'published',
    category: 'business',
    creator: '陈静怡',
    updatedAt: '2026-09-07 09:18',
    fieldCount: 21,
    nodeCount: 5,
    userCount: 89,
    version: 'v1.5',
  },
  {
    id: '5',
    name: '项目验收申请',
    description: '服务商项目完工验收流程，关联结算管理和预算核销',
    status: 'draft',
    category: 'finance',
    creator: '刘宇航',
    updatedAt: '2026-09-11 08:55',
    fieldCount: 16,
    nodeCount: 7,
    userCount: 0,
    version: 'v0.4',
  },
  {
    id: '6',
    name: '客户准入评估',
    description: '医院客户准入资质评估，关联拜访记录和医院信息数据',
    status: 'published',
    category: 'compliance',
    creator: '赵晓燕',
    updatedAt: '2026-09-06 14:10',
    fieldCount: 19,
    nodeCount: 5,
    userCount: 74,
    version: 'v2.0',
  },
  {
    id: '7',
    name: '费用申请',
    description: '日常业务费用申请及审批，支持多科目预算关联和自动核销',
    status: 'draft',
    category: 'finance',
    creator: '孙志远',
    updatedAt: '2026-09-10 17:30',
    fieldCount: 9,
    nodeCount: 3,
    userCount: 0,
    version: 'v0.2',
  },
  {
    id: '8',
    name: '代表授权申请',
    description: '医药代表品种授权申请和变更流程，关联品种管理和备案模块',
    status: 'archived',
    category: 'personnel',
    creator: '胡明亮',
    updatedAt: '2026-08-15 11:00',
    fieldCount: 14,
    nodeCount: 4,
    userCount: 23,
    version: 'v1.2',
  },
]

export interface ScenarioActivity {
  id: string
  icon: 'publish' | 'warning' | 'edit' | 'pending' | 'version'
  tone: 'success' | 'danger' | 'info' | 'warning' | 'brand'
  title: string
  desc: string
  actor: string
  time: string
}

export const activities: ScenarioActivity[] = [
  {
    id: 'a1',
    icon: 'publish',
    tone: 'success',
    title: '学术会议申请 已发布',
    desc: '版本 v2.3 正式上线，共 142 名用户可访问',
    actor: '张明华',
    time: '09:15',
  },
  {
    id: 'a2',
    icon: 'warning',
    tone: 'danger',
    title: '字段映射失败',
    desc: '项目验收申请·接口自动化·财务系统字段映射失败，需处理',
    actor: '系统',
    time: '08:42',
  },
  {
    id: 'a3',
    icon: 'edit',
    tone: 'info',
    title: '流程节点被修改',
    desc: '供应商风险事件·合规审核节点·超时时间调整为 48h',
    actor: '李雪梅',
    time: '昨天 17:30',
  },
  {
    id: 'a4',
    icon: 'pending',
    tone: 'warning',
    title: '有 3 条待处理数据',
    desc: '客户准入评估·合规审核节点·等待合规负责人处理',
    actor: '系统',
    time: '昨天 16:22',
  },
  {
    id: 'a5',
    icon: 'version',
    tone: 'brand',
    title: '有新版本待确认',
    desc: '代表合规培训记录 v3.1 变更摘要待负责人确认',
    actor: '王建国',
    time: '昨天 15:10',
  },
]

export interface ApiMapping {
  id: string
  sourceField: string
  targetField: string
  status: 'ok' | 'error' | 'warning'
  error?: string
}

export const apiMappings: ApiMapping[] = [
  { id: 'm1', sourceField: '项目编号', targetField: 'project_code', status: 'ok' },
  { id: 'm2', sourceField: '服务商名称', targetField: 'vendor_name', status: 'ok' },
  { id: 'm3', sourceField: '验收金额', targetField: 'settlement_amount', status: 'error', error: '字段类型不匹配：number vs string' },
  { id: 'm4', sourceField: '验收日期', targetField: 'accepted_at', status: 'ok' },
  { id: 'm5', sourceField: '申请人', targetField: 'applicant_id', status: 'warning', error: '目标字段可能为空' },
]

export interface SyncLog {
  id: string
  time: string
  status: 'success' | 'error' | 'retry'
  desc: string
  duration: string
}

export const syncLogs: SyncLog[] = [
  { id: 'l1', time: '2026-09-11 09:42', status: 'success', desc: '向财务系统同步结算申请 #SC2026091101', duration: '1.2s' },
  { id: 'l2', time: '2026-09-11 08:15', status: 'error', desc: '字段映射失败：settlement_amount 类型不匹配', duration: '0.3s' },
  { id: 'l3', time: '2026-09-10 18:30', status: 'success', desc: '向财务系统同步结算申请 #SC2026091003', duration: '0.9s' },
  { id: 'l4', time: '2026-09-10 15:22', status: 'retry', desc: '同步超时，已重试 2 次', duration: '5.0s' },
  { id: 'l5', time: '2026-09-10 11:05', status: 'success', desc: '向财务系统同步结算申请 #SC2026091001', duration: '1.1s' },
]

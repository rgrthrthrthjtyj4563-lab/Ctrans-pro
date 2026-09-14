/**
 * 业务搭建中心（扩展能力 › 业务搭建中心）
 * 低代码自定义业务场景：场景台账 + 三栏搭建器（组件库/画布/属性）+ 流程设计器 + 接口自动化。
 * 移植自「开始设计2」设计稿（2026-09-11），原深海蓝暗色系改为浅白主题，
 * 页面嵌在系统壳内渲染，不改动面包屑、菜单与整体布局。
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import type { CSSProperties, Dispatch, SetStateAction, DragEvent as ReactDragEvent, ReactNode } from 'react'
import {
  Plus, Download, LayoutTemplate, Search, Filter,
  BookOpen, AlertTriangle, GraduationCap, Megaphone,
  ClipboardCheck, ShieldCheck, Wallet, Award,
  MoreHorizontal, Users, GitBranch, Clock, Edit3, ExternalLink,
  TrendingUp, TrendingDown, Activity, CheckCircle2, AlertCircle,
  Layers, Zap, BarChart3, RotateCcw, RotateCw, Save, Eye, Rocket,
  ArrowLeft, Type, AlignLeft, Hash, DollarSign, Calendar, CalendarRange,
  Circle, CheckSquare, ChevronDown, ToggleLeft, Star,
  User, Building2, Briefcase, Truck, Pill, UserCheck, Hospital, FolderOpen, MapPin,
  Table2, Paperclip, Image, PenTool, Calculator, Barcode, Group, Link,
  GripVertical, Copy, Trash2, Smartphone, Monitor, Grid3x3, AlignJustify, X,
  Wand2, Sparkles, Play, Bell, RefreshCw, Square, Database, ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Button, IconButton } from '../components/Button'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Tag } from '../components/StatusTag'
import {
  scenarios, activities, apiMappings, syncLogs,
  SCENARIO_STATUS_LABEL, SCENARIO_CATEGORY_LABEL, SCENARIO_CATEGORY_COLOR,
  type Scenario, type ScenarioActivity, type ScenarioStatus,
} from '../data/scenarioData'
import type { ToastMessage } from '../components/Toast'

interface Props {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void
}

/* ── 浅色主题常量（对齐系统 token，品牌色用于 tint 需字面量） ──────────────── */
const BRAND = '#176B5B'
const C = {
  canvas: '#F5F7F8',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  text1: '#1F2937',
  text2: '#667085',
  muted: '#9CA3AF',
  faint: '#D1D5DB',
}
const MONO = "'JetBrains Mono', monospace"

const SCENARIO_ICON: Record<string, LucideIcon> = {
  学术会议申请: BookOpen,
  供应商风险事件: AlertTriangle,
  代表合规培训记录: GraduationCap,
  市场活动备案: Megaphone,
  项目验收申请: ClipboardCheck,
  客户准入评估: ShieldCheck,
  费用申请: Wallet,
  代表授权申请: Award,
}

const STATUS_TAG_COLOR: Record<ScenarioStatus, 'success' | 'warning' | 'default'> = {
  published: 'success',
  draft: 'warning',
  archived: 'default',
}

const PAGE_CSS = `
.sc-grid-bg {
  background-image:
    linear-gradient(rgba(23,107,91,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(23,107,91,0.05) 1px, transparent 1px);
  background-size: 24px 24px;
}
.sc-page-enter { animation: scPageEnter 240ms ease-out both; }
.sc-card-enter { animation: scCardEnter 240ms ease-out both; }
.sc-field-drop-in { animation: scFieldDropIn 220ms cubic-bezier(0.34,1.56,0.64,1) both; }
.sc-tab-active { position: relative; }
.sc-tab-active::after {
  content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px;
  background: ${BRAND}; border-radius: 1px;
}
@keyframes scPageEnter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes scCardEnter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes scFieldDropIn {
  0% { opacity: 0; transform: scale(0.95) translateY(-4px); }
  60% { opacity: 1; transform: scale(1.01) translateY(0); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .sc-page-enter, .sc-card-enter, .sc-field-drop-in { animation: none !important; }
}
`

/* ── 场景中心：统计卡 ──────────────────────────────────────────────────────── */

function StatCard({
  label, value, icon: Icon, color, trend, trendUp, sub, delay,
}: {
  label: string; value: number; icon: LucideIcon; color: string
  trend: string; trendUp: boolean; sub: string; delay: number
}) {
  const [displayed, setDisplayed] = useState(0)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setDisplayed(value); return }
    const timer = setTimeout(() => {
      let frame = 0
      const total = 20
      const interval = setInterval(() => {
        frame++
        setDisplayed(Math.round((value * frame) / total))
        if (frame >= total) clearInterval(interval)
      }, 16)
    }, delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return (
    <div
      className="sc-card-enter"
      style={{
        position: 'relative', overflow: 'hidden', cursor: 'default',
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 18, boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
        animationDelay: `${delay}ms`,
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${color}55, transparent)`,
      }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}14`, border: `1px solid ${color}30`,
        }}>
          <Icon size={16} style={{ color }} />
        </div>
        <span style={{
          fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 8px', borderRadius: 9999, fontWeight: 500,
          background: trendUp ? '#E6F5ED' : '#FEF3E2',
          color: trendUp ? '#248A5A' : '#C77A16',
        }}>
          {trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {trend}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: C.text1, fontFamily: MONO, marginBottom: 2, lineHeight: 1.1 }}>
        {displayed}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, color: C.muted }}>{sub}</div>
    </div>
  )
}

/* ── 场景中心：场景卡片 ────────────────────────────────────────────────────── */

function ScenarioCard({ scenario, delay, onOpen }: { scenario: Scenario; delay: number; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const Icon = SCENARIO_ICON[scenario.name] ?? Layers
  const catColor = SCENARIO_CATEGORY_COLOR[scenario.category]

  return (
    <div
      className="sc-card-enter"
      style={{
        position: 'relative', overflow: 'hidden', cursor: 'pointer',
        background: C.surface, borderRadius: 10,
        border: `1px solid ${hovered ? 'rgba(23,107,91,0.4)' : C.border}`,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 200ms ease-out',
        boxShadow: hovered ? '0 8px 20px rgba(16,24,40,0.08)' : '0 1px 3px rgba(16,24,40,0.04)',
        animationDelay: `${delay}ms`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false) }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={`打开场景：${scenario.name}`}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${catColor}, ${catColor}40)`,
      }} />
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${catColor}14`, border: `1px solid ${catColor}30`,
            }}>
              <Icon size={17} style={{ color: catColor }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text1, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {scenario.name}
              </div>
              <div style={{ fontSize: 12, marginTop: 2, color: C.muted }}>
                {SCENARIO_CATEGORY_LABEL[scenario.category]}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Tag label={SCENARIO_STATUS_LABEL[scenario.status]} color={STATUS_TAG_COLOR[scenario.status]} />
            <button
              style={{
                width: 24, height: 24, borderRadius: 4, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.muted, background: 'transparent',
                opacity: hovered ? 1 : 0, transition: 'opacity 150ms',
              }}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
              aria-label="更多操作"
              title="更多操作"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        </div>

        <p style={{ fontSize: 12, lineHeight: 1.6, color: C.text2, margin: '0 0 14px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {scenario.description}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          {([
            { icon: BarChart3, label: '字段', value: scenario.fieldCount },
            { icon: GitBranch, label: '节点', value: scenario.nodeCount },
            { icon: Users, label: '用户', value: scenario.userCount },
          ] as const).map(({ icon: I, label, value }) => (
            <div key={label} style={{
              borderRadius: 8, padding: '6px 4px', textAlign: 'center',
              background: C.surfaceAlt, border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', fontFamily: MONO }}>{value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <I size={9} />{label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: C.muted }}>
            <span style={{ color: C.text2 }}>{scenario.creator}</span>
            <span style={{ margin: '0 6px' }}>·</span>
            {scenario.updatedAt}
          </div>
          <span style={{
            fontSize: 11, padding: '2px 6px', borderRadius: 4,
            background: C.surfaceAlt, color: C.muted, fontFamily: MONO,
          }}>
            {scenario.version}
          </span>
        </div>
      </div>

      {/* 悬停快捷操作 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        display: 'flex', gap: 8, padding: 12,
        background: 'linear-gradient(to top, rgba(255,255,255,0.98) 55%, transparent)',
        opacity: hovered ? 1 : 0,
        transform: hovered ? 'translateY(0)' : 'translateY(4px)',
        transition: 'all 200ms ease-out',
        pointerEvents: hovered ? 'auto' : 'none',
      }}>
        <button
          style={{
            flex: 1, height: 30, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            background: BRAND, color: '#fff', border: 'none',
          }}
          onClick={(e) => { e.stopPropagation(); onOpen() }}
        >
          <ExternalLink size={11} />打开场景
        </button>
        <button
          style={{
            flex: 1, height: 30, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            background: 'rgba(23,107,91,0.08)', border: '1px solid rgba(23,107,91,0.3)', color: BRAND,
          }}
          onClick={(e) => { e.stopPropagation(); onOpen() }}
        >
          <Edit3 size={11} />编辑配置
        </button>
      </div>

      {/* 更多菜单 */}
      {menuOpen && (
        <div
          style={{
            position: 'absolute', top: 44, right: 14, zIndex: 20, borderRadius: 10,
            background: C.surface, border: `1px solid ${C.border}`, boxShadow: '0 8px 24px rgba(16,24,40,0.12)',
            padding: '4px 0', minWidth: 124,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {['复制场景', '导出配置', '版本记录', '停用场景', '归档'].map((item, i) => (
            <button
              key={item}
              style={{
                width: '100%', padding: '7px 12px', fontSize: 12, textAlign: 'left',
                color: i === 4 ? '#C73A3A' : '#374151', background: 'none', border: 'none', cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceAlt }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── 场景中心：最近活动 ────────────────────────────────────────────────────── */

const ACTIVITY_ICON: Record<ScenarioActivity['icon'], LucideIcon> = {
  publish: CheckCircle2, warning: AlertCircle, edit: Edit3, pending: Clock, version: GitBranch,
}
const ACTIVITY_TONE: Record<ScenarioActivity['tone'], string> = {
  success: '#248A5A', danger: '#C73A3A', info: '#2F6BCE', warning: '#C77A16', brand: BRAND,
}

function ActivityItem({ activity }: { activity: ScenarioActivity }) {
  const Icon = ACTIVITY_ICON[activity.icon]
  const color = ACTIVITY_TONE[activity.tone]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '11px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 7, flexShrink: 0, marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}14`, border: `1px solid ${color}28`,
      }}>
        <Icon size={12} style={{ color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', lineHeight: 1.35 }}>{activity.title}</div>
        <div style={{ fontSize: 12, marginTop: 3, color: C.muted, lineHeight: 1.5 }}>{activity.desc}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
          <span style={{ color: C.text2 }}>{activity.actor}</span>
          <span style={{ color: C.muted }}>{activity.time}</span>
        </div>
      </div>
    </div>
  )
}

/* ── 搭建器：组件库定义 ────────────────────────────────────────────────────── */

type FieldType =
  | 'text' | 'textarea' | 'number' | 'amount' | 'date' | 'daterange'
  | 'radio' | 'checkbox' | 'select' | 'toggle' | 'rating'
  | 'user' | 'department' | 'company' | 'vendor' | 'product' | 'rep' | 'hospital' | 'project' | 'budget' | 'location'
  | 'table' | 'file' | 'image' | 'signature' | 'formula' | 'autonumber' | 'group' | 'condition' | 'relation'

type ColSpan = 1 | 2

interface CanvasField {
  id: string
  type: FieldType
  label: string
  placeholder: string
  required: boolean
  colSpan: ColSpan
  group: string
}

interface ComponentDef {
  icon: LucideIcon
  name: string
  desc: string
  type: FieldType
  defaultSpan: ColSpan
  placeholder: string
}

const componentGroups: { label: string; items: ComponentDef[] }[] = [
  {
    label: '基础组件',
    items: [
      { icon: Type, name: '单行文本', desc: '短文本输入', type: 'text', defaultSpan: 1, placeholder: '请输入文本' },
      { icon: AlignLeft, name: '多行文本', desc: '长文本段落', type: 'textarea', defaultSpan: 2, placeholder: '请输入内容' },
      { icon: Hash, name: '数字', desc: '数值输入', type: 'number', defaultSpan: 1, placeholder: '0' },
      { icon: DollarSign, name: '金额', desc: '金额与货币', type: 'amount', defaultSpan: 1, placeholder: '0.00' },
      { icon: Calendar, name: '日期', desc: '日期选择', type: 'date', defaultSpan: 1, placeholder: '选择日期' },
      { icon: CalendarRange, name: '日期范围', desc: '时间区间', type: 'daterange', defaultSpan: 2, placeholder: '选择时间范围' },
      { icon: Circle, name: '单选', desc: '单项选择', type: 'radio', defaultSpan: 2, placeholder: '选项 A / 选项 B' },
      { icon: CheckSquare, name: '多选', desc: '多项选择', type: 'checkbox', defaultSpan: 2, placeholder: '选项 A / 选项 B' },
      { icon: ChevronDown, name: '下拉选择', desc: '选项列表', type: 'select', defaultSpan: 1, placeholder: '请选择' },
      { icon: ToggleLeft, name: '开关', desc: '是/否切换', type: 'toggle', defaultSpan: 1, placeholder: '' },
      { icon: Star, name: '评分', desc: '星级评分', type: 'rating', defaultSpan: 1, placeholder: '' },
    ],
  },
  {
    label: '业务组件',
    items: [
      { icon: User, name: '人员选择', desc: '系统用户', type: 'user', defaultSpan: 1, placeholder: '选择人员' },
      { icon: Building2, name: '部门选择', desc: '组织架构', type: 'department', defaultSpan: 1, placeholder: '选择部门' },
      { icon: Briefcase, name: '企业选择', desc: '企业主体', type: 'company', defaultSpan: 1, placeholder: '选择企业' },
      { icon: Truck, name: '服务商选择', desc: '供应商数据', type: 'vendor', defaultSpan: 1, placeholder: '选择服务商' },
      { icon: Pill, name: '品种选择', desc: '产品品种', type: 'product', defaultSpan: 1, placeholder: '选择品种' },
      { icon: UserCheck, name: '医药代表', desc: '代表备案', type: 'rep', defaultSpan: 1, placeholder: '选择代表' },
      { icon: Hospital, name: '医院选择', desc: '医院数据', type: 'hospital', defaultSpan: 1, placeholder: '选择医院' },
      { icon: FolderOpen, name: '项目选择', desc: '项目库', type: 'project', defaultSpan: 1, placeholder: '选择项目' },
      { icon: BookOpen, name: '预算科目', desc: '科目分类', type: 'budget', defaultSpan: 1, placeholder: '选择科目' },
      { icon: MapPin, name: '地理位置', desc: '坐标定位', type: 'location', defaultSpan: 2, placeholder: '点击定位' },
    ],
  },
  {
    label: '高级组件',
    items: [
      { icon: Table2, name: '明细表', desc: '多行明细', type: 'table', defaultSpan: 2, placeholder: '' },
      { icon: Paperclip, name: '附件上传', desc: '文件附件', type: 'file', defaultSpan: 2, placeholder: '点击或拖拽文件到此处' },
      { icon: Image, name: '图片上传', desc: '图片资料', type: 'image', defaultSpan: 2, placeholder: '上传图片' },
      { icon: PenTool, name: '电子签名', desc: '手写签名', type: 'signature', defaultSpan: 2, placeholder: '' },
      { icon: Calculator, name: '计算字段', desc: '公式计算', type: 'formula', defaultSpan: 1, placeholder: '= ...' },
      { icon: Barcode, name: '自动编号', desc: '规则编号', type: 'autonumber', defaultSpan: 1, placeholder: 'YY-{YYYY}-{AUTO}' },
      { icon: Group, name: '分组容器', desc: '字段分组', type: 'group', defaultSpan: 2, placeholder: '' },
      { icon: GitBranch, name: '条件区块', desc: '条件显示', type: 'condition', defaultSpan: 2, placeholder: '' },
      { icon: Link, name: '关联记录', desc: '跨模块关联', type: 'relation', defaultSpan: 2, placeholder: '关联记录' },
    ],
  },
]

const allComponents: ComponentDef[] = componentGroups.flatMap((g) => g.items)

function getCompDef(type: FieldType): ComponentDef | undefined {
  return allComponents.find((c) => c.type === type)
}

const INITIAL_FIELDS: CanvasField[] = [
  { id: 'fi-1', type: 'text', label: '申请标题', placeholder: '请输入申请标题', required: true, colSpan: 2, group: '基础信息' },
  { id: 'fi-2', type: 'department', label: '申请部门', placeholder: '选择部门', required: true, colSpan: 1, group: '基础信息' },
  { id: 'fi-3', type: 'user', label: '申请人', placeholder: '选择人员', required: true, colSpan: 1, group: '基础信息' },
  { id: 'fi-4', type: 'select', label: '活动类型', placeholder: '选择类型', required: true, colSpan: 1, group: '基础信息' },
  { id: 'fi-5', type: 'date', label: '预计活动日期', placeholder: '选择日期', required: true, colSpan: 1, group: '基础信息' },
  { id: 'fi-6', type: 'amount', label: '预算金额', placeholder: '0.00', required: true, colSpan: 1, group: '预算信息' },
  { id: 'fi-7', type: 'budget', label: '预算科目', placeholder: '选择预算科目', required: true, colSpan: 1, group: '预算信息' },
  { id: 'fi-8', type: 'file', label: '活动方案', placeholder: '点击或拖拽文件到此处', required: true, colSpan: 2, group: '合规材料' },
  { id: 'fi-9', type: 'textarea', label: '参会人员范围', placeholder: '描述参会人员范围及限制条件', required: true, colSpan: 2, group: '合规材料' },
]

/* ── 搭建器：字段预览控件（浅色） ──────────────────────────────────────────── */

const inputLike: CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 8, fontSize: 13,
  background: C.surfaceAlt, border: `1px solid ${C.border}`, color: C.muted,
}

function renderFieldPreview(field: CanvasField): ReactNode {
  const { type, placeholder } = field
  if (type === 'textarea') {
    return <div style={{ ...inputLike, minHeight: 60, lineHeight: 1.5 }}>{placeholder}</div>
  }
  if (type === 'toggle') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 19, borderRadius: 9999, position: 'relative', background: 'rgba(23,107,91,0.4)' }}>
          <span style={{ position: 'absolute', top: 2, right: 2, width: 15, height: 15, borderRadius: '50%', background: '#fff' }} />
        </div>
        <span style={{ fontSize: 13, color: C.text2 }}>已启用</span>
      </div>
    )
  }
  if (type === 'rating') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={17} style={{ color: i <= 3 ? '#C77A16' : C.faint, fill: i <= 3 ? '#C77A16' : 'none' }} />
        ))}
      </div>
    )
  }
  if (type === 'radio') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {['选项 A', '选项 B', '选项 C'].map((opt, i) => (
          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${i === 0 ? BRAND : C.borderStrong}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: i === 0 ? 'rgba(23,107,91,0.12)' : 'transparent',
            }}>
              {i === 0 && <div style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND }} />}
            </div>
            <span style={{ fontSize: 13, color: C.text2 }}>{opt}</span>
          </label>
        ))}
      </div>
    )
  }
  if (type === 'checkbox') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {['选项 A', '选项 B', '选项 C'].map((opt, i) => (
          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <div style={{
              width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${i < 2 ? BRAND : C.borderStrong}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: i < 2 ? 'rgba(23,107,91,0.12)' : 'transparent',
            }}>
              {i < 2 && <CheckSquare size={9} style={{ color: BRAND }} />}
            </div>
            <span style={{ fontSize: 13, color: C.text2 }}>{opt}</span>
          </label>
        ))}
      </div>
    )
  }
  if (type === 'file' || type === 'image') {
    return (
      <div style={{
        width: '100%', height: 54, borderRadius: 10, border: `2px dashed ${C.borderStrong}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
        color: C.muted,
      }}>
        {type === 'file' ? <Paperclip size={15} style={{ color: C.muted }} /> : <Image size={15} style={{ color: C.muted }} />}
        <span style={{ fontSize: 12 }}>{placeholder}</span>
      </div>
    )
  }
  if (type === 'signature') {
    return (
      <div style={{
        width: '100%', height: 60, borderRadius: 10, border: `2px dashed ${C.borderStrong}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: C.muted,
      }}>
        点击此处手写签名
      </div>
    )
  }
  if (type === 'table') {
    return (
      <div style={{ width: '100%', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', fontSize: 12, padding: '7px 11px', background: C.surfaceAlt, color: C.muted }}>
          <span>列 1</span><span>列 2</span><span>列 3</span>
        </div>
        <div style={{ padding: '7px 11px', fontSize: 12, color: C.faint }}>+ 添加行</div>
      </div>
    )
  }
  if (type === 'autonumber') {
    return (
      <div style={{
        padding: '9px 11px', borderRadius: 8, fontSize: 13, width: '100%',
        background: 'rgba(23,107,91,0.05)', border: '1px solid rgba(23,107,91,0.3)',
        color: BRAND, fontFamily: MONO,
      }}>
        YY-2026-000001
      </div>
    )
  }
  if (type === 'location') {
    return (
      <div style={{
        width: '100%', height: 54, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        background: 'rgba(23,107,91,0.04)', border: '1px solid rgba(23,107,91,0.22)', color: C.text2, fontSize: 13,
      }}>
        <MapPin size={14} style={{ color: BRAND }} />
        点击定位当前位置
      </div>
    )
  }
  const hasDropdown = ['select', 'department', 'user', 'company', 'vendor', 'product', 'rep', 'hospital', 'project', 'budget', 'relation'].includes(type)
  return (
    <div style={{ ...inputLike, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{placeholder}</span>
      {hasDropdown && <ChevronDown size={13} style={{ color: C.muted }} />}
    </div>
  )
}

/* ── 搭建器：插入位置指示线 ────────────────────────────────────────────────── */

/**
 * 指示器几何恒定（固定 8px 高），激活时只叠加绝对定位的插入线与悬浮标签，
 * 不撑开布局 —— 指示器出现/消失不再推挤内容，从根上消除悬停判定的抖动循环。
 */
function DropZone({ active }: { active: boolean }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: 8, flexShrink: 0 }} aria-hidden="true">
      {active && (
        <>
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 3, height: 2,
            borderRadius: 1, background: BRAND,
            boxShadow: '0 0 6px rgba(23,107,91,0.45)',
          }} />
          <span style={{
            position: 'absolute', left: '50%', top: 4,
            transform: 'translate(-50%, -50%)',
            fontSize: 11, fontWeight: 500, lineHeight: 1,
            padding: '4px 10px', borderRadius: 9999,
            background: '#FFFFFF', border: '1px solid rgba(23,107,91,0.45)',
            color: BRAND, whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(16,24,40,0.12)',
            pointerEvents: 'none',
          }}>
            松开放置到此处
          </span>
        </>
      )}
    </div>
  )
}

/* ── 搭建器：画布字段卡 ────────────────────────────────────────────────────── */

function CanvasFieldCard({
  field, selected, onClick, onDelete, onDuplicate, onDragStart, onDragEnd, justAdded,
}: {
  field: CanvasField
  selected: boolean
  onClick: () => void
  onDelete: () => void
  onDuplicate: () => void
  onDragStart: (e: ReactDragEvent) => void
  onDragEnd: () => void
  justAdded: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const def = getCompDef(field.type)
  const Icon = def?.icon ?? Type

  return (
    <div
      className={justAdded ? 'sc-field-drop-in' : undefined}
      style={{
        position: 'relative', borderRadius: 10, transition: 'all 200ms', cursor: 'pointer',
        background: selected ? 'rgba(23,107,91,0.05)' : hovered ? C.surfaceAlt : '#FDFDFD',
        border: `1.5px solid ${selected ? 'rgba(23,107,91,0.55)' : hovered ? C.borderStrong : C.border}`,
        boxShadow: selected ? '0 0 0 1px rgba(23,107,91,0.15), 0 2px 10px rgba(23,107,91,0.08)' : 'none',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      aria-label={`字段：${field.label}`}
      aria-pressed={selected}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {selected && (
        <>
          {([
            ['top: -3px; left: -3px'], ['top: -3px; right: -3px'],
            ['bottom: -3px; left: -3px'], ['bottom: -3px; right: -3px'],
          ] as const).map(([pos]) => (
            <span key={pos} style={{
              position: 'absolute', width: 6, height: 6, borderRadius: '50%', background: BRAND,
              [pos.includes('top') ? 'top' : 'bottom']: pos.includes('top') ? -3 : -3,
              [pos.includes('left') ? 'left' : 'right']: -3,
              zIndex: 10,
            } as CSSProperties} />
          ))}
        </>
      )}

      <div style={{ padding: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <div
              style={{ flexShrink: 0, color: hovered || selected ? C.text2 : 'transparent', transition: 'color 150ms', cursor: 'grab' }}
              title="拖拽排序"
              aria-hidden
            >
              <GripVertical size={13} />
            </div>
            <div style={{
              width: 20, height: 20, borderRadius: 5, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: selected ? 'rgba(23,107,91,0.14)' : C.surfaceAlt,
            }}>
              <Icon size={11} style={{ color: selected ? BRAND : C.muted }} />
            </div>
            <span style={{
              fontSize: 12, fontWeight: 600, color: selected ? C.text1 : '#374151',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {field.label}
            </span>
            {field.required && <span style={{ fontSize: 12, color: '#C73A3A', flexShrink: 0 }}>*</span>}
          </div>
          {(hovered || selected) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button
                style={{ width: 24, height: 24, borderRadius: 4, border: 'none', background: 'none', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={(e) => { e.stopPropagation(); onDuplicate() }}
                aria-label="复制字段"
                title="复制字段"
              >
                <Copy size={11} />
              </button>
              <button
                style={{ width: 24, height: 24, borderRadius: 4, border: 'none', background: 'none', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                aria-label="删除字段"
                title="删除字段"
                onMouseEnter={(e) => { e.currentTarget.style.color = '#C73A3A' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.muted }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>

        {renderFieldPreview(field)}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 }}>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: C.surfaceAlt, color: C.muted, border: `1px solid ${C.border}` }}>
            {def?.name ?? field.type}
          </span>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: C.surfaceAlt, color: C.muted, border: `1px solid ${C.border}` }}>
            {field.colSpan === 2 ? '整行' : '半行'}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── 搭建器：属性面板 ──────────────────────────────────────────────────────── */

function propInputStyle(focusColor = true): CSSProperties {
  return {
    width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
    background: C.surfaceAlt, border: `1px solid ${C.border}`, color: C.text1,
    outline: 'none', transition: 'border-color 150ms',
  }
}

function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 500, color: C.text2 }}>{label}</label>
      {children}
    </div>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: C.text2 }}>{label}</span>
      <button
        style={{
          width: 38, height: 19, borderRadius: 9999, position: 'relative',
          background: on ? 'rgba(23,107,91,0.55)' : C.borderStrong,
          border: 'none', cursor: 'pointer', transition: 'all 200ms',
        }}
        onClick={onClick}
        role="switch"
        aria-checked={on}
        aria-label={label}
      >
        <span style={{
          position: 'absolute', top: 2, width: 15, height: 15, borderRadius: '50%',
          background: '#fff', transition: 'all 200ms', left: on ? 21 : 2,
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  )
}

function PropertyPanel({ field, onChange }: { field: CanvasField | null; onChange: (id: string, patch: Partial<CanvasField>) => void }) {
  const [propTab, setPropTab] = useState<'basic' | 'validate' | 'display' | 'permission'>('basic')

  if (!field) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, color: C.muted }}>
        <AlertCircle size={30} style={{ marginBottom: 12, opacity: 0.35 }} />
        <p style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.7, margin: 0 }}>点击画布中的字段<br />查看和编辑属性</p>
      </div>
    )
  }

  const propTabs = [
    { key: 'basic', label: '基础' },
    { key: 'validate', label: '校验' },
    { key: 'display', label: '显示' },
    { key: 'permission', label: '权限' },
  ] as const

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text1, marginBottom: 2 }}>{field.label}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{getCompDef(field.type)?.name ?? field.type}</div>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {propTabs.map((t) => (
          <button
            key={t.key}
            className={propTab === t.key ? 'sc-tab-active' : undefined}
            style={{
              flex: 1, fontSize: 12, padding: '5px 0', borderRadius: 6, cursor: 'pointer',
              color: propTab === t.key ? BRAND : C.muted,
              background: propTab === t.key ? 'rgba(23,107,91,0.07)' : 'transparent',
              border: 'none', fontWeight: propTab === t.key ? 600 : 400,
            }}
            onClick={() => setPropTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {propTab === 'basic' && (
          <>
            <PropRow label="字段名称">
              <input
                type="text"
                style={propInputStyle()}
                value={field.label}
                onChange={(e) => onChange(field.id, { label: e.target.value })}
                aria-label="字段名称"
              />
            </PropRow>
            <PropRow label="占位提示">
              <input
                type="text"
                style={propInputStyle()}
                value={field.placeholder}
                onChange={(e) => onChange(field.id, { placeholder: e.target.value })}
                aria-label="占位提示"
              />
            </PropRow>
            <PropRow label="字段说明">
              <textarea
                style={{ ...propInputStyle(), minHeight: 54, resize: 'none' }}
                placeholder="可选，帮助填写人理解此字段"
                aria-label="字段说明"
              />
            </PropRow>
            <PropRow label="列宽">
              <div style={{ display: 'flex', gap: 8 }}>
                {([1, 2] as ColSpan[]).map((span) => (
                  <button
                    key={span}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      background: field.colSpan === span ? 'rgba(23,107,91,0.08)' : C.surfaceAlt,
                      border: `1px solid ${field.colSpan === span ? 'rgba(23,107,91,0.4)' : C.border}`,
                      color: field.colSpan === span ? BRAND : C.muted,
                    }}
                    onClick={() => onChange(field.id, { colSpan: span })}
                  >
                    {span === 1 ? '半行' : '整行'}
                  </button>
                ))}
              </div>
            </PropRow>
            <Toggle label="是否必填" on={field.required} onClick={() => onChange(field.id, { required: !field.required })} />
          </>
        )}
        {propTab === 'validate' && (
          <>
            {[
              { label: '最小长度', ph: '0' },
              { label: '最大长度', ph: '500' },
              { label: '正则表达式', ph: '/^[\\s\\S]*$/' },
              { label: '自定义错误提示', ph: '请正确填写此字段' },
            ].map(({ label, ph }) => (
              <PropRow key={label} label={label}>
                <input type="text" placeholder={ph} style={propInputStyle()} aria-label={label} />
              </PropRow>
            ))}
          </>
        )}
        {propTab === 'display' && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.text2, marginBottom: 8 }}>显示条件</div>
            {['始终显示', '根据活动类型显示', '根据预算金额显示', '根据用户角色显示'].map((opt, i) => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 9 }}>
                <input type="radio" name={`display-${field.id}`} defaultChecked={i === 0} style={{ accentColor: BRAND }} />
                <span style={{ fontSize: 12, color: C.text2 }}>{opt}</span>
              </label>
            ))}
          </div>
        )}
        {propTab === 'permission' && (
          <>
            {['谁可以查看', '谁可以填写', '谁可以修改', '谁可以导出'].map((label) => (
              <PropRow key={label} label={label}>
                <div style={{
                  width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                  background: C.surfaceAlt, border: `1px solid ${C.border}`, color: C.text1,
                }}>
                  <span>全部角色</span>
                  <ChevronDown size={12} style={{ color: C.muted }} />
                </div>
              </PropRow>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

/* ── 搭建器：空画布 ────────────────────────────────────────────────────────── */

function EmptyCanvas({ isDragOver, onDemo }: {
  isDragOver: boolean
  onDemo: (label: string) => void
}) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '72px 16px', borderRadius: 14, transition: 'all 200ms',
        border: `2px dashed ${isDragOver ? 'rgba(23,107,91,0.6)' : C.border}`,
        background: isDragOver ? 'rgba(23,107,91,0.04)' : 'transparent',
      }}
    >
      {isDragOver ? (
        <>
          <div style={{
            width: 54, height: 54, borderRadius: 14, marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(23,107,91,0.12)', border: '1px solid rgba(23,107,91,0.4)',
          }}>
            <Plus size={26} style={{ color: BRAND }} />
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: BRAND, margin: 0 }}>松开鼠标添加组件</p>
        </>
      ) : (
        <>
          <div style={{
            width: 54, height: 54, borderRadius: 14, marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: C.surfaceAlt, border: `1px solid ${C.border}`,
          }}>
            <Layers size={26} style={{ color: C.muted }} />
          </div>
          <p style={{ fontSize: 13, fontWeight: 500, color: C.text2, margin: '0 0 4px' }}>从左侧拖入组件，开始构建你的业务场景</p>
          <p style={{ fontSize: 12, color: C.muted, margin: '0 0 20px' }}>或使用下方快捷入口</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {[
              { icon: Wand2, label: '使用模板开始', color: '#2F6BCE' },
              { icon: Copy, label: '从已有场景复制', color: '#0E7490' },
              { icon: Sparkles, label: 'AI 生成表单', color: '#7C3AED' },
            ].map(({ icon: Icon, label, color }) => (
              <button
                key={label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                  borderRadius: 10, fontSize: 12, cursor: 'pointer',
                  background: `${color}0F`, border: `1px solid ${color}30`, color,
                }}
                onClick={() => onDemo(label)}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ── 搭建器：表单画布 + 属性面板 ──────────────────────────────────────────── */

let fieldCounter = 100

function FormCanvas({
  fields, setFields, selectedId, setSelectedId, onDemo, onClear, scenarioName,
}: {
  fields: CanvasField[]
  setFields: Dispatch<SetStateAction<CanvasField[]>>
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  onDemo: (label: string) => void
  onClear: () => void
  scenarioName: string
}) {
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [dragInCanvas, setDragInCanvas] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [justAddedId, setJustAddedId] = useState<string | null>(null)
  const [showGrid, setShowGrid] = useState(false)
  const formCardRef = useRef<HTMLDivElement>(null)

  /**
   * 拖放命中判定在表单卡容器级完成：按光标 Y 与各字段槽位中线的距离取最近插入点，
   * 不再依赖 6px 小落点条的 enter/leave —— 命中区覆盖整张表单，指示器状态平滑单调。
   */
  const computeInsertIndex = useCallback((clientY: number) => {
    const root = formCardRef.current
    if (!root) return 0
    const slots = Array.from(root.querySelectorAll<HTMLElement>('[data-field-slot]'))
    for (let i = 0; i < slots.length; i++) {
      const rect = slots[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return slots.length
  }, [])

  const handleSidebarDrop = useCallback((e: ReactDragEvent, insertAt: number) => {
    e.preventDefault()
    const compType = e.dataTransfer.getData('component/type') as FieldType
    const existingId = e.dataTransfer.getData('field/id')

    if (existingId) {
      setFields((prev) => {
        const arr = [...prev]
        const fromIdx = arr.findIndex((f) => f.id === existingId)
        if (fromIdx === -1) return prev
        const [moved] = arr.splice(fromIdx, 1)
        const targetIdx = insertAt > fromIdx ? insertAt - 1 : insertAt
        arr.splice(targetIdx, 0, moved)
        return arr
      })
      setDropIndex(null)
      setDraggingId(null)
      return
    }

    if (!compType) { setDropIndex(null); return }
    const def = allComponents.find((c) => c.type === compType)
    if (!def) { setDropIndex(null); return }

    const newId = `field-${++fieldCounter}`
    const newField: CanvasField = {
      id: newId, type: compType, label: def.name, placeholder: def.placeholder,
      required: false, colSpan: def.defaultSpan, group: '基础信息',
    }
    setFields((prev) => {
      const arr = [...prev]
      arr.splice(insertAt, 0, newField)
      return arr
    })
    setJustAddedId(newId)
    setTimeout(() => setJustAddedId(null), 500)
    setSelectedId(newId)
    setDropIndex(null)
  }, [setFields, setSelectedId])

  const handleAreaDragOver = useCallback((e: ReactDragEvent) => {
    e.preventDefault()
    setDragInCanvas(true)
    setDropIndex(computeInsertIndex(e.clientY))
  }, [computeInsertIndex])

  const handleAreaDrop = useCallback((e: ReactDragEvent) => {
    e.preventDefault()
    handleSidebarDrop(e, computeInsertIndex(e.clientY))
    setDropIndex(null)
    setDragInCanvas(false)
  }, [computeInsertIndex, handleSidebarDrop])

  const handleAreaDragLeave = useCallback((e: ReactDragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDropIndex(null)
    setDragInCanvas(false)
  }, [])

  const handleFieldDragStart = (e: ReactDragEvent, id: string) => {
    e.dataTransfer.setData('field/id', id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
  }

  const handleDelete = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleDuplicate = (id: string) => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id)
      if (idx === -1) return prev
      const newId = `field-${++fieldCounter}`
      const copy = { ...prev[idx], id: newId, label: prev[idx].label + '（副本）' }
      const arr = [...prev]
      arr.splice(idx + 1, 0, copy)
      return arr
    })
  }

  const handleChange = (id: string, patch: Partial<CanvasField>) => {
    setFields((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f))
  }

  const isEmpty = fields.length === 0

  return (
    <>
      {/* 画布区 */}
      <div
        className={showGrid ? 'sc-grid-bg' : undefined}
        style={{ flex: 1, minWidth: 0, overflow: 'auto', position: 'relative', background: '#F1F4F3' }}
        onClick={() => setSelectedId(null)}
      >
        {/* 画布工具条 */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
          background: 'rgba(255,255,255,0.94)', borderBottom: `1px solid ${C.border}`,
          backdropFilter: 'blur(8px)',
        }}>
          {[
            { icon: Smartphone, label: '手机预览' },
            { icon: Monitor, label: '桌面预览' },
            { icon: Grid3x3, label: '显示栅格', active: showGrid, toggle: () => setShowGrid((v) => !v) },
            { icon: AlignJustify, label: '自动排列' },
          ].map(({ icon: Icon, label, active, toggle }) => (
            <button
              key={label}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                borderRadius: 8, fontSize: 12, cursor: 'pointer',
                color: active ? BRAND : C.muted,
                background: active ? 'rgba(23,107,91,0.08)' : 'transparent',
                border: `1px solid ${active ? 'rgba(23,107,91,0.3)' : 'transparent'}`,
              }}
              onClick={(e) => { e.stopPropagation(); toggle ? toggle() : onDemo(label) }}
              aria-label={label}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>{fields.length} 个字段</span>
            {fields.length > 0 && (
              <button
                style={{
                  fontSize: 12, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                  color: '#C73A3A', background: '#FEECEC', border: 'none',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
                onClick={(e) => { e.stopPropagation(); onClear() }}
              >
                <Trash2 size={11} />清空
              </button>
            )}
          </div>
        </div>

        {/* 表单卡：整卡即命中区，拖入时虚线高亮 */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 24px' }} onClick={(e) => e.stopPropagation()}>
          <div
            ref={formCardRef}
            onDragOver={handleAreaDragOver}
            onDrop={handleAreaDrop}
            onDragLeave={handleAreaDragLeave}
            style={{
              width: '100%', maxWidth: 700, borderRadius: 14, overflow: 'hidden',
              background: dragInCanvas ? '#FBFDFC' : C.surface,
              border: dragInCanvas
                ? '1.5px dashed rgba(23,107,91,0.5)'
                : `1px solid ${C.border}`,
              boxShadow: '0 8px 28px rgba(16,24,40,0.07)',
              transition: 'border 150ms ease, background 150ms ease',
            }}
          >
            <div style={{
              padding: '20px 28px', borderBottom: `1px solid ${C.border}`,
              background: 'linear-gradient(135deg, rgba(23,107,91,0.05), rgba(23,107,91,0.01))',
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 1,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: BRAND, boxShadow: '0 3px 10px rgba(23,107,91,0.3)',
              }}>
                <BookOpen size={14} style={{ color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text1 }}>{scenarioName}表单</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>带 <span style={{ color: '#C73A3A' }}>*</span> 为必填项</div>
              </div>
            </div>

            <div style={{ padding: 22 }}>
              {isEmpty ? (
                <EmptyCanvas
                  isDragOver={dragInCanvas}
                  onDemo={onDemo}
                />
              ) : (
                <div>
                  <DropZone active={dropIndex === 0} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    {fields.map((field, idx) => (
                      <div
                        key={field.id}
                        data-field-slot={idx}
                        style={{
                          gridColumn: field.colSpan === 2 ? 'span 2' : 'span 1',
                          display: 'flex', flexDirection: 'column',
                          opacity: draggingId === field.id ? 0.35 : 1,
                          transition: 'opacity 150ms',
                        }}
                      >
                        <CanvasFieldCard
                          field={field}
                          selected={selectedId === field.id}
                          onClick={() => setSelectedId(field.id)}
                          onDelete={() => handleDelete(field.id)}
                          onDuplicate={() => handleDuplicate(field.id)}
                          onDragStart={(e) => handleFieldDragStart(e, field.id)}
                          onDragEnd={() => { setDraggingId(null); setDropIndex(null); setDragInCanvas(false) }}
                          justAdded={justAddedId === field.id}
                        />
                        <DropZone active={dropIndex === idx + 1} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 右侧属性面板 */}
      <aside style={{
        flexShrink: 0, width: 292, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        borderLeft: `1px solid ${C.border}`, background: C.surface,
      }}>
        <PropertyPanel field={fields.find((f) => f.id === selectedId) ?? null} onChange={handleChange} />
      </aside>
    </>
  )
}

/* ── 流程设计器（浅色 SVG 画布） ───────────────────────────────────────────── */

const nodeTypeConfig: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  start: { icon: Play, color: '#16A34A', label: '发起节点' },
  approve: { icon: CheckSquare, color: '#2F6BCE', label: '审批节点' },
  branch: { icon: GitBranch, color: '#C77A16', label: '条件分支' },
  countersign: { icon: Users, color: '#7C3AED', label: '会签节点' },
  auto: { icon: Zap, color: '#0E7490', label: '自动任务' },
  notify: { icon: Bell, color: '#2F6BCE', label: '通知节点' },
  sync: { icon: RefreshCw, color: '#6B7280', label: '数据同步' },
  end: { icon: Square, color: '#475569', label: '结束节点' },
}

interface FlowNode {
  id: string
  type: string
  name: string
  role: string
  x: number
  y: number
  condition?: string
}

const initialNodes: FlowNode[] = [
  { id: 'n1', type: 'start', name: '发起申请', role: '申请人', x: 40, y: 140 },
  { id: 'n2', type: 'approve', name: '部门负责人审核', role: '部门负责人', x: 220, y: 140 },
  { id: 'n3', type: 'branch', name: '预算金额判断', role: '系统', x: 420, y: 140, condition: '> 50,000' },
  { id: 'n4', type: 'approve', name: '合规负责人审核', role: '合规负责人', x: 620, y: 60 },
  { id: 'n5', type: 'approve', name: '部门直接审批', role: '部门负责人', x: 620, y: 220 },
  { id: 'n6', type: 'auto', name: '执行', role: '申请人', x: 820, y: 140 },
  { id: 'n7', type: 'approve', name: '项目验收', role: '项目负责人', x: 1000, y: 140 },
  { id: 'n8', type: 'end', name: '归档', role: '系统', x: 1180, y: 140 },
]

const flowEdges = [
  { from: 'n1', to: 'n2' },
  { from: 'n2', to: 'n3' },
  { from: 'n3', to: 'n4', label: '是 (>50K)' },
  { from: 'n3', to: 'n5', label: '否' },
  { from: 'n4', to: 'n6' },
  { from: 'n5', to: 'n6' },
  { from: 'n6', to: 'n7' },
  { from: 'n7', to: 'n8' },
]

const NODE_W = 140
const NODE_H = 64

function getCenter(node: FlowNode) {
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 }
}

function FlowEdge({ fromNode, toNode, label }: { fromNode: FlowNode; toNode: FlowNode; label?: string }) {
  const from = getCenter(fromNode)
  const to = getCenter(toNode)
  const dx = to.x - from.x
  const cp1x = from.x + dx * 0.4
  const cp2x = to.x - dx * 0.4
  const path = `M ${from.x} ${from.y} C ${cp1x} ${from.y} ${cp2x} ${to.y} ${to.x} ${to.y}`
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2
  return (
    <g>
      <defs>
        <linearGradient id={`scg-${fromNode.id}-${toNode.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2F6BCE" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0E7490" stopOpacity="0.75" />
        </linearGradient>
        <marker id={`sca-${fromNode.id}-${toNode.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#0E7490" opacity="0.75" />
        </marker>
      </defs>
      <path
        d={path}
        stroke={`url(#scg-${fromNode.id}-${toNode.id})`}
        strokeWidth="1.5"
        fill="none"
        markerEnd={`url(#sca-${fromNode.id}-${toNode.id})`}
      />
      {label && (
        <>
          <rect
            x={mx - 24} y={my - 10} width={48} height={18} rx={4}
            fill="#FEF3E2" stroke="rgba(199,122,22,0.4)" strokeWidth={0.5}
          />
          <text x={mx} y={my + 4} textAnchor="middle" fill="#C77A16" fontSize={9} fontFamily={MONO}>
            {label}
          </text>
        </>
      )}
    </g>
  )
}

function FlowNodeCard({ node, selected, onClick }: { node: FlowNode; selected: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const cfg = nodeTypeConfig[node.type]
  const Icon = cfg.icon

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {(selected || hovered) && (
        <rect
          x={-3} y={-3} width={NODE_W + 6} height={NODE_H + 6} rx={12}
          fill="none"
          stroke={selected ? 'rgba(23,107,91,0.55)' : 'rgba(102,112,133,0.35)'}
          strokeWidth={1.5}
        />
      )}
      <rect
        x={0} y={0} width={NODE_W} height={NODE_H} rx={10}
        fill="#FFFFFF"
        stroke={selected ? 'rgba(23,107,91,0.45)' : hovered ? C.borderStrong : C.border}
        strokeWidth={1}
      />
      <rect x={0} y={0} width={NODE_W} height={3} rx={10} fill={cfg.color} />
      <rect x={10} y={14} width={24} height={24} rx={6} fill={`${cfg.color}1E`} />
      <foreignObject x={10} y={14} width={24} height={24}>
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} />
        </div>
      </foreignObject>
      <text x={42} y={28} fill={C.text1} fontSize={11} fontWeight="600" fontFamily="inherit">
        {node.name.length > 9 ? node.name.slice(0, 9) + '…' : node.name}
      </text>
      <text x={42} y={44} fill={C.muted} fontSize={9} fontFamily="inherit">
        {node.role}
      </text>
      {node.condition && (
        <>
          <rect x={NODE_W / 2 - 24} y={NODE_H - 13} width={48} height={15} rx={4} fill="#FEF3E2" stroke="rgba(199,122,22,0.4)" strokeWidth={0.5} />
          <text x={NODE_W / 2} y={NODE_H - 3} textAnchor="middle" fill="#C77A16" fontSize={8} fontFamily={MONO}>
            {node.condition}
          </text>
        </>
      )}
    </g>
  )
}

function NodePropertyPanel({ node, onClose }: { node: FlowNode; onClose: () => void }) {
  const cfg = nodeTypeConfig[node.type]
  const Icon = cfg.icon
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${cfg.color}16`, border: `1px solid ${cfg.color}33`,
          }}>
            <Icon size={13} style={{ color: cfg.color }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text1 }}>{node.name}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{cfg.label}</div>
          </div>
        </div>
        <button
          style={{ width: 24, height: 24, borderRadius: 4, border: 'none', background: 'none', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={onClose}
          aria-label="关闭属性面板"
          title="关闭属性面板"
        >
          <X size={12} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[
          { label: '节点名称', value: node.name, type: 'text' as const },
          { label: '执行角色', value: node.role, type: 'select' as const },
          { label: '超时时间', value: '48h', type: 'text' as const },
        ].map(({ label, value, type }) => (
          <PropRow key={label} label={label}>
            {type === 'select' ? (
              <div style={{
                width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                background: C.surfaceAlt, border: `1px solid ${C.border}`, color: C.text1,
              }}>
                <span>{value}</span>
                <ChevronDown size={12} style={{ color: C.muted }} />
              </div>
            ) : (
              <input type="text" defaultValue={value} style={propInputStyle()} aria-label={label} />
            )}
          </PropRow>
        ))}

        {['允许转办', '允许驳回', '允许撤回'].map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.text2 }}>{label}</span>
            <button
              style={{
                width: 38, height: 19, borderRadius: 9999, position: 'relative',
                background: i === 1 ? C.borderStrong : 'rgba(23,107,91,0.55)',
                border: 'none', cursor: 'pointer', transition: 'all 200ms',
              }}
              role="switch"
              aria-checked={i !== 1}
              aria-label={label}
            >
              <span style={{
                position: 'absolute', top: 2, width: 15, height: 15, borderRadius: '50%',
                background: '#fff', left: i === 1 ? 2 : 21, transition: 'all 200ms',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
        ))}

        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: C.text2, marginBottom: 8 }}>超时后动作</div>
          {['自动通过', '自动驳回', '通知管理员', '升级处理'].map((opt, i) => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
              <input type="radio" name="timeoutAction" defaultChecked={i === 2} style={{ accentColor: BRAND }} />
              <span style={{ fontSize: 12, color: C.text2 }}>{opt}</span>
            </label>
          ))}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.text2 }}>进入通知</span>
            <button
              style={{
                width: 38, height: 19, borderRadius: 9999, position: 'relative',
                background: 'rgba(23,107,91,0.55)', border: 'none', cursor: 'pointer',
              }}
              role="switch"
              aria-checked
              aria-label="进入通知"
            >
              <span style={{ position: 'absolute', top: 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', left: 21, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </button>
          </div>
          <div style={{
            width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
            background: C.surfaceAlt, border: `1px solid ${C.border}`, color: C.muted,
          }}>
            企业微信 · 系统消息
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10,
          background: '#EBF2FE', border: '1px solid rgba(47,107,206,0.25)',
        }}>
          <Clock size={12} style={{ color: '#2F6BCE', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.text2 }}>
            该节点平均耗时 <span style={{ color: '#2F6BCE', fontFamily: MONO }}>18.4h</span>，超时率 <span style={{ color: '#C77A16', fontFamily: MONO }}>3.2%</span>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
          <Button size="sm" variant="secondary" style={{ flex: 1 }}>删除节点</Button>
          <Button size="sm" variant="primary" style={{ flex: 1 }}>保存配置</Button>
        </div>
      </div>
    </div>
  )
}

function FlowDesigner({ onDemo }: { onDemo: (label: string) => void }) {
  const [nodes] = useState<FlowNode[]>(initialNodes)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const selectedNodeObj = nodes.find((n) => n.id === selectedNode) ?? null
  const svgWidth = 1400
  const svgHeight = 340

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* 节点类型面板 */}
      <aside style={{
        flexShrink: 0, width: 156, padding: 12, overflowY: 'auto',
        borderRight: `1px solid ${C.border}`, background: C.surface,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 10, padding: '0 4px', letterSpacing: '0.05em' }}>节点类型</div>
        {Object.entries(nodeTypeConfig).map(([type, cfg]) => {
          const Icon = cfg.icon
          return (
            <div
              key={type}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                borderRadius: 8, marginBottom: 3, cursor: 'grab', color: C.text2,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${cfg.color}0F`; e.currentTarget.style.color = cfg.color }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.text2 }}
              title={`添加 ${cfg.label}`}
            >
              <Icon size={13} />
              <span style={{ fontSize: 12 }}>{cfg.label}</span>
            </div>
          )
        })}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 8, padding: '0 4px', letterSpacing: '0.05em' }}>画布操作</div>
          {['自动对齐', '适应视口', '导出图片'].map((label) => (
            <button
              key={label}
              style={{
                width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 8,
                fontSize: 12, cursor: 'pointer', color: C.muted, marginBottom: 3,
                background: 'transparent', border: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceAlt; e.currentTarget.style.color = C.text2 }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted }}
              onClick={() => onDemo(label)}
            >
              {label}
            </button>
          ))}
        </div>
      </aside>

      {/* 流程画布 */}
      <main
        className="sc-grid-bg"
        style={{ flex: 1, minWidth: 0, overflow: 'auto', position: 'relative', background: '#F1F4F3' }}
        onClick={() => setSelectedNode(null)}
      >
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', fontSize: 12,
          background: 'rgba(255,255,255,0.94)', borderBottom: `1px solid ${C.border}`,
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{ color: C.muted }}>学术会议申请 · 审批流程</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#248A5A' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#248A5A' }} />
            流程有效
          </span>
          <span style={{ color: C.muted }}>6 个节点 · 8 条连线</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button size="sm" variant="outline" icon={<Play size={11} />} onClick={() => onDemo('模拟执行')}>
              模拟执行
            </Button>
          </div>
        </div>

        <div style={{ padding: 28 }}>
          <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible', minWidth: svgWidth }}>
            {flowEdges.map((e) => {
              const fromNode = nodes.find((n) => n.id === e.from)
              const toNode = nodes.find((n) => n.id === e.to)
              if (!fromNode || !toNode) return null
              return <FlowEdge key={`${e.from}-${e.to}`} fromNode={fromNode} toNode={toNode} label={e.label} />
            })}
            {nodes.map((node) => (
              <FlowNodeCard key={node.id} node={node} selected={selectedNode === node.id} onClick={() => setSelectedNode(node.id)} />
            ))}
          </svg>

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10,
              background: '#FEF3E2', border: '1px solid rgba(199,122,22,0.3)',
            }}>
              <GitBranch size={14} style={{ color: '#C77A16' }} />
              <div style={{ fontSize: 12, color: C.text2 }}>
                <span style={{ color: '#C77A16', fontWeight: 600 }}>条件分支：</span>
                预算金额 &gt; 50,000
                <span style={{ margin: '0 8px', color: C.muted }}>→</span>
                <span style={{ color: '#7C3AED' }}>是：合规负责人审核</span>
                <span style={{ margin: '0 8px', color: C.muted }}>|</span>
                <span style={{ color: '#2F6BCE' }}>否：部门直接审批</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 节点属性面板 */}
      <aside style={{
        flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        width: selectedNodeObj ? 276 : 0, transition: 'all 200ms',
        borderLeft: selectedNodeObj ? `1px solid ${C.border}` : 'none',
        background: C.surface, opacity: selectedNodeObj ? 1 : 0,
      }}>
        {selectedNodeObj && <NodePropertyPanel node={selectedNodeObj} onClose={() => setSelectedNode(null)} />}
      </aside>
    </div>
  )
}

/* ── 接口自动化（浅色） ────────────────────────────────────────────────────── */

const mappingStatus = {
  ok: { color: '#248A5A', icon: CheckCircle2 },
  error: { color: '#C73A3A', icon: AlertCircle },
  warning: { color: '#C77A16', icon: AlertCircle },
}

const logStatusConfig: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  success: { icon: CheckCircle2, color: '#248A5A', label: '已成功' },
  error: { icon: AlertCircle, color: '#C73A3A', label: '失败' },
  retry: { icon: RefreshCw, color: '#C77A16', label: '可重试' },
}

function ApiAutomation({ onDemo }: { onDemo: (label: string) => void }) {
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [retryEnabled, setRetryEnabled] = useState(true)
  const [notifyEnabled, setNotifyEnabled] = useState(true)

  const card: CSSProperties = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20,
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 22, background: '#F5F7F8' }} className="sc-page-enter">
      <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text1, margin: '0 0 4px' }}>接口自动化配置</h2>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>配置场景触发条件、目标系统和字段映射规则</p>
        </div>

        {/* 触发条件 */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Zap size={14} style={{ color: '#0E7490' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>触发条件</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: 12, borderRadius: 10,
            background: 'rgba(14,116,144,0.05)', border: '1px solid rgba(14,116,144,0.22)',
          }}>
            <div style={{ fontSize: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, color: C.text2 }}>
              <span>当</span>
              <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: '#EBF2FE', color: '#2F6BCE', border: '1px solid rgba(47,107,206,0.3)' }}>项目验收</span>
              <span>状态变为</span>
              <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: '#E6F5ED', color: '#248A5A', border: '1px solid rgba(36,138,90,0.3)' }}>已通过</span>
              <span>时触发</span>
            </div>
            <ArrowRight size={14} style={{ color: C.muted, flexShrink: 0 }} />
            <div style={{ fontSize: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, color: C.text2 }}>
              <Database size={12} style={{ color: '#0E7490' }} />
              <span>向</span>
              <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: 'rgba(14,116,144,0.1)', color: '#0E7490', border: '1px solid rgba(14,116,144,0.3)' }}>财务系统</span>
              <span>创建结算申请</span>
            </div>
          </div>
        </div>

        {/* 目标系统 */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Database size={14} style={{ color: '#2F6BCE' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>目标系统</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {[
              { label: '系统类型', value: 'REST API', type: 'select' },
              { label: '接口地址', value: 'https://finance.internal/api/settlements', type: 'text' },
              { label: '认证方式', value: 'Bearer Token', type: 'select' },
            ].map(({ label, value, type }) => (
              <PropRow key={label} label={label}>
                <div style={{
                  width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                  background: C.surfaceAlt, border: `1px solid ${C.border}`, color: C.text1,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                  {type === 'select' && <ChevronDown size={11} style={{ color: C.muted, flexShrink: 0 }} />}
                </div>
              </PropRow>
            ))}
          </div>
        </div>

        {/* 字段映射 */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowRight size={14} style={{ color: '#0E7490' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>字段映射</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => onDemo('自动匹配')}>自动匹配</Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 1fr 84px', gap: 12, marginBottom: 8, padding: '0 4px' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>贝医字段</div>
            <div />
            <div style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>财务系统字段</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.muted, textAlign: 'center' }}>状态</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {apiMappings.map((m) => {
              const sc = mappingStatus[m.status]
              const Icon = sc.icon
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 32px 1fr 84px', gap: 12,
                    alignItems: 'center', padding: 11, borderRadius: 10,
                    background: m.status === 'error' ? '#FEECEC' : m.status === 'warning' ? '#FEF3E2' : C.surfaceAlt,
                    border: `1px solid ${m.status === 'error' ? 'rgba(199,58,58,0.25)' : m.status === 'warning' ? 'rgba(199,122,22,0.25)' : C.border}`,
                  }}
                >
                  <div style={{
                    padding: '6px 10px', borderRadius: 8, fontSize: 12,
                    background: '#EBF2FE', color: '#2F6BCE', border: '1px solid rgba(47,107,206,0.2)',
                  }}>
                    {m.sourceField}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ArrowRight size={14} style={{ color: C.muted }} />
                  </div>
                  <div style={{
                    padding: '6px 10px', borderRadius: 8, fontSize: 12,
                    background: C.surface, color: C.text2, border: `1px solid ${C.border}`, fontFamily: MONO,
                  }}>
                    {m.targetField}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Icon size={12} style={{ color: sc.color }} />
                    {m.error ? (
                      <span style={{ fontSize: 10, color: sc.color }}>{m.status === 'error' ? '类型错误' : '需确认'}</span>
                    ) : (
                      <span style={{ fontSize: 11, color: sc.color }}>正常</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#FEECEC', border: '1px solid rgba(199,58,58,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertCircle size={12} style={{ color: '#C73A3A', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3, color: '#C73A3A' }}>字段映射错误：验收金额</div>
                <div style={{ fontSize: 12, color: C.text2 }}>
                  贝医字段类型为 <code style={{ padding: '1px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.05)', fontFamily: MONO, fontSize: 11 }}>number</code>，
                  目标字段 settlement_amount 期望 <code style={{ padding: '1px 5px', borderRadius: 4, background: 'rgba(0,0,0,0.05)', fontFamily: MONO, fontSize: 11 }}>string</code>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button size="sm" variant="outline" onClick={() => onDemo('添加类型转换')}>添加类型转换</Button>
                  <Button size="sm" variant="ghost" onClick={() => onDemo('忽略映射错误')}>忽略</Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 同步选项 */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text1, marginBottom: 12 }}>同步选项</div>
          {[
            { label: '启用接口同步', desc: '满足触发条件时自动发送数据', state: syncEnabled, toggle: setSyncEnabled },
            { label: '失败自动重试', desc: '最多重试 3 次，间隔 5 分钟', state: retryEnabled, toggle: setRetryEnabled },
            { label: '完成后发送通知', desc: '同步成功或失败后通知负责人', state: notifyEnabled, toggle: setNotifyEnabled },
          ].map(({ label, desc, state, toggle }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{label}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{desc}</div>
              </div>
              <button
                style={{
                  width: 38, height: 19, borderRadius: 9999, position: 'relative', flexShrink: 0,
                  background: state ? 'rgba(23,107,91,0.55)' : C.borderStrong,
                  border: 'none', cursor: 'pointer', transition: 'all 200ms',
                }}
                onClick={() => toggle(!state)}
                role="switch"
                aria-checked={state}
                aria-label={label}
              >
                <span style={{
                  position: 'absolute', top: 2, width: 15, height: 15, borderRadius: '50%',
                  background: '#fff', left: state ? 21 : 2, transition: 'all 200ms',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>
          ))}
        </div>

        {/* 同步记录 */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={14} style={{ color: C.muted }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>最近同步记录</span>
            </div>
            <button style={{ fontSize: 12, cursor: 'pointer', color: C.muted, background: 'none', border: 'none' }} onClick={() => onDemo('查看全部同步记录')}>
              查看全部
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {syncLogs.map((log) => {
              const sc = logStatusConfig[log.status]
              const Icon = sc.icon
              return (
                <div key={log.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 11, borderRadius: 10,
                  background: C.surfaceAlt, border: `1px solid ${C.border}`,
                }}>
                  <Icon size={13} style={{ color: sc.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.desc}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{log.time}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: C.muted, fontFamily: MONO }}>{log.duration}</span>
                    <span style={{
                      fontSize: 11, padding: '2px 6px', borderRadius: 4,
                      background: `${sc.color}14`, color: sc.color,
                    }}>
                      {sc.label}
                    </span>
                    {(log.status === 'error' || log.status === 'retry') && (
                      <button style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, cursor: 'pointer', color: '#2F6BCE', background: 'none', border: 'none' }} onClick={() => onDemo('重试同步')}>
                        重试
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 发布确认弹窗 ──────────────────────────────────────────────────────────── */

function PublishModal({
  open, onClose, onPublished, fields, scenarioName,
}: {
  open: boolean
  onClose: () => void
  onPublished: () => void
  fields: CanvasField[]
  scenarioName: string
}) {
  const [step, setStep] = useState<'confirm' | 'success'>('confirm')

  useEffect(() => { if (open) setStep('confirm') }, [open])

  const warnings = [
    { text: '有 1 个流程节点未配置执行人' },
    ...(fields.length === 0 ? [{ text: '表单画布没有任何字段' }] : []),
  ]

  return (
    <Modal open={open} title="发布业务场景" onClose={onClose} width={480}
      footer={step === 'confirm' ? (
        <>
          <Button variant="secondary" onClick={onClose}>返回修改</Button>
          <Button variant="outline" onClick={onClose}>存为草稿</Button>
          <Button variant="primary" icon={<Rocket size={13} />} onClick={() => setStep('success')}>发布场景</Button>
        </>
      ) : (
        <Button variant="primary" onClick={onPublished}>打开场景</Button>
      )}
    >
      {step === 'confirm' ? (
        <>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>发布前请确认以下配置信息</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: '场景名称', value: scenarioName },
              { label: '当前版本', value: 'v0.4 → v1.0', mono: true },
              { label: '表单字段', value: `${fields.length} 个` },
              { label: '流程节点', value: '6 个' },
              { label: '权限配置', value: '3 个角色' },
              { label: '通知规则', value: '已启用' },
            ].map(({ label, value, mono }) => (
              <div key={label} style={{
                borderRadius: 8, padding: 11,
                background: C.surfaceAlt, border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text1, fontFamily: mono ? MONO : 'inherit' }}>{value}</div>
              </div>
            ))}
          </div>
          {warnings.length > 0 && (
            <div style={{
              borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
              background: '#FEF3E2', border: '1px solid rgba(199,122,22,0.3)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, color: '#C77A16' }}>
                <AlertCircle size={12} />发布前需要注意
              </div>
              {warnings.map((w) => (
                <div key={w.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: C.text2 }}>
                  <span style={{ color: '#C73A3A' }}>•</span>{w.text}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{
            width: 54, height: 54, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            background: '#E6F5ED', border: '2px solid #248A5A',
          }}>
            <CheckCircle2 size={26} style={{ color: '#248A5A' }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text1, margin: '0 0 4px' }}>发布成功</h3>
          <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px' }}>{scenarioName} v1.0 已正式上线</p>
          <div style={{
            borderRadius: 10, padding: 12, textAlign: 'left', marginBottom: 4,
            background: '#E6F5ED', border: '1px solid rgba(36,138,90,0.25)',
          }}>
            {[
              { l: '版本号', v: 'v1.0' },
              { l: '发布人', v: '张明华' },
              { l: '发布时间', v: '2026-09-11 10:32' },
            ].map(({ l, v }) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                <span style={{ color: C.muted }}>{l}</span>
                <span style={{ color: '#374151', fontFamily: MONO }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ── 预览模式（全屏覆盖层） ────────────────────────────────────────────────── */

function PreviewOverlay({
  scenarioName, fields, onClose,
}: {
  scenarioName: string
  fields: CanvasField[]
  onClose: () => void
}) {
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop')
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', flexDirection: 'column',
      background: '#EDF1F0',
    }} className="sc-page-enter">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 22px', height: 50, flexShrink: 0,
        background: C.surface, borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{
          fontSize: 12, padding: '4px 12px', borderRadius: 9999,
          background: '#FEF3E2', color: '#C77A16', border: '1px solid rgba(199,122,22,0.3)',
        }}>
          预览模式 · 不会产生真实业务数据
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(['desktop', 'mobile'] as const).map((m) => (
            <button
              key={m}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8,
                fontSize: 12, cursor: 'pointer',
                background: mode === m ? 'rgba(23,107,91,0.08)' : 'transparent',
                color: mode === m ? BRAND : C.muted,
                border: `1px solid ${mode === m ? 'rgba(23,107,91,0.3)' : 'transparent'}`,
              }}
              onClick={() => setMode(m)}
            >
              {m === 'desktop' ? <Monitor size={12} /> : <Smartphone size={12} />}
              {m === 'desktop' ? '桌面端' : '移动端'}
            </button>
          ))}
          <div style={{ width: 1, height: 16, background: C.border, margin: '0 4px' }} />
          <IconButton variant="ghost" icon={<X size={14} />} title="关闭预览" onClick={onClose} />
        </div>
      </div>
      <div className="sc-grid-bg" style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 16px', background: '#EDF1F0' }}>
        <div style={{
          borderRadius: 14, overflow: 'hidden', transition: 'all 200ms',
          width: mode === 'mobile' ? 375 : 700,
          background: C.surface, border: `1px solid ${C.border}`,
          boxShadow: '0 12px 36px rgba(16,24,40,0.1)',
        }}>
          <div style={{
            padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
            background: 'linear-gradient(135deg, rgba(23,107,91,0.06), rgba(23,107,91,0.01))',
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text1, margin: '0 0 4px' }}>{scenarioName}</h2>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>请填写完整的申请信息并提交审批</p>
          </div>
          <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 15 }}>
            {fields.slice(0, 6).map((field) => (
              <div key={field.id}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: C.text2 }}>
                  {field.label}{field.required && <span style={{ color: '#C73A3A' }}> *</span>}
                </label>
                <div style={{ ...inputLike, fontSize: 13 }}>{field.placeholder || '—'}</div>
              </div>
            ))}
            {fields.length === 0 && (
              <p style={{ textAlign: 'center', fontSize: 13, color: C.muted, padding: '28px 0', margin: 0 }}>表单暂无字段</p>
            )}
            <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
              <Button variant="secondary" style={{ flex: 1 }}>保存草稿</Button>
              <Button variant="primary" style={{ flex: 1 }}>提交审批</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 占位页签（权限设置 / 数据关联） ──────────────────────────────────────── */

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, background: '#F5F7F8' }}>
      <div style={{ textAlign: 'center' }}>
        <Wand2 size={38} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
        <p style={{ fontSize: 13, margin: 0, color: C.text2 }}>{label} 配置面板</p>
        <p style={{ fontSize: 12, marginTop: 4, marginBottom: 0, opacity: 0.7, color: C.muted }}>此功能正在开发中</p>
      </div>
    </div>
  )
}

/* ── 搭建器主视图 ──────────────────────────────────────────────────────────── */

type BuilderTab = 'form' | 'flow' | 'permission' | 'data' | 'api'

function BuilderView({
  scenarioName, onBack, onPublished, addToast,
}: {
  scenarioName: string
  onBack: () => void
  onPublished: () => void
  addToast: Props['addToast']
}) {
  const [activeTab, setActiveTab] = useState<BuilderTab>('form')
  const [compSearch, setCompSearch] = useState('')
  const [savedStatus, setSavedStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [fields, setFields] = useState<CanvasField[]>(INITIAL_FIELDS)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const onDemo = useCallback((label: string) => {
    addToast({ type: 'info', title: `（演示）${label}`, description: '原型仅做界面演示，该动作不产生真实效果。' })
  }, [addToast])

  const handleSave = () => {
    setSavedStatus('saving')
    setTimeout(() => {
      setSavedStatus('saved')
      setTimeout(() => setSavedStatus('idle'), 2000)
    }, 800)
  }

  const tabs: { key: BuilderTab; label: string }[] = [
    { key: 'form', label: '表单设计' },
    { key: 'flow', label: '流程设计' },
    { key: 'permission', label: '权限设置' },
    { key: 'data', label: '数据关联' },
    { key: 'api', label: '接口自动化' },
  ]

  const filteredGroups = componentGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !compSearch || i.name.includes(compSearch) || i.desc.includes(compSearch)),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F5F7F8', overflow: 'hidden' }} className="sc-page-enter">
      {/* 顶部工具栏 */}
      <header style={{
        height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', background: C.surface, borderBottom: `1px solid ${C.border}`, zIndex: 30, gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 1 }}>
          <Button size="sm" variant="ghost" icon={<ArrowLeft size={13} />} onClick={onBack}>
            返回
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 }}>
            <span style={{ color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>业务搭建中心</span>
            <span style={{ color: C.faint, flexShrink: 0 }}>/</span>
            <span style={{ color: C.text1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scenarioName}</span>
          </div>
          <Tag label="草稿" color="warning" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center', flex: 1, minWidth: 0 }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className={activeTab === t.key ? 'sc-tab-active' : undefined}
              style={{
                padding: '7px 12px', fontSize: 12, fontWeight: activeTab === t.key ? 600 : 400,
                borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                color: activeTab === t.key ? BRAND : C.muted,
                background: activeTab === t.key ? 'rgba(23,107,91,0.07)' : 'transparent',
                border: 'none', transition: 'all 200ms',
              }}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', flexShrink: 0 }}>
          <IconButton variant="ghost" size="sm" icon={<RotateCcw size={13} />} title="撤销" onClick={() => onDemo('撤销')} />
          <IconButton variant="ghost" size="sm" icon={<RotateCw size={13} />} title="重做" onClick={() => onDemo('重做')} />
          <div style={{ width: 1, height: 16, background: C.border, margin: '0 2px' }} />
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSave}
            loading={savedStatus === 'saving'}
            style={savedStatus === 'saved' ? { color: '#248A5A', borderColor: 'rgba(36,138,90,0.4)' } : undefined}
            icon={savedStatus === 'saved' ? <CheckCircle2 size={12} style={{ color: '#248A5A' }} /> : <Save size={12} />}
          >
            {savedStatus === 'saved' ? '已保存' : '保存'}
          </Button>
          <Button size="sm" variant="outline" icon={<Eye size={12} />} onClick={() => setShowPreview(true)}>
            预览
          </Button>
          <Button size="sm" variant="primary" icon={<Rocket size={12} />} onClick={() => setShowPublishModal(true)}>
            发布
          </Button>
        </div>
      </header>

      {/* 主体 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {activeTab === 'flow' ? (
          <FlowDesigner onDemo={onDemo} />
        ) : activeTab === 'api' ? (
          <ApiAutomation onDemo={onDemo} />
        ) : activeTab === 'form' ? (
          <>
            {/* 左侧组件库 */}
            <aside style={{
              flexShrink: 0, width: 244, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              borderRight: `1px solid ${C.border}`, background: C.surface,
            }}>
              <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8,
                  background: C.surfaceAlt, border: `1px solid ${C.border}`,
                }}>
                  <Search size={12} style={{ color: C.muted, flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder="搜索组件…"
                    value={compSearch}
                    onChange={(e) => setCompSearch(e.target.value)}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: C.text1, fontFamily: 'inherit' }}
                    aria-label="搜索组件"
                  />
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {filteredGroups.map((group) => (
                  <div key={group.label}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, padding: '0 4px', color: C.muted, letterSpacing: '0.05em' }}>
                      {group.label}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {group.items.map((item) => {
                        const Icon = item.icon
                        return (
                          <div
                            key={item.name}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                              borderRadius: 8, userSelect: 'none', color: C.text2, cursor: 'grab',
                            }}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('component/type', item.type)
                              e.dataTransfer.effectAllowed = 'copy'
                              const ghost = document.createElement('div')
                              ghost.textContent = item.name
                              ghost.style.cssText = `position:fixed;top:-100px;left:-100px;background:#fff;border:1px solid rgba(23,107,91,0.4);color:${BRAND};padding:6px 12px;border-radius:8px;font-size:12px;font-family:inherit;white-space:nowrap;box-shadow:0 4px 12px rgba(16,24,40,0.1);`
                              document.body.appendChild(ghost)
                              e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 16)
                              setTimeout(() => ghost.remove(), 0)
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(23,107,91,0.06)'
                              e.currentTarget.style.color = C.text1
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = C.text2
                            }}
                            title={`拖拽到画布添加：${item.name}`}
                          >
                            <Icon size={13} style={{ color: C.muted, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: 'inherit' }}>{item.name}</div>
                              <div style={{ fontSize: 10, color: C.muted }}>{item.desc}</div>
                            </div>
                            <GripVertical size={10} style={{ color: C.muted, opacity: 0.5 }} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            {/* 画布 + 属性面板 */}
            <FormCanvas
              fields={fields}
              setFields={setFields}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              onDemo={onDemo}
              onClear={() => setShowClearConfirm(true)}
              scenarioName={scenarioName}
            />
          </>
        ) : (
          <PlaceholderPanel label={tabs.find((t) => t.key === activeTab)?.label ?? ''} />
        )}
      </div>

      <PublishModal
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        onPublished={() => {
          setShowPublishModal(false)
          onPublished()
        }}
        fields={fields}
        scenarioName={scenarioName}
      />
      {showPreview && (
        <PreviewOverlay
          scenarioName={scenarioName}
          fields={fields}
          onClose={() => setShowPreview(false)}
        />
      )}
      <ConfirmDialog
        open={showClearConfirm}
        title="清空画布"
        description="将删除画布中全部字段，此操作不可撤销。"
        impact={`当前共 ${fields.length} 个字段将被清空`}
        confirmLabel="清空"
        variant="danger"
        onConfirm={() => {
          setFields([])
          setSelectedId(null)
          setShowClearConfirm(false)
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  )
}

/* ── 场景中心视图 ──────────────────────────────────────────────────────────── */

const categories = [
  { key: 'all', label: '全部' },
  { key: 'my', label: '我的场景' },
  { key: 'compliance', label: '合规管理' },
  { key: 'business', label: '业务申请' },
  { key: 'finance', label: '财务结算' },
  { key: 'risk', label: '风险事件' },
  { key: 'personnel', label: '人员管理' },
  { key: 'archived', label: '已归档' },
]

function CenterView({ onOpenBuilder, addToast }: { onOpenBuilder: (name: string) => void; addToast: Props['addToast'] }) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const stats = [
    { label: '全部场景', value: 12, icon: Layers, color: '#2F6BCE', trend: '+2', trendUp: true, sub: '本月新增 2 个场景' },
    { label: '已发布', value: 8, icon: CheckCircle2, color: '#248A5A', trend: '+1', trendUp: true, sub: '运行健康率 100%' },
    { label: '草稿中', value: 3, icon: Edit3, color: '#C77A16', trend: '+1', trendUp: false, sub: '有 1 个等待配置' },
    { label: '本周待处理', value: 26, icon: Activity, color: '#0E7490', trend: '-4', trendUp: true, sub: '较上周减少 4 条' },
  ]

  const filtered = scenarios
    .filter((s) => {
      if (activeCategory === 'archived') return s.status === 'archived'
      if (activeCategory === 'my') return s.creator === '张明华' || s.creator === '刘宇航'
      if (activeCategory !== 'all') return s.category === activeCategory
      return true
    })
    .filter((s) => s.name.includes(searchQuery) || s.description.includes(searchQuery))

  const onDemo = (label: string) => {
    addToast({ type: 'info', title: `（演示）${label}`, description: '原型仅做界面演示，该动作不产生真实效果。' })
  }

  return (
    <div style={{ minHeight: '100%' }} className="sc-page-enter">
      <PageHeader
        title="业务搭建中心"
        description="将企业业务配置成可执行、可追踪、可扩展的数字流程"
        actions={
          <>
            <Button variant="secondary" icon={<Download size={13} />} onClick={() => onDemo('导入场景')}>导入场景</Button>
            <Button variant="outline" icon={<LayoutTemplate size={13} />} onClick={() => onDemo('场景模板')}>场景模板</Button>
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => onOpenBuilder('新建业务场景')}>新建业务场景</Button>
          </>
        }
      />

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 18, padding: '18px 24px 24px' }}>
        {/* 主列 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
            {stats.map((s, i) => (
              <StatCard key={s.label} {...s} delay={i * 50} />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
              background: C.surface, border: `1px solid ${C.border}`,
            }}>
              <Search size={14} style={{ color: C.muted, flexShrink: 0 }} />
              <input
                type="text"
                placeholder="搜索场景名称、描述…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: C.text1, fontFamily: 'inherit' }}
                aria-label="搜索场景"
              />
            </div>
            <Button variant="outline" icon={<Filter size={13} />} onClick={() => onDemo('筛选')}>筛选</Button>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16,
            overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none',
          }}>
            {categories.map((cat) => (
              <button
                key={cat.key}
                style={{
                  flexShrink: 0, padding: '6px 12px', borderRadius: 8, fontSize: 12,
                  fontWeight: activeCategory === cat.key ? 600 : 400, cursor: 'pointer',
                  color: activeCategory === cat.key ? BRAND : C.muted,
                  background: activeCategory === cat.key ? 'rgba(23,107,91,0.07)' : 'transparent',
                  border: `1px solid ${activeCategory === cat.key ? 'rgba(23,107,91,0.25)' : 'transparent'}`,
                  transition: 'all 200ms',
                }}
                onClick={() => setActiveCategory(cat.key)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '72px 0', color: C.muted, background: C.surface,
              border: `1px dashed ${C.border}`, borderRadius: 10,
            }}>
              <Layers size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
              <p style={{ fontSize: 13, margin: 0 }}>暂无匹配的业务场景</p>
              <Button variant="outline" style={{ marginTop: 14 }} onClick={() => onOpenBuilder('新建业务场景')}>
                新建业务场景
              </Button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(296px, 1fr))', gap: 14 }}>
              {filtered.map((s, i) => (
                <ScenarioCard key={s.id} scenario={s} delay={i * 40} onOpen={() => onOpenBuilder(s.name)} />
              ))}
            </div>
          )}
        </div>

        {/* 右栏：最近活动 + 运行健康度 */}
        <aside style={{
          flexShrink: 0, width: 272, background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 16, height: 'fit-content',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>最近活动</span>
            <button style={{ fontSize: 12, cursor: 'pointer', color: C.muted, background: 'none', border: 'none' }} onClick={() => onDemo('查看全部活动')}>
              查看全部
            </button>
          </div>
          {activities.map((a) => (
            <ActivityItem key={a.id} activity={a} />
          ))}

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.text2, marginBottom: 12 }}>运行健康度</div>
            {[
              { label: '学术会议申请', pct: 98, color: '#248A5A' },
              { label: '代表合规培训', pct: 96, color: '#248A5A' },
              { label: '供应商风险事件', pct: 87, color: '#C77A16' },
              { label: '市场活动备案', pct: 100, color: '#248A5A' },
            ].map((item) => (
              <div key={item.label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: C.muted }}>{item.label}</span>
                  <span style={{ color: item.color, fontFamily: MONO }}>{item.pct}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 9999, overflow: 'hidden', background: C.surfaceAlt }}>
                  <div style={{
                    height: '100%', borderRadius: 9999, width: `${item.pct}%`,
                    background: item.color, transition: 'width 500ms ease-out',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ── 页面入口 ──────────────────────────────────────────────────────────────── */

export function ScenarioCenter({ addToast }: Props) {
  const [view, setView] = useState<'center' | 'builder'>('center')
  const [builderScenario, setBuilderScenario] = useState('学术会议申请')
  const lastCenterScroll = useRef(0)

  if (view === 'builder') {
    return (
      <>
        <style>{PAGE_CSS}</style>
        <BuilderView
          scenarioName={builderScenario}
          onBack={() => setView('center')}
          onPublished={() => {
            setView('center')
            addToast({ type: 'success', title: '场景已发布（演示）', description: `${builderScenario} v1.0 · 2026-09-11 10:32；原型不会生成真实模块。` })
          }}
          addToast={addToast}
        />
      </>
    )
  }

  return (
    <>
      <style>{PAGE_CSS}</style>
      <CenterView
        addToast={addToast}
        onOpenBuilder={(name) => {
          lastCenterScroll.current = 0
          if (name === '新建业务场景') {
            setBuilderScenario('新建业务场景')
          } else {
            setBuilderScenario(name)
          }
          setView('builder')
        }}
      />
    </>
  )
}

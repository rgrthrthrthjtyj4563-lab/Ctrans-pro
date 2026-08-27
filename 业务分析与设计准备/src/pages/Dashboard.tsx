import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FileSearch,
  FolderKanban,
  RotateCcw,
  ShieldAlert,
  TrendingUp,
  Users,
  Wallet,
  Building2,
  BadgePercent,
  ReceiptText,
  Sparkles,
} from 'lucide-react';
import { MetricCard } from '../components/MetricCard';
import { AIInsightCard } from '../components/AIInsightCard';
import { Button } from '../components/Button';
import { RiskTag, Tag } from '../components/StatusTag';
import type { ToastMessage } from '../components/Toast';
import { getRoleDashboardData, repFilingAnalysis } from '../data/mockData';
import type {
  DashboardMessage,
  DashboardMetric,
  DashboardQueueItem,
  DashboardRecentOperation,
  DashboardRoleData,
  DashboardStatItem,
  PageId,
  Role,
  SalesWorkbenchData,
  WorkbenchDeliverable,
  WorkbenchPeriod,
  WorkbenchTask,
  WorkbenchTodo,
} from '../types';

const riskOrder = { overdue: 0, risk: 1, attention: 2, normal: 3 };
const insightOrder = { risk: 0, attention: 1, info: 2 };

const iconMap = {
  clipboard: ClipboardList,
  percent: BadgePercent,
  progress: FolderKanban,
  wallet: Wallet,
  alert: AlertTriangle,
  shield: ShieldAlert,
  'file-search': FileSearch,
  building: Building2,
  users: Users,
  check: CheckCircle2,
  camera: Camera,
  coins: CircleDollarSign,
  'user-check': Users,
  clock: Clock3,
  briefcase: BriefcaseBusiness,
  receipt: ReceiptText,
};

const toneStyles = {
  brand: { fg: '#176B5B', bg: '#E8F4F1', bar: '#176B5B' },
  success: { fg: '#248A5A', bg: '#E6F5ED', bar: '#248A5A' },
  warning: { fg: '#C77A16', bg: '#FEF3E2', bar: '#C77A16' },
  danger: { fg: '#C73A3A', bg: '#FEECEC', bar: '#C73A3A' },
  info: { fg: '#2F6BCE', bg: '#EBF2FE', bar: '#2F6BCE' },
  neutral: { fg: '#475467', bg: '#F3F4F6', bar: '#98A2B3' },
};

function getReminderTone(level?: DashboardMessage['reminderLevel']) {
  switch (level) {
    case '3天提醒':
      return { fg: '#2F6BCE', bg: '#EBF2FE', label: '3 天提醒' };
    case '1天提醒':
      return { fg: '#C77A16', bg: '#FEF3E2', label: '1 天提醒' };
    case '1小时提醒':
      return { fg: '#B54708', bg: '#FFF1E8', label: '1 小时提醒' };
    case '已超期':
      return { fg: '#C73A3A', bg: '#FEECEC', label: '已超期' };
    default:
      return null;
  }
}

function getMetricIcon(metric: DashboardMetric) {
  return iconMap[metric.icon];
}

function sectionCardStyle(extra?: CSSProperties): CSSProperties {
  return {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 12,
    padding: 16,
    ...extra,
  };
}

function SectionCard({
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section style={sectionCardStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{title}</h2>
          {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#667085' }}>{subtitle}</p>}
        </div>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: 'none',
              background: 'none',
              color: '#176B5B',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {actionLabel} <ArrowRight size={13} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function TrendPanel({ data }: { data: DashboardRoleData['trend'] }) {
  const max = Math.max(...data.points.map(point => point.value), 1);
  const width = 620;
  const height = 180;
  const points = data.points
    .map((point, index) => {
      const x = data.points.length === 1 ? width / 2 : (index * (width - 32)) / (data.points.length - 1) + 16;
      const y = height - (point.value / max) * 124 - 24;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <SectionCard title={data.title} subtitle={data.subtitle}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 16, alignItems: 'center' }}>
        <div>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 180, display: 'block' }} aria-hidden="true">
            {[0.25, 0.5, 0.75].map(line => (
              <line
                key={line}
                x1="0"
                x2={width}
                y1={height - height * line}
                y2={height - height * line}
                stroke="#EAECF0"
                strokeDasharray="4 4"
              />
            ))}
            <polyline fill="none" stroke="#176B5B" strokeWidth="3" points={points} />
            {data.points.map((point, index) => {
              const x = data.points.length === 1 ? width / 2 : (index * (width - 32)) / (data.points.length - 1) + 16;
              const y = height - (point.value / max) * 124 - 24;
              return (
                <g key={point.label}>
                  <circle cx={x} cy={y} r="5" fill="#176B5B" />
                  <text x={x} y={height - 6} fontSize="11" textAnchor="middle" fill="#98A2B3">{point.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.summary.map(item => {
            const tone = toneStyles[item.tone || 'neutral'];
            return (
              <div key={item.id} style={{ padding: 12, borderRadius: 10, background: tone.bg }}>
                <div style={{ fontSize: 12, color: tone.fg, fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1F2937', lineHeight: 1 }}>{item.value}</div>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

function StatListPanel({ title, items }: { title: string; items: DashboardStatItem[] }) {
  return (
    <SectionCard title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(item => {
          const tone = toneStyles[item.tone || 'neutral'];
          return (
            <div key={item.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 13, color: '#344054', fontWeight: 600 }}>{item.label}</div>
                  {item.hint && <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{item.hint}</div>}
                </div>
                <span
                  style={{
                    alignSelf: 'flex-start',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    background: tone.bg,
                    color: tone.fg,
                  }}
                >
                  {item.value}
                </span>
              </div>
              {item.progress !== undefined && (
                <div style={{ height: 6, background: '#F2F4F7', borderRadius: 999 }}>
                  <div style={{ width: `${item.progress}%`, height: '100%', borderRadius: 999, background: tone.bar }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function ComparisonTablePanel({ data }: { data: NonNullable<DashboardRoleData['comparisonTable']> }) {
  return (
    <SectionCard title={data.title}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '0 0 10px', textAlign: 'left', fontSize: 12, color: '#98A2B3', fontWeight: 600 }}>队伍</th>
              {data.columns.map(column => (
                <th key={column} style={{ padding: '0 0 10px', textAlign: 'left', fontSize: 12, color: '#98A2B3', fontWeight: 600 }}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => {
              const tone = toneStyles[row.tone || 'neutral'];
              return (
                <tr key={row.name}>
                  <td style={{ padding: '12px 0', borderTop: '1px solid #F2F4F7', fontSize: 13, color: '#344054', fontWeight: 600 }}>{row.name}</td>
                  {row.values.map(value => (
                    <td key={`${row.name}-${value}`} style={{ padding: '12px 0', borderTop: '1px solid #F2F4F7' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: tone.bg, color: tone.fg }}>
                        {value}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function QueueTable({
  items,
  navigate,
}: {
  items: DashboardRoleData['queue'];
  navigate: (page: PageId) => void;
}) {
  const sorted = [...items].sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  return (
    <SectionCard title="优先处理队列" subtitle="排序保持：逾期 > 风险 > 关注 > 正常" actionLabel="查看全部" onAction={() => navigate('task-dispatch')}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 760 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.3fr 130px 150px 120px 110px',
              padding: '0 0 10px',
              fontSize: 12,
              color: '#98A2B3',
              fontWeight: 600,
            }}
          >
            <span>业务名称 / 单据语义</span>
            <span>截止时间</span>
            <span>负责人 / 最近动作</span>
            <span>风险</span>
            <span>操作</span>
          </div>

          {sorted.map(item => (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.3fr 130px 150px 120px 110px',
                gap: 12,
                alignItems: 'center',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid #F2F4F7',
                marginBottom: 8,
                background: item.risk === 'overdue' ? '#FFFBFB' : '#FFFFFF',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2937', marginBottom: 4 }}>{item.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <Tag label={item.type} />
                  {item.note && <Tag label={item.note} color={item.risk === 'overdue' ? 'danger' : item.risk === 'risk' ? 'warning' : 'info'} />}
                </div>
              </div>
              <div style={{ fontSize: 13, color: item.risk === 'overdue' ? '#C73A3A' : '#344054', fontWeight: item.risk === 'overdue' ? 700 : 500 }}>
                {item.deadline}
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#344054', fontWeight: 600 }}>{item.assignee}</div>
                <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{item.lastAction}</div>
              </div>
              <div>
                <RiskTag level={item.risk} size="sm" />
              </div>
              <div>
                <Button
                  size="sm"
                  variant={item.risk === 'overdue' ? 'danger' : 'outline'}
                  iconAfter={<ChevronRight size={13} />}
                  onClick={() => navigate(item.target)}
                >
                  {item.actionLabel}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function RecentOperationsPanel({
  items,
  navigate,
}: {
  items: DashboardRecentOperation[];
  navigate: (page: PageId) => void;
}) {
  return (
    <SectionCard title="最近操作" subtitle="审计视角，仅用于回看已发生动作" actionLabel="查看审计日志" onAction={() => navigate('audit-log')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: `${item.color}18`,
                color: item.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {item.user.slice(0, 1)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#344054' }}>
                <strong style={{ color: item.color }}>{item.action}</strong>
                <span style={{ color: '#667085' }}> · {item.target}</span>
              </div>
              <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{item.user} · {item.time}</div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function QuickActionsPanel({
  items,
  navigate,
}: {
  items: DashboardRoleData['quickActions'];
  navigate: (page: PageId) => void;
}) {
  return (
    <SectionCard title="快捷入口">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => navigate(item.target)}
            style={{
              border: '1px solid #E5E7EB',
              borderRadius: 10,
              background: '#FFFFFF',
              padding: 12,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 13, color: '#1F2937', fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 12, color: '#667085', lineHeight: 1.5 }}>{item.description}</div>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function TaskListPanel({
  items,
  navigate,
}: {
  items: DashboardMessage[];
  navigate: (page: PageId) => void;
}) {
  return (
    <SectionCard title="今日任务清单" subtitle="按截止紧急度排序，只展示本人待处理事项">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(item => {
          const reminder = getReminderTone(item.reminderLevel);
          return (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 12,
                border: '1px solid #EAECF0',
                borderRadius: 12,
                padding: 14,
                background: item.reminderLevel === '已超期' ? '#FFFBFB' : '#FFFFFF',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div style={{ fontSize: 14, color: '#1F2937', fontWeight: 700 }}>{item.title}</div>
                  {reminder && (
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: reminder.fg, background: reminder.bg }}>
                      {reminder.label}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#667085', marginBottom: 6 }}>{item.summary}</div>
                <div style={{ fontSize: 12, color: '#98A2B3' }}>{item.time}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Button size="sm" variant={item.reminderLevel === '已超期' ? 'danger' : 'primary'} onClick={() => navigate(item.target)}>
                  {item.actionLabel}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ─── 药厂销售部门：销售运营工作台（P1 首页重组） ────────────────────
// 依据《药厂销售部门首页优化文档 V1.0》：
// 待办/关注分离、任务交付概览 + 聚合、指标口径修正（执行中≠完成进度、
// 里程碑判延误、金额分阶段）、AI 五段式紧凑入口、颜色纪律（常态无红框）。

const PERIOD_RANGES: Record<WorkbenchPeriod, { start: string; end: string; label: string }> = {
  本周: { start: '2026-08-24', end: '2026-08-30', label: '08-24 ~ 08-30' },
  本月: { start: '2026-08-01', end: '2026-08-31', label: '08-01 ~ 08-31' },
  本季度: { start: '2026-07-01', end: '2026-09-30', label: '07-01 ~ 09-30' },
};
const TODAY = '2026-08-27';

const taskStatusColor: Record<string, 'brand' | 'info' | 'success' | 'default'> = {
  执行中: 'brand',
  待确认: 'info',
  已结算: 'success',
  已撤销: 'default',
};

function WorkbenchFilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 30,
          padding: '0 10px',
          borderRadius: 8,
          border: `1px solid ${selected.length > 0 ? '#176B5B' : '#D1D5DB'}`,
          background: selected.length > 0 ? '#E8F4F1' : '#FFFFFF',
          color: selected.length > 0 ? '#176B5B' : '#374151',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        {selected.length > 0 && ` · ${selected.length}`}
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              zIndex: 50,
              minWidth: 220,
              maxWidth: 280,
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: 10,
              padding: 8,
              boxShadow: '0 8px 24px rgba(16, 24, 40, 0.12)',
            }}
          >
            {options.map(option => (
              <label
                key={option}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  fontSize: 13,
                  color: '#344054',
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
              >
                <input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} />
                {option}
              </label>
            ))}
            <button
              onClick={onClear}
              style={{
                marginTop: 6,
                width: '100%',
                border: 'none',
                background: 'none',
                color: '#98A2B3',
                fontSize: 12,
                cursor: 'pointer',
                padding: '4px 8px',
                textAlign: 'right',
              }}
            >
              清空已选
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function WorkbenchSummaryChip({
  label,
  value,
  hint,
  active,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  active?: boolean;
  tone?: 'neutral' | 'warning' | 'brand';
  onClick?: () => void;
}) {
  const toneFg = tone === 'warning' ? '#C77A16' : tone === 'brand' ? '#176B5B' : '#1F2937';
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 10,
        border: `1px solid ${active ? '#176B5B' : '#F2F4F7'}`,
        background: active ? '#E8F4F1' : '#FFFFFF',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{ fontSize: 12, color: '#667085', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: toneFg, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{value}</span>
      {hint && <span style={{ fontSize: 11, color: '#98A2B3', whiteSpace: 'nowrap' }}>{hint}</span>}
    </button>
  );
}

function WorkbenchTodoPanel({
  todos,
  outOfScopeCount,
  navigate,
  listRef,
}: {
  todos: WorkbenchTodo[];
  outOfScopeCount: number;
  navigate: (page: PageId) => void;
  listRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section style={sectionCardStyle({ padding: 0, display: 'flex', flexDirection: 'column' })}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px 8px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1F2937' }}>我的待办</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#667085' }}>全部未完成，含历史事项 · 按逾期与到期时间排序</p>
        </div>
      </div>
      <div ref={listRef} style={{ padding: '0 16px 14px' }}>
        {todos.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: '#98A2B3' }}>当前筛选范围内暂无待办事项</div>
        ) : (
          todos.map(todo => (
            <div
              key={todo.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
                padding: '10px 12px',
                border: '1px solid #F2F4F7',
                borderLeft: todo.overdue ? '3px solid #C73A3A' : '3px solid transparent',
                borderRadius: 10,
                marginBottom: 8,
                background: todo.overdue ? '#FFFBFB' : '#FFFFFF',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {todo.taskName}
                  </span>
                  <Tag label={todo.docType} />
                </div>
                <div style={{ fontSize: 12, color: '#667085', marginBottom: 4 }}>{todo.reason}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                  <span style={{ color: todo.overdue ? '#C73A3A' : todo.dueToday ? '#C77A16' : '#667085', fontWeight: todo.overdue || todo.dueToday ? 700 : 500 }}>
                    {todo.dueState}
                  </span>
                  <span style={{ color: '#D0D5DD' }}>·</span>
                  <span style={{ color: '#667085' }}>{todo.owner}</span>
                </div>
              </div>
              <Button size="sm" variant={todo.overdue ? 'danger' : 'outline'} iconAfter={<ChevronRight size={13} />} onClick={() => navigate(todo.target)}>
                {todo.primaryAction}
              </Button>
            </div>
          ))
        )}
        {outOfScopeCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#98A2B3', paddingTop: 2 }}>
            <span>范围外仍有 {outOfScopeCount} 项待办</span>
            <button
              onClick={() => navigate('task-dispatch')}
              style={{ border: 'none', background: 'none', color: '#176B5B', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              查看全部
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function deliverableStatusLabel(deliverable: WorkbenchDeliverable): { text: string; color: string } {
  const done = deliverable.accepted >= deliverable.target;
  if (done) return { text: `${deliverable.name} ${deliverable.accepted}/${deliverable.target}${deliverable.unit}`, color: '#248A5A' };
  if (deliverable.dueDate < TODAY) return { text: `${deliverable.name} ${deliverable.accepted}/${deliverable.target}${deliverable.unit}（逾期）`, color: '#C73A3A' };
  return { text: `${deliverable.name} ${deliverable.accepted}/${deliverable.target}${deliverable.unit}`, color: '#344054' };
}

function WorkbenchTaskOverviewPanel({
  tasks,
  aggMode,
  onAggModeChange,
  aggRows,
  periodLabel,
  hasFilter,
  onReset,
  onFilterVariety,
  onFilterRegion,
  navigate,
}: {
  tasks: WorkbenchTask[];
  aggMode: 'task' | 'region' | 'variety' | 'provider';
  onAggModeChange: (mode: 'task' | 'region' | 'variety' | 'provider') => void;
  aggRows: { key: string; taskCount: number; anomalyCount: number; dueCount: number; acceptedCount: number }[] | null;
  periodLabel: string;
  hasFilter: boolean;
  onReset: () => void;
  onFilterVariety: (value: string) => void;
  onFilterRegion: (value: string) => void;
  navigate: (page: PageId) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const taskCols = 'minmax(0, 1.8fr) minmax(0, 1.15fr) minmax(0, 1.05fr) minmax(0, 1.35fr) minmax(0, 1.25fr) 92px';
  const aggCols = 'minmax(0, 1.6fr) 120px 120px 130px 140px';
  const modes: { key: 'task' | 'region' | 'variety' | 'provider'; label: string }[] = [
    { key: 'task', label: '任务明细' },
    { key: 'region', label: '按区域' },
    { key: 'variety', label: '按品种' },
    { key: 'provider', label: '按服务提供方' },
  ];

  const displayed = showAll ? tasks : tasks.slice(0, 5);

  return (
    <section style={sectionCardStyle({ padding: 0, display: 'flex', flexDirection: 'column' })}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px 10px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1F2937' }}>任务交付概览</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#667085' }}>
            计划执行区间与 {periodLabel} 有交集的任务 · 需要干预的优先 · 跨月任务不复制
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, padding: 3, background: '#F3F4F6', borderRadius: 8 }}>
          {modes.map(mode => (
            <button
              key={mode.key}
              onClick={() => onAggModeChange(mode.key)}
              style={{
                border: 'none',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: aggMode === mode.key ? '#FFFFFF' : 'transparent',
                color: aggMode === mode.key ? '#1F2937' : '#667085',
                boxShadow: aggMode === mode.key ? '0 1px 2px rgba(16,24,40,.1)' : 'none',
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {aggMode === 'task' ? (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 900 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: taskCols,
                  gap: 10,
                  padding: '0 12px 8px',
                  fontSize: 12,
                  color: '#98A2B3',
                  fontWeight: 600,
                  borderBottom: '1px solid #F2F4F7',
                }}
              >
                <span>任务 / 编号</span>
                <span>品种 / 区域</span>
                <span>服务提供方</span>
                <span>交付情况（已验收/约定）</span>
                <span>异常与下一期限</span>
                <span>操作</span>
              </div>
              {tasks.length === 0 ? (
                <div style={{ padding: '28px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#667085', marginBottom: 10 }}>当前组合无匹配任务</div>
                  {hasFilter && (
                    <Button size="sm" variant="outline" onClick={onReset}>
                      <RotateCcw size={12} /> 重置筛选
                    </Button>
                  )}
                </div>
              ) : (
                <div style={{ paddingTop: 8 }}>
                  {displayed.map(task => {
                    const firstDeliverable = task.deliverables[0];
                    const varietyExtra = task.varieties.length - 1;
                    const regionExtra = task.regions.length - 1;
                    return (
                      <div
                        key={task.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: taskCols,
                          gap: 10,
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: '1px solid #F2F4F7',
                          marginBottom: 8,
                          background: task.anomalies.length > 0 ? '#FFFBF8' : '#FFFFFF',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2937', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {task.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 2 }}>{task.taskNo}</div>
                        </div>
                        <div style={{ fontSize: 12, color: '#475467', lineHeight: 1.8, minWidth: 0 }}>
                          <div>
                            <button
                              onClick={() => onFilterVariety(task.varieties[0])}
                              style={{ border: 'none', background: 'none', padding: 0, color: '#176B5B', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                            >
                              {task.varieties[0]}
                            </button>
                            {varietyExtra > 0 && <span style={{ color: '#98A2B3' }}> +{varietyExtra}</span>}
                          </div>
                          <div>
                            <button
                              onClick={() => onFilterRegion(task.regions[0])}
                              style={{ border: 'none', background: 'none', padding: 0, color: '#176B5B', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                            >
                              {task.regions[0]}
                            </button>
                            {regionExtra > 0 && <span style={{ color: '#98A2B3' }}> +{regionExtra}</span>}
                          </div>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: '#344054', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.provider}</div>
                          <div style={{ marginTop: 4 }}>
                            <Tag label={task.status} color={taskStatusColor[task.status] ?? 'default'} />
                          </div>
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.7, minWidth: 0 }}>
                          {task.status === '待确认' ? (
                            <span style={{ color: '#98A2B3' }}>—（待服务商确认）</span>
                          ) : firstDeliverable ? (
                            <>
              <div style={{ color: deliverableStatusLabel(firstDeliverable).color }}>
                {deliverableStatusLabel(firstDeliverable).text}
              </div>
              {task.deliverables.length > 1 && <div style={{ color: '#98A2B3' }}>查看交付明细（共 {task.deliverables.length} 项）</div>}
            </>
          ) : (
            <span style={{ color: '#98A2B3' }}>—</span>
          )}
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.7, minWidth: 0 }}>
                          {task.anomalies.length > 0 ? (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 2 }}>
                              {task.anomalies.map(anomaly => (
                                <Tag key={anomaly} label={anomaly} color="warning" />
                              ))}
                            </div>
                          ) : (
                            <div style={{ color: '#98A2B3', marginBottom: 2 }}>暂无异常</div>
                          )}
                          {task.nextDueLabel ? <div style={{ color: '#667085' }}>{task.nextDueLabel}</div> : <Tag label="未设置阶段计划" color="info" />}
                        </div>
                        <div>
                          <Button size="sm" variant="outline" onClick={() => navigate('task-dispatch')}>
                            查看任务
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {tasks.length > 5 && (
                    <button
                      onClick={() => setShowAll(prev => !prev)}
                      style={{ width: '100%', border: 'none', background: 'none', color: '#176B5B', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 0' }}
                    >
                      {showAll ? '收起' : `显示全部 ${tasks.length} 项`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 640 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: aggCols,
                  gap: 10,
                  padding: '0 12px 8px',
                  fontSize: 12,
                  color: '#98A2B3',
                  fontWeight: 600,
                  borderBottom: '1px solid #F2F4F7',
                }}
              >
                <span>{aggMode === 'region' ? '区域' : aggMode === 'variety' ? '品种' : '服务提供方'}</span>
                <span>去重任务数</span>
                <span>异常任务数</span>
                <span>到期交付项</span>
                <span>已按期验收</span>
              </div>
              {(aggRows ?? []).map(row => (
                <div
                  key={row.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: aggCols,
                    gap: 10,
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderTop: '1px solid #F2F4F7',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: '#344054', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.key}</span>
                  <span style={{ color: '#344054' }}>{row.taskCount} 项</span>
                  <span style={{ color: row.anomalyCount > 0 ? '#C77A16' : '#98A2B3', fontWeight: row.anomalyCount > 0 ? 700 : 500 }}>
                    {row.anomalyCount > 0 ? `${row.anomalyCount} 项` : '暂无异常'}
                  </span>
                  <span style={{ color: '#344054' }}>{row.dueCount} 项</span>
                  <span style={{ color: row.dueCount > 0 && row.acceptedCount >= row.dueCount ? '#248A5A' : '#344054' }}>
                    {row.dueCount === 0 ? '暂无应交付项' : `${row.acceptedCount}/${row.dueCount}`}
                  </span>
                </div>
              ))}
              {(aggRows ?? []).length === 0 && (
                <div style={{ padding: '28px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#667085', marginBottom: 10 }}>当前组合无匹配任务</div>
                  {hasFilter && (
                    <Button size="sm" variant="outline" onClick={onReset}>
                      <RotateCcw size={12} /> 重置筛选
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function WorkbenchAIPanel({ ai, navigate }: { ai: SalesWorkbenchData['ai']; navigate: (page: PageId) => void }) {
  const [expanded, setExpanded] = useState(true);
  const sections: { label: string; content: string }[] = [
    { label: '发现', content: ai.finding },
    { label: '证据', content: ai.evidence },
    { label: '原因', content: ai.cause },
    { label: '建议', content: ai.suggestion },
  ];

  return (
    <section
      style={{
        background: 'linear-gradient(180deg, #F4FAF8 0%, #FFFFFF 58%)',
        border: '1px solid #C8E2DB',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 16px 10px' }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: '#176B5B',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Sparkles size={16} />
        </div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1F2937' }}>AI 分析</h2>
        <span style={{ padding: '2px 8px', borderRadius: 999, background: '#E8F4F1', color: '#176B5B', fontSize: 12, fontWeight: 700 }}>
          基于最新业务数据
        </span>
        <span style={{ fontSize: 11, color: '#98A2B3' }}>生成时间 {ai.generatedAt} · 与业务数据截至时间分开</span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setExpanded(prev => !prev)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#176B5B', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          {expanded ? '收起' : '展开分析'} <ChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>
      <div style={{ padding: '0 16px 12px', fontSize: 14, fontWeight: 600, color: '#1F2937', lineHeight: 1.7 }}>{ai.summary}</div>
      {expanded && (
        <div
          style={{
            padding: '12px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            borderTop: '1px dashed #CFE5DE',
            margin: '0 16px',
          }}
        >
          {sections.map(section => (
            <div key={section.label} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr)', gap: 10, alignItems: 'baseline' }}>
              <span style={{ padding: '2px 0', borderRadius: 6, background: '#E8F4F1', color: '#176B5B', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
                {section.label}
              </span>
              <span style={{ fontSize: 13, color: '#475467', lineHeight: 1.7 }}>{section.content}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
            {ai.actions.map((action, index) => (
              <Button key={action.label} size="sm" variant={index === 0 ? 'primary' : 'outline'} onClick={() => navigate(action.target)}>
                {action.label}
              </Button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#98A2B3' }}>AI 仅提供参考，所有操作需人工确认；不自动改变任何单据状态。</div>
        </div>
      )}
    </section>
  );
}

function SalesWorkbenchDashboard({ workbench, navigate }: { workbench: SalesWorkbenchData; navigate: (page: PageId) => void }) {
  const [period, setPeriod] = useState<WorkbenchPeriod>('本月');
  const [selVarieties, setSelVarieties] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [selProviders, setSelProviders] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'执行中' | '异常' | null>(null);
  const [aggMode, setAggMode] = useState<'task' | 'region' | 'variety' | 'provider'>('task');
  const todoListRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLDivElement>(null);

  const hasFilter = selVarieties.length > 0 || selRegions.length > 0 || selProviders.length > 0;

  const resetFilters = () => {
    setSelVarieties([]);
    setSelRegions([]);
    setSelProviders([]);
    setStatusFilter(null);
  };

  const bizFiltered = useMemo(
    () =>
      workbench.tasks.filter(
        task =>
          (selVarieties.length === 0 || task.varieties.some(value => selVarieties.includes(value))) &&
          (selRegions.length === 0 || task.regions.some(value => selRegions.includes(value))) &&
          (selProviders.length === 0 || selProviders.includes(task.provider)),
      ),
    [workbench.tasks, selVarieties, selRegions, selProviders],
  );

  const range = PERIOD_RANGES[period];
  const periodFiltered = useMemo(
    () => bizFiltered.filter(task => task.startDate <= range.end && task.endDate >= range.start),
    [bizFiltered, range],
  );

  const execCount = periodFiltered.filter(task => task.status === '执行中').length;
  const anomalyCount = periodFiltered.filter(task => task.anomalies.length > 0).length;

  // 我的待办跟随业务维度，但不被周期过滤（全部未完成，含历史事项）
  const bizTaskNos = useMemo(() => new Set(bizFiltered.map(task => task.taskNo)), [bizFiltered]);
  const visibleTodos = useMemo(
    () =>
      workbench.todos
        .filter(todo => bizTaskNos.has(todo.taskId))
        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(!!b.dueToday) - Number(!!a.dueToday))
        .slice(0, 5),
    [workbench.todos, bizTaskNos],
  );
  const outOfScopeTodos = workbench.todos.length - workbench.todos.filter(todo => bizTaskNos.has(todo.taskId)).length;

  const overviewTasks = useMemo(() => {
    const filtered = periodFiltered.filter(task =>
      statusFilter === '执行中' ? task.status === '执行中' : statusFilter === '异常' ? task.anomalies.length > 0 : true,
    );
    return [...filtered].sort(
      (a, b) => (a.anomalies.length > 0 ? 0 : 1) - (b.anomalies.length > 0 ? 0 : 1) || a.endDate.localeCompare(b.endDate),
    );
  }, [periodFiltered, statusFilter]);

  const aggRows = useMemo(() => {
    if (aggMode === 'task') return null;
    const map = new Map<string, { key: string; taskCount: number; anomalyCount: number; dueCount: number; acceptedCount: number }>();
    for (const task of periodFiltered) {
      const keys = aggMode === 'region' ? task.regions : aggMode === 'variety' ? task.varieties : [task.provider];
      for (const key of keys) {
        const row = map.get(key) ?? { key, taskCount: 0, anomalyCount: 0, dueCount: 0, acceptedCount: 0 };
        row.taskCount += 1;
        if (task.anomalies.length > 0) row.anomalyCount += 1;
        for (const deliverable of task.deliverables) {
          if (deliverable.dueDate >= range.start && deliverable.dueDate <= range.end) {
            row.dueCount += 1;
            if (deliverable.accepted >= deliverable.target) row.acceptedCount += 1;
          }
        }
        map.set(key, row);
      }
    }
    return [...map.values()].sort((a, b) => b.anomalyCount - a.anomalyCount || b.taskCount - a.taskCount);
  }, [aggMode, periodFiltered, range]);

  const toggleSelection = (setter: Dispatch<SetStateAction<string[]>>, value: string) => {
    setter(prev => (prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]));
  };

  const scrollTo = (ref: RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1480 }}>
      <style>{`
        @media (max-width: 960px) {
          .swb-split { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* 01 页面标题与范围 */}
      <section style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1F2937' }}>{workbench.headline}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#667085' }}>
            聚焦委托推广任务交付与协同处理 · 数据截至 {workbench.dataAsOf} · 时区 Asia/Shanghai
          </p>
        </div>
        <div style={{ flexShrink: 0, fontSize: 12, color: '#667085' }}>AI 仅供参考，操作需人工确认</div>
      </section>

      {/* 全局筛选 */}
      <section style={{ ...sectionCardStyle({ padding: '10px 14px' }), display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#667085', fontWeight: 600 }}>周期</span>
        {(Object.keys(PERIOD_RANGES) as WorkbenchPeriod[]).map(item => (
          <button
            key={item}
            onClick={() => setPeriod(item)}
            style={{
              border: `1px solid ${period === item ? '#176B5B' : '#E5E7EB'}`,
              background: period === item ? '#E8F4F1' : '#FFFFFF',
              color: period === item ? '#176B5B' : '#475467',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {item}
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: '#E5E7EB' }} />
        <WorkbenchFilterDropdown
          label="品种"
          options={workbench.filterOptions.varieties}
          selected={selVarieties}
          onToggle={value => toggleSelection(setSelVarieties, value)}
          onClear={() => setSelVarieties([])}
        />
        <WorkbenchFilterDropdown
          label="区域"
          options={workbench.filterOptions.regions}
          selected={selRegions}
          onToggle={value => toggleSelection(setSelRegions, value)}
          onClear={() => setSelRegions([])}
        />
        <WorkbenchFilterDropdown
          label="服务提供方"
          options={workbench.filterOptions.providers}
          selected={selProviders}
          onToggle={value => toggleSelection(setSelProviders, value)}
          onClear={() => setSelProviders([])}
        />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#98A2B3' }}>{range.label}</span>
        {(hasFilter || statusFilter) && (
          <button
            onClick={resetFilters}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#98A2B3', fontSize: 12, cursor: 'pointer', padding: '4px 6px' }}
          >
            <RotateCcw size={12} /> 重置
          </button>
        )}
      </section>

      {/* 02 运营摘要 */}
      <section style={{ ...sectionCardStyle({ padding: '10px 16px' }), display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#667085', fontWeight: 600, flexShrink: 0 }}>运营摘要</span>
        <WorkbenchSummaryChip
          label="执行中任务"
          value={`${execCount} 项`}
          active={statusFilter === '执行中'}
          onClick={() => {
            setStatusFilter(prev => (prev === '执行中' ? null : '执行中'));
            scrollTo(overviewRef);
          }}
        />
        <WorkbenchSummaryChip
          label="异常任务"
          value={anomalyCount > 0 ? `${anomalyCount} 项` : '暂无异常'}
          tone={anomalyCount > 0 ? 'warning' : 'neutral'}
          active={statusFilter === '异常'}
          onClick={() => {
            setStatusFilter(prev => (prev === '异常' ? null : '异常'));
            scrollTo(overviewRef);
          }}
        />
        <WorkbenchSummaryChip label="待我处理" value={`${workbench.todos.length} 项`} hint="含历史事项" tone="brand" onClick={() => scrollTo(todoListRef)} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#98A2B3' }}>执行中 ≠ 完成进度 · 异常按任务去重 · 待我处理按待办计数</span>
      </section>

      {/* 03 AI 分析 + 常用入口（提高布局权重：紧随运营摘要、默认展开、突出 AI） */}
      <div className="swb-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 1fr)', gap: 12, alignItems: 'stretch' }}>
        <WorkbenchAIPanel ai={workbench.ai} navigate={navigate} />
        <section style={sectionCardStyle({ padding: '12px 16px', display: 'flex', flexDirection: 'column' })}>
          <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1F2937' }}>常用入口</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {workbench.quickActions.map(item => (
              <button
                key={item.id}
                onClick={() => navigate(item.target)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  background: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151' }}>{item.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#667085', marginTop: 2 }}>{item.description}</span>
                </span>
                <ArrowRight size={14} color="#9CA3AF" />
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* 04 我的待办（全宽） */}
      <div style={{ scrollMarginTop: 8 }}>
        <WorkbenchTodoPanel todos={visibleTodos} outOfScopeCount={outOfScopeTodos} navigate={navigate} listRef={todoListRef} />
      </div>

      {/* 05 任务交付概览 */}
      <div ref={overviewRef} style={{ scrollMarginTop: 8 }}>
        <WorkbenchTaskOverviewPanel
          tasks={overviewTasks}
          aggMode={aggMode}
          onAggModeChange={setAggMode}
          aggRows={aggRows}
          periodLabel={period}
          hasFilter={hasFilter}
          onReset={resetFilters}
          onFilterVariety={value => setSelVarieties(prev => (prev.includes(value) ? prev : [...prev, value]))}
          onFilterRegion={value => setSelRegions(prev => (prev.includes(value) ? prev : [...prev, value]))}
          navigate={navigate}
        />
      </div>
    </div>
  );
}

// ─── 药厂合规部门：整页骨架对齐药厂销售部门 ────────────────────
type ComplianceLayer = 'orange' | 'blue';

const complianceLayerMeta: Record<ComplianceLayer, { bar: string; bg: string; tag: 'warning' | 'info'; label: string }> = {
  orange: { bar: '#C77A16', bg: '#FFFBF0', tag: 'warning', label: '审批门槛' },
  blue: { bar: '#2F6BCE', bg: '#F5F9FF', tag: 'info', label: '风控建议' },
};

const complianceLayerOrder: Record<ComplianceLayer, number> = { orange: 0, blue: 1 };

function getComplianceQueueLayer(item: DashboardQueueItem): ComplianceLayer {
  const note = item.note ?? '';
  if (note.includes('蓝色') || item.type === '随检通知') return 'blue';
  return 'orange';
}

function sortComplianceItems(items: DashboardRoleData['queue']) {
  return [...items].sort((a, b) => {
    const diff = riskOrder[a.risk] - riskOrder[b.risk];
    if (diff !== 0) return diff;
    return complianceLayerOrder[getComplianceQueueLayer(a)] - complianceLayerOrder[getComplianceQueueLayer(b)];
  });
}

function ComplianceQueuePanel({
  items,
  navigate,
}: {
  items: DashboardRoleData['queue'];
  navigate: (page: PageId) => void;
}) {
  const sorted = sortComplianceItems(items);
  const cols = 'minmax(0, 1.6fr) 112px 140px 80px 100px';

  return (
    <section
      style={{
        ...sectionCardStyle({ padding: 0, display: 'flex', flexDirection: 'column' }),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px 10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1F2937' }}>优先处理队列</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#667085' }}>
            排序保持：逾期 &gt; 风险 &gt; 关注 &gt; 正常 · 橙=门槛 / 蓝=建议
          </p>
        </div>
        <button
          onClick={() => navigate('audit-log')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            border: 'none',
            background: 'none',
            color: '#176B5B',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          查看全部 <ArrowRight size={13} />
        </button>
      </div>

      <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 760 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: cols,
                gap: 10,
                padding: '0 12px 8px',
                fontSize: 12,
                color: '#98A2B3',
                fontWeight: 600,
                borderBottom: '1px solid #F2F4F7',
              }}
            >
              <span>业务名称 / 单据语义</span>
              <span>截止时间</span>
              <span>负责人 / 最近动作</span>
              <span>层级</span>
              <span>操作</span>
            </div>

            <div style={{ paddingTop: 8 }}>
              {sorted.map(item => {
                const layer = getComplianceQueueLayer(item);
                const tone = complianceLayerMeta[layer];
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: cols,
                      gap: 10,
                      alignItems: 'center',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid #F2F4F7',
                      borderLeft: `3px solid ${tone.bar}`,
                      marginBottom: 8,
                      background: item.risk === 'overdue' ? '#FFF7F7' : tone.bg,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2937', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Tag label={item.type} />
                        {item.note && <Tag label={item.note} color={tone.tag} />}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: item.risk === 'overdue' ? '#C73A3A' : '#344054', fontWeight: item.risk === 'overdue' ? 700 : 500, lineHeight: 1.5 }}>
                      {item.deadline}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#344054', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.assignee}</div>
                      <div style={{ fontSize: 12, color: '#667085', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.lastAction}</div>
                    </div>
                    <div>
                      <Tag label={tone.label} color={tone.tag} />
                    </div>
                    <div>
                      <Button
                        size="sm"
                        variant="outline"
                        iconAfter={<ChevronRight size={13} />}
                        onClick={() => navigate(item.target)}
                      >
                        {item.actionLabel}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const filingStatusTag: Record<string, 'info'> = {
  '未备案': 'info',
};

const filingActionTag: Record<string, 'danger'> = {
  '催补备案': 'danger',
};

function RepFilingAnalysisPanel() {
  const { summary, top } = repFilingAnalysis;
  const tone = toneStyles.info;
  const cols = '80px minmax(0, 1fr) 84px 92px';

  return (
    <section style={sectionCardStyle({ padding: '12px 16px' })}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1F2937' }}>备案异常分析</h2>
        <span style={{ fontSize: 12, color: '#667085' }}>未备案专员的推广提交将被自动拦截</span>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div
          style={{
            flexShrink: 0,
            padding: '10px 16px',
            borderRadius: 10,
            background: tone.bg,
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 12, color: tone.fg, fontWeight: 600 }}>未备案专员</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#1F2937', lineHeight: 1 }}>{summary.unfiled}</span>
          <span style={{ fontSize: 12, color: tone.fg }}>人</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              gap: 10,
              padding: '0 0 6px',
              fontSize: 12,
              color: '#98A2B3',
              fontWeight: 600,
            }}
          >
            <span>专员</span>
            <span>所属服务商</span>
            <span>备案状态</span>
            <span>动作</span>
          </div>
          {top.map(item => (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gridTemplateColumns: cols,
                gap: 10,
                alignItems: 'center',
                padding: '6px 0',
                borderTop: '1px solid #F2F4F7',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: '#344054' }}>{item.name}</span>
              <span style={{ fontSize: 13, color: '#667085', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.provider}</span>
              <span><Tag label={item.status} color={filingStatusTag[item.status]} /></span>
              <span><Tag label={item.action} color={filingActionTag[item.action]} /></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComplianceAdminDashboard({
  data,
  navigate,
  insights,
  feedbacks,
  onDismissInsight,
  onInsightFeedback,
}: {
  data: DashboardRoleData;
  navigate: (page: PageId) => void;
  insights: DashboardRoleData['insights'];
  feedbacks: Record<string, 'valid' | 'false-positive'>;
  onDismissInsight: (id: string) => void;
  onInsightFeedback: (id: string, feedback: 'valid' | 'false-positive') => void;
}) {
  const filingRef = useRef<HTMLDivElement>(null);
  const wrappedNavigate = (page: PageId) => {
    if (page === 'dashboard') {
      filingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    navigate(page);
  };

  const summaryParts = [
    '专员备案（人·资质）',
    '供应商准入/资质（供应商·资质）',
    '待随检任务（行为·过程）',
    '证据链 AI 存疑（证据·事后审核）',
  ];

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 页头 */}
      <section style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1F2937' }}>{data.headline}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#667085', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            合规管控生命周期：{summaryParts.join(' → ')}
          </p>
        </div>
        <div style={{ flexShrink: 0, fontSize: 12, color: '#667085', whiteSpace: 'nowrap' }}>AI 仅供参考，操作需人工确认</div>
      </section>

      {/* KPI 行：四张对象卡 */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {data.metrics.map(metric => (
          <MetricCard
            key={metric.id}
            title={metric.title}
            value={metric.value}
            unit={metric.unit}
            subtitle={metric.subtitle}
            icon={getMetricIcon(metric)}
            iconColor={metric.iconColor}
            iconBg={metric.iconBg}
            urgency={metric.urgency}
            source={metric.source}
            compact
            onClick={() => wrappedNavigate(metric.target)}
          />
        ))}
      </section>

      {/* AI 洞察：完整六要素卡 */}
      {insights.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} color="#176B5B" />
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1F2937' }}>AI 洞察</h2>
              <span style={{ padding: '2px 8px', borderRadius: 999, background: '#E8F4F1', color: '#176B5B', fontSize: 12, fontWeight: 700 }}>
                {insights.length} 条
              </span>
            </div>
            <span style={{ fontSize: 12, color: '#98A2B3' }}>每条均含结论 / 依据 / 数据范围 / 置信度 / 建议动作 / 人工确认</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.map(insight => (
              <AIInsightCard
                key={insight.id}
                {...insight}
                feedback={feedbacks[insight.id]}
                onAction={() => wrappedNavigate(insight.target)}
                onDismiss={onDismissInsight}
                onFeedback={onInsightFeedback}
              />
            ))}
          </div>
        </section>
      )}

      {/* 主行：优先处理队列 + 右侧快捷入口 */}
      <section style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ComplianceQueuePanel items={data.queue} navigate={wrappedNavigate} />
        </div>
        <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <section style={sectionCardStyle({ padding: '12px 16px', display: 'flex', flexDirection: 'column' })}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 700, color: '#1F2937' }}>快捷入口</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.quickActions.map(item => (
                <button
                  key={item.id}
                  onClick={() => wrappedNavigate(item.target)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>{item.description}</div>
                  </div>
                  <ArrowRight size={14} color="#9CA3AF" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </section>

      {/* 备案异常分析区块：专员异常备案卡下钻定位 */}
      <div ref={filingRef} style={{ scrollMarginTop: 8 }}>
        <RepFilingAnalysisPanel />
      </div>

      {/* 底部分析区：四对象分布 + 重点对象 */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        {data.distribution && <StatListPanel title={data.distribution.title} items={data.distribution.items} />}
        {data.spotlight && <StatListPanel title={data.spotlight.title} items={data.spotlight.items} />}
      </section>
    </div>
  );
}

export function Dashboard({
  navigate,
  role,
  addToast,
}: {
  navigate: (page: PageId) => void;
  role: Role;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}) {
  const data = useMemo(() => getRoleDashboardData(role), [role]);
  const [dismissedInsights, setDismissedInsights] = useState<string[]>([]);
  const [feedbacks, setFeedbacks] = useState<Record<string, 'valid' | 'false-positive'>>({});
  const isSalesAdmin = role === '药厂销售部门';
  const isComplianceAdmin = role === '药厂合规部门';
  const visibleInsights = data.insights
    .filter(item => !dismissedInsights.includes(item.id))
    .sort((a, b) => insightOrder[a.severity] - insightOrder[b.severity]);
  const promoteQuickActions = isSalesAdmin || isComplianceAdmin;
  const hideTrend = isSalesAdmin || isComplianceAdmin;
  const hideRecentOperations = isSalesAdmin || isComplianceAdmin;
  const hideDistribution = isComplianceAdmin;
  const prioritizeQueue = isSalesAdmin;

  useEffect(() => {
    setDismissedInsights([]);
    setFeedbacks({});
  }, [role, data.insights]);

  if (isComplianceAdmin) {
    return (
      <ComplianceAdminDashboard
        data={data}
        navigate={navigate}
        insights={visibleInsights}
        feedbacks={feedbacks}
        onDismissInsight={id => setDismissedInsights(prev => [...prev, id])}
        onInsightFeedback={(id, feedback) => setFeedbacks(prev => ({ ...prev, [id]: feedback }))}
      />
    );
  }

  if (isSalesAdmin && data.salesWorkbench) {
    return <SalesWorkbenchDashboard key={role} workbench={data.salesWorkbench} navigate={navigate} />;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1480 }}>
      <section
        style={{
          ...sectionCardStyle(),
          padding: 20,
          marginBottom: 16,
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FBFA 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <Tag label={data.role} color="brand" />
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1F2937' }}>{data.headline}</h1>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: '#667085', lineHeight: 1.7 }}>{data.subtitle}</p>
          </div>
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              minWidth: 280,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#176B5B', marginBottom: 6 }}>AI 呈现规范</div>
            <div style={{ fontSize: 12, color: '#667085', lineHeight: 1.7 }}>
              AI 仅提供参考，所有动作都需要人工确认；AI 不会自动改变任何单据状态。
            </div>
          </div>
        </div>
      </section>

      {data.taskList && (
        <div style={{ marginBottom: 16 }}>
          <TaskListPanel items={data.taskList} navigate={navigate} />
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: data.metrics.length >= 6 ? 'repeat(4, minmax(0, 1fr))' : `repeat(${Math.min(data.metrics.length, 5)}, minmax(0, 1fr))`,
          gap: 16,
          marginBottom: 16,
        }}
      >
        {data.metrics.map(metric => {
          const Icon = getMetricIcon(metric);
          return (
            <MetricCard
              key={metric.id}
              title={metric.title}
              value={metric.value}
              unit={metric.unit}
              delta={metric.delta}
              deltaLabel={metric.deltaLabel}
              subtitle={metric.subtitle}
              icon={Icon}
              iconColor={metric.iconColor}
              iconBg={metric.iconBg}
              urgency={metric.urgency}
              onClick={() => navigate(metric.target)}
            />
          );
        })}
      </div>

      {promoteQuickActions && (
        <div style={{ marginBottom: 16 }}>
          <QuickActionsPanel items={data.quickActions} navigate={navigate} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {prioritizeQueue && <QueueTable items={data.queue} navigate={navigate} />}

          {visibleInsights.length > 0 && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1F2937' }}>AI 洞察</h2>
                  <span style={{ padding: '2px 8px', borderRadius: 999, background: '#E8F4F1', color: '#176B5B', fontSize: 12, fontWeight: 700 }}>
                    {visibleInsights.length} 条
                  </span>
                </div>
                <span style={{ fontSize: 12, color: '#98A2B3' }}>每条均含结论 / 依据 / 数据范围 / 置信度 / 建议动作 / 人工确认</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {visibleInsights.map(insight => (
                  <AIInsightCard
                    key={insight.id}
                          {...insight}
                          feedback={feedbacks[insight.id]}
                          onAction={() => navigate(insight.target)}
                          onDismiss={id => setDismissedInsights(prev => [...prev, id])}
                          onFeedback={(id, feedback) => setFeedbacks(prev => ({ ...prev, [id]: feedback }))}
                  />
                ))}
              </div>
            </section>
          )}

          {!hideTrend && <TrendPanel data={data.trend} />}

          {data.comparisonTable && <ComparisonTablePanel data={data.comparisonTable} />}

          {!prioritizeQueue && <QueueTable items={data.queue} navigate={navigate} />}

          {!promoteQuickActions && <QuickActionsPanel items={data.quickActions} navigate={navigate} />}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!hideRecentOperations && <RecentOperationsPanel items={data.recentOperations} navigate={navigate} />}
          {data.ranking && <StatListPanel title={data.ranking.title} items={data.ranking.items} />}
          {!hideDistribution && data.distribution && <StatListPanel title={data.distribution.title} items={data.distribution.items} />}
          {data.spotlight && <StatListPanel title={data.spotlight.title} items={data.spotlight.items} />}
          <div style={{ ...sectionCardStyle({ background: '#F9FAFB' }) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: '#667085', marginBottom: 8 }}>
              <TrendingUp size={14} />
              审计提示
            </div>
            <div style={{ fontSize: 13, color: '#475467', lineHeight: 1.7 }}>
              最近操作保留审计视角，消息待办保留行动视角，两者分开呈现，避免“发生了什么”和“接下来做什么”混在一起。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

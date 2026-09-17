import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, DragEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject, SetStateAction } from 'react';
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
  GripVertical,
  LayoutGrid,
  Maximize2,
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
import { getRoleDashboardData, getPlatformWorkbenchData, repFilingAnalysis } from '../data/mockData';
import { reconStatusDisplay, taskStatusDisplay } from '../constants';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import { usePermission } from '../context/PermissionContext';
import { RESOURCE_PAGES } from '../data/permissions';
import type { SectionSize, SectionSizeSpec } from '../utils/dashboardGrid';
import { GRID_COLUMNS, applyMove, clampSize, packLayout, sizeSpec } from '../utils/dashboardGrid';
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
  brand: { fg: 'var(--color-brand)', bg: 'var(--color-brand-subtle)', bar: 'var(--color-brand)' },
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
    border: '1px solid var(--color-border)',
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
    <section style={sectionCardStyle({ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' })}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--fs-15)', fontWeight: 700, color: 'var(--color-text-1)' }}>{title}</h2>
          {subtitle && <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-12)', color: '#667085' }}>{subtitle}</p>}
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
              color: 'var(--color-brand)',
              fontSize: 'var(--fs-13)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {actionLabel} <ArrowRight size={13} />
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16, alignItems: 'center' }}>
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
            <polyline fill="none" style={{ stroke: "var(--color-brand)" }} strokeWidth="3" points={points} />
            {data.points.map((point, index) => {
              const x = data.points.length === 1 ? width / 2 : (index * (width - 32)) / (data.points.length - 1) + 16;
              const y = height - (point.value / max) * 124 - 24;
              return (
                <g key={point.label}>
                  <circle cx={x} cy={y} r="5" style={{ fill: "var(--color-brand)" }} />
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
                <div style={{ fontSize: 'var(--fs-12)', color: tone.fg, fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 'var(--fs-22)', fontWeight: 700, color: 'var(--color-text-1)', lineHeight: 1 }}>{item.value}</div>
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
                  <div style={{ fontSize: 'var(--fs-13)', color: '#344054', fontWeight: 600 }}>{item.label}</div>
                  {item.hint && <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 2 }}>{item.hint}</div>}
                </div>
                <span
                  style={{
                    alignSelf: 'flex-start',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 'var(--fs-12)',
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
              <th style={{ padding: '0 0 10px', textAlign: 'left', fontSize: 'var(--fs-12)', color: '#98A2B3', fontWeight: 600 }}>队伍</th>
              {data.columns.map(column => (
                <th key={column} style={{ padding: '0 0 10px', textAlign: 'left', fontSize: 'var(--fs-12)', color: '#98A2B3', fontWeight: 600 }}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => {
              const tone = toneStyles[row.tone || 'neutral'];
              return (
                <tr key={row.name}>
                  <td style={{ padding: '12px 0', borderTop: '1px solid #F2F4F7', fontSize: 'var(--fs-13)', color: '#344054', fontWeight: 600 }}>{row.name}</td>
                  {row.values.map(value => (
                    <td key={`${row.name}-${value}`} style={{ padding: '12px 0', borderTop: '1px solid #F2F4F7' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 'var(--fs-12)', fontWeight: 700, background: tone.bg, color: tone.fg }}>
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
  viewAllTarget = 'task-dispatch',
}: {
  items: DashboardRoleData['queue'];
  navigate: (page: PageId) => void;
  /** 系统角色工作台没有任务视图页时隐藏「查看全部」跳转 */
  viewAllTarget?: PageId | null;
}) {
  const sorted = [...items].sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  return (
    <SectionCard
      title="优先处理队列"
      subtitle="排序保持：逾期 > 风险 > 关注 > 正常"
      actionLabel={viewAllTarget ? '查看全部' : undefined}
      onAction={viewAllTarget ? () => navigate(viewAllTarget) : undefined}
    >
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 760 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.3fr 130px 150px 120px 110px',
              padding: '0 0 10px',
              fontSize: 'var(--fs-12)',
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
                <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)', marginBottom: 4 }}>{item.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <Tag label={item.type} />
                  {item.note && <Tag label={item.note} color={item.risk === 'overdue' ? 'danger' : item.risk === 'risk' ? 'warning' : 'info'} />}
                </div>
              </div>
              <div style={{ fontSize: 'var(--fs-13)', color: item.risk === 'overdue' ? '#C73A3A' : '#344054', fontWeight: item.risk === 'overdue' ? 700 : 500 }}>
                {item.deadline}
              </div>
              <div>
                <div style={{ fontSize: 'var(--fs-13)', color: '#344054', fontWeight: 600 }}>{item.assignee}</div>
                <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 2 }}>{item.lastAction}</div>
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
                fontSize: 'var(--fs-12)',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {item.user.slice(0, 1)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--fs-13)', color: '#344054' }}>
                <strong style={{ color: item.color }}>{item.action}</strong>
                <span style={{ color: '#667085' }}> · {item.target}</span>
              </div>
              <div style={{ fontSize: 'var(--fs-12)', color: '#98A2B3', marginTop: 2 }}>{item.user} · {item.time}</div>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 10, alignContent: 'start' }}>
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => navigate(item.target)}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              background: '#FFFFFF',
              padding: 12,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 'var(--fs-13)', color: 'var(--color-text-1)', fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 'var(--fs-12)', color: '#667085', lineHeight: 1.5 }}>{item.description}</div>
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
                  <div style={{ fontSize: 'var(--fs-14)', color: 'var(--color-text-1)', fontWeight: 700 }}>{item.title}</div>
                  {reminder && (
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 'var(--fs-11)', fontWeight: 700, color: reminder.fg, background: reminder.bg }}>
                      {reminder.label}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--fs-13)', color: '#667085', marginBottom: 6 }}>{item.summary}</div>
                <div style={{ fontSize: 'var(--fs-12)', color: '#98A2B3' }}>{item.time}</div>
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

// ─── 药厂统一工作台：销售运营 + 合规风险（板块可配置） ────────────────────
// 依据《药厂销售部门首页优化文档 V1.0》与工作台统一决策：
// 待办/关注分离、任务交付概览 + 聚合、指标口径修正（执行中≠完成进度、
// 里程碑判延误、金额分阶段）、AI 五段式紧凑入口、颜色纪律（常态无红框）。

const PERIOD_RANGES: Record<WorkbenchPeriod, { start: string; end: string; label: string }> = {
  本周: { start: '2026-08-24', end: '2026-08-30', label: '08-24 ~ 08-30' },
  本月: { start: '2026-08-01', end: '2026-08-31', label: '08-01 ~ 08-31' },
  本季度: { start: '2026-07-01', end: '2026-09-30', label: '07-01 ~ 09-30' },
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
          border: `1px solid ${selected.length > 0 ? 'var(--color-brand)' : '#D1D5DB'}`,
          background: selected.length > 0 ? 'var(--color-brand-subtle)' : '#FFFFFF',
          color: selected.length > 0 ? 'var(--color-brand)' : '#374151',
          fontSize: 'var(--fs-12)',
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
              border: '1px solid var(--color-border)',
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
                  fontSize: 'var(--fs-13)',
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
                fontSize: 'var(--fs-12)',
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
  const toneFg = tone === 'warning' ? '#C77A16' : tone === 'brand' ? 'var(--color-brand)' : '#1F2937';
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 10,
        border: `1px solid ${active ? 'var(--color-brand)' : '#F2F4F7'}`,
        background: active ? 'var(--color-brand-subtle)' : '#FFFFFF',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{ fontSize: 'var(--fs-12)', color: '#667085', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 'var(--fs-18)', fontWeight: 700, color: toneFg, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{value}</span>
      {hint && <span style={{ fontSize: 'var(--fs-11)', color: '#98A2B3', whiteSpace: 'nowrap' }}>{hint}</span>}
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
    <section style={sectionCardStyle({ padding: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' })}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px 8px', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--fs-15)', fontWeight: 700, color: 'var(--color-text-1)' }}>我的待办</h2>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-12)', color: '#667085' }}>全部未完成，含历史事项 · 按逾期与到期时间排序</p>
        </div>
      </div>
      <div ref={listRef} style={{ padding: '0 16px 14px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {todos.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 'var(--fs-13)', color: '#98A2B3' }}>当前筛选范围内暂无待办事项</div>
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
                  <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {todo.taskName}
                  </span>
                  <Tag label={todo.docType} />
                </div>
                <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 4 }}>{todo.reason}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 'var(--fs-12)' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-12)', color: '#98A2B3', paddingTop: 2 }}>
            <span>范围外仍有 {outOfScopeCount} 项待办</span>
            <button
              onClick={() => navigate('task-dispatch')}
              style={{ border: 'none', background: 'none', color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              查看全部
            </button>
          </div>
        )}
      </div>
    </section>
  );
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
  const taskCols = 'minmax(0, 1.9fr) minmax(0, 1.2fr) minmax(0, 1.15fr) 108px 100px 92px';
  const aggCols = 'minmax(0, 1.6fr) 120px 120px 130px 140px';
  const modes: { key: 'task' | 'region' | 'variety' | 'provider'; label: string }[] = [
    { key: 'task', label: '任务明细' },
    { key: 'region', label: '按区域' },
    { key: 'variety', label: '按品种' },
    { key: 'provider', label: '按服务提供方' },
  ];

  const displayed = showAll ? tasks : tasks.slice(0, 5);

  return (
    <section style={sectionCardStyle({ padding: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' })}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px 10px', flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--fs-15)', fontWeight: 700, color: 'var(--color-text-1)' }}>任务交付概览</h2>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-12)', color: '#667085' }}>
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
                fontSize: 'var(--fs-12)',
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
        <div style={{ padding: '0 16px 14px', flex: 1, minHeight: 0, overflow: 'auto' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 900 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: taskCols,
                  gap: 10,
                  padding: '0 12px 8px',
                  fontSize: 'var(--fs-12)',
                  color: '#98A2B3',
                  fontWeight: 600,
                  borderBottom: '1px solid #F2F4F7',
                }}
              >
                <span>任务 / 编号</span>
                <span>品种 / 区域</span>
                <span>服务提供方</span>
                <span>任务状态</span>
                <span>对账状态</span>
                <span>操作</span>
              </div>
              {tasks.length === 0 ? (
                <div style={{ padding: '28px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--fs-13)', color: '#667085', marginBottom: 10 }}>当前组合无匹配任务</div>
                  {hasFilter && (
                    <Button size="sm" variant="outline" onClick={onReset}>
                      <RotateCcw size={12} /> 重置筛选
                    </Button>
                  )}
                </div>
              ) : (
                <div style={{ paddingTop: 8 }}>
                  {displayed.map(task => {
                    const varietyExtra = task.varieties.length - 1;
                    const regionExtra = task.regions.length - 1;
                    const taskStatus = taskStatusDisplay(task.status, task.reconStatus);
                    const reconStatus = reconStatusDisplay(task.reconStatus);
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
                          <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {task.name}
                          </div>
                          <div style={{ fontSize: 'var(--fs-11)', color: '#98A2B3', marginTop: 2 }}>{task.taskNo}</div>
                        </div>
                        <div style={{ fontSize: 'var(--fs-12)', color: '#475467', lineHeight: 1.8, minWidth: 0 }}>
                          <div>
                            <button
                              onClick={() => onFilterVariety(task.varieties[0])}
                              style={{ border: 'none', background: 'none', padding: 0, color: 'var(--color-brand)', fontSize: 'var(--fs-12)', cursor: 'pointer', textAlign: 'left' }}
                            >
                              {task.varieties[0]}
                            </button>
                            {varietyExtra > 0 && <span style={{ color: '#98A2B3' }}> +{varietyExtra}</span>}
                          </div>
                          <div>
                            <button
                              onClick={() => onFilterRegion(task.regions[0])}
                              style={{ border: 'none', background: 'none', padding: 0, color: 'var(--color-brand)', fontSize: 'var(--fs-12)', cursor: 'pointer', textAlign: 'left' }}
                            >
                              {task.regions[0]}
                            </button>
                            {regionExtra > 0 && <span style={{ color: '#98A2B3' }}> +{regionExtra}</span>}
                          </div>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 'var(--fs-12)', color: '#344054', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.provider}</div>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <Tag label={taskStatus.label} color={taskStatus.color} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <Tag label={reconStatus.label} color={reconStatus.color} />
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
                      style={{ width: '100%', border: 'none', background: 'none', color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontWeight: 600, cursor: 'pointer', padding: '6px 0' }}
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
        <div style={{ padding: '0 16px 14px', flex: 1, minHeight: 0, overflow: 'auto' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 640 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: aggCols,
                  gap: 10,
                  padding: '0 12px 8px',
                  fontSize: 'var(--fs-12)',
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
                    fontSize: 'var(--fs-13)',
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
                  <div style={{ fontSize: 'var(--fs-13)', color: '#667085', marginBottom: 10 }}>当前组合无匹配任务</div>
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
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 16px 10px', flexShrink: 0 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'var(--color-brand)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Sparkles size={16} />
        </div>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-16)', fontWeight: 800, color: 'var(--color-text-1)' }}>AI 分析</h2>
        <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontWeight: 700 }}>
          基于最新业务数据
        </span>
        <span style={{ fontSize: 'var(--fs-11)', color: '#98A2B3' }}>生成时间 {ai.generatedAt} · 与业务数据截至时间分开</span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setExpanded(prev => !prev)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontWeight: 600, cursor: 'pointer' }}
        >
          {expanded ? '收起' : '展开分析'} <ChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 16px 12px', fontSize: 'var(--fs-14)', fontWeight: 600, color: 'var(--color-text-1)', lineHeight: 1.7 }}>{ai.summary}</div>
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
                <span style={{ padding: '2px 0', borderRadius: 6, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontWeight: 700, textAlign: 'center' }}>
                  {section.label}
                </span>
                <span style={{ fontSize: 'var(--fs-13)', color: '#475467', lineHeight: 1.7 }}>{section.content}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
              {ai.actions.map((action, index) => (
                <Button key={action.label} size="sm" variant={index === 0 ? 'primary' : 'outline'} onClick={() => navigate(action.target)}>
                  {action.label}
                </Button>
              ))}
            </div>
            <div style={{ fontSize: 'var(--fs-11)', color: '#98A2B3' }}>AI 仅提供参考，所有操作需人工确认；不自动改变任何单据状态。</div>
          </div>
        )}
      </div>
    </section>
  );
}

// 板块注册表：新增板块只需 ① 注册 sectionIds ② 在对应 SIZE_SPECS 声明尺寸规格
// （默认/最小/最大，列为 1~12、行为 1~N）③ 提供 render —— 网格摆放、拖拽、
// 缩放、持久化全部由 SectionBoard + useDashboardLayout 承接，无需改动首页结构。
interface DashboardSectionDef {
  id: string;
  title: string;
  category: '销售' | '合规' | '通用';
  defaultVisible: boolean;
  render: () => ReactNode;
}

// 尺寸规格（列 × 行，行高见 SectionBoard rowHeight）：不同类型卡片各自的默认/最小/最大
const PHARMA_SIZE_SPECS: Record<string, SectionSizeSpec> = {
  summary: sizeSpec(12, 1, 6, 1, 12, 2),
  ai: sizeSpec(8, 6, 4, 3, 12, 16),
  'quick-actions': sizeSpec(4, 6, 3, 3, 8, 16),
  todos: sizeSpec(12, 5, 6, 3, 12, 16),
  'task-overview': sizeSpec(12, 6, 6, 4, 12, 16),
  'compliance-kpi': sizeSpec(12, 2, 6, 2, 12, 6),
  'compliance-queue': sizeSpec(12, 6, 5, 4, 12, 16),
  'filing-analysis': sizeSpec(12, 4, 6, 3, 12, 16),
  distribution: sizeSpec(6, 5, 4, 3, 12, 16),
  spotlight: sizeSpec(12, 5, 6, 3, 12, 16),
};

const PROVIDER_SIZE_SPECS: Record<string, SectionSizeSpec> = {
  metrics: sizeSpec(12, 2, 6, 2, 12, 8),
  queue: sizeSpec(7, 6, 5, 4, 12, 16),
  ai: sizeSpec(5, 6, 4, 4, 12, 16),
  trend: sizeSpec(7, 4, 5, 3, 12, 16),
  ranking: sizeSpec(5, 4, 4, 3, 12, 16),
  'quick-actions': sizeSpec(12, 3, 4, 2, 12, 8),
  spotlight: sizeSpec(12, 4, 6, 3, 12, 16),
  'recent-operations': sizeSpec(6, 4, 4, 3, 12, 16),
  'audit-tip': sizeSpec(12, 2, 6, 1, 12, 6),
};

const PHARMA_SECTION_IDS = [
  'summary',
  'ai',
  'quick-actions',
  'todos',
  'task-overview',
  'compliance-kpi',
  'compliance-queue',
  'filing-analysis',
  'distribution',
  'spotlight',
];
const PHARMA_DEFAULT_HIDDEN = ['filing-analysis', 'distribution', 'spotlight'];

const PROVIDER_SECTION_IDS = [
  'metrics',
  'queue',
  'ai',
  'trend',
  'ranking',
  'quick-actions',
  'spotlight',
  'recent-operations',
  'audit-tip',
];
const PROVIDER_DEFAULT_HIDDEN = ['recent-operations', 'audit-tip'];

// 系统管理角色工作台板块（无业务趋势/排名语义，聚焦管理事项）
const PLATFORM_SIZE_SPECS: Record<string, SectionSizeSpec> = {
  metrics: sizeSpec(12, 2, 6, 2, 12, 8),
  queue: sizeSpec(7, 6, 5, 4, 12, 16),
  ai: sizeSpec(5, 6, 4, 4, 12, 16),
  'quick-actions': sizeSpec(12, 3, 4, 2, 12, 8),
  spotlight: sizeSpec(12, 4, 6, 3, 12, 16),
  'recent-operations': sizeSpec(6, 4, 4, 3, 12, 16),
  'audit-tip': sizeSpec(12, 2, 6, 1, 12, 6),
};

const PLATFORM_SECTION_IDS = [
  'metrics',
  'queue',
  'ai',
  'quick-actions',
  'spotlight',
  'recent-operations',
  'audit-tip',
];
const PLATFORM_DEFAULT_HIDDEN = ['recent-operations', 'audit-tip'];

function LayoutCustomizeButton({ editing, onToggle }: { editing: boolean; onToggle: () => void }) {
  return (
    <Button variant={editing ? 'primary' : 'outline'} size="sm" icon={<LayoutGrid size={14} />} onClick={onToggle}>
      {editing ? '完成' : '自定义板块'}
    </Button>
  );
}

function LayoutEditBanner({ onReset }: { onReset: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 14px',
        background: 'var(--color-brand-subtle)',
        border: '1px dashed var(--color-border)',
        borderRadius: 8,
      }}
    >
      <span style={{ fontSize: 'var(--fs-13)', color: '#475467' }}>
        拖拽卡片调整位置 · 拖动卡片右缘/下缘/右下角调整大小 · 勾选控制板块显示 · 按 Esc 退出
      </span>
      <Button variant="outline" size="sm" onClick={onReset}>
        恢复默认
      </Button>
    </div>
  );
}

type ResizeEdge = 'e' | 's' | 'se';

function SectionShell({
  section,
  size,
  position,
  editing,
  hidden,
  dragging,
  resizing,
  shellRef,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onResizeStart,
}: {
  section: DashboardSectionDef;
  size: SectionSize;
  position: { x: number; y: number };
  editing: boolean;
  hidden: boolean;
  dragging: boolean;
  resizing: boolean;
  shellRef?: (el: HTMLDivElement | null) => void;
  onToggle: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onResizeStart: (e: ReactPointerEvent<HTMLDivElement>, edge: ResizeEdge) => void;
}) {
  const strip = editing && hidden;
  // 编辑模式下工具条（拖拽把手/显示勾选）占卡片顶部约 30px：
  // Shell 变为 flex 列让工具条真实占位，内容区吃剩余高度，保证内容不溢出压到下一张卡；
  // 因此编辑模式可见卡至少占 2 行（与 SectionBoard 的 effective 高度提升保持一致）。
  const editingCard = editing && !strip;
  return (
    <div
      ref={shellRef}
      className="dashboard-section-shell"
      data-section-id={section.id}
      draggable={editing}
      onDragStart={
        editing
          ? e => {
              const target = e.target as HTMLElement;
              if (target.closest('input, label, button, [data-no-drag]')) {
                e.preventDefault();
                return;
              }
              onDragStart(e);
            }
          : undefined
      }
      onDragOver={editing ? onDragOver : undefined}
      onDrop={editing ? onDrop : undefined}
      onDragEnd={editing ? onDragEnd : undefined}
      style={{
        minWidth: 0,
        position: 'relative',
        display: editingCard ? 'flex' : undefined,
        flexDirection: editingCard ? 'column' : undefined,
        gridColumn: strip ? '1 / -1' : `${position.x + 1} / span ${size.w}`,
        gridRow: `span ${strip ? 1 : editing ? Math.max(size.h, 2) : size.h}`,
        opacity: dragging ? 0.4 : editing && hidden ? 0.55 : 1,
        borderRadius: 12,
        border: editing ? '1px dashed var(--color-border)' : '1px solid transparent',
        background: editing ? '#FFFFFF' : undefined,
        outline: resizing ? '2px solid var(--color-brand)' : undefined,
        outlineOffset: resizing ? 1 : undefined,
        cursor: editing ? 'grab' : undefined,
        userSelect: editing ? 'none' : undefined,
        scrollMarginTop: 8,
      }}
    >
      {editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 4px', flexShrink: 0 }}>
          <span
            title="拖拽调整顺序"
            aria-label="拖拽调整顺序"
            style={{ display: 'inline-flex', color: '#98A2B3', cursor: 'grab', flexShrink: 0 }}
          >
            <GripVertical size={16} aria-hidden />
          </span>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--fs-12)',
              color: '#344054',
              cursor: 'pointer',
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <input type="checkbox" checked={!hidden} onChange={onToggle} />
            显示
          </label>
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 'var(--fs-11)',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#F3F4F6',
              color: '#667085',
            }}
          >
            {section.category}
          </span>
        </div>
      )}
      {editing && hidden ? (
        <div style={{ padding: '2px 12px 6px', fontSize: 'var(--fs-14)', fontWeight: 600, color: 'var(--color-text-1)' }}>
          {section.title}
        </div>
      ) : (
        <div
          style={
            editingCard
              ? { pointerEvents: 'none', flex: 1, minHeight: 0 }
              : { pointerEvents: editing ? 'none' : undefined, height: '100%' }
          }
        >
          {section.render()}
        </div>
      )}
      {editing && !hidden && (
        <>
          <div
            data-no-drag
            className="dsb-resize"
            title="拖动调整宽度"
            onPointerDown={e => onResizeStart(e, 'e')}
            style={{ position: 'absolute', top: 28, bottom: 28, right: -5, width: 10, cursor: 'ew-resize', zIndex: 20, touchAction: 'none', borderRadius: 5 }}
          />
          <div
            data-no-drag
            className="dsb-resize"
            title="拖动调整高度"
            onPointerDown={e => onResizeStart(e, 's')}
            style={{ position: 'absolute', left: 28, right: 28, bottom: -5, height: 10, cursor: 'ns-resize', zIndex: 20, touchAction: 'none', borderRadius: 5 }}
          />
          <div
            data-no-drag
            title="拖动调整大小"
            onPointerDown={e => onResizeStart(e, 'se')}
            style={{
              position: 'absolute',
              right: -7,
              bottom: -7,
              width: 24,
              height: 24,
              cursor: 'nwse-resize',
              zIndex: 21,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'none',
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                background: '#FFFFFF',
                border: '1px solid var(--color-border)',
                color: 'var(--color-brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(16, 24, 40, 0.18)',
              }}
            >
              <Maximize2 size={10} />
            </span>
          </div>
        </>
      )}
    </div>
  );
}

const FALLBACK_SECTION_SPEC = sizeSpec(12, 4, 2, 2);

function SectionBoard({
  sections,
  order,
  hidden,
  toggleVisible,
  moveSection,
  setSize,
  sizes,
  specs,
  editing,
  onExitEdit,
  gap = 12,
  rowHeight = 64,
  sectionRefs,
}: {
  sections: DashboardSectionDef[];
  order: string[];
  hidden: string[];
  toggleVisible: (id: string) => void;
  moveSection: (fromId: string, toId: string, after?: boolean) => void;
  setSize: (id: string, size: SectionSize) => void;
  sizes: Record<string, SectionSize>;
  specs: Record<string, SectionSizeSpec>;
  editing: boolean;
  onExitEdit: () => void;
  gap?: number;
  rowHeight?: number;
  sectionRefs?: RefObject<Record<string, HTMLDivElement | null>>;
}) {
  const defById = useMemo(() => new Map(sections.map(section => [section.id, section])), [sections]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; overId: string; place: 'before' | 'after' } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; w: number; h: number } | null>(null);
  const dragIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDrag(null);
      setResizing(null);
      dragIdRef.current = null;
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExitEdit();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, onExitEdit]);

  // 有效尺寸 = 已保存尺寸（按规格钳制）+ 缩放中的实时预览；
  // 坐标由 packLayout 从「顺序 + 尺寸」推导，因此拖拽/缩放过程中其余卡片实时避让，不会重叠。
  const layout = useMemo(() => {
    const effective: Record<string, SectionSize> = {};
    for (const id of order) {
      const spec = specs[id] ?? FALLBACK_SECTION_SPEC;
      const saved = sizes[id] ?? { w: spec.w, h: spec.h };
      effective[id] = editing && hidden.includes(id) ? { w: GRID_COLUMNS, h: 1 } : clampSize(saved, spec);
    }
    if (resizing) effective[resizing.id] = { w: resizing.w, h: resizing.h };
    // 编辑模式可见卡至少占 2 行给工具条留位（与 SectionShell 的显示 span 一致）
    if (editing) {
      for (const id of order) {
        if (!hidden.includes(id) && effective[id].h < 2) effective[id] = { ...effective[id], h: 2 };
      }
    }
    const sequence = editing ? order : order.filter(id => !hidden.includes(id));
    const arranged = drag ? applyMove(sequence, drag.id, drag.overId, drag.place === 'after') : sequence;
    return { arranged, sizes: effective, positions: packLayout(arranged, effective) };
  }, [order, hidden, sizes, specs, editing, drag, resizing]);

  const beginResize = (id: string, e: ReactPointerEvent<HTMLDivElement>, edge: ResizeEdge) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const spec = specs[id] ?? FALLBACK_SECTION_SPEC;
    const start = (resizing?.id === id ? { w: resizing.w, h: resizing.h } : sizes[id]) ?? { w: spec.w, h: spec.h };
    const colStep = (container.clientWidth + gap) / GRID_COLUMNS;
    const rowStep = rowHeight + gap;
    const startX = e.clientX;
    const startY = e.clientY;
    let latest: { id: string; w: number; h: number } | null = resizing?.id === id ? resizing : null;

    const handleMove = (ev: PointerEvent) => {
      const next = clampSize(
        {
          w: edge === 's' ? start.w : start.w + Math.floor((ev.clientX - startX) / colStep),
          h: edge === 'e' ? start.h : start.h + Math.floor((ev.clientY - startY) / rowStep),
        },
        spec,
      );
      latest = { id, ...next };
      setResizing(latest);
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setResizing(null);
      if (latest) setSize(latest.id, { w: latest.w, h: latest.h });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const commitDrag = () => {
    if (drag) moveSection(drag.id, drag.overId, drag.place === 'after');
    setDrag(null);
    dragIdRef.current = null;
  };

  return (
    <>
      <style>{`
        @media (max-width: 960px) {
          .dashboard-section-grid { grid-auto-rows: auto !important; }
          .dashboard-section-shell { grid-column: 1 / -1 !important; grid-row: auto !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dashboard-section-shell { transition: none !important; }
        }
        .dsb-resize { transition: background 120ms ease; }
        .dsb-resize:hover { background: rgba(16, 185, 129, 0.22); }
      `}</style>
      <div
        ref={containerRef}
        className="dashboard-section-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
          gridAutoRows: rowHeight,
          gap,
          position: 'relative',
        }}
        onDragOver={editing ? e => e.preventDefault() : undefined}
        onDrop={
          editing
            ? e => {
                e.preventDefault();
                commitDrag();
              }
            : undefined
        }
      >
        {layout.arranged.map(id => {
          const section = defById.get(id);
          if (!section) return null;
          const spec = specs[id] ?? FALLBACK_SECTION_SPEC;
          return (
            <SectionShell
              key={id}
              section={section}
              size={layout.sizes[id] ?? { w: spec.w, h: spec.h }}
              position={layout.positions[id] ?? { x: 0, y: 0 }}
              editing={editing}
              hidden={hidden.includes(id)}
              dragging={drag?.id === id}
              resizing={resizing?.id === id}
              shellRef={el => {
                if (sectionRefs) sectionRefs.current[id] = el;
              }}
              onToggle={() => toggleVisible(id)}
              onDragStart={e => {
                dragIdRef.current = id;
                e.dataTransfer.setData('text/plain', id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const fromId = dragIdRef.current;
                if (!fromId || fromId === id) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const place = e.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
                setDrag(prev =>
                  prev && prev.id === fromId && prev.overId === id && prev.place === place ? prev : { id: fromId, overId: id, place },
                );
              }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                commitDrag();
              }}
              onDragEnd={() => {
                setDrag(null);
                dragIdRef.current = null;
              }}
              onResizeStart={(e, edge) => beginResize(id, e, edge)}
            />
          );
        })}
      </div>
    </>
  );
}

function PharmaWorkbenchDashboard({ navigate }: { navigate: (page: PageId) => void }) {
  const salesData = useMemo(() => getRoleDashboardData('药厂销售部门'), []);
  const complianceData = useMemo(() => getRoleDashboardData('药厂合规部门'), []);
  const workbench = salesData.salesWorkbench;
  const layout = useDashboardLayout('pharma', PHARMA_SECTION_IDS, PHARMA_DEFAULT_HIDDEN, PHARMA_SIZE_SPECS);
  const [editing, setEditing] = useState(false);
  const exitEdit = useCallback(() => setEditing(false), []);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hiddenRef = useRef(layout.hidden);
  hiddenRef.current = layout.hidden;

  const [period, setPeriod] = useState<WorkbenchPeriod>('本月');
  const [selVarieties, setSelVarieties] = useState<string[]>([]);
  const [selRegions, setSelRegions] = useState<string[]>([]);
  const [selProviders, setSelProviders] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'执行中' | '异常' | null>(null);
  const [aggMode, setAggMode] = useState<'task' | 'region' | 'variety' | 'provider'>('task');
  const todoListRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (id: string) => {
    if (hiddenRef.current.includes(id)) return;
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const tasks = workbench?.tasks ?? [];
  const todos = workbench?.todos ?? [];

  const hasFilter = selVarieties.length > 0 || selRegions.length > 0 || selProviders.length > 0;

  const resetFilters = () => {
    setSelVarieties([]);
    setSelRegions([]);
    setSelProviders([]);
    setStatusFilter(null);
  };

  const bizFiltered = useMemo(
    () =>
      tasks.filter(
        task =>
          (selVarieties.length === 0 || task.varieties.some(value => selVarieties.includes(value))) &&
          (selRegions.length === 0 || task.regions.some(value => selRegions.includes(value))) &&
          (selProviders.length === 0 || selProviders.includes(task.provider)),
      ),
    [tasks, selVarieties, selRegions, selProviders],
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
      todos
        .filter(todo => bizTaskNos.has(todo.taskId))
        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(!!b.dueToday) - Number(!!a.dueToday))
        .slice(0, 5),
    [todos, bizTaskNos],
  );
  const outOfScopeTodos = todos.length - todos.filter(todo => bizTaskNos.has(todo.taskId)).length;

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

  const sections: DashboardSectionDef[] = useMemo(
    () =>
      workbench
        ? [
            {
              id: 'summary',
              title: '运营摘要',
              category: '销售',
              defaultVisible: true,
              render: () => (
                <section style={{ ...sectionCardStyle({ padding: '10px 16px' }), display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', height: '100%', overflow: 'hidden' }}>
                  <span style={{ fontSize: 'var(--fs-12)', color: '#667085', fontWeight: 600, flexShrink: 0 }}>运营摘要</span>
                  <WorkbenchSummaryChip
                    label="执行中任务"
                    value={`${execCount} 项`}
                    active={statusFilter === '执行中'}
                    onClick={() => {
                      setStatusFilter(prev => (prev === '执行中' ? null : '执行中'));
                      scrollToSection('task-overview');
                    }}
                  />
                  <WorkbenchSummaryChip
                    label="异常任务"
                    value={anomalyCount > 0 ? `${anomalyCount} 项` : '暂无异常'}
                    tone={anomalyCount > 0 ? 'warning' : 'neutral'}
                    active={statusFilter === '异常'}
                    onClick={() => {
                      setStatusFilter(prev => (prev === '异常' ? null : '异常'));
                      scrollToSection('task-overview');
                    }}
                  />
                  <WorkbenchSummaryChip
                    label="待我处理"
                    value={`${todos.length} 项`}
                    hint="含历史事项"
                    tone="brand"
                    onClick={() => scrollToSection('todos')}
                  />
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 'var(--fs-11)', color: '#98A2B3' }}>执行中 ≠ 完成进度 · 异常按任务去重 · 待我处理按待办计数</span>
                </section>
              ),
            },
            {
              id: 'ai',
              title: 'AI 分析',
              category: '销售',
              defaultVisible: true,
              render: () => <WorkbenchAIPanel ai={workbench.ai} navigate={navigate} />,
            },
            {
              id: 'quick-actions',
              title: '常用入口',
              category: '销售',
              defaultVisible: true,
              render: () => (
                <section style={sectionCardStyle({ padding: '12px 16px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' })}>
                  <h2 style={{ margin: '0 0 10px', fontSize: 'var(--fs-14)', fontWeight: 700, color: 'var(--color-text-1)', flexShrink: 0 }}>常用入口</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
                          border: '1px solid var(--color-border)',
                          borderRadius: 8,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span>
                          <span style={{ display: 'block', fontSize: 'var(--fs-13)', fontWeight: 600, color: '#374151' }}>{item.label}</span>
                          <span style={{ display: 'block', fontSize: 'var(--fs-11)', color: '#667085', marginTop: 2 }}>{item.description}</span>
                        </span>
                        <ArrowRight size={14} color="#9CA3AF" />
                      </button>
                    ))}
                  </div>
                </section>
              ),
            },
            {
              id: 'todos',
              title: '我的待办',
              category: '销售',
              defaultVisible: true,
              render: () => (
                <WorkbenchTodoPanel todos={visibleTodos} outOfScopeCount={outOfScopeTodos} navigate={navigate} listRef={todoListRef} />
              ),
            },
            {
              id: 'task-overview',
              title: '任务交付概览',
              category: '销售',
              defaultVisible: true,
              render: () => (
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
              ),
            },
            {
              id: 'compliance-kpi',
              title: '合规对象监测',
              category: '合规',
              defaultVisible: true,
              render: () => (
                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10, alignContent: 'start', height: '100%', overflowY: 'auto' }}>
                  {complianceData.metrics.map(metric => (
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
                      onClick={() => {
                        if (metric.target === 'dashboard') {
                          scrollToSection('filing-analysis');
                          return;
                        }
                        navigate(metric.target);
                      }}
                    />
                  ))}
                </section>
              ),
            },
            {
              id: 'compliance-queue',
              title: '优先处理队列',
              category: '合规',
              defaultVisible: true,
              render: () => (
                <ComplianceQueuePanel
                  items={complianceData.queue}
                  navigate={page => {
                    if (page === 'dashboard') {
                      scrollToSection('filing-analysis');
                      return;
                    }
                    navigate(page);
                  }}
                />
              ),
            },
            {
              id: 'filing-analysis',
              title: '备案异常分析',
              category: '合规',
              defaultVisible: false,
              render: () => <RepFilingAnalysisPanel />,
            },
            {
              id: 'distribution',
              title: '对象维度分布',
              category: '合规',
              defaultVisible: false,
              render: () =>
                complianceData.distribution ? (
                  <StatListPanel title={complianceData.distribution.title} items={complianceData.distribution.items} />
                ) : null,
            },
            {
              id: 'spotlight',
              title: '重点对象',
              category: '合规',
              defaultVisible: false,
              render: () =>
                complianceData.spotlight ? <StatListPanel title={complianceData.spotlight.title} items={complianceData.spotlight.items} /> : null,
            },
          ]
        : [],
    [
      workbench,
      execCount,
      anomalyCount,
      statusFilter,
      todos.length,
      navigate,
      visibleTodos,
      outOfScopeTodos,
      overviewTasks,
      aggMode,
      aggRows,
      period,
      hasFilter,
      complianceData.metrics,
      complianceData.queue,
      complianceData.distribution,
      complianceData.spotlight,
    ],
  );

  if (!workbench) return null;

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {editing && <LayoutEditBanner onReset={layout.resetLayout} />}

      {/* 01 页面标题与范围 */}
      <section style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-22)', fontWeight: 800, color: 'var(--color-text-1)' }}>{workbench.headline}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-13)', color: '#667085' }}>
            覆盖销售运营与合规风险的一体化看板 · 数据截至 {workbench.dataAsOf} · 时区 Asia/Shanghai
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>AI 仅供参考，操作需人工确认</span>
          <LayoutCustomizeButton editing={editing} onToggle={() => setEditing(prev => !prev)} />
        </div>
      </section>

      {/* 全局筛选 */}
      <section style={{ ...sectionCardStyle({ padding: '10px 14px' }), display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-12)', color: '#667085', fontWeight: 600 }}>周期</span>
        {(Object.keys(PERIOD_RANGES) as WorkbenchPeriod[]).map(item => (
          <button
            key={item}
            onClick={() => setPeriod(item)}
            style={{
              border: `1px solid ${period === item ? 'var(--color-brand)' : '#E5E7EB'}`,
              background: period === item ? 'var(--color-brand-subtle)' : '#FFFFFF',
              color: period === item ? 'var(--color-brand)' : '#475467',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: 'var(--fs-12)',
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
        <span style={{ fontSize: 'var(--fs-12)', color: '#98A2B3' }}>{range.label}</span>
        {(hasFilter || statusFilter) && (
          <button
            onClick={resetFilters}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: '#98A2B3', fontSize: 'var(--fs-12)', cursor: 'pointer', padding: '4px 6px' }}
          >
            <RotateCcw size={12} /> 重置
          </button>
        )}
      </section>

      <SectionBoard
        sections={sections}
        order={layout.order}
        hidden={layout.hidden}
        toggleVisible={layout.toggleVisible}
        moveSection={layout.moveSection}
        setSize={layout.setSize}
        sizes={layout.sizes}
        specs={PHARMA_SIZE_SPECS}
        editing={editing}
        onExitEdit={exitEdit}
        gap={12}
        rowHeight={64}
        sectionRefs={sectionRefs}
      />
    </div>
  );
}

// ─── 药厂合规板块（迁入统一工作台注册表复用） ────────────────────
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
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px 10px', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--fs-15)', fontWeight: 700, color: 'var(--color-text-1)' }}>优先处理队列</h2>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-12)', color: '#667085' }}>
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
            color: 'var(--color-brand)',
            fontSize: 'var(--fs-13)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          查看全部 <ArrowRight size={13} />
        </button>
      </div>

      <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 760 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: cols,
                gap: 10,
                padding: '0 12px 8px',
                fontSize: 'var(--fs-12)',
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
                      <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Tag label={item.type} />
                        {item.note && <Tag label={item.note} color={tone.tag} />}
                      </div>
                    </div>
                    <div style={{ fontSize: 'var(--fs-12)', color: item.risk === 'overdue' ? '#C73A3A' : '#344054', fontWeight: item.risk === 'overdue' ? 700 : 500, lineHeight: 1.5 }}>
                      {item.deadline}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--fs-12)', color: '#344054', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.assignee}</div>
                      <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.lastAction}</div>
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
    <section style={sectionCardStyle({ padding: '12px 16px', height: '100%', overflow: 'auto' })}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-14)', fontWeight: 700, color: 'var(--color-text-1)' }}>备案异常分析</h2>
        <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>未备案专员的推广提交将被自动拦截</span>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
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
          <span style={{ fontSize: 'var(--fs-12)', color: tone.fg, fontWeight: 600 }}>未备案专员</span>
          <span style={{ fontSize: 'var(--fs-20)', fontWeight: 700, color: 'var(--color-text-1)', lineHeight: 1 }}>{summary.unfiled}</span>
          <span style={{ fontSize: 'var(--fs-12)', color: tone.fg }}>人</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              gap: 10,
              padding: '0 0 6px',
              fontSize: 'var(--fs-12)',
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
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: '#344054' }}>{item.name}</span>
              <span style={{ fontSize: 'var(--fs-13)', color: '#667085', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.provider}</span>
              <span><Tag label={item.status} color={filingStatusTag[item.status]} /></span>
              <span><Tag label={item.action} color={filingActionTag[item.action]} /></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


function ProviderWorkbenchDashboard({ navigate }: { navigate: (page: PageId) => void }) {
  const { principal } = usePermission();
  const data = useMemo(() => getRoleDashboardData('服务提供商'), []);
  const layout = useDashboardLayout('provider', PROVIDER_SECTION_IDS, PROVIDER_DEFAULT_HIDDEN, PROVIDER_SIZE_SPECS);
  const [editing, setEditing] = useState(false);
  const exitEdit = useCallback(() => setEditing(false), []);
  const [dismissedInsights, setDismissedInsights] = useState<string[]>([]);
  const [feedbacks, setFeedbacks] = useState<Record<string, 'valid' | 'false-positive'>>({});
  const visibleInsights = data.insights
    .filter(item => !dismissedInsights.includes(item.id))
    .sort((a, b) => insightOrder[a.severity] - insightOrder[b.severity]);

  const sections: DashboardSectionDef[] = useMemo(
    () => [
      {
        id: 'metrics',
        title: '承接指标',
        category: '通用',
        defaultVisible: true,
        render: () => (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
              gap: 16,
              alignContent: 'start',
              height: '100%',
              overflowY: 'auto',
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
        ),
      },
      {
        id: 'queue',
        title: '优先处理队列',
        category: '通用',
        defaultVisible: true,
        render: () => <QueueTable items={data.queue} navigate={navigate} />,
      },
      {
        id: 'ai',
        title: 'AI 洞察',
        category: '通用',
        defaultVisible: true,
        render: () => (
          <section style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 'var(--fs-15)', fontWeight: 700, color: 'var(--color-text-1)' }}>AI 洞察</h2>
                <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontWeight: 700 }}>
                  {visibleInsights.length} 条
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {visibleInsights.map(insight => (
                <AIInsightCard
                  key={insight.id}
                  {...insight}
                  feedback={feedbacks[insight.id]}
                  onAction={() => navigate(insight.target)}
                  onDismiss={id => setDismissedInsights(prev => [...prev, id])}
                  onFeedback={(id, fb) => setFeedbacks(prev => ({ ...prev, [id]: fb }))}
                />
              ))}
            </div>
          </section>
        ),
      },
      {
        id: 'trend',
        title: '任务/工作量趋势',
        category: '通用',
        defaultVisible: true,
        render: () => <TrendPanel data={data.trend} />,
      },
      {
        id: 'ranking',
        title: '工作组排名',
        category: '通用',
        defaultVisible: true,
        render: () => (data.ranking ? <StatListPanel title={data.ranking.title} items={data.ranking.items} /> : null),
      },
      {
        id: 'quick-actions',
        title: '快捷入口',
        category: '通用',
        defaultVisible: true,
        render: () => <QuickActionsPanel items={data.quickActions} navigate={navigate} />,
      },
      {
        id: 'spotlight',
        title: '初审视角',
        category: '通用',
        defaultVisible: true,
        render: () => (data.spotlight ? <StatListPanel title={data.spotlight.title} items={data.spotlight.items} /> : null),
      },
      {
        id: 'recent-operations',
        title: '最近操作',
        category: '通用',
        defaultVisible: false,
        render: () => <RecentOperationsPanel items={data.recentOperations} navigate={navigate} />,
      },
      {
        id: 'audit-tip',
        title: '审计提示',
        category: '通用',
        defaultVisible: false,
        render: () => (
          <div style={{ ...sectionCardStyle({ background: '#F9FAFB' }), height: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-12)', fontWeight: 700, color: '#667085', marginBottom: 8 }}>
              <TrendingUp size={14} />
              审计提示
            </div>
            <div style={{ fontSize: 'var(--fs-13)', color: '#475467', lineHeight: 1.7 }}>
              最近操作保留审计视角，消息待办保留行动视角，两者分开呈现，避免“发生了什么”和“接下来做什么”混在一起。
            </div>
          </div>
        ),
      },
    ],
    [data, navigate, visibleInsights, feedbacks],
  );

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {editing && <LayoutEditBanner onReset={layout.resetLayout} />}

      <section
        style={{
          ...sectionCardStyle(),
          padding: 20,
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FBFA 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <Tag label={data.role} color="brand" />
              {principal.realm === 'TENANT' && principal.currentPharmaName && (
                <Tag label={`当前服务药厂：${principal.currentPharmaName}`} color="info" />
              )}
            </div>
            <h1 style={{ margin: 0, fontSize: 'var(--fs-24)', fontWeight: 800, color: 'var(--color-text-1)' }}>{data.headline}</h1>
            <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-14)', color: '#667085', lineHeight: 1.7 }}>{data.subtitle}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
            <LayoutCustomizeButton editing={editing} onToggle={() => setEditing(prev => !prev)} />
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: '#F9FAFB',
                border: '1px solid var(--color-border)',
                minWidth: 280,
              }}
            >
              <div style={{ fontSize: 'var(--fs-12)', fontWeight: 700, color: 'var(--color-brand)', marginBottom: 6 }}>AI 呈现规范</div>
              <div style={{ fontSize: 'var(--fs-12)', color: '#667085', lineHeight: 1.7 }}>
                AI 仅提供参考，所有动作都需要人工确认；AI 不会自动改变任何单据状态。
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionBoard
        sections={sections}
        order={layout.order}
        hidden={layout.hidden}
        toggleVisible={layout.toggleVisible}
        moveSection={layout.moveSection}
        setSize={layout.setSize}
        sizes={layout.sizes}
        specs={PROVIDER_SIZE_SPECS}
        editing={editing}
        onExitEdit={exitEdit}
        gap={16}
        rowHeight={72}
      />
    </div>
  );
}

// ─── 系统工作台（软件服务方唯一预置角色：贝医系统管理员） ────────────────────
function PlatformWorkbenchDashboard({ navigate }: { navigate: (page: PageId) => void }) {
  const { principal, can } = usePermission();
  const platformRoleId = principal.realm === 'PLATFORM' ? principal.platformRoleId : '';
  const platformRoleName = principal.realm === 'PLATFORM' ? principal.platformRoleName : '';
  const data = useMemo(() => getPlatformWorkbenchData(platformRoleId, platformRoleName), [platformRoleId, platformRoleName]);
  const layout = useDashboardLayout('platform', PLATFORM_SECTION_IDS, PLATFORM_DEFAULT_HIDDEN, PLATFORM_SIZE_SPECS);
  const [editing, setEditing] = useState(false);
  const exitEdit = useCallback(() => setEditing(false), []);
  const [dismissedInsights, setDismissedInsights] = useState<string[]>([]);
  const [feedbacks, setFeedbacks] = useState<Record<string, 'valid' | 'false-positive'>>({});

  // 系统角色页面权限差异大：跳转目标先按当前角色可见性过滤，避免出现点了就报越权
  const visible = useCallback(
    (page: PageId) => can(page, 'view') || !RESOURCE_PAGES.some(p => p.id === page),
    [can],
  );
  const metrics = useMemo(() => data.metrics.filter(m => visible(m.target)), [data.metrics, visible]);
  const queue = useMemo(() => data.queue.filter(q => visible(q.target)), [data.queue, visible]);
  const insightsAll = useMemo(() => data.insights.filter(i => visible(i.target)), [data.insights, visible]);
  const quickActions = useMemo(() => data.quickActions.filter(q => visible(q.target)), [data.quickActions, visible]);
  const visibleInsights = insightsAll
    .filter(item => !dismissedInsights.includes(item.id))
    .sort((a, b) => insightOrder[a.severity] - insightOrder[b.severity]);

  const sections: DashboardSectionDef[] = useMemo(
    () => [
      {
        id: 'metrics',
        title: '管理指标',
        category: '通用',
        defaultVisible: true,
        render: () => (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16, alignContent: 'start', height: '100%', overflowY: 'auto' }}>
            {metrics.map(metric => {
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
        ),
      },
      {
        id: 'queue',
        title: '优先处理队列',
        category: '通用',
        defaultVisible: true,
        render: () => <QueueTable items={queue} navigate={navigate} viewAllTarget={null} />,
      },
      {
        id: 'ai',
        title: 'AI 洞察',
        category: '通用',
        defaultVisible: true,
        render: () => (
          <section style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 'var(--fs-15)', fontWeight: 700, color: 'var(--color-text-1)' }}>AI 洞察</h2>
                <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--color-brand-subtle)', color: 'var(--color-brand)', fontSize: 'var(--fs-12)', fontWeight: 700 }}>
                  {visibleInsights.length} 条
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {visibleInsights.map(insight => (
                <AIInsightCard
                  key={insight.id}
                  {...insight}
                  feedback={feedbacks[insight.id]}
                  onAction={() => navigate(insight.target)}
                  onDismiss={id => setDismissedInsights(prev => [...prev, id])}
                  onFeedback={(id, fb) => setFeedbacks(prev => ({ ...prev, [id]: fb }))}
                />
              ))}
              {visibleInsights.length === 0 && (
                <div style={{ padding: 16, fontSize: 'var(--fs-13)', color: '#98A2B3', textAlign: 'center' }}>当前角色暂无可展示的洞察事项</div>
              )}
            </div>
          </section>
        ),
      },
      {
        id: 'quick-actions',
        title: '快捷入口',
        category: '通用',
        defaultVisible: true,
        render: () => <QuickActionsPanel items={quickActions} navigate={navigate} />,
      },
      {
        id: 'spotlight',
        title: '健康度',
        category: '通用',
        defaultVisible: true,
        render: () => (data.spotlight ? <StatListPanel title={data.spotlight.title} items={data.spotlight.items} /> : null),
      },
      {
        id: 'recent-operations',
        title: '最近操作',
        category: '通用',
        defaultVisible: false,
        render: () => <RecentOperationsPanel items={data.recentOperations} navigate={navigate} />,
      },
      {
        id: 'audit-tip',
        title: '审计提示',
        category: '通用',
        defaultVisible: false,
        render: () => (
          <div style={{ ...sectionCardStyle({ background: '#F9FAFB' }), height: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-12)', fontWeight: 700, color: '#667085', marginBottom: 8 }}>
              <TrendingUp size={14} />
              审计提示
            </div>
            <div style={{ fontSize: 'var(--fs-13)', color: '#475467', lineHeight: 1.7 }}>
              软件服务方操作默认全程留痕：授权、回收、角色发布、登录失败都会进入操作日志；预览模式只读不落业务变更。
            </div>
          </div>
        ),
      },
    ],
    [data, metrics, queue, quickActions, visibleInsights, feedbacks, navigate],
  );

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {editing && <LayoutEditBanner onReset={layout.resetLayout} />}

      <section
        style={{
          ...sectionCardStyle(),
          padding: 20,
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FBFA 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <Tag label={data.roleLabel} color="brand" />
              <span style={{ fontSize: 'var(--fs-12)', color: '#667085' }}>
                系统管理后台 · 职责范围：{principal.realm === 'PLATFORM' ? principal.dutyScope : ''}
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 'var(--fs-24)', fontWeight: 800, color: 'var(--color-text-1)' }}>{data.headline}</h1>
            <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-14)', color: '#667085', lineHeight: 1.7 }}>{data.subtitle}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
            <LayoutCustomizeButton editing={editing} onToggle={() => setEditing(prev => !prev)} />
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: '#F9FAFB',
                border: '1px solid var(--color-border)',
                minWidth: 280,
              }}
            >
              <div style={{ fontSize: 'var(--fs-12)', fontWeight: 700, color: 'var(--color-brand)', marginBottom: 6 }}>操作边界</div>
              <div style={{ fontSize: 'var(--fs-12)', color: '#667085', lineHeight: 1.7 }}>
                菜单与操作按当前登录角色的授权矩阵渲染；越权访问会被拦截并写入审计。
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionBoard
        sections={sections}
        order={layout.order}
        hidden={layout.hidden}
        toggleVisible={layout.toggleVisible}
        moveSection={layout.moveSection}
        setSize={layout.setSize}
        sizes={layout.sizes}
        specs={PLATFORM_SIZE_SPECS}
        editing={editing}
        onExitEdit={exitEdit}
        gap={16}
        rowHeight={72}
      />
    </div>
  );
}

export function Dashboard({
  navigate,
  variant,
  addToast,
}: {
  navigate: (page: PageId) => void;
  /** 登录身份派生的工作台形态：药厂 / 服务商链路 / 系统管理 */
  variant: 'pharma' | 'provider' | 'platform';
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}) {
  void addToast;
  if (variant === 'platform') {
    return <PlatformWorkbenchDashboard navigate={navigate} />;
  }
  if (variant === 'provider') {
    return <ProviderWorkbenchDashboard navigate={navigate} />;
  }
  return <PharmaWorkbenchDashboard navigate={navigate} />;
}

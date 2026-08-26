import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FileSearch,
  FolderKanban,
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

type SalesAdminAnalysisView = 'comparison' | 'ranking' | null;

function buildSalesAdminStatusSummary(data: DashboardRoleData) {
  const taskRiskInsight = data.insights.find(item => item.severity === 'risk');
  const taskCountMatch = taskRiskInsight?.conclusion.match(/(\d+) 个任务/);
  const overdueMetric = data.metrics.find(item => item.title === '超期未填报');
  const quotaMetric = data.metrics.find(item => item.title === '费用额度剩余');
  const overdueValue = overdueMetric ? `${overdueMetric.value}${overdueMetric.unit ?? ''}` : null;
  const summaryParts = [
    taskCountMatch ? `${taskCountMatch[1]} 个任务落后时间进度` : null,
    overdueValue ? `超期未填报 ${overdueValue}` : null,
    quotaMetric ? `费用额度剩余 ${quotaMetric.value}` : null,
  ].filter(Boolean);

  return summaryParts.join(' · ');
}

function SalesAdminQueuePanel({
  items,
  navigate,
  addToast,
}: {
  items: DashboardRoleData['queue'];
  navigate: (page: PageId) => void;
  addToast: (msg: Omit<ToastMessage, 'id'>) => void;
}) {
  const sorted = [...items].sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);
  const [remindedIds, setRemindedIds] = useState<string[]>([]);

  return (
    <section
      style={{
        ...sectionCardStyle({ padding: 0, display: 'flex', flexDirection: 'column' }),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px 10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1F2937' }}>优先处理队列</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#667085' }}>排序保持：逾期 &gt; 风险 &gt; 关注 &gt; 正常</p>
        </div>
        <button
          onClick={() => navigate('task-dispatch')}
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
                gridTemplateColumns: 'minmax(0, 1.6fr) 112px 140px 80px 100px',
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
              <span>风险</span>
              <span>操作</span>
            </div>

            <div style={{ paddingTop: 8 }}>
              {sorted.map(item => {
                const isUrgeAction = item.actionLabel === '立即催办';
                const isReminded = isUrgeAction && remindedIds.includes(item.id);
                return (
                <div
                  key={item.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1.6fr) 112px 140px 80px 100px',
                    gap: 10,
                    alignItems: 'center',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid #F2F4F7',
                    marginBottom: 8,
                    background: item.risk === 'overdue' ? '#FFF7F7' : '#FFFFFF',
                    boxShadow: item.risk === 'overdue' ? 'inset 3px 0 0 #C73A3A' : 'none',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2937', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Tag label={item.type} />
                      {item.note && <Tag label={item.note} color={item.risk === 'overdue' ? 'danger' : item.risk === 'risk' ? 'warning' : 'info'} />}
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
                    <RiskTag level={item.risk} size="sm" />
                  </div>
                  <div>
                    <Button
                      size="sm"
                      variant={item.risk === 'overdue' && !isReminded ? 'danger' : 'outline'}
                      iconAfter={<ChevronRight size={13} />}
                      onClick={() => {
                        if (isUrgeAction && !isReminded) {
                          setRemindedIds(prev => [...prev, item.id]);
                          addToast({ type: 'success', title: '已通过邮件/短信完成通知' });
                          return;
                        }
                        navigate(item.target);
                      }}
                    >
                      {isReminded ? '查看明细' : item.actionLabel}
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

function SalesAdminAIInsightList({
  insights,
  navigate,
}: {
  insights: DashboardRoleData['insights'];
  navigate: (page: PageId) => void;
}) {
  if (insights.length === 0) return null;
  return (
    <section style={{ ...sectionCardStyle({ padding: '12px 16px' }), flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Sparkles size={16} color="#176B5B" />
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1F2937' }}>AI 洞察</h2>
        <span style={{ fontSize: 12, color: '#667085' }}>基于实时数据的自动预警</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
        {insights.map(insight => {
          const isRisk = insight.severity === 'risk';
          const isAttention = insight.severity === 'attention';
          const tone = isRisk ? { bg: '#FFFBFB', border: '#FECACA', text: '#C73A3A' } :
                       isAttention ? { bg: '#FFFDF5', border: '#FDE68A', text: '#C77A16' } :
                       { bg: '#F8FBFF', border: '#BFDBFE', text: '#2F6BCE' };

          return (
            <div
              key={insight.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                background: tone.bg,
                border: `1px solid ${tone.border}`,
                borderRadius: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: tone.text }}>{insight.title}</span>
                </div>
                <div style={{ fontSize: 12, color: '#667085', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {insight.conclusion}
                </div>
              </div>
              <button
                onClick={() => navigate(insight.target)}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#176B5B',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                {insight.actionLabel} <ArrowRight size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SalesAdminMoreAnalysisSimplified({
  comparisonTable,
  ranking,
  onOpen,
}: {
  comparisonTable?: DashboardRoleData['comparisonTable'];
  ranking?: DashboardRoleData['ranking'];
  onOpen: (view: Exclude<SalesAdminAnalysisView, null>) => void;
}) {
  return (
    <section style={{ ...sectionCardStyle({ padding: '12px 16px' }), width: 280, display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1F2937' }}>更多分析</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'center' }}>
        {comparisonTable && (
          <button
            onClick={() => onOpen('comparison')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: '#374151',
            }}
          >
            双队伍执行对比 <ArrowRight size={14} color="#9CA3AF" />
          </button>
        )}
        {ranking && (
          <button
            onClick={() => onOpen('ranking')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: '#374151',
            }}
          >
            组别排名 <ArrowRight size={14} color="#9CA3AF" />
          </button>
        )}
      </div>
    </section>
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
  const [salesAdminAnalysisView, setSalesAdminAnalysisView] = useState<SalesAdminAnalysisView>(null);
  const salesAdminStatusSummary = isSalesAdmin ? buildSalesAdminStatusSummary(data) : '';

  useEffect(() => {
    setDismissedInsights([]);
    setFeedbacks({});
    setSalesAdminAnalysisView(null);
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

  if (isSalesAdmin) {
    return (
      <div
        style={{
          padding: '16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <section
          style={{
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1F2937' }}>{data.headline}</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#667085', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {salesAdminStatusSummary}
            </p>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 12, color: '#667085', whiteSpace: 'nowrap' }}>AI 仅供参考，操作需人工确认</div>
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {data.metrics.map((metric, index) => {
            const Icon = getMetricIcon(metric);
            const isEmphasisMetric = metric.id === 'pm-3' || metric.id === 'pm-5';
            const isLightMetric = index === 0;

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
                compact
                accentPosition={isEmphasisMetric ? 'left' : 'top'}
                emphasis={isEmphasisMetric ? 'strong' : isLightMetric ? 'subtle' : 'default'}
                onClick={() => navigate(metric.target)}
              />
            );
          })}
        </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
            <SalesAdminAIInsightList insights={visibleInsights} navigate={navigate} />
          </section>

          <section style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SalesAdminQueuePanel items={data.queue} navigate={navigate} addToast={addToast} />
            </div>
            {data.quickActions && (
              <div style={{ width: 300, flexShrink: 0 }}>
                <section style={sectionCardStyle({ padding: '12px 16px', display: 'flex', flexDirection: 'column' })}>
                  <h2 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 700, color: '#1F2937' }}>快捷入口</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    {data.quickActions.map(item => (
                      <button
                        key={item.id}
                        onClick={() => navigate(item.target)}
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
            )}
          </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flexShrink: 0 }}>
          {data.comparisonTable && (
            <div style={sectionCardStyle({ padding: '16px', display: 'flex', flexDirection: 'column' })}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{data.comparisonTable.title}</h2>
                <button
                  onClick={() => navigate('budget-plan')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: '#176B5B',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  查看完整对比 <ArrowRight size={12} />
                </button>
              </div>
              <div style={{ overflowX: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0 0 10px', textAlign: 'left', fontSize: 12, color: '#98A2B3', fontWeight: 600 }}>队伍</th>
                      {data.comparisonTable.columns.map(column => (
                        <th key={column} style={{ padding: '0 0 10px', textAlign: 'left', fontSize: 12, color: '#98A2B3', fontWeight: 600 }}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.comparisonTable.rows.slice(0, 3).map(row => {
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
            </div>
          )}

          {data.ranking && (
            <div style={sectionCardStyle({ padding: '16px', display: 'flex', flexDirection: 'column' })}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{data.ranking.title}</h2>
                <button
                  onClick={() => navigate('budget-plan')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: '#176B5B',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  查看完整排名 <ArrowRight size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                {data.ranking.items.map(item => {
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
            </div>
          )}
        </section>
      </div>
    );
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

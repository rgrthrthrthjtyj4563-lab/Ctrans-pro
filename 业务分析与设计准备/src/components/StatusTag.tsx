import type {
  AuditStatus,
  ReconStatus,
  ReportStatus,
  RiskLevel,
  TaskStatus,
} from '../types';

export type StatusTagStatus =
  | AuditStatus
  | TaskStatus
  | ReconStatus
  | ReportStatus;

const statusConfig: Record<string, { label: string; fg: string; bg: string; dot: string }> = {
  // 审核态（拜访绩效 / 结算统计）
  '草稿':   { label: '草稿',   fg: '#374151', bg: '#F3F4F6', dot: '#9CA3AF' },
  '待审核': { label: '待审核', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '已通过': { label: '已通过', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  '已驳回': { label: '已驳回', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  '已打绩效': { label: '已打绩效', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
  '已撤销': { label: '已撤销', fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  // 任务状态（手册）
  '待确认': { label: '待确认', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '执行中': { label: '执行中', fg: '#176B5B', bg: '#E8F4F1', dot: '#176B5B' },
  '已结算': { label: '已结算', fg: '#176B5B', bg: '#E8F4F1', dot: '#176B5B' },
  // 对账状态
  '未发起': { label: '未发起', fg: '#667085', bg: '#F3F4F6', dot: '#98A2B3' },
  '对账中': { label: '对账中', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
  // 报告状态
  '通过': { label: '通过', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  '驳回': { label: '驳回', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
};

const riskConfig: Record<RiskLevel, { label: string; fg: string; bg: string; dot: string }> = {
  normal:    { label: '正常',   fg: '#374151', bg: '#F3F4F6', dot: '#9CA3AF' },
  attention: { label: '需关注', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  risk:      { label: '风险',   fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  overdue:   { label: '已逾期', fg: '#ffffff', bg: '#C73A3A', dot: '#ffffff' },
};

interface StatusTagProps {
  status: StatusTagStatus;
  size?: 'sm' | 'md';
}

export function StatusTag({ status, size = 'md' }: StatusTagProps) {
  const cfg = statusConfig[status] ?? { label: status, fg: '#374151', bg: '#F3F4F6', dot: '#9CA3AF' };
  const px = size === 'sm' ? '6px' : '8px';
  const py = size === 'sm' ? '2px' : '3px';
  const fs = size === 'sm' ? '11px' : '12px';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: `${py} ${px}`,
      borderRadius: '9999px',
      fontSize: fs,
      fontWeight: 500,
      lineHeight: 1,
      backgroundColor: cfg.bg,
      color: cfg.fg,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        backgroundColor: cfg.dot,
        flexShrink: 0,
      }} />
      {cfg.label}
    </span>
  );
}

interface RiskTagProps {
  level: RiskLevel;
  size?: 'sm' | 'md';
}

export function RiskTag({ level, size = 'md' }: RiskTagProps) {
  const cfg = riskConfig[level];
  const px = size === 'sm' ? '6px' : '8px';
  const py = size === 'sm' ? '2px' : '3px';
  const fs = size === 'sm' ? '11px' : '12px';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: `${py} ${px}`,
      borderRadius: '9999px',
      fontSize: fs,
      fontWeight: 500,
      lineHeight: 1,
      backgroundColor: cfg.bg,
      color: cfg.fg,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        backgroundColor: cfg.dot,
        flexShrink: 0,
      }} />
      {cfg.label}
    </span>
  );
}

interface GenericTagProps {
  label: string;
  color?: 'default' | 'brand' | 'info' | 'success' | 'warning' | 'danger';
}

export function Tag({ label, color = 'default' }: GenericTagProps) {
  const styles = {
    default: { fg: '#374151', bg: '#F3F4F6' },
    brand:   { fg: '#176B5B', bg: '#E8F4F1' },
    info:    { fg: '#2F6BCE', bg: '#EBF2FE' },
    success: { fg: '#248A5A', bg: '#E6F5ED' },
    warning: { fg: '#C77A16', bg: '#FEF3E2' },
    danger:  { fg: '#C73A3A', bg: '#FEECEC' },
  };
  const s = styles[color];
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 500,
      backgroundColor: s.bg,
      color: s.fg,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

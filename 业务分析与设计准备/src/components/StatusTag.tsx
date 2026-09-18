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
  | ReportStatus
  | '待评定'
  | '已评定';

const statusConfig: Record<string, { label: string; fg: string; bg: string; dot: string }> = {
  // 审核态（拜访绩效 / 结算统计）
  '草稿':   { label: '草稿',   fg: '#374151', bg: '#F3F4F6', dot: '#9CA3AF' },
  '停用':   { label: '停用',   fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  '已过期': { label: '已过期', fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  '已回收': { label: '已回收', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  '已移除': { label: '已移除', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  '待复核': { label: '待复核', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '待审核': { label: '待审核', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '待评定': { label: '待评定', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '已评定': { label: '已评定', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
  '已通过': { label: '已通过', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  '已驳回': { label: '已驳回', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  '已打绩效': { label: '已打绩效', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
  '已撤销': { label: '已撤销', fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  // 绩效记录四态（打绩效模块）
  '未打绩效': { label: '未打绩效', fg: '#374151', bg: '#F3F4F6', dot: '#9CA3AF' },
  '已生效': { label: '已生效', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  // 任务状态（手册）
  '待确认': { label: '待确认', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '执行中': { label: '执行中', fg: 'var(--color-brand)', bg: 'var(--color-brand-subtle)', dot: 'var(--color-brand)' },
  '已结算': { label: '已结算', fg: 'var(--color-brand)', bg: 'var(--color-brand-subtle)', dot: 'var(--color-brand)' },
  // 对账状态
  '未发起': { label: '未发起', fg: '#667085', bg: '#F3F4F6', dot: '#98A2B3' },
  '对账中': { label: '对账中', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
  // 报告状态
  '通过': { label: '通过', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  '驳回': { label: '驳回', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  // 医药代表主状态
  '待合规确认': { label: '待合规确认', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
  '待备案提交': { label: '待备案提交', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '已备案': { label: '已备案', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  '提交失败': { label: '提交失败', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  '变更待提交': { label: '变更待提交', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '删除待提交': { label: '删除待提交', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  '已删除': { label: '已删除', fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  '待提交': { label: '待提交', fg: '#667085', bg: '#F3F4F6', dot: '#98A2B3' },
  '审核中': { label: '审核中', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
  '补件中': { label: '补件中', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '合格': { label: '合格', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
  '启用': { label: '启用', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  '冻结': { label: '冻结', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  '整改中': { label: '整改中', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '复核中': { label: '复核中', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
  '失效': { label: '失效', fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  '退出': { label: '退出', fg: '#374151', bg: '#F3F4F6', dot: '#6B7280' },
  // 备案核验 / 授权
  '有效': { label: '有效', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  '生效': { label: '生效', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  '未核验': { label: '未核验', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '待核验': { label: '待核验', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '有效授权': { label: '有效授权', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  '范围待确认': { label: '范围待确认', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '授权将到期': { label: '授权将到期', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '授权已失效': { label: '授权已失效', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  '不可执行': { label: '不可执行', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  '未开始': { label: '未开始', fg: '#667085', bg: '#F3F4F6', dot: '#98A2B3' },
  '已结束': { label: '已结束', fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  '进行中': { label: '进行中', fg: 'var(--color-brand)', bg: 'var(--color-brand-subtle)', dot: 'var(--color-brand)' },
  '无结果': { label: '无结果', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  '异常待人工确认': { label: '异常待人工确认', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '待审': { label: '待审', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '撤销': { label: '撤销', fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  '过期': { label: '过期', fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  // 医药代表备案（最简版）
  '已停用': { label: '已停用', fg: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  '即将到期': { label: '即将到期', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  // 服务商状态
  '尽调中': { label: '尽调中', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
  '审批中': { label: '审批中', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '准入通过': { label: '准入通过', fg: '#2F6BCE', bg: '#EBF2FE', dot: '#2F6BCE' },
  '可合作': { label: '可合作', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  '复审中': { label: '复审中', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '限制合作': { label: '限制合作', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  // 风险等级
  '低风险': { label: '低风险', fg: '#248A5A', bg: '#E6F5ED', dot: '#248A5A' },
  '中风险': { label: '中风险', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  '高风险': { label: '高风险', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  // 品种话术状态（话术管理板块）
  '禁用': { label: '禁用', fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  '待启用': { label: '待启用', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
};

const riskConfig: Record<RiskLevel, { label: string; fg: string; bg: string; dot: string }> = {
  normal:    { label: '正常',   fg: '#374151', bg: '#F3F4F6', dot: '#9CA3AF' },
  attention: { label: '需关注', fg: '#C77A16', bg: '#FEF3E2', dot: '#C77A16' },
  risk:      { label: '风险',   fg: '#C73A3A', bg: '#FEECEC', dot: '#C73A3A' },
  overdue:   { label: '已逾期', fg: '#ffffff', bg: '#C73A3A', dot: '#ffffff' },
};

interface StatusTagProps {
  status: StatusTagStatus | string;
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
    brand:   { fg: 'var(--color-brand)', bg: 'var(--color-brand-subtle)' },
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
      fontSize: 'var(--fs-12)',
      fontWeight: 500,
      backgroundColor: s.bg,
      color: s.fg,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

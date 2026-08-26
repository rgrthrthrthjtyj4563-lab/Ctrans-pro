import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  urgency?: 'normal' | 'warning' | 'danger';
  onClick?: () => void;
  compact?: boolean;
  accentPosition?: 'top' | 'left';
  emphasis?: 'default' | 'strong' | 'subtle';
  source?: string;
}

export function MetricCard({
  title,
  value,
  unit,
  delta,
  deltaLabel,
  subtitle,
  icon: Icon,
  iconColor = '#176B5B',
  iconBg = '#E8F4F1',
  urgency = 'normal',
  onClick,
  compact = false,
  accentPosition = 'top',
  emphasis = 'default',
  source,
}: MetricCardProps) {
  const urgencyBorder = {
    normal:  '#E5E7EB',
    warning: '#C77A16',
    danger:  '#C73A3A',
  }[urgency];

  const urgencyTop = {
    normal:  'transparent',
    warning: '#C77A16',
    danger:  '#C73A3A',
  }[urgency];

  const isPositive = delta !== undefined && delta > 0;
  const isNegative = delta !== undefined && delta < 0;
  const borderStyle = urgency !== 'normal'
    ? accentPosition === 'left'
      ? {
          borderLeft: `3px solid ${urgencyTop}`,
        }
      : {
          borderTop: `3px solid ${urgencyTop}`,
        }
    : {};
  const padding = compact ? '10px 12px' : '20px';
  const valueSize = compact ? 22 : 28;
  const titleSize = compact ? 12 : 13;
  const metaSize = compact ? 11 : 12;
  const iconSize = compact ? 16 : 18;
  const iconBox = compact ? 28 : 36;
  const boxShadow = emphasis === 'strong' ? '0 1px 2px rgba(16,24,40,0.05)' : 'none';
  const background = emphasis === 'subtle' ? '#FCFCFD' : '#FFFFFF';

  return (
    <div
      onClick={onClick}
      style={{
        background,
        border: `1px solid ${urgencyBorder}`,
        borderRadius: '8px',
        padding,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 150ms ease',
        position: 'relative',
        minHeight: compact ? 78 : undefined,
        boxShadow,
        ...borderStyle,
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.10)'; }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: compact ? 8 : 12, gap: 8 }}>
        <span style={{ fontSize: titleSize, color: '#667085', fontWeight: 500, lineHeight: 1.4 }}>{title}</span>
        {Icon && (
          <span style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: iconBox,
            height: iconBox,
            borderRadius: '8px',
            background: iconBg,
            color: iconColor,
            flexShrink: 0,
          }}>
            <Icon size={iconSize} />
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: compact ? 6 : 8 }}>
        <span style={{
          fontSize: valueSize,
          fontWeight: 700,
          color: '#1F2937',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '-0.5px',
          lineHeight: 1,
        }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && <span style={{ fontSize: compact ? 12 : 13, color: '#667085', fontWeight: 500 }}>{unit}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 8, flexWrap: 'wrap' }}>
        {delta !== undefined && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontSize: metaSize,
            fontWeight: 500,
            color: isPositive ? '#C73A3A' : isNegative ? '#248A5A' : '#667085',
          }}>
            {isPositive ? <TrendingUp size={13} /> : isNegative ? <TrendingDown size={13} /> : <Minus size={13} />}
            {delta > 0 ? '+' : ''}{typeof delta === 'number' && Math.abs(delta) > 1000 ? `￥${Math.abs(delta).toLocaleString()}` : Math.abs(delta)}
          </span>
        )}
        {deltaLabel && <span style={{ fontSize: metaSize, color: '#9CA3AF' }}>{deltaLabel}</span>}
        {subtitle && <span style={{ fontSize: metaSize, color: '#9CA3AF' }}>{subtitle}</span>}
      </div>

      {source && (
        <div style={{ marginTop: compact ? 6 : 8, fontSize: compact ? 10 : 11, color: '#98A2B3' }}>
          数据来源 · {source}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, ExternalLink, X, BadgeCheck, CircleSlash, Clock, ShieldAlert } from 'lucide-react';
import { Button } from './Button';
import type { DashboardConfidence } from '../types';

type Severity = 'risk' | 'attention' | 'info';
type Feedback = 'valid' | 'false-positive';

interface AIInsightCardProps {
  id: string;
  title: string;
  conclusion: string;
  basis: string;
  dataRange: string;
  confidence: DashboardConfidence;
  suggestion: string;
  actionLabel: string;
  confirmationNote: string;
  severity: Severity;
  onAction?: () => void;
  onDismiss?: (id: string) => void;
  onFeedback?: (id: string, feedback: Feedback) => void;
  feedback?: Feedback;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onToggleExpand?: (id: string) => void;
  compactCollapsed?: boolean;
  showActionWhenCollapsed?: boolean;
}

const severityStyle: Record<Severity, { border: string; bg: string; badge: string; badgeFg: string }> = {
  risk:      { border: '#FECACA', bg: '#FFFBFB', badge: '#FEECEC', badgeFg: '#C73A3A' },
  attention: { border: '#FDE68A', bg: '#FFFDF5', badge: '#FEF3E2', badgeFg: '#C77A16' },
  info:      { border: '#BFDBFE', bg: '#F8FBFF', badge: '#EBF2FE', badgeFg: '#2F6BCE' },
};

const severityLabel: Record<Severity, string> = {
  risk: '风险',
  attention: '需关注',
  info: '参考',
};

export function AIInsightCard({
  id,
  title,
  conclusion,
  basis,
  dataRange,
  confidence,
  suggestion,
  actionLabel,
  confirmationNote,
  severity,
  onAction,
  onDismiss,
  onFeedback,
  feedback,
  defaultExpanded = false,
  expanded,
  onToggleExpand,
  compactCollapsed = false,
  showActionWhenCollapsed = false,
}: AIInsightCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const s = severityStyle[severity];
  const isExpanded = expanded ?? internalExpanded;
  const confidenceTone = {
    高: { fg: '#248A5A', bg: '#E6F5ED' },
    中: { fg: '#C77A16', bg: '#FEF3E2' },
    低: { fg: '#C73A3A', bg: '#FEECEC' },
  }[confidence];

  const handleToggle = () => {
    if (onToggleExpand) {
      onToggleExpand(id);
      return;
    }
    setInternalExpanded(v => !v);
  };

  return (
    <div style={{
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}>
        <span style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '8px',
          background: '#E8F4F1',
          color: '#176B5B',
          flexShrink: 0,
        }}>
          <Sparkles size={16} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tags and Dismiss */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: '9999px',
                background: s.badge,
                color: s.badgeFg,
              }}>
                AI · {severityLabel[severity]}
              </span>
              <span style={{
                fontSize: 12,
                padding: '2px 7px',
                borderRadius: '9999px',
                color: confidenceTone.fg,
                background: confidenceTone.bg,
              }}>
                置信度 {confidence}
              </span>
            </div>
            {onDismiss && (
              <button
                onClick={() => onDismiss(id)}
                title="忽略此建议"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9CA3AF',
                  margin: '-4px -4px 0 0',
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Title */}
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1F2937', marginBottom: (!compactCollapsed || isExpanded) ? 6 : 0 }}>
            {title}
          </div>

          {/* Conclusion */}
          {(!compactCollapsed || isExpanded) && (
            <div style={{ fontSize: 13, color: '#667085', lineHeight: 1.6, marginBottom: isExpanded ? 0 : 12 }}>
              {conclusion}
            </div>
          )}

          {/* Unexpanded Actions */}
          {!isExpanded && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleToggle}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  fontSize: 12,
                  color: '#667085',
                  background: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                {compactCollapsed ? '展开详情' : '查看依据'} <ChevronDown size={13} />
              </button>
              {showActionWhenCollapsed && onAction && (
                <button
                  onClick={onAction}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    fontSize: 12,
                    color: '#176B5B',
                    background: '#E8F4F1',
                    border: '1px solid #E8F4F1',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {actionLabel} <ExternalLink size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div style={{
          padding: '0 16px 16px 60px',
        }}>
          <div style={{
            paddingTop: 12,
            borderTop: `1px solid ${s.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginBottom: 16
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                判断依据
              </div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{basis}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                建议动作
              </div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{suggestion}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} /> 数据范围：{dataRange}
            </span>
            <span style={{ fontSize: 12, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ShieldAlert size={12} /> 人工确认：{confirmationNote}
            </span>
          </div>

          {feedback && (
            <div style={{ marginBottom: 12, fontSize: 12, color: feedback === 'valid' ? '#248A5A' : '#C77A16', fontWeight: 600 }}>
              已标记为{feedback === 'valid' ? '有效' : '误报'}。
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {onAction && (
              <Button variant="primary" size="sm" icon={<ExternalLink size={13} />} onClick={onAction}>
                {actionLabel}
              </Button>
            )}
            <Button variant="outline" size="sm" icon={<BadgeCheck size={13} />} onClick={() => onFeedback?.(id, 'valid')}>
              有效
            </Button>
            <Button variant="outline" size="sm" icon={<CircleSlash size={13} />} onClick={() => onFeedback?.(id, 'false-positive')}>
              误报
            </Button>
            <button
              onClick={handleToggle}
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                fontSize: 12,
                color: '#667085',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              收起 <ChevronUp size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { CheckCircle, XCircle, Clock, Edit, FileText, AlertCircle } from 'lucide-react';

type EventType = '提交' | '审核通过' | '审核驳回' | '修改' | '创建' | '绩效' | '结算' | '撤销';

interface TimelineEvent {
  id: string;
  type: EventType;
  operator: string;
  role?: string;
  time: string;
  comment?: string;
  detail?: string;
}

interface TimelineProps {
  events: TimelineEvent[];
}

const eventConfig: Record<EventType, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  '创建':   { icon: FileText,    color: '#6B7280', bg: '#F3F4F6', label: '创建记录' },
  '提交':   { icon: Clock,       color: '#2F6BCE', bg: '#EBF2FE', label: '提交审核' },
  '审核通过':{ icon: CheckCircle, color: '#248A5A', bg: '#E6F5ED', label: '审核通过' },
  '审核驳回':{ icon: XCircle,    color: '#C73A3A', bg: '#FEECEC', label: '审核驳回' },
  '修改':   { icon: Edit,        color: '#C77A16', bg: '#FEF3E2', label: '修改记录' },
  '绩效':   { icon: CheckCircle, color: '#176B5B', bg: '#E8F4F1', label: '打绩效' },
  '结算':   { icon: CheckCircle, color: '#176B5B', bg: '#E8F4F1', label: '结算完结' },
  '撤销':   { icon: AlertCircle, color: '#374151', bg: '#F3F4F6', label: '撤销操作' },
};

export function Timeline({ events }: TimelineProps) {
  return (
    <div style={{ position: 'relative' }}>
      {events.map((event, index) => {
        const cfg = eventConfig[event.type] || eventConfig['创建'];
        const Icon = cfg.icon;
        const isLast = index === events.length - 1;

        return (
          <div key={event.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {/* Line */}
            {!isLast && (
              <div style={{
                position: 'absolute',
                left: 15,
                top: 32,
                bottom: -4,
                width: 2,
                background: '#E5E7EB',
              }} />
            )}

            {/* Icon */}
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: cfg.bg,
              color: cfg.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              zIndex: 1,
            }}>
              <Icon size={14} />
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{cfg.label}</span>
                {event.role && (
                  <span style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: '3px',
                    background: '#F3F4F6',
                    color: '#6B7280',
                  }}>
                    {event.role}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: event.comment ? 6 : 0 }}>
                {event.operator} · {event.time}
              </div>
              {event.comment !== undefined && (
                <div style={{
                  marginTop: 6,
                  padding: '8px 12px',
                  background: '#F9FAFB',
                  borderRadius: '6px',
                  fontSize: 13,
                  color: '#374151',
                  borderLeft: `3px solid ${cfg.color}`,
                }}>
                  {event.comment}
                </div>
              )}
              {event.detail && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#667085' }}>{event.detail}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

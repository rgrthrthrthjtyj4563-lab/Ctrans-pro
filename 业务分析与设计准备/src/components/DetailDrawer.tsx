import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface DetailDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  /** 语义为居中卡片 maxWidth（历史 props 名 width 保留，调用点零改动） */
  width?: number;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** 居中 Modal（保留 DetailDrawer 名称，全站调用点零改动即可从右侧抽屉变为居中） */
export function DetailDrawer({ open, title, subtitle, width = 560, onClose, children, footer }: DetailDrawerProps) {
  if (!open) return null;

  const maxWidth = Math.min(Math.max(width, 480), 720);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(17,24,39,0.35)',
          animation: 'fadeIn 150ms ease',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 201,
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          background: '#FFFFFF',
          borderRadius: 12,
          boxShadow: '0 16px 40px rgba(0,0,0,0.16)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'dialogIn 150ms ease',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          height: 56,
          borderBottom: '1px solid #E5E7EB',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1F2937' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 6,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6B7280',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F3F4F6'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 20,
        }}>
          {children}
        </div>

        {footer && (
          <div style={{
            padding: '14px 20px',
            borderTop: '1px solid #E5E7EB',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dialogIn {
          from { opacity: 0; transform: scale(0.96) translateY(-8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

interface FieldGroupProps {
  title: string;
  children: ReactNode;
}

export function FieldGroup({ title, children }: FieldGroupProps) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: '#9CA3AF',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span>{title}</span>
        <span style={{ flex: 1, height: 1, background: '#F3F4F6' }} />
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px 16px',
      }}>
        {children}
      </div>
    </div>
  );
}

interface FieldItemProps {
  label: string;
  value: ReactNode;
  span?: boolean;
}

export function FieldItem({ label, value, span }: FieldItemProps) {
  return (
    <div style={{ gridColumn: span ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#1F2937', fontWeight: 400, wordBreak: 'break-all' }}>
        {value || <span style={{ color: '#D1D5DB' }}>—</span>}
      </div>
    </div>
  );
}

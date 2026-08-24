import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface DetailDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  width?: number;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function DetailDrawer({ open, title, subtitle, width = 560, onClose, children, footer }: DetailDrawerProps) {
  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(17,24,39,0.30)',
            animation: 'fadeIn 150ms ease',
          }}
        />
      )}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 201,
        width,
        background: '#FFFFFF',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        transform: open ? 'translateX(0)' : `translateX(${width}px)`,
        transition: 'transform 220ms cubic-bezier(0.25,0.46,0.45,0.94)',
      }}>
        {/* Header */}
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

        {/* Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
        }}>
          {children}
        </div>

        {/* Footer */}
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
      `}</style>
    </>
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

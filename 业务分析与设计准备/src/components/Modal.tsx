import type { ReactNode, CSSProperties } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  maxHeight?: string;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 640,
  maxHeight = '86vh',
}: ModalProps) {
  if (!open) return null;

  const panel: CSSProperties = {
    position: 'relative',
    background: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: typeof width === 'number' ? width : width,
    maxHeight,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 16px 40px rgba(0,0,0,0.16)',
    animation: 'dialogIn 150ms ease',
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
      />
      <div style={panel}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, fontSize: 'var(--fs-16)', fontWeight: 600, color: 'var(--color-text-1)' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9CA3AF',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>{children}</div>
        {footer && (
          <div style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border)',
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
      <style>{`
        @keyframes dialogIn {
          from { opacity: 0; transform: scale(0.96) translateY(-8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

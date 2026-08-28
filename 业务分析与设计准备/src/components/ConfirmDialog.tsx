import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  impact?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  impact,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const iconColor = variant === 'danger' ? '#C73A3A' : '#C77A16';
  const iconBg    = variant === 'danger' ? '#FEECEC' : '#FEF3E2';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }}
        onClick={onCancel}
      />
      <div style={{
        position: 'relative',
        background: '#FFFFFF',
        borderRadius: '12px',
        width: '100%',
        maxWidth: 420,
        padding: '24px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.16)',
        animation: 'dialogIn 150ms ease',
      }}>
        <button
          onClick={onCancel}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
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

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: '10px',
            background: iconBg,
            color: iconColor,
            flexShrink: 0,
          }}>
            <AlertTriangle size={20} />
          </span>
          <div>
            <h3 style={{ margin: 0, fontSize: 'var(--fs-16)', fontWeight: 600, color: 'var(--color-text-1)', marginBottom: 6 }}>
              {title}
            </h3>
            <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: '#667085', lineHeight: 1.6 }}>
              {description}
            </p>
          </div>
        </div>

        {impact && (
          <div style={{
            padding: '10px 14px',
            background: variant === 'danger' ? '#FEECEC' : '#FEF3E2',
            borderRadius: '6px',
            marginBottom: 20,
            fontSize: 'var(--fs-13)',
            color: iconColor,
            border: `1px solid ${variant === 'danger' ? '#FECACA' : '#FDE68A'}`,
          }}>
            <strong>影响说明：</strong>{impact}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="outline" size="md" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={variant === 'danger' ? 'danger' : 'primary'} size="md" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
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

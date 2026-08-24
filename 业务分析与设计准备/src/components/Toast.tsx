import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

const toastStyles: Record<ToastType, { icon: typeof CheckCircle; iconColor: string; borderColor: string }> = {
  success: { icon: CheckCircle,   iconColor: '#248A5A', borderColor: '#248A5A' },
  error:   { icon: XCircle,       iconColor: '#C73A3A', borderColor: '#C73A3A' },
  warning: { icon: AlertTriangle, iconColor: '#C77A16', borderColor: '#C77A16' },
  info:    { icon: Info,          iconColor: '#2F6BCE', borderColor: '#2F6BCE' },
};

function ToastItem({ msg, onDismiss }: { msg: ToastMessage; onDismiss: (id: string) => void }) {
  const s = toastStyles[msg.type];
  const Icon = s.icon;

  useEffect(() => {
    const t = setTimeout(() => onDismiss(msg.id), 4000);
    return () => clearTimeout(t);
  }, [msg.id, onDismiss]);

  return (
    <div style={{
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      background: '#FFFFFF',
      border: '1px solid #E5E7EB',
      borderLeft: `4px solid ${s.borderColor}`,
      borderRadius: '8px',
      padding: '12px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
      minWidth: 280,
      maxWidth: 380,
      animation: 'toastIn 200ms ease',
    }}>
      <span style={{ color: s.iconColor, flexShrink: 0, marginTop: 1 }}>
        <Icon size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1F2937' }}>{msg.title}</div>
        {msg.description && (
          <div style={{ fontSize: 13, color: '#667085', marginTop: 2 }}>{msg.description}</div>
        )}
      </div>
      <button
        onClick={() => onDismiss(msg.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#9CA3AF',
          padding: 2,
          flexShrink: 0,
          display: 'flex',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer({ messages, onDismiss }: ToastProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 20,
      right: 20,
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {messages.map(msg => (
        <ToastItem key={msg.id} msg={msg} onDismiss={onDismiss} />
      ))}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

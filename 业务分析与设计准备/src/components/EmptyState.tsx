import type { LucideIcon } from 'lucide-react';
import { SearchX } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  hint?: string;
}

export function EmptyState({ icon: Icon = SearchX, title, description, action, hint }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '64px 24px',
      textAlign: 'center',
    }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '12px',
        background: '#F3F4F6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        color: '#9CA3AF',
      }}>
        <Icon size={28} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#9CA3AF', maxWidth: 320, lineHeight: 1.6, marginBottom: 16 }}>
        {description}
      </div>
      {hint && (
        <div style={{
          fontSize: 12,
          color: '#9CA3AF',
          padding: '6px 12px',
          background: '#F9FAFB',
          borderRadius: '6px',
          marginBottom: 16,
        }}>
          {hint}
        </div>
      )}
      {action && (
        <Button variant="primary" size="md" onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}

export function LoadingState() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '64px 24px',
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: '3px solid #E5E7EB',
        borderTop: '3px solid #176B5B',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        marginBottom: 12,
      }} />
      <div style={{ fontSize: 13, color: '#9CA3AF' }}>数据加载中…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: '0 0 8px' }}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid #F3F4F6',
        }}>
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} style={{
              height: 16,
              borderRadius: 4,
              background: 'linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%)',
              backgroundSize: '400% 100%',
              animation: 'shimmer 1.5s ease infinite',
              opacity: c === 0 ? 0.5 : 1,
              width: c === 0 ? '60%' : `${60 + Math.random() * 40}%`,
            }} />
          ))}
        </div>
      ))}
      <style>{`@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }`}</style>
    </div>
  );
}

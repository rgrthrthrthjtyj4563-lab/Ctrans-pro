import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  dataRange?: string;
  updatedAt?: string;
  actions?: ReactNode;
  tabs?: { id: string; label: string; count?: number }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
}

export function PageHeader({
  title,
  description,
  dataRange,
  updatedAt,
  actions,
  tabs,
  activeTab,
  onTabChange,
}: PageHeaderProps) {
  return (
    <div style={{
      background: '#FFFFFF',
      borderBottom: '1px solid var(--color-border)',
      padding: '0 24px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 16,
        paddingBottom: tabs ? 0 : 16,
        gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 'var(--fs-20)', fontWeight: 600, color: 'var(--color-text-1)', lineHeight: 1.3 }}>
              {title}
            </h1>
          </div>
          {(description || dataRange || updatedAt) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              {description && (
                <span style={{ fontSize: 'var(--fs-13)', color: '#667085' }}>{description}</span>
              )}
              {dataRange && (
                <span style={{
                  fontSize: 'var(--fs-12)',
                  color: '#667085',
                  padding: '2px 8px',
                  background: '#F3F4F6',
                  borderRadius: '4px',
                }}>
                  数据范围：{dataRange}
                </span>
              )}
              {updatedAt && (
                <span style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF' }}>更新于 {updatedAt}</span>
              )}
            </div>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>

      {tabs && (
        <div style={{ display: 'flex', gap: 0, marginTop: 8 }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              style={{
                padding: '8px 16px',
                fontSize: 'var(--fs-14)',
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? 'var(--color-brand)' : '#667085',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--color-brand)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              onMouseEnter={e => { if (activeTab !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
              onMouseLeave={e => { if (activeTab !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = '#667085'; }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span style={{
                  fontSize: 'var(--fs-11)',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '9999px',
                  background: activeTab === tab.id ? 'var(--color-brand-subtle)' : '#F3F4F6',
                  color: activeTab === tab.id ? 'var(--color-brand)' : '#6B7280',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

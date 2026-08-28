import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  function getPages(): (number | '...')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, '...', totalPages];
    if (page >= totalPages - 3) return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, '...', page - 1, page, page + 1, '...', totalPages];
  }

  const pages = getPages();

  const btnStyle = (active: boolean, disabled?: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 30,
    height: 30,
    padding: '0 6px',
    fontSize: 'var(--fs-13)',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--color-brand)' : disabled ? '#D1D5DB' : '#374151',
    background: active ? 'var(--color-brand-subtle)' : 'none',
    border: active ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
    borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 120ms ease',
    fontFamily: "'JetBrains Mono', monospace",
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 0',
    }}>
      <span style={{ fontSize: 'var(--fs-13)', color: '#9CA3AF' }}>
        共 <strong style={{ color: '#374151', fontFamily: "'JetBrains Mono', monospace" }}>{total.toLocaleString()}</strong> 条，
        第 {start}–{end} 条
      </span>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          style={btnStyle(false, page === 1) as React.CSSProperties}
        >
          <ChevronLeft size={14} />
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} style={{ color: '#9CA3AF', padding: '0 4px' }}>…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              style={btnStyle(p === page) as React.CSSProperties}
              onMouseEnter={e => { if (p !== page) (e.currentTarget as HTMLButtonElement).style.background = '#F3F4F6'; }}
              onMouseLeave={e => { if (p !== page) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          style={btnStyle(false, page === totalPages) as React.CSSProperties}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

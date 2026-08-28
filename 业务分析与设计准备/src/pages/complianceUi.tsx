import type { CSSProperties, ReactNode } from 'react';
import type { EligibilityResult, EligibilityVerdict } from '../types';

export const inputStyle: CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 10px',
  fontSize: 'var(--fs-13)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'inherit',
  background: '#fff',
};

export const thStyle: CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 'var(--fs-12)',
  fontWeight: 600,
  color: '#9CA3AF',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  background: '#F9FAFB',
  borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap',
};

export const tdStyle: CSSProperties = {
  padding: '11px 12px',
  fontSize: 'var(--fs-13)',
  color: 'var(--color-text-1)',
  borderBottom: '1px solid #F3F4F6',
  verticalAlign: 'middle',
};

export function Field({
  label,
  children,
  required,
  span,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  span?: boolean;
}) {
  return (
    <label style={{ display: 'block', gridColumn: span ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6, fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: '#C73A3A', marginLeft: 2 }}>*</span>}
      </div>
      {children}
    </label>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20 }}>
      {steps.map((s, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'var(--fs-12)',
                fontWeight: 700,
                background: active || done ? 'var(--color-brand)' : '#F3F4F6',
                color: active || done ? '#fff' : '#9CA3AF',
              }}>
                {i + 1}
              </span>
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: active ? 600 : 400, color: active ? 'var(--color-brand)' : done ? '#374151' : '#9CA3AF', whiteSpace: 'nowrap' }}>
                {s}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done ? 'var(--color-brand)' : '#E5E7EB', margin: '0 12px' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', marginBottom: 16 }}>
      {items.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            padding: '8px 14px',
            fontSize: 'var(--fs-13)',
            fontWeight: value === tab.id ? 600 : 400,
            color: value === tab.id ? 'var(--color-brand)' : '#667085',
            background: 'none',
            border: 'none',
            borderBottom: value === tab.id ? '2px solid var(--color-brand)' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span style={{
              marginLeft: 6,
              fontSize: 'var(--fs-11)',
              padding: '1px 6px',
              borderRadius: 999,
              background: value === tab.id ? 'var(--color-brand-subtle)' : '#F3F4F6',
              color: value === tab.id ? 'var(--color-brand)' : '#6B7280',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

const verdictStyle: Record<EligibilityVerdict, { fg: string; bg: string; border: string; label: string }> = {
  PASS: { fg: '#248A5A', bg: '#E6F5ED', border: '#BBF7D0', label: 'PASS 允许开展' },
  BLOCK: { fg: '#C73A3A', bg: '#FEECEC', border: '#FECACA', label: 'BLOCK 拦截' },
  MANUAL_REVIEW: { fg: '#C77A16', bg: '#FEF3E2', border: '#FDE68A', label: 'MANUAL_REVIEW 人工复核' },
};

export function EligibilityPanel({ result }: { result: EligibilityResult }) {
  const s = verdictStyle[result.verdict];
  return (
    <div>
      <div style={{
        padding: '12px 14px',
        borderRadius: 8,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.fg,
        fontWeight: 700,
        fontSize: 'var(--fs-14)',
        marginBottom: 12,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {s.label}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['规则', '说明', '结果', '明细'].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.hits.map((h) => (
            <tr key={h.code}>
              <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--fs-12)' }}>{h.code}</td>
              <td style={tdStyle}>{h.rule}</td>
              <td style={tdStyle}>
                <span style={{
                  fontSize: 'var(--fs-11)',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: h.result === 'OK' ? '#E6F5ED' : h.result === 'BLOCK' ? '#FEECEC' : '#FEF3E2',
                  color: h.result === 'OK' ? '#248A5A' : h.result === 'BLOCK' ? '#C73A3A' : '#C77A16',
                }}>
                  {h.result}
                </span>
              </td>
              <td style={{ ...tdStyle, color: '#667085' }}>{h.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InfoBanner({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger'; children: ReactNode }) {
  const cfg = tone === 'warning'
    ? { bg: '#FEF3E2', border: '#FDE68A', fg: '#C77A16' }
    : tone === 'danger'
      ? { bg: '#FEECEC', border: '#FECACA', fg: '#C73A3A' }
      : { bg: '#EBF2FE', border: '#BFDBFE', fg: '#2F6BCE' };
  return (
    <div style={{
      padding: '10px 14px',
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 8,
      fontSize: 'var(--fs-13)',
      color: cfg.fg,
      marginBottom: 12,
      lineHeight: 1.6,
    }}>
      {children}
    </div>
  );
}

export function nextId(prefix: string, existing: { id: string }[]): string {
  const nums = existing
    .map((x) => Number((x.id.split('-').pop() || '').replace(/\D/g, '')))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

export function nowText(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

import type { CSSProperties, ReactNode } from 'react';
import { AlertTriangle, Eye } from 'lucide-react';
import { Button } from '../components/Button';

export const inputStyle: CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 10px',
  fontSize: 13,
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'inherit',
  background: '#fff',
};

export const thStyle: CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: '#9CA3AF',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  background: '#F9FAFB',
  borderBottom: '1px solid #E5E7EB',
  whiteSpace: 'nowrap',
};

export const tdStyle: CSSProperties = {
  padding: '11px 12px',
  fontSize: 13,
  color: '#1F2937',
  borderBottom: '1px solid #F3F4F6',
  verticalAlign: 'middle',
};

export function Field({
  label,
  children,
  required,
  hint,
  span,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
  span?: boolean;
}) {
  return (
    <label style={{ display: 'block', gridColumn: span ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 12, color: '#667085', marginBottom: 6, fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: '#C73A3A', marginLeft: 2 }}>*</span>}
      </div>
      {children}
      {hint && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

export function RiskBadge() {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      marginLeft: 4,
      padding: '1px 6px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      color: '#C73A3A',
      background: '#FEECEC',
      verticalAlign: 'middle',
    }}>
      高危
    </span>
  );
}

export function CheckCell({
  checked,
  disabled,
  onChange,
  risk,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  risk?: boolean;
}) {
  return (
    <label style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
    }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 15, height: 15, accentColor: risk ? '#C73A3A' : '#176B5B', cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
    </label>
  );
}

export function RadioCard({
  checked,
  disabled,
  title,
  hint,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      style={{
        textAlign: 'left',
        padding: '12px 14px',
        borderRadius: 8,
        border: checked ? '1px solid #176B5B' : '1px solid #E5E7EB',
        background: checked ? '#E8F4F1' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: checked ? '4px solid #176B5B' : '1.5px solid #D1D5DB',
          background: '#fff',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: '#667085', marginTop: 6, marginLeft: 22, lineHeight: 1.5 }}>{hint}</div>
    </button>
  );
}

export function InfoBanner({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'warning' | 'danger' }) {
  const map = {
    brand: { bg: '#F9FAFB', border: '#E5E7EB', fg: '#667085', icon: '#176B5B' },
    warning: { bg: '#FEF3E2', border: '#FDE68A', fg: '#C77A16', icon: '#C77A16' },
    danger: { bg: '#FEECEC', border: '#FECACA', fg: '#C73A3A', icon: '#C73A3A' },
  }[tone];
  return (
    <div style={{
      padding: '10px 16px',
      background: map.bg,
      border: `1px solid ${map.border}`,
      borderRadius: 8,
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
      fontSize: 13,
      color: map.fg,
      lineHeight: 1.6,
    }}>
      <AlertTriangle size={15} style={{ color: map.icon, flexShrink: 0, marginTop: 2 }} />
      <div>{children}</div>
    </div>
  );
}

export function ChipSelect({
  options,
  values,
  disabled,
  onChange,
}: {
  options: { value: string; label: string }[];
  values: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const on = values.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              onChange(on ? values.filter(v => v !== opt.value) : [...values, opt.value]);
            }}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              border: on ? '1px solid #176B5B' : '1px solid #E5E7EB',
              background: on ? '#E8F4F1' : '#fff',
              color: on ? '#176B5B' : '#374151',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function PreviewBanner({
  roleName,
  orgName,
  userName,
  onExit,
}: {
  roleName: string;
  orgName: string;
  userName?: string;
  onExit: () => void;
}) {
  return (
    <div style={{
      height: 40,
      flexShrink: 0,
      background: '#C77A16',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      gap: 12,
      zIndex: 30,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
        <Eye size={15} />
        预览模式（只读）· 以「{roleName}」查看
        <span style={{ fontWeight: 400, opacity: 0.9 }}>
          · {orgName}{userName ? ` · ${userName}` : ''}
        </span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={onExit}
        style={{ background: '#fff', color: '#C77A16', border: 'none', height: 28 }}
      >
        退出预览
      </Button>
    </div>
  );
}

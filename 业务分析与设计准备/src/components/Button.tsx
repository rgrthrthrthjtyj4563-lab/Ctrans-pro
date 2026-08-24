import type { ReactNode, ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconAfter?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
}

const styles: Record<Variant, { bg: string; color: string; border: string; hoverBg: string }> = {
  primary:   { bg: '#176B5B', color: '#fff',     border: '#176B5B', hoverBg: '#0f5044' },
  secondary: { bg: '#F3F4F6', color: '#374151',  border: '#E5E7EB', hoverBg: '#E5E7EB' },
  ghost:     { bg: 'transparent', color: '#374151', border: 'transparent', hoverBg: '#F3F4F6' },
  danger:    { bg: '#C73A3A', color: '#fff',     border: '#C73A3A', hoverBg: '#a82d2d' },
  outline:   { bg: 'transparent', color: '#374151', border: '#D1D5DB', hoverBg: '#F9FAFB' },
};

const sizes: Record<Size, { padding: string; fontSize: string; height: string; iconSize: number }> = {
  sm: { padding: '0 10px', fontSize: '12px', height: '28px', iconSize: 14 },
  md: { padding: '0 14px', fontSize: '13px', height: '32px', iconSize: 15 },
  lg: { padding: '0 18px', fontSize: '14px', height: '38px', iconSize: 16 },
};

export function Button({ variant = 'secondary', size = 'md', icon, iconAfter, loading, children, disabled, ...props }: ButtonProps) {
  const s = styles[variant];
  const z = sizes[size];
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: z.padding,
        height: z.height,
        fontSize: z.fontSize,
        fontWeight: 500,
        fontFamily: 'inherit',
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: '6px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap',
        ...props.style,
      }}
      onMouseEnter={e => {
        if (!isDisabled) (e.currentTarget as HTMLButtonElement).style.background = s.hoverBg;
      }}
      onMouseLeave={e => {
        if (!isDisabled) (e.currentTarget as HTMLButtonElement).style.background = s.bg;
      }}
    >
      {loading ? (
        <span style={{
          width: z.iconSize,
          height: z.iconSize,
          border: `2px solid ${s.color}40`,
          borderTop: `2px solid ${s.color}`,
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 0.8s linear infinite',
        }} />
      ) : icon}
      {children}
      {iconAfter}
    </button>
  );
}

export function IconButton({ variant = 'ghost', size = 'md', icon, disabled, title, ...props }: Omit<ButtonProps, 'children'> & { title?: string }) {
  const s = styles[variant];
  const dim = { sm: 26, md: 30, lg: 36 }[size];

  return (
    <button
      {...props}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dim,
        height: dim,
        fontSize: '13px',
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 150ms ease',
        padding: 0,
        ...props.style,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = s.hoverBg; }}
      onMouseLeave={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = s.bg; }}
    >
      {icon}
    </button>
  );
}

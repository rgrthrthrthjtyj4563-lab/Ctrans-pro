import type { ReactNode, ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'soft';
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
  primary:   { bg: 'var(--color-brand)', color: '#fff', border: 'var(--color-brand)', hoverBg: 'var(--color-brand-hover)' },
  secondary: { bg: 'var(--color-button-secondary)', color: 'var(--color-neutral-fg)', border: 'var(--color-border)', hoverBg: 'var(--color-button-secondary-hover)' },
  ghost:     { bg: 'transparent', color: 'var(--color-neutral-fg)', border: 'transparent', hoverBg: 'var(--color-button-ghost-hover)' },
  danger:    { bg: 'var(--color-button-danger)', color: '#fff', border: 'var(--color-button-danger)', hoverBg: 'var(--color-button-danger-hover)' },
  outline:   { bg: 'transparent', color: 'var(--color-neutral-fg)', border: 'var(--color-border-strong)', hoverBg: 'var(--color-button-outline-hover)' },
  soft:      { bg: 'var(--color-surface)', color: 'var(--color-neutral-fg)', border: 'var(--color-border-strong)', hoverBg: 'var(--color-button-secondary)' },
};

const sizes: Record<Size, { padding: string; fontSize: string; height: string; iconSize: number }> = {
  sm: { padding: '0 var(--spacing-button-sm-x)', fontSize: '12px', height: 'var(--spacing-button-sm-y)', iconSize: 14 },
  md: { padding: '0 var(--spacing-button-md-x)', fontSize: '13px', height: 'var(--spacing-button-md-y)', iconSize: 15 },
  lg: { padding: '0 var(--spacing-button-lg-x)', fontSize: '14px', height: 'var(--spacing-button-lg-y)', iconSize: 16 },
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

export function IconButton({ variant = 'ghost', size = 'md', icon, disabled, title, 'aria-label': ariaLabel, ...props }: Omit<ButtonProps, 'children'> & { title: string; 'aria-label'?: string }) {
  const s = styles[variant];
  const dim = { sm: 26, md: 30, lg: 36 }[size];

  return (
    <button
      {...props}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dim,
        height: dim,
        fontSize: 'var(--fs-13)',
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

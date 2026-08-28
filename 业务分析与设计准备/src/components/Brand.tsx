interface BrandMarkProps {
  size?: number;
  title?: string;
}

/** 药合作系统徽标：品牌绿底 + 白色药十字 + 中心节点。 */
export function BrandMark({ size = 32, title = '药合作系统' }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      style={{ display: 'block', flexShrink: 0, borderRadius: 8 }}
    >
      <rect width="32" height="32" rx="8" style={{ fill: 'var(--color-brand)' }} />
      <rect x="6" y="13.5" width="20" height="5" rx="2.5" fill="#FFFFFF" />
      <rect x="13.5" y="6" width="5" height="20" rx="2.5" fill="#FFFFFF" />
      <circle cx="16" cy="16" r="2.2" style={{ fill: 'var(--color-brand)' }} />
    </svg>
  );
}

interface BrandLogoProps {
  collapsed?: boolean;
  subtitle?: string;
}

export function BrandLogo({
  collapsed = false,
  subtitle = 'AI 运营控制台 V3',
}: BrandLogoProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <BrandMark size={32} />
      {!collapsed && (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-13)', fontWeight: 700, color: '#F9FAFB', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
            药合作系统
          </div>
          <div style={{ fontSize: 'var(--fs-10)', color: 'var(--color-sidebar-accent)', letterSpacing: '0.05em', marginTop: 1 }}>
            {subtitle}
          </div>
        </div>
      )}
    </div>
  );
}

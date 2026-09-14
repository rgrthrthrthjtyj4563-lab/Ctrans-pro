interface BrandMarkProps {
  size?: number;
  title?: string;
}

/** 药合作徽标：Baiyee 品牌图标（public/logo.png，天蓝渐变圆角方形）。 */
export function BrandMark({ size = 32, title = '药合作' }: BrandMarkProps) {
  return (
    <img
      src="/logo.png"
      alt={title}
      width={size}
      height={size}
      draggable={false}
      style={{
        display: 'block',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '22%',
        boxShadow: '0 2px 10px rgba(26,43,66,0.18)',
      }}
    />
  );
}

interface BrandLogoProps {
  collapsed?: boolean;
  subtitle?: string;
}

export function BrandLogo({
  collapsed = false,
  subtitle = '营销协同管理系统',
}: BrandLogoProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <BrandMark size={32} />
      {!collapsed && (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-13)', fontWeight: 700, color: '#F9FAFB', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
            药合作
          </div>
          <div style={{ fontSize: 'var(--fs-10)', color: 'var(--color-sidebar-accent)', letterSpacing: '0.05em', marginTop: 1 }}>
            {subtitle}
          </div>
        </div>
      )}
    </div>
  );
}

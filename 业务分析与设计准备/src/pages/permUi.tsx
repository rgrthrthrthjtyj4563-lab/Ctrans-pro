import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { Button } from '../components/Button';
import {
  ORG_TYPE_LABEL,
  orgChildren,
  orgDescendantIds,
  orgPathLabel,
  usersInSubtree,
  type PermOrg,
  type PermUser,
} from '../data/permissions';

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
      <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginBottom: 6, fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: '#C73A3A', marginLeft: 2 }}>*</span>}
      </div>
      {children}
      {hint && <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', marginTop: 4 }}>{hint}</div>}
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
      fontSize: 'var(--fs-10)',
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
        style={{ width: 15, height: 15, accentColor: risk ? '#C73A3A' : 'var(--color-brand)', cursor: disabled ? 'not-allowed' : 'pointer' }}
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
        border: checked ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
        background: checked ? 'var(--color-brand-subtle)' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: checked ? '4px solid var(--color-brand)' : '1.5px solid #D1D5DB',
          background: '#fff',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--color-text-1)' }}>{title}</span>
      </div>
      <div style={{ fontSize: 'var(--fs-12)', color: '#667085', marginTop: 6, marginLeft: 22, lineHeight: 1.5 }}>{hint}</div>
    </button>
  );
}

export function InfoBanner({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'warning' | 'danger' }) {
  const map = {
    brand: { bg: '#F9FAFB', border: 'var(--color-border)', fg: '#667085', icon: 'var(--color-brand)' },
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
      fontSize: 'var(--fs-13)',
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
              fontSize: 'var(--fs-12)',
              fontWeight: 500,
              border: on ? '1px solid var(--color-brand)' : '1px solid var(--color-border)',
              background: on ? 'var(--color-brand-subtle)' : '#fff',
              color: on ? 'var(--color-brand)' : '#374151',
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

export function OrgTree({
  orgs,
  selectedId,
  onSelect,
  users = [],
  defaultExpandedIds,
  showSearch,
  canSelect,
}: {
  orgs: PermOrg[];
  selectedId: string;
  onSelect: (id: string) => void;
  users?: PermUser[];
  defaultExpandedIds?: string[];
  showSearch?: boolean;
  canSelect?: (org: PermOrg) => boolean;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (defaultExpandedIds?.length) return new Set(defaultExpandedIds);
    return new Set(orgs.filter(o => o.type === 'platform' || o.type === 'pharma').map(o => o.id));
  });

  const q = query.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!q) return null;
    const hit = new Set<string>();
    for (const org of orgs) {
      const nameHit = org.name.toLowerCase().includes(q);
      const peopleHit = usersInSubtree(users, orgs, org.id).some(
        u => u.name.toLowerCase().includes(q) || u.account.toLowerCase().includes(q),
      );
      if (!nameHit && !peopleHit) continue;
      for (const id of orgDescendantIds(orgs, org.id)) hit.add(id);
      let current: PermOrg | undefined = org;
      const guard = new Set<string>();
      while (current && !guard.has(current.id)) {
        guard.add(current.id);
        hit.add(current.id);
        current = current.parentId ? orgs.find(o => o.id === current!.parentId) : undefined;
      }
    }
    return hit;
  }, [orgs, q, users]);

  const roots = orgChildren(orgs);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(org: PermOrg, depth: number): ReactNode {
    if (visibleIds && !visibleIds.has(org.id)) return null;
    const children = orgChildren(orgs, org.id);
    const visibleChildren = visibleIds ? children.filter(c => visibleIds.has(c.id)) : children;
    const hasChildren = visibleChildren.length > 0;
    const open = q ? true : expanded.has(org.id);
    const selected = selectedId === org.id;
    const selectable = canSelect ? canSelect(org) : true;
    const count = usersInSubtree(users, orgs, org.id).length;
    return (
      <div key={org.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 8px',
            paddingLeft: 8 + depth * 14,
            borderRadius: 6,
            cursor: selectable ? 'pointer' : 'not-allowed',
            opacity: selectable ? 1 : 0.4,
            background: selected ? 'var(--color-brand-subtle)' : 'transparent',
            color: selected ? 'var(--color-brand)' : 'var(--color-text-1)',
          }}
          onClick={() => { if (selectable) onSelect(org.id); }}
        >
          <button
            type="button"
            aria-label={open ? '折叠' : '展开'}
            onClick={e => {
              e.stopPropagation();
              if (hasChildren) toggle(org.id);
            }}
            style={{
              width: 18,
              height: 18,
              border: 'none',
              background: 'transparent',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: hasChildren ? '#9CA3AF' : 'transparent',
              cursor: hasChildren ? 'pointer' : 'default',
              flexShrink: 0,
            }}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-13)', fontWeight: selected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {org.name}
          </span>
          <span style={{ fontSize: 'var(--fs-12)', color: '#667085', flexShrink: 0 }}>{ORG_TYPE_LABEL[org.type]}</span>
          <span style={{
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 999,
            background: '#F3F4F6',
            color: '#374151',
            fontSize: 'var(--fs-11)',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {count}
          </span>
        </div>
        {open && hasChildren && visibleChildren.map(child => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {showSearch && (
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索部门或人员"
          style={{ ...inputStyle, marginBottom: 8, flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {roots.map(root => renderNode(root, 0))}
        {visibleIds && visibleIds.size === 0 && (
          <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', padding: '12px 8px' }}>没有匹配的组织</div>
        )}
      </div>
      {selectedId && (
        <div style={{ fontSize: 'var(--fs-12)', color: '#9CA3AF', paddingTop: 8, flexShrink: 0, lineHeight: 1.4 }}>
          {orgPathLabel(orgs, selectedId)}
        </div>
      )}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)', fontWeight: 600 }}>
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

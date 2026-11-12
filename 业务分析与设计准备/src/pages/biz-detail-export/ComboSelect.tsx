/**
 * 组合条件 · 通用下拉选择器（替代原生 select）。
 *
 * 触发器与月区间选择器同一视觉体系（同边框/圆角/聚焦环/箭头旋转）；
 * 菜单为白底圆角卡片：点击外部 / Escape 关闭，打开时聚焦选中项，
 * 上下键在选项间移动焦点，选中项带品牌色与对勾标识。
 */
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface ComboSelectOption {
  value: string;
  label: string;
}

export interface ComboSelectProps {
  /** 无障碍名称（字段名，如「服务提供方」） */
  label: string;
  value: string;
  options: ComboSelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function ComboSelect({ label, value, options, disabled, onChange }: ComboSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  // 打开时聚焦选中项（上下键即可在选项间移动焦点，Enter 确认）
  useEffect(() => {
    if (!open) return;
    const buttons = Array.from(menuRef.current?.querySelectorAll('button') ?? []) as HTMLButtonElement[];
    const target = buttons.find((b) => b.dataset.value === value) ?? buttons[0];
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  }, [open, value]);

  const moveFocus = (dir: 1 | -1) => {
    const buttons = Array.from(menuRef.current?.querySelectorAll('button') ?? []) as HTMLButtonElement[];
    const i = buttons.findIndex((b) => b === document.activeElement);
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, i + dir))];
    next?.focus();
    next?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <div ref={rootRef} className={`bxr-cs${open ? ' bxr-open' : ''}${disabled ? ' bxr-disabled' : ''}`}>
      <button
        type="button"
        className="bxr-cs-trigger"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={selected?.label}
      >
        <span className="bxr-cs-value">{selected?.label ?? ''}</span>
        <ChevronDown size={14} className="bxr-cs-chevron" aria-hidden />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="bxr-cs-menu"
          role="listbox"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // 面板内 Escape 只关菜单，不冒泡到抽屉的整体关闭
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              moveFocus(1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              moveFocus(-1);
            }
          }}
        >
          {options.map((o) => (
            <button
              key={o.value || 'all'}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-value={o.value}
              className={`bxr-cs-option${o.value === value ? ' bxr-selected' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={13} strokeWidth={2.5} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

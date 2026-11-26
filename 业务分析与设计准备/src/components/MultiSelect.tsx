/**
 * 多选下拉：触发器内以标签展示已选项（可单个移除），面板为带复选框的选项列表。
 * 面板经 Portal 渲染、与触发器等宽、空间不足时自动向上展开（见 AnchoredPopover）。
 * 多选点选后不收起；选项较多时提供搜索；方向键移动焦点，Tab 关闭并离开，
 * Escape 只关下拉（不冒泡到外层弹窗）。
 */
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { AnchoredPopover } from './AnchoredPopover';
import './MultiSelect.css';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface Props {
  /** 无障碍名称（字段名，如「分配角色」） */
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 触发器内最多展示的已选标签数，其余折叠为「+N」 */
  maxChips?: number;
}

/** 选项数达到该值才显示搜索框 */
const SEARCH_THRESHOLD = 8;

export function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder = '请选择',
  disabled = false,
  maxChips = 3,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => value.map(v => options.find(o => o.value === v)).filter((o): o is MultiSelectOption => Boolean(o)),
    [options, value],
  );
  const searchable = options.length >= SEARCH_THRESHOLD;
  const keyword = query.trim().toLowerCase();
  const visible = keyword ? options.filter(o => o.label.toLowerCase().includes(keyword)) : options;
  const hiddenCount = selected.length - maxChips;

  function toggleOpen() {
    if (disabled) return;
    if (open) {
      setOpen(false);
    } else {
      setQuery('');
      setOpen(true);
    }
  }

  function close() {
    // 焦点在面板里（方向键选择中）时关回触发器；点击外部关闭则不动焦点
    const focusWasInPanel = Boolean(panelRef.current?.contains(document.activeElement));
    setOpen(false);
    if (focusWasInPanel) toggleRef.current?.focus();
  }

  function toggle(optionValue: string) {
    onChange(value.includes(optionValue) ? value.filter(v => v !== optionValue) : [...value, optionValue]);
  }

  function clearAll() {
    onChange([]);
    // 页脚随已选清空而移除：先把焦点挪到首个选项（无匹配项则落搜索框），避免焦点掉回 body
    panelRef.current?.querySelector<HTMLElement>('[role="option"], .ms-search input')?.focus();
  }

  // 打开时聚焦：有搜索框先落搜索框，否则落第一个已选项（上下键即可继续选择）
  useLayoutEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [open]);

  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (e.key === 'Tab') {
      // 不阻止默认：焦点先回到触发器，浏览器再沿 Tab 顺序前进
      setOpen(false);
      toggleRef.current?.focus();
      return;
    }
    if (buttons.length === 0) return;
    const index = buttons.findIndex(b => b === document.activeElement);
    const inSearch = (e.target as HTMLElement).tagName === 'INPUT';
    const jump = (next: number) => {
      e.preventDefault();
      buttons[Math.min(buttons.length - 1, Math.max(0, next))]?.focus();
    };
    if (e.key === 'ArrowDown') {
      jump(index + 1);
    } else if (e.key === 'ArrowUp') {
      jump(inSearch ? buttons.length - 1 : index - 1);
    } else if (e.key === 'Home' && !inSearch) {
      jump(0);
    } else if (e.key === 'End' && !inSearch) {
      jump(buttons.length - 1);
    }
  }

  // 打开即聚焦的目标：搜索框 > 首个已选项 > 首个选项
  const autoFocusValue = selected[0]?.value ?? options[0]?.value;

  // 面板与触发器是同级节点：面板内的点击不会沿 React 树冒泡到触发器的「切换展开」
  return (
    <>
      <div
        ref={rootRef}
        className={`ms-field${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}
        onClick={toggleOpen}
      >
        {selected.length === 0 && <span className="ms-placeholder">{placeholder}</span>}
        {selected.slice(0, maxChips).map(o => (
          <span key={o.value} className="ms-chip">
            <span className="ms-chip-label">{o.label}</span>
            <button
              type="button"
              className="ms-chip-remove"
              disabled={disabled}
              aria-label={`移除「${o.label}」`}
              onClick={e => {
                e.stopPropagation();
                // 标签连同 × 一起移除会让焦点掉回 body：先挪到下一个标签的 ×（没有则回展开按钮）
                const removes = Array.from(e.currentTarget.closest('.ms-field')?.querySelectorAll<HTMLButtonElement>('.ms-chip-remove') ?? []);
                (removes[removes.indexOf(e.currentTarget) + 1] ?? toggleRef.current)?.focus();
                onChange(value.filter(v => v !== o.value));
              }}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        {hiddenCount > 0 && <span className="ms-more">+{hiddenCount}</span>}

        <button
          ref={toggleRef}
          type="button"
          className="ms-toggle"
          disabled={disabled}
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={e => {
            e.stopPropagation();
            toggleOpen();
          }}
        >
          <ChevronDown size={15} className="ms-toggle-chevron" aria-hidden />
        </button>
      </div>

      {open && (
        <AnchoredPopover
          anchorRef={rootRef}
          onClose={close}
          onKeyDown={onPanelKeyDown}
          panelRef={panelRef}
          matchWidth
          maxHeight={340}
        >
          {searchable && (
            <div className="ms-search">
              <Search size={14} className="ms-search-icon" aria-hidden />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="搜索选项"
                aria-label={`搜索${label}`}
                data-autofocus=""
              />
            </div>
          )}

          <div id={listId} className="ms-list" role="listbox" aria-multiselectable="true" aria-label={label}>
            {visible.length === 0 ? (
              <div className="ms-empty">没有匹配的选项</div>
            ) : (
              visible.map(o => {
                const checked = value.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    data-autofocus={!searchable && o.value === autoFocusValue ? '' : undefined}
                    className={`ms-option${checked ? ' is-selected' : ''}`}
                    onClick={() => toggle(o.value)}
                  >
                    <span className="ms-check" aria-hidden>
                      {checked && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="ms-option-label">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* 计数与使用方同一口径（以 value 为准，含选项里已不存在的旧值） */}
          {value.length > 0 && (
            <div className="ms-footer">
              <span>已选 {value.length} 项</span>
              <button type="button" className="ms-clear" onClick={clearAll}>
                清空
              </button>
            </div>
          )}
        </AnchoredPopover>
      )}
    </>
  );
}

/**
 * 工作量周期 · 起止选择器（按月 / 按日双粒度，替代原生 input[type=month]）。
 *
 * 面板顶部「按月 | 按日」切换：
 * - 按月：年切换 + 12 月宫格，提交 'YYYY-MM'；
 * - 按日：年月切换 + 星期表头 + 日期宫格，提交 'YYYY-MM-DD'。
 * 区间交互一致：第一次点击落起点，第二次点击落终点（自动交换），悬浮/聚焦实时预览；
 * 已选值在另一粒度面板中按其前缀回显（如日期值在按月面板高亮所在月份）。
 * 底部快捷项按当前粒度提交，另附清除。
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { periodLabel } from './exportDrawerModel';
import './export-report-drawer.css';

type Granularity = 'month' | 'day';

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
/** 周一至周日的日历表头 */
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM' 或 'YYYY-MM-DD' 加减月数（日部分原样保留，跨年安全） */
function addMonths(value: string, delta: number): string {
  const [y, m, d] = value.split('-').map(Number);
  const t = new Date(y, m - 1 + delta, 1);
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}${d ? `-${pad2(d)}` : ''}`;
}

/** 当月天数 */
const daysInMonth = (year: number, month1: number) => new Date(year, month1, 0).getDate();
/** 周一起算的 1 号偏移量 */
const firstDayOffset = (year: number, month1: number) => (new Date(year, month1 - 1, 1).getDay() + 6) % 7;

export interface PeriodRangePickerProps {
  /** 起点 'YYYY-MM' 或 'YYYY-MM-DD'，'' 表示未选 */
  start: string;
  /** 终点，格式同起点，'' 表示未选 */
  end: string;
  disabled?: boolean;
  /** 起点晚于终点的错误态（选择器内部已保证顺序，保留作防御性展示） */
  invalid?: boolean;
  /** 任一次点击 / 快捷项提交都会整体回传最新区间（含当前粒度格式） */
  onChange: (start: string, end: string) => void;
}

export function PeriodRangePicker({ start, end, disabled, invalid, onChange }: PeriodRangePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Granularity>('month');
  /** 面板展示的年（按月）与年、月（按日导航用） */
  const [viewY, setViewY] = useState(new Date().getFullYear());
  const [viewM, setViewM] = useState(new Date().getMonth() + 1);
  /** 已落下、等待终点的起点（当前粒度格式）；null 表示下一次点击是新区间起点 */
  const [picking, setPicking] = useState<string | null>(null);
  /** 悬浮 / 聚焦的预览值（仅 picking 期间参与区间渲染） */
  const [hover, setHover] = useState<string | null>(null);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const today = `${thisMonth}-${pad2(now.getDate())}`;

  // 渲染用端点：按当前粒度取前缀比较（跨粒度回显）；落起点后用悬浮值预览，先点后方自动交换
  const keyOf = (v: string) => (mode === 'month' ? v.slice(0, 7) : v.slice(0, 10));
  const effStart = picking ?? start;
  const effEnd = picking ? (hover && hover !== picking ? hover : '') : end;
  const lo = effStart && effEnd ? (keyOf(effStart) <= keyOf(effEnd) ? keyOf(effStart) : keyOf(effEnd)) : '';
  const hi = effStart && effEnd ? (keyOf(effStart) <= keyOf(effEnd) ? keyOf(effEnd) : keyOf(effStart)) : '';

  const cellClass = (value: string) => {
    const k = keyOf(value);
    const cls = ['bxr-prp-cell'];
    if (value === today || value === thisMonth) cls.push('bxr-now');
    if ((lo && k === lo) || (hi && k === hi)) cls.push('bxr-endpoint');
    else if (lo && hi && k > lo && k < hi) cls.push('bxr-mid');
    return cls.join(' ');
  };

  const openPanel = () => {
    if (disabled) return;
    const base = start || end || today;
    setViewY(Number(base.slice(0, 4)));
    setViewM(Number(base.slice(5, 7)));
    setPicking(null);
    setHover(null);
    setOpen(true);
  };

  const switchMode = (next: Granularity) => {
    if (next === mode) return;
    setMode(next);
    setPicking(null);
    setHover(null);
  };

  const stepView = (dir: 1 | -1) => {
    if (mode === 'month') {
      setViewY((y) => y + dir);
      return;
    }
    const m = viewM + dir;
    if (m < 1) {
      setViewY((y) => y - 1);
      setViewM(12);
    } else if (m > 12) {
      setViewY((y) => y + 1);
      setViewM(1);
    } else {
      setViewM(m);
    }
  };

  const pick = (value: string) => {
    if (!picking) {
      setPicking(value);
      onChange(value, ''); // 起点已落、终点待选：先整体提交，抽屉侧据此禁用「应用条件」
      return;
    }
    onChange(value < picking ? value : picking, value < picking ? picking : value);
    setPicking(null);
    setOpen(false);
  };

  const clear = () => {
    setPicking(null);
    setHover(null);
    onChange('', '');
  };

  // 点击面板外部关闭
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  /** 常用区间快捷项（相对当前，按粒度提交） */
  const presets: Array<{ label: string; range: [string, string] }> =
    mode === 'month'
      ? [
          { label: '近3个月', range: [addMonths(thisMonth, -2), thisMonth] },
          { label: '近6个月', range: [addMonths(thisMonth, -5), thisMonth] },
          { label: '今年', range: [`${now.getFullYear()}-01`, thisMonth] },
        ]
      : [
          { label: '近3个月', range: [addMonths(today, -2), today] },
          { label: '近6个月', range: [addMonths(today, -5), today] },
          { label: '今年', range: [`${now.getFullYear()}-01-01`, today] },
        ];

  const headLabel = mode === 'month' ? `${viewY}年` : `${viewY}年${viewM}月`;

  return (
    <div
      ref={rootRef}
      className={`bxr-prp${open ? ' bxr-open' : ''}${invalid ? ' bxr-invalid' : ''}${disabled ? ' bxr-disabled' : ''}`}
    >
      <Calendar size={15} className="bxr-prp-icon" aria-hidden />
      <button
        type="button"
        className={`bxr-prp-seg${open && !picking && !start ? ' bxr-awaiting' : ''}`}
        onClick={() => (open ? setOpen(false) : openPanel())}
        disabled={disabled}
        aria-label="工作量开始"
        aria-expanded={open}
      >
        {start ? periodLabel(start) : <em>开始日期</em>}
      </button>
      <ArrowRight size={12} className="bxr-prp-arrow" aria-hidden />
      <button
        type="button"
        className={`bxr-prp-seg${open && picking ? ' bxr-awaiting' : ''}`}
        onClick={() => (open ? setOpen(false) : openPanel())}
        disabled={disabled}
        aria-label="工作量结束"
        aria-expanded={open}
      >
        {end ? periodLabel(end) : <em>{open && picking ? (mode === 'day' ? '点选止日' : '点选止月') : '结束日期'}</em>}
      </button>
      <ChevronDown size={14} className="bxr-prp-chevron" aria-hidden />

      {open && (
        <div
          className="bxr-prp-panel"
          role="group"
          aria-label="工作量周期选择"
          onKeyDown={(e) => {
            // 面板内 Escape 只关面板，不冒泡到抽屉的整体关闭
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          {/* 粒度切换 */}
          <div className="bxr-prp-gran">
            <div className="bxr-prp-gran-inner">
              <button
                type="button"
                className={`bxr-prp-gran-btn${mode === 'month' ? ' bxr-active' : ''}`}
                onClick={() => switchMode('month')}
                aria-pressed={mode === 'month'}
              >
                按月
              </button>
              <button
                type="button"
                className={`bxr-prp-gran-btn${mode === 'day' ? ' bxr-active' : ''}`}
                onClick={() => switchMode('day')}
                aria-pressed={mode === 'day'}
              >
                按日
              </button>
            </div>
          </div>

          {/* 年 / 年月导航 */}
          <div className="bxr-prp-head">
            <button
              type="button"
              className="bxr-prp-nav"
              onClick={() => stepView(-1)}
              aria-label={mode === 'month' ? '上一年' : '上一月'}
            >
              <ChevronLeft size={15} />
            </button>
            <strong>{headLabel}</strong>
            <button
              type="button"
              className="bxr-prp-nav"
              onClick={() => stepView(1)}
              aria-label={mode === 'month' ? '下一年' : '下一月'}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {mode === 'day' && (
            <div className="bxr-prp-week" aria-hidden>
              {WEEKDAY_LABELS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
          )}

          <div className={`bxr-prp-grid${mode === 'day' ? ' bxr-day' : ''}`}>
            {mode === 'day' &&
              Array.from({ length: firstDayOffset(viewY, viewM) }, (_, i) => (
                <span key={`blank-${i}`} className="bxr-prp-blank" />
              ))}
            {mode === 'month'
              ? MONTH_LABELS.map((label, i) => {
                  const value = `${viewY}-${pad2(i + 1)}`;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={cellClass(value)}
                      onClick={() => pick(value)}
                      onMouseEnter={() => setHover(value)}
                      onFocus={() => setHover(value)}
                      aria-pressed={keyOf(value) === lo || keyOf(value) === hi}
                    >
                      {label}
                    </button>
                  );
                })
              : Array.from({ length: daysInMonth(viewY, viewM) }, (_, i) => {
                  const value = `${viewY}-${pad2(viewM)}-${pad2(i + 1)}`;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={cellClass(value)}
                      onClick={() => pick(value)}
                      onMouseEnter={() => setHover(value)}
                      onFocus={() => setHover(value)}
                      aria-pressed={keyOf(value) === lo || keyOf(value) === hi}
                    >
                      {i + 1}
                    </button>
                  );
                })}
          </div>

          <div className="bxr-prp-foot">
            <div className="bxr-prp-presets">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="bxr-prp-preset"
                  onClick={() => {
                    setPicking(null);
                    setHover(null);
                    onChange(p.range[0], p.range[1]);
                    setOpen(false);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" className="bxr-prp-clear" onClick={clear}>
              清除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

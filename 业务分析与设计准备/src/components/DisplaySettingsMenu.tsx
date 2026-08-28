import { useEffect, useRef, useState } from 'react';
import { Settings2, RotateCcw, Check } from 'lucide-react';
import {
  useDisplayPreference, FONT_SCALE_META, COLOR_THEME_META,
} from '../context/DisplayPreferenceContext';
import type { ColorTheme, FontScale } from '../context/DisplayPreferenceContext';

const FONT_ORDER: FontScale[] = ['compact', 'standard', 'large'];
const THEME_ORDER: ColorTheme[] = ['teal', 'blue', 'high-contrast'];

/** 顶栏“显示设置”浮层：字体三档 + 主题三选 + 恢复默认，全部走本地偏好存储。 */
export function DisplaySettingsMenu({ onNotice }: { onNotice: (title: string) => void }) {
  const { preference, setFontScale, setColorTheme, resetToDefault } = useDisplayPreference();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc 关闭并将焦点送回入口按钮
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  function pickFont(scale: FontScale) {
    if (preference.fontScale !== scale) {
      setFontScale(scale);
      onNotice(`已切换为${FONT_SCALE_META[scale].label}字体`);
    }
  }

  function pickTheme(theme: ColorTheme) {
    if (preference.colorTheme !== theme) {
      setColorTheme(theme);
      onNotice(`已应用${COLOR_THEME_META[theme].label}主题`);
    }
  }

  function restoreDefault() {
    const dirty = preference.fontScale !== 'standard' || preference.colorTheme !== 'teal';
    resetToDefault();
    onNotice(dirty ? '已恢复默认显示设置' : '当前已是默认显示设置');
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--color-text-1)',
    margin: '0 0 8px',
  };
  const subText: React.CSSProperties = { fontSize: 'var(--fs-11)', color: 'var(--color-text-2)' };

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="显示设置"
        title="显示设置"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 36,
          padding: '0 12px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--color-border)',
          background: open ? 'var(--color-brand-subtle)' : 'none',
          color: open ? 'var(--color-brand)' : '#6B7280',
          fontSize: 'var(--fs-13)', fontWeight: 500, fontFamily: 'inherit',
          transition: 'all 150ms ease',
        }}
      >
        <Settings2 size={16} style={{ flexShrink: 0 }} />
        <span className="display-pref-label">显示设置</span>
      </button>

      {open && (
        <>
          {/* 点击外部关闭（与用户菜单同模式，不遮挡主内容交互以外的区域） */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 900 }} onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="显示设置"
            style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 910,
              width: 300, maxHeight: '70vh', overflowY: 'auto',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 14,
            }}
          >
            {/* ── 字体大小 ── */}
            <div style={{ ...sectionTitle }}>字体大小</div>
            <div role="radiogroup" aria-label="字体大小" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 4 }}>
              {FONT_ORDER.map(scale => {
                const selected = preference.fontScale === scale;
                const meta = FONT_SCALE_META[scale];
                return (
                  <button
                    key={scale}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => pickFont(scale)}
                    title={meta.hint}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      padding: '8px 4px', minHeight: 36, cursor: 'pointer', fontFamily: 'inherit',
                      borderRadius: 6, fontSize: 'var(--fs-13)', fontWeight: selected ? 600 : 400,
                      border: `1px solid ${selected ? 'var(--color-brand)' : 'var(--color-border)'}`,
                      background: selected ? 'var(--color-brand-subtle)' : 'var(--color-surface)',
                      color: selected ? 'var(--color-brand)' : 'var(--color-text-1)',
                      transition: 'all 150ms ease',
                    }}
                  >
                    <span>{meta.label}</span>
                    <span style={subText}>{meta.base}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ ...subText, margin: '2px 0 14px' }}>
              仅缩放业务文字，图标与控件点击区不受影响
            </div>

            {/* ── 颜色主题 ── */}
            <div style={{ ...sectionTitle }}>颜色主题</div>
            <div role="radiogroup" aria-label="颜色主题" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {THEME_ORDER.map(theme => {
                const selected = preference.colorTheme === theme;
                const meta = COLOR_THEME_META[theme];
                return (
                  <button
                    key={theme}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => pickTheme(theme)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '8px 10px', minHeight: 36, cursor: 'pointer', fontFamily: 'inherit',
                      textAlign: 'left', borderRadius: 6,
                      border: `1px solid ${selected ? 'var(--color-brand)' : 'var(--color-border)'}`,
                      background: selected ? 'var(--color-brand-subtle)' : 'var(--color-surface)',
                      transition: 'all 150ms ease',
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      background: meta.swatch,
                      border: '1px solid rgba(0,0,0,0.15)',
                    }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 'var(--fs-13)', fontWeight: selected ? 600 : 500, color: 'var(--color-text-1)' }}>
                        {meta.label}
                        {theme === 'teal' && <span style={subText}>（默认）</span>}
                      </span>
                      <span style={{ ...subText, display: 'block' }}>{meta.hint}</span>
                    </span>
                    {selected && <Check size={16} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
            <div style={{ ...subText, margin: '6px 0 12px' }}>
              语义状态色（成功/警告/错误）不随主题变化
            </div>

            {/* ── 恢复默认 ── */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={restoreDefault}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, minHeight: 36,
                  padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                  background: 'none', border: 'none', fontSize: 'var(--fs-12)', color: 'var(--color-text-2)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-brand)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-2)'; }}
              >
                <RotateCcw size={13} /> 恢复默认
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** 个人显示偏好：字体档位 + 颜色主题。纯前端能力，与业务数据、权限无关。 */
export type FontScale = 'compact' | 'standard' | 'large';
export type ColorTheme = 'teal' | 'blue' | 'high-contrast';

export interface DisplayPreference {
  fontScale: FontScale;
  colorTheme: ColorTheme;
}

export const FONT_SCALE_META: Record<FontScale, { label: string; base: string; hint: string }> = {
  compact: { label: '紧凑', base: '13px', hint: '高频操作、一屏更多数据' },
  standard: { label: '标准', base: '14px', hint: '默认办公使用' },
  large: { label: '易读', base: '16px', hint: '长时间阅读、投屏演示' },
};

export const COLOR_THEME_META: Record<ColorTheme, { label: string; swatch: string; hint: string }> = {
  teal: { label: '药企绿', swatch: '#176B5B', hint: '品牌延续，日常业务' },
  blue: { label: '专业蓝', swatch: '#2F6BCE', hint: '管理层、数据查看' },
  'high-contrast': { label: '高对比', swatch: '#003366', hint: '投屏、弱视、强光环境' },
};

const STORAGE_KEY = 'beiyi.displayPreference';
export const DEFAULT_PREFERENCE: DisplayPreference = { fontScale: 'standard', colorTheme: 'teal' };

const FONT_SCALES: FontScale[] = ['compact', 'standard', 'large'];
const COLOR_THEMES: ColorTheme[] = ['teal', 'blue', 'high-contrast'];

function readStored(): DisplayPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCE;
    const parsed = JSON.parse(raw) as Partial<DisplayPreference>;
    return {
      fontScale: FONT_SCALES.includes(parsed.fontScale as FontScale) ? parsed.fontScale as FontScale : DEFAULT_PREFERENCE.fontScale,
      colorTheme: COLOR_THEMES.includes(parsed.colorTheme as ColorTheme) ? parsed.colorTheme as ColorTheme : DEFAULT_PREFERENCE.colorTheme,
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

interface DisplayPreferenceContextValue {
  preference: DisplayPreference;
  setFontScale: (scale: FontScale) => void;
  setColorTheme: (theme: ColorTheme) => void;
  resetToDefault: () => void;
}

const DisplayPreferenceContext = createContext<DisplayPreferenceContextValue | null>(null);

export function DisplayPreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<DisplayPreference>(readStored);
  const mounted = useRef(false);

  // 写入根节点属性 + 持久化；data 属性驱动 index.css 中的 token 覆盖
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-font-scale', preference.fontScale);
    root.setAttribute('data-color-theme', preference.colorTheme);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
    } catch {
      /* 隐私模式下 localStorage 不可用，仅本次会话生效 */
    }
    // 切换时挂 180ms 色彩过渡（首帧挂载不闪动画）
    if (mounted.current) {
      root.classList.add('theme-transitioning');
      const timer = window.setTimeout(() => root.classList.remove('theme-transitioning'), 200);
      return () => window.clearTimeout(timer);
    }
    mounted.current = true;
  }, [preference]);

  const setFontScale = useCallback((fontScale: FontScale) => {
    setPreference(prev => prev.fontScale === fontScale ? prev : { ...prev, fontScale });
  }, []);

  const setColorTheme = useCallback((colorTheme: ColorTheme) => {
    setPreference(prev => prev.colorTheme === colorTheme ? prev : { ...prev, colorTheme });
  }, []);

  const resetToDefault = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setPreference(prev =>
      prev.fontScale === DEFAULT_PREFERENCE.fontScale && prev.colorTheme === DEFAULT_PREFERENCE.colorTheme
        ? prev
        : { ...DEFAULT_PREFERENCE });
  }, []);

  return (
    <DisplayPreferenceContext.Provider value={{ preference, setFontScale, setColorTheme, resetToDefault }}>
      {children}
    </DisplayPreferenceContext.Provider>
  );
}

export function useDisplayPreference() {
  const ctx = useContext(DisplayPreferenceContext);
  if (!ctx) throw new Error('useDisplayPreference 必须在 DisplayPreferenceProvider 内使用');
  return ctx;
}

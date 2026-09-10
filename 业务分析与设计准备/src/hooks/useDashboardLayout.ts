import { useCallback, useEffect, useRef, useState } from 'react';
import type { SectionSize, SectionSizeSpec } from '../utils/dashboardGrid';
import { clampSize, sizeSpec } from '../utils/dashboardGrid';

export interface DashboardLayoutState {
  order: string[];
  hidden: string[];
  sizes: Record<string, SectionSize>;
}

function storageKey(boardKey: 'pharma' | 'provider' | 'platform') {
  return `beiyi.dashboardLayout.${boardKey}`;
}

function defaultSizes(specs: Record<string, SectionSizeSpec>): Record<string, SectionSize> {
  const sizes: Record<string, SectionSize> = {};
  for (const [id, spec] of Object.entries(specs)) {
    sizes[id] = { w: spec.w, h: spec.h };
  }
  return sizes;
}

function defaultState(sectionIds: string[], defaultHidden: string[], specs: Record<string, SectionSizeSpec>): DashboardLayoutState {
  const known = new Set(sectionIds);
  return {
    order: [...sectionIds],
    hidden: defaultHidden.filter(id => known.has(id)),
    sizes: defaultSizes(specs),
  };
}

function sanitize(
  raw: unknown,
  sectionIds: string[],
  defaultHidden: string[],
  specs: Record<string, SectionSizeSpec>,
): DashboardLayoutState {
  const fallback = defaultState(sectionIds, defaultHidden, specs);
  if (!raw || typeof raw !== 'object') return fallback;

  const known = new Set(sectionIds);
  const parsed = raw as { order?: unknown; hidden?: unknown; sizes?: unknown };
  const order: string[] = [];

  if (Array.isArray(parsed.order)) {
    for (const id of parsed.order) {
      if (typeof id === 'string' && known.has(id) && !order.includes(id)) {
        order.push(id);
      }
    }
  }
  for (const id of sectionIds) {
    if (!order.includes(id)) order.push(id);
  }

  const hidden: string[] = [];
  if (Array.isArray(parsed.hidden)) {
    for (const id of parsed.hidden) {
      if (typeof id === 'string' && known.has(id) && !hidden.includes(id)) {
        hidden.push(id);
      }
    }
  }

  // 已保存尺寸按规格钳制；未保存过的板块取默认尺寸（兼容旧版仅 order/hidden 的存档）
  const sizes: Record<string, SectionSize> = defaultSizes(specs);
  if (parsed.sizes && typeof parsed.sizes === 'object') {
    for (const [id, value] of Object.entries(parsed.sizes as Record<string, unknown>)) {
      const spec = specs[id];
      if (!spec || !value || typeof value !== 'object') continue;
      const rawSize = value as { w?: unknown; h?: unknown };
      if (typeof rawSize.w !== 'number' || typeof rawSize.h !== 'number') continue;
      sizes[id] = clampSize({ w: rawSize.w, h: rawSize.h }, spec);
    }
  }

  return { order, hidden, sizes };
}

function readLayout(
  boardKey: 'pharma' | 'provider' | 'platform',
  sectionIds: string[],
  defaultHidden: string[],
  specs: Record<string, SectionSizeSpec>,
): DashboardLayoutState {
  try {
    const raw = localStorage.getItem(storageKey(boardKey));
    if (!raw) return defaultState(sectionIds, defaultHidden, specs);
    return sanitize(JSON.parse(raw), sectionIds, defaultHidden, specs);
  } catch {
    return defaultState(sectionIds, defaultHidden, specs);
  }
}

function writeLayout(boardKey: 'pharma' | 'provider' | 'platform', state: DashboardLayoutState) {
  try {
    localStorage.setItem(storageKey(boardKey), JSON.stringify(state));
  } catch {
    /* 隐私模式下 localStorage 不可用，仅本次会话生效 */
  }
}

export function useDashboardLayout(
  boardKey: 'pharma' | 'provider' | 'platform',
  sectionIds: string[],
  defaultHidden: string[],
  specs: Record<string, SectionSizeSpec>,
): {
  order: string[];
  hidden: string[];
  sizes: Record<string, SectionSize>;
  toggleVisible: (id: string) => void;
  moveSection: (fromId: string, toId: string, after?: boolean) => void;
  setSize: (id: string, size: SectionSize) => void;
  resetLayout: () => void;
} {
  const idsRef = useRef(sectionIds);
  const defaultHiddenRef = useRef(defaultHidden);
  const specsRef = useRef(specs);
  idsRef.current = sectionIds;
  defaultHiddenRef.current = defaultHidden;
  specsRef.current = specs;

  const idsSignature = sectionIds.join('|');
  const hiddenSignature = defaultHidden.join('|');
  const specsSignature = Object.keys(specs).sort().join('|');
  const [state, setState] = useState<DashboardLayoutState>(() => readLayout(boardKey, sectionIds, defaultHidden, specs));

  useEffect(() => {
    setState(readLayout(boardKey, idsRef.current, defaultHiddenRef.current, specsRef.current));
  }, [boardKey, idsSignature, hiddenSignature, specsSignature]);

  const toggleVisible = useCallback(
    (id: string) => {
      if (!idsRef.current.includes(id)) return;
      setState(prev => {
        const hidden = prev.hidden.includes(id) ? prev.hidden.filter(item => item !== id) : [...prev.hidden, id];
        const next = { ...prev, hidden };
        writeLayout(boardKey, next);
        return next;
      });
    },
    [boardKey],
  );

  const moveSection = useCallback(
    (fromId: string, toId: string, after?: boolean) => {
      setState(prev => {
        if (fromId === toId) return prev;
        const order = [...prev.order];
        const fromIndex = order.indexOf(fromId);
        const toIndex = order.indexOf(toId);
        if (fromIndex < 0 || toIndex < 0) return prev;
        order.splice(fromIndex, 1);
        let insertAt = order.indexOf(toId);
        if (insertAt < 0) {
          order.push(fromId);
        } else {
          if (after) insertAt += 1;
          order.splice(insertAt, 0, fromId);
        }
        const next = { ...prev, order };
        writeLayout(boardKey, next);
        return next;
      });
    },
    [boardKey],
  );

  const setSize = useCallback(
    (id: string, size: SectionSize) => {
      const spec = specsRef.current[id] ?? sizeSpec(12, 4, 2, 2);
      const clamped = clampSize(size, spec);
      setState(prev => {
        const current = prev.sizes[id];
        if (current && current.w === clamped.w && current.h === clamped.h) return prev;
        const next = { ...prev, sizes: { ...prev.sizes, [id]: clamped } };
        writeLayout(boardKey, next);
        return next;
      });
    },
    [boardKey],
  );

  const resetLayout = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(boardKey));
    } catch {
      /* ignore */
    }
    setState(defaultState(idsRef.current, defaultHiddenRef.current, specsRef.current));
  }, [boardKey]);

  return {
    order: state.order,
    hidden: state.hidden,
    sizes: state.sizes,
    toggleVisible,
    moveSection,
    setSize,
    resetLayout,
  };
}

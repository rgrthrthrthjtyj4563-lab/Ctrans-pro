/**
 * 锚定浮层：Portal 到 body、以触发元素为基准 fixed 定位并实时跟随，
 * 不受表格 / 弹窗正文的 overflow 裁切；下方空间不足时自动向上展开。
 *
 * 关闭时机（本组件统一处理）：
 * - 点击浮层与触发元素以外的区域
 * - Escape（捕获阶段截停，只关浮层，不触发外层 Modal / ConfirmDialog 的 Esc）
 * - 触发元素被滚动祖先裁出可视区（避免浮层与触发元素脱节）
 */
import { useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import './AnchoredPopover.css';

/** 高于全局 Modal（1000），低于弹窗内叠加层（1100+）与 Toast（2000） */
const Z_INDEX = 1050;
const GAP = 6;
const EDGE = 8;

/** 触发元素是否已被某个带裁切的滚动祖先完全裁出（html/body/#root 的 overflow:hidden 也算） */
function clippedOutOfView(anchor: HTMLElement): boolean {
  const r = anchor.getBoundingClientRect();
  for (let el = anchor.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'hidden') continue;
    const c = el.getBoundingClientRect();
    if (r.bottom <= c.top || r.top >= c.bottom) return true;
  }
  return false;
}

/** 触发元素的位置签名：逐帧比对用，变了才重新定位 */
function anchorSignature(anchorRef: RefObject<HTMLElement | null>): string {
  const r = anchorRef.current?.getBoundingClientRect();
  return r ? `${r.left},${r.top},${r.width},${r.height}` : '';
}

interface Props {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  /** 与触发元素等宽（下拉面板）；默认按内容宽度、与触发元素左对齐 */
  matchWidth?: boolean;
  maxHeight?: number;
  /** 面板元素引用：使用方做焦点管理 / 键盘导航用 */
  panelRef?: RefObject<HTMLDivElement | null>;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}

export function AnchoredPopover({
  anchorRef,
  onClose,
  children,
  matchWidth = false,
  maxHeight = 320,
  panelRef,
  onKeyDown,
}: Props) {
  const ownRef = useRef<HTMLDivElement>(null);

  // 无依赖：每次渲染后重新定位，内容高度变化（如搜索过滤）后仍贴合触发元素
  useLayoutEffect(() => {
    const panel = ownRef.current;
    if (!panel) return;

    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      if (clippedOutOfView(anchor)) return onClose();

      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // 先归零再量自然尺寸：上次的限高 / 左偏移会压缩自适应宽高，影响本次判断
      panel.style.maxHeight = 'none';
      panel.style.left = '0px';
      if (matchWidth) panel.style.width = `${r.width}px`;
      const below = vh - r.bottom - EDGE;
      const above = r.top - EDGE;
      const up = panel.offsetHeight + GAP > below && above > below;

      panel.style.left = `${Math.max(EDGE, Math.min(r.left, vw - EDGE - panel.offsetWidth))}px`;
      panel.style.transformOrigin = up ? 'bottom center' : 'top center';
      // 限高到展开侧的可用空间：面板内部滚动，始终不伸出视口
      panel.style.maxHeight = `${Math.min(maxHeight, Math.max(0, (up ? above : below) - GAP))}px`;
      if (up) {
        panel.style.top = 'auto';
        panel.style.bottom = `${vh - r.top + GAP}px`;
      } else {
        panel.style.bottom = 'auto';
        panel.style.top = `${r.bottom + GAP}px`;
      }
    };

    place();

    // 逐帧比对触发元素的位置：覆盖弹窗入场动画、布局位移与各类内部滚动
    // （scroll 事件不冒泡，逐帧比对比逐个滚动容器监听更省心）。位置没变就不重新定位。
    let frame = 0;
    let lastSignature = anchorSignature(anchorRef);
    const track = () => {
      const next = anchorSignature(anchorRef);
      if (next !== lastSignature) {
        lastSignature = next;
        place();
      }
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);

    // 视口变化会改变上下可用空间，触发元素不动时也要重算
    const onResize = () => place();
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panel.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  });

  return createPortal(
    <div
      ref={node => {
        ownRef.current = node;
        if (panelRef) panelRef.current = node;
      }}
      className="ap-popover"
      style={{ zIndex: Z_INDEX }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    document.body,
  );
}

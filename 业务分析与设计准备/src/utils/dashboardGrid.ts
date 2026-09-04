// 工作台网格布局引擎：12 列网格 + 行高固定 + 逐行紧凑排布（first-fit packing）。
// 布局 = 顺序(order) + 每块尺寸(w/h)，坐标不落库、由 packLayout 推导，
// 因此拖拽/缩放后其余卡片自动避让重排，结构上保证不重叠。
// 新增板块只需在注册表里声明 size 规格（默认/最小/最大），即可接入布局体系。

export const GRID_COLUMNS = 12;

export interface SectionSize {
  w: number;
  h: number;
}

export interface SectionSizeSpec extends SectionSize {
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
}

export interface GridPosition {
  x: number;
  y: number;
}

export function sizeSpec(w: number, h: number, minW: number, minH: number, maxW = GRID_COLUMNS, maxH = 16): SectionSizeSpec {
  return {
    w: Math.max(w, minW),
    h: Math.max(h, minH),
    minW: Math.max(1, minW),
    minH: Math.max(1, minH),
    maxW: Math.min(Math.max(maxW, minW), GRID_COLUMNS),
    maxH: Math.max(maxH, minH),
  };
}

export function clampSize(size: SectionSize, spec: SectionSizeSpec): SectionSize {
  return {
    w: Math.min(Math.max(Math.round(size.w), spec.minW), spec.maxW),
    h: Math.min(Math.max(Math.round(size.h), spec.minH), spec.maxH),
  };
}

interface Occupancy {
  has(row: number, col: number): boolean;
  fill(row: number, col: number, w: number, h: number): void;
}

function createOccupancy(): Occupancy {
  const rows = new Map<number, Set<number>>();
  return {
    has(row, col) {
      return rows.get(row)?.has(col) ?? false;
    },
    fill(row, col, w, h) {
      for (let r = row; r < row + h; r += 1) {
        let cols = rows.get(r);
        if (!cols) {
          cols = new Set<number>();
          rows.set(r, cols);
        }
        for (let c = col; c < col + w; c += 1) cols.add(c);
      }
    },
  };
}

/** 顺序 + 尺寸 → 每块坐标：按顺序逐个放在第一个不重叠的位置（行优先扫描） */
export function packLayout(order: string[], sizes: Record<string, SectionSize>): Record<string, GridPosition> {
  const occupied = createOccupancy();
  const positions: Record<string, GridPosition> = {};
  let maxRow = 0;

  for (const id of order) {
    const raw = sizes[id];
    const w = Math.min(Math.max(1, Math.round(raw?.w ?? GRID_COLUMNS)), GRID_COLUMNS);
    const h = Math.max(1, Math.round(raw?.h ?? 1));
    let placedAt: GridPosition | null = null;

    for (let row = 0; row <= maxRow && !placedAt; row += 1) {
      for (let col = 0; col + w <= GRID_COLUMNS; col += 1) {
        let free = true;
        for (let r = row; r < row + h && free; r += 1) {
          for (let c = col; c < col + w && free; c += 1) {
            if (occupied.has(r, c)) free = false;
          }
        }
        if (free) {
          placedAt = { x: col, y: row };
          break;
        }
      }
    }

    const pos = placedAt ?? { x: 0, y: maxRow };
    occupied.fill(pos.y, pos.x, w, h);
    positions[id] = pos;
    maxRow = Math.max(maxRow, pos.y + h);
  }

  return positions;
}

/** 拖拽预览：把 fromId 移动到 toId 前/后，返回新顺序（不改原数组） */
export function applyMove(order: string[], fromId: string, toId: string, after: boolean): string[] {
  if (fromId === toId || !order.includes(fromId) || !order.includes(toId)) return order;
  const next = order.filter(id => id !== fromId);
  const toIndex = next.indexOf(toId);
  next.splice(after ? toIndex + 1 : toIndex, 0, fromId);
  return next;
}

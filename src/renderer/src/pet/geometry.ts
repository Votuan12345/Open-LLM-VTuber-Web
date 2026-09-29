// Coordinate helpers for the full-virtual-screen pet window.
//
// Chain: screen DIP -> window client CSS px (minus window origin) -> canvas
// device px (x devicePixelRatio) -> Cubism logical view coordinates. The
// logical mapping matches LAppView._deviceToScreen and the landscape branch of
// LAppLive2DManager.onUpdate's projection: scale 2/height, y flipped, origin at
// the canvas centre. Pure module: no React, Electron or WebSDK imports.

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: number;
  bounds: Rect;
  workArea: Rect;
  scaleFactor: number;
}

export interface Layout {
  windowOrigin: Point;
  displays: DisplayInfo[];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const screenToClient = (p: Point, origin: Point): Point => ({ x: p.x - origin.x, y: p.y - origin.y });
export const clientToScreen = (p: Point, origin: Point): Point => ({ x: p.x + origin.x, y: p.y + origin.y });
export const clientToDevice = (p: Point, dpr: number): Point => ({ x: p.x * dpr, y: p.y * dpr });
export const deviceToClient = (p: Point, dpr: number): Point => ({ x: p.x / dpr, y: p.y / dpr });

export function deviceToLogical(p: Point, canvasW: number, canvasH: number): Point {
  const s = 2 / canvasH;
  return { x: (p.x - canvasW / 2) * s, y: -(p.y - canvasH / 2) * s };
}

export function logicalToDevice(p: Point, canvasW: number, canvasH: number): Point {
  const s = 2 / canvasH;
  return { x: p.x / s + canvasW / 2, y: -p.y / s + canvasH / 2 };
}

/**
 * Bounds of drawable vertices (model space) after the 4x4 column-major model
 * matrix `m`, in logical coordinates. `null` when there are no vertices.
 */
export function unionBounds(vertices: ArrayLike<number>[], m: ArrayLike<number>): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    for (let i = 0; i + 1 < v.length; i += 2) {
      const x = m[0] * v[i] + m[4] * v[i + 1] + m[12];
      const y = m[1] * v[i] + m[5] * v[i + 1] + m[13];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

export const shrink = (r: Rect, px: number): Rect => ({
  x: r.x + px,
  y: r.y + px,
  width: r.width - 2 * px,
  height: r.height - 2 * px,
});

export const rectCenter = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export const containsPoint = (r: Rect, p: Point): boolean =>
  p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

/** Box moved the minimum distance to lie inside `area`; `null` if it cannot fit. */
export function clampBoxToArea(box: Rect, area: Rect): Rect | null {
  if (box.width > area.width || box.height > area.height) return null;
  const x = Math.min(Math.max(box.x, area.x), area.x + area.width - box.width);
  const y = Math.min(Math.max(box.y, area.y), area.y + area.height - box.height);
  return { x, y, width: box.width, height: box.height };
}

function distanceToRect(p: Point, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

/** Display whose bounds contain `p`, else the nearest one; `null` without displays. */
export function displayFor(p: Point, layout: Layout): DisplayInfo | null {
  let best: DisplayInfo | null = null;
  let bestDist = Infinity;
  for (const d of layout.displays) {
    if (containsPoint(d.bounds, p)) return d;
    const dist = distanceToRect(p, d.bounds);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

// Picks the concrete target (box top-left, screen DIP) for a movement command.
// Rules: backend mili_docs/PHASE_3_SPEC.md §7.3. Pure module.
import {
  DisplayInfo,
  Layout,
  Point,
  Rect,
  clampBoxToArea,
  containsPoint,
  displayFor,
  rectCenter,
  shrink,
} from './geometry';
import type { Anchor, MovementCommand } from './protocol';

export const MARGIN = 8;
export const SHORT: [number, number] = [80, 250];
export const LONG: [number, number] = [250, 600];
export const MAX_VERTICAL_RATIO = 0.3;
export const MIN_MOVE = 20;

export interface PlanState {
  /** Model bounding box in screen DIP. */
  box: Rect;
  /** Stored home (box top-left) or null. */
  home: Point | null;
}

export type Plan =
  | { ok: true; target: Point; anchor: Anchor }
  | { ok: false; reason: 'no_room' | 'home_invalid' | 'invalid_rect' };

const moved = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const areaOf = (d: DisplayInfo) => shrink(d.workArea, MARGIN);

function place(box: Rect, at: Point, area: Rect): Point | null {
  const clamped = clampBoxToArea({ ...box, x: at.x, y: at.y }, area);
  return clamped ? { x: clamped.x, y: clamped.y } : null;
}

function planWander(cmd: Extract<MovementCommand, { command: 'wander' }>, box: Rect, area: Rect, rng: () => number): Plan {
  if (!clampBoxToArea(box, area)) return { ok: false, reason: 'no_room' };
  const [min, max] = cmd.params.distance === 'long' ? LONG : SHORT;
  const distance = min + rng() * (max - min);
  const dir = rng() < 0.5 ? -1 : 1;
  const dy = (rng() * 2 - 1) * MAX_VERTICAL_RATIO * distance;
  for (const d of [dir, -dir]) {
    const target = place(box, { x: box.x + d * distance, y: box.y + dy }, area);
    if (target && moved(target, box) >= MIN_MOVE) return { ok: true, target, anchor: 'free' };
  }
  return { ok: false, reason: 'no_room' };
}

function planEdge(cmd: Extract<MovementCommand, { command: 'go_edge' }>, box: Rect, area: Rect): Plan {
  let { side } = cmd.params;
  if (side === 'nearest') {
    const cx = box.x + box.width / 2;
    side = cx - area.x <= area.x + area.width - cx ? 'left' : 'right';
  }
  const x = side === 'left' ? area.x : area.x + area.width - box.width;
  const target = place(box, { x, y: box.y }, area);
  return target ? { ok: true, target, anchor: 'edge' } : { ok: false, reason: 'no_room' };
}

function planHome(box: Rect, home: Point | null, layout: Layout): Plan {
  if (!home) return { ok: false, reason: 'home_invalid' };
  const center = rectCenter({ ...box, x: home.x, y: home.y });
  const display =
    layout.displays.find((d) => containsPoint(d.bounds, center)) ??
    layout.displays.find((d) => containsPoint(d.bounds, home));
  if (!display) return { ok: false, reason: 'home_invalid' };
  const target = place(box, home, areaOf(display));
  return target ? { ok: true, target, anchor: 'home' } : { ok: false, reason: 'no_room' };
}

function planApproach(box: Rect, rect: Rect | null | undefined, layout: Layout): Plan {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return { ok: false, reason: 'invalid_rect' };
  const display = displayFor(rectCenter(rect), layout);
  if (!display) return { ok: false, reason: 'invalid_rect' };
  const area = areaOf(display);
  const bottom = Math.min(rect.y + rect.height, area.y + area.height);
  const target = place(box, { x: rect.x + rect.width - box.width - MARGIN, y: bottom - box.height }, area);
  return target ? { ok: true, target, anchor: 'free' } : { ok: false, reason: 'no_room' };
}

/**
 * Target for a movement command. `rectDip` is the approach rectangle already
 * converted to DIP by the main process (only used by `approach_rect`).
 */
export function planTarget(
  cmd: MovementCommand,
  state: PlanState,
  layout: Layout,
  rng: () => number,
  rectDip?: Rect | null,
): Plan {
  const { box } = state;
  if (cmd.command === 'go_home') return planHome(box, state.home, layout);
  if (cmd.command === 'approach_rect') return planApproach(box, rectDip, layout);

  const display = displayFor(rectCenter(box), layout);
  if (!display) return { ok: false, reason: 'no_room' };
  const area = areaOf(display);
  if (cmd.command === 'wander') return planWander(cmd, box, area, rng);
  return planEdge(cmd, box, area);
}

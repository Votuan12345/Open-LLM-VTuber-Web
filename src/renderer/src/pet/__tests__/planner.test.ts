import { describe, expect, it } from 'vitest';
import type { Layout, Rect } from '../geometry';
import type { MovementCommand } from '../protocol';
import { LONG, MARGIN, MIN_MOVE, SHORT, planTarget } from '../planner';

const MAIN = { x: 0, y: 0, width: 1920, height: 1080 };
const MAIN_WORK = { x: 0, y: 0, width: 1920, height: 1040 };
const LEFT = { x: -1920, y: 0, width: 1920, height: 1080 };
const LEFT_WORK = { x: -1920, y: 0, width: 1920, height: 1040 };

const layout: Layout = {
  windowOrigin: { x: -1920, y: 0 },
  displays: [
    { id: 1, bounds: MAIN, workArea: MAIN_WORK, scaleFactor: 1 },
    { id: 2, bounds: LEFT, workArea: LEFT_WORK, scaleFactor: 1 },
  ],
};

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const wander = (distance: 'short' | 'long'): MovementCommand => ({
  id: 'c-1',
  command: 'wander',
  params: { distance, speed: 'normal' },
});

const box = (x: number, y: number, width = 300, height = 500): Rect => ({ x, y, width, height });

function inside(b: Rect, area: Rect) {
  return b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height;
}

const shrunk = (r: Rect) => ({ x: r.x + MARGIN, y: r.y + MARGIN, width: r.width - 2 * MARGIN, height: r.height - 2 * MARGIN });

describe('planTarget wander', () => {
  it('wander stays inside the shrunk work area', () => {
    const rng = seeded(42);
    for (let i = 0; i < 200; i += 1) {
      const distance = i % 2 === 0 ? 'short' : 'long';
      const start = box(200 + ((i * 97) % 1300), 100 + ((i * 53) % 400));
      const plan = planTarget(wander(distance), { box: start, home: null }, layout, rng);
      if (!plan.ok) {
        expect(plan.reason).toBe('no_room');
        continue;
      }
      const target = { ...start, x: plan.target.x, y: plan.target.y };
      expect(inside(target, shrunk(MAIN_WORK))).toBe(true);
      expect(plan.anchor).toBe('free');
      const moved = Math.hypot(target.x - start.x, target.y - start.y);
      expect(moved).toBeGreaterThanOrEqual(MIN_MOVE);
      const [, max] = distance === 'short' ? SHORT : LONG;
      expect(moved).toBeLessThanOrEqual(max * Math.hypot(1, 0.3) + 1e-6);
    }
  });

  it('wander tries the opposite direction when blocked', () => {
    const start = box(1920 - MARGIN - 300, 200);
    // distance 0.5 of range, direction right (>= 0.5), no vertical component
    const plan = planTarget(wander('short'), { box: start, home: null }, layout, seq(0.5, 0.9, 0.5));
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.target.x).toBeLessThan(start.x - MIN_MOVE);
  });

  it('wander returns no_room when the box is bigger than the area', () => {
    const plan = planTarget(wander('short'), { box: box(0, 0, 1910, 500), home: null }, layout, seeded(1));
    expect(plan).toEqual({ ok: false, reason: 'no_room' });
  });

  it('targets use the display containing the box centre', () => {
    const rng = seeded(7);
    for (let i = 0; i < 50; i += 1) {
      const start = box(-1500, 300);
      const plan = planTarget(wander('long'), { box: start, home: null }, layout, rng);
      if (plan.ok) expect(inside({ ...start, ...plan.target }, shrunk(LEFT_WORK))).toBe(true);
    }
  });
});

describe('planTarget go_edge', () => {
  const edge: MovementCommand = { id: 'c-2', command: 'go_edge', params: { side: 'nearest' } };

  it('go_edge nearest picks the closer side and keeps y', () => {
    const right = planTarget(edge, { box: box(1200, 300), home: null }, layout, seeded(1));
    expect(right).toEqual({ ok: true, target: { x: 1920 - MARGIN - 300, y: 300 }, anchor: 'edge' });
    const left = planTarget(edge, { box: box(200, 300), home: null }, layout, seeded(1));
    expect(left).toEqual({ ok: true, target: { x: MARGIN, y: 300 }, anchor: 'edge' });
  });

  it('go_edge honours an explicit side and clamps y', () => {
    const cmd: MovementCommand = { id: 'c-3', command: 'go_edge', params: { side: 'right' } };
    const plan = planTarget(cmd, { box: box(100, 900), home: null }, layout, seeded(1));
    expect(plan).toEqual({ ok: true, target: { x: 1920 - MARGIN - 300, y: 1040 - MARGIN - 500 }, anchor: 'edge' });
  });
});

describe('planTarget go_home', () => {
  const home: MovementCommand = { id: 'c-4', command: 'go_home', params: {} };

  it('go_home returns home with anchor home', () => {
    const plan = planTarget(home, { box: box(100, 100), home: { x: 900, y: 400 } }, layout, seeded(1));
    expect(plan).toEqual({ ok: true, target: { x: 900, y: 400 }, anchor: 'home' });
  });

  it('go_home clamps a home that sticks out of its work area', () => {
    const plan = planTarget(home, { box: box(100, 100), home: { x: 1800, y: 400 } }, layout, seeded(1));
    expect(plan).toEqual({ ok: true, target: { x: 1920 - MARGIN - 300, y: 400 }, anchor: 'home' });
  });

  it('go_home rejects and resets when home is on no display', () => {
    const plan = planTarget(home, { box: box(100, 100), home: { x: 5000, y: 400 } }, layout, seeded(1));
    expect(plan).toEqual({ ok: false, reason: 'home_invalid' });
    expect(planTarget(home, { box: box(100, 100), home: null }, layout, seeded(1))).toEqual({
      ok: false,
      reason: 'home_invalid',
    });
  });
});

describe('planTarget approach_rect', () => {
  const approach = (rect: Rect): MovementCommand => ({ id: 'c-5', command: 'approach_rect', params: { rect } });

  it('approach_rect targets the rect bottom-right, clamped', () => {
    const rect = { x: 100, y: 100, width: 1000, height: 600 };
    const plan = planTarget(approach(rect), { box: box(1500, 100) , home: null }, layout, seeded(1), rect);
    expect(plan).toEqual({ ok: true, target: { x: 1100 - 300 - MARGIN, y: 700 - 500 }, anchor: 'free' });

    const tall = { x: 0, y: 0, width: 1920, height: 1080 };
    const clamped = planTarget(approach(tall), { box: box(100, 100), home: null }, layout, seeded(1), tall);
    expect(clamped).toEqual({
      ok: true,
      target: { x: 1920 - MARGIN - 300, y: 1040 - MARGIN - 500 },
      anchor: 'free',
    });
  });

  it('approach_rect on another display targets that display', () => {
    const rect = { x: -1800, y: 100, width: 800, height: 700 };
    const plan = planTarget(approach(rect), { box: box(100, 100), home: null }, layout, seeded(1), rect);
    expect(plan).toEqual({ ok: true, target: { x: -1000 - 300 - MARGIN, y: 800 - 500 }, anchor: 'free' });
  });

  it('approach_rect rejects a null or empty rect', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(planTarget(approach(rect), { box: box(100, 100), home: null }, layout, seeded(1), null)).toEqual({
      ok: false,
      reason: 'invalid_rect',
    });
    const empty = { x: 0, y: 0, width: 0, height: 10 };
    expect(planTarget(approach(empty), { box: box(100, 100), home: null }, layout, seeded(1), empty)).toEqual({
      ok: false,
      reason: 'invalid_rect',
    });
  });
});

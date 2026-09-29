import { describe, expect, it } from 'vitest';
import {
  Layout,
  clampBoxToArea,
  clientToDevice,
  clientToScreen,
  deviceToClient,
  deviceToLogical,
  displayFor,
  logicalToDevice,
  screenToClient,
  shrink,
  unionBounds,
} from '../geometry';

const W = 3840;
const H = 1080;

describe('coordinate conversions', () => {
  it('round-trips screen -> logical -> screen for several dpr values', () => {
    const origin = { x: -1920, y: 0 };
    for (const dpr of [1, 1.25, 1.5]) {
      const cw = W * dpr;
      const ch = H * dpr;
      for (const p of [
        { x: -1920, y: 0 },
        { x: 0, y: 540 },
        { x: 1234.5, y: 999 },
      ]) {
        const logical = deviceToLogical(clientToDevice(screenToClient(p, origin), dpr), cw, ch);
        const back = clientToScreen(deviceToClient(logicalToDevice(logical, cw, ch), dpr), origin);
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
    }
  });

  it('matches LAppView._deviceToScreen for a landscape canvas', () => {
    expect(deviceToLogical({ x: W / 2, y: H / 2 }, W, H)).toEqual({ x: 0, y: -0 });
    const tl = deviceToLogical({ x: 0, y: 0 }, W, H);
    expect(tl.x).toBeCloseTo(-W / H, 9);
    expect(tl.y).toBeCloseTo(1, 9);
    const br = deviceToLogical({ x: W, y: H }, W, H);
    expect(br.x).toBeCloseTo(W / H, 9);
    expect(br.y).toBeCloseTo(-1, 9);
  });

  it('screenToClient subtracts the window origin', () => {
    expect(screenToClient({ x: 10, y: 20 }, { x: -1920, y: -5 })).toEqual({ x: 1930, y: 25 });
  });
});

describe('unionBounds', () => {
  it('applies the model matrix to all vertices', () => {
    // scale 0.5, translate (1, -0.25)
    const m = [0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1, 0, 1, -0.25, 0, 1];
    const verts = [new Float32Array([-1, -1, 1, 1]), new Float32Array([2, 0])];
    expect(unionBounds(verts, m)).toEqual({ minX: 0.5, minY: -0.75, maxX: 2, maxY: 0.25 });
  });

  it('returns null for no vertices', () => {
    expect(unionBounds([], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toBeNull();
  });
});

describe('areas', () => {
  it('shrink insets a rect on every side', () => {
    expect(shrink({ x: 0, y: 0, width: 100, height: 50 }, 8)).toEqual({ x: 8, y: 8, width: 84, height: 34 });
  });

  it('clampBoxToArea moves a box back inside', () => {
    const area = { x: 0, y: 0, width: 1000, height: 800 };
    expect(clampBoxToArea({ x: -50, y: 700, width: 200, height: 300 }, area)).toEqual({
      x: 0,
      y: 500,
      width: 200,
      height: 300,
    });
    expect(clampBoxToArea({ x: 950, y: -10, width: 100, height: 100 }, area)).toEqual({
      x: 900,
      y: 0,
      width: 100,
      height: 100,
    });
  });

  it('clampBoxToArea returns null when the box is bigger than the area', () => {
    expect(clampBoxToArea({ x: 0, y: 0, width: 1001, height: 10 }, { x: 0, y: 0, width: 1000, height: 800 })).toBeNull();
  });
});

describe('displayFor', () => {
  const layout: Layout = {
    windowOrigin: { x: -1920, y: 0 },
    displays: [
      { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 },
      { id: 2, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, workArea: { x: -1920, y: 0, width: 1920, height: 1040 }, scaleFactor: 1.25 },
    ],
  };

  it('picks the display containing the point', () => {
    expect(displayFor({ x: -100, y: 500 }, layout)?.id).toBe(2);
    expect(displayFor({ x: 100, y: 500 }, layout)?.id).toBe(1);
  });

  it('picks the nearest display when none contains the point', () => {
    expect(displayFor({ x: 2500, y: 500 }, layout)?.id).toBe(1);
    expect(displayFor({ x: -3000, y: 2000 }, layout)?.id).toBe(2);
  });

  it('returns null without displays', () => {
    expect(displayFor({ x: 0, y: 0 }, { windowOrigin: { x: 0, y: 0 }, displays: [] })).toBeNull();
  });
});

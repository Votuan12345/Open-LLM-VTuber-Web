import { describe, expect, it } from 'vitest';
import { bobOffset, durationFor, easeInOutSine } from '../motion';

describe('easeInOutSine', () => {
  it('starts at 0, ends at 1 and is monotonic', () => {
    expect(easeInOutSine(0)).toBeCloseTo(0, 12);
    expect(easeInOutSine(1)).toBeCloseTo(1, 12);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5, 12);
    let prev = -1;
    for (let i = 0; i <= 100; i += 1) {
      const v = easeInOutSine(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('clamps outside [0, 1]', () => {
    expect(easeInOutSine(-1)).toBe(0);
    expect(easeInOutSine(2)).toBe(1);
  });
});

describe('durationFor', () => {
  it('uses 120 DIP/s normal and 60 DIP/s slow, clamped to 800..8000 ms', () => {
    expect(durationFor(120, 'normal')).toBe(1000);
    expect(durationFor(120, 'slow')).toBe(2000);
    expect(durationFor(10, 'slow')).toBe(800);
    expect(durationFor(5000, 'normal')).toBe(8000);
  });
});

describe('bobOffset', () => {
  it('is zero at both ends and never exceeds 4 DIP', () => {
    for (const ms of [800, 2500, 8000]) {
      expect(bobOffset(0, ms)).toBeCloseTo(0, 9);
      expect(bobOffset(1, ms)).toBeCloseTo(0, 9);
      for (let i = 0; i <= 200; i += 1) {
        expect(Math.abs(bobOffset(i / 200, ms))).toBeLessThanOrEqual(4 + 1e-9);
      }
    }
    expect(Math.abs(bobOffset(0.125, 1000))).toBeGreaterThan(1);
  });
});

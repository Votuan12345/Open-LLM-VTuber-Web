import { describe, expect, it } from 'vitest';
import { expressionForSilentPayload } from '../silent-expression';
import { pickTapMotion, shouldPlayTapMotion } from '../tap-motion';

describe('expressionForSilentPayload (A)', () => {
  it('returns the first expression of a payload without audio', () => {
    expect(expressionForSilentPayload('', [2])).toBe(2);
    expect(expressionForSilentPayload('', ['anger'])).toBe('anger');
    expect(expressionForSilentPayload('', [0])).toBe(0);
  });

  it('returns null when there is audio (the audio path applies it) or no expression', () => {
    expect(expressionForSilentPayload('UklGRg==', [2])).toBeNull();
    expect(expressionForSilentPayload('', null)).toBeNull();
    expect(expressionForSilentPayload('', [])).toBeNull();
    expect(expressionForSilentPayload('', undefined)).toBeNull();
  });
});

describe('shouldPlayTapMotion (B)', () => {
  const base = { isPet: true, aiState: 'idle', pointerInteractive: true, hasTapMotions: true };

  it('plays when idle', () => {
    expect(shouldPlayTapMotion(base)).toBe(true);
  });

  it('does not play in pet mode while Mili is thinking/speaking or listening', () => {
    expect(shouldPlayTapMotion({ ...base, aiState: 'thinking-speaking' })).toBe(false);
    expect(shouldPlayTapMotion({ ...base, aiState: 'listening' })).toBe(false);
  });

  it('keeps upstream behavior in window mode', () => {
    expect(shouldPlayTapMotion({ ...base, isPet: false, aiState: 'thinking-speaking' })).toBe(true);
  });

  it('respects pointerInteractive and missing tapMotions', () => {
    expect(shouldPlayTapMotion({ ...base, pointerInteractive: false })).toBe(false);
    expect(shouldPlayTapMotion({ ...base, hasTapMotions: false })).toBe(false);
  });
});

describe('pickTapMotion (C)', () => {
  const tap = { HitAreaHead: { '': 1 }, HitAreaBody: { '': 1 } };
  const count = (group: string) => (group === '' ? 6 : 0);

  it('only picks allowed indices when tapMotionIndices is set', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      const r = (i + 0.5) / 200;
      const pick = pickTapMotion(tap, 'HitAreaHead', { '': [0, 1, 2] }, count, () => r);
      expect(pick).not.toBeNull();
      expect([0, 1, 2]).toContain(pick!.index);
      seen.add(pick!.index);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('picks any index of the group without restrictions (upstream behavior)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 600; i += 1) {
      const pick = pickTapMotion(tap, null, undefined, count, () => (i + 0.5) / 600);
      seen.add(pick!.index);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('uses the weights of the hit area, or all areas combined', () => {
    const weighted = { HitAreaHead: { A: 1 }, HitAreaBody: { B: 1 } };
    const counts = () => 1;
    expect(pickTapMotion(weighted, 'HitAreaHead', undefined, counts, () => 0.99)!.group).toBe('A');
    expect(pickTapMotion(weighted, null, undefined, counts, () => 0.1)!.group).toBe('A');
    expect(pickTapMotion(weighted, null, undefined, counts, () => 0.9)!.group).toBe('B');
  });

  it('ignores allowed indices that do not exist and falls back to null when none remain', () => {
    expect(pickTapMotion(tap, null, { '': [9, 10] }, count, () => 0.5)).toBeNull();
    expect(pickTapMotion(tap, null, { '': [9, 1] }, count, () => 0.5)).toEqual({ group: '', index: 1 });
    expect(pickTapMotion({}, null, undefined, count, () => 0.5)).toBeNull();
    expect(pickTapMotion(tap, null, undefined, () => 0, () => 0.5)).toBeNull();
  });
});

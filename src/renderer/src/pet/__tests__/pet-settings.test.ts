import { describe, expect, it } from 'vitest';
import { createPetSettings } from '../pet-settings';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

describe('createPetSettings', () => {
  it('has safe defaults', () => {
    const s = createPetSettings(memoryStorage());
    expect(s.getMovementEnabled()).toBe(true);
    expect(s.getHome()).toBeNull();
  });

  it('round-trips values under the mili keys', () => {
    const storage = memoryStorage();
    const s = createPetSettings(storage);
    s.setMovementEnabled(false);
    s.setHome({ x: 12.5, y: -40 });
    expect(storage.data.get('mili.pet.movementEnabled')).toBe('false');
    expect(storage.data.has('mili.pet.home')).toBe(true);
    const again = createPetSettings(storage);
    expect(again.getMovementEnabled()).toBe(false);
    expect(again.getHome()).toEqual({ x: 12.5, y: -40 });
  });

  it('ignores corrupt stored values', () => {
    const storage = memoryStorage();
    storage.setItem('mili.pet.home', '{"x":"a"}');
    storage.setItem('mili.pet.movementEnabled', 'maybe');
    const s = createPetSettings(storage);
    expect(s.getHome()).toBeNull();
    expect(s.getMovementEnabled()).toBe(true);
  });

  it('falls back to defaults when storage throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const s = createPetSettings(throwing);
    expect(() => s.setMovementEnabled(false)).not.toThrow();
    expect(() => s.setHome({ x: 1, y: 2 })).not.toThrow();
    expect(s.getMovementEnabled()).toBe(false);
    expect(s.getHome()).toEqual({ x: 1, y: 2 });
  });

  it('works in memory without storage', () => {
    const s = createPetSettings(null);
    s.setMovementEnabled(false);
    expect(s.getMovementEnabled()).toBe(false);
  });
});

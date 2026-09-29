// Per-viewer pet settings (movement toggle, home position) in localStorage.
// Every storage access is guarded; values are mirrored in memory so the app
// behaves the same when storage is blocked. Pure module (storage injected).
import type { Point } from './geometry';

export const MOVEMENT_KEY = 'mili.pet.movementEnabled';
export const HOME_KEY = 'mili.pet.home';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface PetSettings {
  getMovementEnabled(): boolean;
  setMovementEnabled(v: boolean): void;
  getHome(): Point | null;
  setHome(p: Point): void;
}

function safeGet(storage: StorageLike | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: StorageLike | null, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // blocked storage: the in-memory value still applies for this session
  }
}

function parseHome(raw: string | null): Point | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v?.x === 'number' && typeof v?.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y)) {
      return { x: v.x, y: v.y };
    }
  } catch {
    // corrupt value
  }
  return null;
}

export function createPetSettings(storage: StorageLike | null): PetSettings {
  const rawEnabled = safeGet(storage, MOVEMENT_KEY);
  let movementEnabled = rawEnabled === 'false' ? false : true;
  let home = parseHome(safeGet(storage, HOME_KEY));

  return {
    getMovementEnabled: () => movementEnabled,
    setMovementEnabled(v: boolean) {
      movementEnabled = v;
      safeSet(storage, MOVEMENT_KEY, String(v));
    },
    getHome: () => (home ? { ...home } : null),
    setHome(p: Point) {
      home = { x: p.x, y: p.y };
      safeSet(storage, HOME_KEY, JSON.stringify(home));
    },
  };
}

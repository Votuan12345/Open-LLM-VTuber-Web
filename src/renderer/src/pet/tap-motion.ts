// Tap motion policy for the Mili desktop pet. Pure module.
//
// B: in pet mode, a click while Mili is thinking/speaking/listening plays no
//    tap motion (the click still reaches the backend for mood).
// C: `tapMotionIndices` in model_dict.json (e.g. {"": [0, 1, 2]}) limits which
//    motions of a group a tap may play; without it every index is allowed, as
//    in upstream LAppModel.startTapMotion.

export type TapMotionMap = Record<string, Record<string, number>>;
export type TapMotionIndices = Record<string, number[]>;

export interface TapPolicyInput {
  isPet: boolean;
  aiState: string;
  pointerInteractive: boolean;
  hasTapMotions: boolean;
}

const BUSY_STATES = new Set(['thinking-speaking', 'listening']);

export function shouldPlayTapMotion(p: TapPolicyInput): boolean {
  if (!p.pointerInteractive || !p.hasTapMotions) return false;
  return !(p.isPet && BUSY_STATES.has(p.aiState));
}

/** Weighted group choice identical to upstream startTapMotion, then an allowed index. */
export function pickTapMotion(
  tapMotions: TapMotionMap,
  hitArea: string | null,
  indices: TapMotionIndices | undefined,
  motionCount: (group: string) => number,
  rng: () => number,
): { group: string; index: number } | null {
  let weights: Record<string, number> = {};
  if (hitArea && tapMotions[hitArea]) {
    weights = { ...tapMotions[hitArea] };
  } else {
    for (const area of Object.values(tapMotions)) {
      for (const [group, w] of Object.entries(area)) {
        weights[group] = (weights[group] ?? 0) + Number(w);
      }
    }
  }
  const groups = Object.keys(weights);
  const total = groups.reduce((sum, g) => sum + (Number.isFinite(weights[g]) ? weights[g] : 0), 0);
  if (total <= 0) return null;

  let r = rng() * total;
  let group: string | null = null;
  for (const g of groups) {
    const w = Number.isFinite(weights[g]) ? weights[g] : 0;
    if (r < w) {
      group = g;
      break;
    }
    r -= w;
  }
  if (group === null) group = groups[groups.length - 1];

  const count = motionCount(group);
  if (count <= 0) return null;
  const allowed = indices?.[group];
  if (allowed) {
    const valid = allowed.filter((i) => Number.isInteger(i) && i >= 0 && i < count);
    if (valid.length === 0) return null;
    return { group, index: valid[Math.min(valid.length - 1, Math.floor(rng() * valid.length))] };
  }
  return { group, index: Math.min(count - 1, Math.floor(rng() * count)) };
}

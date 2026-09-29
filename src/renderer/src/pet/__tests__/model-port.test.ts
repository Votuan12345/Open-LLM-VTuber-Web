import { describe, expect, it } from 'vitest';
import { createModelPort, ModelPortEnv } from '../live2d-model-port';

const CANVAS = { width: 3840, height: 2160 }; // client 1920x1080 at dpr 2

function makeEnv(overrides: Partial<ModelPortEnv> = {}) {
  let position = { x: 0, y: 0 };
  const matrix = [0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const started: Array<[string, number, number]> = [];
  const model = {
    _modelMatrix: { getArray: () => matrix },
    getModel: () => ({
      getDrawableCount: () => 2,
      getDrawableDynamicFlagIsVisible: (i: number) => i === 0,
      getDrawableVertices: (i: number) => (i === 0 ? new Float32Array([-1, -1, 1, 1]) : new Float32Array([5, 5])),
    }),
    anyhitTest: () => null,
    isHitOnModel: (x: number, y: number) => Math.abs(x) <= 0.5 && Math.abs(y) <= 0.5,
    startMotion: (g: string, i: number, p: number) => started.push([g, i, p]),
  };
  const adapter = {
    getModel: () => model,
    getModelPosition: () => ({ ...position }),
    setModelPosition: (x: number, y: number) => {
      position = { x, y };
    },
    getMotionCount: (group: string) => (group === '' ? 4 : 0),
  };
  const env: ModelPortEnv = {
    getAdapter: () => adapter,
    getCanvasSize: () => CANVAS,
    getDpr: () => 2,
    getOrigin: () => ({ x: 0, y: 0 }),
    ...overrides,
  };
  return { env, started, getPosition: () => position };
}

describe('createModelPort', () => {
  it('computes the model box in screen DIP from visible drawables', () => {
    const { env } = makeEnv();
    expect(createModelPort(env).getBoxDip()).toEqual({ x: 690, y: 270, width: 540, height: 540 });
  });

  it('offsets the box by the window origin', () => {
    const { env } = makeEnv({ getOrigin: () => ({ x: -1920, y: 0 }) });
    expect(createModelPort(env).getBoxDip()).toEqual({ x: -1230, y: 270, width: 540, height: 540 });
  });

  it('hit-tests a screen point through the same logical mapping', () => {
    const port = createModelPort(makeEnv().env);
    expect(port.hitTestScreen({ x: 960, y: 540 })).toBe(true);
    expect(port.hitTestScreen({ x: 10, y: 10 })).toBe(false);
  });

  it('converts a DIP delta to a logical delta (y flipped)', () => {
    const d = createModelPort(makeEnv().env).dipDeltaToLogical({ x: 540, y: 540 });
    expect(d.x).toBeCloseTo(1, 9);
    expect(d.y).toBeCloseTo(-1, 9);
  });

  it('reads and writes the model position', () => {
    const { env, getPosition } = makeEnv();
    const port = createModelPort(env);
    port.setPositionLogical({ x: 0.25, y: -0.1 });
    expect(getPosition()).toEqual({ x: 0.25, y: -0.1 });
    expect(port.getPositionLogical()).toEqual({ x: 0.25, y: -0.1 });
  });

  it('validates motions and starts them at normal priority', () => {
    const { env, started } = makeEnv();
    const port = createModelPort(env);
    expect(port.hasMotion('', 3)).toBe(true);
    expect(port.hasMotion('', 4)).toBe(false);
    expect(port.hasMotion('Walk', 0)).toBe(false);
    port.startMotion('', 3);
    expect(started).toEqual([['', 3, 2]]);
  });

  it('returns null / false without a model', () => {
    const port = createModelPort(makeEnv({ getAdapter: () => null }).env);
    expect(port.getBoxDip()).toBeNull();
    expect(port.getPositionLogical()).toBeNull();
    expect(port.hitTestScreen({ x: 960, y: 540 })).toBe(false);
    expect(port.hasMotion('', 0)).toBe(false);
    expect(() => port.setPositionLogical({ x: 0, y: 0 })).not.toThrow();
  });
});

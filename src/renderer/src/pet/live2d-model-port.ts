// ModelPort over the Cubism LAppAdapter (the same calls the existing drag and
// hit test use). Everything the browser provides is injected via ModelPortEnv
// so the mapping is unit-testable.
import type { ModelPort } from './desktop-pet-controller';
import {
  Point,
  Rect,
  clientToDevice,
  clientToScreen,
  deviceToClient,
  deviceToLogical,
  logicalToDevice,
  screenToClient,
  unionBounds,
} from './geometry';

// LAppDefine.PriorityNormal; duplicated to keep this module free of WebSDK imports.
const PRIORITY_NORMAL = 2;

export interface ModelPortEnv {
  getAdapter(): any | null;
  getCanvasSize(): { width: number; height: number } | null;
  getDpr(): number;
  getOrigin(): Point;
}

export function createModelPort(env: ModelPortEnv): ModelPort {
  const model = () => env.getAdapter()?.getModel?.() ?? null;

  const toScreen = (logical: Point, canvas: { width: number; height: number }): Point =>
    clientToScreen(deviceToClient(logicalToDevice(logical, canvas.width, canvas.height), env.getDpr()), env.getOrigin());

  const toLogical = (screen: Point, canvas: { width: number; height: number }): Point =>
    deviceToLogical(clientToDevice(screenToClient(screen, env.getOrigin()), env.getDpr()), canvas.width, canvas.height);

  return {
    getBoxDip(): Rect | null {
      const m = model();
      const canvas = env.getCanvasSize();
      const core = m?.getModel?.();
      if (!m?._modelMatrix || !core || !canvas) return null;
      const vertices: ArrayLike<number>[] = [];
      const count: number = core.getDrawableCount();
      for (let i = 0; i < count; i += 1) {
        if (core.getDrawableDynamicFlagIsVisible(i)) vertices.push(core.getDrawableVertices(i));
      }
      const b = unionBounds(vertices, m._modelMatrix.getArray());
      if (!b) return null;
      const topLeft = toScreen({ x: b.minX, y: b.maxY }, canvas);
      const bottomRight = toScreen({ x: b.maxX, y: b.minY }, canvas);
      return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
    },

    getPositionLogical(): Point | null {
      const adapter = env.getAdapter();
      if (!adapter || !model()) return null;
      return adapter.getModelPosition();
    },

    setPositionLogical(p: Point): void {
      const adapter = env.getAdapter();
      if (adapter && model()) adapter.setModelPosition(p.x, p.y);
    },

    dipDeltaToLogical(d: Point): Point {
      const canvas = env.getCanvasSize();
      if (!canvas) return { x: 0, y: 0 };
      const s = (2 / canvas.height) * env.getDpr();
      return { x: d.x * s, y: -d.y * s };
    },

    hitTestScreen(p: Point): boolean {
      const m = model();
      const canvas = env.getCanvasSize();
      if (!m || !canvas) return false;
      const { x, y } = toLogical(p, canvas);
      return m.anyhitTest(x, y) !== null || m.isHitOnModel(x, y);
    },

    hasMotion(group: string, index: number): boolean {
      const adapter = env.getAdapter();
      if (!adapter || !model()) return false;
      return adapter.getMotionCount(group) > index;
    },

    startMotion(group: string, index: number): void {
      model()?.startMotion(group, index, PRIORITY_NORMAL);
    },
  };
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layout, Point, Rect } from '../geometry';
import { createPetSettings } from '../pet-settings';
import { ControllerDeps, DesktopPetController, ModelPort } from '../desktop-pet-controller';

const LAYOUT: Layout = {
  windowOrigin: { x: 0, y: 0 },
  displays: [
    {
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
    },
  ],
};

const K = 0.01; // DIP -> logical factor used by the fake model

class FakeModel implements ModelPort {
  base: Rect;

  logical: Point | null = { x: 0, y: 0 };

  motions = new Set(['|3']);

  started: Array<[string, number]> = [];

  setCalls = 0;

  constructor(box: Rect) {
    this.base = box;
  }

  getBoxDip(): Rect | null {
    if (!this.logical) return null;
    return { ...this.base, x: this.base.x + this.logical.x / K, y: this.base.y - this.logical.y / K };
  }

  getPositionLogical() {
    return this.logical ? { ...this.logical } : null;
  }

  setPositionLogical(p: Point) {
    this.setCalls += 1;
    this.logical = { ...p };
  }

  dipDeltaToLogical(d: Point): Point {
    return { x: d.x * K, y: -d.y * K };
  }

  hitTestScreen(p: Point): boolean {
    const b = this.getBoxDip();
    return !!b && p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
  }

  hasMotion(group: string, index: number) {
    return this.motions.has(`${group}|${index}`);
  }

  startMotion(group: string, index: number) {
    this.started.push([group, index]);
  }
}

function setup(opts: { box?: Rect; rng?: number[]; cursor?: Point } = {}) {
  const sent: any[] = [];
  const hover: boolean[] = [];
  let now = 1000;
  const rafs = new Map<number, (t: number) => void>();
  let rafSeq = 0;
  const rngValues = opts.rng ?? [0.5, 0.9, 0.5];
  let rngI = 0;
  const cursor = { value: opts.cursor ?? { x: -100, y: -100 } };
  const model = new FakeModel(opts.box ?? { x: 400, y: 300, width: 300, height: 500 });
  const settings = createPetSettings(null);
  const deps: ControllerDeps = {
    send: (m) => sent.push(m),
    getLayout: async () => LAYOUT,
    getCursor: vi.fn(async () => cursor.value),
    screenToDipRect: async (r) => r,
    model,
    settings,
    rng: () => rngValues[rngI++ % rngValues.length],
    now: () => now,
    raf: (cb) => {
      rafSeq += 1;
      rafs.set(rafSeq, cb);
      return rafSeq;
    },
    cancelRaf: (id) => {
      rafs.delete(id);
    },
    setHover: (h) => hover.push(h),
  };
  const ctl = new DesktopPetController(deps);
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  const step = async (ms: number) => {
    now += ms;
    const pending = [...rafs.entries()];
    rafs.clear();
    for (const [, cb] of pending) cb(now);
    await flush();
  };
  const results = () => sent.filter((m) => m.type === 'pet-status' && m.result);
  return { ctl, sent, hover, model, settings, deps, step, flush, results, cursor, rafs, advance: (ms: number) => { now += ms; } };
}

const wander = (id = 'c-1') => ({ type: 'pet-command', id, command: 'wander', params: { distance: 'short', speed: 'normal' } });

async function petReady(env: ReturnType<typeof setup>) {
  env.ctl.setMode('pet');
  await env.flush();
}

describe('DesktopPetController', () => {
  let env: ReturnType<typeof setup>;

  beforeEach(() => {
    env = setup();
  });

  it('hello sends protocol 1 with mode and toggle', () => {
    env.ctl.hello();
    expect(env.sent[0]).toEqual({ type: 'pet-hello', protocol: 1, mode: 'window', movement_enabled: true });
  });

  it('rejects when not pet mode / movement disabled / ai busy / dragging', async () => {
    await env.ctl.handleCommand(wander('c-1'));
    env.ctl.setMode('pet');
    env.ctl.setMovementEnabled(false);
    await env.ctl.handleCommand(wander('c-2'));
    env.ctl.setMovementEnabled(true);
    env.ctl.setAiBusy(true);
    await env.ctl.handleCommand(wander('c-3'));
    env.ctl.setAiBusy(false);
    env.ctl.onDragStart();
    await env.ctl.handleCommand(wander('c-4'));
    const r = env.results();
    expect(r.map((m) => [m.command_id, m.result, m.reason])).toEqual([
      ['c-1', 'rejected', 'not_pet_mode'],
      ['c-2', 'rejected', 'movement_disabled'],
      ['c-3', 'rejected', 'conversation'],
      ['c-4', 'rejected', 'user_drag'],
    ]);
    expect(env.model.setCalls).toBe(0);
  });

  it('wander moves along eased path and reports arrived once', async () => {
    await petReady(env);
    await env.ctl.handleCommand(wander());
    expect(env.ctl.state).toBe('moving');
    for (let i = 0; i < 40; i += 1) await env.step(50);
    expect(env.ctl.state).toBe('idle');
    const r = env.results();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ command_id: 'c-1', result: 'arrived', anchor: 'free', moving: false });
    // distance = 80 + 0.5*170 = 165 to the right, no vertical component
    const box = env.model.getBoxDip()!;
    expect(box.x).toBeCloseTo(565, 6);
    expect(box.y).toBeCloseTo(300, 6);
    expect(env.model.setCalls).toBeGreaterThan(5);
  });

  it('drag cancels move and reports once', async () => {
    await petReady(env);
    await env.ctl.handleCommand(wander());
    await env.step(100);
    env.ctl.onDragStart();
    const calls = env.model.setCalls;
    await env.step(100);
    await env.step(100);
    expect(env.model.setCalls).toBe(calls);
    expect(env.results().map((m) => [m.result, m.reason])).toEqual([['cancelled', 'user_drag']]);
    expect(env.ctl.state).toBe('dragging');
    env.ctl.onDragEnd();
    const last = env.sent[env.sent.length - 1];
    expect(last).toMatchObject({ type: 'pet-status', anchor: 'home', moving: false });
    const box = env.model.getBoxDip()!;
    expect(env.settings.getHome()).toEqual({ x: box.x, y: box.y });
  });

  it('new command supersedes running one', async () => {
    await petReady(env);
    await env.ctl.handleCommand(wander('c-1'));
    await env.step(100);
    await env.ctl.handleCommand(wander('c-2'));
    expect(env.results().map((m) => [m.command_id, m.result, m.reason])).toEqual([['c-1', 'cancelled', 'superseded']]);
    expect(env.ctl.state).toBe('moving');
  });

  it('stop cancels with reason stopped', async () => {
    await petReady(env);
    await env.ctl.handleCommand(wander());
    await env.ctl.handleCommand({ type: 'pet-command', id: 'c-9', command: 'stop', params: {} });
    expect(env.results().map((m) => [m.command_id, m.result, m.reason])).toEqual([['c-1', 'cancelled', 'stopped']]);
    expect(env.ctl.state).toBe('idle');
  });

  it('setAiBusy(true) mid-move cancels with conversation', async () => {
    await petReady(env);
    await env.ctl.handleCommand(wander());
    env.ctl.setAiBusy(true);
    expect(env.results().map((m) => m.reason)).toEqual(['conversation']);
  });

  it('go_home with invalid home resets home to current box', async () => {
    await petReady(env);
    env.settings.setHome({ x: 9000, y: 9000 });
    await env.ctl.handleCommand({ type: 'pet-command', id: 'c-5', command: 'go_home', params: {} });
    expect(env.results().map((m) => [m.result, m.reason])).toEqual([['rejected', 'home_invalid']]);
    expect(env.settings.getHome()).toEqual({ x: 400, y: 300 });
  });

  it('entering pet mode stores a home when none exists', async () => {
    await petReady(env);
    expect(env.settings.getHome()).toEqual({ x: 400, y: 300 });
  });

  it('refreshHover sends false when model moved away', async () => {
    env = setup({ cursor: { x: 450, y: 400 } });
    await petReady(env);
    await env.ctl.handleCommand(wander());
    for (let i = 0; i < 40; i += 1) await env.step(20);
    expect(env.hover.filter((h) => h === false)).toHaveLength(1);
    expect(env.hover[env.hover.length - 1]).toBe(false);
    // throttled to at most one cursor read per 100 ms (+1 final check)
    const reads = (env.deps.getCursor as any).mock.calls.length;
    expect(reads).toBeLessThanOrEqual(Math.ceil((40 * 20) / 100) + 2);
  });

  it('play_motion plays when present, logs fallback when missing', async () => {
    await petReady(env);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await env.ctl.handleCommand({ type: 'pet-command', id: 'c-6', command: 'play_motion', params: { group: '', index: 3 } });
    await env.ctl.handleCommand({ type: 'pet-command', id: 'c-7', command: 'play_motion', params: { group: 'Walk', index: 0 } });
    expect(env.model.started).toEqual([['', 3]]);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[Motion] fallback'))).toBe(true);
    expect(env.results()).toHaveLength(0);
    warn.mockRestore();
  });

  it('unknown command reports rejected unknown_command', async () => {
    await petReady(env);
    await env.ctl.handleCommand({ type: 'pet-command', id: 'c-8', command: 'fly', params: {} });
    expect(env.results().map((m) => [m.command_id, m.result, m.reason])).toEqual([['c-8', 'rejected', 'unknown_command']]);
  });

  it('model disappears mid-move cancels with model_reloaded', async () => {
    await petReady(env);
    await env.ctl.handleCommand(wander());
    await env.step(50);
    env.model.logical = null;
    await env.step(50);
    expect(env.results().map((m) => [m.result, m.reason])).toEqual([['cancelled', 'model_reloaded']]);
    expect(env.ctl.state).toBe('idle');
  });

  it('leaving pet mode cancels and reports mode', async () => {
    await petReady(env);
    await env.ctl.handleCommand(wander());
    env.ctl.setMode('window');
    expect(env.results().map((m) => m.reason)).toEqual(['not_pet_mode']);
    expect(env.sent[env.sent.length - 1]).toMatchObject({ type: 'pet-status', mode: 'window' });
    expect(env.ctl.state).toBe('disabled');
  });
});

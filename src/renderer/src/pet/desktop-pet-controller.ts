// The only code that moves the Live2D model automatically (backend
// mili_docs/PHASE_3_SPEC.md §4, §7). A user drag always wins. One rAF loop
// runs only while a move is in progress. All I/O is injected for testing.
import type { Layout, Point, Rect } from './geometry';
import { bobOffset, durationFor, easeInOutSine } from './motion';
import type { PetSettings } from './pet-settings';
import { planTarget } from './planner';
import {
  Anchor,
  CommandResult,
  MovementCommand,
  PetMode,
  helloMsg,
  parsePetCommand,
  statusMsg,
} from './protocol';

const HOVER_CHECK_MS = 100;

export interface ModelPort {
  /** Model bounding box in screen DIP, or null when no model is loaded. */
  getBoxDip(): Rect | null;
  getPositionLogical(): Point | null;
  setPositionLogical(p: Point): void;
  dipDeltaToLogical(d: Point): Point;
  hitTestScreen(p: Point): boolean;
  hasMotion(group: string, index: number): boolean;
  startMotion(group: string, index: number): void;
}

export interface ControllerDeps {
  send(msg: object): void;
  getLayout(): Promise<Layout>;
  getCursor(): Promise<Point>;
  screenToDipRect(r: Rect): Promise<Rect | null>;
  model: ModelPort;
  settings: PetSettings;
  rng(): number;
  now(): number;
  raf(cb: (t: number) => void): number;
  cancelRaf(id: number): void;
  /** Shared "window catches the mouse over the model" flag (also set by the mouse handlers). */
  getHover(): boolean;
  setHover(hit: boolean): void;
}

export type ControllerState = 'disabled' | 'idle' | 'moving' | 'dragging';

interface ActiveMove {
  id: string;
  startBox: Rect;
  startLogical: Point;
  target: Point;
  anchor: Anchor;
  startTime: number;
  duration: number;
  rafId: number | null;
}

export class DesktopPetController {
  private mode: PetMode = 'window';

  private aiBusy = false;

  private dragging = false;

  private anchor: Anchor = 'free';

  private move: ActiveMove | null = null;

  private commandSeq = 0;

  private lastHoverCheck = -Infinity;

  constructor(private readonly deps: ControllerDeps) {}

  get state(): ControllerState {
    if (this.mode !== 'pet' || !this.deps.settings.getMovementEnabled()) return 'disabled';
    if (this.dragging) return 'dragging';
    return this.move ? 'moving' : 'idle';
  }

  hello(): void {
    this.deps.send(helloMsg(this.mode, this.deps.settings.getMovementEnabled()));
  }

  setMode(mode: PetMode): void {
    if (mode === this.mode) return;
    if (mode !== 'pet') this.cancel('not_pet_mode');
    this.mode = mode;
    // A drag cut short by a mode switch never reports its end.
    this.dragging = false;
    this.sendStatus();
  }

  setMovementEnabled(enabled: boolean): void {
    this.deps.settings.setMovementEnabled(enabled);
    if (!enabled) this.cancel('movement_disabled');
    this.sendStatus();
  }

  setAiBusy(busy: boolean): void {
    this.aiBusy = busy;
    if (busy) this.cancel('conversation');
  }

  onDragStart(): void {
    this.dragging = true;
    this.commandSeq += 1;
    this.cancel('user_drag');
  }

  /** Pointer went down on the model: stop moving so a drag starts from where she is. */
  onGrab(): void {
    this.commandSeq += 1;
    this.cancel('user_drag');
  }

  onDragEnd(): void {
    this.dragging = false;
    const box = this.deps.model.getBoxDip();
    if (box) this.deps.settings.setHome({ x: box.x, y: box.y });
    this.anchor = 'home';
    this.sendStatus();
  }

  async handleCommand(msg: unknown): Promise<void> {
    const parsed = parsePetCommand(msg);
    if (!parsed.ok) {
      console.warn(`[Pet] rejected command ${parsed.id ?? '?'}: ${parsed.reason}`);
      if (parsed.id) this.sendResult(parsed.id, 'rejected', parsed.reason);
      return;
    }
    const { cmd } = parsed;
    console.log(`[Pet] command ${cmd.command} id=${cmd.id}`);

    if (cmd.command === 'play_motion') {
      this.playMotion(cmd.params.group, cmd.params.index);
      return;
    }
    if (cmd.command === 'stop') {
      this.commandSeq += 1;
      this.cancel('stopped');
      return;
    }

    const token = ++this.commandSeq;
    this.cancel('superseded');
    const refusal = this.refusal();
    if (refusal) {
      this.sendResult(cmd.id, 'rejected', refusal);
      return;
    }

    const layout = await this.deps.getLayout();
    const rectDip = cmd.command === 'approach_rect' ? await this.deps.screenToDipRect(cmd.params.rect) : undefined;
    if (token !== this.commandSeq) {
      this.sendResult(cmd.id, 'cancelled', 'superseded');
      return;
    }
    const lateRefusal = this.refusal();
    if (lateRefusal) {
      this.sendResult(cmd.id, 'rejected', lateRefusal);
      return;
    }
    this.startMove(cmd, layout, rectDip);
  }

  dispose(): void {
    if (this.move?.rafId != null) this.deps.cancelRaf(this.move.rafId);
    this.move = null;
    this.commandSeq += 1;
  }

  private refusal(): string | null {
    if (this.mode !== 'pet') return 'not_pet_mode';
    if (!this.deps.settings.getMovementEnabled()) return 'movement_disabled';
    if (this.aiBusy) return 'conversation';
    if (this.dragging) return 'user_drag';
    return null;
  }

  private playMotion(group: string, index: number): void {
    if (this.mode !== 'pet' || this.dragging) {
      console.log('[Motion] skipped: not in pet mode or dragging');
      return;
    }
    if (!this.deps.model.hasMotion(group, index)) {
      console.warn(`[Motion] fallback: motion group="${group}" index=${index} not found`);
      return;
    }
    this.deps.model.startMotion(group, index);
  }

  private startMove(cmd: MovementCommand, layout: Layout, rectDip: Rect | null | undefined): void {
    const { model, settings } = this.deps;
    const box = model.getBoxDip();
    const startLogical = model.getPositionLogical();
    if (!box || !startLogical) {
      this.sendResult(cmd.id, 'rejected', 'model_reloaded');
      return;
    }
    // Default home = where she stood before her first move (layout is fresh here).
    if (!settings.getHome()) settings.setHome({ x: box.x, y: box.y });
    const plan = planTarget(cmd, { box, home: settings.getHome() }, layout, this.deps.rng, rectDip);
    if (!plan.ok) {
      if (plan.reason === 'home_invalid') settings.setHome({ x: box.x, y: box.y });
      console.warn(`[Pet] rejected ${cmd.id}: ${plan.reason}`);
      this.sendResult(cmd.id, 'rejected', plan.reason);
      return;
    }
    const distance = Math.hypot(plan.target.x - box.x, plan.target.y - box.y);
    const speed = cmd.command === 'wander' ? cmd.params.speed : 'normal';
    this.move = {
      id: cmd.id,
      startBox: box,
      startLogical,
      target: plan.target,
      anchor: plan.anchor,
      startTime: this.deps.now(),
      duration: durationFor(distance, speed),
      rafId: null,
    };
    this.move.rafId = this.deps.raf(() => this.frame());
  }

  private frame(): void {
    const move = this.move;
    if (!move) return;
    move.rafId = null;
    const { model } = this.deps;
    if (!model.getPositionLogical()) {
      this.cancel('model_reloaded');
      return;
    }
    const t = Math.min(1, (this.deps.now() - move.startTime) / move.duration);
    const e = easeInOutSine(t);
    const delta = model.dipDeltaToLogical({
      x: (move.target.x - move.startBox.x) * e,
      y: (move.target.y - move.startBox.y) * e - bobOffset(t, move.duration),
    });
    model.setPositionLogical({ x: move.startLogical.x + delta.x, y: move.startLogical.y + delta.y });
    void this.refreshHover(t >= 1);

    if (t >= 1) {
      this.move = null;
      this.anchor = move.anchor;
      console.log(`[Pet] arrived ${move.id} anchor=${move.anchor}`);
      this.sendResult(move.id, 'arrived', null);
      return;
    }
    move.rafId = this.deps.raf(() => this.frame());
  }

  /** Cancel the running move (if any) and report it once. */
  private cancel(reason: string): void {
    const move = this.move;
    if (!move) return;
    if (move.rafId != null) this.deps.cancelRaf(move.rafId);
    this.move = null;
    this.anchor = 'free';
    console.log(`[Pet] cancelled ${move.id}: ${reason}`);
    this.sendResult(move.id, 'cancelled', reason);
    void this.refreshHover(true);
  }

  private async refreshHover(force: boolean): Promise<void> {
    const now = this.deps.now();
    if (!force && now - this.lastHoverCheck < HOVER_CHECK_MS) return;
    this.lastHoverCheck = now;
    try {
      const cursor = await this.deps.getCursor();
      const hit = this.deps.model.hitTestScreen(cursor);
      if (hit !== this.deps.getHover()) this.deps.setHover(hit);
    } catch (e) {
      console.debug('[Pet] hover refresh failed', e);
    }
  }

  private sendStatus(): void {
    this.deps.send(
      statusMsg({
        mode: this.mode,
        movementEnabled: this.deps.settings.getMovementEnabled(),
        moving: this.move !== null,
        anchor: this.anchor,
      }),
    );
  }

  private sendResult(commandId: string, result: CommandResult, reason: string | null): void {
    this.deps.send(
      statusMsg({
        mode: this.mode,
        movementEnabled: this.deps.settings.getMovementEnabled(),
        moving: this.move !== null,
        anchor: this.anchor,
        commandId,
        result,
        reason,
      }),
    );
  }
}

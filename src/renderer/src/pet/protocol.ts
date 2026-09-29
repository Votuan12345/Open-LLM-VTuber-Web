// Mili desktop pet websocket protocol v1 (backend mili_docs/PHASE_3_SPEC.md §5).
// Pure module: no React, Electron or WebSDK imports.
import type { Rect } from './geometry';

export const PROTOCOL_VERSION = 1;

export type PetMode = 'pet' | 'window';
export type Anchor = 'home' | 'edge' | 'free';
export type CommandResult = 'arrived' | 'cancelled' | 'rejected';
export type InteractionKind = 'click' | 'double_click' | 'drag_start' | 'drag_end';
export type Speed = 'slow' | 'normal';

export type PetCommand = { id: string } & (
  | { command: 'wander'; params: { distance: 'short' | 'long'; speed: Speed } }
  | { command: 'go_edge'; params: { side: 'nearest' | 'left' | 'right' } }
  | { command: 'go_home'; params: Record<string, never> }
  | { command: 'approach_rect'; params: { rect: Rect } }
  | { command: 'stop'; params: Record<string, never> }
  | { command: 'play_motion'; params: { group: string; index: number } }
);

export type MovementCommand = Exclude<PetCommand, { command: 'stop' | 'play_motion' }>;

export type ParseResult =
  | { ok: true; cmd: PetCommand }
  | { ok: false; id?: string; reason: 'unknown_command' | 'bad_params' };

const MAX_ID_LEN = 64;
const COMMANDS = new Set(['wander', 'go_edge', 'go_home', 'approach_rect', 'stop', 'play_motion']);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseRect(v: unknown): Rect | null {
  if (!isObject(v)) return null;
  const { x, y, width, height } = v;
  if (![x, y, width, height].every(isFiniteNumber)) return null;
  return { x: x as number, y: y as number, width: width as number, height: height as number };
}

function parseParams(command: string, params: Record<string, unknown>): PetCommand['params'] | null {
  switch (command) {
    case 'wander': {
      const { distance, speed } = params;
      if ((distance !== 'short' && distance !== 'long') || (speed !== 'slow' && speed !== 'normal')) return null;
      return { distance, speed };
    }
    case 'go_edge': {
      const { side } = params;
      if (side !== 'nearest' && side !== 'left' && side !== 'right') return null;
      return { side };
    }
    case 'approach_rect': {
      const rect = parseRect(params.rect);
      return rect ? { rect } : null;
    }
    case 'play_motion': {
      const { group, index } = params;
      if (typeof group !== 'string' || !Number.isInteger(index) || (index as number) < 0) return null;
      return { group, index: index as number };
    }
    default:
      return {};
  }
}

/** Validate an inbound `pet-command`. Never throws. */
export function parsePetCommand(msg: unknown): ParseResult {
  if (!isObject(msg)) return { ok: false, reason: 'bad_params' };
  const { id, command, params } = msg;
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LEN) {
    return { ok: false, reason: 'bad_params' };
  }
  if (typeof command !== 'string' || !COMMANDS.has(command)) {
    return { ok: false, id, reason: 'unknown_command' };
  }
  if (!isObject(params)) return { ok: false, id, reason: 'bad_params' };
  const parsed = parseParams(command, params);
  if (parsed === null) return { ok: false, id, reason: 'bad_params' };
  return { ok: true, cmd: { id, command, params: parsed } as PetCommand };
}

export function helloMsg(mode: PetMode, movementEnabled: boolean) {
  return { type: 'pet-hello', protocol: PROTOCOL_VERSION, mode, movement_enabled: movementEnabled };
}

export interface StatusFields {
  mode: PetMode;
  movementEnabled: boolean;
  moving: boolean;
  anchor?: Anchor;
  commandId?: string;
  result?: CommandResult;
  reason?: string | null;
}

export function statusMsg(f: StatusFields) {
  const msg: Record<string, unknown> = {
    type: 'pet-status',
    mode: f.mode,
    movement_enabled: f.movementEnabled,
    moving: f.moving,
  };
  if (f.anchor !== undefined) msg.anchor = f.anchor;
  if (f.commandId !== undefined) msg.command_id = f.commandId;
  if (f.result !== undefined) msg.result = f.result;
  if (f.reason !== undefined) msg.reason = f.reason;
  return msg;
}

export function interactionMsg(kind: InteractionKind, hitArea: string | null) {
  return { type: 'pet-interaction', kind, hit_area: hitArea };
}

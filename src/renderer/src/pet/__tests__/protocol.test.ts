import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  helloMsg,
  interactionMsg,
  parsePetCommand,
  statusMsg,
} from '../protocol';

describe('parsePetCommand', () => {
  it('accepts each valid command', () => {
    const valid = [
      { type: 'pet-command', id: 'c-1', command: 'wander', params: { distance: 'short', speed: 'slow' } },
      { type: 'pet-command', id: 'c-2', command: 'wander', params: { distance: 'long', speed: 'normal' } },
      { type: 'pet-command', id: 'c-3', command: 'go_edge', params: { side: 'nearest' } },
      { type: 'pet-command', id: 'c-4', command: 'go_home', params: {} },
      {
        type: 'pet-command',
        id: 'c-5',
        command: 'approach_rect',
        params: { rect: { x: -10, y: 20, width: 100, height: 200 } },
      },
      { type: 'pet-command', id: 'c-6', command: 'stop', params: {} },
      { type: 'pet-command', id: 'c-7', command: 'play_motion', params: { group: '', index: 3 } },
    ];
    for (const msg of valid) {
      const res = parsePetCommand(msg);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.cmd.id).toBe(msg.id);
        expect(res.cmd.command).toBe(msg.command);
        expect(res.cmd.params).toEqual(msg.params);
      }
    }
  });

  it('rejects unknown command and bad params', () => {
    expect(parsePetCommand({ type: 'pet-command', id: 'c-9', command: 'fly', params: {} })).toEqual({
      ok: false,
      id: 'c-9',
      reason: 'unknown_command',
    });
    const bad = [
      { id: 'c-1', command: 'wander', params: { distance: 'far', speed: 'slow' } },
      { id: 'c-1', command: 'wander', params: { distance: 'short' } },
      { id: 'c-1', command: 'go_edge', params: { side: 'up' } },
      { id: 'c-1', command: 'play_motion', params: { group: '', index: -1 } },
      { id: 'c-1', command: 'play_motion', params: { group: '', index: 1.5 } },
      { id: 'c-1', command: 'play_motion', params: { group: 3, index: 1 } },
      { id: 'c-1', command: 'approach_rect', params: { rect: { x: NaN, y: 0, width: 10, height: 10 } } },
      { id: 'c-1', command: 'approach_rect', params: { rect: { x: 0, y: 0, width: 10 } } },
      { id: 'c-1', command: 'approach_rect', params: {} },
      { id: 'c-1', command: 'wander' },
    ];
    for (const msg of bad) {
      expect(parsePetCommand({ type: 'pet-command', ...msg })).toEqual({
        ok: false,
        id: 'c-1',
        reason: 'bad_params',
      });
    }
    expect(parsePetCommand({ type: 'pet-command', id: 5, command: 'stop', params: {} })).toEqual({
      ok: false,
      reason: 'bad_params',
    });
    expect(parsePetCommand(null)).toEqual({ ok: false, reason: 'bad_params' });
    expect(parsePetCommand('x')).toEqual({ ok: false, reason: 'bad_params' });
  });
});

describe('message builders', () => {
  it('builds hello, status and interaction exactly as spec §5.1', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(helloMsg('pet', true)).toEqual({
      type: 'pet-hello',
      protocol: 1,
      mode: 'pet',
      movement_enabled: true,
    });
    expect(
      statusMsg({
        mode: 'pet',
        movementEnabled: true,
        moving: false,
        anchor: 'home',
        commandId: 'c-42',
        result: 'arrived',
        reason: null,
      }),
    ).toEqual({
      type: 'pet-status',
      mode: 'pet',
      movement_enabled: true,
      moving: false,
      anchor: 'home',
      command_id: 'c-42',
      result: 'arrived',
      reason: null,
    });
    expect(statusMsg({ mode: 'window', movementEnabled: false, moving: false })).toEqual({
      type: 'pet-status',
      mode: 'window',
      movement_enabled: false,
      moving: false,
    });
    expect(interactionMsg('click', 'HitAreaHead')).toEqual({
      type: 'pet-interaction',
      kind: 'click',
      hit_area: 'HitAreaHead',
    });
    expect(interactionMsg('drag_end', null)).toEqual({
      type: 'pet-interaction',
      kind: 'drag_end',
      hit_area: null,
    });
  });
});

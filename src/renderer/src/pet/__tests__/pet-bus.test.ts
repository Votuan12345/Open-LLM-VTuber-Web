import { describe, expect, it } from 'vitest';
import { createPetBus } from '../pet-bus';

describe('petBus', () => {
  it('delivers commands, interactions and drags to subscribers until unsubscribed', () => {
    const bus = createPetBus();
    const got: unknown[] = [];
    const offs = [
      bus.onCommand((m) => got.push(['cmd', m])),
      bus.onInteraction((k, h) => got.push(['int', k, h])),
      bus.onDrag((p) => got.push(['drag', p])),
    ];
    bus.emitCommand({ id: 'c-1' });
    bus.emitInteraction('click', 'HitAreaHead');
    bus.emitDrag('start');
    offs.forEach((off) => off());
    bus.emitCommand({ id: 'c-2' });
    bus.emitDrag('end');
    expect(got).toEqual([
      ['cmd', { id: 'c-1' }],
      ['int', 'click', 'HitAreaHead'],
      ['drag', 'start'],
    ]);
  });

  it('keeps delivering when one listener throws', () => {
    const bus = createPetBus();
    const got: string[] = [];
    bus.onDrag(() => {
      throw new Error('boom');
    });
    bus.onDrag((p) => got.push(p));
    expect(() => bus.emitDrag('end')).not.toThrow();
    expect(got).toEqual(['end']);
  });
});

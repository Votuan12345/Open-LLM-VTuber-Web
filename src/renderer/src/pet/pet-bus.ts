// Tiny event bus between the websocket handler / Live2D mouse handlers and
// the desktop pet hook. Keeps those files free of pet-controller imports.
import type { InteractionKind } from './protocol';

type Listener<A extends unknown[]> = (...args: A) => void;

function channel<A extends unknown[]>() {
  const listeners = new Set<Listener<A>>();
  return {
    on(fn: Listener<A>) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    emit(...args: A) {
      listeners.forEach((fn) => {
        try {
          fn(...args);
        } catch (e) {
          console.error('[Pet] bus listener failed', e);
        }
      });
    },
  };
}

export type DragPhase = 'start' | 'end';

export function createPetBus() {
  const command = channel<[unknown]>();
  const interaction = channel<[InteractionKind, string | null]>();
  const drag = channel<[DragPhase]>();
  return {
    onCommand: command.on,
    emitCommand: command.emit,
    onInteraction: interaction.on,
    emitInteraction: interaction.emit,
    onDrag: drag.on,
    emitDrag: drag.emit,
  };
}

export const petBus = createPetBus();

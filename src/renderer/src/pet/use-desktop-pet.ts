// Wires the desktop pet controller into the running app (backend
// mili_docs/PHASE_3_SPEC.md §7). Mounted once from the canvas Live2D
// component. Does nothing outside Electron (web build has no window.api.pet).
import { useEffect, useRef } from 'react';
import { useMode } from '@/context/mode-context';
import { useAiState } from '@/context/ai-state-context';
import { wsService } from '@/services/websocket-service';
import { DesktopPetController } from './desktop-pet-controller';
import type { Layout, Point, Rect } from './geometry';
import { useModelHoverStore } from './hover-store';
import { createModelPort } from './live2d-model-port';
import { petBus } from './pet-bus';
import { createPetSettings } from './pet-settings';
import { interactionMsg } from './protocol';

interface PetApi {
  getLayout(): Promise<Layout>;
  getCursor(): Promise<Point>;
  screenToDipRect(rect: Rect): Promise<Rect | null>;
  onLayoutChanged(cb: (layout: Layout) => void): () => void;
  onToggleMovement(cb: () => void): () => void;
  reportMovementState(enabled: boolean): void;
}

function getPetApi(): PetApi | null {
  return ((window as any).api?.pet as PetApi | undefined) ?? null;
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sendIfOpen(message: object): void {
  // wsService.sendMessage shows an error toast when closed; pet traffic is best-effort.
  if (wsService.getCurrentState() === 'OPEN') wsService.sendMessage(message);
}

export function useDesktopPet(): void {
  const { mode } = useMode();
  const { aiState } = useAiState();
  const controllerRef = useRef<DesktopPetController | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const api = getPetApi();
    if (!api) return undefined;

    const layoutRef: { current: Layout | null } = { current: null };
    const settings = createPetSettings(safeLocalStorage());
    const model = createModelPort({
      getAdapter: () => (window as any).getLAppAdapter?.() ?? null,
      getCanvasSize: () => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
        return canvas ? { width: canvas.width, height: canvas.height } : null;
      },
      getDpr: () => window.devicePixelRatio || 1,
      getOrigin: () => layoutRef.current?.windowOrigin ?? { x: 0, y: 0 },
    });

    const controller = new DesktopPetController({
      send: sendIfOpen,
      getLayout: async () => {
        const layout = await api.getLayout();
        layoutRef.current = layout;
        return layout;
      },
      getCursor: () => api.getCursor(),
      screenToDipRect: (rect) => api.screenToDipRect(rect),
      model,
      settings,
      rng: Math.random,
      now: () => performance.now(),
      raf: (cb) => requestAnimationFrame(cb),
      cancelRaf: (id) => cancelAnimationFrame(id),
      setHover: (hit) => {
        useModelHoverStore.getState().setHovering(hit);
        (window as any).api?.updateComponentHover?.('live2d-model', hit);
      },
    });
    controllerRef.current = controller;
    controller.setMode(modeRef.current);

    api.getLayout().then((layout) => { layoutRef.current = layout; }).catch(() => {});
    api.reportMovementState(settings.getMovementEnabled());

    const stateSub = wsService.onStateChange((state) => {
      if (state === 'OPEN') controller.hello();
    });
    if (wsService.getCurrentState() === 'OPEN') controller.hello();

    const offs = [
      petBus.onCommand((msg) => {
        void controller.handleCommand(msg);
      }),
      petBus.onInteraction((kind, hitArea) => {
        if (modeRef.current === 'pet') sendIfOpen(interactionMsg(kind, hitArea));
      }),
      petBus.onDrag((phase) => {
        if (phase === 'start') controller.onDragStart();
        else controller.onDragEnd();
        if (modeRef.current === 'pet') sendIfOpen(interactionMsg(phase === 'start' ? 'drag_start' : 'drag_end', null));
      }),
      api.onLayoutChanged((layout) => {
        layoutRef.current = layout;
      }),
      api.onToggleMovement(() => {
        const enabled = !settings.getMovementEnabled();
        controller.setMovementEnabled(enabled);
        api.reportMovementState(enabled);
      }),
    ];

    return () => {
      stateSub.unsubscribe();
      offs.forEach((off) => off());
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    controllerRef.current?.setAiBusy(aiState === 'thinking-speaking' || aiState === 'listening');
  }, [aiState]);
}

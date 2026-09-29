import { create } from 'zustand';

// Whether the pointer is over the Live2D model in pet mode. Shared by the
// mouse handlers in use-live2d-model.ts and the pet controller's hover
// refresh, so both agree before telling the main process to catch the mouse.
interface ModelHoverState {
  hovering: boolean;
  setHovering: (hovering: boolean) => void;
}

export const useModelHoverStore = create<ModelHoverState>((set) => ({
  hovering: false,
  setHovering: (hovering) => set({ hovering }),
}));

import { ElectronAPI } from '@electron-toolkit/preload';

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      setIgnoreMouseEvents: (ignore: boolean) => void
      toggleForceIgnoreMouse: () => void
      onForceIgnoreMouseChanged: (callback: (isForced: boolean) => void) => void
      onModeChanged: (callback: (mode: 'pet' | 'window') => void) => void
      showContextMenu: (x: number, y: number) => void
      onMicToggle: (callback: () => void) => void
      onInterrupt: (callback: () => void) => void
      updateComponentHover: (componentId: string, isHovering: boolean) => void
      onToggleInputSubtitle: (callback: () => void) => void
      onToggleScrollToResize: (callback: () => void) => void
      onSwitchCharacter: (callback: (filename: string) => void) => void
      setMode: (mode: 'window' | 'pet') => void
      getConfigFiles: () => Promise<any>
      updateConfigFiles: (files: any[]) => void
      pet?: {
        getLayout: () => Promise<import('../renderer/src/pet/geometry').Layout>
        getCursor: () => Promise<{ x: number; y: number }>
        screenToDipRect: (rect: import('../renderer/src/pet/geometry').Rect) => Promise<import('../renderer/src/pet/geometry').Rect | null>
        onLayoutChanged: (callback: (layout: import('../renderer/src/pet/geometry').Layout) => void) => () => void
        onToggleMovement: (callback: () => void) => () => void
        reportMovementState: (enabled: boolean) => void
      }
    }
  }
}

interface IpcRenderer {
  on(channel: 'mode-changed', func: (_event: any, mode: 'pet' | 'window') => void): void;
  send(channel: string, ...args: any[]): void;
}

// Main-process helpers for the Mili desktop pet (backend
// mili_docs/PHASE_3_SPEC.md §7.2): display layout, cursor position and
// physical-pixel -> DIP rectangle conversion. Read-only; nothing here moves
// any window.
import { BrowserWindow, ipcMain, screen } from 'electron';

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

function virtualOrigin(): { x: number; y: number } {
  const displays = screen.getAllDisplays();
  return {
    x: Math.min(...displays.map((d) => d.bounds.x)),
    y: Math.min(...displays.map((d) => d.bounds.y)),
  };
}

function layout(getWindow: () => BrowserWindow | null) {
  const win = getWindow();
  const bounds = win?.getBounds();
  return {
    // The pet window spans the virtual screen; fall back to its computed origin.
    windowOrigin: bounds ? { x: bounds.x, y: bounds.y } : virtualOrigin(),
    displays: screen.getAllDisplays().map((d) => ({
      id: d.id,
      bounds: d.bounds,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
    })),
  };
}

function isRect(r: unknown): r is RectLike {
  if (typeof r !== 'object' || r === null) return false;
  const { x, y, width, height } = r as Record<string, unknown>;
  return [x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v));
}

export function registerPetIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('pet:get-layout', () => layout(getWindow));

  ipcMain.handle('pet:get-cursor', () => screen.getCursorScreenPoint());

  ipcMain.handle('pet:screen-to-dip-rect', (_event, rect: unknown) => {
    if (!isRect(rect)) return null;
    try {
      // Windows-only API; converts physical screen pixels to DIP.
      return screen.screenToDipRect(null, rect);
    } catch (e) {
      console.warn('[Pet] screenToDipRect failed', e);
      return null;
    }
  });

  const pushLayout = () => {
    getWindow()?.webContents.send('pet:layout-changed', layout(getWindow));
  };
  screen.on('display-added', pushLayout);
  screen.on('display-removed', pushLayout);
  screen.on('display-metrics-changed', pushLayout);
}

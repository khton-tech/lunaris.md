import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WindowSnapshot } from "@lunaris/window";

/** Only the native driver imports Tauri. Tests inject this narrow platform port. */
export interface NativeWindowPort {
  read(): Promise<Omit<WindowSnapshot, "sequence">>;
  listen(changed: () => void): Promise<() => void>;
  setTitle(title: string): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  startDragging(): Promise<void>;
  close(): Promise<void>;
  isDecorated(): Promise<boolean>;
  setDecorations(enabled: boolean): Promise<void>;
}
export function nativeWindow(): NativeWindowPort | null {
  if (!isTauri()) return null;
  const window = getCurrentWindow();
  return {
    async read() {
      const [title, focused, maximized, minimize, maximize, close] = await Promise.all([
        window.title(), window.isFocused(), window.isMaximized(), window.isMinimizable(), window.isMaximizable(), window.isClosable(),
      ]);
      return { title, focused, maximized, capabilities: { title: true, minimize, maximize, close, drag: true, customTitlebar: true } };
    },
    async listen(changed) {
      const removers: (() => void)[] = [];
      try {
        removers.push(await window.onResized(changed));
        removers.push(await window.onFocusChanged(changed));
        return () => { for (const remove of removers) remove(); };
      } catch (error) { for (const remove of removers) remove(); throw error; }
    },
    setTitle: title => window.setTitle(title), minimize: () => window.minimize(),
    toggleMaximize: () => window.toggleMaximize(), startDragging: () => window.startDragging(),
    close: () => window.close(), isDecorated: () => window.isDecorated(),
    setDecorations: enabled => window.setDecorations(enabled),
  };
}

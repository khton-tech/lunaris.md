import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { HostSession } from "./session.js";

interface ClosePort {
  onCloseRequested(handler: (event: { preventDefault(): void }) => Promise<void>): Promise<() => void>;
}

/** Tauri destroys the window after this handler resolves unless prevented. */
export async function bindWindowClose(session: HostSession, window: ClosePort): Promise<() => void> {
  let closing = false;
  return window.onCloseRequested(async event => {
    if (closing) { event.preventDefault(); return; }
    closing = true;
    try {
      if (!await session.requestClose()) { event.preventDefault(); closing = false; }
    } catch {
      event.preventDefault(); closing = false;
    }
  });
}

export async function bindDesktopLifecycle(session: HostSession): Promise<() => void> {
  return isTauri() ? bindWindowClose(session, getCurrentWindow()) : () => {};
}

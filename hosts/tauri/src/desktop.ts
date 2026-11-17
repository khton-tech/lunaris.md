import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { HostSession } from "./session.js";

interface ClosePort {
  onCloseRequested(handler: (event: { preventDefault(): void }) => Promise<void>): Promise<() => void>;
}

interface BackgroundPort {
  hide(): Promise<boolean>;
  restore(): Promise<unknown>;
  exit(): Promise<unknown>;
  onQuit(handler: () => Promise<void>): Promise<() => void>;
}

/** Tauri destroys the window after this handler resolves unless prevented. */
export async function bindWindowClose(session: Pick<HostSession, "requestClose">, window: ClosePort, background?: BackgroundPort): Promise<() => void> {
  let closing = false;
  async function complete(operation: () => Promise<boolean>): Promise<boolean> {
    if (closing) return false;
    closing = true;
    let finished = false;
    try {
      finished = await operation();
      return finished;
    } catch { return false; }
    finally { if (!finished) closing = false; }
  }
  const unlistenClose = await window.onCloseRequested(async event => {
    const allow = await complete(async () => await background?.hide() ? false : session.requestClose());
    if (!allow) event.preventDefault();
  });
  if (!background) return unlistenClose;
  try {
    const unlistenQuit = await background.onQuit(async () => {
      await complete(async () => {
        let exited = false;
        try {
          if (!await session.requestClose()) return false;
          await background.exit();
          exited = true;
          return true;
        } finally { if (!exited) await background.restore(); }
      });
    });
    return () => { unlistenQuit(); unlistenClose(); };
  } catch (error) {
    unlistenClose();
    throw error;
  }
}

export async function bindDesktopLifecycle(session: HostSession): Promise<() => void> {
  if (!isTauri()) return () => {};
  const window = getCurrentWindow();
  const request = (kind: "hide" | "restore" | "exit") => invoke<boolean>("desktop_background_request", { request: { kind } });
  return bindWindowClose(session, window, {
    hide: () => session.snapshot().phase === "running" ? request("hide") : Promise.resolve(false),
    restore: () => request("restore"),
    exit: () => request("exit"),
    onQuit: handler => window.listen("lunaris://desktop-quit", () => { void handler(); }),
  });
}

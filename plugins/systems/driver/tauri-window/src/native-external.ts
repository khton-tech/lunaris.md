import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { NativeExternalWindowOptions, WindowPosition, WindowSize } from "@lunaris/window/external";

export type WindowOperation = { readonly kind: "show" | "hide" | "close" } |
  { readonly kind: "move"; readonly position: WindowPosition } | { readonly kind: "resize"; readonly size: WindowSize };

export interface ExternalWindowPort {
  listen(closed: (id: string) => void): Promise<() => void>;
  open(id: string, options: NativeExternalWindowOptions, signal: AbortSignal): Promise<HTMLElement>;
  operate(id: string, operation: WindowOperation): Promise<void>;
}

/** The host creates a real native popup linked to its opener's WebView environment. */
export function nativeExternalWindows(): ExternalWindowPort | null {
  if (!isTauri()) return null;
  return {
    listen: closed => getCurrentWindow().listen<string>("lunaris://external-window-closed", event => closed(event.payload)),
    operate: (id, request) => invoke("external_window_request", { id, request }),
    async open(id, options, signal) {
      await invoke("external_window_request", { id, request: { kind: "prepare", options } });
      signal.throwIfAborted();
      const url = new URL("/external-window.html", window.location.href);
      url.searchParams.set("id", id);
      return new Promise<HTMLElement>((resolve, reject) => {
        let child: Window | null = null;
        const timer = window.setTimeout(() => fail(new Error("External window did not load.")), 10_000);
        const abort = () => fail(signal.reason);
        const ready = (event: MessageEvent) => {
          if (!child || event.source !== child || event.origin !== window.location.origin || event.data !== id) return;
          try {
            const target = child.document.getElementById("external-window-root");
            if (!target) throw new Error("External window mount target is missing.");
            child.document.documentElement.lang = document.documentElement.lang;
            child.document.title = options.title;
            release();
            resolve(target);
          } catch (error) { fail(error); }
        };
        function release(): void {
          window.clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          window.removeEventListener("message", ready);
        }
        function fail(error: unknown): void { release(); reject(error); }
        signal.addEventListener("abort", abort, { once: true });
        window.addEventListener("message", ready);
        try {
          child = window.open(url.href, "_blank", "popup");
          if (!child) fail(new Error("The native host rejected the external window."));
        } catch (error) { fail(error); }
      });
    },
  };
}

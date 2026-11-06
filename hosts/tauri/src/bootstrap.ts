import { HostSession } from "./session.js";
import { createWebviewScheduler } from "./scheduler.js";
import { mountSystemView } from "./view.js";
import { bindDesktopLifecycle } from "./desktop.js";

// Suppress WebView chrome while preserving plugin context-menu handlers.
document.addEventListener("contextmenu", event => event.preventDefault(), { capture: true });

const root = document.getElementById("system-root")!;
const application = document.getElementById("application-root")!;
const session = new HostSession({
  scheduler: createWebviewScheduler(),
  async load(signal) {
    // Each attempt receives a fresh target; late renderers only retain detached DOM.
    const target = document.createElement("div");
    target.className = "application-surface";
    application.replaceChildren(target);
    signal.addEventListener("abort", () => target.remove(), { once: true });
    const module = await import("./application.js");
    if (signal.aborted) throw new Error("Application load cancelled.");
    return module.composeApplication(target);
  },
});
document.documentElement.lang = "en";
mountSystemView(root, application, session, { startup: document.getElementById("startup-root")! });

window.addEventListener("error", event => {
  void session.reportFault("runtime", event.target instanceof HTMLElement ? "RESOURCE_LOAD_FAILED" : "UNHANDLED_APPLICATION_ERROR");
}, true);
window.addEventListener("unhandledrejection", () => { void session.reportFault("runtime", "UNHANDLED_PROMISE_REJECTION"); });
const monitor = window.setInterval(session.refresh, 250);
let unlisten: (() => void) | undefined;
window.addEventListener("pagehide", () => { clearInterval(monitor); unlisten?.(); void session.stop(); }, { once: true });
void (async () => {
  try {
    unlisten = await bindDesktopLifecycle(session);
    await session.start();
  } catch { await session.reportFault("startup", "NATIVE_LIFECYCLE_UNAVAILABLE"); }
})();

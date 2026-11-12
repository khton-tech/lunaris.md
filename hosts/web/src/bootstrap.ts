import { HostSession, composeApplication } from "@lunaris/application-host";
import { createWebviewScheduler } from "@lunaris/application-host/scheduler";
import { mountSystemView } from "@lunaris/application-host/view";
import { bindBrowserInput } from "@lunaris/application-host/browser-input";
import "@lunaris/application-host/shell.css";
import "@lunaris/mantine-components/styles.css";
import art from "../../../resources/ascii_art.txt?raw";

const application = document.getElementById("application-root")!;
const releaseInput = bindBrowserInput(window);
const session = new HostSession({ scheduler: createWebviewScheduler(), async load(signal) {
  const target = document.createElement("div"); target.className = "application-surface";
  application.replaceChildren(target); signal.addEventListener("abort", () => target.remove(), { once: true });
  return composeApplication(target, { art, mode: "browser", defaultServer: window.location.origin, features: __LUNARIS_FEATURES__, buildId: __LUNARIS_BUILD_ID__ });
} });
mountSystemView(document.getElementById("system-root")!, application, session, { startup: document.getElementById("startup-root")! });
window.addEventListener("pagehide", () => { releaseInput(); void session.stop(); }, { once: true });
window.addEventListener("error", () => { void session.reportFault("runtime", "UNHANDLED_APPLICATION_ERROR"); });
window.addEventListener("unhandledrejection", () => { void session.reportFault("runtime", "UNHANDLED_PROMISE_REJECTION"); });
document.documentElement.dataset.lunarisBuild = __LUNARIS_BUILD_ID__;
void session.start();

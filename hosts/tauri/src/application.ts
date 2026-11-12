import "@lunaris/mantine-components/styles.css";
import { composeApplication as composeShared } from "@lunaris/application-host";
import windowTitlebar from "@lunaris/window-titlebar";
import windowProvider from "@lunaris/window-provider";
import tauriWindow from "@lunaris/tauri-window";
import { createTauriCredentials } from "@lunaris/tauri-credentials";
import { createTauriFilesystemDriver } from "@lunaris/tauri-filesystem";
import { createCloseGuard } from "./close-guard.js";
import art from "../../../resources/ascii_art.txt?raw";
import type { ApplicationDefinition } from "./session.js";

export function composeApplication(target: HTMLElement): ApplicationDefinition {
  const native = createTauriFilesystemDriver(undefined, { backendOnly: true });
  const credentials = createTauriCredentials();
  const close = createCloseGuard();
  return composeShared(target, { art, mode: "desktop", platformPlugins: [native, credentials], extensions: {
    plugins: [windowTitlebar, windowProvider, tauriWindow, close.plugin],
    entrypoints: [windowTitlebar.manifest.id, close.plugin.manifest.id], beforeClose: close.beforeClose,
    grants: { [credentials.manifest.id]: credentials.manifest.permissions, [native.manifest.id]: ["filesystem.native"], [windowTitlebar.manifest.id]: ["window.control", "ui.dom"],
      [windowProvider.manifest.id]: ["window.control"], [tauriWindow.manifest.id]: ["window.native"], [close.plugin.manifest.id]: ["vault.access"] },
  } });
}

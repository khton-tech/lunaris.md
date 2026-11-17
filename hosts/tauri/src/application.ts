import { createTauriLinks } from "@lunaris/tauri-links";
import "@lunaris/mantine-components/styles.css";
import { composeApplication as composeShared } from "@lunaris/application-host";
import windowTitlebar from "@lunaris/window-titlebar";
import windowProvider from "@lunaris/window-provider";
import tauriWindow from "@lunaris/tauri-window";
import externalWindows from "@lunaris/external-windows";
import desktopBackgroundSettings from "@lunaris/desktop-background-settings";
import { createTauriCredentials } from "@lunaris/tauri-credentials";
import { createTauriFilesystemDriver } from "@lunaris/tauri-filesystem";
import { createTauriProcesses } from "@lunaris/tauri-processes";
import { createCloseGuard } from "./close-guard.js";
import art from "../../../resources/ascii_art.txt?raw";
import type { ApplicationDefinition } from "./session.js";

export function composeApplication(target: HTMLElement): ApplicationDefinition {
  const native = createTauriFilesystemDriver(undefined, {
    backendOnly: true, profileIpc: import.meta.env.VITE_LUNARIS_DESKTOP_IO_PROFILE === "1",
  });
  const credentials = createTauriCredentials();
  const processes = createTauriProcesses();
  const close = createCloseGuard();
  return composeShared(target, { art, mode: "desktop", externalLinksDriver: createTauriLinks(), platformPlugins: [native, credentials, processes], extensions: {
    plugins: [windowTitlebar, windowProvider, tauriWindow, externalWindows, desktopBackgroundSettings, close.plugin],
    entrypoints: [windowTitlebar.manifest.id, externalWindows.manifest.id, desktopBackgroundSettings.manifest.id, close.plugin.manifest.id], beforeClose: close.beforeClose,
    grants: { [credentials.manifest.id]: credentials.manifest.permissions, [native.manifest.id]: ["filesystem.native"], [windowTitlebar.manifest.id]: ["window.control", "ui.dom"],
      [windowProvider.manifest.id]: ["window.control"], [tauriWindow.manifest.id]: ["window.native"],
      [externalWindows.manifest.id]: externalWindows.manifest.permissions, [desktopBackgroundSettings.manifest.id]: desktopBackgroundSettings.manifest.permissions,
      [close.plugin.manifest.id]: ["vault.access"] },
  } });
}

import baseThemeEngine from "@lunaris/base-theme-engine";
import themeProvider from "@lunaris/theme-provider";
import componentProvider from "@lunaris/component-provider";
import { composeSlotSurface } from "./slots.js";
import type { ApplicationDefinition } from "./session.js";
import { createLogger } from "@lunaris/logger";
import { createDevToolsLogger } from "@lunaris/dev-tools-logger";
import art from "../../../resources/ascii_art.txt?raw";
import filesystem from "@lunaris/filesystem-provider";
import tauriFilesystem from "@lunaris/tauri-filesystem";
import vaultManager from "@lunaris/vault-manager";
import configManager from "@lunaris/config-manager";
import localizationManager from "@lunaris/localization-manager";

// Reuse this definition across recovery attempts to print the banner once per page load.
const devTools = createDevToolsLogger({ banner: { art, caption: "Lunaris.md · v0.1.0 · Tauri" } });
const logger = createLogger();

/** Host composition point. Product plugins import only the public SDK. */
export function composeApplication(target: HTMLElement): ApplicationDefinition {
  const layout = composeSlotSurface(target);
  return {
    ...layout,
    plugins: [baseThemeEngine, themeProvider, componentProvider, ...layout.plugins, devTools, logger, tauriFilesystem, filesystem, vaultManager, configManager, localizationManager],
    entrypoints: [baseThemeEngine.manifest.id, themeProvider.manifest.id, componentProvider.manifest.id, ...layout.entrypoints, configManager.manifest.id, localizationManager.manifest.id],
    grants: {
      ...layout.grants,
      [componentProvider.manifest.id]: ["ui.dom"],
      [tauriFilesystem.manifest.id]: ["filesystem.native"],
      [filesystem.manifest.id]: ["filesystem.access", "filesystem.app-config"],
      [vaultManager.manifest.id]: ["filesystem.access"],
      [configManager.manifest.id]: ["filesystem.access", "filesystem.app-config", "vault.access"],
    },
  };
}

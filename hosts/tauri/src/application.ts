import { createRunner } from "@lunaris/runner";
import { createVaultSelector } from "@lunaris/vault-selector";
import { createThemeSettings } from "@lunaris/theme-settings";
import componentsKit from "@lunaris/components-kit";
import { createStartupProvider } from "@lunaris/startup-provider";
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
import vaultHistory from "@lunaris/vault-history";
import configManager from "@lunaris/config-manager";
import localizationManager from "@lunaris/localization-manager";

// Reuse this definition across recovery attempts to print the banner once per page load.
const devTools = createDevToolsLogger({ banner: { art, caption: "Lunaris.md · v0.1.0 · Tauri" } });
const logger = createLogger();

/** Host composition point. Product plugins import only the public SDK. */
export function composeApplication(target: HTMLElement): ApplicationDefinition {
  const themeSettings = createThemeSettings({ defaultThemeId: "lunaris.base-theme-engine.dark" });
  const runner = createRunner({ art, hideWhenLoaded: true });
  const selector = createVaultSelector({ art });
  const startup = createStartupProvider();
  const layout = composeSlotSurface(target);
  return {
    ...layout,
    startup,
    plugins: [runner, selector, themeSettings, componentsKit, startup.plugin, baseThemeEngine, themeProvider, componentProvider, ...layout.plugins, devTools, logger, tauriFilesystem, filesystem, vaultManager, vaultHistory, configManager, localizationManager],
    entrypoints: [startup.plugin.manifest.id, baseThemeEngine.manifest.id, themeProvider.manifest.id, componentProvider.manifest.id, componentsKit.manifest.id, ...layout.entrypoints, configManager.manifest.id, vaultHistory.manifest.id, themeSettings.manifest.id, localizationManager.manifest.id, runner.manifest.id, selector.manifest.id],
    grants: {
      ...layout.grants,
      [runner.manifest.id]: ["config.access", "ui.dom"],
      [selector.manifest.id]: ["vault.access", "ui.dom"],
      [themeSettings.manifest.id]: ["config.access"],
      [componentProvider.manifest.id]: ["ui.dom"],
      [componentsKit.manifest.id]: ["ui.dom"],
      [tauriFilesystem.manifest.id]: ["filesystem.native"],
      [filesystem.manifest.id]: ["filesystem.access", "filesystem.app-config"],
      [vaultManager.manifest.id]: ["filesystem.access"],
      [vaultHistory.manifest.id]: ["config.access", "vault.access"],
      [configManager.manifest.id]: ["filesystem.access", "filesystem.app-config", "vault.access"],
    },
  };
}

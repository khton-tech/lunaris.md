import fileExplorer from "@lunaris/file-explorer";
import { createRunner } from "@lunaris/runner";
import workspaceProvider from "@lunaris/workspace-provider";
import sidebar from "@lunaris/sidebar-plugin";
import sidebarProvider from "@lunaris/sidebar-provider";
import workspace from "@lunaris/workspace-plugin";
import { createVaultSelector } from "@lunaris/vault-selector";
import { createThemeSettings } from "@lunaris/theme-settings";
import mantineComponents from "@lunaris/mantine-components";
import "@lunaris/mantine-components/styles.css";
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
  const themeSettings = createThemeSettings({ defaultThemeId: "lunaris.base-theme-engine.monochrome" });
  const runner = createRunner({ art, hideWhenLoaded: true });
  const selector = createVaultSelector({ art, hideWhenVaultOpen: true });
  const startup = createStartupProvider();
  const layout = composeSlotSurface(target);
  return {
    ...layout,
    startup,
    plugins: [fileExplorer, sidebar, sidebarProvider, runner, selector, workspace, workspaceProvider, themeSettings, mantineComponents, startup.plugin, baseThemeEngine, themeProvider, componentProvider, ...layout.plugins, devTools, logger, tauriFilesystem, filesystem, vaultManager, vaultHistory, configManager, localizationManager],
    entrypoints: [startup.plugin.manifest.id, baseThemeEngine.manifest.id, themeProvider.manifest.id, componentProvider.manifest.id, mantineComponents.manifest.id, ...layout.entrypoints, configManager.manifest.id, vaultHistory.manifest.id, themeSettings.manifest.id, localizationManager.manifest.id, runner.manifest.id, selector.manifest.id, workspace.manifest.id, sidebar.manifest.id, fileExplorer.manifest.id],
    grants: {
      ...layout.grants,
      [runner.manifest.id]: ["config.access", "ui.dom"],
      [selector.manifest.id]: ["vault.access", "ui.dom"],
      [workspace.manifest.id]: ["vault.access", "ui.dom"],
      [fileExplorer.manifest.id]: ["filesystem.access", "vault.access"],
      [sidebar.manifest.id]: ["ui.dom"],
      [themeSettings.manifest.id]: ["config.access"],
      [componentProvider.manifest.id]: ["ui.dom"],
      [mantineComponents.manifest.id]: ["ui.dom"],
      [tauriFilesystem.manifest.id]: ["filesystem.native"],
      [filesystem.manifest.id]: ["filesystem.access", "filesystem.app-config"],
      [vaultManager.manifest.id]: ["filesystem.access"],
      [vaultHistory.manifest.id]: ["config.access", "vault.access"],
      [configManager.manifest.id]: ["filesystem.access", "filesystem.app-config", "vault.access"],
    },
  };
}

import documentLinks from "@lunaris/document-links";
import externalLinks from "@lunaris/external-links-provider";
import { createBrowserLinks } from "@lunaris/browser-links";
import backlinkIndex from "@lunaris/backlink-index";
import backlinksUI from "@lunaris/backlinks-ui";
import mobileMenu from "@lunaris/mobile-menu-plugin";
import { createLime } from "@lunaris/lime-manager";
import limeSettings from "@lunaris/lime-settings";
import { createApplicationExecution } from "./plugin-execution.js";
import { createLupPicker } from "@lunaris/lup-picker";
import { createCloseGuard } from "./close-guard.js";
import callouts from "@lunaris/callouts";
import { createClientUpdates } from "@lunaris/client-updates";
import { createBrowserNavigation } from "@lunaris/browser-navigation";
import clientUpdateUI from "@lunaris/client-update-ui";
import type { PluginDefinition } from "@lunaris/sdk";
import { createBrowserStorage } from "@lunaris/browser-storage";
import { createServerTransport } from "@lunaris/server-transport";
import remoteFilesystem from "@lunaris/remote-filesystem";
import accountSession from "@lunaris/account-session";
import draftsProvider from "@lunaris/drafts-provider";
import { createAccountAccess } from "@lunaris/account-access";
import { createFilesystemRouter } from "@lunaris/filesystem-router";
import { LocalFilesystemBackend, RemoteFilesystemBackend } from "@lunaris/filesystem";
import clipboardProvider from "@lunaris/clipboard-provider";
import { createBrowserClipboard } from "@lunaris/browser-clipboard";
import statusBar from "@lunaris/status-bar";
import textEditor from "@lunaris/text-editor";
import { createInterfaceSettings } from "@lunaris/interface-settings";
import settingsProvider from "@lunaris/settings-provider";
import settings from "@lunaris/settings-plugin";
import activeScreenProvider from "@lunaris/active-screen-provider";
import activeScreen from "@lunaris/active-screen-plugin";
import activeDocument from "@lunaris/active-document-provider";
import fileExplorer from "@lunaris/file-explorer";
import contextMenu from "@lunaris/context-menu-provider";
import { createRunner } from "@lunaris/runner";
import workspaceProvider from "@lunaris/workspace-provider";
import sidebar from "@lunaris/sidebar-plugin";
import sidebarProvider from "@lunaris/sidebar-provider";
import workspace from "@lunaris/workspace-plugin";
import { createVaultSelector } from "@lunaris/vault-selector";
import { createThemeSettings } from "@lunaris/theme-settings";
import mantineComponents from "@lunaris/mantine-components";
import { createStartupProvider } from "@lunaris/startup-provider";
import baseThemeEngine from "@lunaris/base-theme-engine";
import themeProvider from "@lunaris/theme-provider";
import componentProvider from "@lunaris/component-provider";
import { composeSlotSurface } from "./slots.js";
import type { ApplicationDefinition } from "./session.js";
import { createLogger } from "@lunaris/logger";
import { createDevToolsLogger } from "@lunaris/dev-tools-logger";
import filesystem from "@lunaris/filesystem-provider";
import vaultManager from "@lunaris/vault-manager";
import vaultHistory from "@lunaris/vault-history";
import configManager from "@lunaris/config-manager";
import localizationManager from "@lunaris/localization-manager";

// Reuse logging definitions across recovery attempts.
const devTools = createDevToolsLogger();
const logger = createLogger();
const defaultThemeId = "lunaris.base-theme-engine.monochrome";

/** Host composition point. Product plugins import only the public SDK. */
export function composeApplication(target: HTMLElement, options: {
  readonly art: string; readonly mode: "browser" | "desktop"; readonly defaultServer?: string;
  readonly buildId?: string;
  readonly features?: readonly ("editor" | "files" | "settings")[];
  readonly externalLinksDriver?: PluginDefinition;
  readonly platformPlugins?: readonly PluginDefinition[];
  readonly extensions?: { readonly excludeBuiltins?: readonly string[]; readonly selections?: ApplicationDefinition["selections"]; readonly plugins: readonly PluginDefinition[]; readonly entrypoints: readonly string[]; readonly grants: Readonly<Record<string, readonly string[]>>; readonly beforeClose?: () => Promise<boolean> };
}): ApplicationDefinition {
  if (options.features && !options.features.includes("files")) throw Error("The files feature currently owns required Vault navigation.");
  const preservation = createCloseGuard();
  const lime = createLime({ platform: options.mode === 'desktop' ? 'desktop' : 'web' });
  const lupPicker = createLupPicker(target.ownerDocument);
  const art = options.art;
  const navigation = options.mode === "browser" ? createBrowserNavigation() : null;
  const updateService = options.mode === "browser" && options.buildId && options.buildId !== "development" ? createClientUpdates(options.buildId) : null;
  const updates = [...(navigation ? [navigation] : []), ...(updateService ? [updateService, clientUpdateUI] : [])];
  const device = createBrowserStorage({ config: options.mode === "browser" });
  const linksDriver = options.externalLinksDriver ?? createBrowserLinks(target.ownerDocument.defaultView!);
  const clipboardDriver = createBrowserClipboard();
  let markLocalReady!: () => void;
  const localReady = new Promise<void>(resolve => { markLocalReady = resolve; });
  const transport = createServerTransport({ mode: options.mode, restoreAfter: localReady });
  const account = createAccountAccess({ art: options.art, defaultOpen: options.mode === "browser", allowLocal: options.mode === "desktop", ...(options.defaultServer ? { defaultAddress: options.defaultServer } : {}) });
  const router = createFilesystemRouter([{ id: "local", ...LocalFilesystemBackend }, { id: "remote", ...RemoteFilesystemBackend }], "local");
  const extra = options.extensions ?? { plugins: [], entrypoints: [], grants: {} };
  const themeSettings = createThemeSettings({ defaultThemeId });
  const interfaceSettings = createInterfaceSettings({ defaultThemeId });
  const runner = createRunner({ art, hideWhenLoaded: true });
  const selector = createVaultSelector({ art, hideWhenVaultOpen: true });
  const startup = createStartupProvider();
  const layout = composeSlotSurface(target);
  const disabled = new Set<string>();
  if (options.features) {
    if (!options.features.includes("editor")) { disabled.add(textEditor.manifest.id); disabled.add(callouts.manifest.id); disabled.add(backlinkIndex.manifest.id); disabled.add(backlinksUI.manifest.id); disabled.add(documentLinks.manifest.id); }
    if (!options.features.includes("files")) disabled.add(fileExplorer.manifest.id);
    if (!options.features.includes("settings")) disabled.add(settings.manifest.id);
  }
  const definition: ApplicationDefinition = {
    pluginRuntime: true,
    ...layout,
    view: { ...layout.view!, duringStartup: false },
    startup: { ...startup, update(snapshot) {
      const accepted = startup.update(snapshot);
      if (accepted && snapshot.state === "loaded") markLocalReady();
      return accepted;
    } },
    beforeClose: async () => await preservation.beforeClose() && (extra.beforeClose ? await extra.beforeClose() : true),
    plugins: [linksDriver, externalLinks, documentLinks, backlinkIndex, backlinksUI, lime, createApplicationExecution(), lupPicker, ...(options.features && !options.features.includes('settings') ? [] : [limeSettings]), preservation.plugin, ...extra.plugins, ...updates, clipboardDriver, clipboardProvider, device, transport, accountSession, account, remoteFilesystem, draftsProvider, router, ...(options.platformPlugins ?? []), mobileMenu, statusBar, callouts, textEditor, interfaceSettings, settingsProvider, settings, activeScreenProvider, activeScreen, activeDocument, contextMenu, fileExplorer, sidebar, sidebarProvider, runner, ...(options.mode === "desktop" ? [selector] : []), workspace, workspaceProvider, themeSettings, mantineComponents, startup.plugin, baseThemeEngine, themeProvider, componentProvider, ...layout.plugins, devTools, logger, filesystem, vaultManager, vaultHistory, configManager, localizationManager],
    entrypoints: [
      startup.plugin.manifest.id, themeProvider.manifest.id, baseThemeEngine.manifest.id, themeSettings.manifest.id,
      componentProvider.manifest.id, mantineComponents.manifest.id, ...layout.entrypoints,
      documentLinks.manifest.id, backlinksUI.manifest.id, preservation.plugin.manifest.id,
      ...extra.entrypoints, ...updates.map(plugin => plugin.manifest.id), account.manifest.id,
      mobileMenu.manifest.id, statusBar.manifest.id, callouts.manifest.id, textEditor.manifest.id,
      configManager.manifest.id, vaultHistory.manifest.id, localizationManager.manifest.id,
      runner.manifest.id, workspace.manifest.id, activeScreen.manifest.id, sidebar.manifest.id,
      fileExplorer.manifest.id, settings.manifest.id, interfaceSettings.manifest.id, lime.manifest.id,
      ...(options.mode === "desktop" ? [selector.manifest.id] : []),
      ...(options.features && !options.features.includes('settings') ? [] : [limeSettings.manifest.id]),
    ],
  };
  const excluded = new Set(options.extensions?.excludeBuiltins ?? []);
  const plugins = definition.plugins.filter(plugin => !disabled.has(plugin.manifest.id) && (extra.plugins.includes(plugin) || !excluded.has(plugin.manifest.id)));
  const registeredIds = new Set(plugins.map(plugin => plugin.manifest.id));
  return { ...definition, ...(options.extensions?.selections ? { selections: options.extensions.selections } : {}), plugins, entrypoints: definition.entrypoints.filter(id => registeredIds.has(id)),
    grants: Object.fromEntries(plugins.map(({ manifest }) => [manifest.id, extra.grants[manifest.id] ?? [...manifest.permissions, ...manifest.optionalPermissions]])) };
}

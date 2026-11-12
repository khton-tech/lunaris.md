import documentLinks from "@lunaris/document-links";
import externalLinks from "@lunaris/external-links-provider";
import { createBrowserLinks } from "@lunaris/browser-links";
import backlinkIndex from "@lunaris/backlink-index";
import backlinksUI from "@lunaris/backlinks-ui";
import mobileMenu from "@lunaris/mobile-menu-plugin";
import { createLime } from "@lunaris/lime-manager";
import limeSettings from "@lunaris/lime-settings";
import quickjsExecution from "@lunaris/quickjs-execution";
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
  const transport = createServerTransport({ mode: options.mode });
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
    startup,
    beforeClose: async () => await preservation.beforeClose() && (extra.beforeClose ? await extra.beforeClose() : true),
    plugins: [linksDriver, externalLinks, documentLinks, backlinkIndex, backlinksUI, lime, quickjsExecution, lupPicker, ...(options.features && !options.features.includes('settings') ? [] : [limeSettings]), preservation.plugin, ...extra.plugins, ...updates, clipboardDriver, clipboardProvider, device, transport, accountSession, account, remoteFilesystem, draftsProvider, router, ...(options.platformPlugins ?? []), mobileMenu, statusBar, callouts, textEditor, interfaceSettings, settingsProvider, settings, activeScreenProvider, activeScreen, activeDocument, contextMenu, fileExplorer, sidebar, sidebarProvider, runner, ...(options.mode === "desktop" ? [selector] : []), workspace, workspaceProvider, themeSettings, mantineComponents, startup.plugin, baseThemeEngine, themeProvider, componentProvider, ...layout.plugins, devTools, logger, filesystem, vaultManager, vaultHistory, configManager, localizationManager],
    entrypoints: [documentLinks.manifest.id, backlinksUI.manifest.id, startup.plugin.manifest.id, baseThemeEngine.manifest.id, themeSettings.manifest.id, preservation.plugin.manifest.id, ...extra.entrypoints, ...updates.map(plugin => plugin.manifest.id), account.manifest.id, mobileMenu.manifest.id, statusBar.manifest.id, callouts.manifest.id, textEditor.manifest.id, startup.plugin.manifest.id, baseThemeEngine.manifest.id, themeProvider.manifest.id, componentProvider.manifest.id, mantineComponents.manifest.id, ...layout.entrypoints, configManager.manifest.id, vaultHistory.manifest.id, themeSettings.manifest.id, localizationManager.manifest.id, runner.manifest.id, workspace.manifest.id, activeScreen.manifest.id, sidebar.manifest.id, fileExplorer.manifest.id, settings.manifest.id, interfaceSettings.manifest.id, lime.manifest.id, ...(options.mode === "desktop" ? [selector.manifest.id] : []), ...(options.features && !options.features.includes('settings') ? [] : [limeSettings.manifest.id])],
    grants: {
      [startup.plugin.manifest.id]: ["vault.access"],
      [lime.manifest.id]: lime.manifest.permissions,
      [limeSettings.manifest.id]: limeSettings.manifest.permissions,
      ...layout.grants,
      [preservation.plugin.manifest.id]: ["vault.access"],
      ...extra.grants,
      ...Object.fromEntries(updates.map(plugin => [plugin.manifest.id, plugin.manifest.permissions])),
      [clipboardDriver.manifest.id]: clipboardDriver.manifest.permissions,
      [clipboardProvider.manifest.id]: clipboardProvider.manifest.permissions,
      [device.manifest.id]: device.manifest.permissions,
      [transport.manifest.id]: options.mode === "desktop" ? ["credentials.access"] : [],
      [accountSession.manifest.id]: ["vault.access", "filesystem.access", "account.network"],
      [account.manifest.id]: ["account.access", "filesystem.access", "vault.access", "ui.dom"],
      [remoteFilesystem.manifest.id]: ["filesystem.native", "account.network", "account.access"],
      [draftsProvider.manifest.id]: ["drafts.access"],
      [router.manifest.id]: ["filesystem.native", "filesystem.access", "filesystem.app-config"],
      [statusBar.manifest.id]: statusBar.manifest.permissions,
      [linksDriver.manifest.id]: linksDriver.manifest.permissions,
      [externalLinks.manifest.id]: externalLinks.manifest.permissions,
      [documentLinks.manifest.id]: documentLinks.manifest.permissions,
      [backlinkIndex.manifest.id]: backlinkIndex.manifest.permissions,
      [backlinksUI.manifest.id]: backlinksUI.manifest.permissions,
      [callouts.manifest.id]: ["ui.dom"],
      [textEditor.manifest.id]: ["config.access", "clipboard.access", "ui.dom", "filesystem.access", "vault.access", "drafts.access", "account.access"],
      [interfaceSettings.manifest.id]: ["config.access", "vault.access"],
      [settings.manifest.id]: ["ui.dom", "vault.access"],
      [activeScreenProvider.manifest.id]: ["vault.access"],
      [activeScreen.manifest.id]: ["ui.dom", "vault.access", "filesystem.access"],
      [activeDocument.manifest.id]: ["vault.access", "config.access", "filesystem.access"],
      [runner.manifest.id]: ["config.access", "ui.dom"],
      ...(options.mode === "desktop" ? { [selector.manifest.id]: ["vault.access", "ui.dom", "account.access"] } : {}),
      [workspace.manifest.id]: ["vault.access", "ui.dom", "config.access"],
      [fileExplorer.manifest.id]: ["config.access", "filesystem.access", "vault.access"],
      [sidebar.manifest.id]: ["ui.dom"],
      [contextMenu.manifest.id]: ["ui.dom"],
      [themeSettings.manifest.id]: ["config.access"],
      [componentProvider.manifest.id]: ["ui.dom"],
      [mantineComponents.manifest.id]: ["ui.dom"],
      [filesystem.manifest.id]: ["filesystem.access", "filesystem.app-config"],
      [vaultManager.manifest.id]: ["filesystem.access"],
      [vaultHistory.manifest.id]: ["config.access", "vault.access", "filesystem.access", "account.access"],
      [configManager.manifest.id]: ["filesystem.access", "filesystem.app-config", "vault.access"],
    },
  };
  const excluded = new Set(options.extensions?.excludeBuiltins ?? []);
  const plugins = definition.plugins.filter(plugin => !disabled.has(plugin.manifest.id) && (extra.plugins.includes(plugin) || !excluded.has(plugin.manifest.id)));
  const registeredIds = new Set(plugins.map(plugin => plugin.manifest.id));
  return { ...definition, ...(options.extensions?.selections ? { selections: options.extensions.selections } : {}), plugins, entrypoints: definition.entrypoints.filter(id => registeredIds.has(id)),
    grants: Object.fromEntries(Object.entries({ ...definition.grants, ...extra.grants }).filter(([id]) => registeredIds.has(id))) };
}

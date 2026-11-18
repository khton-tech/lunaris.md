import { definePlugin } from "@lunaris/sdk";
import type { ResourceScope } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Settings, SettingsChanged } from "@lunaris/settings";
import { Sidebar } from "@lunaris/sidebar";
import { Workspace } from "@lunaris/workspace";
import { Components, ComponentsChanged } from "@lunaris/components";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Vault, VaultChanged } from "@lunaris/vault";
import { mountSettingsGroup } from "./group.js";
import { mountSettingsWindow } from "./window.js";
import { russian } from "./locales/ru.js";
import manifest from "../manifest.json" with { type: "json" };

const catalogs = { en: {
  settings: "Settings", close: "Close settings", back: "Back to categories", empty: "No settings available",
  emptyCategory: "No settings in this category", unavailable: "Section unavailable",
  unavailableDetail: "This settings section could not be displayed.", itemFailed: "Cannot update this setting. Try again.",
}, ru: russian };

function ensure(result: { ok: boolean; error?: unknown }, message: string): void {
  if (!result.ok) throw new Error(message, { cause: result.error });
}

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const registry = ctx.use(Settings);
  const sidebar = ctx.use(Sidebar);
  const workspace = ctx.use(Workspace);
  const components = ctx.use(Components);
  const localization = ctx.use(Localization);
  const vaults = ctx.use(Vault);
  const groupRole = "lunaris.settings-group-host";
  const windowRole = "lunaris.settings-window-host";
  const actionId = `${ctx.pluginId}.open`;
  const windowId = `${ctx.pluginId}.window`;
  let opened: { readonly owner: ResourceScope; readonly vaultId: string } | undefined;

  ensure(localization.register(ctx.pluginId, catalogs, ctx.signal), "Cannot register settings messages.");
  const text = (key: keyof typeof russian) => localization.text(ctx.pluginId, key);

  function close(): void {
    if (!opened) return;
    const { owner } = opened;
    opened = undefined;
    void owner.dispose().catch(() => {});
    if (!ctx.signal.aborted) logger.info(ctx.pluginId, "Settings closed");
  }
  function open(): void {
    if (ctx.signal.aborted || opened) return;
    const vault = vaults.current();
    if (!vault) return;
    if (!components.has("lunaris.settings-window") || !components.has("lunaris.settings-page")) {
      logger.warn(ctx.pluginId, "Settings presentation is unavailable");
      return;
    }
    const owner = ctx.scope.child();
    opened = { owner, vaultId: vault.id };
    const result = workspace.register({ id: windowId, componentId: windowRole, region: "overlay" }, owner.signal);
    if (!result.ok) {
      opened = undefined;
      void owner.dispose().catch(() => {});
      logger.warn(ctx.pluginId, "Cannot open settings", { error: result.error });
      return;
    }
    logger.info(ctx.pluginId, "Settings opened");
  }
  function refresh(): void {
    if (ctx.signal.aborted || !opened) return;
    const result = workspace.update(windowId, {});
    if (!result.ok) logger.error(ctx.pluginId, "Cannot refresh settings", { error: result.error });
  }
  const sidebarAction = () => ({ id: actionId, title: text("settings"), icon: "settings", placement: "end" as const, opensDialog: true, onPress: open });

  ensure(components.register({ id: groupRole, mount: (target, props, signal) => mountSettingsGroup(ctx, registry, components, logger, target, props, signal) }, ctx.signal), "Cannot register settings group host.");
  ensure(components.register({ id: windowRole, mount: (target, props, signal) => {
    const current = opened;
    return mountSettingsWindow({ ctx, registry, components, logger, text, groupRole, target, props, signal,
      isCurrent: vaultId => opened === current && current?.vaultId === vaultId && vaults.current()?.id === vaultId, close });
  } }, ctx.signal), "Cannot register settings window host.");
  ensure(sidebar.registerAction(sidebarAction(), ctx.signal), "Cannot register settings action.");

  ctx.events.on(SettingsChanged, refresh);
  ctx.events.on(LocaleChanged, () => {
    ensure(sidebar.updateAction(sidebarAction()), "Cannot update settings action.");
    refresh();
  });
  ctx.events.on(VaultChanged, () => { if (opened && opened.vaultId !== vaults.current()?.id) close(); });
  ctx.events.on(ComponentsChanged, change => {
    if (change.kind === "removed" && ["lunaris.settings-window", "lunaris.settings-page"].includes(change.componentId)) close();
    else if (![windowRole, groupRole].includes(change.componentId)) refresh();
  });
  logger.info(ctx.pluginId, "Settings UI ready");
} });

import { russian } from "./locales/ru.js";
import { definePlugin } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Settings, SettingsChanged } from "@lunaris/settings";
import { Sidebar } from "@lunaris/sidebar";
import { ActiveScreen } from "@lunaris/active-screen";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { ComponentProps, MountedComponent } from "@lunaris/components";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Vault, VaultChanged } from "@lunaris/vault";
import { mountSettingsPage } from "./page.js";
import { mountSettingsGroup } from "./group.js";
import manifest from "../manifest.json" with { type: "json" };

const catalogs = { en: { settings: "Settings", empty: "No settings available", select: "Select a category",
  emptyCategory: "No settings in this category", unavailable: "Section unavailable", unavailableDetail: "This settings section could not be displayed.", itemFailed: "Cannot update this setting. Try again." }, ru: russian };

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const registry = ctx.use(Settings); const sidebar = ctx.use(Sidebar);
  const screens = ctx.use(ActiveScreen); const components = ctx.use(Components); const localization = ctx.use(Localization); const vaults = ctx.use(Vault);
  const messages = localization.register(ctx.pluginId, catalogs, ctx.signal);
  if (!messages.ok) throw new Error("Cannot register settings messages.", { cause: messages.error });
  const tabId = `${ctx.pluginId}.navigation`; const screenId = `${ctx.pluginId}.screen`;
  let categoryId: string | null = null; let vaultId = vaults.current()?.id ?? null;
  const text = (key: string) => localization.text(ctx.pluginId, key);
  const ensure = (result: { ok: boolean; error?: unknown }, message: string) => { if (!result.ok) throw new Error(message, { cause: result.error }); };
  function choose(id: string, viewVaultId: string): void {
    if (ctx.signal.aborted || vaults.current()?.id !== viewVaultId || !registry.snapshot().categories.some(item => item.id === id)) return;
    categoryId = id; refresh();
    const selected = screens.select(screenId);
    if (!selected.ok) logger.error(ctx.pluginId, "Cannot open settings screen", { error: selected.error });
    else logger.info(ctx.pluginId, "Settings category opened", { data: { id } });
  }
  ensure(components.register({ id: "lunaris.settings-navigation-host", mount(target, initial, signal) {
    const owner = ctx.scope.child(); let mounted: MountedComponent | undefined; let props = initial; let disposed = false;
    const onSelect = (id: string) => {
      if (disposed || signal.aborted || ctx.signal.aborted) return;
      const context = props.workspace as { vaultId?: string } | undefined;
      if (context?.vaultId) choose(id, context.vaultId);
    };
    function render(): void {
      if (disposed || signal.aborted || ctx.signal.aborted) return;
      const next = { ...props, onSelect, presentation: { mode: "embedded", sizing: "fill" } };
      if (mounted) { const result = mounted.update(next); if (result.ok) return; mounted.dispose(); mounted = undefined; }
      const result = components.mount("lunaris.settings-navigation", target, next, owner.signal);
      if (!result.ok) throw new Error("Cannot mount settings navigation.", { cause: result.error });
      mounted = result.value;
    }
    function dispose(): void { if (disposed) return; disposed = true; signal.removeEventListener("abort", dispose); void owner.dispose().catch(() => {}); }
    signal.addEventListener("abort", dispose, { once: true });
    try { render(); } catch (error) { dispose(); throw error; }
    return { update(next: ComponentProps) { props = next; render(); }, dispose };
  } }, ctx.signal), "Cannot register settings navigation host.");
  ensure(components.register({ id: "lunaris.settings-host", mount: (target, props, signal) => mountSettingsPage(ctx, components, logger, target, props, signal) }, ctx.signal), "Cannot register settings screen host.");
  ensure(components.register({ id: "lunaris.settings-group-host", mount: (target, props, signal) => mountSettingsGroup(ctx, registry, components, logger, target, props, signal) }, ctx.signal), "Cannot register settings group host.");
  ensure(screens.register({ id: screenId, componentId: "lunaris.settings-host", props: { title: text("settings"), emptyLabel: text("select"), sections: [] } }, ctx.signal), "Cannot register settings screen.");
  ensure(sidebar.register({ id: tabId, title: text("settings"), icon: "settings", placement: "end", componentId: "lunaris.settings-navigation-host",
    props: { title: text("settings"), emptyLabel: text("empty"), categories: [], selectedId: null } }, ctx.signal), "Cannot register settings tab.");
  let refreshing = false; let pending = false;
  function refresh(): void {
    if (ctx.signal.aborted) return;
    if (refreshing) { pending = true; return; }
    refreshing = true;
    try { do {
      pending = false;
      const currentId = vaults.current()?.id ?? null;
      if (vaultId !== currentId) { vaultId = currentId; categoryId = null; }
      const snapshot = registry.snapshot(); const category = snapshot.categories.find(item => item.id === categoryId);
      if (!category) categoryId = null;
      ensure(sidebar.update(tabId, { title: text("settings"), icon: "settings", props: {
        title: text("settings"), emptyLabel: text("empty"), categories: snapshot.categories.map(item => ({ id: item.id, title: item.title, icon: item.icon })), selectedId: categoryId,
      } }), "Cannot update settings navigation.");
      ensure(screens.update(screenId, { title: category?.title ?? text("settings"), emptyLabel: text(category ? "emptyCategory" : "select"),
        sections: category ? [...snapshot.sections.filter(item => item.categoryId === category.id),
          ...snapshot.groups.filter(group => group.categoryId === category.id).map(group => ({ id: group.id, title: group.title, description: group.description, order: group.order,
            componentId: "lunaris.settings-group-host", props: { groupId: group.id, items: snapshot.items.filter(item => item.groupId === group.id), failureLabel: text("itemFailed") } }))]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [], unavailable: text("unavailable"), unavailableDetail: text("unavailableDetail"),
      }), "Cannot update settings screen.");
    } while (pending && !ctx.signal.aborted); }
    catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot refresh settings", { error }); throw error; }
    finally { refreshing = false; }
  }
  ctx.events.on(SettingsChanged, refresh); ctx.events.on(LocaleChanged, refresh); ctx.events.on(VaultChanged, refresh);
  ctx.events.on(ComponentsChanged, change => { if (!["lunaris.settings-host", "lunaris.settings-navigation-host", "lunaris.settings-group-host"].includes(change.componentId)) refresh(); });
  refresh(); logger.info(ctx.pluginId, "Settings foundation ready");
} });

import { definePlugin } from "@lunaris/sdk";
import type { ResourceScope } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Sidebar, SidebarChanged } from "@lunaris/sidebar";
import { Workspace } from "@lunaris/workspace";
import { Components, ComponentsChanged } from "@lunaris/components";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { catalogs } from "./catalog.js";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const sidebar = ctx.use(Sidebar); const workspace = ctx.use(Workspace);
  const components = ctx.use(Components); const localization = ctx.use(Localization);
  const registered = localization.register(ctx.pluginId, catalogs, ctx.signal);
  if (!registered.ok) throw new Error("Cannot register sidebar messages.", { cause: registered.error });
  let rail: ResourceScope | undefined; let panel: ResourceScope | undefined; let panelKey = "";
  const text = (key: string) => localization.text(ctx.pluginId, key);
  const dismiss = () => { if (!ctx.signal.aborted) sidebar.select(null); };
  function release(owner: ResourceScope | undefined): void { if (owner) void owner.dispose().catch(() => {}); }
  function refresh(): void {
    if (ctx.signal.aborted) return;
    const snapshot = sidebar.snapshot();
    if (!snapshot.tabs.length || !components.has("lunaris.sidebar-rail")) {
      release(panel); panel = undefined; panelKey = ""; release(rail); rail = undefined; return;
    }
    const props = { label: text("label"), activeId: snapshot.activeId, tabs: snapshot.tabs.map(tab => ({ id: tab.id, title: tab.title, icon: tab.icon, placement: tab.placement ?? "start" })),
      onSelect(id: string) { if (!ctx.signal.aborted) { const current = sidebar.snapshot(); sidebar.select(current.activeId === id ? null : id); } } };
    if (!rail) {
      rail = ctx.scope.child();
      const result = workspace.register({ id: `${ctx.pluginId}.rail`, componentId: "lunaris.sidebar-rail", region: "left-rail", props }, rail.signal);
      if (!result.ok) { release(rail); rail = undefined; throw new Error("Cannot register sidebar rail.", { cause: result.error }); }
    } else {
      const result = workspace.update(`${ctx.pluginId}.rail`, props);
      if (!result.ok) throw new Error("Cannot update sidebar rail.", { cause: result.error });
    }
    const active = snapshot.tabs.find(tab => tab.id === snapshot.activeId);
    const available = active && components.has(active.componentId);
    const key = active ? `${active.id}:${available ? active.componentId : "unavailable"}` : "";
    if (key !== panelKey) { release(panel); panel = undefined; panelKey = ""; }
    if (!active) return;
    const panelProps = available ? active.props ?? {} : { title: text("unavailable"), detail: text("unavailableDetail") };
    if (!panel) {
      panel = ctx.scope.child();
      const result = workspace.register({ id: `${ctx.pluginId}.panel`, componentId: available ? active.componentId : "lunaris.workspace-empty", region: "left-panel", onDismiss: dismiss, props: panelProps }, panel.signal);
      if (!result.ok) { release(panel); panel = undefined; throw new Error("Cannot register sidebar panel.", { cause: result.error }); }
      panelKey = key;
      if (!available) logger.warn(ctx.pluginId, "Selected sidebar component is unavailable", { code: "SIDEBAR_COMPONENT_MISSING", data: { componentId: active.componentId } });
    } else {
      const result = workspace.update(`${ctx.pluginId}.panel`, panelProps);
      if (!result.ok) throw new Error("Cannot update sidebar panel.", { cause: result.error });
    }
  }
  function update(): void { try { refresh(); } catch (error) { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot update sidebar", { code: "SIDEBAR_UPDATE_FAILED", error }); throw error; } }
  ctx.events.on(SidebarChanged, update); ctx.events.on(LocaleChanged, update);
  ctx.events.on(ComponentsChanged, change => {
    if (change.componentId === "lunaris.sidebar-rail" || change.componentId === "lunaris.workspace-empty" || sidebar.snapshot().tabs.some(tab => tab.componentId === change.componentId)) {
      if (change.kind === "removed") logger.warn(ctx.pluginId, "Sidebar component removed", { code: "SIDEBAR_COMPONENT_MISSING", data: { componentId: change.componentId } });
      update();
    }
  });
  update(); logger.info(ctx.pluginId, "Sidebar ready", { code: "SIDEBAR_READY" });
} });

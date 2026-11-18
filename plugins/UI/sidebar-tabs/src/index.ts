import { definePlugin, LunarisError } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Sidebar, SidebarChanged } from "@lunaris/sidebar";
import type { SidebarAction, SidebarTab, SidebarResult, SidebarSnapshot } from "@lunaris/sidebar";
import type { CancellationSignal } from "@lunaris/sdk";
import { readAction, readTab, presentation } from "./input.js";
import manifest from "../manifest.json" with { type: "json" };

const done: SidebarResult = Object.freeze({ ok: true, value: null });
export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const tabs = new Map<string, { tab: Required<SidebarTab>; detach(): void }>();
  const actions = new Map<string, { action: Required<SidebarAction>; owner: CancellationSignal; detach(): void }>();
  let activeId: string | null = null;
  const byPlacementAndOrder = (a: { placement: string; order: number }, b: { placement: string; order: number }) =>
    Number(a.placement === "end") - Number(b.placement === "end") || a.order - b.order;
  function snapshot(): SidebarSnapshot {
    return Object.freeze({ tabs: Object.freeze([...tabs.values()].map(entry => entry.tab).sort(byPlacementAndOrder)), activeId,
      ...(actions.size ? { actions: Object.freeze([...actions.values()].map(entry => entry.action).sort(byPlacementAndOrder)) } : {}) });
  }
  function notify(cleanup = false): Promise<void> {
    if (ctx.signal.aborted) return Promise.resolve();
    return ctx.events.emit(SidebarChanged, snapshot()).catch(error => {
      if (ctx.signal.aborted || (error instanceof LunarisError && error.code === "CONTRACT_UNAVAILABLE")) return;
      if (cleanup) throw error;
      logger.error(ctx.pluginId, "Cannot publish sidebar change", { code: "SIDEBAR_EVENT_FAILED", error });
    });
  }
  function reject(code: "INVALID_ARGUMENT" | "ALREADY_REGISTERED" | "NOT_FOUND", message: string): SidebarResult {
    logger.warn(ctx.pluginId, message, { code }); return { ok: false, error: { code, message } };
  }
  function bind(input: Required<SidebarAction>, owner: CancellationSignal): Required<SidebarAction> {
    const action = Object.freeze({ ...input, onPress() {
      if (ctx.signal.aborted || owner.aborted || actions.get(input.id)?.action !== action) return;
      try { input.onPress(); }
      catch (error) { logger.error(ctx.pluginId, "Sidebar action failed", { data: { id: input.id }, error }); }
    } });
    return action;
  }
  ctx.scope.own({ dispose() {
    for (const entry of [...tabs.values(), ...actions.values()]) entry.detach();
    tabs.clear(); actions.clear(); activeId = null;
  } });
  ctx.provide(Sidebar, {
    snapshot,
    register(input, owner) {
      const tab = readTab(input);
      if (!tab || !owner || owner.aborted !== false || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") return reject("INVALID_ARGUMENT", "A valid sidebar tab and live owner are required.");
      if (tabs.has(tab.id) || actions.has(tab.id)) return reject("ALREADY_REGISTERED", "The sidebar ID is already registered.");
      const wasEmpty = !tabs.size;
      const remove = () => {
        tabs.delete(tab.id); owner.removeEventListener("abort", remove);
        if (activeId === tab.id) activeId = snapshot().tabs[0]?.id ?? null;
        return notify(true);
      };
      tabs.set(tab.id, { tab, detach: () => owner.removeEventListener("abort", remove) });
      owner.addEventListener("abort", remove, { once: true });
      if (wasEmpty) activeId = tab.id;
      logger.info(ctx.pluginId, "Sidebar tab registered", { code: "SIDEBAR_TAB_REGISTERED", data: { id: tab.id } });
      void notify(); return done;
    },
    registerAction(input, owner) {
      const action = readAction(input);
      if (!action || !owner || owner.aborted !== false || typeof owner.addEventListener !== "function" || typeof owner.removeEventListener !== "function") return reject("INVALID_ARGUMENT", "A valid sidebar action and live owner are required.");
      if (tabs.has(action.id) || actions.has(action.id)) return reject("ALREADY_REGISTERED", "The sidebar ID is already registered.");
      const remove = () => { actions.delete(action.id); owner.removeEventListener("abort", remove); return notify(true); };
      actions.set(action.id, { action: bind(action, owner), owner, detach: () => owner.removeEventListener("abort", remove) });
      owner.addEventListener("abort", remove, { once: true });
      logger.info(ctx.pluginId, "Sidebar action registered", { data: { id: action.id } });
      void notify(); return done;
    },
    updateAction(input) {
      const action = readAction(input);
      if (!action) return reject("INVALID_ARGUMENT", "A valid sidebar action is required.");
      const entry = actions.get(action.id);
      if (!entry) return reject("NOT_FOUND", "The sidebar action is not registered.");
      entry.action = bind(action, entry.owner);
      void notify(); return done;
    },
    update(id, input) {
      const changes = presentation(input); if (!changes) return reject("INVALID_ARGUMENT", "A title, icon and plain props are required.");
      const entry = tabs.get(id); if (!entry) return reject("NOT_FOUND", "The sidebar tab is not registered.");
      entry.tab = Object.freeze({ ...entry.tab, ...changes }); logger.debug(ctx.pluginId, "Sidebar tab updated", { data: { id } });
      void notify(); return done;
    },
    select(id) {
      if (id !== null && typeof id !== "string") return reject("INVALID_ARGUMENT", "A sidebar tab ID or null is required.");
      if (id !== null && !tabs.has(id)) return reject("NOT_FOUND", "The sidebar tab is not registered.");
      if (activeId === id) return done;
      activeId = id; logger.info(ctx.pluginId, "Sidebar selection changed", { code: "SIDEBAR_SELECTED", data: { id } });
      void notify(); return done;
    },
  });
  logger.info(ctx.pluginId, "Sidebar tab provider ready", { code: "SIDEBAR_PROVIDER_READY" });
} });

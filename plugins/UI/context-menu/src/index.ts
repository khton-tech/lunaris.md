import { definePlugin } from "@lunaris/sdk";
import type { CancellationSignal } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { MountedComponent } from "@lunaris/components";
import { ContextMenu } from "@lunaris/context-menu";
import type { MenuContext, MenuContribution, MenuEntry, MenuItem, MenuResult, MenuSession } from "@lunaris/context-menu";
import manifest from "../manifest.json" with { type: "json" };

const live = (owner: CancellationSignal): boolean => !!owner && owner.aborted === false && typeof owner.addEventListener === "function" && typeof owner.removeEventListener === "function";
const idValid = (id: unknown): id is string => typeof id === "string" && id.trim().length > 0;
const done = { ok: true, value: null } as const;

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger);
  const components = ctx.use(Components);
  let active: MenuSession | undefined;
  const registrations = new Map<string, { build: MenuContribution["build"]; owner: CancellationSignal; dispose(): void }>();
  const sessions = new Set<MenuSession>();
  function reject<T>(code: Extract<MenuResult<T>, { ok: false }>["error"]["code"], message: string): MenuResult<T> {
    logger.warn(ctx.pluginId, message, { code }); return { ok: false, error: { code, message } };
  }
  ctx.scope.own({ dispose() {
    for (const session of sessions) session.dispose();
    for (const entry of registrations.values()) entry.dispose();
  } });
  ctx.events.on(ComponentsChanged, change => { if (change.componentId === "lunaris.context-menu" && change.kind === "removed") active?.dispose(); });
  const api = {
    register(input: MenuContribution, owner: CancellationSignal): MenuResult<{ dispose(): void }> {
      if (!input || !idValid(input.id) || typeof input.build !== "function" || !live(owner)) return reject("INVALID_ARGUMENT", "A contribution and live owner are required.");
      const { id, build } = input;
      if (registrations.has(id)) return reject("ALREADY_REGISTERED", "Context menu contribution already registered.");
      const entry = { build, owner, dispose() {
        if (registrations.get(id) !== entry) return;
        registrations.delete(id); owner.removeEventListener("abort", entry.dispose);
      } };
      registrations.set(id, entry); owner.addEventListener("abort", entry.dispose, { once: true });
      logger.info(ctx.pluginId, "Context menu contribution registered", { data: { id } });
      return { ok: true, value: { dispose: entry.dispose } };
    },
    resolve(input: MenuContext, owner: CancellationSignal, localEntries: readonly MenuEntry[] = []): MenuResult<MenuSession> {
      if (!input || !idValid(input.source) || !idValid(input.target) || !input.data || Object.getPrototypeOf(input.data) !== Object.prototype || !live(owner)) return reject("INVALID_ARGUMENT", "Context and a live menu owner are required.");
      const context: MenuContext = Object.freeze({ source: input.source, target: input.target, data: Object.freeze({ ...input.data }) });
      const actions = new Map<string, { run: (context: MenuContext) => unknown; available(): boolean }>();
      const ids = new Set<string>();
      function capture(entries: readonly MenuEntry[], available: () => boolean, disabled = false, depth = 0): readonly MenuItem[] {
        if (!Array.isArray(entries) || depth > 32) throw new TypeError("Invalid or excessively deep context menu tree.");
        const items = entries.map(entry => {
          if (!entry || !idValid(entry.id) || ids.has(entry.id) || typeof entry.label !== "string" || !entry.label.trim() ||
            (entry.icon !== undefined && !idValid(entry.icon)) || (entry.order !== undefined && !Number.isFinite(entry.order)) || (entry.disabled !== undefined && typeof entry.disabled !== "boolean")) throw new TypeError("Invalid or duplicate context menu entry.");
          ids.add(entry.id);
          const base = { id: entry.id, label: entry.label, icon: entry.icon ?? (entry.kind === "group" ? "folder" : "actions"), order: entry.order ?? 0, disabled: disabled || entry.disabled === true };
          if (entry.kind === "group") return Object.freeze({ ...base, kind: "group" as const, children: capture(entry.children, available, base.disabled, depth + 1) });
          if (entry.kind !== "action" || typeof entry.run !== "function") throw new TypeError("Invalid context menu action.");
          actions.set(entry.id, { run: entry.run, available: () => !base.disabled && available() });
          return Object.freeze({ ...base, kind: "action" as const });
        }).filter(item => !item.disabled && (item.kind !== "group" || item.children.length > 0));
        return Object.freeze(items.sort((a, b) => a.order - b.order));
      }
      let items: readonly MenuItem[];
      try {
        const roots: MenuItem[] = [...capture(localEntries, () => true)];
        for (const [id, entry] of registrations) {
          const built = entry.build(context);
          if (!live(owner) || ctx.signal.aborted) return reject("UNAVAILABLE", "Context menu owner is no longer active.");
          roots.push(...capture(built, () => !entry.owner.aborted && registrations.get(id) === entry));
        }
        items = Object.freeze(roots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      } catch (error) {
        logger.error(ctx.pluginId, "Cannot build context menu", { code: "BUILD_FAILED", error });
        return { ok: false, error: { code: "BUILD_FAILED", message: "Cannot build context menu." } };
      }
      let closed = false; let executing = false;
      const session: MenuSession = Object.freeze({ items, async execute(id: string): Promise<MenuResult<null>> {
        if (closed || executing || owner.aborted || ctx.signal.aborted) return { ok: false, error: { code: "UNAVAILABLE", message: "Context menu is no longer active." } };
        const action = actions.get(id);
        if (!action) return reject("NOT_FOUND", "Context menu action not found.");
        if (!action.available()) return reject("UNAVAILABLE", "Context menu action is unavailable.");
        executing = true;
        // Releasing the UI must not cancel a command that already started.
        const run = action.run; session.dispose();
        try {
          await run(context);
          if (!ctx.signal.aborted) logger.info(ctx.pluginId, "Context menu action completed", { data: { id } });
          return done;
        } catch (error) {
          if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Context menu action failed", { code: "ACTION_FAILED", data: { id }, error });
          return { ok: false, error: { code: "ACTION_FAILED", message: "Context menu action failed." } };
        }
      }, dispose() {
        if (closed) return; closed = true; owner.removeEventListener("abort", session.dispose); sessions.delete(session); actions.clear();
      } });
      sessions.add(session); owner.addEventListener("abort", session.dispose, { once: true });
      logger.debug(ctx.pluginId, "Context menu resolved", { data: { source: context.source, target: context.target, count: items.length } });
      return { ok: true, value: session };
    },
    open(request: import("@lunaris/context-menu").MenuOpenRequest, owner: CancellationSignal): MenuResult<MenuSession> {
      if (!request || !request.target?.isConnected || !request.target.ownerDocument?.body || !Number.isFinite(request.x) || !Number.isFinite(request.y) || !idValid(request.label)) return reject("INVALID_ARGUMENT", "A connected target, position and localized label are required.");
      const resolved = api.resolve(request.context, owner, request.entries);
      if (!resolved.ok) return resolved;
      const inner = resolved.value;
      active?.dispose();
      if (!inner.items.length) { inner.dispose(); return { ok: true, value: inner }; }
      const overlay = request.target.ownerDocument.createElement("div");
      overlay.dataset.lunarisContextMenu = "";
      Object.assign(overlay.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "1000" });
      request.target.ownerDocument.body.append(overlay);
      let mounted: MountedComponent | undefined; let closed = false;
      const view: MenuSession = Object.freeze({ items: inner.items, async execute(id: string) {
        // Inner execution checks liveness before closing the overlay.
        const result = inner.execute(id); view.dispose(); return result;
      }, dispose() {
        if (closed) return; closed = true;
        owner.removeEventListener("abort", view.dispose); sessions.delete(view);
        if (active === view) active = undefined;
        inner.dispose();
        const document = overlay.ownerDocument;
        const restoreFocus = overlay.contains(document.activeElement) || document.activeElement === document.body;
        try { mounted?.dispose(); } finally {
          overlay.remove();
          if (restoreFocus && !owner.aborted && !ctx.signal.aborted && request.target.isConnected) request.target.focus({ preventScroll: true });
        }
      } });
      let result;
      try {
        result = components.mount("lunaris.context-menu", overlay, {
          items: inner.items, x: request.x, y: request.y, label: request.label,
          onAction: (id: string) => { void view.execute(id); }, onClose: () => view.dispose(),
        }, owner);
      } catch (error) {
        view.dispose();
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot mount context menu", { code: "UNAVAILABLE", error });
        return { ok: false, error: { code: "UNAVAILABLE", message: "Context menu renderer failed." } };
      }
      if (!result.ok) { view.dispose(); return reject("UNAVAILABLE", "Context menu renderer is unavailable."); }
      mounted = result.value;
      if (!live(owner) || ctx.signal.aborted) { view.dispose(); return { ok: false, error: { code: "UNAVAILABLE", message: "Context menu owner is no longer active." } }; }
      active = view; sessions.add(view); owner.addEventListener("abort", view.dispose, { once: true });
      return { ok: true, value: view };
    },
  };
  ctx.provide(ContextMenu, api);
  logger.info(ctx.pluginId, "Context menu provider ready", { code: "CONTEXT_MENU_READY" });
} });

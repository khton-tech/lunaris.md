import { definePlugin } from "@lunaris/sdk";
import type { ResourceScope } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Slots } from "@lunaris/slots";
import { SlotDom } from "@lunaris/slot-dom";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { ComponentProps, MountedComponent } from "@lunaris/components";
import { Startup, StartupChanged } from "@lunaris/startup";
import { Vault, VaultChanged } from "@lunaris/vault";
import { Workspace, WorkspaceChanged } from "@lunaris/workspace";
import { catalogs } from "./catalog.js";
import manifest from "../manifest.json" with { type: "json" };

interface View { readonly owner: ResourceScope; readonly slotId: string; readonly componentId: string; mounted?: MountedComponent | undefined }

export default definePlugin({ manifest, activate(ctx) {
  const logger = ctx.use(Logger);
  const localization = ctx.use(Localization); const slots = ctx.use(Slots); const targets = ctx.use(SlotDom);
  const components = ctx.use(Components); const vaults = ctx.use(Vault); const startup = ctx.use(Startup);
  const registered = localization.register(ctx.pluginId, catalogs, ctx.signal);
  if (!registered.ok) throw new Error("Cannot register workspace messages.", { cause: registered.error });
  const workspace = ctx.use(Workspace); const views = new Map<string, View>();
  const rootId = `${ctx.pluginId}.screen`;
  const contentId = `${ctx.pluginId}.content`;
  let screen: ResourceScope | undefined; let screenVaultId: string | undefined;
  let header: View | undefined; let empty: View | undefined; let sequence = 0;
  let latest = startup.snapshot(); let closing = false; let closeFailed = false;
  const text = (key: string) => localization.text(ctx.pluginId, key);
  function release(owner: ResourceScope | undefined): void {
    // Owned scopes report cleanup failures through independent kernel diagnostics.
    if (owner) void owner.dispose().catch(() => {});
  }
  function releaseScreen(): void {
    release(screen);
    screen = undefined; screenVaultId = undefined;
    views.clear(); header = undefined; empty = undefined;
  }
  ctx.scope.own({ dispose() {
    releaseScreen();
  } });
  function createView(componentId: string, order: number, grow: number, parentId = contentId): View {
    const owner = screen!.child();
    const slotId = `${ctx.pluginId}.view-${++sequence}`;
    const result = slots.create({ id: slotId, parent: parentId, order, grow }, owner.signal);
    if (!result.ok) { release(owner); throw new Error("Cannot allocate workspace content.", { cause: result.error }); }
    return { owner, slotId, componentId };
  }
  function show(view: View, props: ComponentProps): boolean {
    if (view.mounted) {
      const result = view.mounted.update(props);
      if (result.ok) return true;
      view.mounted = undefined;
      if (result.error.code !== "NOT_FOUND") {
        logger.error(ctx.pluginId, "Cannot update workspace component", { code: result.error.code, error: result.error, data: { componentId: view.componentId } });
        return false;
      }
    }
    if (!components.has(view.componentId)) return false;
    const target = targets.get(view.slotId);
    if (!target) throw new Error("Workspace rendering target is unavailable.");
    const result = components.mount(view.componentId, target, props, view.owner.signal);
    if (!result.ok) {
      logger.error(ctx.pluginId, "Cannot mount workspace component", { code: result.error.code, error: result.error, data: { componentId: view.componentId } });
      return false;
    }
    view.mounted = result.value;
    return true;
  }
  function render(): void {
    if (ctx.signal.aborted) return;
    const current = vaults.current();
    if (!current || latest.state !== "loaded") { releaseScreen(); return; }
    if (screenVaultId !== current.id) {
      releaseScreen(); screen = ctx.scope.child(); screenVaultId = current.id; closeFailed = false;
      const result = slots.create({ id: rootId, grow: 1 }, screen.signal);
      if (!result.ok) { releaseScreen(); throw new Error("Cannot allocate workspace screen.", { cause: result.error }); }
      const content = slots.create({ id: contentId, parent: rootId, order: 1, grow: 1 }, screen.signal);
      if (!content.ok) { releaseScreen(); throw new Error("Cannot allocate workspace content region.", { cause: content.error }); }
      logger.info(ctx.pluginId, "Workspace opened", { code: "WORKSPACE_OPENED" });
    }
    header ??= createView("lunaris.workspace-header", 0, 0, rootId);
    if (!show(header, { name: current.name, closeLabel: text("close"), busy: closing, error: closeFailed ? text("closeError") : "", onClose: close })) {
      release(header.owner); header = undefined;
    }
    let visible = 0;
    const context = Object.freeze({ vaultId: current.id, vaultName: current.name });
    const entries = workspace.list();
    for (const [id, view] of views) if (!entries.some(entry => entry.id === id)) { release(view.owner); views.delete(id); }
    for (const content of entries) {
      // Missing roles must not reserve empty space or suppress the placeholder.
      if (!components.has(content.componentId)) continue;
      let view = views.get(content.id);
      if (!view) { view = createView(content.componentId, content.order ?? 0, 1); views.set(content.id, view); }
      if (show(view, { ...content.props, workspace: context })) visible++;
      else { release(view.owner); views.delete(content.id); }
    }
    if (visible) { if (empty) release(empty.owner); empty = undefined; }
    else {
      empty ??= createView("lunaris.workspace-empty", 0, 1);
      if (!show(empty, { title: text("empty"), detail: text("emptyDetail") })) { release(empty.owner); empty = undefined; }
    }
  }
  function refresh(): void {
    try { render(); }
    catch (error) {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot render workspace", { code: "WORKSPACE_RENDER_FAILED", error });
      throw error;
    }
  }
  function close(): void {
    if (closing || ctx.signal.aborted) return;
    closing = true; closeFailed = false; refresh();
    void (async () => {
      try {
        const result = await vaults.close();
        if (ctx.signal.aborted) return;
        if (!result.ok) {
          closeFailed = true;
          logger.error(ctx.pluginId, "Cannot close workspace Vault", { code: result.error.code, error: result.error });
        } else logger.info(ctx.pluginId, "Workspace Vault closed", { code: "WORKSPACE_CLOSED" });
      } catch (error) {
        if (!ctx.signal.aborted) { closeFailed = true; logger.error(ctx.pluginId, "Cannot close workspace Vault", { code: "WORKSPACE_CLOSE_FAILED", error }); }
      } finally { closing = false; if (!ctx.signal.aborted) refresh(); }
    })().catch(error => { if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot refresh workspace after closing", { code: "WORKSPACE_RENDER_FAILED", error }); });
  }
  ctx.events.on(WorkspaceChanged, change => {
    const entry = workspace.list().find(item => item.id === change.id);
    if (entry && !components.has(entry.componentId)) logger.warn(ctx.pluginId, "Waiting for workspace component role", { code: "WORKSPACE_COMPONENT_MISSING", data: { componentId: entry.componentId } });
    refresh();
  });
  ctx.events.on(StartupChanged, snapshot => { if (snapshot.sequence <= latest.sequence) return; latest = snapshot; refresh(); });
  ctx.events.on(VaultChanged, refresh);
  ctx.events.on(LocaleChanged, refresh);
  ctx.events.on(ComponentsChanged, change => {
    if (change.kind === "removed") {
      if (workspace.list().some(entry => entry.componentId === change.componentId) || change.componentId.startsWith("lunaris.workspace-")) {
        logger.warn(ctx.pluginId, "Workspace component removed; waiting for replacement", { code: "WORKSPACE_COMPONENT_MISSING", data: { componentId: change.componentId } });
      }
      for (const [id, view] of views) if (view.componentId === change.componentId) { release(view.owner); views.delete(id); }
      if (header?.componentId === change.componentId) { release(header.owner); header = undefined; }
      if (empty?.componentId === change.componentId) { release(empty.owner); empty = undefined; }
    }
    if (change.componentId.startsWith("lunaris.workspace-") || workspace.list().some(entry => entry.componentId === change.componentId)) refresh();
  });
  refresh();
  for (const role of ["lunaris.workspace-header", "lunaris.workspace-empty"]) {
    if (!components.has(role)) logger.warn(ctx.pluginId, "Waiting for workspace component role", { code: "WORKSPACE_COMPONENT_MISSING", data: { componentId: role } });
  }
  logger.info(ctx.pluginId, "Workspace ready", { code: "WORKSPACE_READY" });
} });

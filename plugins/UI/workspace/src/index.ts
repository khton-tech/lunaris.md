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

interface View { readonly owner: ResourceScope; readonly target: HTMLElement; readonly componentId: string; readonly region?: string; mounted?: MountedComponent | undefined }
type Regions = Readonly<Record<"main" | "left-rail" | "left-panel", HTMLElement>>;

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
  let empty: View | undefined; let sideEmpty: View | undefined; let layout: View | undefined; let regions: Regions | undefined; let sequence = 0;
  const contentSignatures = new Map<string, string>();
  let latest = startup.snapshot();
  const text = (key: string) => localization.text(ctx.pluginId, key);
  function release(owner: ResourceScope | undefined): void {
    // Owned scopes report cleanup failures through independent kernel diagnostics.
    if (owner) void owner.dispose().catch(() => {});
  }
  function releaseContent(): void {
    for (const view of views.values()) release(view.owner);
    views.clear(); contentSignatures.clear(); release(empty?.owner); empty = undefined;
    release(sideEmpty?.owner); sideEmpty = undefined;
  }
  function releaseScreen(): void {
    release(screen);
    screen = undefined; screenVaultId = undefined;
    views.clear(); empty = undefined; sideEmpty = undefined; layout = undefined; regions = undefined; contentSignatures.clear();
  }
  ctx.scope.own({ dispose() {
    releaseScreen();
  } });
  function createView(componentId: string, order: number, grow: number, parentId = contentId): View {
    const owner = screen!.child();
    const slotId = `${ctx.pluginId}.view-${++sequence}`;
    const result = slots.create({ id: slotId, parent: parentId, order, grow }, owner.signal);
    if (!result.ok) { release(owner); throw new Error("Cannot allocate workspace content.", { cause: result.error }); }
    const target = targets.get(slotId);
    if (!target) { release(owner); throw new Error("Workspace rendering target is unavailable."); }
    return { owner, target, componentId };
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
    const result = components.mount(view.componentId, view.target, props, view.owner.signal);
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
      releaseScreen(); screen = ctx.scope.child(); screenVaultId = current.id;
      const result = slots.create({ id: rootId, grow: 1 }, screen.signal);
      if (!result.ok) { releaseScreen(); throw new Error("Cannot allocate workspace screen.", { cause: result.error }); }
      const content = slots.create({ id: contentId, parent: rootId, order: 1, grow: 1 }, screen.signal);
      if (!content.ok) { releaseScreen(); throw new Error("Cannot allocate workspace content region.", { cause: content.error }); }
      logger.info(ctx.pluginId, "Workspace opened", { code: "WORKSPACE_OPENED" });
    }
    layout ??= createView("lunaris.workspace-layout", 0, 1);
    const entries = workspace.list();
    const available = entries.filter(entry => components.has(entry.componentId));
    if (!show(layout, { railVisible: available.some(entry => entry.region === "left-rail"), panelVisible: available.some(entry => entry.region === "left-panel"),
      mainLabel: text("main"), panelLabel: text("panel"), onTargets, onDismiss })) {
      releaseContent(); release(layout.owner); layout = undefined; regions = undefined; return;
    }
    if (!regions) return;
    for (const region of ["main", "left-rail", "left-panel"]) {
      const signature = JSON.stringify(available.filter(entry => (entry.region ?? "main") === region).map(entry => [entry.id, entry.componentId, entry.order ?? 0]));
      if (signature !== contentSignatures.get(region)) {
        for (const [id, view] of views) if (view.region === region) { release(view.owner); views.delete(id); }
        contentSignatures.set(region, signature);
      }
    }
    let visible = 0; let sideVisible = false;
    const context = Object.freeze({ vaultId: current.id, vaultName: current.name });
    for (const content of available) {
      const region = content.region ?? "main";
      let view = views.get(content.id);
      if (!view) { view = { owner: screen!.child(), target: regions[region], componentId: content.componentId, region }; views.set(content.id, view); }
      if (show(view, { ...content.props, workspace: context })) { if (region === "main") visible++; if (region === "left-panel") sideVisible = true; }
      else { release(view.owner); views.delete(content.id); }
    }
    if (sideVisible || !available.some(entry => entry.region === "left-panel")) { release(sideEmpty?.owner); sideEmpty = undefined; }
    else {
      sideEmpty ??= { owner: screen!.child(), target: regions["left-panel"], componentId: "lunaris.workspace-empty" };
      if (!show(sideEmpty, { title: text("unavailable"), detail: text("unavailableDetail") })) { release(sideEmpty.owner); sideEmpty = undefined; }
    }
    if (visible) { if (empty) release(empty.owner); empty = undefined; }
    else {
      empty ??= { owner: screen!.child(), target: regions.main, componentId: "lunaris.workspace-empty" };
      if (!show(empty, { title: text("empty"), detail: text("emptyDetail") })) { release(empty.owner); empty = undefined; }
    }
  }
  // A layout role lends stable targets; this callback only captures local data.
  // Mount other roots after Components.mount/update returns, outside React effects.
  function onTargets(value: Regions | null): void { regions = value ?? undefined; }
  function onDismiss(): void { if (!ctx.signal.aborted) workspace.list().find(entry => entry.region === "left-panel")?.onDismiss?.(); }

  function refresh(): void {
    try { render(); }
    catch (error) {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot render workspace", { code: "WORKSPACE_RENDER_FAILED", error });
      throw error;
    }
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
      if (layout?.componentId === change.componentId) {
        releaseContent();
        release(layout.owner); layout = undefined; regions = undefined;
      }
      if (empty?.componentId === change.componentId) { release(empty.owner); empty = undefined; }
      if (sideEmpty?.componentId === change.componentId) { release(sideEmpty.owner); sideEmpty = undefined; }
    }
    if (change.componentId.startsWith("lunaris.workspace-") || workspace.list().some(entry => entry.componentId === change.componentId)) refresh();
  });
  refresh();
  for (const role of ["lunaris.workspace-empty", "lunaris.workspace-layout"]) {
    if (!components.has(role)) logger.warn(ctx.pluginId, "Waiting for workspace component role", { code: "WORKSPACE_COMPONENT_MISSING", data: { componentId: role } });
  }
  logger.info(ctx.pluginId, "Workspace ready", { code: "WORKSPACE_READY" });
} });

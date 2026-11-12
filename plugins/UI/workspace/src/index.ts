import { Preparation, PreparationChanged } from "@lunaris/startup";
import { definePlugin } from "@lunaris/sdk";
import type { ResourceScope } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { Config } from "@lunaris/config";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { Slots } from "@lunaris/slots";
import { SlotDom } from "@lunaris/slot-dom";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { ComponentProps, MountedComponent } from "@lunaris/components";
import { Startup, StartupChanged } from "@lunaris/startup";
import { Vault, VaultChanged } from "@lunaris/vault";
import { Workspace, WorkspaceChanged, WorkspaceSidebar } from "@lunaris/workspace";
import type { WorkspaceContent, WorkspaceContext } from "@lunaris/workspace";
import { catalogs } from "./catalog.js";
import manifest from "../manifest.json" with { type: "json" };

interface View { readonly owner: ResourceScope; readonly target: HTMLElement; readonly componentId: string; readonly region?: string; mounted?: MountedComponent | undefined; props?: ComponentProps; content?: WorkspaceContent }
type Regions = Readonly<Record<"main" | "left-rail" | "left-panel" | "bottom" | "mobile-menu" | "mobile-launcher", HTMLElement>>;
const standalone = Object.freeze({ mode: "standalone", sizing: "fill" });
const embedded = Object.freeze({ mode: "embedded", sizing: "fill" });
const intrinsic = Object.freeze({ mode: "embedded", sizing: "content" });

function sameProps(previous: ComponentProps | undefined, next: ComponentProps): boolean {
  return previous !== undefined && Object.keys(previous).length === Object.keys(next).length &&
    Object.keys(next).every(key => Object.hasOwn(previous, key) && Object.is(previous[key], next[key]));
}

export default definePlugin({ manifest, async activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal);
  const config = ctx.use(Config); let panelWidth = 256; let saveWidth = Promise.resolve();
  const validWidth = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 120 && value <= 4096;
  try {
    const stored = await config.get(ctx.pluginId, "sidePanelWidth", { scope: "global" });
    if (ctx.signal.aborted) return;
    if (stored.ok && validWidth(stored.value)) panelWidth = stored.value;
    else if (!stored.ok) logger.warn(ctx.pluginId, "Cannot restore side panel width", { error: stored.error });
  } catch (error) { if (ctx.signal.aborted) return; logger.warn(ctx.pluginId, "Cannot restore side panel width", { error }); }
  function onPanelWidth(width: number): void {
    if (ctx.signal.aborted || !validWidth(width) || width === panelWidth) return;
    panelWidth = Math.round(width);
    logger.info(ctx.pluginId, "Side panel width changed", { data: { width: panelWidth } });
    const value = panelWidth;
    saveWidth = saveWidth.then(async () => {
      if (ctx.signal.aborted) return;
      try {
        const result = await config.set(ctx.pluginId, "sidePanelWidth", value, { scope: "global" });
        if (!ctx.signal.aborted && !result.ok) logger.warn(ctx.pluginId, "Cannot save side panel width", { error: result.error });
      } catch (error) { if (!ctx.signal.aborted) logger.warn(ctx.pluginId, "Cannot save side panel width", { error }); }
    });
  }
  const localization = ctx.use(Localization); const slots = ctx.use(Slots); const targets = ctx.use(SlotDom);
  const components = ctx.use(Components); const vaults = ctx.use(Vault); const startup = ctx.use(Startup);
  const registered = localization.register(ctx.pluginId, catalogs, ctx.signal);
  if (!registered.ok) throw new Error("Cannot register workspace messages.", { cause: registered.error });
  const navigation = ctx.use(WorkspaceSidebar); const workspace = ctx.use(Workspace); const views = new Map<string, View>();
  const rootId = `${ctx.pluginId}.screen`;
  const contentId = `${ctx.pluginId}.content`;
  let screen: ResourceScope | undefined; let screenVaultId: string | undefined;
  let empty: View | undefined; let sideEmpty: View | undefined; let layout: View | undefined; let regions: Regions | undefined; let sequence = 0;
  const contentSignatures = new Map<string, string>();
  let latest = startup.snapshot();
  const preparation = ctx.optional(Preparation);
  let presentingVaultId: string | undefined;
  let rendering = false;
  let refreshPending = false;
  let compact = false;
  let context: WorkspaceContext | undefined;
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
  function show(view: View, props: ComponentProps, force = false): boolean {
    if (view.mounted) {
      if (!force && sameProps(view.props, props)) return true;
      const result = view.mounted.update(props);
      if (result.ok) { view.props = props; return true; }
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
    view.props = props;
    return true;
  }
  function render(): void {
    if (ctx.signal.aborted) return;
    const current = vaults.current();
    if (!current || (latest.state !== "loaded" && presentingVaultId !== current.id) || (preparation && (preparation.tracksVault() && preparation.snapshot().vaultId !== current.id || preparation.snapshot().state === "preparing") && presentingVaultId !== current.id)) { releaseScreen(); return; }
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
    const headerNavigation = available.some(entry => (entry.region ?? "main") === "main" && entry.props?.mobileNavigationInHeader === true);
    if (!show(layout, { railVisible: available.some(entry => entry.region === "left-rail"), panelVisible: available.some(entry => entry.region === "left-panel"),
      mobileOpen: navigation.isOpen(), onMobileOpen, mobileLauncherVisible: !headerNavigation && available.some(entry => entry.region === "mobile-launcher"), mobileMenuVisible: available.some(entry => entry.region === "mobile-menu"), bottomVisible: available.some(entry => entry.region === "bottom"), presentation: standalone, mainLabel: text("main"), panelLabel: text("panel"), panelWidth, resizeLabel: text("resizePanel"), onPanelWidth, onTargets, onDismiss })) {
      releaseContent(); release(layout.owner); layout = undefined; regions = undefined; return;
    }
    if (!regions) return;
    for (const region of ["main", "left-rail", "left-panel", "bottom", "mobile-menu", "mobile-launcher"]) {
      const signature = JSON.stringify(available.filter(entry => (entry.region ?? "main") === region).map(entry => [entry.id, entry.componentId, entry.order ?? 0]));
      if (signature !== contentSignatures.get(region)) {
        for (const [id, view] of views) if (view.region === region) { release(view.owner); views.delete(id); }
        contentSignatures.set(region, signature);
      }
    }
    let visible = 0; let sideVisible = false;
    if (context?.vaultId !== current.id || context.vaultName !== current.name || context.compact !== compact) {
      context = Object.freeze({ vaultId: current.id, vaultName: current.name, compact });
    }
    for (const content of available) {
      const region = content.region ?? "main";
      let view = views.get(content.id);
      if (!view) { view = { owner: screen!.child(), target: regions[region], componentId: content.componentId, region }; views.set(content.id, view); }
      if (show(view, { ...content.props, workspace: context, presentation: ["bottom", "mobile-menu", "mobile-launcher"].includes(region) ? intrinsic : embedded }, view.content !== content)) { view.content = content; if (region === "main") visible++; if (region === "left-panel") sideVisible = true; }
      else { release(view.owner); views.delete(content.id); }
    }
    if (sideVisible || !available.some(entry => entry.region === "left-panel")) { release(sideEmpty?.owner); sideEmpty = undefined; }
    else {
      sideEmpty ??= { owner: screen!.child(), target: regions["left-panel"], componentId: "lunaris.workspace-empty" };
      if (!show(sideEmpty, { title: text("unavailable"), detail: text("unavailableDetail"), presentation: embedded })) { release(sideEmpty.owner); sideEmpty = undefined; }
    }
    if (visible) { if (empty) release(empty.owner); empty = undefined; }
    else {
      empty ??= { owner: screen!.child(), target: regions.main, componentId: "lunaris.workspace-empty" };
      if (!show(empty, { title: text("empty"), detail: text("emptyDetail"), presentation: embedded })) { release(empty.owner); empty = undefined; }
    }
  }
  // Publish a resize after the layout effect has returned.
  function onTargets(value: Regions | null, nextCompact = false): void {
    regions = value ?? undefined;
    if (compact === nextCompact) return;
    compact = nextCompact;
    if (!value || ctx.signal.aborted) return;
    if (rendering) refreshPending = true;
    else void Promise.resolve().then(refresh).catch(() => {});
  }
  function onDismiss(): void { if (!ctx.signal.aborted) workspace.list().find(entry => entry.region === "left-panel")?.onDismiss?.(); }
  function onMobileOpen(open: boolean): void { if (open) navigation.open(); else navigation.close(); }

  function refresh(): void {
    // A contribution can emit WorkspaceChanged before Components.mount returns.
    if (rendering) { refreshPending = true; return; }
    rendering = true;
    try {
      do {
        refreshPending = false;
        render();
      } while (refreshPending && !ctx.signal.aborted);
    } catch (error) {
      if (!ctx.signal.aborted) logger.error(ctx.pluginId, "Cannot render workspace", { code: "WORKSPACE_RENDER_FAILED", error });
      throw error;
    } finally { rendering = false; }
  }
  ctx.events.on(WorkspaceChanged, change => {
    const entry = workspace.list().find(item => item.id === change.id);
    if (entry && !components.has(entry.componentId)) logger.warn(ctx.pluginId, "Waiting for workspace component role", { code: "WORKSPACE_COMPONENT_MISSING", data: { componentId: entry.componentId } });
    refresh();
  });
  ctx.events.on(StartupChanged, snapshot => { if (snapshot.sequence <= latest.sequence) return; latest = snapshot; refresh(); });
  ctx.events.on(VaultChanged, refresh);
  if (preparation) ctx.events.on(PreparationChanged, snapshot => {
    const latest = preparation.snapshot();
    if (snapshot.epoch !== latest.epoch || snapshot.state !== latest.state) return;
    if (snapshot.state === "preparing") presentingVaultId = undefined;
    refresh();
  });
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
  await preparation?.register({ id: ctx.pluginId, phase: "presentation", async prepare() { presentingVaultId = vaults.current()?.id; refresh(); } }, ctx.signal);
  refresh();
  for (const role of ["lunaris.workspace-empty", "lunaris.workspace-layout"]) {
    if (!components.has(role)) logger.warn(ctx.pluginId, "Waiting for workspace component role", { code: "WORKSPACE_COMPONENT_MISSING", data: { componentId: role } });
  }
  logger.info(ctx.pluginId, "Workspace ready", { code: "WORKSPACE_READY" });
} });

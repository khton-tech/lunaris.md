import { russian } from "./locales/ru.js";
import { definePlugin, isSdkUnavailable, LunarisError } from "@lunaris/sdk";
import type { ResourceScope } from "@lunaris/sdk";
import { Logger, scopeLogger } from "@lunaris/logging";
import { ActiveScreen, ActiveScreenChanged } from "@lunaris/active-screen";
import { ActiveDocument, ActiveDocumentTransitioned } from "@lunaris/active-document";
import type { DocumentTransition } from "@lunaris/active-document";
import { BeforeFileMutation } from "@lunaris/filesystem";
import type { FileMutation } from "@lunaris/filesystem";
import { Vault } from "@lunaris/vault";
import { Workspace } from "@lunaris/workspace";
import type { WorkspaceContext } from "@lunaris/workspace";
import { MobileMenu } from "@lunaris/mobile-menu";
import type { MobileMenuItem } from "@lunaris/mobile-menu";
import { Components, ComponentsChanged } from "@lunaris/components";
import type { ComponentProps, MountedComponent } from "@lunaris/components";
import { Localization, LocaleChanged } from "@lunaris/localization";
import { WorkspaceTabs } from "./tabs.js";
import manifest from "../manifest.json" with { type: "json" };

interface View {
  refresh(): void;
  removed(componentId: string): void;
  transition(change: DocumentTransition): void;
  fileMutated(change: FileMutation): void;
}
interface CachedScreen { readonly owner: ResourceScope; readonly mounted: MountedComponent; props: unknown }
const catalogs = { en: {
  empty: "No workspace plugins", emptyDetail: "Content will appear here when a workspace plugin is available.",
  unavailable: "Screen unavailable", unavailableDetail: "The selected screen could not be displayed.",
  newTab: "New tab", workspaceView: "Workspace view", tabs: "Workspace tabs",
  mobileTabs: "Open tabs: {count}", dismissTabs: "Dismiss open tabs",
  closeTab: "Close tab", back: "Back", forward: "Forward", tabFailed: "Could not complete the tab action.",
  blank: "Choose a file to open",
}, ru: russian };

export default definePlugin({ manifest, activate(ctx) {
  const logger = scopeLogger(ctx.use(Logger), ctx.signal); const screens = ctx.use(ActiveScreen);
  const components = ctx.use(Components); const workspace = ctx.use(Workspace); const localization = ctx.use(Localization);
  const mobileMenu = ctx.optional(MobileMenu);
  const vaults = ctx.permissions.has("vault.access") ? ctx.optional(Vault) : undefined;
  let documents = ctx.permissions.has("vault.access") ? ctx.optional(ActiveDocument) : undefined;
  const text = (key: keyof typeof catalogs.en) => localization.text(ctx.pluginId, key);
  const messages = localization.register(ctx.pluginId, catalogs, ctx.signal);
  if (!messages.ok) throw new Error("Cannot register active screen messages.", { cause: messages.error });
  const views = new Set<View>();
  function connectOptional(connect: () => void, message: string): boolean {
    try { connect(); return true; }
    catch (error) {
      if (!(error instanceof LunarisError) || error.code !== "PROVIDER_UNAVAILABLE") throw error;
      logger.warn(ctx.pluginId, message, { error });
      return false;
    }
  }
  if (documents && !connectOptional(() => {
    ctx.events.on(ActiveDocumentTransitioned, change => { for (const view of views) view.transition(change); });
  }, "Document transitions are unavailable")) documents = undefined;
  if (documents && ctx.permissions.has("filesystem.access")) connectOptional(() => {
    ctx.hooks.register(BeforeFileMutation, change => {
      if (!change.error && change.operation !== "copy") change.onSettled(result => {
        if (result.ok && !ctx.signal.aborted) for (const view of views) view.fileMutated(change);
      });
      return change;
    });
  }, "File mutation notifications are unavailable");
  const release = (owner: ResourceScope) => { void owner.dispose().catch(() => {}); };
  const registration = components.register({ id: "lunaris.active-screen-host", mount(target, initial, signal) {
    const vaultId = (initial.workspace as WorkspaceContext | undefined)?.vaultId;
    if (typeof vaultId !== "string") throw new TypeError("Workspace context is required.");
    const owner = ctx.scope.child(); const cache = new Map<string, CachedScreen>();
    let disposed = false; let props = initial; let layout: MountedComponent | undefined; let layoutOwner: ResourceScope | undefined;
    let mobileItem: MobileMenuItem | undefined;
    let mobileTabsOpen = false;
    let rendering = false; let pending = false;
    let targets: ReadonlyMap<string, HTMLElement> | null = null;
    let placeholder: MountedComponent | undefined; let placeholderOwner: ResourceScope | undefined;
    let placeholderTarget: HTMLElement | undefined;
    const visited = new Set<string>();
    const live = () => !disposed && !signal.aborted && !ctx.signal.aborted && (!vaults || vaults.current()?.id === vaultId);
    const tabs = new WorkspaceTabs({ vaultId, screens, documents, live, refresh, text,
      report: (level, message, error) => logger[level](ctx.pluginId, message, error === undefined ? {} : { error }),
    });
    // Callbacks only capture local targets. SDK mounts run after the parent render returns.
    const onTargets = (value: ReadonlyMap<string, HTMLElement> | null) => { if (!disposed) targets = value; };
    function clearPlaceholder(): void { if (placeholderOwner) release(placeholderOwner); placeholderOwner = undefined; placeholder = undefined; placeholderTarget = undefined; }
    function clearCache(): void { for (const item of cache.values()) release(item.owner); cache.clear(); clearPlaceholder(); }
    function clearLayout(): void {
      clearCache();
      if (layoutOwner) release(layoutOwner);
      layoutOwner = undefined; layout = undefined; targets = null;
      mobileItem = undefined; mobileTabsOpen = false;
    }
    function closeMobileTabs(): void {
      if (!live() || !mobileTabsOpen) return;
      mobileTabsOpen = false;
      refresh();
    }
    function publishMobileTabs(count: number): void {
      if (!mobileMenu || !layoutOwner) return;
      const label = localization.text(ctx.pluginId, "mobileTabs", { count });
      if (mobileItem?.count === count && mobileItem.label === label) return;
      const item: MobileMenuItem = {
        id: `${ctx.pluginId}.tabs`, label, icon: "file", count, order: 0,
        onPress() {
          if (!live() || !layout || mobileTabsOpen) return;
          mobileTabsOpen = true;
          refresh();
        },
      };
      try {
        const result = mobileItem ? mobileMenu.update(item) : mobileMenu.register(item, layoutOwner.signal);
        if (result.ok) mobileItem = item;
        else logger.warn(ctx.pluginId, "Cannot publish mobile tabs action", { data: { error: result.error } });
      } catch (error) {
        if (!isSdkUnavailable(error)) throw error;
      }
    }
    function showPlaceholder(element: HTMLElement, kind: "empty" | "blank" | "unavailable"): void {
      const placeholderProps = { title: text(kind), detail: kind === "blank" ? "" : text(`${kind}Detail`), presentation: { mode: "embedded", sizing: "fill" } };
      if (placeholderTarget && placeholderTarget !== element) clearPlaceholder();
      if (placeholder) {
        const updated = placeholder.update(placeholderProps);
        if (!updated.ok) { logger.error(ctx.pluginId, "Cannot update screen placeholder", { error: updated.error }); clearPlaceholder(); }
      }
      if (!placeholder && components.has("lunaris.workspace-empty")) {
        placeholderOwner = owner.child();
        const mounted = components.mount("lunaris.workspace-empty", element, placeholderProps, placeholderOwner.signal);
        if (mounted.ok) { placeholder = mounted.value; placeholderTarget = element; }
        else { logger.error(ctx.pluginId, "Cannot mount screen placeholder", { error: mounted.error }); clearPlaceholder(); }
      }
    }
    function refresh(): void {
      if (rendering) { pending = true; return; }
      rendering = true;
      try {
        do { pending = false; render(); } while (pending && !disposed && !signal.aborted && !ctx.signal.aborted);
      } finally { rendering = false; }
    }
    function render(): void {
      if (!live()) return;
      const context = props.workspace as WorkspaceContext;
      if (!context || typeof context.vaultId !== "string" || typeof context.vaultName !== "string") throw new TypeError("Workspace context is required.");
      const snapshot = screens.snapshot();
      tabs.synchronize(snapshot);
      const ids = new Set(snapshot.screens.map(screen => screen.id));
      for (const id of visited) if (!ids.has(id)) visited.delete(id);
      for (const [id, cached] of cache) if (!ids.has(id)) { release(cached.owner); cache.delete(id); }
      if (snapshot.activeId) visited.add(snapshot.activeId);
      // Release focus before a retained target becomes hidden or inert.
      for (const [id, element] of targets ?? []) if (id !== snapshot.activeId && element.contains(element.ownerDocument.activeElement)) {
        const focused = element.ownerDocument.activeElement;
        if (focused && "blur" in focused && typeof focused.blur === "function") focused.blur();
      }
      const placeholderId = "__placeholder";
      const tabProps = tabs.presentation(snapshot);
      const mobileTabs = mobileMenu ? { opened: mobileTabsOpen, dismissLabel: text("dismissTabs"), onClose: closeMobileTabs } : undefined;
      const layoutProps = { ids: [...visited, placeholderId], activeId: snapshot.activeId, tabs: tabProps, mobileTabs,
        onTargets, presentation: { mode: "embedded", sizing: "fill" } };
      if (layout) {
        const updated = layout.update(layoutProps);
        if (!updated.ok) { logger.error(ctx.pluginId, "Cannot update active screen layout", { error: updated.error }); clearLayout(); }
      }
      if (!layout) {
        if (!components.has("lunaris.active-screen")) {
          logger.warn(ctx.pluginId, "Active screen layout is unavailable"); showPlaceholder(target, "unavailable"); return;
        }
        clearPlaceholder();
        layoutOwner = owner.child();
        const mounted = components.mount("lunaris.active-screen", target, layoutProps, layoutOwner.signal);
        if (!mounted.ok) { logger.error(ctx.pluginId, "Cannot mount active screen layout", { error: mounted.error }); clearLayout(); showPlaceholder(target, "unavailable"); return; }
        layout = mounted.value;
      }
      publishMobileTabs(tabProps.tabs.length);
      let visible = false;
      for (const screen of snapshot.screens) {
        if (!visited.has(screen.id)) continue;
        const screenTarget = targets?.get(screen.id); if (!screenTarget) continue;
        let cached = cache.get(screen.id);
        if (cached && cached.props !== screen.props) {
          const updated = cached.mounted.update({ ...screen.props, workspace: context, presentation: { mode: "embedded", sizing: "fill" } });
          if (updated.ok) cached.props = screen.props;
          else { logger.error(ctx.pluginId, "Cannot update screen", { data: { id: screen.id }, error: updated.error }); release(cached.owner); cache.delete(screen.id); cached = undefined; }
        }
        if (!cached && screen.id === snapshot.activeId && components.has(screen.componentId)) {
          const child = owner.child();
          const mounted = components.mount(screen.componentId, screenTarget, { ...screen.props, workspace: context, presentation: { mode: "embedded", sizing: "fill" } }, child.signal);
          if (mounted.ok) { cached = { owner: child, mounted: mounted.value, props: screen.props }; cache.set(screen.id, cached); }
          else { release(child); logger.error(ctx.pluginId, "Cannot mount screen", { data: { id: screen.id, componentId: screen.componentId }, error: mounted.error }); }
        }
        if (screen.id === snapshot.activeId && cached) visible = true;
      }
      if (visible) clearPlaceholder();
      else {
        const hidden = layout.update({ ...layoutProps, activeId: placeholderId });
        if (!hidden.ok) { logger.error(ctx.pluginId, "Cannot show screen placeholder", { error: hidden.error }); clearLayout(); return; }
        const element = targets?.get(placeholderId); if (!element) return;
        const kind = snapshot.activeId ? "unavailable" : documents ? "blank" : "empty";
        if (snapshot.activeId) logger.warn(ctx.pluginId, "Active screen is unavailable", { data: { id: snapshot.activeId } });
        showPlaceholder(element, kind);
      }
    }
    const view: View = { refresh, transition: change => tabs.transition(change), fileMutated: change => tabs.fileMutated(change), removed(componentId) {
      if (componentId === "lunaris.active-screen") clearLayout();
      if (componentId === "lunaris.workspace-empty") clearPlaceholder();
      for (const [id, cached] of cache) if (cached.mounted.componentId === componentId) { release(cached.owner); cache.delete(id); }
    } };
    function dispose(): void {
      if (disposed) return; disposed = true; signal.removeEventListener("abort", dispose); views.delete(view);
      // Scope cleanup owns nested roots; do not invoke SDK handles during closure.
      release(owner); cache.clear(); targets = null;
    }
    signal.addEventListener("abort", dispose, { once: true }); views.add(view);
    try { refresh(); } catch (error) { dispose(); throw error; }
    return { update(next: ComponentProps) { props = next; refresh(); }, dispose };
  } }, ctx.signal);
  if (!registration.ok) throw new Error("Cannot register active screen host.", { cause: registration.error });
  ctx.events.on(ActiveScreenChanged, () => { for (const view of views) view.refresh(); });
  ctx.events.on(LocaleChanged, () => { for (const view of views) view.refresh(); });
  ctx.events.on(ComponentsChanged, change => {
    if (change.componentId === "lunaris.active-screen-host") return;
    for (const view of views) {
      if (change.kind === "removed") view.removed(change.componentId);
      view.refresh();
    }
  });
  const content = workspace.register({ id: `${ctx.pluginId}.container`, componentId: "lunaris.active-screen-host" }, ctx.signal);
  if (!content.ok) throw new Error("Cannot register active screen container.", { cause: content.error });
  logger.info(ctx.pluginId, "Active screen container ready");
} });

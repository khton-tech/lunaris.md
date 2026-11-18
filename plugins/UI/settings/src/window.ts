import type { CancellationSignal, PluginContext } from "@lunaris/sdk";
import type { ComponentsApi, ComponentProps, MountedComponent } from "@lunaris/components";
import type { LoggerApi } from "@lunaris/logging";
import type { SettingsApi } from "@lunaris/settings";
import type { WorkspaceContext } from "@lunaris/workspace";
import { mountSettingsPage } from "./page.js";
import type { PageInput } from "./page.js";
import type { russian } from "./locales/ru.js";

interface WindowMount {
  readonly ctx: PluginContext;
  readonly registry: SettingsApi;
  readonly components: ComponentsApi;
  readonly logger: LoggerApi;
  readonly text: (key: keyof typeof russian) => string;
  readonly groupRole: string;
  readonly target: HTMLElement;
  readonly props: ComponentProps;
  readonly signal: CancellationSignal;
  readonly isCurrent: (vaultId: string) => boolean;
  readonly close: () => void;
}

export function mountSettingsWindow({ ctx, registry, components, logger, text, groupRole, target, props, signal, isCurrent, close }: WindowMount) {
  const owner = ctx.scope.child();
  let workspace = props.workspace as WorkspaceContext;
  let disposed = false;
  let selectedId: string | null = null;
  let shell: MountedComponent | undefined;
  let page: ReturnType<typeof mountSettingsPage> | undefined;
  let pageTarget: HTMLElement | null = null;
  let mountedTarget: HTMLElement | null = null;
  let overlayTarget: HTMLElement | null = null;
  let rendering = false;
  let pending = false;
  const live = () => !disposed && !signal.aborted && !ctx.signal.aborted && isCurrent(workspace.vaultId);

  const onClose = () => { if (live()) close(); };
  function onBack(): void {
    if (!live()) return;
    selectedId = null;
    refresh();
  }
  function onSelect(id: string): void {
    if (!live() || selectedId === id || !registry.snapshot().categories.some(category => category.id === id)) return;
    selectedId = id;
    refresh();
    logger.info(ctx.pluginId, "Settings category opened", { data: { id } });
  }
  function onTargets(page: HTMLElement | null, popups: HTMLElement | null): void {
    pageTarget = page;
    overlayTarget = popups;
  }
  function render(): void {
    const compact = workspace.compact === true;
    const snapshot = registry.snapshot();
    const selected = snapshot.categories.find(category => category.id === selectedId);
    if (!selected) selectedId = null;
    const category = selected ?? (compact ? undefined : snapshot.categories[0]);
    if (!category) { page?.dispose(); page = undefined; mountedTarget = null; }
    const shellProps = { compact, title: text("settings"), closeLabel: text("close"), backLabel: text("back"), emptyLabel: text("empty"),
      categories: snapshot.categories, selectedId: category?.id ?? null, onSelect, onBack, onClose, onTargets };
    const result = shell ? shell.update(shellProps) : components.mount("lunaris.settings-window", target, shellProps, owner.signal);
    if (!result.ok) throw new Error("Cannot render settings window.", { cause: result.error });
    if (!shell && result.value) shell = result.value;
    if (!category || !pageTarget || !overlayTarget) return;
    if (page && mountedTarget !== pageTarget) { page.dispose(); page = undefined; }

    const sections = [...snapshot.sections.filter(item => item.categoryId === category.id),
      ...snapshot.groups.filter(group => group.categoryId === category.id).map(group => ({ id: group.id, title: group.title,
        description: group.description, order: group.order, componentId: groupRole, props: { groupId: group.id,
          items: snapshot.items.filter(item => item.groupId === group.id), failureLabel: text("itemFailed") } }))]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const next: PageInput = { workspace, overlayTarget, categoryId: category.id, title: category.title, icon: category.icon,
      emptyLabel: text("emptyCategory"), unavailable: text("unavailable"), unavailableDetail: text("unavailableDetail"), sections };
    if (page) page.update(next);
    else {
      page = mountSettingsPage(ctx, components, logger, pageTarget, next, owner.signal);
      mountedTarget = pageTarget;
    }
  }
  function refresh(): void {
    if (!live()) return;
    if (rendering) { pending = true; return; }
    rendering = true;
    try { do { pending = false; render(); } while (pending && live()); }
    catch (error) {
      logger.error(ctx.pluginId, "Cannot render settings", { error });
      if (live()) close();
      throw error;
    } finally { rendering = false; }
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    page?.dispose();
    void owner.dispose().catch(() => {});
  }
  signal.addEventListener("abort", dispose, { once: true });
  try { refresh(); } catch (error) { dispose(); throw error; }
  return { update(next: ComponentProps) { workspace = next.workspace as WorkspaceContext; refresh(); }, dispose };
}

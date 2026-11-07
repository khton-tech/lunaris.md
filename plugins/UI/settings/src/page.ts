import type { CancellationSignal, PluginContext, ResourceScope } from "@lunaris/sdk";
import type { ComponentsApi, ComponentProps, MountedComponent } from "@lunaris/components";
import type { LoggerApi } from "@lunaris/logging";
import type { SettingsSection } from "@lunaris/settings";

export interface PageInput extends ComponentProps {
  readonly title: string; readonly emptyLabel: string; readonly sections: readonly SettingsSection[];
  readonly unavailable: string; readonly unavailableDetail: string;
}
interface SectionView { readonly owner: ResourceScope; readonly componentId: string; readonly mounted: MountedComponent; props: unknown; readonly failed: boolean }

/** Orchestrate public component roles without owning product DOM or styling. */
export function mountSettingsPage(ctx: PluginContext, components: ComponentsApi, logger: LoggerApi,
  target: HTMLElement, initial: ComponentProps, signal: CancellationSignal) {
  const owner = ctx.scope.child(); let disposed = false; let props = initial as PageInput;
  let layout: MountedComponent | undefined; let layoutOwner: ResourceScope | undefined;
  let targets: ReadonlyMap<string, HTMLElement> | null = null;
  const sections = new Map<string, SectionView>();
  const release = (scope: ResourceScope) => { void scope.dispose().catch(() => {}); };
  const onTargets = (value: ReadonlyMap<string, HTMLElement> | null) => { if (!disposed) targets = value; };
  function clear(): void {
    for (const section of sections.values()) release(section.owner); sections.clear();
    if (layoutOwner) release(layoutOwner); layoutOwner = undefined; layout = undefined; targets = null;
  }
  function render(): void {
    if (disposed || signal.aborted || ctx.signal.aborted) return;
    const descriptions = props.sections;
    if (!Array.isArray(descriptions)) throw new TypeError("Settings sections are required.");
    // Release roots before React removes their borrowed targets.
    for (const [id, section] of sections) if (!descriptions.some(item => item.id === id && item.componentId === section.componentId)) {
      release(section.owner); sections.delete(id);
    }
    const layoutProps = { title: props.title, emptyLabel: props.emptyLabel, sections: descriptions.map(item => ({ id: item.id, title: item.title })), onTargets, presentation: { mode: "embedded", sizing: "fill" } };
    if (layout) { const result = layout.update(layoutProps); if (!result.ok) { logger.warn(ctx.pluginId, "Settings layout needs replacement", { error: result.error }); clear(); } }
    if (!layout) {
      layoutOwner = owner.child(); const result = components.mount("lunaris.settings-page", target, layoutProps, layoutOwner.signal);
      if (!result.ok) { clear(); throw new Error("Cannot mount settings layout.", { cause: result.error }); }
      layout = result.value;
    }
    for (const section of descriptions) {
      const element = targets?.get(section.id); if (!element) continue;
      let current = sections.get(section.id);
      const available = components.has(section.componentId);
      if (current && current.failed && (available || current.props !== section.props)) {
        release(current.owner); sections.delete(section.id); current = undefined;
      }
      if (current) {
        const updated = current.mounted.update(current.failed ? { title: props.unavailable, detail: props.unavailableDetail, presentation: { mode: "embedded", sizing: "content" } } : { ...section.props, workspace: props.workspace, presentation: { mode: "embedded", sizing: "content" } });
        if (!updated.ok) { logger.error(ctx.pluginId, "Cannot update settings section", { data: { id: section.id }, error: updated.error }); release(current.owner); sections.delete(section.id); current = undefined; }
        else current.props = section.props;
      }
      if (current) continue;
      let child = owner.child(); let failed = false;
      let result = components.mount(section.componentId, element, { ...section.props, workspace: props.workspace, presentation: { mode: "embedded", sizing: "content" } }, child.signal);
      if (!result.ok) {
        logger.warn(ctx.pluginId, "Settings section unavailable", { data: { id: section.id, componentId: section.componentId }, error: result.error });
        release(child); child = owner.child(); failed = true;
        result = components.mount("lunaris.workspace-empty", element, { title: props.unavailable, detail: props.unavailableDetail, presentation: { mode: "embedded", sizing: "content" } }, child.signal);
      }
      if (result.ok) sections.set(section.id, { owner: child, componentId: section.componentId, props: section.props, mounted: result.value, failed });
      else { release(child); logger.error(ctx.pluginId, "Cannot mount settings section fallback", { error: result.error }); }
    }
  }
  let rendering = false; let pending = false;
  function refresh(): void {
    if (rendering) { pending = true; return; }
    rendering = true;
    try { do { pending = false; render(); } while (pending && !disposed && !signal.aborted && !ctx.signal.aborted); }
    finally { rendering = false; }
  }
  function dispose(): void { if (disposed) return; disposed = true; signal.removeEventListener("abort", dispose); release(owner); sections.clear(); targets = null; }
  signal.addEventListener("abort", dispose, { once: true });
  try { refresh(); } catch (error) { dispose(); throw error; }
  return { update(next: ComponentProps) { props = next as PageInput; refresh(); }, dispose };
}

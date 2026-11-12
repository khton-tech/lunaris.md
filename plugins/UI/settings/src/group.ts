import type { CancellationSignal, PluginContext, ResourceScope } from "@lunaris/sdk";
import type { ComponentsApi, ComponentProps, MountedComponent } from "@lunaris/components";
import type { LoggerApi } from "@lunaris/logging";
import { SettingsChanged } from "@lunaris/settings";
import type { SettingsApi, SettingsItem, SettingsSnapshot } from "@lunaris/settings";
import type { WorkspaceContext } from "@lunaris/workspace";

interface GroupProps extends ComponentProps { readonly groupId: string; readonly items: readonly SettingsItem[]; readonly failureLabel: string }
interface ItemState { readonly scope: ResourceScope; pending: boolean; error: string }
const accepts = (item: SettingsItem, value: unknown): boolean => {
  switch (item.type) {
    case "select": return typeof value === "string" && item.options.some(option => option.value === value);
    case "switch": return typeof value === "boolean";
    case "text": return typeof value === "string";
    case "number": case "slider": return typeof value === "number" && Number.isFinite(value) && (item.min === undefined || value >= item.min) && (item.max === undefined || value <= item.max);
  }
};

/** Bind declarative callbacks to owned item views; Mantine only renders presentation. */
export function mountSettingsGroup(ctx: PluginContext, registry: SettingsApi, components: ComponentsApi, logger: LoggerApi,
  target: HTMLElement, initial: ComponentProps, signal: CancellationSignal) {
  const owner = ctx.scope.child(); let props = initial as GroupProps; let mounted: MountedComponent | undefined; let disposed = false; let scheduled = false;
  const states = new Map<string, ItemState>();
  const workspace = initial.workspace as WorkspaceContext;
  const live = () => !disposed && !signal.aborted && !ctx.signal.aborted;
  const release = (state: ItemState) => { void state.scope.dispose().catch(() => {}); };
  function reconcile(snapshot: SettingsSnapshot): void {
    const group = snapshot.groups.find(value => value.id === props.groupId);
    const visible = group && snapshot.categories.some(value => value.id === group.categoryId);
    for (const [id, state] of states) if (!visible || !snapshot.items.some(value => value.id === id && value.groupId === group.id)) { release(state); states.delete(id); }
  }
  owner.own(ctx.events.on(SettingsChanged, snapshot => { if (live()) reconcile(snapshot); }));
  function changed(): void {
    if (!live() || scheduled) return; scheduled = true;
    void Promise.resolve().then(() => {
      scheduled = false; if (!live()) return;
      try { render(); } catch (error) { logger.error(ctx.pluginId, "Cannot update settings group", { data: { id: props.groupId }, error }); }
    });
  }
  function invoke(expected: SettingsItem, value: unknown, action: "change" | "retry" | "reset" = "change"): void {
    if (!live()) return;
    const id = expected.id;
    const snapshot = registry.snapshot(); reconcile(snapshot);
    const item = props.items.find(value => value.id === id); const state = states.get(id);
    if (!item || item !== expected || !state || state.scope.signal.aborted || state.pending || item.disabled || !snapshot.items.includes(item) ||
        (action === "change" && !accepts(item, value)) || (action === "retry" && !item.onRetry) || (action === "reset" && (!item.onReset || item.resetDisabled))) return;
    state.pending = true; state.error = ""; changed();
    const context = Object.freeze({ vaultId: workspace.vaultId, signal: state.scope.signal });
    // Invoke outside React's event/effect stack and contain both sync and async failures.
    void Promise.resolve().then(() => {
      if (!live() || context.signal.aborted || !registry.snapshot().items.includes(item)) return;
      if (action === "retry") return item.onRetry!(context);
      if (action === "reset") return item.onReset!(context);
      switch (item.type) {
        case "select": case "text": return item.onChange(value as string, context);
        case "switch": return item.onChange(value as boolean, context);
        case "number": case "slider": return item.onChange(value as number, context);
      }
    }).catch(error => {
      if (live() && !context.signal.aborted) {
        state.error = props.failureLabel;
        logger.error(ctx.pluginId, "Settings item callback failed", { data: { id }, error });
      }
    }).finally(() => { if (live() && !context.signal.aborted) { state.pending = false; changed(); } });
  }
  function render(): void {
    if (!live()) return;
    const snapshot = registry.snapshot(); reconcile(snapshot);
    const group = snapshot.groups.find(value => value.id === props.groupId);
    const visible = group && snapshot.categories.some(value => value.id === group.categoryId);
    const active = visible ? props.items.filter(item => snapshot.items.includes(item)) : [];
    for (const item of active) if (!states.has(item.id)) states.set(item.id, { scope: owner.child(), pending: false, error: "" });
    const items = active.map(item => { const state = states.get(item.id)!; return { ...item, disabled: !!item.disabled || state.pending, error: state.error || item.error || "" }; });
    const sources = new Map(active.map(item => [item.id, item]));
    const next = { items, compact: (props.workspace as WorkspaceContext | undefined)?.compact, portalDropdowns: true, onChange: (id: string, value: unknown) => { const item = sources.get(id); if (item) invoke(item, value); },
      onRetry: (id: string) => { const item = sources.get(id); if (item) invoke(item, undefined, "retry"); },
      onReset: (id: string) => { const item = sources.get(id); if (item) invoke(item, undefined, "reset"); }, presentation: { mode: "embedded", sizing: "content" } };
    if (mounted) { const result = mounted.update(next); if (!result.ok) throw new Error("Cannot update declarative settings.", { cause: result.error }); }
    else { const result = components.mount("lunaris.settings-items", target, next, owner.signal); if (!result.ok) throw new Error("Cannot mount declarative settings.", { cause: result.error }); mounted = result.value; }
  }
  function dispose(): void { if (disposed) return; disposed = true; signal.removeEventListener("abort", dispose); void owner.dispose().catch(() => {}); states.clear(); }
  signal.addEventListener("abort", dispose, { once: true });
  try { render(); } catch (error) { dispose(); throw error; }
  return { update(next: ComponentProps) { props = next as GroupProps; render(); }, dispose };
}

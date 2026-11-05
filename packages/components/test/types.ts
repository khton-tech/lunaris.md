import { Components, ComponentsChanged } from "@lunaris/components";
import type { ComponentDefinition, MountedComponent } from "@lunaris/components";
import type { PluginContext } from "@lunaris/sdk";
declare const ctx: PluginContext;
declare const target: HTMLElement;
const components = ctx.use(Components);
const button: ComponentDefinition = { id: "lunaris.button", mount(host, props, signal) {
  const node = host.ownerDocument.createElement("button");
  node.textContent = String(props.label ?? "");
  host.append(node);
  signal.addEventListener("abort", () => node.remove(), { once: true });
  return { update(next) { node.textContent = String(next.label ?? ""); }, dispose() { node.remove(); } };
} };
components.register(button, ctx.signal);
const result = components.mount("lunaris.button", target, { label: "Save", onPress: () => {} }, ctx.signal);
if (result.ok) {
  const mounted: MountedComponent = result.value;
  mounted.update({ label: "Saved" });
  mounted.dispose();
}
const ids: readonly string[] = components.list();
void ids;
ctx.events.on(ComponentsChanged, change => { void change.componentId; });
// @ts-expect-error Registrations require an ownership signal.
components.register(button);
// @ts-expect-error Mounting requires an ownership signal.
components.mount("lunaris.button", target, {});
// @ts-expect-error Definitions must render.
components.register({ id: "lunaris.button" }, ctx.signal);
// @ts-expect-error Results must be checked before use.
result.value.dispose();

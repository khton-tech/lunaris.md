# Declarative application views

`Views` 1.0 and `ViewDefinition`, `ViewNode`, `ViewShape`, `ViewColor`,
`ViewPointer` and `ViewKey` are exported by `@lunaris/components`.
The existing Component Provider supplies `api:lunaris.views@1.0.0`.
Authors declare that requirement and `ui.dom`, plus Logger as usual.
`Views.register({ id, render(props) }, owner)` registers a new component ID with
the same owned registry used by Components. Duplicate IDs are rejected.

Unlike the trusted DOM component-set API, the render callback receives only
public props and returns data/callbacks. No target, ownerDocument, framework event
or host class instance is passed to package code. This surface works in QuickJS
with the regular public SDK and permits entirely new screens and tools rather
than only predefined product component roles.

## Rendering and mounting

Use a plugin-namespaced ID. The synchronous render callback returns one ViewNode.
Register that ID with ActiveScreen or a Settings section to borrow the corresponding
public region. ActiveScreen.update(id, props) updates a mounted screen; callbacks
may update plugin state and request new props. Registration does not itself select
a screen. Use ActiveScreen.select explicitly.

Activation fragment, with `label` supplied by the plugin's localization catalog:

```ts
const views = ctx.use(Views);
const screens = ctx.use(ActiveScreen);
let count = 0;
views.register({
  id: `${ctx.pluginId}.counter-view`,
  render() {
    return { kind: "column", children: [
      { kind: "text", text: String(count) },
      { kind: "button", label, onPress() {
        count++;
        screens.update(`${ctx.pluginId}.counter`, { count });
      } },
    ] };
  },
}, ctx.signal);
screens.register({ id: `${ctx.pluginId}.counter`, componentId: `${ctx.pluginId}.counter-view` }, ctx.signal);
screens.select(`${ctx.pluginId}.counter`);
```

Import Views from `@lunaris/components` and ActiveScreen from
`@lunaris/active-screen`; declare each API at `^1.0.0`. Check registration/update
results and log useful outcomes/errors with `ctx.use(Logger)` and ctx.pluginId.
Callback exceptions/rejections are contained and logged by the provider with the
view ID. Guest errors retain a bounded message/code/stack snapshot in the cause;
one failed action does not crash the host or disable unrelated plugins.

## Node vocabulary

| kind | Fields and behavior |
| --- | --- |
| text | text, escaped and wrapping |
| row / column / grid | children; grid optionally columns=1..12, collapsing to one below 640px allocation |
| button | label, optional disabled, onPress() |
| input / textarea | label, value, optional disabled, onChange(string); textarea autosizes within 3..16 rows |
| select | label, value, options of unique value/label pairs, optional disabled, onChange(string) |
| checkbox | label, checked, optional disabled, onChange(boolean) |
| drawing | label, width/height, shapes, optional onPointer(ViewPointer) / onKey(ViewKey) |

Controls are rendered by the shared Mantine component plugin. Select uses the
existing themed Combobox composition, including opened options and focus, rather
than a system dropdown. Text/labels never become HTML. Render data has bounds:
2048 nodes, depth 32, 1 MiB total text, 4096 characters per value/text, 512 per
control label and 256 select options. The execution bridge's transfer/nesting
limits also apply and may constrain deeply nested trees earlier.

Drawing is a general vector viewport, not a Markdown/editor-specific contribution.
Supported shapes: path `{ d, color, fill? }`, circle `{ x, y, radius, color, fill? }`,
line `{ x, y, x2, y2, color }` and text `{ x, y, text, color }`. Bounds are at most
2048 shapes, 32768 characters per path, finite coordinates within +/-1000000,
and positive viewport dimensions <=4096. Colors are semantic text, muted, accent,
error, surface or none. No image URL, script, foreignObject or arbitrary attributes
are accepted. This is a content viewport inside its borrowed region, not a new shell.

Pointer data contains only x/y in viewport coordinates, button and shift. Key data
contains key and modifier booleans. No native event target/window is exposed.
Interactive drawings have an accessible label, focus and keyboard support. Tab
keeps normal navigation; directional/Space/Enter behavior belongs to the drawing.

## Ownership and integration

Workspace, ActiveScreen and Settings retain geometry/surface ownership. Presentation
is supplied explicitly by the container. Views retain the render callback/props and
delegate to `lunaris.declarative-view`; the registry recovers mounted views when
that shared renderer is removed/replaced. Cancellation releases wrapper and nested
renderer instances before the guest interpreter closes.

Composed tests bundle an actual SDK/Logger/Views/ActiveScreen plugin and run it
through Kernel, LimeRuntime and QuickJS inside real Workspace/ActiveScreen/Mantine
composition. They cover no guest DOM, a novel counter/graph, typed button/select/
pointer/key callbacks, themed opened menus, action failure containment, light/dark
surface inheritance and disable cleanup. Separate tests cover input identity,
invalid trees and renderer replacement. Native graphics geometry and narrow/short
visual acceptance remain pending; this is not support for arbitrary host DOM access.

## Standalone application surfaces

Require `api:lunaris.view-surfaces@^1.0.0` and `ui.dom` for
`ViewSurfaces` from `@lunaris/components`. After registering a declaration with
`Views.register`, mount it in a new application slot.

```ts
const surface = ctx.use(ViewSurfaces).mount(viewId, `${ctx.pluginId}.screen`,
  { title: localization.text(ctx.pluginId, "title") }, ctx.signal);
if (!surface.ok) {
  logger.error(ctx.pluginId, "Cannot open the application surface", { error: surface.error });
}
```

Each successful mount creates a growing child of the product root and returns
the standard `MountedComponent` handle. Use `update(props)` to replace the
view's props and `dispose()` to remove the view and its slot. The mount also
ends when either the mount owner or the registered view's owner aborts.
`update` replaces only custom props and the container always supplies
standalone/fill presentation. Renderers receive no slot or DOM references.

The existing slot driver owns geometry and slot order. Mantine owns the
new surface background and controls and applies the current theme. The view
owns its content and localization. The mount accepts declarative view IDs and
unused dotted slot IDs. Native roles or unavailable slot adapters return
`NOT_FOUND`. Existing IDs return `ALREADY_REGISTERED`. A failed initial
render releases the new allocation and reports `RENDER_FAILED`. Native host
and recovery surfaces remain outside the product slot tree.

An independent package can supply the working interface for a Vault using
this API. The owner can disable the standard Workspace feature in its
composition profile and restore it by clearing that choice. The composed
QuickJS regression covers product root ownership, failed-mount cleanup,
existing-slot and native-role rejection, action-driven updates, profile
switching and removal on package disable.

# Plugin recipes

Start with a generated project from the portable toolchain.
The following recipe adds a persisted setting and a screen using only SDK imports.
Keep the generated Logger requirement.

## A saved counter screen

Add the public packages and run `npm install`.

```sh
npm run core -- add-contract @lunaris/active-screen
npm run core -- add-contract @lunaris/components
npm run core -- add-contract @lunaris/config
npm run core -- add-contract @lunaris/localization
npm run core -- add-contract @lunaris/settings
npm run core -- add-contract @lunaris/vault
```

Merge these fields into `manifest.json`.

```json
{
  "requires": [
    { "kind": "api", "id": "lunaris.logger", "range": "^1.0.0" },
    { "kind": "api", "id": "lunaris.active-screen", "range": "^1.0.0" },
    { "kind": "api", "id": "lunaris.views", "range": "^1.0.0" },
    { "kind": "api", "id": "lunaris.config", "range": "^1.0.0" },
    { "kind": "api", "id": "lunaris.localization", "range": "^1.0.0" },
    { "kind": "api", "id": "lunaris.settings", "range": "^1.2.0" },
    { "kind": "api", "id": "lunaris.vault", "range": "^1.0.0" }
  ],
  "permissions": ["ui.dom", "config.access", "vault.access"]
}
```

Replace `src/plugin.ts` with the following code.

```ts
import { definePlugin } from "@lunaris/sdk";
import { Logger } from "@lunaris/logging";
import { ActiveScreen } from "@lunaris/active-screen";
import { Views } from "@lunaris/components";
import { Config } from "@lunaris/config";
import { Localization } from "@lunaris/localization";
import { Settings } from "@lunaris/settings";
import { Vault } from "@lunaris/vault";
import manifest from "../manifest.json" with { type: "json" };

function check<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error("Counter operation failed", { cause: result.error });
  return result.value;
}

export default definePlugin({
  manifest,
  async activate(ctx) {
    const id = ctx.pluginId;
    const logger = ctx.use(Logger);
    const localization = ctx.use(Localization);
    const config = ctx.use(Config);
    const settings = ctx.use(Settings);
    const screens = ctx.use(ActiveScreen);
    const views = ctx.use(Views);
    const vault = ctx.use(Vault).current();
    if (!vault) throw new Error("Open a Vault to use the counter.");
    const target = { scope: "vault", vaultId: vault.id } as const;
    const key = "count";
    const value = check(await config.get(id, key, target));
    ctx.signal.throwIfAborted();
    let count = typeof value === "number" ? value : 0;
    let pending = false;
    const screenId = id + ".counter";
    const viewId = id + ".counter-view";
    const groupId = id + ".counter-group";
    const itemId = id + ".counter-value";
    check(localization.register(id, {
      en: { title: "Counter", value: "Value", increment: "Increase" },
      ru: { title: "Счётчик", value: "Значение", increment: "Увеличить" },
    }, ctx.signal));
    const label = (key: string) => localization.text(id, key);
    const item = () => ({ type: "number" as const, title: label("value"), value: count, onChange: save });

    async function save(next: number) {
      if (pending || ctx.signal.aborted) return;
      pending = true;
      try {
        check(await config.set(id, key, next, target));
        if (ctx.signal.aborted) return;
        count = next;
        check(screens.update(screenId, { count }));
        check(settings.updateItem(itemId, item()));
        logger.debug(id, "Counter saved");
      } catch (error) {
        if (!ctx.signal.aborted) logger.error(id, "Counter save failed", { error });
      } finally {
        pending = false;
      }
    }

    check(settings.registerCategory({ id, title: label("title") }, ctx.signal));
    check(settings.registerGroup({ id: groupId, categoryId: id, title: label("value") }, ctx.signal));
    check(settings.registerItem({ ...item(), id: itemId, groupId }, ctx.signal));
    check(views.register({
      id: viewId,
      render: () => ({
        kind: "column",
        children: [
          { kind: "text", text: String(count) },
          { kind: "button", label: label("increment"), onPress: () => save(count + 1) },
        ],
      }),
    }, ctx.signal));
    check(screens.register({ id: screenId, componentId: viewId, props: { count } }, ctx.signal));
    check(screens.select(screenId));
    logger.info(id, "Counter ready");
  },
});
```

Run `npm run check` and `npm run pack`. Install the resulting LUP in an open
Vault. The counter opens as an application screen and its value is also editable
under Settings. Disable and enable the plugin to check persistence. The provider
registrations use the activation signal, so stopping the plugin releases its
screen, controls and catalog. For a test of this recipe, supply Settings, Vault,
Config, Localization, Views and ActiveScreen fixtures along with Logger. The
generated Logger-only test applies to the unmodified starter.

## Separate service provider and consumer

Create two projects with different plugin IDs. Give both the same public token
definition, for example a module called `greeting.ts`.

```ts
import { defineApi } from "@lunaris/sdk";
export const Greeting = defineApi<{ message(): string }>({
  id: "example.greeting",
  version: "1.0.0",
});
```

The provider adds `{ "kind": "api", "id": "example.greeting", "version": "1.0.0" }`
to `provides` and calls `ctx.provide(Greeting, { message: () => "Hello" })`
during activation. The consumer adds
`{ "kind": "api", "id": "example.greeting", "range": "^1.0.0" }` to `requires`
and calls `ctx.use(Greeting).message()`. Both retain Logger. Pack each project
separately, install and enable the provider, then install the consumer.

To try an alternative provider, give a second provider a distinct plugin ID and
the same compatible contract. Enable it, open the consumer's Details and select
it for `example.greeting`. Apply the choice. Lime shows affected active consumers
and restarts their activations. Keep API handles inside their activation scope.

### Add an extension point to your own plugin

Export event and hook tokens from the same shared module as the API. Bundle the
module into each plugin as an ordinary dependency. The built-in contract catalog
is only needed to find Lunaris packages.

```ts
import { defineEvent, defineHook } from "@lunaris/sdk";

const isText = (value: unknown) => typeof value === "string";
export const GreetingTransform = defineHook<string>({
  id: "example.greeting-transform", version: "1.0.0", validate: isText,
});
export const GreetingShown = defineEvent<string>({
  id: "example.greeting-shown", version: "1.0.0", validate: isText,
});
```

Declare both tokens in the publisher's `provides` and in the subscriber's
`requires` using their `event` or `hook` kind. During activation the subscriber
uses `ctx.hooks.register(GreetingTransform, greeting => greeting.trim())` and
`ctx.events.on(GreetingShown, () => { logger.debug(ctx.pluginId, "Greeting shown"); })`.
Once active, the publisher can await `ctx.hooks.run(GreetingTransform, message)`
to get the transformed message. After displaying it, the publisher awaits
`ctx.events.emit(GreetingShown, transformed)`. Keep callback values portable
across execution realms.

For a contract with explicit permissions, set `providePermission` and
`consumePermission` on the shared token. Each package declares the permission for
its role and must have the corresponding effective grant. Both sides use the
same token metadata. Stopping a subscriber removes its registrations.

## Files and editor surfaces

Use public Filesystem targets with the ID from
`ctx.use(Vault).current()`. Pass that captured ID to every operation. Place
managed files under `.lunaris/plugins/data/<plugin-id>/` if update rollback or
remove-with-data should cover them.

For a custom editor or drawing surface, use the Views drawing node from
`@lunaris/components`.
Use `EditorEffects` from `@lunaris/editor` for owned deletion effects. The
lower-level `EditorExtensions` contract accepts CodeMirror or Lezer runtime
values. Review compatible package instances and adapter requirements in
[Editor extensions](../reference/editor-extensions.md) when using it.

## Replace the editor's clipboard provider

Generate a project with the plugin ID `example.vault-clipboard`. Add the public
Clipboard contract with `npm run core -- add-contract @lunaris/clipboard` and
run `npm install`. Keep the generated Logger requirement and add this provision
to the package manifest.

```json
{ "kind": "api", "id": "lunaris.clipboard", "version": "1.0.0" }
```

Use the existing versioned token to provide an activation-local clipboard.

```ts
import { definePlugin } from "@lunaris/sdk";
import { Clipboard } from "@lunaris/clipboard";
import { Logger } from "@lunaris/logging";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({
  manifest,
  activate(ctx) {
    const logger = ctx.use(Logger);
    let text = "";
    ctx.provide(Clipboard, {
      capabilities: () => ({ read: true, write: true }),
      async readText() {
        logger.debug(ctx.pluginId, "Read from the plugin clipboard");
        return { ok: true, value: text };
      },
      async writeText(value) {
        text = value;
        logger.debug(ctx.pluginId, "Wrote to the plugin clipboard");
        return { ok: true, value: null };
      },
    });
    logger.info(ctx.pluginId, "Plugin clipboard ready");
  },
});
```

Pack and install the package in a Vault. Through the
[Lime composition API](../reference/lime-runtime.md#vault-composition), bind
`lunaris.text-editor` to `example.vault-clipboard` for `api:lunaris.clipboard`.
The profile can also disable `lunaris.clipboard-provider` in the same transaction.

The copied text lives in the plugin's activation and disappears when it stops.
To restore this dependency, remove the explicit binding and re-enable the
built-in Clipboard provider in the Vault profile.

### Wrap the existing provider

Generate a second project with the ID `example.clipboard-line-endings`. Use the
same Clipboard provision and add the corresponding requirement alongside Logger.
Declare `clipboard.access` in `permissions`.

```json
{ "kind": "api", "id": "lunaris.clipboard", "range": "^1.0.0" }
```

Use the same imports as above and forward methods to the explicitly selected
upstream provider. This decorator normalizes line endings on reads.

```ts
export default definePlugin({
  manifest,
  activate(ctx) {
    const logger = ctx.use(Logger);
    const upstream = ctx.use(Clipboard);
    ctx.provide(Clipboard, {
      capabilities: () => upstream.capabilities(),
      async readText() {
        const result = await upstream.readText();
        if (!result.ok) {
          logger.warn(ctx.pluginId, "Upstream clipboard read failed", { error: result.error });
          return result;
        }
        logger.debug(ctx.pluginId, "Normalized clipboard line endings");
        return { ok: true, value: result.value.replace(/\r\n?/g, "\n") };
      },
      async writeText(value) {
        const result = await upstream.writeText(value);
        if (!result.ok) logger.warn(ctx.pluginId, "Upstream clipboard write failed", { error: result.error });
        return result;
      },
    });
    logger.info(ctx.pluginId, "Clipboard decorator ready");
  },
});
```

Pack the decorator and choose Install disabled in the package preview. In its
installed package Details, select `lunaris.clipboard-provider` for
`api:lunaris.clipboard` and apply that provider choice before enabling the
decorator. Then bind the editor to the decorator through the Lime composition API. Keep the upstream provider enabled. The two
explicit choices form the chain from editor to decorator to upstream provider.

## Supply a Workspace layout

Add `@lunaris/workspace` and declare
`{ "kind": "api", "id": "lunaris.workspace-layout", "version": "1.0.0" }`
in `provides`. Keep the generated Logger requirement. Import `WorkspaceLayout`
and the type `WorkspaceLayoutNode` from `@lunaris/workspace` and add this code
inside `activate(ctx)`.

```ts
const tree = {
  kind: "row",
  children: [
    { kind: "region", region: "main", grow: 3 },
    { kind: "column", children: [
      { kind: "region", region: "left-rail" },
      { kind: "region", region: "left-panel" },
      { kind: "region", region: "example.tools" },
    ] },
  ],
} satisfies WorkspaceLayoutNode;

ctx.provide(WorkspaceLayout, {
  describe: () => tree,
  watch() {},
});
ctx.use(Logger).info(ctx.pluginId, "Workspace layout ready");
```

The tree puts the navigation and panel after main. To populate `example.tools`,
register a declarative view as in the counter recipe and pass its ID to
`Workspace.register({ id, componentId, region: "example.tools" }, ctx.signal)`.
Declare `api:lunaris.workspace@^1.5.0` and the view's dependencies for the
package that registers the content.

Install and enable the layout. Use the Lime composition API to bind
`lunaris.workspace` to the package for `api:lunaris.workspace-layout`. Each region appears at
most once. For dynamic layouts, `describe` can read the Vault context and
`watch(listener, owner)` can invoke the listener when the layout changes.
Release the listener when the supplied owner aborts.

## Mount a separate working interface

Add `@lunaris/components`. Declare `api:lunaris.views@^1.0.0`,
`api:lunaris.view-surfaces@^1.0.0`, and the `ui.dom` permission.
Import `Views` and `ViewSurfaces` from `@lunaris/components`. In activation,
use a localized `title` from the package's catalog and the generated Logger.

```ts
const viewId = `${ctx.pluginId}.working-view`;
const view = ctx.use(Views).register({
  id: viewId,
  render: () => ({ kind: "text", text: title }),
}, ctx.signal);
if (!view.ok) throw new Error(view.error.message);

const surface = ctx.use(ViewSurfaces).mount(viewId, `${ctx.pluginId}.work`, {}, ctx.signal);
if (!surface.ok) {
  logger.error(ctx.pluginId, "Cannot mount working interface", { error: surface.error });
  throw new Error(surface.error.message);
}
logger.info(ctx.pluginId, "Working interface mounted");
```

Use the returned handle's `update(props)` to refresh the view and
`dispose()` to remove the surface early. Both registrations are owned by
the activation. The surface requires a fresh dotted slot ID. It uses the
shared theme and declarative controls. After installing this package, the
owner can disable `lunaris.workspace` through the Lime composition API to use
the separate interface. Remove the disabled entry to restore Workspace. Safe mode provides access to the default application even when
the custom interface omits Settings.

## Add a decoration to existing UI

[Drema](../../examples/drema/DOCS/README.md) adds a package-owned animated image
to the existing status bar beside the filename. It requires Logger and
`api:lunaris.application-dom@^1.0.0`, declares `ui.dom`, and uses
[ApplicationDom](../reference/application-dom.md) from `@lunaris/components`.
No slot or host patch is necessary. The example's source, manifest and
`assets/drema.svg` are in `examples/drema/`.

For your own decoration, obtain the current product root with
`ctx.use(ApplicationDom).root()`, create a node using its owner document, and
locate a suitable existing element. An observer can follow replacements of the
target as the application renders. Put observer disconnection and node removal
in `ctx.scope.own({ dispose() { … } })`. Keep layout and styles owned by the
existing component intact. Use localized labels for interactive or informative
content. A selector specific to one renderer can change across releases.

In the actual application, open a note in a Vault and enable the example.
Check that the image appears next to the filename, the status bar remains
usable in a narrow window, and the image stays still with reduced motion
enabled. Disable the plugin and check that the image disappears.

## Implement a Windows operation in a plugin

[Global Hotkey](../../examples/global-hotkey/DOCS/README.md) registers
Ctrl+Alt+Shift+H in its own Windows helper and emits
`example.global-hotkey-pressed@1.0.0`. It uses
[NativeProcesses](../reference/native-processes.md) from `@lunaris/execution`
with the `api:lunaris.native-processes@^1.0.0` requirement. Lunaris provides
the process lifecycle and line transport. The plugin defines what messages
mean and what Windows calls the helper performs.

In a generated project, add the execution contract with
`npm run core -- add-contract @lunaris/execution` and install dependencies.
Copy the example manifest to the project root and the TypeScript files to
`src/`. Copy the `native/` directory, build its Rust helper for
`x86_64-pc-windows-msvc`, and copy the executable to
`assets/bin/hotkey.exe`. Run `npm run check` and `npm run pack`.
The helper handles registration and Windows messages. The activation starts it
using `ctx.use(NativeProcesses).start(ctx, options)` and translates its output
into a plugin-defined event. Another plugin can declare the event in
`requires` and subscribe through the ordinary SDK.

For native acceptance, install the package in a Vault on Windows and focus
a different application. Press the combination and check for
`Global hotkey pressed` in the Lunaris developer log. Disable the package
and verify that pressing the combination no longer adds a record.

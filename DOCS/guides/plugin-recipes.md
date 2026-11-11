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

## Files and editor surfaces

Use public Filesystem targets with the ID from
`ctx.use(Vault).current()`. Pass that captured ID to every operation. Place
managed files under `.lunaris/plugins/data/<plugin-id>/` if update rollback or
remove-with-data should cover them.

For a custom editor or drawing surface, use the Views drawing node from
`@lunaris/components`.
CodeMirror-native extensions use `EditorExtensions` from `@lunaris/editor` in
trusted host composition. Installed QuickJS packages currently use the
declarative view contract for new editor-like surfaces.

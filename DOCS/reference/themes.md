# Theme provider

## Responsibilities

Required: theme engines register their own descriptions, and independent consumers
obtain the selected description through a replaceable SDK service. Existing: typed
SDK APIs/events, owner signals, Logger, and host plugin composition. New:
`@lunaris/themes` contracts and `@lunaris/theme-provider` in `plugins/UI/themes`.
No SDK/kernel extension, DOM driver, Config dependency or additional permission
is required for this in-process data service.

The provider owns registration, selection, immutable snapshots and notifications.
Each engine owns its theme descriptions: geometry, colors, typography, additional
domains, units and interpretation. Engines can replace their registered descriptions
when their own inputs change. Consumers import shared contracts, never a particular
provider or engine implementation. Standard SDK provider selection supports
replacement of the registry itself.

There are no built-in themes, automatic selection, required palette, required token
set, CSS mappings, rendering callbacks or layout presets. Startup returns an empty
registry and no current theme. Nothing is painted or mounted by this plugin.
The separate [base theme engine](base-theme.md) now supplies the project's approved
palettes and measurements. Application components remain separate consumers.

## Description format

```ts
interface ThemeDefinition {
  readonly id: string;
  readonly name: string;
  readonly properties: ThemeProperties;
}
```

`id` is a canonical dotted name, normally namespaced beneath the engine plugin ID.
`name` is a nonempty author-supplied display name. It is content supplied by the
engine, not provider-owned interface copy. An engine with localized names can
resolve its own catalog and update the description when the locale changes.
Any future selector owns and localizes its controls and error messages.

`properties` is an open, nested plain-data object. Property names are chosen by
the engine. Typical sections can include `geometry`, `colors` and `typography`,
but the provider requires none of these and interprets none of their values.
Values support strings, finite numbers, booleans, null, dense arrays and nested
plain objects. The empty object is valid. An engine and its consumers must agree
on the meaning of its domains; registration does not establish renderer compatibility.

Descriptions are copied and deeply frozen. Updates replace the complete description
atomically; they do not merge it with defaults or another theme. Previously returned
snapshots stay unchanged. Accessors, callbacks, symbols, undefined, bigint,
non-finite numbers, sparse arrays, class instances, cycles, empty property keys and
the reserved keys `__proto__`, `constructor` and `prototype` are rejected.
Top-level fields are exactly `id`, `name` and `properties`. Shared subobjects may be
copied multiple times. Limit: 32 levels below the properties root and 10,000 copied
values per description. These are data validation limits, not visual constraints.

## Engine registration and updates

Declare `api:lunaris.themes@^1.0.0` and require Logger according to the product
logging policy. An engine registers through the SDK:

```ts
import { Themes } from "@lunaris/themes";

const themes = ctx.use(Themes);
const themeScope = ctx.scope.child();
const result = themes.register({
  id: `${ctx.pluginId}.primary`,
  name: engineThemeName,
  properties: engineThemeDescription,
}, themeScope.signal);
if (!result.ok) {
  // Log/map the stable failure code in the engine's own context.
  return;
}

// Update when the engine produces a new description. Original ownership remains.
themes.update({
  id: `${ctx.pluginId}.primary`,
  name: engineThemeName,
  properties: nextEngineThemeDescription,
});

// Early removal; plugin shutdown also releases the owned child scope.
await themeScope.dispose();
```

The signal must be live and SDK-compatible, normally `ctx.signal` or an owned
child scope's signal. A duplicate registration never overwrites an existing owner.
Updating preserves the original owner. Cancelling that owner removes its theme;
if selected, the active theme becomes null. No alternative is silently selected.
Re-registering an ID after removal does not restore selection.

Theme IDs and namespaces express attribution, not caller authentication. The SDK
does not expose authenticated caller identity to API implementations: this is a
cooperative local registry. Any consumer with the contract can select a theme or
update an existing description. Consumers should leave authoring to its engine.

## Consumer API

| Method | Behavior |
|---|---|
| `register(theme, owner)` | Add one owned description. Does not select it. |
| `update(theme)` | Replace an existing description, retaining its owner. |
| `get(id)` | Immutable description or `undefined` when unregistered. |
| `list()` | Frozen snapshot of all descriptions, sorted lexically by ID. |
| `current()` | Selected immutable description or `null`. |
| `select(id)` | Select a registered ID; `null` explicitly clears selection. Re-selecting the current ID does nothing. |

Mutations return `ThemeResult`: `{ ok: true, value: null }` or
`{ ok: false, error: { code, message } }`. Codes are `INVALID_ARGUMENT`,
`ALREADY_REGISTERED`, and `NOT_FOUND`. Rejected operations preserve registry and
selection, and emit no event. SDK declaration, scope and provider-availability
errors retain normal SDK behavior. Missing read lookups return no value.
Technical diagnostic messages are English; do not display them as product UI copy.

To follow engine changes, also declare `event:lunaris.theme-changed@^1.0.0`:

```ts
import { Themes, ThemeChanged } from "@lunaris/themes";

const themes = ctx.use(Themes);
ctx.events.on(ThemeChanged, () => {
  const description = themes.current();
  // Hand the snapshot to the consumer's own rendering logic, if available.
});
const initial = themes.current();
```

Every accepted registration/update, real selection change and owner removal
publishes `{ kind, themeId, previous, current }`. Kinds are `registered`, `updated`,
`selected`, and `removed`; previous/current are selected IDs or null. For explicit
clearing, themeId is null. Other kinds identify the changed description, including
inactive descriptions. An accepted update publishes even for equivalent input.
Payloads contain no theme values and are frozen. Events follow SDK dispatch rules;
state is committed before publication. Re-read the API to obtain the latest data
rather than assuming an earlier event still describes the current selection.

## Lifecycle and diagnostics

When an engine owner stops, the provider removes its data and uses its own still-live
event endpoint to notify remaining consumers. This callback never calls Logger or
another provider: required dependencies may already be stopping. If the theme
provider's endpoint is itself stopping, `CONTRACT_UNAVAILABLE` is an expected
shutdown outcome. Unexpected abort-listener failures remain covered by independent
kernel diagnostics. After its own signal closes, the provider publishes nothing.
Its disposal detaches all owner listeners and clears local state without SDK calls.
Old owner signals cannot remove a later registration with the same ID.

Readiness, accepted mutations and rejected operations use the required Logger with
`ctx.pluginId` as source. Operational event-publication failures include the original
error. Logs/events contain IDs and change kinds, not the theme description or name.
No registration, selection or update survives a provider restart.

## Composition and verification

The provider itself starts empty. Tauri now also starts the separate
[base theme engine](base-theme.md), which registers Lunaris Light and Lunaris Dark
without selecting a default itself. The separate theme-settings plugin reads
startup config and selects Dark by default in Tauri. Recovery/System UI remains independent of themes.
Persistence, installed theme discovery, theme compatibility negotiation, platform
application and selection UI remain outside the provider. This plugin follows
[the UI guidelines](../UI_GUIDELINES.md) by adding no visible elements.

Run `npm run themes:check` for contract/type fixtures, provider behavior, actual SDK
engine lifecycle, host recovery and dependency boundaries. Run
`npm run build --workspace @lunaris/tauri` for the production frontend bundle.
Fixtures demonstrate engine-owned data only; no example themes ship in production.
There is no visual change requiring desktop automation or WebView acceptance.

Local evidence, 2026-11-05: `npm run themes:check` passed 63 targeted tests with
zero skipped, including types, import boundaries, provider/engine lifecycle and
host recovery. CI scope-selection tests, the Tauri frontend production build and
the documentation/public-export audit passed. No native window was launched.

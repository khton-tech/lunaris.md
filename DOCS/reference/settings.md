# Settings foundation

## Declarative registration (SDK 1.1)

The primary model is **category -> group -> item**. Categories are navigation
entries; groups organize settings inside a category; items declare individual
typed controls. UI structure belongs to registration, never to saved Config data.
The existing category/section APIs remain available for older custom contributions.

`Settings` and `SettingsChanged` now use version 1.1.0. Consumers of declarative
registration must require `api:lunaris.settings@^1.1.0`; observers of its expanded
snapshot require `event:lunaris.settings-changed@^1.1.0`.

- `registerGroup({ id, categoryId, title, description?, order? }, owner)`.
- `registerItem({ id, groupId, title, type, value, onChange, ... }, owner)`.
- `updateGroup(id, { title, description? })` replaces localized group presentation.
- `updateItem(id, presentation)` replaces the complete typed presentation/value,
  preserving ID, group, order, control type and original owner.
- `snapshot()` adds frozen `groups` and `items` arrays, each ordered by `order`
  and registration order. Parents and children have independent owners; missing
  parents hide children without deleting them. Groups and legacy sections share
  a page namespace, so their IDs must not collide.

Item types: `select` (string value, unique `{ value, label }[]` options), `switch`
(boolean), `text` (string, optional placeholder), and `number` (finite number,
optional finite min/max and positive step). Numeric values must be within bounds.
An unavailable select value is allowed for explicit degraded presentation; it
must never be silently replaced or persisted by the renderer.

Common fields: nonempty `title`, optional `description`, `disabled`, localized
`error`, `order`, and `layout: "inline" | "stacked"` (default inline). Layout
describes label/control placement inside the responsive row, not coordinates or
container geometry. Optional `onRetry(context)` and nonempty `retryLabel` must
appear together. Every control requires `onChange(value, context)`; callbacks may
return void or a Promise. The context is `{ vaultId, signal }`, with the explicit
rendered Vault and view lifetime. Controllers own validation, live application,
storage and accepted-operation lifetime. Settings owns invocation lifetime and
contains asynchronous callback failures. The registry is not a value store.

```ts
settings.registerGroup({ id: "example.display", categoryId: "example.general",
  title: displayTitle, order: 10 }, ctx.signal);
settings.registerItem({ id: "example.theme", groupId: "example.display",
  title: themeTitle, type: "select", layout: "inline", order: 20,
  value: selectedTheme, options: availableThemes,
  onChange: (value, context) => controller.selectTheme(value, context),
}, ctx.signal);
```

Descriptors are plain data-property records; accessors, symbols, unexpected keys,
invalid IDs, sparse/unsafe option arrays and mismatched types are rejected without
mutation. Option arrays/records are copied and frozen. Callbacks retain identity.
Omitted optional update fields reset their presentation defaults. A control-type
change requires a fresh owned registration. Existing validation/result/error rules
below apply to all contributions.

Status: implemented on 2026-11-07; native visual acceptance remains manual.

Settings is an extensible UI foundation. A Settings icon in the bottom group of
Sidebar opens category navigation. Selecting a category opens one Settings active
screen; section headings organize contributed content. No categories or controls
are hardcoded into the foundation. With no contributions, navigation shows
"No settings available". The foundation itself supplies no concrete controls.
The separate [interface settings controller](../../plugins/UI/interface-settings/DOCS/README.md)
now contributes Vault-local language and theme selection in Tauri.

## Public contribution API

Import `Settings` and optionally `SettingsChanged` from `@lunaris/settings`.
Declare `api:lunaris.settings@^1.0.0` and the event if observing registry changes.
Product contributors must also declare and use Logger. Registration needs no DOM,
filesystem or config permissions.

```ts
const settings = ctx.use(Settings);
const category = settings.registerCategory({
  id: "example.preferences",
  title: localizedCategoryTitle,
  order: 20,
}, ctx.signal);
if (!category.ok) {
  logger.warn(ctx.pluginId, "Cannot register settings category", { error: category.error });
  return;
}
const section = settings.registerSection({
  id: `${ctx.pluginId}.controls`,
  categoryId: "example.preferences",
  title: localizedSectionTitle,
  componentId: "example.settings-controls",
  props: controllerProps,
  order: 10,
}, ctx.signal);
if (!section.ok) {
  logger.warn(ctx.pluginId, "Cannot register settings section", { error: section.error });
}
```

The example IDs/role are illustrative, not shipped controls. Add actual product
renderers to Mantine components through public Components roles. Consumers never
import React/Mantine or another plugin's implementation. Reuse an existing category
ID when contributing another section; do not register the category again. Category
and section ownership are independent, so a shared category can have one owner and
multiple section contributors.

| Method | Behavior |
|---|---|
| `registerCategory({ id, title, order? }, owner)` | Add an owned category. |
| `registerSection({ id, categoryId, title, componentId, props?, order? }, owner)` | Add an owned section; its category may appear later. |
| `updateCategory(id, { title })` | Replace localized presentation, preserving order/identity/owner. |
| `updateSection(id, { title, props? })` | Replace title and custom props, preserving category/role/order/identity/owner. Omitted props become empty. |
| `snapshot()` | Frozen `{ categories, sections }`, each sorted by order then registration order. |

Mutations return `{ ok: true, value: null }` or `{ ok: false, error: { code,
message } }`. Codes: `INVALID_ARGUMENT`, `ALREADY_REGISTERED`, `NOT_FOUND`.
IDs and category/role references use the dotted-ID grammar. Titles are nonempty;
order defaults to zero and must be a safe integer. Plain data-property records are
required; reject accessors, symbols, unknown descriptor keys and reserved
`workspace`/`__proto__` props. Copy/freeze records and top-level props; nested values
and callbacks retain identity, consistently with Components. IDs are cooperative
attribution, not authenticated caller isolation.

Owner cancellation removes a contribution. Category removal hides its sections but
does not unregister other owners' contributions; replacing the category makes them
available again. Missing categories are not synthesized. SettingsChanged emits a
committed frozen snapshot on registration, update and removal. Subscribe before
reading; observers may call the API without waiting for a mutation queue. On locale
changes contributors update their own category/section titles and props.

## Rendering and Vault scope

Sections receive `{ ...props, workspace: { vaultId, vaultName } }` through
Components with an owned mount signal. The Workspace context is explicit and frozen.
The selected category survives Sidebar collapse and active-screen changes within
the current Vault. Retained Settings instances keep their section drafts/scroll.
Changing categories releases the old category's section views. Updating a section's
props/title or changing locale/theme preserves its mounted target and instance
unless rendering fails. Missing/removed/failing roles show localized section
placeholders; late roles and later updates can recover without losing other sections.

Vault changes reset category selection. Workspace/ActiveScreen release the old
Settings screen and every section view. Old navigation callbacks check both view
cancellation and their explicit Vault ID and cannot open Settings in a later Vault.
The provider registry survives Vault changes because it describes available UI,
not saved values. Selection/drafts are not persisted across application restarts.

This foundation never reads/writes Config and has no Apply button or value store.
Future setting controllers must apply changes immediately, use Config's explicit
`{ scope: "vault", vaultId }` target for both reads and writes, validate stale work
against their view/Vault lifetime, and use their own namespace. Do not read effective
or global preferences for these user settings. Rendering roles stay presentation-only;
storage and live behavior belong to the contributing controller through SDK APIs.
Global settings remain outside this foundation. Concrete interface preferences
are implemented separately; the registry and Settings container remain unchanged.

## Composition and visual roles

Tauri composes `lunaris.settings-provider` and `lunaris.settings`. The UI consumes
Settings, Sidebar 1.1 bottom placement, ActiveScreen, Components, Localization, Vault
and required Logger through the SDK. Sidebar owns tab selection/collapse; ActiveScreen
owns screen selection/retention; Workspace owns layout and Vault view lifetime.
No private slots, host internals, DOM reparenting or direct plugin imports are used.

Mantine supplies:

- `lunaris.settings-navigation`: title, emptyLabel, categories `{ id, title }[]`,
  selectedId or null, and onSelect(id). Category labels wrap; aria-current exposes
  selection without forcing focus.
- `lunaris.settings-page`: title, emptyLabel, sections `{ id, title }[]`, and
  onTargets(map or null). Stable section targets are borrowed; mount children only
  after the parent Components call returns. The container passes public
  `presentation: { mode: "embedded", sizing: "content" }` to section roles and
  fallbacks; intrinsic height never depends on target classes. The page and
  navigation use embedded/fill presentation and inherit their owning surfaces.

The main screen remains open and borderless. Sidebar content inherits the existing
card surface. Navigation and page own scrolling with hidden native scrollbar chrome.
All labels are localized and styles use the active theme. Layout was informed by
[Mantine UI navbar compositions](https://ui.mantine.dev/category/navbars/).

Completed foundation integrations: registry, UI, Sidebar, ActiveScreen, Workspace
context, Mantine roles, Localization/Vault lifecycle, Logger and Tauri composition.
The separate interface settings contribution connects Config, Themes and
Localization without making the foundation depend on those preference controllers.

## Verification

Run `npm run settings:check` and targeted Sidebar/Mantine checks. Tests cover
validation, ordering, independent ownership, orphan sections, bottom placement,
empty navigation, category selection, retained instances, missing/replaced/failing
roles, category removal, locale/theme updates, screen switching, stale navigation,
Vault isolation and cleanup. Run the Tauri frontend production build and export/docs
audit. Native visual acceptance is manual; desktop automation is prohibited.

Manual acceptance: open a Vault and verify Settings is at the bottom, opening it
shows the empty navigation, and existing File Explorer remains usable. With a real
contribution, verify category/heading hierarchy, editable controls, local scrolling,
long translations, narrow/short windows and state reset on Vault switch.

Local evidence, 2026-11-07: targeted Settings, Sidebar, Mantine and affected consumer
checks passed 131 tests with zero skipped, including build, boundaries and type
fixtures. Production Tauri frontend build, public-export/documentation audit and
CI scope-selection test passed. Native visual acceptance was not run.

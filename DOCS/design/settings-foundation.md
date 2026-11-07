# Settings foundation

Scope authorized by the Owner on 2026-11-07: an extensible settings foundation,
without concrete settings, theme integration or other system integrations.

Existing: ActiveScreen, Sidebar, Workspace, Components, Localization, Logger and
Vault lifecycle. Missing public SDK contracts: category/section contributions and
explicit bottom placement in Sidebar. Implement these contracts before consumers;
do not infer bottom placement from a large numeric order or use private DOM.

## Public additions

- `@lunaris/settings`, API `Settings` and event `SettingsChanged` 1.0.0.
- `registerCategory({ id, title, order? }, owner)` and
  `registerSection({ id, categoryId, title, componentId, props?, order? }, owner)`.
- `updateCategory(id, { title })` and `updateSection(id, { title, props? })`.
- `snapshot()` returns frozen ordered categories and sections. Mutations return
  the familiar result shape with INVALID_ARGUMENT, ALREADY_REGISTERED, NOT_FOUND.
- IDs are dotted; inputs are plain data-property records. Copy/freeze descriptors
  and top-level props; reject unknown descriptor keys and reserved workspace props.
- Categories and sections have independent ownership. Orphan sections remain
  registered but hidden, allowing independent startup/replacement of contributors.
  Scope cancellation removes contributions; events publish committed snapshots.
- Sidebar 1.1 adds optional `placement: "start" | "end"`, default start. Order is
  local to a placement group. Keyboard navigation follows actual visual order.

## Components and lifecycle

`plugins/UI/settings-provider` owns the portable registry and requires Logger.
`plugins/UI/settings` owns navigation and screen composition, requiring Settings,
Sidebar, ActiveScreen, Components, Localization, Vault and Logger APIs/events.
Mantine provides category navigation and the screen layout with section headings
and stable borrowed targets. Child section roles mount after layout calls return.

The Settings tab opens its category list in Sidebar. Clicking a category opens the
Settings active screen. No categories means a localized empty navigation/screen;
no demonstration settings ship. Category selection survives sidebar collapse and
screen switches within a Vault. Changing categories releases their mounted section
views. Removing categories/sections or component roles updates live views; missing
or failed roles show localized section failures and can recover on later updates.
Locale/theme updates preserve mounted section targets where identity is unchanged.

Vault transitions reset category selection and release views. Section roles receive
the explicit frozen Workspace Vault context and an owned view signal. Old callbacks
cannot open screens or perform navigation in a later Vault. The foundation stores
no values, makes no Config calls and does not change existing settings consumers.
Future contributions apply immediately and only to the explicit current Vault.

Tauri composes the registry and UI through public SDK contracts. ActiveScreen remains
independent of Settings; Sidebar remains independent of category/section logic.
All new product plugins require Logger and follow the cleanup/logging policy.
Verify targeted contracts, ownership, navigation, bottom placement, replacement,
Vault isolation and cleanup; native visual acceptance is manual. No merge is part
of this milestone.

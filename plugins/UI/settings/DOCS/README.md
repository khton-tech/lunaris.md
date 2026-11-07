# Settings UI foundation

Purpose: bottom Sidebar entry, category navigation and one extensible Settings
active screen. Default export of `@lunaris/settings-plugin`: `lunaris.settings`.
No concrete controls, theme-engine integrations or configuration writes ship.

These exclusions describe this container plugin. Tauri now also composes the
separate [interface settings contribution](../../interface-settings/DOCS/README.md)
for Vault-local language/theme choices, using the public group/item contract.

Requires Logger, Settings/SettingsChanged 1.1, Sidebar 1.1, ActiveScreen, Components/
ComponentsChanged, Localization/LocaleChanged and Vault/VaultChanged. Host grants
`ui.dom` and `vault.access`. It provides no API/events. Subscribes to SettingsChanged,
ComponentsChanged, LocaleChanged and VaultChanged.

Registers `lunaris.settings.navigation` through Sidebar with `placement: "end"`,
and `lunaris.settings.screen` through ActiveScreen. Opening the Sidebar tab shows
categories; selecting a category activates Settings in main. The plugin registers
the orchestration roles `lunaris.settings-navigation-host` and
`lunaris.settings-host` and `lunaris.settings-group-host`, while Mantine supplies
`lunaris.settings-navigation`, `lunaris.settings-page` and `lunaris.settings-items`.
Group renderers mount through public Components roles
after the page lends stable targets. No React/Mantine is imported here.

Category selection survives panel collapse and switching active screens within one
Vault. Changing categories releases old section views. Removing contributions or
roles updates the screen; missing/failing sections show localized placeholders and
can recover. View cancellation releases owned scopes without calling closed SDK
handles. Stale navigation callbacks cannot select a category in a new Vault.

Sections receive Workspace's explicit frozen Vault context and owned view signals.
The foundation stores no values. Future settings contributors must apply changes
immediately and only to the explicit current Vault; see
[the extension contract](../../../../DOCS/reference/settings.md).

Run `npm run settings:check`, relevant Mantine/Sidebar checks and the Tauri frontend
build. Native appearance, focus and short/narrow-window acceptance remain manual;
desktop automation is prohibited.

Settings navigation/page use embedded/fill presentation. Section roles and their
fallbacks receive `presentation: { mode: "embedded", sizing: "content" }` after
custom props; sizing never depends on target classes. All embedded roots inherit
the owning surface.

The primary hierarchy is category -> group -> item. Groups share the page's
ordered heading/target infrastructure with legacy custom sections, which remain
supported for compatibility. Settings maps item type/value/options/layout/state
to the shared Mantine role; contributors no longer need a renderer or DOM grant.
The group host validates interaction values, supplies frozen `{ vaultId, signal }`
contexts, prevents duplicate pending invocations and contains callback failures.
Item removal cancels its owned context independently of siblings. Group/category
removal, switching categories, Vault transitions and view closure cancel descendant
contexts. Old callbacks cannot target replacements with a reused ID. Hiding a
retained Settings screen preserves its mounted inputs and contexts.

Workspace owns region geometry/surfaces; Settings owns group headings/targets;
Mantine owns row content, responsive internal spacing and controls. Group/item
presentation never paints a second surrounding surface. Config remains entirely
outside this container.

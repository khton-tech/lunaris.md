# Settings UI foundation

Purpose: bottom Sidebar entry, category navigation and one extensible Settings
active screen. Default export of `@lunaris/settings-plugin`: `lunaris.settings`.
No concrete controls, theme-engine integrations or configuration writes ship.

Requires Logger, Settings/SettingsChanged, Sidebar 1.1, ActiveScreen, Components/
ComponentsChanged, Localization/LocaleChanged and Vault/VaultChanged. Host grants
`ui.dom` and `vault.access`. It provides no API/events. Subscribes to SettingsChanged,
ComponentsChanged, LocaleChanged and VaultChanged.

Registers `lunaris.settings.navigation` through Sidebar with `placement: "end"`,
and `lunaris.settings.screen` through ActiveScreen. Opening the Sidebar tab shows
categories; selecting a category activates Settings in main. The plugin registers
the orchestration roles `lunaris.settings-navigation-host` and
`lunaris.settings-host`, while Mantine supplies `lunaris.settings-navigation` and
`lunaris.settings-page`. Section renderers mount through public Components roles
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

# Sidebar controller

Purpose: connect independently registered tool tabs to Workspace's left regions.
Default export: `@lunaris/sidebar-plugin`, ID `lunaris.sidebar`. This is a separate
plugin; Workspace owns only geometry/mounting and contains no tab logic.

Provides no API/events. Requires Logger, Sidebar/SidebarChanged,
Workspace@1.1, Components/ComponentsChanged and Localization/LocaleChanged.
The host grants `ui.dom`. All service access uses declared public SDK contracts.

The controller registers `lunaris.sidebar-rail` in `left-rail` and the active tool's
component role in `left-panel`. Repeating an active icon selects null and collapses
the panel. No tabs removes both contributions. Missing selected roles use a
localized unavailable placeholder; ComponentsChanged reacquires later roles.
Tool content receives Workspace context and fresh per-Vault/view scopes from
Workspace. Child registration scopes are released without SDK calls in cleanup.
Logger records readiness, missing roles and original integration failures without
titles, props or Vault data. Native tooltip/icon/focus presentation belongs to Mantine.

Tauri, the separate Sidebar tab provider, Workspace 1.1, Mantine components and
Localization/Logger are integrated. Explorer/search/document tools are not supplied;
future tools use the Sidebar API. See the [full reference](../../../../DOCS/reference/sidebar.md)
for API examples, lifecycle, keyboard behavior, overlay and manual acceptance.
Run `npm run sidebar:check` and the Tauri frontend build.

Sidebar API 1.1 supports `placement: "start" | "end"` (default start). End tabs
form a bottom group; numeric order stays local to each group. Snapshot and keyboard
order follow visual order. Updates preserve placement; existing consumers remain compatible.

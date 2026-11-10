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

## Mobile overlay integration

The existing WorkspaceLayout role owns a floating bottom action and edge-swipe
presentation at compact widths. Opening/closing that modal layer does not call
Sidebar.select: this controller keeps the selected tool and its contributed
content intact. Tab clicks still use the same public Sidebar contracts. Desktop
Escape retains the existing onDismiss behavior; mobile Escape closes only the
presentation layer. No provider or controller API changes are required.

A composed regression verifies opening, tool selection, backdrop dismissal,
reopening and stable main content through the real Workspace/Sidebar controllers.
Visual acceptance on a device remains pending: slide geometry, safe areas,
opened tool menus, touch/keyboard focus and browser edge-swipe conflicts.

Sidebar API 1.1 supports `placement: "start" | "end"` (default start). End tabs
form a bottom group; numeric order stays local to each group. Snapshot and keyboard
order follow visual order. Updates preserve placement; existing consumers remain compatible.

## Russian UI copy

English and Russian catalogs are owned by this consumer. Messages reach shared
Mantine roles through Localization/LocaleChanged and existing public component
props; no renderer translation or SDK change is required. Interface Settings
selects and persists Russian per Vault. Names and user content stay unchanged.
Run `npm run ui-localization:check` for complete keys and matching placeholders.
Native acceptance of long Russian labels, menus and narrow layouts is pending.

Sidebar contributes its localized open action through the optional MobileMenu API and opens WorkspaceSidebar. It updates availability as tabs change. See the mobile menu reference for host ordering and replacement lifetime.

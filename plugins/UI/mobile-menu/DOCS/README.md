# Mobile menu

The mobile action registry is public through @lunaris/mobile-menu. Require
api:lunaris.mobile-menu@^1.4.0 and call ctx.use(MobileMenu).register(item, owner).
Items have a canonical dotted id, already-localized nonempty label, Lucide icon,
optional integer order, optional disabled boolean and onPress callback. register
rejects duplicate IDs. update replaces a registered descriptor; list returns an
immutable ordered snapshot (order then ID). Update labels on locale changes.
Owner cancellation removes the action and renders the new list. Stale callbacks
and disabled actions do nothing. The provider logs failures with the original error.
An optional nonnegative safe-integer count shows a page outline with the number
in place of the icon. Supply a localized accessible label that includes the count.
Optional choices contain a unique id, localized label and optional title and icon.
An optional trailingAction uses the same fields and a distinct id. It renders
as its own menu item in the same row.
selectedChoiceId marks the current choice. The provider takes an immutable
snapshot and passes only a valid choice ID to onPress. Plain actions keep the
same no-argument callback.

The default provider/controller is plugins/UI/mobile-menu. It owns registration
and contributes the lunaris.mobile-menu UIKit role to Workspace 1.4's exclusive
mobile-menu region. Rendering stays in mantine-components: a horizontal row of
44px rounded icon actions. WorkspaceLayout owns floating geometry, pill surface,
scroll overflow, safe spacing and overlay placement. Embedded content is transparent.
Reference: the existing product icon rail and Owner's floating mobile panel.

Sidebar optionally consumes MobileMenu and WorkspaceSidebar to contribute its
open action. Missing menu support leaves desktop Sidebar operational. The shared
host enables the menu before Sidebar; custom hosts must register its provider
before starting contributors. Optional consumers must restart after provider
replacement. No plugin imports another plugin implementation.

WorkspaceSidebar (api:lunaris.workspace-sidebar@^1.0.0) exposes open(), close()
and isOpen(). The Workspace provider stores presentation separately from selected
tool identity; WorkspaceChanged publishes its state changes. Workspace bridges
that state to public layout props mobileOpen/onMobileOpen. Left-edge swipe uses
the same callback. No DOM ancestry or plugin ID is used to detect mobile layout.

At allocated widths <=640px, Workspace shows the mobile region and hides bottom
status content. At wider sizes the existing Status Bar and Sidebar retain their
presentation and the mobile menu is hidden. Deployment targets do not select
viewport layout. Android/iOS certification remains unadapted.

Integration: Workspace provider/controller, Sidebar contributor, Mantine roles
and shared web/desktop host are connected. Manual acceptance remains pending:
phone portrait/landscape, floating panel and opened menus in both themes,
edge swipe conflicts, keyboard/focus, many items and safe areas.

## Floating launcher and tab action

MobileMenu 1.1 items optionally declare placement: panel (default) or launcher.
Sidebar contributes a launcher action. Workspace 1.4 lends the separate mobile-launcher
region at the top left, as marked in the Owner's screenshot. The bottom mobile-menu
region retains the expandable action row. Both surfaces belong to WorkspaceLayout.
The role root uses normal containment so intrinsic action widths cannot collapse
a shrink-wrapped floating surface.

Downward main-content scrolling hides the launcher after 8px; upward scrolling
or returning to the top shows it. Scroll capture includes nested editor scrollers,
but ignores Sidebar and menu scrolling. Focused launcher controls remain visible,
and opening the overlay keeps the launcher visible. Both floating regions overlay the editor canvas without reserving top or bottom
space. The public role density prop is compact for the launcher (32px control
with 2px surface padding) and comfortable for the bottom row (44px controls).

The provider publishes each placement while it has registered actions. Active
Screen contributes Back (order 0), Forward (10), Add tab (30) and the tab
picker (40) for the mounted Vault. Sidebar contributes its drawer action at
50 and also supplies the top-left launcher. Order 20 leaves room for a future
public Search action. The picker count includes blank tabs. It opens an anchored Mantine menu using the Files
Vault switcher pattern. Its rows select tabs through the same callbacks as the
top strip. The menu lists open tabs with a close control on each closable row.
The dock's plus creates tabs. The anchored popup fits up to five rows and
scrolls internally when more tabs are open.
The compact presentation replaces the tab strip and location/history row.
The Owner's phone reference defines the dock order and horizontal rounded
tab outline. WorkspaceLayout owns
the floating surface. Mobile Menu supplies its action and Active Screen supplies
the tab list, selection and localized names.

The composed test covers the initial counter, add/close, localized labels,
selection from the menu and Vault closure. Manual acceptance covers the
top-left launcher and bottom action in the real container, both themes, portrait
and landscape, scroll gestures, keyboard focus and the opened tab list.

Both floating regions share scroll-direction visibility. The Sidebar layer and backdrop stack above both floating regions, which become inert and aria-hidden while the overlay is open. There is no main-area return button. Files and Settings explicitly close WorkspaceSidebar after successful content selection; failures preserve the panel for recovery. Tool switching itself keeps navigation available. Desktop selection remains intact. Native stacking and scroll/focus acceptance remain pending.

## XP mobile control adaptation

Reference: existing Luna Explorer toolbar and Settings caption controls. WorkspaceLayout owns the floating menu/launcher surfaces, using XP radius, menu border and surface shadow. The mobile-menu and settings-page roles own their action controls: Luna button gradients, borders, bevels, hover/pressed/disabled states and existing semantic keyboard focus. MobileMenuView now receives theme tokens explicitly, preserving transparent embedded rendering instead of relying on an ancestor for token inheritance. Compact 32px launcher and 44px bottom actions, overlay positioning, scroll hiding and Sidebar stacking are unchanged. Luna Dark uses its own palette; switching to Monochrome removes XP finishes. Manual acceptance remains pending for both XP presets, focus/hover/press/disabled states, Settings navigation, scroll and many-item overflow in the actual Workspace.

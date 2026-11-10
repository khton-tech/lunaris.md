# Mobile menu

The mobile action registry is public through @lunaris/mobile-menu. Require
api:lunaris.mobile-menu@^1.0.0 and call ctx.use(MobileMenu).register(item, owner).
Items have a canonical dotted id, already-localized nonempty label, Lucide icon,
optional integer order, optional disabled boolean and onPress callback. register
rejects duplicate IDs. update replaces a registered descriptor; list returns an
immutable ordered snapshot (order then ID). Update labels on locale changes.
Owner cancellation removes the action and renders the new list. Stale callbacks
and disabled actions do nothing; failures are logged with the original error.

The default provider/controller is plugins/UI/mobile-menu. It owns registration
and contributes the lunaris.mobile-menu UIKit role to Workspace 1.3's exclusive
mobile-menu region. Rendering stays in mantine-components: a horizontal row of
44px rounded icon actions. WorkspaceLayout owns floating geometry, pill surface,
scroll overflow, safe spacing and editor clearance. Embedded content is transparent.
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

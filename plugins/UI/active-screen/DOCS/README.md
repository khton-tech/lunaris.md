# Active screen container

Purpose: coordinate tabs and display the selected screen inside Workspace main,
preserving previously opened screen instances while hidden. Plugin `lunaris.active-screen` is exported
as the default from `@lunaris/active-screen-plugin`.

Requires Logger, ActiveScreen/ActiveScreenChanged, Workspace 1.1,
Components/ComponentsChanged and Localization/LocaleChanged. The host grants
`ui.dom`. Web and Tauri also grant `vault.access` and `filesystem.access` for
Vault, ActiveDocument, ActiveDocumentTransitioned and BeforeFileMutation. Document
tabs use these optional integrations when the providers are available.

On activation it registers the orchestration role `lunaris.active-screen-host`
through Components and one main content entry through Workspace. It provides no
additional APIs or events. It subscribes to ActiveScreenChanged, ComponentsChanged
and LocaleChanged. The document integration observes committed document transitions
and successful structural mutation completions. Every rendered host instance owns its layout, per-screen scopes
and placeholders. Workspace cancellation releases them on Vault switch or closure.

Mantine's `lunaris.active-screen` role supplies stable child targets. The controller
mounts child roles only after layout mount/update returns, passing each screen's
props plus Workspace context. Only previously selected screens are mounted.
Switching hides and makes inactive targets inert, removes hidden focus, and retains
the instance, input drafts and scroll. Null selection shows the localized empty
state. Unavailable or failed selected roles show a localized failure state; later
registration or props updates can recover. Renderer replacement can lose local
view state and is outside the retention guarantee.

Retained views receive Workspace compact-mode updates. The host forwards a
mounted active screen's explicit `mobileNavigationInHeader` prop through its
main Workspace contribution, allowing an in-page sidebar trigger to occupy the
upper navigation position without duplicating the launcher.

Consumers use only `@lunaris/active-screen`; they must not import this plugin or
manipulate its DOM. See [usage and limits](../../../../DOCS/reference/active-screen.md).
Run `npm run active-screen:check` and the Tauri frontend build. Native geometry
and focus behavior require manual acceptance; desktop automation is prohibited.

The controller supplies `presentation: { mode: "embedded", sizing: "fill" }` to
its layout, screens and placeholders after custom props. Screen roots inherit the
Workspace surface, independently of their target DOM.

Blank selections and unavailable roles publish the placeholder target directly.
One render produces one layout commit for these states. Placeholder content
updates when its target or localized copy changes. Component registry events
refresh this container for its layout, placeholder, mobile-menu or contributed
screen roles. A newly selected available role mounts after its visible target is
allocated so geometry-sensitive components can measure their initial content.
Failed mount/update still selects the failure placeholder. Tests cover commit
counts, unrelated registrations/removals, current tab callbacks and visible-target
allocation. Native paint and focus acceptance remains pending.
Compact-mode tab placement refreshes when mobile dock actions become ready.
The controller owns this presentation change directly.

## Tab interaction and ownership

The Owner's screenshot defines the two-row composition. The top row holds rounded
tabs with close icons and a trailing add button. The second row holds Back,
Forward and the current title or Vault-relative path. Theme tokens determine the
colors, spacing and geometry. The tab strip can scroll horizontally while the
add button remains visible. Workspace owns the main area's geometry and content
surface. The [Mantine role](../../mantine-components/DOCS/README.md#active-screen-role)
owns the local tab controls and their presentation. Editor and Settings own
their content inside borrowed targets.

- Opening a file fills the selected empty tab or adds a file tab. Opening a file
  with an existing tab selects it. Settings and other registered screens have
  one tab each. Selecting Settings leaves the file marked in Explorer.
- Add and a middle click on unused strip space open a new empty tab. A middle
  click on a tab closes it through the same action as its close button.
  Closing the active tab selects its right
  neighbor, its left neighbor, or an empty tab. Back and Forward visit prior tab
  selections. Closed tabs are removed from history.
- Drag a tab along the strip to reorder it. The tab moves horizontally and the
  highlighted edge indicates the insertion point. Reordering preserves the
  selected tab and visit history.
- Arrow keys and Home/End move focus across the strip. Enter or Space selects the
  focused tab. Delete closes it. Keyboard close returns focus to the selected tab.
- File changes use ActiveDocument's existing save and draft guards. Declined
  transitions keep the document open and show a localized status. Confirmed
  in-app moves and removals update affected tabs. An inactive file removed
  outside the app is dropped if opening it confirms that the path is missing.
- The tab list and history belong to the mounted Vault workspace. ActiveDocument
  restores its persisted file after reopening a Vault.

At compact widths, the optional MobileMenu 1.6 integration contributes Back,
Forward, Add tab and the tab picker for the mounted Active Screen layout. The
picker's horizontal rounded outline shows the Vault tab count, including blank tabs. Pressing it
opens a localized menu using the same tab selection and document guards as the
strip above the editor. Workspace owns the lower floating surface and the
Mantine Mobile Menu role owns the anchored menu. The Owner's
highlighted bottom panel and the Files Vault switcher are the references.
The compact menu marks the current tab with the same leading accent line as
the Files panel and renders a trailing close control on each row. The final
blank tab's close control is disabled. The dock's plus invokes the existing
tab creation operation. Workspace reports compact presentation through
its public context. Active Screen suppresses both top rows in that mode when
the dock actions are available. Desktop retains the full strip, history and
reordering. See
[mobile menu registration](../../../../DOCS/reference/mobile-menu.md).
The Owner's annotated compact list is the reference for the narrower menu
and five-row scrolling viewport. The mobile list uses the same reorder operation
as the desktop strip. Dragging vertically changes order while preserving the
current tab and its visit history. Native acceptance covers touch dragging,
edge scrolling, selection and close feedback in both themes.

## Russian UI copy

English and Russian catalogs are owned by this consumer. Messages reach shared
Mantine roles through Localization/LocaleChanged and public component props.
Interface Settings
selects and persists Russian per Vault. Names and user content stay unchanged.
Run `npm run ui-localization:check` for complete keys and matching placeholders.
Native acceptance of long Russian labels, menus and narrow layouts is pending.

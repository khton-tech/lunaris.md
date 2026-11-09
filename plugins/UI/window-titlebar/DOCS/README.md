# Window titlebar

Purpose: render and operate the main window's caption through public SDK roles.
Requires Logger, Window/WindowChanged, Slots, SlotDom, Components/ComponentsChanged
and Localization/LocaleChanged. Grants: `window.control`, `ui.dom`. No Tauri,
React, Mantine or host imports occur here. No APIs/events are provided: window
operations are provided by the separate Window provider, not the view controller.

The plugin allocates an order -100, non-growing root caption slot, independently
of startup, Vault selection and Workspace screens. Slots owns ordering/width;
the `lunaris.window-titlebar` UIKit role owns caption surface, height and controls.
The controller explicitly requests standalone/content presentation because this
is an independent shell region. Its owned root paints the current theme page
background and the titlebar surface fills its allocated row edge to edge with
square corners in every theme. This is the Owner-requested flat titlebar exception
to the floating card treatment for other shell regions. It does not repaint the
host or other slots. Native-style windowChrome themes may still supply their own
caption colors and control finishes.
The controller owns localization, native state and callbacks only. It never paints,
reparents or resizes another plugin's region. See the [UIKit role](../../mantine-components/DOCS/README.md#window-titlebar-role).

Native chrome is acquired only after a successful mount. The owned scope restores
native decorations on stop, render failure or role loss. Replacement remounts a
fresh view before reacquisition. Unsupported browser/mobile capabilities leave
native/platform chrome intact. The title comes from Window.snapshot(); any plugin
with the public permission may call Window.setTitle() without reaching this view.
The initial title remains Lunaris. Automatic Vault/document naming is not supplied.

Integration: Tauri composition registers the driver/provider and activates this
plugin above all product screens. Window.close requests ordinary closure through
the existing host/Vault/ActiveDocument save gate. Themes reach the role directly
through UIKit, while localization and window-state events update its public props.
Reference: Owner's highlighted native Lunaris caption; theme-derived controls
replace OS styling. See [window contracts](../../../../DOCS/reference/window.md).

Manual acceptance remains pending: both Monochrome and Windows XP Luna themes,
startup/selector/Workspace transitions, long titles, narrow/short windows, hover,
keyboard focus, minimize/maximize/restore, double-click, drag, edge resize/snap,
close with pending save/conflict, role/plugin disable and recovery fallback.
Automated desktop control is prohibited; the Owner performs these native checks.

## Russian UI copy

English and Russian catalogs are owned by this consumer. Messages reach shared
Mantine roles through Localization/LocaleChanged and existing public component
props; no renderer translation or SDK change is required. Interface Settings
selects and persists Russian per Vault. Names and user content stay unchanged.
Run `npm run ui-localization:check` for complete keys and matching placeholders.
Native acceptance of long Russian labels, menus and narrow layouts is pending.

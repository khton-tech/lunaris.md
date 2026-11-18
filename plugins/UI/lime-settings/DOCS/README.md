# Lime Settings

`@lunaris/lime-settings` exports `lunaris.lime-settings`. It consumes public Lime,
Settings and Localization APIs, subscribes to LimeChanged/LocaleChanged, and
requires Logger for readiness and meaningful action outcomes/failures. It provides
no API. Registrations/catalogs are owned by ctx.signal. It imports no engine
implementation, host, DOM, React or Mantine code.
The controller declares runtime.manage to consume Lime through the ordinary SDK
permission and dependency model. In the package preview, the user sees that
enabled packages run with the application's access.

The controller registers the Plugins category in Settings and mounts the public
`lunaris.lime-settings` component role in its Vault plugins section. It maps
immutable engine state into localized props, translates operation failure codes
and selects metadata translations by locale and base language. English and
Russian catalogs are supplied. The native picker call runs before the first
`await` to preserve user activation.

Settings owns the category heading and section geometry, surface and scrolling.
Search matches installed third-party plugins by name and ID and is omitted
when the list is empty. The overview shows the controlled safe-mode switch,
local package installation and the total third-party installation count.
The count includes disabled plugins and is independent of the current search.
Without a Vault, the section shows the unavailable state.

Rows show the plugin name, version, runtime state and an enablement switch where
available. The third-party row menu contains Details, Update and Remove, with
Retry available for recovery.

Add plugin opens selection, then an inert metadata preview. Confirmation chooses
Install or Update explicitly according to the installed ID. Per-row Update checks
the selected ID before presenting confirmation. Cancellation discards the ticket.
Install disabled confirms a new package without evaluating it, so its dependencies
can be configured before activation.
Unsupported platform metadata appears as a warning before confirmation. Details
include ID, author, platforms, languages, repository, provided/required contracts
and custom fields. Metadata remains escaped plain text.

Preview and Details display errors in the open dialog. On short screens the
whole dialog scrolls so its tabs, metadata and actions stay reachable. Package
switches use the same themed track, thumb and focus indicator as Settings items.

The package preview also lists compatible providers, their runtime states and
requirements reachable through them. If the graph changes before confirmation,
Lime requests a fresh preview. Removal confirmation shows affected active plugins.

Opening Details loads `Lime.plan(id)` and shows direct requirements, compatible
provider versions/states and affected plugin IDs when other packages are affected.
Details reuses the installation dialog's centered shell and Overview and
Dependencies tabs. Overview aligns metadata labels and values. Dependencies
hosts the refresh action and shows declared requirements when the live plan is
unavailable. An already selected sole provider is shown as text. When a change is
possible, the shared themed SettingsSelect sits beside Apply provider, which
submits the plan revision. Escape closes an open provider menu before closing
the dialog. Closing Details returns focus to its row action.
Missing providers direct users to Add plugin for an explicitly selected local
package. Disabled providers are not enabled implicitly; running consumers require
an enabled choice. Refresh dependencies obtains a new revision. Engine failures
are localized and successful changes refresh the plan. Vault changes clear it.

The optional `vaultId` prop scopes view state to the current Vault. The page
manages third-party packages. Vault composition remains available through the
[Lime SDK](../../../../DOCS/reference/lime-runtime.md#vault-composition).

Enable, disable, retry, update and safe-mode restore use the public Lime API.
Remove opens inline confirmation with explicit choices to keep or delete plugin
data. Cancelling returns focus to the row menu trigger. During pending removal,
Retry uses the previously committed data choice. Empty, unavailable, busy,
failed and cancelled operations have explicit states. A Vault change clears the
local preview. Long metadata wraps and labels update on locale changes.

## Ownership, reference and verification

Workspace and Settings own the outer regions, navigation and scrolling. Lime
contributes content to the Settings section through the existing Lime, Settings
and Mantine Components SDK contracts. The Mantine role owns its internal spacing,
themed controls and package dialogs. Preview and Details share a centered modal,
Overview and Dependencies tabs and scroll behavior. The preview footer contains
the platform warning and confirmation. The Details footer contains the close
action and operation errors.

Lunaris Settings item rows, quiet actions and shared Switch controls are the
product references. The Owner's Obsidian screenshot informed the overview and
manager split. Local package installation and the existing safe-mode callback
serve the overview. VS Code's per-extension management menu informed the row overflow.
[Obsidian community plugins](https://obsidian.md/help/community-plugins),
[VS Code extension management](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_manage-extensions).

Mantine's searchable list composition and Menu control inform the search and
themed, keyboard-operable overflow. [Mantine UI tables](https://ui.mantine.dev/category/tables/),
[Mantine Menu](https://mantine.dev/core/menu/#accessibility).

The composed test fixture mounts the controller with Settings, Workspace and
the shared Mantine role for package lifecycle, dependency selection, safe mode,
third-party-only listing and theme coverage. Application-host development attachment remains
pending.

Native visual acceptance remains pending. In real Settings on a narrow and
short window, check long Russian labels, light and dark themes, menu
positioning and keyboard focus when opening Details or cancelling removal.
Check the native file picker and its cancellation, safe-mode switch and recovery.

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
With the composition adapter, the shared Mantine role presents Third-party and
Built-in tabs. Search matches names and IDs in the current list and is omitted
when that list is empty. The third-party toolbar exposes Add plugin as its
primary action, including for an empty Vault. Without a Vault, the section shows
the unavailable state. The page's actions menu contains the option to reopen
without third-party plugins. When safe mode is active, its status and the option
to resume third-party plugins are visible above the list.

Rows show the plugin name, version, runtime state and an enablement switch where
available. The third-party row menu contains Details, Update and Remove, with
Retry available for recovery. Built-in rows expose Details directly.

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

The Built-in tab is available on hosts with the composition adapter. Each
eligible row has a switch and uses the same Details dialog and themed dependency
picker as a third-party package. The picker can stage an explicit provider or
clear that override with Host default.
Protected rows display read-only dependency details. Changes to built-in switches
and providers are staged together. Disabling a built-in clears its own provider
overrides from the draft. Apply composition submits the whole profile
with its original revision. Discard changes clears the draft. Restore defaults
stages an empty profile, including in safe mode. Vault changes discard the draft.

The `lunaris.lime-settings` role accepts an optional `composition` object with
metadata rows, draft and customized flags, and callbacks for toggling a built-in,
applying, discarding and restoring defaults. Built-in rows supply `mutable` and
their staged `bindings` for the Details picker. The optional `vaultId` prop
scopes local view state to the current Vault. The controller owns the draft,
Vault, revision and SDK calls. The role owns the list, presentation and keyboard
interactions within the same Settings section.

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
product references. Obsidian's installed-plugin switch and name search informed
the list. VS Code's per-extension management menu informed the row overflow.
[Obsidian community plugins](https://obsidian.md/help/community-plugins),
[VS Code extension management](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_manage-extensions).

Mantine's searchable list composition and Menu control inform the search and
themed, keyboard-operable overflow. [Mantine UI tables](https://ui.mantine.dev/category/tables/),
[Mantine Menu](https://mantine.dev/core/menu/#accessibility).

The composed test fixture mounts the controller with Settings, Workspace and
the shared Mantine role for package lifecycle, dependency selection, built-in
composition and theme coverage. Application-host development attachment remains
pending.

Native visual acceptance remains pending. In real Settings on a narrow and
short window, check both tabs, long Russian labels, light and dark themes, menu
positioning and keyboard focus when opening Details or cancelling removal.
Check the native file picker and its cancellation, safe-mode status and recovery,
and staged built-in changes through Apply composition, Discard changes and
Restore defaults.

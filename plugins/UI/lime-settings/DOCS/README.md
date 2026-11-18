# Lime Settings

`@lunaris/lime-settings` exports `lunaris.lime-settings`. It consumes public Lime,
Settings and Localization APIs, subscribes to LimeChanged/LocaleChanged, and
requires Logger for readiness and meaningful action outcomes/failures. It provides
no API. Registrations/catalogs are owned by ctx.signal. It imports no engine
implementation, host, DOM, React or Mantine code.
The controller declares runtime.manage to consume Lime through the ordinary SDK
permission and dependency model. In the package preview, the user sees that
enabled packages run with the application's access.

The controller registers Settings / Third-party plugins, with a custom section
using the public `lunaris.lime-settings` component role. It maps immutable engine
state into localized props, translates operation failure codes and selects metadata
translations by locale/base language. English and Russian catalogs are supplied.
The native picker call runs before the first await to preserve user activation.

The Settings page owns the category heading and its Installed plugins section.
The shared Mantine role uses the section's surface and presents Add plugin as the
primary action. An empty Vault shows the empty message and Add plugin. Without a
Vault, the section shows the unavailable message. The safe-mode action is
shown when packages exist or safe mode is active.

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
the dialog. Closing Details returns focus to its package row action.
Missing providers direct users to Add plugin for an explicitly selected local
package. Disabled providers are not enabled implicitly; running consumers require
an enabled choice. Refresh dependencies obtains a new revision. Engine failures
are localized and successful changes refresh the plan. Vault changes clear it.

On a host with the composition adapter, Built-in plugins opens built-in rows
inside the same Settings section. Each eligible row has a switch and uses the
same Details dialog and themed dependency picker as an installed package. The
picker can stage an explicit provider or clear that override with Host default.
Protected rows display read-only dependency details. Changes to built-in switches
and providers are staged together. Disabling a built-in clears its own provider
overrides from the draft. Apply composition submits the whole profile
with its original revision. Discard changes clears the draft. Restore defaults
stages an empty profile, including in safe mode. Vault changes discard the draft.

The `lunaris.lime-settings` role accepts an optional `composition` object with
metadata rows, draft and customized flags, and callbacks for toggling a built-in,
applying, discarding and restoring defaults. Built-in rows supply `mutable` and
their staged `bindings` for the Details picker. The controller owns the draft,
Vault, revision and SDK calls. The role owns the collapsible list, presentation
and keyboard interactions within the same Settings section.

Enable/disable, retry, update and safe-mode restore call engine APIs only. Remove
offers explicit retain/delete-data actions. A pending removal exposes Retry using
the already committed data choice, never a misleading new choice. No Vault/busy,
empty, failed and cancelled operations have explicit states. A Vault change clears
the local preview. Long metadata wraps. Labels update on locale changes; no native
dropdowns or provider-specific UI imports are introduced.

## Ownership, reference and verification

Workspace and Settings own region geometry, surfaces, corners, navigation and
overflow. Lime contributes embedded intrinsic-height content; the Mantine role
owns its controls and internal spacing. It adds no outer card/background and never
inspects or styles another region. The product reference is existing Settings item
rows, quiet action buttons and shared Switch controls. Mantine UI
[buttons](https://ui.mantine.dev/category/buttons/) and
[tables](https://ui.mantine.dev/category/tables/) and
[inputs](https://ui.mantine.dev/category/inputs/) were consulted; no gallery runtime
or copied shell was added. The Mantine role owns the package preview modal and
its Overview and Dependencies tabs. Details uses the same modal surface, tab
layout and scroll area. The platform warning and installation confirmation stay
in the preview footer. Details puts its close action and operation errors in the
footer. Removal confirmation remains in its installation row.

Composed tests mount the actual controller, Settings, Workspace and Mantine role.
They prove preview-before-install, metadata escaping/dependency disclosure,
platform warning, confirmation, retained-data removal, switch operation, preview
focus/return, Russian metadata/cancel, and transparent embedded roots across Luna
light/dark and Monochrome. Shared UIKit regression checks pass separately.

Native visual acceptance remains pending: real file dialog/gesture/cancel,
light/dark control sizing and focus, long metadata/locales, removal/recovery states
and narrow/short Settings. Automated DOM tests do not establish native geometry.
Engine/Settings/UIKit integration is tested and included in normal shared host
composition. Provider-choice integration is implemented and tested with an opened
Mantine menu, disabled candidates, explicit application and revision forwarding.
Native acceptance and application-host development attachment remain pending.

The composed Settings test verifies built-in row restrictions, the opened
provider menu, staging a provider and disabling a built-in without a runtime
call, one revision-checked commit, and restoring defaults. Manually check the
built-in list at narrow and short viewport sizes in English and Russian. Open
Details with the keyboard, choose a provider, close the dialog, toggle a built-in
and inspect keyboard focus and restored defaults after applying.

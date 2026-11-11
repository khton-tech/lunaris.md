# Lime Settings

`@lunaris/lime-settings` exports `lunaris.lime-settings`. It consumes public Lime,
Settings and Localization APIs, subscribes to LimeChanged/LocaleChanged, and
requires Logger for readiness and meaningful action outcomes/failures. It provides
no API. Registrations/catalogs are owned by ctx.signal. It imports no engine
implementation, host, DOM, React or Mantine code.
The host grants runtime.manage to this built-in UI to consume Lime; installed guest
code cannot acquire that management facade through its scoped SDK bridge.

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
Unsupported platform metadata appears as a warning before confirmation. Details
include ID, author, platforms, languages, repository, provided/required contracts
and custom fields. Metadata remains escaped plain text.

The package preview also lists compatible providers, their runtime states and
requirements reachable through them. If the graph changes before confirmation,
Lime requests a fresh preview. Removal confirmation shows affected active plugins.

Opening Details loads `Lime.plan(id)` and shows direct requirements, compatible
provider versions/states and affected plugin IDs. The shared themed SettingsSelect
offers candidates; a separate Apply provider action submits the plan revision.
Missing providers direct users to Add plugin for an explicitly selected local
package. Disabled providers are not enabled implicitly; running consumers require
an enabled choice. Refresh dependencies obtains a new revision. Engine failures
are localized and successful changes refresh the plan. Vault changes clear it.

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
or copied shell was added. Confirmation stays inline within the section.

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

# Product backlog

## Vault selector

Status: IMPLEMENTED on 2026-11-05; native visual acceptance remains manual.
The runner now hands off to a dedicated selector after loaded. Recent Vaults
occupy the left third; create/select cards and ASCII art occupy the right two
thirds. Components Kit supplies themed controls with Lucide icons; the consumer
uses public Slots, Components, Localization, VaultLocations and VaultHistory APIs.
Browse/Next, name validation, cancellation, retry, duplicate-submit protection,
history reopening and shutdown are integrated. A successful open displays the
active Vault name; an editor/workspace shell remains deferred. See
[selector usage and manual acceptance](../plugins/UI/vault-selector/DOCS/README.md).

## Component provider

Status: IMPLEMENTED (pending local verification run) on 2026-11-05. The replaceable
provider registers components from component set plugins under shared role IDs
(for example `lunaris.button`), mounts them into consumer-supplied DOM targets,
tracks instance ownership and publishes registration changes. It ships no
components or styles. See [the component provider reference](reference/components.md).

The initial `LunarisComponentsKit` is implemented with `lunaris.startup-screen`,
registered through this provider and following the active theme via `Themes`.

## Startup presentation prerequisites

Status: IMPLEMENTED on 2026-11-05. The SDK Startup API/event and replaceable
provider expose host milestones. Tauri mounts its isolated surface before product
activation, with fallback, retry and shutdown cleanup. The initial Components Kit
supplies a themed ASCII-art/status screen through the component registry.
See [startup progress](reference/startup.md) and
[the kit](../plugins/UI/components-kit/DOCS/README.md).

## Lunaris Runner

Status: IMPLEMENTED on 2026-11-05. The runner reads startup configuration before
rendering, displays the existing ASCII artwork and actual host milestones through
the shared component role, then retains System Loaded without timers/actions.
Config, Localization, Slots, Components, Startup and required Logger are integrated.
Separate theme-settings selects the configured theme (Dark by default); Light and
Dark provide dedicated startup-screen component tokens. See
[runner usage, configuration and manual acceptance](../plugins/UI/lunaris-runner/DOCS/README.md).

Local evidence: runner checks passed 66 targeted tests; theme/settings/component
checks passed 69 targeted tests, including overlapping host regressions. These
are separate runs, not a combined unique-test count. Native WebView appearance,
scrolling and sizing remain subject to manual acceptance.

## Base theme engine

Status: IMPLEMENTED on 2026-11-05; on 2026-11-06 the Owner replaced the original
Lunaris Light/Dark palettes with Monochrome. Shared geometry and typography remain. The engine registers
descriptions through the replaceable theme provider, without default selection or
rendering. See [the base theme reference](reference/base-theme.md).

Next UI work: component manager and the standard component set. Those consumers
will apply theme roles to actual components and undergo visual acceptance.

## Theme provider

Status: IMPLEMENTED on 2026-11-05 as the base for a separately designed theme engine.
The replaceable SDK provider accepts engine-owned descriptions, exposes immutable
geometry/color/typography/custom data, selection, updates and owner-scoped removal.
It contains no built-in themes, palettes, required tokens or rendering behavior.
See [the theme provider reference](reference/themes.md).

The separate base theme engine is now implemented. Persistence and theme-selection
UI are deferred. Component management and the standard component set follow.

## UI slots

Status: IMPLEMENTED on 2026-11-05 before the first visible product UI plugins.
The replaceable provider allocates scoped, nested, ordered regions through SDK
contracts. A separate DOM driver supplies resilient flex targets and a permissioned
browser rendering bridge. Tauri composes both with its independent recovery shell.
See [the slot reference](reference/slots.md) for APIs, ownership and current limits.

The theme provider and base theme engine are now implemented separately. Next UI
responsibilities: component manager and the standard component set. Slots do not
own those services.

## Localization

Status: IMPLEMENTED on 2026-11-05 before product UI development.
The replaceable service provides English-first, per-plugin catalogs with scoped
ownership, interpolation, English fallback and locale-change events through SDK
contracts. Only English is shipped; language selection UI, persistence, ICU and
language-pack distribution are deferred. Existing system plugins have only
technical logs/errors, which stay English and independent of localization.
The host recovery shell retains its standalone English dictionary.
See [the localization reference](reference/localization.md).

## Vault Manager

Status: IMPLEMENTED on 2026-11-05, following separate Owner authorization after
the filesystem milestone. See the [Vault Manager reference](reference/vault.md).

Filesystem dependency: [provider and Tauri driver](reference/filesystem.md) are
implemented, including owned roots and coordinated closure. Application configuration
directory access is also available through [SDK storage contracts](reference/application-storage.md).

Own Vault context and lifecycle: open, expose the active Vault, switch and close;
publish SDK events for these changes. Start with one open Vault. Delegate root
selection/attachment and file operations to the filesystem provider. File APIs
must continue to receive an explicit Vault ID and a Vault-relative path, never
implicitly resolve the active Vault or expose native absolute paths.

Coordinate closure by rejecting new work and awaiting in-flight operations before
releasing the root and watchers. Unsaved-document decisions belong to the future
document layer. Recent-Vault history, session restoration, tabs and per-Vault
settings were initially deferred. Per-Vault settings are now implemented by the
separate [config manager](reference/config.md). Use mandatory logging and SDK ownership.

Acceptance: opening/closing emits documented events; switching cannot redirect an
in-flight save; closed IDs reject new operations; consumers access context through
SDK contracts without depending on driver or host internals.

## Config Manager

Status: IMPLEMENTED on 2026-11-05 after completing the storage/Vault prerequisites.
Global application config and `.lunaris/config.toml` expose per-plugin namespaces
through SDK read/get/set/remove methods. Effective reads prioritize local values;
explicit writes, version checks and serialized mutations preserve unrelated data.
See [the config reference](reference/config.md) for format, errors and limits.

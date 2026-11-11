# Shared application host

`@lunaris/application-host` owns HostSession, recovery view, slot surface and shared
product composition for browser and Tauri. Platform plugins are supplied only by
trusted host composition. Product plugins communicate through public SDK contracts.
The Tauri session/slots modules re-export this runtime for compatibility.

The browser uses an IndexedDB device-config backend and the remote backend. Tauri
supplies the native backend in backendOnly mode and IndexedDB for drafts only.
Filesystem Router is the sole standard driver provider in both compositions.
Local app config remains independent from account authorization and remote roots.

Both hosts compose account access, Vault/Config/History, Workspace, Sidebar,
Explorer, ActiveDocument/ActiveScreen, Editor, Settings, Themes and Localization.
The optional editor/files/settings feature profile controls those UI entrypoints;
SDK dependency validation remains the kernel's responsibility. Host grants are
filtered to registered plugins. Platform extensions declare their own grants.

The Lime runtime adapter grants both required and optional declared permissions
before initial activation and replacement, without a permission prompt. Undeclared
permissions remain denied. These grants do not bypass the isolated execution
broker's captured-Vault/native authority restrictions.

The adapter's [dependency planning contract](../../../DOCS/reference/lime-runtime.md)
exposes immutable compatible candidates, affected consumers and revisions. Explicit
provider changes delegate to kernel graph rebinding; stale plans are rejected.
Persistent engine choices and product selection controls remain separate work.

The host owns viewport and recovery geometry. Mantine roles own product surfaces;
embedded views preserve their containers. Recovery is host-owned and remains
available when product services fail.

The shared browser shell applies safe-area insets inside its border-box dynamic
viewport, matching the Tauri shell. Product layout roles position floating controls
inside that safe region and do not add a second device inset. Device verification
of portrait/landscape cutouts and the virtual keyboard remains pending.

Callouts are enabled alongside the editor through the independent
`@lunaris/callouts` plugin with `ui.dom`. It consumes EditorExtensions provided by
Text Editor, so dependency startup orders the editor before the contribution.
The existing Mantine component set supplies `lunaris.callout-header`. Web and
desktop share this composition; a feature set without editor omits both plugins.
See [usage and integration](../../../plugins/UI/callouts/DOCS/README.md).

## Provider replacement

Trusted extensions may declare excludeBuiltins (plugin IDs) and selections (consumerId, kind, contractId, providerId). Exclusions remove bundled definitions and their entrypoints/grants while retaining explicitly supplied extensions, including same-ID replacements. Supply replacement entrypoints/grants explicitly. The host applies selections through the public kernel API before activation. Required dependency validation stays authoritative; excluding required navigation without a replacement is invalid. Files remains a required product profile until Vault navigation has another owner.

Runtime recovery distinguishes failed operations from lost entrypoints and unsafe cleanup. Caught API/hook/event failures and unused optional-provider failures remain kernel diagnostics and do not tear down healthy views. Both product compositions install a public-SDK Vault close bridge. Fatal recovery attempts that gate before aborting; a refused/thrown gate retains live buffers, records APPLICATION_RECOVERY_BLOCKED and blocks host relaunch until a guarded close succeeds. Successful preservation is recorded before teardown. This is preservation through live services, not an SDK call after abort or a guarantee against process termination.

## Awaited preparation integration

Shared composition starts startup-provider and theme-settings first, awaits the preparation controller after all entrypoints, and mounts the product surface only after preparation. Existing static host loading UI stays visible. Custom early-mounted host definitions remain supported. Vault lifecycle preparation follows runtime settlement through public contracts. Failure/cancellation retain existing recovery and save-guard behavior; synthetic host tests are not native paint acceptance.

Healthy host monitoring reuses its kernel inspection for publication. Hidden recovery UI updates visibility only and skips snapshot serialization and table rebuilding; fault detection remains active. A regression verifies twenty healthy notifications perform no recovery serialization, while fallback immediately renders its diagnostics.


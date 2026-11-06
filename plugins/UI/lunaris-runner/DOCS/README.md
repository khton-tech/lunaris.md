# Lunaris Runner

Before this plugin activates, Tauri presents a matching host-owned boot surface
using the same artwork resource. Recovery diagnostics remain hidden during normal
startup and retries. The boot surface is behind the early product surface and
disappears when startup completes; it does not introduce a separate normal screen.

Purpose: present startup progress using the supplied ASCII artwork. Standalone
composition retains `System Loaded`; Tauri releases it for the Vault selector.
The plugin has no navigation, timers, artificial progress,
minimum display duration or post-start actions. It does not start other plugins.

## Composition and configuration

Create the plugin with `createRunner({ art, hideWhenLoaded? })` from `@lunaris/runner`.
`hideWhenLoaded` defaults to false. Tauri sets it to true and starts the
[Vault selector](../../vault-selector/DOCS/README.md) as the post-startup surface.
On loaded, the runner releases its owned child scope, removing both the loading
component and its layout slot; it never manipulates the selector's DOM. Tauri
supplies the existing `resources/ascii_art.txt` contents at its composition
boundary; the runner neither imports host files nor performs filesystem I/O.
The plugin ID is `lunaris.runner` and its slot is `lunaris.runner.screen`.

Before registering its catalog, creating a slot or mounting content, activation
awaits `Config.read(ctx.pluginId)` and validates settings. Effective config uses
the active Vault override if one exists, otherwise global config. The initial
desktop startup opens no Vault selection dialog and uses the global config.

```toml
[plugins."lunaris.runner"]
showDetails = true

[plugins."lunaris.theme-settings"]
theme = "lunaris.base-theme-engine.monochrome"
```

`showDetails` is optional and defaults to `true`. False hides the milestone detail
while preserving the loading/loaded status and logo. Wrong types and failed reads
fail activation rather than silently ignoring malformed configuration. Defaults
are not written back; unrelated settings are preserved. Restart to reread settings.

Theme preferences belong to the separate
[theme-settings plugin](../../theme-settings/DOCS/README.md), which runs before
the runner. Light, Dark and compatible registered third-party descriptions use
the same public Themes contract. The runner never selects or styles a theme.

## SDK integration

All required contracts are version `^1.0.0`:

| Contract | Use |
|---|---|
| `api:lunaris.logger` | Activation, readiness, loaded milestone, degradation and original failures. |
| `api:lunaris.config` | Read startup namespace before rendering. |
| `api:lunaris.localization` | Register an owned English-first catalog and resolve UI strings. |
| `api:lunaris.slots` | Allocate an owned growable root child. |
| `api:lunaris.slot-dom` | Borrow its render target without changing structural styles. |
| `api:lunaris.components` | Mount/update the `lunaris.startup-screen` role. |
| `api:lunaris.startup` | Read the current startup snapshot after subscribing. |
| `event:lunaris.startup-changed` | Follow real host milestones, ignoring older sequences. |
| `event:lunaris.locale-changed` | Resolve current copy again after a locale change. |
| `event:lunaris.components-changed` | Release stale handles and mount a compatible replacement role. |

Requires `config.access` and `ui.dom`. It provides no callable API or events.
Consumers do not import the kit, theme engine, kernel or native driver. Artwork,
localized logo label, status and optional detail are passed as component props.
The kit applies themes and owns safe DOM rendering, responsive containment and
accessible status announcements. English is shipped; all visible/accessible copy
is in the localization catalog, with normal service fallback for other locales.

Milestones describe the current host entrypoint, including its dependencies.
The runner can display milestones after its own dependencies/configuration have
become available. Earlier foundational startup is still presented by the host's
independent System view; the runner does not fabricate or replay those stages.
On a fast startup, `System Loaded` may appear immediately. No duration is added
to make intermediate states artificially visible. Additional product entrypoints
should be placed after the runner to display their activation progress.

`loaded` clears the milestone detail. Theme/localization/component replacement
events can still update the retained screen; there is no polling or background
work initiated by the runner. Missing component roles are logged as recoverable
degradation and mounted once registered; later registration uses the newest
startup status. Allocation, target or rendering failures are logged and propagate
through SDK diagnostics to host recovery. The host owns failure presentation when
product scopes have stopped.

Scope closure releases the slot, component, catalog and subscriptions. There are
no SDK/Logger calls in runner cleanup, and recovery creates fresh surfaces.

## Verification

Run `npm run runner:check`. Tests cover read-before-render, validation and denied
permissions, the real ASCII artwork, current milestones, Light/Dark application,
detail suppression, locale fallback, live themes, role replacement, rendering
failures and successful recovery. Host integration uses the real Config Manager,
TOML codec, filesystem provider and Tauri driver with an in-memory native transport;
existing settings are read without writes or opening a Vault dialog.

Run `npm run theme-settings:check` for theme selection and shared component token
coverage, and `npm run build --workspace @lunaris/tauri` for the frontend bundle.
Native WebView appearance is not verified by JSDOM. Manual acceptance: run
`npm run tauri:dev`; confirm the logo and System Loaded, switch between Light/Dark
through startup config and restart, resize to a narrow/short window, and check
full-window product rendering without a host header, plus recovery after a failure. Desktop automation
is prohibited by repository policy and is not used.

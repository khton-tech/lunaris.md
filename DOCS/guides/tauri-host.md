# Tauri host and independent recovery shell

Normal desktop startup presents the runner (ASCII logo/loading) followed by the
Vault selector. Before plugin services are available, a host-owned static surface
uses the same `resources/ascii_art.txt` artwork and default dark runner appearance.
Vite injects the current resource into both dev and packaged HTML; the native
window and HTML background use `#11151C` to avoid an initial white paint. This
fixed boot appearance is replaced by the configured theme once services are ready.
The boot surface stays behind the early application surface until startup finishes,
so an initially empty slot surface does not expose diagnostics or a blank page.
Recovery remains hidden during idle/start/retry and appears on actual failure;
standalone host sessions without this boot surface retain their diagnostic UI.
Native first-frame behavior remains a manual acceptance check.

Recovery button, hover, focus, typography and diagnostic styles are scoped beneath
`#system-root`. They must never style product controls mounted in application-root;
product interaction states belong to the active theme and Components Kit.

The first application target is Tauri 2 on Windows. The existing TypeScript kernel
runs in its WebView; Rust supplies the native window and packaged assets. No Node
sidecar or Rust rewrite of the kernel is added. Product services include the
[Logger and DevTools sink](../reference/logging.md) and the
[Vault-scoped filesystem provider/driver](../reference/filesystem.md).
The host also starts the [localization service](../reference/localization.md)
alongside Config Manager. Recovery copy remains in a standalone English catalog
and works when product localization is unavailable.

The host also starts the [slot provider and DOM driver](../reference/slots.md).
Its view adapter mounts the isolated product surface only after successful plugin
startup. The surface remains empty until product UI consumers are introduced;
System/recovery controls remain host-owned and available independently.

The [theme provider](../reference/themes.md) starts as an empty registry; the
separate [base theme engine](../reference/base-theme.md) then registers Lunaris
Light and Lunaris Dark through SDK contracts. Startup selects neither theme.
No visual styling is supplied by the host composition or registry.

## Architecture and responsibilities

Required: launch the kernel in Tauri, retain a minimal diagnostic interface when
application plugins fail, and offer explicit retry and plugin exclusion.

Existing: public kernel registration/start/stop, immutable inspection, diagnostics,
dependency resolution and SDK ownership. These operations are sufficient for the
host's recovery responsibility; no SDK extension is required for this milestone.

New: `hosts/tauri` contains the native host, browser scheduler, application-session
controller, built-in English messages and monochrome system view. The fallback is
host infrastructure, independent of product UI, themes and localization plugins.
`packages/kernel` remains platform-neutral. Host management comes exclusively from
the public kernel package; product plugins continue to use the public SDK.

The application composition point is
`hosts/tauri/src/application.ts`. It installs `lunaris.logger` and
`lunaris.dev-tools-logger`, `lunaris.filesystem-provider` and
`lunaris.tauri-filesystem`, `lunaris.vault-manager` and `lunaris.config-manager`.
Config manager is the entrypoint; its Vault/filesystem/logging chain starts
automatically. See [Vault Manager](../reference/vault.md) and
[config manager](../reference/config.md). No product view is installed.
A fresh desktop launch shows these six plugins in the system screen; the console
displays the artwork and service readiness records. The sink definition survives
retries, so the artwork prints once per page load. A window reload starts a new
banner lifetime. No Vault is selected or native dialog opened automatically.

## Commands

Install root dependencies with `npm ci`, then use:

```sh
npm run tauri:check
npm run tauri:build
npm run tauri:dev
```

- `tauri:check` runs targeted host runtime/DOM/type/boundary checks, builds frontend
  assets, checks Rust formatting and runs locked native compilation checks.
- `tauri:build` runs targeted checks and builds a Windows debug executable with
  embedded frontend assets. It creates no installer and launches no window. The
  Windows output is `hosts/tauri/src-tauri/target/debug/lunaris-desktop.exe`.
- `tauri:dev` opens the actual desktop window with the local frontend development
  server. Run this manually for visual and native event verification.
- `npm run web:dev --workspace @lunaris/tauri` serves only the frontend for manual
  browser inspection. It is not evidence of native Tauri execution.

Native prerequisites are Rust/MSVC C++ build tools and WebView2; see the official
[Windows prerequisites](https://v2.tauri.app/start/prerequisites/). The toolchain is
pinned in `hosts/tauri/src-tauri/rust-toolchain.toml`; npm and Cargo lockfiles record
dependencies. The native builder uses the documented
[Vite integration](https://v2.tauri.app/start/frontend/vite/).

## Composition boundary

`composeApplication(target)` is a **trusted host composition function**, loaded
through a guarded asynchronous import after the system view is mounted. It returns
an `ApplicationDefinition`:

- `plugins`: SDK-created definitions to register.
- `entrypoints`: root plugin IDs to start; dependencies start through the kernel.
- Optional `grants`: trusted plugin-ID-to-permission-list map, applied after
  registration and before starting plugins. Undeclared grants fail; excluded
  plugins are skipped. Filesystem composition grants native authority to its
  driver, filesystem/application-directory access to its provider, and filesystem
  access to Vault Manager. Consumers require separate grants.
- Optional `view.mount(signal)`: a trusted renderer adapter that captures the
  supplied target and returns a disposable. It must cooperate with cancellation
  and release its rendering resources.

This adapter is not an alternative plugin API. Do not pass its DOM target, session,
kernel registry or native window into plugin contexts. A future plugin-driven UI
must establish shared UI contracts and providers through the SDK; missing SDK
operations must be specified before implementing a workaround. Layout, themes,
localization and native drivers keep their own responsibilities.

Each load attempt receives a fresh rendering target. On cancellation the target is
detached immediately. A late renderer cannot visibly replace a newer application
through that old target, and its late disposable is attempted. Module imports use
normal JavaScript module caching; retry restarts plugin activations, not code
loading. Restart the development process or reload the window after code changes.

## Recovery behavior

The system screen displays host identity, kernel/SDK versions, plugin IDs/versions/states,
owned-resource counts, disabled plugins and safe diagnostic codes with plugin and
contract attribution. It uses text nodes rather than interpolated HTML. Raw error
causes, arguments and payloads are not rendered. The system shell is English-only,
with built-in messages independent of product localization. It does not follow
browser language and has no language selector. Its root declares `lang="en"`.

The shell stays visible until a product surface mounts, including an early startup
surface. While product content is visible, the entire host shell is hidden: no
header, branding or System toggle reserves space. Failures reveal recovery automatically.
Without a product view, the shell remains the normal visible interface.

The system view follows [UI guidelines](../UI_GUIDELINES.md): a compact status
heading, kernel/SDK versions and plugin counts precede the plugin list. Retry is
shown for idle, stopped and recoverable failure states; successful operation has
no recovery action. Plugin-control help is disclosed on demand when plugins exist.
Diagnostics show an entry count and expand when new failures arrive; ordinary
snapshot refreshes preserve the user's disclosure choice. Failed cleanup replaces
retry with an explicit restart instruction. Layout uses shared spacing, wrapping
controls and an adaptive metrics grid; wide plugin tables scroll locally.

Startup/loading/registration/rendering failures enter recovery. During operation,
the host checks snapshots every 250 ms. Failed plugins, unavailable root plugins
and new API, listener, hook or lifecycle failure diagnostics enter recovery too.
Uncaught browser errors, rejected promises and subsequent resource-load failures
also report faults. Normal permission denial is not treated as an application
crash. The UI hides immediately on a reported fault; cleanup runs through the
serialized host operation queue. Kernel-managed activation deadlines still apply.

Retry disposes the old view, stops the old kernel and constructs a fresh kernel.
Disable-and-retry excludes the selected plugin from the next registry, so dependency
auto-start cannot silently restore it. Missing required providers correctly leave
the application in recovery. Disabling an application entrypoint also leaves the
system view visible. Enable-and-retry restores an excluded definition. Exclusions
last only until the window reloads, and are explicitly described as session-local.

Renderer loading/mounting and view cleanup use a host deadline, default 5000 ms.
If cleanup fails or times out, the shell records the failure and blocks additional
in-process recovery; close and restart the application. This avoids claiming safe
recovery while external resources might still be live. Native close requests await
session cleanup, and repeated close requests do not bypass that wait. Native
permissions include event listen/unlisten, window destruction and the explicit
`filesystem_request` permission for the main local window. The native file service
exposes user-selected Vault roots through opaque IDs and relative paths; process
and network drivers are not installed. See
[Tauri close-request semantics](https://v2.tauri.app/reference/javascript/api/namespacewindow/#oncloserequested).

## Limits and manual acceptance

This is a cooperative recovery boundary, not JavaScript isolation. A plugin can
still access ambient browser capabilities. A blocking loop freezes the same
WebView; process termination, WebView crashes, arbitrary DOM destruction or native
crashes cannot be repaired by this shell. There is no watchdog process or automatic
crash restart. The HTML contains a static startup/error message if the bootstrap
itself cannot load; an operational interactive shell requires its own bundle to run.

DOM tests run in Node with JSDOM, not desktop automation. Native compilation and
mocked close callbacks do not establish actual WebView rendering or OS event
behavior. Manually run `npm run tauri:dev` and check:

1. The monochrome system view fits the window, versions are visible, and all six
   service plugins are active without a blank application screen. Open DevTools:
   the supplied artwork appears once, followed by the readable `LOGGER_READY`
   record. Retry does not repeat the artwork; reloading the window does.
   Confirm `FILESYSTEM_DRIVER_READY`, `FILESYSTEM_READY`, `VAULT_READY` and `CONFIG_READY` too. Native dialog
   selection/cancellation requires a consumer action; its UI is outside this milestone.
2. Labels remain English regardless of browser language; keyboard focus remains visible.
   Resize to the minimum window width and check table scrolling when plugins exist.
3. After product composition is introduced, verify full-window mounting without a host header,
   a failing activation/API/render, retry, plugin exclusion and dependency failure.
4. Close the native window while cleanup is pending and verify it waits, then
   closes. Check development-server shutdown separately after ending Tauri dev.

The independent native workflow in `.github/workflows/tauri.yml` builds on the
declared Windows target when host/core/tooling inputs change. It is configured;
remote execution is not claimed by the local implementation.

## Local implementation evidence — 2026-11-03

Implementation commit: `6217ca8`, branch `feat/tauri-fallback-shell`.

- `npm run release:check`: **337 tests passed, zero skipped**, workspace builds,
  boundaries, type fixtures, CI-selection tests, export/documentation audit,
  core benchmark and generated-plugin rehearsal (1999 ms).
- `npm run tauri:check`: targeted host checks, frontend build, Rust formatting
  and locked native compilation passed.
- `npm run tauri:build`: **23 host runtime/DOM/close-adapter tests** plus shared
  boundary checks and type fixtures passed; frontend assets and a native Windows
  debug executable were built successfully without launching a window.
- Runtime tests include failure/retry, optional-provider recovery, exclusion of
  required providers, stale load/mount cancellation, the mount-adoption fault race,
  cleanup failure/deadline handling and bounded safe diagnostics.

Environment: Windows x64, Node 26.13.0, npm 11.20.0, Rust/Cargo 1.99.1,
Tauri Rust 2.12.5 and JavaScript API/CLI 2.12.4. Actual WebView visuals, native close
events and remote CI remain unverified. No merge, push, installer or publication
was performed.

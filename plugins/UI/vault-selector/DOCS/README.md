# Vault selector

Purpose: present the first post-startup screen and orchestrate user-requested
Vault creation/selection/reopening through public SDK services. It does not
render controls, access native paths, initialize files, or persist history itself.

## Usage and interface

Create `createVaultSelector({ art })` from `@lunaris/vault-selector`. The trusted
host supplies `resources/ascii_art.txt`; no product plugin imports that file.
Tauri starts the selector after the runner and grants `ui.dom`/`vault.access`.

The screen mounts only after `Startup` reports `loaded`. Recent Vaults occupy
the left third; actions occupy the right two thirds, with the ASCII logo above.
Narrow surfaces stack actions before recents. The `lunaris.vault-selector` role
is supplied by Components Kit; a compatible set may replace it.

Create/Select each expand a card below their action. Only one card is open.
Browse is an icon-only Lucide control with localized accessible name and tooltip.
It selects a candidate without activation or Vault writes. Create also requires
a display name. Next opens the selected folder itself, without a second dialog;
it does not create a named subfolder. Config Manager creates missing `.lunaris`
configuration and validates existing configuration through Vault preparation.
Existing unrelated content is preserved.

Each card retains its values across switching/retry. Cancelling Browse preserves
its previous folder. Operations disable competing actions; a duplicate submit
does not issue a second request. Failures use localized, retryable messages,
never raw diagnostic strings. History has a separate retry action when unavailable.
Recent entries reopen without browsing; unavailable folders remain in the list.

The current recent entry is distinct from hover and exposes `aria-current`.
The controller tracks its reference only from a committed result or matching
VaultChanged event, never by guessing from display names. The visible outcome is
the Vault name, without a persistent operational/log-style prefix. Quiet action
rows and intrinsically animated inline forms replace nested outlined cards;
the logo stays anchored when forms expand. These rendering rules and all motion
tokens belong to Components Kit and the active theme.

After a successful open, show the active Vault name and keep the selector usable
for switching. The editor/workspace screen is not implemented, so this plugin
does not navigate to an empty surface or claim editor readiness.

## Public contracts and lifecycle

Provides no callable API or SDK events. Requires:

| Contract | Responsibility |
|---|---|
| Logger | Readiness, meaningful outcomes, degradation, original errors; no paths/names/references in logs. |
| Localization / LocaleChanged | Owned English-first catalog, text and live locale refresh. |
| Slots / SlotDom | Owned `lunaris.vault-selector.screen` and borrowed rendering target. |
| Components / ComponentsChanged | Mount/update/reacquire a replaceable selector role. |
| Startup / StartupChanged | Wait for loaded, ignore obsolete milestone sequences. |
| Vault / VaultChanged | Current committed context, including externally initiated changes. |
| VaultLocations | Candidate selection and explicit opening with optional display name. |
| VaultHistory / VaultHistoryChanged | Initial/retried history read, live snapshots and recent reopening. |

Consumers use `^1.0.0` contracts, with `VaultChanged@^1.1.0`. All services are
acquired through `ctx.use`. Theme access belongs to the kit. Scope cancellation
releases the slot, component, catalog and subscriptions. Pending results are
ignored after stop; cleanup never invokes closed SDK/Logger handles.

The host uses `createRunner({ art, hideWhenLoaded: true })`, releasing the runner's
owned child scope on loaded. The selector then mounts its own slot on the same
milestone. Neither plugin removes the other's DOM or imports its implementation.

## Verification

Run `npm run vault-selector:check`, then
`npm run build --workspace @lunaris/tauri`. Targeted JSDOM/host tests cover real
runner handoff, no startup dialogs, expanded cards, icon names/focus, name gating,
duplicate submit, cancellation, retry, recent reopening, safe text, theme/locale
refresh, replacement roles, access grants and late results after shutdown.
Existing Vault/Config/native tests cover actual folder preparation and persistence.

Manual acceptance in Tauri: confirm the 1:2 panel proportions, readable ASCII art,
Light/Dark themes, narrow-window stacking, long folder names, keyboard focus,
native Browse cancellation and successful opening of empty/populated folders.
Desktop automation is prohibited. Automated DOM checks do not verify native
WebView appearance or operating-system dialogs.

# Lime authority audit

Status: incremental source audit, 2026-11-11. This is not native host acceptance
or a claim that arbitrary trusted providers cannot act as deputies.

## Enforced interpreter boundary

Installed code runs inside QuickJS with no host globals, native IPC, Node imports,
fetch, DOM or arbitrary host object references. The SDK adapter captures plugin,
activation, Vault and generation identity. Native provider declarations or automatic
permission grants do not grant access through the broker.

| Contract family | Enforced restriction |
| --- | --- |
| Runtime management | runtime.manage contracts rejected, including optional access and provision |
| Native drivers | Any *.native permission rejected; filesystem application-directory authority rejected |
| Filesystem | Targets must use captured vaultId; root select/close denied; picker/unwatch IDs checked |
| Location acquisition | Filesystem roots/locations/directory locations and their drivers rejected |
| Vault | current remains usable; open/close rejected; location/creation/history/preparation contracts rejected |
| Config | Own plugin namespace only; global rejected; effective narrowed to explicit captured Vault |
| ConfigChanged | Subscription sees only own namespace in captured Vault; global/foreign notifications omitted |
| Account/remote | account.access/network and drafts.access/storage rejected; no account-wide enumeration or drafts |
| ActiveDocument | Foreign-vault target arguments rejected before the provider call |
| Logger | Source forced to captured plugin ID |
| Package assets | Immutable captured own-package bytes, bounded reads and activation revocation |
| API/events/hooks | Same privileged-token admission check applied to all SDK entry points |

The kernel separately compares provider/consumer token permission metadata; omitting
permissions from a forged token cannot create a compatible privileged handle.
Event/hook dispatch is bound to the selected provider's activation, preventing an
unselected declaration from impersonating an existing provider's emissions.

The ambient-contract restrictions protect root/account acquisition rather than
limiting ordinary custom contracts to a fixed feature list. New APIs remain
authorable and replaceable. A custom provider cannot receive raw host objects
through the interpreter bridge.

## Evidence and remaining work

Actual WASM tests cover absent globals/imports, captured root checks, namespace
isolation, automatic grants, ambient API/provision denial, event/hook admission,
Vault transition denial, cleanup and revocation. Shared host checks exercise the
same adapter used by browser/Tauri composition.

Still required: review each trusted provider's returned callbacks, UI command
registries and hooks for transitive authority. Public data/callback APIs can carry
the provider's authority; checking the initial token alone does not prove every
callback is safe. In particular Settings snapshots and contributions, global
preference persistence, native clipboard/window actions and migration hooks need
explicit policies and focused evidence. Do not advertise complete out-of-Vault
containment until this review and native/WebView verification are complete.

Where a provider intentionally exposes ambient work, extend its public SDK with a
captured authority contract before isolated consumption; do not substitute a
private host closure or a guest-supplied identity. Root/account management cannot
be made safe merely by granting a permission string.

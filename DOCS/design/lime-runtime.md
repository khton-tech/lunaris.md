# Lime runtime boundary and integration specification

Status: L01 source audit and prerequisite specification; runtime design gate blocked.
Audited on 2026-11-10 at `4d259c199da4be969ec5e71eb451106d04fcdfa3` on
`feat/lime`. No contracts proposed below are implemented exports. No third-party
code loading, installation, isolation or host acceptance is delivered by this document.

## Product boundary

Lime manages workspace-local third-party packages. Its engine belongs in
`plugins/systems/lime`; its Settings consumer belongs in
`plugins/UI/lime-settings`. Package transport and execution belong in host
drivers, never in the engine. Shared declarations belong in public contract
packages. Extend the existing CLI and development host.

Third-party authors must be able to contribute new services, replace providers
and create non-Markdown application views. Author declarations must not become
a fixed feature allowlist. No permission-selection or new-device trust prompt is
introduced. Platform metadata is advisory; a missing execution capability is a
real host failure and cannot be bypassed by accepting a platform warning.

Filesystem authority is limited to the captured active Vault. Selecting an
external package grants the importer access to those selected bytes only. It
does not grant installed code access to the selected file's directory, the
application configuration directory, another open root or native IPC.

## Source audit and responsibility map

| Concern | Existing implementation | Required owner/change |
| --- | --- | --- |
| Composition | `hosts/application/src/composition.ts` supplies static definitions, entrypoints, grants and selections | Shared host composes the management adapter and recovery before third-party evaluation |
| Session | `hosts/application/src/session.ts` registers definitions at launch; disable/enable rebuild the entire application | Host owns runtime generations and isolated execution; ordinary Lime operations must preserve unrelated services |
| Lifecycle | `packages/kernel/src/types.ts` exposes register/start/stop/restart and inactive-consumer provider selection | Kernel adds graph-aware replacement/unregistration; host exposes a narrow public management contract |
| SDK gateway | `packages/sdk/src/context.ts` owns declared calls, cancellation and resources | Preserve scoped SDK access; never add the kernel object to PluginContext |
| Native bridge | `hosts/tauri/src-tauri/src/main.rs` dispatches caller-supplied session/request data; filesystem capability applies to window `main` | Native host authenticates execution identity and enforces root authority independently of package code |
| Root containment | `plugins/systems/driver/tauri-filesystem/native/src/lib.rs` and `operations.rs` enforce attached-root operations | Keep containment; it is insufficient to limit which roots a package may acquire |
| Vault | `plugins/systems/vault/src/index.ts` prepares candidate, guards old release, closes old root, commits candidate, then emits a detached event | Await third-party stop before closure and settle the transition before new activation |
| Config | `plugins/systems/config/src/index.ts` supports explicit Vault IDs plus global/effective scopes | Bind installed-plugin configuration to its Vault; protect global storage at the call boundary |
| Filesystem | `packages/filesystem/src/index.ts` has explicit root targets and root-relative pickers | Add selected-external-package transport and identity-bound root access; do not widen ordinary pickers |
| Logging | Logger and independent kernel diagnostics already separate operation and cleanup failures | Both Lime plugins require Logger; original errors retained; host failure diagnostics remain independent |
| Startup | `packages/startup/src/index.ts` is a read-only progress contract | Host owns safe-mode decision before evaluation; progress is not a lifecycle management API |
| Settings | `packages/settings/src/index.ts` supports custom sections and declarative controls | Settings container owns page geometry/surface; Lime supplies localized section content |
| Components | `packages/components/src/index.ts` accepts arbitrary role IDs, mount callbacks and HTMLElement targets | Preserve novel renderers while defining a safe execution boundary; extend shared Mantine roles for product controls |
| View/navigation | `packages/active-screen/src/index.ts` registers arbitrary component IDs; Workspace/Sidebar supply regions | Reuse public contribution routes; no Markdown-specific limitation or DOM discovery |
| Localization/themes | Existing public localization/theme providers and Mantine role adapter | Lime passes localized text and inert metadata; controls use existing theme behavior |
| Tooling | `hosts/development/src/index.ts` imports checked entries in Node; CLI is private and dev requires rebuild/relaunch | Reuse validation, but replace execution assumptions for installed packages and external live development |

## B01: execution and authority blocker

The current public SDK is a cooperative in-process extension API, not a security
boundary. The following are source findings, not a native exploit rehearsal:

1. The desktop filesystem capability authorizes `main`, not an individual plugin.
   The Rust command accepts a session ID from JavaScript without an independently
   authenticated plugin principal. The backend's `Begin` creates a supplied session;
   `OpenConfig` attaches the application configuration directory to that session.
   Hiding the convenience global with `withGlobalTauri: false` does not establish
   per-plugin native authority.
2. Automatically granting every declared contract permission would also grant
   `filesystem.native` or `filesystem.app-config` if declared. Existing Config
   accepts global/effective scope through `config.access`. Therefore SDK-only
   plugins can also reach out-of-Vault storage through trusted providers unless
   those calls enforce execution identity. String plugin IDs are not authentication.
3. Components passes real DOM elements, callbacks and synchronous methods across
   plugin boundaries. A real HTMLElement can expose its owner document/window.
   Removing a global name while passing those objects does not isolate code.
4. A Worker/message-channel substitution cannot transparently preserve current
   synchronous SDK return shapes, DOM targets, function-valued props, cancellation
   signals and provider callbacks. An iframe with access to the parent DOM has the
   same authority problem. Current desktop CSP also uses `frame-src 'none'`.
5. The Node development loader evaluates packages with ambient Node authority.
   It must not become the installer or establish isolation evidence.

Do not implement a same-realm dynamic import loader, conceal the bridge in a
closure, use import scanning as isolation, or silently convert public synchronous
methods to asynchronous RPC. Full extension capability and Vault-limited authority
remain simultaneous requirements. A separate execution architecture must preserve
both, or explicitly surface a compatibility conflict before implementation.

### Required execution contract

Host execution must establish an unforgeable principal containing the Vault
generation, package ID and activation identity before module evaluation. It must:

- Deny direct native IPC, host document/window, Node APIs, host session credentials
  and general file access. Module/resource resolution stays inside verified assets
  and an explicit public SDK import map; do not execute remote imports.
- Authenticate that principal at every host-backed call. Ignore caller-supplied
  identity for authorization. Bind root targets to the principal's Vault generation;
  deny global Config/application-storage roots and other Vault roots. Providers
  may expose application actions without returning host storage handles or secrets.
- Permit provider implementations and novel views through a documented bridge.
  Define method return shapes, callbacks, events/hooks, cancellation, original-error
  diagnostics and renderer ownership explicitly. No private host closure in Lime.
- Revoke calls, pending results and rendered contributions on stop. Specify whether
  synchronous runaway code is forcibly terminable; recovery must survive outside
  its execution realm. Deadlines in the same blocked JS thread cannot provide this.
- Release old module realms/resources on replacement rather than accumulating
  unbounded cache-busted module identities.

Architecture selection remains unresolved: the existing API cannot cross a
message boundary unchanged. The prerequisite implementation must provide a tested
isolation/membrane model or introduce versioned cross-realm public contracts and
adapters for existing providers/renderers. Do not claim either exists today.

## B02: proposed runtime management contract

Add a public host-backed management token in a dedicated contract package, with
the following semantics. Names here describe required operations, not imports:

| Operation | Required inputs and outcome |
| --- | --- |
| Inspect/plan | Captured Vault generation and plugin ID; immutable runtime state, required/optional graph, provider choices, affected consumers and revision |
| Register/start | Opaque verified-package handle, captured environment and expected revision; reject built-in collisions and mismatched manifest identity before evaluation |
| Disable/unregister | Expected revision and disclosed affected graph; stop required consumers before providers, invalidate handles, remove registry entries only after closure |
| Replace | Verified candidate and previous committed identity; stage, stop affected graph, replace, restore selections and restart previously running consumers; return actual rollback state on failure |
| Select provider | Explicit consumer/contract/provider choice and expected revision; validate compatibility, transition affected graph, persist Vault-owned choice only after success |
| Cancel/close environment | Revoke generation, cancel pending work, await stop/cleanup, report unsafe closure independently of Logger |

Every mutation is serialized by the runtime; inspection plans carry revisions so
stale confirmation cannot mutate a changed graph. Do not invoke management inline
from an activation that waits on that same lifecycle queue. Define and test
reentrancy rejection. Immutable result data includes operation ID, revision,
affected IDs, runtime states and structured error codes; never return kernel
instances, implementations, native roots or reusable host credentials.

The host grants this token to the composed Lime manager by authenticated identity;
a manifest permission string alone cannot grant it. This is internal host
authority, not a user permission prompt or a third-party feature allowlist.
Ordinary SDK contract grants are automatic for the bound environment, but do not
create native authority or authorize management of another environment.

Kernel prerequisite operations must reject duplicate/built-in ID takeover, preserve
original diagnostics, retain cleanup deadlines and invalidate old activation
handles. Required consumers restart in dependency order. Optional bindings are
fixed per activation today: either restart affected optional consumers under a
documented policy or explicitly return their unavailable state; never silently
revive an old handle. Rollback failure must report recovery-required rather than
success. Unrelated active services remain untouched where the graph permits.

## B03: proposed package transport/storage contracts

The selected-package driver returns an owned opaque byte handle and length/hash,
or successful cancellation. Only the explicit selection can be read; do not expose
an arbitrary external path reader. Preview consumes bounded bytes without import
or activation. Confirmation uses that same immutable identity. Cancellation or
Vault transition invalidates it; mutable-path rereads require a new preview.

Storage operations take captured Vault generation, installation identity and
expected registry revision. The provider owns staging, validation, commit marker,
recovery journal, conflict detection and cleanup; drivers report actual durability
capabilities. Do not infer multi-file transactions from atomic single-file replace.
The execution driver accepts only a committed verified installation handle.

L02 must finalize archive schema, canonical paths, byte/count/expansion limits,
manifest identity, module/import rules and portable records before these types are
exported. `.lunaris/plugins` is the accepted root; exact version/code/data layout
is still L02 work. Digest identity binds preview to bytes; it is not publisher trust.

Rollback cannot promise reversal of arbitrary Vault writes: plugins have access to
the whole Vault. L02/L05 must distinguish managed-data transactions from other
plugin effects. Irreversible migrations require an explicit supported backup or
recovery policy; retaining old code alone is not data rollback.

## B04: Vault lifecycle, persistence and recovery contract

Use `(environment generation, plugin ID)` for runtime ownership. Do not use a
runtime root ID as portable on-disk identity. Persist relative package locations,
installed versions, enabled choices and provider selections in the owning Vault;
revalidate copied/changed assets before evaluation. Runtime active/failed state is
an observation, not persisted evidence of a running process.

Required transition ordering:

1. Capture current generation; prepare candidate storage and validate registry
   without evaluating candidate third-party code. Preparation failure preserves
   old root and running plugins.
2. Obtain save/release consent while old root remains writable. If a later release
   handler rejects, keep the old environment usable; do not leave it permanently
   stopped merely because Lime's earlier hook ran.
3. Seal old operations against new submissions, cancel work and await old plugin
   stop before releasing its root. Closure failure must prevent a false commit;
   restore old execution only if root authority remains valid, otherwise enter
   host recovery. Never resume stale activations.
4. Commit candidate root/generation, resolve Config against that explicit root,
   then activate its enabled packages. Package failures remain inactive with
   diagnostics/retry; unaffected packages remain usable.
5. Publish a settled transition and release guards exactly once for success and
   failure. Await activation coordination; detached VaultChanged listeners are
   not sufficient for this guarantee.

Existing PrepareVault, BeforeVaultRelease/onSettled and VaultChanged are useful
integration points, but no public contract currently owns this entire coordinated
transaction. Extend Vault with an awaited lifecycle participant contract and
generation-bound environment access; test later-hook rejection, root-close
failure, initial open, switch and close. Keep persistence and candidate staging
separate from evaluation. Host shutdown follows the same stop-before-root rule.

Safe mode is chosen by the host before reading/evaluating enabled entry modules.
Provide an explicit recovery action/open mode to skip all third-party execution
while retaining installations/data and enabled preferences. A suspect startup
marker may offer recovery, but must not create a trust prompt. Recovery and its
minimum native/storage controls cannot depend on a replaced Logger, Filesystem,
Settings, Components or Lime provider. Capture this decision outside replaceable
execution. Existing fallback/relaunch is a foundation, not completed Vault safe mode.

## Arbitrary UI and ownership

Components.register accepts new IDs and ActiveScreen.register accepts their IDs;
the product is not constrained to built-in screen roles. Existing DOM renderer
contracts prove cooperative extensibility only, not isolated third-party authoring.
The B01 bridge must support a novel viewport as well as shared controls. Do not
solve isolation by removing custom renderers or by allowing arbitrary parent DOM.

Lime Settings reuses the existing Settings page headers, rows and navigation.
Workspace/Settings own allocated geometry, surfaces, corners and overflow. Lime
owns localized content, metadata and actions; Mantine owns control rendering.
Extend the Mantine component plugin through public roles when compositions are
missing. New viewport content owns only its borrowed region and uses shared roles
for product controls. Presentation is explicit public data, never DOM ancestry.
No UI is implemented or visually accepted in this audit. Mantine composition
research and real-container manual acceptance remain L07 gates.

## Current host matrix

| Host/topology | Existing foundation | Lime status and required evidence |
| --- | --- | --- |
| Tauri desktop/local Vault | Shared application host, native root containment and recovery shell | Blocked by B01-B04; require authenticated IPC, Config denial, selected-package picker, execution/resource lifecycle and native recovery evidence |
| Tauri desktop/remote Vault | Filesystem router and remote backend | Same blockers plus remote package storage and interruption/conflict evidence; do not assume local code paths |
| Browser/remote Vault | Shared host, account sessions, remote files and browser-backed application state | No installed-code isolation/loader or external package picker contract; require credential boundary, CSP/resource execution, reload/recovery and server-backed commit evidence |
| Mobile | No dedicated mobile host found in current host workspaces | Unsupported/unverified; responsive browser UI does not establish native mobile support |
| Node development | Local validator, module imports and headless kernel session | Trusted development only; no installed-code isolation, host attachment or live replacement evidence |

No Lime host is currently supported. This table describes source capabilities,
not runtime/native tests. Do not change CSP to broadly allow arbitrary code as an
installation shortcut. Host-specific execution and resource policies must be
part of the isolation design and verified in production builds.

## Prerequisite exit checks and integration status

- B01: prototype a novel public viewport and a replaceable service across the
  chosen boundary; preserve documented call shapes or version their contracts.
  Host tests must reject direct bridge/session forgery, OpenConfig/global Config,
  foreign roots, stale generations and indirect document/window escape. Verify
  actual runaway-code behavior and recovery. Source inspection alone cannot pass.
- B02: focused kernel/adapter tests cover dependency ordering, optional bindings,
  provider selection, concurrent/stale plans, failed replacement/rollback,
  cleanup failure and isolation of unaffected services.
- B03: real driver tests cover cancellation, selected-byte identity, malformed
  archives, staged-commit interruption, registry conflicts and resource release.
- B04: composed Vault tests cover preparation rejection, later release rejection,
  close failure, pending installs, identical IDs across two Vaults and pre-evaluation
  safe mode even after essential provider replacement.

All required Lime integrations remain outstanding: Kernel/runtime, Vault/Startup,
Filesystem/Config/drivers, Logger, Settings/Components/Mantine,
Workspace/Sidebar/ActiveScreen, Localization and CLI/development. No engine or
UI implementation is reported as integrated. Public API recipes and distributable
tooling cannot be finalized until the execution and lifecycle contracts land.

Repository AGENTS.md requires halting development when SDK functionality is missing
and reporting required changes. This specification records that gate. L01 remains
blocked on the execution model; L02-L10 remain pending. The next prerequisite is
B01 architecture and a verified public execution boundary, followed by the
versioned management, package and Vault contracts above. Do not start Lime through
private kernel imports or bypass providers while these blockers remain.

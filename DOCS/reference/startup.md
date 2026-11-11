# Startup progress

## Awaited product preparation (2026-11-11)

The shared application composition now mounts its product surface **after**
activation and preparation. The existing host loading screen remains authoritative
until then. Custom hosts may still explicitly opt into early surfaces. This
supersedes the historical Tauri early-mount policy described below.

`Preparation` and `PreparationChanged` are additive public contracts in
`@lunaris/startup`; the version 1 Startup payload and validator are unchanged.
Register an owned participant during activation and await registration:

```ts
await ctx.use(Preparation).register({
  id: ctx.pluginId,
  phase: "settings",
  async prepare({ vaultId, signal }) {
    // Restore owned state through SDK providers; respect cancellation before commit.
    await restore(vaultId, signal);
  },
}, ctx.signal);
```

Phases run in order: settings, document, content, presentation. Participants
within one phase retain registration order. Registration is sealed during a run;
do not activate additional participants from a preparation callback. Runtime
plugins should be activated during Vault runtime settlement, before preparation.
After a completed attempt, registration awaits only the new participant's work
without reopening global startup. When a new Vault is being committed, new
participants join its upcoming preparation instead of running against the old
snapshot. Duplicate IDs are rejected. Owner cancellation removes registrations
and cancels/unblocks their pending work. Consumers must honor the supplied signal
and their own session identity before committing delayed results.

The snapshot contains an epoch, explicit Vault ID (or null), and idle/preparing/
ready/failed state. `tracksVault()` declares whether trusted composition connected
Vault lifecycle management; application-only hosts remain supported. Subscribe
before reading the API, and reject stale events by comparing the current snapshot.
There is a 15-second preparation deadline, including notification dispatch.
Superseding runs, host cancellation and provider disposal cancel pending work.
Required thrown failures prevent readiness; components may instead deliberately
settle with their existing error/retry state for recoverable I/O failures.

Trusted hosts call the startup controller's `prepare(signal)` after entrypoints
activate and before mounting/revealing the product surface or publishing loaded.
The provider uses VaultLifecycle 1.1 settlement order 100, after runtime order 0.
It receives optional vault.access from shared composition. Workspace owns its
existing region surfaces and gates construction through this contract; no consumer
inspects another plugin's DOM. Settings, active-document restoration, editor
preferences/document reads and explorer initialization participate through SDK.
The final presentation phase constructs Workspace before the surface is exposed.

Vault preparation failure cannot roll back an already committed root: it is logged
and publishes failed, permitting existing recoverable error views. Application
preparation failure enters host recovery. Native paint, focus and sizing remain
manual acceptance; automated tests cover deferred preferences in a real composed
Workspace, phase ordering, cancellation, deadlines, late additions and host failure.

Required: a product loading screen must observe real startup milestones without
importing the host/kernel, including when its activation follows configuration
loading. Existing: SDK APIs/events, Logger and isolated slot surfaces. Added:
`@lunaris/startup` contracts, a replaceable `@lunaris/startup-provider` bridge,
and opt-in early mounting in the Tauri host. PluginContext and kernel management
remain unchanged.

## Consumer contract

Require `api:lunaris.startup@^1.0.0` and
`event:lunaris.startup-changed@^1.0.0`. Neither needs a permission grant.

```ts
import { Startup, StartupChanged } from "@lunaris/startup";

const startup = ctx.use(Startup);
ctx.events.on(StartupChanged, snapshot => {
  // Update the product's localized presentation, ignoring older sequences.
});
const initial = startup.snapshot();
```

`snapshot()` returns a frozen current `StartupSnapshot`. Subscribe first, then
read the snapshot to avoid a read/subscribe gap. Events follow normal asynchronous
SDK dispatch rules, carry frozen snapshots, and do not replay history. Use
`sequence` to ignore stale deliveries; re-read the API for the newest state.
The API intentionally has no startup-control or state-mutation methods.

| Field | Meaning |
|---|---|
| `sequence` | Nonnegative safe integer, increasing within the host session, including retries. |
| `state` | `loading`, `loaded`, `failed`, or `stopped`. |
| `stage` | While loading: `composition`, `registration`, `mounting`, or `activation`. Terminal stages: `ready`, `failed`, `stopped`. |
| `pluginId?` | Entrypoint currently being started, or plugin associated with failure. |
| `errorCode?` | Stable diagnostic code; never a raw exception or config contents. |

Milestones are host operations, not an invented percentage or a trace of every
transitive dependency. During `activation`, dependencies are included in the
current entrypoint's startup. The host retains pre-provider milestones in its own
snapshot; a late plugin gets current state, not earlier history. Configuration
remains the responsibility of Config Manager. A runner must require Config and
read its namespace before rendering; progress does not replace configuration I/O.

## Provider and host composition

`createStartupProvider()` returns `{ plugin, update(snapshot) }`. Only trusted
composition receives `update`; plugin consumers import shared contracts instead.
Updates are copied and frozen, reject invalid payloads, and ignore duplicate or
older sequences. Before activation they retain current state without SDK calls.
After disposal they return `false` and do not log or access SDK handles. Use a
fresh controller for each application composition/recovery attempt.

Tauri registers the provider first, starts it before product entrypoints, and
supplies the controller as `ApplicationDefinition.startup`. The provider requires
Logger and logs readiness, milestone changes and publication failures (with the
original error). It renders nothing and subscribes to no events. A replacement
uses the same public consumer contracts and a compatible trusted ingress.

`ApplicationDefinition.view.duringStartup: true` mounts the isolated surface
before entrypoint activation. Tauri slot composition opts in; existing custom
views without this flag still mount after activation. The host shell is hidden
while product content is visible, with no persistent header or inspection toggle. Failures immediately hide product content, dispose
the surface and stop plugins; existing mount deadlines and late-result cleanup
also cover early mounts. An excluded entrypoint is rejected before mounting.
`loaded` means entrypoints and the host view completed successfully, not that a
browser frame has painted. A later runtime fault changes state to `failed`.
Terminal events during teardown are best-effort; the host recovery UI is the
authoritative presenter when product scopes are unavailable.

## Integration and verification

Integrated: Tauri host -> startup provider -> public SDK API/event; early slot
surface -> system visibility/recovery controls. No driver-specific calls or
kernel imports are added to product plugins. The
[loading runner](../../plugins/UI/lunaris-runner/DOCS/README.md) now integrates
Config/Localization/Slots and the component role. The initial
[Mantine components](../../plugins/UI/mantine-components/DOCS/README.md) now supplies the
`lunaris.startup-screen` role. Tauri starts theme-settings and the runner after
foundational providers; the runner mounts this role and retains System Loaded.

Run `npm run startup:check` for payload validation, type fixtures, real SDK
provider ownership and host loading/failure/retry/shutdown tests. Run
`npm run build --workspace @lunaris/tauri` for the frontend bundle. JSDOM verifies
DOM connection and host visibility during unfinished activation. Native WebView
painting and resizing require manual acceptance once visible UI is connected;
desktop automation is not used.

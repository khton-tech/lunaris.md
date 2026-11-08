# Logging contracts and composition

## Responsibilities

Required: a platform-neutral logging API, one replaceable output sink, native
DevTools severity/filtering, readable error records and the supplied startup art.
Existing: SDK API contracts, owned registration, dependency resolution and host
provider selection. New: `@lunaris/logging` shared contracts, `@lunaris/logger`
service and `@lunaris/dev-tools-logger` console driver. Existing SDK/kernel lifecycle
semantics remain unchanged. All inter-plugin calls go through the public SDK.

The Logger does not import a driver or detect the platform. The DevTools driver
owns console access and presentation; it works in the Tauri WebView and other
browser consoles. A future mobile sink implements the same contract. An in-app
viewer, persistence, buffering, multiple sinks and live sink switching are deferred.

## Mandatory plugin logging

Every product plugin must declare the Logger API as a required dependency and
acquire it through `ctx.use(Logger)`. Use `ctx.pluginId` as the source. Logging is
part of the plugin's implementation and review acceptance, not an optional
development aid. This policy applies to new plugins and changes to existing ones.

Use `scopeLogger(ctx.use(Logger), ctx.signal)` for product continuations that may
finish during shutdown. The helper retains source attribution and original errors,
returns false after owner cancellation without invoking SDK, and contains only
SCOPE_CLOSED/PROVIDER_UNAVAILABLE from a retiring Logger endpoint. Permission and
other programming errors still propagate. A provider enters stopping before all
required consumers finish, so checking the consumer signal alone is insufficient
to guarantee Logger availability. Sink/Logger implementations do not use this
helper to report their own output failures; independent kernel cleanup diagnostics
remain authoritative. The additive SDK isSdkUnavailable classifier distinguishes
endpoint retirement from permission denial.

- Log activation progress at `debug` and successful readiness at `info`.
- Log meaningful operation outcomes and state changes with enough context to
  identify the operation and affected resource. Keep detailed traces at `debug`;
  use `info` for useful milestones, avoiding per-frame, polling and routine-read noise.
- Use `warn` when recovery or fallback changes behavior, and `error` when an
  operation fails. Include a stable code where available, useful diagnostic context
  and the original error object. Do not log secrets or document contents by default.
- Report a failure once at the boundary responsible for handling or presenting it.
  Preserve the original failure when rethrowing; do not silently swallow it or
  duplicate the same error at every forwarding layer.
- Log a shutdown request only while the plugin's SDK scope is still open. Do not
  call a retained logger handle from a disposer after scope closure. The kernel's
  independent diagnostics cover resolution, lifecycle and cleanup failures that
  cannot be reported through a live Logger handle.

Direct `console.*` calls are forbidden in ordinary plugins; console output belongs
to the DevTools driver. Logger and sink implementations are the structural
exception to the required Logger dependency: they must not depend on Logger,
create cycles or recursively log their own output failures. The Logger's existing
readiness record is emitted through its sink. Kernel/host recovery diagnostics
remain independent and must work when logging is unavailable.

Test fixtures and generated empty scaffolds are not product implementations. Before
using a scaffold as a product plugin, add its Logger dependency and the relevant
records. The CLI generator does not currently inject logging. During review,
check that a real operation/failure can be traced to the plugin and that error
records preserve context without flooding the console. This is a documented
development requirement; no automatic source-level enforcement is installed.

## Consumer API

Declare `{ "kind": "api", "id": "lunaris.logger", "range": "^1.0.0" }` in
the consumer manifest's `requires` list, then use:

```ts
import { Logger } from "@lunaris/logging";

const logger = ctx.use(Logger);
logger.info(ctx.pluginId, "Workspace opened");
logger.error(ctx.pluginId, "Cannot save document", {
  code: "FILE_WRITE_FAILED",
  error: originalError,
  data: { documentId },
});
```

`debug`, `info`, `warn` and `error` accept `(source, message, details?)`.
`log({ level, source, message, code?, data?, error? })` accepts the equivalent
structured input. Source is explicit attribution, not an authenticated caller ID;
use `ctx.pluginId`. The SDK does not expose caller identity to an API provider.

Methods return `true` for synchronous delivery, `false` for filtering, invalid
input, recursion or failed output. SDK lifecycle/declaration/permission checks
still occur before the method and can throw. The default minimum level is `info`;
the host may construct `createLogger({ minimumLevel: "debug" })` instead.
Configuration is fixed for that definition. Activation emits `LOGGER_READY`
subject to the same threshold; this means the logger is ready, not that every
application plugin has started.

## Shared record and sink contract

`Logger` identifies `api:lunaris.logger@1.0.0` and `LogSink` identifies
`api:lunaris.log-sink@1.0.0`. The Logger adds an epoch-millisecond timestamp,
copies known fields and shallow-freezes the record. Data/error objects retain
their identity for inspection; they are neither serialized nor deeply frozen.
DevTools may show a later state of mutable data objects.

`LogSink.write(record)` returns a synchronous boolean. Sink implementations must
catch output failures inside their own SDK method and return `false`. A sink
that throws violates this contract: the SDK records `API_CALL_FAILED` even if the
Logger catches the exception, and the host may enter recovery. The DevTools driver
contains its console failures before this boundary. Both plugins reject recursive
writes without attempting to log that rejection.

No event or hook is provided or subscribed to. No extra permissions are required
by these trusted local console-only contracts. Core diagnostics remain independent
of the logger; no automatic forwarding or console interception is installed.

## Composition and presentation

Tauri registers one sink and the Logger and starts `lunaris.logger`. The kernel
starts its required sink first. If an alternative composition registers multiple
sinks, select one with the public host API while the Logger is inactive:

```ts
kernel.selectProvider("lunaris.logger", "api", "lunaris.log-sink", "example.sink");
```

Restart affected consumers after a selection change. This uses the existing kernel
API; no service registry or platform object is passed through plugin contexts.
The current Tauri composition registers just one sink and needs no selection call.

DevTools uses native `console.debug/info/warn/error`, retaining severity filters.
Each record shows local `HH:mm:ss.SSS`, uppercase level, `[source]`, message and
optional error code. Time is subdued, severity has restrained color/weight, and
the text level remains readable without color. Source/message/code control
characters become spaces so a record stays on one header line. Constant console
format strings keep message text such as `%c` literal. Data and the original error
are separate expandable console arguments; errors are never hidden in groups.

The host imports `resources/ascii_art.txt` as a Vite raw asset and supplies it with
a version/target caption to the driver. The driver attempts the banner once per
definition lifetime, even if console output fails. Tauri retains that definition
across recovery attempts; a window reload prints the banner again. Banner and
record templates are confined to the output adapter for future localization.

## Verification

Run `npm run logger:check` for logging contracts, both plugins, affected Tauri
tests, type fixtures and source boundaries. Run `npm run build --workspace
@lunaris/tauri` to verify the frontend bundle including the raw artwork. Native
code and capabilities are unchanged.

For manual visual acceptance, run `npm run tauri:dev`, open DevTools and verify the
artwork and `LOGGER_READY`. Retry should add a readiness record without repeating
the artwork. Confirm the two plugins are active in the system view. Actual WebView
appearance remains manual; automated desktop control is prohibited.

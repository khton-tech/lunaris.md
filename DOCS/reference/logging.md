# Logging contracts and composition

## Responsibilities

Required: a platform-neutral logging API, one replaceable output sink, native
DevTools severity/filtering, readable error records and the supplied startup art.
Existing: SDK API contracts, owned registration, dependency resolution and host
provider selection. New: `@lunaris/logging` shared contracts, `@lunaris/logger`
service and `@lunaris/dev-tools-logger` console driver. No SDK/kernel changes or
native Tauri APIs are needed. All inter-plugin calls go through the public SDK.

The Logger does not import a driver or detect the platform. The DevTools driver
owns console access and presentation; it works in the Tauri WebView and other
browser consoles. A future mobile sink implements the same contract. An in-app
viewer, persistence, buffering, multiple sinks and live sink switching are deferred.

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

# Logger

Provides `lunaris.logger@1.0.0` through `@lunaris/logging`. Requires one
`lunaris.log-sink@^1.0.0` provider; imports only the SDK and shared contracts.

Use the default plugin or `createLogger({ minimumLevel: "debug" })` at host
composition. The default threshold is `info`. Consumers declare the Logger API in
their manifest and acquire it with `ctx.use(Logger)`.

API: `log(input)` or `debug/info/warn/error(source, message, details?)`, returning
a delivery boolean. Details contain optional `code`, `data`, `error`. The Logger
adds time, shallow-freezes the record and passes it to the SDK-bound sink. It emits
`LOGGER_READY` on activation through that same path. No events/hooks are used.

See the [shared reference](../../../../DOCS/reference/logging.md) for record
semantics, sink replacement, failure behavior and examples. No buffer, console
access, native API, file persistence or viewer is included. Run
`npm run logger:check` from the repository root.

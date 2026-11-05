# DevTools log sink

Provides `lunaris.log-sink@1.0.0` via the SDK. Owns the browser/WebView console
boundary and all log presentation. No Tauri native API or filesystem is used.

Use the default plugin or `createDevToolsLogger({ banner: { art, caption } })` in
host composition. `output` optionally supplies all four console severity methods
for deterministic tests or an equivalent console adapter. The driver preserves
the output receiver when calling those methods.

API: `write(record): boolean`. Dispatches to the matching native
`debug/info/warn/error` method, formats a single-line timestamp/level/source/message
header, appends an optional code and passes data/error objects separately. Invalid
records, recursive writes and output failures return `false`. Failures never
recursively log or escape the API method. No events/hooks are used.

An optional banner is attempted once per plugin-definition lifetime, independent
of activation/stop cycles. The Tauri host retains this definition across retries
and supplies the project artwork. The default standalone definition has no banner.

See the [shared reference](../../../../../DOCS/reference/logging.md). Run
`npm run logger:check` from the repository root. Visual checks in the real WebView
are manual.

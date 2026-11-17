# Native processes

`NativeProcesses` from `@lunaris/execution` is supplied by the Windows
Tauri host. Add `api:lunaris.native-processes@^1.0.0` to `requires`.
It uses the same SDK declaration and lifecycle rules for each plugin. There is
no extra permission name on the token. For a cross-platform package, declare
the requirement optional and check `ctx.optional(NativeProcesses)`. The Web
and headless development hosts do not supply this provider.

```ts
import { NativeProcesses } from "@lunaris/execution";

const process = await ctx.use(NativeProcesses).start(ctx, {
  executable: "assets/bin/helper.exe",
  args: ["--listen"],
  onLine(line) { /* Interpret the protocol defined by this plugin. */ },
});
```

`start(ctx, options)` reads the executable from the activation's captured
package assets. Package the helper under `assets/` for the target Windows
architecture. The driver launches it in a temporary directory under the user's
account and passes arguments directly. The helper can perform OS operations
available to that account. Its protocol belongs to the plugin.

The returned handle exposes `write(line)` for UTF-8 stdin, `wait()` for the
exit code (or `null` when unavailable) and `dispose()` to stop the helper early.
The optional `onLine` callback receives UTF-8 stdout lines. Use your protocol
to distinguish readiness, errors, and events. Exit and scope closure release
driver resources. Windows Job Objects manage process lifetime. They do not
restrict the user's OS privileges. Standard error is discarded.

The current driver accepts an executable up to 16 MiB, at most 32 arguments of
up to 1024 UTF-8 bytes each and messages up to 16 KiB per line. Input buffering
and output rate are bounded. Treat write failures and unexpected exits as
operation failures, and use Logger without logging sensitive payloads.

[Global Hotkey](../../examples/global-hotkey/DOCS/README.md) implements
`RegisterHotKey` in its Rust helper and publishes a plugin-defined SDK event.
The same process API supports other package-defined operations without a
Lunaris-specific command for each one.

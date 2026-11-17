# Windows native process driver

`createTauriProcesses()` is composed by the Tauri host and provides
`api:lunaris.native-processes@1.0.0`. The same public SDK token is available to
every Windows plugin, independently of package origin. Plugin code declares the
API dependency and passes its current context to `start`. On hosts without a
provider authors can declare the dependency optional and feature-detect it.

```ts
import { NativeProcesses } from "@lunaris/execution";

const helper = await ctx.use(NativeProcesses).start(ctx, {
  executable: "assets/bin/helper.exe",
  args: ["--run"],
  onLine(line) { /* Interpret the helper's line protocol. */ },
});
```

The driver reads the executable from captured package resources, then the host
launches that image in a private temporary directory and passes arguments
directly. The helper runs under the user's OS account. A Windows Job Object
controls lifetime. It does not restrict OS privileges. No app-specific
operations are built into this protocol.

Write a single UTF-8 line to `helper.write(line)`, listen to standard output
with `onLine`, and await `helper.wait()` for the exit code. Standard error is
discarded. `helper.dispose()` stops the process and releases its resources.
Activation shutdown stops the helper automatically. The driver bounds binary
size, argument length, input buffering and output rate. Process start, exit
and protocol errors are logged without arguments or output text.

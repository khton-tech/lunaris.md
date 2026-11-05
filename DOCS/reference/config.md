# Config manager

## Responsibilities and storage

Required: global settings outside Vaults, `.lunaris/config.toml` per Vault, local
precedence, and plugin access to their own/other namespaces. Existing: SDK
contracts/permissions, Logger, application directory, versioned filesystem writes
and Vault preparation. New: `@lunaris/config` contracts and
`@lunaris/config-manager` under `plugins/systems/config`. No SDK/kernel or native
driver changes are needed. The plugin separates API composition, TOML codec and
serialized storage; all I/O goes through SDK providers.

Global `config.toml` lives in the application config directory returned by
`ApplicationDirectory.openConfig(ctx.signal)`. Activation creates and validates it.
The `PrepareVault` handler (priority `-100`) creates `.lunaris` and its config file
before Vault readiness. An already-active Vault is prepared during activation too.
Existing files are validated without being rewritten. Invalid global config fails
activation. Failed local preparation preserves the previous active Vault.
Creation uses `create` mode; an external creation race reads/validates the winner.

```toml
[plugins."example.editor"]
theme = "dark"
enabled = true

[plugins."example.editor".font]
size = 14
family = "Mono"

[plugins."other.plugin"]
showStatus = false
```

`plugins`, if present, must be a table containing plugin tables. Other root metadata
and namespaces are preserved. Writes serialize the whole document; comments,
whitespace and original float/integer spelling are not retained. The codec pins
`smol-toml@1.9.1`; see its [documentation](https://github.com/squirrelchat/smol-toml).

## SDK usage

Add `@lunaris/config`, require `api:lunaris.config@^1.0.0`, and declare/obtain
`config.access`. Consumers need no filesystem/native grants. Acquire during activation:

```ts
import { Config } from "@lunaris/config";

const config = ctx.use(Config);
const theme = await config.get(ctx.pluginId, "theme");
await config.set(ctx.pluginId, "theme", "dark", { scope: "global" });
await config.set(ctx.pluginId, "theme", "light", { scope: "vault" });
await config.set("other.plugin", "enabled", false, { scope: "global" });
await config.remove(ctx.pluginId, "theme", { scope: "vault" });
```

All async methods return `ConfigResult<T>`: `{ ok: true, value }` or
`{ ok: false, error }`. Inspect `ok` before using `value`.

| Method | Result value |
|---|---|
| `read(pluginId, options?)` | Detached plugin table; `{}` for an absent namespace. |
| `get(pluginId, key, options?)` | Detached value, or `undefined` for an absent key. |
| `set(pluginId, key, value, target)` | `null` after persistence. |
| `remove(pluginId, key, target)` | `true` after removal; `false` when absent, without writing/emitting. |

Reads select `global`, `vault`, or `effective` (default). Writes require explicit
`global`/`vault` targets. Vault/effective options optionally accept `vaultId`;
otherwise the active ID is captured before asynchronous work. Keys are literal:
`"font.size"` is one key. Assigning a table replaces that stored key in the chosen
layer. `config.access` intentionally permits all namespaces; IDs select sections,
not authenticated callers. Use `ctx.pluginId` for your own section.

## Precedence and values

Effective reads merge global/local tables recursively. Local arrays, scalars and
dates replace global values, including `false`, `0`, `""` and empty arrays. An empty
local table contributes no overrides to a global table. If either side is not a
table, the local value wins. Removing a local key reveals the global fallback;
removing a global key leaves local values intact. Without an active Vault, effective
reads use global settings. Explicit Vault scope without an ID returns `NO_VAULT`.

Values support TOML strings, booleans, numbers (including `inf`/`nan`), signed 64-bit
integers, arrays, tables and dates/times. Large integers read as `bigint`; safe
integers read as `number`. Date-derived snapshots preserve local/date/time forms
through `toISOString()`, at millisecond precision. Native Date inputs become offset
datetimes. Null/undefined, functions, accessors, sparse arrays, cycles, unsupported
class instances, unsafe integer numbers and nesting beyond 64 levels are rejected.
Reserved object keys `__proto__`, `constructor` and `prototype` are forbidden.
Inputs are copied before queuing; outputs never alias shared config state.

## Consistency, errors and lifecycle

Every operation reads current contents, so external edits are visible without a
cache/watch service. Missing files read as empty layers; malformed/unreadable files
return errors without silent fallback or overwriting. Mutations serialize per file,
preserve other namespaces, then use `replace` with `expectedVersion`, or `create`
when missing. External conflicts return `CONFLICT`; retry explicitly after rereading.
Effective reads are two file reads, not a cross-file atomic transaction.

Errors include filesystem codes plus `INVALID_TOML`, `INVALID_CONFIG`,
`INVALID_VALUE`, `NO_VAULT` and `STOPPED`. Expected errors remain results;
SDK declaration/permission/scope errors retain SDK behavior. Parser diagnostics
are replaced with safe domain errors because upstream errors can include secrets.
Logger receives readiness/save/failure context without config values or TOML source.

Captured IDs prevent switching from redirecting pending work. Writes not accepted
before root closure can return `VAULT_CLOSED`; accepted native writes drain before
closure. Shutdown cancels the global root, rejects queued work, and emits no late
success events. A native write accepted before shutdown may persist even when its
caller receives `STOPPED`; inspect stored data after restart before retrying.
Cleanup never invokes closed SDK handles.

Also require `event:lunaris.config-changed@^1.0.0` to subscribe through
`ctx.events.on(ConfigChanged, handler)`. Persisted mutations emit
`{ pluginId, key, scope, vaultId, kind: "set" | "removed" }` without values.
Notifications are asynchronous. External edits and Vault switches emit no config
mutation event; observe `VaultChanged` for context changes.

## Composition and verification

Tauri starts config manager before theme-settings and the loading runner. Both
consumers read their own namespaces through Config; theme-settings selects the
theme before runner rendering. See [runner configuration](../../plugins/UI/lunaris-runner/DOCS/README.md).
Dependencies start Vault Manager,
filesystem provider/driver and logging first. The manager receives
`filesystem.access`, `filesystem.app-config`, and `vault.access`. Startup opens no
selection dialog. Replacement uses standard SDK provider selection.

Run `npm run config:check` for contracts/manager/host tests, types and boundaries,
then `npm run build --workspace @lunaris/tauri` for the frontend bundle. Tests use
the real SDK/kernel/provider/driver chain with an in-memory native transport.
Existing native filesystem tests cover physical I/O; no user files are changed and
desktop automation is not used.

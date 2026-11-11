# Package resources

`ctx.resources` is the SDK's activation-bound, read-only package asset contract.
It needs no filesystem permission and accepts no Vault IDs, plugin IDs, URLs or
host paths. Lime passes only `assets/` entries from the inspected exact archive.

```ts
const labels = JSON.parse(ctx.resources.text('assets/labels.json'));
const entries = ctx.resources.list(); // { path, byteLength }[]
const bytes = ctx.resources.read('assets/model.bin', 0, 16384);
```

`list()` returns immutable metadata. `read(path, offset = 0, length = 16384)`
returns a fresh immutable array of bytes, truncated at EOF. Offset must be an
integer in [0, file size]; length must be an integer in [0, 16384]. Use repeated
bounded reads for large binary assets. `text(path)` strictly decodes UTF-8, strips
an initial BOM and rejects assets larger than 64 KiB. Malformed input, unknown
paths and invalid ranges throw `LunarisError` with `VALIDATION_FAILED`.

Paths use canonical case-sensitive ASCII package names under `assets/`, with the
portable LUP path restrictions. The adapter rejects traversal, case aliases,
reserved device names, file/directory collisions and invalid bytes. Limits are
512 resources, 16 MiB per file and 32 MiB total. Source modules and manifest bytes
are not exposed through this contract. No resource is evaluated by reading it.

Bytes are copied at registration/load before queued activation. Changing input
arrays afterwards cannot alter installed behavior. Every reader is bound to the
activation signal: stop, failure, replacement and environment teardown revoke old
handles with `SCOPE_CLOSED`. New activations get fresh readers. Failed replacement
restores both previous code and its captured resource bytes.

Trusted native composition can pass `{ resources }` to `Kernel.register` or
`Kernel.replace`. Replacement without resources supplies an empty set; it never
silently inherits the previous package's files. Ordinary definitions still accept
only manifest/activate. The SDK's `capturePackageResources(files)` is an
authority-neutral adapter utility that snapshots byte data and returns a function
binding a reader to a cancellation signal; it does not open files or grant access.

Integration: CLI asset inclusion, Lime archive loading and actual isolated
QuickJS SDK reads are implemented. Controls consuming images/audio still need
explicit renderer roles; this contract does not expose DOM objects or host URLs.
Native/WebView and visual acceptance remain separate from the Node tests.

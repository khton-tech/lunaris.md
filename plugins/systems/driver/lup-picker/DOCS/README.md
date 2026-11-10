# LUP picker driver

`createLupPicker(document?)` from `@lunaris/lup-picker` defines
`lunaris.lup-picker`. It provides `LimePackagePicker` 1.0 from `@lunaris/lime`.
The trusted importer requires `runtime.manage`; ordinary installed code must not
receive this management contract. Logger is required for readiness, selection
outcomes, unavailable host behavior and original read failures. Filenames/paths
and file payloads are never logged. No events/hooks are subscribed.

`pick(owner)` returns a Promise of LimeResult containing Uint8Array bytes, or
successful null on cancel. A hidden browser file input selects one `.lup`; its
File grants access to that selection only. No arbitrary outside-path reader,
directory access or native IPC is exposed. Extension and shared archive size
limits are checked before reading; the engine still performs full LUP validation.
Call from a user gesture without an intervening asynchronous queue before pick.

Only one picker may be open. Owner/driver cancellation removes its input and
listeners and discards late reads. Repeated change events cannot start duplicate
reads. Cancel uses the native input cancel event. This is transport only: selection
does not install or evaluate any package code and cannot substitute for preview.

DOM tests cover selected byte reads, busy/cancel, late read cancellation, driver
shutdown and invalid selections. Real browser/WebView file dialogs, user-gesture
policy and cancel-event behavior remain manual host acceptance. No product UI
control is rendered; the browser owns the native file dialog. Lime engine/UI and
host composition integration remain pending.

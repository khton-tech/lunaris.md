# Clipboard

@lunaris/clipboard defines Clipboard and ClipboardDriver 1.0. capabilities() returns
read/write booleans. readText() and writeText(text) return asynchronous typed
ClipboardResult values: ok/value or error with UNSUPPORTED, DENIED, FAILED or
CANCELLED. Clipboard requires clipboard.access; a driver additionally needs
clipboard.native to provide ClipboardDriver. No clipboard contents enter logs.

The replaceable clipboard-provider delegates to ClipboardDriver. The shared host
registers browser-clipboard for browser and WebView targets; future native adapters
can replace it without changing editor consumers. This driver uses only the modern
navigator.clipboard text API, never deprecated execCommand or an internal clipboard
masquerading as the system clipboard. API availability does not guarantee permission.
Browser secure-context, document-focus and user-activation restrictions apply; see
[the specification](https://www.w3.org/TR/clipboard-apis/). When the API is absent,
menu actions requiring that capability are omitted. Native keyboard cut/copy/paste
remain handled by CodeMirror/browser events. When permission is denied, the editor
shows a localized command error and retains the selected text. Pending results are
invalidated on driver shutdown; editor commands also verify their captured buffer
before applying asynchronous clipboard results.

The driver logs readiness, degradation, operation outcomes and original errors;
the provider logs readiness and delegates platform outcomes to that driver. Neither
stores clipboard contents. Both release all SDK access after scope closure.

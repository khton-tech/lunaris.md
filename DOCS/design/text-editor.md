# CodeMirror 6 editor integration

Implemented on 2026-11-07 after Owner approval of SDK extensions and a 2000 ms
autosave delay. Native visual acceptance remains manual. The
[plugin guide](../../plugins/UI/text-editor/DOCS/README.md) specifies usage,
public component props, all integrations and the manual acceptance checklist.

## Responsibility and ownership

The text-editor plugin owns Markdown sessions, save policy and the CodeMirror
adapter. It consumes ActiveDocument as file identity, Filesystem for reads and
version-checked writes, and Vault for root lifetime. ActiveScreen selects and
retains its screen inside Workspace. Existing File Explorer operations connect
through those same contracts. Logger and Localization remain replaceable SDK
services. No direct platform file access, React/Mantine consumer imports or
private cross-plugin dependencies are introduced.

Workspace owns external geometry and the open main surface. ActiveScreen owns
screen visibility. The shared Mantine text-editor role owns header/status/recovery
controls and lends a stable target. CodeMirror owns text, caret, selection and
scrolling within that target. Embedded surfaces stay transparent, without a new
card, border or shell. Themes updates view compartments without replacing the
buffer/history. The reference is the existing Workspace and Settings composition;
[Mantine UI](https://ui.mantine.dev/) was consulted for shared composition patterns.
CodeMirror styling follows its [official guide](https://codemirror.net/examples/styling/).

## SDK gaps and implemented resolution

The original contracts notified consumers only after releasing Vault roots or
changing document identity. They could not wait for pending text saves, reject
unsafe departure, or distinguish file opening from relocation. The implementation
adds domain contracts using the existing SDK hook/event primitives:

| Boundary | Implementation |
| --- | --- |
| Voluntary document open/close | BeforeActiveDocumentChange flushes before identity/persistence commit |
| Committed document transition | Additive ActiveDocumentTransitioned carries previous/current/reason; existing 1.0 snapshot event is preserved |
| Same-file activation | Successful open emits a transition even when identity is unchanged, allowing return from Settings |
| Vault close/switch | BeforeVaultRelease runs while the old root is writable; failure preserves it and releases only the candidate |
| Structural move/copy/remove | BeforeFileMutation flushes/locks affected buffers; committed completion retargets cached sessions before returning to Explorer |
| Normal desktop window close | Host SDK bridge calls Vault.close before kernel shutdown and rejects closure on save failure |

Guard payloads carry nullable failures and onSettled callbacks. Register completion
before awaiting; callbacks release edit locks on success, rejection or a later
handler exception. Inputs snapshot identities. Structural operations serialize,
but text writes stay outside that queue so hook-initiated flushes cannot deadlock.
No blanket content-write hook was added: optimistic file versions detect competing
content writes, and the editor never uses upsert or force overwrite. External OS
changes cannot be vetoed.

Vault close waits for closing listeners outside the transition lock, avoiding
shutdown while asynchronous consumers are still processing that notification.
Open/switch notifications retain asynchronous behavior. Handlers must not
recursively request the operation they guard.

## Initial behavior and acceptance

The editor supports Markdown source, wrapping, undo/redo, ordinary text shortcuts,
Mod-S and two-second debounced autosave. Explicit transitions flush immediately.
Writes serialize per session and preserve CRLF. Conflicts keep local text and
expose retry/explicit discard-and-reload. Read failures never substitute an editable
empty document. Dirty buffers survive failed reads and saves. Loading temporarily
blocks edits so late reads cannot overwrite new input. Cleanup cancels timers
and performs no SDK access after cancellation.

All code integrations above are connected. Targeted tests cover session timing,
concurrent writes, version conflicts, transition rejection, native-close bridge,
committed file moves/deletion, provider shutdown, composed screen/role ownership,
Settings return, history/selection retention, renderer replacement and CRLF.
Production frontend bundling also passes. JSDOM text geometry is stubbed; these
tests establish behavior and DOM properties, not native visual acceptance.

Native dark/light contrast, caret/selection/focus, narrow/short layouts, actual
scrolling and recovery-state appearance remain manual in the real Workspace.
Tabs, formatting/search UI, merge/force-overwrite and durable recovery
drafts are outside this initial scope. Forced shutdown, host recovery, plugin
removal, process crashes and browser refresh do not promise draft persistence.
Renderer replacement restores document/history/selection, not native scroll
geometry; hiding/theming a live view preserves its existing scrolling.

The subsequent [Live Preview foundation](live-preview.md) adds inline Markdown
presentation. The editor header was subsequently removed at the Owner's request. Its supported syntax and outstanding
Obsidian-specific renderers are documented separately.

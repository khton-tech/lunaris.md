# CodeMirror 6 editor: integration boundary

Status: proposed on 2026-11-07. Implementation is blocked by document lifecycle
contracts, under the repository's Strict SDK Dependency rule. No editor plugin
or SDK changes have been implemented by this document.

## Initial product scope

Provide a replaceable `plugins/UI/text-editor` plugin using CodeMirror 6 for
Markdown source editing. Open the file selected through ActiveDocument in the
existing ActiveScreen container; preserve undo history and selection while the
screen is hidden by Settings. Include wrapping, Markdown syntax, standard text
editing/undo shortcuts and explicit Save (Mod-S). Autosave policy is a separate
product decision; it cannot substitute for awaited lifecycle coordination.

Do not add tabs, preview, a formatting toolbar, line-number gutters, a minimap,
or a second application shell in the initial version.

## Existing contracts and responsibilities

| Responsibility | Existing public SDK contract | Required work |
| --- | --- | --- |
| Active file identity and restoration | ActiveDocument / ActiveDocumentChanged | Add transition semantics described below |
| File reads and version-checked writes | Filesystem | Reuse readText and writeText with mode replace and expectedVersion |
| Main content selection and caching | ActiveScreen / ActiveScreenChanged | Register the editor screen; select on accepted document opening |
| Region layout and surface | Workspace and Mantine workspace/active-screen roles | Reuse without modifying borrowed targets |
| Editor states and actions | Components | Add a documented Mantine editor role |
| Appearance | Themes / ThemeChanged | Reconfigure CodeMirror without rebuilding its document/history |
| User-facing messages | Localization / LocaleChanged | Register an English-first editor catalog |
| Diagnostics | Logger | Require it; use ctx.pluginId as source; never log document content |

No new kernel primitive is needed: SDK already supports asynchronous hooks.
The missing pieces are domain contracts and provider enforcement, not access to
native APIs or a need for a parallel plugin framework.

## Confirmed lifecycle blockers

### Vault release occurs before editor notification

`plugins/systems/vault/src/index.ts` closes the previous filesystem root and
disposes its attachment before publishing VaultChanged on close or switch.
That event is deliberately fire-and-forget. An editor listener cannot use it to
await a pending save or reject departure after a conflict or write failure.
PrepareVault prepares the candidate; it is not a release guard and does not
cover closing without a replacement.

Required contract: an awaited `BeforeVaultRelease` hook in `@lunaris/vault`,
with the previous Vault, proposed replacement (or null), reason (close/switch),
and a nullable structured failure. Run it while the old root is usable and
before any irreversible release. Preserve a preceding handler's failure. A
failure or thrown handler must keep the old Vault and its scopes active and
release only the uncommitted candidate. Return a documented transition failure
to the caller. All open routes, including recent Vaults and creation, must use
the same transition boundary. Handlers must not recursively request transitions.

This hook covers normal product transitions, not forced process termination or
kernel scope cancellation. Shutdown/recovery draft persistence needs a separate
explicit policy before any crash-recovery guarantee can be made; cleanup cannot
call SDK services after scope closure.

### Document notifications lose transition identity

`packages/active-document/src/index.ts` exposes only `{ current }` in
ActiveDocumentChanged. The provider publishes that shape both for opening a
different file and for relocating the current file after a move. Those cases
require different editor behavior: load a separate buffer versus preserve and
retarget the existing buffer, selection and history. Comparing paths, contents,
DOM structure or plugin IDs cannot determine the operation reliably.

Required contract: a versioned transition event with `previous`, `current` and
an explicit reason (open/close/restore/relocate/reconcile). For relocation,
publish authoritative source and destination, including directory moves. The
provider must describe the committed operation, not force the editor to infer it
from two snapshots. Keep existing 1.0 consumers supported or migrate all
declarations atomically; token versions are part of runtime identity.

Required contract: an awaited `BeforeActiveDocumentChange` hook for voluntary
open/close, executed before replacing the active identity. Carry previous,
proposed current, reason and a nullable failure. Rejecting the hook retains the
old identity and persisted selection. Serialize accepted operations and discard
stale work across Vault transitions. Restoration/reconciliation must be explicitly
distinguished from voluntary navigation; an externally deleted file cannot be
kept alive by rejecting its notification, but its unsaved buffer must be retained.

### File mutations can invalidate an editor save target

File Explorer currently moves files first and then calls ActiveDocument.relocate.
Deletion similarly precedes reconciliation. An identity hook alone cannot
coordinate a pending write with those operations. Without coordination, a save
may fail against the old name or race a move/delete. Using upsert would risk
recreating a removed file and is not an acceptable workaround.

Required behavior: serialize relevant save and mutation operations through an
awaited public Filesystem provider contract for move/remove/replace. Expose a
before-mutation hook carrying immutable operation identity and affected relative
targets, with a nullable failure. Include directory descendants and overwrite
destinations. Check it before provider mutation, across every caller, while the
targets are still usable. Preserve prior failure and reject on handler errors.
An editor saves or rejects the mutation and blocks new edits for its duration;
publish an authoritative completion outcome on both success and failure so it
can resume editing and retarget only after success. Define ordering with the
provider's existing queue to avoid nested write deadlocks. External OS changes
remain observations, not vetoable mutations.

## Editor implementation after contracts are available

Keep the controller, document session and CodeMirror adapter separate within the
editor plugin. Sessions track target, base text/version, dirty revision, pending
save and failure. Capture a revision when saving; a completed write marks only
that revision saved. Serialize writes per session. Conflicts retain the buffer
and offer explicit recovery; never force overwrite or silently reload dirty text.
Late reads must not replace a newer active document. Failed or missing files
produce localized recovery states, with no editable empty buffer substituted for
an unsuccessful read. Start with Markdown; unsupported files need an explicit
non-editable state, not an attempted binary decode.

CodeMirror remains inside this plugin without React/Mantine imports. The shared
`lunaris.text-editor` Mantine role supplies loading/error/empty states, Save and
retry actions, plus a stable owned target through a documented onTarget callback.
Mount CodeMirror after the SDK component mount returns, matching the existing
target-lending pattern. A replacement component set can implement the same role.
Role callbacks must be inert after owner cancellation.

ActiveScreen preserves the hidden editor screen while Settings is open. Changing
focus or Sidebar selection must not change the active document. Clicking an
already active file must provide an explicit route back from Settings; the
current provider suppresses same-target change events, so define that route in
the public document activation semantics rather than listening for DOM clicks.

## Visual ownership and reference

The product reference is the existing open Workspace main region and the Settings
screen hosted in ActiveScreen. Consulted composition catalog: [Mantine UI](https://ui.mantine.dev/).
CodeMirror configuration and scoped styling follow its [styling guide](https://codemirror.net/examples/styling/).

Workspace owns placement, external spacing and the open main surface. ActiveScreen
owns selected-screen geometry and visibility. The Mantine role owns its inner
layout, controls and stable editor target. CodeMirror owns only text, selection,
caret and scrolling inside that target. Embedded roots and editor backgrounds
remain transparent; no enclosing card, border or shadow is added.

Use semantic theme text, secondary text, selection and caret colors, theme
typography and responsive internal spacing. Wrap long lines and allow region-local
wheel/touch/keyboard scrolling without native scrollbar chrome. Use a single
focus treatment without a panel-sized outline. Keep Markdown source readable
without introducing an unrelated colorful code palette. Theme changes must retain
text, history, selection and scroll position. Mantine owns all product controls;
do not enable CodeMirror's default product search panel without a deliberate
UIKit integration.

## Integration and acceptance gates

Required integrations remain outstanding: Vault Manager release guard; Active
Document transition hook/event and repeated activation semantics; Filesystem
mutation coordination; File Explorer committed relocation/open behavior; Mantine
editor role; Tauri plugin registration, entrypoint and permission grants.

Targeted regression coverage must exercise:

- Normal opening, same-target activation from Settings, restoration and stale reads.
- Editing, undo/redo, serialized saves, edits made during a save and version conflicts.
- Failed saves blocking voluntary document/Vault departure while roots remain usable.
- Vault switch via every entry route, candidate cleanup on rejection and hook errors.
- File/folder moves, deletion, overwrite destinations and failed mutations during saves.
- External modification/deletion preserving dirty buffers without recreating files.
- Hidden-screen retention, theme/locale updates, renderer replacement and owner cleanup.

Native visual acceptance is manual under AGENTS.md: inspect the composed editor
inside Workspace in dark/light themes, with Settings open/closed, empty/populated/
failed states, keyboard focus, selections, long Markdown and narrow/short windows.
Automated behavior checks do not establish that visual acceptance.

# Runtime and UI stability review

Changes are committed on `refactor/runtime-ui-stability`. Plugin boundaries,
public SDK access, replaceable providers and existing product capabilities are
preserved. This review covers the confirmed runtime, creation, navigation,
editor, observation and link-index issues addressed in this branch.

## Corrected mechanisms

- Web and Tauri react to coalesced kernel lifecycle/resource/diagnostic changes.
  Their 250 ms inspection timers are removed. Equal validated contract versions
  skip repeated SemVer parsing while dynamic access checks remain active.
- Workspace updates changed contributions and retains unrelated views. Sidebar
  tool state preserves rail/mobile navigation contributions. UIKit shares its
  translated active theme across roots and ignores unselected theme changes.
- Explorer stages directory snapshots, targets affected parents after mutations,
  and serializes watch reconciliation with mutations. Generations discard stale
  scans and isolate Vault runners. Disclosure and recovery retry uncached open
  folders, including concurrent ancestor relocation. Confirmed creation releases
  its draft independently of subsequent document activation.
- Editor refreshes share in-flight work and accept one authoritative read.
  External content updates retain EditorView, focus, selection and scrollers.
  Undo history starts from the accepted disk version. Superseded draft writes
  are skipped, and navigation waits for obsolete recovery cleanup after Undo.
  Unchanged chrome and footer props retain their mounted views.
- Backlink queries reuse unchanged source groups and share indexed path lookup.
  The public NoteLinksChanged contract reports path presence/completeness to
  DocumentLinks. BacklinksChanged continues to update mention consumers.
- ActiveScreen publishes a blank/unavailable placeholder once and explicitly
  refreshes compact presentation when its mobile actions become ready.

## Evidence

- Warm Explorer creation over 22 cached directories uses 1 listing and 3 model
  notifications, previously 22 listings and 46 notifications. The executable
  fixture and results are in `.AI_DOCS/explorer-work-counts.json`.
- Ten status updates cause zero document-view updates. Ten tool-state updates
  preserve navigation descriptors. Body edits reuse unchanged mention groups.
- A blocked draft write followed by 100 edits persists the active and latest
  snapshots. External refresh uses one filesystem read per accepted update.
- The local 2,000-path/2,000-resolution benchmark changed from approximately
  340–348 ms to 4–8 ms, including index construction in the updated measurement.
  `tools/scripts/benchmark-note-links.mjs` reproduces the current measurement.
  Resolver and instrumented SDK-boundary samples are recorded in `.AI_DOCS/`.

## Verification

- `npm run check -- kernel` passed 383 tests with zero skips.
- The targeted check for text-editor, mantine-components, file-explorer,
  workspace-plugin, sidebar-plugin, active-screen-plugin, backlink-index and
  document-links passed 377 tests with zero skips, builds, boundaries and public
  type fixtures. These check groups overlap in host coverage.
- `system-review.mjs` passed 24 regressions and `deep-review.mjs` passed 5.
- The integrated real-plugin creation scenario verifies a single file/tree row,
  active tab, editing, navigation, saving and reopening inside WorkspaceLayout.
- Final Web and Tauri frontend production builds passed. `git diff --check` passed.

## Remaining verification and limits

Native/WebView visual acceptance, frame timing and end-to-end input latency remain
unmeasured. DOM tests verify state, identity and scroll properties without layout
or GPU rendering. Desktop automation was unused. A native installer was unbuilt.
Vite retains its large-chunk warning. The largest Web chunk is 1,908.89 kB
minified / 595.68 kB gzip, and the Tauri application chunk is 1,815.18 kB /
567.71 kB gzip. Explicit or ambiguous filesystem rescans still reconcile the
known tree. Server notification protocol and deployment are unchanged.

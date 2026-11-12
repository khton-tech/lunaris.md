# Backlinks SDK

`Backlinks` and `BacklinksChanged` are replaceable contracts requiring
`vault.access`. The default provider is `plugins/systems/backlink-index`.

- `query(target, excludedPaths?)` returns linked/unlinked source groups and index
  state (`loading`, `ready`, `degraded`). Exclusions affect only unlinked mentions.
- `refresh()` reconciles the current Vault and forces source reads.
- `link(target, source, mention, expectedText)` validates a fresh unlinked occurrence
  and delegates one undoable edit to DocumentContent.
- `BacklinksChanged` invalidates queries for its Vault; it contains no document text.

Each group contains a source FileTarget, its text snapshot, modification timestamp
and UTF-16 mention ranges. Line numbers are one-based; paragraph context bounds
are UTF-16 offsets. Consumers must pass the displayed snapshot to DocumentContent
when navigating instead of silently interpreting stale offsets against new text.

No provider implementation, editor instance, DOM or native filesystem access is
exposed. See [the feature reference](../../../DOCS/reference/backlinks.md).

## Shared note-link navigation

NoteLinks.parse(text) returns explicit/internal and external link source ranges. NoteLinks.resolve(source, link) returns a target, text snapshot and heading/block range, or a structured failure. It shares the backlink provider parser and path resolver. Navigation consumers use DocumentContent.reveal to open that result. External destinations must go through ExternalLinks instead.

NoteLinks.missingTargets(source, links) returns the source offsets of creatable
wikilinks absent from a complete path listing. NoteLinksChanged carries
`{ vaultId }` and invalidates path presence or listing completeness. DocumentLinks
subscribes to this event for missing-link decorations. Text changes publish
BacklinksChanged for mention consumers and leave path-presence subscribers idle.

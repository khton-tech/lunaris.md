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

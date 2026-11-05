# Vault selector: interface and contract requirements

Status: proposed; product implementation is blocked by missing public contracts.
This document does not introduce executable APIs. Follow [UI guidelines](../UI_GUIDELINES.md).

## Interface

Use two panels: recent Vaults on the left (one third), actions on the right
(two thirds).
On narrow surfaces, stack actions before recents; permit wrapping and scrolling
without clipping controls or long folder labels.

Place the existing ASCII logo from `resources/ascii_art.txt` above the actions
in the right panel. Supply the artwork through trusted host composition, as
with Lunaris Runner; the selector must not read repository files directly.
Preserve whitespace and monospace rendering, inherit the active theme, provide
a localized accessible name, and keep the logo non-selectable. Adapt its size
to the available width without distorting it or forcing page-wide overflow.

Initially show two actions: Create Vault and Select Vault. Each expands a card
directly below its action; only one card is expanded at a time.

- Create: select a folder using an icon-only Browse button, then enter a Vault
  name, then press Next.
- Select: select a folder using the same Browse control, then press Next.
- Proposed create semantics: the selected folder is the Vault root; the entered
  name is its display name, not a request to create a nested directory. This
  interpretation still needs Owner clarification before implementation.
- Accept empty and populated folders. Existing unrelated content is preserved.
  Config Manager creates missing `.lunaris/config.toml` during preparation and
  validates existing configuration without overwriting it.
- Browse only selects a candidate. Next prepares and activates it. Cancelling
  Browse preserves the previous selection; changing cards does not activate it.
- Disable Next until selection and required name are valid. Prevent duplicate
  submissions during browsing/opening. Show localized errors inside the card,
  preserve entered values, and permit retry.
- Recent entries reopen their stored location through the manager. Unavailable
  locations show a recoverable error; do not silently remove their history.
  No fabricated entries are shown before the first successful open.

Use the Lucide icon pack initially. Browse requires a localized accessible name
and tooltip despite having no visible text. Icons inherit current color and
theme geometry. Keep keyboard navigation, visible focus, labelled inputs,
expanded-state announcements, and reduced-motion behavior. Avoid decorative
panels, explanatory filler, and selectable interface chrome.

## Existing capabilities and missing contracts

Existing services cover Logger, localization, slot allocation/DOM targets,
component roles, active themes, global Config persistence, and Vault preparation.
`LunarisComponentsKit` currently supplies only the startup-screen role; add
the selector and its reusable controls there, consumed through `Components`.

The current `Vault` API provides only `current()`, `open()`, and `close()`.
`open()` combines folder selection, preparation, and activation. `FilesystemRoots`
can select a temporary owned root but Vault Manager cannot accept that candidate.
`VaultRoot` exposes only a session ID and name. Neither is a persistent location
reference, and no contract can restore that location after restart. There is
also no explicit display-name input to Vault preparation/opening.

Calling native dialogs from the UI, persisting temporary root IDs, or closing
and reselecting a folder on Next would bypass the intended public boundary or
fail the requested behavior. Do not implement those workarounds.

## Required public contract extension

Extend domain contracts and their provider/driver chain; the SDK/kernel runtime
does not currently require changes. Method names below are proposed, not shipped.

1. Add `Vault.selectLocation(owner)` returning a result containing a nullable
   candidate: opaque location reference plus a safe folder display label. Selection
   must not prepare files, publish an active Vault, or close the current Vault.
   Candidate resources are owned by the supplied cancellation signal.
2. Add `Vault.openLocation(location, options)` accepting that reference and an
   optional display name. It attaches a manager-owned root, validates input,
   runs `PrepareVault`, and commits through the existing coordinated transition.
   Define `options.name` as persisted product metadata, separate from a filesystem
   folder name. Config Manager must persist it before readiness without replacing
   unrelated configuration. Existing stored names take precedence when simply
   reopening a location.
3. Add corresponding location selection/attachment operations to the public
   filesystem-root provider and driver contracts. Drivers own native path/bookmark
   resolution and target-specific permissions. References must survive restart,
   be serializable for global Config storage, and never be treated as raw paths
   by product plugins. A presentation label grants no filesystem authority.
4. Specify reference validation, ownership, stable location identity for history
   deduplication, and errors for unavailable/moved folders, revoked access,
   unsupported restoration, invalid names, concurrent transitions, and shutdown.
   Reject invalid locations without falling back to an unintended directory.
5. Preserve the existing `open()` convenience workflow and failure guarantees:
   preparation failure leaves the current Vault active; cancellation releases
   candidates; a late result cannot resurrect a stopped plugin. Version changed
   contracts and migrate validators, declarations, grants, and providers together.

Recent history belongs to a small dedicated service/provider rather than the
rendering component. Persist successful opens through global Config, deduplicate
by location identity, and publish immutable history snapshots through a public
contract. A history-save failure must not misreport an already committed open as
failed: log degradation and keep the active Vault usable. Never log references,
paths, names, or config payloads. Logger calls use the plugin ID as source.

## Integration and verification required before delivery

Integration remains outstanding across Vault Manager, filesystem provider,
target driver, Config Manager, recent-history provider, Components Kit,
selector controller, and Tauri composition. The selector lives under
`plugins/UI/vault-selector`; it acquires all services through declared SDK
contracts. Themes flow through the kit, localized text through props, and
rendering through component roles and allocated slots. Coordinate the runner's
loaded state with showing the selector so both do not retain competing screens.

Targeted checks must cover selection without writes/activation, cancel/retry,
Next using the chosen location without a second dialog, duplicate submissions,
creation in empty/populated folders, preservation of existing files/config,
invalid config rejection, display-name persistence, history after restart,
missing locations, history-save degradation, and shutdown during pending work.
Use injected native transports and temporary directories. Component checks cover
keyboard/accessibility behavior, localization changes, theme changes, and narrow
layouts. Native-dialog appearance and final desktop visual acceptance require
manual Owner testing; automated desktop control is prohibited.

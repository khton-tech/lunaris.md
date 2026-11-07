# Settings integration audit

Date: 2026-11-07. Status: proposal based on current documentation, public
contracts and product source. No concrete settings integration is implemented
by this audit. Proposed options, keys and category IDs are not shipped contracts.

Owner scope update, 2026-11-07: integrate language and theme selection only;
do not change File Explorer. The implementation uses a separate
[interface-preference controller](../../plugins/UI/interface-settings/DOCS/README.md)
with its own Vault namespace, preserving the existing startup theme controller.
Its documentation supersedes the proposed controller placement and delivery order
below. Explorer candidates remain deferred, regardless of their technical readiness.

## Scope and existing foundation

The [Settings reference](../reference/settings.md) and
[backlog](../Backlog.md) define immediate, current-Vault preferences only.
The registry describes UI contributions; it is neither a value store nor a
generic configuration editor. Existing global/startup configuration is not
automatically eligible for this screen.

Already available: Settings categories/sections, explicit Workspace Vault
context, owned component mounts, Config explicit Vault targets and mutation
events, Vault lifecycle, Themes, Localization, Logger and Mantine rendering.
Missing: concrete settings controllers and Mantine section roles. Create those
only for selected product features; do not introduce a universal schema engine,
parallel value store or a settings dependency into every infrastructure provider.

Audit coverage: default Tauri composition and all current plugin responsibilities:
Settings, active screen/document, Workspace, Sidebar, File Explorer, context menu,
theme registry/engine/settings, localization, runner, Vault selector/history,
Config, filesystem, slots, Logger and their drivers. The retired component kit
is not an integration target. Source links below identify actual behavior;
older backlog descriptions do not override newer contracts/source.

## Candidate preferences

| Preference | Current behavior and owner | Proposed integration | Readiness |
|---|---|---|---|
| Theme | [theme-settings](../../plugins/UI/theme-settings/src/index.ts) reads effective `theme` once during activation. Tauri supplies Monochrome; the engine registers only that palette. | Extend the existing controller to restore/apply a Vault-local `theme`, register an Appearance section, and select through Themes. Keep startup composition policy separate. | Existing Config/Themes contracts support a bounded first-party selector. Decide the no-Vault baseline and restore it on close; add value only when another compatible theme exists. |
| Interface language | [Localization](../reference/localization.md) exposes `locales()`, `locale()`, `setLocale()` and LocaleChanged. It starts in English and has no persistence. Only English ships. | Add a small localization-settings controller with its own proposed `locale` key, General section, Vault restoration and immediate `setLocale()`. The service remains independent of Settings/Config. | Existing contracts support catalogs known at activation. Ship meaningful language choices when translations exist; do not present unavailable languages. Runtime catalog discovery has a separate contract gap below. |
| File ordering | [ExplorerModel.tree](../../plugins/UI/file-explorer/src/model.ts) always groups directories first and sorts names ascending. | File Explorer owns a Files section and proposed `sortDirection: "ascending" \| "descending"`, default ascending. Preserve directory grouping and existing name comparison. Recompute the model view without replacing file identities. | New preference over existing behavior; no new service API is needed if contributed by the owning controller. Requires Config/Settings dependencies and a Mantine section role. |
| Reveal active file | [File Explorer](../../plugins/UI/file-explorer/src/index.ts) expands ancestors on initialization and ActiveDocumentChanged. | Same Files section, proposed `revealActiveFile: boolean`, default true. False stops automatic expansion; active marking, file activation and rename/move/delete synchronization remain intact. Enabling reveals the current file immediately. | New preference over existing behavior. Implement within the explorer controller through current SDK contracts; preserve selection and drafts. |

Theme and language are valid integration areas, but both currently have only one
shipped choice. Do not add alternate palettes/translations as an implicit part of
this audit. Sorting and reveal controls are the smallest immediately useful
proposal; they still require acceptance as new product options.

Use the owning controller's namespace: retain `lunaris.theme-settings.theme`;
place explorer keys under `lunaris.file-explorer`; a new localization controller
uses its own canonical plugin ID. These dotted descriptions identify namespace
plus key, not dotted-key traversal in Config.

## Defer or keep outside Settings

| Area | Decision and reason |
|---|---|
| Side panel width | [Workspace](../reference/workspace.md) already provides drag/keyboard resizing and a reset gesture. Its `sidePanelWidth` is global and read once at activation. Keep that behavior for this milestone; a Vault-local numeric control requires an explicit persistence-policy change and live consumption by Workspace. Config writes alone would not update the layout. |
| Hidden directories | Explorer deliberately filters dot-prefixed directories, including `.lunaris`; dotfiles are not universally hidden. A generic “show hidden files” control would misdescribe existing behavior and change a documented policy. Defer until hidden-directory/system-directory visibility is explicitly designed. |
| Extensions and supported formats | Current `supportedExtensions: ["md"]` controls badges/presentation, not editor capabilities. It must not become an editable supported-format list. Suffix visibility and inline rename behavior are documented product rules, not existing preferences. |
| Typography, density, colors, motion | Currently engine-owned tokens. Directly mutating Themes descriptions from a Settings section would blur ownership and is not a user-override contract. Defer customization until the engine exposes supported inputs and their semantics; preserve OS reduced-motion behavior. |
| Restore active document | [ActiveDocument](../reference/active-document.md) already persists/restores a Vault-local path. This is session state. An optional restoration policy is a separate feature; do not expose the path itself as a preference or duplicate its storage. |
| Vault name | Config preparation persists Vault metadata through the Vault workflow. No public rename-current-Vault operation exists. Do not write another plugin's `name` key from a generic form; design a Vault metadata operation first if an in-place rename UI is requested. |
| Recent Vault history | Global `entries`, a provider retention limit of 20 and the explorer's four visible recent items serve navigation before/between Vaults. They are not current-Vault preferences. List contents are history data; list/open is not a public history-clearing API. |
| Runner details | `lunaris.runner.showDetails` is a real startup-only effective setting. The runner disappears before Settings is available in Tauri. A Vault-local immediate control cannot affect the next pre-Vault startup. Keep it in startup configuration pending a separate application-settings scope. |
| Logger threshold | `minimumLevel` is host factory policy, default info; Logger has no runtime threshold API. Do not expose a control that only edits Config or disables required operational logging. Runtime diagnostics configuration needs a separate public contract and scope decision. |
| Sidebar selection, Settings category, expanded folders, selection, drafts, clipboard | UI/session state, with documented retention and reset rules. Do not turn these into editable settings or silently add restart persistence. |
| Delete confirmation, overwrite rules, root boundaries, permissions | Fixed safety/lifecycle contracts. Do not add confirmation bypass, destructive overwrite or permission toggles. Driver grants and native paths remain host/provider responsibilities. |
| Slots, component registry, context menu, active-screen provider, startup, drivers | Infrastructure or presentation contracts, not a demonstrated need for user preferences. Do not expose timeouts, watcher internals, kernel/provider selection or raw registry data. |
| Editor options, autosave, Markdown rendering, tabs, hotkeys, sync | No corresponding implemented product subsystem to configure. Defer to each future owner's public contracts. |

## Integration contracts and ownership

Contributors register categories/sections through Settings with owned signals.
Proposed categories are General, Appearance and Files; register only categories
with real contributions. Assign exactly one category owner and let other
controllers register sections against its documented ID. Do not register duplicate
categories or build a central plugin containing every feature's business logic.

Each controller owns validation, defaults, live application, persistence and errors.
Its section props carry localized labels, current values, busy/error state and
callbacks. Mantine roles render those props; they never call Config or import
controller implementations. Extend the Mantine plugin rather than importing
React/Mantine into contributors. Consult Mantine UI during implementation.

Workspace owns outer geometry/surfaces, Settings owns navigation/page composition
and section targets, and a section owns only its controls and internal spacing.
Honor embedded/content presentation and [UI ownership](../UI_GUIDELINES.md#7-architectural-ownership-and-composition).
Do not add cards/backgrounds around sections or infer context from DOM ancestry.

For every preference:

1. Read and write the same owning namespace with explicit
   `{ scope: "vault", vaultId: workspace.vaultId }`. An absent value uses the
   feature's declared default; never fall through to effective/global values.
2. Restore behavior on Vault activation/switch even if Settings has never been
   opened. Closing a Vault restores the defined application baseline for
   process-wide theme/locale selection; another Vault must not inherit it.
3. Apply accepted edits immediately without an Apply button or restart. Serialize
   edits and guard asynchronous results with the explicit Vault ID and lifetime.
   Closing a section invalidates its UI callbacks, while feature behavior remains
   owned by the live Vault controller. Never redirect accepted work to a new Vault.
4. Define persistence-failure behavior explicitly. Recommended: retain the last
   confirmed value, show a localized retryable failure, and log the original error.
   A successful save is not proof that live application succeeded; handle both.
5. Subscribe before reading. If observing ConfigChanged, filter namespace, key,
   scope and Vault ID. ConfigChanged covers API mutations, not external file edits;
   do not promise file watching. On VaultChanged reload explicitly.
6. Update localized titles/props without replacing stable sections/inputs. Handle
   missing themes/locales without overwriting stored values. Removing an override
   restores the declared Vault default, not a global/effective fallback.
7. Declare required Logger, API/events and permissions. Log readiness, meaningful
   application/save outcomes and failures without configuration payloads. Cleanup
   never calls closed SDK handles.

Theme and localization are process-wide selectors with Vault-local desired values.
Their controllers therefore need Vault-lifetime restoration, not just callbacks
on a Settings view. Retain a clear distinction between the legacy startup theme
read and future Vault preference reads; no silent global-to-Vault migration.

## Contract gaps and limits

No SDK extension is necessary for owner-contributed explorer preferences or for
selecting currently registered, known-compatible themes/locales. The following
broader requirements must stop at contract design rather than use private access:

- **Live language-pack discovery:** Localization has no catalog-registration/
  removal event. A proposed additive catalog-availability event should publish
  after registration/removal, expose a fresh immutable locale list and follow
  existing ownership/cleanup rules. LocaleChanged alone cannot represent this.
  This is needed only if installed catalogs may change while a selector is open.
- **Arbitrary theme compatibility:** Themes intentionally accepts open data and
  does not certify renderer compatibility. A general installed-theme selector
  needs an agreed engine/renderer compatibility contract before claiming every
  registered theme works. Do not add private-ID or DOM-based compatibility tests.
- **Vault rename:** define a public metadata mutation with explicit Vault identity,
  validation, persistence outcome and committed notification before adding a
  rename form. Existing preparation metadata is not a rename-current-Vault API.
- **Independent controller for Workspace width:** Workspace API registers content;
  it does not expose panel sizing. Prefer a contribution owned by Workspace itself.
  If a separate plugin must control width, first define a public sizing contract
  with snapshot/update/change semantics. Never mutate layout DOM or private slots.

These gaps do not justify extending Settings into a storage, theme or locale service.

## Suggested delivery and verification

1. First bounded integration: accept the two explorer options; extend its
   controller/model, Config/Settings manifest contracts and host grants, add one
   Mantine Files section, and document the resulting live behavior.
2. Extend theme-settings for Vault-lifetime preferences when a useful compatible
   choice is available. Verify startup/selector baseline separately from Workspace.
3. Add localization-settings alongside actual translations. Add catalog discovery
   only if runtime language-pack changes are part of that milestone.
4. Revisit panel width, customization and application settings as separately scoped
   changes; do not expand them into the first integration by implication.

Targeted automated verification must cover absent/invalid values, immediate live
behavior, persistence/restart restoration, consecutive edits and save failures,
Vault A/B isolation, stale callbacks/results, closed views, localization/theme
updates, retained inputs and unavailable dependencies. Explorer checks must retain
active-document synchronization, tree identity, selection and operation drafts.
Use the repository's targeted `tools/scripts/check.mjs` scopes for changed owners,
Settings and Mantine, plus relevant host regressions and documentation audit.

Manual composed-view acceptance remains required for native focus/geometry,
short/narrow windows, long labels and inherited surfaces. Desktop automation is
prohibited. This audit changes documentation only and claims no runtime tests or
native acceptance. All integrations above remain outstanding.

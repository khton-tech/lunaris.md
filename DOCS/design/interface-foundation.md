# Interface foundation proposal

Status: PROPOSED, 2026-11-05. Owner visual approval is pending. This review does
not replace [UI_GUIDELINES.md](../UI_GUIDELINES.md), change approved palettes, or
claim a shipped redesign. It proposes a concrete revision to the selector
specification after approval. The [interactive study](prototypes/vault-manager.html)
contains fictional local data and simulated operations; it does not access files.

## Recommendation

Adopt **Vault manager**: a compact, task-oriented surface with a single reading
axis, recent vaults as the main content, and explicit Open vault / Create vault
actions. Replace the large ASCII artwork and two expanding action cards on the
ordinary selector surface. Keep the existing Light/Dark palettes, system font,
Lucide icons, public SDK boundaries and provider ownership.

Use a dedicated form view in the same content region for creation and candidate
confirmation. Back returns to the list without discarding the draft. A form
should not move unrelated content or require disclosure animation infrastructure.
The alternative **Split manager** in the study retains recents alongside the
form on wide surfaces. Prefer Vault manager for the current small scope; a
permanent sidebar becomes justified when navigation has more than one real task.

Approval is requested for this composition and interaction direction, the
measurements below, and the removal of ASCII art from the ordinary selector.
Startup artwork is an existing explicit requirement: retain it for now; any
change to early boot/Runner is a separate coordinated decision.

## Review method and limits

Reviewed authored UI, controller and theme source, host boot/recovery CSS, the
component/theme/slot contracts, current selector specification and backlog.
No native application window or automated desktop-control tool was used. Findings
about layout are code-based assessments, not observations of a running WebView.
There is no editor in the current product. The proposed future shell below is
a boundary for subsequent work, not an implemented screen.

External guidance was read on 2026-11-05. It informs the recommendation; it does
not prove that one layout is universally preferable or that Lunaris passes WCAG.

## Findings

| Priority | Evidence | Consequence | Proposed correction |
|---|---|---|---|
| High | [Selector styles](../../plugins/UI/components-kit/src/vault-selector-style.ts): 1:2 grid, full-height recent panel, separate main top padding, artwork and reserved status space | A small vault list and two actions occupy separate visual centers; branding and empty space compete with the task | One bounded content column; compact name; recents followed by a stable action area; no reserved empty status row |
| High | [Selector component](../../plugins/UI/components-kit/src/vault-selector.ts): two parallel forms inside expandable actions | Every user must discover a disclosure before seeing the form; implementation maintains two form trees and transition/focus state | One visible task form at a time; explicit Back, meaningful submit label, independent retained drafts |
| High | [Selector controller](../../plugins/UI/vault-selector/src/index.ts): a successful open resets mode and displays current name; no workspace handoff | Opening a vault does not lead to a content workspace; visual changes alone cannot complete that product journey | Show an honest active-vault state now. Define shell/handoff separately before implementing an editor |
| Medium | [Startup](../../plugins/UI/components-kit/src/startup-screen.ts) and selector each interpret theme values independently; startup has component tokens, selector derives most sizes locally | Two screens can drift despite using the same theme registry | One kit-local semantic token resolver; shared text/control roles; component-specific layout tokens only where needed |
| Medium | [Selector styles](../../plugins/UI/components-kit/src/vault-selector-style.ts): multiple nested color mixes and local typography ratios | Resulting surface and state colors are difficult to reason about from the palette; caption size follows local arithmetic | Use documented palette roles directly where possible; introduce semantic aliases only for actual gaps; shared caption/body/title roles |
| Medium | [Selector copy](../../plugins/UI/vault-selector/src/catalog.ts): Select vault, Next; browse is icon-only | Actions describe implementation steps; the folder control requires icon recognition | Open vault, Create vault, Choose folder; visible browse text and folder-root semantics |
| Medium | [Kit controls](../../plugins/UI/components-kit/src/controls.ts) are internal helpers; the provider currently registers two full-screen roles | Shared implementation exists, but other consumers cannot mount button/field roles through Components yet | Keep internal helpers for composition; add public small roles only when another real consumer needs them, with documented props |
| Preserve | [Host CSS](../../hosts/tauri/assets/shell.css) scopes recovery controls under system-root; kit subscribes to ThemeChanged; controller uses SDK services and localization | Useful separation, replaceability and state handling already exist | Preserve this structure; avoid moving business logic into the kit or recovery styles into product controls |

These are design and maintenance findings, not claims that the existing code is
incorrect in all contexts. The current two-panel/artwork/disclosure implementation
follows the explicit [selector specification](../reference/vault-selector.md).
Its replacement requires changing that specification together with the UI.

## Product model

Separate three situations:

1. **Startup**: temporary preparation, real progress only; preserve current
   configured artwork and recovery independence. No invented progress percentages.
2. **Vault management**: choose or prepare a vault; clear list and forms; short
   local feedback. This is the first redesign milestone.
3. **Workspace**: document content dominates, optional navigation at the leading
   edge, contextual tools near content. Implement later with an explicit shell
   owner and public handoff contract. No empty editor, fake tabs or disabled
   navigation added just to resemble a finished application.

An active vault is domain state, not an editing workspace. Until the workspace
exists, expose its name and an active indicator on its recent row, with an
accessible current-state attribute. For an open that cannot be represented in
history, show the active vault separately; history storage degradation must not
hide a successful open. Do not show a permanent System loaded message.

## Visual rules proposed for adoption

These measurements are defaults, not fixed constraints on translated content.
Use rem-equivalent values, minimum sizes, wrapping and container queries.

| Role | Proposed default | Rule |
|---|---|---|
| Spacing | 4, 8, 12, 16, 24, 32, 48 | 8 within small groups, 16 between related blocks, 24–32 between sections; no independent per-screen spacing scale |
| Body / controls | 14px, line-height 1.5, regular | Existing system font stack; control labels remain readable |
| Caption / path | 12px, line-height 1.5 | Secondary context only; never reduce to fit a long path |
| Section title | 16px, medium | Compact group labels; avoid all-caps navigation |
| Page title | 24px, medium, line-height 1.3 | One main title per task view |
| Reading column | max 40rem, full available width below that | Align heading, list and forms on the same leading edge |
| Outer gutter | 16–32px responsive | Top anchored; never vertically recenter when form content changes |
| Button / input | min-height 36px; coarse pointer min 44px | Grow with content; fine-pointer targets at least 24×24px |
| Recent row | min-height 64px | Full-row native button; title and secondary location; no nested action buttons |
| Radius | 4px controls, 8px larger interactive surfaces | Keep existing geometry; avoid card shells around every group |
| Icon | 16px default, 1.5 stroke | Lucide; currentColor; labeled actions; omit redundant icons |
| Motion | existing fast 120ms, normal 200ms | Color feedback only unless motion explains a change; reduced-motion supported |

Keep existing base palette values in the first milestone. Use background for the
main surface, panel for a real secondary region, content for editable controls,
text/textSecondary for hierarchy, hover for transient feedback, selection for
domain-backed current state, accent/onAccent for a primary action, and focus for
keyboard focus. A filled primary button needs its focus outline against the
surrounding surface, not a same-colored inset ring.

Do not manufacture a new palette in a consumer. Reduce large panel area before
reducing text contrast. Avoid nested translucent mixes for common states. A
semantic error foreground is a real palette gap: validate it on every supported
surface before adding it to the base-theme schema. Until then, communicate errors
through readable text, a descriptive heading and alert semantics; color is optional.

## State and interaction contract

| Situation | Visible behavior | Retained behavior |
|---|---|---|
| First run | Vaults heading, concise empty message, Open vault and Create vault actions; no empty sidebar | No fabricated recent data in production |
| Recent vaults | Name first, location second, whole-row activation | Preserve history order; only show current for an actual committed active reference |
| Open existing | Candidate folder summary, visible Choose folder, explicit Open vault confirmation | Browse cancellation leaves candidate unchanged; no write before submit |
| Create | Display name, vault-root folder, explicit Create vault | Selected folder remains the actual root; no implied nested directory creation |
| Form navigation | Back returns to manager; a form replaces the content view | Independent create/open drafts; focus moves to the form heading or first field and returns to the invoking action |
| Pending operation | Local Opening / Creating feedback and aria-busy | Prevent duplicate requests; preserve inputs; no navigation that can invalidate pending work |
| Validation | Specific inline message associated with the field | Submit remains disabled until prerequisites hold; explain missing folder through its visible label/control |
| Open failure | Local error and retry path; alert announcement | Keep draft/location, return controls to usable state, retain unavailable history entry |
| History failure | Local recent-list error with Retry; Open/Create remain available | A committed active vault remains visible even without a saved recent row |
| Success | Domain-backed active name/current row until a workspace exists | No claimed document view or unsupported editor navigation |

Use native button/list/form semantics; rows are buttons, not a listbox unless a
real selection model is introduced. Enter/Space activate native buttons, Enter
submits valid forms, Tab follows DOM order, and Back restores focus. If Escape is
introduced, scope it to the form and never intercept a native folder dialog.
Pointer interaction must not trigger unrelated programmatic focus changes.

Keep names and locations available at narrow sizes: wrap paths safely; if a
future dense mode truncates, provide the full value to both assistive technology
and an accessible tooltip. Use logical CSS properties. Test expanded translations,
RTL, 200% text zoom, keyboard-only use and reduced motion before visual acceptance.

## Code ownership and prerequisites

Required: consistent presentation, reusable controls, theme interpretation and
honest state transitions. Already present: Themes/ThemeChanged, Components and
role replacement, Slots/SlotDom, Localization, VaultLocations, VaultHistory,
VaultChanged, Startup and Logger. New work is mainly composition inside the kit
and localized controller props; no SDK runtime extension is needed for the
current manager redesign.

- **Base theme engine** owns portable role values. Extend its documented schema
  with text/control metrics if approved; do not teach the generic Themes provider
  about particular colors, CSS or component types.
- **Components Kit** owns a small internal theme-to-CSS adapter, primitives and
  task layout. Resolve active-theme values once per instance update; preserve
  ThemeChanged and instance disposal behavior. Do not introduce a new design-system
  plugin, CSS framework, DOM renderer or public token service for two screens.
- **Vault selector controller** owns mode, independent drafts, pending operation,
  errors and localized text. Continue using Components by role ID; it does not
  import the kit or write CSS. Document any revised prop schema for replacement kits.
- **Services and drivers** keep folder selection, preparation, history and writes.
  No native dialogs, path persistence or filesystem calls from visual components.
- **Runner and host** keep early-paint/recovery independence. Coordinate any later
  startup restyle across static HTML/CSS, kit role and Runner configuration; do not
  make recovery depend on a working theme service.

The future workspace is a separate responsibility. Before implementing it, specify
the shell's public activation/deactivation and render-target contract, the owner
of its slot hierarchy, and the manager-to-shell handoff for successful open,
switch, close, failure and provider loss. Check what existing Slots and VaultChanged
already cover before inventing APIs. Stop at a real missing SDK capability and
write its specification; never mount an editor by reaching into another plugin's DOM.

## Delivery sequence and integration review

1. **Approve direction** using the study. Confirm Vault manager versus Split
   manager, typography/geometry defaults and selector artwork removal. Existing
   UI guidelines remain authoritative until the accepted delta is written there.
2. **Foundation**: consolidate theme interpretation in the kit, document metrics
   in the base-theme reference, preserve existing palette contrast and live theme
   updates. Do not expose internal kit files as cross-plugin imports.
3. **Manager**: update kit role, selector controller, English catalog, role prop
   documentation and selector specification together. Retain folder-root semantics,
   validation, cancellation, error recovery and SDK logging. Startup API stays intact.
4. **Accept in native WebView**: Owner manually verifies actual rendering and
   native dialog behavior. Record acceptance; only then treat the revised
   UI_GUIDELINES as the baseline for subsequent screens.
5. **Workspace design**: define public contracts and content-first shell with a
   real editor use case. Separate feature branch; no merge without Owner approval.

Integration needed for milestone 3: Components Kit ↔ component provider ↔ selector;
base-theme engine ↔ theme provider ↔ kit; localization ↔ selector copy;
VaultLocations/VaultHistory/VaultChanged ↔ selector state; Runner/Startup ↔ selector
mounting; host ↔ SDK composition. Existing connections are implemented, but the
proposed new role inputs and layout have **not** been integrated by this review.
Config, filesystem provider and Tauri driver need regression checks, not a redesign.

## Acceptance and evidence

For implementation, use `npm run vault-selector:check` and
`npm run theme-settings:check`; run `npm run base-theme:check` if palette/schema
data changes, `npm run runner:check` if startup changes, and the Tauri frontend
build if host composition changes. These targeted commands overlap; do not report
their counts as unique combined coverage. Use `node tools/scripts/audit.mjs
--docs-only` for documentation links. Do not run the full project suite for this
design-only proposal.

Manual visual matrix: Light/Dark, 320/480/768/1280 CSS-pixel content widths,
short-height windows, 200% zoom, long names/paths, expanded translations, RTL,
keyboard traversal, reduced motion, first run, long history, current vault,
history failure, invalid name, missing/denied folder, browse cancellation and
opening failure. Verify no horizontal page overflow, hidden keyboard focus,
misleading selected states or content movement caused by vertical recentering.

Review evidence: documentation links and the study's local state transitions are
checked separately. The study is an approval aid, not a pixel-accurate capture,
replacement-kit conformance test, native dialog test or shipped product feature.

Local verification on 2026-11-05: documentation audit passed for 42 Markdown
files. A JSDOM exercise passed for both study layouts, create/open, retained
drafts, Back focus restoration, errors/retry, first-run activation, theme/density
controls, unique IDs and accessible label references, with no script errors or
network calls. JSDOM does not establish physical layout or native visual acceptance.

## Research and design judgment

- [Fluent layout](https://fluent2.microsoft.design/layout): spacing establishes
  relationships and hierarchy, with a four-pixel base. Adopt the existing 4px
  basis and reduce competing layout regions; this does not require Fluent UI.
- [Fluent typography](https://fluent2.microsoft.design/typography): semantic type
  roles and native font stacks. Use a small role scale; do not import the entire ramp.
- [GNOME placeholder pages](https://developer.gnome.org/hig/patterns/feedback/placeholders.html):
  empty states communicate the situation and next action; avoid making an empty
  placeholder the primary view when content is already available.
- [Obsidian vault management](https://obsidian.md/help/manage-vaults): recent vault
  access and distinct create/open workflows are relevant product precedents.
  Lunaris keeps its own root/display-name semantics; do not copy Obsidian's
  directory-creation behavior or infer its current visuals from textual help.
- [VS Code interface](https://code.visualstudio.com/docs/editing/getting-started/userinterface):
  separated editor, navigation and contextual regions inform the later shell
  boundary. Its full chrome is unnecessary for today's selector.
- [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html):
  ordinary text requires 4.5:1; sufficiently large text has a 3:1 exception.
  Preserve readable secondary text rather than making it faint.
- [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html):
  WCAG 2.2 AA specifies 24×24 CSS pixels with stated exceptions. The proposed
  36px desktop / 44px coarse-pointer defaults are Lunaris design choices.
- [W3C focus visibility](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html):
  focused controls must not be entirely obscured. Prefer fully visible focus
  and test scrollable/short windows.

The preference for a single column, restrained branding and explicit task views
is design judgment based on Lunaris's current small scope, not a requirement
imposed by these sources.

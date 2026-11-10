# Acceptance and evidence plan

Runtime and manual evidence is pending. These scenarios define completion; they are not claims of
implemented behavior. Choose focused checks for the changed contracts/components.
No full-project test run is required for this planning-only change.

## L01 evidence, 2026-11-10

- Baseline: `feat/lime`, `4d259c199da4be969ec5e71eb451106d04fcdfa3`; working tree clean.
- Source audit: shared/Tauri/web hosts, native session dispatcher, SDK/kernel,
  Vault release/preparation, Config scopes, Filesystem, Components, ActiveScreen,
  Settings, Startup and CLI/development reviewed. Findings and B01-B04 required
  contracts: [public specification](../../DOCS/design/lime-runtime.md).
- Outcome: L01 execution gate blocked; no installed code evaluated. A19 and A23
  are unverified; source authority gaps prevent claiming isolation or recovery.
- Documentation validation: `node tools/scripts/audit.mjs --docs-only` passed
  (68 documentation files; local links); `git diff --check` passed.
- Native/visual tests: not performed; no UI/runtime implementation changed.
- Integration: all Lime runtime/provider/UI/tooling connections remain outstanding.

## User and runtime scenarios

| ID | Scenario | Required observation |
| --- | --- | --- |
| A01 | Select valid `.lup` | Metadata preview appears before any package code executes; confirm installs and starts without app restart |
| A02 | Cancel picker/preview | No new installation, execution or altered enabled state |
| A03 | No active Vault | Clear unavailable install action; no accidental global installation |
| A04 | Invalid/hostile archive | Traversal, symlinks, duplicate paths, oversized expansion and malformed entries rejected before execution; no partial commit |
| A05 | Unsupported platform | Clear warning, explicit proceed action, no silent compatibility claim; required API failures still explained |
| A06 | Same ID/new version | Explicit update workflow, identity checks and useful same-version/downgrade outcomes |
| A07 | Enable/disable repeatedly | Views/services/subscriptions cleaned, saved state retained, no app reload or duplicate registrations |
| A08 | Missing/conflicting dependency | Name, contract/range and available resolution shown; no implicit remote download |
| A09 | Dependency/provider removal | Affected consumers disclosed and transitioned in valid order; no silently usable stale handles |
| A10 | Successful update | New code takes effect, data preserved/migrated and only affected graph restarted |
| A11 | Failed/interrupted update | Previous committed installation recoverable; data rollback rules hold; no false successful state |
| A12 | Remove | Retain/delete-data choice honored; dependent effects explained; no leftover live execution |
| A13 | Switch/close Vault | Old plugin work cannot target new Vault; all old scoped instances released before resource teardown |
| A14 | Same ID in two Vaults | Independent code version, enabled state, settings and data restored correctly |
| A15 | Copy/synchronize Vault | Portable packages/config restore without machine paths; changed packages revalidated; conflicts handled explicitly |
| A16 | Plugin startup failure | Other unaffected plugins usable; failed state with actionable diagnosis and manual retry |
| A17 | Safe mode | Enter before third-party evaluation and recover even if a provider replacement normally owns recovery-adjacent UI |
| A18 | Installation during transition | Operation remains bound to original Vault or cancels; never installs in the next Vault |
| A19 | Outside-file attempt | Host boundary rejects access outside the Vault; explicit package import does not expand installed-plugin authority |
| A20 | Provider replacement | Selection is explicit, core/consumer dependencies handled, recovery does not rely on the failed replacement |
| A21 | Storage failure | Read-only/full/unavailable storage produces useful failure with recoverable committed state |
| A22 | Concurrent operations | Repeated clicks, concurrent update/disable and stale previews cannot corrupt installation state |
| A23 | Noncooperative code | Actual watchdog/termination limitations documented and recovery verified for the chosen execution model |

## Developer scenarios

- External bootstrap requires no checkout, workspace links or unpublished imports.
- Generated project checks and packages unchanged, with Logger and valid cleanup.
- Public documentation alone supports a setting, persisted data and a custom view.
- Two independent plugins exchange a versioned public contract and report missing
  or incompatible dependencies clearly.
- Live changes replace the intended instance/graph and release old resources.
- CLI human/JSON output and exit status identify actionable causes consistently.
- Packaged resources work after moving the artifact to another directory/device.
- Documentation examples and agent guidance match actual exported SDK contracts.
- A new non-Markdown application view uses public extension contracts without core
  edits, private DOM access or imports from other plugins' implementations.

## Integration evidence

Record contract versions and completion for Kernel/runtime adapter, Vault, Startup,
Filesystem/driver, Config, Logger, Settings, Components/Mantine, Workspace/Sidebar,
Localization and CLI/development. Do not mark Lime integrated while required
connections remain unimplemented. Assess default-provider replacement explicitly.

Run targeted runtime/manifest/package/CLI/integration checks appropriate to each
task. Automate repeated rehearsals in `tools/scripts/` with concise summaries.
Use real package/host integration for claims that unit mocks cannot establish.

## Manual visual/native acceptance

Automated OS/desktop control is prohibited by repository policy. Owner manual
acceptance must cover the actual Settings composition: empty/populated/failure
states, install preview, platform warning, dependency conflict, opened menus,
remove confirmation, focus and keyboard behavior, themes, long localized metadata,
and narrow/short layouts. Native picker and host execution tests are also explicit.
Automated behavior tests do not establish visual appearance or native geometry.

## Evidence record template

For each task/scenario, record status (pending/passed/failed/manual pending), exact
host/build and SDK versions, focused command or manual steps, observed outcome,
remaining limits and relevant commit. A declared platform is author metadata, not
evidence that its host passed. Complete the branch only after required evidence is
recorded; leave any unavailable platform honestly scoped and reported to the Owner.

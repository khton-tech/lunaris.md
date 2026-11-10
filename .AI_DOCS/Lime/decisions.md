# Decisions and architectural boundaries

## Accepted Owner decisions

- Third-party plugins equal system plugins in extension capability; no separate
  restricted class. They may provide/replace services and build entirely different
  application experiences, including non-Markdown tools.
- No user permission prompts or permission selection. Plugins can access the active
  Vault and its surrounding application capabilities, but not PC files outside the
  Vault. Internal permission gateway migration is an implementation task, not a UX.
- Install through Settings / Third-party plugins / Add plugin / select `.lup` /
  metadata preview / confirmation. File selection alone does not execute code.
- Metadata: name, `username.plugin-name`-style ID, author, version, description,
  platforms, languages, Git repository URL and custom display fields.
- Platforms: `universal` or `desktop`, `web`, `mobile`. Unsupported platform warnings
  allow installation at the user's risk. Do not silently block activation solely
  because of the author's platform declaration.
- Package code and configuration live in the Vault; installed plugins belong under
  `.lunaris/plugins`. Copying the Vault folder carries its plugin environment.
- Each Vault owns its installations, versions, settings and enabled state. Switching
  Vaults switches plugin environments. No new-device trust prompt was requested.
- Plugins may depend on other third-party plugins. Updates use a newly selected
  `.lup`; remote catalogs and automatic updates are outside this iteration.
- Removal offers a choice to retain or delete plugin data/settings.
- Failed startup must offer recovery; opening a Vault without third-party activation
  must be possible. Proposed default: failed plugins remain inactive until retry.
- Install, enable, disable, update and remove should work without restarting the
  environment. A hung/noncooperative plugin needs an explicitly documented limit.
- Lime engine and settings UI are separate plugins. End-user UX, human DX and AI DX
  belong in this branch's acceptance scope, not a later documentation pass.

## Existing foundations to reuse

| Foundation | Existing behavior | Lime gap |
| --- | --- | --- |
| SDK / manifest | Definitions, SemVer, typed APIs/events/hooks, declaration checks | Author metadata, package format, platform migration |
| Kernel | Register/start/stop/restart, dependency resolution, scoped cleanup | Unregister/replace, affected-graph recovery and trusted management bridge |
| Permissions | Declared names plus host grants, checked on SDK calls | No-prompt policy without breaking existing consumers |
| Vault | Open/close/switch, preparation and explicit Vault IDs | Coordinate third-party start/stop with transition commit and failure |
| Filesystem | Vault-relative I/O and native drivers | Import a package selected outside the Vault without general outside access |
| Settings / Components | Owned contributions and public component roles | Lime composition and unrestricted task-appropriate extension route |
| CLI / development | `lunaris-core create-plugin`, validate/test/inspect/dev | Portable toolchain, live reload, package build and host attachment |

Evidence: `packages/kernel/src/types.ts`, `packages/cli/src/index.ts`,
`packages/cli/package.json`, `DOCS/reference/core-boundary.md`,
`DOCS/reference/manifest.md`, `DOCS/reference/filesystem.md`,
`DOCS/reference/vault.md`, `DOCS/reference/settings.md`,
`DOCS/concepts/permissions.md` and `DOCS/UI_GUIDELINES.md`.
The current CLI is private and its dev session explicitly requires rebuild/relaunch;
do not claim installed external tooling or live reload already exists.

## Boundary that must be resolved first

Full extension parity and Vault-limited filesystem access are simultaneous
requirements. A shared JavaScript realm with ambient native bridge access does not
enforce the latter. SDK import checks and archive validation are not isolation.

Specify where code executes, which globals/native entry points it receives, and how
all native file operations stay Vault-bound. Preserve public SDK capabilities and
arbitrary application extensibility. Do not add a user permission system or narrow
plugins to a predefined feature list as an accidental solution. If these requirements
cannot coexist on a host, report the concrete conflict before claiming support.

The package picker may read the explicitly selected external `.lup` for import;
that operation must not grant installed plugins general external filesystem access.

## Technical decisions to settle during specification

These are design tasks, not new product questions or reasons to stop this planning.

- Archive format/version, entry/module resolution, resource loading, bundle rules,
  extraction limits, path/symlink handling, integrity and package identity checks.
- Metadata bounds, language tags/fallback, repository URL handling and migration
  from existing `targets`. Proposed custom fields are inert label/value data.
- Meaning of `universal` across future platforms; host classification is independent
  of viewport size. Platform override never bypasses missing required SDK contracts.
- Exact code/data/config/registry layout, portable paths, schema migrations and
  synchronization conflict policy. A copied package must be revalidated before load.
- Stable entry metadata versus exported definition consistency, SDK bundling rules,
  fresh module identity on updates and bounded release of old loaded code.
- Shared system providers versus Vault-owned provider selection; identical plugin
  IDs in different Vaults; collision with built-in IDs; failure during replacement.
- Dependency installation workflow. Proposed v1 uses explicit local `.lup` selection
  for missing dependencies, with no implicit downloads; it must show the full graph.
- Update rollback includes data migrations: retaining old code alone cannot reverse
  an irreversible data change. Define backup/transaction policy before implementing.
- Safe-mode entry before plugin evaluation, persistence scope, failed-start retry
  behavior, and recovery when a third-party provider replaces a core service.
- Platform capability matrix across current Tauri/web/mobile hosts, including any
  remote-storage topology. Do not invent a mobile host or assume desktop paths exist.

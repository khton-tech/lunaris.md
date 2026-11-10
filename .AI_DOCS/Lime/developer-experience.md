# Human and AI developer experience

## Single authoring workflow

Extend `@lunaris/cli` and the existing `@lunaris/development` implementation rather
than building another CLI. Current executable is `lunaris-core`; command spelling
below describes capabilities, not accepted new names or existing functionality.

| Capability | Required outcome |
| --- | --- |
| Create | Minimal runnable project, manifest, Logger, cleanup, scripts and agent guidance |
| Develop | Attach to a chosen disposable Vault, rebuild and replace changed code live |
| Check | Types, manifests, SDK boundaries, declarations and package/resource validity |
| Test | Focused plugin tests using public test contracts, independent of app internals |
| Inspect | Selected providers, dependencies, lifecycle state and actionable diagnostics |
| Pack | Validate and emit an installable self-contained `.lup` with a concise summary |

The developer installs supported tooling outside the application repository. Do not
require editing a bundler configuration, internal workspace links, copying generated
code into the app or rebuilding Lunaris. Bundle rules must prevent hidden duplicate
SDK identities and undocumented host imports without assuming a singleton token.

The generated minimal plugin should be small. More advanced recipes are opt-in;
do not generate every abstraction, service layer or contribution type by default.

## Development session contract

- Explicit host/session and development Vault selection, with clear attachment and
  detachment. Do not silently alter ordinary installed production packages.
- Same validator, loader rules and lifecycle semantics as installed `.lup` packages.
- Rebuild errors keep the last good instance where safely possible; activation
  errors expose the actual recovery/rollback state, never a false ready signal.
- Changes to dependencies/providers reload the affected graph, not just the leaf.
- Repeated reloads release views, subscriptions, tasks, resources and obsolete code
  according to the documented execution model; no unlimited cache-busting leak.
- Session termination has defined ownership and cleanup; install/export is explicit.
- No application restart for cooperative normal changes. Document the behavior when
  synchronous code blocks or native cleanup cannot be forcibly interrupted.

## Public SDK authoring surface

Document actual exported imports and corresponding manifest requirements together.
An author needs `definePlugin`, lifecycle ownership and typed public contracts, not
kernel registry internals. No direct native bridge, application source imports or
DOM inspection of other plugin regions. Native access uses public providers/drivers.

Arbitrary UI is a first-class acceptance case: a new non-Markdown editor/viewport
can register its renderer and mount inside a public region without waiting for a
hard-coded product component role. Finalize how this works within the shared
Mantine role policy. If the contracts cannot express it, implement their extension
before presenting an example. Keep product controls/theme/localization consistent.

## Documentation deliverables

- One short getting-started path from empty directory to installed `.lup`.
- Versioned manifest/package reference, including custom fields and platform risks.
- Searchable API/event/hook and extension-point index with exact import locations.
- Lifecycle/cancellation, dependency graph and explicit provider selection guide.
- Recipes for settings, Vault data, custom views, editor extensions and services.
- Local development, focused testing, packaging and diagnostics reference.
- Updates, migrations, rollback, data retention and safe-mode troubleshooting.
- Honest filesystem/native boundary and supported-host limitations.

Examples include declaration, activation, useful behavior, Logger and cleanup. They
are checked against the shipping SDK and tooling, not duplicated pseudocode. Use
English for all artifacts and localization contracts for visible product strings.

## Agent instructions

The generated project's agent entry file links a compact canonical documentation
index and tells an agent how to discover contracts, run focused checks, build the
package and report missing SDK functionality. It must distinguish implemented
features from proposed ones and prohibit guessing exports or bypassing SDK limits.

Offer stable structured CLI diagnostics with code, phase, plugin ID, relevant field
or dependency, actionable message and process exit status. Keep raw user content,
absolute private paths and secrets out of normal output. Preserve original errors
for the appropriately scoped developer diagnostics. Human output remains readable.

## Independent author acceptance

In a clean directory with only distributable tooling and public documentation:
create a plugin with a setting, a novel view, Vault-local persistence and cleanup;
run a live change; check and package it; then install/update/remove it through UI.
Also build a pair of dependent plugins and exercise provider replacement. Record
every undocumented assumption encountered and fix it before declaring DX complete.

# Core development workflow

## Setup

Verified foundation environment: Windows x64, Node 26.13.0, npm 11.20.0. Other hosts are not verified yet. Install these prerequisites, clone the repository, then run:

```sh
npm ci
npm run environment
npm run check -- manifest
```

The last command builds the manifest package and its affected consumers (SDK/kernel), checks import boundaries, runs small tests and compiles positive/negative type fixtures. Dependencies and tools are local and locked; no globally installed compiler is required. `npm run build` builds all currently existing packages without tests. `npm run build --workspace @lunaris/sdk` builds SDK prerequisites and SDK only.

For routine work use `npm run check -- sdk` or `npm run check -- kernel`. Multiple explicit scopes are allowed. Missing/unknown scopes fail instead of silently triggering a full run. Errors return nonzero and show captured failure details; successful checks print one summary. Source boundary analysis runs across the three small core packages because the dependency rule itself spans them. It is an architecture check for trusted repository code, not hostile-code isolation.

The SDK exposes validated plugin definitions, typed tokens, context/ownership interfaces, declaration checks and structured errors. Manifest validation and dependency-free kernel lifecycle are implemented. Hosts use `createKernel({ scheduler })` to register/start/stop/restart plugins and inspect immutable diagnostics. Required dependency resolution, API handles, event/hook dispatch and grants remain P4–P6 work. See [lifecycle](../concepts/lifecycle.md), [the SDK reference](../reference/sdk.md), [the design boundary](../reference/core-boundary.md) and [the plan](../CoreImplementationPlan.md) for delivery gates.

## Changes and review

Before development inspect `git status` and the entire uncommitted diff, understand its context and commit that baseline. Use isolated branches with meaningful names, such as `feat/core-sdk` or `fix/manifest-validation`; do not use agent-specific prefixes such as `codex/`. If stacking dependent work before its base merges, record its parent branch and commit in the plan. Commit each completed change immediately with relevant task IDs. Keep machine-only scratch work in `.AI_DOCS/`; maintain human docs here in `DOCS/`.

Package exports expose only their root. SDK may depend on manifest; kernel may depend on SDK/manifest. Platform imports, private package subpaths, dynamic loading and cross-package relative paths are forbidden in core sources. Strict compilation excludes DOM/Node ambient globals. Plugins import public SDK/shared contracts only. A missing SDK operation blocks affected plugin work: specify and implement the SDK change first, with tests.

Update the plan after acceptance checks pass and record the implementation hash in a subsequent tracking commit. Owner approval is required to merge into the target branch. Building and committing a feature do not authorize merging or publishing. No desktop automation is allowed; future OS/visual checks must be performed manually by the Owner.

# Version and environment policy

SDK, kernel, manifest validator, test kit, host and CLI have independent package versions. Initial source-checkout versions are 0.1.0; packages remain private. Plugin and contract versions are independently owned. Exact manifest/token versions use strict SemVer, ranges use pinned node-semver semantics, and prereleases require an admitting range. A compatible major/range is necessary but does not prove behavior or runtime shape: use public contract tests and optional validators.

Before 1.0, incompatible public changes increment minor; compatible fixes increment patch. Review exported declarations, stable error codes, manifest fields, dispatch/lifecycle ordering and permission changes for behavioral breaks. At a release, update each affected package's version and corresponding compatibility constants/defaults in kernel, loader, templates and tests. Do not silently change contract semantics or add sensitive access requirements under a patch.

| Target | Status | Evidence |
|---|---|---|
| Windows x64, Node 26.13.0, npm 11.20.0 | Locally verified source-checkout target | Full release check, generated plugin install/build/test/dev and junction containment |
| GitHub Windows runner, Node 26.13.0 | CI configured; remote run not performed in this session | `.github/workflows/core.yml`; same local scripts |
| Other Node 26.x versions | Allowed development range, not individually verified | No expanded compatibility claim |
| Linux/macOS/browser/Capacitor/Tauri | Not verified/supported yet | Platform-neutral kernel is preparation, not execution evidence |

CI selects changed packages and their consumers for pull requests. Root/tooling/lockfile changes trigger the full core; documentation-only changes check local links. Push to main and manual runs also execute release validation over the declared Windows target. Action refs are pinned to official v7 commit IDs checked during setup. Hosted CI execution requires pushing the branch and is not claimed here.

Source checkout/local links are the supported delivery form. Remote installs, packaging, hostile-code isolation and native/application targets remain separate work. Standalone reference plugins were explicitly deferred by the Owner; existing unit/integration tests and generated-plugin tests provide the adjusted release acceptance evidence.

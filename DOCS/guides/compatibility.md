# Version and environment policy

SDK, kernel, manifest validator, test kit, host and CLI have independent package versions. Current packed packages use 0.1.0 and remain private npm packages. The `equal-plugins-ai` archive label identifies the distribution with bundled project skills. Plugin and contract versions are independently owned. Exact manifest/token versions use strict SemVer and prereleases require an admitting range. Compatibility also depends on the host supplying the declared contracts and permissions.

Before 1.0, incompatible public changes increment minor; compatible fixes increment patch. Review exported declarations, stable error codes, manifest fields, dispatch/lifecycle ordering and permission changes for behavioral breaks. At a release, update each affected package's version and corresponding compatibility constants/defaults in kernel, loader, templates and tests. Do not silently change contract semantics or add sensitive access requirements under a patch.

| Target | Status | Evidence |
|---|---|---|
| Author toolchain | Node >=26.13.0 <27, npm >=11 <12 | Windows x64 rehearsal installs the archive outside the checkout, generates a project and packs/inspects a LUP |
| Web | Shared application plugin realm and DOM contracts | Browser composition tests; no Windows native process provider |
| Tauri 2 / Windows x64 | Shared application plugin realm, DOM contracts, native helpers | [Host guide](tauri-host.md), targeted native process tests and portable/installer release build; manual WebView and real shortcut acceptance pending |
| Other native targets | Native support has not been established | Depend on platform contracts optionally if a missing provider is acceptable |

CI selects changed packages and their consumers for pull requests. Root/tooling/lockfile changes trigger the full core; documentation-only changes check local links. Push to main and manual runs also execute release validation over the declared Windows target. Action refs are pinned to official v7 commit IDs checked during setup. Hosted CI execution requires pushing the branch and is not claimed here.

Distribute the packed SDK archive to plugin authors and `.lup` files to users. Web
and Windows load installed and built-in plugins in the same application realm.
Platform capabilities can differ, but a plugin's origin does not determine its
rights. The user decides which packages to run. The headless Node and QuickJS
development modes have their own capabilities and test different things from
the application. See [independent authoring](plugin-authoring.md) and the
[runtime reference](../reference/lime-runtime.md).

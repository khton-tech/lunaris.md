# Local development host

`@lunaris/development` is the Node-specific host outside the platform-neutral kernel. `validateLocalPlugin(root)` parses `manifest.json`, checks schema and engine/SDK compatibility, resolves real paths and requires a regular JavaScript entry inside the package root. Manifest and entry symlinks cannot escape the root. It returns immutable metadata without importing the entry.

`loadLocalPlugins(roots, options?)` validates all roots before importing any entry, rejects duplicate IDs, requires a default SDK plugin definition and compares its normalized metadata with the authoritative JSON manifest. Drift requires a rebuild. It returns a privileged host session with `kernel`, `pluginIds`, `start()` and `stop()`. The session passes no filesystem/process objects to plugins. Start failure stops previously started scopes; cleanup failures remain errors.

The host supplies real monotonic Node deadlines, including chunking long timeouts without native timer overflow. Node/DOM dependencies remain forbidden in SDK/kernel/test-kit sources. Filesystem checks and source conventions are for trusted local packages, not hostile-code containment or a race-proof package signature. Modules still have normal Node ambient access and module caching. Restart the process after changing/rebuilding a plugin; no cache-safe hot reload is claimed.

Run `npm run check -- development` for containment, pre-evaluation validation, drift and session cleanup checks. The escape test uses a Windows directory junction (directory symlink on other hosts) and requires the check to execute; release checks reject skipped tests.

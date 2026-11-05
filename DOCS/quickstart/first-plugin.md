# First local TypeScript plugin

Prerequisites: Git checkout, Node 26.13.0 and npm 11.20.0 on Windows x64. A first `npm ci` needs registry access or the locked dependencies already cached. No global TypeScript/CLI installation is required.

From the repository root:

```sh
npm ci
npm run build
npm run core -- create-plugin ../my-plugin --id local.my-plugin
cd ../my-plugin
npm install --ignore-scripts --no-audit --no-fund --offline
npm run build
npm run validate
npm test
npm run inspect
npm run dev
```

When `DEV_READY` appears, type `stop` and Enter (or Ctrl+C) for cleanup. `npm run core -- dev . --once` activates and stops in one invocation. After editing source or manifest, rebuild and start a fresh process. There is no hot reload. `inspect` creates a short-lived session and prints states, bindings, effective grants and safe diagnostics before stopping it.

The generated package contains one authoritative `manifest.json`, `src/plugin.ts`, strict TypeScript configuration, a lifecycle test, `DOCS/README.md` and a small CLI launcher. JSON imports pass directly to SDK validation without casts. The plugin starts without APIs, events, hooks or permissions. Add one architectural responsibility and declare contracts/permissions as needed; use SDK scope ownership for cleanup.

Before turning this empty scaffold into a product plugin, implement
[mandatory plugin logging](../reference/logging.md#mandatory-plugin-logging).
Declare the Logger API as a required dependency, import its token from
`@lunaris/logging`, acquire it through `ctx.use(Logger)` and attribute records to
`ctx.pluginId`. Record readiness and relevant operation outcomes, degradation and
errors. The generated skeleton does not add these automatically; the application
host must compose the Logger and a sink alongside the consumer. For local tests,
provide a conforming Logger mock through the public test kit.

Generation refuses an existing target directory. Local dependencies link back to this source checkout and its installed compiler: keep the checkout available. These are private development packages, not published registry dependencies. Distribution/installable archives are deferred. The plugin source imports only the public SDK; tests use the public test kit and tools use the local CLI.

Reproduce the automated rehearsal from a built checkout with `npm run rehearse`. It generates into a temporary directory with a space in its path, installs offline links, builds, validates, runs a real plugin test, inspects and activates/stops, then removes only that temporary directory. Conditions/timings are recorded in [release evidence](../releases/0.1.0.md).

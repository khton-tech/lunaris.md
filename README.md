# Lunaris core

A TypeScript plugin runtime and public SDK for trusted local plugins. The local 0.1 candidate includes manifest validation, owned lifecycle, capability resolution, scoped API calls, events/hooks, revocable permissions, a deterministic test kit and local host/CLI.

Start with [the first-plugin quickstart](DOCS/quickstart/first-plugin.md), [SDK reference](DOCS/reference/sdk.md) and [CLI reference](DOCS/reference/cli.md). [Contribution commands](DOCS/guides/contributing.md), [support/compatibility](DOCS/guides/compatibility.md), [execution plan](DOCS/CoreImplementationPlan.md) and [release evidence](DOCS/releases/0.1.0.md) describe actual scope and limits.

```sh
npm ci
npm run build
npm run core -- --help
npm run release:check
```

Verified locally on Windows x64, Node 26.13.0/npm 11.20.0. UI/editor features, native drivers, remote distribution, untrusted-code isolation and standalone reference plugins are outside this candidate. Packages remain private and feature branches require Owner approval to merge.

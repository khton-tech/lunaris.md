# Local CLI

From a built checkout use `npm run core -- <command>`. Generated packages additionally expose `npm run core -- <command>` and convenience scripts. All failures return nonzero. CLI wrapper errors use stable codes and safe messages without raw causes; the Node test runner emits its normal assertion reports.

| Command | Behavior |
|---|---|
| `create-plugin <directory> [--id plugin.id]` | New SDK-only TypeScript package, manifest, test and docs; existing targets fail `TARGET_EXISTS` |
| `validate [roots...]` | Shared manifest/compatibility and real-path entry checks, without module evaluation |
| `test [roots...]` | Validate roots, then run each package's focused `test/*.test.js` / `*.test.mjs` through a fresh Node test invocation |
| `inspect [roots...]` | Load/start a local session, print frozen state/binding/permission/diagnostic snapshots, stop in finally |
| `dev [roots...] [--once]` | Start a session; stop on `stop`, stdin EOF, SIGINT or SIGTERM; `--once` activates/stops immediately |

Roots default to the working directory. Build entries before validate/test/dev/inspect. Multiple local roots are all validated before entry imports; their required capabilities can resolve against one another. Grants for sensitive operations default to empty in CLI commands. Use the development host API to compose explicit host policy rather than granting arbitrary access from CLI arguments.

`test` clears inherited Node test-runner context for its child invocation, so running the CLI from a test cannot silently skip nested test files. `inspect` does execute trusted plugin code; `validate` does not. Node module caching and noncooperative top-level module evaluation are normal Node behavior; process restart is required for changed modules. The host bounds activation/cleanup, not arbitrary module initialization or external effects.

# Core baseline: D01–D10

Status: accepted implementation baseline, 2026-11-03. Owner-controlled merge remains separate from implementation decisions.

## Decisions

| ID | Accepted choice | Alternative and consequence | Acceptance evidence |
|---|---|---|---|
| D01 | TypeScript, ESM, ES2022; platform-neutral SDK/kernel | Rust-first adds an unnecessary native bridge; Node-bound kernel excludes web hosts | P1 compiles without Node or DOM ambient types; P9 adds target execution checks |
| D02 | npm workspaces, exact locked TypeScript dependency, `tsc`, built-in Node test runner | Bundlers and additional test frameworks are unnecessary for initial packages | Clean `npm ci` and package-focused checks in P1 |
| D03 | Serializable manifest is the only identity/dependency/permission metadata; definition contains manifest and activation | Repeating IDs in definitions creates drift | P2 validates manifest plus token declarations; no separate definition ID |
| D04 | `@lunaris/sdk` for plugins; `@lunaris/kernel` for trusted hosts | Exposing the registry makes plugins dependent on implementation details | Root-only exports; SDK has no kernel dependency; P1 boundary checks |
| D05 | Contract key is kind + canonical ID + full SemVer; one provider per requirement binding | Object identity fails with duplicate contract packages; automatic winner selection hides ambiguity | P2 identity and P4 ambiguity/substitution tests |
| D06 | Serialize transitions per plugin, reject direct reentrancy, stage registrations, bounded deadlines; [P3 refines host scheduling and asynchronous attribution](0002-lifecycle-execution.md) | Parallel mutation and forced JavaScript termination are not supported; indirect async self-waits require deadlines | P3 rollback, race, timeout and stale-activation tests |
| D07 | Stable ID topological start and reverse stop; events snapshot listeners; hooks waterfall | Race-dependent ordering prevents reproducibility | P4 graph and P5 exact-order tests |
| D08 | Host grants, default denial, checked on every mediated operation; trusted local realm | Manifest self-grants are unsafe; hostile-code isolation requires another host architecture | P6 revocation and provider-authority tests |
| D09 | Logger and commands are ordinary replaceable capability plugins | Mandatory context services couple the kernel to applications | P7 kernel starts without either plugin; bounded internal diagnostics never invoke logger |
| D10 | Independent 0.1.0 SDK/kernel/manifest versions; SemVer via `semver` package | Custom parsers are error-prone; lockstep versions imply false compatibility | P2 range tests, P9 release matrix |

## Supported environment and version policy

The first development/verification target is Windows x64 with Node 26.13.0 and npm 11.20.0, as observed in this repository. The supported Node range starts at 26.13.0 and ends before 27.0.0; only the observed version is verified initially. Browsers, Linux, macOS, Capacitor and Tauri have no execution-support claim yet. ES2022 output and platform-neutral imports prepare those targets without claiming they work.

TypeScript 6.0.3 is pinned in P1; it is a development tool, not a runtime dependency. Registry-latest 7.0.2 exposes its AST API only through unstable exports; 6.0.3 retains the stable compiler API used for architecture checks. Upgrade only after those checks are migrated. Node's built-in test runner runs compiled JavaScript or JavaScript tests against package exports. No custom test framework is introduced. Compiler options follow the [official TSConfig reference](https://www.typescriptlang.org/tsconfig/); runner behavior follows the [Node test documentation](https://nodejs.org/api/test.html).

Use strict SemVer versions, without a `v` prefix. Ranges use the `semver` package defaults: prereleases match only when the range explicitly admits the corresponding prerelease tuple. Engine and SDK ranges are checked against the host's actual versions before activation. Before 1.0, breaking public changes increment minor; compatible fixes increment patch. Plugin and contract versions remain independent.

Different major versions can coexist. Within a plugin, a contract kind/ID occurs once per provides/requires list; the same kind/ID cannot be both optional and required. A provided version must exactly equal its token version; a required range must include its token version. Requirement resolution matches providers compatible with both the requirement range and the consumer token's major. Tokens with the same canonical key must agree on permission metadata. Validator function identity is not contract identity: each boundary applies its locally supplied validator. Shape compatibility is a contract author's versioning responsibility.

For API requirements, more than one matching provider is an error unless the host explicitly chooses a plugin. Events/hooks have one selected publishing/invoking owner per requirement as well; multiple declared consumers can subscribe/register handlers. Only the declared provider emits an event or invokes a hook. This avoids a separate global bus and keeps permissions and dependency loss attributable.

## Review of proposal and deferrals

The core retains lifecycle, ownership, contracts, graph resolution, dispatch and mediated permissions. Proposal examples using `ctx.log`, `ctx.commands`, raw native access or a global registry are deliberately replaced by ordinary contracts. `pack`, `publish`, migration, adapters, certification, registry, hot reload, UI and native hosts remain deferred as listed in the implementation plan. No speculative interfaces for them are created.

No unresolved decision blocks P1/P2. Runtime evidence is a future gate, not evidence that accepting these decisions implements them. Public signatures and scenario mapping live in [the boundary specification](../reference/core-boundary.md) and [design scenarios](../reference/design-scenarios.md).

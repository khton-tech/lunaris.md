# Server readiness and update workflow review

Date: 2026-11-09. Scope: server behavior, installation, updates from the main
Lunaris repository, integration boundaries, and operational readiness.

Reviewed revisions:

- Client: `4aa4213476d6d51be9ab839659c165bbb5ee7c30`, `feat/web-server-foundation`.
- Server: `c0b068c5713f1c1d0f3e21eae89263c83eef9033`, `feat/server-foundation`.

Both working trees were clean before review. No product implementation was changed.
Server paths below are relative to the sibling `lunaris-server` repository.

## Remediation follow-up

The findings below describe the original reviewed revisions. Subsequent work on
`fix/server-deployment-readiness` and `fix/server-release-integration` addresses
their implementation and local workflow:

- Finding 1: image releases are copied with node ownership, including the private
  active pointer. Real Linux Docker execution is still pending.
- Finding 2: installation enforces a private `0700` host deployment directory and
  a `0644` individually mounted public-policy file, preserving readable container
  configuration independently of the host UID. Environment/state files stay
  `0600`. The isolated Docker smoke exercises a root-owned policy when run.
- Finding 3: protected HTTP routes authenticate before buffering. All POST bodies
  have declared-length and streaming byte limits (16 MiB file JSON; 16 KiB other
  requests), with real HTTP regression tests.
- Finding 4: `npm run server:check` provides the paired local gate. Local code CI
  invokes it automatically when the sibling server exists; missing server source
  is reported explicitly, or rejected when required/configured. Remote paired CI
  remains pending by Owner preference: the server is local-only, with no remote.
- Local synchronization is implemented by `npm run dev:server`: shared TypeScript
  watching, browser Vite/HMR and serialized API restart. No source synchronization
  through Git, publishing, or production update service is configured.
- Docker smoke and backup-volume instructions now exercise/document non-root
  operation, an actual note, offline snapshot and restore to an empty volume.

Validation: 47 remote tests, 20 server tests (24 syntax-checked source files),
3 development synchronization tests, and the existing CI-selection test passed.
The development integration covers shared-source edits, compile errors and
correction, API restart, session/note persistence and configuration reload using
temporary data. Docker and manual browser/desktop visual acceptance remain
unverified. See [local development](../guides/server-development.md).

## Assessment

The native client/server foundation is usable for continued product development.
The server is not yet a verified, convenient self-hosted release. Docker packaging
contains a release-pointer permission defect; real Docker execution is still
unverified. Development does not require a server redesign, but deployment needs
a short stabilization pass before being presented as a supported installation.

## Findings

### 1. [P1] The baked release pointer is unreadable by the container runtime user

Evidence: server `src/bundles.mjs:36`, `tools/scripts/container-bundle.mjs`,
`Dockerfile:10`, `Dockerfile:15`, and `Dockerfile:17`.

The build stage runs bundle activation as root. Activation creates `current.json`
with mode `0600`. The final image copies releases without assigning ownership or
changing this mode, then runs as `node`. Consequently that user cannot read the
root-owned pointer. Both the root page and `/api/v1/server` read it through
`plugins/systems/driver/browser-bundles/index.mjs:13`; their requests fail and the
Compose readiness check cannot succeed. Creating/chowning the data volume does
not change release ownership.

Assign appropriate ownership/read permissions to the packaged releases and test
the actual image as its configured runtime user. This conclusion follows from
the Dockerfile and file modes; no container reproduction was possible here.

### 2. [P1] Linux configuration permissions assume a matching host/container UID

Evidence: server `tools/scripts/install.mjs:44`, `compose.yaml` configuration bind
mount, `Dockerfile:17`, and `src/config.mjs:7`.

The installer writes `deployment/server.json` as the invoking host user with mode
`0600`, while the container reads it as `node`. On a conventional Linux engine,
running the documented installer as root or another UID that does not match the
container user makes the mounted configuration unreadable. The shell bootstrap
explicitly supports root invocation. Read-only mounting does not grant read
access. A typical host user matching the image UID can conceal this defect.

Define and implement configuration ownership/group handling for the runtime user;
verify root and nonmatching-UID installations. Keep sensitive config private.
User namespaces/rootless engines also require explicit acceptance.

### 3. [P1] Unauthenticated non-authentication requests have no body bound

Evidence: server `plugins/systems/driver/http/index.mjs:49-55` and `:69-72`.

Only login/register/logout bodies are capped at 16 KiB. Requests to valid file,
catalog, and other POST routes are buffered and JSON-parsed before session
authorization. An unauthenticated caller can therefore consume memory with an
arbitrarily large body. This is distinct from a legitimate authenticated user's
file quota. The default Compose deployment supplies no proxy-side body bound.

Bound all request bodies and authenticate protected routes before expensive body
processing where possible. Return a controlled rejection and test unauthorized
oversized requests. No resource-exhaustion experiment was performed.

### 4. [P2] Ordinary main-repository CI does not exercise the real server integration

Evidence in the client: `.github/workflows/core.yml`, `tools/scripts/ci.mjs`,
`tools/scripts/check.mjs`, and `tools/scripts/remote.mjs`.

Core CI checks out only the client and runs scoped checks. The real-server test
`tools/scripts/remote-integration.test.mjs` is included by the separate
`remote:check` command, which is not invoked there. The reviewed server checkout
has no `.github` workflow. Changes to shared SDK/plugin behavior can therefore
pass ordinary client CI without exercising the server consumer.

Add a dedicated paired-repository job with explicit compatible revisions. Run
server checks, remote checks, production web build, and a Linux container smoke
test. Keep ordinary local component checks targeted.

## What exists

- SDK-composed server: accounts, sessions, invitations, owner-checked Vault
  catalog, replaceable infrastructure drivers, and structured logging.
- SQLite metadata and ordinary Vault files, journaled lifecycle recovery,
  conditional writes, observations, and single-process ownership locking.
- Shared browser/desktop application composition, remote filesystem routing,
  account UI, durable browser drafts, and guarded reload/update behavior.
- Native versioned web releases: hash verification, atomic activation, retained
  old assets, and frontend rollback.
- Offline data snapshots with checksums and restore into empty directories.
- Dockerfile, Compose configuration, OS dependency bootstraps, and a repeatable
  installer that preserves deployment policy and the named data volume.

These are implemented boundaries and tested behavior, not proof of complete
manual browser/Tauri or Docker acceptance.

## How updating actually works

The server depends on `file:../lunaris.md/...` SDK/kernel/domain/logger packages.
The main repository supplies the browser source. Both repositories must exist
under their expected sibling names. Neither installing nor restarting the server
fetches a release or chooses a compatible pair of commits.

For ordinary UI/editor/plugin changes already included in `hosts/application`,
development remains in the main repository. Native deployment builds and activates
a new bundle with the existing bundle commands. No duplicate server UI is needed.
The profile currently selects only editor/files/settings; adding a new product
entrypoint still requires explicit host/profile composition. File Explorer is
mandatory because it owns Vault switching.

For HTTP protocol or shared contract changes, server services/drivers and both
client transports/consumers must be reviewed together. Current protocol matching
checks a single integer (`1`); it does not establish semantic compatibility of
arbitrary SDK revisions. No kernel/SDK implementation blocker was established by
this review; missing APIs in future development remain subject to the SDK gate.

Docker updates rebuild the image from two clean, manually updated checkouts and
force-recreate the service. Policy and data persist, but there is downtime.
Old browser assets live in the old image and disappear from the running service;
old tabs can fail when requesting assets they did not cache. This limitation is
already documented in `DOCS/docker.md` and differs from native bundle activation.

The installer records the client SHA, but does not define a tested server/client
release pair, create a backup, run integration checks, or automatically recover
from a failed replacement. The fixed `lunaris-server:local` image tag also provides
no named release history. Frontend rollback is not server/database rollback.

Docker snapshot operations need an explicit host-mounted backup destination and
restore recipe; the current Docker guide refers to the native snapshot procedure
without providing those mounts. A snapshot written only into a disposable
`compose run --rm` container would be lost when that container exits.

## Recommended next work

1. Fix both permission issues and request-body admission. Verify a real Linux
   image with root and nonmatching-UID installation cases.
2. Add the paired-repository CI gate. Record tested client/server commits and
   schema/protocol versions as a release, rather than relying on matching HEADs.
3. Document a complete Docker backup/update/restore procedure using persistent
   backup mounts and identifiable image tags. Decide whether old browser assets
   must survive Docker replacement; retain them if seamless updates are promised.
4. Manually accept clean installation, register/create/edit/reload, edited-tab
   update, container restart, and backup/restore with real files. Also verify
   desktop local -> remote -> local and account/session failure behavior.
5. Continue normal Lunaris development through the shared host and SDK contracts;
   use `npm run remote:check` when changing remote-relevant contracts/consumers.

Avoid building a general plugin marketplace, distributed server, or complex
deployment framework to solve these bounded release-management issues.

## Verification performed

- Server `npm run check`: 22 source syntax checks; 19 tests passed, none skipped.
- Client `npm run remote:check`: 47 tests passed, none skipped; shared browser and
  desktop compilation, public type fixtures, boundaries, real HTTP/SQLite/files,
  offline drafts and update guards.
- Client `npm run web:build`: production build passed; Vite warned about the
  approximately 1.47 MB minified JavaScript chunk (approximately 459 kB gzip).
- Docker command was unavailable. No packages were installed, no live deployment
  was replaced, and no OS/browser automation was used. Linux permissions, native
  installer prompts, container upgrades and visual interaction remain unverified
  by execution. Findings 1 and 2 are static permission analysis.

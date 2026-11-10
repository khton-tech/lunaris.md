# Plugin display metadata

`PluginMetadata`, `PluginPlatform` and `PluginPlatforms` are exported from
`@lunaris/manifest` and re-exported by `@lunaris/sdk`. Manifest version remains 1.
`metadata` is optional for legacy built-ins; installable LUP packages require it.
The shared `validateManifest` implementation validates and deeply copies/freezes it.

Required metadata fields:

| Field | Rules |
| --- | --- |
| name, author | Nonempty text, at most 120 characters each |
| description | Nonempty text, at most 2000 characters |
| platforms | `"universal"` or a nonempty unique array of `desktop`, `web`, `mobile` |
| languages | 1-64 unique BCP 47 tags, compared without case; first is fallback |

Optional `repository` is an HTTPS URL with a dotted DNS hostname and optional
path, at most 2048 characters. Credentials, port, query, fragment, whitespace and
backslashes are rejected. It is a display link, never a code download/import source.
Optional `translations` maps declared language tags to optional `name` and
`description` using the same bounds. The base fields are the fallback; consumers
match locale without case, then its base language, then base metadata.
Optional `fields` contains at most 16 `{ label, value }` records, bounded to 80 and
500 characters respectively. All display text rejects control characters and is
inert plain text. Unknown fields/accessors/non-data objects are rejected.

Platform declarations describe author support, not authority or actual host
capabilities. `universal` includes all current/future host classes but does not
prove testing. Legacy `targets` remains independent finer-grained OS metadata.
If both exist, show coarse platform and exact-target warnings independently;
never silently synthesize an author's compatibility claim. Accepting a platform
warning cannot bypass unavailable required public contracts.

Verification: build of manifest/SDK and 37 manifest tests passed on 2026-11-10.
Installer, UI and CLI consumption remain separate Lime integration work.

Language checking uses well-formed RFC 5646 syntax, including extensions and
private use, and rejects duplicate variants/extension singletons. It does not
depend on Intl, perform an IANA registry lookup or rewrite author casing. This
keeps the same validator runnable in the isolated interpreter. A real bundled
SDK/Logger plugin with display metadata is verified through the host runtime.

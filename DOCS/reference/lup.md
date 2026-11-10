# LUP package format version 1

Implemented by `@lunaris/lup`: `packLup(entries, hostVersions?)`,
`inspectLup(bytes, hostVersions?)`, `validLupPath`, `LUP_LIMITS` and `LupError`.
Both author tooling and the installer must use this implementation. Inspection
never evaluates modules, calls plugin code or extracts files to the filesystem.

## Container

`.lup` is a deterministic, uncompressed, file-only binary container. It is not ZIP.
This deliberately avoids compression expansion, executable archive metadata,
symlinks, permissions and directory entries. All bytes are little-endian:

| Bytes | Value |
| --- | --- |
| 0-2 | ASCII `LUP` |
| 3 | Format version, currently 1 |
| 4-7 | Unsigned 32-bit entry count |
| Each entry | Unsigned 16-bit UTF-8 path byte count; unsigned 32-bit content byte count; path bytes; content bytes |

Entry order is lexical path order when packing. Inspection accepts arbitrary
order but rejects duplicate/case-aliased paths. No trailing bytes are allowed.
Limits: 32 MiB total, 2-512 entries, 16 MiB per file, 64 KiB manifest, 240 bytes per
path. Checks precede copying individual entry data. There is no decompression.
Unsupported format versions fail explicitly.

Paths are package-relative ASCII letters/digits plus `_`, `.`, `-` and `/`.
Empty/dot/dot-dot segments, leading slash, backslash, colon/ADS, encoded paths,
whitespace, trailing dot, Windows device names and file/directory prefix conflicts
are rejected. Restricting asset filenames makes the format portable across hosts;
localized display names belong in metadata. An extractor must additionally enforce
real root containment and avoid following pre-existing filesystem symlinks; format
validation cannot authorize an unsafe extraction destination.

## Manifest and code

`manifest.json` uses the shared manifest version 1 with required
[display metadata](plugin-metadata.md). Its declared JavaScript entry must exist.
Supplying host versions checks engine/SDK compatibility. Platform declarations
remain warnings. Preview requires no module evaluation; exported definition versus
archive manifest consistency is a separate execution-time loader check.

The archive carries complete built assets. Public SDK/contract dependencies must
be bundled or resolved from a host-controlled versioned public import map by the
execution adapter; native/host/private imports and remote code are unavailable.
The container validates byte structure and manifests, not JavaScript import graphs.
Author tooling must check/build the module graph before packing. Source projects,
node_modules and implicit machine paths are not installation dependencies.

Inspection returns immutable metadata/path snapshots, SHA-256 of all exact archive
bytes, byte length and methods returning fresh copies of assets/archive bytes.
Confirmation must retain this inspected byte identity. A digest binds preview to
content; it is not a signature, trust decision or filesystem authorization.

## Installation boundary still under implementation

Portable storage belongs under `.lunaris/plugins`. Committed registry, staging,
installation recovery, migrations and data retention require the Lime storage and
engine contracts; the codec does not implement them. A copied archive is inspected
again before use. Registry/package version conflicts must not silently overwrite.
No filesystem extraction, UI install or product execution is claimed by codec tests.

Targeted codec tests cover deterministic/inert previews, immutable byte identity,
malformed/truncated/oversized inputs, hostile raw paths, duplicate/prefix aliases,
manifest requirements and host incompatibility.

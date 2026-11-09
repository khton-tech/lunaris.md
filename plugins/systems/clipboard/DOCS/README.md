# Clipboard provider

Purpose: mediate portable text clipboard operations. Provides Clipboard 1.0; requires ClipboardDriver and Logger, with clipboard.access. Calls capabilities(), readText() and writeText(text) through ctx.use. No events, native imports, text persistence or UI. Shared browser/Tauri composition supplies a replaceable driver. See [public API and platform limits](../../../../DOCS/reference/clipboard.md).

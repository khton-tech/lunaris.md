# Filesystem router

Host factory `createFilesystemRouter(sources, defaultSource)` implements the
standard filesystem driver APIs and FilesystemSources. Each source declares
explicit backend API/event tokens, acquired exclusively through ctx.use and SDK
events. Logger is required. The default source owns application config and local
selection; attachment I/O always stays on its original source.

Root/watch IDs are translated using activation-owned maps. Durable locations use
an opaque versioned reference containing source identity and backend reference;
labels are presentation only. Legacy locations belong to the default source.
Unknown explicit sources fail, never fall back. Backend drivers own native cleanup
and owner cancellation; router cleanup removes local maps/listeners only.

The legacy global capabilities snapshot is conservative across configured
backends. FilesystemSources.capabilitiesFor provides the attached root's snapshot.
Cross-root transfers remain unsupported. Source IDs must be stable across restarts.

Integration: wire backend tokens in host composition, then register the existing
filesystem provider above this router. Do not also select legacy backend driver
contracts for that provider. Vault, Config, Explorer and Editor continue consuming
their existing APIs; server catalog consumers wrap locations through
FilesystemSources.location before VaultLocations.open.

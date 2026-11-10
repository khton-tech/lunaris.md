# remote-filesystem

Provides the RemoteFilesystemBackend public SDK contract. See [remote contracts](../../../../../DOCS/reference/remote.md) for API methods and ownership.

Required Logger reports readiness, meaningful state changes, degradation and failures
without passwords, tokens, file contents or display paths. Access to dependencies
uses ctx.use; subscriptions and platform resources belong to SDK scopes.

Integration: composed with Filesystem Router, Vault Manager and account access UI.
The transport driver owns HTTP and credentials; account-session gates connection
changes through Vault.close. Remote filesystem owns account-bound attachments and
rescan observations. Browser storage persists device configuration and revisioned
drafts in IndexedDB; drafts-provider validates stable document identities.

Current tests cover the module's lifecycle and failure boundaries. Product visual
acceptance is pending host integration.

Protocol content limits: REMOTE_FILE_LIMITS defines a conservative 1 MiB raw UTF-8/binary file ceiling and a separate 16 MiB encoded JSON file-request ceiling. Capabilities expose the content ceiling per remote source through FilesystemSources. Oversized content is rejected before JSON byte-array expansion; transport also checks the encoded envelope. ServerInfo may advertise limits; smaller/incomplete advertised limits are incompatible. Legacy protocol-1 servers without the field use the same conservative client ceiling, never an unlimited fallback. Text escaping, multibyte UTF-8 and binary expansion are distinct from raw bytes. The paired server enforces writes, HTTP admission and oversized externally populated reads.

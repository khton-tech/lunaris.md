# browser-storage

Provides the DraftStorage public SDK contract. See [remote contracts](../../../../../DOCS/reference/remote.md) for API methods and ownership.

Required Logger reports readiness, meaningful state changes, degradation and failures
without passwords, tokens, file contents or display paths. Access to dependencies
uses ctx.use; subscriptions and platform resources belong to SDK scopes.

Integration: composed with Filesystem Router, Vault Manager and account access UI.
The transport driver owns HTTP and credentials; account-session gates connection
changes through Vault.close. Remote filesystem owns account-bound attachments and
rescan observations. Browser storage persists device configuration and revisioned
drafts in IndexedDB; drafts-provider validates stable document identities.

Device-file versions remain SHA-256 content fingerprints, calculated with the
pinned `@noble/hashes/sha2.js` implementation inside this driver. Existing versions
and conditional writes remain compatible. No `crypto.subtle` or secure-context
dependency is required for configuration/draft storage, so an HTTP IP origin can
initialize normally. Use HTTPS for credentials and note transport on public
networks; supporting HTTP storage does not encrypt HTTP traffic.

Current tests cover the module's lifecycle and failure boundaries. Product visual
acceptance is pending host integration.

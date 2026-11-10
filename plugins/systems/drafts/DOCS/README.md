# drafts

Provides the Drafts public SDK contract. See [remote contracts](../../../../DOCS/reference/remote.md) for API methods and ownership.

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

## Writer-safe recovery (Drafts and DraftStorage 2.0)

Document identity remains server/account/Vault/path. Saving requires a nonempty key.writerId (DraftWriteRecord); each editor session generates an independent random 128-bit identity, since activation IDs are only kernel-local. save replaces that writer's snapshot only. list(documentKey) returns every writer and legacy candidate without selection. load(key) reads the exact writer (or the legacy slot when writerId is absent). remove(key, revision) conditionally acknowledges only that writer and revision; newer revisions and other writers survive. Consumers must upgrade their manifest requirement to ^2.0.0. The provider validates identities and forwards all four methods through the public storage contract.

IndexedDB schema 2 adds draft-writers atomically and retains the original drafts store as legacy recovery data. No legacy record is deleted during upgrade. Version-change closes older connections; blocked upgrades require closing other tabs. Recovery enumerates both stores. The editor copies recovered content into its new writer slot; successful remote saving acknowledges that slot and the selected original revision, leaving all unselected candidates intact. Failed cleanup stays protected and retryable.

Multiple candidates require an explicit choice through the public text-editor component role. The buffer is read-only before selection, and no candidate is autosaved implicitly. A chosen candidate is copied durably and requires explicit save/review. Page-close protection includes pending recovery work and storage failures. Discard waits for saves and removes only the current/selected records before acknowledging success.

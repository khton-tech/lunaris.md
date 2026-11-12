# Tauri session credentials

Purpose: persist the last desktop server session in the operating system's secure
credential store, separately from notes, Config, history and browser storage.
Provides SessionCredentials 1.0 (@lunaris/remote), requiring credentials.native;
only trusted transport consumers receive credentials.access. Logger is required.

API: load() returns the saved { server, account: { id, login }, token } or null;
save(record) replaces that session; remove(token) deletes only the matching token.
No password is stored. The native bridge uses a fixed app.lunaris.desktop service
and server-session-v1 entry, never caller-selected filenames or keychain entries.
Windows uses Credential Manager, macOS uses Keychain, Linux uses Secret Service.
Unsupported platforms fail explicitly; there is no plaintext or mock fallback.
The native worker serializes access. Unavailable/locked secure storage reports a
failure; transport logs degraded memory-only behavior rather than failing login.
Native logs and error messages do not contain tokens or account payloads.

Integration: Tauri registers the native command and main-window-only capability,
loads this replaceable driver, and grants the transport credentials.access.
Transport restores before becoming available to AccountSession/VaultHistory/
VaultSelector. It validates the exact server origin and verifies GET account.
Temporary offline failures preserve the saved identity for history visibility;
all remote operations still require server authentication. Expired sessions and
successful logout clear the matching credential. Shutdown does not revoke it.
Only the most recently signed-in server/account is remembered. Opening another
origin never forwards a saved token. Existing history/location references and
note storage are unchanged. A previously memory-only session needs one new login.

Verification: npm run session:check runs focused transport, driver and real-server
restart checks. cargo test --manifest-path plugins/systems/driver/tauri-credentials/native/Cargo.toml
checks native storage using an isolated temporary credential entry (deleted after
success), never the production entry. Windows native roundtrip and host release
build were verified; macOS/Linux runtime acceptance is pending. Test the produced
native client by signing in once, opening a remote Vault, quitting and reopening.
Do not expect a web-only update in an old native executable to add the command.

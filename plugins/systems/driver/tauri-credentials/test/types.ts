import { createTauriCredentials } from "@lunaris/tauri-credentials";

createTauriCredentials();
createTauriCredentials(async () => ({ ok: true, value: null }));
// @ts-expect-error The bridge must return a RemoteResult envelope.
createTauriCredentials(async () => null);

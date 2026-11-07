import type { ActiveDocumentApi } from "@lunaris/active-document";
declare const documents: ActiveDocumentApi;
documents.open({ vaultId: "vault", path: "folder/note.md" });
// @ts-expect-error Explicit Vault identity is mandatory.
documents.open({ path: "note.md" });
documents.relocate({ vaultId: "a", path: "folder" }, { vaultId: "a", path: "renamed" });

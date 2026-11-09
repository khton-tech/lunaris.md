import { createFilesystemRouter } from "@lunaris/filesystem-router";
import { LocalFilesystemBackend } from "@lunaris/filesystem";
void createFilesystemRouter([{ id: "local", ...LocalFilesystemBackend }], "local");
// @ts-expect-error Raw driver implementations cannot be registered instead of SDK tokens.
createFilesystemRouter([{ id: "local", api: { readText() {} }, changed: LocalFilesystemBackend.changed }], "local");

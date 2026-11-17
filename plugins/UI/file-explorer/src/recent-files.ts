import type { ConfigApi, ConfigTarget } from "@lunaris/config";
import { validPath } from "@lunaris/filesystem";
import type { FileMutation, FilesystemApi } from "@lunaris/filesystem";

const limit = 5;
const key = "recentFiles";
const inside = (path: string, source: string) => path === source || path.startsWith(`${source}/`);

export class RecentFiles {
  #paths: readonly string[] = [];
  #queue: Promise<void>;
  private readonly target: ConfigTarget;

  constructor(readonly vaultId: string, private readonly config: ConfigApi, private readonly pluginId: string,
    private readonly active: () => boolean, private readonly changed: () => void,
    private readonly warn: (message: string, error: unknown) => void) {
    this.target = { scope: "vault", vaultId };
    this.#queue = Promise.resolve().then(async () => {
      if (!active()) return;
      const result = await config.get(pluginId, key, this.target);
      if (!active()) return;
      if (!result.ok) { warn("Cannot load recent files", result.error); return; }
      if (Array.isArray(result.value)) {
        this.#paths = [...new Set(result.value.filter((path): path is string => validPath(path)))].slice(0, limit);
        changed();
      }
    }).catch(error => { if (active()) warn("Cannot load recent files", error); });
  }

  get paths(): readonly string[] { return this.#paths; }

  record(path: string): void {
    this.change(paths => [path, ...paths.filter(item => item !== path)].slice(0, limit));
  }

  forget(path: string): void {
    this.change(paths => paths.filter(item => item !== path));
  }

  fileMutated({ operation, source, destination }: FileMutation): void {
    if (source.vaultId !== this.vaultId || operation === "copy") return;
    this.change(paths => [...new Set(paths.flatMap(path => {
      if (!inside(path, source.path)) return [path];
      return destination ? [destination.path + path.slice(source.path.length)] : [];
    }))]);
  }

  verify(fs: FilesystemApi, affected?: readonly string[]): void {
    this.change(async paths => {
      const checks = await Promise.all(paths.map(async path => {
        if (affected && !affected.some(source => !source || inside(path, source))) return true;
        const result = await fs.stat({ vaultId: this.vaultId, path });
        return result.ok ? result.value.kind === "file" : !["NOT_FOUND", "NOT_DIRECTORY", "NOT_FILE"].includes(result.error.code);
      }));
      return paths.filter((_, index) => checks[index]);
    });
  }

  private change(update: (paths: readonly string[]) => readonly string[] | Promise<readonly string[]>): void {
    this.#queue = this.#queue.then(async () => {
      if (!this.active()) return;
      const next = await update(this.#paths);
      if (!this.active() || (next.length === this.#paths.length && next.every((path, index) => path === this.#paths[index]))) return;
      this.#paths = next;
      this.changed();
      const result = await this.config.set(this.pluginId, key, next, this.target);
      if (this.active() && !result.ok) this.warn("Cannot persist recent files", result.error);
    }).catch(error => { if (this.active()) this.warn("Cannot update recent files", error); });
  }
}

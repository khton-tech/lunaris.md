import { NativeProcesses } from "@lunaris/execution";
import type { NativeProcess } from "@lunaris/execution";
import { Logger } from "@lunaris/logging";
import { definePlugin, LunarisError } from "@lunaris/sdk";
import { requestProcess } from "./native.js";
import type { ProcessBridge } from "./native.js";

const maxBytes = 16 * 1024 * 1024;
const maxLine = 16 * 1024;
const maxArgs = 32;
const encoder = new TextEncoder();

export function createTauriProcesses(bridge: ProcessBridge = requestProcess) {
  return definePlugin({
    manifest: {
      manifestVersion: 1, id: "lunaris.tauri-processes", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/index.js",
      provides: [{ kind: NativeProcesses.kind, id: NativeProcesses.id, version: NativeProcesses.version }],
      requires: [{ kind: Logger.kind, id: Logger.id, range: "^1.0.0" }],
      permissions: [], optionalPermissions: [],
    },
    activate(ctx) {
      const logger = ctx.use(Logger);
      const scopes = new Map<string, Set<NativeProcess>>();
      const logError = (message: string, error: unknown) => {
        if (!ctx.signal.aborted) logger.error(ctx.pluginId, message, { error });
      };
      ctx.scope.own({ async dispose() {
        const outcomes = await Promise.allSettled([...scopes.values()].flatMap(set => [...set].map(handle => handle.dispose())));
        const errors = outcomes.flatMap(outcome => outcome.status === "rejected" ? [outcome.reason] : []);
        if (errors.length) throw new AggregateError(errors, "Native helper cleanup failed.");
      } });
      ctx.provide(NativeProcesses, {
        async start(owner, options) {
          owner.scope.signal.throwIfAborted();
          ctx.signal.throwIfAborted();
          const executable = options.executable;
          const args = [...options.args ?? []];
          const onLine = options.onLine;
          const asset = owner.resources.list().find(item => item.path === executable);
          if (!executable.startsWith("assets/") || !executable.toLowerCase().endsWith(".exe") ||
              !asset || asset.byteLength < 2 || asset.byteLength > maxBytes || args.length > maxArgs ||
              args.some(arg => typeof arg !== "string" || arg.includes("\0") || encoder.encode(arg).length > 1024) ||
              (onLine !== undefined && typeof onLine !== "function")) {
            throw new LunarisError("VALIDATION_FAILED", "Expected a packaged Windows executable and bounded argument data.");
          }
          const ownerId = `${owner.pluginId}/${owner.activationId}`;
          const bytes = new Array<number>(asset.byteLength);
          for (let offset = 0; offset < bytes.length; offset += 16384) {
            const length = Math.min(16384, bytes.length - offset);
            const chunk = owner.resources.read(executable, offset, length);
            if (chunk.length !== length) throw new LunarisError("VALIDATION_FAILED", "Invalid executable resource length.");
            for (let i = 0; i < length; i++) bytes[offset + i] = chunk[i]!;
          }
          const scope = owner.scope.child();
          const handles = scopes.get(ownerId) ?? new Set<NativeProcess>();
          scopes.set(ownerId, handles);
          let finish!: (code: number | null) => void;
          const exit = new Promise<number | null>(resolve => { finish = resolve; });
          let exited = false;
          let starting!: Promise<number>;
          function closed(code: number | null): void {
            if (exited) return;
            exited = true;
            finish(code);
            handles.delete(handle);
            if (!handles.size) scopes.delete(ownerId);
          }
          const handle: NativeProcess = Object.freeze({
            async write(line: string) {
              scope.signal.throwIfAborted();
              ctx.signal.throwIfAborted();
              if (exited) throw new LunarisError("SCOPE_CLOSED", "Native helper has exited.");
              if (typeof line !== "string" || /[\r\n\0]/.test(line) || encoder.encode(line).length > maxLine) {
                throw new LunarisError("VALIDATION_FAILED", "Expected one bounded line.");
              }
              const id = await starting;
              scope.signal.throwIfAborted();
              ctx.signal.throwIfAborted();
              await bridge({ kind: "write", owner: ownerId, id, line });
            },
            wait: () => exit,
            dispose: () => scope.dispose(),
          });
          handles.add(handle);
          scope.own({ async dispose() {
            try {
              const id = await starting.catch(() => null);
              if (!exited && id !== null) await bridge({ kind: "stop", owner: ownerId, id });
            } finally { closed(null); }
          } });
          starting = Promise.resolve().then(async () => {
            scope.signal.throwIfAborted();
            ctx.signal.throwIfAborted();
            const id = await bridge({ kind: "start", owner: ownerId, bytes, args }, event => {
              if ("exit" in event) {
                closed(event.exit);
                if (!ctx.signal.aborted && !scope.signal.aborted) {
                  logger.debug(ctx.pluginId, "Native helper exited", { data: { pluginId: owner.pluginId, code: event.exit } });
                }
                // Disposal removes the owner's child scope. If it already initiated
                // shutdown, the native exit event only settles the wait handle.
                if (!scope.signal.aborted) void scope.dispose().catch(error => logError("Native helper cleanup failed", error));
              } else if (!exited && !scope.signal.aborted && !ctx.signal.aborted && onLine) {
                try {
                  void Promise.resolve(onLine(event.line)).catch(error => logError("Native helper listener failed", error));
                } catch (error) { logError("Native helper listener failed", error); }
              }
            });
            if (id === null || !Number.isSafeInteger(id) || id < 1) throw Error("Native helper returned no process ID.");
            return id;
          });
          try {
            await starting;
            owner.scope.signal.throwIfAborted();
            ctx.signal.throwIfAborted();
            logger.info(ctx.pluginId, "Native helper launched", { data: { pluginId: owner.pluginId } });
            return handle;
          } catch (error) {
            logError("Native helper could not start", error);
            await scope.dispose();
            throw error;
          }
        },
      });
      logger.info(ctx.pluginId, "Native process driver ready");
    },
  });
}

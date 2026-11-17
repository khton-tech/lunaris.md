import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import test from "node:test";
import { createApplicationExecution, HostSession } from "@lunaris/application-host";
import { LimeRuntime } from "@lunaris/lime";
import { Logger } from "@lunaris/logging";
import { inspectLup } from "@lunaris/lup";
import { defineApi, defineEvent, definePlugin } from "@lunaris/sdk";
import { createTauriProcesses } from "@lunaris/tauri-processes";
import { TestScheduler } from "@lunaris/test";
import { Vault } from "@lunaris/vault";

const Pressed = defineEvent({ id: "example.global-hotkey-pressed", version: "1.0.0" });
const Observed = defineApi({ id: "test.observed-hotkey", version: "1.0.0" });
const tokenMetadata = ({ kind, id, version }) => ({ kind, id, version });
const plugin = (id, provides, requires, activate, permissions = []) => definePlugin({
  manifest: {
    manifestVersion: 1, id, version: "1.0.0", engine: "^0.1.0", sdk: "^0.1.0",
    entry: "./plugin.js", permissions, optionalPermissions: [],
    provides: provides.map(tokenMetadata),
    requires: requires.map(({ kind, id }) => ({ kind, id, range: "^1.0.0" })),
  },
  activate,
});

test("the packed hotkey plugin owns a Windows helper and emits its own SDK event", async () => {
  const archive = inspectLup(await readFile(process.env.LUNARIS_HOTKEY_LUP));
  const executable = process.env.LUNARIS_HOTKEY_BINARY;
  const binary = await readFile(executable);
  const resourcePath = "assets/bin/hotkey.exe";
  assert.deepEqual(Buffer.from(archive.read(resourcePath)), binary);
  assert.equal(binary.subarray(0, 2).toString("ascii"), "MZ");
  const environment = { vaultId: "hotkey-test", generation: 1 };
  const received = Promise.withResolvers();
  const calls = [];
  let runtime;
  let helper;

  const native = createTauriProcesses(async (request, receive) => {
    calls.push(request.kind);
    if (request.kind === "start") {
      assert.deepEqual(Buffer.from(request.bytes), binary);
      assert.deepEqual(request.args, []);
      // Exercise the compiled binary's protocol without registering or sending any OS keys.
      const child = spawn(executable, ["--probe"], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      lines.on("line", line => receive({ line }));
      const exited = once(child, "close").then(([code]) => { receive({ exit: code }); return code; });
      helper = { child, exited, owner: request.owner };
      await once(child, "spawn");
      return 1;
    }
    assert.deepEqual(request.owner, helper.owner);
    assert.equal(request.id, 1);
    if (request.kind === "stop") {
      helper.child.stdin.end("stop\n");
      assert.equal(await helper.exited, 0);
    } else {
      assert.equal(request.kind, "write");
      helper.child.stdin.write(request.line + "\n");
    }
    return null;
  });
  const components = [
    plugin("test.logger", [Logger], [], ctx => {
      const log = () => true;
      ctx.provide(Logger, { log, debug: log, info: log, warn: log, error: log });
    }),
    plugin("test.vault", [Vault], [], ctx => {
      const current = () => null;
      const close = async () => ({ ok: true, value: null });
      ctx.provide(Vault, { current, open: close, close });
    }),
    plugin("test.manager", [], [LimeRuntime], ctx => { runtime = ctx.use(LimeRuntime); }, ["runtime.manage"]),
    plugin("test.hotkey-observer", [Observed], [], ctx => {
      ctx.provide(Observed, { pressed: value => received.resolve(value) });
    }),
    createApplicationExecution(source => import("data:text/javascript;base64," + Buffer.from(source).toString("base64"))),
    native,
  ];
  const session = new HostSession({ scheduler: new TestScheduler(), load: async () => ({
    pluginRuntime: true, plugins: components, entrypoints: ["test.manager"],
    grants: { "test.manager": ["runtime.manage"] },
  }) });
  try {
    await session.start();
    assert.equal(session.snapshot().phase, "running");
    assert.equal((await runtime.open(environment)).ok, true);
    const entry = archive.manifest.entry.slice(2);
    const source = { entry, modules: { [entry]: new TextDecoder().decode(archive.read(entry)) }, resources: {
      [resourcePath]: [...binary],
    } };
    assert.equal((await runtime.register(environment, archive.manifest, source, true)).ok, true, JSON.stringify(session.snapshot().kernel.diagnostics));
    const { manifest } = plugin("test.hotkey-consumer", [], [Pressed, Observed], () => {});
    const consumerSource = { entry: "plugin.js", modules: { "plugin.js": "export default { manifest: " +
      JSON.stringify(manifest) + ", activate(ctx) { const observer = ctx.use(" + JSON.stringify(tokenMetadata(Observed)) +
      "); ctx.events.on(" + JSON.stringify(tokenMetadata(Pressed)) + ", payload => observer.pressed(payload)); } }" } };
    assert.equal((await runtime.register(environment, manifest, consumerSource, true)).ok, true);
    helper.child.stdin.write("press\n");
    assert.deepEqual(await received.promise, { shortcut: "Ctrl+Alt+Shift+H" });
    assert.equal((await runtime.disable(environment, archive.manifest.id)).ok, true);
    assert.equal(await helper.exited, 0);
    assert.deepEqual(calls, ["start", "stop"]);
  } finally {
    await session.stop();
    if (helper?.child.exitCode === null) helper.child.kill();
  }
});

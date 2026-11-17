import assert from "node:assert/strict";
import test from "node:test";
import { NativeProcesses } from "@lunaris/execution";
import { Logger } from "@lunaris/logging";
import { definePlugin } from "@lunaris/sdk";
import { createTestKernel } from "@lunaris/test";
import { createTauriProcesses } from "@lunaris/tauri-processes";

async function setup(bridge) {
  const kernel = createTestKernel();
  kernel.installMock(Logger, Object.fromEntries(["log", "debug", "info", "warn", "error"].map(level => [level, () => true])));
  kernel.register(createTauriProcesses(bridge));
  let ctx;
  let api;
  kernel.register(definePlugin({
    manifest: {
      manifestVersion: 1, id: "author.example", version: "1.0.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./index.js",
      provides: [], requires: [{ kind: "api", id: NativeProcesses.id, range: "^1.0.0" }], permissions: [], optionalPermissions: [],
    },
    activate(context) { ctx = context; api = ctx.use(NativeProcesses); },
  }), { resources: { "assets/bin/example.exe": [77, 90, 1, 2] } });
  await kernel.start("author.example");
  return { kernel, ctx, api };
}

test("a package uses captured bytes and the shared native contract with no origin grant", async () => {
  const requests = [];
  let receive;
  const { kernel, ctx, api } = await setup(async (request, listener) => {
    requests.push(request);
    if (request.kind === "start") { receive = listener; return 7; }
    return null;
  });
  await assert.rejects(api.start(ctx, { executable: "C:/test.exe" }), { code: "VALIDATION_FAILED" });
  const lines = [];
  const helper = await api.start(ctx, { executable: "assets/bin/example.exe", args: ["one two"], onLine: line => { lines.push(line); } });
  assert.deepEqual(requests[0], { kind: "start", owner: `${ctx.pluginId}/${ctx.activationId}`, bytes: [77, 90, 1, 2], args: ["one two"] });
  receive({ line: "ready" });
  await helper.write("one input");
  assert.equal(requests[1].line, "one input");
  await kernel.stop(ctx.pluginId);
  assert.equal(requests[2].kind, "stop");
  assert.equal(requests[2].id, 7);
  assert.equal(await helper.wait(), null);
  receive({ line: "late" });
  assert.deepEqual(lines, ["ready"]);
  await assert.rejects(helper.write("late"), { code: "SCOPE_CLOSED" });
  await kernel.stopAll();
  kernel.assertNoResources();
});

test("a natural exit settles the process and releases its resource scope", async () => {
  const requests = [];
  let receive;
  const { kernel, ctx, api } = await setup(async (request, listener) => {
    requests.push(request);
    if (request.kind === "start") { receive = listener; return 8; }
    return null;
  });
  const helper = await api.start(ctx, { executable: "assets/bin/example.exe" });
  receive({ exit: 12 });
  assert.equal(await helper.wait(), 12);
  await helper.dispose();
  assert.deepEqual(requests.map(request => request.kind), ["start"]);
  await kernel.stopAll();
  kernel.assertNoResources();
});

test("closing an activation during a pending spawn awaits the stop request", async () => {
  const ready = Promise.withResolvers();
  const spawn = Promise.withResolvers();
  const requests = [];
  const { kernel, ctx, api } = await setup(async request => {
    requests.push(request);
    if (request.kind === "start") { ready.resolve(); return await spawn.promise; }
    return null;
  });
  const opening = api.start(ctx, { executable: "assets/bin/example.exe" });
  await ready.promise;
  const stopping = kernel.stop(ctx.pluginId);
  await new Promise(resolve => setImmediate(resolve));
  spawn.resolve(9);
  await assert.rejects(opening, /stop|scope|abort/i);
  await stopping;
  assert.deepEqual(requests.map(request => request.kind), ["start", "stop"]);
  await kernel.stopAll();
  kernel.assertNoResources();
});

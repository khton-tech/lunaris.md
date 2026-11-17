import assert from "node:assert/strict";
import test from "node:test";
import { Components } from "@lunaris/components";
import { Logger } from "@lunaris/logging";
import { definePlugin } from "@lunaris/sdk";
import { createTestKernel } from "@lunaris/test";
import { ExternalWindowDriver, ExternalWindows } from "@lunaris/window/external";
import manager from "@lunaris/external-windows";

test("manager shutdown waits for a surface returned after opening was cancelled", { timeout: 3000 }, async () => {
  let api;
  const entered = Promise.withResolvers();
  const create = Promise.withResolvers();
  const closing = Promise.withResolvers();
  const destroyed = Promise.withResolvers();
  const signal = new AbortController();
  const ok = value => ({ ok: true, value });
  const noop = () => true;
  const consumer = definePlugin({ manifest: {
    manifestVersion: 1, id: "test.external-window-consumer", version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./test.js",
    provides: [], requires: [{ kind: ExternalWindows.kind, id: ExternalWindows.id, range: "^1.0.0" }],
    permissions: ["window.external"], optionalPermissions: [],
  }, activate(ctx) { api = ctx.use(ExternalWindows); } });
  const kernel = createTestKernel({ initialGrants: {
    [manager.manifest.id]: manager.manifest.permissions, [consumer.manifest.id]: consumer.manifest.permissions,
  } });
  kernel.installMock(Logger, { log: noop, debug: noop, info: noop, warn: noop, error: noop });
  kernel.installMock(Components, {
    has: noop, list: () => [], register: () => assert.fail("Unexpected registration"), mount: () => assert.fail("Cancelled surface mounted"),
  }, { grants: ["ui.dom"] });
  kernel.installMock(ExternalWindowDriver, { supported: noop, async open(_options, owner) {
    entered.resolve(owner);
    await create.promise;
    return ok({
      target: {}, signal: signal.signal, closed: destroyed.promise,
      show: async () => ok(null), hide: async () => ok(null), move: async () => ok(null), resize: async () => ok(null),
      async close() { closing.resolve(); await destroyed.promise; signal.abort(); return ok(null); },
    });
  } }, { grants: ["window.native"] });
  kernel.register(manager);
  kernel.register(consumer);
  await kernel.start(consumer.manifest.id);

  const opening = api.open({ title: "Window", size: { width: 192, height: 64 }, componentId: "test.component" }, new AbortController().signal);
  const owner = await entered.promise;
  let stopped = false;
  const stopping = kernel.stopAll().then(() => { stopped = true; });
  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.equal(owner.aborted, true);
    assert.equal(stopped, false);
    create.resolve();
    await closing.promise;
    assert.equal(stopped, false);
  } finally { create.resolve(); destroyed.resolve(); }
  assert.equal((await opening).error.code, "CANCELLED");
  await stopping;
  kernel.assertNoResources();
});

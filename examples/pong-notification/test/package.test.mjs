import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createApplicationExecution } from "@lunaris/application-host";
import manager from "@lunaris/external-windows";
import { inspectLup } from "@lunaris/lup";
import { definePlugin } from "@lunaris/sdk";
import { ExternalWindowDriver } from "@lunaris/window/external";
import { setupWorkspace, flush } from "../../../tools/test/workspace.mjs";

test("the packed plugin mounts and replaces a Pong notification through the SDK", async () => {
  const archive = inspectLup(await readFile(process.env.LUNARIS_PONG_LUP));
  const definition = createApplicationExecution(source => import("data:text/javascript;base64," + Buffer.from(source).toString("base64")));
  const windows = [];
  const ok = value => ({ ok: true, value });
  let document;
  const driver = definePlugin({ manifest: {
    manifestVersion: 1, id: "test.pong-driver", version: "1.0.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./driver.js",
    provides: [{ kind: ExternalWindowDriver.kind, id: ExternalWindowDriver.id, version: ExternalWindowDriver.version }],
    requires: [], permissions: ["window.native"], optionalPermissions: [],
  }, activate(ctx) {
    ctx.provide(ExternalWindowDriver, {
      supported: () => true,
      async open(options, owner) {
        const target = document.body.appendChild(document.createElement("main"));
        const lifetime = new AbortController();
        const completion = Promise.withResolvers();
        const close = async () => {
          lifetime.abort();
          target.remove();
          owner.removeEventListener("abort", close);
          completion.resolve();
          return ok(null);
        };
        owner.addEventListener("abort", close, { once: true });
        const surface = { target, signal: lifetime.signal, closed: completion.promise, close,
          show: async () => ok(null), hide: async () => ok(null), move: async () => ok(null), resize: async () => ok(null) };
        windows.push({ options, surface });
        return ok(surface);
      },
    });
  } });

  const app = await setupWorkspace({ pluginRuntime: true, plugins: [definition, driver, manager],
    grants: { [driver.manifest.id]: driver.manifest.permissions, [manager.manifest.id]: manager.manifest.permissions } });
  try {
    assert.equal(app.session.snapshot().phase, "running");
    const browser = app.dom.window;
    document = browser.document;
    const existing = { keep: true };
    browser.ui = existing;
    const timers = new Map();
    let timerId = 10000;
    const start = browser.setTimeout.bind(browser);
    const clear = browser.clearTimeout.bind(browser);
    browser.setTimeout = (action, delay, ...args) => {
      if (delay !== 4000) return start(action, delay, ...args);
      const id = ++timerId;
      timers.set(id, action);
      return id;
    };
    browser.clearTimeout = id => { if (!timers.delete(id)) clear(id); };

    const environment = { vaultId: "pong-test", generation: 1 };
    assert.equal((await app.tools.runtime.open(environment)).ok, true);
    const entry = archive.manifest.entry.slice(2);
    const source = { entry, modules: { [entry]: new TextDecoder().decode(archive.read(entry)) } };
    const enabled = await app.tools.runtime.register(environment, archive.manifest, source, true);
    assert.ok(enabled.ok, JSON.stringify(enabled));
    assert.equal(browser.ui, existing);
    await assert.rejects(browser.ui.pong(" "), /nonempty string/);
    assert.equal(windows.length, 0);

    await browser.ui.pong("<b>text here</b>");
    assert.equal(windows.length, 1);
    const [{ options, surface }] = windows;
    assert.equal(options.position, "bottom-right");
    assert.equal(options.layer, "top");
    assert.equal(options.focusable, false);
    assert.equal(options.skipTaskbar, true);
    assert.equal(surface.target.querySelector(".lm-declarative-view").textContent, "<b>text here</b>");
    assert.equal(surface.target.querySelector("b"), null);
    assert.equal(surface.target.querySelector(".lm-root").dataset.presentation, "standalone");
    const [oldId] = timers.keys();

    await browser.ui.pong("replacement");
    assert.equal(windows.length, 1);
    assert.equal(surface.target.querySelector(".lm-declarative-view").textContent, "replacement");
    assert.equal(timers.has(oldId), false);
    assert.equal(timers.size, 1);
    const [currentId, expire] = [...timers][0];
    timers.delete(currentId);
    expire();
    await surface.closed;
    await flush();
    assert.equal(surface.target.isConnected, false);

    await browser.ui.pong("last");
    assert.equal((await app.tools.runtime.disable(environment, archive.manifest.id)).ok, true);
    assert.equal(windows[1].surface.signal.aborted, true);
    assert.equal(browser.ui, existing);
    assert.equal("pong" in browser.ui, false);
    assert.equal(timers.size, 0);
  } finally { await app.stop(); }
});

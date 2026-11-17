import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createApplicationExecution } from "@lunaris/application-host";
import manager from "@lunaris/external-windows";
import notifications from "@lunaris/notification-provider";
import { inspectLup } from "@lunaris/lup";
import { definePlugin } from "@lunaris/sdk";
import { ExternalWindowDriver } from "@lunaris/window/external";
import { setupWorkspace, flush } from "../../../tools/test/workspace.mjs";

test("the packed plugin stacks live notifications, compacts gaps and cleans up on disable", async () => {
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
        let failNextClose = false;
        const close = async () => {
          if (failNextClose) {
            failNextClose = false;
            throw new Error("Native close interrupted");
          }
          lifetime.abort();
          target.remove();
          owner.removeEventListener("abort", close);
          completion.resolve();
          return ok(null);
        };
        owner.addEventListener("abort", close, { once: true });
        const moves = [];
        const surface = { target, signal: lifetime.signal, closed: completion.promise, close,
          show: async () => ok(null), hide: async () => ok(null), async move(position) { moves.push(position); return ok(null); }, resize: async () => ok(null) };
        windows.push({ options, surface, moves, interruptClose() { failNextClose = true; } });
        return ok(surface);
      },
    });
  } });

  const app = await setupWorkspace({ pluginRuntime: true, plugins: [definition, driver, manager, notifications],
    grants: { [driver.manifest.id]: driver.manifest.permissions, [manager.manifest.id]: manager.manifest.permissions,
      [notifications.manifest.id]: notifications.manifest.permissions } });
  const startTimer = globalThis.setTimeout;
  const clearTimer = globalThis.clearTimeout;
  try {
    assert.equal(app.session.snapshot().phase, "running");
    const browser = app.dom.window;
    document = browser.document;
    const existing = { keep: true };
    browser.ui = existing;
    let timerId = -1;
    const expiries = new Map();
    globalThis.setTimeout = (action, delay, ...args) => {
      if (delay !== 5000) return startTimer(action, delay, ...args);
      const id = timerId--;
      expiries.set(id, action);
      return id;
    };
    globalThis.clearTimeout = id => { if (typeof id === "number" && id < 0) expiries.delete(id); else clearTimer(id); };

    const environment = { vaultId: "pong-test", generation: 1 };
    assert.equal((await app.tools.runtime.open(environment)).ok, true);
    const entry = archive.manifest.entry.slice(2);
    const source = { entry, modules: { [entry]: new TextDecoder().decode(archive.read(entry)) } };
    const enabled = await app.tools.runtime.register(environment, archive.manifest, source, true);
    assert.ok(enabled.ok, JSON.stringify(enabled));
    assert.equal(browser.ui, existing);
    await assert.rejects(browser.ui.pong(" "), /icon, title, text/);
    assert.equal(windows.length, 0);

    await browser.ui.pong("<b>text here</b>");
    assert.equal(windows.length, 1);
    const [{ options, surface }] = windows;
    const at = y => ({ anchor: "bottom-right", offset: { x: 0, y } });
    assert.deepEqual(options.position, at(0));
    assert.deepEqual(options.size, { width: 192, height: 64 });
    assert.equal(options.layer, "top");
    assert.equal(options.focusable, false);
    assert.equal(options.skipTaskbar, true);
    assert.equal(surface.target.querySelector(".lm-notification-title").textContent, "Notification");
    assert.equal(surface.target.querySelector(".lm-notification-text").textContent, "<b>text here</b>");
    assert.equal(surface.target.querySelector("b"), null);
    assert.equal(surface.target.querySelector('[role="status"]').getAttribute("aria-atomic"), "true");
    assert.equal(surface.target.querySelector(".lm-notification-icon svg").getAttribute("aria-hidden"), "true");
    assert.equal(surface.target.querySelector(".lm-root").dataset.presentation, "standalone");

    await browser.ui.pong({ icon: "circle-check", title: "Complete", text: "The result is ready." });
    assert.equal(surface.target.isConnected, true);
    assert.equal(windows.length, 2);
    const next = windows[1].surface.target;
    assert.deepEqual(windows[1].options.position, at(-72));
    assert.equal(next.querySelector(".lm-notification-title").textContent, "Complete");
    await import("lucide/dist/esm/iconsAndAliases.mjs");
    await flush();
    assert.ok(next.querySelector(".lm-notification-icon circle"));

    await browser.ui.pong("third");
    await browser.ui.pong("fourth");
    assert.deepEqual(windows.map(entry => entry.options.position), [at(0), at(-72), at(-144), at(-216)]);
    assert.ok(windows.every(entry => entry.surface.target.isConnected));
    assert.ok(windows.every(entry => !entry.moves.length));

    const queued = browser.ui.pong("fifth");
    await flush();
    assert.equal(windows.length, 4);
    windows[1].interruptClose();
    expiries.get(-2)();
    await queued;
    assert.equal(next.isConnected, false);
    assert.equal(surface.target.isConnected, true);
    assert.deepEqual(windows[0].moves, []);
    assert.deepEqual(windows[2].moves, [at(-72)]);
    assert.deepEqual(windows[3].moves, [at(-144)]);
    assert.deepEqual(windows[4].options.position, at(-216));

    const cancelled = assert.rejects(browser.ui.pong("last"), /owner stopped/);
    assert.equal((await app.tools.runtime.disable(environment, archive.manifest.id)).ok, true);
    await cancelled;
    assert.ok(windows.every(entry => entry.surface.signal.aborted && !entry.surface.target.isConnected));
    assert.equal(browser.ui, existing);
    assert.equal("pong" in browser.ui, false);
    assert.equal(windows.length, 5);
    assert.equal(expiries.size, 0);
  } finally { globalThis.setTimeout = startTimer; globalThis.clearTimeout = clearTimer; await app.stop(); }
});

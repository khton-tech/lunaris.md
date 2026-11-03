import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { checkSource } from './boundaries.mjs';

const filename = path.resolve('packages/sdk/src/index.ts');
test('SDK allows public manifest and local imports', () => {
  assert.deepEqual(checkSource('export type { PluginManifest } from "@lunaris/manifest"; import "./local.js";', filename, 'sdk'), []);
});
for (const source of [
  'import "node:fs";',
  'export * from "@lunaris/kernel";',
  'import "@lunaris/manifest/dist/index.js";',
  'import "../../kernel/src/index.js";',
  'import("./local.js");',
  'require("fs");',
  'type T = import("@lunaris/kernel").Kernel;',
]) {
  test(`rejects ${source}`, () => assert.ok(checkSource(source, filename, 'sdk').length));
}

test('only host/tooling scopes allow Node imports; public test kit stays neutral', () => {
  assert.ok(checkSource('import "node:fs";', path.resolve('packages/test/src/index.ts'), 'test').length);
  assert.deepEqual(checkSource('import "node:fs";', path.resolve('hosts/development/src/index.ts'), 'development'), []);
  assert.deepEqual(checkSource('import "node:fs";', path.resolve('packages/cli/src/index.ts'), 'cli'), []);
});
test('only the development loader can dynamically evaluate local entries', () => {
  assert.deepEqual(checkSource('import(entry);', path.resolve('hosts/development/src/index.ts'), 'development'), []);
  assert.ok(checkSource('import(entry);', path.resolve('packages/cli/src/index.ts'), 'cli').length);
});

test('Tauri allows only its statically named guarded application composition import', () => {
  const bootstrap = path.resolve('hosts/tauri/src/bootstrap.ts');
  assert.deepEqual(checkSource('import("./application.js");', bootstrap, 'tauri'), []);
  assert.ok(checkSource('import(entry);', bootstrap, 'tauri').length);
  assert.ok(checkSource('import("./other.js");', bootstrap, 'tauri').length);
  assert.ok(checkSource('import("./application.js");', path.resolve('hosts/tauri/src/session.ts'), 'tauri').length);
  assert.ok(checkSource('import "node:fs";', bootstrap, 'tauri').length);
  assert.ok(checkSource('import "@tauri-apps/api/window";', bootstrap, 'tauri').length);
  assert.deepEqual(checkSource('import "@tauri-apps/api/window";', path.resolve('hosts/tauri/src/desktop.ts'), 'tauri'), []);
});

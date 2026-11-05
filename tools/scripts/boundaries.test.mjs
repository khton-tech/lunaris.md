import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { checkSource } from './boundaries.mjs';

const filename = path.resolve('packages/sdk/src/index.ts');
test('slot allocation stays portable and cannot reach the DOM driver or host', () => {
  const file = path.resolve('plugins/UI/layout/src/index.ts');
  assert.deepEqual(checkSource('import "@lunaris/sdk"; import "@lunaris/slots"; import "@lunaris/logging"; import "../manifest.json";', file, 'slot-provider'), []);
  for (const name of ['@lunaris/slot-dom', '@lunaris/web-slot-driver', '@lunaris/kernel', '@lunaris/tauri', '@tauri-apps/api/core', 'node:fs']) {
    assert.ok(checkSource(`import "${name}";`, file, 'slot-provider').length);
  }
  assert.ok(checkSource('import "@lunaris/slot-dom";', path.resolve('packages/slots/src/index.ts'), 'slots').length);
});
test('localization stays SDK-only without configuration, native or host dependencies', () => {
  const file = path.resolve('plugins/systems/localization/src/index.ts');
  assert.deepEqual(checkSource('import "@lunaris/sdk"; import "@lunaris/logging"; import "@lunaris/localization"; import "../manifest.json";', file, 'localization-manager'), []);
  for (const dependency of ['@lunaris/config', '@lunaris/kernel', '@lunaris/tauri', '@tauri-apps/api/core', 'node:fs']) {
    assert.ok(checkSource(`import "${dependency}";`, file, 'localization-manager').length);
  }
});
test('config manager uses SDK contracts and confines its TOML dependency to the codec', () => {
  const file = path.resolve('plugins/systems/config/src/index.ts');
  assert.deepEqual(checkSource('import "@lunaris/config"; import "@lunaris/vault"; import "@lunaris/filesystem"; import "@lunaris/logging"; import "@lunaris/sdk"; import "../manifest.json";', file, 'config-manager'), []);
  assert.deepEqual(checkSource('import "smol-toml";', path.resolve('plugins/systems/config/src/codec.ts'), 'config-manager'), []);
  for (const dependency of ['node:fs', '@lunaris/kernel', '@lunaris/tauri-filesystem', 'smol-toml']) assert.ok(checkSource(`import "${dependency}";`, file, 'config-manager').length);
});
test('filesystem provider stays neutral and only the native driver bridge imports Tauri IPC', () => {
  const provider = path.resolve('plugins/systems/filesystem/src/index.ts');
  const driver = path.resolve('plugins/systems/driver/tauri-filesystem/src/index.ts');
  const native = path.resolve('plugins/systems/driver/tauri-filesystem/src/native.ts');
  assert.deepEqual(checkSource('import "@lunaris/sdk"; import "@lunaris/filesystem"; import "@lunaris/logging";', provider, 'filesystem-provider'), []);
  for (const source of ['import "@tauri-apps/api/core";', 'import "node:fs";', 'import "@lunaris/kernel";', 'import "@lunaris/tauri-filesystem";']) assert.ok(checkSource(source, provider, 'filesystem-provider').length);
  assert.deepEqual(checkSource('import "@tauri-apps/api/core";', native, 'tauri-filesystem'), []);
  assert.ok(checkSource('import "@tauri-apps/api/core";', driver, 'tauri-filesystem').length);
});
test('product plugins use only the SDK, shared logging contracts and local modules', () => {
  for (const [scope, root] of [['logger', 'plugins/systems/logger'], ['dev-tools-logger', 'plugins/systems/driver/dev-tools-logger']]) {
    const file = path.resolve(root, 'src/index.ts');
    assert.deepEqual(checkSource('import "@lunaris/sdk"; import "@lunaris/logging"; import "./format.js";', file, scope), []);
    assert.deepEqual(checkSource('import manifest from "../manifest.json";', file, scope), []);
    assert.ok(checkSource('import "../manifest.json";', path.resolve(root, 'src/other.ts'), scope).length);
    for (const source of ['import "@lunaris/kernel";', 'import "@lunaris/tauri";', 'import "node:fs";', 'import "@tauri-apps/api/core";', 'import "../../../../packages/sdk/src/index.js";']) {
      assert.ok(checkSource(source, file, scope).length);
    }
  }
});

test('Vault Manager imports contracts through SDK without filesystem driver or host dependencies', () => {
  const file = path.resolve('plugins/systems/vault/src/index.ts');
  assert.deepEqual(checkSource('import "@lunaris/sdk"; import "@lunaris/vault"; import "@lunaris/filesystem"; import "@lunaris/logging"; import "../manifest.json";', file, 'vault-manager'), []);
  for (const dependency of ['@lunaris/kernel', '@lunaris/tauri-filesystem', '@lunaris/filesystem-provider', 'node:fs', '@tauri-apps/api/core']) {
    assert.ok(checkSource(`import "${dependency}";`, file, 'vault-manager').length);
  }
});

test('only application composition may import the startup artwork', () => {
  const source = 'import art from "../../../resources/ascii_art.txt?raw";';
  assert.deepEqual(checkSource(source, path.resolve('hosts/tauri/src/application.ts'), 'tauri'), []);
  assert.ok(checkSource(source, path.resolve('hosts/tauri/src/session.ts'), 'tauri').length);
});
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

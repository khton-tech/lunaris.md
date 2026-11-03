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

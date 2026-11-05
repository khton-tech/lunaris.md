import test from 'node:test';
import assert from 'node:assert/strict';
import { selectScopes } from './ci.mjs';
import { dependencies } from './boundaries.mjs';
test('CI selects touched packages and the caller check expands their consumers', () => {
  assert.deepEqual(selectScopes(['packages/sdk/src/index.ts']), ['sdk']);
  assert.deepEqual(selectScopes(['hosts/development/src/index.ts']), ['development']);
  assert.deepEqual(selectScopes(['packages/cli/test/cli.test.mjs']), ['cli']);
  assert.deepEqual(selectScopes(['hosts/tauri/src/session.ts']), ['tauri']);
  assert.deepEqual(selectScopes(['packages/logging/src/index.ts']), ['logging']);
  assert.deepEqual(selectScopes(['plugins/systems/logger/src/index.ts']), ['logger']);
  assert.deepEqual(selectScopes(['plugins/systems/driver/dev-tools-logger/src/index.ts']), ['dev-tools-logger']);
  assert.deepEqual(selectScopes(['packages/filesystem/src/index.ts']), ['filesystem']);
  assert.deepEqual(selectScopes(['plugins/systems/filesystem/src/index.ts']), ['filesystem-provider']);
  assert.deepEqual(selectScopes(['plugins/systems/driver/tauri-filesystem/native/src/lib.rs']), ['tauri-filesystem']);
  assert.equal(selectScopes(['tools/scripts/check.mjs']).length, Object.keys(dependencies).length);
  assert.deepEqual(selectScopes(['DOCS/concepts/lifecycle.md']), []);
});

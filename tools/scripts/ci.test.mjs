import test from 'node:test';
import assert from 'node:assert/strict';
import { selectScopes } from './ci.mjs';
test('CI selects touched packages and the caller check expands their consumers', () => {
  assert.deepEqual(selectScopes(['packages/sdk/src/index.ts']), ['sdk']);
  assert.deepEqual(selectScopes(['hosts/development/src/index.ts']), ['development']);
  assert.deepEqual(selectScopes(['packages/cli/test/cli.test.mjs']), ['cli']);
  assert.equal(selectScopes(['tools/scripts/check.mjs']).length, 6);
  assert.deepEqual(selectScopes(['DOCS/concepts/lifecycle.md']), []);
});

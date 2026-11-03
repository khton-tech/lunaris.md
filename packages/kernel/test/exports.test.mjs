import test from 'node:test';
import assert from 'node:assert/strict';

test('kernel root loads and private source/output paths are hidden', async () => {
  await import('@lunaris/kernel');
  for (const subpath of ['src/index.ts', 'dist/index.js', 'package.json']) {
    await assert.rejects(import(`@lunaris/kernel/${subpath}`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  }
});

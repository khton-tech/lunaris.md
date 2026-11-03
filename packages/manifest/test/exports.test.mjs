import test from 'node:test';
import assert from 'node:assert/strict';

test('manifest root loads and private source/output paths are hidden', async () => {
  await import('@lunaris/manifest');
  for (const subpath of ['src/index.ts', 'dist/index.js', 'package.json']) {
    await assert.rejects(import(`@lunaris/manifest/${subpath}`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  }
});

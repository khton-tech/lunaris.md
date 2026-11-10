import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from '@lunaris/cli';
import { inspectLup } from '@lunaris/lup';

test('CLI bundles a portable package and inspects it without evaluating code', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lunaris-lup-')); const lines = []; const errors = [];
  const io = { out: line => lines.push(JSON.parse(line)), error: line => errors.push(JSON.parse(line)) };
  try {
    const manifest = { manifestVersion: 1, id: 'example.plugin', version: '1.0.0', engine: '^0.1.0', sdk: '^0.1.0', entry: './built/plugin.js', provides: [], requires: [], permissions: [], optionalPermissions: [], metadata: { name: 'Example', description: 'Portable plugin', author: 'Author', platforms: 'universal', languages: ['en'] } };
    await mkdir(path.join(root, 'built')); await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(path.join(root, 'built/value.js'), 'export const value = 42;');
    await writeFile(path.join(root, 'built/plugin.js'), `import { value } from './value.js'; globalThis.__lunarisPackEvaluated = true; export default { manifest: ${JSON.stringify(manifest)}, activate() { return value; } };`);
    await writeFile(path.join(root, 'assets/data.txt'), 'resource');
    const output = path.join(root, 'plugin.lup');
    assert.equal(await run(['pack', root, output], io), 0, JSON.stringify(errors));
    assert.equal(globalThis.__lunarisPackEvaluated, undefined);
    assert.equal(lines[0].code, 'PACKAGE_BUILT');
    assert.equal(await run(['inspect-package', output], io), 0);
    assert.equal(lines[1].digest, lines[0].digest);
    const preview = inspectLup(new Uint8Array(await readFile(output)));
    assert.deepEqual(preview.paths, ['assets/data.txt', 'built/plugin.js', 'manifest.json']);
    assert.equal(new TextDecoder().decode(preview.read('assets/data.txt')), 'resource');
    assert.doesNotMatch(new TextDecoder().decode(preview.read('built/plugin.js')), /from ['"]\.\/value/);
    assert.equal(await run(['pack', root, output], io), 1); assert.equal(errors.at(-1).code, 'PACKAGE_WRITE_FAILED');
    await writeFile(path.join(root, 'built/plugin.js'), `import fs from 'node:fs'; export default fs;`);
    assert.equal(await run(['pack', root, path.join(root, 'bad.lup')], io), 1); assert.equal(errors.at(-1).code, 'PACKAGE_BUILD_FAILED');
  } finally { await rm(root, { recursive: true, force: true }); }
});

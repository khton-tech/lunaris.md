import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('long-lived SDK realms reclaim transient callback and promise handles', { timeout: 30000 }, async t => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--expose-gc', fileURLToPath(new URL('./reclamation-child.mjs', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'], signal: t.signal });
    let output = ''; child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
    child.once('error', reject); child.once('close', code => resolve({ code, output }));
  });
  assert.equal(result.code, 0, result.output); assert.match(result.output, /Reclamation passed/);
});

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const host = path.join(root, 'hosts/tauri/src-tauri');
const native = path.join(root, 'plugins/systems/driver/tauri-filesystem/native/Cargo.toml');
function run(command, args, cwd, label) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${label}: ${result.error?.message ?? (result.stdout + result.stderr).slice(-6000)}`);
  return result.stdout;
}
try {
  if (!process.env.npm_execpath) throw new Error('Use npm run filesystem:check.');
  const typescript = run(process.execPath, ['tools/scripts/check.mjs', 'filesystem', 'filesystem-provider', 'tauri-filesystem'], root, 'TypeScript checks');
  run(process.execPath, ['--test', '--test-reporter=dot', 'tools/scripts/ci.test.mjs'], root, 'CI scope tests');
  run('cargo', ['fmt', '--manifest-path', native, '--', '--check'], host, 'Driver formatting');
  run('cargo', ['fmt', '--', '--check'], host, 'Host formatting');
  const nativeTests = run('cargo', ['test', '--locked', '-p', 'lunaris-filesystem-native', '--', '--test-threads=1'], host, 'Native filesystem tests');
  run('cargo', ['check', '--locked'], host, 'Host compilation');
  run(process.execPath, [process.env.npm_execpath, 'run', 'build', '--workspace', '@lunaris/tauri'], root, 'Frontend bundle');
  const tsCount = typescript.match(/(\d+) tests, 0 skipped/)?.[1] ?? '?';
  const nativeCount = nativeTests.match(/test result: ok\. (\d+) passed/)?.[1] ?? '?';
  console.log(`Filesystem checks passed: ${tsCount} TypeScript/host/boundary tests; ${nativeCount} native tests; type fixtures, CI selection, Rust formatting, locked host compilation and frontend bundle. No window launched.`);
} catch (error) { console.error(`Filesystem checks failed: ${error.message}`); process.exitCode = 1; }

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const host = path.join(root, 'hosts/tauri');
const manifest = path.join(host, 'src-tauri/Cargo.toml');
const mode = process.argv[2] ?? 'check';
function run(command, args, cwd, label) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${result.error?.message ?? (result.stdout + result.stderr).slice(-6000)}`);
  }
}
try {
  if (!['check', 'build'].includes(mode)) throw new Error('Expected check or build.');
  if (!process.env.npm_execpath) throw new Error('Use npm run tauri:check or npm run tauri:build.');
  run(process.execPath, ['tools/scripts/check.mjs', 'tauri'], root, 'Host tests');
  run('cargo', ['fmt', '--manifest-path', manifest, '--', '--check'], path.dirname(manifest), 'Rust formatting');
  if (mode === 'check') {
    run(process.execPath, [process.env.npm_execpath, 'run', 'build', '--workspace', '@lunaris/tauri'], root, 'Frontend build');
    run('cargo', ['check', '--locked', '--manifest-path', manifest], path.dirname(manifest), 'Native check');
  } else {
    // Compile a debug desktop executable without opening a window or making installers.
    run(process.execPath, [process.env.npm_execpath, 'run', 'desktop:build', '--workspace', '@lunaris/tauri', '--', '--debug', '--', '--locked'], root, 'Desktop build');
  }
  console.log(`Tauri ${mode} passed: targeted host tests, type/boundary checks, frontend and native ${mode === 'build' ? 'debug executable' : 'compilation checks'}. No window launched.`);
} catch (error) {
  console.error(`Tauri ${mode} failed: ${error.message}`); process.exitCode = 1;
}

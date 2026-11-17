import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const host = path.join(root, 'hosts/tauri');
const native = path.join(host, 'src-tauri');
const target = 'x86_64-pc-windows-msvc';

function run(command, args, cwd, label) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${result.error?.message ?? (result.stdout + result.stderr).slice(-6000)}`);
  }
  return result.stdout;
}

try {
  if (process.platform !== 'win32') throw new Error('Windows releases require a Windows build host.');
  const cli = createRequire(path.join(host, 'package.json')).resolve('@tauri-apps/cli/tauri.js');
  const metadata = JSON.parse(run('cargo', ['metadata', '--format-version', '1', '--no-deps', '--locked'], native, 'Cargo metadata'));
  const { name, version } = metadata.packages.find(pkg => pkg.name === 'lunaris-desktop');
  const config = JSON.stringify({
    bundle: { active: true, windows: { nsis: { languages: ['English', 'Russian'] } } },
  });

  run(process.execPath, [cli, 'build', '--ci', '--target', target, '--bundles', 'nsis',
    '--no-binary-patching', '--config', config, '--', '--locked'], host, 'Tauri release build');

  const release = path.join(metadata.target_directory, target, 'release');
  const output = path.join(root, 'dist/windows');
  const portable = `Lunaris-${version}-x64-portable.exe`;
  const installer = `Lunaris-${version}-x64-setup.exe`;
  mkdirSync(output, { recursive: true });
  copyFileSync(path.join(release, `${name}.exe`), path.join(output, portable));
  copyFileSync(path.join(release, 'bundle/nsis', `Lunaris_${version}_x64-setup.exe`), path.join(output, installer));
  console.log(`Windows release ${version}: dist/windows/${portable}, dist/windows/${installer}.`);
} catch (error) {
  console.error(`Windows release failed: ${error.message}`);
  process.exitCode = 1;
}

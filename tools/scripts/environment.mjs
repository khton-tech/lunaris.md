import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function checkEnvironment() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 26 || minor < 13) {
    throw new Error(`Node ${process.versions.node} is unsupported; use >=26.13.0 <27.`);
  }
  // npm_execpath is populated by npm scripts. Direct Node execution checks Node only.
  if (process.env.npm_execpath) {
    const npm = spawnSync(process.execPath, [process.env.npm_execpath, '--version'], { encoding: 'utf8' });
    if (npm.status !== 0 || Number(npm.stdout.trim().split('.')[0]) !== 11) {
      throw new Error('Use npm >=11 <12.');
    }
  }
  return `Node ${process.versions.node} (${process.platform}/${process.arch})`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(`Environment passed: ${checkEnvironment()}.`);
  } catch (error) {
    console.error(`Environment failed: ${error.message}`);
    process.exitCode = 1;
  }
}

import { spawnSync } from 'node:child_process';

const scopes = ['text-editor', 'mantine-components', 'active-document-provider', 'vault-manager', 'filesystem-provider', 'file-explorer'];
const result = spawnSync(process.execPath, ['tools/scripts/check.mjs', ...scopes], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (result.error || result.status !== 0) {
  console.error(`Editor checks failed: ${result.error?.message ?? result.stdout + result.stderr}`);
  process.exitCode = 1;
} else console.log(result.stdout.trim());

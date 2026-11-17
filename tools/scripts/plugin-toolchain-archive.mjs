import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, npmCliPath, prepareEmbeddedToolchain } from './plugin-toolchain.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const dist = path.join(repository, 'dist');

async function addDocumentation(output) {
  const files = new Set([
    'DOCS/guides/plugin-authoring.md', 'DOCS/guides/plugin-packaging.md',
    'DOCS/guides/plugin-recipes.md', 'DOCS/UI_GUIDELINES.md',
  ]);
  for (const directory of ['DOCS/concepts', 'DOCS/reference']) {
    for (const name of await readdir(path.join(repository, directory))) {
      if (name.endsWith('.md')) files.add(`${directory}/${name}`);
    }
  }
  for (const file of files) {
    const original = await readFile(path.join(repository, file), 'utf8');
    // Preserve links within the documentation snapshot and keep labels for omitted pages.
    const content = original.replace(/\[([^\[\]]+)\]\(([^)\s#]+\.md)(?:#[^)\s]*)?\)/g, (link, label, target) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) return link;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      return files.has(resolved) ? link : label;
    });
    const destination = path.join(output, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
}

async function archiveToolchain() {
  const { version } = JSON.parse(await readFile(path.join(repository, 'packages/sdk/package.json'), 'utf8'));
  const name = `lunaris-plugin-sdk-${version}`;
  await mkdir(dist, { recursive: true });
  const stage = await mkdtemp(path.join(dist, '.plugin-sdk-'));
  if (path.dirname(path.resolve(stage)) !== dist || !path.basename(stage).startsWith('.plugin-sdk-')) {
    throw Error('Unexpected toolchain staging directory.');
  }
  try {
    const output = path.join(stage, name);
    const { packages } = await prepareEmbeddedToolchain({ output });
    const npm = await npmCliPath();
    await command([npm, 'install', '--package-lock-only', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'], output);
    await addDocumentation(output);
    await writeFile(path.join(output, 'README.md'), `# Lunaris Plugin SDK ${version}

Use Node >=26.13.0 <27 and npm >=11 <12. The Lunaris packages are included.
The first install needs npm registry access or a populated cache for third-party dependencies.

\`\`\`sh
npm ci --ignore-scripts
npm exec -- lunaris-core create-plugin ./projects/my-plugin --id author.my-plugin
cd projects/my-plugin
npm install --ignore-scripts
npm run check
npm test
npm run pack
\`\`\`

This produces \`author.my-plugin-0.1.0.lup\`. The generated project uses the CLI
installed in the parent toolchain directory.

- [Authoring guide](DOCS/guides/plugin-authoring.md)
- [Working recipes](DOCS/guides/plugin-recipes.md)
- [SDK reference](DOCS/reference/sdk.md)
- [CLI reference](DOCS/reference/cli.md)
- [Packaging and installation workflow](DOCS/guides/plugin-packaging.md)
`);
    const filename = `${name}.7z`;
    const archive = path.join(stage, filename);
    execFileSync('7z', ['a', '-t7z', '-bso0', '-bsp0', archive, name], { cwd: stage, windowsHide: true });
    await rename(archive, path.join(dist, filename));
    console.log(`Plugin SDK ${version}: dist/${filename} (${packages + 1} Lunaris packages, documentation and npm lockfile).`);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

try {
  await archiveToolchain();
} catch (error) {
  console.error(`Plugin SDK archive failed: ${error.message}`);
  process.exitCode = 1;
}

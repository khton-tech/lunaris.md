import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

// Source guardrails only: this does not certify rendered geometry or visual acceptance.
const root = fileURLToPath(new URL('../../', import.meta.url));
const findings = [];
let files = 0;
let plugins = 0;
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['dist', 'node_modules', 'test', 'DOCS'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : /\.(?:tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}
for (const plugin of readdirSync(join(root, 'plugins/UI'), { withFileTypes: true })) {
  if (!plugin.isDirectory() || plugin.name === 'components-kit') continue;
  plugins++;
  for (const path of walk(join(root, 'plugins/UI', plugin.name))) {
    files++;
    const source = readFileSync(path, 'utf8');
    const rules = [
      ['Native product control', /<\s*(?:button|input|select|textarea)\b|\bNativeSelect\b/],
      ['Unbounded transition', /transition\s*:\s*["']?all\b/],
    ];
    if (plugin.name !== 'mantine-components') rules.push([
      'UI framework outside UIKit', /(?:from\s*|import\s*\(?)["'](?:react(?:-dom)?(?:\/[^"']*)?|@mantine\/[^"']+)["']/,
    ]);
    source.split(/\r?\n/).forEach((line, index) => {
      for (const [label, pattern] of rules) {
        if (pattern.test(line)) findings.push(`${relative(root, path).replaceAll('\\', '/')}:${index + 1}: ${label}`);
      }
    });
  }
}
for (const finding of findings) console.log(finding);
console.log(`UI source audit: ${plugins} plugins, ${files} source files, ${findings.length} guardrail findings. Retired components-kit excluded. Native visual acceptance is separate.`);
process.exitCode = findings.length ? 1 : 0;

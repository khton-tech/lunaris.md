import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isValidId } from "@lunaris/manifest";
import { authoringGuide, authoringRecipes, vendor } from "./toolchain.js";

export class GenerationError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "GenerationError"; }
}

/** Generate only into a new directory. Every file write uses exclusive creation. */
export async function createPlugin(target: string, requestedId?: string): Promise<string> {
  const root = path.resolve(target);
  const slug = path.basename(root).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const id = requestedId ?? `local.${/^[a-z]/.test(slug) ? slug : `plugin-${slug}`}`;
  if (!isValidId(id)) throw new GenerationError("PLUGIN_ID_INVALID", "Plugin ID must be a canonical dotted lowercase ID.");
  await mkdir(path.dirname(root), { recursive: true });
  try { await mkdir(root); }
  catch (cause) {
    if ((cause as { code?: string }).code === "EEXIST") throw new GenerationError("TARGET_EXISTS", "Target already exists; choose a new directory.");
    throw cause;
  }
  const artifacts = await vendor(root, ['@lunaris/sdk', '@lunaris/logging', '@lunaris/test']);
  const manifest = { manifestVersion: 1, id, version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/src/plugin.js", metadata: { name: id, author: 'Local developer', description: 'A Lunaris plugin', platforms: 'universal', languages: ['en'] }, provides: [], requires: [{ kind: 'api', id: 'lunaris.logger', range: '^1.0.0' }], permissions: [], optionalPermissions: [] };
  const packageJson = {
    name: id, version: "0.1.0", private: true, type: "module",
    scripts: { build: "tsc -p tsconfig.json", core: 'lunaris-core', validate: 'lunaris-core validate .', check: 'npm run build && lunaris-core validate .', inspect: 'lunaris-core inspect .', dev: 'lunaris-core dev .', pack: 'npm run build && lunaris-core pack .', test: 'npm run build && lunaris-core test .' },
    dependencies: { '@lunaris/sdk': artifacts['@lunaris/sdk'], '@lunaris/logging': artifacts['@lunaris/logging'] },
    devDependencies: { ...Object.fromEntries(Object.entries(artifacts).filter(([name]) => !['@lunaris/sdk', '@lunaris/logging'].includes(name))), typescript: '6.0.3' },
    overrides: Object.fromEntries(Object.keys(artifacts).map(name => [name, `$${name}`])),
  };
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const files: Record<string, string> = {
    "manifest.json": json(manifest), "package.json": json(packageJson),
    "tsconfig.json": json({ compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM"], module: "NodeNext", moduleResolution: "NodeNext", strict: true, types: [], resolveJsonModule: true, rootDir: ".", outDir: "dist", noEmitOnError: true }, include: ["src/**/*.ts"] }),
    ".gitignore": "node_modules/\ndist/\n*.lup\n",
    "src/plugin.ts": 'import { definePlugin } from "@lunaris/sdk";\nimport { Logger } from "@lunaris/logging";\nimport manifest from "../manifest.json" with { type: "json" };\n\nexport default definePlugin({\n  manifest,\n  activate(ctx) {\n    const logger = ctx.use(Logger);\n    ctx.scope.own({ dispose() { /* Release plugin-owned external resources here. */ } });\n    logger.info(ctx.pluginId, "Plugin ready");\n  }\n});\n',
    "test/plugin.test.mjs": 'import test from "node:test";\nimport { createTestKernel } from "@lunaris/test";\nimport { Logger } from "@lunaris/logging";\nimport plugin from "../dist/src/plugin.js";\n\ntest("activates and releases owned resources", async () => {\n  const kernel = createTestKernel();\n  kernel.installMock(Logger, Object.fromEntries(["log","debug","info","warn","error"].map(name => [name, () => true])));\n  kernel.register(plugin);\n  try {\n    await kernel.start(plugin.manifest.id);\n    kernel.assertState(plugin.manifest.id, "active");\n  } finally {\n    await kernel.stopAll();\n  }\n  kernel.assertNoResources();\n});\n',
    "DOCS/README.md": `# ${id}\n\nPurpose: an SDK-only plugin starting point. Implement one responsibility in src/plugin.ts.\n\nUsage: npm install --ignore-scripts, npm run check, npm test, npm run pack. The installed toolchain supplies lunaris-core. See [the bundled authoring guide](authoring.md).\n\nRequired API: lunaris.logger@^1.0.0 via Logger from @lunaris/logging. No APIs/events/hooks are provided by default. Every additional contract belongs in manifest.json and its own documentation.\n\nLifecycle: activation owns cleanup; SDK registrations are released on stop. No SDK access after scope closure. The tools/vendor archives are distributable SDK artifacts, not source-checkout links.\n`,
    'DOCS/authoring.md': await authoringGuide(),
    'DOCS/plugin-recipes.md': await authoringRecipes(),
    'AGENTS.md': '# Plugin author instructions\n\nRead DOCS/README.md, DOCS/authoring.md and manifest.json first. Use actual public SDK package exports/declarations; do not invent APIs or import host/kernel/private implementations. Discover optional SDK contracts with lunaris-core contracts and add them with lunaris-core add-contract. Do not edit tools/vendor archives.\n\nRequire Logger and use ctx.use(Logger) with ctx.pluginId; preserve original errors without sensitive payloads. Use owned scopes/signals and release resources. New UI uses Views/shared component roles and localization, never raw DOM/React/Mantine in a consumer. Native/filesystem work goes through captured Vault providers.\n\nRun npm run check, npm test and npm run pack after meaningful changes. Metadata must match exported definition. Report missing SDK contracts with concrete requirements rather than bypassing the boundary. Do not publish tooling/packages without separate authorization.\n',
  };
  for (const [relative, content] of Object.entries(files)) {
    const filename = path.join(root, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, content, { flag: "wx" });
  }
  return root;
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidId } from "@lunaris/manifest";

export class GenerationError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "GenerationError"; }
}

function localPackage(name: string): string {
  const entry = fileURLToPath(import.meta.resolve(name));
  const root = name === "typescript/package.json" ? path.dirname(entry) : path.resolve(path.dirname(entry), "..");
  return `file:${root.replaceAll("\\", "/")}`;
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
  const manifest = { manifestVersion: 1, id, version: "0.1.0", engine: "^0.1.0", sdk: "^0.1.0", entry: "./dist/src/plugin.js", provides: [], requires: [], permissions: [], optionalPermissions: [] };
  const packageJson = {
    name: id, version: "0.1.0", private: true, type: "module",
    scripts: { build: "tsc -p tsconfig.json", core: "node tools/core.mjs", validate: "node tools/core.mjs validate .", inspect: "node tools/core.mjs inspect .", dev: "node tools/core.mjs dev .", test: "npm run build && node tools/core.mjs test ." },
    dependencies: { "@lunaris/sdk": localPackage("@lunaris/sdk") },
    devDependencies: { "@lunaris/manifest": localPackage("@lunaris/manifest"), "@lunaris/kernel": localPackage("@lunaris/kernel"), "@lunaris/test": localPackage("@lunaris/test"), typescript: localPackage("typescript/package.json") },
  };
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const cliUrl = new URL("./index.js", import.meta.url).href;
  const files: Record<string, string> = {
    "manifest.json": json(manifest), "package.json": json(packageJson),
    "tsconfig.json": json({ compilerOptions: { target: "ES2022", lib: ["ES2022"], module: "NodeNext", moduleResolution: "NodeNext", strict: true, types: [], resolveJsonModule: true, rootDir: ".", outDir: "dist", noEmitOnError: true }, include: ["src/**/*.ts"] }),
    ".gitignore": "node_modules/\ndist/\n",
    "src/plugin.ts": 'import { definePlugin } from "@lunaris/sdk";\nimport manifest from "../manifest.json" with { type: "json" };\n\nexport default definePlugin({\n  manifest,\n  activate(ctx) {\n    ctx.scope.own({ dispose() {} });\n  }\n});\n',
    "test/plugin.test.mjs": 'import test from "node:test";\nimport { createTestKernel } from "@lunaris/test";\nimport plugin from "../dist/src/plugin.js";\n\ntest("activates and releases owned resources", async () => {\n  const kernel = createTestKernel();\n  kernel.register(plugin);\n  try {\n    await kernel.start(plugin.manifest.id);\n    kernel.assertState(plugin.manifest.id, "active");\n  } finally {\n    await kernel.stopAll();\n  }\n  kernel.assertNoResources();\n});\n',
    "tools/core.mjs": `import { run } from ${JSON.stringify(cliUrl)};\nprocess.exitCode = await run(process.argv.slice(2));\n`,
    "DOCS/README.md": `# ${id}\n\nPurpose: a local SDK-only plugin starting point. Implement one responsibility in src/plugin.ts.\n\nUsage: npm install, npm run build, npm test, npm run validate, npm run dev. Type stop or press Ctrl+C to stop; rebuild and start a fresh process after source changes.\n\nAPIs provided/required: none. Events emitted/subscribed: none. Hooks: none. Permissions: none. Update the authoritative manifest.json when adding contracts/permissions.\n\nLifecycle: activation owns a disposable; stop releases it automatically. The plugin has no host/platform access through its context. Local dependency links point to the source checkout; this is not a published registry package.\n`,
  };
  for (const [relative, content] of Object.entries(files)) {
    const filename = path.join(root, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, content, { flag: "wx" });
  }
  return root;
}

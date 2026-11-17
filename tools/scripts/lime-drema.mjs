import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { packLup } from "@lunaris/lup";

const example = fileURLToPath(new URL("../../examples/drema/", import.meta.url));
const output = fileURLToPath(new URL("../../dist/lime-examples/", import.meta.url));

/** Package the public-SDK example for both the integration test and manual installation. */
export async function packDrema() {
  const [bundle, manifest, asset] = await Promise.all([
    build({ absWorkingDir: example, entryPoints: ["src/plugin.ts"], bundle: true, platform: "neutral", format: "esm",
      target: "es2022", write: false, logLevel: "silent" }),
    readFile(path.join(example, "manifest.json")),
    readFile(path.join(example, "assets/drema.svg")),
  ]);
  return packLup([
    { path: "manifest.json", data: manifest },
    { path: JSON.parse(manifest).entry.slice(2), data: bundle.outputFiles[0].contents },
    { path: "assets/drema.svg", data: asset },
  ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const archive = await packDrema();
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, "drema.lup"), archive);
    process.stdout.write("Drema packaged: dist/lime-examples/drema.lup\n");
  } catch (error) {
    process.stderr.write(`Drema packaging failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

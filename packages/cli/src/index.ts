import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { loadLocalPlugins, validateLocalPlugin, LoadError } from "@lunaris/development";
import { LunarisError } from "@lunaris/sdk";
import { createPlugin, GenerationError } from "./generate.js";
import { buildPackage, inspectPackage, PackageBuildError } from "./pack.js";
import { LupError } from "@lunaris/lup";
import { addContract, toolchain, ToolchainError } from './toolchain.js';

export { createPlugin } from "./generate.js";
export interface CLIOutput { out(line: string): void; error(line: string): void }
const output: CLIOutput = { out: line => { process.stdout.write(`${line}\n`); }, error: line => { process.stderr.write(`${line}\n`); } };
const usage = "Usage: lunaris-core create-plugin <directory> [--id plugin.id] | contracts | add-contract <package> [directory] | validate|test|inspect|dev [roots...] [--once for dev] | pack <directory> [output.lup] | inspect-package <package.lup>";
class UsageError extends Error {}

async function tests(root: string): Promise<number> {
  const directory = path.join(root, "test");
  const files = (await readdir(directory)).filter(name => name.endsWith(".test.mjs") || name.endsWith(".test.js")).sort();
  if (!files.length) throw new Error("No focused test files in test/.");
  return await new Promise<number>((resolve, reject) => {
    const env = { ...process.env };
    // This is a separate test invocation even if the CLI itself is under node:test.
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ["--test", ...files.map(name => path.join(directory, name))], { cwd: root, stdio: "inherit", env });
    child.once("error", reject); child.once("exit", code => resolve(code ?? 1));
  });
}

async function development(roots: readonly string[], once: boolean, io: CLIOutput): Promise<void> {
  const session = await loadLocalPlugins(roots);
  let resolve!: () => void;
  const stopped = new Promise<void>(done => { resolve = done; });
  const reader = once ? undefined : createInterface({ input: process.stdin });
  const stop = () => resolve();
  if (!once) {
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    reader!.on("line", line => { if (line.trim() === "stop") stop(); else io.out("Type stop to shut down. Rebuild and relaunch for changed code."); });
    reader!.once("close", stop);
  }
  try {
    await session.start();
    io.out(JSON.stringify({ code: "DEV_READY", plugins: session.pluginIds }));
    if (!once) await stopped;
  } finally {
    reader?.close(); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    await session.stop();
  }
  io.out(JSON.stringify({ code: "DEV_STOPPED", snapshot: session.kernel.inspect() }));
}

/** Authoring CLI. All one-shot failures return nonzero without raw causes. */
export async function run(args: readonly string[], io: CLIOutput = output): Promise<number> {
  try {
    const [command, ...rest] = args;
    if (command === "--help" || command === "help") { io.out(usage); return 0; }
    if (command === 'contracts') {
      if (rest.length) throw new UsageError(usage);
      io.out(JSON.stringify({ code: 'SDK_CONTRACTS', packages: Object.entries((await toolchain()).packages).filter(([, item]) => item.kind === 'sdk').map(([name, item]) => ({ name, version: item.version })) })); return 0;
    }
    if (command === 'add-contract') {
      if (!rest[0] || rest.length > 2 || rest.some(value => value.startsWith('--'))) throw new UsageError(usage);
      await addContract(rest[0], rest[1] ?? '.'); io.out(JSON.stringify({ code: 'CONTRACT_ADDED', package: rest[0] })); return 0;
    }
    if (command === 'pack' || command === 'inspect-package') {
      if (rest.some(value => value.startsWith('--')) || (command === 'pack' ? rest.length < 1 || rest.length > 2 : rest.length !== 1)) throw new UsageError(usage);
      const preview = command === 'pack' ? await buildPackage(rest[0]!, rest[1]) : await inspectPackage(rest[0]!);
      io.out(JSON.stringify({ code: command === 'pack' ? 'PACKAGE_BUILT' : 'PACKAGE_INSPECTED', pluginId: preview.manifest.id, version: preview.manifest.version, digest: preview.digest, bytes: preview.byteLength, entries: preview.paths.length, ...(command === 'inspect-package' ? { manifest: preview.manifest, paths: preview.paths } : {}) }));
      return 0;
    }
    if (command === "create-plugin") {
      const [target, flag, id, ...extra] = rest;
      if (!target || extra.length || (flag !== undefined && (flag !== "--id" || !id))) throw new UsageError(usage);
      io.out(JSON.stringify({ code: "PLUGIN_CREATED", root: await createPlugin(target, id) })); return 0;
    }
    if (!["validate", "test", "inspect", "dev"].includes(command ?? "")) throw new UsageError(usage);
    if (rest.some(arg => arg.startsWith("--") && !(command === "dev" && arg === "--once"))) throw new UsageError(usage);
    const roots = rest.filter(arg => arg !== "--once"); if (!roots.length) roots.push(".");
    if (command === "validate" || command === "test") {
      const checked = await Promise.all(roots.map(validateLocalPlugin));
      for (const item of checked) {
        if (command === "test" && await tests(item.root) !== 0) return 1;
        io.out(JSON.stringify({ code: command === "test" ? "TEST_PASSED" : "VALIDATED", pluginId: item.manifest.id }));
      }
    } else if (command === "dev") await development(roots, rest.includes("--once"), io);
    else {
      const session = await loadLocalPlugins(roots);
      try { await session.start(); io.out(JSON.stringify(session.kernel.inspect())); }
      catch (error) { io.out(JSON.stringify(session.kernel.inspect())); throw error; }
      finally { await session.stop(); }
    }
    return 0;
  } catch (error) {
    const known = error instanceof LoadError || error instanceof LunarisError || error instanceof GenerationError || error instanceof PackageBuildError || error instanceof LupError || error instanceof ToolchainError;
    io.error(JSON.stringify({ code: known ? error.code : error instanceof UsageError ? "CLI_USAGE" : "CLI_FAILED", message: known || error instanceof UsageError ? error.message : "Command failed. Check paths, build output and local tests.", ...(error instanceof LoadError ? { location: error.location } : {}) }));
    return 1;
  }
}

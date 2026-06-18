import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const exec = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Generation stamp identifying the tool version that produced a document:
 * `visual-skills@<git-short-sha>[-dirty] · <ISO timestamp>`. Falls back to the
 * package.json version, then "unknown", if git is unavailable.
 */
export async function generatorStamp(now: Date = new Date()): Promise<string> {
  const ts = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  let ver: string;
  try {
    const { stdout: sha } = await exec("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT });
    const { stdout: status } = await exec("git", ["status", "--porcelain"], { cwd: ROOT });
    ver = sha.trim() + (status.trim() ? "-dirty" : "");
  } catch {
    try {
      const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { version?: string };
      ver = `v${pkg.version ?? "0.0.0"}`;
    } catch {
      ver = "unknown";
    }
  }
  return `visual-skills@${ver} · ${ts}`;
}

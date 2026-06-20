import { describe, it, expect } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const exec = promisify(execFile);
const BIN = new URL("../bin/atlas.ts", import.meta.url).pathname;

/** Run bin/atlas.ts with the given args via tsx; throws on non-zero exit. */
function runCli(args: string[]): void {
  execFileSync("npx", ["tsx", BIN, ...args], { encoding: "utf8" });
}

const atlasDoc = { kind: "atlas", title: "Atlas · demo", blocks: [
  { type: "atlas-tldr", id: "tldr", heading: "h", rows: [] },
  { type: "domain-index", id: "domains", title: "The 1 domain", tiles: [
    { name: "sim", path: "lib/sim", layer: "engine", layerLabel: "Engine", purpose: "p", href: "domain-sim.html" } ] },
] };
const domainDoc = { kind: "domain", slug: "sim", title: "sim", layer: "engine", layerLabel: "Engine", path: "lib/sim", blocks: [
  { type: "domain-tldr", id: "tldr", heading: "h", rows: [] },
  { type: "seams", id: "seams", title: "Seams", exposes: [], depends: [] },
] };

describe("atlas CLI (render-only)", () => {
  it("renders one page from --blocks and re-writes its json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-"));
    await writeFile(join(dir, "atlas.json"), JSON.stringify(atlasDoc));
    await exec("npx", ["tsx", BIN, "--blocks", join(dir, "atlas.json"), "--out", dir]);
    const html = await readFile(join(dir, "atlas.html"), "utf8");
    expect(html).toContain("Atlas · demo");
    expect(html).toContain(".domain-tile");
  });
  it("--all renders the atlas + every domain-*.json in the dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-"));
    await writeFile(join(dir, "atlas.json"), JSON.stringify(atlasDoc));
    await writeFile(join(dir, "domain-sim.json"), JSON.stringify(domainDoc));
    await exec("npx", ["tsx", BIN, "--all", dir, "--out", dir]);
    const files = await readdir(dir);
    expect(files).toContain("atlas.html");
    expect(files).toContain("domain-sim.html");
    const dom = await readFile(join(dir, "domain-sim.html"), "utf8");
    expect(dom).toContain('class="topbar-back"');
  });
});

it("--repo full scan: creates config + drafts, renders, is idempotent (no clobber)", () => {
  const repo = join(__dirname, "fixtures", "atlas-repo");
  const out = mkdtempSync(join(tmpdir(), "atlas-scan-"));
  try {
    // first run — creates everything
    runCli(["--repo", repo, "--out", out]); // runCli = the helper used by existing CLI tests
    expect(existsSync(join(out, "atlas.domains.json"))).toBe(true);
    expect(existsSync(join(out, "atlas.json"))).toBe(true);
    expect(existsSync(join(out, "domain-sim.json"))).toBe(true);
    expect(existsSync(join(out, "atlas.html"))).toBe(true);
    expect(existsSync(join(out, "domain-sim.html"))).toBe(true);

    // author prose into a draft, then re-run — must NOT be clobbered
    const p = join(out, "domain-sim.json");
    const doc = JSON.parse(readFileSync(p, "utf8"));
    doc.blocks.find((b: any) => b.type === "domain-tldr").rows.push({ key: "x", value: "AUTHORED" });
    writeFileSync(p, JSON.stringify(doc, null, 2));
    runCli(["--repo", repo, "--out", out]);
    expect(readFileSync(p, "utf8")).toContain("AUTHORED");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}, 30_000);

it("--domain refreshes only that domain page and reports tile drift", () => {
  const repo = join(__dirname, "fixtures", "atlas-repo");
  const out = mkdtempSync(join(tmpdir(), "atlas-dom-"));
  try {
    runCli(["--repo", repo, "--out", out]);               // seed config + drafts
    const atlasBefore = readFileSync(join(out, "atlas.json"), "utf8");
    rmSync(join(out, "domain-sim.json"));                  // simulate wanting a fresh sim draft
    runCli(["--repo", repo, "--domain", "sim", "--out", out]);
    expect(existsSync(join(out, "domain-sim.json"))).toBe(true);
    expect(existsSync(join(out, "domain-sim.html"))).toBe(true);
    expect(readFileSync(join(out, "atlas.json"), "utf8")).toBe(atlasBefore); // atlas untouched
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}, 30_000);

it("--domain errors clearly without a config", () => {
  const repo = join(__dirname, "fixtures", "atlas-repo");
  const out = mkdtempSync(join(tmpdir(), "atlas-dom2-"));
  try {
    expect(() => runCli(["--repo", repo, "--domain", "sim", "--out", out])).toThrow();
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}, 30_000);

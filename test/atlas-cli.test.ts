import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const exec = promisify(execFile);
const BIN = new URL("../bin/atlas.ts", import.meta.url).pathname;

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

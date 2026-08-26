import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const CHECKER = new URL("../assets/atlas-check-v2.mjs", import.meta.url).pathname;

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function topicDoc(
  pageId: string,
  slug: string,
  title: string,
  summary: string,
  evidenceFile: string,
  shape = "mechanism",
) {
  return {
    kind: "topic", pageId, slug, title, purpose: summary, shape,
    blocks: [
      { type: "topic-tldr", id: "tldr", heading: title, summary, inputs: ["stored state"], outputs: ["model input"] },
      { type: "topic-flow", id: "flow", title: "How it works", steps: [
        { title: "Load", body: "Read the durable state that constrains this operation." },
        { title: "Assemble", body: "Transform that state into the ordered output." },
      ] },
      { type: "topic-rules", id: "rules", title: "Rules", guarantees: ["Order is stable"], failures: [
        { condition: "Stored state cannot be read", behavior: "Stop before emitting model input." },
      ] },
      { type: "implementation-reference", id: "reference", title: "Implementation", groups: [
        { label: "Runtime", files: [{ name: evidenceFile, desc: "Implements the ordered topic behavior." }] },
      ] },
    ],
  };
}

function seedAtlas(): { root: string; atlas: string } {
  const root = mkdtempSync(join(tmpdir(), "atlas-check-"));
  const atlas = join(root, ".visual", "atlas");
  mkdirSync(atlas, { recursive: true });
  copyFileSync(CHECKER, join(atlas, "atlas-check.mjs"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "packages", "context"), { recursive: true });
  writeFileSync(join(root, "src", "conversation.ts"), "export function runConversation() {}\n");
  writeFileSync(join(root, "packages", "context", "build-context.ts"), "export function buildContext() {}\n");
  writeFileSync(join(root, "packages", "context", "compact.ts"), "export function compact() {}\n");

  writeJson(join(atlas, "atlas.domains.json"), {
    repo: "demo", srcRoots: ["src"],
    domains: [{
      slug: "conversation", name: "Conversation", purpose: "Runs a turn",
      globs: ["src/conversation.ts"], modules: ["src/conversation.ts"],
      topics: [{
        slug: "context-building", title: "Context building", purpose: "Builds model input", shape: "mechanism",
        sources: [{ label: "Assembly", include: ["packages/context/build-context.ts"] }],
        topics: [{
          slug: "compaction", title: "Compaction", purpose: "Reduces older input", shape: "algorithm",
          sources: [{ label: "Policy", include: ["packages/context/compact.ts"] }],
        }],
      }],
    }],
  });
  writeJson(join(atlas, "atlas.json"), {
    kind: "atlas", title: "System Atlas · demo", count: "1 domains",
    blocks: [
      { type: "atlas-tldr", id: "tldr", heading: "Demo", rows: [] },
      { type: "domain-map", id: "map", svg: "<svg></svg>" },
      { type: "domain-index", id: "domains", title: "Domains", tiles: [{ name: "Conversation", path: "src", layer: "engine", layerLabel: "Engine", purpose: "Runs a turn", href: "domain-conversation/domain-conversation.html" }] },
    ],
  });
  writeJson(join(atlas, "domain-conversation", "domain-conversation.json"), {
    kind: "domain", slug: "conversation", title: "Conversation",
    blocks: [
      { type: "domain-tldr", id: "tldr", heading: "Conversation", rows: [] },
      { type: "diagram-section", id: "arch", title: "Architecture", diagram: { id: "d", kind: "architecture", d2: "a -> b" } },
      { type: "implementation-reference", id: "reference", title: "Implementation", groups: [] },
      { type: "seams", id: "seams", title: "Seams", exposes: [{ api: "runConversation()" }], depends: [] },
    ],
  });
  writeJson(join(atlas, "domain-conversation", "context-building", "context-building.json"),
    topicDoc(
      "conversation/context-building",
      "context-building",
      "Context building",
      "Builds model input",
      "packages/context/build-context.ts",
    ));
  writeJson(join(atlas, "domain-conversation", "context-building", "compaction", "compaction.json"),
    topicDoc(
      "conversation/context-building/compaction",
      "compaction",
      "Compaction",
      "Reduces older input",
      "packages/context/compact.ts",
      "algorithm",
    ));

  writeFileSync(join(atlas, "atlas.html"), '<a href="domain-conversation/domain-conversation.html">Conversation</a>');
  writeFileSync(join(atlas, "domain-conversation", "domain-conversation.html"), '<a href="../atlas.html">Atlas</a><a href="context-building/context-building.html">Context</a>');
  writeFileSync(join(atlas, "domain-conversation", "context-building", "context-building.html"), '<a href="../domain-conversation.html">Conversation</a><a href="compaction/compaction.html">Compaction</a>');
  writeFileSync(join(atlas, "domain-conversation", "context-building", "compaction", "compaction.html"), '<a href="../context-building.html">Context</a>');
  return { root, atlas };
}

function run(root: string, args: string[] = []): { ok: boolean; output: string } {
  const checker = join(root, ".visual", "atlas", "atlas-check.mjs");
  const result = spawnSync(process.execPath, [checker, "--repo", root, ...args], { encoding: "utf8" });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

describe("recursive atlas checker", () => {
  it("stamps every page and reports a stale leaf topic independently", () => {
    const { root, atlas } = seedAtlas();
    try {
      expect(run(root, ["--stamp"]).ok).toBe(true);
      writeFileSync(join(root, "packages", "context", "compact.ts"), "export function compactAgain() {}\n");

      const result = run(root);

      expect(result.ok).toBe(false);
      expect(result.output).toMatch(/conversation\/context-building\/compaction.*source changed/i);
      expect(result.output).not.toMatch(/conversation\/context-building".*source changed/i);
      const parent = JSON.parse(readFileSync(join(atlas, "domain-conversation", "context-building", "context-building.json"), "utf8"));
      expect(parent.verifiedAgainst?.hash).toMatch(/^sha256:/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("invalidates a domain when a new live file starts matching its glob", () => {
    const { root, atlas } = seedAtlas();
    try {
      const configPath = join(atlas, "atlas.domains.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.domains[0].globs = ["src/**"];
      writeJson(configPath, config);
      expect(run(root, ["--stamp"]).ok).toBe(true);

      writeFileSync(join(root, "src", "new-conversation.ts"), "export const newConversation = true;\n");
      const result = run(root);

      expect(result.ok).toBe(false);
      expect(result.output).toMatch(/domain "conversation".*module inventory.*new-conversation\.ts/i);
      expect(result.output).toMatch(/conversation.*source changed/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects stale page identity and includes a page's own config in its fingerprint", () => {
    const { root, atlas } = seedAtlas();
    try {
      expect(run(root, ["--stamp"]).ok).toBe(true);
      const configPath = join(atlas, "atlas.domains.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.domains[0].topics[0].title = "Context assembly";
      writeJson(configPath, config);

      const result = run(root);

      expect(result.ok).toBe(false);
      expect(result.output).toMatch(/context-building.*title.*Context assembly/i);
      expect(result.output).toMatch(/context-building.*source changed/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects structured file references outside the page's evidence scope", () => {
    const { root, atlas } = seedAtlas();
    try {
      expect(run(root, ["--stamp"]).ok).toBe(true);
      const path = join(atlas, "domain-conversation", "context-building", "context-building.json");
      const doc = JSON.parse(readFileSync(path, "utf8"));
      doc.blocks.find((block: any) => block.type === "implementation-reference").groups = [
        { label: "Wrong scope", files: [{ name: "src/conversation.ts", desc: "Exists, but is not context evidence" }] },
      ];
      writeJson(path, doc);

      const result = run(root);

      expect(result.ok).toBe(false);
      expect(result.output).toMatch(/context-building.*outside page evidence.*src\/conversation\.ts/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unsafe slugs before resolving page artifacts", () => {
    const { root, atlas } = seedAtlas();
    try {
      const configPath = join(atlas, "atlas.domains.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.domains[0].topics[0].slug = "../escape";
      writeJson(configPath, config);

      const result = run(root);

      expect(result.ok).toBe(false);
      expect(result.output).toMatch(/unsafe slug.*\.\.\/escape/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses stamp mode before an unsafe slug can write outside the atlas", () => {
    const { root, atlas } = seedAtlas();
    try {
      const outside = join(root, "package.json");
      const sentinel = JSON.stringify({ sentinel: "do not overwrite" }, null, 2);
      writeFileSync(outside, sentinel);
      const configPath = join(atlas, "atlas.domains.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.domains[0].topics[0].slug = "../../package";
      writeJson(configPath, config);

      const result = run(root, ["--stamp"]);

      expect(result.ok).toBe(false);
      expect(result.output).toMatch(/unsafe slug.*\.\.\/\.\.\/package/i);
      expect(readFileSync(outside, "utf8")).toBe(sentinel);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("limits topic fingerprints to own evidence and immediate child summaries", () => {
    const { root, atlas } = seedAtlas();
    try {
      const configPath = join(atlas, "atlas.domains.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.domains[0].topics[0].topics[0].topics = [{
        slug: "trimming", title: "Trimming", purpose: "Removes redundant detail", shape: "algorithm",
        sources: [{ label: "Policy", include: ["packages/context/compact.ts"] }],
      }];
      writeJson(configPath, config);
      writeJson(join(atlas, "domain-conversation", "context-building", "compaction", "trimming", "trimming.json"),
        topicDoc(
          "conversation/context-building/compaction/trimming",
          "trimming",
          "Trimming",
          "Removes redundant detail",
          "packages/context/compact.ts",
          "algorithm",
        ));
      writeFileSync(join(atlas, "domain-conversation", "context-building", "compaction", "trimming", "trimming.html"),
        '<a href="../compaction.html">Compaction</a>');
      expect(run(root, ["--stamp"]).ok).toBe(true);

      config.domains[0].topics[0].topics[0].topics[0].title = "Detail trimming";
      writeJson(configPath, config);
      const result = run(root);

      expect(result.ok).toBe(false);
      expect(result.output).toMatch(/conversation\/context-building\/compaction".*source changed/i);
      expect(result.output).not.toMatch(/conversation\/context-building".*source changed/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails on missing pages, unresolved source groups, broken links, and bad derived counts", () => {
    const { root, atlas } = seedAtlas();
    try {
      expect(run(root, ["--stamp"]).ok).toBe(true);
      unlinkSync(join(atlas, "domain-conversation", "context-building", "compaction", "compaction.json"));
      const configPath = join(atlas, "atlas.domains.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.domains[0].topics[0].sources[0].include = ["packages/context/missing.ts"];
      writeJson(configPath, config);
      writeFileSync(join(atlas, "domain-conversation", "context-building", "context-building.html"), '<a href="missing.html">Missing</a>');
      const atlasPath = join(atlas, "atlas.json");
      const atlasDoc = JSON.parse(readFileSync(atlasPath, "utf8"));
      atlasDoc.count = "2 domains";
      writeJson(atlasPath, atlasDoc);

      const result = run(root);

      expect(result.ok).toBe(false);
      expect(result.output).toMatch(/compaction.*has no page/i);
      expect(result.output).toMatch(/source group.*Assembly.*resolves to no files/i);
      expect(result.output).toMatch(/broken local link.*missing\.html/i);
      expect(result.output).toMatch(/domain count.*expected 1/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints density and history advisories without failing", () => {
    const { root, atlas } = seedAtlas();
    try {
      expect(run(root, ["--stamp"]).ok).toBe(true);
      const path = join(atlas, "domain-conversation", "context-building", "context-building.json");
      const doc = JSON.parse(readFileSync(path, "utf8"));
      doc.blocks[0].summary = `PR #99 replaced the old implementation. ${Array.from({ length: 2001 }, () => "word").join(" ")}`;
      writeJson(path, doc);

      const result = run(root);

      expect(result.ok).toBe(true);
      expect(result.output).toMatch(/warning.*project history/i);
      expect(result.output).toMatch(/warning.*2,000/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to stamp a materially empty topic", () => {
    const { root, atlas } = seedAtlas();
    try {
      const path = join(atlas, "domain-conversation", "context-building", "context-building.json");
      const doc = JSON.parse(readFileSync(path, "utf8"));
      const lead = doc.blocks.find((block: any) => block.type === "topic-tldr");
      lead.summary = "";
      lead.inputs = [];
      lead.outputs = [];
      doc.blocks.find((block: any) => block.type === "topic-flow").steps = [];
      const rules = doc.blocks.find((block: any) => block.type === "topic-rules");
      rules.guarantees = [];
      rules.failures = [];
      doc.blocks.find((block: any) => block.type === "implementation-reference")
        .groups[0].files[0].desc = "";
      writeJson(path, doc);

      const result = run(root, ["--stamp", "conversation/context-building"]);

      expect(result.ok).toBe(false);
      expect(result.output).toMatch(/context-building.*summary/i);
      expect(result.output).toMatch(/context-building.*two non-empty flow steps/i);
      expect(result.output).toMatch(/context-building.*implementation reference.*description/i);
      expect(JSON.parse(readFileSync(path, "utf8")).verifiedAgainst).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows a targeted stamp when an unrelated page has a grounding defect", () => {
    const { root, atlas } = seedAtlas();
    try {
      const domainPath = join(atlas, "domain-conversation", "domain-conversation.json");
      const domain = JSON.parse(readFileSync(domainPath, "utf8"));
      domain.blocks.find((block: any) => block.type === "implementation-reference").groups = [
        {
          label: "Wrong domain scope",
          files: [{
            name: "packages/context/build-context.ts",
            desc: "This file exists but is outside the domain's evidence.",
          }],
        },
      ];
      writeJson(domainPath, domain);

      const result = run(root, ["--stamp", "conversation/context-building/compaction"]);

      expect(result.ok).toBe(true);
      const leafPath = join(
        atlas,
        "domain-conversation",
        "context-building",
        "compaction",
        "compaction.json",
      );
      expect(JSON.parse(readFileSync(leafPath, "utf8")).verifiedAgainst?.hash).toMatch(/^sha256:/);
      expect(run(root).output).toMatch(/conversation.*outside page evidence.*build-context/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks a targeted stamp when an unselected topic misses the global content floor", () => {
    const { root, atlas } = seedAtlas();
    try {
      const leafPath = join(
        atlas,
        "domain-conversation",
        "context-building",
        "compaction",
        "compaction.json",
      );
      const leaf = JSON.parse(readFileSync(leafPath, "utf8"));
      leaf.blocks.find((block: any) => block.type === "topic-tldr").summary = "";
      writeJson(leafPath, leaf);

      const parentPath = join(
        atlas,
        "domain-conversation",
        "context-building",
        "context-building.json",
      );
      const result = run(root, ["--stamp", "conversation/context-building"]);

      expect(result.ok).toBe(false);
      expect(result.output).toMatch(/compaction.*summary is empty/i);
      expect(JSON.parse(readFileSync(parentPath, "utf8")).verifiedAgainst).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("emits topic substance advisories without blocking a valid stamp", () => {
    const { root, atlas } = seedAtlas();
    try {
      const path = join(atlas, "domain-conversation", "context-building", "context-building.json");
      const doc = JSON.parse(readFileSync(path, "utf8"));
      doc.blocks.find((block: any) => block.type === "topic-flow").steps.push(
        { title: "Reserve", body: "Protect output capacity." },
        { title: "Return", body: "Return the bounded context." },
      );
      writeJson(path, doc);

      const result = run(root, ["--stamp", "conversation/context-building"]);

      expect(result.ok).toBe(true);
      expect(result.output).toMatch(/fewer than roughly 180 visible narrative words/i);
      expect(result.output).toMatch(/multi-stage topic has no diagram or worked example/i);
      expect(result.output).toMatch(/algorithm topic has no worked example/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

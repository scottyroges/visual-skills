# Visual Atlas — Phase 3: Inventory Scanner + Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mechanical inventory scanner that walks a repo, groups modules into domains via a committed `atlas.domains.json` config, reconciles drift, and emits draft `atlas.json` + `domain-<slug>.json` block files the agent then enriches — wired into `bin/atlas.ts` as full-scan and single-domain modes.

**Architecture:** Three pure layers + a CLI seam. `src/atlas-config.ts` owns the `atlas.domains.json` shape, the folder first-guess, and drift reconciliation. `src/gather-atlas.ts` walks source (reusing `imports`/`trpc-parse`/`prisma-schema`/`dep-graph` helpers), aggregates module→domain import edges, and builds draft block docs matching the Phase-2 `AtlasBlock` model. `bin/atlas.ts` gains `--repo` (full) and `--domain` (single) modes alongside the existing `--blocks`/`--all` render modes. Everything below the CLI is pure and unit-tested; the CLI is the only I/O seam.

**Tech Stack:** TypeScript (ESM, `tsx`), vitest, `typescript` compiler API (already used by `imports.ts`/`dep-graph.ts`), Node `fs/promises`.

---

## Locked design decisions

These resolve gaps between the spec's content model and the Phase-2 block model. Stated here so tasks are unambiguous:

- **D1 — Draft-only-when-absent.** The scanner NEVER overwrites an existing block JSON file (it would clobber the agent's authored prose). Full/single modes write a draft only when the target file is absent; `--force` regenerates. Re-scans surface change as a **drift report**, not an in-place edit.
- **D2 — Config preserves human edits.** Reconciliation keeps each domain's human-owned `slug`/`name`/`globs`; it only refills the resolved `modules` from `globs` and reports drift (new/unassigned modules, stale paths, empty domains). It never moves a module the human assigned.
- **D3 — Domain map is a `diagram-section`.** The mechanical domain map is emitted as a `diagram-section` block (architecture-kind d2 + mermaid, aggregated to the domain level), not the hand-authored raw-`svg` `domain-map` block. The agent may upgrade it to a curated `domain-map` SVG during enrichment (as the canonical did).
- **D4 — Depth components group by immediate subdirectory.** Under a domain's common path, each immediate child directory becomes one depth component (top-level loose files collapse into one component named after the domain). Matches the canonical's "6 brains = 6 subdirs of lib/brain". Prose fields (`purpose`, `detail`, connection `body`, file/export `desc`) are emitted as empty strings — the agent fills them.
- **D5 — First-guess grouping.** With no config, each top-level directory under each `srcRoot` becomes one domain (`slug` = dir name).
- **D6 — Reuse, don't duplicate.** Add `exportsOf` to `imports.ts`; export `dep-graph.ts`'s existing `walkSource`/`moduleKey`/`loadAliases`/`resolveModule` (additive `export` only, no logic change) and import them in the scanner.

---

## File structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/imports.ts` | Modify | Add `exportsOf(source)` next to `importsOf`. |
| `src/dep-graph.ts` | Modify | Add `export` to `walkSource`, `moduleKey`, `loadAliases`, `resolveModule` (no logic change). |
| `src/atlas-config.ts` | Create | `atlas.domains.json` types, `matchGlob`, `firstGuessConfig`, `reconcile`. Pure. |
| `src/gather-atlas.ts` | Create | `scanInventory`, `aggregateDomainEdges`, `domainMapDiagram`, `buildAtlasDraft`, `buildDomainDraft`. Pure (scan does fs reads). |
| `bin/atlas.ts` | Modify | Add `--repo`/`--domain`/`--force` modes; keep `--blocks`/`--all`. |
| `test/fixtures/atlas-repo/**` | Create | Tiny 2-domain repo (source + prisma schema) for scanner tests. |
| `test/atlas-config.test.ts` | Create | first-guess + reconcile/drift. |
| `test/gather-atlas.test.ts` | Create | scan, edges, draft builders against the fixture. |
| `test/atlas-cli.test.ts` | Modify | `--repo` and `--domain` end-to-end. |

---

## Task 1: `exportsOf` extractor

**Files:**
- Modify: `src/imports.ts`
- Test: `test/imports.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create/append `test/imports.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { exportsOf } from "../src/imports.js";

describe("exportsOf", () => {
  it("extracts named, const, class, and re-exported names; dedups", () => {
    const src = `
      export function computePlan() {}
      export const RATE = 1;
      export class Engine {}
      export { helper, helper as aliased } from "./util.js";
      export default function main() {}
      function private1() {}
    `;
    expect(exportsOf(src).sort()).toEqual(
      ["Engine", "RATE", "aliased", "computePlan", "default", "helper"].sort(),
    );
  });

  it("returns [] for a module with no exports", () => {
    expect(exportsOf("const x = 1;")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/imports.test.ts`
Expected: FAIL — `exportsOf is not a function`.

- [ ] **Step 3: Implement `exportsOf`**

Append to `src/imports.ts`:

```ts
/** Extract exported binding names from TS/JS source: named decls, `export { ... }`,
 *  re-exports (`export { x } from`), and `export default` (as "default"). Dedups. */
export function exportsOf(source: string): string[] {
  const sf = ts.createSourceFile("f.ts", source, ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) {
      const mods = ts.getModifiers(n) ?? [];
      const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (exported) names.push(isDefault ? "default" : n.name?.text ?? "default");
    } else if (ts.isVariableStatement(n)) {
      const exported = (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (exported)
        for (const d of n.declarationList.declarations)
          if (ts.isIdentifier(d.name)) names.push(d.name.text);
    } else if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) {
      for (const el of n.exportClause.elements) names.push(el.name.text);
    } else if (ts.isExportAssignment(n)) {
      names.push("default");
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...new Set(names)];
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run test/imports.test.ts` → PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/imports.ts test/imports.test.ts
git commit -m "feat(atlas): exportsOf extractor for the inventory scanner"
```

---

## Task 2: Export reusable graph helpers from `dep-graph.ts`

**Files:**
- Modify: `src/dep-graph.ts`

No new behavior — only widen visibility of four existing helpers so the scanner reuses the exact same module-resolution logic the recap uses (D6). The existing `test/dep-graph.test.ts` (recap's "where it fits") is the regression guard.

- [ ] **Step 1: Add `export` to the four helpers**

In `src/dep-graph.ts`, add the `export` keyword to these existing declarations (signatures unchanged):

- `function walkSource(...)` → `export async function walkSource(...)`
- `function moduleKey(...)` → `export function moduleKey(...)`
- `function loadAliases(...)` → `export function loadAliases(...)`
- `function resolveModule(...)` → `export function resolveModule(...)`

Also export the `Aliases` interface (`export interface Aliases ...`) since `resolveModule`/`loadAliases` reference it across the module boundary.

- [ ] **Step 2: Verify nothing else broke**

Run: `npx tsc --noEmit` → clean. Run: `npx vitest run test/dep-graph.test.ts` → still PASS (no logic changed).

- [ ] **Step 3: Commit**

```bash
git add src/dep-graph.ts
git commit -m "refactor(atlas): export dep-graph walk/resolve helpers for reuse"
```

---

## Task 3: `atlas-config.ts` — types, `matchGlob`, `firstGuessConfig`

**Files:**
- Create: `src/atlas-config.ts`
- Test: `test/atlas-config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/atlas-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchGlob, firstGuessConfig } from "../src/atlas-config.js";

describe("matchGlob", () => {
  it("matches ** across directories and * within a segment", () => {
    expect(matchGlob("lib/sim/**", "lib/sim/engine.ts")).toBe(true);
    expect(matchGlob("lib/sim/**", "lib/sim/loop/season.ts")).toBe(true);
    expect(matchGlob("lib/sim/**", "lib/brain/gm.ts")).toBe(false);
    expect(matchGlob("lib/*/index.ts", "lib/sim/index.ts")).toBe(true);
    expect(matchGlob("lib/*/index.ts", "lib/sim/loop/index.ts")).toBe(false);
  });
});

describe("firstGuessConfig", () => {
  it("makes one domain per top-level dir under each srcRoot", () => {
    const cfg = firstGuessConfig("demo", ["lib"], [
      "lib/sim/engine.ts",
      "lib/sim/loop/season.ts",
      "lib/brain/gm.ts",
      "lib/index.ts", // loose file under the root → no domain
    ]);
    expect(cfg.repo).toBe("demo");
    expect(cfg.srcRoots).toEqual(["lib"]);
    expect(cfg.domains.map((d) => d.slug).sort()).toEqual(["brain", "sim"]);
    const sim = cfg.domains.find((d) => d.slug === "sim")!;
    expect(sim.globs).toEqual(["lib/sim/**"]);
    expect(sim.modules.sort()).toEqual(["lib/sim/engine.ts", "lib/sim/loop/season.ts"]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/atlas-config.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement the types + functions**

Create `src/atlas-config.ts`:

```ts
/** The committed grouping config (`atlas.domains.json`) — human-owned source of truth. */
export interface DomainConfig {
  slug: string;
  name: string;
  globs: string[];      // human-editable lever
  modules: string[];    // resolved membership the scanner fills in (repo-relative)
}
export interface AtlasConfig {
  repo: string;
  srcRoots: string[];
  domains: DomainConfig[];
}

/** Drift between the live inventory and an existing config (reported, never auto-applied). */
export interface Drift {
  newModules: string[];                       // in repo, matched by no domain glob
  stalePaths: { slug: string; path: string }[]; // in config.modules, no longer in the repo
  emptyDomains: string[];                      // domains whose globs resolve to zero modules
}

/** Minimal glob: `**` spans path segments, `*` spans within one segment. Anchored full-match. */
export function matchGlob(glob: string, path: string): boolean {
  const re = new RegExp(
    "^" +
      glob
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, " ")        // placeholder so the next step doesn't touch it
        .replace(/\*/g, "[^/]*")
        .replace(/ /g, ".*") +
      "$",
  );
  return re.test(path);
}

const norm = (p: string) => p.replace(/\\/g, "/");

/** Folder first-guess: one domain per immediate child directory of each srcRoot. */
export function firstGuessConfig(repo: string, srcRoots: string[], modules: string[]): AtlasConfig {
  const bySlug = new Map<string, DomainConfig>();
  for (const root of srcRoots) {
    const prefix = norm(root).replace(/\/$/, "") + "/";
    for (const mod of modules.map(norm)) {
      if (!mod.startsWith(prefix)) continue;
      const rest = mod.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash < 0) continue; // loose file directly under the root → not its own domain
      const dir = rest.slice(0, slash);
      const slug = dir;
      const glob = `${prefix}${dir}/**`;
      let d = bySlug.get(slug);
      if (!d) { d = { slug, name: slug, globs: [glob], modules: [] }; bySlug.set(slug, d); }
      if (!d.globs.includes(glob)) d.globs.push(glob);
      d.modules.push(mod);
    }
  }
  const domains = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const d of domains) d.modules.sort();
  return { repo, srcRoots, domains };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run test/atlas-config.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/atlas-config.ts test/atlas-config.test.ts
git commit -m "feat(atlas): atlas.domains.json config types + folder first-guess"
```

---

## Task 4: `atlas-config.ts` — `reconcile` + drift

**Files:**
- Modify: `src/atlas-config.ts`
- Test: `test/atlas-config.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/atlas-config.test.ts`:

```ts
import { reconcile } from "../src/atlas-config.js";

describe("reconcile", () => {
  const config = {
    repo: "demo",
    srcRoots: ["lib"],
    domains: [
      { slug: "sim", name: "Simulation", globs: ["lib/sim/**"], modules: ["lib/sim/old.ts"] },
      { slug: "brain", name: "Brain", globs: ["lib/brain/**"], modules: [] },
      { slug: "empty", name: "Empty", globs: ["lib/ghost/**"], modules: [] },
    ],
  };
  const live = ["lib/sim/engine.ts", "lib/sim/loop.ts", "lib/brain/gm.ts", "lib/store/cart.ts"];

  it("refills modules from globs, preserving human name/globs", () => {
    const { config: next } = reconcile(config, live);
    const sim = next.domains.find((d) => d.slug === "sim")!;
    expect(sim.name).toBe("Simulation");            // human edit preserved
    expect(sim.modules).toEqual(["lib/sim/engine.ts", "lib/sim/loop.ts"]); // refilled, old.ts dropped
  });

  it("reports new (unassigned) modules, stale paths, and empty domains", () => {
    const { drift } = reconcile(config, live);
    expect(drift.newModules).toEqual(["lib/store/cart.ts"]);
    expect(drift.stalePaths).toEqual([{ slug: "sim", path: "lib/sim/old.ts" }]);
    expect(drift.emptyDomains).toEqual(["empty"]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/atlas-config.test.ts` → FAIL — `reconcile is not a function`.

- [ ] **Step 3: Implement `reconcile`**

Append to `src/atlas-config.ts`:

```ts
/**
 * Refill each domain's resolved `modules` from its `globs` against the live inventory,
 * preserving every human-owned field (slug/name/globs). Report drift without applying it:
 * modules matched by no glob (newModules), config paths no longer in the repo (stalePaths,
 * from the prior modules list), and domains whose globs resolve to nothing (emptyDomains).
 */
export function reconcile(config: AtlasConfig, liveModules: string[]): { config: AtlasConfig; drift: Drift } {
  const live = liveModules.map(norm);
  const liveSet = new Set(live);
  const assigned = new Set<string>();

  const domains: DomainConfig[] = config.domains.map((d) => {
    const modules = live.filter((m) => d.globs.some((g) => matchGlob(g, m)));
    for (const m of modules) assigned.add(m);
    return { ...d, modules: [...modules].sort() };
  });

  const newModules = live.filter((m) => !assigned.has(m)).sort();
  const stalePaths = config.domains
    .flatMap((d) => d.modules.map(norm).filter((p) => !liveSet.has(p)).map((path) => ({ slug: d.slug, path })))
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.path.localeCompare(b.path));
  const emptyDomains = domains.filter((d) => d.modules.length === 0).map((d) => d.slug).sort();

  return { config: { ...config, domains }, drift: { newModules, stalePaths, emptyDomains } };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run test/atlas-config.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/atlas-config.ts test/atlas-config.test.ts
git commit -m "feat(atlas): config reconciliation with drift report (preserves human edits)"
```

---

## Task 5: Create the fixture repo + `scanInventory`

**Files:**
- Create: `test/fixtures/atlas-repo/lib/sim/engine.ts`, `test/fixtures/atlas-repo/lib/sim/loop.ts`, `test/fixtures/atlas-repo/lib/brain/gm.ts`, `test/fixtures/atlas-repo/lib/api/root.ts`, `test/fixtures/atlas-repo/prisma/schema.prisma`
- Create: `src/gather-atlas.ts`
- Test: `test/gather-atlas.test.ts`

- [ ] **Step 1: Create the fixture repo**

`test/fixtures/atlas-repo/lib/sim/engine.ts`:

```ts
import type { Team } from "../brain/gm.js";
export interface SimResult { score: number; }
export function simulateGame(home: Team): SimResult { return { score: 0 }; }
```

`test/fixtures/atlas-repo/lib/sim/loop.ts`:

```ts
import { simulateGame } from "./engine.js";
export function runSeason(): void { simulateGame({ name: "x" }); }
```

`test/fixtures/atlas-repo/lib/brain/gm.ts`:

```ts
export interface Team { name: string; }
export function decideTrade(): void {}
```

`test/fixtures/atlas-repo/lib/api/root.ts`:

```ts
import { simulateGame } from "../sim/engine.js";
export const appRouter = router({
  play: publicProcedure.input(z.object({ id: z.string() })).mutation(() => simulateGame({ name: "x" })),
});
```

`test/fixtures/atlas-repo/prisma/schema.prisma`:

```prisma
model Team {
  id   String @id
  name String
}
model Game {
  id    String @id
  score Int
}
```

- [ ] **Step 2: Write the failing test**

Create `test/gather-atlas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scanInventory } from "../src/gather-atlas.js";

const REPO = join(__dirname, "fixtures", "atlas-repo");

describe("scanInventory", () => {
  it("lists source modules with resolved in-repo imports and exports", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const paths = inv.modules.map((m) => m.path).sort();
    expect(paths).toEqual(["lib/api/root.ts", "lib/brain/gm.ts", "lib/sim/engine.ts", "lib/sim/loop.ts"]);

    const loop = inv.modules.find((m) => m.path === "lib/sim/loop.ts")!;
    expect(loop.imports).toEqual(["lib/sim/engine"]);     // resolved module key, bare pkgs dropped
    expect(loop.exports).toEqual(["runSeason"]);

    const engine = inv.modules.find((m) => m.path === "lib/sim/engine.ts")!;
    expect(engine.imports).toEqual(["lib/brain/gm"]);
  });

  it("flags routers and collects prisma models", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    expect(inv.modules.find((m) => m.path === "lib/api/root.ts")!.isRouter).toBe(true);
    expect(inv.models.sort()).toEqual(["Game", "Team"]);
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx vitest run test/gather-atlas.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement `scanInventory`**

Create `src/gather-atlas.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { importsOf, exportsOf } from "./imports.js";
import { parseRouter } from "./trpc-parse.js";
import { parsePrismaModels } from "./prisma-schema.js";
import { walkSource, moduleKey, loadAliases, resolveModule } from "./dep-graph.js";

/** One scanned source module: resolved in-repo import keys + exported names. */
export interface ModuleInfo {
  path: string;          // repo-relative, e.g. "lib/sim/engine.ts"
  imports: string[];     // resolved in-repo module keys (bare packages dropped)
  exports: string[];
  isRouter: boolean;
}
export interface Inventory {
  modules: ModuleInfo[];
  models: string[];      // Prisma model names
}

/** Walk srcRoots, parse imports/exports/routers per module, and collect Prisma models. */
export async function scanInventory(repoRoot: string, srcRoots: string[]): Promise<Inventory> {
  const aliases = loadAliases(repoRoot);
  const seen = new Set<string>();
  const modules: ModuleInfo[] = [];

  for (const root of srcRoots) {
    for (const rel of await walkSource(join(repoRoot, root))) {
      // walkSource returns paths relative to its argument; re-root to the repo.
      const path = `${root.replace(/\/$/, "")}/${rel}`.replace(/\\/g, "/");
      if (seen.has(path)) continue;
      seen.add(path);
      const src = await readFile(join(repoRoot, path), "utf8").catch(() => null);
      if (src == null) continue;
      const imports = [...new Set(
        importsOf(src)
          .map((spec) => resolveModule(path, spec, aliases))
          .filter((k): k is string => k != null && k !== moduleKey(path)),
      )].sort();
      const isRouter = /\brouter\s*\(/.test(src) && parseRouter(src, "appRouter").length > 0;
      modules.push({ path, imports, exports: exportsOf(src), isRouter });
    }
  }
  modules.sort((a, b) => a.path.localeCompare(b.path));

  const schema = await readFile(join(repoRoot, "prisma", "schema.prisma"), "utf8").catch(() => null);
  const models = schema ? [...parsePrismaModels(schema).keys()] : [];
  return { modules, models };
}
```

> Note: `walkSource(dir)` returns paths relative to `dir`. We re-root each by prefixing the `srcRoot`. `moduleKey(path)` strips the extension so a self-import never appears.

- [ ] **Step 5: Run it, verify it passes**

Run: `npx vitest run test/gather-atlas.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add test/fixtures/atlas-repo src/gather-atlas.ts test/gather-atlas.test.ts
git commit -m "feat(atlas): scanInventory — walk source, resolve edges, detect routers/models"
```

---

## Task 6: `aggregateDomainEdges` + `domainMapDiagram`

**Files:**
- Modify: `src/gather-atlas.ts`
- Test: `test/gather-atlas.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/gather-atlas.test.ts`:

```ts
import { aggregateDomainEdges, domainMapDiagram } from "../src/gather-atlas.js";
import type { AtlasConfig } from "../src/atlas-config.js";

const CONFIG: AtlasConfig = {
  repo: "demo",
  srcRoots: ["lib"],
  domains: [
    { slug: "sim", name: "sim", globs: ["lib/sim/**"], modules: ["lib/sim/engine.ts", "lib/sim/loop.ts"] },
    { slug: "brain", name: "brain", globs: ["lib/brain/**"], modules: ["lib/brain/gm.ts"] },
    { slug: "api", name: "api", globs: ["lib/api/**"], modules: ["lib/api/root.ts"] },
  ],
};

describe("aggregateDomainEdges", () => {
  it("maps module edges to cross-domain edges, dropping intra-domain", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const edges = aggregateDomainEdges(CONFIG, inv);
    expect([...(edges.get("sim") ?? [])].sort()).toEqual(["brain"]); // engine→gm; loop→engine dropped
    expect([...(edges.get("api") ?? [])].sort()).toEqual(["sim"]);   // root→engine
    expect(edges.get("brain") ?? new Set()).toEqual(new Set());      // gm imports nothing in-repo
  });
});

describe("domainMapDiagram", () => {
  it("emits an architecture diagram-section with a node per domain and an edge per dep", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const edges = aggregateDomainEdges(CONFIG, inv);
    const diag = domainMapDiagram(CONFIG, edges);
    expect(diag.kind).toBe("architecture");
    expect(diag.d2).toContain("sim -> brain");
    expect(diag.d2).toContain("api -> sim");
    expect(diag.mermaid).toContain("graph");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/gather-atlas.test.ts` → FAIL — functions not exported.

- [ ] **Step 3: Implement both**

Append to `src/gather-atlas.ts` (add the `AtlasConfig` import and `AtlasDiagram` type import at the top):

```ts
import type { AtlasConfig } from "./atlas-config.js";
import { matchGlob } from "./atlas-config.js";
import type { AtlasDiagram } from "./atlas-blocks.js";
import { MERMAID_CLASSDEFS } from "./diagram-colors.js";
```

```ts
/** Resolve each module key to its domain slug (first matching glob wins). */
function moduleDomainIndex(config: AtlasConfig): Map<string, string> {
  const index = new Map<string, string>();
  for (const d of config.domains) for (const m of d.modules) index.set(moduleKey(m), d.slug);
  return index;
}

/** Aggregate module→module import edges up to cross-domain slug→slug edges (intra-domain dropped). */
export function aggregateDomainEdges(config: AtlasConfig, inv: Inventory): Map<string, Set<string>> {
  const dom = moduleDomainIndex(config);
  const edges = new Map<string, Set<string>>();
  for (const d of config.domains) edges.set(d.slug, new Set());
  for (const m of inv.modules) {
    const from = dom.get(moduleKey(m.path));
    if (!from) continue;
    for (const imp of m.imports) {
      const to = dom.get(imp);
      if (to && to !== from) edges.get(from)!.add(to);
    }
  }
  return edges;
}

/** Build the mechanical domain-map as an editable architecture diagram-section's diagram. */
export function domainMapDiagram(config: AtlasConfig, edges: Map<string, Set<string>>): AtlasDiagram {
  const slugs = config.domains.map((d) => d.slug);
  const d2 = ["direction: right", ...slugs.map((s) => s),
    ...slugs.flatMap((s) => [...(edges.get(s) ?? [])].sort().map((t) => `${s} -> ${t}`))].join("\n");

  const mid = new Map(slugs.map((s, i) => [s, `n${i}`]));
  const mlines = ["graph LR", ...slugs.map((s) => `  ${mid.get(s)}["${s}"]`),
    ...slugs.flatMap((s) => [...(edges.get(s) ?? [])].sort().map((t) => `  ${mid.get(s)} --> ${mid.get(t)}`))];

  return { id: "map", kind: "architecture", d2, mermaid: mlines.join("\n") };
}
```

> `MERMAID_CLASSDEFS` is imported for parity with `dep-graph.ts` even though the mechanical map marks no node "changed" — it is available if a later task colors the entry domain. (If lint flags the unused import, drop it.)

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run test/gather-atlas.test.ts` → PASS. `npx tsc --noEmit` → clean.

> If the unused `MERMAID_CLASSDEFS` import trips `tsc`/lint, remove that one import line — it is not used by this task's code.

- [ ] **Step 5: Commit**

```bash
git add src/gather-atlas.ts test/gather-atlas.test.ts
git commit -m "feat(atlas): aggregate module edges to domain map (editable architecture diagram)"
```

---

## Task 7: `buildAtlasDraft`

**Files:**
- Modify: `src/gather-atlas.ts`
- Test: `test/gather-atlas.test.ts`

The atlas draft is an `AtlasDoc`-shaped object (matching `bin/atlas.ts`'s `AtlasDoc`): `{ kind: "atlas", title, ..., blocks }`.

- [ ] **Step 1: Write the failing test**

Append to `test/gather-atlas.test.ts`:

```ts
import { buildAtlasDraft } from "../src/gather-atlas.js";

describe("buildAtlasDraft", () => {
  it("emits tldr + domain-map diagram-section + domain-index with a tile per domain", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const edges = aggregateDomainEdges(CONFIG, inv);
    const draft = buildAtlasDraft(CONFIG, inv, edges, { date: "2026-06-20" });

    expect(draft.kind).toBe("atlas");
    expect(draft.date).toBe("2026-06-20");
    expect(draft.count).toBe("3 domains");
    const types = draft.blocks.map((b) => b.type);
    expect(types).toEqual(["atlas-tldr", "diagram-section", "domain-index"]);

    const index = draft.blocks.find((b) => b.type === "domain-index") as any;
    expect(index.tiles.map((t: any) => t.name)).toEqual(["sim", "brain", "api"]);
    const sim = index.tiles.find((t: any) => t.name === "sim");
    expect(sim.href).toBe("domain-sim.html");
    expect(sim.deps).toEqual(["brain"]);
    expect(sim.meta[0]).toEqual({ key: "~2", value: "files" });
    expect(sim.purpose).toBe(""); // placeholder for the agent
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/gather-atlas.test.ts` → FAIL — `buildAtlasDraft` not exported.

- [ ] **Step 3: Implement `buildAtlasDraft`**

Append to `src/gather-atlas.ts` (add imports for the block/doc types):

```ts
import type { AtlasBlock, DomainTile } from "./atlas-blocks.js";

/** Serializable atlas-page document (matches bin/atlas.ts's AtlasDoc). */
export interface AtlasDraft {
  kind: "atlas"; title: string; stack?: string; count?: string; date?: string;
  generator: string; blocks: AtlasBlock[];
}
/** Serializable domain-page document (matches bin/atlas.ts's DomainDoc). */
export interface DomainDraft {
  kind: "domain"; slug: string; title: string;
  layer: DomainTile["layer"]; layerLabel: string;
  path?: string; count?: string; depends?: string; date?: string;
  generator: string; blocks: AtlasBlock[];
}

const GENERATOR = "visual-skills · visual-atlas";

/** Common directory prefix of a domain's modules, e.g. "lib/sim". Falls back to the slug. */
function commonPath(modules: string[], slug: string): string {
  if (modules.length === 0) return slug;
  const split = modules.map((m) => m.split("/"));
  const first = split[0];
  let i = 0;
  for (; i < first.length - 1; i++) if (!split.every((p) => p[i] === first[i])) break;
  return first.slice(0, i).join("/") || slug;
}

export function buildAtlasDraft(
  config: AtlasConfig,
  inv: Inventory,
  edges: Map<string, Set<string>>,
  opts: { date?: string } = {},
): AtlasDraft {
  const tiles: DomainTile[] = config.domains.map((d) => ({
    name: d.slug,
    path: commonPath(d.modules, d.slug),
    layer: "engine",
    layerLabel: "Engine",
    purpose: "",                                   // agent fills
    meta: [{ key: `~${d.modules.length}`, value: "files" }],
    deps: [...(edges.get(d.slug) ?? [])].sort(),
    href: `domain-${d.slug}.html`,
  }));

  const blocks: AtlasBlock[] = [
    {
      type: "atlas-tldr", id: "tldr", heading: config.repo,
      rows: [{ key: "Domains", value: String(config.domains.length) }],
      primer: [],
    },
    { type: "diagram-section", id: "map", title: "Domain map", diagram: domainMapDiagram(config, edges) },
    { type: "domain-index", id: "domains", title: "Domains", tiles },
  ];

  return {
    kind: "atlas", title: `System Atlas · ${config.repo}`,
    count: `${config.domains.length} domains`, date: opts.date, generator: GENERATOR, blocks,
  };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run test/gather-atlas.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/gather-atlas.ts test/gather-atlas.test.ts
git commit -m "feat(atlas): buildAtlasDraft — tldr + domain map + tile index skeleton"
```

---

## Task 8: `buildDomainDraft`

**Files:**
- Modify: `src/gather-atlas.ts`
- Test: `test/gather-atlas.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/gather-atlas.test.ts`:

```ts
import { buildDomainDraft } from "../src/gather-atlas.js";

describe("buildDomainDraft", () => {
  it("emits tldr + components + arch diagram-section + depth + owns + seams for a domain", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const edges = aggregateDomainEdges(CONFIG, inv);
    const draft = buildDomainDraft("sim", CONFIG, inv, edges, { date: "2026-06-20" });

    expect(draft.kind).toBe("domain");
    expect(draft.slug).toBe("sim");
    expect(draft.path).toBe("lib/sim");
    expect(draft.depends).toBe("brain");
    expect(draft.blocks.map((b) => b.type)).toEqual(
      ["domain-tldr", "components", "diagram-section", "depth", "seams"],
    );

    // sim has loose files directly under lib/sim → one component named after the domain.
    const depth = draft.blocks.find((b) => b.type === "depth") as any;
    expect(depth.components.map((c: any) => c.name)).toEqual(["sim"]);
    expect(depth.components[0].exports.map((e: any) => e.name).sort())
      .toEqual(["SimResult", "runSeason", "simulateGame"].sort());

    const seams = draft.blocks.find((b) => b.type === "seams") as any;
    expect(seams.depends.map((x: any) => x.name)).toEqual(["brain"]);
    expect(seams.depends[0].href).toBe("domain-brain.html");
  });

  it("never emits an owns block; throws on an unknown slug", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const edges = aggregateDomainEdges(CONFIG, inv);
    const draft = buildDomainDraft("sim", CONFIG, inv, edges);
    expect(draft.blocks.some((b) => b.type === "owns")).toBe(false);
    expect(() => buildDomainDraft("nope", CONFIG, inv, edges)).toThrow(/unknown domain/);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/gather-atlas.test.ts` → FAIL — `buildDomainDraft` not exported.

- [ ] **Step 3: Implement `buildDomainDraft`**

Append to `src/gather-atlas.ts` (extend the `atlas-blocks` type import with `ComponentCard`, `ComponentDeep`, `KV`):

```ts
/** Group a domain's modules by their immediate subdirectory under the common path.
 *  Loose files directly under the path collapse into one group named after the slug. */
function groupBySubdir(modules: string[], base: string, slug: string): { name: string; files: string[] }[] {
  const prefix = base.endsWith("/") ? base : base + "/";
  const groups = new Map<string, string[]>();
  for (const m of modules) {
    const rest = m.startsWith(prefix) ? m.slice(prefix.length) : m;
    const slash = rest.indexOf("/");
    const name = slash < 0 ? slug : rest.slice(0, slash);
    (groups.get(name) ?? groups.set(name, []).get(name)!).push(m);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, files]) => ({ name, files }));
}

export function buildDomainDraft(
  slug: string,
  config: AtlasConfig,
  inv: Inventory,
  edges: Map<string, Set<string>>,
  opts: { date?: string } = {},
): DomainDraft {
  const domain = config.domains.find((d) => d.slug === slug);
  if (!domain) throw new Error(`unknown domain "${slug}"`);
  const base = commonPath(domain.modules, slug);
  const byKey = new Map(inv.modules.map((m) => [moduleKey(m.path), m]));
  const groups = groupBySubdir(domain.modules, base, slug);

  const cards: ComponentCard[] = groups.map((g) => ({
    name: g.name, purpose: "", href: `#c-${g.name}`,
  }));

  const components: ComponentDeep[] = groups.map((g) => {
    const exports = g.files
      .flatMap((f) => (byKey.get(moduleKey(f))?.exports ?? []).map((name) => ({ name, desc: "" })));
    const files: KV[] = g.files.map((f) => ({ name: f.replace(base.endsWith("/") ? base : base + "/", ""), desc: "" }));
    return { id: `c-${g.name}`, name: g.name, path: g.files.length === 1 ? g.files[0] : `${base}/${g.name}`,
      detail: [""], files, exports, connections: [] };
  });

  const deps = [...(edges.get(slug) ?? [])].sort();
  const exposes = domain.modules
    .filter((m) => byKey.get(moduleKey(m))?.isRouter)
    .map((m) => ({ api: m, note: "" }));

  const blocks: AtlasBlock[] = [
    { type: "domain-tldr", id: "tldr", heading: domain.name, rows: [
      { key: "Path", value: base }, { key: "Files", value: String(domain.modules.length) },
    ] },
    { type: "components", id: "components", title: "Components", cards },
    { type: "diagram-section", id: "arch", title: "Internal architecture",
      diagram: { id: "arch-diagram", kind: "architecture",
        d2: ["direction: right", ...groups.map((g) => g.name)].join("\n"),
        mermaid: ["graph LR", ...groups.map((g, i) => `  a${i}["${g.name}"]`)].join("\n") } },
    { type: "depth", id: "depth", title: "In depth", components },
    { type: "seams", id: "seams", title: "Seams", exposes,
      depends: deps.map((s) => ({ name: s, path: commonPath(config.domains.find((d) => d.slug === s)!.modules, s), href: `domain-${s}.html` })) },
  ];

  return {
    kind: "domain", slug, title: domain.name, layer: "engine", layerLabel: "Engine",
    path: base, count: `${domain.modules.length} files`,
    depends: deps.join(" · ") || undefined, date: opts.date, generator: GENERATOR, blocks,
  };
}
```

> **No `owns` block (deliberate).** Model→domain attribution is a judgment call the mechanical scanner can't make reliably (a model named `Team` may be owned by any domain), so — like `purpose` and connection prose — it is deferred to agent enrichment. `inv.models` is still scanned (used by the future lint floor and available to the agent); it just doesn't drive a draft block. This is why the test asserts the block order has no `owns`.

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run test/gather-atlas.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/gather-atlas.ts test/gather-atlas.test.ts
git commit -m "feat(atlas): buildDomainDraft — components + depth + seams skeleton"
```

---

## Task 9: CLI `--repo` full-scan mode

**Files:**
- Modify: `bin/atlas.ts`
- Test: `test/atlas-cli.test.ts`

Full scan: read/create `atlas.domains.json`, reconcile, write config back, write draft `atlas.json` + each `domain-<slug>.json` **only when absent** (D1), render every present JSON via the existing `renderFile`, print the drift report.

- [ ] **Step 1: Write the failing test**

Append to `test/atlas-cli.test.ts` (mirror the existing tests' temp-dir + `execFileSync`/`tsx` harness already in that file):

```ts
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

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
});
```

> If `test/atlas-cli.test.ts` does not already expose a `runCli` helper, add a small one that shells `bin/atlas.ts` via `tsx` (copy the invocation the existing render-only tests use) and asserts exit code 0.

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/atlas-cli.test.ts` → FAIL (`--repo` not handled; nothing written).

- [ ] **Step 3: Implement the `--repo` branch**

In `bin/atlas.ts`:

1. Add imports:

```ts
import { readFile as fsReadFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { scanInventory, aggregateDomainEdges, buildAtlasDraft, buildDomainDraft } from "../src/gather-atlas.js";
import { firstGuessConfig, reconcile, type AtlasConfig } from "../src/atlas-config.js";
```

2. Add `repo`, `domain`, `force` to `parseArgs` options:

```ts
const { values } = parseArgs({ options: {
  blocks: { type: "string" }, all: { type: "string" }, out: { type: "string" },
  repo: { type: "string" }, domain: { type: "string" }, force: { type: "boolean" },
} });
```

3. Add a helper and the full-scan branch (before the existing `--all`/`--blocks` branches; `--repo` takes precedence):

```ts
const today = () => new Date().toISOString().slice(0, 10);

async function loadOrGuessConfig(repoRoot: string, outDir: string): Promise<AtlasConfig> {
  const cfgPath = join(outDir, "atlas.domains.json");
  if (existsSync(cfgPath)) return JSON.parse(await fsReadFile(cfgPath, "utf8")) as AtlasConfig;
  const inv = await scanInventory(repoRoot, ["src", "lib"]);
  const repoName = basename(repoRoot);
  return firstGuessConfig(repoName, ["src", "lib"], inv.modules.map((m) => m.path));
}

function printDrift(drift: { newModules: string[]; stalePaths: { slug: string; path: string }[]; emptyDomains: string[] }) {
  if (drift.newModules.length) console.warn(`⚠ ${drift.newModules.length} unassigned module(s): ${drift.newModules.slice(0, 8).join(", ")}${drift.newModules.length > 8 ? " …" : ""}`);
  for (const s of drift.stalePaths) console.warn(`⚠ stale path in "${s.slug}": ${s.path}`);
  for (const d of drift.emptyDomains) console.warn(`⚠ domain "${d}" resolves to zero modules`);
}

async function writeDraftIfAbsent(outDir: string, name: string, doc: unknown, force: boolean): Promise<boolean> {
  const path = join(outDir, name);
  if (existsSync(path) && !force) return false;
  await writeFile(path, JSON.stringify(doc, null, 2));
  return true;
}
```

```ts
if (values.repo) {
  if (!isAbsolute(values.repo)) { console.error("--repo must be an absolute path"); process.exit(2); }
  await mkdir(outDir, { recursive: true });
  const config0 = await loadOrGuessConfig(values.repo, outDir);
  const inv = await scanInventory(values.repo, config0.srcRoots);
  const { config, drift } = reconcile(config0, inv.modules.map((m) => m.path));
  await writeFile(join(outDir, "atlas.domains.json"), JSON.stringify(config, null, 2));

  const edges = aggregateDomainEdges(config, inv);
  const date = today();
  let wrote = 0;
  if (await writeDraftIfAbsent(outDir, "atlas.json", buildAtlasDraft(config, inv, edges, { date }), !!values.force)) wrote++;
  for (const d of config.domains)
    if (await writeDraftIfAbsent(outDir, `domain-${d.slug}.json`, buildDomainDraft(d.slug, config, inv, edges, { date }), !!values.force)) wrote++;
  console.log(`scanned ${inv.modules.length} module(s) → ${config.domains.length} domain(s); wrote ${wrote} new draft(s)`);
  printDrift(drift);

  // render every present JSON (reuses --all behavior)
  const entries = (await readdir(outDir)).filter((f) => f === "atlas.json" || (f.startsWith("domain-") && f.endsWith(".json")));
  entries.sort((a, b) => (a === "atlas.json" ? -1 : b === "atlas.json" ? 1 : a.localeCompare(b)));
  for (const f of entries) {
    const { outName, warnings } = await renderFile(join(outDir, f), outDir);
    console.log(`wrote ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
  }
} else if (values.all) {
  // ... existing branch unchanged ...
```

> Keep the existing `--all` and `--blocks` branches exactly as they are, after the new `--repo` branch.

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run test/atlas-cli.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add bin/atlas.ts test/atlas-cli.test.ts
git commit -m "feat(atlas): --repo full-scan mode (config + drift + draft-when-absent + render)"
```

---

## Task 10: CLI `--domain` single-domain mode

**Files:**
- Modify: `bin/atlas.ts`
- Test: `test/atlas-cli.test.ts`

Single-domain: requires an existing `atlas.domains.json`; rescans only that domain's modules; regenerates `domain-<slug>.json` (overwrites — a single-domain run IS a regenerate) and re-renders that one page. Per the spec's resolved note, the atlas tile refresh is reported, not edited in place (the `domain-map` is not recomputed).

- [ ] **Step 1: Write the failing test**

Append to `test/atlas-cli.test.ts`:

```ts
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
});

it("--domain errors clearly without a config", () => {
  const repo = join(__dirname, "fixtures", "atlas-repo");
  const out = mkdtempSync(join(tmpdir(), "atlas-dom2-"));
  try {
    expect(() => runCli(["--repo", repo, "--domain", "sim", "--out", out])).toThrow();
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/atlas-cli.test.ts` → FAIL (`--domain` ignored; full scan runs instead).

- [ ] **Step 3: Implement the `--domain` short-circuit inside the `--repo` branch**

At the TOP of the `if (values.repo) { ... }` branch, before `loadOrGuessConfig`, add:

```ts
if (values.domain) {
  const cfgPath = join(outDir, "atlas.domains.json");
  if (!existsSync(cfgPath)) { console.error(`--domain needs an existing ${cfgPath} (run a full scan first)`); process.exit(2); }
  const config = JSON.parse(await fsReadFile(cfgPath, "utf8")) as AtlasConfig;
  const domain = config.domains.find((d) => d.slug === values.domain);
  if (!domain) { console.error(`unknown domain "${values.domain}" — not in atlas.domains.json`); process.exit(2); }
  const inv = await scanInventory(values.repo, config.srcRoots);
  const { drift } = reconcile(config, inv.modules.map((m) => m.path));
  const edges = aggregateDomainEdges(config, inv);
  await writeFile(join(outDir, `domain-${domain.slug}.json`),
    JSON.stringify(buildDomainDraft(domain.slug, config, inv, edges, { date: today() }), null, 2));
  const { outName, warnings } = await renderFile(join(outDir, `domain-${domain.slug}.json`), outDir);
  console.log(`refreshed ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
  // tile-only note (do not recompute the atlas map; see spec "Resolved during review")
  console.log(`note: atlas tile for "${domain.slug}" — ${domain.modules.length} files, deps: ${[...(edges.get(domain.slug) ?? [])].sort().join(", ") || "none"} (update atlas.json's tile if changed)`);
  printDrift(drift);
  return; // end main()
}
```

> Because `--domain` lives inside the `--repo` branch, both `--repo` and `--domain` must be passed together. Document this in the usage string. (Per the spec's CLI table, single-domain is `atlas --repo X --domain billing --out DIR`.)

> If `main()` is not easily `return`-able from inside the branch, wrap the single-domain logic so the rest of the `--repo` branch is skipped (e.g. an early `return` from `main`, or an `else`).

- [ ] **Step 4: Update the usage error string**

Change the final `else` usage message to include the new modes:

```ts
} else { console.error("usage: atlas --repo <abs> [--domain <slug>] [--force] --out <abs> | --all <dir> --out <abs> | --blocks <file> --out <abs>"); process.exit(2); }
```

- [ ] **Step 5: Run it, verify it passes**

Run: `npx vitest run test/atlas-cli.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add bin/atlas.ts test/atlas-cli.test.ts
git commit -m "feat(atlas): --domain single-domain refresh (page-only, reports tile drift)"
```

---

## Task 11: Full-suite green + scanner README note

**Files:**
- Modify: `bin/atlas.ts` (header comment) and/or `README` if the repo documents CLI modes there.

- [ ] **Step 1: Run the entire suite**

Run: `npx vitest run` → all green (the Phase-2 235 + the new tests). `npx tsc --noEmit` → clean.

- [ ] **Step 2: Update the CLI header comment in `bin/atlas.ts`**

Replace the top comment block to document all four modes:

```ts
// visual-atlas CLI.
//   atlas --repo <ABS> --out <ABS dir>              # full scan: config + drift + draft-when-absent + render
//   atlas --repo <ABS> --domain <slug> --out <DIR>  # single domain: rescan + regenerate that page
//   atlas --all <ABS dir> --out <ABS dir>           # render every committed atlas.json + domain-*.json
//   atlas --blocks <ABS file.json> --out <ABS dir>  # render one committed page
// Add --force to overwrite existing draft JSON (default: never clobber authored prose).
```

- [ ] **Step 3: Commit**

```bash
git add bin/atlas.ts
git commit -m "docs(atlas): document the four CLI modes in the bin header"
```

---

## Self-review (run before dispatch)

- **Spec coverage:** scanner (`gather-atlas.ts`) ✓ Task 5–8; `atlas.domains.json` + first-guess ✓ Task 3; drift reconciliation ✓ Task 4; full mode ✓ Task 9; single-domain mode ✓ Task 10; domain-level edge aggregation for the domain map ✓ Task 6; reuse of `trpc-parse`/`prisma-schema`/`imports`/`dep-graph` ✓ Tasks 1,2,5. Deferred-by-decision: in-place block merge (D1, draft-only-when-absent instead); model→domain `owns` attribution (Task 8 note); tile in-place refresh (reported, per spec "Resolved during review").
- **Type consistency:** `AtlasDraft`/`DomainDraft` mirror `bin/atlas.ts`'s `AtlasDoc`/`DomainDoc`; tiles use `DomainTile`; blocks use `AtlasBlock`. `reconcile`/`firstGuessConfig`/`scanInventory`/`aggregateDomainEdges`/`buildAtlasDraft`/`buildDomainDraft` names are stable across tasks.
- **Out of scope (Phase 4):** `lint-atlas.ts`, `skills/shared/atlas-components.md`, `skills/visual-atlas/SKILL.md`, `scripts/install-skills.ts` registration, blind dogfood.
```

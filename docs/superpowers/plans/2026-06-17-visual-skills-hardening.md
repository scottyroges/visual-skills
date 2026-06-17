# Visual Skills — Hardening Phase (fast-follows #1 + #2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make tRPC auth detection work for custom procedure builders, and make recap rendering degrade gracefully (warn + placeholder) instead of crashing on a single malformed diagram/router/schema.

**Architecture:** Two independent hardenings on the existing M0+M1 pipeline. (1) Generalize `trpc-parse` to read any `<x>Procedure` builder and widen `ApiProcedure.auth` to `string`. (2) Add an optional `onWarn` to the `StackAdapter` methods and wrap the diagram floor + adapter calls + per-router parse in try/catch.

**Tech Stack:** Existing — TypeScript via tsx, vitest, the `d2` binary.

---

## Task H1: Custom tRPC procedure builder auth

**Files:**
- Modify: `src/blocks.ts` (widen `ApiProcedure.auth`)
- Modify: `src/trpc-parse.ts` (generic builder detection)
- Modify: `test/trpc-parse.test.ts` (add custom-builder case)

- [ ] **Step 1: Widen the auth type in `src/blocks.ts`**

Change the `ApiProcedure` interface's `auth` field from the union to `string`:
```ts
export interface ApiProcedure {
  name: string;          // e.g. "league.captureOrder"
  auth: string;          // procedure-builder label: "public" | "protected" | "admin" | ... | "unknown"
  kind: "query" | "mutation" | "subscription" | "unknown";
  input: string;         // source text of the .input(...) argument, or "" if none
  change?: "added" | "removed" | "changed";
}
```

- [ ] **Step 2: Add a failing test case to `test/trpc-parse.test.ts`**

Add this `it` block inside the existing `describe("parseRouter", ...)`:
```ts
  it("derives auth from any <x>Procedure builder", () => {
    const src = `
import { router, publicProcedure, adminProcedure } from "@/server/trpc";
export const adminRouter = router({
  list: adminProcedure.query(() => svc.list()),
  ping: publicProcedure.query(() => "pong"),
});
`;
    const byName = Object.fromEntries(parseRouter(src, "admin").map((p) => [p.name, p]));
    expect(byName["admin.list"].auth).toBe("admin");
    expect(byName["admin.ping"].auth).toBe("public");
  });
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `cd /Users/scottrogener/Projects/visual-skills && npx vitest run test/trpc-parse.test.ts`
Expected: the new case FAILS (`admin.list` auth is `"unknown"`, expected `"admin"`).

- [ ] **Step 4: Generalize builder detection in `src/trpc-parse.ts`**

In the `walk` function, replace the identifier branch that only recognizes `publicProcedure`/`protectedProcedure` with a generic `<x>Procedure` match:
```ts
      } else if (ts.isIdentifier(expr)) {
        const m = expr.text.match(/^(.+)Procedure$/);
        if (m) auth = m[1];
      }
```
(So `publicProcedure → "public"`, `protectedProcedure → "protected"`, `adminProcedure → "admin"`. Identifiers not ending in `Procedure` leave `auth` at its `"unknown"` default.)

- [ ] **Step 5: Run the trpc-parse tests to confirm pass**

Run: `npx vitest run test/trpc-parse.test.ts`
Expected: all cases PASS (the original public/protected assertions still hold; the new admin case passes).

- [ ] **Step 6: Confirm tsc is clean across the project**

Run: `npx tsc --noEmit`
Expected: no errors. (The auth widening must not break `api-diff.ts`, `api.ts`, adapters, or their tests — all treat auth as an opaque string.)

- [ ] **Step 7: Verify against the real ppgl admin router**

Run:
```bash
npx tsx -e "
import { readFileSync } from 'node:fs';
import { parseRouter } from './src/trpc-parse.ts';
const src = readFileSync('/Users/scottrogener/Projects/ppgl/src/server/routers/admin.ts','utf8');
const procs = parseRouter(src,'admin');
const auths = [...new Set(procs.map(p=>p.auth))];
console.log('admin procs:', procs.length, 'distinct auth labels:', auths, 'unknown count:', procs.filter(p=>p.auth==='unknown').length);
"
```
Expected: ~35 procs, auth labels include `"admin"`, and `unknown count: 0` (previously 35).

- [ ] **Step 8: Run the full suite, then commit**

Run: `npx vitest run`
Expected: all pass.
```bash
git add src/blocks.ts src/trpc-parse.ts test/trpc-parse.test.ts
git commit -m "feat: derive tRPC auth from any <x>Procedure builder

Recognizes adminProcedure and other custom builders instead of
collapsing them to unknown. Widens ApiProcedure.auth to string.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task H2: Graceful diagram degradation

**Files:**
- Modify: `src/render-diagram.ts` (catch D2 failure → placeholder SVG)
- Modify: `test/render-diagram.test.ts` (add malformed-source case)

- [ ] **Step 1: Add a failing test to `test/render-diagram.test.ts`**

Add this `it` block inside the existing describe:
```ts
  it("degrades to a placeholder svg (not a throw) when d2 fails to compile", async () => {
    const warnings: string[] = [];
    const block: DiagramBlock = {
      type: "diagram", id: "broken", title: "Broken", kind: "flowchart",
      d2: "x: {",   // unclosed block — d2 fails to compile
    };
    const out = await renderDiagram(block, { excalidraw: false, onWarn: (m) => warnings.push(m) });
    expect(out.renderer).toBe("d2");
    expect(out.editable).toBeNull();
    expect(out.svg).toMatch(/<svg/);
    expect(out.svg.toLowerCase()).toContain("failed to render");
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  }, 30_000);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd /Users/scottrogener/Projects/visual-skills && npx vitest run test/render-diagram.test.ts`
Expected: the new case FAILS — `renderDiagram` currently rejects (the unguarded `renderViaD2` throws) rather than returning a placeholder.

(If `d2` happens to accept `"x: {"`, change the source in the test to `"x ->"` or another source you confirm makes `d2` exit non-zero — verify by running `printf 'x: {' | d2 - -` and checking it errors. Use a source that reliably fails.)

- [ ] **Step 3: Guard the D2 floor in `src/render-diagram.ts`**

Add a placeholder helper near the top of the module (after the imports/constants):
```ts
/** A minimal valid SVG shown when a diagram fails to render — keeps the document unbroken. */
function placeholderSvg(title: string, message: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="80" role="img">` +
    `<rect width="420" height="80" fill="#fff8c5" stroke="#d4a72c"/>` +
    `<text x="12" y="32" font-family="sans-serif" font-size="13" fill="#9a6700">` +
    `&#9888; ${esc(title)}: failed to render</text>` +
    `<text x="12" y="54" font-family="monospace" font-size="11" fill="#9a6700">${esc(message).slice(0, 70)}</text>` +
    `</svg>`
  );
}
```

In `renderDiagram`, wrap the floor compile so a D2 failure degrades instead of throwing. Replace:
```ts
  // 1. Floor: always compile the D2 sketch SVG. Guaranteed, no browser.
  const d2Svg = await renderViaD2(d2);
```
with:
```ts
  // 1. Floor: compile the D2 sketch SVG. On failure, degrade to a placeholder
  //    (warn + visible error box) so a single bad diagram never breaks the document.
  let d2Svg: string;
  try {
    d2Svg = await renderViaD2(d2);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    opts.onWarn?.(`block "${id}": d2 failed to compile (${message}); using placeholder`);
    return { id, title, svg: placeholderSvg(title, message), editable: null, renderer: "d2" };
  }
```
(Leave the Excalidraw upgrade block and the final D2 return unchanged.)

- [ ] **Step 4: Run the render-diagram tests to confirm pass**

Run: `npx vitest run test/render-diagram.test.ts`
Expected: all cases PASS, including the new degradation case. The pre-existing "throws when a diagram block has no d2 source" case still throws (the missing-`d2` guard is before the compile, so it is unaffected).

- [ ] **Step 5: tsc clean + commit**

Run: `npx tsc --noEmit` (expect clean), then `npx vitest run` (expect all pass).
```bash
git add src/render-diagram.ts test/render-diagram.test.ts
git commit -m "feat: degrade to placeholder svg when d2 compile fails

A single malformed diagram source no longer aborts the whole document;
it renders a visible 'failed to render' box and warns.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task H3: Graceful adapter degradation

**Files:**
- Modify: `src/adapters/stack-adapter.ts` (add `onWarn?` to interface methods)
- Modify: `src/adapters/generic.ts` (match new signatures)
- Modify: `src/adapters/prisma-trpc.ts` (accept `onWarn`; per-router try/catch)
- Modify: `src/gather-recap.ts` (thread `onWarn`; wrap adapter calls in try/catch)
- Modify: `bin/recap.ts` (pass an `onWarn` into `gatherRecap`)
- Test: `test/gather-recap.test.ts` (add a throwing-adapter degradation case)

- [ ] **Step 1: Add `onWarn?` to the `StackAdapter` interface in `src/adapters/stack-adapter.ts`**

Change the interface methods to accept an optional warn callback:
```ts
export interface StackAdapter {
  name: string;
  detect(repoRoot: string): Promise<boolean>;
  schemaDiff(scope: Scope, onWarn?: (msg: string) => void): Promise<SchemaBlock | null>;
  apiDiff(scope: Scope, onWarn?: (msg: string) => void): Promise<ApiBlock[]>;
}
```
(`selectAdapter` is unchanged.)

- [ ] **Step 2: Match the signatures in `src/adapters/generic.ts`**

```ts
import type { StackAdapter } from "./stack-adapter.js";
import type { Scope } from "../git.js";

/** Fallback: no schema/api intelligence — file-tree + raw diff only. */
export class GenericAdapter implements StackAdapter {
  name = "generic";
  async detect(): Promise<boolean> { return true; }
  async schemaDiff(_scope: Scope, _onWarn?: (msg: string) => void) { return null; }
  async apiDiff(_scope: Scope, _onWarn?: (msg: string) => void) { return []; }
}
```

- [ ] **Step 3: Make `apiDiff` resilient per-router in `src/adapters/prisma-trpc.ts`**

Update the method signatures to accept `onWarn`, and wrap each router's parse+diff in try/catch so one bad router is skipped (warned) rather than aborting all api blocks. Replace the `schemaDiff` and `apiDiff` methods with:
```ts
  async schemaDiff(scope: Scope, _onWarn?: (msg: string) => void): Promise<SchemaBlock | null> {
    const before = await fileAtRef(SCHEMA_PATH, scope.baseRef, scope.repoRoot);
    const after = await fileAtRef(SCHEMA_PATH, scope.headRef, scope.repoRoot);
    if (!before && !after) return null;
    const diffs = diffModels(parsePrismaModels(before), parsePrismaModels(after));
    if (!diffs.length) return null;
    return schemaDiffToBlock(diffs);
  }

  async apiDiff(scope: Scope, onWarn?: (msg: string) => void): Promise<ApiBlock[]> {
    const files = await changedFiles(scope.baseRef, scope.headRef, scope.repoRoot);
    const routers = files
      .map((f) => f.path)
      .filter((p) => /src\/server\/routers\/[^/]+\.ts$/.test(p) && !p.endsWith("_app.ts"));

    const blocks: ApiBlock[] = [];
    for (const path of routers) {
      try {
        const routerName = path.split("/").pop()!.replace(/\.ts$/, "");
        const beforeSrc = await fileAtRef(path, scope.baseRef, scope.repoRoot);
        const afterSrc = await fileAtRef(path, scope.headRef, scope.repoRoot);
        const before = beforeSrc ? parseRouter(beforeSrc, routerName) : [];
        const after = afterSrc ? parseRouter(afterSrc, routerName) : [];
        const block = diffProcedures(before, after, `tRPC: ${routerName}`, `api-${routerName}`);
        if (block.procedures.length) blocks.push(block);
      } catch (err) {
        onWarn?.(`api diff skipped for ${path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return blocks;
  }
```

- [ ] **Step 4: Thread `onWarn` + wrap adapter calls in `src/gather-recap.ts`**

Update `buildBlocks` and `gatherRecap` so the adapter calls are guarded. Replace the two functions with:
```ts
/** Compose the ordered block array for a recap. Pure given its inputs. */
export async function buildBlocks(
  scope: Scope,
  files: FileChange[],
  adapter: StackAdapter,
  onWarn?: (msg: string) => void,
): Promise<Block[]> {
  const blocks: Block[] = [];

  const fileTree: FileTreeBlock = { type: "file-tree", id: "files", title: "Files changed", files };
  blocks.push(fileTree);

  const totalAdd = files.reduce((n, f) => n + f.added, 0);
  const totalDel = files.reduce((n, f) => n + f.deleted, 0);
  blocks.push({
    type: "prose", id: "summary",
    markdown: `**${scope.label}** — ${files.length} files, +${totalAdd}/-${totalDel} (stack: ${adapter.name}).`,
  });

  try {
    const schema = await adapter.schemaDiff(scope, onWarn);
    if (schema) blocks.push(schema);
  } catch (err) {
    onWarn?.(`schema diff skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    for (const api of await adapter.apiDiff(scope, onWarn)) blocks.push(api);
  } catch (err) {
    onWarn?.(`api diff skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  for (const diff of parseUnifiedDiff(scope.unifiedDiff)) blocks.push(diff);

  return blocks;
}

/** Top-level: resolve a target into a full recap block array. */
export async function gatherRecap(
  target: Target,
  repoRoot: string,
  onWarn?: (msg: string) => void,
): Promise<{ scope: Scope; blocks: Block[]; adapter: string }> {
  const scope = await resolveScope(target, { repoRoot });
  const files = await changedFiles(scope.baseRef, scope.headRef, repoRoot);
  const adapter = await selectAdapter(repoRoot, [new PrismaTrpcAdapter()]);
  const blocks = await buildBlocks(scope, files, adapter, onWarn);
  return { scope, blocks, adapter: adapter.name };
}
```

- [ ] **Step 5: Pass `onWarn` from the CLI in `bin/recap.ts`**

Change the `gatherRecap` call to forward a warn callback:
```ts
  const { scope, blocks, adapter } = await gatherRecap(parseTarget(values), repoRoot, (m) => console.warn(m));
```
(Leave the rest of `bin/recap.ts` unchanged.)

- [ ] **Step 6: Add a degradation test to `test/gather-recap.test.ts`**

Add this `it` block (it uses a stub adapter whose schema/api throw, asserting the recap still builds with file-tree + diff and the warnings fire):
```ts
  it("degrades to file-tree + diff when the adapter throws (warns, no crash)", async () => {
    const warnings: string[] = [];
    const throwingAdapter = {
      name: "broken",
      async detect() { return true; },
      async schemaDiff() { throw new Error("boom-schema"); },
      async apiDiff() { throw new Error("boom-api"); },
    };
    const files = [{ path: "foo.ts", status: "M" as const, added: 1, deleted: 1 }];
    const blocks = await buildBlocks(scope, files, throwingAdapter, (m) => warnings.push(m));
    const types = blocks.map((b) => b.type);
    expect(types).toContain("file-tree");
    expect(types).toContain("diff");
    expect(types).not.toContain("schema");
    expect(types).not.toContain("api");
    expect(warnings.some((w) => w.includes("boom-schema"))).toBe(true);
    expect(warnings.some((w) => w.includes("boom-api"))).toBe(true);
  });
```

- [ ] **Step 7: Run gather-recap tests + tsc**

Run: `cd /Users/scottrogener/Projects/visual-skills && npx vitest run test/gather-recap.test.ts && npx tsc --noEmit`
Expected: both the original and new cases PASS; tsc clean.

- [ ] **Step 8: Full suite + commit**

Run: `npx vitest run` (expect all pass).
```bash
git add src/adapters/stack-adapter.ts src/adapters/generic.ts src/adapters/prisma-trpc.ts src/gather-recap.ts bin/recap.ts test/gather-recap.test.ts
git commit -m "feat: degrade recap gracefully when an adapter/router fails

Threads onWarn through StackAdapter; one bad router/schema warns and is
skipped instead of aborting the whole recap (falls back to file-tree + diffs).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task H4: Sweep + re-verify ppgl #183 unchanged

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck**

Run: `cd /Users/scottrogener/Projects/visual-skills && npx vitest run && npx tsc --noEmit`
Expected: all tests pass; tsc clean. Report totals.

- [ ] **Step 2: Re-verify ppgl #183 recap is unchanged for valid input**

Run:
```bash
npx tsx bin/recap.ts --repo /Users/scottrogener/Projects/ppgl --commit 3559f61 --out /tmp/recap-hardened.html
echo "scripts: $(grep -o '<script' /tmp/recap-hardened.html | wc -l | tr -d ' ')"
echo "diff blocks: $(grep -o 'vs-block vs-diff' /tmp/recap-hardened.html | wc -l | tr -d ' ')"
echo "captureOrder added: $(grep -o 'data-change=\"added\"' /tmp/recap-hardened.html | wc -l | tr -d ' ')"
echo "paymentSessionId: $(grep -o 'paymentSessionId' /tmp/recap-hardened.html | wc -l | tr -d ' ')"
echo "placeholder leaked: $(grep -o 'failed to render' /tmp/recap-hardened.html | wc -l | tr -d ' ')"
```
Expected: scripts 0; ~23 diff blocks; captureOrder added ≥1; paymentSessionId ≥1; **placeholder leaked 0** (valid input must NOT trigger the degradation path).

- [ ] **Step 3: Confirm working tree clean (no stray /tmp output committed)**

Run: `git status --short` (expect empty).

Report the verification evidence. No commit (verification-only task).

---

## Self-Review Notes
- **Coverage:** #1 → H1 (generic builder + type widen + ppgl admin verify). #2 → H2 (diagram floor degradation) + H3 (adapter/router degradation). Final regression guard → H4.
- **Type consistency:** widening `ApiProcedure.auth` to `string` is consumed only as opaque text by `api-diff.ts` (signature string) and `renderers/api.ts` (escaped text) — no break. `StackAdapter.schemaDiff/apiDiff` gain an optional `onWarn` param; `GenericAdapter`, `PrismaTrpcAdapter`, and `buildBlocks` are all updated together.
- **No behavior change on valid input:** H4 Step 2 explicitly asserts the placeholder never appears for ppgl #183.

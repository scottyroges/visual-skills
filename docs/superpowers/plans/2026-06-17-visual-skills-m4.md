# Visual Skills M4 — Claude Code Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `visual-plan` and `visual-recap` Claude Code skills (version-controlled in the repo, installed globally via symlink) so the tool can be invoked from any repo.

**Architecture:** Two `SKILL.md` files under `skills/` invoke the existing CLIs by absolute repo path; a `scripts/install-skills.ts` symlinks them into `~/.claude/skills/`; a guard test keeps the `visual-plan` skill in sync with the `Block` union.

**Tech Stack:** TypeScript ESM (`tsx`), vitest, Markdown SKILL.md files (`name`/`description` frontmatter + body).

**Commit convention:** Every commit message MUST end with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Spec:** `docs/superpowers/specs/2026-06-17-visual-skills-m4-design.md`

---

## File Structure

- **Create** `scripts/install-skills.ts` — exports a pure `skillLinks(home, repoRoot)` and a `main()` that symlinks each skill dir into `~/.claude/skills/` idempotently.
- **Create** `skills/visual-recap/SKILL.md` — thin wrapper skill: git target → recap CLI → open.
- **Create** `skills/visual-plan/SKILL.md` — structured recipe skill: spec → grounded `Block[]` → plan CLI → open.
- **Create** `test/install-skills.test.ts` — unit-tests `skillLinks`.
- **Create** `test/skill-docs.test.ts` — guards that the visual-plan skill mentions every `Block` type and both skills have valid frontmatter.
- **Modify** `package.json` — add `skills:install` script.
- **Modify** `README.md` — add an "Invoking from Claude Code" section.

The skills hardcode the repo path in one constant per file: `/Users/scottrogener/Projects/visual-skills`.

---

## Task 1: Install script + path-logic test

**Files:**
- Create: `scripts/install-skills.ts`
- Test: `test/install-skills.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `test/install-skills.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { skillLinks } from "../scripts/install-skills.js";

describe("skillLinks", () => {
  it("maps both skill dirs from repo/skills into ~/.claude/skills", () => {
    const links = skillLinks("/home/me", "/repo");
    expect(links).toEqual([
      { source: "/repo/skills/visual-recap", target: "/home/me/.claude/skills/visual-recap" },
      { source: "/repo/skills/visual-plan", target: "/home/me/.claude/skills/visual-plan" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- install-skills`
Expected: FAIL — `Cannot find module '../scripts/install-skills.js'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/install-skills.ts`:

```ts
#!/usr/bin/env tsx
// Symlinks the repo's skill dirs into ~/.claude/skills so Claude Code discovers them
// from any repo. Idempotent: never overwrites a real dir/file or a foreign symlink.
// Run with: npm run skills:install
import { symlink, mkdir, lstat, readlink } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SKILLS = ["visual-recap", "visual-plan"];

export interface SkillLink {
  source: string;
  target: string;
}

/** Pure mapping: each repo skill dir -> its ~/.claude/skills symlink target. */
export function skillLinks(home: string, repoRoot: string): SkillLink[] {
  return SKILLS.map((name) => ({
    source: join(repoRoot, "skills", name),
    target: join(home, ".claude", "skills", name),
  }));
}

async function main(): Promise<void> {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const links = skillLinks(homedir(), repoRoot);
  await mkdir(join(homedir(), ".claude", "skills"), { recursive: true });
  for (const { source, target } of links) {
    const st = await lstat(target).catch(() => null);
    if (st?.isSymbolicLink()) {
      const cur = await readlink(target);
      if (cur === source) console.log(`already linked: ${target}`);
      else console.warn(`skip (symlink points elsewhere): ${target} -> ${cur}`);
      continue;
    }
    if (st) {
      console.warn(`skip (exists, not a symlink): ${target}`);
      continue;
    }
    await symlink(source, target);
    console.log(`linked: ${target} -> ${source}`);
  }
}

// Run main only when executed directly (not when imported by the test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- install-skills`
Expected: PASS (1 test). The test imports only `skillLinks` (pure); `main()` does not run under vitest because `process.argv[1]` is the test runner, not this module.

- [ ] **Step 5: Add the npm script**

In `package.json`, add to the `scripts` object after the `setup:excalidraw` line:

```json
    "skills:install": "tsx scripts/install-skills.ts",
```

(Ensure valid JSON — the preceding line needs a trailing comma.)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/install-skills.ts test/install-skills.test.ts package.json
git commit -m "$(cat <<'EOF'
feat: install-skills script symlinks skill dirs into ~/.claude/skills

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: visual-recap SKILL.md

**Files:**
- Create: `skills/visual-recap/SKILL.md`

- [ ] **Step 1: Create the skill file**

Create `skills/visual-recap/SKILL.md` with exactly this content:

````markdown
---
name: visual-recap
description: Use when the user asks to visualize, render, or "make readable" a pull request, commit, branch, or git diff as a self-contained HTML recap. Produces a hand-drawn-styled HTML document grounded in the real repo — file tree, Prisma schema changes, tRPC API-surface diagram, and syntax-highlighted diffs.
---

# Visual Recap

Turn a git target (PR, commit, branch, or working tree) into a single self-contained,
hand-drawn-styled HTML document and open it.

**Tool location** (edit if the repo moves):

    VISUAL_SKILLS_DIR=/Users/scottrogener/Projects/visual-skills

## Steps

1. **Identify the target repo.** Default to the current working directory. If the user
   names another repo, use its absolute path.

2. **Identify what to recap** and pick the matching flag:
   - a pull request → `--pr <number>` (needs the `gh` CLI)
   - a commit/SHA/tag → `--commit <ref>`
   - a branch → `--branch <name>` (optionally `--base <ref>` to set the comparison base)
   - uncommitted working changes → no target flag

3. **Choose an output path** — default `<target-repo>/.recaps/<short-label>.html` (use an
   absolute path).

4. **Run the recap** from the tool directory so its dependencies resolve:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/recap.ts --repo <ABSOLUTE_TARGET_REPO> <target flag> --out <ABSOLUTE_OUT>

5. **Open it:** `open <ABSOLUTE_OUT>` on macOS, otherwise tell the user the path.

## Fallbacks

- **`--pr` fails / no `gh`:** the CLI prints "PR scope needs the gh CLI". Resolve the PR's
  merge or head commit SHA (e.g. via `gh`, the GitHub UI, or `git log`) and re-run with
  `--commit <sha>` instead.
- **`d2` missing:** the CLI needs `d2` on PATH for diagrams — tell the user to
  `brew install d2`.
- Editable Excalidraw diagrams are an optional upgrade — see the tool's README
  (`npm run setup:excalidraw`). Without it, diagrams render as static D2 sketches.

## Example

Recap of a merged PR by its squash-merge SHA, into the target repo's `.recaps/`:

    cd "$VISUAL_SKILLS_DIR"
    npx tsx bin/recap.ts --repo /Users/me/Projects/ppgl --commit 3559f61 \
      --out /Users/me/Projects/ppgl/.recaps/pr-183.html
    open /Users/me/Projects/ppgl/.recaps/pr-183.html
````

- [ ] **Step 2: Verify the documented command works (smoke test)**

Run the example pattern against the ppgl repo to confirm the skill's instructions are
accurate:

```bash
cd /Users/scottrogener/Projects/visual-skills
npx tsx bin/recap.ts --repo /Users/scottrogener/Projects/ppgl --commit 3559f61 --out /tmp/skill-recap.html && echo "OK $(wc -c < /tmp/skill-recap.html) bytes"
```

Expected: `wrote /tmp/skill-recap.html (adapter: prisma-trpc)` and an `OK <bytes>` line.

- [ ] **Step 3: Commit**

```bash
git add skills/visual-recap/SKILL.md
git commit -m "$(cat <<'EOF'
feat: visual-recap Claude Code skill

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: visual-plan SKILL.md

**Files:**
- Create: `skills/visual-plan/SKILL.md`

- [ ] **Step 1: Create the skill file**

Create `skills/visual-plan/SKILL.md` with exactly this content:

````markdown
---
name: visual-plan
description: Use when the user asks to turn a spec, plan, or design markdown into a self-contained, visually readable HTML document grounded in the real codebase — with diagrams, a file tree, annotated code, and open questions.
---

# Visual Plan

Turn a spec/plan into a single self-contained, hand-drawn-styled HTML document by authoring
a typed block array and rendering it. Unlike the recap (which is automatic), you compose the
blocks — so ground every reference in the real repo.

**Tool location** (edit if the repo moves):

    VISUAL_SKILLS_DIR=/Users/scottrogener/Projects/visual-skills

## Steps

1. **Read the source** spec/plan (the file the user names, or the plan already in context).
2. **Read the authoritative schema:** `$VISUAL_SKILLS_DIR/src/blocks.ts`. It defines the
   `Block` union — treat it as the source of truth for field names and shapes.
3. **Ground it in the real repo:** use real file paths, Prisma model names, and tRPC
   router/procedure names from the target codebase. Do not invent identifiers.
4. **Author a `Block[]` JSON array** using the mapping below.
5. **Render it** from the tool directory:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/plan.ts --blocks <ABSOLUTE_BLOCKS_JSON> --title "<Title>" \
         --source "<source path or label>" --out <ABSOLUTE_OUT>

6. **Open it:** `open <ABSOLUTE_OUT>` (macOS), else report the path.

## Content → block mapping

Primary blocks you author for plans:

- **narrative / sections → `prose`** (Markdown; GitHub-flavored). A ` ```mermaid ` fenced
  flowchart inside prose is auto-promoted to a diagram (and becomes editable if the
  Excalidraw upgrade is installed).

      { "type": "prose", "id": "overview", "markdown": "## Overview\n\nWhat & why..." }

- **architecture / flow → `diagram`** — `d2` is required (the rendering floor); add
  `mermaid` for the editable upgrade on `flowchart`/`architecture` kinds. Quote any d2
  key/value containing a dot or space.

      { "type": "diagram", "id": "flow", "title": "Request flow", "kind": "flowchart",
        "d2": "direction: down\n\"client\" -> \"api\" -> \"db\"",
        "mermaid": "graph TD\nclient-->api-->db" }

- **affected / new files → `file-tree`** — `status` is one of `A`/`M`/`D`/`R`.

      { "type": "file-tree", "id": "files", "title": "Files", "files": [
        { "path": "src/server/routers/league.ts", "status": "M", "added": 20, "deleted": 4 } ] }

- **key code to explain → `annotated-code`** — per-line notes; use for the 2–3 most
  important snippets, not everything. `line` is 1-based.

      { "type": "annotated-code", "id": "capture", "title": "captureOrder", "lang": "ts",
        "code": "const order = await paypal.capture(id);\nreturn order;",
        "annotations": [ { "line": 1, "note": "server-side capture" } ] }

- **open decisions → `questions`**

      { "type": "questions", "id": "open", "title": "Open questions", "questions": [
        { "question": "Refund window?", "recommendedDefault": "30 days" } ] }

Other block types in the `Block` union — `schema`, `api`, `diff` — are normally produced
automatically by the **visual-recap** flow from a real git diff, not hand-authored. Reach
for visual-recap when the subject is a code change rather than a plan.

## Notes

- Block `id`s must be unique across the document.
- Keep d2 valid: quote keys/values with dots (e.g. `"league.captureOrder"`). If d2 fails to
  compile, that block renders a visible placeholder rather than breaking the document.
- `d2` must be on PATH (`brew install d2`).

## Example

    cd "$VISUAL_SKILLS_DIR"
    npx tsx bin/plan.ts --blocks /tmp/plan-blocks.json --title "Payments migration" \
      --source docs/specs/payments.md --out /tmp/payments-plan.html
    open /tmp/payments-plan.html
````

- [ ] **Step 2: Verify the documented command works (smoke test)**

Author a tiny block array covering several block types and render it, to confirm the skill's
instructions are accurate:

```bash
cat > /tmp/skill-plan-blocks.json <<'EOF'
[
  { "type": "prose", "id": "overview", "markdown": "## Overview\n\nMigrate payments.\n\n```mermaid\ngraph TD\nclient-->api-->db\n```" },
  { "type": "file-tree", "id": "files", "title": "Files", "files": [ { "path": "src/pay.ts", "status": "M", "added": 10, "deleted": 2 } ] },
  { "type": "annotated-code", "id": "snip", "title": "capture", "lang": "ts", "code": "const o = await pay(id);\nreturn o;", "annotations": [ { "line": 1, "note": "capture" } ] },
  { "type": "questions", "id": "open", "title": "Open", "questions": [ { "question": "Refund window?", "recommendedDefault": "30 days" } ] }
]
EOF
cd /Users/scottrogener/Projects/visual-skills
npx tsx bin/plan.ts --blocks /tmp/skill-plan-blocks.json --title "Skill smoke" --out /tmp/skill-plan.html && grep -c "failed to render" /tmp/skill-plan.html
```

Expected: `wrote /tmp/skill-plan.html` and a final line `0` (no placeholder — the mermaid fence promoted and compiled, all blocks rendered).

- [ ] **Step 3: Commit**

```bash
git add skills/visual-plan/SKILL.md
git commit -m "$(cat <<'EOF'
feat: visual-plan Claude Code skill (structured block recipe)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Skill-docs guard test + README

**Files:**
- Create: `test/skill-docs.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the guard test**

Create `test/skill-docs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const blocks = read("../src/blocks.ts");
const planSkill = read("../skills/visual-plan/SKILL.md");
const recapSkill = read("../skills/visual-recap/SKILL.md");

// Discriminant literals like `type: "diagram"` across the Block interfaces.
const blockTypes = [...new Set([...blocks.matchAll(/\btype:\s*"([^"]+)"/g)].map((m) => m[1]))];

describe("skill docs stay in sync", () => {
  it("documents every Block type in the visual-plan skill", () => {
    expect(blockTypes.length).toBeGreaterThanOrEqual(8);
    for (const t of blockTypes) {
      expect(planSkill, `visual-plan SKILL.md must mention block type "${t}"`).toContain(t);
    }
  });

  it("both skills have name + description frontmatter", () => {
    for (const md of [planSkill, recapSkill]) {
      expect(md.startsWith("---")).toBe(true);
      expect(md).toMatch(/\nname:\s*\S+/);
      expect(md).toMatch(/\ndescription:\s*\S+/);
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- skill-docs`
Expected: PASS (2 tests). This guard validates the SKILL.md files created in Tasks 2–3. If
the first test fails, the visual-plan SKILL.md is missing a block-type mention — fix the
SKILL.md (add the missing type to its block list/notes), NOT the test.

- [ ] **Step 3: Add the README section**

In `README.md`, add a new section after the "Optional: editable Excalidraw diagrams"
section:

```markdown
## Invoking from Claude Code

Install the skills once so Claude Code can discover them from any repo:

    npm run skills:install

This symlinks `skills/visual-recap` and `skills/visual-plan` into `~/.claude/skills/`. After
that, ask Claude Code to "visualize this PR" / "make a visual recap of <commit>" to trigger
`visual-recap`, or "turn this spec into a visual plan" to trigger `visual-plan`. The skills
invoke the CLIs above; the tool path is set in one constant near the top of each `SKILL.md`.
```

- [ ] **Step 4: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add test/skill-docs.test.ts README.md
git commit -m "$(cat <<'EOF'
test: guard skill docs stay in sync with Block union; document install

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: every test passes (61 now: 58 prior + install-skills + 2 skill-docs); no type errors.

- [ ] **Step 2: Confirm both skills' documented commands run end-to-end**

```bash
cd /Users/scottrogener/Projects/visual-skills
echo "--- recap skill command ---"
npx tsx bin/recap.ts --repo /Users/scottrogener/Projects/ppgl --commit 3559f61 --out /tmp/m4-recap.html 2>/tmp/m4-recap.err; echo "exit=$?"; cat /tmp/m4-recap.err
echo "--- plan skill command ---"
cat > /tmp/m4-blocks.json <<'EOF'
[ { "type": "prose", "id": "o", "markdown": "## Plan\n\n```mermaid\ngraph TD\nA-->B\n```" },
  { "type": "questions", "id": "q", "title": "Open", "questions": [ { "question": "Ship?", "recommendedDefault": "yes" } ] } ]
EOF
npx tsx bin/plan.ts --blocks /tmp/m4-blocks.json --title "M4 verify" --out /tmp/m4-plan.html 2>/tmp/m4-plan.err; echo "exit=$?"; cat /tmp/m4-plan.err
echo "--- placeholder leaks (expect 0 0) ---"; grep -c "failed to render" /tmp/m4-recap.html; grep -c "failed to render" /tmp/m4-plan.html
```

Expected: both commands exit 0, recap stderr empty, and both `grep -c "failed to render"` print `0`.

- [ ] **Step 3: Confirm the install script's dry mapping**

```bash
cd /Users/scottrogener/Projects/visual-skills
npx tsx -e "import('./scripts/install-skills.js').then(m => console.log(m.skillLinks(process.env.HOME, process.cwd())))"
```

Expected: prints the two `{ source, target }` pairs with `source` under `<repo>/skills/` and
`target` under `~/.claude/skills/`. (Do NOT run `npm run skills:install` here unless the user
wants the symlinks created — that is the user's manual step.)

- [ ] **Step 4: Manual verification (on the user's machine)**

Run by the human partner, not the implementer subagent:

```bash
npm run skills:install      # create the ~/.claude/skills symlinks
```

Then in a fresh Claude Code session (in any repo), ask "make a visual recap of commit
<sha>" and "turn this spec into a visual plan", and confirm the skills trigger and produce
an HTML document. Whether Claude Code auto-loads the skill is a behavioral check that can
only be done live.

- [ ] **Step 5: Final commit (only if anything changed)**

If Steps 1–3 surfaced a fix, commit it with the co-author trailer. Otherwise the automated
portion of M4 is complete; the manual skill-trigger check (Step 4) remains for the user.

---

## Notes for the Implementer

- **SKILL.md content is the deliverable for Tasks 2–3** — paste it verbatim. The guard test
  (Task 4) and the smoke tests (Tasks 2–3 Step 2) validate it.
- **Do not run `npm run skills:install`** during implementation — it mutates `~/.claude`.
  Only the path-mapping is exercised automatically; the symlink creation is the user's step.
- **The absolute tool path** `/Users/scottrogener/Projects/visual-skills` appears in both
  SKILL.md files and is correct for this machine.
- **Run single tests** during a task; run the full suite in Tasks 4 and 5.

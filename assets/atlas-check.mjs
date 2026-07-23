#!/usr/bin/env node
/**
 * Atlas drift check — emitted into <repo>/.visual/atlas/ by the visual-atlas tool.
 * Self-contained on purpose: commit it with the atlas so pre-commit hooks and CI can run
 * it with plain Node, without a visual-skills checkout. The tool refreshes it on each scan.
 *
 * Three layers, all deterministic:
 *
 * 1. COVERAGE — mirrors the scanner's inventory rules (same dir skips, same test-file
 *    exclusions, same minimal glob semantics). Fails when a source file under the config's
 *    srcRoots is matched by no domain glob, a recorded module no longer exists, a domain
 *    resolves to zero modules, or a domain has no page JSON.
 *
 * 2. GROUNDING — the structured claims on each domain page (component/depth `exports[].name`,
 *    depth `files[].name`, seams `exposes[].api`) must still exist in that domain's source.
 *    Catches renamed/deleted exports, moved files, and changed routes even when file
 *    coverage is unchanged. Free prose is NOT checked — only structured fields.
 *
 * 3. STAMPS — each domain page carries `verifiedAgainst: { hash, date }`, a sha256 over the
 *    domain's module contents at the time the prose was last verified. A mismatch means the
 *    code changed since anyone last read the page: update the prose if needed, then re-stamp.
 *    Stamping is always an explicit act — this script never stamps unless asked.
 *
 * Usage (from the repo root):
 *   node .visual/atlas/atlas-check.mjs                 # check everything
 *   node .visual/atlas/atlas-check.mjs --stamp         # re-stamp every domain page
 *   node .visual/atlas/atlas-check.mjs --stamp srs …   # re-stamp specific domains
 *   node .visual/atlas/atlas-check.mjs --repo <abs>    # override the inferred repo root
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const atlasDir = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const repoFlag = args.indexOf("--repo");
const repoRoot =
  repoFlag >= 0 && args[repoFlag + 1]
    ? resolve(args[repoFlag + 1])
    : resolve(atlasDir, "..", "..");
const rest = args.filter((_, i) => repoFlag < 0 || (i !== repoFlag && i !== repoFlag + 1));
const stampMode = rest[0] === "--stamp";
const stampSlugs = stampMode ? rest.slice(1) : [];

const configPath = join(atlasDir, "atlas.domains.json");
if (!existsSync(configPath)) {
  console.error(`atlas-check: no atlas.domains.json next to this script (${atlasDir})`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));

// Same rules as the scanner (walkSource + scanInventory in visual-skills).
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo",
  // Python vendor/build/cache dirs — the equivalents of node_modules/dist.
  "__pycache__", "venv", ".venv", "env", ".env", "site-packages", ".tox", ".mypy_cache",
  ".pytest_cache", ".ruff_cache", "egg-info", ".eggs",
]);
const NON_DOMAIN_DIRS = new Set([
  "generated",
  "__generated__",
  "test",
  "tests",
  "__tests__",
  "__mocks__",
]);
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|pyi)$/;
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(test_[^/]*|conftest)\.pyi?$|_test\.pyi?$/;

function walk(dir, acc, sourceOnly) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(abs, acc, sourceOnly);
    } else if (!sourceOnly || SOURCE_RE.test(e.name)) {
      acc.push(abs);
    }
  }
  return acc;
}

/** Minimal glob, identical to the scanner: `**` spans segments, `*` stays within one. */
function matchGlob(glob, path) {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .split("**")
    .map((part) => part.replace(/\*/g, "[^/]*"))
    .join(".*");
  return new RegExp(`^${body}$`).test(path);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rel = (abs) => relative(repoRoot, abs).replace(/\\/g, "/");

// ---------- layer 1: coverage ----------

const live = [];
for (const root of config.srcRoots ?? []) {
  for (const abs of walk(join(repoRoot, root), [], true)) {
    const r = rel(abs);
    if (r.split("/").some((seg) => NON_DOMAIN_DIRS.has(seg))) continue;
    if (TEST_FILE_RE.test(r)) continue;
    // config.exclude — must mirror the scanner, or excluded files read as unassigned here.
    if ((config.exclude ?? []).some((g) => matchGlob(g, r))) continue;
    live.push(r);
  }
}
const liveSet = new Set(live);

const problems = [];

for (const m of live) {
  if (!config.domains.some((d) => (d.globs ?? []).some((g) => matchGlob(g, m))))
    problems.push(`unassigned module (no domain glob matches): ${m}`);
}

for (const d of config.domains) {
  for (const m of d.modules ?? []) {
    if (!liveSet.has(m)) problems.push(`stale module in domain "${d.slug}": ${m}`);
  }
  if (!live.some((m) => (d.globs ?? []).some((g) => matchGlob(g, m))))
    problems.push(`domain "${d.slug}" resolves to zero modules`);
  const page = join(atlasDir, `domain-${d.slug}`, `domain-${d.slug}.json`);
  if (!existsSync(page)) problems.push(`domain "${d.slug}" has no page (${rel(page)})`);
}

// ---------- layers 2 & 3: grounding + stamps ----------

/** Every repo file (any extension), for grounding file references like "prisma/seed.ts". */
const allRepoFiles = walk(repoRoot, [], false).map(rel);

/** "src/{App,main}.tsx" → ["src/App.tsx", "src/main.tsx"]; no braces → [name]. */
function expandBraces(name) {
  const m = name.match(/^(.*)\{([^}]+)\}(.*)$/);
  if (!m) return [name];
  return m[2].split(",").map((alt) => `${m[1]}${alt.trim()}${m[3]}`);
}

/** A referenced file resolves if some repo file equals it or ends with "/<name>".
 *  `*` matches within one path segment (e.g. "scripts/seed/*.json"). */
function fileResolves(name) {
  return expandBraces(name.replace(/\/$/, "")).some((candidate) => {
    if (candidate.includes("*")) {
      const body = candidate.split("*").map(escapeRe).join("[^/]*");
      const re = new RegExp(`(^|/)${body}$`);
      return allRepoFiles.some((f) => re.test(f));
    }
    return allRepoFiles.some((f) => f === candidate || f.endsWith(`/${candidate}`));
  });
}

/** The checkable references on a domain page. Structured fields only — never prose. */
function collectRefs(doc) {
  const files = [];
  const names = [];
  for (const b of doc.blocks ?? []) {
    if (b.type === "components")
      for (const c of b.cards ?? []) for (const e of c.exports ?? []) names.push(e.name);
    if (b.type === "depth")
      for (const c of b.components ?? []) {
        for (const f of c.files ?? []) files.push(f.name);
        for (const e of c.exports ?? []) names.push(e.name);
      }
    if (b.type === "seams") for (const e of b.exposes ?? []) names.push(e.api);
  }
  return { files, names };
}

function domainHash(modules) {
  const h = createHash("sha256");
  for (const m of [...modules].sort()) {
    h.update(m);
    h.update("\n");
    try {
      h.update(readFileSync(join(repoRoot, m)));
    } catch {
      h.update("<missing>");
    }
    h.update("\n");
  }
  return `sha256:${h.digest("hex")}`;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Best-effort HEAD sha, recorded on stamps so a later review can diff precisely
 *  (`git diff <commit> -- <modules>`). The content hash stays the verification authority. */
function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}
const stampCommit = stampMode ? gitHead() : null;
const stamped = [];

for (const d of config.domains) {
  const pagePath = join(atlasDir, `domain-${d.slug}`, `domain-${d.slug}.json`);
  if (!existsSync(pagePath)) continue; // already reported by coverage
  const doc = JSON.parse(readFileSync(pagePath, "utf8"));
  const modules = (d.modules ?? []).filter((m) => liveSet.has(m));
  const source = modules.map((m) => readFileSync(join(repoRoot, m), "utf8")).join("\n");

  // grounding
  const { files, names } = collectRefs(doc);
  for (const f of files) {
    if (!fileResolves(f)) problems.push(`domain "${d.slug}": referenced file no longer exists: ${f}`);
  }
  for (const raw of names) {
    const route = raw.match(/^(?:GET|POST|PUT|PATCH|DELETE)\s+(\S+)/);
    if (route) {
      const path = route[1].split("?")[0];
      if (!source.includes(path))
        problems.push(`domain "${d.slug}": route not found in domain source: ${raw}`);
      continue;
    }
    if (!/^[A-Za-z0-9_$]/.test(raw)) continue; // "@scope/pkg", "← the UI", … — not checkable
    if (raw.includes("/") || SOURCE_RE.test(raw)) {
      if (!fileResolves(raw))
        problems.push(`domain "${d.slug}": referenced file no longer exists: ${raw}`);
      continue;
    }
    const ident = raw.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    if (!ident) continue; // "@scope/pkg", "the UI", … — not checkable
    if (!new RegExp(`\\b${escapeRe(ident[0])}\\b`).test(source))
      problems.push(
        `domain "${d.slug}": identifier not found in domain source: ${ident[0]} (from "${raw}")`,
      );
  }

  // stamps
  const hash = domainHash(modules);
  if (stampMode) {
    if (stampSlugs.length === 0 || stampSlugs.includes(d.slug)) {
      doc.verifiedAgainst = {
        hash,
        date: today(),
        ...(stampCommit ? { commit: stampCommit } : {}),
      };
      writeFileSync(pagePath, JSON.stringify(doc, null, 2));
      stamped.push(d.slug);
    }
  } else if (!doc.verifiedAgainst?.hash) {
    problems.push(`domain "${d.slug}": page has no verifiedAgainst stamp — run: atlas-check.mjs --stamp ${d.slug}`);
  } else if (doc.verifiedAgainst.hash !== hash) {
    problems.push(
      `domain "${d.slug}": source changed since page was verified (${doc.verifiedAgainst.date ?? "unknown date"}) — ` +
        `re-read the page, update prose if needed, then: atlas-check.mjs --stamp ${d.slug}`,
    );
  }
}

if (stampMode) {
  const unknown = stampSlugs.filter((s) => !config.domains.some((d) => d.slug === s));
  if (unknown.length > 0) {
    console.error(`✗ unknown domain slug(s): ${unknown.join(", ")}`);
    process.exit(1);
  }
  console.log(`✓ stamped ${stamped.length} domain page(s): ${stamped.join(", ")}`);
  process.exit(0);
}

if (problems.length > 0) {
  console.error("✗ visual atlas is out of sync with the source tree:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\n  Fix: update atlas.domains.json and/or the affected domain page, re-render," +
      "\n  then re-stamp (node .visual/atlas/atlas-check.mjs --stamp <slug>)." +
      "\n  (Or ask Claude to run /atlas-review — it reviews stale domains, fixes the" +
      "\n  prose, re-renders, and re-stamps. For regroups/new domains: /visual-atlas.)",
  );
  process.exit(1);
}

console.log(
  `✓ visual atlas in sync (${live.length} modules, ${config.domains.length} domains; coverage + grounding + stamps)`,
);

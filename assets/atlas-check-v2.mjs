#!/usr/bin/env node
/** Recursive visual-atlas integrity, readability, and per-page freshness checker. */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const atlasDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const repoFlag = args.indexOf("--repo");
const repoRoot = repoFlag >= 0 && args[repoFlag + 1]
  ? resolve(args[repoFlag + 1]) : resolve(atlasDir, "..", "..");
const rest = args.filter((_, i) => repoFlag < 0 || (i !== repoFlag && i !== repoFlag + 1));
const stampMode = rest[0] === "--stamp";
const stampIds = stampMode ? rest.slice(1) : [];
const configPath = join(atlasDir, "atlas.domains.json");
if (!existsSync(configPath)) {
  console.error(`atlas-check: no atlas.domains.json next to this script (${atlasDir})`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));
const problems = [];
const warnings = [];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo"]);
const NON_DOMAIN_DIRS = new Set(["generated", "__generated__", "test", "tests", "__tests__", "__mocks__"]);
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SAFE_PAGE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function walk(dir, out = [], sourceOnly = false) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(absolute, out, sourceOnly);
    } else if (!sourceOnly || SOURCE_RE.test(entry.name)) out.push(absolute);
  }
  return out;
}

const rel = (absolute) => relative(repoRoot, absolute).replace(/\\/g, "/");
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function matchGlob(glob, path) {
  const normalized = glob.replace(/\\/g, "/");
  let body = "";
  for (let i = 0; i < normalized.length;) {
    if (normalized.startsWith("**/", i)) { body += "(?:.*/)?"; i += 3; }
    else if (normalized.startsWith("**", i)) { body += ".*"; i += 2; }
    else if (normalized[i] === "*") { body += "[^/]*"; i += 1; }
    else { body += escapeRe(normalized[i]); i += 1; }
  }
  return new RegExp(`^${body}$`).test(path);
}

const allRepoFiles = walk(repoRoot).map(rel);
const live = [];
for (const root of config.srcRoots ?? []) {
  for (const absolute of walk(join(repoRoot, root), [], true)) {
    const path = rel(absolute);
    if (path.split("/").some((segment) => NON_DOMAIN_DIRS.has(segment))) continue;
    if (!TEST_FILE_RE.test(path)) live.push(path);
  }
}
const liveSet = new Set(live);

// Conceptual page tree. This mirrors src/atlas-tree.ts without depending on the package.
const nodes = [];
const byId = new Map();
function register(node) {
  nodes.push(node);
  if (byId.has(node.id)) problems.push(`duplicate page id "${node.id}"`);
  else byId.set(node.id, node);
}
function addTopics(topics, parent, domainSlug) {
  const children = [];
  for (const topic of topics ?? []) {
    const id = parent ? `${parent.id}/${topic.slug}` : topic.slug;
    const outputDir = parent ? `${parent.outputDir}/${topic.slug}` : `topic-${topic.slug}`;
    const stem = parent ? topic.slug : `topic-${topic.slug}`;
    const node = {
      id, kind: "topic", slug: topic.slug, title: topic.title, purpose: topic.purpose ?? "",
      shape: topic.shape, topicDepth: parent?.kind === "topic" ? parent.topicDepth + 1 : 1,
      domainSlug, parentId: parent?.id, childIds: [], related: topic.related ?? [],
      sources: topic.sources ?? [], topic, outputDir,
      jsonPath: `${outputDir}/${stem}.json`, htmlPath: `${outputDir}/${stem}.html`,
    };
    register(node);
    node.childIds = addTopics(topic.topics, node, domainSlug).map((child) => child.id);
    children.push(node);
  }
  return children;
}
for (const domain of config.domains ?? []) {
  const outputDir = `domain-${domain.slug}`;
  const node = {
    id: domain.slug, kind: "domain", slug: domain.slug, title: domain.name,
    purpose: domain.purpose ?? "", topicDepth: 0, domainSlug: domain.slug,
    childIds: [], related: domain.related ?? [], sources: [], outputDir,
    jsonPath: `${outputDir}/domain-${domain.slug}.json`,
    htmlPath: `${outputDir}/domain-${domain.slug}.html`, domain,
  };
  register(node);
  node.childIds = addTopics(domain.topics, node, domain.slug).map((child) => child.id);
}
addTopics(config.topics, null, null);

const seenPaths = new Map();
for (const node of nodes) {
  if (seenPaths.has(node.htmlPath)) problems.push(`duplicate page path "${node.htmlPath}"`);
  else seenPaths.set(node.htmlPath, node.id);
  if (!node.slug || !node.title) problems.push(`page "${node.id}" has an empty slug or title`);
  if (!SAFE_PAGE_SLUG.test(node.slug)) problems.push(`page "${node.id}" has unsafe slug "${node.slug}"; use lowercase kebab-case`);
  for (const artifact of [node.jsonPath, node.htmlPath]) {
    const local = relative(atlasDir, resolve(atlasDir, artifact));
    if (local === ".." || /^\.\.(?:[\\/]|$)/.test(local))
      problems.push(`page "${node.id}" resolves outside the atlas directory: ${artifact}`);
  }
  if (node.kind === "topic" && !node.purpose) problems.push(`topic "${node.id}" has no purpose`);
  if (node.domainSlug && node.topicDepth > 2) warnings.push(`page "${node.id}": more than two topic levels beneath a domain`);
  for (const related of node.related) if (!byId.has(related)) problems.push(`page "${node.id}" links to missing related page "${related}"`);
}
const readingPaths = [
  ...(config.readingPaths ?? []),
  ...(config.domains ?? []).flatMap((domain) => domain.readingPaths ?? []),
];
for (const path of readingPaths) for (const page of path.pages ?? [])
  if (!byId.has(page)) problems.push(`reading path "${path.title}" links to missing page "${page}"`);

// Domain coverage and topic evidence scopes.
for (const module of live) {
  if (!(config.domains ?? []).some((domain) => (domain.globs ?? []).some((glob) => matchGlob(glob, module))))
    problems.push(`unassigned module (no domain glob matches): ${module}`);
}
const domainFiles = new Map();
for (const domain of config.domains ?? []) {
  const matched = live.filter((module) => (domain.globs ?? []).some((glob) => matchGlob(glob, module))).sort();
  const matchedSet = new Set(matched);
  const recorded = [...new Set(domain.modules ?? [])].sort();
  const recordedSet = new Set(recorded);
  const newlyMatched = matched.filter((module) => !recordedSet.has(module));
  const noLongerMatched = recorded.filter((module) => liveSet.has(module) && !matchedSet.has(module));
  if (newlyMatched.length || noLongerMatched.length) {
    const detail = [
      newlyMatched.length ? `newly matched: ${newlyMatched.join(", ")}` : "",
      noLongerMatched.length ? `no longer matched: ${noLongerMatched.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    problems.push(`domain "${domain.slug}" module inventory differs from its globs (${detail})`);
  }
  for (const module of recorded) if (!liveSet.has(module)) problems.push(`stale module in domain "${domain.slug}": ${module}`);
  if (!matched.length)
    problems.push(`domain "${domain.slug}" resolves to zero modules`);
  domainFiles.set(domain.slug, matched);
}
function resolveSourceGroup(group) {
  return allRepoFiles
    .filter((file) => (group.include ?? []).some((glob) => matchGlob(glob, file)))
    .filter((file) => !(group.exclude ?? []).some((glob) => matchGlob(glob, file)))
    .sort();
}
const topicFiles = new Map();
for (const node of nodes.filter((item) => item.kind === "topic")) {
  const files = new Set();
  for (const group of node.sources) {
    const matched = resolveSourceGroup(group);
    if (!matched.length) problems.push(`topic "${node.id}": source group "${group.label}" resolves to no files`);
    for (const file of matched) files.add(file);
  }
  topicFiles.set(node.id, [...files].sort());
}

// Stamp mode mutates page JSON. Refuse all writes until config structure, artifact paths, source
// coverage, and evidence scopes are known safe. In particular, never merely report a traversal
// slug and then follow it during the stamping loop below.
if (stampMode && problems.length) {
  console.error("✗ visual atlas has integrity or freshness problems:\n");
  for (const problem of [...new Set(problems)]) console.error(`  - ${problem}`);
  process.exit(1);
}

// Configured artifacts and structured floors.
const pages = [{ id: "@system", kind: "atlas", jsonPath: "atlas.json", htmlPath: "atlas.html" }, ...nodes];
const docs = new Map();
for (const page of pages) {
  const json = join(atlasDir, page.jsonPath);
  const html = join(atlasDir, page.htmlPath);
  if (!existsSync(json)) problems.push(`page "${page.id}" has no page JSON (${page.jsonPath})`);
  else {
    try { docs.set(page.id, JSON.parse(readFileSync(json, "utf8"))); }
    catch (error) { problems.push(`page "${page.id}" has invalid JSON: ${error.message}`); }
  }
  if (!existsSync(html)) problems.push(`page "${page.id}" has no rendered HTML (${page.htmlPath})`);
}
const expectedJson = new Set(pages.map((page) => resolve(atlasDir, page.jsonPath)));
for (const absolute of walk(atlasDir).filter((file) => file.endsWith(".json") && !file.endsWith("atlas.domains.json"))) {
  if (expectedJson.has(resolve(absolute))) continue;
  try {
    const value = JSON.parse(readFileSync(absolute, "utf8"));
    if (["atlas", "domain", "topic"].includes(value.kind))
      problems.push(`orphaned page JSON: ${relative(atlasDir, absolute).replace(/\\/g, "/")}`);
  } catch { /* unrelated or malformed sidecars are not configured pages */ }
}
const atlasDoc = docs.get("@system");
if (atlasDoc) {
  const count = Number.parseInt(String(atlasDoc.count ?? ""), 10);
  if (count !== (config.domains ?? []).length)
    problems.push(`atlas domain count is stale: expected ${(config.domains ?? []).length}, found ${Number.isFinite(count) ? count : "none"}`);
}
const hasBlock = (doc, type) => (doc?.blocks ?? []).some((block) => block.type === type);
for (const page of pages) {
  const doc = docs.get(page.id);
  if (!doc) continue;
  if (page.kind === "atlas") {
    if (!hasBlock(doc, "atlas-tldr")) problems.push("atlas: missing required atlas-tldr block");
    if (!(doc.blocks ?? []).some((block) => block.type === "domain-map" || (block.type === "diagram-section" && block.id === "map"))) problems.push("atlas: missing required domain map");
    if (!hasBlock(doc, "domain-index")) problems.push("atlas: missing required domain-index block");
  } else if (page.kind === "domain") {
    if (!hasBlock(doc, "domain-tldr")) problems.push(`domain "${page.id}": missing required domain-tldr block`);
    if (!hasBlock(doc, "seams")) problems.push(`domain "${page.id}": missing required seams block`);
  } else for (const type of ["topic-tldr", "topic-flow", "topic-rules"])
    if (!hasBlock(doc, type)) problems.push(`topic "${page.id}": missing required ${type} block`);

  if (page.kind === "domain") {
    if (doc.kind !== "domain") problems.push(`domain "${page.id}": kind must be "domain"`);
    if (doc.slug !== page.slug) problems.push(`domain "${page.id}": slug must match config value "${page.slug}"`);
    if (doc.title !== page.title) problems.push(`domain "${page.id}": title must match config value "${page.title}"`);
  } else if (page.kind === "topic") {
    if (doc.kind !== "topic") problems.push(`topic "${page.id}": kind must be "topic"`);
    if (doc.pageId !== page.id) problems.push(`topic "${page.id}": pageId must match config value "${page.id}"`);
    if (doc.slug !== page.slug) problems.push(`topic "${page.id}": slug must match config value "${page.slug}"`);
    if (doc.title !== page.title) problems.push(`topic "${page.id}": title must match config value "${page.title}"`);
    if (doc.purpose !== page.purpose) problems.push(`topic "${page.id}": purpose must match config value "${page.purpose}"`);
    if ((doc.shape ?? null) !== (page.shape ?? null)) problems.push(`topic "${page.id}": shape must match config value "${page.shape ?? "none"}"`);
  }
}

// All generated relative links must resolve locally.
for (const page of pages) {
  const absolute = join(atlasDir, page.htmlPath);
  if (!existsSync(absolute)) continue;
  const html = readFileSync(absolute, "utf8");
  for (const match of html.matchAll(/\bhref=(?:"([^"]+)"|'([^']+)')/g)) {
    const href = match[1] ?? match[2];
    if (!href || href.startsWith("#") || /^(?:https?:|mailto:|javascript:|data:)/i.test(href)) continue;
    if (!existsSync(resolve(dirname(absolute), href.split("#")[0])))
      problems.push(`page "${page.id}": broken local link "${href}"`);
  }
}

// Existing structured file/export/route grounding applies to every page's evidence.
function fileResolves(name) {
  return allRepoFiles.some((file) => file === name || file.endsWith(`/${name}`));
}
function fileResolvesIn(name, evidence) {
  return evidence.some((file) => file === name || file.endsWith(`/${name}`));
}
function collectRefs(doc) {
  const files = [];
  const names = [];
  for (const block of doc.blocks ?? []) {
    if (block.type === "components") for (const card of block.cards ?? []) for (const item of card.exports ?? []) names.push(item.name);
    if (block.type === "depth") for (const component of block.components ?? []) {
      for (const file of component.files ?? []) files.push(file.name);
      for (const item of component.exports ?? []) names.push(item.name);
    }
    if (block.type === "implementation-reference") for (const group of block.groups ?? []) for (const file of group.files ?? []) files.push(file.name);
    if (block.type === "seams") for (const item of block.exposes ?? []) names.push(item.api);
  }
  return { files, names };
}
for (const node of nodes) {
  const doc = docs.get(node.id);
  if (!doc) continue;
  const evidence = node.kind === "domain"
    ? domainFiles.get(node.slug) ?? [] : topicFiles.get(node.id) ?? [];
  const source = evidence.map((file) => {
    try { return readFileSync(join(repoRoot, file), "utf8"); } catch { return ""; }
  }).join("\n");
  const refs = collectRefs(doc);
  for (const file of refs.files) {
    if (!fileResolves(file)) problems.push(`page "${node.id}": referenced file no longer exists: ${file}`);
    else if (!fileResolvesIn(file, evidence)) problems.push(`page "${node.id}": referenced file is outside page evidence: ${file}`);
  }
  for (const raw of refs.names) {
    const route = raw.match(/^(?:GET|POST|PUT|PATCH|DELETE)\s+(\S+)/);
    if (route) {
      if (!source.includes(route[1].split("?")[0])) problems.push(`page "${node.id}": route not found in page evidence: ${raw}`);
      continue;
    }
    if (!/^[A-Za-z0-9_$]/.test(raw)) continue;
    if (raw.includes("/") || SOURCE_RE.test(raw)) {
      if (!fileResolves(raw)) problems.push(`page "${node.id}": referenced file no longer exists: ${raw}`);
      else if (!fileResolvesIn(raw, evidence)) problems.push(`page "${node.id}": referenced file is outside page evidence: ${raw}`);
      continue;
    }
    const ident = raw.match(/^[A-Za-z_$][A-Za-z0-9_$]*/)?.[0];
    if (ident && !new RegExp(`\\b${escapeRe(ident)}\\b`).test(source))
      problems.push(`page "${node.id}": identifier not found in page evidence: ${ident} (from "${raw}")`);
  }
}

// Independent system/domain/topic fingerprints.
function hashParts(parts) {
  const hash = createHash("sha256");
  for (const part of parts) { hash.update(part); hash.update("\n"); }
  return `sha256:${hash.digest("hex")}`;
}
function fileParts(files) {
  return [...files].sort().flatMap((file) => {
    try { return [Buffer.from(file), readFileSync(join(repoRoot, file))]; }
    catch { return [Buffer.from(file), Buffer.from("<missing>")]; }
  });
}
function childParts(node) {
  return node.childIds.flatMap((id) => {
    const child = byId.get(id);
    return child ? [Buffer.from(child.id), Buffer.from(child.title), Buffer.from(child.purpose)] : [];
  });
}
const summarizeOwnTopic = (topic) => ({
  slug: topic.slug, title: topic.title, purpose: topic.purpose, shape: topic.shape,
  aliases: topic.aliases ?? [], sources: topic.sources ?? [], related: topic.related ?? [],
});
const summarizeTopic = (topic) => ({
  ...summarizeOwnTopic(topic), topics: (topic.topics ?? []).map(summarizeTopic),
});
function pageHash(page) {
  if (page.kind === "atlas") return hashParts([Buffer.from(JSON.stringify({
    repo: config.repo,
    domains: (config.domains ?? []).map((domain) => ({ slug: domain.slug, name: domain.name, purpose: domain.purpose, related: domain.related ?? [], topics: (domain.topics ?? []).map(summarizeTopic) })),
    topics: (config.topics ?? []).map(summarizeTopic), readingPaths,
  }))]);
  if (page.kind === "domain") return hashParts([
    Buffer.from(JSON.stringify({
      slug: page.domain.slug, name: page.domain.name, purpose: page.domain.purpose ?? "",
      globs: page.domain.globs ?? [], related: page.domain.related ?? [], readingPaths: page.domain.readingPaths ?? [],
    })),
    ...fileParts(domainFiles.get(page.slug) ?? []), ...childParts(page),
  ]);
  return hashParts([
    Buffer.from(JSON.stringify(summarizeOwnTopic(page.topic))),
    ...fileParts(topicFiles.get(page.id) ?? []), ...childParts(page),
  ]);
}
function gitHead() {
  try { return execSync("git rev-parse HEAD", { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return null; }
}
const stampCommit = stampMode ? gitHead() : null;
const today = () => new Date().toISOString().slice(0, 10);
const selected = (page) => !stampIds.length || stampIds.includes(page.id) ||
  (page.kind === "atlas" && stampIds.includes("system")) ||
  (page.kind === "domain" && stampIds.includes(page.slug));
const stamped = [];
for (const page of pages) {
  const doc = docs.get(page.id);
  if (!doc) continue;
  const hash = pageHash(page);
  if (stampMode && selected(page)) {
    doc.verifiedAgainst = { hash, date: today(), ...(stampCommit ? { commit: stampCommit } : {}) };
    writeFileSync(join(atlasDir, page.jsonPath), JSON.stringify(doc, null, 2));
    stamped.push(page.id);
  } else if (!stampMode) {
    if (!doc.verifiedAgainst?.hash) problems.push(`page "${page.id}" has no verifiedAgainst stamp`);
    else if (doc.verifiedAgainst.hash !== hash) problems.push(`page "${page.id}": source changed since page was verified (${doc.verifiedAgainst.date ?? "unknown date"})`);
  }
}
if (stampMode) for (const id of stampIds)
  if (!pages.some((page) => page.id === id || (page.kind === "atlas" && id === "system") || (page.kind === "domain" && page.slug === id))) problems.push(`unknown page id: ${id}`);

// Readability warnings never change the exit code.
const HISTORY = [/\bPR\s*#?\d+\b/i, /\btask(?:s)?\s*(?:#?\d+|implementation)\b/i, /\breview\s+round\b/i, /\bsupersed(?:e|es|ed|ing)\b/i, /\b(?:previous|old)\s+(?:version|implementation|behavior|design)\b/i];
const SKIP_PROSE = new Set(["id", "type", "path", "href", "d2", "mermaid", "svg", "codeHtml", "hash", "commit", "date"]);
function prose(value, key = "") {
  if (SKIP_PROSE.has(key)) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => prose(item, key));
  if (!value || typeof value !== "object") return [];
  if (value.type === "implementation-reference") return [value.title ?? ""];
  return Object.entries(value).flatMap(([childKey, child]) => prose(child, childKey));
}
const wordCount = (text) => text.trim().split(/\s+/).filter(Boolean).length;
for (const page of pages) {
  const strings = prose(docs.get(page.id)?.blocks ?? []);
  if (strings.some((text) => HISTORY.some((pattern) => pattern.test(text)))) warnings.push(`page "${page.id}": project history appears in standing prose`);
  const longest = Math.max(0, ...strings.map(wordCount));
  if (longest > 100) warnings.push(`page "${page.id}": paragraph exceeds roughly 100 words (${longest})`);
  const total = strings.reduce((sum, text) => sum + wordCount(text), 0);
  if (page.kind === "domain" && total > 1200) warnings.push(`page "${page.id}": domain page exceeds 1,200 visible words (${total})`);
  if (page.kind === "topic" && total > 2000) warnings.push(`page "${page.id}": topic page exceeds 2,000 visible words (${total})`);
}
for (const warning of warnings) console.warn(`warning: ${warning}`);

if (problems.length) {
  console.error("✗ visual atlas has integrity or freshness problems:\n");
  for (const problem of [...new Set(problems)]) console.error(`  - ${problem}`);
  process.exit(1);
}
if (stampMode) {
  console.log(`✓ stamped ${stamped.length} atlas page(s): ${stamped.join(", ")}`);
  process.exit(0);
}
console.log(`✓ visual atlas in sync (${live.length} modules, ${config.domains.length} domains, ${pages.length} pages)`);

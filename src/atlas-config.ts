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
        .replace(/\*\*/g, " ")        // placeholder so the next step doesn't touch it
        .replace(/\*/g, "[^/]*")
        .replace(/ /g, ".*") +
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

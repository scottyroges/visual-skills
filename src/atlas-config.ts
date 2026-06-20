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

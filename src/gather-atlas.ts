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

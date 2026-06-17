import { access } from "node:fs/promises";
import { join } from "node:path";
import type { StackAdapter } from "./stack-adapter.js";
import type { Scope } from "../git.js";
import type { ApiBlock, SchemaBlock } from "../blocks.js";
import { fileAtRef, changedFiles } from "../git.js";
import { parsePrismaModels, diffModels, schemaDiffToBlock } from "../prisma-schema.js";
import { parseRouter } from "../trpc-parse.js";
import { diffProcedures } from "../api-diff.js";

const SCHEMA_PATH = "prisma/schema.prisma";

export class PrismaTrpcAdapter implements StackAdapter {
  name = "prisma-trpc";

  async detect(repoRoot: string): Promise<boolean> {
    try {
      await access(join(repoRoot, SCHEMA_PATH));
      return true;
    } catch { return false; }
  }

  async schemaDiff(scope: Scope): Promise<SchemaBlock | null> {
    const before = await fileAtRef(SCHEMA_PATH, scope.baseRef, scope.repoRoot);
    const after = await fileAtRef(SCHEMA_PATH, scope.headRef, scope.repoRoot);
    if (!before && !after) return null;
    const diffs = diffModels(parsePrismaModels(before), parsePrismaModels(after));
    if (!diffs.length) return null;
    return schemaDiffToBlock(diffs);
  }

  async apiDiff(scope: Scope): Promise<ApiBlock[]> {
    const files = await changedFiles(scope.baseRef, scope.headRef, scope.repoRoot);
    const routers = files
      .map((f) => f.path)
      .filter((p) => /src\/server\/routers\/[^/]+\.ts$/.test(p) && !p.endsWith("_app.ts"));

    const blocks: ApiBlock[] = [];
    for (const path of routers) {
      const routerName = path.split("/").pop()!.replace(/\.ts$/, "");
      const beforeSrc = await fileAtRef(path, scope.baseRef, scope.repoRoot);
      const afterSrc = await fileAtRef(path, scope.headRef, scope.repoRoot);
      const before = beforeSrc ? parseRouter(beforeSrc, routerName) : [];
      const after = afterSrc ? parseRouter(afterSrc, routerName) : [];
      const block = diffProcedures(before, after, `tRPC: ${routerName}`, `api-${routerName}`);
      if (block.procedures.length) blocks.push(block);
    }
    return blocks;
  }
}

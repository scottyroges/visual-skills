import type { Block, FileChange, FileTreeBlock } from "./blocks.js";
import type { Scope, Target } from "./git.js";
import { resolveScope, changedFiles } from "./git.js";
import { parseUnifiedDiff } from "./parse-diff.js";
import { selectAdapter, type StackAdapter } from "./adapters/stack-adapter.js";
import { PrismaTrpcAdapter } from "./adapters/prisma-trpc.js";
import { apiSurfaceDiagram } from "./api-diagram.js";
import { summaryMarkdown } from "./recap-summary.js";
import { dependencyNeighborhood } from "./dep-graph.js";

/** Compose the ordered block array for a recap. Pure given its inputs. */
export async function buildBlocks(
  scope: Scope,
  files: FileChange[],
  adapter: StackAdapter,
  onWarn?: (msg: string) => void,
): Promise<Block[]> {
  const blocks: Block[] = [];
  blocks.push({ type: "file-tree", id: "files", title: "Files changed", files });

  let schemaBlock = null as Awaited<ReturnType<StackAdapter["schemaDiff"]>>;
  try {
    schemaBlock = await adapter.schemaDiff(scope, onWarn);
  } catch (err) {
    onWarn?.(`schema diff skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  let procedures: import("./blocks.js").ApiProcedure[] = [];
  let apiBlocks: import("./blocks.js").ApiBlock[] = [];
  try {
    apiBlocks = await adapter.apiDiff(scope, onWarn);
    procedures = apiBlocks.flatMap((b) => b.procedures);
  } catch (err) {
    onWarn?.(`api diff skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Rich summary (mechanical), placed first.
  blocks.unshift({
    type: "prose",
    id: "summary",
    markdown: summaryMarkdown(scope, files, procedures, schemaBlock != null),
  });

  // "Where it fits" dependency-neighborhood diagram (mechanical, TS/JS only).
  try {
    const fits = await dependencyNeighborhood(files.map((f) => f.path), scope.repoRoot);
    if (fits) blocks.push(fits);
  } catch (err) {
    onWarn?.(`where-it-fits skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (schemaBlock) blocks.push(schemaBlock);

  const diagram = apiSurfaceDiagram(procedures, "api-surface", "API surface");
  if (diagram) blocks.push(diagram);
  for (const api of apiBlocks) blocks.push(api);

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

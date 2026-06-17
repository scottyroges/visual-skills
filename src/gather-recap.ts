import type { Block, FileChange, FileTreeBlock } from "./blocks.js";
import type { Scope, Target } from "./git.js";
import { resolveScope, changedFiles } from "./git.js";
import { parseUnifiedDiff } from "./parse-diff.js";
import { selectAdapter, type StackAdapter } from "./adapters/stack-adapter.js";
import { PrismaTrpcAdapter } from "./adapters/prisma-trpc.js";

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

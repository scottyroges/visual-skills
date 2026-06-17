import type { ApiBlock, SchemaBlock } from "../blocks.js";
import type { Scope } from "../git.js";
import { GenericAdapter } from "./generic.js";

export interface StackAdapter {
  name: string;
  detect(repoRoot: string): Promise<boolean>;
  schemaDiff(scope: Scope): Promise<SchemaBlock | null>;
  apiDiff(scope: Scope): Promise<ApiBlock[]>;
}

/** First adapter whose detect() passes, else GenericAdapter. */
export async function selectAdapter(
  repoRoot: string,
  adapters: StackAdapter[],
): Promise<StackAdapter> {
  for (const a of adapters) {
    if (await a.detect(repoRoot)) return a;
  }
  return new GenericAdapter();
}

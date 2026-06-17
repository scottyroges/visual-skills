import type { DiffBlock, DiffHunk } from "./blocks.js";

/** Parse a `git diff` into one DiffBlock per file. Pure string work. */
export function parseUnifiedDiff(diff: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  const lines = diff.split("\n");
  let cur: DiffBlock | null = null;
  let hunk: DiffHunk | null = null;
  let fileIdx = 0;

  const pushHunk = () => { if (cur && hunk) cur.hunks.push(hunk); hunk = null; };
  const pushFile = () => { pushHunk(); if (cur) blocks.push(cur); cur = null; };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      pushFile();
      const m = line.match(/ b\/(.+)$/);
      const path = m ? m[1] : `file-${fileIdx}`;
      cur = { type: "diff", id: `diff-${fileIdx++}`, title: path.split("/").pop() ?? path, path, hunks: [] };
    } else if (line.startsWith("@@")) {
      pushHunk();
      hunk = { header: line, lines: [] };
    } else if (hunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      hunk.lines.push(line);
    }
  }
  pushFile();
  return blocks;
}

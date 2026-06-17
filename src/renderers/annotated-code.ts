import { escapeHtml } from "../html.js";
import { highlightLines } from "../highlight.js";
import type { AnnotatedCodeBlock } from "../blocks.js";

export async function renderAnnotatedCode(
  block: AnnotatedCodeBlock,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const codeLines = block.code.split("\n");
  const highlighted = await highlightLines(block.code, block.lang, onWarn);

  const notesByLine = new Map<number, string[]>();
  for (const a of block.annotations) {
    if (a.line < 1 || a.line > codeLines.length) {
      onWarn?.(
        `annotated-code "${block.id}": annotation line ${a.line} out of range ` +
        `(1..${codeLines.length}); skipped`,
      );
      continue;
    }
    const arr = notesByLine.get(a.line) ?? [];
    arr.push(a.note);
    notesByLine.set(a.line, arr);
  }

  const rows = codeLines
    .map((raw, i) => {
      const lineNo = i + 1;
      const content = highlighted ? highlighted[i] : escapeHtml(raw);
      const notes = (notesByLine.get(lineNo) ?? [])
        .map((n) => `<span class="note">&#9664; ${escapeHtml(n)}</span>`)
        .join("");
      return (
        `<div class="vs-arow">` +
        `<span class="vs-lineno">${lineNo}</span>` +
        `<code class="vs-code">${content}</code>` +
        `<div class="vs-notes">${notes}</div>` +
        `</div>`
      );
    })
    .join("");

  return (
    `<section class="vs-block vs-annotated">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    rows +
    `</section>`
  );
}

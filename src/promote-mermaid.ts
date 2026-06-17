import type { Block, ProseBlock, DiagramBlock } from "./blocks.js";
import { mermaidFlowchartToD2 } from "./mermaid-to-d2.js";

// Matches a standard fenced ```mermaid ... ``` block; captures the inner source.
const FENCE = /```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n```/g;

function expandProse(block: ProseBlock): Block[] {
  const md = block.markdown;
  const result: Block[] = [];
  let lastIndex = 0;
  let textCount = 0;
  let diagramCount = 0;
  let m: RegExpExecArray | null;

  // Re-create the regex per call to reset lastIndex safely.
  const re = new RegExp(FENCE.source, "g");
  while ((m = re.exec(md)) !== null) {
    const mermaid = m[1];
    const d2 = mermaidFlowchartToD2(mermaid);
    if (d2 === null) continue; // leave this fence inline; do not split here

    const before = md.slice(lastIndex, m.index);
    if (before.trim()) {
      result.push({
        type: "prose",
        id: textCount === 0 ? block.id : `${block.id}-t${textCount}`,
        markdown: before.trim(),
        ...(block.title && textCount === 0 ? { title: block.title } : {}),
      });
      textCount++;
    }
    const diagram: DiagramBlock = {
      type: "diagram",
      id: `${block.id}-mermaid-${diagramCount++}`,
      title: "Diagram",
      kind: "flowchart",
      d2,
      mermaid,
    };
    result.push(diagram);
    lastIndex = m.index + m[0].length;
  }

  if (result.length === 0) return [block]; // nothing promoted

  const tail = md.slice(lastIndex);
  if (tail.trim()) {
    result.push({
      type: "prose",
      id: textCount === 0 ? block.id : `${block.id}-t${textCount}`,
      markdown: tail.trim(),
    });
  }
  return result;
}

/** Promote convertible ```mermaid fences in prose blocks into diagram blocks. */
export function promoteMermaidFences(blocks: Block[]): Block[] {
  return blocks.flatMap((b) => (b.type === "prose" ? expandProse(b) : [b]));
}

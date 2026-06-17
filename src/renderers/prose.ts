import { marked } from "marked";
import type { ProseBlock } from "../blocks.js";

export function renderProse(block: ProseBlock): string {
  const body = marked.parse(block.markdown, { async: false }) as string;
  return `<section class="vs-block vs-prose">${body}</section>`;
}

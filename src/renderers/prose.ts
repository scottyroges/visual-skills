import type { ProseBlock } from "../blocks.js";
import { renderMarkdown } from "./markdown.js";

export async function renderProse(
  block: ProseBlock,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const body = await renderMarkdown(block.markdown, onWarn);
  return `<section class="vs-block vs-prose">${body}</section>`;
}

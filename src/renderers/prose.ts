import type { ProseBlock } from "../blocks.js";
import { renderMarkdown } from "./markdown.js";
import { escapeHtml } from "../html.js";

export async function renderProse(
  block: ProseBlock,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const body = await renderMarkdown(block.markdown, onWarn);
  const heading = block.title ? `<h2>${escapeHtml(block.title)}</h2>` : "";
  return `<section class="vs-block vs-prose">${heading}${body}</section>`;
}

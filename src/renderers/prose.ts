import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type { ProseBlock } from "../blocks.js";
import { highlightCode } from "../highlight.js";

const HEX_OR_RGB = [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i];

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "blockquote",
    "pre", "code", "span", "a", "em", "strong", "del", "hr", "br",
    "table", "thead", "tbody", "tr", "th", "td", "img",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt"],
    pre: ["class", "style"],
    code: ["class", "style"],
    span: ["class", "style"],
  },
  allowedStyles: {
    "*": { color: HEX_OR_RGB, "background-color": HEX_OR_RGB },
  },
  allowedSchemes: ["http", "https", "mailto"],
};

export async function renderProse(
  block: ProseBlock,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const md = new Marked({ async: true });
  md.use({
    async: true,
    walkTokens: async (token) => {
      if (token.type === "code") {
        const t = token as { text: string; lang?: string; highlighted?: string };
        t.highlighted = await highlightCode(t.text, t.lang || "text", onWarn);
      }
    },
    renderer: {
      code(token) {
        return (token as { highlighted?: string }).highlighted ?? "";
      },
    },
  });

  const body = (await md.parse(block.markdown)) as string;
  const safe = sanitizeHtml(body, SANITIZE_OPTS);
  return `<section class="vs-block vs-prose">${safe}</section>`;
}

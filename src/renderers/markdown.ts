import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { highlightCode } from "../highlight.js";
import { escapeHtml } from "../html.js";

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
  allowedStyles: { "*": { color: HEX_OR_RGB, "background-color": HEX_OR_RGB } },
  allowedSchemes: ["http", "https", "mailto"],
};

/**
 * Render GitHub-flavored Markdown to sanitized inner HTML (no wrapping element):
 * Shiki-highlighted fenced code, in-page `#fragment` cross-links preserved, and
 * scripts / event handlers / javascript: URLs stripped.
 */
export async function renderMarkdown(
  markdown: string,
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
        const t = token as { text: string; highlighted?: string };
        return t.highlighted ?? `<pre class="shiki-plain">${escapeHtml(t.text)}</pre>`;
      },
    },
  });
  const body = (await md.parse(markdown)) as string;
  return sanitizeHtml(body, SANITIZE_OPTS);
}

/** Render a short Markdown string as sanitized INLINE HTML (no <p> wrapper) — for headlines,
 *  list items, and other one-line strings. inline `code`, **bold**, links, etc. survive;
 *  scripts / handlers / javascript: URLs are stripped (same policy as renderMarkdown). */
export async function renderInlineMarkdown(markdown: string): Promise<string> {
  const md = new Marked({ async: true });
  const body = (await md.parseInline(markdown)) as string;
  return sanitizeHtml(body, SANITIZE_OPTS);
}

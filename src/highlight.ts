import type { Highlighter } from "shiki";
import { createHighlighter } from "shiki";
import { escapeHtml } from "./html.js";

const THEME = "github-light";
const LANGS = [
  "ts", "tsx", "js", "jsx", "prisma", "sql",
  "json", "bash", "diff", "css", "html", "markdown",
];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: [THEME], langs: LANGS });
  }
  return highlighterPromise;
}

const EXT_TO_LANG: Record<string, string> = {
  ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", mjs: "js", cjs: "js",
  prisma: "prisma", sql: "sql", json: "json", sh: "bash", bash: "bash",
  css: "css", html: "html", md: "markdown",
};

/** Map a file path's extension to a Shiki language id; unknown -> "text". */
export function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "text";
}

function isLoaded(hl: Highlighter, lang: string): boolean {
  return lang !== "text" && hl.getLoadedLanguages().includes(lang);
}

/** Full highlighted block: returns a Shiki <pre>, or an escaped plain <pre> on failure. */
export async function highlightCode(
  code: string,
  lang: string,
  onWarn?: (msg: string) => void,
): Promise<string> {
  try {
    const hl = await getHighlighter();
    if (!isLoaded(hl, lang)) {
      if (lang !== "text") onWarn?.(`highlight: language "${lang}" not loaded; rendering plain`);
      return `<pre class="shiki-plain">${escapeHtml(code)}</pre>`;
    }
    return hl.codeToHtml(code, { lang, theme: THEME });
  } catch (err) {
    onWarn?.(`highlight: failed (${(err as Error).message}); rendering plain`);
    return `<pre class="shiki-plain">${escapeHtml(code)}</pre>`;
  }
}

/**
 * Highlight `code` and return the inner HTML of each source line (Shiki wraps each
 * line in <span class="line">...</span>). Returns null — signalling the caller to
 * fall back to escaped plaintext — for an unloaded language, a Shiki error, or a
 * line-count mismatch.
 */
export async function highlightLines(
  code: string,
  lang: string,
  onWarn?: (msg: string) => void,
): Promise<string[] | null> {
  const expected = code.split("\n").length;
  try {
    const hl = await getHighlighter();
    if (!isLoaded(hl, lang)) {
      if (lang !== "text") onWarn?.(`highlight: language "${lang}" not loaded; falling back`);
      return null;
    }
    const html = hl.codeToHtml(code, { lang, theme: THEME });
    const inner = html.match(/<code[^>]*>([\s\S]*)<\/code>/);
    if (!inner) return null;
    const spans = inner[1].split("\n");
    if (spans.length !== expected) {
      onWarn?.(`highlight: line count mismatch (${spans.length} vs ${expected}); falling back`);
      return null;
    }
    return spans.map((s) =>
      s.replace(/^<span class="line">/, "").replace(/<\/span>$/, ""),
    );
  } catch (err) {
    onWarn?.(`highlight: failed (${(err as Error).message}); falling back`);
    return null;
  }
}

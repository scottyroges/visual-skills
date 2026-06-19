import { escapeHtml } from "../html.js";
import type { DiffBlock, DiffHunk } from "../blocks.js";

interface Row { t: "h" | "+" | "-" | " "; text: string; }

function rows(hunks: DiffHunk[]): Row[] {
  const out: Row[] = [];
  for (const h of hunks) {
    out.push({ t: "h", text: h.header });
    for (const l of h.lines) {
      const t = l[0] === "+" ? "+" : l[0] === "-" ? "-" : " ";
      out.push({ t, text: l.slice(1) });
    }
  }
  return out;
}

export function renderDiffBody(d: DiffBlock): string {
  let oldNo = 0, newNo = 0;
  const html = rows(d.hunks).map((l) => {
    if (l.t === "h") {
      const m = l.text.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) { oldNo = +m[1]; newNo = +m[2]; }
      return `<span class="dl dl-hunk"><span class="dn"></span><span class="dn"></span><span class="dg"></span><span class="dc">${escapeHtml(l.text)}</span></span>`;
    }
    let o = "", n = "";
    if (l.t === "+") n = String(newNo++);
    else if (l.t === "-") o = String(oldNo++);
    else { o = String(oldNo++); n = String(newNo++); }
    const cls = l.t === "+" ? "dl-add" : l.t === "-" ? "dl-del" : "dl-ctx";
    const g = l.t === " " ? "" : l.t;
    return `<span class="dl ${cls}"><span class="dn">${o}</span><span class="dn">${n}</span><span class="dg">${g}</span><span class="dc">${escapeHtml(l.text) || " "}</span></span>`;
  }).join("");
  return `<div class="diff-code"><div class="diff-pre">${html}</div></div>`;
}

// render-diagram.ts
//
// Dual diagram renderer for the visual-plan / visual-recap skills.
//
//   D2 sketch  = the dependable floor. Renders every diagram type in a
//                hand-drawn style via the `d2` binary. No browser, fast.
//   Excalidraw = a per-block upgrade. For flowchart-class diagrams only,
//                produces a real, *editable* .excalidraw scene (+ an SVG
//                for inline display). Falls back to the D2 svg on any error,
//                so a block is never broken and never changes aesthetic.
//
// Routing is by diagram KIND, not by "is the toolchain available" — because
// mermaid-to-excalidraw silently rasterizes unsupported types (ERD, stateDiagram)
// into a non-editable image instead of failing, which is worse than D2's native
// sketch. So only the kinds it converts to native editable elements (flowchart,
// architecture, sequence, class) are eligible for the upgrade.
//
// Prereqs in your env:
//   - `d2` on PATH                         (https://d2lang.com, single Go binary)
//   - npm i @excalidraw/excalidraw @excalidraw/mermaid-to-excalidraw playwright
//   - an excalidraw-bundle.html that loads the two UMD globals (see EXCALIDRAW_PAGE)
//
// The Excalidraw upgrade is OPT-IN: run `npm run setup:excalidraw` to install the
// toolchain and build assets/excalidraw-bundle.js. Without it, excalidrawReady()
// returns false and rendering falls back to the D2 SVG floor (no crash).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, mkdtemp, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiagramBlock, SchemaBlock } from "./blocks.js";
import { D2_CLASS_PRELUDE, INK } from "./diagram-colors.js";

const exec = promisify(execFile);

export interface DiagramResult {
  id: string;
  title: string;
  svg: string;
  editable: string | null;
  renderer: "d2" | "excalidraw";
  failed?: boolean;
}

export interface RenderOpts {
  outDir?: string;
  excalidraw?: boolean;
  onWarn?: (msg: string) => void;
}

/** Injectable seam for the Excalidraw browser path, so it can be unit-tested. */
export interface RenderDeps {
  ready?: () => Promise<boolean>;
  convert?: (mermaid: string) => Promise<{ svg: string; scene: unknown }>;
}

// Kinds mermaid-to-excalidraw converts to native EDITABLE elements: flowchart, sequence,
// class (and our "architecture", authored as a mermaid flowchart). Everything else (erd,
// and any stateDiagram-authored mermaid) rasterizes to a non-editable image, so it stays
// on the D2 floor. State machines are authored as flowcharts precisely to remain editable.
const EXCALIDRAW_EDITABLE = new Set<string>(["flowchart", "architecture", "sequence", "class"]);
const EXCALIDRAW_PAGE = join(import.meta.dirname ?? ".", "..", "assets", "excalidraw-bundle.html");

/** A minimal valid SVG shown when a diagram fails to render — keeps the document unbroken. */
function placeholderSvg(title: string, message: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="80" role="img">` +
    `<rect width="420" height="80" fill="#fff8c5" stroke="#d4a72c"/>` +
    `<text x="12" y="32" font-family="sans-serif" font-size="13" fill="#9a6700">` +
    `&#9888; ${esc(title)}: failed to render</text>` +
    `<text x="12" y="54" font-family="monospace" font-size="11" fill="#9a6700">${esc(message).slice(0, 70)}</text>` +
    `</svg>`
  );
}

/** Render a single diagram/schema block. Always produces a D2 sketch SVG floor. */
export async function renderDiagram(
  block: DiagramBlock | SchemaBlock,
  opts: RenderOpts = {},
  deps: RenderDeps = {},
): Promise<DiagramResult> {
  const ready = deps.ready ?? excalidrawReady;
  const convert = deps.convert ?? renderViaExcalidraw;
  const { id, title, kind, d2 } = block;
  const mermaid = "mermaid" in block ? block.mermaid : undefined;
  if (!d2) throw new Error(`block "${id}": every diagram block needs a d2 source (the floor)`);

  // 1. Floor: compile the D2 sketch SVG. On failure, degrade to a placeholder
  //    (warn + visible error box) so a single bad diagram never breaks the document.
  let d2Svg: string;
  try {
    d2Svg = await renderViaD2(d2);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    opts.onWarn?.(`block "${id}": d2 failed to compile (${message}); using placeholder`);
    return { id, title, svg: placeholderSvg(title, message), editable: null, renderer: "d2", failed: true };
  }

  // 2. Upgrade: editable Excalidraw, only when eligible + the opt-in toolchain is present.
  const eligible = !!mermaid && EXCALIDRAW_EDITABLE.has(kind) && opts.excalidraw !== false;
  if (eligible && (await ready())) {
    try {
      const { svg, scene } = await convert(mermaid!);
      const editFile = join(opts.outDir ?? ".", `${id}.excalidraw`);
      await writeFile(editFile, JSON.stringify(scene, null, 2));
      return { id, title, svg, editable: editFile, renderer: "excalidraw" };
    } catch (err) {
      // Same-aesthetic fallback to the D2 svg we already have in hand.
      opts.onWarn?.(`block "${id}": excalidraw failed (${err instanceof Error ? err.message : String(err)}); using d2`);
    }
  }
  return { id, title, svg: d2Svg, editable: null, renderer: "d2" };
}

/** Render many blocks, preserving order. */
export async function renderAll(
  blocks: (DiagramBlock | SchemaBlock)[],
  opts: RenderOpts = {},
): Promise<DiagramResult[]> {
  return Promise.all(blocks.map((b) => renderDiagram(b, opts)));
}

// ── D2 floor ────────────────────────────────────────────────────────────────

async function renderViaD2(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "d2-"));
  try {
    const inFile = join(dir, "in.d2");
    const outFile = join(dir, "out.svg");
    // Prepend the shared semantic-color classes so any diagram can apply `class: <role>`.
    // Sources must NOT define their own top-level `classes:` block — d2 silently merges/overrides
    // (no error), which would let a recipe shadow the canonical palette. Recipes only *apply* classes.
    await writeFile(inFile, `${D2_CLASS_PRELUDE}\n${source}`);
    // Clean (non-sketch) rendering for the review aesthetic.
    await exec("d2", ["--theme", "0", "--pad", "24", inFile, outFile]);
    const svg = await readFile(outFile, "utf8");
    // d2 always embeds `.sketch-overlay-*` CSS rules in its stylesheet template, even without
    // --sketch. They reference sketch-only `#streaks-*` gradients and are never applied here, so
    // strip them to keep the clean output free of any hand-drawn styling.
    return svg.replace(/\.sketch-overlay-[^{]+\{[^}]*\}/g, "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ── Excalidraw upgrade (opt-in; see `npm run setup:excalidraw`) ───────────────

let _excalidrawCache: boolean | undefined;
async function excalidrawReady(): Promise<boolean> {
  if (_excalidrawCache !== undefined) return _excalidrawCache;
  try {
    await access(EXCALIDRAW_PAGE);
    await import("playwright" as string); // present?
    _excalidrawCache = true;
  } catch {
    _excalidrawCache = false;
  }
  return _excalidrawCache;
}

async function renderViaExcalidraw(mermaidSource: string): Promise<{ svg: string; scene: unknown }> {
  const { chromium } = await import("playwright" as string);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto("file://" + EXCALIDRAW_PAGE);
    return await page.evaluate(async ({ src, ink }: { src: string; ink: string }) => {
      const win = globalThis as any; // browser `window` in the evaluate context
      const { parseMermaidToExcalidraw } = win.MermaidToExcalidrawLib;
      const { convertToExcalidrawElements, exportToSvg } = win.ExcalidrawLib;
      // skeleton → fully-qualified elements (two-step, per the library's API)
      const { elements: skeleton, files } = await parseMermaidToExcalidraw(src, {
        themeVariables: { fontSize: "20px" },
      });
      const elements = convertToExcalidrawElements(skeleton);
      // mermaid-to-excalidraw colors a label's text with its node's STROKE color (e.g. a `changed`
      // node gets orange text on a yellow fill — unreadable). Excalidraw uses an element's
      // strokeColor as its text color, so force every text element to dark ink for legibility.
      // This carries into both the inline SVG and the editable .excalidraw scene.
      for (const el of elements) {
        if (el && el.type === "text") el.strokeColor = ink;
      }
      // The editable artifact you can reopen in excalidraw.com / VS Code.
      const scene = {
        type: "excalidraw", version: 2, source: "visual-skill",
        elements, appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: files ?? {},
      };
      // The inline display artifact.
      const svgEl = await exportToSvg({
        elements, files: files ?? {},
        appState: { exportWithDarkMode: false, exportBackground: true, viewBackgroundColor: "#ffffff" },
      });
      return { svg: (svgEl as any).outerHTML, scene };
    }, { src: mermaidSource, ink: INK });
  } finally {
    await browser.close();
  }
}

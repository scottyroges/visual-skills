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
// mermaid-to-excalidraw silently rasterizes ERDs/sequence diagrams instead of
// failing, which is worse than D2's native sketch. So only the kinds it
// converts to native editable elements are eligible for the upgrade.
//
// Prereqs in your env:
//   - `d2` on PATH                         (https://d2lang.com, single Go binary)
//   - npm i @excalidraw/excalidraw @excalidraw/mermaid-to-excalidraw playwright
//   - an excalidraw-bundle.html that loads the two UMD globals (see EXCALIDRAW_PAGE)
//
// The Excalidraw upgrade path is retained but DORMANT this slice: playwright is
// not installed and assets/excalidraw-bundle.html does not exist, so
// excalidrawReady() returns false and rendering always falls back to the D2 SVG.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, mkdtemp, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiagramBlock, SchemaBlock } from "./blocks.js";

const exec = promisify(execFile);

export interface DiagramResult {
  id: string;
  title: string;
  svg: string;
  editable: string | null;
  renderer: "d2" | "excalidraw";
}

export interface RenderOpts {
  outDir?: string;
  excalidraw?: boolean;
  onWarn?: (msg: string) => void;
}

// Kinds mermaid-to-excalidraw turns into native editable elements. Conservative
// on purpose — anything not here goes to D2. (Dormant this slice.)
const EXCALIDRAW_EDITABLE = new Set<string>(["flowchart", "architecture"]);
const EXCALIDRAW_PAGE = join(import.meta.dirname ?? ".", "..", "assets", "excalidraw-bundle.html");

/** Render a single diagram/schema block. Always produces a D2 sketch SVG floor. */
export async function renderDiagram(
  block: DiagramBlock | SchemaBlock,
  opts: RenderOpts = {},
): Promise<DiagramResult> {
  const { id, title, kind, d2 } = block;
  const mermaid = "mermaid" in block ? block.mermaid : undefined;
  if (!d2) throw new Error(`block "${id}": every diagram block needs a d2 source (the floor)`);

  // 1. Floor: always compile the D2 sketch SVG. Guaranteed, no browser.
  const d2Svg = await renderViaD2(d2);

  // 2. Upgrade: editable Excalidraw, only when eligible + toolchain present (dormant).
  const eligible = !!mermaid && EXCALIDRAW_EDITABLE.has(kind) && opts.excalidraw !== false;
  if (eligible && (await excalidrawReady())) {
    try {
      const { svg, scene } = await renderViaExcalidraw(mermaid!);
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
    await writeFile(inFile, source);
    // --sketch = hand-drawn; theme 0 neutral; pad for breathing room.
    await exec("d2", ["--sketch", "--theme", "0", "--pad", "24", inFile, outFile]);
    return await readFile(outFile, "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ── Excalidraw upgrade (dormant this slice) ──────────────────────────────────

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
    return await page.evaluate(async (src: string) => {
      const win = globalThis as any; // browser `window` in the evaluate context
      const { parseMermaidToExcalidraw } = win.MermaidToExcalidrawLib;
      const { convertToExcalidrawElements, exportToSvg } = win.ExcalidrawLib;
      // skeleton → fully-qualified elements (two-step, per the library's API)
      const { elements: skeleton, files } = await parseMermaidToExcalidraw(src, {
        themeVariables: { fontSize: "20px" },
      });
      const elements = convertToExcalidrawElements(skeleton);
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
    }, mermaidSource);
  } finally {
    await browser.close();
  }
}

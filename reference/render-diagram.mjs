// render-diagram.mjs
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
// Block contract (authored by the agent):
//   {
//     id:      'arch-overview',
//     title:   'Request lifecycle',
//     kind:    'flowchart' | 'architecture' | 'sequence' | 'erd' | 'class',
//     d2:      '<D2 source>',        // REQUIRED — floor + fallback
//     mermaid: '<Mermaid source>',   // OPTIONAL — only for editable-eligible kinds
//   }
//
// Prereqs in your env (could not be exercised in the build sandbox — d2's
// release host and chromium are outside its network allowlist, so treat this
// as a v1 to run locally):
//   - `d2` on PATH                         (https://d2lang.com, single Go binary)
//   - npm i @excalidraw/excalidraw @excalidraw/mermaid-to-excalidraw playwright
//   - an excalidraw-bundle.html that loads the two UMD globals (see EXCALIDRAW_PAGE)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

// Kinds that mermaid-to-excalidraw turns into native, editable elements.
// Sequence/class support exists but is partial across versions; ERD has no
// converter at all. Keep this conservative — anything not here goes to D2.
const EXCALIDRAW_EDITABLE = new Set(['flowchart', 'architecture']);

// A static HTML file you ship alongside the skill that loads the UMD builds:
//   window.ExcalidrawLib            (from @excalidraw/excalidraw)
//   window.MermaidToExcalidrawLib   (from @excalidraw/mermaid-to-excalidraw)
const EXCALIDRAW_PAGE =
  join(import.meta.dirname ?? '.', 'assets', 'excalidraw-bundle.html');

/**
 * Render a single diagram block.
 * @returns {{ id, title, svg, editable: string|null, renderer: 'excalidraw'|'d2' }}
 */
export async function renderDiagram(block, opts = {}) {
  const { id, title, kind, d2, mermaid } = block;
  if (!d2) {
    throw new Error(`block "${id}": every diagram block needs a d2 source (the floor)`);
  }

  // 1. Floor: always compile the D2 sketch SVG. Guaranteed, no browser.
  const d2Svg = await renderViaD2(d2);

  // 2. Upgrade: editable Excalidraw, only when eligible + toolchain present.
  const eligible =
    mermaid && EXCALIDRAW_EDITABLE.has(kind) && opts.excalidraw !== false;

  if (eligible && (await excalidrawReady())) {
    try {
      const { svg, scene } = await renderViaExcalidraw(mermaid);
      const editFile = join(opts.outDir ?? '.', `${id}.excalidraw`);
      await writeFile(editFile, JSON.stringify(scene, null, 2));
      return { id, title, svg, editable: editFile, renderer: 'excalidraw' };
    } catch (err) {
      // Same-aesthetic fallback to the D2 svg we already have in hand.
      opts.onWarn?.(`block "${id}": excalidraw failed (${err.message}); using d2`);
    }
  }

  return { id, title, svg: d2Svg, editable: null, renderer: 'd2' };
}

/** Render many blocks, preserving order. */
export async function renderAll(blocks, opts = {}) {
  return Promise.all(blocks.map((b) => renderDiagram(b, opts)));
}

// ── D2 floor ────────────────────────────────────────────────────────────────

async function renderViaD2(source) {
  const dir = await mkdtemp(join(tmpdir(), 'd2-'));
  const inFile = join(dir, 'in.d2');
  const outFile = join(dir, 'out.svg');
  await writeFile(inFile, source);
  // --sketch = hand-drawn; theme 0 is the neutral default; pad for breathing room.
  await exec('d2', ['--sketch', '--theme', '0', '--pad', '24', inFile, outFile]);
  return readFile(outFile, 'utf8');
}

// ── Excalidraw upgrade ───────────────────────────────────────────────────────

let _excalidrawCache;
async function excalidrawReady() {
  if (_excalidrawCache !== undefined) return _excalidrawCache;
  try {
    await access(EXCALIDRAW_PAGE);
    await import('playwright'); // present?
    _excalidrawCache = true;
  } catch {
    _excalidrawCache = false;
  }
  return _excalidrawCache;
}

async function renderViaExcalidraw(mermaidSource) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('file://' + EXCALIDRAW_PAGE);

    return await page.evaluate(async (src) => {
      const { parseMermaidToExcalidraw } = window.MermaidToExcalidrawLib;
      const { convertToExcalidrawElements, exportToSvg } = window.ExcalidrawLib;

      // skeleton → fully-qualified elements (two-step, per the library's API)
      const { elements: skeleton, files } = await parseMermaidToExcalidraw(src, {
        themeVariables: { fontSize: '20px' },
      });
      const elements = convertToExcalidrawElements(skeleton);

      // The editable artifact you can reopen in excalidraw.com / VS Code.
      const scene = {
        type: 'excalidraw',
        version: 2,
        source: 'visual-skill',
        elements,
        appState: { viewBackgroundColor: '#ffffff', gridSize: null },
        files: files ?? {},
      };

      // The inline display artifact.
      const svgEl = await exportToSvg({
        elements,
        files: files ?? {},
        appState: {
          exportWithDarkMode: false,
          exportBackground: true,
          viewBackgroundColor: '#ffffff',
        },
      });

      return { svg: svgEl.outerHTML, scene };
    }, mermaidSource);
  } finally {
    await browser.close();
  }
}

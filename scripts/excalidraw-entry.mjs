// Bundled by scripts/setup-excalidraw.mjs into assets/excalidraw-bundle.js (IIFE).
// Exposes the two globals that src/render-diagram.ts reads inside page.evaluate.
import * as ExcalidrawLib from "@excalidraw/excalidraw";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

window.ExcalidrawLib = ExcalidrawLib;
window.MermaidToExcalidrawLib = { parseMermaidToExcalidraw };

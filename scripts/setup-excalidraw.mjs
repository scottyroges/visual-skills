#!/usr/bin/env node
// Opt-in installer for the Excalidraw editable-diagram upgrade. Heavy deps live
// here, NOT in the default install. Run with: npm run setup:excalidraw
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", cwd: root });

const PINNED = [
  "@excalidraw/excalidraw@^0.18.0",
  "@excalidraw/mermaid-to-excalidraw@^1.1.2",
  "react@^18.3.1",
  "react-dom@^18.3.1",
  "playwright@^1.48.0",
  "esbuild@^0.24.0",
];

console.log("Installing opt-in Excalidraw deps (not saved to package.json)...");
run("npm", ["install", "--no-save", ...PINNED]);

console.log("Installing Chromium for Playwright...");
run("npx", ["playwright", "install", "chromium"]);

console.log("Bundling the offline Excalidraw page...");
const esbuild = await import("esbuild");
await esbuild.build({
  entryPoints: [join(root, "scripts", "excalidraw-entry.mjs")],
  bundle: true,
  format: "iife",
  outfile: join(root, "assets", "excalidraw-bundle.js"),
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});

console.log("Done. The editable upgrade is now active for flowchart/architecture diagrams.");

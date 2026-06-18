// Single source of truth for the semantic diagram palette. PALETTE drives both the d2
// `classes` prelude (injected into every render) and the matching mermaid classDefs, so the
// two representations can never drift. "changed" is bold (the subject pops); the rest are soft.
export type ColorRole = "changed" | "added" | "removed" | "actor" | "external" | "store";

export const PALETTE: Record<ColorRole, { fill: string; stroke: string; bold?: boolean }> = {
  changed: { fill: "#ffd43b", stroke: "#f08c00", bold: true },
  added: { fill: "#d3f9d8", stroke: "#37b24d" },
  removed: { fill: "#ffe3e3", stroke: "#f03e3e" },
  actor: { fill: "#d0ebff", stroke: "#4dabf7" },
  external: { fill: "#f1f3f5", stroke: "#adb5bd" },
  store: { fill: "#e5dbff", stroke: "#9775fa" },
};

const ROLES = Object.keys(PALETTE) as ColorRole[];

/** d2 `classes {}` block prepended to every diagram so recipes can apply `class: <role>`. */
export const D2_CLASS_PRELUDE: string = [
  "classes: {",
  ...ROLES.map((r) => {
    const { fill, stroke, bold } = PALETTE[r];
    const sw = bold ? "; stroke-width: 2" : "";
    return `  ${r}: { style: { fill: "${fill}"; stroke: "${stroke}"${sw} } }`;
  }),
  "}",
].join("\n");

/** Matching mermaid classDefs. Include in a flowchart/graph mermaid (+ `class X <role>;`) to keep
 *  the editable Excalidraw scene colored (verified: classDef fills convert to native elements). */
export const MERMAID_CLASSDEFS: string = ROLES.map((r) => {
  const { fill, stroke, bold } = PALETTE[r];
  const sw = bold ? ",stroke-width:2px" : "";
  return `classDef ${r} fill:${fill},stroke:${stroke}${sw};`;
}).join("\n");

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

/** Dark ink for diagram label text — guarantees readable contrast on every role's fill. */
export const INK = "#1b1b1b";

const ROLES = Object.keys(PALETTE) as ColorRole[];

/** d2 `classes {}` block prepended to every diagram so recipes can apply `class: <role>`. */
export const D2_CLASS_PRELUDE: string = [
  "classes: {",
  ...ROLES.map((r) => {
    const { fill, stroke, bold } = PALETTE[r];
    const sw = bold ? "; stroke-width: 2" : "";
    return `  ${r}: { style: { fill: "${fill}"; stroke: "${stroke}"; font-color: "${INK}"${sw} } }`;
  }),
  "}",
].join("\n");

/** Matching mermaid classDefs. Include in a flowchart/graph mermaid (+ `class X <role>;`) to keep
 *  the editable Excalidraw scene colored (verified: classDef fills convert to native elements). */
export const MERMAID_CLASSDEFS: string = ROLES.map((r) => {
  const { fill, stroke, bold } = PALETTE[r];
  const sw = bold ? ",stroke-width:2px" : "";
  return `classDef ${r} fill:${fill},stroke:${stroke},color:${INK}${sw};`;
}).join("\n");

/** Human-readable legend labels per role. */
export const ROLE_LABELS: Record<ColorRole, string> = {
  changed: "Changed",
  added: "Added",
  removed: "Removed",
  actor: "Actor",
  external: "External",
  store: "Datastore",
};

/** Detect which palette roles a diagram APPLIES (not merely defines), so a legend can list
 *  only the roles actually used. Scans d2 (`class: role`) and mermaid (`x:::role`, `class a,b role;`),
 *  excluding mermaid `classDef role` definitions. Returns roles in canonical PALETTE order. */
export function rolesInSource(d2?: string, mermaid?: string): ColorRole[] {
  const found = new Set<string>();
  const add = (name: string) => { if ((ROLES as string[]).includes(name)) found.add(name); };
  const scan = (src?: string) => {
    if (!src) return;
    let m: RegExpExecArray | null;
    const reD2 = /class:\s*([a-zA-Z]+)/g;                 // d2: `class: changed`
    while ((m = reD2.exec(src))) add(m[1]);
    const reTriple = /:::([a-zA-Z]+)/g;                   // mermaid: `node:::changed`
    while ((m = reTriple.exec(src))) add(m[1]);
    const reClass = /(?<!Def)\bclass\s+[^\n]+?\s+([a-zA-Z]+)\s*;?\s*$/gm; // mermaid: `class a,b changed;` (not classDef)
    while ((m = reClass.exec(src))) add(m[1]);
  };
  scan(d2);
  scan(mermaid);
  return ROLES.filter((r) => found.has(r));
}

/** Roles to list in the legend for the ARTIFACT actually rendered. The d2 SVG carries d2
 *  `class:` colors; the Excalidraw scene carries only the mermaid `classDef` colors — so a
 *  mermaid sequence (no class mechanism) renders colorless and must show no legend, even though
 *  its d2 floor defines roles. Keying off the renderer keeps the legend honest. */
export function legendRolesForRender(
  d2: string,
  mermaid: string | undefined,
  renderer: "d2" | "excalidraw",
): ColorRole[] {
  return renderer === "excalidraw" ? rolesInSource(undefined, mermaid) : rolesInSource(d2, undefined);
}

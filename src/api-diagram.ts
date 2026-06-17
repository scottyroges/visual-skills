import type { ApiProcedure, DiagramBlock } from "./blocks.js";

const FILL: Record<string, string> = {
  added: "#e6ffec",
  removed: "#ffebe9",
  changed: "#fffdf3",
};

function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function safeId(s: string): string {
  return s.replace(/[^A-Za-z0-9_]/g, "_");
}

function routerOf(name: string): { router: string; proc: string } {
  const i = name.indexOf(".");
  return i < 0 ? { router: "root", proc: name } : { router: name.slice(0, i), proc: name.slice(i + 1) };
}

/** Build an architecture diagram of the changed API surface (d2 floor + mermaid upgrade). */
export function apiSurfaceDiagram(
  procedures: ApiProcedure[],
  id = "api-surface",
  title = "API surface",
): DiagramBlock | null {
  if (procedures.length === 0) return null;

  const groups = new Map<string, { proc: string; change?: string }[]>();
  for (const p of procedures) {
    const { router, proc } = routerOf(p.name);
    const arr = groups.get(router) ?? [];
    arr.push({ proc, change: p.change });
    groups.set(router, arr);
  }

  // ---- d2 floor ----
  const d2: string[] = ["direction: right", "client"];
  for (const [router, procs] of groups) {
    const lines = [`${q(router)}: {`];
    for (const { proc, change } of procs) {
      lines.push(
        change && FILL[change]
          ? `  ${q(proc)}: { style.fill: ${q(FILL[change])} }`
          : `  ${q(proc)}`,
      );
    }
    lines.push("}");
    d2.push(lines.join("\n"));
    d2.push(`client -> ${q(router)}`);
  }

  // ---- mermaid upgrade ----
  const m: string[] = ["graph LR", "  client"];
  const classes: string[] = [];
  for (const [router, procs] of groups) {
    const rid = safeId(router);
    m.push(`  client --> ${rid}`);
    m.push(`  subgraph ${rid}[${router}]`);
    for (const { proc, change } of procs) {
      const nid = `${rid}_${safeId(proc)}`;
      m.push(`    ${nid}["${proc}"]`);
      if (change && FILL[change]) classes.push(`  class ${nid} ${change};`);
    }
    m.push("  end");
  }
  m.push("classDef added fill:#e6ffec;");
  m.push("classDef removed fill:#ffebe9;");
  m.push("classDef changed fill:#fffdf3;");
  m.push(...classes);

  return { type: "diagram", id, kind: "architecture", title, d2: d2.join("\n"), mermaid: m.join("\n") };
}

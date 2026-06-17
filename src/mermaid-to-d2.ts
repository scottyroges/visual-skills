const DIR: Record<string, string> = { TD: "down", TB: "down", BT: "up", LR: "right", RL: "left" };

function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// A node piece: an id with an optional bracketed label, e.g. A, A[Label], A(Label),
// A{Label}, A((Label)). Returns null if the piece is not a valid node.
const NODE = /^([A-Za-z0-9_]+)(?:(?:\[\[|\(\(|\{\{|\[|\(|\{)([^\]\)}]*)(?:\]\]|\)\)|\}\}|\]|\)|\}))?$/;

// A single edge label carried in pipes immediately after an arrow: |label| Node
function splitSeg(seg: string): { label?: string; node: string } {
  const m = seg.trim().match(/^\|([^|]*)\|\s*(.*)$/);
  return m ? { label: m[1], node: m[2].trim() } : { node: seg.trim() };
}

/**
 * Convert the common mermaid flowchart subset to D2. Returns null for anything
 * outside the subset (caller should then leave the fence as inline code).
 */
export function mermaidFlowchartToD2(mermaid: string): string | null {
  const lines = mermaid
    .split("\n")
    .flatMap((l) => l.split(";"))
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("%%"));
  if (lines.length === 0) return null;

  const header = lines[0].match(/^(?:graph|flowchart)\s+(TD|TB|BT|LR|RL)\b/i);
  if (!header) return null;
  const direction = DIR[header[1].toUpperCase()];

  const labels = new Map<string, string>();
  const order: string[] = [];
  const edges: { from: string; to: string; label?: string }[] = [];

  function takeNode(piece: string): string | null {
    const m = piece.trim().match(NODE);
    if (!m) return null;
    const id = m[1];
    if (m[2] !== undefined && m[2] !== "") labels.set(id, m[2]);
    if (!order.includes(id)) order.push(id);
    return id;
  }

  const ARROW = /\s*(?:-\.->|-->|---|==>)\s*/;

  for (const line of lines.slice(1)) {
    const segs = line.split(ARROW);
    if (segs.length < 2) {
      // standalone node declaration
      if (takeNode(line) === null) return null;
      continue;
    }
    let prevId = takeNode(splitSeg(segs[0]).node);
    if (prevId === null) return null;
    for (let i = 1; i < segs.length; i++) {
      const cur = splitSeg(segs[i]);
      const curId = takeNode(cur.node);
      if (curId === null) return null;
      edges.push({ from: prevId, to: curId, label: cur.label || undefined });
      prevId = curId;
    }
  }

  if (order.length === 0) return null;

  const out: string[] = [`direction: ${direction}`];
  for (const id of order) {
    const label = labels.get(id);
    out.push(label !== undefined ? `${q(id)}: ${q(label)}` : q(id));
  }
  for (const e of edges) {
    const base = `${q(e.from)} -> ${q(e.to)}`;
    out.push(e.label ? `${base}: ${q(e.label)}` : base);
  }
  return out.join("\n");
}

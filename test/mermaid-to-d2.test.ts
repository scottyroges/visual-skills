import { describe, it, expect } from "vitest";
import { mermaidFlowchartToD2 } from "../src/mermaid-to-d2.js";
import { renderDiagram } from "../src/render-diagram.js";

describe("mermaidFlowchartToD2", () => {
  it("converts a simple graph with labels, edge labels, and direction", () => {
    const d2 = mermaidFlowchartToD2("graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C(Done)");
    expect(d2).not.toBeNull();
    expect(d2).toContain("direction: down");
    expect(d2).toContain('"A": "Start"');
    expect(d2).toContain('"A" -> "B"');
    expect(d2).toContain('"B" -> "C": "yes"');
  });

  it("maps LR/RL/BT directions", () => {
    expect(mermaidFlowchartToD2("graph LR\nA-->B")).toContain("direction: right");
    expect(mermaidFlowchartToD2("flowchart RL\nA-->B")).toContain("direction: left");
    expect(mermaidFlowchartToD2("graph BT\nA-->B")).toContain("direction: up");
  });

  it("handles chained edges on one line", () => {
    const d2 = mermaidFlowchartToD2("graph LR\nA-->B-->C")!;
    expect(d2).toContain('"A" -> "B"');
    expect(d2).toContain('"B" -> "C"');
  });

  it("returns null for non-flowchart or unsupported syntax", () => {
    expect(mermaidFlowchartToD2("sequenceDiagram\nAlice->>John: Hi")).toBeNull();
    expect(mermaidFlowchartToD2("erDiagram\nA ||--o{ B : has")).toBeNull();
    expect(mermaidFlowchartToD2("not a diagram at all")).toBeNull();
    expect(mermaidFlowchartToD2("graph TD\nA & B --> C")).toBeNull();
  });

  it("emits d2 that compiles via the d2 binary", async () => {
    const d2 = mermaidFlowchartToD2("graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C(Done)")!;
    const out = await renderDiagram(
      { type: "diagram", id: "m", title: "m", kind: "flowchart", d2 },
      { excalidraw: false },
    );
    expect(out.svg).toMatch(/<svg/);
    expect(out.svg).not.toContain("failed to render");
  }, 30_000);
});

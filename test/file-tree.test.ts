import { describe, it, expect } from "vitest";
import { renderFileTree } from "../src/renderers/file-tree.js";
import type { FileTreeBlock } from "../src/blocks.js";

describe("renderFileTree", () => {
  it("renders a nested tree with status markers and +/- badges", () => {
    const block: FileTreeBlock = {
      type: "file-tree", id: "ft", title: "Files",
      files: [
        { path: "src/lib/paypal.ts", status: "A", added: 174, deleted: 0 },
        { path: "src/lib/stripe.ts", status: "D", added: 0, deleted: 14 },
        { path: "prisma/schema.prisma", status: "M", added: 2, deleted: 2 },
      ],
    };
    const html = renderFileTree(block);
    expect(html).toContain('class="vs-block vs-file-tree"');
    expect(html).toContain("paypal.ts");
    expect(html).toContain("+174");
    expect(html).toContain("-14");
    expect(html).toContain('data-status="A"');
    expect(html).toContain('data-status="D"');
    expect(html).toContain("src/lib");
  });

  it("links a filename to its diff when a path->id map entry exists; leaves others plain", () => {
    const block: FileTreeBlock = {
      type: "file-tree", id: "ft", title: "Files",
      files: [
        { path: "src/lib/paypal.ts", status: "A", added: 10, deleted: 0 },
        { path: "src/lib/stripe.ts", status: "D", added: 0, deleted: 4 },
      ],
    };
    const html = renderFileTree(block, new Map([["src/lib/paypal.ts", "diff-7"]]));
    expect(html).toContain('href="#diff-7"');         // linked file
    expect(html).toContain("paypal.ts");
    // stripe.ts has no map entry -> plain name, not a link to a diff
    expect(html).not.toContain('href="#stripe');
  });
});

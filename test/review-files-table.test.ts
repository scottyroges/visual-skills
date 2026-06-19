import { describe, it, expect } from "vitest";
import { renderFilesTable } from "../src/review/files-table.js";
import type { FileTreeBlock } from "../src/blocks.js";

const ft: FileTreeBlock = {
  type: "file-tree", id: "files", title: "Files changed",
  files: [{ path: "src/x.ts", status: "M", added: 5, deleted: 1 }],
};

describe("renderFilesTable", () => {
  it("renders a row with status, a path linked to its diff, and stats", () => {
    const html = renderFilesTable(ft, new Map([["src/x.ts", "diff-0"]]));
    expect(html).toContain('class="files-table"');
    expect(html).toContain('href="#diff-0"');
    expect(html).toContain("src/x.ts");
    expect(html).toContain("+5");
    expect(html).toContain("-1");
  });
});

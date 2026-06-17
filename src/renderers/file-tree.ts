import { escapeHtml } from "../html.js";
import type { FileChange, FileTreeBlock } from "../blocks.js";

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  file?: FileChange;
}

function buildTree(files: FileChange[]): TreeNode {
  const root: TreeNode = { name: "", children: new Map() };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, children: new Map() };
        node.children.set(part, child);
      }
      if (i === parts.length - 1) child.file = f;
      node = child;
    });
  }
  return root;
}

function renderFile(f: FileChange, name: string): string {
  const badge =
    `<span class="vs-badge vs-add">+${f.added}</span>` +
    `<span class="vs-badge vs-del">-${f.deleted}</span>`;
  return (
    `<li class="vs-file" data-status="${f.status}">` +
    `<span class="vs-marker">${f.status}</span> ` +
    `<span class="vs-name">${escapeHtml(name)}</span> ${badge}</li>`
  );
}

function renderNode(node: TreeNode): string {
  const items: string[] = [];
  for (const child of node.children.values()) {
    if (child.file) {
      items.push(renderFile(child.file, child.name));
      continue;
    }
    // Collapse single-child directory chains: src -> lib becomes "src/lib".
    let display = child.name;
    let dir = child;
    while (dir.children.size === 1) {
      const only = [...dir.children.values()][0];
      if (only.file) break;
      display += "/" + only.name;
      dir = only;
    }
    items.push(
      `<li class="vs-dir"><span class="vs-name">${escapeHtml(display)}</span>` +
        `<ul>${renderNode(dir)}</ul></li>`,
    );
  }
  return items.join("");
}

export function renderFileTree(block: FileTreeBlock): string {
  const tree = renderNode(buildTree(block.files));
  return (
    `<section class="vs-block vs-file-tree">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<ul class="vs-tree">${tree}</ul></section>`
  );
}

export type DiagramKind = "flowchart" | "architecture" | "sequence" | "erd" | "class";

export interface DiagramBlock {
  type: "diagram";
  id: string;
  title: string;
  kind: DiagramKind;
  d2: string;            // REQUIRED — the floor + fallback
  mermaid?: string;      // OPTIONAL — only for editable-eligible kinds (flowchart/architecture/sequence/class)
}

export interface SchemaBlock {
  type: "schema";
  id: string;
  title: string;
  kind: "erd";
  d2: string;            // ERD rendered via D2
}

export interface ApiProcedure {
  name: string;          // e.g. "league.captureOrder"
  auth: string;          // procedure-builder label: "public" | "protected" | "admin" | ... | "unknown"
  kind: "query" | "mutation" | "subscription" | "unknown";
  input: string;         // source text of the .input(...) argument, or "" if none
  change?: "added" | "removed" | "changed";
}

export interface ApiBlock {
  type: "api";
  id: string;
  title: string;
  procedures: ApiProcedure[];
}

export interface FileChange {
  path: string;
  status: "A" | "M" | "D" | "R";
  added: number;
  deleted: number;
}

export interface FileTreeBlock {
  type: "file-tree";
  id: string;
  title: string;
  files: FileChange[];
}

export interface DiffHunk {
  header: string;        // the @@ line
  lines: string[];       // raw diff lines incl. leading +/-/space
  annotation?: string;   // optional agent prose (empty in this slice)
}

export interface DiffBlock {
  type: "diff";
  id: string;
  title: string;
  path: string;
  description?: string;  // optional markdown "what & why", rendered above the hunks
  hunks: DiffHunk[];
}

export interface ProseBlock {
  type: "prose";
  id: string;
  markdown: string;
  title?: string;
}

export interface AnnotatedCodeBlock {
  type: "annotated-code";
  id: string;
  title: string;
  lang: string;
  code: string;
  annotations: { line: number; note: string }[];
}

export interface QuestionsBlock {
  type: "questions";
  id: string;
  title: string;
  questions: { question: string; recommendedDefault: string }[];
}

export interface GroupBlock {
  type: "group";
  id: string;
  title: string;
  blocks: Block[];   // one level of nesting — children are non-group blocks
}

export interface TabsBlock {
  type: "tabs";
  id: string;
  title?: string;
  // One level deep — each tab holds a single non-container block (typically a diagram).
  tabs: { label: string; block: Block }[];
}

export type Block =
  | DiagramBlock
  | SchemaBlock
  | ApiBlock
  | FileTreeBlock
  | DiffBlock
  | ProseBlock
  | AnnotatedCodeBlock
  | QuestionsBlock
  | GroupBlock
  | TabsBlock;

/** Blocks rendered through the D2 diagram renderer. */
export function isDiagramBlock(b: Block): b is DiagramBlock | SchemaBlock {
  return b.type === "diagram" || b.type === "schema";
}

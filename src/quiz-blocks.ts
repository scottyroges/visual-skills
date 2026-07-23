// Block model for the quiz renderer. A quiz page is an ordered array of these blocks;
// `assemble-quiz.ts` renders each to a section and derives the sidebar outline from them.
// Questions attach the shared annotated-code / diagram primitives by composition (the way
// atlas embeds DiagramBlock), so this union stays separate from the global Block union —
// see docs/superpowers/specs/2026-07-22-quiz-skill-design.md.
import type { AnnotatedCodeBlock, DiagramBlock, ProseBlock } from "./blocks.js";

export type QuizFamily = "system-fit" | "rationale" | "mechanism";

/** Structured citation — rendered as styled text, NEVER an external href (safe-link policy
 *  allows only #fragment and http(s)). `fragment` is the one linkable form: an in-page anchor
 *  to a block id in THIS quiz doc, validated at render time. */
export interface Citation {
  label: string;      // e.g. "src/git.ts:41–52" or "Recap §3 — The migration path"
  file?: string;      // repo-relative path, when citing code
  lines?: string;     // e.g. "41-52"
  fragment?: string;  // in-page anchor to a block id in this doc
}

export interface QuizQuestionBlock {
  type: "quiz-question";
  id: string;
  family: QuizFamily;          // exactly one — the family the question primarily tests
  title?: string;              // short sidebar label; defaults to "Question N"
  question: string;            // markdown prompt shown before the reveal
  code?: AnnotatedCodeBlock;   // real snippet the question interrogates
  diagram?: DiagramBlock;      // rendered between the prompt and the reveal
  answer: {
    takeaway: string;          // bold one-line model answer (inline markdown)
    points?: string[];         // markdown bullets expanding it
  };
  citations: Citation[];       // >=1 — where the answer is grounded
}

/** Optional theming for large quizzes; children are questions (plus optional prose). */
export interface QuizGroupBlock {
  type: "quiz-group";
  id: string;
  title: string;
  description?: string;        // markdown shown under the group title
  blocks: (QuizQuestionBlock | ProseBlock)[];
}

export type QuizBlock = QuizQuestionBlock | QuizGroupBlock | ProseBlock;

/** Envelope — the file Claude authors (quiz.json). */
export interface QuizDoc {
  kind: "quiz";
  title: string;               // "Quiz — <human label>"
  source: string;              // what was quizzed (PR #, spec path, doc path)
  intro?: string;              // markdown: what this quiz covers (feeds the TL;DR fold)
  generator?: string;
  excalidraw?: boolean;
  blocks: QuizBlock[];
}

/** Questions in document order, descending into groups. */
export function allQuestions(blocks: QuizBlock[]): QuizQuestionBlock[] {
  const out: QuizQuestionBlock[] = [];
  for (const b of blocks) {
    if (b.type === "quiz-question") out.push(b);
    else if (b.type === "quiz-group")
      for (const c of b.blocks) if (c.type === "quiz-question") out.push(c);
  }
  return out;
}

/** Every block id in the doc (incl. group children) — the valid citation-fragment targets. */
export function allBlockIds(blocks: QuizBlock[]): Set<string> {
  const ids = new Set<string>();
  for (const b of blocks) {
    ids.add(b.id);
    if (b.type === "quiz-group") for (const c of b.blocks) ids.add(c.id);
  }
  return ids;
}

export function assertUniqueQuizIds(blocks: QuizBlock[]): void {
  const seen = new Set<string>();
  const add = (id: string) => {
    if (seen.has(id)) throw new Error(`duplicate block id "${id}" — ids must be unique`);
    seen.add(id);
  };
  const addQuestionAssets = (q: QuizQuestionBlock) => {
    if (q.diagram) add(q.diagram.id);
    if (q.code) add(q.code.id);
  };
  for (const b of blocks) {
    add(b.id);
    if (b.type === "quiz-question") addQuestionAssets(b);
    if (b.type === "quiz-group")
      for (const c of b.blocks) {
        add(c.id);
        if (c.type === "quiz-question") addQuestionAssets(c);
      }
  }
}

/** Attached diagrams for the shared d2 pipeline (keyed by the diagram's own id). */
export function collectQuizDiagrams(blocks: QuizBlock[]): DiagramBlock[] {
  return allQuestions(blocks).flatMap((q) => (q.diagram ? [q.diagram] : []));
}

import { it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = new URL("../bin/quiz.ts", import.meta.url).pathname;
const TSX = new URL("../node_modules/.bin/tsx", import.meta.url).pathname;

const quizDoc = {
  kind: "quiz",
  title: "Quiz — demo",
  source: "PR #1",
  blocks: [
    { type: "quiz-question", id: "q1", family: "mechanism", question: "Why does A precede B?",
      answer: { takeaway: "**B reads A's output**" }, citations: [{ label: "src/a.ts:1-3" }] },
    { type: "quiz-question", id: "q2", family: "rationale", question: "Why this approach?",
      answer: { takeaway: "**Simplest thing that works**" }, citations: [{ label: "spec §2" }] },
  ],
};

it("resolves relative --blocks/--out against the cwd and writes quiz.html + quiz.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "quiz-cli-"));
  try {
    writeFileSync(join(dir, "quiz.json"), JSON.stringify(quizDoc));
    execFileSync(TSX, [BIN, "--blocks", "quiz.json", "--out", "."], { encoding: "utf8", cwd: dir });
    expect(existsSync(join(dir, "quiz.html"))).toBe(true);
    const rewritten = JSON.parse(readFileSync(join(dir, "quiz.json"), "utf8"));
    expect(rewritten.blocks.length).toBe(2);
    const html = readFileSync(join(dir, "quiz.html"), "utf8");
    expect(html).toContain('content="visual-skills · quiz"');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

it("exits 2 with usage when --blocks/--out are missing", () => {
  try {
    execFileSync(TSX, [BIN], { encoding: "utf8", stdio: "pipe" });
    expect.unreachable("should have exited non-zero");
  } catch (e) {
    expect((e as { status?: number }).status).toBe(2);
    expect(String((e as { stderr?: string }).stderr)).toContain("usage: quiz");
  }
}, 30_000);

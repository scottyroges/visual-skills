import { describe, it, expect } from "vitest";
import { renderQuestions } from "../src/renderers/questions.js";
import type { QuestionsBlock } from "../src/blocks.js";

describe("renderQuestions", () => {
  it("renders each question as a card with its recommended default, escaping HTML", () => {
    const block: QuestionsBlock = {
      type: "questions", id: "q", title: "Open questions",
      questions: [
        { question: "Use <Stripe> or PayPal?", recommendedDefault: "PayPal" },
        { question: "Refund window?", recommendedDefault: "30 days" },
      ],
    };
    const html = renderQuestions(block);
    expect(html).toContain('class="vs-block vs-questions"');
    expect(html).toContain('class="vs-question"');
    expect(html).toContain("Use &lt;Stripe&gt; or PayPal?");
    expect(html).toContain("Recommended:");
    expect(html).toContain("PayPal");
    expect(html).toContain("30 days");
  });
});

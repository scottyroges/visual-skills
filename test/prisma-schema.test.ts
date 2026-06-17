import { describe, it, expect } from "vitest";
import { parsePrismaModels, diffModels, schemaDiffToBlock } from "../src/prisma-schema.js";
import { renderDiagram } from "../src/render-diagram.js";

const BEFORE = `model League {
  id              String        @id @default(uuid())
  paymentStatus   PaymentStatus @default(FREE) @map("payment_status")
  stripeSessionId String?       @map("stripe_session_id")
}`;

const AFTER = `model League {
  id              String        @id @default(uuid())
  paymentStatus    PaymentStatus @default(FREE) @map("payment_status")
  paymentSessionId String?       @map("payment_session_id")
}`;

describe("prisma schema diff", () => {
  it("parses models and their fields", () => {
    const models = parsePrismaModels(BEFORE);
    expect(models.get("League")?.fields.map((f) => f.name)).toEqual(
      ["id", "paymentStatus", "stripeSessionId"],
    );
  });

  it("detects added and removed fields", () => {
    const diff = diffModels(parsePrismaModels(BEFORE), parsePrismaModels(AFTER));
    const league = diff.find((d) => d.model === "League")!;
    expect(league.addedFields.map((f) => f.name)).toContain("paymentSessionId");
    expect(league.removedFields.map((f) => f.name)).toContain("stripeSessionId");
  });

  it("renders a D2 ERD schema block with change markers", () => {
    const diff = diffModels(parsePrismaModels(BEFORE), parsePrismaModels(AFTER));
    const block = schemaDiffToBlock(diff, "erd");
    expect(block.type).toBe("schema");
    expect(block.kind).toBe("erd");
    expect(block.d2).toContain("shape: sql_table");
    expect(block.d2).toContain("paymentSessionId");
    expect(block.d2).toContain("stripeSessionId");
  });

  it("emits D2 that compiles via d2 even with relation-list and reserved-word field types", async () => {
    const BEFORE2 = `model League {
  id String
  members LeagueMember[]
  shape String
}`;
    const AFTER2 = `model League {
  id String
  members LeagueMember[]
  shape String
  newColumn String
}`;
    const block = schemaDiffToBlock(diffModels(parsePrismaModels(BEFORE2), parsePrismaModels(AFTER2)));
    // kept fields include a relation list ("LeagueMember[]") and a field named "shape";
    // both must be quoted or d2 fails to compile.
    const out = await renderDiagram(block, { excalidraw: false });
    expect(out.renderer).toBe("d2");
    expect(out.svg).toMatch(/<svg/);
  }, 30_000);
});

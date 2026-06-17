import { describe, it, expect } from "vitest";
import { parsePrismaModels, diffModels, schemaDiffToBlock } from "../src/prisma-schema.js";

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
});

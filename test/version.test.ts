import { describe, it, expect } from "vitest";
import { generatorStamp } from "../src/version.js";

describe("generatorStamp", () => {
  it("includes the tool name, a version token, and the given timestamp", async () => {
    const stamp = await generatorStamp(new Date("2026-06-17T23:10:00.000Z"));
    expect(stamp).toMatch(/^visual-skills@\S+ · 2026-06-17T23:10:00Z$/);
  });
});

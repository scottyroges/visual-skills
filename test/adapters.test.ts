import { describe, it, expect } from "vitest";
import { PrismaTrpcAdapter } from "../src/adapters/prisma-trpc.js";
import { GenericAdapter } from "../src/adapters/generic.js";
import { selectAdapter } from "../src/adapters/stack-adapter.js";

describe("stack adapters", () => {
  it("PrismaTrpcAdapter detects this repo as NOT prisma+trpc", async () => {
    expect(await new PrismaTrpcAdapter().detect(".")).toBe(false);
  });

  it("selectAdapter falls back to GenericAdapter when none match", async () => {
    const adapter = await selectAdapter(".", [new PrismaTrpcAdapter()]);
    expect(adapter).toBeInstanceOf(GenericAdapter);
  });
});

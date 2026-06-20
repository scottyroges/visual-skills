import { defineConfig } from "vitest/config";

export default defineConfig({
  // Real suites live directly under test/. Fixtures under test/fixtures/** are sample source
  // trees the atlas tests scan (some deliberately named *.test.ts to exercise test-file
  // exclusion) — the single-level glob keeps vitest from collecting them as suites.
  test: { include: ["test/*.test.ts"] },
});

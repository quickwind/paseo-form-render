import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_FIX_RETRIES, pfrSettings } from "./settings";

describe("pfrSettings defaults", () => {
  it("defaults preferForms to on and keeps the auto-fix default", () => {
    const parsed = pfrSettings.schema.parse({});
    expect(parsed.preferForms).toBe(true);
    expect(parsed.autoFixMaxRetries).toBe(DEFAULT_AUTO_FIX_RETRIES);
  });
});

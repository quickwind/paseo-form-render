import { describe, expect, it } from "vitest";
import { PFR_PROMPT_INSTRUCTION, buildPromptInstruction } from "./prompt";

describe("buildPromptInstruction", () => {
  it("wraps the default prompt in the marker without the required-usage section", () => {
    expect(PFR_PROMPT_INSTRUCTION).toBe(buildPromptInstruction({ preferForms: false }));
    expect(PFR_PROMPT_INSTRUCTION.startsWith("[paseo-form-render]")).toBe(true);
    expect(PFR_PROMPT_INSTRUCTION.endsWith("[/paseo-form-render]")).toBe(true);
    expect(PFR_PROMPT_INSTRUCTION).not.toContain("Required usage");
  });

  it("adds the required-usage section inside the marker when preferForms is on", () => {
    const prompt = buildPromptInstruction({ preferForms: true });
    expect(prompt).toContain("### Required usage:");
    expect(prompt.indexOf("### Required usage:")).toBeLessThan(prompt.indexOf("[/paseo-form-render]"));
    expect(prompt.endsWith("[/paseo-form-render]")).toBe(true);
  });
});

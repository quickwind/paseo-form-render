import { describe, expect, it } from "vitest";
import { IRIX_PROMPT_INSTRUCTION, buildPromptInstruction } from "./prompt";

describe("buildPromptInstruction", () => {
  it("wraps the default prompt in the marker without the required-usage section", () => {
    expect(IRIX_PROMPT_INSTRUCTION).toBe(buildPromptInstruction({ preferForms: false }));
    expect(IRIX_PROMPT_INSTRUCTION.startsWith("[irix-ui-render]")).toBe(true);
    expect(IRIX_PROMPT_INSTRUCTION.endsWith("[/irix-ui-render]")).toBe(true);
    expect(IRIX_PROMPT_INSTRUCTION).not.toContain("Required usage");
  });

  it("adds the required-usage section inside the marker when preferForms is on", () => {
    const prompt = buildPromptInstruction({ preferForms: true });
    expect(prompt).toContain("### Required usage:");
    expect(prompt.indexOf("### Required usage:")).toBeLessThan(prompt.indexOf("[/irix-ui-render]"));
    expect(prompt.endsWith("[/irix-ui-render]")).toBe(true);
  });
});

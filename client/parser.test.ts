import { describe, it, expect } from "vitest";
import { parseMessageContent, hasFormBlock } from "./parser";
import { WukongFormSchema } from "../shared/schema";
import { extractInitialValues, validateForm, formatSubmissionMessage } from "../shared/form-helpers";

describe("wukong-form Parser & Validation", () => {
  it("detects wukong-form fence block", () => {
    const text = "Hello\n```wukong-form\n{}\n```\nWorld";
    expect(hasFormBlock(text)).toBe(true);
    expect(hasFormBlock("Just regular text")).toBe(false);
  });

  it("parses valid form JSON and splits surrounding text", () => {
    const text = [
      "Here is the plan:",
      "```wukong-form",
      JSON.stringify({
        type: "Card",
        title: "Test Form",
        children: [
          {
            type: "Input",
            id: "username",
            label: "Username",
            defaultValue: "test_user",
            required: true,
          },
          {
            type: "Button",
            label: "Submit",
            action: "submit",
            message: "Execute test",
          },
        ],
      }),
      "```",
      "Let me know if you need changes.",
    ].join("\n");

    const blocks = parseMessageContent(text);
    expect(blocks.length).toBe(3);
    expect(blocks[0].type).toBe("text");
    expect(blocks[0].content).toBe("Here is the plan:");
    expect(blocks[1].type).toBe("form");
    expect(blocks[1].form?.type).toBe("Card");
    expect(blocks[2].type).toBe("text");
    expect(blocks[2].content).toBe("Let me know if you need changes.");
  });

  it("extracts initial values correctly", () => {
    const form = WukongFormSchema.parse({
      type: "Card",
      children: [
        { type: "Input", id: "name", label: "Name", defaultValue: "Alice" },
        { type: "Select", id: "role", label: "Role", options: [{ label: "Admin", value: "admin" }] },
        { type: "Toggle", id: "active", label: "Active", defaultValue: true },
      ],
    });

    const values = extractInitialValues(form);
    expect(values).toEqual({
      name: "Alice",
      role: "admin",
      active: true,
    });
  });

  it("validates required fields", () => {
    const form = WukongFormSchema.parse({
      type: "Card",
      children: [
        { type: "Input", id: "name", label: "Name", required: true },
        { type: "Toggle", id: "terms", label: "Agree to terms", required: true },
      ],
    });

    const errors = validateForm(form, { name: "", terms: false });
    expect(errors["name"]).toBe("Name is required.");
    expect(errors["terms"]).toBe("Agree to terms must be checked.");

    const validErrors = validateForm(form, { name: "Bob", terms: true });
    expect(Object.keys(validErrors).length).toBe(0);
  });

  it("formats submission message properly", () => {
    const form = WukongFormSchema.parse({
      type: "Card",
      children: [
        { type: "Input", id: "cluster", label: "Cluster Name" },
        { type: "Toggle", id: "dryRun", label: "Dry Run" },
      ],
    });

    const message = formatSubmissionMessage("Deploying cluster", form, {
      cluster: "prod-us-east-1",
      dryRun: true,
    });

    expect(message).toContain("[User Form Submission]");
    expect(message).toContain("Action: Deploying cluster");
    expect(message).toContain("- Cluster Name: prod-us-east-1");
    expect(message).toContain("- Dry Run: Yes");
  });
});

import { describe, it, expect } from "vitest";
import { parseMessageContent, hasFormBlock } from "./parser";
import { IrixFormSchema } from "../shared/schema";
import { extractInitialValues, validateForm, formatSubmissionMessage } from "../shared/form-helpers";

describe("irix-form Parser & Validation", () => {
  it("detects irix-form and irix-ui fence blocks", () => {
    expect(hasFormBlock("Hello\n```irix-form\n{}\n```\nWorld")).toBe(true);
    expect(hasFormBlock("Hello\n```irix-ui\n{}\n```\nWorld")).toBe(true);
    expect(hasFormBlock("Hello\n```unknown-form\n{}\n```\nWorld")).toBe(false);
    expect(hasFormBlock("Just regular text")).toBe(false);
  });

  it("parses valid form JSON and splits surrounding text", () => {
    const text = [
      "Here is the plan:",
      "```irix-form",
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
    const form = IrixFormSchema.parse({
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
    const form = IrixFormSchema.parse({
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
    const form = IrixFormSchema.parse({
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

  it("handles unified FilePicker in schema, validation, extension filtering and submission", () => {
    const form = IrixFormSchema.parse({
      type: "Card",
      children: [
        {
          type: "FilePicker",
          id: "video",
          label: "Presentation Video",
          extensions: ["mp4"],
          defaultValue: "docs/intro.mp4",
          required: true,
        },
        {
          type: "FilePicker",
          id: "outFolder",
          label: "Export Folder",
          pickerType: "folder",
          required: true,
        },
      ],
    });

    const initial = extractInitialValues(form);
    expect(initial).toEqual({
      video: "docs/intro.mp4",
      outFolder: "",
    });

    // Test validation
    const failErrors = validateForm(form, {
      video: "docs/intro.avi",
      outFolder: "",
    });
    expect(failErrors["video"]).toBe("Presentation Video must be a file of type: .mp4");
    expect(failErrors["outFolder"]).toBe("Please select a path for Export Folder.");

    const passErrors = validateForm(form, {
      video: "docs/intro.mp4",
      outFolder: "/tmp/export",
    });
    expect(Object.keys(passErrors).length).toBe(0);

    const submission = formatSubmissionMessage("Export assets", form, {
      video: "docs/intro.mp4",
      outFolder: "/tmp/export",
    });
    expect(submission).toContain("- Presentation Video: docs/intro.mp4");
    expect(submission).toContain("- Export Folder: /tmp/export");
  });

  it("supports multiline Input configuration and initial values", () => {
    const form = IrixFormSchema.parse({
      type: "Card",
      children: [
        {
          type: "Input",
          id: "description",
          label: "Description",
          multiline: true,
          defaultValue: "Line 1\nLine 2",
        },
      ],
    });

    const values = extractInitialValues(form);
    expect(values).toEqual({
      description: "Line 1\nLine 2",
    });
    expect(((form as any).children[0] as any).multiline).toBe(true);
  });

  it("validates string length constraints (minLength, maxLength, and aliases)", () => {
    const form = IrixFormSchema.parse({
      type: "Card",
      children: [
        {
          type: "Input",
          id: "username",
          label: "Username",
          minLength: 3,
          maxLength: 8,
          required: true,
        },
      ],
    });

    const tooShort = validateForm(form, { username: "ab" });
    expect(tooShort["username"]).toBe("Username must be at least 3 characters.");

    const tooLong = validateForm(form, { username: "123456789" });
    expect(tooLong["username"]).toBe("Username cannot exceed 8 characters.");

    const valid = validateForm(form, { username: "alice" });
    expect(Object.keys(valid).length).toBe(0);
  });

  it("validates email format", () => {
    const form = IrixFormSchema.parse({
      type: "Card",
      children: [
        {
          type: "Input",
          id: "email",
          label: "User Email",
          inputType: "email",
          required: true,
        },
      ],
    });

    const invalid = validateForm(form, { email: "not-an-email" });
    expect(invalid["email"]).toBe("User Email must be a valid email address.");

    const valid = validateForm(form, { email: "test@domain.com" });
    expect(Object.keys(valid).length).toBe(0);
  });

  it("validates integer constraints with min and max", () => {
    const form = IrixFormSchema.parse({
      type: "Card",
      children: [
        {
          type: "Input",
          id: "age",
          label: "Age",
          inputType: "integer",
          min: 18,
          max: 65,
          required: true,
        },
      ],
    });

    const notAnInt = validateForm(form, { age: "3.14" });
    expect(notAnInt["age"]).toBe("Age must be an integer.");

    const belowMin = validateForm(form, { age: "16" });
    expect(belowMin["age"]).toBe("Age must be at least 18.");

    const aboveMax = validateForm(form, { age: "70" });
    expect(aboveMax["age"]).toBe("Age cannot be greater than 65.");

    const valid = validateForm(form, { age: "25" });
    expect(Object.keys(valid).length).toBe(0);
  });

  it("validates float / numeric constraints with min and max", () => {
    const form = IrixFormSchema.parse({
      type: "Card",
      children: [
        {
          type: "Input",
          id: "score",
          label: "Score",
          inputType: "number",
          min: 0.5,
          max: 10.0,
        },
      ],
    });

    // Optional field empty -> valid
    expect(Object.keys(validateForm(form, { score: "" })).length).toBe(0);

    const notNum = validateForm(form, { score: "xyz" });
    expect(notNum["score"]).toBe("Score must be a valid number.");

    const belowMin = validateForm(form, { score: "0.2" });
    expect(belowMin["score"]).toBe("Score must be at least 0.5.");

    const validFloat = validateForm(form, { score: "9.75" });
    expect(Object.keys(validFloat).length).toBe(0);
  });

  it("handles MultiSelect schema, defaults, min/max selection validation and formatting", () => {
    const form = IrixFormSchema.parse({
      type: "Card",
      children: [
        {
          type: "MultiSelect",
          id: "roles",
          label: "User Roles",
          options: [
            { label: "Admin", value: "admin" },
            { label: "Developer", value: "dev" },
            { label: "Viewer", value: "viewer" },
          ],
          defaultValue: ["dev"],
          min: 1,
          max: 2,
          required: true,
        },
      ],
    });

    const initial = extractInitialValues(form);
    expect(initial["roles"]).toEqual(["dev"]);

    // Required / min test
    const emptyErrors = validateForm(form, { roles: [] });
    expect(emptyErrors["roles"]).toBe("Please select at least one option for User Roles.");

    // Max limit test
    const overErrors = validateForm(form, { roles: ["admin", "dev", "viewer"] });
    expect(overErrors["roles"]).toBe("You can select at most 2 options for User Roles.");

    // Valid test
    const validErrors = validateForm(form, { roles: ["admin", "dev"] });
    expect(Object.keys(validErrors).length).toBe(0);

    // Submission format
    const submission = formatSubmissionMessage("Grant roles", form, { roles: ["admin", "dev"] });
    expect(submission).toContain("- User Roles: admin, dev");
  });
});


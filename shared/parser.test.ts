import { describe, it, expect } from "vitest";
import { parseMessageContent, hasFormBlock } from "./parser";
import { PfrFormSchema } from "./schema";
import { collectFieldIds, extractInitialValues, validateForm, formatSubmissionMessage } from "./form-helpers";

describe("pfr-form Parser & Validation", () => {
  it("detects pfr-form fence blocks", () => {
    expect(hasFormBlock("Hello\n```pfr-form\n{}\n```\nWorld")).toBe(true);
    expect(hasFormBlock("Hello\n```unknown-form\n{}\n```\nWorld")).toBe(false);
    expect(hasFormBlock("Just regular text")).toBe(false);
  });

  it("parses valid form JSON and splits surrounding text", () => {
    const text = [
      "Here is the plan:",
      "```pfr-form",
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
    const form = PfrFormSchema.parse({
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
    const form = PfrFormSchema.parse({
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
    const form = PfrFormSchema.parse({
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
    const form = PfrFormSchema.parse({
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
    const form = PfrFormSchema.parse({
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
    const form = PfrFormSchema.parse({
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
    const form = PfrFormSchema.parse({
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
    const form = PfrFormSchema.parse({
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
    const form = PfrFormSchema.parse({
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
    const form = PfrFormSchema.parse({
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


describe("lenient JSON repair", () => {
  const wrap = (json: string) => "```pfr-form\n" + json + "\n```";

  it("renders a form whose JSON has trailing commas, comments and single quotes", () => {
    const [block] = parseMessageContent(
      wrap(`{ // note\n 'type': "Card", children: [ { "type": "Text", "text": "hi", }, ], }`),
    );
    expect(block.error).toBeUndefined();
    expect(block.form?.type).toBe("Card");
  });

  it("still validates the repaired result against the schema", () => {
    const [block] = parseMessageContent(wrap(`{ "type": "Card", "children": [ { "type": "Slider", }, ], }`));
    expect(block.form).toBeUndefined();
    expect(block.errors?.[0].message).toContain("Slider");
  });

  it("reports unrepairable JSON against the original text", () => {
    const [block] = parseMessageContent(wrap(`{ "type": "Card" "children": [] }`));
    expect(block.form).toBeUndefined();
    expect(block.errors?.[0].path).toBe("JSON");
  });
});

describe("Code, Steps and Details components", () => {
  const wrap = (node: unknown) => "```pfr-form\n" + JSON.stringify(node) + "\n```";
  const parse = (node: unknown) => parseMessageContent(wrap(node))[0];

  it("accepts a Code block with and without a language", () => {
    for (const code of [{ type: "Code", code: "npm test" }, { type: "Code", code: "{}", language: "json" }]) {
      expect(parse({ type: "Card", children: [code] }).error).toBeUndefined();
    }
  });

  it("accepts Steps with every status and rejects an unknown one or an empty list", () => {
    const items = ["pending", "current", "done", "blocked"].map((status) => ({ title: status, detail: "d", status }));
    expect(parse({ type: "Card", children: [{ type: "Steps", items }] }).error).toBeUndefined();
    expect(parse({ type: "Card", children: [{ type: "Steps", items: [{ title: "x", status: "late" }] }] }).error).toBeDefined();
    expect(parse({ type: "Card", children: [{ type: "Steps", items: [] }] }).error).toBeDefined();
  });

  it("collects and validates fields inside a Details section", () => {
    const form = {
      type: "Card",
      children: [
        {
          type: "Details",
          title: "Advanced",
          children: [{ type: "Input", id: "token", label: "Token", required: true, defaultValue: "abc" }],
        },
      ],
    };
    const block = parse(form);
    expect(block.error).toBeUndefined();
    const node = block.form!;
    expect(extractInitialValues(node)).toEqual({ token: "abc" });
    expect(validateForm(node, { token: "" })).toEqual({ token: "Token is required." });
    expect(collectFieldIds(node)).toEqual(["token"]);
    expect(formatSubmissionMessage(undefined, node, { token: "abc" })).toContain("Token");
  });

  it("flags duplicate ids across a Details boundary", () => {
    const input = { type: "Input", id: "a", label: "A" };
    const block = parse({ type: "Card", children: [input, { type: "Details", title: "d", children: [input] }] });
    expect(block.error).toContain("duplicate field id");
  });

  it("requires a title on Details", () => {
    expect(parse({ type: "Card", children: [{ type: "Details", children: [] }] }).error).toBeDefined();
  });
});

describe("SegmentedBar, KeyValue and Tabs components", () => {
  const parse = (node: unknown) => parseMessageContent("```pfr-form\n" + JSON.stringify(node) + "\n```")[0];
  const card = (child: unknown) => ({ type: "Card", children: [child] });

  it("accepts SegmentedBar parts with and without tone/unit and rejects bad ones", () => {
    const ok = { type: "SegmentedBar", unit: "GB", parts: [{ label: "Code", value: 40 }, { label: "Cache", value: 0, tone: "warning" }] };
    expect(parse(card(ok)).error).toBeUndefined();
    expect(parse(card({ type: "SegmentedBar", parts: [{ label: "x", value: -1 }] })).error).toBeDefined();
    expect(parse(card({ type: "SegmentedBar", parts: [] })).error).toBeDefined();
  });

  it("accepts KeyValue pairs with string or number values", () => {
    expect(parse(card({ type: "KeyValue", pairs: [{ label: "Region", value: "eu" }, { label: "Nodes", value: 3 }] })).error).toBeUndefined();
    expect(parse(card({ type: "KeyValue", pairs: [] })).error).toBeDefined();
    expect(parse(card({ type: "KeyValue", pairs: [{ label: "a", value: true }] })).error).toBeDefined();
  });

  const tabsForm = {
    type: "Card",
    children: [
      {
        type: "Tabs",
        tabs: [
          { label: "General", children: [{ type: "Input", id: "name", label: "Name", defaultValue: "x" }] },
          { label: "Advanced", children: [{ type: "Toggle", id: "debug", label: "Debug", defaultValue: true }, { type: "Input", id: "token", label: "Token", required: true }] },
        ],
      },
    ],
  };

  it("collects, validates and labels fields in every tab", () => {
    const block = parse(tabsForm);
    expect(block.error).toBeUndefined();
    const node = block.form!;
    expect(extractInitialValues(node)).toEqual({ name: "x", debug: true, token: "" });
    expect(validateForm(node, { name: "x", debug: true, token: "" })).toEqual({ token: "Token is required." });
    expect(collectFieldIds(node)).toEqual(["name", "debug", "token"]);
    const message = formatSubmissionMessage(undefined, node, { name: "x", debug: true, token: "t" });
    expect(message).toContain("- Debug: Yes");
    expect(message).toContain("- Token: t");
  });

  it("flags a duplicate id across tabs with the tab in the path", () => {
    const input = { type: "Input", id: "a", label: "A" };
    const block = parse(card({ type: "Tabs", tabs: [{ label: "1", children: [input] }, { label: "2", children: [input] }] }));
    expect(block.error).toContain("duplicate field id");
  });

  it("requires at least one tab", () => {
    expect(parse(card({ type: "Tabs", tabs: [] })).error).toBeDefined();
  });
});

describe("Markdown, option descriptions, Rating and Sparkline", () => {
  const parse = (node: unknown) => parseMessageContent("```pfr-form\n" + JSON.stringify(node) + "\n```")[0];
  const card = (...children: unknown[]) => ({ type: "Card", children });

  it("accepts Markdown and requires its text", () => {
    expect(parse(card({ type: "Markdown", text: "**bold** and `code`" })).error).toBeUndefined();
    expect(parse(card({ type: "Markdown" })).error).toBeDefined();
  });

  it("accepts an optional description on Select and MultiSelect options", () => {
    const options = [{ label: "Fast", value: "fast", description: "Skips checks" }, { label: "Safe", value: "safe" }];
    const block = parse(card({ type: "Select", id: "mode", label: "Mode", options }, { type: "MultiSelect", id: "m", label: "M", options }));
    expect(block.error).toBeUndefined();
    expect(JSON.stringify(block.form)).toContain("Skips checks");
  });

  it("starts a Rating unset, honors defaultValue within max, and submits the stars", () => {
    const block = parse(card({ type: "Rating", id: "r", label: "Overall" }, { type: "Rating", id: "q", label: "Quality", max: 3, defaultValue: 9 }));
    expect(block.error).toBeUndefined();
    const node = block.form!;
    expect(extractInitialValues(node)).toEqual({ r: null, q: 3 });
    expect(formatSubmissionMessage(undefined, node, { r: null, q: 3 })).toContain("- Overall: \n- Quality: 3");
  });

  it("validates a required Rating and rejects a bad max", () => {
    const node = parse(card({ type: "Rating", id: "r", label: "Overall", required: true })).form!;
    expect(validateForm(node, { r: null })).toEqual({ r: "Please give a rating for Overall." });
    expect(validateForm(node, { r: 4 })).toEqual({});
    expect(parse(card({ type: "Rating", id: "r", label: "x", max: 11 })).error).toBeDefined();
    expect(parse(card({ type: "Rating", id: "r", label: "x", max: 5, defaultValue: 0 })).error).toBeDefined();
  });

  it("treats Rating as a field for duplicate-id detection", () => {
    const rating = { type: "Rating", id: "r", label: "R" };
    expect(parse(card(rating, rating)).error).toContain("duplicate field id");
    expect(parse(card(rating, { type: "Input", id: "r", label: "R2" })).error).toContain("duplicate field id");
  });

  it("accepts Sparkline with and without label/tone and rejects an empty series", () => {
    expect(parse(card({ type: "Sparkline", values: [1, 3, 2.5] })).error).toBeUndefined();
    expect(parse(card({ type: "Sparkline", label: "Latency", tone: "warning", values: [5] })).error).toBeUndefined();
    expect(parse(card({ type: "Sparkline", values: [] })).error).toBeDefined();
    expect(parse(card({ type: "Sparkline", values: ["a"] })).error).toBeDefined();
  });
});

describe("Chart component", () => {
  const parse = (node: unknown) => parseMessageContent("```pfr-form\n" + JSON.stringify(node) + "\n```")[0];
  const chart = (extra: Record<string, unknown> = {}) => ({
    type: "Chart",
    title: "Requests",
    unit: "k",
    labels: ["Mon", "Tue", "Wed"],
    series: [{ name: "api", values: [12, 18, 9] }, { name: "web", values: [7, 5, 11], tone: "warning" }],
    ...extra,
  });
  const inCard = (node: unknown) => ({ type: "Card", children: [node] });

  it("accepts a valid bar chart, with kind and negative values", () => {
    expect(parse(inCard(chart())).error).toBeUndefined();
    expect(parse(inCard(chart({ kind: "bar", series: [{ name: "x", values: [-1, 0, 2.5] }] }))).error).toBeUndefined();
  });

  it("explains a series whose length differs from the labels", () => {
    const block = parse(inCard(chart({ series: [{ name: "api", values: [1, 2] }] })));
    expect(block.error).toContain('series "api" has 2 values but the Chart has 3 labels');
    expect(block.error).toContain("exactly one value per label");
  });

  it("limits labels and series", () => {
    const labels = Array.from({ length: 25 }, (_, i) => `L${i}`);
    expect(parse(inCard(chart({ labels, series: [{ name: "a", values: labels.map(() => 1) }] }))).error).toContain("at most 24");
    const series = Array.from({ length: 5 }, (_, i) => ({ name: `s${i}`, values: [1, 2, 3] }));
    expect(parse(inCard(chart({ series }))).error).toContain("at most 4");
  });

  it("rejects empty labels or series and unknown kinds", () => {
    expect(parse(inCard(chart({ labels: [], series: [{ name: "a", values: [] }] }))).error).toBeDefined();
    expect(parse(inCard(chart({ series: [] }))).error).toBeDefined();
    expect(parse(inCard(chart({ kind: "pie" }))).error).toBeDefined();
  });

  it("checks charts inside Tabs and Details too", () => {
    const bad = chart({ series: [{ name: "api", values: [1] }] });
    expect(parse(inCard({ type: "Tabs", tabs: [{ label: "t", children: [bad] }] })).error).toContain("exactly one value per label");
    expect(parse(inCard({ type: "Details", title: "d", children: [bad] })).error).toContain("exactly one value per label");
  });
});

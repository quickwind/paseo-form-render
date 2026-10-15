import { describe, it, expect } from "vitest";
import {
  capIssues,
  findDuplicateIdIssues,
  formatIssue,
  formatJsonParseError,
  suggestNodeType,
} from "./form-errors";
import { parseMessageContent } from "./parser";
import { IRIX_NODE_TYPES, IrixFormSchema } from "./schema";

function parseOne(json: unknown): string[] {
  const text = "```irix-form\n" + (typeof json === "string" ? json : JSON.stringify(json, null, 2)) + "\n```";
  const [block] = parseMessageContent(text);
  return (block.errors ?? []).map(formatIssue);
}

describe("schema issue formatting", () => {
  it("lists valid types derived from the schema, matching zod's own options", () => {
    const result = IrixFormSchema.safeParse({ type: "Card", children: [{ type: "Slider" }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0] as unknown as { code: string; options: string[] };
      expect(issue.code).toBe("invalid_union");
      expect(issue.options).toEqual([...IRIX_NODE_TYPES]);
    }
  });

  it("reports an unknown component type with the node path and valid types", () => {
    const [line] = parseOne({ type: "Card", children: [{ type: "Slider", label: "Volume" }] });
    expect(line).toContain('Card > children[0] (Slider "Volume")');
    expect(line).toContain('unknown component type "Slider"');
    expect(line).toContain(`Valid types: ${IRIX_NODE_TYPES.join(", ")}`);
  });

  it("suggests close types and aliases", () => {
    expect(suggestNodeType("Buton")).toBe("Button");
    expect(suggestNodeType("card")).toBe("Card");
    expect(suggestNodeType("Textarea")).toBe('Input with "multiline": true');
    expect(suggestNodeType("TextArea")).toBe('Input with "multiline": true');
    expect(suggestNodeType("Checkbox")).toBe("Toggle");
    expect(suggestNodeType("Switch")).toBe("Toggle");
    expect(suggestNodeType("Dropdown")).toBe("Select");
    expect(suggestNodeType("Label")).toBe("Text");
    expect(suggestNodeType("Paragraph")).toBe("Text");
    expect(suggestNodeType("Title")).toBe("Heading");
    expect(suggestNodeType("Zzzzzzzzzz")).toBeUndefined();

    const [line] = parseOne({ type: "Card", children: [{ type: "Dropdown", id: "a", label: "A" }] });
    expect(line).toContain("Did you mean Select?");
  });

  it("handles a missing or non-string type", () => {
    const [missing] = parseOne({ type: "Card", children: [{ label: "x" }] });
    expect(missing).toContain('missing required field "type"');
    const [wrong] = parseOne({ type: "Card", children: [{ type: 5 }] });
    expect(wrong).toContain('"type" must be a string');
    expect(wrong).toContain("number 5");
  });

  it("reports missing required fields with the node description", () => {
    const lines = parseOne({
      type: "Card",
      children: [
        { type: "Heading", text: "ok" },
        { type: "Divider" },
        { type: "Input", label: "Release Tag" },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Card > children[2] (Input "Release Tag")');
    expect(lines[0]).toContain('missing required field "id"');
  });

  it("reports a missing children array on the root", () => {
    const [line] = parseOne({ type: "Card", title: "Empty" });
    expect(line).toContain('Card "Empty"');
    expect(line).toContain('missing required field "children"');
  });

  it("reports invalid enum values", () => {
    const [line] = parseOne({ type: "Card", children: [{ type: "Badge", text: "x", tone: "red" }] });
    expect(line).toContain('"tone" must be one of: neutral, info, success, warning, danger (got "red")');
  });

  it("reports a missing required enum field", () => {
    const [line] = parseOne({ type: "Card", children: [{ type: "Button", label: "Go" }] });
    expect(line).toContain('missing required field "action"');
    expect(line).toContain("submit, reset");
  });

  it("reports type mismatches with expected and received", () => {
    const [line] = parseOne({ type: "Card", children: "none" });
    expect(line).toContain('"children" must be an array (got string "none")');
    const [obj] = parseOne("[]");
    expect(obj).toContain("must be an object");
    expect(obj).toContain("array");
  });

  it("reports numeric range and empty value problems", () => {
    const lines = parseOne({
      type: "Card",
      children: [
        { type: "Progress", label: "p", value: 200 },
        { type: "Input", id: "", label: "x" },
        { type: "Table", columns: [], rows: [] },
      ],
    });
    expect(lines[0]).toContain('"value" must be <= 100 (got number 200)');
    expect(lines[1]).toContain('"id" must not be empty');
    expect(lines[2]).toContain('"columns" must contain at least 1 item');
  });

  it("explains invalid union values that are not discriminators", () => {
    const [line] = parseOne({
      type: "Table",
      columns: [{ key: "a", label: "A" }],
      rows: [{ a: { nested: true } }],
    });
    expect(line).toContain("Table > rows[0]");
    expect(line).toContain('"a" has an invalid value (got object)');
    expect(line).toContain("expected string or number or boolean or null");
  });

  it("reports duplicate field ids", () => {
    const lines = parseOne({
      type: "Card",
      children: [
        { type: "Input", id: "name", label: "First" },
        { type: "Stack", children: [{ type: "Select", id: "name", label: "Second", options: [{ label: "a", value: "a" }] }] },
        { type: "Input", id: "other", label: "Other" },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('duplicate field id "name"');
    expect(lines[0]).toContain('Input "First"');
    expect(lines[0]).toContain('Select "Second"');
  });

  it("ignores repeated ids on non-input nodes and tolerates junk", () => {
    expect(findDuplicateIdIssues({ type: "Card", children: [{ type: "Text", id: "a" }, { type: "Text", id: "a" }] })).toEqual([]);
    expect(findDuplicateIdIssues(null)).toEqual([]);
    expect(findDuplicateIdIssues({ children: "x" })).toEqual([]);
  });

  it("caps issues at 10 and notes the rest", () => {
    const children = Array.from({ length: 13 }, () => ({ type: "Input", label: "x" }));
    const [block] = parseMessageContent("```irix-form\n" + JSON.stringify({ type: "Card", children }) + "\n```");
    expect(block.errors).toHaveLength(11);
    expect(block.errors?.[10].message).toBe("...and 3 more");
    expect(block.error?.split("\n")).toHaveLength(11);
    expect(capIssues([{ path: "a", message: "b" }])).toHaveLength(1);
  });

  it("joins issues one per line into block.error", () => {
    const [block] = parseMessageContent(
      "```irix-form\n" +
        JSON.stringify({ type: "Card", children: [{ type: "Slider" }, { type: "Badge", text: "x", tone: "red" }] }) +
        "\n```",
    );
    expect(block.error?.split("\n")).toHaveLength(2);
    expect(block.form).toBeUndefined();
  });

  it("produces no errors for a valid form", () => {
    const [block] = parseMessageContent(
      "```irix-form\n" + JSON.stringify({ type: "Card", children: [{ type: "Text", text: "hi" }] }) + "\n```",
    );
    expect(block.errors).toBeUndefined();
    expect(block.form).toBeDefined();
  });
});

describe("JSON syntax error formatting", () => {
  it("includes line, column, a snippet, and a trailing comma hint", () => {
    const [line] = parseOne('{\n  "type": "Card",\n  "children": [],\n}');
    expect(line).toMatch(/^JSON: syntax error at line 4, column 1/);
    expect(line).toContain("near `}`");
    expect(line).toContain("trailing comma");
  });

  it("hints at comments", () => {
    const [line] = parseOne('{\n  // pick one\n  "type": "Card"\n}');
    expect(line).toContain("line 2");
    expect(line).toContain("comments are not allowed");
  });

  it("hints at single quotes", () => {
    const [line] = parseOne("{'type': 'Card', 'children': []}");
    expect(line).toContain("single quotes");
  });

  it("hints at unquoted keys", () => {
    const [line] = parseOne('{\n  type: "Card",\n  "children": []\n}');
    expect(line).toContain('use "type"');
  });

  it("flags truncated JSON", () => {
    const [line] = parseOne('{"type": "Card", "children": [');
    expect(line).toContain("truncated");
  });

  it("flags an empty block", () => {
    const [line] = parseOne("");
    expect(line).toContain("block is empty");
  });

  it("still gives a location and generic hint without a position in the engine message", () => {
    const [issue] = formatJsonParseError("{\n  oops\n}", new Error("JSON Parse error: Unexpected identifier: oops"));
    expect(issue.message).toContain("Unexpected identifier: oops");
    expect(issue.message).toContain("Hint:");
  });
});

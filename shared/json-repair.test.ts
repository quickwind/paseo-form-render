import { describe, expect, it } from "vitest";
import { repairJson } from "./json-repair";

const fixes = (input: string, expected: unknown) => {
  const result = repairJson(input);
  expect(result.repaired).toBe(true);
  expect(JSON.parse(result.text)).toEqual(expected);
};

describe("repairJson", () => {
  it("returns valid JSON untouched", () => {
    const input = '{ "a": [1, 2], "b": "x, ]" }';
    expect(repairJson(input)).toEqual({ text: input, repaired: false });
  });

  it("removes trailing commas in objects and arrays", () => {
    fixes('{ "a": [1, 2,], "b": 1, }', { a: [1, 2], b: 1 });
  });

  it("removes line and block comments", () => {
    fixes('{\n // note\n "a": 1, /* why */ "b": 2\n}', { a: 1, b: 2 });
  });

  it("converts single-quoted strings", () => {
    fixes("{ 'a': 'it\\'s', \"b\": 'say \"hi\"' }", { a: "it's", b: 'say "hi"' });
  });

  it("quotes bare object keys", () => {
    fixes('{ type: "Card", children: [] }', { type: "Card", children: [] });
  });

  it("does not touch commas, comments or quotes inside strings", () => {
    const input = '{ "a": "x, } // not a comment /* nor this */ \'q\'", }';
    fixes(input, { a: "x, } // not a comment /* nor this */ 'q'" });
  });

  it("does not close unbalanced brackets (truncation stays an error)", () => {
    const result = repairJson('{ "a": [1, 2');
    expect(result.repaired).toBe(false);
    expect(() => JSON.parse(result.text)).toThrow();
  });

  it("leaves unrecoverable input parse-failing", () => {
    const result = repairJson("{ a b c }");
    expect(() => JSON.parse(result.text)).toThrow();
  });
});

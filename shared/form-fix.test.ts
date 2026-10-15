import { describe, it, expect } from "vitest";
import {
  IRIX_FIX_MARKER,
  buildFixMessage,
  collectTurnFormFailures,
  countTrailingFixAttempts,
  type TimelineEntry,
} from "./form-fix";

const user = (text: string): TimelineEntry => ({ type: "user_message", text });
const assistant = (text: string): TimelineEntry => ({ type: "assistant_message", text });
const other = (type: string): TimelineEntry => ({ type });
const fence = (body: string) => "```irix-form\n" + body + "\n```";
const bad = fence('{"type":"Card","children":[{"type":"Slider"}]}');
const good = fence('{"type":"Card","children":[{"type":"Text","text":"hi"}]}');

describe("buildFixMessage", () => {
  it("starts with the marker, lists issues per block, and omits raw JSON", () => {
    const message = buildFixMessage([
      { issues: [{ path: "Card > children[0]", message: "unknown component type" }, { path: "", message: "...and 2 more" }] },
      { issues: [{ path: "JSON", message: "syntax error" }], blockNumber: 3 },
    ]);
    expect(message.startsWith(`${IRIX_FIX_MARKER} Your previous irix-form block(s) failed validation`)).toBe(true);
    expect(message).toContain("Block 1:\n- Card > children[0]: unknown component type\n- ...and 2 more");
    expect(message).toContain("Block 3:\n- JSON: syntax error");
    expect(message).toContain("Please re-output the corrected, complete irix-form block(s). Keep conversational text minimal.");
    expect(message).not.toContain("```");
  });
});

describe("countTrailingFixAttempts", () => {
  it("counts consecutive fix requests, skipping assistant and other items", () => {
    const timeline = [
      user("hello"),
      assistant(bad),
      user(`${IRIX_FIX_MARKER} one`),
      other("reasoning"),
      assistant(bad),
      user(`  ${IRIX_FIX_MARKER} two`),
      assistant(bad),
    ];
    expect(countTrailingFixAttempts(timeline)).toBe(2);
  });

  it("stops at a normal user message", () => {
    const timeline = [user(`${IRIX_FIX_MARKER} old`), assistant(bad), user("new request"), assistant(bad)];
    expect(countTrailingFixAttempts(timeline)).toBe(0);
  });

  it("returns 0 with no user messages", () => {
    expect(countTrailingFixAttempts([])).toBe(0);
    expect(countTrailingFixAttempts([assistant(bad)])).toBe(0);
  });
});

describe("collectTurnFormFailures", () => {
  it("collects only failed blocks, numbering forms across the turn", () => {
    const failures = collectTurnFormFailures([
      user("make a form"),
      assistant(`${good}\n\n${bad}`),
      other("tool_call"),
      assistant(bad),
    ]);
    expect(failures.map((f) => f.blockNumber)).toEqual([2, 3]);
    expect(failures[0].issues[0].message).toContain('unknown component type "Slider"');
  });

  it("ignores assistant messages before the last user message", () => {
    expect(collectTurnFormFailures([assistant(bad), user("next"), assistant(good)])).toEqual([]);
  });

  it("uses every assistant message when there is no user message", () => {
    expect(collectTurnFormFailures([assistant(bad)])).toHaveLength(1);
  });

  it("parses each assistant message separately", () => {
    const half = "```irix-form\n{\"type\":\"Card\",";
    const rest = "\"children\":[]}\n```";
    expect(collectTurnFormFailures([user("x"), assistant(half), assistant(rest)])).toHaveLength(1);
  });

  it("finds JSON syntax failures", () => {
    const failures = collectTurnFormFailures([user("x"), assistant(fence("{'a':1}"))]);
    expect(failures).toHaveLength(1);
    expect(failures[0].issues[0].path).toBe("JSON");
  });
});

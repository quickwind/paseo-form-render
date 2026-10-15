import { describe, it, expect } from "vitest";
import { IRIX_FIX_MARKER, type TimelineEntry } from "../shared/form-fix";
import { decideAutoFix, idleGate, planAutoFix, timelineFromPayload } from "./auto-fix";

const user = (text: string): TimelineEntry => ({ type: "user_message", text });
const assistant = (text: string): TimelineEntry => ({ type: "assistant_message", text });
const bad = "```irix-form\n{\"type\":\"Card\",\"children\":[{\"type\":\"Slider\"}]}\n```";
const bad2 = "```irix-form\n{not json}\n```";
const good = "```irix-form\n{\"type\":\"Card\",\"children\":[]}\n```";
const completed = { kind: "completed" } as const;
const fix = user(`${IRIX_FIX_MARKER} fix it`);

// Typical case: the event carries just the finished turn; history is fetched separately.
function decide(over: Partial<Parameters<typeof decideAutoFix>[0]> & { latestTimeline?: TimelineEntry[] | null }) {
  const turnTimeline = [assistant(bad)];
  return decideAutoFix({
    turnTimeline,
    latestTimeline: [user("go"), ...turnTimeline],
    outcome: completed,
    maxRetries: 2,
    ...over,
  });
}

describe("planAutoFix", () => {
  it("gates on outcome, failures, and the setting", () => {
    expect(planAutoFix({ turnTimeline: [assistant(bad)], outcome: completed, maxRetries: 2 }).ok).toBe(true);
    expect(planAutoFix({ turnTimeline: [assistant(bad)], outcome: { kind: "canceled" }, maxRetries: 2 })).toEqual({ ok: false, reason: "not-completed" });
    expect(planAutoFix({ turnTimeline: [assistant(bad)], outcome: { kind: "failed" }, maxRetries: 2 })).toEqual({ ok: false, reason: "not-completed" });
    expect(planAutoFix({ turnTimeline: [assistant(good)], outcome: completed, maxRetries: 2 })).toEqual({ ok: false, reason: "no-failures" });
    expect(planAutoFix({ turnTimeline: [assistant(bad)], outcome: completed, maxRetries: 0 })).toEqual({ ok: false, reason: "disabled" });
  });
});

describe("decideAutoFix", () => {
  it("sends a fix request for a completed turn with a bad block", () => {
    const decision = decide({});
    expect(decision.send).toBe(true);
    if (decision.send) {
      expect(decision.message.startsWith(IRIX_FIX_MARKER)).toBe(true);
      expect(decision.message).toContain("Slider");
      expect(decision.attempt).toBe(1);
    }
  });

  it("does nothing unless the turn completed", () => {
    expect(decide({ outcome: { kind: "canceled" } })).toEqual({ send: false, reason: "not-completed" });
    expect(decide({ outcome: { kind: "failed" } })).toEqual({ send: false, reason: "not-completed" });
  });

  it("does nothing when all blocks are valid or absent", () => {
    expect(decide({ turnTimeline: [assistant(good)] })).toEqual({ send: false, reason: "no-failures" });
    expect(decide({ turnTimeline: [assistant("plain")] })).toEqual({ send: false, reason: "no-failures" });
  });

  it("is disabled by maxRetries 0", () => {
    expect(decide({ maxRetries: 0 })).toEqual({ send: false, reason: "disabled" });
  });

  it("uses the fetched history for the retry count when the event timeline is per-turn", () => {
    const history = [user("go"), assistant(bad), fix, assistant(bad), fix, assistant(bad)];
    expect(decide({ turnTimeline: [assistant(bad)], latestTimeline: history })).toEqual({ send: false, reason: "limit-reached" });

    const one = decide({ turnTimeline: [assistant(bad)], latestTimeline: history.slice(0, 4) });
    expect(one.send && one.attempt).toBe(2);
  });

  it("does not send when the history could not be read", () => {
    expect(decide({ latestTimeline: null })).toEqual({ send: false, reason: "history-unavailable" });
    expect(decideAutoFix({ turnTimeline: [assistant(bad)], outcome: completed, maxRetries: 2 })).toEqual({ send: false, reason: "history-unavailable" });
  });

  it("skips when a new user message arrived after the turn ended", () => {
    expect(decide({ latestTimeline: [user("go"), assistant(bad), user("actually, do something else")] })).toEqual({ send: false, reason: "superseded" });
    // a fix request is already pending
    expect(decide({ latestTimeline: [user("go"), assistant(bad), fix] })).toEqual({ send: false, reason: "superseded" });
  });

  it("skips when a real user message the turn never saw is already answered", () => {
    const turnTimeline = [user("go"), assistant(bad)];
    const latest = [user("go"), assistant(bad), user("new request"), assistant(good)];
    expect(decide({ turnTimeline, latestTimeline: latest })).toEqual({ send: false, reason: "superseded" });
  });

  it("sends the second retry when the per-turn event timeline starts with a fix request", () => {
    const turnTimeline = [fix, assistant(bad)];
    const latest = [user("go"), assistant(bad), fix, assistant(bad)];
    const decision = decide({ turnTimeline, latestTimeline: latest });
    expect(decision.send && decision.attempt).toBe(2);
    expect(decide({ turnTimeline, latestTimeline: [...latest.slice(0, 2), fix, assistant(bad), fix, assistant(bad)] }))
      .toEqual({ send: false, reason: "limit-reached" });
  });

  it("works when the event timeline includes the triggering user message", () => {
    const turnTimeline = [user("go"), assistant(bad)];
    expect(decide({ turnTimeline, latestTimeline: turnTimeline }).send).toBe(true);
  });

  it("a normal user message resets the attempt count", () => {
    const latest = [user("go"), assistant(bad), fix, assistant(bad), fix, assistant(bad), user("try again"), assistant(bad)];
    const decision = decide({ latestTimeline: latest });
    expect(decision.send && decision.attempt).toBe(1);
  });

  it("refuses to guess when truncated history shows no real user message", () => {
    expect(decide({ latestTimeline: [assistant(bad), fix, assistant(bad)], latestTruncated: true })).toEqual({ send: false, reason: "history-truncated" });
    expect(decide({ latestTimeline: [user("go"), assistant(bad)], latestTruncated: true }).send).toBe(true);
  });

  it("handles a long turn whose start fell out of the fetched window", () => {
    const tools = Array.from({ length: 5 }, () => ({ type: "tool_call" }));
    const turnTimeline = [user("go"), ...tools, assistant(bad)];
    const decision = decideAutoFix({
      turnTimeline,
      latestTimeline: [...tools.slice(2), assistant(bad)],
      latestTruncated: true,
      outcome: completed,
      maxRetries: 2,
    });
    expect(decision.send && decision.attempt).toBe(1);

    const afterTwoFixes = [user("go"), assistant(bad), fix, assistant(bad), fix, ...tools, assistant(bad)];
    expect(decideAutoFix({
      turnTimeline: afterTwoFixes,
      latestTimeline: [...tools, assistant(bad)],
      latestTruncated: true,
      outcome: completed,
      maxRetries: 2,
    })).toEqual({ send: false, reason: "limit-reached" });
  });

  it("reports every bad block in one message", () => {
    const decision = decide({ turnTimeline: [assistant(`${bad}\n\n${bad2}`)], latestTimeline: [user("go"), assistant(`${bad}\n\n${bad2}`)] });
    expect(decision.send).toBe(true);
    if (decision.send) {
      expect(decision.message).toContain("Block 1:");
      expect(decision.message).toContain("Block 2:");
    }
  });

  it("only considers the current turn for failures", () => {
    expect(decide({ turnTimeline: [user("a"), assistant(bad), user("b"), assistant(good)] })).toEqual({ send: false, reason: "no-failures" });
  });
});

describe("timelineFromPayload", () => {
  it("extracts items from fetch payload entries", () => {
    const result = timelineFromPayload({
      error: null,
      hasOlder: true,
      entries: [{ item: { type: "user_message", text: "hi" } }, { item: { type: "tool_call" } }],
    });
    expect(result).toEqual({
      items: [{ type: "user_message", text: "hi" }, { type: "tool_call", text: undefined }],
      truncated: true,
    });
  });

  it("returns null for errors and malformed payloads", () => {
    expect(timelineFromPayload({ error: "boom", entries: [] })).toBeNull();
    expect(timelineFromPayload({ entries: "nope" })).toBeNull();
    expect(timelineFromPayload({ entries: [{ nope: 1 }] })).toBeNull();
    expect(timelineFromPayload(null)).toBeNull();
    expect(timelineFromPayload(undefined)).toBeNull();
  });
});

describe("idleGate", () => {
  it("only lets an idle agent through", () => {
    expect(idleGate("idle")).toBeNull();
    expect(idleGate("running")).toBe("busy");
    expect(idleGate("initializing")).toBe("busy");
    expect(idleGate("error")).toBe("busy");
    expect(idleGate(null)).toBe("status-unavailable");
  });
});

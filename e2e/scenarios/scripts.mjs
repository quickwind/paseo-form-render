// Scripts for the fake provider (e2e/plugins/pfr-e2e-fake). The harness writes them to
// `<state>/scenarios.json`; the provider reads that file on every prompt.
//
// A session selects a script with a first prompt starting with `SCENARIO:<name>`. Each prompt
// the session receives (the first one, auto-fix requests, user messages) is answered with the
// next reply; the last reply repeats. A reply is one of:
//   { text }                      one assistant message
//   { chunks: [...] }             one assistant message streamed as growing snapshots
//   { messages: [...] }           several assistant messages (toolBetween: tool calls between)
// plus optional chunkDelayMs, startDelayMs, delayMs and outcome
// ("completed" | "failed" | "canceled" | "hang" -- hang waits for an interrupt).
// Text starting with "@" is replaced by the macro of that name.

const fence = (json) => "```pfr-form\n" + json + "\n```";

const BAD = "Here is your form:\n\n" + fence(JSON.stringify({ type: "Card", title: "Volume", children: [{ type: "Slider", id: "vol", label: "Volume" }] }, null, 2)) + "\n\nLet me know.";
const BAD2 = "Second try:\n\n" + fence(JSON.stringify({ type: "Card", title: "Volume", children: [{ type: "Input", id: "vol" }] }, null, 2));
const BADJSON = "Broken:\n\n" + fence('{ "type": "Card", "children": [ { "type": "Text" "text": "hi" } ] }');
const GOOD = "Fixed:\n\n" + fence(JSON.stringify({ type: "Card", title: "Volume", children: [{ type: "Input", id: "vol", label: "Volume", inputType: "number" }] }, null, 2));
const TYPO = "Typo form:\n\n" + fence(JSON.stringify({ type: "Card", children: [{ type: "Inpt", id: "a", label: "A" }] }));
const RICH = "Rich:\n\n" + fence(JSON.stringify({ type: "Card", title: "Release plan", children: [
  { type: "Steps", items: [{ title: "Run the tests", detail: "npm test", status: "done" }, { title: "Tag the release", status: "current" }, { title: "Publish", detail: "needs 2FA", status: "blocked" }] },
  { type: "Code", language: "bash", code: "git tag v1.2.3 && git push --tags" },
  { type: "Details", title: "Advanced options", children: [{ type: "Text", text: "Hidden until expanded" }, { type: "Input", id: "otp", label: "One-time code", required: true }] },
  { type: "Button", label: "Publish now", variant: "primary", action: "submit", message: "go" },
] }, null, 2));
const RICH2 = "Rich2:\n\n" + fence(JSON.stringify({ type: "Card", title: "Server report", children: [
  { type: "SegmentedBar", unit: "GB", parts: [{ label: "Code", value: 40 }, { label: "Deps", value: 30 }, { label: "Cache", value: 10 }] },
  { type: "KeyValue", pairs: [{ label: "Region", value: "eu-west" }, { label: "Nodes", value: 3 }] },
  { type: "Tabs", tabs: [
    { label: "General", children: [{ type: "Input", id: "host", label: "Hostname", defaultValue: "srv1" }] },
    { label: "Advanced", children: [{ type: "Input", id: "token", label: "Access token", required: true }] },
  ] },
  { type: "Button", label: "Apply", variant: "primary", action: "submit", message: "go" },
] }, null, 2));
const RICH3 = "Rich3:\n\n" + fence(JSON.stringify({ type: "Card", title: "Review", children: [
  { type: "Markdown", text: "Please **review** the `deploy` notes:\n\n- first point\n- second point" },
  { type: "Sparkline", label: "Latency", values: [4, 6, 5, 9, 7, 12] },
  { type: "Chart", title: "Requests", unit: "k", labels: ["Mon", "Tue", "Wed"], series: [{ name: "api", values: [12, 18, 9] }, { name: "web", values: [7, 5, 11], tone: "warning" }] },
  { type: "Chart", title: "Daily load", labels: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"], series: [{ name: "load", values: [3, -2, 5, 8, 1, 0, 4, 6, -1, 7, 2, 9] }] },
  { type: "Select", id: "mode", label: "Mode", defaultValue: "fast", options: [{ label: "Fast", value: "fast", description: "Skips the slow checks" }, { label: "Safe", value: "safe" }] },
  { type: "Rating", id: "score", label: "Overall score", required: true },
  { type: "Button", label: "Send review", variant: "primary", action: "submit", message: "go" },
] }, null, 2));
const PLAIN = "Just plain text, no form here. ```js\nconsole.log(1)\n```";
const goodHalfA = "Split form:\n\n```pfr-form\n{\n  \"type\": \"Card\",\n  \"title\": \"Split\",\n";
const goodHalfB = "  \"children\": [ { \"type\": \"Text\", \"text\": \"hello\" } ]\n}\n```\nDone.";
const steps = (n) => Array.from({ length: n }, (_, i) => `working step ${i}`);

export const SCRIPTS = {
  __macros: { BAD, BAD2, BADJSON, GOOD, PLAIN, RICH, RICH2, RICH3, TYPO },
  s1: [{ text: "@BAD" }, { text: "@GOOD" }],
  s1b: [{ text: "@TYPO" }, { text: "@GOOD" }],
  s2: [{ text: "@BAD" }, { text: "@BAD2" }, { text: "@BADJSON" }, { text: "@BAD" }],
  s3: [{ text: "@BAD" }, { text: "@BAD" }, { text: "@BAD" }],
  s4: [{ text: "@BAD" }, { text: "@BAD" }, { text: "@BAD" }, { text: "@BAD" }, { text: "@GOOD" }],
  s5: [{ text: "@PLAIN" }, { text: "@BAD" }, { text: "@PLAIN" }, { text: "@PLAIN" }],
  s5slow: [{ text: "@PLAIN" }, { text: "@BAD" }, { text: "Slow reply to the REAL user message", startDelayMs: 1500 }, { text: "@PLAIN" }],
  s5hook: [{ text: "@BAD" }, { text: "@PLAIN" }, { text: "@PLAIN" }],
  s6fail: [{ text: "@BAD", outcome: "failed" }, { text: "@PLAIN" }],
  s6cancel: [{ text: "@BAD", outcome: "canceled" }, { text: "@PLAIN" }],
  s6hang: [{ text: "@BAD", outcome: "hang" }, { text: "@PLAIN" }],
  s6failafter: [{ text: "@BAD" }, { text: "@BAD", outcome: "failed" }, { text: "@PLAIN" }],
  s7good: [{ text: "@GOOD" }],
  s7plain: [{ text: "@PLAIN" }],
  s7rich: [{ text: "@RICH" }],
  s7rich2: [{ text: "@RICH2" }],
  s7rich3: [{ text: "@RICH3" }],
  s8chunks: [{ chunks: ["Here is ", "your form:\n\n```pfr-", "form\n{\"type\":\"Card\",\"children\":[{\"type\":\"Sli", "der\",\"id\":\"v\"}]}\n```\n", "End."], chunkDelayMs: 30 }, { text: "@GOOD" }],
  s8split: [{ messages: [goodHalfA, goodHalfB] }, { text: "@GOOD" }],
  s8splittool: [{ messages: [goodHalfA, goodHalfB], toolBetween: true }, { text: "@GOOD" }],
  s8multi: [{ messages: ["@BAD", "@GOOD"], toolBetween: true }, { text: "@GOOD" }],
  s8big: [{ messages: [...steps(140), "@BAD"], toolBetween: true, chunkDelayMs: 1 }, { text: "@GOOD" }],
  s8huge: [{ messages: [...steps(200), "@BAD"], toolBetween: true, chunkDelayMs: 1 }, { text: "@GOOD" }],
  // UI manual fix: the reply to the fix request is delayed so the button's sent state can be seen.
  uimanual: [{ text: "@BAD" }, { text: "@GOOD", startDelayMs: 4000 }],
  restart: [{ text: "@PLAIN" }, { text: "@PLAIN" }, { text: "@BAD" }, { text: "@GOOD" }],
};

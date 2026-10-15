// Scripts for the fake provider (e2e/plugins/irix-e2e-fake). The harness writes them to
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

const fence = (json) => "```irix-form\n" + json + "\n```";

const BAD = "Here is your form:\n\n" + fence(JSON.stringify({ type: "Card", title: "Volume", children: [{ type: "Slider", id: "vol", label: "Volume" }] }, null, 2)) + "\n\nLet me know.";
const BAD2 = "Second try:\n\n" + fence(JSON.stringify({ type: "Card", title: "Volume", children: [{ type: "Input", id: "vol" }] }, null, 2));
const BADJSON = "Broken:\n\n" + fence('{ "type": "Card", "children": [ { "type": "Text", "text": "hi" }, ] }');
const GOOD = "Fixed:\n\n" + fence(JSON.stringify({ type: "Card", title: "Volume", children: [{ type: "Input", id: "vol", label: "Volume", inputType: "number" }] }, null, 2));
const TYPO = "Typo form:\n\n" + fence(JSON.stringify({ type: "Card", children: [{ type: "Inpt", id: "a", label: "A" }] }));
const PLAIN = "Just plain text, no form here. ```js\nconsole.log(1)\n```";
const goodHalfA = "Split form:\n\n```irix-form\n{\n  \"type\": \"Card\",\n  \"title\": \"Split\",\n";
const goodHalfB = "  \"children\": [ { \"type\": \"Text\", \"text\": \"hello\" } ]\n}\n```\nDone.";
const steps = (n) => Array.from({ length: n }, (_, i) => `working step ${i}`);

export const SCRIPTS = {
  __macros: { BAD, BAD2, BADJSON, GOOD, PLAIN, TYPO },
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
  s8chunks: [{ chunks: ["Here is ", "your form:\n\n```irix-", "form\n{\"type\":\"Card\",\"children\":[{\"type\":\"Sli", "der\",\"id\":\"v\"}]}\n```\n", "End."], chunkDelayMs: 30 }, { text: "@GOOD" }],
  s8split: [{ messages: [goodHalfA, goodHalfB] }, { text: "@GOOD" }],
  s8splittool: [{ messages: [goodHalfA, goodHalfB], toolBetween: true }, { text: "@GOOD" }],
  s8multi: [{ messages: ["@BAD", "@GOOD"], toolBetween: true }, { text: "@GOOD" }],
  s8big: [{ messages: [...steps(140), "@BAD"], toolBetween: true, chunkDelayMs: 1 }, { text: "@GOOD" }],
  s8huge: [{ messages: [...steps(200), "@BAD"], toolBetween: true, chunkDelayMs: 1 }, { text: "@GOOD" }],
  restart: [{ text: "@PLAIN" }, { text: "@PLAIN" }, { text: "@BAD" }, { text: "@GOOD" }],
};

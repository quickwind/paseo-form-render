// Experiment: does a model (Devin / SWE) produce valid forms more reliably as JSON or as tags?
// Both formats are explained in the USER message (Devin ignores config.systemPrompt, so the plugin's
// injected instructions never reach it). Runs against the local Paseo daemon; no files are changed.
//   node e2e/experiments/format-compare/run.mjs [--model devin/swe-1-6-slow] [--reps 3] [--limit N] [--concurrency 2] [--max-calls 160]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { createPaseoApi } from "@getpaseo/client";
import { readLocalCredentialForTarget } from "@getpaseo/server/daemon-control";
import { WebSocket } from "ws";
import { DEFAULT_MAX_CALLS, assertCallBudget, cleanupOnSignal, clampConcurrency, deleteAgent, removeTestProject, trackAgent } from "../lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
};
const MODEL = arg("model", "devin/swe-1-6-slow");
const REPS = Number(arg("reps", 3));
const LIMIT = Number(arg("limit", 99));
const CONCURRENCY = clampConcurrency(Number(arg("concurrency", NaN))); // default 2, at most 3
const MAX_CALLS = Number(arg("max-calls", DEFAULT_MAX_CALLS));
const HOST = "127.0.0.1:6767";
const PASEO_HOME = path.join(os.homedir(), ".paseo");

const TASKS = [
  "I need a form to collect a new user's name, email and role (admin, editor, viewer).",
  "Ask me to confirm deleting the 'staging-db' database; show the database name and size (12 GB) and require typing the name to confirm.",
  "Show a status dashboard with three metrics (uptime 99.9%, requests 12.4k, errors 17), a progress bar for the migration at 65%, and a table of three services with their status.",
  "Build a form to configure a nightly backup: time (HH:MM), retention days (1-365), which folders to include (pick a folder), and a toggle for compression.",
  "I want to choose which of these test suites to run: unit, integration, e2e, lint, types. Let me pick several and set a timeout in minutes.",
  "Collect a bug report: title, severity (low/medium/high/critical), steps to reproduce (multi-line), and an optional log file (.log or .txt).",
  "Present a deployment summary: environment Production, version 2.4.1, an alert warning that the rollout touches billing, and Approve / Reject buttons.",
  "Ask for an API key (password field), a base URL (url), and a request timeout in seconds between 1 and 60.",
  "Show a table comparing three database options (Postgres, MySQL, SQLite) with columns name, speed, cost, and let me select one as my choice.",
  "A feedback survey: overall rating 1-5 (integer), what went well (multi-line), would you recommend (toggle), and a submit button.",
].slice(0, LIMIT);

const vite = await createServer({ root, appType: "custom", server: { middlewareMode: true }, logLevel: "silent" });
const load = (p) => vite.ssrLoadModule(path.join(root, p));
const { buildPromptInstruction } = await load("shared/prompt.ts");
const { PfrFormSchema } = await load("shared/schema.ts");
const { parseFormBlock } = await load("shared/parser.ts");
const { TAG_SPEC, tagsToForm } = await vite.ssrLoadModule(path.join(here, "tags.ts"));

const ARMS = {
  json: { spec: buildPromptInstruction({ preferForms: false }), label: "pfr-form" },
  tags: { spec: TAG_SPEC, label: "pfr-tags" },
};

function fenceBody(text, label) {
  const re = new RegExp("```" + label + "[^\\n]*\\n([\\s\\S]*?)(?:\\n```|$)");
  return re.exec(text)?.[1] ?? null;
}

/** strict = what the parser accepted before leniency; lenient = what it accepts now. */
function evaluate(arm, reply) {
  const body = fenceBody(reply, ARMS[arm].label);
  if (body === null) return { fence: false, strict: false, lenient: false, error: "no fenced block" };
  const chars = body.length;
  if (arm === "json") {
    let strict = false;
    let error = null;
    try {
      const v = PfrFormSchema.safeParse(JSON.parse(body));
      strict = v.success;
      if (!v.success) error = "schema";
    } catch {
      error = "json syntax";
    }
    const lenient = !!parseFormBlock(body).form;
    return { fence: true, chars, strict, lenient, error: strict ? null : error };
  }
  try {
    const ok = PfrFormSchema.safeParse(tagsToForm(body)).success;
    return { fence: true, chars, strict: ok, lenient: ok, error: ok ? null : "schema" };
  } catch (e) {
    return { fence: true, chars, strict: false, lenient: false, error: `tag syntax: ${e.message}` };
  }
}

const client = new DaemonClient({
  url: `ws://${HOST}/ws`, clientId: `exp-${randomUUID()}`, clientType: "cli", appVersion: "0.15.3",
  localCredential: () => readLocalCredentialForTarget(PASEO_HOME, HOST) ?? undefined,
  connectTimeoutMs: 30000,
  webSocketFactory: (url, config) => new WebSocket(url, config?.protocols, { headers: config?.headers }),
  reconnect: { enabled: false },
});
await client.connect();
const api = createPaseoApi(client);
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pfr-exp-"));
cleanupOnSignal(() => removeTestProject(cwd));

async function runOne(arm, taskIdx, rep) {
  const prompt = `${ARMS[arm].spec}\n\n---\nTask: ${TASKS[taskIdx]}\nReply with the form in a fenced code block exactly as specified above, plus at most one short sentence. Do not use any tools and do not read or write files.`;
  const started = Date.now();
  const agent = await api.agents.create({ config: { provider: MODEL }, cwd, title: `pfr-exp ${arm} t${taskIdx} r${rep}`, prompt });
  trackAgent(agent.id);
  const ref = api.agents.ref(agent.id);
  let timedOut = true;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    await ref.refresh().catch(() => null);
    if (ref.status !== "running" && i > 0) {
      timedOut = false;
      break;
    }
  }
  const page = await ref.timeline.refetch({ direction: "tail", limit: 100, projection: "projected" }).catch(() => ({ entries: [] }));
  const reply = (page.entries ?? []).filter((e) => e.item?.type === "assistant_message").map((e) => e.item.text).join("\n");
  const toolCalls = (page.entries ?? []).filter((e) => /tool/i.test(e.item?.type ?? "")).length;
  deleteAgent(agent.id); // keep the user's agent list clean
  return { arm, task: taskIdx, rep, ms: Date.now() - started, timedOut, toolCalls, replyChars: reply.length, ...evaluate(arm, reply), reply };
}

const jobs = [];
for (let rep = 0; rep < REPS; rep++) for (let t = 0; t < TASKS.length; t++) for (const arm of Object.keys(ARMS)) jobs.push([arm, t, rep]);
assertCallBudget(jobs.length, MAX_CALLS);
console.log(`${jobs.length} model calls, ${CONCURRENCY} at a time`);
const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const [arm, t, rep] = jobs[next++];
      try {
        const r = await runOne(arm, t, rep);
        results.push(r);
        console.log(`${arm} task${t} rep${rep}: fence=${r.fence} strict=${r.strict} lenient=${r.lenient} chars=${r.chars ?? "-"} ${r.error ?? ""}`);
      } catch (e) {
        console.log(`${arm} task${t} rep${rep}: ERROR ${e.message}`);
        results.push({ arm, task: t, rep, error: `run error: ${e.message}`, fence: false, strict: false, lenient: false });
      }
    }
  }),
);

const out = path.join(here, "results.json");
fs.writeFileSync(out, JSON.stringify({ model: MODEL, reps: REPS, tasks: TASKS, results }, null, 2));
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "-");
for (const arm of Object.keys(ARMS)) {
  const rs = results.filter((r) => r.arm === arm);
  const avg = rs.filter((r) => r.chars).reduce((s, r) => s + r.chars, 0) / Math.max(1, rs.filter((r) => r.chars).length);
  console.log(`${arm}: n=${rs.length} fence=${pct(rs.filter((r) => r.fence).length, rs.length)} strict=${pct(rs.filter((r) => r.strict).length, rs.length)} lenient=${pct(rs.filter((r) => r.lenient).length, rs.length)} avgChars=${Math.round(avg)}`);
}
await vite.close();
removeTestProject(cwd); // the project (and workspaces) Paseo registered for it, and the temp directory
process.exit(0);

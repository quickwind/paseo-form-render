// Experiment: does the grown prompt (26 component lines) make a model write worse forms than the
// 0.3.1 prompt (16), and does it pick the new components when they fit? Both prompts go in the USER
// message (Devin ignores config.systemPrompt). Runs against the local Paseo daemon; no files change.
//   node e2e/experiments/prompt-compare/run.mjs [--model devin/swe-1-6-slow] [--reps 3] [--limit N] [--concurrency 4]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { createPaseoApi } from "@getpaseo/client";
import { readLocalCredentialForTarget } from "@getpaseo/server/daemon-control";
import { WebSocket } from "ws";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
};
const MODEL = arg("model", "devin/swe-1-6-slow");
const REPS = Number(arg("reps", 3));
const LIMIT = Number(arg("limit", 99));
const CONCURRENCY = Number(arg("concurrency", 4));
const ONLY = arg("only", null); // e.g. "C": run just that task group
const ARM_NAMES = (arg("arms", "old,new")).split(",");
const HOST = "127.0.0.1:6767";
const PASEO_HOME = path.join(os.homedir(), ".paseo");

// Group A: ordinary forms (regression). Group B: the natural answer uses a component that only the new prompt has.
const TASKS = [
  { g: "A", t: "I need a form to collect a new user's name, email and role (admin, editor, viewer)." },
  { g: "A", t: "Ask me to confirm deleting the 'staging-db' database; show the database name and size (12 GB) and require typing the name to confirm." },
  { g: "A", t: "Show a status dashboard with three metrics (uptime 99.9%, requests 12.4k, errors 17), a progress bar for the migration at 65%, and a table of three services with their status." },
  { g: "A", t: "Build a form to configure a nightly backup: time (HH:MM), retention days (1-365), which folders to include (pick a folder), and a toggle for compression." },
  { g: "A", t: "I want to choose which of these test suites to run: unit, integration, e2e, lint, types. Let me pick several and set a timeout in minutes." },
  { g: "A", t: "Collect a bug report: title, severity (low/medium/high/critical), steps to reproduce (multi-line), and an optional log file (.log or .txt)." },
  { g: "A", t: "Present a deployment summary: environment Production, version 2.4.1, an alert warning that the rollout touches billing, and Approve / Reject buttons." },
  { g: "A", t: "Ask for an API key (password field), a base URL (url), and a request timeout in seconds between 1 and 60." },
  { g: "A", t: "Show a table comparing three database options (Postgres, MySQL, SQLite) with columns name, speed, cost, and let me select one as my choice." },
  { g: "A", t: "A feedback survey: overall rating 1-5 (integer), what went well (multi-line), would you recommend (toggle), and a submit button." },
  { g: "B", expect: ["Chart"], t: "Show weekly sales Monday to Friday as a bar chart with two series: online [120, 150, 90, 170, 200] and store [80, 60, 110, 95, 130]." },
  { g: "B", expect: ["Steps"], t: "Show the release plan as steps with their status: run tests (done), build (in progress), deploy to staging (blocked, waiting for approval), announce (not started)." },
  { g: "B", expect: ["Tabs"], t: "A settings page with two sections: General (site name, language) and Notifications (email toggle, frequency daily or weekly). Show one section at a time." },
  { g: "B", expect: ["Rating"], t: "Ask me to rate the support I received from 1 to 5 stars and leave an optional comment." },
  { g: "B", expect: ["Code"], t: "Show the shell command to rebuild the docker image, `docker build -t app:latest .`, so I can copy it." },
  { g: "B", expect: ["SegmentedBar", "Chart"], t: "Show the disk usage breakdown as proportions of the whole: system 40 GB, apps 120 GB, media 85 GB, free 255 GB." },
  { g: "B", expect: ["Markdown"], t: "Summarize the meeting: a bold heading 'Decisions', a bulleted list of three decisions, and a link to https://example.com/notes." },
  { g: "B", expect: ["KeyValue"], t: "Show server info as a compact list of properties: hostname web-01, region eu-west, uptime 41 days, version 2.4.1." },
  { g: "B", expect: ["Details"], t: "Show a short deployment summary, with the full changelog (five lines) tucked into a collapsible section." },
  { g: "B", expect: ["Sparkline", "Chart"], t: "Show the current error rate 0.8% together with a tiny trend of the last 10 hours: 1.2, 1.1, 0.9, 1.0, 1.4, 1.1, 0.9, 0.7, 0.8, 0.8." },
  // Group C: neutral wording, no component named. Any listed component counts as a good choice.
  { g: "C", expect: ["Chart", "Sparkline"], t: "How did our sales change this week? Monday 120, Tuesday 150, Wednesday 90, Thursday 170, Friday 200." },
  { g: "C", expect: ["Steps"], t: "Walk me through where the deployment stands: tests passed, the build is running, the production deploy is waiting for approval, and the announcement is not sent yet." },
  { g: "C", expect: ["Tabs", "Details"], t: "Make a settings page for a blog with an Appearance part (theme, font size) and a Privacy part (analytics toggle, cookie banner toggle)." },
  { g: "C", expect: ["Rating"], t: "How was your experience with our support team? We would like a score and optional comments." },
  { g: "C", expect: ["Code", "Markdown"], t: "Tell me how to rebuild the docker image: the command is docker build -t app:latest ." },
  { g: "C", expect: ["SegmentedBar", "Chart"], t: "Where does my disk space go? System 40 GB, apps 120 GB, media 85 GB, free 255 GB." },
  { g: "C", expect: ["Markdown"], t: "Give me the meeting notes. Decisions: ship on Friday, hire a designer, drop feature X. Full notes are at https://example.com/notes." },
  { g: "C", expect: ["KeyValue", "Table"], t: "Which server am I on? Hostname web-01, region eu-west, uptime 41 days, version 2.4.1." },
  { g: "C", expect: ["Details"], t: "The deployment finished successfully. Changelog: fixed login timeout; faster dashboard; export preferences; updated dependencies; resolved rate limiting." },
  { g: "C", expect: ["Sparkline", "Chart"], t: "The error rate is 0.8% right now. Over the last ten hours it was 1.2, 1.1, 0.9, 1.0, 1.4, 1.1, 0.9, 0.7, 0.8, 0.8." },
].filter((task) => !ONLY || task.g === ONLY).slice(0, LIMIT);

const vite = await createServer({ root, appType: "custom", server: { middlewareMode: true }, logLevel: "silent" });
const { buildPromptInstruction } = await vite.ssrLoadModule(path.join(root, "shared/prompt.ts"));
const { parseFormBlock } = await vite.ssrLoadModule(path.join(root, "shared/parser.ts"));
const oldPrompt = await vite.ssrLoadModule(path.join(here, "old-prompt.ts"));

const ALL_ARMS = {
  old: oldPrompt.buildPromptInstruction({ preferForms: false }),
  new: buildPromptInstruction({ preferForms: false }),
};
const ARMS = Object.fromEntries(Object.entries(ALL_ARMS).filter(([name]) => ARM_NAMES.includes(name)));

function categorize(errorText) {
  if (!errorText) return null;
  if (/syntax error|empty/.test(errorText)) return "json-syntax";
  if (/duplicate field id/.test(errorText)) return "duplicate-id";
  if (/exactly one value per label|at most \d+/.test(errorText)) return "chart-size";
  if (/unknown component type/.test(errorText)) return "unknown-type";
  return "schema";
}

function componentsOf(json) {
  const found = new Set();
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (typeof n.type === "string") found.add(n.type);
    for (const c of n.children ?? []) walk(c);
    for (const tab of n.tabs ?? []) for (const c of tab?.children ?? []) walk(c);
  };
  walk(json);
  return [...found];
}

function evaluate(task, reply) {
  const m = /```pfr-form[^\n]*\n([\s\S]*?)(?:\n```|$)/.exec(reply);
  if (!m) return { fence: false, valid: false, error: "no fenced block", category: "no-fence", components: [] };
  const body = m[1];
  let strictJson = true;
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    strictJson = false;
  }
  const block = parseFormBlock(body);
  let components = [];
  try {
    components = componentsOf(parsed ?? JSON.parse(body));
  } catch {
    /* unrepairable */
  }
  const valid = !!block.form;
  return {
    fence: true,
    chars: body.length,
    strictJson,
    valid,
    error: valid ? null : String(block.error ?? "").slice(0, 300),
    category: valid ? null : categorize(block.error),
    components,
    fit: task.g !== "A" ? task.expect.some((c) => components.includes(c)) : null,
  };
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

async function runOne(arm, taskIdx, rep) {
  const task = TASKS[taskIdx];
  const prompt = `${ARMS[arm]}\n\n---\nTask: ${task.t}\nReply with the form in a fenced code block exactly as specified above, plus at most one short sentence. Do not use any tools and do not read or write files.`;
  const started = Date.now();
  const agent = await api.agents.create({ config: { provider: MODEL }, cwd, title: `pfr-exp ${arm} t${taskIdx} r${rep}`, prompt });
  const ref = api.agents.ref(agent.id);
  try {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await ref.refresh().catch(() => null);
      if (ref.status !== "running" && i > 0) break;
    }
    const page = await ref.timeline.refetch({ direction: "tail", limit: 100, projection: "projected" }).catch(() => ({ entries: [] }));
    const reply = (page.entries ?? []).filter((e) => e.item?.type === "assistant_message").map((e) => e.item.text).join("\n");
    return { arm, group: task.g, task: taskIdx, rep, ms: Date.now() - started, ...evaluate(task, reply), reply };
  } finally {
    spawnSync("paseo", ["delete", agent.id], { stdio: "ignore" }); // keep the user's agent list clean
  }
}

const jobs = [];
for (let rep = 0; rep < REPS; rep++) for (let t = 0; t < TASKS.length; t++) for (const arm of Object.keys(ARMS)) jobs.push([arm, t, rep]);
const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const [arm, t, rep] = jobs[next++];
      try {
        const r = await runOne(arm, t, rep);
        results.push(r);
        console.log(`${arm} ${r.group}${t} rep${rep}: valid=${r.valid} comps=${r.components.join("+")} ${r.category ?? ""}`);
      } catch (e) {
        console.log(`${arm} t${t} rep${rep}: ERROR ${e.message}`);
        results.push({ arm, group: TASKS[t].g, task: t, rep, valid: false, fence: false, category: "run-error", error: e.message, components: [] });
      }
    }
  }),
);

fs.writeFileSync(path.join(here, ONLY ? `results-${ONLY}.json` : "results.json"), JSON.stringify({ model: MODEL, reps: REPS, tasks: TASKS, promptChars: { old: ALL_ARMS.old.length, new: ALL_ARMS.new.length }, results }, null, 2));

const pct = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : "-");
for (const group of ["A", "B", "C"]) {
  for (const arm of Object.keys(ARMS)) {
    const rs = results.filter((r) => r.arm === arm && r.group === group);
    const cats = {};
    rs.filter((r) => !r.valid).forEach((r) => (cats[r.category] = (cats[r.category] ?? 0) + 1));
    const withChars = rs.filter((r) => r.chars);
    const avg = Math.round(withChars.reduce((s, r) => s + r.chars, 0) / Math.max(1, withChars.length));
    const fit = group !== "A" ? ` fit=${pct(rs.filter((r) => r.fit).length, rs.length)}` : "";
    console.log(`group ${group} ${arm}: valid=${pct(rs.filter((r) => r.valid).length, rs.length)} strictJson=${pct(rs.filter((r) => r.strictJson).length, rs.length)}${fit} avgChars=${avg} failures=${JSON.stringify(cats)}`);
  }
}
console.log("\nPer task (fit counts per arm):");
TASKS.forEach((task, i) => {
  if (task.g === "A") return;
  const parts = Object.keys(ARMS).map((arm) => {
    const rs = results.filter((r) => r.arm === arm && r.task === i);
    return `${arm} ${rs.filter((r) => r.fit).length}/${rs.length} [${[...new Set(rs.flatMap((r) => r.components))].filter((c) => !["Card", "Button", "Divider", "Stack", "Heading"].includes(c)).join("+")}]`;
  });
  console.log(`  ${task.g} ${task.expect.join("/")}: ${parts.join(", ")}`);
});
await vite.close();
fs.rmSync(cwd, { recursive: true, force: true }); // the empty temp working directory
process.exit(0);

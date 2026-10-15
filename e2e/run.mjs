#!/usr/bin/env node
// irix-ui-render auto-fix end-to-end tests against a real Paseo daemon with a scripted fake provider.
//
// usage: node e2e/run.mjs [options] [scenario ...]
//   scenarios        s1 s2 s3 s4 s5 s6 s7 s8 (default: all of them); optional: restart nocmid
//   --all            default scenarios plus the optional ones
//   --repeat N       run each scenario N times (default 1)
//   --time-scale X   multiply quiet periods and timeouts by X (default 1, env E2E_TIME_SCALE)
//   --out DIR        results directory (default e2e/results; replaced on every run)
//   --keep           keep the temp workspace (Paseo home, logs, plugin state) for debugging
//
// Exit code: 0 when every non-informational check passed. S5 (a documented Paseo limitation) is
// reported as "known limitation" and never fails the run.
import fs from "node:fs";
import path from "node:path";
import { Daemon, E2E_DIR, Workspace, freePort } from "./lib/daemon.mjs";
import { Harness, Results } from "./lib/client.mjs";
import { DEFAULT_SCENARIOS, INFORMATIONAL_SCENARIOS, OPTIONAL_SCENARIOS, SCENARIOS } from "./scenarios/checks.mjs";
import { SCRIPTS } from "./scenarios/scripts.mjs";

function parseArgs(argv) {
  const opts = {
    repeat: 1,
    timeScale: Number(process.env.E2E_TIME_SCALE ?? 1),
    out: path.join(E2E_DIR, "results"),
    keep: false,
    scenarios: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === "--repeat") opts.repeat = Number(value());
    else if (arg === "--time-scale") opts.timeScale = Number(value());
    else if (arg === "--out") opts.out = path.resolve(value());
    else if (arg === "--keep") opts.keep = true;
    else if (arg === "--all") opts.scenarios.push(...DEFAULT_SCENARIOS, ...OPTIONAL_SCENARIOS);
    else if (arg === "--help" || arg === "-h") {
      console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split(/\r?\n/).slice(1, 13).join("\n"));
      process.exit(0);
    } else if (arg.startsWith("-")) throw new Error(`unknown option ${arg}`);
    else opts.scenarios.push(arg.toLowerCase());
  }
  if (!opts.scenarios.length) opts.scenarios = [...DEFAULT_SCENARIOS];
  for (const s of opts.scenarios) {
    if (!SCENARIOS[s]) throw new Error(`unknown scenario "${s}" (known: ${Object.keys(SCENARIOS).join(" ")})`);
  }
  if (!(opts.repeat >= 1)) throw new Error("--repeat must be >= 1");
  if (!(opts.timeScale > 0)) throw new Error("--time-scale must be > 0");
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const order = [...DEFAULT_SCENARIOS, ...OPTIONAL_SCENARIOS].filter((s) => opts.scenarios.includes(s));
const started = Date.now();

// Only replace a previous results directory, never an arbitrary non-empty directory.
if (fs.existsSync(opts.out) && fs.readdirSync(opts.out).length) {
  if (!fs.existsSync(path.join(opts.out, "results.json")) && !fs.existsSync(path.join(opts.out, "logs"))) {
    console.error(`[e2e] --out ${opts.out} is not empty and does not look like an e2e results directory`);
    process.exit(2);
  }
  fs.rmSync(opts.out, { recursive: true, force: true });
}
fs.mkdirSync(opts.out, { recursive: true });

const ws = new Workspace({ keep: opts.keep });
const daemon = new Daemon(ws, { port: await freePort(), timeScale: opts.timeScale });
const h = new Harness(ws, daemon, { timeScale: opts.timeScale });
const results = new Results();
const evidence = {};
const timings = {};
let setupError = null;

process.on("exit", () => daemon.killNow());
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.error(`[e2e] ${signal}: stopping`);
    daemon.killNow();
    process.exit(130);
  });
}

console.log(`[e2e] node ${process.version} on ${process.platform}/${process.arch}`);
console.log(`[e2e] workspace ${ws.root}`);
console.log(`[e2e] scenarios ${order.join(" ")} x${opts.repeat}, time scale ${opts.timeScale}`);

try {
  fs.writeFileSync(path.join(ws.state, "scenarios.json"), JSON.stringify(SCRIPTS, null, 2));
  const { pluginUnderTest, fake } = ws.stagePlugins();
  await daemon.start("daemon");
  for (const dir of [pluginUnderTest, fake]) {
    daemon.cli(["plugin", "install", dir, "--json"], { timeoutMs: 120000 * opts.timeScale });
  }
  const listed = JSON.parse(daemon.cli(["plugin", "ls", "--json"]).stdout);
  for (const id of ["irix-ui-render", "irix-e2e-fake"]) {
    const p = listed.find((x) => x.id === id);
    if (p?.status !== "running") throw new Error(`plugin ${id} is not running: ${JSON.stringify(p ?? listed)}`);
  }
  await h.waitPluginReady();

  const ctx = { h, results, evidence };
  for (const name of order) {
    const t0 = Date.now();
    for (let run = 1; run <= opts.repeat; run++) {
      try {
        if (!h.conn) await h.connect();
        await SCENARIOS[name](ctx, run);
      } catch (error) {
        results.check(name.toUpperCase(), `run${run}: threw`, false, String(error?.stack ?? error), {
          known: INFORMATIONAL_SCENARIOS.has(name),
        });
        // A broken connection or daemon should not take the remaining scenarios down with it.
        await h.disconnect();
        if (!daemon.child || daemon.child.exitInfo) await daemon.start("daemon-recovered").catch(() => undefined);
      }
    }
    timings[name] = Math.round((Date.now() - t0) / 1000);
    console.log(`[e2e] ${name} took ${timings[name]}s`);
  }
} catch (error) {
  setupError = String(error?.stack ?? error);
  results.check("SETUP", "harness setup", false, setupError);
} finally {
  await h.disconnect();
  await daemon.stop().catch((error) => console.warn(`[e2e] stop failed: ${error}`));
  ws.collect(path.join(opts.out, "logs"));
}

const summary = results.summary();
const report = {
  summary,
  platform: `${process.platform}/${process.arch}`,
  node: process.version,
  scenarios: order,
  repeat: opts.repeat,
  timeScale: opts.timeScale,
  durationSeconds: Math.round((Date.now() - started) / 1000),
  timings,
  setupError,
  results: results.rows,
  evidence,
};
const outFile = path.join(opts.out, "results.json");
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
ws.cleanup();

console.log(
  `\n[e2e] ${summary.passed}/${summary.total} checks passed, ${summary.failed} failed, ` +
    `${summary.knownLimitationHits} known-limitation hits (informational, S5 / split fences) in ${report.durationSeconds}s`,
);
console.log(`[e2e] results: ${outFile}`);
process.exit(summary.failed ? 1 : 0);

// Shared by the experiment scripts: a cap on how hard they hit the local daemon and the models, and
// cleanup of what a run leaves behind. Every agent a script creates makes Paseo register a workspace
// (and, per working directory, a project); deleting the agent does not remove them, so the project
// registered for the script's temp directory is deleted at the end (which removes its workspaces).
import fs from "node:fs";
import { spawnSync } from "node:child_process";

/** Never more agents at the same time than this, whatever --concurrency says. */
export const MAX_CONCURRENCY = 3;
export const DEFAULT_CONCURRENCY = 2;
/** Refuse bigger runs unless --max-calls raises it on purpose. */
export const DEFAULT_MAX_CALLS = 160;

export function clampConcurrency(requested) {
  const n = Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : DEFAULT_CONCURRENCY;
  if (n > MAX_CONCURRENCY) {
    console.warn(`--concurrency ${n} is above the limit; using ${MAX_CONCURRENCY}`);
    return MAX_CONCURRENCY;
  }
  return n;
}

export function assertCallBudget(calls, maxCalls) {
  if (calls > maxCalls) {
    console.error(`This run would make ${calls} model calls, above the limit of ${maxCalls}. Narrow it with --limit/--reps/--only/--arms, or raise the limit with --max-calls ${calls}.`);
    process.exit(2);
  }
}

function paseoJson(args) {
  const result = spawnSync("paseo", [...args, "--json"], { encoding: "utf8" });
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/** Deletes the project(s) Paseo registered for `cwd` (with their workspaces) and the directory itself. */
export function removeTestProject(cwd) {
  const paths = new Set([cwd]);
  try {
    paths.add(fs.realpathSync(cwd));
  } catch {
    /* already gone */
  }
  const projects = paseoJson(["project", "ls"]);
  const list = Array.isArray(projects) ? projects : (projects?.projects ?? []);
  let removed = 0;
  for (const project of list) {
    if (paths.has(project.path)) {
      spawnSync("paseo", ["project", "delete", project.projectId], { stdio: "ignore" });
      removed++;
    }
  }
  fs.rmSync(cwd, { recursive: true, force: true });
  return removed;
}

const liveAgents = new Set();

/** Remember an agent until it is deleted, so an interrupted run can delete the ones still alive. */
export function trackAgent(id) {
  liveAgents.add(id);
}

/** Deletes the agent now (hard delete) and forgets it. */
export function deleteAgent(id) {
  spawnSync("paseo", ["delete", id], { stdio: "ignore" });
  liveAgents.delete(id);
}

/** Runs `cleanup` once when the process is interrupted, so a Ctrl-C does not leave agents or projects behind. */
export function cleanupOnSignal(cleanup) {
  let done = false;
  const run = async (code) => {
    if (done) return;
    done = true;
    try {
      for (const id of [...liveAgents]) deleteAgent(id);
      await cleanup();
    } finally {
      process.exit(code);
    }
  };
  process.on("SIGINT", () => void run(130));
  process.on("SIGTERM", () => void run(143));
}

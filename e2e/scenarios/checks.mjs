// Scenario checks. Each scenario is `async (ctx, run) => void`, where ctx = { h, results, evidence }.
// `h` is the Harness (e2e/lib/client.mjs); scripts for the fake provider are in ./scripts.mjs.
import { MARKER, fixTexts, readSettings, resetSettings, short, writeSettings } from "../lib/client.mjs";
import { sleep } from "../lib/daemon.mjs";
import { uiManualFix, uiPluginLoaded, uiS1, uiS2, uiS7, uiSettings } from "./ui-checks.mjs";

function uniq(name) {
  return `SCENARIO:${name} run=${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function record(ctx, key, agentId, first, extra = {}) {
  const prompts = ctx.h.promptsFor(first).map((p) => ({
    kind: p.kind,
    step: p.step,
    t: p.t,
    text: p.text ?? "",
    activeTurnAtArrival: p.activeTurnAtArrival,
  }));
  const probes = ctx.h
    .probesFor(agentId)
    .filter((p) => p.kind !== "turn_started")
    .map((p) => ({
      kind: p.kind,
      t: p.t,
      outcome: p.outcome,
      eventTimelineLength: p.eventTimelineLength,
      eventTimeline: p.eventTimeline?.map((e) => `${e.type}:${short(e.text, 40)}`),
    }));
  (ctx.evidence[key] ??= []).push({ agentId, first, prompts, probes, ...extra });
  return prompts;
}

function rawJsonLeak(text) {
  return /```|"type"\s*:|"children"|\{\s*"/.test(text);
}

/** Creates an agent on script `name`, waits until it is quiet, and returns what the provider received. */
async function simple(ctx, name, key, { quietMs = 4000, noClientMessageId = false } = {}) {
  const { h } = ctx;
  const first = uniq(name);
  const agent = await h.createAgent(first, { noClientMessageId });
  await h.waitQuiet(agent.id, first, { quietMs });
  const tl = await h.timeline(agent.id);
  const prompts = record(ctx, key, agent.id, first, { timeline: tl.map((e) => `${e.type}:${short(e.text, 50)}`) });
  return { agent, first, prompts, fixes: fixTexts(prompts), tl };
}

function promptOrder(prompts) {
  return prompts
    .filter((p) => p.kind === "prompt")
    .map((p) => (p.text.startsWith(MARKER) ? "FIX" : p.text.startsWith("REAL") ? "REAL" : p.text.startsWith("go") ? "GO" : p.text.startsWith("SCENARIO") ? "SCENARIO" : "USER"));
}

export const SCENARIOS = {
  /** One invalid block -> exactly one instructive fix request, then the corrected reply ends the loop. */
  async s1(ctx, run) {
    const { results } = ctx;
    const r = await simple(ctx, "s1", "S1");
    results.check("S1", `run${run}: exactly one fix message`, r.fixes.length === 1, `fixes=${r.fixes.length}, prompts=${r.prompts.length}`);
    const fix = r.fixes[0] ?? "";
    results.check("S1", `run${run}: fix starts with marker`, fix.startsWith(MARKER));
    results.check("S1", `run${run}: fix lists unknown type "Slider"`, fix.includes('unknown component type "Slider"'), short(fix, 200));
    results.check("S1", `run${run}: fix contains no raw JSON`, !rawJsonLeak(fix));
    results.check("S1", `run${run}: no further prompts after fix`, r.prompts.length === 2, `prompts=${r.prompts.length}`);
    results.check("S1", `run${run}: timeline ends with fixed form`, r.tl.at(-1)?.type === "assistant_message" && String(r.tl.at(-1)?.text).startsWith("Fixed:"), short(r.tl.at(-1)?.text));
    if (ctx.ui) {
      await uiPluginLoaded(ctx, "S1");
      await uiS1(ctx, run, r);
    }
    const b = await simple(ctx, "s1b", "S1b");
    results.check("S1", `run${run}: typo "Inpt" gets a suggestion`, b.fixes.length === 1 && /Did you mean Input\?/.test(b.fixes[0] ?? ""), short(b.fixes[0], 200));
  },

  /** Keeps failing -> stops after the default retry limit (2) and each fix describes the latest reply. */
  async s2(ctx, run) {
    const { results } = ctx;
    const r = await simple(ctx, "s2", "S2", { quietMs: 8000 });
    results.check("S2", `run${run}: exactly 2 fix messages with default setting`, r.fixes.length === 2, `fixes=${r.fixes.length}`);
    results.check("S2", `run${run}: total prompts = 3 (no third fix after 8s quiet)`, r.prompts.length === 3, `prompts=${r.prompts.length}`);
    results.check("S2", `run${run}: second fix describes the second reply's issue (missing label)`, /label/i.test(r.fixes[1] ?? ""), short(r.fixes[1], 200));
    if (ctx.ui) await uiS2(ctx, run, r);
  },

  /** Setting autoFixMaxRetries: 0 disables, 1 limits, out-of-range rejected, persists across a daemon restart, reset. */
  async s3(ctx, run) {
    const { h, results } = ctx;
    try {
      let w = await writeSettings(h.conn.client, { autoFixMaxRetries: 0 });
      results.check("S3", `run${run}: write autoFixMaxRetries=0 saved`, w.status === "saved", JSON.stringify(w));
      let r = await simple(ctx, "s3", "S3-0", { quietMs: 6000 });
      results.check("S3", `run${run}: setting 0 -> no fix`, r.fixes.length === 0, `fixes=${r.fixes.length}`);

      w = await writeSettings(h.conn.client, { autoFixMaxRetries: 1 });
      results.check("S3", `run${run}: write autoFixMaxRetries=1 saved`, w.status === "saved", JSON.stringify(w));
      r = await simple(ctx, "s3", "S3-1", { quietMs: 6000 });
      results.check("S3", `run${run}: setting 1 -> exactly one fix`, r.fixes.length === 1, `fixes=${r.fixes.length}`);

      const invalid = await writeSettings(h.conn.client, { autoFixMaxRetries: 9 }).catch((e) => ({ error: String(e) }));
      results.check("S3", `run${run}: out-of-range value 9 rejected`, invalid.status === "invalid" || !!invalid.error, JSON.stringify(invalid));

      if (run === 1) {
        await h.restartDaemon("daemon-s3-restart");
        const s = await readSettings(h.conn.client);
        results.check("S3", "after daemon restart: setting still 1", s.status === "ready" && s.values.autoFixMaxRetries === 1, JSON.stringify(s));
        r = await simple(ctx, "s3", "S3-1-after-restart", { quietMs: 6000 });
        results.check("S3", "after daemon restart: exactly one fix", r.fixes.length === 1, `fixes=${r.fixes.length}`);
      }
      const reset = await resetSettings(h.conn.client);
      results.check("S3", `run${run}: reset restores default 2`, reset.status === "saved" && reset.values.autoFixMaxRetries === 2, JSON.stringify(reset));
    } finally {
      // Never leave a modified setting behind for later scenarios.
      await resetSettings(h.conn.client).catch(() => undefined);
    }
  },

  /** The retry count resets after a real user message. */
  async s4(ctx, run) {
    const { h, results } = ctx;
    const first = uniq("s4");
    const agent = await h.createAgent(first);
    await h.waitQuiet(agent.id, first, { quietMs: 6000 });
    let prompts = h.promptsFor(first);
    results.check("S4", `run${run}: phase 1 bad->fix->bad->fix->bad stops at 2 fixes`, fixTexts(prompts).length === 2 && prompts.length === 3, `prompts=${prompts.length}`);
    await h.conn.api.agents.ref(agent.id).send("Normal user message: please try again");
    await h.waitQuiet(agent.id, first, { quietMs: 6000 });
    prompts = record(ctx, "S4", agent.id, first);
    const order = promptOrder(prompts);
    results.check("S4", `run${run}: after normal message, a fix is sent again (count reset)`, order.join(",") === "SCENARIO,FIX,FIX,USER,FIX", order.join(","));
  },

  /**
   * Known limitation (README): a real message sent within milliseconds of the turn end can race the
   * fix request. All S5 checks are informational and never fail the run.
   */
  async s5(ctx, run) {
    const { h, results } = ctx;
    const known = { known: true };
    for (const [scen, delayMs] of [["s5", 0], ["s5", 0], ["s5", 20], ["s5", 100], ["s5", 500], ["s5slow", 0], ["s5slow", 0]]) {
      const first = uniq(scen);
      const agent = await h.createAgent(first);
      await h.waitQuiet(agent.id, first, { quietMs: 1500 });
      const ref = h.conn.api.agents.ref(agent.id);
      let completed = 0;
      let sentAt = null;
      let sendErr = null;
      const unsubscribe = ref.timeline.subscribe((ev) => {
        if (ev?.event?.type !== "turn_completed") return;
        completed++;
        if (completed !== 1) return;
        const go = () => {
          sentAt = new Date().toISOString();
          ref.send("REAL follow-up from test client").catch((e) => (sendErr = String(e)));
        };
        if (delayMs) setTimeout(go, delayMs);
        else go();
      });
      await unsubscribe.ready?.catch?.(() => undefined);
      await ref.send("go: produce the bad form");
      await h.waitQuiet(agent.id, first, { quietMs: 5000 });
      unsubscribe();
      const prompts = record(ctx, "S5", agent.id, first, {
        variant: `${scen} client-race delay=${delayMs}ms`,
        sentAt,
        sendErr,
        timeline: (await h.timeline(agent.id)).map((e) => `${e.type}:${short(e.text, 40)}`),
      });
      const order = promptOrder(prompts);
      const fixAfterReal = order.includes("FIX") && order.lastIndexOf("FIX") > order.indexOf("REAL");
      const canceled = h.probesFor(agent.id).filter((p) => p.kind === "turn_ended" && p.outcome?.kind === "canceled").length;
      results.check("S5", `run${run}: ${scen} client race (send after ${delayMs}ms): fix never sent after the real message`, !fixAfterReal, `order=${order.join(",")} canceledTurns=${canceled}`, known);
    }
    const r = await simple(ctx, "s5hook", "S5-hook", { quietMs: 5000 });
    const order = promptOrder(r.prompts);
    results.check("S5", `run${run}: hook race: fix never sent after the real message`, !(order.includes("FIX") && order.indexOf("FIX") > order.indexOf("REAL")), `order=${order.join(",")}`, known);
  },

  /** No fix for failed/canceled turns; a fix turn that fails stops the loop; user cancel mid-turn. */
  async s6(ctx, run) {
    const { h, results } = ctx;
    for (const name of ["s6fail", "s6cancel"]) {
      const r = await simple(ctx, name, `S6-${name}`, { quietMs: 5000 });
      results.check("S6", `run${run}: ${name}: no fix`, r.fixes.length === 0, `fixes=${r.fixes.length}`);
    }
    const r2 = await simple(ctx, "s6failafter", "S6-failafter", { quietMs: 5000 });
    results.check("S6", `run${run}: s6failafter (fix turn fails with bad output): exactly 1 fix, no more`, r2.fixes.length === 1 && r2.prompts.length === 2, `fixes=${r2.fixes.length} prompts=${r2.prompts.length}`);

    const first = uniq("s6hang");
    const agent = await h.createAgent(first);
    const deadline = Date.now() + h.ms(30000);
    let streamed = false;
    while (Date.now() < deadline) {
      const tl = await h.timeline(agent.id);
      if (tl.some((e) => e.type === "assistant_message")) {
        streamed = true;
        break;
      }
      await sleep(200);
    }
    results.check("S6", `run${run}: hanging turn streamed its bad form`, streamed);
    await h.conn.client.cancelAgent(agent.id);
    await h.waitQuiet(agent.id, first, { quietMs: 5000 });
    const prompts = record(ctx, "S6", agent.id, first, { variant: "user cancel mid-turn" });
    results.check("S6", `run${run}: user cancel mid-turn with bad form: no fix`, fixTexts(prompts).length === 0, `prompts=${prompts.map((p) => p.kind).join(",")}`);
    const outcome = h.probesFor(agent.id).find((p) => p.kind === "turn_ended")?.outcome;
    results.check("S6", `run${run}: cancel produced a non-completed turn_ended`, !!outcome && outcome.kind !== "completed", JSON.stringify(outcome));
  },

  /** Valid forms and plain text never trigger a fix. */
  async s7(ctx, run) {
    const agents = {};
    for (const name of ["s7good", "s7plain"]) {
      const r = await simple(ctx, name, `S7-${name}`, { quietMs: 4000 });
      agents[name] = r;
      ctx.results.check("S7", `run${run}: ${name}: no fix`, r.fixes.length === 0 && r.prompts.length === 1, `fixes=${r.fixes.length} prompts=${r.prompts.length}`);
    }
    if (ctx.ui) await uiS7(ctx, run, agents.s7good, agents.s7plain);
  },

  /** Message shapes: streamed chunks, split fences, several messages, long turns, long history. */
  async s8(ctx, run) {
    const { h, results } = ctx;
    for (const name of ["s8chunks", "s8multi"]) {
      const r = await simple(ctx, name, `S8-${name}`, { quietMs: 5000 });
      results.check("S8", `run${run}: ${name}: exactly one fix`, r.fixes.length === 1 && r.prompts.length === 2, `fixes=${r.fixes.length} prompts=${r.prompts.length} ${short(r.fixes[0], 200)}`);
    }
    for (const name of ["s8split", "s8splittool"]) {
      const r = await simple(ctx, name, `S8-${name}`, { quietMs: 5000 });
      results.check("S8", `run${run}: ${name}: at most one fix (no loop)`, r.fixes.length <= 1, `fixes=${r.fixes.length} prompts=${r.prompts.length}`);
      // README known limitation: each message is checked on its own, so a fence split across
      // messages gets a (misleading) fix request.
      results.check("S8", `run${run}: ${name}: valid form split across messages gets no fix`, r.fixes.length === 0, `fixes=${r.fixes.length}`, { known: true });
    }
    for (const name of ["s8big", "s8huge"]) {
      const r = await simple(ctx, name, `S8-${name}`, { quietMs: 6000 });
      const probe = h.probesFor(r.agent.id).find((p) => p.kind === "turn_ended");
      results.check("S8", `run${run}: ${name} (long turn, ${probe?.eventTimelineLength} timeline entries): exactly one fix`, r.fixes.length === 1, `fixes=${r.fixes.length} prompts=${r.prompts.length}`);
    }
    // Long history: every real user message restarts the count, so each one gets 2 more fixes.
    const r = await simple(ctx, "s2", "S8-long", { quietMs: 5000 });
    for (let i = 0; i < 3; i++) {
      await h.conn.api.agents.ref(r.agent.id).send(`plain follow-up ${i}`);
      await h.waitQuiet(r.agent.id, r.first, { quietMs: 4000 });
    }
    const prompts = record(ctx, "S8-long", r.agent.id, r.first);
    const order = promptOrder(prompts).join(",");
    results.check("S8", `run${run}: long history: 2 fixes after the first prompt and after each user message`, order === "SCENARIO,FIX,FIX,USER,FIX,FIX,USER,FIX,FIX,USER,FIX,FIX", order);
  },

  /** UI: the plugin settings screen shows and saves autoFixMaxRetries (browser only). */
  async uisettings(ctx, run) {
    await uiSettings(ctx, run);
  },

  /** UI: with automatic fixes off, "Ask agent to fix" sends exactly one fix request (browser only). */
  async uimanual(ctx, run) {
    await uiManualFix(ctx, run, uniq("uimanual"));
  },

  /** Optional: an agent resumed after a daemon restart still gets fixes (fresh timeline from disk). */
  async restart(ctx, run) {
    const { h, results } = ctx;
    const first = uniq("restart");
    const agent = await h.createAgent(first);
    await h.waitQuiet(agent.id, first, { quietMs: 2000 });
    await h.conn.api.agents.ref(agent.id).send("pre-restart plain message");
    await h.waitQuiet(agent.id, first, { quietMs: 2000 });
    await h.restartDaemon(`daemon-restart-scenario-${run}`);
    await h.conn.api.agents.ref(agent.id).send("post-restart: go bad");
    await h.waitQuiet(agent.id, first, { quietMs: 5000 });
    const prompts = record(ctx, "RESTART", agent.id, first);
    const order = promptOrder(prompts).join(",");
    results.check("RESTART", `run${run}: after a daemon restart, a bad reply gets exactly one fix`, order === "SCENARIO,USER,USER,FIX", order);
  },

  /** Optional: agent created without a clientMessageId (its first user message is not in the timeline). */
  async nocmid(ctx, run) {
    const { results } = ctx;
    const r1 = await simple(ctx, "s1", "NOCMID-s1", { quietMs: 5000, noClientMessageId: true });
    results.check("NOCMID", `run${run}: s1 without clientMessageId: exactly one fix`, r1.fixes.length === 1 && r1.prompts.length === 2, `fixes=${r1.fixes.length} prompts=${r1.prompts.length}`);
    const r2 = await simple(ctx, "s2", "NOCMID-s2", { quietMs: 8000, noClientMessageId: true });
    results.check("NOCMID", `run${run}: s2 without clientMessageId: stops after 2 fixes`, r2.fixes.length === 2 && r2.prompts.length === 3, `fixes=${r2.fixes.length} prompts=${r2.prompts.length}`);
  },
};

export const DEFAULT_SCENARIOS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "uisettings", "uimanual"];
export const OPTIONAL_SCENARIOS = ["restart", "nocmid"];
/** Scenarios whose failures (including exceptions) are informational. */
export const INFORMATIONAL_SCENARIOS = new Set(["s5"]);
/** Scenarios that only exist as browser UI checks; `--no-ui` skips them. */
export const UI_SCENARIOS = new Set(["uisettings", "uimanual"]);

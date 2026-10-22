// Browser UI checks (e2e/lib/browser.mjs) run inside the scenarios when the harness runs with the
// web UI (default; `--no-ui` skips them). Every check is a real assertion; screenshots of the key
// steps go to `<out>/screenshots/<platform>/<scenario>-<step>.png`.
import { MARKER, fixTexts, readSettings, resetSettings, writeSettings } from "../lib/client.mjs";

/** Screenshot name, with the run number from the second run on. */
const shotName = (scenario, step, run) => `${scenario}-${step}${run > 1 ? `-run${run}` : ""}`;

/** The GOOD macro (scenarios/scripts.mjs): a Card "Volume" with a number Input labelled "Volume". */
async function goodFormRendered(ui) {
  // Rendered: the card title and the input label are separate texts. Raw JSON (the client plugin not
  // loaded, or the fence not recognized) would show `"inputType": "number"` instead.
  await ui.until(async () => (await ui.text("Volume").count()) >= 2, { what: 'card title and input label "Volume"' });
  await ui.waitVisible(ui.text("Volume").last());
  const raw = await ui.page.getByText('"inputType"').count();
  if (raw) throw new Error(`the corrected form is shown as raw JSON (${raw} matches)`);
  return `"Volume" texts=${await ui.text("Volume").count()}`;
}

/**
 * Computed font sizes of the rendered text `needle`. When the same text is rendered several times
 * (e.g. in the tab title and in the chat) every size is returned.
 */
async function fontSizesOf(ui, needle, { exact = true } = {}) {
  return ui.page.evaluate(
    ({ needle, exact }) => {
      const nodes = Array.from(document.querySelectorAll("div,span,p")).filter((node) => {
        if (node.children.length !== 0) return false;
        const text = (node.textContent || "").trim();
        return exact ? text === needle : text.startsWith(needle);
      });
      return nodes.map((node) => parseFloat(getComputedStyle(node).fontSize));
    },
    { needle, exact },
  );
}

/** Checks shared by every UI scenario: the plugin's client bundle evaluated without errors. */
export async function uiPluginLoaded(ctx, scenario) {
  const { ui, results } = ctx;
  await ui.check(results, scenario, "plugin client bundle evaluated in the web UI", `${scenario}-plugin-load`, async () => {
    if (ui.pluginEvalErrors.length) throw new Error(ui.pluginEvalErrors.join(" | "));
  });
}

/** S1: error box with an instructive issue, the fix message, then the corrected form. */
export async function uiS1(ctx, run, r) {
  const { ui, results } = ctx;
  const S = "S1";
  await ui.openAgent(r.agent.id, r.first);
  await ui.check(results, S, `run${run}: error box shows the instructive issue`, shotName("s1", "error-box", run), async () => {
    await ui.waitVisible(ui.errorBoxes().first());
    // The whole S1 flow has finished before the page opens, so one screenshot (s1-flow, below)
    // shows the error box, the fix message and the corrected form together.
    // The error box line starts with the path; the fix message line starts with "- ".
    const issue = ui.page.getByText(/^Card "Volume" > children\[0\] \(Slider "Volume"\): unknown component type "Slider"/);
    await ui.waitVisible(issue.first());
    await ui.waitVisible(ui.text("Ask agent to fix").first());
  });
  await ui.check(results, S, `run${run}: exactly one ${MARKER} message shown`, shotName("s1", "fix-message", run), async () => {
    await ui.waitVisible(ui.fixMessages().first());
    const n = await ui.fixMessages().count();
    if (n !== 1) throw new Error(`fix messages=${n}`);
  });
  await ui.check(results, S, `run${run}: corrected form rendered`, shotName("s1", "fixed-form", run), async () => {
    const detail = await goodFormRendered(ui);
    const boxes = await ui.errorBoxes().count();
    if (boxes !== 1) throw new Error(`error boxes=${boxes}, expected only the first reply's`);
    await ui.screenshot(shotName("s1", "flow", run), ui.text("Volume").last());
    return detail;
  });
}

/** S2: after the retry limit, the last reply's error box is still shown and no third fix message. */
export async function uiS2(ctx, run, r) {
  const { ui, results } = ctx;
  await ui.openAgent(r.agent.id, r.first);
  await ui.check(results, "S2", `run${run}: last error box shown, 2 fix messages, no more`, shotName("s2", "last-error", run), async () => {
    await ui.until(async () => (await ui.errorBoxes().count()) === 3, { what: "3 error boxes (one per reply)" });
    await ui.until(async () => (await ui.fixMessages().count()) === 2, { what: "2 fix messages" });
    const last = ui.errorBoxes().last();
    await last.scrollIntoViewIfNeeded();
    await ui.waitVisible(last);
    await ui.waitVisible(ui.text("Ask agent to fix").last());
    // The last reply (BADJSON) is invalid JSON; its box explains the trailing comma.
    await ui.waitVisible(ui.page.getByText(/is not valid JSON\. Hint: trailing comma/).last());
    await ui.screenshot(shotName("s2", "last-error", run), last);
    // The run is quiet already (waitQuiet); the UI must not show a further fix request.
    const fixes = await ui.fixMessages().count();
    if (fixes !== 2) throw new Error(`fix messages=${fixes}`);
  });
}

/** S7: a valid form renders fully, without an error box (baseline screenshot). */
export async function uiS7(ctx, run, r, plain) {
  const { ui, results } = ctx;
  await ui.openAgent(r.agent.id, r.first);
  await ui.check(results, "S7", `run${run}: valid form rendered without error box`, shotName("s7", "valid-form", run), async () => {
    const detail = await goodFormRendered(ui);
    const boxes = await ui.errorBoxes().count();
    if (boxes) throw new Error(`error boxes=${boxes}`);
    await ui.screenshot(shotName("s7", "valid-form", run), ui.text("Volume").last());
    return detail;
  });
  // The text around the form is rendered by the plugin instead of the host's markdown renderer, so it
  // has to use the host's body font size; otherwise such replies look shrunk next to plain ones.
  await ui.check(results, "S7", `run${run}: text around the form uses the host font size`, shotName("s7", "font-size", run), async () => {
    const pluginSizes = await fontSizesOf(ui, "Fixed:");
    if (!pluginSizes.length) throw new Error('the reply text "Fixed:" was not rendered');
    await ui.openAgent(plain.agent.id, plain.first);
    const hostSizes = await fontSizesOf(ui, "Just plain text", { exact: false });
    if (!hostSizes.length) throw new Error('the plain reply text was not rendered');
    const pluginSize = Math.max(...pluginSizes);
    const hostSize = Math.max(...hostSizes);
    if (pluginSize !== hostSize) {
      throw new Error(`the plugin renders the reply text at ${pluginSize}px but the host uses ${hostSize}px`);
    }
    return `${pluginSize}px`;
  });
}

/** Waits until the settings RPC reports `value` (the screen saved it through the daemon). */
async function settingPersisted(ctx, value) {
  const { h, ui } = ctx;
  return ui.until(
    async () => {
      const s = await readSettings(h.conn.client);
      return s?.values?.autoFixMaxRetries === value ? JSON.stringify(s.values) : false;
    },
    { what: `autoFixMaxRetries=${value} via the settings RPC` },
  );
}

const hint = (n) => (n === 0 ? "Automatic fixes are off." : `Up to ${n} automatic ${n === 1 ? "request" : "requests"} per reply.`);

/** Settings screen: shows the current value, + and − save through the daemon. */
export async function uiSettings(ctx, run) {
  const { h, ui, results } = ctx;
  const S = "UI-SETTINGS";
  await uiPluginLoaded(ctx, S);
  try {
    await resetSettings(h.conn.client);
    await ui.openSettings();
    await ui.check(results, S, `run${run}: screen shows the current value (2)`, shotName("settings", "initial", run), async () => {
      await ui.waitVisible(ui.text("Automatic form fixes"));
      await ui.waitVisible(ui.text(hint(2)));
      await ui.screenshot(shotName("settings", "initial", run));
    });
    await ui.check(results, S, `run${run}: + saves 3`, shotName("settings", "increased", run), async () => {
      await ui.page.getByLabel("Increase retries").click();
      await ui.waitVisible(ui.text(hint(3)));
      const saved = await settingPersisted(ctx, 3);
      await ui.screenshot(shotName("settings", "increased", run));
      return saved;
    });
    await ui.check(results, S, `run${run}: − three times saves 0 (automatic fixes off)`, shotName("settings", "off", run), async () => {
      for (const next of [2, 1, 0]) {
        await ui.page.getByLabel("Decrease retries").click();
        // Exact text: the hint carries " Saving…" while the write is in flight.
        await ui.waitVisible(ui.text(hint(next)));
        await settingPersisted(ctx, next);
      }
      await ui.screenshot(shotName("settings", "off", run));
    });
    await ui.check(results, S, `run${run}: screen reflects a value written elsewhere after reload`, shotName("settings", "reload", run), async () => {
      await writeSettings(h.conn.client, { autoFixMaxRetries: 4 });
      await ui.openSettings();
      await ui.waitVisible(ui.text(hint(4)));
    });
  } finally {
    await resetSettings(h.conn.client).catch(() => undefined);
  }
}

/**
 * Manual fix: with automatic fixes off (0), a bad form shows the error box; "Ask agent to fix" sends
 * exactly one fix request and shows its sent state; the corrected reply renders.
 */
export async function uiManualFix(ctx, run, first) {
  const { h, ui, results } = ctx;
  const S = "UI-MANUAL";
  await uiPluginLoaded(ctx, S);
  try {
    const w = await writeSettings(h.conn.client, { autoFixMaxRetries: 0 });
    results.check(S, `run${run}: automatic fixes off (setting 0)`, w.status === "saved", JSON.stringify(w));
    const agent = await h.createAgent(first);
    await h.waitQuiet(agent.id, first, { quietMs: 5000 });
    results.check(S, `run${run}: no automatic fix with setting 0`, fixTexts(h.promptsFor(first)).length === 0, `prompts=${h.promptsFor(first).length}`);

    await ui.openAgent(agent.id, first);
    const button = ui.page.getByText("Ask agent to fix", { exact: true });
    await ui.check(results, S, `run${run}: error box with "Ask agent to fix"`, shotName("manual", "error-box", run), async () => {
      const box = await ui.waitVisible(ui.errorBoxes().first());
      await ui.waitVisible(button.first());
      const n = await button.count();
      if (n !== 1) throw new Error(`buttons=${n}`);
      await ui.screenshot(shotName("manual", "error-box", run), box);
    });
    await ui.check(results, S, `run${run}: button shows the sent state`, shotName("manual", "sent", run), async () => {
      await button.first().click();
      // The script delays the agent's reply, so the sent state is visible before the timeline grows.
      const sent = await ui.waitVisible(ui.page.getByText(/Fix requested; the agent will reply with a corrected form/).first());
      await ui.screenshot(shotName("manual", "sent", run), sent);
    });
    await h.waitQuiet(agent.id, first, { quietMs: 5000 });
    const fixes = fixTexts(h.promptsFor(first));
    results.check(
      S,
      `run${run}: provider received exactly one ${MARKER} message`,
      fixes.length === 1 && fixes[0].includes('unknown component type "Slider"'),
      `fixes=${fixes.length} ${String(fixes[0] ?? "").slice(0, 120)}`,
    );
    await ui.check(results, S, `run${run}: corrected form rendered after the manual fix`, shotName("manual", "fixed-form", run), async () => {
      const detail = await goodFormRendered(ui);
      await ui.screenshot(shotName("manual", "fixed-form", run), ui.text("Volume").last());
      return detail;
    });
    (ctx.evidence["UI-MANUAL"] ??= []).push({ agentId: agent.id, first, prompts: h.promptsFor(first).map((p) => ({ kind: p.kind, text: p.text })) });
  } finally {
    await resetSettings(h.conn.client).catch(() => undefined);
  }
}

// Browser-based UI checks: the daemon's bundled web UI (`features.webUi.enabled`) in headless
// Chromium (Playwright). The web UI is the same Expo app as the desktop/mobile clients and evaluates
// the plugin's client bundle (index.client.tsx), so this exercises the real renderer, error box and
// settings screen.
//
// Auth: the harness daemon has no password, so every connection (including the browser's same-origin
// websocket) is admitted as owner; nothing is stored outside the browser's throwaway profile.
// Navigation: the first load of `/` registers the daemon as a host in the app's localStorage; after
// that the deep links `/h/<serverId>/agent/<agentId>` and
// `/settings/hosts/<serverId>/plugins/<pluginId>/<screenId>` work.
import fs from "node:fs";
import path from "node:path";
import { PLUGIN_ID } from "./client.mjs";

export const SETTINGS_SCREEN_ID = "irix-ui-render-settings";
export const ERROR_TITLE = "[irix-form Syntax Error]";
/** A plugin client bundle that throws while evaluating is dropped by the app with this warning. */
const PLUGIN_EVAL_FAILURE = /\[Plugins\] Failed to evaluate/;

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export class Browser {
  /**
   * @param {object} opts
   * @param {import("./daemon.mjs").Daemon} opts.daemon
   * @param {import("./client.mjs").Harness} opts.h
   * @param {string} opts.outDir    screenshots go to `<outDir>/<platform>/`
   */
  constructor({ daemon, h, outDir }) {
    this.daemon = daemon;
    this.h = h;
    this.dir = path.join(outDir, process.platform);
    this.base = `http://${daemon.host}`;
    this.browser = null;
    this.page = null;
    this.serverId = null;
    this.console = [];
    this.pluginEvalErrors = [];
    this.screenshots = [];
  }

  /** Timeout for UI waits, scaled by --time-scale. */
  ms(value = 30000) {
    return this.h.ms(value);
  }

  async start() {
    // Imported lazily so `--no-ui` runs need no browser.
    const { chromium } = await import("playwright");
    fs.mkdirSync(this.dir, { recursive: true });
    const executablePath = process.env.E2E_CHROMIUM_EXECUTABLE || undefined;
    this.browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const context = await this.browser.newContext({ viewport: { width: 1280, height: 1100 }, locale: "en-US" });
    this.page = await context.newPage();
    this.page.on("console", (m) => {
      const text = m.text();
      if (m.type() === "error" || m.type() === "warning") this.console.push(`${m.type()}: ${text.slice(0, 500)}`);
      if (PLUGIN_EVAL_FAILURE.test(text)) this.pluginEvalErrors.push(text.slice(0, 500));
    });
    this.page.on("pageerror", (e) => this.console.push(`pageerror: ${String(e).slice(0, 500)}`));
    await this.bootstrap();
  }

  /** Loads the app once so it registers the daemon as a host (deep links redirect until then). */
  async bootstrap() {
    const conn = this.h.conn;
    this.serverId =
      conn?.client.getLastServerInfoMessage?.()?.serverId ??
      fs.readFileSync(path.join(this.daemon.ws.paseoHome, "server-id"), "utf8").trim();
    await this.page.goto(`${this.base}/`);
    const serverId = this.serverId;
    await this.page.waitForFunction(
      (id) => {
        try {
          return (localStorage.getItem("@paseo:daemon-registry") ?? "").includes(id);
        } catch {
          return false;
        }
      },
      serverId,
      { timeout: this.ms(60000) },
    );
  }

  async stop() {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
    this.page = null;
  }

  /** Opens an agent's conversation and waits until `waitText` (default: its first prompt) is visible. */
  async openAgent(agentId, waitText) {
    await this.page.goto(`${this.base}/h/${encodeURIComponent(this.serverId)}/agent/${encodeURIComponent(agentId)}`);
    if (waitText) await this.page.getByText(waitText).first().waitFor({ timeout: this.ms() });
  }

  async openSettings() {
    await this.page.goto(
      `${this.base}/settings/hosts/${encodeURIComponent(this.serverId)}/plugins/${PLUGIN_ID}/${SETTINGS_SCREEN_ID}`,
    );
    await this.page.getByText("Maximum retries", { exact: true }).waitFor({ timeout: this.ms() });
  }

  // --- locators ---------------------------------------------------------------------------------

  errorBoxes() {
    return this.page.getByText(ERROR_TITLE, { exact: true });
  }

  /** User messages starting with the fix marker (the error box lines never start with it). */
  fixMessages() {
    return this.page.getByText(/^\[irix-form-fix\]/);
  }

  text(t, exact = true) {
    return this.page.getByText(t, { exact });
  }

  async waitVisible(locator, timeoutMs) {
    await locator.waitFor({ state: "visible", timeout: timeoutMs ?? this.ms() });
    return locator;
  }

  /** Polls `fn` until it returns truthy (for counts that change while the UI catches up). */
  async until(fn, { timeoutMs, what = "condition" } = {}) {
    const deadline = Date.now() + (timeoutMs ?? this.ms());
    let last;
    while (Date.now() < deadline) {
      last = await fn();
      if (last) return last;
      await this.page.waitForTimeout(200);
    }
    throw new Error(`timeout waiting for ${what} (last: ${JSON.stringify(last)})`);
  }

  // --- screenshots and checks -------------------------------------------------------------------

  async screenshot(name, focus) {
    if (!this.page) return null;
    try {
      if (focus) {
        await focus
          .evaluate((el) => el.scrollIntoView({ block: "center" }), undefined, { timeout: 5000 })
          .catch(() => undefined);
      }
      // Cosmetic: let the "Updating messages" toast of a freshly opened conversation go away.
      await this.page
        .getByText("Updating messages", { exact: true })
        .waitFor({ state: "hidden", timeout: 5000 })
        .catch(() => undefined);
      const file = path.join(this.dir, `${slug(name)}.png`);
      await this.page.screenshot({ path: file, timeout: 15000 });
      this.screenshots.push(path.relative(path.dirname(this.dir), file));
      return file;
    } catch (error) {
      console.warn(`[e2e] screenshot ${name} failed: ${error?.message ?? error}`);
      return null;
    }
  }

  /**
   * Runs one UI assertion. `fn` throws (or returns false) on failure; a failure is recorded with a
   * `<shot>-FAILED` screenshot and does not abort the remaining checks of the scenario.
   */
  async check(results, scenario, name, shot, fn) {
    let ok = false;
    let detail = "";
    try {
      const value = await fn();
      ok = value !== false;
      if (typeof value === "string") detail = value;
    } catch (error) {
      detail = String(error?.message ?? error).split("\n").slice(0, 6).join(" | ");
    }
    if (!ok) {
      const file = await this.screenshot(`${shot}-FAILED`);
      if (file) detail += ` (screenshot ${path.basename(file)})`;
    }
    results.check(scenario, `UI: ${name}`, ok, detail);
    return ok;
  }

  evidence() {
    return {
      serverId: this.serverId,
      screenshots: this.screenshots,
      pluginEvalErrors: this.pluginEvalErrors,
      console: this.console.slice(-100),
    };
  }
}

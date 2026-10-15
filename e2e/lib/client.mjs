// Daemon client + log helpers shared by the e2e scenarios.
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { createPaseoApi } from "@getpaseo/client";
import { readLocalCredentialForTarget } from "@getpaseo/server/daemon-control";
import { WebSocket } from "ws";
import { sleep } from "./daemon.mjs";

export const MARKER = "[irix-form-fix]";
export const PLUGIN_ID = "irix-ui-render";

export async function connect(daemon) {
  const client = new DaemonClient({
    url: `ws://${daemon.host}/ws`,
    clientId: `e2e-${randomUUID()}`,
    clientType: "cli",
    appVersion: "0.11.4",
    localCredential: () => readLocalCredentialForTarget(daemon.ws.paseoHome, daemon.host) ?? undefined,
    connectTimeoutMs: 30000,
    webSocketFactory: (url, config) => new WebSocket(url, config?.protocols, { headers: config?.headers }),
    reconnect: { enabled: false },
  });
  await client.connect();
  return { client, api: createPaseoApi(client) };
}

export function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return []; // a line being appended right now
      }
    });
}

export function readSettings(client) {
  return client.invokePluginRpc(PLUGIN_ID, `settings.${PLUGIN_ID}.read`, {});
}

export async function writeSettings(client, values) {
  const current = await readSettings(client);
  return client.invokePluginRpc(PLUGIN_ID, `settings.${PLUGIN_ID}.write`, { revision: current.revision, values });
}

export async function resetSettings(client) {
  const current = await readSettings(client);
  return client.invokePluginRpc(PLUGIN_ID, `settings.${PLUGIN_ID}.reset`, { revision: current.revision });
}

export function fixTexts(prompts) {
  return prompts.filter((p) => p.kind === "prompt" && p.text.trimStart().startsWith(MARKER)).map((p) => p.text);
}

export function short(s, n = 70) {
  return String(s ?? "").replace(/\r?\n/g, "\\n").slice(0, n);
}

/** Helpers bound to one workspace/connection. `conn` is replaced after a daemon restart. */
export class Harness {
  constructor(ws, daemon, { timeScale = 1 } = {}) {
    this.ws = ws;
    this.daemon = daemon;
    this.timeScale = timeScale;
    this.conn = null;
  }

  ms(value) {
    return Math.round(value * this.timeScale);
  }

  async connect() {
    this.conn = await connect(this.daemon);
    return this.conn;
  }

  async disconnect() {
    await this.conn?.client.close().catch(() => undefined);
    this.conn = null;
  }

  async restartDaemon(label) {
    await this.disconnect();
    await this.daemon.restart(label);
    await this.waitPluginReady();
  }

  /** Waits until the plugin under test answers its settings RPC (it is loaded and running). */
  async waitPluginReady(timeoutMs = 60000) {
    const deadline = Date.now() + this.ms(timeoutMs);
    let last;
    while (Date.now() < deadline) {
      try {
        if (!this.conn) await this.connect();
        const s = await readSettings(this.conn.client);
        if (s?.status === "ready") return s;
        last = JSON.stringify(s);
      } catch (error) {
        last = String(error?.message ?? error);
        await this.disconnect();
      }
      await sleep(500);
    }
    throw new Error(`plugin ${PLUGIN_ID} not ready: ${last}`);
  }

  /** Prompts (and interrupts) the fake provider received for the session whose first prompt was `firstText`. */
  promptsFor(firstText) {
    const all = readJsonl(this.ws.recvLog).filter((e) => e.kind === "prompt" || e.kind === "interrupt");
    const first = all.find((e) => e.kind === "prompt" && e.text === firstText);
    if (!first) return [];
    return all.filter((e) => e.sessionId === first.sessionId);
  }

  probesFor(agentId) {
    return readJsonl(this.ws.probeLog).filter((e) => e.agentId === agentId);
  }

  async createAgent(firstText, { noClientMessageId = false } = {}) {
    return this.conn.api.agents.create({
      config: { provider: "fake/fake-model" },
      cwd: this.ws.work,
      title: firstText.slice(0, 40),
      prompt: firstText,
      ...(noClientMessageId ? {} : { clientMessageId: randomUUID() }),
    });
  }

  /** Waits until nothing new reached the provider/probe logs for `quietMs` and the agent is not running. */
  async waitQuiet(agentId, firstText, { quietMs = 4000, timeoutMs = 90000 } = {}) {
    quietMs = this.ms(quietMs);
    const start = Date.now();
    let lastCount = -1;
    let lastChange = Date.now();
    while (Date.now() - start < this.ms(timeoutMs)) {
      const count = this.promptsFor(firstText).length + this.probesFor(agentId).length;
      if (count !== lastCount) {
        lastCount = count;
        lastChange = Date.now();
      }
      if (Date.now() - lastChange >= quietMs) {
        const ref = this.conn.api.agents.ref(agentId);
        await ref.refresh().catch(() => null);
        if (ref.status !== "running") return;
      }
      await sleep(250);
    }
    throw new Error(`timeout waiting for agent ${agentId} to go quiet`);
  }

  async timeline(agentId) {
    const page = await this.conn.api.agents
      .ref(agentId)
      .timeline.refetch({ direction: "tail", limit: 300, projection: "projected" });
    return (page.entries ?? []).map((e) => ({ type: e.item?.type, text: e.item?.text }));
  }
}

/**
 * Check results. `known: true` marks a check that documents a known limitation: it is reported,
 * but a failure does not fail the run.
 */
export class Results {
  constructor() {
    this.rows = [];
  }

  check(scenario, name, ok, detail = "", { known = false } = {}) {
    const status = ok ? "pass" : known ? "known-limitation" : "fail";
    this.rows.push({ scenario, name, status, known, detail: String(detail ?? "") });
    const label = ok ? (known ? "PASS (info)" : "PASS") : known ? "KNOWN-LIMITATION" : "FAIL";
    console.log(`${label} [${scenario}] ${name}${detail ? ` -- ${short(detail, 300)}` : ""}`);
    return ok;
  }

  summary() {
    const count = (pred) => this.rows.filter(pred).length;
    return {
      total: this.rows.length,
      passed: count((r) => r.status === "pass"),
      failed: count((r) => r.status === "fail"),
      knownLimitationHits: count((r) => r.status === "known-limitation"),
      informationalChecks: count((r) => r.known),
    };
  }
}

// Test-only Paseo plugin used by the paseo-form-render e2e harness (see e2e/README.md).
//
// - Registers a scripted fake provider ("fake", model "fake-model"). The first prompt of a
//   session must start with `SCENARIO:<name>`; the provider then answers each prompt with the
//   next reply of that scenario from `<state>/scenarios.json` (the last reply repeats).
// - Records every prompt/interrupt it receives to `<state>/received.jsonl`.
// - Records agent turn starts/ends to `<state>/probe.jsonl`.
//
// The state directory comes from the PFR_E2E_STATE environment variable of the daemon and is
// required: the harness creates it in an isolated temp workspace.
//
// No type imports on purpose: the plugin directory has no node_modules.
import { appendFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

function stateDir(): string {
  const dir = process.env.PFR_E2E_STATE;
  if (!dir) {
    throw new Error("[pfr-e2e-fake] PFR_E2E_STATE is not set; run this plugin through e2e/run.mjs");
  }
  return dir;
}

function log(file: string, obj: Record<string, unknown>) {
  try {
    appendFileSync(file, JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n");
  } catch (error) {
    console.error("[pfr-e2e-fake] log failed", error);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Reply {
  text?: string;
  /** Growing snapshots of one assistant message (same item id). */
  chunks?: string[];
  /** Separate assistant messages (distinct ids / messageIds). */
  messages?: string[];
  /** Insert a tool_call item between the separate messages. */
  toolBetween?: boolean;
  chunkDelayMs?: number;
  /** Delay before the reply starts. */
  startDelayMs?: number;
  /** Delay after the reply text, before the turn ends. */
  delayMs?: number;
  outcome?: "completed" | "failed" | "canceled" | "hang";
}

interface SessionState {
  logicalId: string;
  transcript: Array<{ id: string; type: string; text: string }>;
  scenario: string | null;
  step: number;
  activeTurn: string | null;
  interrupted: (() => void) | null;
}

function expand(text: string | undefined, macros: Record<string, string>): string | undefined {
  if (text === undefined) return undefined;
  return text.startsWith("@") && macros[text.slice(1)] !== undefined ? macros[text.slice(1)] : text;
}

function promptText(prompt: any): string {
  if (prompt?.input?.type === "message") {
    return (prompt.input.content as any[])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
  }
  if (prompt?.input?.type === "command") return `/${prompt.input.name} ${prompt.input.arguments}`;
  return "";
}

function summarize(items: readonly any[]) {
  return items.map((it) => ({
    type: it?.type,
    text: typeof it?.text === "string" ? it.text.slice(0, 80) : undefined,
  }));
}

export default function contribute(server: any) {
  const root = stateDir();
  const RECV_LOG = path.join(root, "received.jsonl");
  const PROBE_LOG = path.join(root, "probe.jsonl");
  const SCEN_FILE = path.join(root, "scenarios.json");
  const sessions = new Map<string, SessionState>();
  const hookFollowupSent = new Set<string>();

  function pickReply(state: SessionState, text: string): { reply: Reply; step: number } {
    const scenarios = JSON.parse(readFileSync(SCEN_FILE, "utf8"));
    const macros: Record<string, string> = scenarios.__macros ?? {};
    const m = /^SCENARIO:([\w-]+)/.exec(text.trim());
    if (m) {
      state.scenario = m[1];
      state.step = 0;
    }
    const list: Reply[] = scenarios[state.scenario ?? ""] ?? [{ text: "plain default reply" }];
    const step = state.step;
    const raw = list[Math.min(step, list.length - 1)];
    state.step++;
    return {
      step,
      reply: {
        ...raw,
        text: expand(raw.text, macros),
        chunks: raw.chunks?.map((c) => expand(c, macros) ?? ""),
        messages: raw.messages?.map((c) => expand(c, macros) ?? ""),
      },
    };
  }

  server.registerProvider({
    id: "fake",
    label: "Fake (e2e)",
    description: "Scripted fake provider for pfr auto-fix e2e tests",
    async connect(_request: any) {
      const listeners = new Set<(event: any) => void>();
      const emit = (event: any) => {
        for (const l of listeners) l(event);
      };

      async function runTurn(sessionId: string, state: SessionState, turnId: string, reply: Reply) {
        if (reply.startDelayMs) await sleep(reply.startDelayMs);
        const item = (it: Record<string, unknown>) =>
          state.activeTurn === turnId &&
          emit({ type: "timeline.item", sessionId, item: it, timestamp: new Date().toISOString() });
        if (reply.messages) {
          for (let i = 0; i < reply.messages.length; i++) {
            const id = randomUUID();
            item({ id, type: "assistant_message", text: reply.messages[i], messageId: id });
            if (reply.toolBetween && i < reply.messages.length - 1) {
              const callId = randomUUID();
              item({
                id: callId,
                type: "tool_call",
                callId,
                name: "fake_tool",
                status: "completed",
                error: null,
                detail: { type: "plain_text", label: "fake tool", text: "ok" },
              });
            }
            await sleep(reply.chunkDelayMs ?? 10);
          }
        } else if (reply.chunks) {
          const id = randomUUID();
          let acc = "";
          for (const chunk of reply.chunks) {
            acc += chunk;
            item({ id, type: "assistant_message", text: acc, messageId: id });
            await sleep(reply.chunkDelayMs ?? 10);
          }
        } else if (reply.text !== undefined) {
          const id = randomUUID();
          item({ id, type: "assistant_message", text: reply.text, messageId: id });
        }
        if (reply.delayMs) await sleep(reply.delayMs);

        const finalText = reply.messages ? reply.messages.join("") : reply.chunks ? reply.chunks.join("") : reply.text;
        if (finalText !== undefined && state.activeTurn === turnId) {
          state.transcript.push({ id: randomUUID(), type: "assistant_message", text: finalText });
        }
        emit({
          type: "session.persistence",
          sessionId,
          persistence: {
            version: 1,
            data: { logicalId: state.logicalId, scenario: state.scenario, step: state.step, transcript: state.transcript },
          },
        });
        const outcome = reply.outcome ?? "completed";
        if (outcome === "hang") {
          await new Promise<void>((resolve) => {
            state.interrupted = resolve;
          });
          state.interrupted = null;
          if (state.activeTurn !== turnId) return;
          state.activeTurn = null;
          emit({ type: "session.turn", sessionId, turnId, state: "canceled", error: { message: "interrupted" } });
          return;
        }
        if (state.activeTurn !== turnId) return; // already canceled by an interrupt
        state.activeTurn = null;
        if (outcome === "failed") {
          emit({ type: "session.turn", sessionId, turnId, state: "failed", error: { message: "scripted failure", code: "E_SCRIPTED" } });
        } else if (outcome === "canceled") {
          emit({ type: "session.turn", sessionId, turnId, state: "canceled", error: { message: "scripted cancel" } });
        } else {
          emit({ type: "session.turn", sessionId, turnId, state: "completed" });
        }
      }

      async function handle(input: any) {
        switch (input.type) {
          case "catalog":
            emit({
              type: "catalog",
              requestId: input.requestId,
              catalog: {
                models: [{ id: "fake-model", label: "Fake model", isDefault: true }],
                modes: [],
                defaultModel: "fake-model",
              },
            });
            return;
          case "sessions":
            emit({ type: "sessions", requestId: input.requestId, sessions: [] });
            return;
          case "session.open": {
            const restored = input.persistence?.data ?? null;
            const logicalId = restored?.logicalId ?? input.sessionId;
            sessions.set(input.sessionId, {
              logicalId,
              transcript: restored?.transcript ?? [],
              scenario: restored?.scenario ?? null,
              step: restored?.step ?? 0,
              activeTurn: null,
              interrupted: null,
            });
            log(RECV_LOG, {
              kind: "open",
              sessionId: logicalId,
              providerSessionId: input.sessionId,
              restored: !!restored,
              history: input.history,
              systemPromptHasPfr: String(input.config?.systemPrompt ?? "").includes("[paseo-form-render]"),
            });
            emit({
              type: "session.opened",
              requestId: input.requestId,
              sessionId: input.sessionId,
              capabilities: ["prompt.message", "session.persistence"],
              restoration: "core",
              cwd: input.config.cwd,
              persistence: {
                version: 1,
                data: { logicalId, scenario: restored?.scenario ?? null, step: restored?.step ?? 0, transcript: restored?.transcript ?? [] },
              },
            });
            if (input.history === "replay") {
              for (const t of restored?.transcript ?? []) {
                emit({ type: "timeline.item", sessionId: input.sessionId, item: { id: t.id, type: t.type, text: t.text, messageId: t.id } });
              }
            }
            emit({ type: "session.ready", requestId: input.requestId, sessionId: input.sessionId });
            return;
          }
          case "session.prompt": {
            const state = sessions.get(input.sessionId);
            const text = promptText(input.prompt);
            if (!state) {
              emit({
                type: "session.prompt_result",
                sessionId: input.sessionId,
                clientMessageId: input.prompt.clientMessageId,
                result: { type: "failed", error: { message: "unknown session" } },
              });
              return;
            }
            const { reply, step } = pickReply(state, text);
            state.transcript.push({ id: input.prompt.clientMessageId, type: "user_message", text });
            log(RECV_LOG, {
              kind: "prompt",
              sessionId: state.logicalId,
              providerSessionId: input.sessionId,
              scenario: state.scenario,
              step,
              delivery: input.prompt.delivery,
              clientMessageId: input.prompt.clientMessageId,
              activeTurnAtArrival: state.activeTurn,
              text,
            });
            const turnId = randomUUID();
            // A new prompt while a turn is running supersedes it.
            if (state.activeTurn) {
              const old = state.activeTurn;
              state.activeTurn = null;
              state.interrupted?.();
              emit({ type: "session.turn", sessionId: input.sessionId, turnId: old, state: "canceled", error: { message: "superseded by new prompt" } });
            }
            state.activeTurn = turnId;
            emit({ type: "session.prompt_result", sessionId: input.sessionId, clientMessageId: input.prompt.clientMessageId, result: { type: "turn", turnId } });
            emit({ type: "session.turn", sessionId: input.sessionId, turnId, state: "started" });
            void runTurn(input.sessionId, state, turnId, reply).catch((error) => console.error("[pfr-e2e-fake] turn failed", error));
            return;
          }
          case "session.interrupt": {
            const state = sessions.get(input.sessionId);
            log(RECV_LOG, { kind: "interrupt", sessionId: state?.logicalId ?? input.sessionId, activeTurn: state?.activeTurn ?? null });
            if (state?.activeTurn) {
              const turnId = state.activeTurn;
              if (state.interrupted) {
                state.interrupted();
              } else {
                state.activeTurn = null;
                emit({ type: "session.turn", sessionId: input.sessionId, turnId, state: "canceled", error: { message: "interrupted" } });
              }
            }
            emit({ type: "request.completed", requestId: input.requestId });
            return;
          }
          case "session.close":
            sessions.delete(input.sessionId);
            emit({ type: "request.completed", requestId: input.requestId });
            emit({ type: "session.closed", sessionId: input.sessionId });
            return;
          default:
            if (input.requestId) emit({ type: "request.completed", requestId: input.requestId });
        }
      }

      return {
        version: 1,
        capabilities: ["prompt.message", "session.persistence"],
        async send(input: any) {
          setTimeout(() => {
            void handle(input).catch((error) => console.error("[pfr-e2e-fake] handle failed", error));
          }, 0);
        },
        onEvent(listener: (event: any) => void) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        async close() {
          listeners.clear();
        },
      };
    },
  });

  server.on("agent.turn_started", async (event: any) => {
    log(PROBE_LOG, { kind: "turn_started", agentId: event.agent.id, turnId: event.turnId });
  });

  server.on("agent.turn_ended", async (event: any, { paseo }: any) => {
    log(PROBE_LOG, {
      kind: "turn_ended",
      agentId: event.agent.id,
      provider: event.agent.provider,
      turnId: event.turnId,
      outcome: event.outcome,
      eventTimelineLength: event.timeline.length,
      eventTimeline: summarize(event.timeline),
    });

    // S5 "hook race": on the first turn end of an agent whose first user message asks for it,
    // immediately send a real (marker-free) user message from inside this hook, like another
    // plugin or an orchestrator would.
    const firstUser = event.timeline.find((it: any) => it.type === "user_message");
    if (
      firstUser &&
      typeof firstUser.text === "string" &&
      firstUser.text.startsWith("SCENARIO:s5hook") &&
      !hookFollowupSent.has(event.agent.id)
    ) {
      hookFollowupSent.add(event.agent.id);
      try {
        await paseo.agents.ref(event.agent.id).send("REAL follow-up sent from probe hook");
        log(PROBE_LOG, { kind: "probe_sent_followup", agentId: event.agent.id });
      } catch (error) {
        log(PROBE_LOG, { kind: "probe_send_failed", agentId: event.agent.id, error: String(error) });
      }
    }
  });

  return () => undefined;
}

import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  buildFixMessage,
  collectTurnFormFailures,
  countTrailingFixAttempts,
  type FormFailure,
  type TimelineEntry,
} from "../shared/form-fix";
import { readIrixSettings, type IrixSettingsHandle } from "./settings";

/** How many of the newest timeline entries to fetch when checking the conversation history. */
const HISTORY_LIMIT = 300;

export type AutoFixSkipReason =
  | "not-completed"
  | "no-failures"
  | "disabled"
  | "history-unavailable"
  | "history-truncated"
  | "superseded"
  | "limit-reached"
  | "busy"
  | "status-unavailable";

export type AutoFixPlan = { ok: false; reason: AutoFixSkipReason } | { ok: true; failures: FormFailure[] };

export type AutoFixDecision =
  | { send: false; reason: AutoFixSkipReason }
  | { send: true; message: string; attempt: number };

export interface TurnInput {
  /** The `timeline` of the `agent.turn_ended` event. It may cover only the finished turn. */
  turnTimeline: readonly TimelineEntry[];
  outcome: { readonly kind: string };
  /** Maximum consecutive fix requests; 0 disables auto-fix. */
  maxRetries: number;
}

export interface AutoFixInput extends TurnInput {
  /** The newest part of the conversation, fetched just before sending. Missing or null means it could not be read. */
  latestTimeline?: readonly TimelineEntry[] | null;
  /** True when older entries exist beyond `latestTimeline`. */
  latestTruncated?: boolean;
}

/** Cheap first gate that needs only the event: is there anything to fix, and is fixing on? */
export function planAutoFix({ turnTimeline, outcome, maxRetries }: TurnInput): AutoFixPlan {
  if (outcome.kind !== "completed") return { ok: false, reason: "not-completed" };
  const failures = collectTurnFormFailures(turnTimeline);
  if (failures.length === 0) return { ok: false, reason: "no-failures" };
  if (maxRetries <= 0) return { ok: false, reason: "disabled" };
  return { ok: true, failures };
}

function isRealUserMessage(entry: TimelineEntry): boolean {
  return entry.type === "user_message" && countTrailingFixAttempts([entry]) === 0;
}

/**
 * Decides whether to ask the agent to repair its irix-form blocks. Failures come from the finished
 * turn; the retry count and "did anything newer happen" checks use the freshly fetched history,
 * and the answer is never to send when that history is unavailable.
 */
export function decideAutoFix(input: AutoFixInput): AutoFixDecision {
  const plan = planAutoFix(input);
  if (!plan.ok) return { send: false, reason: plan.reason };

  const latest = input.latestTimeline;
  if (!latest) return { send: false, reason: "history-unavailable" };

  // A user message after the last assistant output means the conversation moved on since this turn
  // ended (the user typed something, or a fix request is already on its way).
  const lastAssistant = lastIndexOf(latest, (e) => e.type === "assistant_message");
  const lastUser = lastIndexOf(latest, (e) => e.type === "user_message");
  if (lastAssistant < 0 || lastUser > lastAssistant) return { send: false, reason: "superseded" };

  // If the finished turn shows the message that started it, the newest user message in the history
  // must be that same message; anything else is a newer request that has already been answered.
  // A fetched window with no user message at all holds only this turn's tail, so nothing newer
  // arrived (a newer message would sit at the end of the window).
  const turnLastUser = lastIndexOf(input.turnTimeline, (e) => e.type === "user_message");
  if (lastUser >= 0 && turnLastUser >= 0 && latest[lastUser].text !== input.turnTimeline[turnLastUser].text) {
    return { send: false, reason: "superseded" };
  }

  // Count from the fetched history; when a long turn pushed every real user message out of that
  // window, fall back to the event timeline, which may hold the full history.
  let countFrom: readonly TimelineEntry[] = latest;
  if (input.latestTruncated && lastIndexOf(latest, isRealUserMessage) < 0) {
    if (lastIndexOf(input.turnTimeline, isRealUserMessage) < 0) return { send: false, reason: "history-truncated" };
    countFrom = input.turnTimeline;
  }

  const attempts = countTrailingFixAttempts(countFrom);
  if (attempts >= input.maxRetries) return { send: false, reason: "limit-reached" };

  return { send: true, message: buildFixMessage(plan.failures), attempt: attempts + 1 };
}

function lastIndexOf(entries: readonly TimelineEntry[], predicate: (entry: TimelineEntry) => boolean): number {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (predicate(entries[i])) return i;
  }
  return -1;
}

/**
 * Reads timeline items out of a `timeline.refetch()` payload (`entries[].item`, `hasOlder`, `error`).
 * Returns null when the payload reports an error or is not shaped as expected.
 */
export function timelineFromPayload(payload: unknown): { items: TimelineEntry[]; truncated: boolean } | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { entries, error, hasOlder } = payload as { entries?: unknown; error?: unknown; hasOlder?: unknown };
  if (error || !Array.isArray(entries)) return null;

  const items: TimelineEntry[] = [];
  for (const entry of entries) {
    const item = (entry as { item?: unknown } | null)?.item as { type?: unknown; text?: unknown } | undefined;
    if (!item || typeof item.type !== "string") return null;
    items.push({ type: item.type, text: typeof item.text === "string" ? item.text : undefined });
  }
  return { items, truncated: hasOlder === true };
}

/** Skip reason when the agent is already busy, or its status cannot be read; null when it is idle. */
export function idleGate(status: string | null | undefined): "busy" | "status-unavailable" | null {
  if (!status) return "status-unavailable";
  return status === "idle" ? null : "busy";
}

async function checkAgentIdle(agent: {
  refresh(): Promise<unknown>;
  readonly status: string | null;
}): Promise<"busy" | "status-unavailable" | null> {
  try {
    await agent.refresh();
  } catch (error) {
    console.warn("[irix-ui-render] could not refresh agent status", error);
    return "status-unavailable";
  }
  return idleGate(agent.status);
}

/** Registers the turn-end hook that sends automatic fix requests. */
export function registerAutoFix(server: PluginServerContext, settings: IrixSettingsHandle) {
  async function readMaxRetries(): Promise<number> {
    return (await readIrixSettings(settings)).autoFixMaxRetries;
  }

  return server.on("agent.turn_ended", async (event, { paseo, signal }) => {
    try {
      const turn: TurnInput = {
        turnTimeline: event.timeline,
        outcome: event.outcome,
        maxRetries: await readMaxRetries(),
      };
      if (!planAutoFix(turn).ok) return;

      // Yield first so the send never runs re-entrantly inside the turn-end dispatch. The hook stays
      // pending until the send settles because its `paseo` handle may be scoped to this invocation.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (signal.aborted) return;

      const agent = paseo.agents.ref(event.agent.id);
      let history: ReturnType<typeof timelineFromPayload> = null;
      try {
        history = timelineFromPayload(
          await agent.timeline.refetch({ direction: "tail", limit: HISTORY_LIMIT, projection: "projected" }),
        );
      } catch (error) {
        console.warn("[irix-ui-render] could not fetch agent history, skipping auto-fix", error);
        return;
      }

      const decision = decideAutoFix({
        ...turn,
        latestTimeline: history?.items ?? null,
        latestTruncated: history?.truncated,
      });
      if (!decision.send) {
        if (decision.reason === "history-unavailable" || decision.reason === "history-truncated") {
          console.warn(`[irix-ui-render] skipping auto-fix: ${decision.reason}`);
        }
        return;
      }
      // `send` interrupts a running turn, so a message that arrived after the history fetch would be
      // cancelled. Re-read the status right before sending and leave a running agent alone. A small
      // window remains: Paseo has no "send only if idle" option (see README).
      const gate = await checkAgentIdle(agent);
      if (gate) {
        if (gate === "status-unavailable") console.warn("[irix-ui-render] skipping auto-fix: status-unavailable");
        return;
      }
      await agent.send(decision.message);
    } catch (error) {
      console.warn("[irix-ui-render] auto-fix hook failed", error);
    }
  });
}

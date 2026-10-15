import { formatIssues, type FormIssue } from "./form-errors";
import { parseMessageContent } from "./parser";

/** First token of every message that asks the agent to repair an irix-form block. */
export const IRIX_FIX_MARKER = "[irix-form-fix]";

/** One irix-form block that failed validation. `blockNumber` is its 1-based position among the form blocks of the reply. */
export interface FormFailure {
  issues: FormIssue[];
  blockNumber?: number;
}

/** The part of a Paseo `AgentTimelineItem` these helpers read; the real type is assignable to it. */
export interface TimelineEntry {
  readonly type: string;
  readonly text?: string;
}

/**
 * Builds the message that asks the agent to repair failed blocks. It lists issues only: the agent
 * already has its own JSON in context.
 */
export function buildFixMessage(failures: readonly FormFailure[]): string {
  const sections = failures.map((failure, index) => {
    const lines = formatIssues(failure.issues).map((line) => `- ${line}`);
    return [`Block ${failure.blockNumber ?? index + 1}:`, ...lines].join("\n");
  });
  return [
    `${IRIX_FIX_MARKER} Your previous irix-form block(s) failed validation and could not be rendered:`,
    sections.join("\n\n"),
    "Please re-output the corrected, complete irix-form block(s). Keep conversational text minimal.",
  ].join("\n\n");
}

/**
 * Counts the consecutive fix requests at the end of the user's side of the conversation.
 * Assistant and other items are skipped; the first user message that is not a fix request stops the count.
 */
export function countTrailingFixAttempts(timeline: readonly TimelineEntry[]): number {
  let count = 0;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i];
    if (item.type !== "user_message") continue;
    if (!(item.text ?? "").trimStart().startsWith(IRIX_FIX_MARKER)) break;
    count++;
  }
  return count;
}

/**
 * Collects failed irix-form blocks from the assistant messages after the last user message
 * (all assistant messages when there is no user message). Each message is parsed on its own,
 * the way the client renders it.
 */
export function collectTurnFormFailures(timeline: readonly TimelineEntry[]): FormFailure[] {
  let start = 0;
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].type === "user_message") {
      start = i + 1;
      break;
    }
  }

  const failures: FormFailure[] = [];
  let blockNumber = 0;
  for (const item of timeline.slice(start)) {
    if (item.type !== "assistant_message") continue;
    for (const block of parseMessageContent(item.text ?? "")) {
      if (block.type !== "form") continue;
      blockNumber++;
      if (block.errors && block.errors.length > 0) {
        failures.push({ issues: block.errors, blockNumber });
      }
    }
  }
  return failures;
}

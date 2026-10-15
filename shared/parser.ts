import {
  capIssues,
  findDuplicateIdIssues,
  formatIssues,
  formatJsonParseError,
  formatZodIssues,
  type FormIssue,
} from "./form-errors";
import { IrixForm, IrixFormSchema } from "./schema";

export interface ParsedBlock {
  type: "text" | "form";
  content?: string;
  form?: IrixForm;
  rawJson?: string;
  /** Structured problems (at most 10, plus an "...and N more" entry); set when the block failed. */
  errors?: FormIssue[];
  /** `errors` joined one per line, for display. */
  error?: string;
}

interface FenceBlock {
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
}

function findBlocks(text: string): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  const fences = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?$/gm;
  let opening: RegExpExecArray | null;

  while ((opening = fences.exec(text)) !== null) {
    const marker = opening[1];
    const label = opening[2].trim();
    const contentStart = opening.index + opening[0].length;
    const closing = new RegExp(
      `^ {0,3}${marker[0]}{${marker.length},}[ \\t]*\\r?$`,
      "gm",
    );
    closing.lastIndex = contentStart;
    const end = closing.exec(text);

    if (label === "irix-form" || label === "irix-ui") {
      blocks.push({
        start: opening.index,
        contentStart,
        contentEnd: end ? end.index : text.length,
        end: end ? end.index + end[0].length : text.length,
      });
    }

    if (!end) break;
    fences.lastIndex = end.index + end[0].length;
  }

  return blocks;
}

export function hasFormBlock(text: string): boolean {
  return findBlocks(text).length > 0;
}

function failedBlock(rawJson: string, issues: FormIssue[]): ParsedBlock {
  const errors = capIssues(issues);
  return { type: "form", rawJson, errors, error: formatIssues(errors).join("\n") };
}

function parseFormBlock(jsonStr: string): ParsedBlock {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonStr);
  } catch (e) {
    return failedBlock(jsonStr, formatJsonParseError(jsonStr, e));
  }

  const validation = IrixFormSchema.safeParse(parsedJson);
  const issues = [
    ...(validation.success ? [] : formatZodIssues(validation.error.issues, parsedJson)),
    ...findDuplicateIdIssues(parsedJson),
  ];
  if (issues.length > 0) {
    return failedBlock(jsonStr, issues);
  }
  return { type: "form", form: validation.data as IrixForm, rawJson: jsonStr };
}

export function parseMessageContent(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const fenceBlocks = findBlocks(text);
  let cursor = 0;

  for (const block of fenceBlocks) {
    // Leading text
    if (block.start > cursor) {
      const leadingText = text.slice(cursor, block.start).trim();
      if (leadingText) {
        blocks.push({ type: "text", content: leadingText });
      }
    }

    const jsonStr = text.slice(block.contentStart, block.contentEnd).trim();
    blocks.push(parseFormBlock(jsonStr));

    cursor = block.end;
  }

  // Trailing text
  if (cursor < text.length) {
    const trailingText = text.slice(cursor).trim();
    if (trailingText) {
      blocks.push({ type: "text", content: trailingText });
    }
  }

  return blocks;
}

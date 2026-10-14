import { IrixForm, IrixFormSchema } from "../shared/schema";

export interface ParsedBlock {
  type: "text" | "form";
  content?: string;
  form?: IrixForm;
  rawJson?: string;
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
    try {
      const parsedJson = JSON.parse(jsonStr);
      const validation = IrixFormSchema.safeParse(parsedJson);
      if (validation.success) {
        blocks.push({
          type: "form",
          form: validation.data,
          rawJson: jsonStr,
        });
      } else {
        blocks.push({
          type: "form",
          rawJson: jsonStr,
          error: `Schema Validation Error: ${validation.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(", ")}`,
        });
      }
    } catch (e: any) {
      blocks.push({
        type: "form",
        rawJson: jsonStr,
        error: `JSON Parse Error: ${e.message}`,
      });
    }

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

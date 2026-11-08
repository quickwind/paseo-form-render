// Syntax-only repair for the small JSON slips models make most often. It never guesses
// structure: callers must still validate the result against the schema. Unbalanced brackets are
// deliberately NOT closed, because a truncated block could otherwise render as a form that is
// silently missing content.

export interface RepairResult {
  text: string;
  /** True when `text` differs from the input. */
  repaired: boolean;
}

const isWhitespace = (ch: string) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
const isIdentStart = (ch: string) => /[A-Za-z_$]/.test(ch);
const isIdentPart = (ch: string) => /[\w$]/.test(ch);

/** Index of the first character after whitespace and comments, starting at `from`. */
function skipTrivia(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    if (isWhitespace(text[i])) {
      i++;
    } else if (text.startsWith("//", i)) {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      i = close === -1 ? text.length : close + 2;
    } else {
      break;
    }
  }
  return i;
}

export function repairJson(input: string): RepairResult {
  let out = "";
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === '"') {
      let j = i + 1;
      while (j < input.length && input[j] !== '"') j += input[j] === "\\" ? 2 : 1;
      out += input.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "'") {
      let j = i + 1;
      let body = "";
      while (j < input.length && input[j] !== "'") {
        if (input[j] === "\\" && j + 1 < input.length) {
          body += input[j + 1] === "'" ? "'" : input[j] + input[j + 1];
          j += 2;
        } else {
          body += input[j] === '"' ? '\\"' : input[j];
          j++;
        }
      }
      out += `"${body}"`;
      i = j + 1;
    } else if (input.startsWith("//", i) || input.startsWith("/*", i)) {
      i = skipTrivia(input, i);
    } else if (ch === ",") {
      const next = skipTrivia(input, i + 1);
      if (input[next] === "}" || input[next] === "]") {
        i++; // trailing comma
      } else {
        out += ch;
        i++;
      }
    } else if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < input.length && isIdentPart(input[j])) j++;
      const word = input.slice(i, j);
      out += input[skipTrivia(input, j)] === ":" ? `"${word}"` : word;
      i = j;
    } else {
      out += ch;
      i++;
    }
  }

  return { text: out, repaired: out !== input };
}

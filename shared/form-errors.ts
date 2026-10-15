import type { ZodIssue } from "zod";
import { IRIX_FIELD_TYPES, IRIX_NODE_TYPES } from "./schema";

/** One problem found in an irix-form block. `path` locates it (empty when not applicable). */
export interface FormIssue {
  path: string;
  message: string;
}

export const MAX_FORM_ISSUES = 10;

type PathSegment = string | number;

/** Common wrong component names mapped to what the agent should have written. */
const TYPE_ALIASES: Record<string, string> = {
  textarea: 'Input with "multiline": true',
  textfield: "Input",
  textinput: "Input",
  checkbox: "Toggle",
  switch: "Toggle",
  dropdown: "Select",
  label: "Text",
  paragraph: "Text",
  title: "Heading",
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatIssue(issue: FormIssue): string {
  return issue.path ? `${issue.path}: ${issue.message}` : issue.message;
}

export function formatIssues(issues: readonly FormIssue[]): string[] {
  return issues.map(formatIssue);
}

/** Keeps the first `max` issues and replaces the rest with a single "...and N more" entry. */
export function capIssues(issues: readonly FormIssue[], max = MAX_FORM_ISSUES): FormIssue[] {
  if (issues.length <= max) return [...issues];
  return [...issues.slice(0, max), { path: "", message: `...and ${issues.length - max} more` }];
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return `string ${JSON.stringify(truncate(value, 40))}`;
  if (typeof value === "number" || typeof value === "boolean") return `${typeof value} ${value}`;
  return typeof value;
}

// ---------------------------------------------------------------------------
// Path rendering
// ---------------------------------------------------------------------------

function nodeLabel(node: Record<string, unknown>): string | undefined {
  for (const key of ["label", "title", "id", "text"]) {
    const value = node[key];
    if (typeof value === "string" && value) return truncate(value, 40);
  }
  return undefined;
}

/** `Input "Release Tag"`, or just `Input`; undefined when the value is not a node. */
function describeNode(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  const label = nodeLabel(value);
  return label ? `${value.type} ${JSON.stringify(label)}` : value.type;
}

/**
 * Renders a location like `Card > children[2] (Input "Release Tag")` by walking `segments` through
 * the parsed JSON so each node on the way can be named.
 */
export function renderPath(root: unknown, segments: readonly PathSegment[]): string {
  const parts: string[] = [describeNode(root) ?? "root"];
  let current: unknown = root;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    let text: string;
    if (typeof segment === "number") {
      text = `[${segment}]`;
      current = Array.isArray(current) ? current[segment] : undefined;
    } else {
      text = segment;
      current = isRecord(current) ? current[segment] : undefined;
      const next = segments[i + 1];
      if (typeof next === "number") {
        current = Array.isArray(current) ? current[next] : undefined;
        text = `${segment}[${next}]`;
        i++;
      }
    }
    const node = describeNode(current);
    parts.push(node ? `${text} (${node})` : text);
  }

  return parts.join(" > ");
}

function valueAt(root: unknown, segments: readonly PathSegment[]): unknown {
  let current = root;
  for (const segment of segments) {
    if (typeof segment === "number") {
      current = Array.isArray(current) ? current[segment] : undefined;
    } else {
      current = isRecord(current) ? current[segment] : undefined;
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// Unknown component types
// ---------------------------------------------------------------------------

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return prev[b.length];
}

/** Suggests a valid type (or replacement) for a wrong one, or undefined when nothing is close. */
export function suggestNodeType(
  given: string,
  validTypes: readonly string[] = IRIX_NODE_TYPES,
): string | undefined {
  const lower = given.toLowerCase();
  const alias = TYPE_ALIASES[lower];
  if (alias) return alias;

  let best: { type: string; distance: number } | undefined;
  for (const type of validTypes) {
    const distance = editDistance(lower, type.toLowerCase());
    if (!best || distance < best.distance) best = { type, distance };
  }
  if (best && best.distance <= Math.max(2, Math.floor(best.type.length / 3))) return best.type;
  return undefined;
}

function unknownTypeMessage(value: unknown, validTypes: readonly string[]): string {
  const valid = validTypes.join(", ");
  if (value === undefined) {
    return `missing required field "type". Valid types: ${valid}`;
  }
  if (typeof value !== "string") {
    return `"type" must be a string naming a component (got ${describeValue(value)}). Valid types: ${valid}`;
  }
  const suggestion = suggestNodeType(value, validTypes);
  const hint = suggestion ? ` Did you mean ${suggestion}?` : "";
  return `unknown component type ${JSON.stringify(value)}. Valid types: ${valid}.${hint}`;
}

// ---------------------------------------------------------------------------
// Zod issues
// ---------------------------------------------------------------------------

function quoted(field: string | undefined): string {
  return field === undefined ? "value" : `"${field}"`;
}

function issueMessage(issue: ZodIssue, field: string | undefined, value: unknown): string {
  const record = issue as unknown as Record<string, unknown>;

  switch (issue.code) {
    case "invalid_union": {
      if (record.note === "No matching discriminator" || record.discriminator === "type") {
        const options = Array.isArray(record.options) ? record.options.map(String) : [...IRIX_NODE_TYPES];
        return unknownTypeMessage(value, options);
      }
      const expected = Array.isArray(record.errors)
        ? [
            ...new Set(
              (record.errors as unknown[][])
                .map((branch) => (branch[0] as { expected?: unknown } | undefined)?.expected)
                .filter((e): e is string => typeof e === "string"),
            ),
          ]
        : [];
      const suffix = expected.length ? `; expected ${expected.join(" or ")}` : "";
      return `${quoted(field)} has an invalid value (got ${describeValue(value)})${suffix}`;
    }
    case "invalid_type": {
      if (value === undefined) {
        return field === undefined
          ? `missing required value (expected ${record.expected})`
          : `missing required field "${field}" (expected ${record.expected})`;
      }
      return `${quoted(field)} must be ${article(String(record.expected))} (got ${describeValue(value)})`;
    }
    case "invalid_value": {
      const values = Array.isArray(record.values) ? record.values : [];
      const allowed = values.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ");
      if (value === undefined) {
        return `missing required field ${quoted(field)}; must be one of: ${allowed}`;
      }
      return `${quoted(field)} must be one of: ${allowed} (got ${truncate(JSON.stringify(value) ?? String(value), 40)})`;
    }
    case "too_small": {
      const min = Number(record.minimum);
      if (record.origin === "array") {
        return `${quoted(field)} must contain at least ${min} item${min === 1 ? "" : "s"}`;
      }
      if (record.origin === "string") {
        return min <= 1
          ? `${quoted(field)} must not be empty`
          : `${quoted(field)} must be at least ${min} characters`;
      }
      return `${quoted(field)} must be ${record.inclusive === false ? ">" : ">="} ${min} (got ${describeValue(value)})`;
    }
    case "too_big": {
      const max = Number(record.maximum);
      if (record.origin === "array") {
        return `${quoted(field)} must contain at most ${max} item${max === 1 ? "" : "s"}`;
      }
      if (record.origin === "string") {
        return `${quoted(field)} must be at most ${max} characters`;
      }
      return `${quoted(field)} must be ${record.inclusive === false ? "<" : "<="} ${max} (got ${describeValue(value)})`;
    }
    default:
      return field === undefined ? issue.message : `${quoted(field)}: ${issue.message}`;
  }
}

function article(expected: string): string {
  return /^[aeiou]/.test(expected) ? `an ${expected}` : `a ${expected}`;
}

/** Converts zod issues into issues that name the offending node and say how to fix it. */
export function formatZodIssues(zodIssues: readonly ZodIssue[], json: unknown): FormIssue[] {
  return zodIssues.map((issue) => {
    const segments = issue.path.filter(
      (segment): segment is PathSegment => typeof segment === "string" || typeof segment === "number",
    );
    const last = segments[segments.length - 1];
    const field = typeof last === "string" ? last : undefined;
    const parent = field === undefined ? segments : segments.slice(0, -1);
    return {
      path: renderPath(json, parent),
      message: issueMessage(issue, field, valueAt(json, segments)),
    };
  });
}

// ---------------------------------------------------------------------------
// Semantic checks beyond the schema
// ---------------------------------------------------------------------------

/** Reports field ids used by more than one input node. Tolerates arbitrary (even invalid) JSON. */
export function findDuplicateIdIssues(json: unknown): FormIssue[] {
  const fieldTypes: readonly string[] = IRIX_FIELD_TYPES;
  const seen = new Map<string, { descriptions: string[]; lastPath: PathSegment[] }>();

  const visit = (node: unknown, path: PathSegment[], depth: number) => {
    if (!isRecord(node) || depth > 50) return;
    if (typeof node.type === "string" && fieldTypes.includes(node.type) && typeof node.id === "string" && node.id) {
      const entry = seen.get(node.id) ?? { descriptions: [], lastPath: path };
      entry.descriptions.push(describeNode(node) ?? node.type);
      entry.lastPath = path;
      seen.set(node.id, entry);
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((child, index) => visit(child, [...path, "children", index], depth + 1));
    }
  };
  visit(json, [], 0);

  const issues: FormIssue[] = [];
  for (const [id, entry] of seen) {
    if (entry.descriptions.length < 2) continue;
    issues.push({
      path: renderPath(json, entry.lastPath),
      message: `duplicate field id ${JSON.stringify(id)} is used by ${entry.descriptions.length} inputs (${entry.descriptions.join(", ")}); every input needs a unique "id"`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// JSON syntax errors
// ---------------------------------------------------------------------------

const GENERIC_JSON_HINT =
  "Common causes: trailing commas, comments (// or /* */), single quotes instead of double quotes, unquoted keys, or unescaped line breaks inside strings";

interface JsonProblem {
  hint: string;
}

/** Looks for the usual hand-written-JSON mistakes outside of string literals. */
function findCommonJsonProblem(json: string): JsonProblem | undefined {
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "/" && (json[i + 1] === "/" || json[i + 1] === "*")) {
      return { hint: "comments are not allowed in JSON; remove them" };
    } else if (ch === "'") {
      return { hint: 'strings and keys must use double quotes ("), not single quotes' };
    } else if (ch === ",") {
      const after = /^\s*([}\]])/.exec(json.slice(i + 1));
      if (after) return { hint: `trailing comma before "${after[1]}"; remove it` };
    } else if (/[A-Za-z_$]/.test(ch) && /[{,]\s*$/.test(json.slice(Math.max(0, i - 20), i))) {
      const key = /^[A-Za-z_$][\w$]*(?=\s*:)/.exec(json.slice(i));
      if (key) return { hint: `object keys must be quoted: use "${key[0]}"` };
    }
  }
  return undefined;
}

function lineAndColumn(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, position);
  const line = before.split("\n").length;
  return { line, column: position - (before.lastIndexOf("\n") + 1) + 1 };
}

/** Explains a JSON.parse failure with line/column, the offending line, and likely causes. */
export function formatJsonParseError(jsonText: string, error: unknown): FormIssue[] {
  if (!jsonText.trim()) {
    return [{ path: "JSON", message: "the irix-form block is empty; it must contain one JSON object" }];
  }

  const engineMessage = error instanceof Error ? error.message : String(error);
  const reported = /position (\d+)/.exec(engineMessage);
  const lineReported = /line (\d+) column (\d+)/.exec(engineMessage);

  let location = "";
  let snippet = "";
  let position: number | undefined = reported ? Number(reported[1]) : undefined;
  if (position !== undefined && position > jsonText.length) position = jsonText.length;

  if (position !== undefined) {
    const { line, column } = lineAndColumn(jsonText, position);
    location = ` at line ${line}, column ${column}`;
    const lineText = jsonText.split("\n")[line - 1] ?? "";
    snippet = ` near \`${truncate(lineText.trim(), 80)}\``;
  } else if (lineReported) {
    location = ` at line ${lineReported[1]}, column ${lineReported[2]}`;
    const lineText = jsonText.split("\n")[Number(lineReported[1]) - 1] ?? "";
    snippet = ` near \`${truncate(lineText.trim(), 80)}\``;
  }

  const reason = engineMessage
    .replace(/\s*\(line \d+ column \d+\)/, "")
    .replace(/\s*(in JSON )?at position \d+/, "")
    .replace(/^JSON Parse error:\s*/i, "")
    .trim();

  const truncated = /end of (JSON|data)|unterminated|unexpected end/i.test(engineMessage);
  const hint = truncated
    ? "the JSON looks truncated; check for missing closing brackets, braces, or quotes"
    : (findCommonJsonProblem(jsonText)?.hint ?? GENERIC_JSON_HINT);

  return [
    {
      path: "JSON",
      message: `syntax error${location}${snippet}: ${reason}. Hint: ${hint}`,
    },
  ];
}

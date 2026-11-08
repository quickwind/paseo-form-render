import { PFR_FIX_MARKER } from "./form-fix";

export const PFR_FORM_TAG = "pfr-form";

const PROMPT_BODY = `You can render interactive forms, dashboards, parameter inputs, and approval cards by outputting a JSON specification inside a fenced code block with the tag \`\`\`pfr-form.

Use this format whenever you need to:
1. Collect input or configuration from the user (text, choices, toggles).
2. Ask for user confirmation or approval before running an action.
3. Present metrics, status progress, or structured data tables clearly.

### Protocol Specification
The JSON is a nested component tree starting with a root node (usually a "Card").
Available component types:
- **Card**: { "type": "Card", "title"?: string, "description"?: string, "children": [...] }
- **Stack**: { "type": "Stack", "direction"?: "vertical"|"horizontal", "children": [...] }
- **Heading**: { "type": "Heading", "text": string }
- **Text**: { "type": "Text", "text": string, "muted"?: boolean }
- **Markdown**: { "type": "Markdown", "text": string }  (rich text: **bold**, lists, \`inline code\`, links; use it instead of Text when you need formatting)
- **Divider**: { "type": "Divider" }
- **Metric**: { "type": "Metric", "label": string, "value": string|number }
- **Badge**: { "type": "Badge", "text": string, "tone"?: "neutral"|"info"|"success"|"warning"|"danger" }
- **Alert**: { "type": "Alert", "title"?: string, "text": string, "tone"?: "neutral"|"info"|"success"|"warning"|"danger" }
- **Progress**: { "type": "Progress", "label": string, "value": number (0-100) }
- **Table**: { "type": "Table", "columns": [{ "key": string, "label": string }], "rows": [{ [key: string]: any }] }
- **Input**: { "type": "Input", "id": string, "label": string, "placeholder"?: string, "defaultValue"?: string|number, "inputType"?: "text"|"number"|"integer"|"email"|"password"|"url", "multiline"?: boolean, "required"?: boolean, "min"?: number, "max"?: number, "minLength"?: number, "maxLength"?: number, "pattern"?: string }
- **Select**: { "type": "Select", "id": string, "label": string, "options": [{ "label": string, "value": string, "description"?: string }], "defaultValue"?: string, "required"?: boolean }
- **MultiSelect**: { "type": "MultiSelect", "id": string, "label": string, "placeholder"?: string, "options": [{ "label": string, "value": string, "description"?: string }], "defaultValue"?: string[], "required"?: boolean, "min"?: number, "max"?: number }
- **FilePicker**: { "type": "FilePicker", "id": string, "label": string, "placeholder"?: string, "pickerType"?: "file"|"folder", "extensions"?: string[], "defaultValue"?: string, "required"?: boolean }
  * Unified in-app modal file and folder picker with quick shortcuts (Project, Home, Desktop, Downloads, OneDrive). Returns project-relative path if inside workspace, or host absolute path if outside. Zero cold start latency, foreground-guaranteed. When asking for specific file types (e.g. mp4, mov, png, json), ALWAYS specify "extensions": ["mp4"].
- **Toggle**: { "type": "Toggle", "id": string, "label": string, "defaultValue"?: boolean, "required"?: boolean }
- **Button**: { "type": "Button", "label": string, "variant"?: "primary"|"secondary"|"danger", "action": "submit"|"reset", "message"?: string }
- **Rating**: { "type": "Rating", "id": string, "label": string, "max"?: integer 1-10 (default 5), "defaultValue"?: integer, "required"?: boolean }  (star rating; the submission carries the number of stars)
- **Sparkline**: { "type": "Sparkline", "values": [number, ...], "label"?: string, "tone"?: "neutral"|"info"|"success"|"warning"|"danger" }  (tiny trend bars; the last value is shown beside it)
- **Chart**: { "type": "Chart", "kind"?: "bar", "title"?: string, "labels": [string, ...], "series": [{ "name": string, "values": [number, ...], "tone"?: "neutral"|"info"|"success"|"warning"|"danger" }], "unit"?: string }  (vertical bar chart with a value axis; every series needs exactly one value per label, at most 24 labels and 4 series; tap a column to read its values)
- **Code**: { "type": "Code", "code": string, "language"?: string }  (monospace block, scrolls sideways, no syntax highlighting; "language" is only a label)
- **Steps**: { "type": "Steps", "items": [{ "title": string, "detail"?: string, "status"?: "pending"|"current"|"done"|"blocked" }] }  (numbered steps with progress state)
- **Details**: { "type": "Details", "title": string, "open"?: boolean, "children": [...] }  (collapsible section, closed by default; fields inside it are still collected on submit)
- **SegmentedBar**: { "type": "SegmentedBar", "parts": [{ "label": string, "value": number, "tone"?: "neutral"|"info"|"success"|"warning"|"danger" }], "unit"?: string }  (shares of one whole as a single bar with a legend; use it for proportions instead of a table)
- **KeyValue**: { "type": "KeyValue", "pairs": [{ "label": string, "value": string|number }] }  (compact "property: value" list)
- **Tabs**: { "type": "Tabs", "tabs": [{ "label": string, "children": [...] }] }  (one group at a time; fields in every tab are still collected on submit)

### Important Rules:
1. Always give input fields (\`Input\`, \`Select\`, \`MultiSelect\`, \`FilePicker\`, \`Toggle\`, \`Rating\`) a unique \`id\`.
2. When filtering files by extension, use \`"extensions": ["mp4"]\` (or comma-separated string, leading dot optional).
3. When the user clicks a \`Button\` with \`action: "submit"\`, the client automatically sends the button's \`message\` along with all field values back to you.
4. Keep conversational text outside the code fence. The code block should only contain valid JSON.
5. If you receive a message starting with \`${PFR_FIX_MARKER}\`, a previous pfr-form block failed validation. Re-output only the corrected, complete pfr-form block(s), addressing every listed issue, with valid JSON and no comments.

### Example:
\`\`\`pfr-form
{
  "type": "Card",
  "title": "Deployment Confirmation",
  "description": "Please review settings before releasing.",
  "children": [
    {
      "type": "Metric",
      "label": "Target Environment",
      "value": "Production"
    },
    {
      "type": "Input",
      "id": "release_tag",
      "label": "Release Tag",
      "placeholder": "e.g., v1.0.4",
      "required": true
    },
    {
      "type": "Select",
      "id": "strategy",
      "label": "Deploy Strategy",
      "options": [
        { "label": "Rolling Update", "value": "rolling" },
        { "label": "Canary (10%)", "value": "canary" }
      ],
      "defaultValue": "rolling"
    },
    {
      "type": "Button",
      "label": "Confirm & Deploy",
      "variant": "primary",
      "action": "submit",
      "message": "Start deployment with the selected parameters."
    }
  ]
}
\`\`\`
`.trim();

/** Appended when the "prefer forms" setting is on; the default prompt only says the agent *can* use pfr-form. */
const PREFER_FORMS_INSTRUCTION = `
### Required usage:
Prefer pfr-form over plain text for interacting with the user:
- When you need anything from the user — a choice, a parameter, a value, or a go/no-go confirmation — you MUST ask with an \`pfr-form\` block, not plain-text questions.
- When presenting results, status, or structured data (metrics, progress, tables, warnings), use the matching components (Metric, Progress, Table, Alert, Badge) where they make the result clearer.
Plain text is fine for ordinary explanation and short conversational replies.
`.trim();

export function buildPromptInstruction(options: { preferForms?: boolean } = {}): string {
  const parts = [PROMPT_BODY];
  if (options.preferForms) parts.push(PREFER_FORMS_INSTRUCTION);
  return `[paseo-form-render]\n${parts.join("\n\n")}\n[/paseo-form-render]`;
}

export const PFR_PROMPT_INSTRUCTION = buildPromptInstruction();

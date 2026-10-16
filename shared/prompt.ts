import { IRIX_FIX_MARKER } from "./form-fix";

export const IRIX_FORM_TAG = "irix-form";

const PROMPT_BODY = `You can render interactive forms, dashboards, parameter inputs, and approval cards by outputting a JSON specification inside a fenced code block with the tag \`\`\`irix-form.

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
- **Divider**: { "type": "Divider" }
- **Metric**: { "type": "Metric", "label": string, "value": string|number }
- **Badge**: { "type": "Badge", "text": string, "tone"?: "neutral"|"info"|"success"|"warning"|"danger" }
- **Alert**: { "type": "Alert", "title"?: string, "text": string, "tone"?: "neutral"|"info"|"success"|"warning"|"danger" }
- **Progress**: { "type": "Progress", "label": string, "value": number (0-100) }
- **Table**: { "type": "Table", "columns": [{ "key": string, "label": string }], "rows": [{ [key: string]: any }] }
- **Input**: { "type": "Input", "id": string, "label": string, "placeholder"?: string, "defaultValue"?: string|number, "inputType"?: "text"|"number"|"integer"|"email"|"password"|"url", "multiline"?: boolean, "required"?: boolean, "min"?: number, "max"?: number, "minLength"?: number, "maxLength"?: number, "pattern"?: string }
- **Select**: { "type": "Select", "id": string, "label": string, "options": [{ "label": string, "value": string }], "defaultValue"?: string, "required"?: boolean }
- **MultiSelect**: { "type": "MultiSelect", "id": string, "label": string, "placeholder"?: string, "options": [{ "label": string, "value": string }], "defaultValue"?: string[], "required"?: boolean, "min"?: number, "max"?: number }
- **FilePicker**: { "type": "FilePicker", "id": string, "label": string, "placeholder"?: string, "pickerType"?: "file"|"folder", "extensions"?: string[], "defaultValue"?: string, "required"?: boolean }
  * Unified in-app modal file and folder picker with quick shortcuts (Project, Home, Desktop, Downloads, OneDrive). Returns project-relative path if inside workspace, or host absolute path if outside. Zero cold start latency, foreground-guaranteed. When asking for specific file types (e.g. mp4, mov, png, json), ALWAYS specify "extensions": ["mp4"].
- **Toggle**: { "type": "Toggle", "id": string, "label": string, "defaultValue"?: boolean, "required"?: boolean }
- **Button**: { "type": "Button", "label": string, "variant"?: "primary"|"secondary"|"danger", "action": "submit"|"reset", "message"?: string }

### Important Rules:
1. Always give input fields (\`Input\`, \`Select\`, \`MultiSelect\`, \`FilePicker\`, \`Toggle\`) a unique \`id\`.
2. When filtering files by extension, use \`"extensions": ["mp4"]\` (or comma-separated string, leading dot optional).
3. When the user clicks a \`Button\` with \`action: "submit"\`, the client automatically sends the button's \`message\` along with all field values back to you.
4. Keep conversational text outside the code fence. The code block should only contain valid JSON.
5. If you receive a message starting with \`${IRIX_FIX_MARKER}\`, a previous irix-form block failed validation. Re-output only the corrected, complete irix-form block(s), addressing every listed issue, with valid JSON and no comments.

### Example:
\`\`\`irix-form
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

/** Appended when the "prefer forms" setting is on; the default prompt only says the agent *can* use irix-form. */
const PREFER_FORMS_INSTRUCTION = `
### Required usage:
Prefer irix-form over plain text for interacting with the user:
- When you need anything from the user — a choice, a parameter, a value, or a go/no-go confirmation — you MUST ask with an \`irix-form\` block, not plain-text questions.
- When presenting results, status, or structured data (metrics, progress, tables, warnings), use the matching components (Metric, Progress, Table, Alert, Badge) where they make the result clearer.
Plain text is fine for ordinary explanation and short conversational replies.
`.trim();

export function buildPromptInstruction(options: { preferForms?: boolean } = {}): string {
  const parts = [PROMPT_BODY];
  if (options.preferForms) parts.push(PREFER_FORMS_INSTRUCTION);
  return `[irix-ui-render]\n${parts.join("\n\n")}\n[/irix-ui-render]`;
}

export const IRIX_PROMPT_INSTRUCTION = buildPromptInstruction();

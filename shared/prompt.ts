export const WUKONG_FORM_TAG = "wukong-form";

export const WUKONG_PROMPT_INSTRUCTION = `
[wukong-ui-render]
You can render interactive forms, dashboards, parameter inputs, and approval cards by outputting a JSON specification inside a fenced code block with the tag \`\`\`wukong-form.

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
- **Input**: { "type": "Input", "id": string, "label": string, "placeholder"?: string, "defaultValue"?: string, "multiline"?: boolean, "required"?: boolean }
- **Select**: { "type": "Select", "id": string, "label": string, "options": [{ "label": string, "value": string }], "defaultValue"?: string, "required"?: boolean }
- **MultiSelect**: { "type": "MultiSelect", "id": string, "label": string, "options": [{ "label": string, "value": string }], "defaultValue"?: string[], "required"?: boolean }
- **Toggle**: { "type": "Toggle", "id": string, "label": string, "defaultValue"?: boolean, "required"?: boolean }
- **Button**: { "type": "Button", "label": string, "variant"?: "primary"|"secondary"|"danger", "action": "submit"|"reset", "message"?: string }

### Important Rules:
1. Always give input fields (\`Input\`, \`Select\`, \`MultiSelect\`, \`Toggle\`) a unique \`id\`.
2. When the user clicks a \`Button\` with \`action: "submit"\`, the client automatically sends the button's \`message\` along with all field values back to you.
3. Keep conversational text outside the code fence. The code block should only contain valid JSON.

### Example:
\`\`\`wukong-form
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
[/wukong-ui-render]
`.trim();

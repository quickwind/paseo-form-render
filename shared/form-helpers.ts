import { WukongForm, WukongNode } from "./schema";

export function extractInitialValues(node: WukongNode, result: Record<string, any> = {}): Record<string, any> {
  switch (node.type) {
    case "Input":
      result[node.id] = node.defaultValue ?? "";
      break;
    case "Select":
      result[node.id] = node.defaultValue ?? (node.options[0]?.value ?? "");
      break;
    case "MultiSelect":
      result[node.id] = node.defaultValue ?? [];
      break;
    case "Toggle":
      result[node.id] = node.defaultValue ?? false;
      break;
    case "Card":
    case "Stack":
      for (const child of node.children) {
        extractInitialValues(child, result);
      }
      break;
  }
  return result;
}

export function validateForm(
  node: WukongNode,
  values: Record<string, any>,
  errors: Record<string, string> = {}
): Record<string, string> {
  switch (node.type) {
    case "Input":
      if (node.required) {
        const val = values[node.id];
        if (!val || typeof val !== "string" || val.trim().length === 0) {
          errors[node.id] = `${node.label} is required.`;
        }
      }
      break;
    case "Select":
      if (node.required) {
        const val = values[node.id];
        if (!val || typeof val !== "string" || val.trim().length === 0) {
          errors[node.id] = `Please select an option for ${node.label}.`;
        }
      }
      break;
    case "MultiSelect":
      if (node.required) {
        const val = values[node.id];
        if (!Array.isArray(val) || val.length === 0) {
          errors[node.id] = `Please select at least one option for ${node.label}.`;
        }
      }
      break;
    case "Toggle":
      if (node.required) {
        const val = values[node.id];
        if (!val) {
          errors[node.id] = `${node.label} must be checked.`;
        }
      }
      break;
    case "Card":
    case "Stack":
      for (const child of node.children) {
        validateForm(child, values, errors);
      }
      break;
  }
  return errors;
}

export function formatSubmissionMessage(
  actionMessage: string | undefined,
  node: WukongNode,
  values: Record<string, any>
): string {
  const lines: string[] = ["[User Form Submission]"];
  if (actionMessage) {
    lines.push(`Action: ${actionMessage}`);
  }
  lines.push("Values:");

  const fieldLabels: Record<string, string> = {};
  function collectLabels(n: WukongNode) {
    if ("id" in n && "label" in n) {
      fieldLabels[n.id] = n.label;
    }
    if ("children" in n && Array.isArray(n.children)) {
      n.children.forEach(collectLabels);
    }
  }
  collectLabels(node);

  for (const [id, val] of Object.entries(values)) {
    const label = fieldLabels[id] || id;
    let formattedVal = "";
    if (Array.isArray(val)) {
      formattedVal = val.join(", ");
    } else if (typeof val === "boolean") {
      formattedVal = val ? "Yes" : "No";
    } else {
      formattedVal = String(val ?? "");
    }
    lines.push(`- ${label}: ${formattedVal}`);
  }

  return lines.join("\n");
}

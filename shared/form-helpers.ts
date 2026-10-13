import { WukongForm, WukongNode, normalizeExtensions } from "./schema";

export function extractInitialValues(node: WukongNode, result: Record<string, any> = {}): Record<string, any> {
  switch (node.type) {
    case "Input":
      result[node.id] = node.defaultValue !== undefined ? String(node.defaultValue) : "";
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
    case "FilePicker":
      result[node.id] = node.defaultValue ?? "";
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
    case "Input": {
      const rawVal = values[node.id];
      const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : "";
      const isFilled = strVal.length > 0;

      if (node.required && !isFilled) {
        errors[node.id] = `${node.label} is required.`;
        break;
      }

      if (!isFilled) {
        break;
      }

      const inputType = node.inputType ?? "text";

      if (inputType === "integer") {
        const intRegex = /^-?\d+$/;
        if (!intRegex.test(strVal)) {
          errors[node.id] = `${node.label} must be an integer.`;
          break;
        }
        const num = parseInt(strVal, 10);
        if (node.min !== undefined && num < node.min) {
          errors[node.id] = `${node.label} must be at least ${node.min}.`;
          break;
        }
        if (node.max !== undefined && num > node.max) {
          errors[node.id] = `${node.label} cannot be greater than ${node.max}.`;
          break;
        }
      } else if (inputType === "number") {
        const num = Number(strVal);
        if (isNaN(num)) {
          errors[node.id] = `${node.label} must be a valid number.`;
          break;
        }
        if (node.min !== undefined && num < node.min) {
          errors[node.id] = `${node.label} must be at least ${node.min}.`;
          break;
        }
        if (node.max !== undefined && num > node.max) {
          errors[node.id] = `${node.label} cannot be greater than ${node.max}.`;
          break;
        }
      } else {
        if (inputType === "email") {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(strVal)) {
            errors[node.id] = `${node.label} must be a valid email address.`;
            break;
          }
        } else if (inputType === "url") {
          try {
            new URL(strVal);
          } catch {
            errors[node.id] = `${node.label} must be a valid URL.`;
            break;
          }
        }

        const minLen = node.minLength ?? node.min;
        if (minLen !== undefined && strVal.length < minLen) {
          errors[node.id] = `${node.label} must be at least ${minLen} characters.`;
          break;
        }

        const maxLen = node.maxLength ?? node.max;
        if (maxLen !== undefined && strVal.length > maxLen) {
          errors[node.id] = `${node.label} cannot exceed ${maxLen} characters.`;
          break;
        }

        if (node.pattern) {
          try {
            const regex = new RegExp(node.pattern);
            if (!regex.test(strVal)) {
              errors[node.id] = `${node.label} format is invalid.`;
              break;
            }
          } catch {
            // ignore invalid regex pattern
          }
        }
      }
      break;
    }
    case "Select":
      if (node.required) {
        const val = values[node.id];
        if (!val || typeof val !== "string" || val.trim().length === 0) {
          errors[node.id] = `Please select an option for ${node.label}.`;
        }
      }
      break;
    case "MultiSelect": {
      const val = values[node.id];
      const count = Array.isArray(val) ? val.length : 0;
      if (node.required && count === 0) {
        errors[node.id] = `Please select at least one option for ${node.label}.`;
      } else if (node.min !== undefined && count < node.min) {
        errors[node.id] = `Please select at least ${node.min} options for ${node.label}.`;
      } else if (node.max !== undefined && count > node.max) {
        errors[node.id] = `You can select at most ${node.max} options for ${node.label}.`;
      }
      break;
    }
    case "Toggle":
      if (node.required) {
        const val = values[node.id];
        if (!val) {
          errors[node.id] = `${node.label} must be checked.`;
        }
      }
      break;
    case "FilePicker": {
      const val = values[node.id];
      const hasValue = typeof val === "string" && val.trim().length > 0;
      if (node.required && !hasValue) {
        errors[node.id] = `Please select a path for ${node.label}.`;
      } else if (hasValue && node.pickerType !== "folder") {
        const cleanExts = normalizeExtensions(node.extensions, node.extension);
        if (cleanExts && cleanExts.length > 0) {
          const valLower = val.trim().toLowerCase();
          const matches = cleanExts.some((ext) => valLower.endsWith("." + ext));
          if (!matches) {
            errors[node.id] = `${node.label} must be a file of type: ${cleanExts.map((e) => "." + e).join(", ")}`;
          }
        }
      }
      break;
    }
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

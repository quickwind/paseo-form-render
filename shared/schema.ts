import { z } from "zod";

// Basic field options
export const OptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type Option = z.infer<typeof OptionSchema>;

// Table column schema
export const TableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
});
export type TableColumn = z.infer<typeof TableColumnSchema>;

// Tone variants for Alert and Badge
export const ToneSchema = z.enum(["neutral", "info", "success", "warning", "danger"]);
export type Tone = z.infer<typeof ToneSchema>;

// Node base definition
export type WukongNode =
  | CardNode
  | StackNode
  | HeadingNode
  | TextNode
  | DividerNode
  | MetricNode
  | BadgeNode
  | AlertNode
  | ProgressNode
  | TableNode
  | InputNode
  | SelectNode
  | MultiSelectNode
  | ToggleNode
  | ButtonNode;

export interface CardNode {
  type: "Card";
  title?: string;
  description?: string;
  children: WukongNode[];
}

export interface StackNode {
  type: "Stack";
  direction?: "vertical" | "horizontal";
  children: WukongNode[];
}

export interface HeadingNode {
  type: "Heading";
  text: string;
}

export interface TextNode {
  type: "Text";
  text: string;
  muted?: boolean;
}

export interface DividerNode {
  type: "Divider";
}

export interface MetricNode {
  type: "Metric";
  label: string;
  value: string | number;
}

export interface BadgeNode {
  type: "Badge";
  text: string;
  tone?: Tone;
}

export interface AlertNode {
  type: "Alert";
  title?: string;
  text: string;
  tone?: Tone;
}

export interface ProgressNode {
  type: "Progress";
  label: string;
  value: number; // 0 - 100
}

export interface TableNode {
  type: "Table";
  columns: TableColumn[];
  rows: Record<string, string | number | boolean | null>[];
}

export interface InputNode {
  type: "Input";
  id: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  required?: boolean;
}

export interface SelectNode {
  type: "Select";
  id: string;
  label: string;
  options: Option[];
  defaultValue?: string;
  required?: boolean;
}

export interface MultiSelectNode {
  type: "MultiSelect";
  id: string;
  label: string;
  options: Option[];
  defaultValue?: string[];
  required?: boolean;
}

export interface ToggleNode {
  type: "Toggle";
  id: string;
  label: string;
  defaultValue?: boolean;
  required?: boolean;
}

export interface ButtonNode {
  type: "Button";
  label: string;
  variant?: "primary" | "secondary" | "danger";
  action: "submit" | "reset";
  message?: string; // Prompt/message returned to agent when submitted
}

// Recursive Zod Schema for validation
export const WukongNodeSchema: z.ZodType<WukongNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("Card"),
      title: z.string().optional(),
      description: z.string().optional(),
      children: z.array(WukongNodeSchema),
    }),
    z.object({
      type: z.literal("Stack"),
      direction: z.enum(["vertical", "horizontal"]).optional(),
      children: z.array(WukongNodeSchema),
    }),
    z.object({
      type: z.literal("Heading"),
      text: z.string(),
    }),
    z.object({
      type: z.literal("Text"),
      text: z.string(),
      muted: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("Divider"),
    }),
    z.object({
      type: z.literal("Metric"),
      label: z.string(),
      value: z.union([z.string(), z.number()]),
    }),
    z.object({
      type: z.literal("Badge"),
      text: z.string(),
      tone: ToneSchema.optional(),
    }),
    z.object({
      type: z.literal("Alert"),
      title: z.string().optional(),
      text: z.string(),
      tone: ToneSchema.optional(),
    }),
    z.object({
      type: z.literal("Progress"),
      label: z.string(),
      value: z.number().min(0).max(100),
    }),
    z.object({
      type: z.literal("Table"),
      columns: z.array(TableColumnSchema).min(1),
      rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
    }),
    z.object({
      type: z.literal("Input"),
      id: z.string().min(1),
      label: z.string(),
      placeholder: z.string().optional(),
      defaultValue: z.string().optional(),
      multiline: z.boolean().optional(),
      required: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("Select"),
      id: z.string().min(1),
      label: z.string(),
      options: z.array(OptionSchema).min(1),
      defaultValue: z.string().optional(),
      required: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("MultiSelect"),
      id: z.string().min(1),
      label: z.string(),
      options: z.array(OptionSchema).min(1),
      defaultValue: z.array(z.string()).optional(),
      required: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("Toggle"),
      id: z.string().min(1),
      label: z.string(),
      defaultValue: z.boolean().optional(),
      required: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("Button"),
      label: z.string(),
      variant: z.enum(["primary", "secondary", "danger"]).optional(),
      action: z.enum(["submit", "reset"]),
      message: z.string().optional(),
    }),
  ]),
);

export const WukongFormSchema = WukongNodeSchema;
export type WukongForm = WukongNode;

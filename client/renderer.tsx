import type { PluginHostProps } from "@getpaseo/plugin/client";
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Switch } from "react-native";
import {
  WukongNode,
  SelectNode,
  MultiSelectNode,
  Tone,
} from "../shared/schema";
import { extractInitialValues, validateForm, formatSubmissionMessage } from "../shared/form-helpers";

interface NodeRendererProps {
  node: WukongNode;
  values: Record<string, any>;
  errors: Record<string, string>;
  disabled: boolean;
  theme: PluginHostProps["theme"];
  onValueChange: (id: string, value: any) => void;
  onSubmit: (message?: string) => void;
  onReset: () => void;
}

function getToneColors(tone: Tone | undefined, theme: PluginHostProps["theme"]) {
  switch (tone) {
    case "success":
      return { bg: theme.colors.surface2, border: theme.colors.statusSuccess, text: theme.colors.statusSuccess };
    case "warning":
      return { bg: theme.colors.surface2, border: theme.colors.statusWarning, text: theme.colors.statusWarning };
    case "danger":
      return { bg: theme.colors.surface2, border: theme.colors.statusDanger, text: theme.colors.statusDanger };
    case "info":
      return { bg: theme.colors.surface2, border: theme.colors.accent, text: theme.colors.accent };
    case "neutral":
    default:
      return { bg: theme.colors.surface2, border: theme.colors.border, text: theme.colors.foregroundMuted };
  }
}

// Collapsible Dropdown Component for single Select
function DropdownSelect({
  node,
  value,
  error,
  disabled,
  theme,
  onChange,
}: {
  node: SelectNode;
  value: string;
  error?: string;
  disabled: boolean;
  theme: PluginHostProps["theme"];
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = node.options.find((opt) => opt.value === value);

  return (
    <View style={styles.fieldContainer}>
      <Text style={[styles.fieldLabel, { color: theme.colors.foreground }]}>
        {node.label}
        {node.required && <Text style={{ color: theme.colors.statusDanger }}> *</Text>}
      </Text>
      
      {/* Trigger Box */}
      <Pressable
        disabled={disabled}
        onPress={() => setIsOpen((prev) => !prev)}
        style={[
          styles.dropdownTrigger,
          {
            backgroundColor: theme.colors.surface2,
            borderColor: error ? theme.colors.statusDanger : isOpen ? theme.colors.accent : theme.colors.border,
          },
          disabled && { opacity: 0.6 },
        ]}
      >
        <Text
          style={[
            styles.dropdownTriggerText,
            { color: selectedOption ? theme.colors.foreground : theme.colors.foregroundMuted },
          ]}
        >
          {selectedOption ? selectedOption.label : "Select an option..."}
        </Text>
        <Text style={[styles.dropdownChevron, { color: theme.colors.foregroundMuted }]}>
          {isOpen ? "▲" : "▼"}
        </Text>
      </Pressable>

      {/* Menu items */}
      {isOpen && (
        <View
          style={[
            styles.dropdownMenu,
            {
              backgroundColor: theme.colors.surface1,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {node.options.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[
                  styles.dropdownMenuItem,
                  { borderBottomColor: theme.colors.border },
                  isSelected && { backgroundColor: theme.colors.surface2 },
                ]}
                onPress={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownMenuItemText,
                    { color: isSelected ? theme.colors.accent : theme.colors.foreground },
                    isSelected && { fontWeight: "600" },
                  ]}
                >
                  {opt.label}
                </Text>
                {isSelected && (
                  <Text style={[styles.dropdownCheckmark, { color: theme.colors.accent }]}>✓</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {error && <Text style={[styles.errorMessage, { color: theme.colors.statusDanger }]}>{error}</Text>}
    </View>
  );
}

// Collapsible Dropdown Component for MultiSelect
function DropdownMultiSelect({
  node,
  value,
  error,
  disabled,
  theme,
  onChange,
}: {
  node: MultiSelectNode;
  value: string[];
  error?: string;
  disabled: boolean;
  theme: PluginHostProps["theme"];
  onChange: (val: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOptions = node.options.filter((opt) => value.includes(opt.value));

  return (
    <View style={styles.fieldContainer}>
      <Text style={[styles.fieldLabel, { color: theme.colors.foreground }]}>
        {node.label}
        {node.required && <Text style={{ color: theme.colors.statusDanger }}> *</Text>}
      </Text>

      {/* Trigger Box */}
      <Pressable
        disabled={disabled}
        onPress={() => setIsOpen((prev) => !prev)}
        style={[
          styles.dropdownTrigger,
          {
            backgroundColor: theme.colors.surface2,
            borderColor: error ? theme.colors.statusDanger : isOpen ? theme.colors.accent : theme.colors.border,
          },
          disabled && { opacity: 0.6 },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.dropdownTriggerText,
            { color: selectedOptions.length > 0 ? theme.colors.foreground : theme.colors.foregroundMuted },
          ]}
        >
          {selectedOptions.length > 0
            ? selectedOptions.map((o) => o.label).join(", ")
            : "Select options..."}
        </Text>
        <Text style={[styles.dropdownChevron, { color: theme.colors.foregroundMuted }]}>
          {isOpen ? "▲" : "▼"}
        </Text>
      </Pressable>

      {/* Menu items */}
      {isOpen && (
        <View
          style={[
            styles.dropdownMenu,
            {
              backgroundColor: theme.colors.surface1,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {node.options.map((opt) => {
            const isSelected = value.includes(opt.value);
            return (
              <Pressable
                key={opt.value}
                style={[
                  styles.dropdownMenuItem,
                  { borderBottomColor: theme.colors.border },
                  isSelected && { backgroundColor: theme.colors.surface2 },
                ]}
                onPress={() => {
                  const next = isSelected
                    ? value.filter((v) => v !== opt.value)
                    : [...value, opt.value];
                  onChange(next);
                }}
              >
                <Text
                  style={[
                    styles.dropdownMenuItemText,
                    { color: isSelected ? theme.colors.accent : theme.colors.foreground },
                    isSelected && { fontWeight: "600" },
                  ]}
                >
                  {opt.label}
                </Text>
                {isSelected && (
                  <Text style={[styles.dropdownCheckmark, { color: theme.colors.accent }]}>✓</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {error && <Text style={[styles.errorMessage, { color: theme.colors.statusDanger }]}>{error}</Text>}
    </View>
  );
}

export const NodeRenderer: React.FC<NodeRendererProps> = ({
  node,
  values,
  errors,
  disabled,
  theme,
  onValueChange,
  onSubmit,
  onReset,
}) => {
  switch (node.type) {
    case "Card":
      return (
        <View style={[styles.card, { backgroundColor: theme.colors.surface1, borderColor: theme.colors.border }]}>
          {node.title && <Text style={[styles.cardTitle, { color: theme.colors.foreground }]}>{node.title}</Text>}
          {node.description && <Text style={[styles.cardDescription, { color: theme.colors.foregroundMuted }]}>{node.description}</Text>}
          <View style={styles.cardBody}>
            {node.children.map((child, index) => (
              <NodeRenderer
                key={index}
                node={child}
                values={values}
                errors={errors}
                disabled={disabled}
                theme={theme}
                onValueChange={onValueChange}
                onSubmit={onSubmit}
                onReset={onReset}
              />
            ))}
          </View>
        </View>
      );

    case "Stack":
      return (
        <View style={[styles.stack, node.direction === "horizontal" ? styles.stackRow : styles.stackColumn]}>
          {node.children.map((child, index) => (
            <NodeRenderer
              key={index}
              node={child}
              values={values}
              errors={errors}
              disabled={disabled}
              theme={theme}
              onValueChange={onValueChange}
              onSubmit={onSubmit}
              onReset={onReset}
            />
          ))}
        </View>
      );

    case "Heading":
      return <Text style={[styles.heading, { color: theme.colors.foreground }]}>{node.text}</Text>;

    case "Text":
      return (
        <Text
          style={[
            styles.text,
            { color: node.muted ? theme.colors.foregroundMuted : theme.colors.foreground },
          ]}
        >
          {node.text}
        </Text>
      );

    case "Divider":
      return <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />;

    case "Metric":
      return (
        <View style={[styles.metricCard, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.border }]}>
          <Text style={[styles.metricLabel, { color: theme.colors.foregroundMuted }]}>{node.label}</Text>
          <Text style={[styles.metricValue, { color: theme.colors.foreground }]}>{String(node.value)}</Text>
        </View>
      );

    case "Badge": {
      const c = getToneColors(node.tone, theme);
      return (
        <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
          <Text style={[styles.badgeText, { color: c.text }]}>{node.text}</Text>
        </View>
      );
    }

    case "Alert": {
      const c = getToneColors(node.tone, theme);
      return (
        <View style={[styles.alert, { backgroundColor: c.bg, borderColor: c.border }]}>
          {node.title && <Text style={[styles.alertTitle, { color: c.text }]}>{node.title}</Text>}
          <Text style={[styles.alertText, { color: c.text }]}>{node.text}</Text>
        </View>
      );
    }

    case "Progress":
      return (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: theme.colors.foreground }]}>{node.label}</Text>
            <Text style={[styles.progressValue, { color: theme.colors.foreground }]}>{node.value}%</Text>
          </View>
          <View style={[styles.progressBarTrack, { backgroundColor: theme.colors.surface2 }]}>
            <View style={[styles.progressBarFill, { backgroundColor: theme.colors.accent, width: `${Math.min(100, Math.max(0, node.value))}%` }]} />
          </View>
        </View>
      );

    case "Table":
      return (
        <View style={[styles.table, { borderColor: theme.colors.border }]}>
          <View style={[styles.tableHeaderRow, { backgroundColor: theme.colors.surface2, borderBottomColor: theme.colors.border }]}>
            {node.columns.map((col) => (
              <Text key={col.key} style={[styles.tableHeaderCell, { color: theme.colors.foregroundMuted }]}>
                {col.label}
              </Text>
            ))}
          </View>
          {node.rows.map((row, rIdx) => (
            <View key={rIdx} style={[styles.tableRow, { borderBottomColor: theme.colors.border }]}>
              {node.columns.map((col) => (
                <Text key={col.key} style={[styles.tableCell, { color: theme.colors.foreground }]}>
                  {row[col.key] !== null && row[col.key] !== undefined ? String(row[col.key]) : "-"}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );

    case "Input": {
      const error = errors[node.id];
      return (
        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: theme.colors.foreground }]}>
            {node.label}
            {node.required && <Text style={{ color: theme.colors.statusDanger }}> *</Text>}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surface2,
                borderColor: error ? theme.colors.statusDanger : theme.colors.border,
                color: theme.colors.foreground,
              },
              node.multiline && styles.inputMultiline,
              disabled && { opacity: 0.6 },
            ]}
            placeholder={node.placeholder}
            placeholderTextColor={theme.colors.foregroundMuted}
            value={values[node.id] ?? ""}
            onChangeText={(txt) => onValueChange(node.id, txt)}
            editable={!disabled}
            multiline={node.multiline}
          />
          {error && <Text style={[styles.errorMessage, { color: theme.colors.statusDanger }]}>{error}</Text>}
        </View>
      );
    }

    case "Select": {
      return (
        <DropdownSelect
          node={node}
          value={values[node.id] ?? ""}
          error={errors[node.id]}
          disabled={disabled}
          theme={theme}
          onChange={(val) => onValueChange(node.id, val)}
        />
      );
    }

    case "MultiSelect": {
      return (
        <DropdownMultiSelect
          node={node}
          value={Array.isArray(values[node.id]) ? values[node.id] : []}
          error={errors[node.id]}
          disabled={disabled}
          theme={theme}
          onChange={(val) => onValueChange(node.id, val)}
        />
      );
    }

    case "Toggle": {
      const error = errors[node.id];
      const isChecked = Boolean(values[node.id]);
      return (
        <View style={styles.fieldContainer}>
          <View style={styles.toggleRow}>
            <Text style={[styles.fieldLabel, { color: theme.colors.foreground }]}>
              {node.label}
              {node.required && <Text style={{ color: theme.colors.statusDanger }}> *</Text>}
            </Text>
            <Switch
              value={isChecked}
              onValueChange={(val) => onValueChange(node.id, val)}
              disabled={disabled}
            />
          </View>
          {error && <Text style={[styles.errorMessage, { color: theme.colors.statusDanger }]}>{error}</Text>}
        </View>
      );
    }

    case "Button": {
      const isPrimary = node.variant !== "secondary" && node.variant !== "danger";
      const isDanger = node.variant === "danger";
      return (
        <Pressable
          disabled={disabled}
          style={[
            styles.button,
            isPrimary && { backgroundColor: theme.colors.accent },
            node.variant === "secondary" && {
              backgroundColor: theme.colors.surface2,
              borderWidth: 1,
              borderColor: theme.colors.border,
            },
            isDanger && { backgroundColor: theme.colors.statusDanger },
            disabled && { opacity: 0.5 },
          ]}
          onPress={() => {
            if (node.action === "submit") {
              onSubmit(node.message);
            } else {
              onReset();
            }
          }}
        >
          <Text
            style={[
              styles.buttonText,
              {
                color: node.variant === "secondary" ? theme.colors.foreground : theme.colors.accentForeground,
              },
            ]}
          >
            {node.label}
          </Text>
        </Pressable>
      );
    }

    default:
      return null;
  }
};

export interface WukongFormViewProps {
  form: WukongNode;
  theme: PluginHostProps["theme"];
  onSubmit: (submissionFormattedText: string) => Promise<void> | void;
}

export const WukongFormView: React.FC<WukongFormViewProps> = ({ form, theme, onSubmit }) => {
  const [values, setValues] = useState<Record<string, any>>(() => extractInitialValues(form));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted">("idle");

  const handleValueChange = (id: string, val: any) => {
    setValues((prev) => ({ ...prev, [id]: val }));
    if (errors[id]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleReset = () => {
    setValues(extractInitialValues(form));
    setErrors({});
  };

  const handleSubmit = async (message?: string) => {
    const errs = validateForm(form, values);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setStatus("submitting");
    try {
      const formatted = formatSubmissionMessage(message, form, values);
      await onSubmit(formatted);
      setStatus("submitted");
    } catch (e) {
      setStatus("idle");
    }
  };

  return (
    <View style={styles.formContainer}>
      <NodeRenderer
        node={form}
        values={values}
        errors={errors}
        disabled={status !== "idle"}
        theme={theme}
        onValueChange={handleValueChange}
        onSubmit={handleSubmit}
        onReset={handleReset}
      />
      {status === "submitted" && (
        <View style={[styles.submittedBanner, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.statusSuccess, borderWidth: 1 }]}>
          <Text style={[styles.submittedText, { color: theme.colors.statusSuccess }]}>✓ Form Submitted</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  formContainer: {
    marginVertical: 8,
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  cardDescription: {
    fontSize: 13,
  },
  cardBody: {
    gap: 12,
  },
  stack: {
    gap: 8,
  },
  stackRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  stackColumn: {
    flexDirection: "column",
  },
  heading: {
    fontSize: 15,
    fontWeight: "600",
    marginVertical: 4,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    marginVertical: 6,
  },
  metricCard: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
    minWidth: 100,
  },
  metricLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  badge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "500",
  },
  alert: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    gap: 4,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  alertText: {
    fontSize: 13,
  },
  progressContainer: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressLabel: {
    fontSize: 13,
  },
  progressValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  table: {
    borderWidth: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tableHeaderCell: {
    flex: 1,
    padding: 8,
    fontSize: 12,
    fontWeight: "600",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tableCell: {
    flex: 1,
    padding: 8,
    fontSize: 12,
  },
  fieldContainer: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownTriggerText: {
    fontSize: 14,
    flex: 1,
  },
  dropdownChevron: {
    fontSize: 10,
    marginLeft: 8,
  },
  dropdownMenu: {
    borderWidth: 1,
    borderRadius: 6,
    marginTop: 2,
    overflow: "hidden",
  },
  dropdownMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  dropdownMenuItemText: {
    fontSize: 14,
  },
  dropdownCheckmark: {
    fontSize: 14,
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  button: {
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  errorMessage: {
    fontSize: 12,
  },
  submittedBanner: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  submittedText: {
    fontSize: 13,
    fontWeight: "600",
  },
});

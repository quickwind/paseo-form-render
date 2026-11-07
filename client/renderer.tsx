import type { PluginHostProps } from "@getpaseo/plugin/client";
import { useRpc, useTranslation } from "@getpaseo/plugin/client";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Switch, ScrollView, Platform, Modal, Dimensions } from "react-native";
import {
  PfrNode,
  SelectNode,
  MultiSelectNode,
  FilePickerNode,
  ChartNode,
  CodeNode,
  DetailsNode,
  SegmentedBarPart,
  StepStatus,
  TabsNode,
  Tone,
  normalizeExtensions,
} from "../shared/schema";
import { collectFieldIds, extractInitialValues, validateForm, formatSubmissionMessage } from "../shared/form-helpers";
import { barAxis, barRect, formatCompact, labelStride, yPosition } from "../shared/chart-math";
import { copyToClipboard } from "./clipboard";
import { HostMarkdown } from "./host-markdown";
import { messages } from "./messages";
import { ProjectFileModal } from "./project-file-modal";

const MENU_WIDTH = 220;

interface OpenDropdownMenu {
  id: string;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  options: Array<{ label: string; value: string; description?: string }>;
  isMulti: boolean;
}

interface DropdownMenuContextValue {
  openMenuId: string | null;
  toggleMenu: (
    id: string,
    buttonRef: React.RefObject<View | null>,
    options: Array<{ label: string; value: string; description?: string }>,
    isMulti: boolean,
  ) => void;
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null);

interface NodeRendererProps {
  node: PfrNode;
  values: Record<string, any>;
  errors: Record<string, string>;
  disabled: boolean;
  theme: PluginHostProps["theme"];
  agentId?: string;
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

const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function stepColor(status: StepStatus | undefined, theme: PluginHostProps["theme"]) {
  switch (status) {
    case "done":
      return theme.colors.statusSuccess;
    case "current":
      return theme.colors.accent;
    case "blocked":
      return theme.colors.statusDanger;
    default:
      return theme.colors.foregroundMuted;
  }
}

function stepMarker(status: StepStatus | undefined, index: number): string {
  if (status === "done") return "✓";
  if (status === "blocked") return "!";
  return String(index + 1);
}

const CHART_PLOT_HEIGHT = 160;
const CHART_AXIS_WIDTH = 40;
const CHART_COLUMN_WIDTH = 36; // per category once a chart has too many to fit: it scrolls sideways
const CHART_SCROLL_FROM = 10;

// A vertical bar chart built from Views (no SVG is available to plugins): a value axis with grid
// lines on the left, one column group per label, series side by side, labels underneath. Tapping a
// column group prints its values above the plot.
function ChartBlock({ node, theme }: { node: ChartNode; theme: PluginHostProps["theme"] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const labels = node.labels || [];
  const series = node.series || [];
  const unit = node.unit ? ` ${node.unit}` : "";
  const axis = barAxis(series.flatMap((one) => one.values));
  const stride = labelStride(labels.length);
  const scrollable = labels.length > CHART_SCROLL_FROM;
  const colorOf = (index: number) => segmentColor({ label: "", value: 0, tone: series[index]?.tone }, index, theme);
  const zeroY = yPosition(0, axis, CHART_PLOT_HEIGHT);

  const plot = (
    <View style={scrollable ? { width: labels.length * CHART_COLUMN_WIDTH } : styles.chartFill}>
      <View style={styles.chartPlot}>
        {axis.ticks.map((tick) => (
          <View
            key={tick}
            style={[
              styles.chartGridLine,
              { top: yPosition(tick, axis, CHART_PLOT_HEIGHT), backgroundColor: theme.colors.border },
            ]}
          />
        ))}
        <View style={[styles.chartGridLine, { top: zeroY, backgroundColor: theme.colors.foregroundMuted }]} />
        <View style={styles.chartColumns}>
          {labels.map((label, labelIndex) => (
            <Pressable
              key={labelIndex}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${series.map((one) => `${one.name} ${formatCompact(one.values[labelIndex] ?? 0)}${unit}`).join(", ")}`}
              onPress={() => setSelected(selected === labelIndex ? null : labelIndex)}
              style={[
                styles.chartColumn,
                selected === labelIndex ? { backgroundColor: theme.colors.surface2 } : null,
              ]}
            >
              {series.map((one, seriesIndex) => {
                const rect = barRect(one.values[labelIndex] ?? 0, axis, CHART_PLOT_HEIGHT);
                return (
                  <View key={seriesIndex} style={styles.chartBarSlot}>
                    <View
                      style={[
                        styles.chartBar,
                        { top: rect.top, height: rect.height, backgroundColor: colorOf(seriesIndex) },
                      ]}
                    />
                  </View>
                );
              })}
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.chartLabels}>
        {labels.map((label, labelIndex) => (
          <View key={labelIndex} style={styles.chartLabelBox}>
            <Text numberOfLines={1} style={[styles.chartLabel, { color: theme.colors.foregroundMuted }]}>
              {labelIndex % stride === 0 ? label : ""}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.chart}>
      {node.title ? <Text style={[styles.chartTitle, { color: theme.colors.foreground }]}>{node.title}</Text> : null}
      {series.length > 1 ? (
        <View style={styles.segLegend}>
          {series.map((one, index) => (
            <View key={index} style={styles.segLegendItem}>
              <View style={[styles.segDot, { backgroundColor: colorOf(index) }]} />
              <Text style={[styles.segLegendText, { color: theme.colors.foreground }]}>{one.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {selected !== null ? (
        <Text style={[styles.chartReadout, { color: theme.colors.foreground }]}>
          {labels[selected]}:{" "}
          {series.map((one) => `${series.length > 1 ? `${one.name} ` : ""}${formatCompact(one.values[selected] ?? 0)}${unit}`).join(" · ")}
        </Text>
      ) : null}
      <View style={styles.chartBody}>
        <View style={styles.chartAxis}>
          {axis.ticks.map((tick) => (
            <Text
              key={tick}
              style={[
                styles.chartTick,
                { color: theme.colors.foregroundMuted, top: yPosition(tick, axis, CHART_PLOT_HEIGHT) - 7 },
              ]}
            >
              {formatCompact(tick)}
            </Text>
          ))}
        </View>
        {scrollable ? (
          <ScrollView horizontal style={styles.chartFill}>
            {plot}
          </ScrollView>
        ) : (
          plot
        )}
      </View>
    </View>
  );
}

const COPY_FEEDBACK_MS = 1500;

// A code block with a header bar (language on the left, copy button on the right). The header sits
// outside the horizontal ScrollView so the button stays put while long lines scroll.
function CodeBlock({ node, theme }: { node: CodeNode; theme: PluginHostProps["theme"] }) {
  const { t } = useTranslation(messages);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onCopy = async () => {
    const ok = await copyToClipboard(node.code);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
  };
  const label = state === "copied" ? t("code.copied") : state === "failed" ? t("code.copyFailed") : t("code.copy");
  return (
    <View style={[styles.code, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.border }]}>
      <View style={[styles.codeHeader, { borderBottomColor: theme.colors.border }]}>
        <Text style={[styles.codeLanguage, { color: theme.colors.foregroundMuted }]}>{node.language ?? ""}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("code.copyLabel")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onCopy}
        >
          {({ pressed }) => (
            <Text
              style={[
                styles.codeCopy,
                {
                  color:
                    state === "failed"
                      ? theme.colors.statusDanger
                      : pressed || state === "copied"
                        ? theme.colors.accent
                        : theme.colors.foregroundMuted,
                },
              ]}
            >
              {label}
            </Text>
          )}
        </Pressable>
      </View>
      <ScrollView horizontal>
        <View style={styles.codeBody}>
          <Text selectable style={[styles.codeText, { color: theme.colors.foreground, fontFamily: MONO_FONT }]}>
            {node.code}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/** Segment color: the part's tone, or (no tone / neutral) the next color of a fixed palette. */
function segmentColor(part: SegmentedBarPart, index: number, theme: PluginHostProps["theme"]) {
  if (part.tone && part.tone !== "neutral") return getToneColors(part.tone, theme).text;
  const palette = [
    theme.colors.accent,
    theme.colors.statusWarning,
    theme.colors.foregroundMuted,
    theme.colors.statusDanger,
    theme.colors.statusSuccess,
  ];
  return palette[index % palette.length];
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

// Tabs show one group at a time. Fields of hidden tabs stay in the form state; when a submit fails
// on a field in another tab, that tab is shown.
function TabsBlock(props: NodeRendererProps & { node: TabsNode }) {
  const { node, errors, theme } = props;
  const tabs = node.tabs || [];
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, Math.max(0, tabs.length - 1));
  const tabHasError = (index: number) =>
    (tabs[index]?.children || []).some((child) => collectFieldIds(child).some((id) => !!errors[id]));
  useEffect(() => {
    if (tabHasError(active)) return;
    const first = tabs.findIndex((_, index) => tabHasError(index));
    if (first !== -1) setSelected(first);
    // Only when the errors change: the user may browse other tabs afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors]);
  return (
    <View style={styles.tabs}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={[styles.tabBar, { borderBottomColor: theme.colors.border }]}>
          {tabs.map((tab, index) => {
            const isActive = index === active;
            return (
              <Pressable
                key={index}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                onPress={() => setSelected(index)}
                style={[styles.tabButton, { backgroundColor: isActive ? theme.colors.surface2 : "transparent" }]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: tabHasError(index)
                        ? theme.colors.statusDanger
                        : isActive
                          ? theme.colors.foreground
                          : theme.colors.foregroundMuted,
                      fontWeight: isActive ? "600" : "400",
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.tabBody}>
        {(tabs[active]?.children || []).map((child, index) => (
          <NodeRenderer key={`${active}:${index}`} {...props} node={child} />
        ))}
      </View>
    </View>
  );
}

// Collapsible section. Collapsing only unmounts the view: values live in the form state, so the
// fields inside are still validated and submitted. A section holding an invalid field opens itself.
function DetailsBlock(props: NodeRendererProps & { node: DetailsNode }) {
  const { node, errors, theme } = props;
  const [open, setOpen] = useState(node.open === true);
  const hasError = collectFieldIds(node).some((id) => !!errors[id]);
  const expanded = open || hasError;
  return (
    <View style={[styles.details, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setOpen(!expanded)}
        style={styles.detailsHeader}
      >
        <View style={styles.detailsTitleBox}>
          <Text style={[styles.detailsTitle, { color: theme.colors.foreground }]}>{node.title}</Text>
        </View>
        <Text style={[styles.detailsChevron, { color: theme.colors.foregroundMuted }]}>{expanded ? "▾" : "▸"}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.detailsBody}>
          {(node.children || []).map((child, index) => (
            <NodeRenderer key={index} {...props} node={child} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Collapsible Dropdown Component for single Select
function DropdownSelect({
  node,
  value,
  error,
  disabled,
  theme,
}: {
  node: SelectNode;
  value: string;
  error?: string;
  disabled: boolean;
  theme: PluginHostProps["theme"];
  onChange: (val: string) => void;
}) {
  const menuCtx = useContext(DropdownMenuContext);
  const buttonRef = useRef<View>(null);
  const isOpen = menuCtx?.openMenuId === node.id;
  const selectedOption = node.options.find((opt) => opt.value === value);
  const { t } = useTranslation(messages);

  return (
    <View style={styles.fieldContainer}>
      <Text style={[styles.fieldLabel, { color: theme.colors.foreground }]}>
        {node.label}
        {node.required && <Text style={{ color: theme.colors.statusDanger }}> *</Text>}
      </Text>

      {/* Trigger Box */}
      <View ref={buttonRef} collapsable={false}>
        <Pressable
          disabled={disabled}
          onPress={() => menuCtx?.toggleMenu(node.id, buttonRef, node.options, false)}
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
            {selectedOption ? selectedOption.label : t("dropdown.placeholder")}
          </Text>
          <Text style={[styles.dropdownChevron, { color: theme.colors.foregroundMuted }]}>
            {isOpen ? "▲" : "▼"}
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={[styles.errorMessage, { color: theme.colors.statusDanger }]}>{error}</Text> : null}
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
}: {
  node: MultiSelectNode;
  value: string[];
  error?: string;
  disabled: boolean;
  theme: PluginHostProps["theme"];
  onChange: (val: string[]) => void;
}) {
  const menuCtx = useContext(DropdownMenuContext);
  const buttonRef = useRef<View>(null);
  const isOpen = menuCtx?.openMenuId === node.id;
  const selectedOptions = node.options.filter((opt) => value.includes(opt.value));
  const { t } = useTranslation(messages);

  return (
    <View style={styles.fieldContainer}>
      <Text style={[styles.fieldLabel, { color: theme.colors.foreground }]}>
        {node.label}
        {node.required && <Text style={{ color: theme.colors.statusDanger }}> *</Text>}
      </Text>

      {/* Trigger Box */}
      <View ref={buttonRef} collapsable={false}>
        <Pressable
          disabled={disabled}
          onPress={() => menuCtx?.toggleMenu(node.id, buttonRef, node.options, true)}
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
              : (node.placeholder ?? t("dropdown.multiPlaceholder"))}
          </Text>
          <Text style={[styles.dropdownChevron, { color: theme.colors.foregroundMuted }]}>
            {isOpen ? "▲" : "▼"}
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={[styles.errorMessage, { color: theme.colors.statusDanger }]}>{error}</Text> : null}
    </View>
  );
}

function FilePickerField({
  node,
  value,
  error,
  disabled,
  theme,
  agentId,
  onChange,
}: {
  node: FilePickerNode;
  value: string;
  error?: string;
  disabled: boolean;
  theme: PluginHostProps["theme"];
  agentId?: string;
  onChange: (val: string) => void;
}) {
  const [modalVisible, setModalVisible] = useState(false);
  const { t } = useTranslation(messages);
  const colors = theme.colors;
  const cleanExts = normalizeExtensions(node.extensions, node.extension);

  return (
    <View style={styles.fieldContainer}>
      <View style={styles.fieldLabelRow}>
        <View style={styles.fieldLabelGrow}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
            {node.label}
            {node.required && <Text style={{ color: colors.statusDanger }}> *</Text>}
          </Text>
        </View>
        {cleanExts && cleanExts.length > 0 && (
          <View style={[styles.extBadge, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <Text style={[styles.extBadgeText, { color: colors.accent }]}>
              {cleanExts.map((e) => `.${e}`).join(", ")}
            </Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.pickerRow,
          {
            backgroundColor: colors.surface2,
            borderColor: error ? colors.statusDanger : colors.border,
          },
          disabled && { opacity: 0.6 },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={
            node.placeholder ||
            (node.pickerType === "folder" ? t("file.folderPlaceholder") : t("file.filePlaceholder"))
          }
          placeholderTextColor={colors.foregroundMuted}
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.pickerTextInput, { color: colors.foreground }]}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {value && !disabled ? (
            <Pressable onPress={() => onChange("")} style={styles.pickerClearBtn}>
              <Text style={{ color: colors.foregroundMuted, fontSize: 13 }}>✕</Text>
            </Pressable>
          ) : null}

          <Pressable
            disabled={disabled}
            onPress={() => setModalVisible(true)}
            style={[styles.pickerBrowseBtn, { backgroundColor: colors.surface1, borderColor: colors.border }]}
          >
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "500" }}>{t("file.browse")}</Text>
          </Pressable>
        </View>
      </View>

      {value ? (
        <View style={[styles.pathInspector, { backgroundColor: colors.surface1, borderColor: colors.border }]}>
          <Text style={[styles.pathInspectorLabel, { color: colors.foregroundMuted }]}>{t("file.fullPath")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={true}
            contentContainerStyle={styles.pathInspectorScrollContent}
            style={styles.pathInspectorScroll}
          >
            <Text style={[styles.pathInspectorText, { color: colors.foreground }]}>
              {value}
            </Text>
          </ScrollView>
        </View>
      ) : null}

      {error && <Text style={[styles.errorMessage, { color: colors.statusDanger }]}>{error}</Text>}

      <ProjectFileModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSelect={(path) => {
          onChange(path);
          setModalVisible(false);
        }}
        initialPath={value}
        agentId={agentId}
        pickerType={node.pickerType}
        extensions={node.extensions}
        extension={node.extension}
        theme={theme}
      />
    </View>
  );
}

export const NodeRenderer: React.FC<NodeRendererProps> = ({
  node,
  values,
  errors,
  disabled,
  theme,
  agentId,
  onValueChange,
  onSubmit,
  onReset,
}) => {
  switch (node.type) {
    case "Card":
      return (
        <View style={[styles.card, { backgroundColor: theme.colors.surface1, borderColor: theme.colors.border }]}>
          {node.title ? <Text style={[styles.cardTitle, { color: theme.colors.foreground }]}>{node.title}</Text> : null}
          {node.description ? <Text style={[styles.cardDescription, { color: theme.colors.foregroundMuted }]}>{node.description}</Text> : null}
          <View style={styles.cardBody}>
            {(node.children || []).map((child, index) => (
              <NodeRenderer
                key={index}
                node={child}
                values={values}
                errors={errors}
                disabled={disabled}
                theme={theme}
                agentId={agentId}
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
          {(node.children || []).map((child, index) => (
            <NodeRenderer
              key={index}
              node={child}
              values={values}
              errors={errors}
              disabled={disabled}
              theme={theme}
              agentId={agentId}
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

    case "Chart":
      return <ChartBlock node={node} theme={theme} />;

    case "Markdown":
      return (
        <View style={styles.markdown}>
          <HostMarkdown text={node.text} theme={theme} />
        </View>
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
          {node.title ? <Text style={[styles.alertTitle, { color: c.text }]}>{node.title}</Text> : null}
          <Text style={[styles.alertText, { color: c.text }]}>{node.text}</Text>
        </View>
      );
    }

    case "Progress":
      return (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <View style={styles.progressHeaderLabel}>
              <Text style={[styles.progressLabel, { color: theme.colors.foreground }]}>{node.label}</Text>
            </View>
            <Text style={[styles.progressValue, { color: theme.colors.foreground }]}>{node.value}%</Text>
          </View>
          <View style={[styles.progressBarTrack, { backgroundColor: theme.colors.surface2 }]}>
            <View style={[styles.progressBarFill, { backgroundColor: theme.colors.accent, width: `${Math.min(100, Math.max(0, node.value))}%` }]} />
          </View>
        </View>
      );

    case "Table": {
      const columns = node.columns || [];
      const rows = node.rows || [];
      return (
        <View style={[styles.table, { borderColor: theme.colors.border }]}>
          <View style={[styles.tableHeaderRow, { backgroundColor: theme.colors.surface2, borderBottomColor: theme.colors.border }]}>
            {columns.map((col) => (
              <View key={col.key} style={styles.tableCellContainer}>
                <Text style={[styles.tableHeaderCell, { color: theme.colors.foregroundMuted }]}>
                  {col.label}
                </Text>
              </View>
            ))}
          </View>
          {rows.map((row, rIdx) => (
            <View key={rIdx} style={[styles.tableRow, { borderBottomColor: theme.colors.border }]}>
              {columns.map((col) => (
                <View key={col.key} style={styles.tableCellContainer}>
                  <Text style={[styles.tableCell, { color: theme.colors.foreground }]}>
                    {row[col.key] !== null && row[col.key] !== undefined ? String(row[col.key]) : "-"}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    }

    case "Input": {
      const error = errors[node.id];
      const inputType = node.inputType ?? "text";
      const isNumeric = inputType === "number" || inputType === "integer";
      const isEmail = inputType === "email";
      const isPassword = inputType === "password";
      const maxLen = node.maxLength ?? (!isNumeric ? node.max : undefined);

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
            value={values[node.id] !== undefined ? String(values[node.id]) : ""}
            onChangeText={(txt) => onValueChange(node.id, txt)}
            editable={!disabled}
            multiline={node.multiline}
            numberOfLines={node.multiline ? 3 : 1}
            keyboardType={isNumeric ? "numeric" : isEmail ? "email-address" : "default"}
            autoCapitalize={isEmail || isPassword ? "none" : undefined}
            autoCorrect={!isEmail && !isPassword}
            secureTextEntry={isPassword}
            maxLength={maxLen}
          />
          {error ? <Text style={[styles.errorMessage, { color: theme.colors.statusDanger }]}>{error}</Text> : null}
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
            <View style={styles.toggleLabel}>
              <Text style={[styles.fieldLabel, { color: theme.colors.foreground }]}>
                {node.label}
                {node.required && <Text style={{ color: theme.colors.statusDanger }}> *</Text>}
              </Text>
            </View>
            <Switch
              value={isChecked}
              onValueChange={(val) => onValueChange(node.id, val)}
              disabled={disabled}
              trackColor={{ false: theme.colors.surface2, true: theme.colors.accent }}
              thumbColor={Platform.select({
                android: isChecked ? theme.colors.accentForeground : theme.colors.foregroundMuted,
                default: undefined,
              })}
              ios_backgroundColor={theme.colors.surface2}
            />
          </View>
          {error ? <Text style={[styles.errorMessage, { color: theme.colors.statusDanger }]}>{error}</Text> : null}
        </View>
      );
    }

    case "Rating": {
      const error = errors[node.id];
      const max = node.max ?? 5;
      const current = typeof values[node.id] === "number" ? (values[node.id] as number) : 0;
      return (
        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: theme.colors.foreground }]}>
            {node.label}
            {node.required && <Text style={{ color: theme.colors.statusDanger }}> *</Text>}
          </Text>
          <View style={styles.ratingRow}>
            {Array.from({ length: max }, (_, index) => {
              const star = index + 1;
              return (
                <Pressable
                  key={star}
                  accessibilityRole="button"
                  accessibilityLabel={`${star}/${max}`}
                  accessibilityState={{ selected: star === current }}
                  disabled={disabled}
                  hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                  onPress={() => onValueChange(node.id, star === current ? null : star)}
                >
                  <Text style={[styles.ratingStar, { color: star <= current ? theme.colors.accent : theme.colors.border }]}>★</Text>
                </Pressable>
              );
            })}
          </View>
          {error ? <Text style={[styles.errorMessage, { color: theme.colors.statusDanger }]}>{error}</Text> : null}
        </View>
      );
    }

    case "Sparkline": {
      const values = node.values || [];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min;
      const color = getToneColors(node.tone === undefined || node.tone === "neutral" ? "info" : node.tone, theme).text;
      return (
        <View style={styles.sparkRow}>
          {node.label ? <Text style={[styles.sparkLabel, { color: theme.colors.foregroundMuted }]}>{node.label}</Text> : null}
          <View style={styles.sparkBars}>
            {values.map((value, index) => (
              <View
                key={index}
                style={[
                  styles.sparkBar,
                  { backgroundColor: color, height: span > 0 ? 3 + Math.round(((value - min) / span) * 21) : 12 },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.sparkValue, { color: theme.colors.foregroundMuted }]}>
            {formatNumber(values[values.length - 1] ?? 0)}
          </Text>
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

    case "Code":
      return <CodeBlock node={node} theme={theme} />;

    case "Steps":
      return (
        <View style={styles.steps}>
          {(node.items || []).map((item, index) => {
            const color = stepColor(item.status, theme);
            return (
              <View key={index} style={styles.stepRow}>
                <View style={[styles.stepMarker, { borderColor: color, backgroundColor: theme.colors.surface2 }]}>
                  <Text style={[styles.stepMarkerText, { color }]}>{stepMarker(item.status, index)}</Text>
                </View>
                <View style={styles.stepBody}>
                  <Text style={[styles.stepTitle, { color: theme.colors.foreground }]}>{item.title}</Text>
                  {item.detail ? (
                    <Text style={[styles.stepDetail, { color: theme.colors.foregroundMuted }]}>{item.detail}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      );

    case "SegmentedBar": {
      const parts = node.parts || [];
      const total = parts.reduce((sum, part) => sum + part.value, 0);
      const unit = node.unit ? ` ${node.unit}` : "";
      return (
        <View style={styles.segBar}>
          <View style={[styles.segTrack, { backgroundColor: theme.colors.surface2 }]}>
            {parts.map((part, index) =>
              part.value > 0 ? (
                <View
                  key={index}
                  style={{ flex: part.value, backgroundColor: segmentColor(part, index, theme) }}
                />
              ) : null,
            )}
          </View>
          <View style={styles.segLegend}>
            {parts.map((part, index) => (
              <View key={index} style={styles.segLegendItem}>
                <View style={[styles.segDot, { backgroundColor: segmentColor(part, index, theme) }]} />
                <Text style={[styles.segLegendText, { color: theme.colors.foreground }]}>
                  {part.label}:{" "}
                  <Text style={{ color: theme.colors.foregroundMuted }}>
                    {formatNumber(part.value)}
                    {unit}
                    {total > 0 ? ` (${Math.round((part.value / total) * 100)}%)` : ""}
                  </Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    case "KeyValue":
      return (
        <View style={styles.kv}>
          {(node.pairs || []).map((pair, index) => (
            <View key={index} style={styles.kvRow}>
              <View style={styles.kvLabelBox}>
                <Text style={[styles.kvLabel, { color: theme.colors.foregroundMuted }]}>{pair.label}</Text>
              </View>
              <View style={styles.kvValueBox}>
                <Text selectable style={[styles.kvValue, { color: theme.colors.foreground }]}>
                  {String(pair.value)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      );

    case "Tabs":
      return (
        <TabsBlock
          node={node}
          values={values}
          errors={errors}
          disabled={disabled}
          theme={theme}
          agentId={agentId}
          onValueChange={onValueChange}
          onSubmit={onSubmit}
          onReset={onReset}
        />
      );

    case "Details":
      return (
        <DetailsBlock
          node={node}
          values={values}
          errors={errors}
          disabled={disabled}
          theme={theme}
          agentId={agentId}
          onValueChange={onValueChange}
          onSubmit={onSubmit}
          onReset={onReset}
        />
      );

    case "FilePicker": {
      return (
        <FilePickerField
          node={node}
          value={values[node.id] ?? ""}
          error={errors[node.id]}
          disabled={disabled}
          theme={theme}
          agentId={agentId}
          onChange={(val) => onValueChange(node.id, val)}
        />
      );
    }

    default:
      return null;
  }
};

export interface PfrFormViewProps {
  form: PfrNode;
  theme: PluginHostProps["theme"];
  agentId?: string;
  onSubmit: (submissionFormattedText: string) => Promise<void> | void;
}

export const PfrFormView: React.FC<PfrFormViewProps> = ({ form, theme, agentId, onSubmit }) => {
  const [values, setValues] = useState<Record<string, any>>(() => extractInitialValues(form));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted">("idle");
  // The dropdown menu floats over the form using a full-screen Modal, so it can extend beyond any container and close on outside click.
  const [menuPos, setMenuPos] = useState<OpenDropdownMenu | null>(null);
  const { t } = useTranslation(messages);

  const toggleMenu = (
    id: string,
    buttonRef: React.RefObject<View | null>,
    options: Array<{ label: string; value: string; description?: string }>,
    isMulti: boolean,
  ) => {
    if (menuPos && menuPos.id === id) {
      setMenuPos(null);
      return;
    }
    buttonRef.current?.measureInWindow((bx, by, bw, bh) => {
      if (typeof bx !== "number" || typeof by !== "number" || isNaN(bx) || isNaN(by)) {
        return;
      }
      const windowDim = Dimensions.get("window");
      const windowWidth = windowDim.width || 800;
      const windowHeight = windowDim.height || 600;

      const menuWidth = bw > 0 ? bw : MENU_WIDTH;
      const left = Math.max(8, Math.min(bx, windowWidth - menuWidth - 8));

      const estimatedHeight = Math.min(260, options.length * 40 + 8);
      const spaceBelow = windowHeight - (by + bh + 4);
      const spaceAbove = by - 4;

      const openUpwards = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
      const top = openUpwards
        ? Math.max(8, by - estimatedHeight - 4)
        : by + bh + 4;
      const maxHeight = Math.min(260, Math.max(100, openUpwards ? spaceAbove - 8 : spaceBelow - 8));

      setMenuPos({
        id,
        left,
        top,
        width: menuWidth,
        maxHeight,
        options,
        isMulti,
      });
    });
  };

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
    setMenuPos(null);
    setValues(extractInitialValues(form));
    setErrors({});
  };

  const handleSubmit = async (message?: string) => {
    setMenuPos(null);
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
    <DropdownMenuContext.Provider value={{ openMenuId: menuPos?.id ?? null, toggleMenu }}>
      <View collapsable={false} style={[styles.formContainer, menuPos ? { zIndex: 10 } : null]}>
        <NodeRenderer
          node={form}
          values={values}
          errors={errors}
          disabled={status !== "idle"}
          theme={theme}
          agentId={agentId}
          onValueChange={handleValueChange}
          onSubmit={handleSubmit}
          onReset={handleReset}
        />
        {status === "submitted" && (
          <View style={[styles.submittedBanner, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.statusSuccess, borderWidth: 1 }]}>
            <Text style={[styles.submittedText, { color: theme.colors.statusSuccess }]}>{t("form.submitted")}</Text>
          </View>
        )}
        {menuPos ? (
          <Modal
            visible={true}
            transparent={true}
            animationType="none"
            onRequestClose={() => setMenuPos(null)}
          >
            <Pressable
              accessibilityLabel={t("dropdown.close")}
              onPress={() => setMenuPos(null)}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                styles.dropdownMenu,
                {
                  left: menuPos.left,
                  top: menuPos.top,
                  width: menuPos.width,
                  maxHeight: menuPos.maxHeight,
                  backgroundColor: theme.colors.surface1,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={true}
                style={{ maxHeight: menuPos.maxHeight }}
              >
                {menuPos.options.map((opt, idx) => {
                  const currentVal = values[menuPos.id];
                  const isSelected = menuPos.isMulti
                    ? (Array.isArray(currentVal) ? currentVal : []).includes(opt.value)
                    : (currentVal ?? "") === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.dropdownMenuItem,
                        { borderBottomColor: theme.colors.border },
                        idx === menuPos.options.length - 1 ? { borderBottomWidth: 0 } : null,
                        isSelected ? { backgroundColor: theme.colors.surface2 } : null,
                      ]}
                      onPress={() => {
                        if (menuPos.isMulti) {
                          const arr = Array.isArray(currentVal) ? currentVal : [];
                          const next = isSelected
                            ? arr.filter((v) => v !== opt.value)
                            : [...arr, opt.value];
                          handleValueChange(menuPos.id, next);
                        } else {
                          handleValueChange(menuPos.id, opt.value);
                          setMenuPos(null);
                        }
                      }}
                    >
                      <View style={styles.dropdownMenuItemBody}>
                        <Text
                          style={[
                            styles.dropdownMenuItemText,
                            { color: isSelected ? theme.colors.accent : theme.colors.foreground },
                            isSelected ? { fontWeight: "600" } : null,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {opt.description ? (
                          <Text style={[styles.dropdownMenuItemDescription, { color: theme.colors.foregroundMuted }]}>
                            {opt.description}
                          </Text>
                        ) : null}
                      </View>
                      {isSelected ? (
                        <Text style={[styles.dropdownCheckmark, { color: theme.colors.accent }]}>✓</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Modal>
        ) : null}
      </View>
    </DropdownMenuContext.Provider>
  );
};

const styles = StyleSheet.create({
  formContainer: {
    marginVertical: 8,
    position: "relative",
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
    fontSize: 14,
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
    fontSize: 16,
    fontWeight: "600",
    marginVertical: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
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
    fontSize: 13,
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
    fontSize: 13,
    fontWeight: "500",
  },
  code: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 26,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  codeLanguage: {
    fontSize: 11,
  },
  codeCopy: {
    fontSize: 11,
    fontWeight: "500",
  },
  codeBody: {
    padding: 10,
  },
  codeText: {
    fontSize: 12,
    lineHeight: 18,
  },
  steps: {
    gap: 10,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepMarkerText: {
    fontSize: 11,
    fontWeight: "700",
  },
  stepBody: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  stepDetail: {
    fontSize: 13,
  },
  details: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  detailsTitleBox: {
    flex: 1,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  detailsChevron: {
    fontSize: 14,
  },
  detailsBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 12,
  },
  chart: {
    gap: 8,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  chartReadout: {
    fontSize: 12,
  },
  chartBody: {
    flexDirection: "row",
  },
  chartAxis: {
    width: CHART_AXIS_WIDTH,
    height: CHART_PLOT_HEIGHT,
    marginRight: 6,
  },
  chartTick: {
    position: "absolute",
    right: 0,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "right",
  },
  chartFill: {
    flex: 1,
  },
  chartPlot: {
    height: CHART_PLOT_HEIGHT,
  },
  chartGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
  },
  chartColumns: {
    flexDirection: "row",
    height: CHART_PLOT_HEIGHT,
  },
  chartColumn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 3,
    height: CHART_PLOT_HEIGHT,
  },
  chartBarSlot: {
    flex: 1,
    maxWidth: 26,
    height: CHART_PLOT_HEIGHT,
  },
  chartBar: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: 2,
  },
  chartLabels: {
    flexDirection: "row",
    marginTop: 4,
  },
  chartLabelBox: {
    flex: 1,
    alignItems: "center",
  },
  chartLabel: {
    fontSize: 11,
  },
  ratingRow: {
    flexDirection: "row",
    gap: 4,
  },
  ratingStar: {
    fontSize: 28,
    lineHeight: 32,
  },
  sparkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sparkLabel: {
    fontSize: 13,
  },
  sparkBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: 24,
  },
  sparkBar: {
    width: 4,
    borderRadius: 2,
  },
  sparkValue: {
    fontSize: 12,
  },
  markdown: {
    width: "100%",
  },
  dropdownMenuItemBody: {
    flex: 1,
    gap: 2,
  },
  dropdownMenuItemDescription: {
    fontSize: 12,
  },
  segBar: {
    gap: 8,
  },
  segTrack: {
    flexDirection: "row",
    height: 12,
    borderRadius: 6,
    overflow: "hidden",
    gap: 2,
  },
  segLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 4,
  },
  segLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  segDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  segLegendText: {
    fontSize: 13,
  },
  kv: {
    gap: 6,
  },
  kvRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  kvLabelBox: {
    flex: 1,
  },
  kvValueBox: {
    flex: 2,
  },
  kvLabel: {
    fontSize: 13,
  },
  kvValue: {
    fontSize: 14,
  },
  tabs: {
    gap: 10,
  },
  tabBar: {
    flexDirection: "row",
    gap: 4,
    borderBottomWidth: 1,
    paddingBottom: 6,
  },
  tabButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tabLabel: {
    fontSize: 13,
  },
  tabBody: {
    gap: 12,
  },
  alert: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    gap: 4,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  alertText: {
    fontSize: 14,
  },
  progressContainer: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  progressHeaderLabel: {
    flex: 1,
    flexShrink: 1,
  },
  progressLabel: {
    fontSize: 14,
  },
  progressValue: {
    fontSize: 14,
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
  tableCellContainer: {
    flex: 1,
    padding: 8,
  },
  tableHeaderCell: {
    fontSize: 13,
    fontWeight: "600",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tableCell: {
    fontSize: 13,
  },
  fieldContainer: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 64,
    ...Platform.select({
      android: {
        textAlignVertical: "top",
      },
      web: {
        resize: "vertical",
      } as any,
      default: {},
    }),
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
    fontSize: 15,
    flex: 1,
  },
  dropdownChevron: {
    fontSize: 10,
    marginLeft: 8,
  },
  dropdownMenu: {
    position: "absolute",
    zIndex: 1000,
    elevation: 8,
    borderWidth: 1,
    borderRadius: 6,
    overflow: "hidden",
    paddingVertical: 2,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
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
    fontSize: 15,
    flexShrink: 1,
  },
  dropdownCheckmark: {
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 8,
    flexShrink: 0,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  toggleLabel: {
    flex: 1,
    flexShrink: 1,
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
    fontSize: 15,
    fontWeight: "600",
  },
  errorMessage: {
    fontSize: 13,
  },
  submittedBanner: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  submittedText: {
    fontSize: 14,
    fontWeight: "600",
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  fieldLabelGrow: {
    flex: 1,
    flexShrink: 1,
  },
  extBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    flexShrink: 1,
  },
  extBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  pickerRow: {
    borderWidth: 1,
    borderRadius: 6,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 38,
  },
  pickerTextInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
    paddingRight: 8,
  },
  pickerClearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  pickerBrowseBtn: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pathInspector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 3,
  },
  pathInspectorLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginRight: 6,
  },
  pathInspectorScroll: {
    flex: 1,
  },
  pathInspectorScrollContent: {
    alignItems: "center",
  },
  pathInspectorText: {
    fontSize: 12,
  },
});

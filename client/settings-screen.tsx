import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { MAX_AUTO_FIX_RETRIES, irixSettings } from "../shared/settings";

export const IrixSettingsScreen: React.FC<PluginSurfaceProps> = ({ theme }) => {
  const settings = useSettings(irixSettings);
  const { colors } = theme;

  if (settings.status === "loading") {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (settings.status === "error" || settings.status === "invalid") {
    return (
      <View style={styles.container}>
        <Text style={[styles.errorText, { color: colors.statusDanger }]}>
          Could not load settings: {settings.error}
        </Text>
        <Pressable
          style={[styles.stepButton, styles.retryButton, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
          onPress={() => void settings.reload()}
        >
          <Text style={[styles.stepText, { color: colors.foreground }]}>Retry</Text>
        </Pressable>
        {settings.status === "invalid" && (
          <Pressable
            style={[styles.stepButton, styles.retryButton, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
            onPress={() => void settings.reset()}
          >
            <Text style={[styles.stepText, { color: colors.foreground }]}>Reset to defaults</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const value = settings.values.autoFixMaxRetries;
  const change = (next: number) => {
    if (next < 0 || next > MAX_AUTO_FIX_RETRIES || settings.saving) return;
    void settings.save({ ...settings.values, autoFixMaxRetries: next }, settings.revision);
  };
  const stepStyle = (disabled: boolean) => [
    styles.stepButton,
    { borderColor: colors.border, backgroundColor: colors.surface2 },
    disabled && { opacity: 0.4 },
  ];

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.foreground }]}>Automatic form fixes</Text>
      <Text style={[styles.description, { color: colors.foregroundMuted }]}>
        When an agent replies with an irix-form block that fails validation, ask it to re-send a corrected block
        automatically. This sets how many times in a row the agent is asked; 0 turns automatic fixes off. The
        "Ask agent to fix" button on an error box always works.
      </Text>

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.foreground }]}>Maximum retries</Text>
        <View style={styles.stepper}>
          <Pressable
            accessibilityLabel="Decrease retries"
            disabled={value <= 0 || settings.saving}
            style={stepStyle(value <= 0 || settings.saving)}
            onPress={() => change(value - 1)}
          >
            <Text style={[styles.stepText, { color: colors.foreground }]}>−</Text>
          </Pressable>
          <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
          <Pressable
            accessibilityLabel="Increase retries"
            disabled={value >= MAX_AUTO_FIX_RETRIES || settings.saving}
            style={stepStyle(value >= MAX_AUTO_FIX_RETRIES || settings.saving)}
            onPress={() => change(value + 1)}
          >
            <Text style={[styles.stepText, { color: colors.foreground }]}>+</Text>
          </Pressable>
        </View>
      </View>

      <Text style={[styles.hint, { color: colors.foregroundMuted }]}>
        {value === 0 ? "Automatic fixes are off." : `Up to ${value} automatic ${value === 1 ? "request" : "requests"} per reply.`}
        {settings.saving ? " Saving…" : ""}
      </Text>

      <Text style={[styles.title, { color: colors.foreground }]}>Prefer forms</Text>
      <Text style={[styles.description, { color: colors.foregroundMuted }]}>
        By default the agent is only told it can use irix-form. Turn this on to require it to ask for choices,
        parameters, and confirmations with a form instead of plain text. Applies to agents created after the change.
      </Text>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.foreground }]}>Require forms for user input</Text>
        <Switch
          accessibilityLabel="Require forms for user input"
          value={settings.values.preferForms}
          disabled={settings.saving}
          onValueChange={(next) => void settings.save({ ...settings.values, preferForms: next }, settings.revision)}
        />
      </View>
      {settings.saveError && (
        <Text style={[styles.errorText, { color: colors.statusDanger }]}>Could not save: {settings.saveError}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  retryButton: {
    width: undefined,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
  },
  stepText: {
    fontSize: 16,
    fontWeight: "600",
  },
  value: {
    fontSize: 16,
    fontWeight: "600",
    minWidth: 20,
    textAlign: "center",
  },
  hint: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
  },
});

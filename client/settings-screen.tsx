import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings, useTranslation } from "@getpaseo/plugin/client";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { MAX_AUTO_FIX_RETRIES, pfrSettings } from "../shared/settings";
import { messages } from "./messages";

export const PfrSettingsScreen: React.FC<PluginSurfaceProps> = ({ theme }) => {
  const settings = useSettings(pfrSettings);
  const { t } = useTranslation(messages);
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
          {t("settings.loadError", { error: settings.error })}
        </Text>
        <Pressable
          style={[styles.stepButton, styles.retryButton, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
          onPress={() => void settings.reload()}
        >
          <Text style={[styles.stepText, { color: colors.foreground }]}>{t("settings.retry")}</Text>
        </Pressable>
        {settings.status === "invalid" && (
          <Pressable
            style={[styles.stepButton, styles.retryButton, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
            onPress={() => void settings.reset()}
          >
            <Text style={[styles.stepText, { color: colors.foreground }]}>{t("settings.resetDefaults")}</Text>
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
      <Text style={[styles.title, { color: colors.foreground }]}>{t("settings.autoFixTitle")}</Text>
      <Text style={[styles.description, { color: colors.foregroundMuted }]}>{t("settings.autoFixDescription")}</Text>

      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.foreground }]}>{t("settings.maxRetries")}</Text>
        <View style={styles.stepper}>
          <Pressable
            accessibilityLabel={t("settings.decreaseRetries")}
            disabled={value <= 0 || settings.saving}
            style={stepStyle(value <= 0 || settings.saving)}
            onPress={() => change(value - 1)}
          >
            <Text style={[styles.stepText, { color: colors.foreground }]}>−</Text>
          </Pressable>
          <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
          <Pressable
            accessibilityLabel={t("settings.increaseRetries")}
            disabled={value >= MAX_AUTO_FIX_RETRIES || settings.saving}
            style={stepStyle(value >= MAX_AUTO_FIX_RETRIES || settings.saving)}
            onPress={() => change(value + 1)}
          >
            <Text style={[styles.stepText, { color: colors.foreground }]}>+</Text>
          </Pressable>
        </View>
      </View>

      <Text style={[styles.hint, { color: colors.foregroundMuted }]}>
        {value === 0 ? t("settings.hintOff") : t("settings.hint", { count: value })}
        {settings.saving ? ` ${t("settings.saving")}` : ""}
      </Text>

      <Text style={[styles.title, { color: colors.foreground }]}>{t("settings.preferFormsTitle")}</Text>
      <Text style={[styles.description, { color: colors.foregroundMuted }]}>{t("settings.preferFormsDescription")}</Text>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.foreground }]}>{t("settings.requireForms")}</Text>
        <Switch
          accessibilityLabel={t("settings.requireForms")}
          value={settings.values.preferForms}
          disabled={settings.saving}
          onValueChange={(next) => void settings.save({ ...settings.values, preferForms: next }, settings.revision)}
        />
      </View>
      {settings.saveError && (
        <Text style={[styles.errorText, { color: colors.statusDanger }]}>{t("settings.saveError", { error: settings.saveError })}</Text>
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

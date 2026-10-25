import { PluginTranslationRuntime } from "@getpaseo/plugin/client/host";
import { describe, expect, it } from "vitest";
import { messages } from "./messages";

function runtimeFor(locale: string) {
  return new PluginTranslationRuntime({ getLocale: () => locale, subscribe: () => () => {} });
}

function leafKeys(resource: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(resource).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : leafKeys(value as Record<string, unknown>, path);
  });
}

/** `settings.hint_one` and `settings.hint_other` are one message; Chinese only defines the `other` form. */
function messageKeys(resource: Record<string, unknown>): Set<string> {
  return new Set(leafKeys(resource).map((key) => key.replace(/_(zero|one|two|few|many|other)$/, "")));
}

describe("plugin translations", () => {
  const english = messageKeys(messages.resources.en);

  it.each(["zh-CN", "zh"])("%s defines every English message", (locale) => {
    const translated = messageKeys(messages.resources[locale]);
    const missing = [...english].filter((key) => !translated.has(key));
    expect(missing).toEqual([]);
  });

  it("does not define messages that English lacks", () => {
    const translated = messageKeys(messages.resources["zh-CN"]);
    const extra = [...translated].filter((key) => !english.has(key));
    expect(extra).toEqual([]);
  });

  it.each(["zh-CN", "zh"])("resolves Chinese text for the %s app locale", (locale) => {
    const runtime = runtimeFor(locale);
    try {
      expect(runtime.t(messages, "errorBox.askFix")).toBe("请求智能体修复");
      expect(runtime.t(messages, "settings.hint", { count: 3 })).toBe("每条回复最多自动请求 3 次。");
      expect(runtime.t(messages, "settings.loadError", { error: "boom" })).toBe("无法加载设置：boom");
    } finally {
      runtime.dispose();
    }
  });

  it("falls back to English for an unsupported locale", () => {
    const runtime = runtimeFor("fr-FR");
    try {
      expect(runtime.t(messages, "errorBox.askFix")).toBe("Ask agent to fix");
      expect(runtime.t(messages, "settings.hint", { count: 1 })).toBe("Up to 1 automatic request per reply.");
    } finally {
      runtime.dispose();
    }
  });
});

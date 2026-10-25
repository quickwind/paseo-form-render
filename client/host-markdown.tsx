import type { PluginHostProps } from "@getpaseo/plugin/client";
import * as hostUi from "@getpaseo/plugin/client/ui";
import React from "react";
import { MarkdownText } from "./markdown";

type HostMarkdownComponent = React.ComponentType<{ children: string }>;

// Newer hosts export `Markdown` from the plugin UI module; it renders with the host's own
// typography, links, code highlighting and selection. Older hosts lack it, so fall back to
// the built-in mini renderer. Look it up per render so a missing export never throws.
function getHostMarkdown(): HostMarkdownComponent | undefined {
  const candidate = (hostUi as { Markdown?: unknown }).Markdown;
  return typeof candidate === "function" || (typeof candidate === "object" && candidate !== null)
    ? (candidate as HostMarkdownComponent)
    : undefined;
}

export function HostMarkdown({
  text,
  theme,
}: Pick<PluginHostProps, "theme"> & { text: string }) {
  const Host = getHostMarkdown();
  return Host ? <Host>{text}</Host> : <MarkdownText text={text} theme={theme} />;
}

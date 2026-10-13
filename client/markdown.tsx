import type { PluginHostProps } from "@getpaseo/plugin/client";
import React, { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

interface MarkdownBlock {
  type: "heading" | "paragraph" | "list-item" | "code";
  text?: string;
  level?: number;
  bullet?: string;
  code?: string;
  lang?: string;
}

function parseBlocks(src: string): MarkdownBlock[] {
  const lines = src.split("\n");
  const blocks: MarkdownBlock[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let codeLang = "";
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      if (inCode) {
        blocks.push({ type: "code", code: codeLines.join("\n"), lang: codeLang });
        codeLines = [];
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
        codeLang = line.trim().slice(3).trim();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      flushParagraph();
      blocks.push({ type: "heading", level: hMatch[1].length, text: hMatch[2] });
      continue;
    }
    const listMatch = line.match(/^(\*|-|\d+\.)\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      blocks.push({ type: "list-item", bullet: listMatch[1], text: listMatch[2] });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  if (inCode && codeLines.length > 0) {
    blocks.push({ type: "code", code: codeLines.join("\n"), lang: codeLang });
  }
  return blocks;
}

function parseInline(text: string, color: string, codeBg: string): ReactNode[] {
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <Text
          key={match.index}
          style={{
            color,
            fontFamily: "monospace",
            fontSize: 13,
            backgroundColor: codeBg,
            paddingHorizontal: 4,
            paddingVertical: 1,
            borderRadius: 4,
          }}
        >
          {token.slice(1, -1)}
        </Text>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <Text key={match.index} style={{ fontWeight: "bold", color }}>
          {token.slice(2, -2)}
        </Text>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <Text key={match.index} style={{ fontStyle: "italic", color }}>
          {token.slice(1, -1)}
        </Text>,
      );
    } else if (token.startsWith("[") && token.includes("](")) {
      const closeBracket = token.indexOf("]");
      const linkText = token.slice(1, closeBracket);
      parts.push(
        <Text key={match.index} style={{ color, textDecorationLine: "underline" }}>
          {linkText}
        </Text>,
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export function MarkdownText({
  text,
  theme,
}: Pick<PluginHostProps, "theme"> & { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const color = theme.colors.foreground;
  const codeBg = theme.colors.surface2;

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const fontSize = block.level === 1 ? 20 : block.level === 2 ? 17 : 15;
          return (
            <Text
              key={index}
              style={{
                color,
                fontSize,
                fontWeight: "600",
                marginVertical: 6,
              }}
            >
              {parseInline(block.text ?? "", color, codeBg)}
            </Text>
          );
        }
        if (block.type === "paragraph") {
          return (
            <Text
              key={index}
              style={{
                color,
                lineHeight: 22,
                fontSize: 14,
                marginBottom: 8,
              }}
            >
              {parseInline(block.text ?? "", color, codeBg)}
            </Text>
          );
        }
        if (block.type === "list-item") {
          return (
            <View key={index} style={styles.listRow}>
              <Text style={{ color: theme.colors.foregroundMuted, lineHeight: 22, width: 18 }}>
                {block.bullet?.endsWith(".") ? block.bullet : "•"}
              </Text>
              <Text style={{ color, lineHeight: 22, fontSize: 14, flex: 1 }}>
                {parseInline(block.text ?? "", color, codeBg)}
              </Text>
            </View>
          );
        }
        if (block.type === "code") {
          return (
            <Text
              key={index}
              selectable
              style={{
                color,
                fontFamily: "monospace",
                fontSize: 12,
                lineHeight: 18,
                padding: 10,
                borderRadius: 6,
                backgroundColor: codeBg,
                marginVertical: 4,
              }}
            >
              {block.code?.trimEnd() ?? ""}
            </Text>
          );
        }
        return null;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 2,
  },
  listRow: {
    flexDirection: "row",
    gap: 6,
    marginVertical: 2,
  },
});

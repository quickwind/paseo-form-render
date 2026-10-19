import type { PluginHostProps } from "@getpaseo/plugin/client";
import React, { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

interface MarkdownBlock {
  type: "heading" | "paragraph" | "list-item" | "code" | "table";
  text?: string;
  level?: number;
  bullet?: string;
  code?: string;
  lang?: string;
  headers?: string[];
  rows?: string[][];
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") || !trimmed.includes("-")) return false;
  const cells = parseTableRow(trimmed);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));
}

function parseTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function parseBlocks(src: string): MarkdownBlock[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
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
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      flushParagraph();
      const headers = parseTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().includes("|")) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      i--;
      blocks.push({ type: "table", headers, rows });
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
          selectable
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
        <Text key={match.index} selectable style={{ fontWeight: "bold", color }}>
          {token.slice(2, -2)}
        </Text>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <Text key={match.index} selectable style={{ fontStyle: "italic", color }}>
          {token.slice(1, -1)}
        </Text>,
      );
    } else if (token.startsWith("[") && token.includes("](")) {
      const closeBracket = token.indexOf("]");
      const linkText = token.slice(1, closeBracket);
      parts.push(
        <Text key={match.index} selectable style={{ color, textDecorationLine: "underline" }}>
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
              selectable
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
              selectable
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
              <Text selectable style={{ color: theme.colors.foregroundMuted, lineHeight: 22, width: 18 }}>
                {block.bullet?.endsWith(".") ? block.bullet : "•"}
              </Text>
              <Text selectable style={{ color, lineHeight: 22, fontSize: 14, flex: 1 }}>
                {parseInline(block.text ?? "", color, codeBg)}
              </Text>
            </View>
          );
        }
        if (block.type === "table") {
          const headers = block.headers ?? [];
          const rows = block.rows ?? [];
          return (
            <View
              key={index}
              style={[
                styles.tableContainer,
                { borderColor: theme.colors.border },
              ]}
            >
              <View
                style={[
                  styles.tableHeaderRow,
                  {
                    backgroundColor: theme.colors.surface2,
                    borderBottomColor: theme.colors.border,
                  },
                ]}
              >
                {headers.map((header, colIdx) => (
                  <View key={colIdx} style={styles.tableCell}>
                    <Text
                      selectable
                      style={{
                        color,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {parseInline(header, color, codeBg)}
                    </Text>
                  </View>
                ))}
              </View>
              {rows.map((row, rowIdx) => (
                <View
                  key={rowIdx}
                  style={[
                    styles.tableRow,
                    rowIdx < rows.length - 1
                      ? {
                          borderBottomWidth: 1,
                          borderBottomColor: theme.colors.border,
                        }
                      : null,
                  ]}
                >
                  {headers.map((_, colIdx) => (
                    <View key={colIdx} style={styles.tableCell}>
                      <Text selectable style={{ color, fontSize: 13 }}>
                        {parseInline(row[colIdx] ?? "", color, codeBg)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
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
  tableContainer: {
    borderWidth: 1,
    borderRadius: 6,
    overflow: "hidden",
    marginVertical: 6,
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableCell: {
    flex: 1,
    paddingRight: 8,
  },
});

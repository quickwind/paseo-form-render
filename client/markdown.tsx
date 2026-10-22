import type { PluginHostProps } from "@getpaseo/plugin/client";
import React, { useMemo, type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

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

const WEB_TEXT_SELECTABLE = Platform.OS === "web" ? { userSelect: "text" as const } : {};

/**
 * Typography that mirrors Paseo's own markdown scale: body text uses `fontSize.content` (15) with a
 * 1.4 line height, inline/code blocks use `fontSize.code` (12) and headings are scaled from the same
 * base (h1 28, h2 24, h3 21, h4 19, h5/h6 17 with a 1.3 line height).
 *
 * This matters because a message that contains an irix-form block is rendered by this plugin instead
 * of the host's markdown renderer. With smaller values the surrounding text of such a reply looked
 * shrunk compared to the same text in a plain assistant message.
 */
const CONTENT_FONT_SIZE = 15;
const CONTENT_LINE_HEIGHT = 21;
const CODE_FONT_SIZE = 12;
const CODE_LINE_HEIGHT = 22;
const HEADING_FONT_SIZES = [28, 24, 21, 19, 17, 17];
const HEADING_LINE_HEIGHTS = [36, 31, 27, 25, 22, 22];
/** Host spacing scale (spacing[2] = 8, spacing[3] = 12, spacing[4] = 16, spacing[6] = 24). */
const SPACE_1 = 4;
const SPACE_2 = 8;
const SPACE_3 = 12;
const SPACE_4 = 16;
const SPACE_6 = 24;

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
          dataSet={{ paseoMarkdownTag: "code" }}
          style={{
            color,
            fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
            fontSize: CODE_FONT_SIZE,
            lineHeight: CODE_LINE_HEIGHT,
            backgroundColor: codeBg,
            paddingHorizontal: SPACE_1,
            paddingVertical: 2,
            borderRadius: 4,
            ...WEB_TEXT_SELECTABLE,
          }}
        >
          {token.slice(1, -1)}
        </Text>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <Text
          key={match.index}
          selectable
          dataSet={{ paseoMarkdownTag: "strong" }}
          style={{
            fontWeight: "bold",
            color,
            ...WEB_TEXT_SELECTABLE,
          }}
        >
          {token.slice(2, -2)}
        </Text>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <Text
          key={match.index}
          selectable
          dataSet={{ paseoMarkdownTag: "em" }}
          style={{
            fontStyle: "italic",
            color,
            ...WEB_TEXT_SELECTABLE,
          }}
        >
          {token.slice(1, -1)}
        </Text>,
      );
    } else if (token.startsWith("[") && token.includes("](")) {
      const closeBracket = token.indexOf("]");
      const linkText = token.slice(1, closeBracket);
      parts.push(
        <Text
          key={match.index}
          selectable
          dataSet={{ paseoMarkdownTag: "a" }}
          style={{
            color,
            textDecorationLine: "underline",
            ...WEB_TEXT_SELECTABLE,
          }}
        >
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
  const blocks = useMemo(() => {
    try {
      return parseBlocks(text);
    } catch {
      return [{ type: "paragraph" as const, text }];
    }
  }, [text]);
  const color = theme.colors.foreground;
  const codeBg = theme.colors.surface2;

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const level = Math.min(Math.max(block.level || 1, 1), 6);
          const fontSize = HEADING_FONT_SIZES[level - 1];
          const lineHeight = HEADING_LINE_HEIGHTS[level - 1];
          return (
            <Text
              key={index}
              selectable
              dataSet={{ paseoMarkdownTag: `h${level}` }}
              style={{
                color,
                fontSize,
                lineHeight,
                fontWeight: level <= 2 ? "bold" : "600",
                marginTop: level === 1 ? SPACE_6 : level <= 4 ? SPACE_4 : SPACE_3,
                marginBottom: level === 1 ? SPACE_3 : level <= 4 ? SPACE_2 : SPACE_1,
                ...(level === 1
                  ? {
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                      paddingBottom: SPACE_2,
                    }
                  : null),
                ...(level === 6 ? { textTransform: "uppercase" as const, letterSpacing: 0.5 } : null),
                ...WEB_TEXT_SELECTABLE,
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
              dataSet={{ paseoMarkdownTag: "p" }}
              style={{
                color,
                lineHeight: CONTENT_LINE_HEIGHT,
                fontSize: CONTENT_FONT_SIZE,
                marginBottom: SPACE_3,
                ...WEB_TEXT_SELECTABLE,
              }}
            >
              {parseInline(block.text ?? "", color, codeBg)}
            </Text>
          );
        }
        if (block.type === "list-item") {
          return (
            <View
              key={index}
              dataSet={{ paseoMarkdownTag: "li" }}
              style={styles.listRow}
            >
              <Text
                selectable
                dataSet={{ paseoMarkdownIgnore: "true", paseoMarkdownListMarker: "true" }}
                style={{
                  color: theme.colors.foregroundMuted,
                  lineHeight: CONTENT_LINE_HEIGHT,
                  fontSize: CONTENT_FONT_SIZE,
                  width: 18,
                }}
              >
                {block.bullet?.endsWith(".") ? block.bullet : "•"}
              </Text>
              <Text
                selectable
                style={{
                  color,
                  lineHeight: CONTENT_LINE_HEIGHT,
                  fontSize: CONTENT_FONT_SIZE,
                  flex: 1,
                  ...WEB_TEXT_SELECTABLE,
                }}
              >
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
              dataSet={{ paseoMarkdownTag: "table" }}
              style={[
                styles.tableContainer,
                { borderColor: theme.colors.border },
              ]}
            >
              <View
                dataSet={{ paseoMarkdownTag: "thead" }}
                style={[
                  styles.tableHeaderRow,
                  {
                    backgroundColor: theme.colors.surface2,
                    borderBottomColor: theme.colors.border,
                  },
                ]}
              >
                {headers.map((header, colIdx) => (
                  <View
                    key={colIdx}
                    dataSet={{ paseoMarkdownTag: "th" }}
                    style={styles.tableCell}
                  >
                    <Text
                      selectable
                      style={{
                        color,
                        fontSize: CONTENT_FONT_SIZE,
                        lineHeight: CONTENT_LINE_HEIGHT,
                        fontWeight: "600",
                        ...WEB_TEXT_SELECTABLE,
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
                  dataSet={{ paseoMarkdownTag: "tr" }}
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
                    <View
                      key={colIdx}
                      dataSet={{ paseoMarkdownTag: "td" }}
                      style={styles.tableCell}
                    >
                      <Text
                        selectable
                        style={{
                          color,
                          fontSize: CONTENT_FONT_SIZE,
                          lineHeight: CONTENT_LINE_HEIGHT,
                          ...WEB_TEXT_SELECTABLE,
                        }}
                      >
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
            <View
              key={index}
              dataSet={{
                paseoMarkdownTag: "pre",
                paseoMarkdownLanguage: block.lang || undefined,
              }}
              style={[
                styles.codeBlock,
                { backgroundColor: codeBg },
              ]}
            >
              <Text
                selectable
                dataSet={{ paseoMarkdownTag: "code" }}
                style={{
                  color,
                  fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
                  fontSize: CODE_FONT_SIZE,
                  lineHeight: CODE_LINE_HEIGHT,
                  ...WEB_TEXT_SELECTABLE,
                }}
              >
                {block.code?.trimEnd() ?? ""}
              </Text>
            </View>
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
    ...(Platform.OS === "web" ? { userSelect: "text" as const } : {}),
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
    marginVertical: SPACE_2,
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingVertical: SPACE_2,
    paddingHorizontal: SPACE_2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: SPACE_2,
    paddingHorizontal: SPACE_2,
  },
  tableCell: {
    flex: 1,
    paddingRight: SPACE_2,
  },
  codeBlock: {
    borderRadius: 6,
    padding: SPACE_3,
    marginVertical: SPACE_2,
  },
});

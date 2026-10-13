import type { PluginHostProps } from "@getpaseo/plugin/client";
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { parseMessageContent } from "./parser";
import { WukongFormView } from "./renderer";
import { MarkdownText } from "./markdown";

export interface MessageContainerProps {
  text: string;
  theme: PluginHostProps["theme"];
  agentId?: string;
  onSubmit: (formattedMessage: string) => Promise<void> | void;
}

export const MessageContainer: React.FC<MessageContainerProps> = ({ text, theme, agentId, onSubmit }) => {
  const blocks = parseMessageContent(text);

  return (
    <View style={styles.container}>
      {blocks.map((block, idx) => {
        if (block.type === "text" && block.content) {
          return (
            <MarkdownText
              key={idx}
              text={block.content}
              theme={theme}
            />
          );
        }

        if (block.type === "form") {
          if (block.error) {
            return (
              <View
                key={idx}
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: theme.colors.surface2,
                    borderColor: theme.colors.statusDanger,
                  },
                ]}
              >
                <Text style={[styles.errorTitle, { color: theme.colors.statusDanger }]}>
                  [wukong-form Syntax Error]
                </Text>
                <Text style={[styles.errorDetail, { color: theme.colors.statusDanger }]}>
                  {block.error}
                </Text>
                <Text
                  selectable
                  style={[
                    styles.rawJson,
                    {
                      backgroundColor: theme.colors.surface1,
                      color: theme.colors.foreground,
                    },
                  ]}
                >
                  {block.rawJson}
                </Text>
              </View>
            );
          }

          if (block.form) {
            return (
              <WukongFormView
                key={idx}
                form={block.form}
                theme={theme}
                agentId={agentId}
                onSubmit={onSubmit}
              />
            );
          }
        }

        return null;
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
    width: "100%",
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    gap: 6,
    marginVertical: 4,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  errorDetail: {
    fontSize: 12,
  },
  rawJson: {
    fontFamily: "monospace",
    fontSize: 11,
    padding: 8,
    borderRadius: 4,
  },
});

import type { PluginHostProps } from "@getpaseo/plugin/client";
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { formatIssues } from "../shared/form-errors";
import { buildFixMessage } from "../shared/form-fix";
import { parseFormBlock, parseMessageContent, type ParsedBlock } from "../shared/parser";
import { IrixFormView } from "./renderer";
import { MarkdownText } from "./markdown";
import { IrixRpcProvider, type IrixRpcFn } from "./rpc-bridge";

export interface MessageContainerProps {
  text: string;
  theme: PluginHostProps["theme"];
  agentId?: string;
  rpc?: IrixRpcFn;
  onSubmit: (formattedMessage: string) => Promise<void> | void;
}

export interface FormBlockViewProps {
  rawJson: string;
  blockNumber: number;
  theme: PluginHostProps["theme"];
  agentId?: string;
  rpc?: IrixRpcFn;
  onSubmit: (formattedMessage: string) => Promise<void> | void;
}

interface FormErrorBoxProps {
  block: ParsedBlock;
  blockNumber: number;
  theme: PluginHostProps["theme"];
  onSubmit: MessageContainerProps["onSubmit"];
}

const FormErrorBox: React.FC<FormErrorBoxProps> = ({ block, blockNumber, theme, onSubmit }) => {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const errors = block.errors ?? [];

  const askAgentToFix = async () => {
    setStatus("sending");
    try {
      await onSubmit(buildFixMessage([{ issues: errors, blockNumber }]));
      setStatus("sent");
    } catch (e) {
      setStatus("idle");
    }
  };

  return (
    <View
      style={[
        styles.errorBox,
        {
          backgroundColor: theme.colors.surface2,
          borderColor: theme.colors.statusDanger,
        },
      ]}
    >
      <Text style={[styles.errorTitle, { color: theme.colors.statusDanger }]}>
        [irix-form Syntax Error]
      </Text>
      {formatIssues(errors).map((line, i) => (
        <Text key={i} selectable style={[styles.errorDetail, { color: theme.colors.statusDanger }]}>
          {line}
        </Text>
      ))}
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
      {status === "sent" ? (
        <Text style={[styles.sentText, { color: theme.colors.statusSuccess }]}>
          ✓ Fix requested; the agent will reply with a corrected form
        </Text>
      ) : (
        <Pressable
          disabled={status !== "idle"}
          style={[
            styles.fixButton,
            { backgroundColor: theme.colors.accent },
            status !== "idle" && { opacity: 0.5 },
          ]}
          onPress={askAgentToFix}
        >
          <Text style={[styles.fixButtonText, { color: theme.colors.accentForeground }]}>
            {status === "sending" ? "Sending…" : "Ask agent to fix"}
          </Text>
        </Pressable>
      )}
    </View>
  );
};

export const FormBlockView: React.FC<FormBlockViewProps> = ({
  rawJson,
  blockNumber,
  theme,
  agentId,
  rpc,
  onSubmit,
}) => {
  const block = useMemo(() => parseFormBlock(rawJson), [rawJson]);

  return (
    <IrixRpcProvider rpc={rpc}>
      {block.error ? (
        <FormErrorBox
          block={block}
          blockNumber={blockNumber}
          theme={theme}
          onSubmit={onSubmit}
        />
      ) : block.form ? (
        <IrixFormView
          form={block.form}
          theme={theme}
          agentId={agentId}
          onSubmit={onSubmit}
        />
      ) : null}
    </IrixRpcProvider>
  );
};

export const MessageContainer: React.FC<MessageContainerProps> = ({ text, theme, agentId, rpc, onSubmit }) => {
  const blocks = parseMessageContent(text);

  return (
    <IrixRpcProvider rpc={rpc}>
      <View style={styles.container} testID="assistant-message">
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
                <FormErrorBox
                  key={idx}
                  block={block}
                  blockNumber={blocks.slice(0, idx).filter((b) => b.type === "form").length + 1}
                  theme={theme}
                  onSubmit={onSubmit}
                />
              );
            }

            if (block.form) {
              return (
                <IrixFormView
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
    </IrixRpcProvider>
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
  fixButton: {
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fixButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  sentText: {
    fontSize: 12,
    fontWeight: "600",
  },
  rawJson: {
    fontFamily: "monospace",
    fontSize: 11,
    padding: 8,
    borderRadius: 4,
  },
});

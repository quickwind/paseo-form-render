import type { PluginHostProps } from "@getpaseo/plugin/client";
import { useTranslation } from "@getpaseo/plugin/client";
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { formatIssues } from "../shared/form-errors";
import { buildFixMessage } from "../shared/form-fix";
import { parseFormBlock, parseMessageContent, type ParsedBlock } from "../shared/parser";
import { messages } from "./messages";
import { PfrFormView } from "./renderer";
import { HostMarkdown } from "./host-markdown";
import { PfrRpcProvider, type PfrRpcFn } from "./rpc-bridge";

export interface MessageContainerProps {
  text: string;
  theme: PluginHostProps["theme"];
  agentId?: string;
  rpc?: PfrRpcFn;
  onSubmit: (formattedMessage: string) => Promise<void> | void;
}

export interface FormBlockViewProps {
  rawJson: string;
  blockNumber: number;
  theme: PluginHostProps["theme"];
  agentId?: string;
  rpc?: PfrRpcFn;
  onSubmit: (formattedMessage: string) => Promise<void> | void;
}

interface FormErrorBoxProps {
  block: ParsedBlock;
  blockNumber: number;
  theme: PluginHostProps["theme"];
  onSubmit: MessageContainerProps["onSubmit"];
}

interface BlockErrorBoundaryProps {
  fallbackText?: string;
  children: React.ReactNode;
}

interface BlockErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

// ES5 class component for Hermes compatibility (Hermes throws syntax error on ES6 `class` keyword).
const BlockErrorBoundary: React.ComponentClass<BlockErrorBoundaryProps, BlockErrorBoundaryState> = function (
  this: any,
  props: BlockErrorBoundaryProps
) {
  (React.Component as any).call(this, props);
  this.state = { hasError: false, errorMessage: "" };
} as any;
BlockErrorBoundary.prototype = Object.create(React.Component.prototype);
BlockErrorBoundary.prototype.constructor = BlockErrorBoundary;
(BlockErrorBoundary as any).getDerivedStateFromError = function (error: any): BlockErrorBoundaryState {
  const msg = error instanceof Error ? error.message : String(error);
  return { hasError: true, errorMessage: msg };
};
BlockErrorBoundary.prototype.componentDidCatch = function (error: any, info: any) {
  console.warn("[paseo-form-render] Block render failed:", error, info?.componentStack);
};
BlockErrorBoundary.prototype.render = function (this: any) {
  if (this.state.hasError) {
    return (
      <View style={[styles.errorBox, { borderColor: "#ef4444", backgroundColor: "#fee2e2" }]}>
        <Text style={[styles.errorTitle, { color: "#dc2626" }]}>
          [UI Render Error]
        </Text>
        <Text style={[styles.errorDetail, { color: "#991b1b" }]}>
          {this.state.errorMessage}
        </Text>
        {this.props.fallbackText ? (
          <View style={styles.rawJsonBox}>
            <Text style={[styles.rawJsonText, { color: "#1f2937" }]}>
              {this.props.fallbackText}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }
  return this.props.children;
};

const FormErrorBox: React.FC<FormErrorBoxProps> = ({ block, blockNumber, theme, onSubmit }) => {
  const { t } = useTranslation(messages);
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
        {t("errorBox.title")}
      </Text>
      {formatIssues(errors).map((line, i) => (
        <Text key={i} style={[styles.errorDetail, { color: theme.colors.statusDanger }]}>
          {line}
        </Text>
      ))}
      <View
        style={[
          styles.rawJsonBox,
          {
            backgroundColor: theme.colors.surface1,
          },
        ]}
      >
        <Text
          style={[
            styles.rawJsonText,
            {
              color: theme.colors.foreground,
            },
          ]}
        >
          {block.rawJson}
        </Text>
      </View>
      {status === "sent" ? (
        <Text style={[styles.sentText, { color: theme.colors.statusSuccess }]}>
          {t("errorBox.fixRequested")}
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
            {status === "sending" ? t("errorBox.sending") : t("errorBox.askFix")}
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
    <PfrRpcProvider rpc={rpc}>
      {block.error ? (
        <FormErrorBox
          block={block}
          blockNumber={blockNumber}
          theme={theme}
          onSubmit={onSubmit}
        />
      ) : block.form ? (
        <PfrFormView
          form={block.form}
          theme={theme}
          agentId={agentId}
          onSubmit={onSubmit}
        />
      ) : null}
    </PfrRpcProvider>
  );
};

export const MessageContainer: React.FC<MessageContainerProps> = ({ text, theme, agentId, rpc, onSubmit }) => {
  const blocks = parseMessageContent(text);

  return (
    <PfrRpcProvider rpc={rpc}>
      <View style={styles.container} testID="assistant-message">
        {blocks.map((block, idx) => {
          if (block.type === "text" && block.content) {
            return (
              <BlockErrorBoundary key={idx} fallbackText={block.content}>
                <HostMarkdown
                  text={block.content}
                  theme={theme}
                />
              </BlockErrorBoundary>
            );
          }

          if (block.type === "form") {
            if (block.error) {
              return (
                <BlockErrorBoundary key={idx} fallbackText={block.rawJson ?? ""}>
                  <FormErrorBox
                    block={block}
                    blockNumber={blocks.slice(0, idx).filter((b) => b.type === "form").length + 1}
                    theme={theme}
                    onSubmit={onSubmit}
                  />
                </BlockErrorBoundary>
              );
            }

            if (block.form) {
              return (
                <BlockErrorBoundary key={idx} fallbackText={block.rawJson ?? ""}>
                  <PfrFormView
                    form={block.form}
                    theme={theme}
                    agentId={agentId}
                    onSubmit={onSubmit}
                  />
                </BlockErrorBoundary>
              );
            }
          }

          return null;
        })}
      </View>
    </PfrRpcProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
    width: "100%",
    ...(Platform.OS === "web" ? { userSelect: "text" as const } : {}),
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
  rawJsonBox: {
    padding: 8,
    borderRadius: 4,
  },
  rawJsonText: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 11,
  },
});

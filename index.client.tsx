import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import React from "react";
import { Platform } from "react-native";
import { z } from "zod";
import { hasFormBlock } from "./shared/parser";
import { MessageContainer } from "./client/container";
import { PfrSettingsScreen } from "./client/settings-screen";
import { showDemoForm } from "./shared/demo";
import { PFR_PROMPT_INSTRUCTION } from "./shared/prompt";

const timelineKind = "pfr-form";
const timelineDataSchema = z.object({
  text: z.string(),
});

export default function contribute(client: PluginClientContext) {
  function TimelineMessageView({
    item,
    agentId,
    theme,
  }: PluginTimelineItemProps<z.output<typeof timelineDataSchema>>) {
    const paseo = usePaseo();

    const handleSubmit = async (formattedMessage: string) => {
      await paseo.agents.ref(agentId).send(formattedMessage);
    };

    return (
      <MessageContainer
        text={item.data.text}
        theme={theme}
        agentId={agentId}
        rpc={client.rpc}
        onSubmit={handleSubmit}
      />
    );
  }
  // Transform assistant messages that include pfr-form fences across all platforms (web & mobile).
  client.addTimelineTransformer({
    id: "pfr-transformer",
    query: { itemType: "assistant_message" },
    transform({ item }) {
      if (!hasFormBlock(item.text)) {
        return;
      }
      return {
        items: [
          {
            type: "plugin",
            kind: timelineKind,
            version: 1,
            data: {
              text: item.text,
            },
          },
        ],
      };
    },
  });

  // Render plugin timeline items
  client.addTimelineRenderer({
    kind: timelineKind,
    version: 1,
    schema: timelineDataSchema,
    Component: TimelineMessageView,
  });

  // Host-level settings, including the automatic fix retry limit
  client.addSettingsScreen({
    id: "paseo-form-render-settings",
    title: "Paseo Form Render",
    icon: "Settings",
    Component: PfrSettingsScreen,
  });

  // Slash command to enable pfr-form in an existing agent session
  client.addSlashCommand({
    name: "form",
    description: "Instruct the agent to use pfr-form protocol",
    argumentHint: "[task]",
    context: "agent",
    async onSubmit({ args, paseo, agent }) {
      const task = args || "Please enable the pfr-form protocol and present interactive forms when applicable.";
      await paseo.agents.ref(agent.id).send(`${PFR_PROMPT_INSTRUCTION}\n\n${task}`);
    },
  });

  // Slash command to show a sample form
  client.addSlashCommand({
    name: "form-demo",
    description: "Show a demo interactive form",
    argumentHint: "",
    context: "agent",
    async onSubmit({ rpc, agent }) {
      await rpc(showDemoForm, { agentId: agent.id });
    },
  });

  return () => {};
}

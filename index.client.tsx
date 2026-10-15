import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import React from "react";
import { z } from "zod";
import { hasFormBlock } from "./shared/parser";
import { MessageContainer } from "./client/container";
import { IrixSettingsScreen } from "./client/settings-screen";
import { showDemoForm } from "./shared/demo";
import { IRIX_PROMPT_INSTRUCTION } from "./shared/prompt";

const timelineKind = "irix-ui-render";
const timelineDataSchema = z.object({
  text: z.string(),
});

function TimelineMessageView({
  item,
  agentId,
  theme,
}: PluginTimelineItemProps<z.output<typeof timelineDataSchema>>) {
  const paseo = usePaseo();

  const handleSubmit = async (formattedMessage: string) => {
    await paseo.agents.ref(agentId).send(formattedMessage);
  };

  return <MessageContainer text={item.data.text} theme={theme} agentId={agentId} onSubmit={handleSubmit} />;
}

export default function contribute(client: PluginClientContext) {
  // Transform assistant messages that include irix-form fences
  client.addTimelineTransformer({
    id: "irix-ui-transformer",
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

  // Render the transformed timeline item
  client.addTimelineRenderer({
    kind: timelineKind,
    version: 1,
    schema: timelineDataSchema,
    Component: TimelineMessageView,
  });

  // Host-level settings, including the automatic fix retry limit
  client.addSettingsScreen({
    id: "irix-ui-render-settings",
    title: "Irix UI Render",
    // A Lucide export name (PascalCase): the host throws on unknown names such as "settings", and
    // a throwing contribute() unloads the whole client plugin (no form rendering at all).
    icon: "Settings",
    Component: IrixSettingsScreen,
  });

  // Slash command to enable irix-form in an existing agent session
  client.addSlashCommand({
    name: "form",
    description: "Instruct the agent to use irix-form protocol",
    argumentHint: "[task]",
    context: "agent",
    async onSubmit({ args, paseo, agent }) {
      const task = args || "Please enable the irix-form protocol and present interactive forms when applicable.";
      await paseo.agents.ref(agent.id).send(`${IRIX_PROMPT_INSTRUCTION}\n\n${task}`);
    },
  });

  // Slash command to show a sample form: the daemon appends it to the timeline, the agent is not asked
  // anything, so it costs no model call and shows no raw JSON.
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

import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import React from "react";
import { z } from "zod";
import { hasFormBlock } from "./client/parser";
import { MessageContainer } from "./client/container";
import { showDemoForm } from "./shared/demo";
import { WUKONG_PROMPT_INSTRUCTION } from "./shared/prompt";

const timelineKind = "wukong-ui-render";
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
  // Transform assistant messages that include wukong-form fences
  client.addTimelineTransformer({
    id: "wukong-ui-transformer",
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

  // Slash command to enable wukong-form in an existing agent session
  client.addSlashCommand({
    name: "form",
    description: "Instruct the agent to use wukong-form protocol",
    argumentHint: "[task]",
    context: "agent",
    async onSubmit({ args, paseo, agent }) {
      const task = args || "Please enable the wukong-form protocol and present interactive forms when applicable.";
      await paseo.agents.ref(agent.id).send(`${WUKONG_PROMPT_INSTRUCTION}\n\n${task}`);
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

import type { PluginServerContext } from "@getpaseo/plugin/server";
import { appendDemoForm } from "./server/demo";
import { showDemoForm } from "./shared/demo";
import { WUKONG_PROMPT_INSTRUCTION } from "./shared/prompt";

export default function contribute(server: PluginServerContext) {
  // Inject instructions when a new agent is created
  server.before("agent.create", async ({ request }) => {
    const previous = request.config.systemPrompt ?? "";
    if (previous.includes("[wukong-ui-render]")) {
      return;
    }
    return {
      ...request,
      config: {
        ...request.config,
        systemPrompt: [previous, WUKONG_PROMPT_INSTRUCTION].filter(Boolean).join("\n\n"),
      },
    };
  });

  server.handle(showDemoForm, appendDemoForm);

  return () => {};
}

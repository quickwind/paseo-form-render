import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerAutoFix } from "./server/auto-fix";
import { appendDemoForm } from "./server/demo";
import { readIrixSettings, registerIrixSettings } from "./server/settings";
import { handleListProjectFiles, handleCreateDirectory } from "./server/file-picker";
import { showDemoForm } from "./shared/demo";
import { listProjectFilesRpc, createDirectoryRpc } from "./shared/pickers";
import { buildPromptInstruction } from "./shared/prompt";

export default function contribute(server: PluginServerContext) {
  const settings = registerIrixSettings(server);

  // Inject instructions when a new agent is created
  server.before("agent.create", async ({ request }) => {
    const previous = request.config.systemPrompt ?? "";
    if (previous.includes("[irix-ui-render]")) {
      return;
    }
    const { preferForms } = await readIrixSettings(settings);
    return {
      ...request,
      config: {
        ...request.config,
        systemPrompt: [previous, buildPromptInstruction({ preferForms })].filter(Boolean).join("\n\n"),
      },
    };
  });

  server.handle(showDemoForm, appendDemoForm);
  server.handle(listProjectFilesRpc, handleListProjectFiles);
  server.handle(createDirectoryRpc, handleCreateDirectory);

  const stopAutoFix = registerAutoFix(server, settings);

  return () => {
    stopAutoFix();
  };
}

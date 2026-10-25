import type { RpcInput } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { DEMO_FORM_TEXT, TIMELINE_KIND, type showDemoForm } from "../shared/demo";

type Paseo = Parameters<Parameters<PluginServerContext["handle"]>[1]>[1]["paseo"];

/** Adds the demo form as a row the form renderer draws; the agent is not prompted. */
export async function appendDemoForm(
  { agentId }: RpcInput<typeof showDemoForm>,
  { paseo }: { paseo: Paseo },
) {
  await paseo.agents.ref(agentId).timeline.append({
    type: "plugin",
    id: `pfr-form-demo-${Date.now()}`,
    kind: TIMELINE_KIND,
    version: 1,
    data: { text: DEMO_FORM_TEXT },
  });
  return {};
}

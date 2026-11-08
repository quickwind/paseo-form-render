// Lifecycle hooks under both naming schemes. Paseo 0.14+ registers hooks with `addHook` and
// renamed events ("agent.turn.after", "agent.create.before"); the older `on`/`before` API with
// "agent.turn_ended"/"agent.create" still works there but is deprecated and removed after
// 2027-04-30. Paseo 0.13 only has the old API. Use the new one whenever the host offers it.
import type {
  PluginBeforeRequests,
  PluginHookContext,
  PluginLifecycleEvents,
  PluginServerContext,
} from "@getpaseo/plugin/server";

type Unregister = () => void;

export type TurnEndedHandler = (
  event: PluginLifecycleEvents["agent.turn_ended"],
  context: PluginHookContext,
) => void | Promise<void>;

export type AgentCreateHandler = (
  input: { request: PluginBeforeRequests["agent.create"] },
  context: PluginHookContext,
) => PluginBeforeRequests["agent.create"] | void | Promise<PluginBeforeRequests["agent.create"] | void>;

interface NewHookApi {
  addHook(name: string, handler: (payload: never, context: PluginHookContext) => unknown): Unregister;
}

function hasAddHook(server: unknown): server is NewHookApi {
  return typeof (server as Partial<NewHookApi> | null)?.addHook === "function";
}

/** Runs `handler` after each agent turn ends. */
export function onTurnEnded(server: PluginServerContext, handler: TurnEndedHandler): Unregister {
  if (hasAddHook(server)) return server.addHook("agent.turn.after", handler as never);
  return server.on("agent.turn_ended", handler);
}

/** Lets `handler` rewrite the request (e.g. the system prompt) before an agent is created. */
export function beforeAgentCreate(server: PluginServerContext, handler: AgentCreateHandler): Unregister {
  if (hasAddHook(server)) return server.addHook("agent.create.before", handler as never);
  return server.before("agent.create", handler);
}

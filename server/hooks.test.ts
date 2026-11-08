import { describe, expect, it, vi } from "vitest";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { beforeAgentCreate, onTurnEnded } from "./hooks";

const handler = () => {};

describe("lifecycle hook compatibility", () => {
  it("uses the renamed hooks when the host has addHook", () => {
    const stop = () => {};
    const server = { addHook: vi.fn(() => stop), on: vi.fn(), before: vi.fn() };
    expect(onTurnEnded(server as unknown as PluginServerContext, handler)).toBe(stop);
    beforeAgentCreate(server as unknown as PluginServerContext, handler);
    expect(server.addHook).toHaveBeenCalledWith("agent.turn.after", handler);
    expect(server.addHook).toHaveBeenCalledWith("agent.create.before", handler);
    expect(server.on).not.toHaveBeenCalled();
    expect(server.before).not.toHaveBeenCalled();
  });

  it("falls back to the legacy names on a host without addHook (Paseo 0.13)", () => {
    const stop = () => {};
    const server = { on: vi.fn(() => stop), before: vi.fn(() => stop) };
    expect(onTurnEnded(server as unknown as PluginServerContext, handler)).toBe(stop);
    expect(beforeAgentCreate(server as unknown as PluginServerContext, handler)).toBe(stop);
    expect(server.on).toHaveBeenCalledWith("agent.turn_ended", handler);
    expect(server.before).toHaveBeenCalledWith("agent.create", handler);
  });
});

import type { PluginRpcContract } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import React, { createContext, useContext } from "react";
import type { ZodType, input as ZodInput, output as ZodOutput } from "zod";

export type PfrRpcFn = PluginClientContext["rpc"];

const PfrRpcContext = createContext<PfrRpcFn | null>(null);

export const PfrRpcProvider: React.FC<{ rpc?: PfrRpcFn; children: React.ReactNode }> = ({
  rpc,
  children,
}) => {
  if (!rpc) return <>{children}</>;
  return <PfrRpcContext.Provider value={rpc}>{children}</PfrRpcContext.Provider>;
};

export function usePfrRpc<InputSchema extends ZodType, OutputSchema extends ZodType>(
  contract: PluginRpcContract<InputSchema, OutputSchema>,
): (input: ZodInput<InputSchema>) => Promise<ZodOutput<OutputSchema>> {
  const customRpc = useContext(PfrRpcContext);
  if (customRpc) {
    return (input: ZodInput<InputSchema>) => customRpc(contract, input);
  }
  return useRpc(contract);
}

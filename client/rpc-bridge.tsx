import type { PluginRpcContract } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import React, { createContext, useContext } from "react";
import type { ZodType, input as ZodInput, output as ZodOutput } from "zod";

export type IrixRpcFn = PluginClientContext["rpc"];

const IrixRpcContext = createContext<IrixRpcFn | null>(null);

export const IrixRpcProvider: React.FC<{ rpc?: IrixRpcFn; children: React.ReactNode }> = ({
  rpc,
  children,
}) => {
  if (!rpc) return <>{children}</>;
  return <IrixRpcContext.Provider value={rpc}>{children}</IrixRpcContext.Provider>;
};

export function useIrixRpc<InputSchema extends ZodType, OutputSchema extends ZodType>(
  contract: PluginRpcContract<InputSchema, OutputSchema>,
): (input: ZodInput<InputSchema>) => Promise<ZodOutput<OutputSchema>> {
  const customRpc = useContext(IrixRpcContext);
  if (customRpc) {
    return (input: ZodInput<InputSchema>) => customRpc(contract, input);
  }
  return useRpc(contract);
}

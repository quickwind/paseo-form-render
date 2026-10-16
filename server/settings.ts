import type { PluginServerContext } from "@getpaseo/plugin/server";
import { DEFAULT_AUTO_FIX_RETRIES, DEFAULT_PREFER_FORMS, irixSettings } from "../shared/settings";

export function registerIrixSettings(server: PluginServerContext) {
  return server.registerSettings(irixSettings);
}

export type IrixSettingsHandle = ReturnType<typeof registerIrixSettings>;

export interface IrixSettingsValues {
  autoFixMaxRetries: number;
  preferForms: boolean;
}

const DEFAULT_VALUES: IrixSettingsValues = { autoFixMaxRetries: DEFAULT_AUTO_FIX_RETRIES, preferForms: DEFAULT_PREFER_FORMS };

/** Reads the saved settings, falling back to the defaults when they cannot be loaded. */
export async function readIrixSettings(settings: IrixSettingsHandle): Promise<IrixSettingsValues> {
  try {
    const state = await settings.read();
    if (state.status === "ready") return state.values;
  } catch (error) {
    console.warn("[irix-ui-render] could not read settings, using defaults", error);
  }
  return DEFAULT_VALUES;
}

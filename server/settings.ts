import type { PluginServerContext } from "@getpaseo/plugin/server";
import { DEFAULT_AUTO_FIX_RETRIES, DEFAULT_PREFER_FORMS, pfrSettings } from "../shared/settings";

export function registerPfrSettings(server: PluginServerContext) {
  return server.registerSettings(pfrSettings);
}

export type PfrSettingsHandle = ReturnType<typeof registerPfrSettings>;

export interface PfrSettingsValues {
  autoFixMaxRetries: number;
  preferForms: boolean;
}

const DEFAULT_VALUES: PfrSettingsValues = { autoFixMaxRetries: DEFAULT_AUTO_FIX_RETRIES, preferForms: DEFAULT_PREFER_FORMS };

/** Reads the saved settings, falling back to the defaults when they cannot be loaded. */
export async function readPfrSettings(settings: PfrSettingsHandle): Promise<PfrSettingsValues> {
  try {
    const state = await settings.read();
    if (state.status === "ready") return state.values;
  } catch (error) {
    console.warn("[paseo-form-render] could not read settings, using defaults", error);
  }
  return DEFAULT_VALUES;
}

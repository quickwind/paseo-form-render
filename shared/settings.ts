import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const MAX_AUTO_FIX_RETRIES = 5;
export const DEFAULT_AUTO_FIX_RETRIES = 2;

export const irixSettings = defineSettings({
  id: "irix-ui-render",
  scope: "host",
  version: 1,
  schema: z.object({
    /** How many times the agent is asked to repair an invalid irix-form block in a row. 0 disables auto-fix. */
    autoFixMaxRetries: z.number().int().min(0).max(MAX_AUTO_FIX_RETRIES).default(DEFAULT_AUTO_FIX_RETRIES),
    /** When on, the injected prompt requires agents to ask for user input with irix-form instead of plain text. */
    preferForms: z.boolean().default(false),
  }),
});

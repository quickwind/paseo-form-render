import * as hostUi from "@getpaseo/plugin/client/ui";

/**
 * Copies `text` with the host's clipboard primitive. Never throws: hosts without `copyText`, a
 * rejected promise and a synchronous throw all resolve to `false`. The export is looked up per
 * call so an older host that lacks it cannot break loading the plugin.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const copy = (hostUi as { copyText?: unknown }).copyText;
    if (typeof copy !== "function") return false;
    await (copy as (value: string) => Promise<void>)(text);
    return true;
  } catch {
    return false;
  }
}

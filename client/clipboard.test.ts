import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({}) as { copyText?: unknown });
vi.mock("@getpaseo/plugin/client/ui", () => host);

import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
  beforeEach(() => {
    delete host.copyText;
  });

  it("passes the text to the host and reports success", async () => {
    const copyText = vi.fn(async () => {});
    host.copyText = copyText;
    expect(await copyToClipboard("npm test")).toBe(true);
    expect(copyText).toHaveBeenCalledWith("npm test");
  });

  it("reports failure when the host rejects", async () => {
    host.copyText = async () => {
      throw new Error("denied");
    };
    expect(await copyToClipboard("x")).toBe(false);
  });

  it("reports failure when the host throws synchronously", async () => {
    host.copyText = () => {
      throw new Error("sync");
    };
    expect(await copyToClipboard("x")).toBe(false);
  });

  it("reports failure on a host without copyText", async () => {
    expect(await copyToClipboard("x")).toBe(false);
  });
});

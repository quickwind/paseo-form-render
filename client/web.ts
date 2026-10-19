import type { PluginClientContext, PluginHostProps } from "@getpaseo/plugin/client";
import React from "react";
import * as ReactNative from "react-native";
import { Platform } from "react-native";
import { FormBlockView } from "./container";

interface WebNode {
  nodeType: number;
  nodeValue: string | null;
  textContent: string | null;
  childNodes: ArrayLike<WebNode>;
  parentNode: WebNode | null;
}

interface WebElement extends WebNode {
  id: string;
  isConnected: boolean;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  appendChild(child: WebNode): WebNode;
  remove(): void;
  closest(selector: string): WebElement | null;
  querySelector(selector: string): WebElement | null;
  querySelectorAll(selector: string): ArrayLike<WebElement>;
}

interface WebDocument {
  head: WebElement | null;
  body: WebElement | null;
  createElement(tag: string): WebElement;
  getElementById(id: string): WebElement | null;
  querySelectorAll(selector: string): ArrayLike<WebElement>;
}

interface WebWindow {
  location?: {
    pathname?: string;
  };
}

interface WebMutationObserver {
  observe(
    target: WebNode,
    options: { childList?: boolean; subtree?: boolean; characterData?: boolean },
  ): void;
  disconnect(): void;
}

declare const document: WebDocument | undefined;
declare const window: WebWindow | undefined;
declare const MutationObserver:
  | (new (callback: () => void) => WebMutationObserver)
  | undefined;

interface WebReactRoot {
  render(element: React.ReactElement): void;
  unmount(): void;
}

const rnRender = (
  ReactNative as unknown as {
    render?: (element: React.ReactElement, container: WebElement) => WebReactRoot;
  }
).render;

const WEB_THEME: PluginHostProps["theme"] = {
  colors: {
    surface0: "var(--colors-surface0)",
    surface1: "var(--colors-surface1)",
    surface2: "var(--colors-surface2)",
    border: "var(--colors-border)",
    foreground: "var(--colors-foreground)",
    foregroundMuted: "var(--colors-foreground-muted)",
    accent: "var(--colors-accent)",
    accentForeground: "var(--colors-accent-foreground)",
    statusSuccess: "var(--colors-status-success)",
    statusWarning: "var(--colors-status-warning)",
    statusDanger: "var(--colors-status-danger)",
  },
};

const FORM_PRE_SELECTOR =
  '[data-paseo-markdown-tag="pre"][data-paseo-markdown-language="irix-form"], [data-paseo-markdown-tag="pre"][data-paseo-markdown-language="irix-ui"]';

const STYLE_ELEMENT_ID = "irix-ui-render-web-styles";

const WEB_CSS = `
[data-paseo-markdown-tag="pre"][data-paseo-markdown-language="irix-form"],
[data-paseo-markdown-tag="pre"][data-paseo-markdown-language="irix-ui"] {
  background-color: transparent !important;
  border-width: 0px !important;
  padding: 0px !important;
  overflow: visible !important;
}
[data-paseo-markdown-tag="pre"][data-paseo-markdown-language="irix-form"] > [data-paseo-markdown-tag="code"],
[data-paseo-markdown-tag="pre"][data-paseo-markdown-language="irix-ui"] > [data-paseo-markdown-tag="code"],
[data-paseo-markdown-tag="pre"][data-paseo-markdown-language="irix-form"] > [data-paseo-markdown-ignore="true"]:not([data-irix-form-mount="true"]),
[data-paseo-markdown-tag="pre"][data-paseo-markdown-language="irix-ui"] > [data-paseo-markdown-ignore="true"]:not([data-irix-form-mount="true"]) {
  display: none !important;
}
`;

interface FiberLike {
  return?: FiberLike | null;
  memoizedProps?: Record<string, unknown> | null;
}

function getReactFiber(el: WebElement): FiberLike | null {
  const record = el as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key.startsWith("__reactFiber$")) {
      return (record[key] as FiberLike) ?? null;
    }
  }
  return null;
}

function extractFiberContext(preEl: WebElement): { code?: string; agentId?: string } {
  let fiber = getReactFiber(preEl);
  let code: string | undefined;
  let agentId: string | undefined;
  let depth = 0;

  while (fiber && depth < 60) {
    const props = fiber.memoizedProps;
    if (props && typeof props === "object") {
      if (code === undefined && typeof props.code === "string") {
        code = props.code;
      }
      if (agentId === undefined) {
        if (typeof props.agentId === "string" && props.agentId) {
          agentId = props.agentId;
        } else if (typeof props.occurrenceKey === "string" && props.occurrenceKey.includes(":")) {
          const candidate = props.occurrenceKey.split(":")[0];
          if (candidate) agentId = candidate;
        }
      }
      if (code !== undefined && agentId !== undefined) {
        break;
      }
    }
    fiber = fiber.return ?? null;
    depth++;
  }

  if (!agentId && typeof window !== "undefined" && window?.location?.pathname) {
    const match = window.location.pathname.match(/\/agent\/([^/?#]+)/);
    if (match?.[1]) {
      agentId = decodeURIComponent(match[1]);
    }
  }

  return { code, agentId };
}

function readAndBlankTextNodes(node: WebNode): string {
  if (node.nodeType === 3) {
    const val = node.nodeValue ?? "";
    if (val !== "") {
      node.nodeValue = "";
    }
    return val;
  }
  let acc = "";
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    acc += readAndBlankTextNodes(children[i]);
  }
  return acc;
}

function computeBlockNumber(preEl: WebElement): number {
  const messageEl =
    preEl.closest("[data-message-id]") ?? preEl.closest('[data-testid="assistant-message"]');
  if (!messageEl) return 1;
  const allBlocks = messageEl.querySelectorAll(FORM_PRE_SELECTOR);
  for (let i = 0; i < allBlocks.length; i++) {
    if (allBlocks[i] === preEl) {
      return i + 1;
    }
  }
  return 1;
}

interface MountedBlock {
  preEl: WebElement;
  mountEl: WebElement;
  root: WebReactRoot;
  code: string;
  agentId: string;
  blockNumber: number;
}

export function installWebFormMounter(client: PluginClientContext): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined" || !document || !rnRender) {
    return () => {};
  }

  const doc = document;
  if (!doc.getElementById(STYLE_ELEMENT_ID) && doc.head) {
    const styleEl = doc.createElement("style");
    styleEl.id = STYLE_ELEMENT_ID;
    styleEl.textContent = WEB_CSS;
    doc.head.appendChild(styleEl);
  }

  const mounted = new Map<WebElement, MountedBlock>();
  let scheduled = false;
  let disposed = false;

  const renderBlock = (entry: MountedBlock) => {
    const handleSubmit = async (formattedMessage: string) => {
      if (!entry.agentId) return;
      await client.paseo.agents.ref(entry.agentId).send(formattedMessage);
    };

    entry.root.render(
      React.createElement(FormBlockView, {
        rawJson: entry.code,
        blockNumber: entry.blockNumber,
        theme: WEB_THEME,
        agentId: entry.agentId,
        onSubmit: handleSubmit,
        rpc: client.rpc,
      }),
    );
  };

  const scan = () => {
    scheduled = false;
    if (disposed) return;

    // 1. Clean up detached nodes
    for (const [preEl, entry] of Array.from(mounted.entries())) {
      if (!preEl.isConnected) {
        mounted.delete(preEl);
        try {
          entry.root.unmount();
        } catch {
          // Ignore unmount errors on already-detached trees
        }
      }
    }

    // 2. Discover and update active irix-form / irix-ui pre blocks
    const preNodes = doc.querySelectorAll(FORM_PRE_SELECTOR);
    for (let i = 0; i < preNodes.length; i++) {
      const preEl = preNodes[i];
      const codeEl = preEl.querySelector('[data-paseo-markdown-tag="code"]');
      const domText = codeEl ? readAndBlankTextNodes(codeEl) : "";
      const { code: fiberCode, agentId: resolvedAgentId } = extractFiberContext(preEl);
      const existing = mounted.get(preEl);

      const code = fiberCode ?? (domText || existing?.code || "");
      const agentId = resolvedAgentId ?? existing?.agentId ?? "";
      const blockNumber = computeBlockNumber(preEl);

      if (existing) {
        if (
          existing.code !== code ||
          existing.agentId !== agentId ||
          existing.blockNumber !== blockNumber
        ) {
          existing.code = code;
          existing.agentId = agentId;
          existing.blockNumber = blockNumber;
          renderBlock(existing);
        }
        continue;
      }

      const mountEl = doc.createElement("div");
      mountEl.setAttribute("data-irix-form-mount", "true");
      mountEl.setAttribute("data-paseo-markdown-ignore", "true");
      preEl.appendChild(mountEl);

      const root = rnRender(React.createElement(React.Fragment), mountEl);
      const entry: MountedBlock = {
        preEl,
        mountEl,
        root,
        code,
        agentId,
        blockNumber,
      };
      mounted.set(preEl, entry);
      renderBlock(entry);
    }
  };

  const scheduleScan = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    setTimeout(scan, 0);
  };

  scheduleScan();

  let observer: WebMutationObserver | null = null;
  if (typeof MutationObserver !== "undefined" && doc.body) {
    observer = new MutationObserver(() => {
      scheduleScan();
    });
    observer.observe(doc.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  return () => {
    disposed = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    for (const entry of Array.from(mounted.values())) {
      try {
        entry.root.unmount();
        entry.mountEl.remove();
      } catch {
        // Ignore cleanup errors
      }
    }
    mounted.clear();
  };
}

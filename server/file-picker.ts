import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { RpcInput } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  type listProjectFilesRpc,
  type createDirectoryRpc,
  type FilePickerShortcut,
} from "../shared/pickers";

type Paseo = Parameters<Parameters<PluginServerContext["handle"]>[1]>[1]["paseo"];

export async function handleListProjectFiles(
  { agentId, subPath, targetPath }: RpcInput<typeof listProjectFilesRpc>,
  { paseo }: { paseo: Paseo },
) {
  try {
    const agent = paseo.agents.ref(agentId);
    let cwd: string | null | undefined = agent?.cwd;
    if (!cwd) {
      if (agent) {
        const snapshot = await agent.refresh();
        cwd = snapshot?.agent?.cwd;
      }
      if (!cwd) {
        cwd = process.cwd();
      }
    }

    const homeDir = os.homedir();
    const shortcuts: FilePickerShortcut[] = [
      { id: "project", label: "Project", icon: "📁", path: cwd },
      { id: "home", label: "Home", icon: "🏠", path: homeDir },
    ];
    const desktopDir = path.join(homeDir, "Desktop");
    if (fs.existsSync(desktopDir)) {
      shortcuts.push({ id: "desktop", label: "Desktop", icon: "🖥️", path: desktopDir });
    }
    const downloadsDir = path.join(homeDir, "Downloads");
    if (fs.existsSync(downloadsDir)) {
      shortcuts.push({ id: "downloads", label: "Downloads", icon: "📥", path: downloadsDir });
    }

    // OneDrive detection: check Windows env vars (OneDrive, OneDriveCommercial, OneDriveConsumer) or ~/OneDrive
    const oneDriveCandidates = [
      { id: "onedrive", label: "OneDrive", path: process.env.OneDrive },
      { id: "onedrive-commercial", label: "OneDrive (Work)", path: process.env.OneDriveCommercial },
      { id: "onedrive-consumer", label: "OneDrive (Personal)", path: process.env.OneDriveConsumer },
    ];

    const addedOneDrivePaths = new Set<string>();
    for (const item of oneDriveCandidates) {
      if (item.path && !addedOneDrivePaths.has(item.path)) {
        try {
          if (fs.existsSync(item.path)) {
            addedOneDrivePaths.add(item.path);
            shortcuts.push({
              id: item.id,
              label: item.label,
              icon: "☁️",
              path: item.path,
            });
          }
        } catch {}
      }
    }

    if (addedOneDrivePaths.size === 0) {
      const defaultOneDrive = path.join(homeDir, "OneDrive");
      try {
        if (fs.existsSync(defaultOneDrive)) {
          shortcuts.push({
            id: "onedrive",
            label: "OneDrive",
            icon: "☁️",
            path: defaultOneDrive,
          });
        }
      } catch {}
    }

    let rawPath = (targetPath !== undefined && targetPath !== null && targetPath !== "")
      ? targetPath
      : (subPath || "");

    let targetDir: string;
    if (rawPath.startsWith("~")) {
      targetDir = path.resolve(homeDir, rawPath.slice(1).replace(/^[/\\]/, ""));
    } else if (path.isAbsolute(rawPath)) {
      targetDir = path.resolve(rawPath);
    } else if (rawPath) {
      targetDir = path.resolve(cwd, rawPath);
    } else {
      targetDir = cwd;
    }

    try {
      const stat = await fs.promises.stat(targetDir);
      if (!stat.isDirectory()) {
        targetDir = path.dirname(targetDir);
      }
    } catch {
      targetDir = cwd;
    }

    const relToCwd = path.relative(cwd, targetDir);
    const isWorkspaceRelative =
      !relToCwd.startsWith("..") && !path.isAbsolute(relToCwd);

    const currentPath = isWorkspaceRelative
      ? (relToCwd ? relToCwd.replace(/\\/g, "/") : "")
      : targetDir.replace(/\\/g, "/");

    let parentPath: string | null = null;
    if (isWorkspaceRelative) {
      if (currentPath) {
        const parentResolved = path.dirname(targetDir);
        const relParent = path.relative(cwd, parentResolved).replace(/\\/g, "/");
        parentPath = relParent === "" ? "" : relParent;
      }
    } else {
      const parentDir = path.dirname(targetDir);
      if (parentDir !== targetDir) {
        parentPath = parentDir.replace(/\\/g, "/");
      }
    }

    let entries: { name: string; isDirectory: boolean; relativePath: string; fullPath: string }[] = [];
    let readError: string | undefined;

    try {
      const dirents = await fs.promises.readdir(targetDir, { withFileTypes: true });
      entries = dirents
        .filter((d) => !d.name.startsWith(".") && d.name !== "node_modules")
        .map((d) => {
          const fullPath = path.join(targetDir, d.name);
          const entryRelToCwd = path.relative(cwd, fullPath);
          const entryInsideCwd =
            !entryRelToCwd.startsWith("..") && !path.isAbsolute(entryRelToCwd);
          const relativePath = entryInsideCwd
            ? entryRelToCwd.replace(/\\/g, "/")
            : fullPath.replace(/\\/g, "/");
          return {
            name: d.name,
            isDirectory: d.isDirectory(),
            relativePath,
            fullPath: fullPath.replace(/\\/g, "/"),
          };
        })
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
    } catch (e) {
      readError = e instanceof Error ? e.message : String(e);
    }

    return {
      currentPath,
      parentPath,
      entries,
      shortcuts,
      isWorkspaceRelative,
      error: readError,
    };
  } catch (err) {
    return {
      currentPath: "",
      parentPath: null,
      entries: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function handleCreateDirectory(
  { agentId, parentPath, name }: RpcInput<typeof createDirectoryRpc>,
  { paseo }: { paseo: Paseo },
) {
  try {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { success: false, error: "Folder name cannot be empty." };
    }
    if (
      trimmedName === "." ||
      trimmedName === ".." ||
      trimmedName.includes("/") ||
      trimmedName.includes("\\") ||
      /[<>:"|?*]/.test(trimmedName)
    ) {
      return { success: false, error: "Folder name contains invalid characters." };
    }

    const agent = paseo.agents.ref(agentId);
    let cwd: string | null | undefined = agent?.cwd;
    if (!cwd) {
      if (agent) {
        const snapshot = await agent.refresh();
        cwd = snapshot?.agent?.cwd;
      }
      if (!cwd) {
        cwd = process.cwd();
      }
    }

    const homeDir = os.homedir();
    let targetDir: string;
    if (parentPath.startsWith("~")) {
      targetDir = path.resolve(homeDir, parentPath.slice(1).replace(/^[/\\]/, ""));
    } else if (path.isAbsolute(parentPath)) {
      targetDir = path.resolve(parentPath);
    } else if (parentPath) {
      targetDir = path.resolve(cwd, parentPath);
    } else {
      targetDir = cwd;
    }

    const newFullPath = path.join(targetDir, trimmedName);

    if (path.dirname(newFullPath) !== targetDir) {
      return { success: false, error: "Invalid target path." };
    }

    if (fs.existsSync(newFullPath)) {
      return { success: false, error: "A folder or file with this name already exists." };
    }

    await fs.promises.mkdir(newFullPath, { recursive: false });

    const relToCwd = path.relative(cwd, newFullPath);
    const isWorkspaceRelative =
      !relToCwd.startsWith("..") && !path.isAbsolute(relToCwd);

    const relativePath = isWorkspaceRelative
      ? (relToCwd ? relToCwd.replace(/\\/g, "/") : "")
      : newFullPath.replace(/\\/g, "/");

    return {
      success: true,
      fullPath: newFullPath.replace(/\\/g, "/"),
      relativePath,
    };
  } catch (err: any) {
    if (err?.code === "EACCES" || err?.code === "EPERM") {
      return { success: false, error: "Permission denied: unable to create folder in this location." };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}


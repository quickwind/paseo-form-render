import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const ProjectFileEntrySchema = z.object({
  name: z.string(),
  isDirectory: z.boolean(),
  relativePath: z.string(),
  fullPath: z.string().optional(),
});
export type ProjectFileEntry = z.infer<typeof ProjectFileEntrySchema>;

export const FilePickerShortcutSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
  path: z.string(),
});
export type FilePickerShortcut = z.infer<typeof FilePickerShortcutSchema>;

export const listProjectFilesRpc = defineRpc({
  name: "irix-ui.list-project-files",
  input: z.object({
    agentId: z.string(),
    subPath: z.string().optional(),
    targetPath: z.string().optional(),
  }),
  output: z.object({
    currentPath: z.string(),
    parentPath: z.string().nullable(),
    entries: z.array(ProjectFileEntrySchema),
    shortcuts: z.array(FilePickerShortcutSchema).optional(),
    isWorkspaceRelative: z.boolean().optional(),
    error: z.string().optional(),
  }),
});

export const createDirectoryRpc = defineRpc({
  name: "irix-ui.create-directory",
  input: z.object({
    agentId: z.string(),
    parentPath: z.string().min(1),
    name: z.string().min(1),
  }),
  output: z.object({
    success: z.boolean(),
    fullPath: z.string().optional(),
    relativePath: z.string().optional(),
    error: z.string().optional(),
  }),
});

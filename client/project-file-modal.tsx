import type { PluginHostProps } from "@getpaseo/plugin/client";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  listProjectFilesRpc,
  createDirectoryRpc,
  type ProjectFileEntry,
  type FilePickerShortcut,
} from "../shared/pickers";
import { normalizeExtensions } from "../shared/schema";
import { useIrixRpc } from "./rpc-bridge";

interface ProjectFileModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (selectedPath: string) => void;
  agentId?: string;
  pickerType?: "file" | "folder";
  extensions?: string[] | string;
  extension?: string;
  initialPath?: string;
  theme: PluginHostProps["theme"];
}

export function ProjectFileModal({
  visible,
  onClose,
  onSelect,
  agentId,
  pickerType = "file",
  extensions,
  extension,
  initialPath,
  theme,
}: ProjectFileModalProps) {
  const listProjectFiles = useIrixRpc(listProjectFilesRpc);
  const createDir = useIrixRpc(createDirectoryRpc);
  const [currentPath, setCurrentPath] = useState("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<ProjectFileEntry[]>([]);
  const [shortcuts, setShortcuts] = useState<FilePickerShortcut[]>([]);
  const [isWorkspaceRelative, setIsWorkspaceRelative] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolderLoading, setCreatingFolderLoading] = useState(false);
  const [newFolderError, setNewFolderError] = useState<string | null>(null);

  const cleanExts = useMemo(
    () => (pickerType === "folder" ? undefined : normalizeExtensions(extensions, extension)),
    [pickerType, extensions, extension],
  );

  useEffect(() => {
    if (!visible) return;
    const initPath = initialPath?.trim() || "";
    const initDir =
      initPath.includes("/") || initPath.includes("\\")
        ? initPath.replace(/[/\\][^/\\]*$/, "")
        : "";
    setSelectedPath(initPath);
    loadDirectory(initDir);
  }, [visible, initialPath]);

  async function loadDirectory(targetPath: string) {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    setSearch("");
    setIsCreatingFolder(false);
    setNewFolderError(null);
    try {
      const res = await listProjectFiles({ agentId, targetPath });
      if (res.parentPath !== undefined) {
        setParentPath(res.parentPath);
      }
      if (res.currentPath !== undefined) {
        setCurrentPath(res.currentPath);
      }
      if (res.shortcuts) {
        setShortcuts(res.shortcuts);
      }
      if (res.isWorkspaceRelative !== undefined) {
        setIsWorkspaceRelative(res.isWorkspaceRelative);
      }

      if (res.error) {
        setError(res.error);
        setEntries([]);
      } else {
        setEntries(res.entries);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const handleCreateFolderSubmit = async () => {
    if (!agentId || !newFolderName.trim() || creatingFolderLoading) return;
    const name = newFolderName.trim();
    if (/[<>:"/\\|?*]/.test(name) || name === "." || name === "..") {
      setNewFolderError('Folder name contains invalid characters (/ \\ : * ? " < > |).');
      return;
    }
    setCreatingFolderLoading(true);
    setNewFolderError(null);
    try {
      const res = await createDir({
        agentId,
        parentPath: currentPath || "",
        name,
      });
      if (res.success && res.fullPath) {
        setIsCreatingFolder(false);
        setNewFolderName("");
        setNewFolderError(null);
        await loadDirectory(res.fullPath);
        if (pickerType === "folder") {
          setSelectedPath(res.relativePath || res.fullPath);
        }
      } else {
        setNewFolderError(res.error || "Failed to create folder.");
      }
    } catch (err) {
      setNewFolderError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingFolderLoading(false);
    }
  };

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(query));
    }
    if (cleanExts && cleanExts.length > 0) {
      result = result.filter((e) => {
        if (e.isDirectory) return true;
        const nameLower = e.name.toLowerCase();
        return cleanExts.some((ext) => nameLower.endsWith("." + ext));
      });
    }
    return result;
  }, [entries, search, cleanExts]);

  const breadcrumbs = useMemo(() => {
    if (isWorkspaceRelative) {
      if (!currentPath) return [{ label: "Project Root", path: "" }];
      const parts = currentPath.split("/").filter(Boolean);
      const crumbs = [{ label: "Project", path: "" }];
      let accum = "";
      for (const part of parts) {
        accum = accum ? `${accum}/${part}` : part;
        crumbs.push({ label: part, path: accum });
      }
      return crumbs;
    } else {
      const isWindows = /^[a-zA-Z]:/.test(currentPath);
      const parts = currentPath.split(/[/\\]/).filter(Boolean);
      const crumbs: { label: string; path: string }[] = [];
      if (isWindows) {
        const drive = parts[0];
        crumbs.push({ label: drive, path: drive + "\\" });
        let accum = drive + "\\";
        for (let i = 1; i < parts.length; i++) {
          accum = accum + (accum.endsWith("\\") ? "" : "\\") + parts[i];
          crumbs.push({ label: parts[i], path: accum });
        }
      } else {
        crumbs.push({ label: "/", path: "/" });
        let accum = "";
        for (const part of parts) {
          accum = `${accum}/${part}`;
          crumbs.push({ label: part, path: accum });
        }
      }
      return crumbs;
    }
  }, [currentPath, isWorkspaceRelative]);

  const handleEntryPress = (entry: ProjectFileEntry) => {
    if (entry.isDirectory) {
      loadDirectory(entry.fullPath || entry.relativePath);
      if (pickerType === "folder") {
        setSelectedPath(entry.relativePath);
      }
    } else {
      if (pickerType !== "folder") {
        setSelectedPath(entry.relativePath);
      }
    }
  };

  const effectiveSelected =
    selectedPath || (pickerType === "folder" ? currentPath || "." : "");

  const handleConfirm = () => {
    if (effectiveSelected) {
      onSelect(effectiveSelected);
      onClose();
    }
  };

  const colors = theme.colors;

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.surface0, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, marginRight: 8 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {pickerType === "folder" ? "Select Folder" : "Select File"}
              </Text>
              {cleanExts && cleanExts.length > 0 && (
                <View style={[styles.filterBadge, { backgroundColor: colors.surface1, borderColor: colors.border }]}>
                  <Text style={[styles.filterBadgeText, { color: colors.accent }]}>
                    {cleanExts.map((e) => `.${e}`).join(", ")}
                  </Text>
                </View>
              )}
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={{ color: colors.foregroundMuted, fontSize: 18, fontWeight: "600" }}>✕</Text>
            </Pressable>
          </View>

          {/* Quick Shortcuts Bar */}
          {shortcuts.length > 0 && (
            <View style={[styles.shortcutsBar, { borderBottomColor: colors.border, backgroundColor: colors.surface1 }]}>
              <Text style={[styles.shortcutsLabel, { color: colors.foregroundMuted }]}>Quick:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcutsList}>
                {shortcuts.map((sc) => (
                  <Pressable
                    key={sc.id}
                    onPress={() => loadDirectory(sc.path)}
                    style={[
                      styles.shortcutPill,
                      {
                        backgroundColor: colors.surface2,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.shortcutIcon}>{sc.icon}</Text>
                    <Text style={[styles.shortcutText, { color: colors.foreground }]}>{sc.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Breadcrumbs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.breadcrumbBar}>
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.path}>
                {idx > 0 && <Text style={{ color: colors.foregroundMuted, marginHorizontal: 4 }}>/</Text>}
                <Pressable onPress={() => loadDirectory(crumb.path)}>
                  <Text
                    style={{
                      color: idx === breadcrumbs.length - 1 ? colors.foreground : colors.accent,
                      fontWeight: idx === breadcrumbs.length - 1 ? "600" : "normal",
                      fontSize: 13,
                    }}
                  >
                    {crumb.label}
                  </Text>
                </Pressable>
              </React.Fragment>
            ))}
          </ScrollView>

          {/* Search Bar & Actions */}
          <View style={styles.searchContainer}>
            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.surface1,
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
              placeholder="Search files/folders in directory..."
              placeholderTextColor={colors.foregroundMuted}
              value={search}
              onChangeText={setSearch}
            />
            {pickerType === "folder" && (
              <Pressable
                onPress={() => {
                  setIsCreatingFolder((prev) => !prev);
                  setNewFolderName("");
                  setNewFolderError(null);
                }}
                style={[
                  styles.newFolderBtn,
                  {
                    backgroundColor: isCreatingFolder ? colors.surface2 : colors.surface1,
                    borderColor: isCreatingFolder ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: isCreatingFolder ? colors.accent : colors.foreground,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  📁+ New Folder
                </Text>
              </Pressable>
            )}
          </View>

          {/* Inline New Folder Creation Row */}
          {isCreatingFolder && (
            <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
              <View
                style={[
                  styles.newFolderRow,
                  {
                    backgroundColor: colors.surface1,
                    borderColor: newFolderError ? colors.statusDanger : colors.accent,
                  },
                ]}
              >
                <Text style={styles.entryIcon}>📁</Text>
                <TextInput
                  style={[
                    styles.newFolderInput,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.surface0,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="New folder name..."
                  placeholderTextColor={colors.foregroundMuted}
                  value={newFolderName}
                  onChangeText={(t) => {
                    setNewFolderName(t);
                    if (newFolderError) setNewFolderError(null);
                  }}
                  autoFocus
                  onSubmitEditing={handleCreateFolderSubmit}
                />
                <Pressable
                  disabled={creatingFolderLoading || !newFolderName.trim()}
                  onPress={handleCreateFolderSubmit}
                  style={[
                    styles.newFolderActionBtn,
                    {
                      backgroundColor: colors.accent,
                      opacity: creatingFolderLoading || !newFolderName.trim() ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: colors.surface0, fontSize: 12, fontWeight: "600" }}>
                    {creatingFolderLoading ? "..." : "Create"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setIsCreatingFolder(false);
                    setNewFolderName("");
                    setNewFolderError(null);
                  }}
                  style={[styles.newFolderActionBtn, { backgroundColor: colors.surface2 }]}
                >
                  <Text style={{ color: colors.foregroundMuted, fontSize: 12, fontWeight: "600" }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
              {newFolderError && (
                <Text style={{ color: colors.statusDanger, fontSize: 12, marginTop: 4 }}>
                  {newFolderError}
                </Text>
              )}
            </View>
          )}

          {/* Directory Content List */}
          <ScrollView style={styles.listContainer}>
            {parentPath !== null && (
              <Pressable
                style={[styles.entryRow, { borderBottomColor: colors.surface2 }]}
                onPress={() => loadDirectory(parentPath)}
              >
                <Text style={styles.entryIcon}>📁</Text>
                <Text style={{ color: colors.foregroundMuted, fontSize: 14 }}>.. (Up to parent)</Text>
              </Pressable>
            )}

            {loading ? (
              <Text style={[styles.emptyText, { color: colors.foregroundMuted }]}>Loading files...</Text>
            ) : error ? (
              <Text style={[styles.emptyText, { color: colors.statusDanger }]}>{error}</Text>
            ) : filteredEntries.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.foregroundMuted }]}>No matching entries found</Text>
            ) : (
              filteredEntries.map((entry) => {
                const isSelected = selectedPath === entry.relativePath;
                return (
                  <Pressable
                    key={entry.relativePath}
                    style={[
                      styles.entryRow,
                      {
                        backgroundColor: isSelected ? colors.surface2 : "transparent",
                        borderBottomColor: colors.surface1,
                      },
                    ]}
                    onPress={() => handleEntryPress(entry)}
                  >
                    <Text style={styles.entryIcon}>{entry.isDirectory ? "📁" : "📄"}</Text>
                    <Text
                      style={[
                        styles.entryName,
                        {
                          color: colors.foreground,
                          fontWeight: entry.isDirectory ? "600" : "normal",
                        },
                      ]}
                    >
                      {entry.name}
                    </Text>
                    {isSelected && (
                      <Text style={{ color: colors.accent, fontWeight: "600", fontSize: 13 }}>✓ Selected</Text>
                    )}
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1, marginRight: 10, overflow: "hidden" }}>
              <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>Selected:</Text>
              {effectiveSelected ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ alignItems: "center" }}
                  style={{ marginTop: 2 }}
                >
                  <Text
                    style={{ color: colors.foreground, fontSize: 13, fontWeight: "500" }}
                  >
                    {effectiveSelected}
                  </Text>
                </ScrollView>
              ) : (
                <Text
                  style={{
                    color: colors.foregroundMuted,
                    fontSize: 13,
                    fontStyle: "italic",
                    marginTop: 2,
                  }}
                >
                  (none selected)
                </Text>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={onClose}
                style={[styles.actionBtn, { borderColor: colors.border, borderWidth: 1 }]}
              >
                <Text style={{ color: colors.foreground, fontSize: 13 }}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirm}
                disabled={!effectiveSelected}
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: effectiveSelected ? colors.accent : colors.surface2,
                    opacity: effectiveSelected ? 1 : 0.6,
                  },
                ]}
              >
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
                  {pickerType === "folder" ? "Choose Folder" : "Choose File"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 720,
    maxHeight: "85%",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  filterBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  closeBtn: {
    padding: 4,
  },
  shortcutsBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  shortcutsLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  shortcutsList: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shortcutPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  shortcutIcon: {
    fontSize: 13,
  },
  shortcutText: {
    fontSize: 12,
    fontWeight: "500",
  },
  breadcrumbBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 40,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  newFolderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  newFolderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 6,
    gap: 8,
  },
  newFolderInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
  },
  newFolderActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  listContainer: {
    flex: 1,
    minHeight: 220,
    paddingHorizontal: 16,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  entryIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  entryName: {
    fontSize: 14,
    flex: 1,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 32,
    fontSize: 13,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});

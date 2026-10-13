import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { handleListProjectFiles, handleCreateDirectory } from "./file-picker";

describe("handleListProjectFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wukong-picker-test-"));
    fs.mkdirSync(path.join(tmpDir, "src", "nested"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
    fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "console.log('hi');");
    fs.writeFileSync(path.join(tmpDir, "src", "nested", "util.ts"), "export const x = 1;");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const mockContext = (agentCwd: string) => ({
    paseo: {
      agents: {
        ref: (agentId: string) => {
          if (agentId === "test-agent") {
            return { cwd: agentCwd };
          }
          return null;
        },
      },
    },
  });

  it("lists root directory entries sorted folders first", async () => {
    const res = await handleListProjectFiles(
      { agentId: "test-agent", subPath: "" },
      mockContext(tmpDir) as any,
    );

    expect(res.error).toBeUndefined();
    expect(res.parentPath).toBeNull();
    expect(res.entries.length).toBe(2);
    // Folders first: src then package.json
    expect(res.entries[0].name).toBe("src");
    expect(res.entries[0].isDirectory).toBe(true);
    expect(res.entries[0].relativePath).toBe("src");

    expect(res.entries[1].name).toBe("package.json");
    expect(res.entries[1].isDirectory).toBe(false);
    expect(res.entries[1].relativePath).toBe("package.json");
  });

  it("lists subPath directory entries and calculates parentPath", async () => {
    const res = await handleListProjectFiles(
      { agentId: "test-agent", subPath: "src" },
      mockContext(tmpDir) as any,
    );

    expect(res.error).toBeUndefined();
    expect(res.parentPath).toBe("");
    expect(res.entries.length).toBe(2);
    expect(res.entries[0].name).toBe("nested");
    expect(res.entries[0].isDirectory).toBe(true);
    expect(res.entries[0].relativePath).toBe("src/nested");

    expect(res.entries[1].name).toBe("index.ts");
    expect(res.entries[1].isDirectory).toBe(false);
    expect(res.entries[1].relativePath).toBe("src/index.ts");
  });

  it("supports targetPath outside workspace with full absolute paths and isWorkspaceRelative=false", async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "wukong-outside-test-"));
    fs.writeFileSync(path.join(outsideDir, "test.mp4"), "content");
    try {
      const res = await handleListProjectFiles(
        { agentId: "test-agent", targetPath: outsideDir },
        mockContext(tmpDir) as any,
      );

      expect(res.error).toBeUndefined();
      expect(res.isWorkspaceRelative).toBe(false);
      expect(res.shortcuts).toBeDefined();
      expect(res.shortcuts?.some((s) => s.id === "project")).toBe(true);
      expect(res.shortcuts?.some((s) => s.id === "home")).toBe(true);
      expect(res.entries.length).toBe(1);
      expect(res.entries[0].name).toBe("test.mp4");
      expect(res.entries[0].relativePath).toBe(path.join(outsideDir, "test.mp4").replace(/\\/g, "/"));
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("returns shortcuts and defaults to agent cwd when targetPath is empty", async () => {
    const res = await handleListProjectFiles(
      { agentId: "test-agent", targetPath: "" },
      mockContext(tmpDir) as any,
    );

    expect(res.error).toBeUndefined();
    expect(res.isWorkspaceRelative).toBe(true);
    expect(res.shortcuts).toBeDefined();
    expect(res.shortcuts?.[0].path).toBe(tmpDir);
  });

  it("detects OneDrive from environment variable and adds shortcut", async () => {
    const fakeOneDrive = fs.mkdtempSync(path.join(os.tmpdir(), "fake-onedrive-"));
    const originalEnv = process.env.OneDrive;
    process.env.OneDrive = fakeOneDrive;
    try {
      const res = await handleListProjectFiles(
        { agentId: "test-agent", targetPath: "" },
        mockContext(tmpDir) as any,
      );
      expect(res.shortcuts).toBeDefined();
      const oneDriveShortcut = res.shortcuts?.find((s) => s.id === "onedrive");
      expect(oneDriveShortcut).toBeDefined();
      expect(oneDriveShortcut?.label).toBe("OneDrive");
      expect(oneDriveShortcut?.icon).toBe("☁️");
      expect(oneDriveShortcut?.path).toBe(fakeOneDrive);
    } finally {
      if (originalEnv !== undefined) {
        process.env.OneDrive = originalEnv;
      } else {
        delete process.env.OneDrive;
      }
      fs.rmSync(fakeOneDrive, { recursive: true, force: true });
    }
  });

  it("detects OneDriveCommercial from environment variable", async () => {
    const fakeOneDriveCommercial = fs.mkdtempSync(path.join(os.tmpdir(), "fake-onedrive-work-"));
    const originalEnv = process.env.OneDriveCommercial;
    process.env.OneDriveCommercial = fakeOneDriveCommercial;
    try {
      const res = await handleListProjectFiles(
        { agentId: "test-agent", targetPath: "" },
        mockContext(tmpDir) as any,
      );
      expect(res.shortcuts).toBeDefined();
      const workShortcut = res.shortcuts?.find((s) => s.id === "onedrive-commercial");
      expect(workShortcut).toBeDefined();
      expect(workShortcut?.label).toBe("OneDrive (Work)");
      expect(workShortcut?.path).toBe(fakeOneDriveCommercial);
    } finally {
      if (originalEnv !== undefined) {
        process.env.OneDriveCommercial = originalEnv;
      } else {
        delete process.env.OneDriveCommercial;
      }
      fs.rmSync(fakeOneDriveCommercial, { recursive: true, force: true });
    }
  });

  describe("handleCreateDirectory", () => {
    it("creates a new directory successfully inside workspace", async () => {
      const res = await handleCreateDirectory(
        { agentId: "test-agent", parentPath: "src", name: "components" },
        mockContext(tmpDir) as any,
      );

      expect(res.success).toBe(true);
      expect(res.relativePath).toBe("src/components");
      expect(fs.existsSync(path.join(tmpDir, "src", "components"))).toBe(true);
      expect(fs.statSync(path.join(tmpDir, "src", "components")).isDirectory()).toBe(true);
    });

    it("rejects duplicate folder name", async () => {
      const res = await handleCreateDirectory(
        { agentId: "test-agent", parentPath: "", name: "src" },
        mockContext(tmpDir) as any,
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("already exists");
    });

    it("rejects invalid folder names with slashes or traversal", async () => {
      const slashRes = await handleCreateDirectory(
        { agentId: "test-agent", parentPath: "src", name: "bad/name" },
        mockContext(tmpDir) as any,
      );
      expect(slashRes.success).toBe(false);
      expect(slashRes.error).toContain("invalid characters");

      const dotRes = await handleCreateDirectory(
        { agentId: "test-agent", parentPath: "src", name: ".." },
        mockContext(tmpDir) as any,
      );
      expect(dotRes.success).toBe(false);
      expect(dotRes.error).toContain("invalid characters");
    });
  });
});

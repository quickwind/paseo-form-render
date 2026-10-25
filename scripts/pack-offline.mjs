import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import crypto from "node:crypto";

const rootDir = path.resolve(import.meta.dirname, "..");

function resolveDistDir() {
  const args = process.argv.slice(2);
  let target = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out" || arg === "--dist" || arg === "-o") {
      target = args[i + 1] || "";
      i++;
    } else if (arg.startsWith("--out=") || arg.startsWith("--dist=")) {
      target = arg.split("=")[1];
    } else if (!arg.startsWith("-") && !target) {
      target = arg;
    }
  }

  if (!target) {
    target = process.env.DIST_DIR || process.env.PFR_DIST_DIR || path.join(rootDir, "dist");
  }

  if (target === "~" || target.startsWith("~/") || target.startsWith("~\\")) {
    target = path.join(os.homedir(), target.slice(1));
  }

  return path.resolve(process.cwd(), target);
}

const distDir = resolveDistDir();

fs.mkdirSync(distDir, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const baseName = `${pkg.name}-${pkg.version}-offline`;
const zipFile = path.join(distDir, `${baseName}.zip`);
const shaFile = path.join(distDir, `${baseName}.zip.sha256`);

console.log(`Packaging ${baseName}...`);

// 1. Run typecheck and test
console.log("Running typecheck...");
execSync("npm run typecheck", { cwd: rootDir, stdio: "inherit" });

console.log("Running tests...");
execSync("npm test", { cwd: rootDir, stdio: "inherit" });

// 2. Prepare staging directory
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-pfr-"));
const stageDir = path.join(tempDir, baseName);
fs.mkdirSync(stageDir, { recursive: true });

const includeFiles = [
  "README.md",
  "LICENSE",
  "package.json",
  "paseo-plugin.json",
  "tsconfig.json",
  "index.client.tsx",
  "index.server.ts",
];

const includeDirs = [
  "client",
  "server",
  "shared",
];

for (const file of includeFiles) {
  const src = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(stageDir, file));
  }
}

for (const dir of includeDirs) {
  const src = path.join(rootDir, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(stageDir, dir), { recursive: true });
  }
}

// 3. Create zip and tgz
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}
console.log(`Creating ${zipFile}...`);
execSync(`zip -r -q "${zipFile}" "${baseName}"`, { cwd: tempDir, stdio: "inherit" });

const tgzFile = path.join(distDir, `${baseName}.tgz`);
if (fs.existsSync(tgzFile)) {
  fs.unlinkSync(tgzFile);
}
console.log(`Creating ${tgzFile}...`);
execSync(`tar -czf "${tgzFile}" "${baseName}"`, { cwd: tempDir, stdio: "inherit" });

// 4. Generate sha256
const zipBuffer = fs.readFileSync(zipFile);
const hash = crypto.createHash("sha256").update(zipBuffer).digest("hex");
fs.writeFileSync(shaFile, `${hash}  ${path.basename(zipFile)}\n`);

const tgzBuffer = fs.readFileSync(tgzFile);
const tgzHash = crypto.createHash("sha256").update(tgzBuffer).digest("hex");
fs.writeFileSync(path.join(distDir, `${baseName}.tgz.sha256`), `${tgzHash}  ${path.basename(tgzFile)}\n`);

// 5. Clean up temp directory
fs.rmSync(tempDir, { recursive: true, force: true });

const stats = fs.statSync(zipFile);
const tgzStats = fs.statSync(tgzFile);
console.log(`Successfully packaged offline release:`);
console.log(`- Archive (zip): ${zipFile} (${(stats.size / 1024).toFixed(1)} KB)`);
console.log(`- Archive (tgz): ${tgzFile} (${(tgzStats.size / 1024).toFixed(1)} KB)`);
console.log(`- SHA-256: ${hash}`);

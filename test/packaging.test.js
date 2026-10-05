import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("npm package includes every module required by the CLI", async (t) => {
  const cache = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-npm-"));
  t.after(() => fs.rm(cache, { recursive: true, force: true }));
  const { stdout } = await exec("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", cache], { cwd: ROOT });
  const packed = new Set(JSON.parse(stdout)[0].files.map((file) => file.path));
  assert.ok(packed.has("bin/codex-report.js"));
  for (const entry of await fs.readdir(path.join(ROOT, "lib"), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const parent = entry.parentPath ?? entry.path;
    const relative = path.relative(ROOT, path.join(parent, entry.name));
    assert.ok(packed.has(relative), `Missing package module: ${relative}`);
  }
});

test("prepared Raycast CLI runs in isolation with both adapters and JSON schema 1", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-packaging-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.cp(path.join(ROOT, "bin"), path.join(directory, "bin"), { recursive: true });
  await fs.cp(path.join(ROOT, "lib"), path.join(directory, "lib"), { recursive: true });
  const raycast = path.join(directory, "raycast");
  await fs.mkdir(path.join(raycast, "src"), { recursive: true });
  await fs.copyFile(path.join(ROOT, "raycast", "prepare.mjs"), path.join(raycast, "prepare.mjs"));
  await exec(process.execPath, [path.join(raycast, "prepare.mjs")]);
  // Removing the originals ensures imports resolve only within the prepared assets.
  await fs.rm(path.join(directory, "lib"), { recursive: true });
  await fs.rm(path.join(directory, "bin"), { recursive: true });
  const { stdout } = await exec(process.execPath, [path.join(raycast, "assets", "codex-report.mjs"), "--agent", "all", "--global", "--json", "--no-cache"], {
    cwd: directory,
    env: { ...process.env, HOME: directory, CODEX_HOME: "", CLAUDE_CONFIG_DIR: "" },
  });
  const report = JSON.parse(stdout);
  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.selectedAgents, ["codex", "claude"]);
  assert.equal(report.sessions, 0);
  assert.deepEqual(report.days, []);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("npm package includes the CLI and documentation without Raycast assets", async () => {
  const cache = await mkdtemp(resolve(tmpdir(), "codex-report-pack-"));
  try {
    const { stdout } = await execFileAsync(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", cache],
      { cwd: root },
    );
    const [manifest] = JSON.parse(stdout);
    const files = manifest.files.map((file) => file.path);
    for (const required of ["package.json", "README.md", "bin/codex-report.js", "docs/cost-estimation.md"]) {
      assert.ok(files.includes(required), `Missing package file: ${required}`);
    }
    for (const file of files) {
      assert.ok(
        ["package.json", "README.md", "LICENSE", "LICENSE.md"].includes(file) ||
          /^(bin|lib)\/.*\.js$/.test(file) ||
          /^docs\/[^/]+\.md$/.test(file),
        `Unexpected npm package file: ${file}`,
      );
    }
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
});

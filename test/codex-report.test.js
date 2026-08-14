import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = path.join(REPO_ROOT, "bin", "codex-report.js");

function event(timestamp, type, payload) {
  return JSON.stringify({ timestamp, type, payload });
}

async function runReport(home, args) {
  const { stdout } = await execFileAsync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, HOME: home },
  });
  return stdout;
}

test("counts skill evidence and reuses one cache entry across date ranges", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const skillDir = path.join(home, ".codex", "skills", "demo skill");
  const skillPath = path.join(skillDir, "SKILL.md");
  const sessionDir = path.join(home, ".codex", "sessions", "2026", "08", "14");
  const sessionPath = path.join(sessionDir, "session.jsonl");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(skillPath, "---\nname: demo\n---\n");

  const lines = [
    event("2026-08-14T08:00:00Z", "session_meta", {
      id: "session-1",
      cwd: REPO_ROOT,
      model_provider: "openai",
      originator: "test",
    }),
    event("2026-08-14T08:01:00Z", "event_msg", { type: "user_message", message: "$demo first" }),
    event("2026-08-14T08:02:00Z", "event_msg", { type: "user_message", message: "$demo second" }),
    event("2026-08-14T08:03:00Z", "response_item", {
      type: "function_call",
      name: "exec_command",
      arguments: JSON.stringify({ cmd: `cat '${skillPath}'` }),
    }),
    event("2026-08-14T08:04:00Z", "response_item", {
      type: "function_call",
      name: "exec_command",
      arguments: JSON.stringify({ cmd: `sed -n '1,20p' '${skillPath}'` }),
    }),
  ];
  await fs.writeFile(sessionPath, `${lines.join("\n")}\n`);

  const first = await runReport(home, ["--global", "--skills", "--from", "2026-08-14", "--to", "2026-08-14"]);
  assert.match(first, /SKILL\.md reads\s+2/);
  assert.match(first, /\$skill mentions\s+2/);
  assert.match(first, /demo\s+2 reads/);

  const cachePath = path.join(home, ".codex", "cache", "codex-report-sessions-v5.json");
  const firstCache = JSON.parse(await fs.readFile(cachePath, "utf8"));
  assert.equal(Object.keys(firstCache.entries).length, 1);

  await runReport(home, ["--global", "--skills", "--from", "2026-08-13", "--to", "2026-08-15"]);
  const secondCache = JSON.parse(await fs.readFile(cachePath, "utf8"));
  assert.equal(Object.keys(secondCache.entries).length, 1);

  lines.push(event("2026-08-14T08:05:00Z", "response_item", {
    type: "function_call",
    name: "exec_command",
    arguments: JSON.stringify({ cmd: `cat '${skillPath}'` }),
  }));
  await fs.writeFile(sessionPath, `${lines.join("\n")}\n`);
  const updated = await runReport(home, ["--global", "--skills", "--from", "2026-08-14", "--to", "2026-08-14"]);
  assert.match(updated, /SKILL\.md reads\s+3/);
  assert.match(updated, /demo\s+3 reads/);
});

test("bypasses day cache for precise timestamp ranges", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const sessionDir = path.join(home, ".codex", "sessions");
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(path.join(sessionDir, "session.jsonl"), [
    event("2026-08-14T08:00:00Z", "session_meta", { id: "session-2", cwd: REPO_ROOT }),
    event("2026-08-14T09:00:00Z", "turn_context", { model: "gpt-5" }),
    event("2026-08-14T11:00:00Z", "turn_context", { model: "gpt-5" }),
    event("2026-08-14T11:01:00Z", "event_msg", { type: "user_message", message: "hello" }),
  ].join("\n"));

  const output = await runReport(home, [
    "--global",
    "--models",
    "--from",
    "2026-08-14T10:00:00Z",
    "--to",
    "2026-08-14T12:00:00Z",
  ]);
  assert.match(output, /gpt-5\s+1 turns/);
  await assert.rejects(fs.access(path.join(home, ".codex", "cache", "codex-report-sessions-v5.json")));
});

test("cached day summaries preserve token deltas across midnight", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const sessionDir = path.join(home, ".codex", "sessions");
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(path.join(sessionDir, "session.jsonl"), [
    event("2026-08-13T20:50:00Z", "session_meta", { id: "session-3", cwd: REPO_ROOT }),
    event("2026-08-13T20:51:00Z", "turn_context", { model: "gpt-5" }),
    event("2026-08-13T20:55:00Z", "event_msg", {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 80,
          output_tokens: 10,
          reasoning_output_tokens: 0,
          total_tokens: 110,
        },
      },
    }),
    event("2026-08-14T08:00:00Z", "event_msg", { type: "user_message", message: "continue" }),
    event("2026-08-14T08:05:00Z", "event_msg", {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: 150,
          cached_input_tokens: 120,
          output_tokens: 15,
          reasoning_output_tokens: 0,
          total_tokens: 165,
        },
      },
    }),
  ].join("\n"));

  const args = ["--global", "--costs", "--from", "2026-08-14", "--to", "2026-08-14"];
  const cached = await runReport(home, args);
  const uncached = await runReport(home, [...args, "--no-cache"]);
  assert.equal(cached, uncached);
  assert.match(cached, /50 in · 40 cached · 5 out/);
});

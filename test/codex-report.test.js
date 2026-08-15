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
  const { stdout } = await runReportResult(home, args);
  return stdout;
}

async function runReportResult(home, args) {
  return execFileAsync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, HOME: home },
  });
}

test("clears every Codex Report session cache and leaves unrelated files", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const cacheDir = path.join(home, ".codex", "cache");
  const oldCache = path.join(cacheDir, "codex-report-sessions-v1.json");
  const currentCache = path.join(cacheDir, "codex-report-sessions-v6.json");
  const unrelated = path.join(cacheDir, "other-cache.json");
  await fs.mkdir(cacheDir, { recursive: true });
  await Promise.all([
    fs.writeFile(oldCache, "{}\n"),
    fs.writeFile(currentCache, "{}\n"),
    fs.writeFile(unrelated, "{}\n"),
  ]);

  const output = await runReport(home, ["--clear-cache"]);
  assert.equal(output, "Cleared 2 Codex Report cache files.\n");
  await assert.rejects(fs.access(oldCache));
  await assert.rejects(fs.access(currentCache));
  await fs.access(unrelated);
});

test("reports cache misses, hits, and bypasses on stderr", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const sessionDir = path.join(home, ".codex", "sessions");
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(path.join(sessionDir, "session.jsonl"), [
    event("2026-08-14T08:00:00Z", "session_meta", { id: "cache-status", cwd: REPO_ROOT }),
    event("2026-08-14T08:01:00Z", "event_msg", { type: "user_message", message: "hello" }),
  ].join("\n"));

  const args = ["--global", "--activity", "--from", "2026-08-14", "--to", "2026-08-14"];
  const miss = await runReportResult(home, args);
  assert.match(miss.stderr, /Cache miss: recalculating 1 of 1 session file\./);
  const hit = await runReportResult(home, args);
  assert.match(hit.stderr, /Cache hit: using 1 cached session file\./);
  const bypass = await runReportResult(home, [...args, "--no-cache"]);
  assert.match(bypass.stderr, /Cache bypassed: recalculating 1 session file\./);
});

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

  const cachePath = path.join(home, ".codex", "cache", "codex-report-sessions-v6.json");
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
  await assert.rejects(fs.access(path.join(home, ".codex", "cache", "codex-report-sessions-v6.json")));
});

test("reuses legacy cache for reports that do not request insights", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const sessionDir = path.join(home, ".codex", "sessions");
  await fs.mkdir(sessionDir, { recursive: true });
  const firstSessionPath = path.join(sessionDir, "first.jsonl");
  const secondSessionPath = path.join(sessionDir, "second.jsonl");
  const sessionLines = [
    event("2026-08-14T08:00:00Z", "session_meta", { id: "legacy-cache", cwd: REPO_ROOT }),
    event("2026-08-14T08:01:00Z", "event_msg", {
      type: "thread_settings",
      thread_settings: { service_tier: "priority" },
    }),
    event("2026-08-14T08:02:00Z", "turn_context", { model: "gpt-5", effort: "medium" }),
    event("2026-08-14T08:03:00Z", "event_msg", {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 0,
          output_tokens: 10,
          reasoning_output_tokens: 0,
          total_tokens: 110,
        },
      },
    }),
  ].join("\n");
  await fs.writeFile(firstSessionPath, sessionLines);
  await fs.writeFile(secondSessionPath, sessionLines.replace("legacy-cache", "legacy-cache-2"));

  const cachePath = path.join(home, ".codex", "cache", "codex-report-sessions-v6.json");
  const range = ["--global", "--from", "2026-08-14", "--to", "2026-08-14"];
  await runReport(home, [...range, "--activity"]);
  const legacyCache = JSON.parse(await fs.readFile(cachePath, "utf8"));
  for (const entry of Object.values(legacyCache.entries)) {
    entry.parsed.insightsVersion = 1;
    for (const [, day] of entry.parsed.days) {
      delete day.serviceTiers;
      delete day.reasoningEfforts;
    }
  }
  await fs.writeFile(cachePath, `${JSON.stringify(legacyCache)}\n`);

  await fs.appendFile(firstSessionPath, `\n${event("2026-08-14T08:04:00Z", "event_msg", { type: "user_message", message: "changed" })}`);
  await runReport(home, [...range, "--activity"]);
  const reusedCache = JSON.parse(await fs.readFile(cachePath, "utf8"));
  assert.equal(reusedCache.entries[firstSessionPath].parsed.insightsVersion, 2);
  assert.equal(reusedCache.entries[secondSessionPath].parsed.insightsVersion, 1);

  const insights = await runReport(home, [...range, "--insights"]);
  assert.match(insights, /Fast mode\s+100%/);
  const enrichedCache = JSON.parse(await fs.readFile(cachePath, "utf8"));
  assert.ok(Object.values(enrichedCache.entries).every((entry) => entry.parsed.insightsVersion === 2));
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

test("reports fast mode and every reasoning effort once per turn", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const sessionDir = path.join(home, ".codex", "sessions");
  await fs.mkdir(sessionDir, { recursive: true });
  const lines = [
    event("2026-08-14T08:00:00Z", "session_meta", { id: "insights", cwd: REPO_ROOT }),
  ];
  const turns = [
    { tier: "priority", effort: "medium" },
    { tier: "priority", effort: "medium" },
    { tier: "priority", effort: "high" },
    { tier: "default", effort: "low" },
  ];
  for (const [index, turn] of turns.entries()) {
    const minute = index * 3 + 1;
    lines.push(event(`2026-08-14T08:${String(minute).padStart(2, "0")}:00Z`, "event_msg", {
      type: "thread_settings",
      thread_settings: { service_tier: turn.tier },
    }));
    lines.push(event(`2026-08-14T08:${String(minute + 1).padStart(2, "0")}:00Z`, "turn_context", {
      model: "gpt-5",
      effort: turn.effort,
    }));
    lines.push(event(`2026-08-14T08:${String(minute + 2).padStart(2, "0")}:00Z`, "event_msg", {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: (index + 1) * 100,
          cached_input_tokens: 0,
          output_tokens: (index + 1) * 10,
          reasoning_output_tokens: 0,
          total_tokens: (index + 1) * 110,
        },
      },
    }));
    if (index === 0) {
      lines.push(event("2026-08-14T08:03:30Z", "event_msg", {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 120,
            cached_input_tokens: 0,
            output_tokens: 12,
            reasoning_output_tokens: 0,
            total_tokens: 132,
          },
        },
      }));
    }
  }
  await fs.writeFile(path.join(sessionDir, "session.jsonl"), lines.join("\n"));

  const args = ["--global", "--insights", "--from", "2026-08-14", "--to", "2026-08-14"];
  const cached = await runReport(home, args);
  const uncached = await runReport(home, [...args, "--no-cache"]);
  assert.equal(cached, uncached);
  assert.match(cached, /Fast mode\s+75%/);
  assert.match(cached, /medium\s+2 turns.*50%/);
  assert.match(cached, /high\s+1 turns.*25%/);
  assert.match(cached, /low\s+1 turns.*25%/);

  const full = await runReport(home, ["--global", "--from", "2026-08-14", "--to", "2026-08-14"]);
  assert.match(full, /Activity insights/);
  assert.match(full, /Fast mode\s+75%/);
  assert.match(full, /Reasoning efforts/);
});

test("applies official standard prices for GPT-5.6 models", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const sessionDir = path.join(home, ".codex", "sessions");
  await fs.mkdir(sessionDir, { recursive: true });
  const models = ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
  for (const [index, model] of models.entries()) {
    await fs.writeFile(path.join(sessionDir, `${index}.jsonl`), [
      event("2026-08-14T08:00:00Z", "session_meta", { id: `pricing-${index}`, cwd: REPO_ROOT }),
      event("2026-08-14T08:01:00Z", "turn_context", { model }),
      event("2026-08-14T08:02:00Z", "event_msg", {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 2_000_000,
            cached_input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            reasoning_output_tokens: 0,
            total_tokens: 3_000_000,
          },
        },
      }),
    ].join("\n"));
  }

  const output = await runReport(home, ["--global", "--costs", "--from", "2026-08-14", "--to", "2026-08-14"]);
  assert.match(output, /gpt-5\.6\s+\$35\.50/);
  assert.match(output, /gpt-5\.6-sol\s+\$35\.50/);
  assert.match(output, /gpt-5\.6-terra\s+\$14\.20/);
  assert.match(output, /gpt-5\.6-luna\s+\$1\.420/);
  assert.match(output, /Total estimated API cost: \$86\.62/);
});

test("groups remote worktrees, local repositories, and non-Git directories", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const localRepo = path.join(home, "local-repo");
  const localWorktree = path.join(home, "local-worktree");
  const plainDirectory = path.join(home, "plain-directory");
  await fs.mkdir(plainDirectory, { recursive: true });
  await execFileAsync("git", ["init", localRepo]);
  await execFileAsync("git", ["-C", localRepo, "config", "user.email", "test@example.com"]);
  await execFileAsync("git", ["-C", localRepo, "config", "user.name", "Test User"]);
  await fs.writeFile(path.join(localRepo, "README.md"), "test\n");
  await execFileAsync("git", ["-C", localRepo, "add", "README.md"]);
  await execFileAsync("git", ["-C", localRepo, "commit", "-m", "Initial commit"]);
  await execFileAsync("git", ["-C", localRepo, "worktree", "add", "-b", "test-worktree", localWorktree]);

  const sessionDir = path.join(home, ".codex", "sessions");
  await fs.mkdir(sessionDir, { recursive: true });
  const sessions = [
    { cwd: "/deleted/worktree-one", repositoryUrl: "git@github.com:acme/example.git" },
    { cwd: "/deleted/worktree-two", repositoryUrl: "https://github.com/acme/example.git" },
    { cwd: localRepo },
    { cwd: localWorktree },
    { cwd: plainDirectory },
  ];
  for (const [index, session] of sessions.entries()) {
    const git = session.repositoryUrl ? { repository_url: session.repositoryUrl } : undefined;
    await fs.writeFile(path.join(sessionDir, `${index}.jsonl`), [
      event("2026-08-14T08:00:00Z", "session_meta", { id: `repo-${index}`, cwd: session.cwd, git }),
      event("2026-08-14T08:01:00Z", "event_msg", { type: "user_message", message: "work" }),
    ].join("\n"));
  }

  const output = await runReport(home, ["--global", "--repositories", "--from", "2026-08-14", "--to", "2026-08-14"]);
  assert.match(output, /github\.com\/acme\/example\s+2 sessions/);
  assert.ok(output.split("\n").some((line) => line.includes("local-repo") && line.includes("2 sessions")));
  assert.ok(output.split("\n").some((line) => line.includes("plain-directory") && line.includes("1 sessions")));
});

test("aggregates activity by month", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const sessionDir = path.join(home, ".codex", "sessions");
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(path.join(sessionDir, "january.jsonl"), [
    event("2026-01-10T08:00:00Z", "session_meta", { id: "january", cwd: REPO_ROOT }),
    event("2026-01-10T08:01:00Z", "event_msg", { type: "user_message", message: "one" }),
    event("2026-01-10T08:02:00Z", "event_msg", { type: "agent_message", message: "two" }),
  ].join("\n"));
  await fs.writeFile(path.join(sessionDir, "february.jsonl"), [
    event("2026-02-10T08:00:00Z", "session_meta", { id: "february", cwd: REPO_ROOT }),
    event("2026-02-10T08:01:00Z", "event_msg", { type: "user_message", message: "three" }),
  ].join("\n"));

  const output = await runReport(home, ["--global", "--monthly", "--from", "2026-01-01", "--to", "2026-02-28"]);
  assert.match(output, /2026-01\s+2 msg/);
  assert.match(output, /2026-02\s+1 msg/);
});

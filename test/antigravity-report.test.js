import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeAntigravityTokens } from "../lib/adapters/antigravity.js";

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin", "codex-report.js");
const WINDOW = ["--from", "2026-11-19", "--to", "2026-11-20"];

async function homeFor(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "antigravity-report-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  return home;
}

async function putTranscript(root, id, events) {
  const file = path.join(root, "brain", id, ".system_generated", "logs", "transcript.jsonl");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, events.map((e) => typeof e === "string" ? e : JSON.stringify(e)).join("\n") + "\n");
  return file;
}

async function putSummaryDb(root, rows) {
  await fs.mkdir(root, { recursive: true });
  const db = new DatabaseSync(path.join(root, "conversation_summaries.db"));
  db.exec(`CREATE TABLE conversation_summaries (
    conversation_id text PRIMARY KEY,
    workspace_uris text NOT NULL,
    app_data_dir text NOT NULL DEFAULT "",
    source text NOT NULL DEFAULT "",
    parent_conversation_id text NOT NULL DEFAULT ""
  )`);
  const insert = db.prepare(
    "INSERT INTO conversation_summaries (conversation_id, workspace_uris, app_data_dir, source, parent_conversation_id) VALUES (?, ?, ?, ?, ?)",
  );
  for (const row of rows) {
    insert.run(
      row.id,
      JSON.stringify((row.workspaces ?? []).map((dir) => pathToFileURL(dir).href)),
      row.appDataDir ?? "",
      row.source ?? "",
      row.parentId ?? "",
    );
  }
  db.close();
}

async function run(home, args = [], env = {}, cwd = ROOT) {
  return exec(process.execPath, [CLI, ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: home,
      CODEX_HOME: "",
      CLAUDE_CONFIG_DIR: "",
      ANTIGRAVITY_HOME: "",
      CODEX_REPORT_CONFIG: "",
      XDG_CONFIG_HOME: "",
      ...env,
    },
  });
}

async function report(home, args = [], env = {}, cwd = ROOT) {
  const result = await run(home, ["--agent", "antigravity", "--json", ...WINDOW, ...args], env, cwd);
  return { ...result, json: JSON.parse(result.stdout) };
}

function userStep(stepIndex, timestamp, content = "hello") {
  return { step_index: stepIndex, source: "USER_EXPLICIT", type: "USER_INPUT", status: "DONE", created_at: timestamp, content };
}

function plannerStep(stepIndex, timestamp, overrides = {}) {
  return {
    step_index: stepIndex,
    source: "MODEL",
    type: "PLANNER_RESPONSE",
    status: "DONE",
    created_at: timestamp,
    model: "gemini-4-neon-medium",
    input_tokens: 1000,
    cache_read_tokens: 2000,
    output_tokens: 100,
    content: "Done.",
    ...overrides,
  };
}

function withoutGenerated(json) {
  const { generatedAt, ...stable } = json;
  return stable;
}

test("normalizes Antigravity tokens with inclusive input and counts one turn per answered prompt", async (t) => {
  const tokens = normalizeAntigravityTokens({ input_tokens: 1000, cache_read_tokens: 4000, output_tokens: 250 });
  assert.equal(tokens.input_tokens, 5000);
  assert.equal(tokens.cached_input_tokens, 4000);
  assert.equal(tokens.output_tokens, 250);
  assert.equal(tokens.total_tokens, 5250);

  const home = await homeFor(t);
  const cliRoot = path.join(home, ".gemini", "antigravity-cli");
  await putSummaryDb(cliRoot, [{ id: "conv-1", workspaces: [ROOT], appDataDir: "antigravity-cli" }]);
  await putTranscript(cliRoot, "conv-1", [
    userStep(0, "2026-11-20T09:00:00Z", "check repo"),
    plannerStep(1, "2026-11-20T09:00:01Z", {
      model: "gemini-4-neon-high",
      input_tokens: 1000,
      cache_read_tokens: 0,
      output_tokens: 50,
      content: "",
      tool_calls: [{ name: "run_command", args: { CommandLine: '"git status"' } }],
    }),
    { step_index: 2, source: "MODEL", type: "GENERIC", status: "DONE", created_at: "2026-11-20T09:00:02Z", content: "tool output" },
    plannerStep(3, "2026-11-20T09:00:03Z", {
      model: "gemini-4-neon-high",
      input_tokens: 200,
      cache_read_tokens: 1000,
      output_tokens: 100,
      content: "Everything is clean.",
    }),
  ]);

  const first = await report(home, ["--global"]);
  assert.equal(first.json.sessions, 1);
  assert.equal(first.json.messages, 2);
  assert.equal(first.json.tokens.input_tokens, 2200);
  assert.equal(first.json.tokens.cached_input_tokens, 1000);
  assert.equal(first.json.tokens.output_tokens, 150);
  assert.equal(first.json.tokens.total_tokens, 2350);
  assert.deepEqual(first.json.models.map((m) => [m.name, m.turns, m.tokens]), [["gemini-4-neon-high", 1, 2350]]);
  assert.deepEqual(first.json.reasoningEfforts, [{ name: "high", turns: 1 }]);
  assert.deepEqual(first.json.tools, [{ name: "run_command", count: 1 }]);

  const hit = await report(home, ["--global"]);
  const bypass = await report(home, ["--global", "--no-cache"]);
  assert.match(hit.stderr, /Cache hit/);
  assert.deepEqual(withoutGenerated(hit.json), withoutGenerated(first.json));
  assert.deepEqual(withoutGenerated(bypass.json), withoutGenerated(first.json));
});

test("discovers CLI and T3 ACP homes, resolves primary workspace, merges subagents and tracks skills", async (t) => {
  const home = await homeFor(t);
  const acpRoot = path.join(home, ".t3", "userdata", "providers", "antigravity", "abc123", "antigravity-acp");
  const attachments = path.join(home, ".t3", "userdata", "attachments");
  const skillFile = path.join(home, ".agents", "skills", "tdd", "SKILL.md");
  await fs.mkdir(path.dirname(skillFile), { recursive: true });
  await fs.writeFile(skillFile, "---\nname: tdd\n---\n");

  await putSummaryDb(acpRoot, [
    { id: "parent-conv", workspaces: [attachments, ROOT], appDataDir: "antigravity-acp" },
    { id: "child-conv", workspaces: [ROOT], appDataDir: "antigravity-acp", parentId: "parent-conv" },
  ]);
  await putTranscript(acpRoot, "parent-conv", [
    userStep(
      0,
      "2026-11-20T10:00:00Z",
      "<USER_REQUEST>\n<t3_code_instructions>ignore $NONEXISTENT</t3_code_instructions>\n<user_request>\nuse $tdd please\n</user_request>\n</USER_REQUEST>",
    ),
    plannerStep(1, "2026-11-20T10:00:05Z", {
      model: "claude-opus-5-5-medium",
      input_tokens: 1000,
      cache_read_tokens: 9000,
      output_tokens: 200,
      content: "Reading skill.",
      tool_calls: [{ name: "read_file", args: { Path: JSON.stringify(skillFile) } }],
    }),
  ]);
  await putTranscript(acpRoot, "child-conv", [
    userStep(0, "2026-11-20T10:01:00Z", "subtask"),
    plannerStep(1, "2026-11-20T10:01:05Z", {
      model: "gemini-4-argon-high",
      input_tokens: 500,
      cache_read_tokens: 0,
      output_tokens: 50,
      content: "Subtask done.",
    }),
  ]);

  // Folder scope matches ROOT because attachments workspace URI is skipped in favor of primary workspace.
  const scoped = await report(home, [], {}, ROOT);
  assert.equal(scoped.json.scope.type, "folder");
  assert.equal(scoped.json.sessions, 1);
  assert.equal(scoped.json.messages, 4);
  assert.equal(scoped.json.tokens.total_tokens, 10750);
  // claude-opus-5-5-medium normalizes to claude-opus-5-5 and is priced.
  assert.ok(scoped.json.costEstimate.totalCost > 0);
  assert.equal(scoped.json.skills.topReads[0].name, "tdd");
  assert.equal(scoped.json.skills.topReads[0].reads, 1);
  assert.equal(scoped.json.skills.topReads[0].mentions, 1);
  assert.deepEqual(scoped.json.sources, [{ name: "antigravity-acp", sessions: 1 }]);
});

test("deduplicates mirrored Antigravity homes, supports ANTIGRAVITY_HOME and clears only owned cache", async (t) => {
  const home = await homeFor(t);
  const customHome = path.join(home, "custom-agy");
  const mirrorHome = path.join(home, "mirror-agy");
  await putTranscript(customHome, "shared-conv", [
    userStep(0, "2026-11-20T08:00:00Z", "short"),
    plannerStep(1, "2026-11-20T08:00:01Z", { input_tokens: 100, cache_read_tokens: 0, output_tokens: 10 }),
  ]);
  await putTranscript(mirrorHome, "shared-conv", [
    userStep(0, "2026-11-20T08:00:00Z", "short"),
    plannerStep(1, "2026-11-20T08:00:01Z", { input_tokens: 100, cache_read_tokens: 0, output_tokens: 10 }),
    userStep(2, "2026-11-20T08:05:00Z", "follow up"),
    plannerStep(3, "2026-11-20T08:05:01Z", { input_tokens: 200, cache_read_tokens: 100, output_tokens: 20 }),
  ]);
  const configFile = path.join(home, "config.json");
  await fs.writeFile(configFile, JSON.stringify({ sources: { antigravity: [mirrorHome] } }));

  const env = { ANTIGRAVITY_HOME: customHome, CODEX_REPORT_CONFIG: configFile };
  const result = await report(home, ["--global"], env);
  assert.equal(result.json.sessions, 1);
  assert.equal(result.json.messages, 4);
  assert.equal(result.json.tokens.total_tokens, 430);

  const unrelated = path.join(customHome, "cache", "onboarding.json");
  await fs.writeFile(unrelated, "{}\n");
  await run(home, ["--agent", "antigravity", "--clear-cache"], env);
  assert.ok(await fs.stat(unrelated).then(() => true).catch(() => false));
});

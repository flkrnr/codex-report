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
const CLI = path.join(ROOT, "bin", "codex-report.js");
const WINDOW = ["--from", "2026-08-14", "--to", "2026-08-15"];

async function homeFor(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "claude-report-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  return home;
}

async function put(home, relative, events) {
  const file = path.join(home, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, events.map((e) => typeof e === "string" ? e : JSON.stringify(e)).join("\n") + "\n");
  return file;
}

async function run(home, args = [], env = {}, cwd = ROOT) {
  return exec(process.execPath, [CLI, ...args], {
    cwd, env: { ...process.env, HOME: home, CODEX_HOME: "", CLAUDE_CONFIG_DIR: "", ...env },
  });
}

async function report(home, args = [], env = {}, cwd = ROOT) {
  const result = await run(home, ["--agent", "claude", "--json", ...WINDOW, ...args], env, cwd);
  return { ...result, json: JSON.parse(result.stdout) };
}

function user(id, timestamp = "2026-08-14T08:00:00Z", content = "hello", extra = {}) {
  return { type: "user", uuid: id, sessionId: "parent", cwd: ROOT, timestamp, message: { role: "user", content }, ...extra };
}

const basicUsage = { input_tokens: 100, cache_read_input_tokens: 200, cache_creation_input_tokens: 30, output_tokens: 10 };
function assistant(id, timestamp = "2026-08-14T08:01:00Z", usage = basicUsage, content = [{ type: "text", text: "answer" }], extra = {}) {
  return {
    type: "assistant", uuid: `event-${id}`, sessionId: "parent", cwd: ROOT, timestamp,
    requestId: `req-${id}`,
    message: { id, model: "claude-sonnet-4-5-20250929", role: "assistant", content, usage },
    ...extra,
  };
}

function withoutGenerated(json) {
  const { generatedAt, ...stable } = json;
  return stable;
}

test("normalizes Claude tokens, cache write durations, reasoning and pricing", async (t) => {
  const home = await homeFor(t);
  await put(home, ".claude/projects/project/parent.jsonl", [user("u1"), assistant("a1", undefined, {
    ...basicUsage, output_tokens_details: { thinking_tokens: 4 },
    cache_creation: { ephemeral_1h_input_tokens: 20, ephemeral_5m_input_tokens: 10 },
    speed: "fast", service_tier: "standard",
  }, undefined, { effort: "high", provider: "anthropic" })]);
  const { json } = await report(home);
  assert.equal(json.sessions, 1);
  assert.equal(json.messages, 2);
  assert.equal(json.tokens.input_tokens, 330);
  assert.equal(json.tokens.cached_input_tokens, 200);
  assert.equal(json.tokens.cache_creation_input_tokens, 30);
  assert.equal(json.tokens.cache_creation_1h_input_tokens, 20);
  assert.equal(json.tokens.cache_creation_unknown_input_tokens, 0);
  assert.equal(json.tokens.reasoning_output_tokens, 4);
  assert.equal(json.tokens.total_tokens, 340);
  assert.ok(Math.abs(json.costEstimate.totalCost - 0.0006675) < 1e-12);
  assert.deepEqual(json.reasoningEfforts, [{ name: "high", turns: 1 }]);
  assert.equal(json.insights.fastModePercent, 100);
  assert.equal(json.insights.knownServiceTierTurns, 1);
  assert.deepEqual(json.providers, [{ name: "anthropic", sessions: 1 }]);
  const { stdout } = await run(home, ["--agent", "claude", "--costs", ...WINDOW]);
  assert.match(stdout, /330 in · 200 cached · 10 out/);
  assert.match(stdout, /cache writes: 30 \(20 at 1h\)/);
});

test("deduplicates split blocks and usage snapshots while retaining every unique tool", async (t) => {
  const home = await homeFor(t);
  const bash = { type: "tool_use", id: "t1", name: "Bash", input: { command: "true" } };
  const read = { type: "tool_use", id: "t2", name: "Read", input: { file_path: "/example/file" } };
  await put(home, ".claude/projects/project/parent.jsonl", [
    user("u1"),
    user("tool-result", undefined, [{ type: "tool_result", tool_use_id: "t1", content: "result" }]),
    assistant("a1", "2026-08-14T08:01:00Z", { ...basicUsage, output_tokens: 1 }, [bash]),
    assistant("a1", "2026-08-14T08:01:01Z", basicUsage, [read]),
    assistant("a1", "2026-08-14T08:01:02Z", { ...basicUsage, output_tokens: 0 }, [bash]),
    user("meta", undefined, "injected context", { isMeta: true }),
    user("summary", undefined, "compact summary", { isCompactSummary: true }),
    assistant("synthetic", undefined, undefined, undefined, { message: { model: "<synthetic>", content: [] } }),
    "{partial-json",
    "null",
  ]);
  const first = await report(home);
  const second = await report(home);
  const uncached = await report(home, ["--no-cache"]);
  assert.equal(first.json.messages, 2);
  assert.equal(first.json.tokens.total_tokens, 340);
  assert.equal(first.json.models[0].turns, 1);
  assert.deepEqual(first.json.tools, [{ name: "Bash", count: 1 }, { name: "Read", count: 1 }]);
  assert.equal(first.json.costAssumptions.length, 1);
  assert.equal(first.json.insights.fastModePercent, null);
  assert.equal(first.json.insights.knownReasoningEffortTurns, 0);
  assert.deepEqual(withoutGenerated(first.json), withoutGenerated(second.json));
  assert.deepEqual(withoutGenerated(first.json), withoutGenerated(uncached.json));
  assert.match(second.stderr, /Cache hit/);
  assert.match(uncached.stderr, /Cache bypassed/);
});

test("anonymized real transcript fixture counts repeated message IDs once", async (t) => {
  const home = await homeFor(t);
  const fixture = await fs.readFile(path.join(ROOT, "test", "fixtures", "claude-real-shape.jsonl"), "utf8");
  await put(home, ".claude/projects/project/sample.jsonl", fixture.trim().split("\n"));
  const { json } = await report(home, ["--global"]);
  assert.equal(json.messages, 3);
  assert.equal(json.models[0].turns, 3);
  assert.equal(json.tokens.output_tokens, 358 + 145 + 334);
  assert.equal(json.tokens.cache_creation_input_tokens, 26195 + 2248 + 2378);
  assert.equal(json.tokens.cache_creation_1h_input_tokens, json.tokens.cache_creation_input_tokens);
  assert.ok(json.costEstimate.totalCost > 0);
});

test("reconciles fork copies and subagents before date filtering and on cache hits", async (t) => {
  const home = await homeFor(t);
  const shared = assistant("a1", undefined, basicUsage, [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "true" } }]);
  const original = [user("u1"), shared];
  await put(home, ".claude/projects/project/z-parent.jsonl", original.map((e) => ({ ...e, sessionId: "z-parent" })));
  await put(home, ".claude/projects/project/a-fork.jsonl", [
    ...original.map((e) => ({ ...e, sessionId: "z-parent", timestamp: "2026-08-15T08:00:00Z" })),
    user("fork-user", "2026-08-15T09:00:00Z", "new", { sessionId: "a-fork" }),
    assistant("fork-answer", "2026-08-15T09:01:00Z", basicUsage, undefined, { sessionId: "a-fork" }),
  ]);
  await put(home, ".claude/projects/project/z-parent/subagents/agent-child.jsonl", [
    { ...shared, sessionId: "z-parent", isSidechain: true },
    assistant("child-answer", "2026-08-15T10:00:00Z", basicUsage, undefined, { sessionId: "z-parent", isSidechain: true, cwd: "/example/child" }),
  ]);
  const cold = await report(home, ["--global"]);
  const warm = await report(home, ["--global"]);
  const direct = await report(home, ["--global", "--no-cache"]);
  assert.equal(cold.json.sessions, 2);
  assert.equal(cold.json.messages, 5);
  assert.equal(cold.json.tokens.total_tokens, 1020);
  assert.equal(cold.json.tools[0].count, 1);
  assert.equal(cold.json.projects.length, 1);
  assert.deepEqual(withoutGenerated(cold.json), withoutGenerated(warm.json));
  assert.deepEqual(withoutGenerated(cold.json), withoutGenerated(direct.json));
  const tomorrow = await report(home, ["--global", "--from", "2026-08-15"]);
  assert.equal(tomorrow.json.messages, 3);
  assert.equal(tomorrow.json.tokens.total_tokens, 680);
  assert.deepEqual(tomorrow.json.tools, []);
});

test("Claude events use event dates and support exact timestamp windows", async (t) => {
  const home = await homeFor(t);
  await put(home, ".claude/projects/project/parent.jsonl", [
    user("u1", "2026-08-14T10:00:00Z"), assistant("a1", "2026-08-14T10:01:00Z"),
    user("u2", "2026-08-15T12:00:00Z"), assistant("a2", "2026-08-15T12:01:00Z"),
  ]);
  const whole = await report(home);
  assert.deepEqual(whole.json.days.map((d) => [d.date, d.messages, d.tokens]), [["2026-08-14", 2, 340], ["2026-08-15", 2, 340]]);
  const precise = await report(home, ["--from", "2026-08-15T12:00:30Z", "--to", "2026-08-15T12:01:30Z"]);
  assert.equal(precise.json.messages, 1);
  assert.equal(precise.json.tokens.total_tokens, 340);
  assert.match(precise.stderr, /Cache bypassed/);
  const { stdout } = await run(home, ["--agent", "claude", "--weekly", "--monthly", ...WINDOW]);
  assert.match(stdout, /Weekly activity/);
  assert.match(stdout, /2026-08/);
});

test("mixed reports keep default Codex behavior, inclusive tokens and eligible insights", async (t) => {
  const home = await homeFor(t);
  await put(home, ".codex/sessions/codex.jsonl", [
    { timestamp: "2026-08-14T08:00:00Z", type: "session_meta", payload: { id: "parent", cwd: ROOT, model_provider: "openai" } },
    { timestamp: "2026-08-14T08:00:01Z", type: "event_msg", payload: { type: "session_configured", thread_settings: { service_tier: "priority" } } },
    { timestamp: "2026-08-14T08:01:00Z", type: "turn_context", payload: { turn_id: "turn1", model: "gpt-5", effort: "high" } },
    { timestamp: "2026-08-14T08:02:00Z", type: "event_msg", payload: { type: "user_message", message: "hello" } },
    { timestamp: "2026-08-14T08:03:00Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, total_tokens: 110 } } } },
  ]);
  await put(home, ".claude/projects/project/parent.jsonl", [user("u1"), assistant("a1")]);
  const defaults = JSON.parse((await run(home, ["--json", ...WINDOW])).stdout);
  assert.deepEqual(defaults.selectedAgents, ["codex"]);
  assert.equal(defaults.sessions, 1);
  const mixed = JSON.parse((await run(home, ["--agent", "all", "--json", ...WINDOW])).stdout);
  assert.deepEqual(mixed.selectedAgents, ["codex", "claude"]);
  assert.equal(mixed.sessions, 2);
  assert.equal(mixed.messages, 3);
  assert.equal(mixed.tokens.total_tokens, 450);
  assert.equal(mixed.insights.fastModePercent, 100);
  assert.equal(mixed.insights.knownServiceTierTurns, 1);
  assert.equal(mixed.agents.reduce((sum, a) => sum + a.tokens.total_tokens, 0), 450);
  assert.equal(mixed.repositories.length, 1);
  assert.equal(mixed.repositories[0].sessions, 2);
  const { stdout } = await run(home, ["--agent", "all", "--agents", ...WINDOW]);
  assert.match(stdout, /codex\s+1 sessions/);
  assert.match(stdout, /claude\s+1 sessions/);
});

test("skills use Claude Read, Bash, Skill and user evidence without catalog false positives", async (t) => {
  const home = await homeFor(t);
  const skill = path.join(home, ".claude/skills/review/SKILL.md");
  await fs.mkdir(path.dirname(skill), { recursive: true });
  await fs.writeFile(skill, "---\nname: review\n---\n");
  await put(home, ".claude/projects/project/parent.jsonl", [
    user("u1", undefined, "/review this"),
    user("meta", undefined, "$review catalog", { isMeta: true }),
    assistant("a1", undefined, basicUsage, [
      { type: "tool_use", id: "read", name: "Read", input: { file_path: skill } },
      { type: "tool_use", id: "bash", name: "Bash", input: { command: `cat '${skill}'` } },
      { type: "tool_use", id: "invoke", name: "Skill", input: { skill: "review" } },
    ]),
  ]);
  const { json } = await report(home);
  assert.equal(json.skills.topReads[0].reads, 2);
  assert.equal(json.skills.topReads[0].scope, "personal");
  assert.equal(json.skills.topReads[0].mentions, 2);
  assert.equal(json.skills.withEvidenceCount, 1);
  const { stdout } = await run(home, ["--agent", "claude", "--skills", ...WINDOW]);
  assert.match(stdout, /2 reads/);
  const cache = await fs.readFile(path.join(home, ".claude/cache/codex-report-claude-sessions-v1.json"), "utf8");
  assert.ok(!cache.includes("this") && !cache.includes("catalog"));
});

test("custom homes, missing agents and unknown models remain reportable", async (t) => {
  const home = await homeFor(t);
  const custom = path.join(home, "custom-claude");
  await put(home, "custom-claude/projects/project/parent.jsonl", [user("u1"), assistant("a1", undefined, basicUsage, undefined, { message: { id: "a1", model: "claude-future-999", usage: basicUsage, content: [] } })]);
  const { json, stderr } = await report(home, ["--global"], { CLAUDE_CONFIG_DIR: custom });
  assert.equal(json.tokens.total_tokens, 340);
  assert.equal(json.costEstimate.totalCost, 0);
  assert.equal(json.costEstimate.unpricedModels[0].model, "claude-future-999");
  assert.deepEqual(json.providers, [{ name: "(unknown)", sessions: 1 }]);
  const unpriced = await run(home, ["--agent", "claude", "--costs", ...WINDOW], { CLAUDE_CONFIG_DIR: custom });
  assert.match(unpriced.stdout, /Unpriced models: claude-future-999/);
  assert.ok(!stderr.includes("No local Claude"));
  const mixed = await run(home, ["--agent", "all", "--json", ...WINDOW], { CLAUDE_CONFIG_DIR: custom });
  assert.match(mixed.stderr, /No local Codex transcripts/);
  assert.equal(JSON.parse(mixed.stdout).sessions, 1);
  const absent = await report(home, ["--global"]);
  assert.equal(absent.json.sessions, 0);
  assert.match(absent.stderr, /No local Claude Code transcripts/);
});

test("Claude cache invalidates changed files, handles corruption and clears only owned caches", async (t) => {
  const home = await homeFor(t);
  const file = await put(home, ".claude/projects/project/parent.jsonl", [user("u1"), assistant("a1")]);
  await report(home);
  await fs.appendFile(file, JSON.stringify(user("u2")) + "\n");
  const changed = await report(home);
  assert.equal(changed.json.messages, 3);
  assert.match(changed.stderr, /Cache miss/);
  const cache = path.join(home, ".claude/cache/codex-report-claude-sessions-v1.json");
  await fs.writeFile(cache, "invalid");
  assert.equal((await report(home)).json.messages, 3);
  const unrelated = path.join(home, ".claude/cache/unrelated.json");
  await fs.writeFile(unrelated, "{}");
  await put(home, ".codex/cache/codex-report-sessions-v8.json", ["{}"]);
  const cleared = await run(home, ["--clear-cache", "--json"]);
  assert.equal(JSON.parse(cleared.stdout).clearedCacheFiles, 2);
  await assert.rejects(fs.access(cache));
  await fs.access(unrelated);
});

test("folder scope selects Claude projects and falls back to selected agents only", async (t) => {
  const home = await homeFor(t);
  await put(home, ".claude/projects/a/parent.jsonl", [user("u1"), assistant("a1")]);
  await put(home, ".claude/projects/b/other.jsonl", [user("u2", undefined, "hello", { sessionId: "other", cwd: "/different/project" })]);
  assert.equal((await report(home)).json.sessions, 1);
  assert.equal((await report(home, ["--global"])).json.sessions, 2);
  const fallback = await report(home, [], {}, home);
  assert.equal(fallback.json.sessions, 2);
  assert.match(fallback.json.scope.label, /no sessions in folder/);
});

test("invalid agent selection, missing option values and inverted ranges fail clearly", async (t) => {
  const home = await homeFor(t);
  for (const args of [["--agent", "cursor"], ["--agent"], ["--top", "2x"], ["--from", "2026-08-16", "--to", "2026-08-14"]]) {
    await assert.rejects(run(home, args), (error) => error.code === 1 && error.stderr.length > 0);
  }
});

test("tool calls retain event timestamps across split response fragments", async (t) => {
  const home = await homeFor(t);
  const tool = { type: "tool_use", id: "tool1", name: "Bash", input: { command: "true" } };
  await put(home, ".claude/projects/project/parent.jsonl", [
    assistant("a1", "2026-08-14T10:00:00Z", { ...basicUsage, output_tokens: 0 }, [tool]),
    assistant("a1", "2026-08-14T12:00:00Z", basicUsage, [tool]),
  ]);
  const early = await report(home, ["--from", "2026-08-14T09:59:00Z", "--to", "2026-08-14T10:01:00Z"]);
  assert.equal(early.json.sessions, 1);
  assert.equal(early.json.messages, 0);
  assert.equal(early.json.tools[0].count, 1);
  const late = await report(home, ["--from", "2026-08-14T11:59:00Z", "--to", "2026-08-14T12:01:00Z"]);
  assert.equal(late.json.messages, 1);
  assert.equal(late.json.tokens.total_tokens, 340);
  assert.deepEqual(late.json.tools, []);
});

test("legacy agent files are grouped with their recorded parent session", async (t) => {
  const home = await homeFor(t);
  await put(home, ".claude/projects/project/parent.jsonl", [user("u1")]);
  await put(home, ".claude/projects/project/agent-old.jsonl", [assistant("child", undefined, basicUsage, undefined, { isSidechain: true })]);
  const { json } = await report(home);
  assert.equal(json.sessions, 1);
  assert.equal(json.messages, 2);
  assert.equal(json.tokens.total_tokens, 340);
});

test("global skill reports resolve skills from recorded project directories", async (t) => {
  const home = await homeFor(t);
  const project = path.join(home, "project");
  await fs.mkdir(path.join(project, ".claude/skills/repo-review"), { recursive: true });
  await fs.writeFile(path.join(project, ".claude/skills/repo-review/SKILL.md"), "---\nname: repo-review\n---\n");
  await put(home, ".claude/projects/project/parent.jsonl", [
    user("u1", undefined, "/repo-review", { cwd: project }),
    assistant("a1", undefined, basicUsage, [{ type: "tool_use", id: "skill", name: "Skill", input: { skill: "repo-review" } }], { cwd: project }),
  ]);
  const { json } = await report(home, ["--global"]);
  assert.deepEqual(json.skills.mentions, [{ name: "repo-review", mentions: 2 }]);
  assert.equal(json.skills.activeSkills[0].scope, "repo");
});

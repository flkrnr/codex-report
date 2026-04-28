#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { execFileSync } from "node:child_process";

const CODEX_DIR = path.join(os.homedir(), ".codex");
const SESSIONS_DIR = path.join(CODEX_DIR, "sessions");
const TOKEN_KEYS = [
  "input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
];

function usage() {
  console.error("Usage: codex-report [--global] [--from YYYY-MM-DD|null] [--to YYYY-MM-DD] [--top 10]");
}

function parseArgs(argv) {
  const args = { from: null, to: null, global: false, top: 10 };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--from") {
      args.from = next;
      index += 1;
    } else if (arg === "--to") {
      args.to = next;
      index += 1;
    } else if (arg === "--global") {
      args.global = true;
    } else if (arg === "--top") {
      args.top = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.top) || args.top < 1) {
    throw new Error("--top must be a positive integer");
  }

  return args;
}

function parseDate(value, { endOfDay = false } = {}) {
  if (value == null || value === "" || value === "null" || value === "none") {
    return null;
  }

  if (value.includes("T")) {
    const normalized = value.endsWith("Z") ? value : value;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${value}`);
    }
    return date;
  }

  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  const date = new Date(`${value}${suffix}`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

function parseTimestamp(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDay(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function label(value) {
  if (value == null) {
    return "(unknown)";
  }
  if (["string", "number", "boolean"].includes(typeof value)) {
    return String(value);
  }
  return JSON.stringify(value, Object.keys(value).sort());
}

function currentGitRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function resolveScope(forceGlobal) {
  if (forceGlobal) {
    return { type: "global", label: "global" };
  }

  const root = currentGitRoot();
  if (!root) {
    return { type: "global", label: "global (not in a git project)" };
  }

  return { type: "project", root, label: `project ${root}` };
}

function isInsideProject(cwd, projectRoot) {
  if (cwd === "(unknown)") {
    return false;
  }

  const relative = path.relative(projectRoot, cwd);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function addTokens(total, usage) {
  if (!usage) {
    return;
  }

  for (const key of TOKEN_KEYS) {
    total[key] += Number(usage[key] ?? 0);
  }
}

async function sessionFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.promises.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(entryPath);
      }
    }
  }

  return files.sort();
}

async function readSession(filePath, start, end) {
  const meta = {};
  let firstTs = null;
  let lastTs = null;
  const messages = new Map();
  const tools = new Map();
  const tokens = Object.fromEntries(TOKEN_KEYS.map((key) => [key, 0]));
  const models = new Map();
  let tokenEvents = 0;

  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    const ts = parseTimestamp(event.timestamp);
    if (ts && ((start && ts < start) || ts > end)) {
      continue;
    }

    if (ts) {
      firstTs = firstTs == null || ts < firstTs ? ts : firstTs;
      lastTs = lastTs == null || ts > lastTs ? ts : lastTs;
    }

    const eventType = event.type;
    const payload = event.payload ?? {};

    if (eventType === "session_meta") {
      Object.assign(meta, payload);
    } else if (eventType === "turn_context") {
      if (payload.model) {
        increment(models, payload.model);
      }
    } else if (eventType === "event_msg") {
      if (payload.type === "user_message") {
        increment(messages, "user");
      } else if (payload.type === "agent_message") {
        increment(messages, "assistant");
      } else if (payload.type === "token_count") {
        const usage = payload.info?.last_token_usage;
        if (usage) {
          addTokens(tokens, usage);
          tokenEvents += 1;
        }
      }
    } else if (eventType === "response_item") {
      if (payload.type === "function_call" || payload.type === "custom_tool_call") {
        increment(tools, payload.name ?? payload.type);
      }
    }
  }

  if (!firstTs) {
    return null;
  }

  return {
    path: filePath,
    id: meta.id ?? path.basename(filePath, ".jsonl"),
    firstTs,
    lastTs,
    cwd: label(meta.cwd),
    provider: label(meta.model_provider),
    source: label(meta.source ?? meta.originator),
    messages,
    tools,
    tokens,
    models,
    tokenEvents,
  };
}

function longestStreak(days) {
  if (days.size === 0) {
    return 0;
  }

  const timestamps = [...days].sort().map((day) => Date.parse(`${day}T00:00:00`));
  let longest = 1;
  let current = 1;

  for (let index = 1; index < timestamps.length; index += 1) {
    const diffDays = Math.round((timestamps[index] - timestamps[index - 1]) / 86_400_000);
    if (diffDays === 1) {
      current += 1;
    } else {
      current = 1;
    }
    longest = Math.max(longest, current);
  }

  return longest;
}

function fmtInt(value) {
  return Intl.NumberFormat("en-US").format(value);
}

function sortedEntries(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function printTop(title, map, limit) {
  console.log(`\n${title}`);
  const entries = sortedEntries(map);
  if (entries.length === 0) {
    console.log("  none");
    return;
  }

  for (const [name, count] of entries.slice(0, limit)) {
    console.log(`  ${name}: ${fmtInt(count)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scope = resolveScope(args.global);
  const start = parseDate(args.from);
  const end = parseDate(args.to ?? localDay(new Date()), { endOfDay: !args.to?.includes("T") });
  const files = await sessionFiles(SESSIONS_DIR);
  const sessions = [];

  for (const file of files) {
    const session = await readSession(file, start, end);
    if (session && (scope.type === "global" || isInsideProject(session.cwd, scope.root))) {
      sessions.push(session);
    }
  }

  const daySessions = new Map();
  const activeDays = new Set();
  const tokens = Object.fromEntries(TOKEN_KEYS.map((key) => [key, 0]));
  const messages = new Map();
  const tools = new Map();
  const projects = new Map();
  const providers = new Map();
  const sources = new Map();
  const models = new Map();

  for (const session of sessions) {
    const day = localDay(session.firstTs);
    increment(daySessions, day);
    activeDays.add(day);

    for (const key of TOKEN_KEYS) {
      tokens[key] += session.tokens[key] ?? 0;
    }
    for (const [key, value] of session.messages) increment(messages, key, value);
    for (const [key, value] of session.tools) increment(tools, key, value);
    for (const [key, value] of session.models) increment(models, key, value);
    increment(projects, session.cwd);
    increment(providers, session.provider);
    increment(sources, session.source);
  }

  const totalMessages = (messages.get("user") ?? 0) + (messages.get("assistant") ?? 0);
  const busiestDay = sortedEntries(daySessions)[0] ?? ["none", 0];
  const firstDay = sessions.reduce((earliest, session) => (
    earliest == null || session.firstTs < earliest ? session.firstTs : earliest
  ), null) ?? end;

  console.log("Codex usage stats");
  console.log(`Scope: ${scope.label}`);
  console.log(`Period: ${localDay(start ?? firstDay)} to ${localDay(end)}`);
  console.log(`Sessions: ${fmtInt(sessions.length)}`);
  console.log(`Messages: ${fmtInt(totalMessages)} (${fmtInt(messages.get("user") ?? 0)} user, ${fmtInt(messages.get("assistant") ?? 0)} assistant)`);
  console.log(`Tokens: ${fmtInt(tokens.total_tokens)} total`);
  console.log(`  Input: ${fmtInt(tokens.input_tokens)}, cached input: ${fmtInt(tokens.cached_input_tokens)}`);
  console.log(`  Output: ${fmtInt(tokens.output_tokens)}, reasoning output: ${fmtInt(tokens.reasoning_output_tokens)}`);
  console.log(`Projects: ${fmtInt(projects.size)}`);
  console.log(`Active days: ${fmtInt(activeDays.size)}`);
  console.log(`Longest streak: ${fmtInt(longestStreak(activeDays))} days`);
  console.log(`Busiest day: ${busiestDay[0]} (${fmtInt(busiestDay[1])} sessions)`);

  printTop("Top projects", projects, args.top);
  printTop("Top models", models, args.top);
  printTop("Providers", providers, args.top);
  printTop("Sources", sources, args.top);
  printTop("Top tools", tools, args.top);
  printTop("Activity by day", daySessions, args.top);
}

main().catch((error) => {
  console.error(error.message);
  usage();
  process.exit(1);
});

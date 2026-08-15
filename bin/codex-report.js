#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const CODEX_DIR = path.join(os.homedir(), ".codex");
const SESSIONS_DIR = path.join(CODEX_DIR, "sessions");
const SESSION_CACHE_VERSION = 5;
const SESSION_CACHE_PATH = path.join(CODEX_DIR, "cache", "codex-report-sessions-v5.json");
const SKILL_MD = "SKILL.md";
const SKILL_READ_COMMAND_RE = /(^|[;&|]\s*|["']\s*)\s*(?:[^\s"';&|]+[\\/])?(sed|cat|nl|wc|awk|head|tail)\b/;
const SKILL_PATH_RE = /((?:~[\\/]|[A-Za-z]:[\\/]|\/)[^\n\r'"`]*?[\\/]SKILL\.md)/g;
const TOKEN_KEYS = [
  "input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
];
// Standard OpenAI API text-token list prices in USD per 1M tokens.
// Sources: developers.openai.com model pages and openai.com/api/pricing, checked 2026-08-15.
const MODEL_PRICES_USD_PER_1M = new Map([
  ["gpt-5.6", { input: 5, cachedInput: 0.5, output: 30 }],
  ["gpt-5.6-sol", { input: 5, cachedInput: 0.5, output: 30 }],
  ["gpt-5.6-terra", { input: 2, cachedInput: 0.2, output: 12 }],
  ["gpt-5.6-luna", { input: 0.2, cachedInput: 0.02, output: 1.2 }],
  ["gpt-5.5", { input: 5, cachedInput: 0.5, output: 30 }],
  ["gpt-5.4", { input: 2.5, cachedInput: 0.25, output: 15 }],
  ["gpt-5.4-mini", { input: 0.75, cachedInput: 0.075, output: 4.5 }],
  ["gpt-5.4-nano", { input: 0.2, cachedInput: 0.02, output: 1.25 }],
  ["gpt-5.3-codex", { input: 1.75, cachedInput: 0.175, output: 14 }],
  ["gpt-5.2-codex", { input: 1.75, cachedInput: 0.175, output: 14 }],
  ["gpt-5.2", { input: 1.75, cachedInput: 0.175, output: 14 }],
  ["gpt-5.2-chat-latest", { input: 1.75, cachedInput: 0.175, output: 14 }],
  ["gpt-5.1-codex-max", { input: 1.25, cachedInput: 0.125, output: 10 }],
  ["gpt-5.1-codex", { input: 1.25, cachedInput: 0.125, output: 10 }],
  ["gpt-5.1", { input: 1.25, cachedInput: 0.125, output: 10 }],
  ["gpt-5-codex", { input: 1.25, cachedInput: 0.125, output: 10 }],
  ["gpt-5", { input: 1.25, cachedInput: 0.125, output: 10 }],
  ["gpt-5.1-codex-mini", { input: 0.25, cachedInput: 0.025, output: 2 }],
  ["gpt-5-mini", { input: 0.25, cachedInput: 0.025, output: 2 }],
  ["codex-mini-latest", { input: 1.5, cachedInput: 0.375, output: 6 }],
]);
const BOX_MIN_WIDTH = 76;
const BOX_MAX_WIDTH = 110;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SECTION_FLAGS = new Map([
  ["--weekly", "weekly"],
  ["--projects", "projects"],
  ["--models", "models"],
  ["--tools", "tools"],
  ["--activity", "activity"],
  ["--sources", "sources"],
  ["--providers", "providers"],
  ["--costs", "costs"],
  ["--skills", "skills"],
]);

function usage() {
  console.error("Usage: codex-report [--global] [--from YYYY-MM-DD|null] [--to YYYY-MM-DD] [--top 10] [--no-cache] [--weekly] [--projects] [--models] [--tools] [--activity] [--sources] [--providers] [--costs] [--skills]");
}

function parseArgs(argv) {
  const args = { from: null, to: null, global: false, top: 10, cache: true, sections: [] };

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
    } else if (arg === "--no-cache") {
      args.cache = false;
    } else if (SECTION_FLAGS.has(arg)) {
      const section = SECTION_FLAGS.get(arg);
      if (!args.sections.includes(section)) {
        args.sections.push(section);
      }
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

function resolveScope(forceGlobal) {
  if (forceGlobal) {
    return { type: "global", label: "global" };
  }

  return { type: "folder", root: process.cwd(), label: `folder ${process.cwd()}` };
}

function isInsideFolder(cwd, folderRoot) {
  if (cwd === "(unknown)") {
    return false;
  }

  const relative = path.relative(folderRoot, cwd);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sumMapValues(map) {
  return [...map.values()].reduce((sum, value) => sum + value, 0);
}

function emptyTokens() {
  return Object.fromEntries(TOKEN_KEYS.map((key) => [key, 0]));
}

function addTokens(total, usage) {
  if (!usage) {
    return;
  }

  for (const key of TOKEN_KEYS) {
    total[key] += Number(usage[key] ?? 0);
  }
}

function tokenDelta(current, previous) {
  if (!current) {
    return null;
  }

  const delta = emptyTokens();
  for (const key of TOKEN_KEYS) {
    const diff = Number(current[key] ?? 0) - Number(previous?.[key] ?? 0);
    if (diff < 0) {
      return null;
    }
    delta[key] = diff;
  }
  return delta;
}

function addModelTokens(map, model, usage) {
  const key = model ?? "(unknown)";
  if (!map.has(key)) {
    map.set(key, emptyTokens());
  }
  addTokens(map.get(key), usage);
}

function mergeTokenMaps(target, source) {
  for (const [key, usage] of source) {
    addModelTokens(target, key, usage);
  }
}

function tokenVolume(tokens) {
  return tokens.total_tokens
    || tokens.input_tokens + tokens.output_tokens
    || 0;
}

function sessionMessageCount(session) {
  return (session.messages.get("user") ?? 0) + (session.messages.get("assistant") ?? 0);
}

function sessionTokenCount(session) {
  return session.tokens.total_tokens ?? 0;
}

function hasActivity(session) {
  return sessionMessageCount(session) > 0 || sessionTokenCount(session) > 0;
}

function mapEntries(map) {
  return [...(map ?? new Map()).entries()];
}

function mapFromEntries(entries) {
  return new Map(entries ?? []);
}

function serializeDailySession(session) {
  return {
    ...session,
    firstTs: session.firstTs?.toISOString() ?? null,
    lastTs: session.lastTs?.toISOString() ?? null,
    messages: mapEntries(session.messages),
    tools: mapEntries(session.tools),
    modelTokens: mapEntries(session.modelTokens),
    models: mapEntries(session.models),
    rawSkillEvidence: {
      reads: mapEntries(session.rawSkillEvidence?.reads),
      mentions: mapEntries(session.rawSkillEvidence?.mentions),
    },
  };
}

function deserializeDailySession(value) {
  return {
    ...value,
    firstTs: value.firstTs ? new Date(value.firstTs) : null,
    lastTs: value.lastTs ? new Date(value.lastTs) : null,
    messages: mapFromEntries(value.messages),
    tools: mapFromEntries(value.tools),
    modelTokens: mapFromEntries(value.modelTokens),
    models: mapFromEntries(value.models),
    rawSkillEvidence: {
      reads: mapFromEntries(value.rawSkillEvidence?.reads),
      mentions: mapFromEntries(value.rawSkillEvidence?.mentions),
    },
  };
}

function serializeParsedSession(session) {
  return {
    ...session,
    days: mapEntries(new Map(
      [...session.days].map(([day, value]) => [day, serializeDailySession(value)]),
    )),
  };
}

function deserializeParsedSession(value) {
  return {
    ...value,
    days: new Map(
      (value.days ?? []).map(([day, session]) => [day, deserializeDailySession(session)]),
    ),
  };
}

async function readSessionCache() {
  try {
    const cache = JSON.parse(await fs.promises.readFile(SESSION_CACHE_PATH, "utf8"));
    if (cache.version === SESSION_CACHE_VERSION && cache.entries && typeof cache.entries === "object") {
      return cache;
    }
  } catch {
    // Missing or invalid cache files are expected on first run.
  }
  return { version: SESSION_CACHE_VERSION, entries: {} };
}

async function writeSessionCache(cache) {
  try {
    await fs.promises.mkdir(path.dirname(SESSION_CACHE_PATH), { recursive: true });
    await fs.promises.writeFile(SESSION_CACHE_PATH, `${JSON.stringify(cache)}\n`);
  } catch {
    // Cache writes are a performance optimization; reporting should still work.
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

async function namedFiles(root, fileName) {
  if (!root || !fs.existsSync(root)) {
    return [];
  }

  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith("plugin-backup-") && !entry.name.startsWith("plugin-install-")) {
          stack.push(entryPath);
        }
      } else if (entry.isFile() && entry.name === fileName) {
        files.push(entryPath);
      }
    }
  }

  return files.sort();
}

function parseSkillName(content, fallback) {
  const match = /^name:\s*["']?([^"'\n]+)["']?\s*$/m.exec(content);
  return match?.[1]?.trim() || fallback;
}

function skillInfoForPath(skillPath, content = "") {
  const normalized = path.normalize(skillPath);
  const parts = normalized.split(path.sep);
  const fallbackName = path.basename(path.dirname(normalized));
  const name = parseSkillName(content, fallbackName);
  const home = os.homedir();
  const systemRoot = path.join(home, ".codex", "skills", ".system");
  const codexSkillsRoot = path.join(home, ".codex", "skills");
  const agentsSkillsRoot = path.join(home, ".agents", "skills");
  const cacheIndex = parts.lastIndexOf("cache");
  const skillsIndex = parts.lastIndexOf("skills");

  if (normalized === systemRoot || normalized.startsWith(`${systemRoot}${path.sep}`)) {
    return { name, scope: "system", path: normalized };
  }

  if (cacheIndex >= 0 && skillsIndex > cacheIndex && parts[cacheIndex - 1] === "plugins") {
    const pluginName = parts[cacheIndex + 2] || "app";
    const displayName = name.includes(":") ? name : `${pluginName}:${name}`;
    return { name: displayName, scope: "app", path: normalized };
  }

  if (normalized === codexSkillsRoot || normalized.startsWith(`${codexSkillsRoot}${path.sep}`)) {
    return { name, scope: "personal", path: normalized };
  }

  if (normalized === agentsSkillsRoot || normalized.startsWith(`${agentsSkillsRoot}${path.sep}`)) {
    return { name, scope: "personal", path: normalized };
  }

  if (normalized.includes(`${path.sep}.agents${path.sep}skills${path.sep}`)) {
    return { name, scope: "repo", path: normalized };
  }

  return { name, scope: "unknown", path: normalized };
}

async function discoverSkills(scope) {
  const roots = [
    path.join(os.homedir(), ".codex", "skills"),
    path.join(os.homedir(), ".agents", "skills"),
    path.join(os.homedir(), ".codex", "plugins", "cache"),
  ];

  if (scope.type === "folder") {
    roots.push(path.join(scope.root, ".agents", "skills"));
  }

  const byPath = new Map();
  const byName = new Map();

  for (const root of roots) {
    for (const skillPath of await namedFiles(root, SKILL_MD)) {
      let content = "";
      try {
        content = await fs.promises.readFile(skillPath, "utf8");
      } catch {
        // Keep the fallback folder-name metadata when a skill file cannot be read.
      }
      const info = skillInfoForPath(skillPath, content);
      byPath.set(info.path, info);
      if (!byName.has(info.name)) {
        byName.set(info.name, { ...info, paths: [] });
      }
      byName.get(info.name).paths.push(info.path);
    }
  }

  return { byPath, byName };
}

function emptySkillEvidence() {
  return {
    reads: new Map(),
    mentions: new Map(),
    names: new Map(),
    scopes: new Map(),
  };
}

function skillEvidenceKey(info) {
  return `${info.scope}\0${info.name}`;
}

function normalizeSkillPath(value) {
  const withoutTrailingPunctuation = String(value).replace(/[),.;:]+$/, "");
  const expanded = withoutTrailingPunctuation.startsWith("~/")
    ? path.join(os.homedir(), withoutTrailingPunctuation.slice(2))
    : withoutTrailingPunctuation;
  return path.normalize(expanded);
}

function parseFunctionArguments(value) {
  if (typeof value !== "string") {
    return value && typeof value === "object" ? value : {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function skillReadPathsFromCommand(command) {
  if (!command || !SKILL_READ_COMMAND_RE.test(command)) {
    return [];
  }

  return [...String(command).matchAll(SKILL_PATH_RE)]
    .map((match) => normalizeSkillPath(match[1]));
}

function recordSkillRead(evidence, skillRegistry, skillPath, count = 1) {
  const info = skillRegistry?.byPath.get(skillPath) ?? skillInfoForPath(skillPath);
  const key = skillEvidenceKey(info);
  increment(evidence.reads, key, count);
  evidence.names.set(key, info.name);
  evidence.scopes.set(key, info.scope);
}

function recordSkillMentions(evidence, skillRegistry, message) {
  if (!message || !skillRegistry) {
    return;
  }

  const mentioned = new Set();
  for (const match of String(message).matchAll(/\$([A-Za-z0-9][A-Za-z0-9:_-]*)/g)) {
    const name = match[1];
    if (skillRegistry.byName.has(name)) {
      mentioned.add(name);
    }
  }

  for (const name of mentioned) {
    increment(evidence.mentions, name);
    evidence.names.set(name, name);
    evidence.scopes.set(name, skillRegistry.byName.get(name).scope);
  }
}

function emptyRawSkillEvidence() {
  return {
    reads: new Map(),
    mentions: new Map(),
  };
}

function recordRawSkillMentions(evidence, message) {
  const mentioned = new Set();
  for (const match of String(message ?? "").matchAll(/\$([A-Za-z0-9][A-Za-z0-9:_-]*)/g)) {
    mentioned.add(match[1]);
  }
  for (const name of mentioned) {
    increment(evidence.mentions, name);
  }
}

function emptyDailySession() {
  return {
    firstTs: null,
    lastTs: null,
    messages: new Map(),
    tools: new Map(),
    tokens: emptyTokens(),
    modelTokens: new Map(),
    models: new Map(),
    rawSkillEvidence: emptyRawSkillEvidence(),
    tokenEvents: 0,
  };
}

function dailySessionFor(days, ts) {
  const day = ts ? localDay(ts) : "(undated)";
  if (!days.has(day)) {
    days.set(day, emptyDailySession());
  }
  const session = days.get(day);
  if (ts) {
    session.firstTs = session.firstTs == null || ts < session.firstTs ? ts : session.firstTs;
    session.lastTs = session.lastTs == null || ts > session.lastTs ? ts : session.lastTs;
  }
  return session;
}

async function parseSessionFile(filePath) {
  const meta = {};
  const days = new Map();
  let currentModel = null;
  let previousTotalUsage = emptyTokens();
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
    const eventType = event.type;
    const payload = event.payload ?? {};

    if (eventType === "session_meta") {
      Object.assign(meta, payload);
    }

    const daySession = dailySessionFor(days, ts);
    if (eventType === "turn_context") {
      if (payload.model) {
        currentModel = payload.model;
        increment(daySession.models, payload.model);
      }
    } else if (eventType === "event_msg") {
      if (payload.type === "user_message") {
        increment(daySession.messages, "user");
        recordRawSkillMentions(daySession.rawSkillEvidence, payload.message);
      } else if (payload.type === "agent_message") {
        increment(daySession.messages, "assistant");
      } else if (payload.type === "token_count") {
        const info = payload.info;
        const totalUsage = info?.total_token_usage;
        const usage = totalUsage
          ? (tokenDelta(totalUsage, previousTotalUsage) ?? info?.last_token_usage)
          : info?.last_token_usage;
        if (totalUsage) {
          previousTotalUsage = totalUsage;
        }
        if (usage) {
          addTokens(daySession.tokens, usage);
          addModelTokens(daySession.modelTokens, currentModel, usage);
          if (tokenVolume(usage) > 0) {
            daySession.tokenEvents += 1;
          }
        }
      }
    } else if (eventType === "response_item") {
      if (payload.type === "function_call" || payload.type === "custom_tool_call") {
        increment(daySession.tools, payload.name ?? payload.type);
        const args = parseFunctionArguments(payload.arguments);
        for (const skillPath of skillReadPathsFromCommand(args.cmd ?? args.command ?? "")) {
          increment(daySession.rawSkillEvidence.reads, skillPath);
        }
      }
    }
  }

  if (![...days.values()].some((day) => day.firstTs)) {
    return null;
  }

  return {
    path: filePath,
    id: meta.id ?? path.basename(filePath, ".jsonl"),
    cwd: label(meta.cwd),
    provider: label(meta.model_provider),
    source: label(meta.originator ?? meta.source),
    days,
  };
}

function mergeDailySession(target, source, skillRegistry) {
  for (const key of TOKEN_KEYS) target.tokens[key] += source.tokens[key] ?? 0;
  for (const [key, value] of source.messages) increment(target.messages, key, value);
  for (const [key, value] of source.tools) increment(target.tools, key, value);
  for (const [key, value] of source.models) increment(target.models, key, value);
  mergeTokenMaps(target.modelTokens, source.modelTokens);
  target.tokenEvents += source.tokenEvents ?? 0;

  for (const [skillPath, count] of source.rawSkillEvidence?.reads ?? []) {
    recordSkillRead(target.skillEvidence, skillRegistry, skillPath, count);
  }
  for (const [name, count] of source.rawSkillEvidence?.mentions ?? []) {
    if (skillRegistry?.byName.has(name)) {
      increment(target.skillEvidence.mentions, name, count);
      target.skillEvidence.names.set(name, name);
      target.skillEvidence.scopes.set(name, skillRegistry.byName.get(name).scope);
    }
  }
}

function materializeSession(parsed, start, end, skillRegistry) {
  const session = {
    path: parsed.path,
    id: parsed.id,
    firstTs: null,
    lastTs: null,
    cwd: parsed.cwd,
    provider: parsed.provider,
    source: parsed.source,
    messages: new Map(),
    tools: new Map(),
    tokens: emptyTokens(),
    modelTokens: new Map(),
    models: new Map(),
    skillEvidence: emptySkillEvidence(),
    tokenEvents: 0,
  };

  for (const [day, daily] of parsed.days) {
    const inRange = day === "(undated)"
      || !((start && daily.lastTs < start) || daily.firstTs > end);
    if (!inRange) {
      continue;
    }
    if (daily.firstTs) {
      session.firstTs = session.firstTs == null || daily.firstTs < session.firstTs ? daily.firstTs : session.firstTs;
      session.lastTs = session.lastTs == null || daily.lastTs > session.lastTs ? daily.lastTs : session.lastTs;
    }
    mergeDailySession(session, daily, skillRegistry);
  }

  return session.firstTs ? session : null;
}

async function readSession(filePath, start, end, skillRegistry = null) {
  const meta = {};
  let firstTs = null;
  let lastTs = null;
  const messages = new Map();
  const tools = new Map();
  const tokens = emptyTokens();
  const models = new Map();
  const modelTokens = new Map();
  const skillEvidence = emptySkillEvidence();
  let currentModel = null;
  let previousTotalUsage = emptyTokens();
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
    const inRange = !ts || !((start && ts < start) || ts > end);

    if (ts && inRange) {
      firstTs = firstTs == null || ts < firstTs ? ts : firstTs;
      lastTs = lastTs == null || ts > lastTs ? ts : lastTs;
    }

    const eventType = event.type;
    const payload = event.payload ?? {};

    if (eventType === "session_meta") {
      Object.assign(meta, payload);
    } else if (eventType === "turn_context") {
      if (payload.model) {
        currentModel = payload.model;
        if (inRange) {
          increment(models, payload.model);
        }
      }
    } else if (eventType === "event_msg") {
      if (!inRange) {
        const totalUsage = payload.type === "token_count"
          ? payload.info?.total_token_usage
          : null;
        if (totalUsage) {
          previousTotalUsage = totalUsage;
        }
        continue;
      }

      if (payload.type === "user_message") {
        increment(messages, "user");
        recordSkillMentions(skillEvidence, skillRegistry, payload.message);
      } else if (payload.type === "agent_message") {
        increment(messages, "assistant");
      } else if (payload.type === "token_count") {
        const info = payload.info;
        const totalUsage = info?.total_token_usage;
        const usage = totalUsage
          ? (tokenDelta(totalUsage, previousTotalUsage) ?? info?.last_token_usage)
          : info?.last_token_usage;
        if (totalUsage) {
          previousTotalUsage = totalUsage;
        }
        if (usage) {
          addTokens(tokens, usage);
          addModelTokens(modelTokens, currentModel, usage);
          if (tokenVolume(usage) > 0) {
            tokenEvents += 1;
          }
        }
      }
    } else if (inRange && eventType === "response_item") {
      if (payload.type === "function_call" || payload.type === "custom_tool_call") {
        increment(tools, payload.name ?? payload.type);
        const args = parseFunctionArguments(payload.arguments);
        for (const skillPath of skillReadPathsFromCommand(args.cmd ?? args.command ?? "")) {
          recordSkillRead(skillEvidence, skillRegistry, skillPath);
        }
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
    source: label(meta.originator ?? meta.source),
    messages,
    tools,
    tokens,
    modelTokens,
    models,
    skillEvidence,
    tokenEvents,
  };
}

async function readSessions(files, start, end, skillRegistry, useCache) {
  if (!useCache) {
    const sessions = [];
    for (const file of files) {
      const session = await readSession(file, start, end, skillRegistry);
      if (session) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  const cache = await readSessionCache();
  const sessions = [];
  const nextEntries = {};
  let changed = false;

  for (const file of files) {
    let stat;
    try {
      stat = await fs.promises.stat(file);
    } catch {
      continue;
    }

    const cached = cache.entries[file];
    let parsed;
    if (
      cached
      && cached.mtimeMs === stat.mtimeMs
      && cached.size === stat.size
      && Object.hasOwn(cached, "parsed")
    ) {
      parsed = cached.parsed ? deserializeParsedSession(cached.parsed) : null;
    } else {
      parsed = await parseSessionFile(file);
      changed = true;
    }

    nextEntries[file] = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      parsed: parsed ? serializeParsedSession(parsed) : null,
    };
    const session = parsed ? materializeSession(parsed, start, end, skillRegistry) : null;
    if (session) {
      sessions.push(session);
    }
  }

  if (Object.keys(cache.entries).length !== Object.keys(nextEntries).length) {
    changed = true;
  }
  if (changed) {
    await writeSessionCache({ version: SESSION_CACHE_VERSION, entries: nextEntries });
  }

  return sessions;
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

function fmtCompact(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000_000) {
    return `${(number / 1_000_000_000).toFixed(number >= 10_000_000_000 ? 0 : 1)}B`;
  }
  if (number >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
  }
  if (number >= 1_000) {
    return `${(number / 1_000).toFixed(number >= 10_000 ? 0 : 1)}K`;
  }
  return fmtInt(number);
}

function fmtUSD(value) {
  const number = Number(value) || 0;
  if (number === 0) {
    return "$0";
  }
  if (number >= 100) {
    return `$${number.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (number >= 10) {
    return `$${number.toFixed(2)}`;
  }
  if (number >= 1) {
    return `$${number.toFixed(3)}`;
  }
  return `$${number.toFixed(4)}`;
}

function shortPath(value) {
  if (!value || value === "(unknown)") {
    return value ?? "(unknown)";
  }

  const home = os.homedir();
  return value === home || value.startsWith(`${home}${path.sep}`)
    ? `~${value.slice(home.length)}`
    : value;
}

function truncate(value, width) {
  const text = String(value);
  if (text.length <= width) {
    return text;
  }

  if (width <= 3) {
    return text.slice(0, width);
  }

  return `${text.slice(0, width - 3)}...`;
}

function truncateMiddle(value, width) {
  const text = String(value);
  if (text.length <= width) {
    return text;
  }

  if (width <= 3) {
    return text.slice(0, width);
  }

  const head = Math.ceil((width - 3) / 2);
  const tail = Math.floor((width - 3) / 2);
  return `${text.slice(0, head)}...${text.slice(text.length - tail)}`;
}

function truncatePath(value, width) {
  const text = String(value);
  if (text.length <= width) {
    return text;
  }

  if (!text.includes("/")) {
    return truncateMiddle(text, width);
  }

  const parts = text.split("/");
  const last = parts.at(-1) || "";
  const collapsed = `~/.../${last}`;
  if (collapsed.length <= width) {
    return collapsed;
  }

  return `...${last.slice(Math.max(last.length - width + 3, 0))}`;
}

function terminalWidth() {
  return Math.min(Math.max(process.stdout.columns ?? 88, BOX_MIN_WIDTH), BOX_MAX_WIDTH);
}

function boxedLine(content, innerWidth) {
  return `│ ${truncate(content, innerWidth).padEnd(innerWidth)} │`;
}

function boxedBlank(innerWidth) {
  return boxedLine("", innerWidth);
}

function boxedTitle(title, innerWidth) {
  const text = `─ ${title} `;
  return `┌${text}${"─".repeat(Math.max(innerWidth + 2 - text.length, 0))}┐`;
}

function boxedFooter(innerWidth) {
  return `└${"─".repeat(innerWidth + 2)}┘`;
}

function infoLine(labelText, value, innerWidth) {
  const labelWidth = 12;
  const valueWidth = innerWidth - labelWidth;
  return boxedLine(`${labelText.padEnd(labelWidth)}${truncate(value, valueWidth)}`, innerWidth);
}

function bar(value, total, width = 16) {
  if (total <= 0 || value <= 0) {
    return "░".repeat(width);
  }

  const filled = Math.max(1, Math.round((value / total) * width));
  return `${"█".repeat(Math.min(filled, width))}${"░".repeat(Math.max(width - filled, 0))}`;
}

function topLine(name, count, total, unit, innerWidth) {
  const barWidth = 16;
  const percentWidth = 4;
  const countWidth = 16;
  const availableNameWidth = innerWidth - 2 - 1 - countWidth - 2 - barWidth - 1 - percentWidth;
  const nameWidth = Math.max(24, availableNameWidth);
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  const displayName = name.includes("/") ? truncatePath(name, nameWidth) : truncateMiddle(name, nameWidth);
  const left = `  ${displayName.padEnd(nameWidth)}`;
  const middle = `${fmtInt(count)} ${unit}`.padStart(countWidth);
  const right = `${bar(count, total, barWidth)} ${`${percent}%`.padStart(percentWidth)}`;
  return boxedLine(`${left} ${middle}  ${right}`, innerWidth);
}

function sortedEntries(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function topSection(lines, title, map, limit, unit, innerWidth) {
  const entries = sortedEntries(map);
  lines.push(boxedLine(title, innerWidth));
  if (entries.length === 0) {
    lines.push(boxedLine("  none", innerWidth));
    return;
  }

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  for (const [name, count] of entries.slice(0, limit)) {
    lines.push(topLine(shortPath(name), count, total, unit, innerWidth));
  }
}

function mergeSkillEvidence(target, source) {
  for (const [key, count] of source.reads ?? []) {
    increment(target.reads, key, count);
  }
  for (const [name, count] of source.mentions ?? []) {
    increment(target.mentions, name, count);
  }
  for (const [key, name] of source.names ?? []) {
    if (!target.names.has(key)) {
      target.names.set(key, name);
    }
  }
  for (const [key, scope] of source.scopes ?? []) {
    if (!target.scopes.has(key) || target.scopes.get(key) === "unknown") {
      target.scopes.set(key, scope);
    }
  }
}

function aggregateSkills(sessions, skillRegistry) {
  const evidence = emptySkillEvidence();
  const readSessions = new Map();
  const mentionSessions = new Map();

  for (const session of sessions) {
    mergeSkillEvidence(evidence, session.skillEvidence ?? emptySkillEvidence());
    for (const key of session.skillEvidence?.reads?.keys() ?? []) {
      increment(readSessions, key);
    }
    for (const name of session.skillEvidence?.mentions?.keys() ?? []) {
      increment(mentionSessions, name);
    }
  }

  const readNames = [...evidence.reads.keys()].map((key) => evidence.names.get(key) ?? key);
  const evidenceNames = new Set([
    ...readNames,
    ...evidence.mentions.keys(),
  ]);
  const activeSkills = [...(skillRegistry?.byName.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const skillScopes = new Map(activeSkills.map((skill) => [skill.name, skill.scope]));
  const noEvidence = activeSkills
    .filter((skill) => !evidenceNames.has(skill.name))
    .map((skill) => skill.name);
  const withEvidenceCount = activeSkills.length - noEvidence.length;
  const byScope = new Map();

  for (const skill of activeSkills) {
    if (!byScope.has(skill.scope)) {
      byScope.set(skill.scope, { active: 0, evidence: 0 });
    }
    const row = byScope.get(skill.scope);
    row.active += 1;
    if (evidenceNames.has(skill.name)) {
      row.evidence += 1;
    }
  }

  const topReads = sortedEntries(evidence.reads).map(([key, reads]) => ({
    key,
    name: evidence.names.get(key) ?? key,
    scope: evidence.scopes.get(key) ?? skillScopes.get(evidence.names.get(key)) ?? "unknown",
    reads,
    readSessions: readSessions.get(key) ?? 0,
    mentions: evidence.mentions.get(evidence.names.get(key) ?? key) ?? 0,
    mentionSessions: mentionSessions.get(evidence.names.get(key) ?? key) ?? 0,
  }));

  return {
    activeSkills,
    withEvidenceCount,
    evidence,
    evidenceNames,
    noEvidence,
    byScope,
    skillScopes,
    topReads,
    readSessions,
    mentionSessions,
  };
}

function normalizeModelName(model) {
  const normalized = String(model ?? "").trim().toLowerCase();
  if (MODEL_PRICES_USD_PER_1M.has(normalized)) {
    return normalized;
  }

  const withoutSnapshot = normalized.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return MODEL_PRICES_USD_PER_1M.has(withoutSnapshot) ? withoutSnapshot : normalized;
}

function modelPrice(model) {
  return MODEL_PRICES_USD_PER_1M.get(normalizeModelName(model));
}

function estimateCostForTokens(tokens, price) {
  const cachedInput = Math.min(tokens.cached_input_tokens ?? 0, tokens.input_tokens ?? 0);
  const uncachedInput = Math.max((tokens.input_tokens ?? 0) - cachedInput, 0);
  const output = tokens.output_tokens ?? 0;

  return (
    (uncachedInput / 1_000_000) * price.input
    + (cachedInput / 1_000_000) * price.cachedInput
    + (output / 1_000_000) * price.output
  );
}

function estimateCosts(modelTokens) {
  const pricedTokens = emptyTokens();
  const unpricedTokens = emptyTokens();
  const modelCosts = [];
  const unpricedModels = [];
  let totalCost = 0;

  for (const [model, tokens] of modelTokens) {
    if (tokenVolume(tokens) === 0) {
      continue;
    }

    const price = modelPrice(model);
    if (!price) {
      addTokens(unpricedTokens, tokens);
      unpricedModels.push({ model, tokens });
      continue;
    }

    const cost = estimateCostForTokens(tokens, price);
    addTokens(pricedTokens, tokens);
    totalCost += cost;
    modelCosts.push({
      model,
      canonicalModel: normalizeModelName(model),
      tokens,
      cost,
      price,
    });
  }

  modelCosts.sort((a, b) => b.cost - a.cost || a.model.localeCompare(b.model));
  unpricedModels.sort((a, b) => tokenVolume(b.tokens) - tokenVolume(a.tokens) || a.model.localeCompare(b.model));

  return {
    totalCost,
    pricedTokens,
    unpricedTokens,
    modelCosts,
    unpricedModels,
  };
}

function costLine(entry, totalCost, innerWidth) {
  const costWidth = 10;
  const detailWidth = 34;
  const percentWidth = 4;
  const availableNameWidth = innerWidth - 2 - 1 - costWidth - 2 - detailWidth - 1 - percentWidth;
  const nameWidth = Math.max(16, availableNameWidth);
  const percent = totalCost > 0 ? Math.round((entry.cost / totalCost) * 100) : 0;
  const detail = `${fmtCompact(entry.tokens.input_tokens)} in · ${fmtCompact(entry.tokens.cached_input_tokens)} cached · ${fmtCompact(entry.tokens.output_tokens)} out`;
  const left = `  ${truncateMiddle(entry.model, nameWidth).padEnd(nameWidth)}`;
  const middle = fmtUSD(entry.cost).padStart(costWidth);
  const right = `${truncate(detail, detailWidth).padEnd(detailWidth)} ${`${percent}%`.padStart(percentWidth)}`;
  return boxedLine(`${left} ${middle}  ${right}`, innerWidth);
}

function costSection(lines, title, estimate, limit, innerWidth) {
  lines.push(boxedLine(title, innerWidth));
  if (estimate.modelCosts.length === 0) {
    lines.push(boxedLine("  none", innerWidth));
    return;
  }

  for (const entry of estimate.modelCosts.slice(0, limit)) {
    lines.push(costLine(entry, estimate.totalCost, innerWidth));
  }

  if (estimate.unpricedModels.length > 0) {
    const unpriced = estimate.unpricedModels.slice(0, 3).map((entry) => entry.model).join(", ");
    lines.push(boxedLine(`  unpriced: ${truncate(unpriced, Math.max(12, innerWidth - 12))}`, innerWidth));
  }
}

function plainCostSection(estimate, limit) {
  const lines = ["Estimated API cost by model", ""];
  if (estimate.modelCosts.length === 0) {
    lines.push("none");
    return lines;
  }

  const modelWidth = Math.min(
    Math.max(12, terminalWidth() - 57),
    Math.max(12, ...estimate.modelCosts.slice(0, limit).map((entry) => entry.model.length)),
  );
  for (const entry of estimate.modelCosts.slice(0, limit)) {
    const detail = `${fmtCompact(entry.tokens.input_tokens)} in · ${fmtCompact(entry.tokens.cached_input_tokens)} cached · ${fmtCompact(entry.tokens.output_tokens)} out`;
    lines.push(`${truncateMiddle(entry.model, modelWidth).padEnd(modelWidth)} ${fmtUSD(entry.cost).padStart(10)}  ${detail}`);
  }
  lines.push("");
  lines.push(`Total estimated API cost: ${fmtUSD(estimate.totalCost)}`);
  if (estimate.unpricedModels.length > 0) {
    lines.push(`Unpriced models: ${estimate.unpricedModels.map((entry) => entry.model).join(", ")}`);
  }
  return lines;
}

function plainSkillsSection(analysis, limit) {
  const scopeOrder = ["personal", "app", "system", "repo", "unknown"];
  const scopeLabel = (scope) => (scope === "repo" ? "repo-specific" : scope);
  const lines = [
    "Skills",
    "",
    `Active skills        ${fmtInt(analysis.activeSkills.length)}`,
    `With evidence        ${fmtInt(analysis.withEvidenceCount)}`,
    `SKILL.md reads       ${fmtInt(sumMapValues(analysis.evidence.reads))}`,
    `$skill mentions     ${fmtInt(sumMapValues(analysis.evidence.mentions))}`,
    `No evidence          ${fmtInt(analysis.noEvidence.length)}`,
    "",
    "Top skills by SKILL.md reads",
    "",
  ];

  if (analysis.topReads.length === 0) {
    lines.push("none");
  } else {
    const totalReads = analysis.topReads.reduce((sum, entry) => sum + entry.reads, 0);
    for (const scope of scopeOrder) {
      const entries = analysis.topReads.filter((entry) => entry.scope === scope);
      if (entries.length === 0) {
        continue;
      }

      if (lines.at(-1) !== "") {
        lines.push("");
      }
      lines.push(scopeLabel(scope));

      const nameWidth = Math.min(
        Math.max(18, terminalWidth() - 50),
        Math.max(18, ...entries.slice(0, limit).map((entry) => entry.name.length)),
      );
      for (const entry of entries.slice(0, limit)) {
        const reads = `${fmtInt(entry.reads)} reads`.padStart(10);
        const sessions = `${fmtInt(entry.readSessions)} sessions`.padStart(12);
        const percent = totalReads > 0 ? Math.round((entry.reads / totalReads) * 100) : 0;
        lines.push(`${truncateMiddle(entry.name, nameWidth).padEnd(nameWidth)} ${reads} ${sessions}  ${bar(entry.reads, totalReads, 16)} ${`${percent}%`.padStart(4)}`);
      }
    }
  }

  lines.push("");
  lines.push("Active skills by scope");
  lines.push("");

  const totalActive = analysis.activeSkills.length;
  for (const scope of scopeOrder) {
    const row = analysis.byScope.get(scope);
    if (!row) {
      continue;
    }
    const labelText = scopeLabel(scope);
    const detail = `${fmtInt(row.evidence)}/${fmtInt(row.active)} with evidence`.padStart(24);
    const percent = totalActive > 0 ? Math.round((row.active / totalActive) * 100) : 0;
    lines.push(`${labelText.padEnd(14)} ${detail}  ${bar(row.active, totalActive, 16)} ${`${percent}%`.padStart(4)}`);
  }

  if (analysis.noEvidence.length > 0) {
    lines.push("");
    lines.push("No evidence");
    lines.push("");
    for (const name of analysis.noEvidence.slice(0, limit)) {
      lines.push(name);
    }
    if (analysis.noEvidence.length > limit) {
      lines.push(`... ${fmtInt(analysis.noEvidence.length - limit)} more`);
    }
  }

  lines.push("");
  lines.push("Best-effort from transcript evidence; SKILL.md reads are stronger than $skill mentions.");
  return lines;
}

function plainTopLine(name, count, total, unit, nameWidth) {
  const barWidth = 16;
  const percentWidth = 4;
  const countWidth = 16;
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  const displayName = name.includes("/") ? truncatePath(name, nameWidth) : truncateMiddle(name, nameWidth);
  const middle = `${fmtInt(count)} ${unit}`.padStart(countWidth);
  return `${displayName.padEnd(nameWidth)} ${middle}  ${bar(count, total, barWidth)} ${`${percent}%`.padStart(percentWidth)}`;
}

function plainTopSection(title, map, limit, unit, { emptyText = "none" } = {}) {
  const entries = sortedEntries(map);
  const lines = [title, ""];
  if (entries.length === 0) {
    lines.push(emptyText);
    return lines;
  }

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const maxNameWidth = Math.max(12, terminalWidth() - 40);
  const nameWidth = Math.min(maxNameWidth, Math.max(12, ...entries.slice(0, limit).map(([name]) => shortPath(name).length)));
  for (const [name, count] of entries.slice(0, limit)) {
    lines.push(plainTopLine(shortPath(name), count, total, unit, nameWidth));
  }
  return lines;
}

function activityLine(name, activity, totalMessages, innerWidth) {
  const barWidth = 16;
  const percentWidth = 4;
  const detailWidth = 20;
  const availableNameWidth = innerWidth - 2 - 1 - detailWidth - 2 - barWidth - 1 - percentWidth;
  const nameWidth = Math.max(12, availableNameWidth);
  const percent = totalMessages > 0 ? Math.round((activity.messages / totalMessages) * 100) : 0;
  const detail = `${fmtCompact(activity.messages)} msg | ${fmtCompact(activity.tokens)} tok`;
  const displayName = name.includes("/") ? truncatePath(name, nameWidth) : truncateMiddle(name, nameWidth);
  const left = `  ${displayName.padEnd(nameWidth)}`;
  const middle = truncate(detail, detailWidth).padStart(detailWidth);
  const right = `${bar(activity.messages, totalMessages, barWidth)} ${`${percent}%`.padStart(percentWidth)}`;
  return boxedLine(`${left} ${middle}  ${right}`, innerWidth);
}

function activitySection(lines, title, map, limit, innerWidth) {
  const entries = [...map.entries()].sort((a, b) => b[1].messages - a[1].messages || a[0].localeCompare(b[0]));
  lines.push(boxedLine(title, innerWidth));
  if (entries.length === 0 || entries.every(([, activity]) => activity.messages === 0 && activity.tokens === 0)) {
    lines.push(boxedLine("  none", innerWidth));
    return;
  }

  const totalMessages = entries.reduce((sum, [, activity]) => sum + activity.messages, 0);
  for (const [name, activity] of entries.slice(0, limit)) {
    lines.push(activityLine(name, activity, totalMessages, innerWidth));
  }
}

function plainActivityLine(name, activity, totalMessages, nameWidth) {
  const barWidth = 16;
  const percentWidth = 4;
  const detailWidth = 20;
  const percent = totalMessages > 0 ? Math.round((activity.messages / totalMessages) * 100) : 0;
  const detail = `${fmtCompact(activity.messages)} msg | ${fmtCompact(activity.tokens)} tok`;
  const displayName = name.includes("/") ? truncatePath(name, nameWidth) : truncateMiddle(name, nameWidth);
  return `${displayName.padEnd(nameWidth)} ${detail.padStart(detailWidth)}  ${bar(activity.messages, totalMessages, barWidth)} ${`${percent}%`.padStart(percentWidth)}`;
}

function plainActivitySection(title, map, limit) {
  const entries = [...map.entries()].sort((a, b) => b[1].messages - a[1].messages || a[0].localeCompare(b[0]));
  const lines = [title, ""];
  if (entries.length === 0 || entries.every(([, activity]) => activity.messages === 0 && activity.tokens === 0)) {
    lines.push("none");
    return lines;
  }

  const totalMessages = entries.reduce((sum, [, activity]) => sum + activity.messages, 0);
  const maxNameWidth = Math.max(12, terminalWidth() - 43);
  const nameWidth = Math.min(maxNameWidth, Math.max(12, ...entries.slice(0, limit).map(([name]) => name.length)));
  for (const [name, activity] of entries.slice(0, limit)) {
    lines.push(plainActivityLine(name, activity, totalMessages, nameWidth));
  }
  return lines;
}

function weekdayIndex(date) {
  return (date.getDay() + 6) % 7;
}

function weeklyActivity(sessions) {
  const counts = new Map(WEEKDAYS.map((day) => [day, { messages: 0, tokens: 0 }]));
  for (const session of sessions) {
    const day = WEEKDAYS[weekdayIndex(session.firstTs)];
    const activity = counts.get(day);
    activity.messages += sessionMessageCount(session);
    activity.tokens += sessionTokenCount(session);
  }
  return counts;
}

function weeklyActivitySection(lines, sessions, innerWidth) {
  const counts = weeklyActivity(sessions);
  const maxMessages = Math.max(...[...counts.values()].map((activity) => activity.messages), 0);
  const labelWidth = 5;
  const detailWidth = 28;
  const barWidth = Math.max(12, Math.min(28, innerWidth - 2 - labelWidth - 1 - detailWidth));

  lines.push(boxedLine("Weekly activity", innerWidth));
  if (maxMessages === 0 && [...counts.values()].every((activity) => activity.tokens === 0)) {
    lines.push(boxedLine("  none", innerWidth));
    return;
  }

  for (const [day, activity] of counts) {
    const detail = `${fmtInt(activity.messages)} messages | ${fmtCompact(activity.tokens)} tok`;
    const line = `  ${day.padEnd(labelWidth)}${bar(activity.messages, maxMessages, barWidth)} ${truncate(detail, detailWidth).padStart(detailWidth)}`;
    lines.push(boxedLine(line, innerWidth));
  }
}

function plainWeeklyActivitySection(sessions) {
  const counts = weeklyActivity(sessions);
  const maxMessages = Math.max(...[...counts.values()].map((activity) => activity.messages), 0);
  const lines = ["Weekly activity", ""];

  if (maxMessages === 0 && [...counts.values()].every((activity) => activity.tokens === 0)) {
    lines.push("none");
    return lines;
  }

  for (const [day, activity] of counts) {
    const detail = `${fmtInt(activity.messages)} messages | ${fmtCompact(activity.tokens)} tok`;
    lines.push(`${day.padEnd(3)}  ${bar(activity.messages, maxMessages, 28)}  ${detail}`);
  }
  return lines;
}

function reportScopeLabel(scope) {
  return scope.type === "folder"
    ? `folder ${shortPath(scope.root)}`
    : scope.label;
}

function reportPeriodLabel(start, end, sessions) {
  const firstDay = sessions.reduce((earliest, session) => (
    earliest == null || session.firstTs < earliest ? session.firstTs : earliest
  ), null) ?? end;
  return `${localDay(start ?? firstDay)} → ${localDay(end)}`;
}

function plainReportHeader({ scope, start, end, sessions }) {
  return [
    `Scope   ${reportScopeLabel(scope)}`,
    `Period  ${reportPeriodLabel(start, end, sessions)}`,
  ];
}

function renderReport({ args, scope, start, end, sessions, daySessions, activeDays, tokens, messages, tools, projects, providers, sources, models, costEstimate }) {
  const width = terminalWidth();
  const innerWidth = width - 4;
  const totalMessages = (messages.get("user") ?? 0) + (messages.get("assistant") ?? 0);
  const busiestDay = [...daySessions.entries()].sort((a, b) => b[1].messages - a[1].messages || a[0].localeCompare(b[0]))[0] ?? ["none", { messages: 0, tokens: 0 }];
  const lines = [boxedTitle("codex-report", innerWidth)];

  lines.push(infoLine("Scope", reportScopeLabel(scope), innerWidth));
  lines.push(infoLine("Period", reportPeriodLabel(start, end, sessions), innerWidth));
  lines.push(infoLine("Sessions", fmtInt(sessions.length), innerWidth));
  if (scope.type === "global") {
    lines.push(infoLine("Projects", fmtInt(projects.size), innerWidth));
  }
  lines.push(infoLine("Messages", `${fmtInt(totalMessages)} (${fmtInt(messages.get("user") ?? 0)} user, ${fmtInt(messages.get("assistant") ?? 0)} assistant)`, innerWidth));
  lines.push(infoLine("Tokens", `${fmtInt(tokens.total_tokens)} total`, innerWidth));
  lines.push(infoLine("", `${fmtInt(tokens.input_tokens)} input · ${fmtInt(tokens.cached_input_tokens)} cached · ${fmtInt(tokens.output_tokens)} output`, innerWidth));
  lines.push(infoLine("API cost", `${fmtUSD(costEstimate.totalCost)} estimated from priced local tokens`, innerWidth));
  if (tokenVolume(costEstimate.unpricedTokens) > 0) {
    lines.push(infoLine("", `${fmtCompact(tokenVolume(costEstimate.unpricedTokens))} tokens in unpriced models`, innerWidth));
  }
  lines.push(infoLine("Active days", `${fmtInt(activeDays.size)} · longest streak ${fmtInt(longestStreak(activeDays))} days`, innerWidth));
  lines.push(infoLine("Busiest day", `${busiestDay[0]} (${fmtInt(busiestDay[1].messages)} messages)`, innerWidth));
  lines.push(boxedBlank(innerWidth));

  weeklyActivitySection(lines, sessions, innerWidth);
  lines.push(boxedBlank(innerWidth));
  if (scope.type === "global") {
    topSection(lines, "Top projects", projects, args.top, "sessions", innerWidth);
    lines.push(boxedBlank(innerWidth));
  }

  topSection(lines, "Top models", models, args.top, "turns", innerWidth);
  lines.push(boxedBlank(innerWidth));
  costSection(lines, "Estimated API cost by model", costEstimate, args.top, innerWidth);
  lines.push(boxedBlank(innerWidth));
  topSection(lines, "Top tools", tools, args.top, "calls", innerWidth);
  lines.push(boxedBlank(innerWidth));
  activitySection(lines, "Activity by day", daySessions, args.top, innerWidth);
  lines.push(boxedBlank(innerWidth));
  topSection(lines, "Sources", sources, Math.min(args.top, 3), "sessions", innerWidth);
  lines.push(boxedBlank(innerWidth));
  topSection(lines, "Providers", providers, Math.min(args.top, 3), "sessions", innerWidth);
  lines.push(boxedFooter(innerWidth));

  return lines.join("\n");
}

function renderPlainSections({ args, scope, start, end, sessions, daySessions, tools, projects, providers, sources, models, costEstimate, skillAnalysis }) {
  const sections = [plainReportHeader({ scope, start, end, sessions })];
  for (const section of args.sections) {
    if (section === "weekly") {
      sections.push(plainWeeklyActivitySection(sessions));
    } else if (section === "projects") {
      sections.push(scope.type === "global"
        ? plainTopSection("Top projects", projects, args.top, "sessions")
        : ["Top projects", "", "current folder scope; use --global to compare projects"]);
    } else if (section === "models") {
      sections.push(plainTopSection("Top models", models, args.top, "turns"));
    } else if (section === "tools") {
      sections.push(plainTopSection("Top tools", tools, args.top, "calls"));
    } else if (section === "activity") {
      sections.push(plainActivitySection("Activity by day", daySessions, args.top));
    } else if (section === "sources") {
      sections.push(plainTopSection("Sources", sources, Math.min(args.top, 3), "sessions"));
    } else if (section === "providers") {
      sections.push(plainTopSection("Providers", providers, Math.min(args.top, 3), "sessions"));
    } else if (section === "costs") {
      sections.push(plainCostSection(costEstimate, args.top));
    } else if (section === "skills") {
      sections.push(plainSkillsSection(skillAnalysis, args.top));
    }
  }

  return sections.map((lines) => lines.join("\n")).join("\n\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let scope = resolveScope(args.global);
  const start = parseDate(args.from);
  const end = parseDate(args.to ?? localDay(new Date()), { endOfDay: !args.to?.includes("T") });
  const wantsSkills = args.sections.includes("skills");
  const skillRegistry = wantsSkills ? await discoverSkills(scope) : null;
  const files = await sessionFiles(SESSIONS_DIR);
  const cacheSupportsRange = !args.from?.includes("T") && !args.to?.includes("T");
  const allSessions = (await readSessions(files, start, end, skillRegistry, args.cache && cacheSupportsRange))
    .filter((session) => hasActivity(session));

  const sessions = [];

  if (scope.type === "folder") {
    for (const session of allSessions) {
      if (isInsideFolder(session.cwd, scope.root)) {
        sessions.push(session);
      }
    }

    if (sessions.length === 0) {
      scope = {
        type: "global",
        label: `global (no sessions in folder ${shortPath(scope.root)})`,
      };
      sessions.push(...allSessions);
    }
  } else {
    sessions.push(...allSessions);
  }

  const daySessions = new Map();
  const activeDays = new Set();
  const tokens = emptyTokens();
  const messages = new Map();
  const tools = new Map();
  const projects = new Map();
  const providers = new Map();
  const sources = new Map();
  const models = new Map();
  const modelTokens = new Map();

  for (const session of sessions) {
    const day = localDay(session.firstTs);
    if (!daySessions.has(day)) {
      daySessions.set(day, { messages: 0, tokens: 0 });
    }
    daySessions.get(day).messages += sessionMessageCount(session);
    daySessions.get(day).tokens += sessionTokenCount(session);
    activeDays.add(day);

    for (const key of TOKEN_KEYS) {
      tokens[key] += session.tokens[key] ?? 0;
    }
    for (const [key, value] of session.messages) increment(messages, key, value);
    for (const [key, value] of session.tools) increment(tools, key, value);
    for (const [key, value] of session.models) increment(models, key, value);
    mergeTokenMaps(modelTokens, session.modelTokens);
    increment(projects, session.cwd);
    increment(providers, session.provider);
    increment(sources, session.source);
  }

  const costEstimate = estimateCosts(modelTokens);
  const skillAnalysis = wantsSkills
    ? aggregateSkills(sessions, skillRegistry)
    : aggregateSkills([], { byName: new Map() });

  const report = {
    args,
    scope,
    start,
    end,
    sessions,
    daySessions,
    activeDays,
    tokens,
    messages,
    tools,
    projects,
    providers,
    sources,
    models,
    modelTokens,
    costEstimate,
    skillAnalysis,
  };

  console.log(args.sections.length > 0 ? renderPlainSections(report) : renderReport(report));
}

main().catch((error) => {
  console.error(error.message);
  usage();
  process.exit(1);
});

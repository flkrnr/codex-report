import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { jsonlEvents } from "../files.js";
import { extraHomes } from "../sources.js";
import { parseTimestamp, label, increment } from "../utils.js";
import { emptyTokens, dailySessionFor, addTokens, addModelTokens, mergeParsedDays } from "../session.js";
import { normalizeSkillPath, skillReadPathsFromCommand, recordRawSkillMentions } from "../skills.js";

const INSIGHTS_CACHE_VERSION = 1;
const EFFORT_SUFFIX_RE = /-(minimal|low|medium|high|xhigh)$/;
const USER_REQUEST_RE = /<user_request>\s*([\s\S]*?)\s*<\/user_request>/i;
const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function count(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function normalizeAntigravityTokens(event) {
  const tokens = emptyTokens();
  const cached = count(event.cache_read_tokens);
  const writes = count(event.cache_write_tokens ?? event.cache_creation_input_tokens);
  tokens.cached_input_tokens = cached;
  tokens.cache_creation_input_tokens = writes;
  tokens.input_tokens = count(event.input_tokens) + cached + writes;
  tokens.output_tokens = count(event.output_tokens);
  tokens.reasoning_output_tokens = count(event.thinking_tokens ?? event.reasoning_output_tokens);
  tokens.total_tokens = tokens.input_tokens + tokens.output_tokens;
  return tokens;
}

function unwrapArg(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { return JSON.parse(trimmed); } catch { return value; }
  }
  return value;
}

function conversationIdFor(filePath) {
  const parts = path.normalize(filePath).split(path.sep);
  const brainIndex = parts.lastIndexOf("brain");
  if (brainIndex >= 0 && parts[brainIndex + 1]) return parts[brainIndex + 1];
  return path.basename(path.dirname(filePath));
}

function rootForTranscript(filePath) {
  const parts = path.normalize(filePath).split(path.sep);
  const brainIndex = parts.lastIndexOf("brain");
  if (brainIndex > 0) return parts.slice(0, brainIndex).join(path.sep) || path.sep;
  return path.dirname(filePath);
}

function uriToPath(uri) {
  if (typeof uri !== "string" || !uri) return null;
  if (!uri.startsWith("file://")) return uri;
  try { return fileURLToPath(uri); } catch { return null; }
}

function cwdFromWorkspaceUris(raw) {
  if (typeof raw !== "string" || !raw) return "(unknown)";
  let uris;
  try { uris = JSON.parse(raw); } catch { return "(unknown)"; }
  if (!Array.isArray(uris)) return "(unknown)";
  const paths = uris.map(uriToPath).filter(Boolean);
  const primary = paths.find((entry) => !entry.endsWith(`${path.sep}.t3${path.sep}userdata${path.sep}attachments`));
  return label(primary ?? paths[0]);
}

function readSummaryRows(dbPath) {
  const rows = new Map();
  if (!fs.existsSync(dbPath)) return rows;
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const stmt = db.prepare(
      "SELECT conversation_id, workspace_uris, app_data_dir, source, parent_conversation_id FROM conversation_summaries",
    );
    for (const row of stmt.all()) {
      rows.set(row.conversation_id, {
        cwd: cwdFromWorkspaceUris(row.workspace_uris),
        source: row.app_data_dir || row.source || null,
        parentSessionId: row.parent_conversation_id || null,
      });
    }
  } catch {
    // Missing or busy SQLite summary DB must not block transcript parsing.
  } finally {
    db?.close();
  }
  return rows;
}

function summaryFor(filePath, id, context) {
  const root = rootForTranscript(filePath);
  const cacheKey = `summary:${root}`;
  if (!context.has(cacheKey)) context.set(cacheKey, readSummaryRows(path.join(root, "conversation_summaries.db")));
  const row = context.get(cacheKey).get(id);
  const fallbackSource = path.basename(root) || "Antigravity";
  return {
    cwd: row?.cwd ?? "(unknown)",
    source: label(row?.source || fallbackSource),
    parentSessionId: row?.parentSessionId ?? null,
  };
}

function inRange(timestamp, start, end) {
  return !(start && timestamp < start) && !(end && timestamp > end);
}

function userPromptText(content) {
  const text = String(content ?? "");
  const match = USER_REQUEST_RE.exec(text);
  return match ? match[1] : text;
}

function toolSkillPaths(call, cwd) {
  const name = label(call.name);
  const args = call.args && typeof call.args === "object" ? call.args : {};
  if (name === "run_command") {
    return skillReadPathsFromCommand(String(unwrapArg(args.CommandLine ?? args.command) ?? ""));
  }
  if (name !== "read_file" && name !== "view_file") return [];
  const file = unwrapArg(args.Path ?? args.AbsolutePath ?? args.file_path);
  if (typeof file !== "string" || path.basename(file) !== "SKILL.md") return [];
  const resolved = path.isAbsolute(file) || file.startsWith("~/") || cwd === "(unknown)"
    ? file
    : path.resolve(cwd, file);
  return [normalizeSkillPath(resolved)];
}

function applyToolCalls(daily, calls, cwd) {
  for (const call of Array.isArray(calls) ? calls : []) {
    if (!call || typeof call !== "object") continue;
    increment(daily.tools, label(call.name));
    for (const skillPath of toolSkillPaths(call, cwd)) increment(daily.rawSkillEvidence.reads, skillPath);
  }
}

function applyPlannerResponse(daily, event, startsTurn, cwd) {
  if (String(event.content ?? "").trim() !== "") increment(daily.messages, "assistant");
  const model = label(event.model);
  if (startsTurn) {
    increment(daily.models, model);
    const effort = EFFORT_SUFFIX_RE.exec(model)?.[1];
    if (effort) increment(daily.reasoningEfforts, effort);
  }
  const tokens = normalizeAntigravityTokens(event);
  if (tokens.total_tokens > 0) {
    addTokens(daily.tokens, tokens);
    addModelTokens(daily.modelTokens, model, tokens);
    daily.tokenEvents += 1;
  }
  applyToolCalls(daily, event.tool_calls, cwd);
}

async function parseAntigravityFile(filePath, context, start, end) {
  const id = conversationIdFor(filePath);
  const meta = summaryFor(filePath, id, context);
  const days = new Map();
  let openTurn = false;
  let hasEvents = false;

  for await (const event of jsonlEvents(filePath)) {
    const timestamp = parseTimestamp(event.created_at);
    if (!timestamp) continue;
    const isUser = event.type === "USER_INPUT" && event.source === "USER_EXPLICIT";
    const isPlanner = event.type === "PLANNER_RESPONSE";
    if (!isUser && !isPlanner) continue;
    const startsTurn = isPlanner && openTurn;
    if (isUser) openTurn = true;
    if (isPlanner) openTurn = false;
    if (!inRange(timestamp, start, end)) continue;
    hasEvents = true;
    const daily = dailySessionFor(days, timestamp);
    if (isUser) {
      increment(daily.messages, "user");
      recordRawSkillMentions(daily.rawSkillEvidence, userPromptText(event.content));
    } else {
      applyPlannerResponse(daily, event, startsTurn, meta.cwd);
    }
  }

  if (!hasEvents) return null;
  return {
    agent: "antigravity", id, path: filePath, parentSessionId: meta.parentSessionId,
    cwd: meta.cwd, repositoryUrl: null, provider: "google", source: meta.source,
    turnIds: new Set(), insightsVersion: INSIGHTS_CACHE_VERSION, timeZone: localTimeZone(), days,
  };
}

function reconcileAntigravitySessions(parsedSessions) {
  const roots = new Map(parsedSessions.filter((parsed) => !parsed.parentSessionId).map((parsed) => [parsed.id, parsed]));
  const sessions = new Map();
  for (const parsed of parsedSessions) {
    const id = parsed.parentSessionId ?? parsed.id;
    if (!sessions.has(id)) sessions.set(id, { ...(roots.get(id) ?? parsed), id, days: new Map() });
    mergeParsedDays(sessions.get(id).days, parsed.days);
  }
  return [...sessions.values()];
}

async function t3AntigravityHomes(home) {
  const base = path.join(home, ".t3", "userdata", "providers", "antigravity");
  let entries;
  try { entries = await fs.promises.readdir(base, { withFileTypes: true }); }
  catch { return []; }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(base, entry.name, "antigravity-acp"));
}

async function transcriptsInRoot(root) {
  const brainDir = path.join(root, "brain");
  let entries;
  try { entries = await fs.promises.readdir(brainDir, { withFileTypes: true }); }
  catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".st")) continue;
    const file = path.join(brainDir, entry.name, ".system_generated", "logs", "transcript.jsonl");
    if (await fs.promises.stat(file).then((stat) => stat.isFile()).catch(() => false)) files.push(file);
  }
  return files;
}

async function deduplicateByConversationId(files) {
  const byId = new Map();
  for (const file of files) {
    const id = conversationIdFor(file);
    byId.set(id, [...byId.get(id) ?? [], file]);
  }
  const dropped = new Set();
  for (const copies of byId.values()) {
    if (copies.length < 2) continue;
    const sizes = await Promise.all(copies.map(async (file) => (await fs.promises.stat(file)).size));
    const keep = sizes.indexOf(Math.max(...sizes));
    copies.forEach((file, index) => { if (index !== keep) dropped.add(file); });
  }
  return files.filter((file) => !dropped.has(file)).sort();
}

async function discoverAntigravityTranscripts(explicitHome) {
  const home = os.homedir();
  const roots = explicitHome
    ? [explicitHome, ...extraHomes("antigravity")]
    : [
      path.join(home, ".gemini", "antigravity-cli"),
      path.join(home, ".gemini", "antigravity"),
      ...(await t3AntigravityHomes(home)),
      ...extraHomes("antigravity"),
    ];
  const uniqueRoots = [...new Set(roots.map((root) => path.resolve(root)))];
  const files = (await Promise.all(uniqueRoots.map(transcriptsInRoot))).flat();
  return deduplicateByConversationId(files);
}

export function antigravityAdapter() {
  const explicitHome = process.env.ANTIGRAVITY_HOME || "";
  const cacheHome = explicitHome || path.join(os.homedir(), ".gemini", "antigravity-cli");
  return {
    id: "antigravity",
    name: "Antigravity",
    cacheVersion: 1,
    insightsVersion: INSIGHTS_CACHE_VERSION,
    cachePath: path.join(cacheHome, "cache", "codex-report-antigravity-sessions-v1.json"),
    cachePattern: /^codex-report-antigravity-sessions-v\d+\.json$/,
    skillRoots: [
      path.join(cacheHome, "builtin", "skills"),
      path.join(os.homedir(), ".gemini", "antigravity-cli", "builtin", "skills"),
    ],
    projectSkillRoots: [".agents/skills"],
    discover: () => discoverAntigravityTranscripts(explicitHome),
    parse: parseAntigravityFile,
    reconcile: reconcileAntigravitySessions,
    cacheValid: (parsed) => parsed.timeZone === localTimeZone(),
    fileId: conversationIdFor,
    references: (parsed) => parsed.parentSessionId ? [parsed.parentSessionId] : [],
  };
}

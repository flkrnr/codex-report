import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fmtInt } from "./format.js";
import { serializeParsedSession, deserializeParsedSession } from "./session.js";

async function readCache(adapter) {
  try {
    const cache = JSON.parse(await fs.readFile(adapter.cachePath, "utf8"));
    if ((!cache.agent || cache.agent === adapter.id) && cache.version === adapter.cacheVersion && cache.entries && typeof cache.entries === "object") return cache;
  } catch { /* A missing/corrupt cache can always be rebuilt. */ }
  return { version: adapter.cacheVersion, entries: {} };
}

async function writeCache(adapter, entries) {
  const temporary = `${adapter.cachePath}.${randomUUID()}.tmp`;
  try {
    await fs.mkdir(path.dirname(adapter.cachePath), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify({ agent: adapter.id, version: adapter.cacheVersion, entries }) + "\n");
    await fs.rename(temporary, adapter.cachePath);
  } catch { /* Reporting must work even when caching is unavailable. */ }
  finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}

export async function clearSessionCaches(adapters) {
  let removed = 0;
  for (const adapter of adapters) {
    const dir = path.dirname(adapter.cachePath);
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    const owned = entries.filter((entry) => entry.isFile() && adapter.cachePattern.test(entry.name));
    for (const entry of owned) await fs.unlink(path.join(dir, entry.name));
    removed += owned.length;
  }
  return removed;
}


function cacheEntryMatches(entry, stat) {
  return entry && entry.size === stat.size && entry.mtimeMs === stat.mtimeMs && Object.hasOwn(entry, "parsed");
}

function parsedCacheMatches(parsed, adapter, requireInsights) {
  if (requireInsights && parsed.insightsVersion !== adapter.insightsVersion) return false;
  return !adapter.cacheValid || adapter.cacheValid(parsed);
}

function cachedSession(entry, stat, adapter, requireInsights) {
  if (!cacheEntryMatches(entry, stat)) return undefined;
  if (entry.parsed == null) return null;
  if (!parsedCacheMatches(entry.parsed, adapter, requireInsights)) return undefined;
  try { return deserializeParsedSession(entry.parsed); }
  catch { return undefined; }
}

async function sourceRecords(files, cache, adapter, requireInsights) {
  const records = [];
  for (const file of files) {
    let stat;
    try { stat = await fs.stat(file); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    records.push({ file, stat, parsed: cachedSession(cache.entries[file], stat, adapter, requireInsights) });
  }
  return records;
}

function logCache(records) {
  const misses = records.filter((r) => r.parsed === undefined).length;
  const fileLabel = records.length === 1 ? "session file" : "session files";
  console.error(misses === 0
    ? `Cache hit: using ${fmtInt(records.length)} cached ${fileLabel}.`
    : `Cache miss: recalculating ${fmtInt(misses)} of ${fmtInt(records.length)} ${fileLabel}.`);
}

// Cache orchestration is shared; transcript semantics and reconciliation belong to adapters.

async function loadRecord(adapter, record, options, context) {
  const parsed = options.useCache && record.parsed !== undefined
    ? record.parsed
    : await adapter.parse(record.file, context, options.useCache ? null : options.start, options.useCache ? null : options.end);
  if (parsed) {
    parsed.agent = adapter.id;
    context.set(parsed.id, parsed.turnIds);
  }
  return parsed;
}

export async function readParsedSessions(adapter, files, options) {
  const context = new Map();
  const cache = options.useCache ? await readCache(adapter) : { entries: {} };
  const records = await sourceRecords(files, cache, adapter, options.requireInsights);
  if (options.useCache) logCache(records);
  else console.error(`Cache bypassed: recalculating ${fmtInt(files.length)} session ${files.length === 1 ? "file" : "files"}.`);
  const parsedSessions = [];
  const entries = {};
  for (const record of records) {
    const parsed = await loadRecord(adapter, record, options, context);
    if (parsed) parsedSessions.push(parsed);
    entries[record.file] = { size: record.stat.size, mtimeMs: record.stat.mtimeMs, parsed: parsed ? serializeParsedSession(parsed) : null };
  }
  const changed = records.some((record) => record.parsed === undefined) || Object.keys(cache.entries).length !== records.length;
  if (options.useCache && changed) await writeCache(adapter, entries);
  return adapter.reconcile(parsedSessions, { start: options.start, end: options.end });
}

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readParsedSessions } from "../lib/cache.js";

// Cache bypass must avoid persistence work even when an adapter has many turn IDs.
test("cache bypass does not serialize session summaries, while cache misses persist them", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-cache-work-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "session.jsonl");
  await fs.writeFile(file, "{}\n");
  let serializations = 0;
  const turnIds = new Set(["turn-1"]);
  turnIds[Symbol.iterator] = function* () {
    serializations += 1;
    yield* Set.prototype.values.call(this);
  };
  const parsed = { id: "session", turnIds, days: new Map(), insightsVersion: 1 };
  const adapter = {
    id: "codex", cacheVersion: 1, insightsVersion: 1,
    cachePath: path.join(directory, "cache.json"),
    parse: async () => parsed,
    reconcile: (sessions) => sessions,
  };
  const options = { useCache: false, requireInsights: true, start: null, end: null };
  const sessions = await readParsedSessions(adapter, [file], options);
  assert.equal(sessions[0], parsed);
  assert.equal(serializations, 0);
  await assert.rejects(fs.stat(adapter.cachePath), { code: "ENOENT" });

  await readParsedSessions(adapter, [file], { ...options, useCache: true });
  assert.equal(serializations, 1);
  const cache = JSON.parse(await fs.readFile(adapter.cachePath, "utf8"));
  assert.deepEqual(cache.entries[file].parsed.turnIds, ["turn-1"]);
});

async function periodFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codex-report-period-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const old = path.join(directory, "old.jsonl");
  const current = path.join(directory, "current.jsonl");
  await fs.writeFile(old, "{}\n");
  await fs.writeFile(current, "{}\n");
  await fs.utimes(old, new Date("2026-08-01T00:00:00Z"), new Date("2026-08-01T00:00:00Z"));
  const parses = [];
  const adapter = {
    id: "codex", cacheVersion: 1, insightsVersion: 1,
    cachePath: path.join(directory, "cache.json"),
    fileId: (file) => path.basename(file, ".jsonl"),
    references: (parsed) => parsed.id === "current" ? ["old"] : [],
    parse: async (file) => {
      parses.push(path.basename(file, ".jsonl"));
      return { id: path.basename(file, ".jsonl"), turnIds: new Set(), days: new Map(), insightsVersion: 1 };
    },
    reconcile: (sessions) => sessions,
  };
  const period = { requireInsights: true, start: new Date("2026-08-14T00:00:00Z"), end: new Date("2026-08-14T23:59:59Z") };
  return { old, current, parses, adapter, period };
}

test("skipped references load once; only context-reading parsers parse again", async (t) => {
  const { old, current, parses, adapter, period } = await periodFixture(t);
  for (const parseUsesContext of [false, true]) {
    parses.length = 0;
    const sessions = await readParsedSessions({ ...adapter, parseUsesContext }, [old, current], { ...period, useCache: false });
    assert.deepEqual(parses, parseUsesContext ? ["current", "old", "current"] : ["current", "old"]);
    assert.deepEqual(sessions.map((session) => session.id), ["old", "current"]);
  }
});

test("a short period keeps cache entries that another run saved meanwhile", async (t) => {
  const { old, current, parses, adapter, period } = await periodFixture(t);
  const stat = await fs.stat(old);
  const shortRun = {
    ...adapter,
    references: () => [],
    // Simulates an all-time run that finishes while this short run is parsing.
    parse: async (file) => {
      await fs.writeFile(adapter.cachePath, JSON.stringify({ agent: "codex", version: 1, entries: {
        [old]: { size: stat.size, mtimeMs: stat.mtimeMs, parsed: { id: "old", turnIds: [], days: [], insightsVersion: 1 } },
      } }));
      return adapter.parse(file);
    },
  };
  await readParsedSessions(shortRun, [old, current], { ...period, useCache: true });
  const cache = JSON.parse(await fs.readFile(adapter.cachePath, "utf8"));
  assert.deepEqual(Object.keys(cache.entries).sort(), [current, old].sort());
  parses.length = 0;
  await readParsedSessions(adapter, [old, current], { ...period, start: null, useCache: true });
  assert.deepEqual(parses, []);
});

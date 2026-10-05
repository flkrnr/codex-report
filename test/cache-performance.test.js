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

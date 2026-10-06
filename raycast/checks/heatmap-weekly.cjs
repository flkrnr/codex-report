const assert = require("node:assert/strict");
const test = require("node:test");
const { buildHeatmap, heatmapRange } = require("../.test-build/heatmap-data.js");
const { buildWeeklyHeatmap, weeklyHeight } = require("../.test-build/heatmap-weekly.js");
const { heatmapImage } = require("../.test-build/heatmap-chart.js");
const entry = (date, agent, tokens, messages, dollars = tokens / 100) => ({
  date, agent, tokens, messages, cost: { totalCost: dollars, pricedTokens: tokens, unpricedTokens: 0 },
});
const range = { from: "2026-03-03", to: "2026-03-10", title: "Test" };
const entries = [
  entry("2026-03-02", "codex", 99999, 99),
  entry("2026-03-03", "codex", 20, 10, 4),
  entry("2026-03-04", "codex", 20, 10, 4),
  entry("2026-03-05", "claude", 60, 1, 1),
  entry("2026-03-09", "claude", 30, 3, 3),
  entry("2026-03-11", "codex", 99999, 99),
];
const report = { agentDays: entries, days: entries }; // One contribution per date.
const weekly = (agent = "all", metric = "tokens", data = report, window = range) =>
  buildWeeklyHeatmap(buildHeatmap(data, window, agent, metric));

test("weekly sums clip boundaries and choose the winner by volume, not winning days", () => {
  const result = weekly();
  assert.equal(result.peak, 100);
  assert.deepEqual(result.weeks.map(w => [w.date, w.endDate, w.value, w.dominantAgent]), [
    ["2026-03-03", "2026-03-08", 100, "claude"], ["2026-03-09", "2026-03-10", 30, "claude"],
  ]);
  assert.deepEqual(result.weeks[0].contributions.map(e => [e.agent, e.tokens, e.messages]), [["codex", 40, 20], ["claude", 60, 1]]);
  assert.equal(result.weeks.reduce((sum, w) => sum + w.value, 0), 130);
});

test("weekly metrics and agent filters retain the combined peak", () => {
  for (const [metric, value, winner] of [["tokens", 100, "claude"], ["messages", 21, "codex"], ["costs", 9, "codex"]]) {
    const all = weekly("all", metric);
    assert.equal(all.weeks[0].value, value);
    assert.equal(all.weeks[0].dominantAgent, winner);
    assert.equal(weekly("codex", metric).peak, all.peak);
    assert.equal(weekly("claude", metric).peak, all.peak);
  }
  const codex = weekly("codex");
  assert.equal(codex.weeks[0].value, 40);
  assert.equal(codex.weeks[0].cost.totalCost, 8);
  assert.equal(codex.weeks[1].dominantAgent, undefined);
  assert.equal(weeklyHeight(codex.weeks[0].value, codex.peak), 3);
});

test("weekly blocks round up positive usage and preserve empty future weeks", () => {
  assert.deepEqual([0, 1, 14, 15, 50, 100].map(v => weeklyHeight(v, 100)), [0, 1, 1, 2, 4, 7]);
  assert.equal(weeklyHeight(0, 0), 0);
  const year = heatmapRange("year", 0, new Date(2026, 9, 6, 12));
  const result = weekly("all", "tokens", report, year);
  assert.equal(result.weeks.length, 53);
  assert.equal(result.weeks[0].date, "2026-01-01");
  assert.equal(result.weeks.at(-1).endDate, "2026-12-31");
  assert.equal(result.weeks.at(-1).value, 0);
});

test("weekly cost coverage and equal shares remain available", () => {
  const unknown = entry("2026-03-06", "claude", 0, 0, 0);
  unknown.cost.unpricedTokens = 900;
  const data = { days: [...entries, unknown], agentDays: [...entries, unknown] };
  assert.equal(weekly("all", "costs", data).weeks[0].cost.unpricedTokens, 900);
  assert.equal(weekly("codex", "costs", data).weeks[0].cost.unpricedTokens, 0);
  const tied = [entry("2026-03-03", "codex", 50, 1), entry("2026-03-04", "claude", 50, 1)];
  assert.equal(weekly("all", "tokens", { days: tied, agentDays: tied }).weeks[0].dominantAgent, "tie");
});

test("weekly SVG stacks solid blocks from the bottom and labels its volume scale", () => {
  const image = heatmapImage(buildHeatmap(report, range, "all", "tokens"), true, String, "weekly");
  assert.ok(image.body.includes("Activity · Tokens · Weekly"));
  assert.ok(image.body.includes("100 per week = 7 blocks"));
  assert.ok(!image.body.includes(">Mon</text>"));
  assert.equal((image.body.match(/<g opacity="1">/g) || []).length, 10);
  assert.ok(image.body.includes("2026-03-09 — 2026-03-10: 30 tokens · Claude"));
  assert.ok(image.body.includes('y="138" width="17" height="17" rx="4" fill="#D97757"'));
  const empty = buildHeatmap({ days: [], agentDays: [] }, range, "all", "costs");
  assert.ok(heatmapImage(empty, true, String, "weekly").body.includes("No priced costs"));
});

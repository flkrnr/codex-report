const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { buildHeatmap, heatmapRange, heatmapLevel } = require("../.test-build/heatmap-data.js");
const { heatmapImage } = require("../.test-build/heatmap-chart.js");
const { imageMarkdown } = require("../.test-build/svg.js");

const cost = (value = 0) => ({ totalCost: value, pricedTokens: 0, unpricedTokens: 0 });
const contribution = (date, agent, tokens, messages = 1) => ({ date, agent, tokens, messages, cost: { ...cost(tokens / 100), pricedTokens: tokens } });
const range = { from: "2026-03-01", to: "2026-03-31", title: "March" };
const report = {
  days: [
    { date: "2026-03-02", tokens: 6400, messages: 10, cost: cost(64) },
    { date: "2026-03-03", tokens: 100, messages: 1, cost: cost(1) },
  ],
  agentDays: [contribution("2026-03-02", "codex", 6300, 9), contribution("2026-03-02", "claude", 100), contribution("2026-03-03", "claude", 100)],
};

test("calendar places Mondays first, pads boundary weeks, and keeps missing days", () => {
  const map = buildHeatmap(report, range, "all", "tokens");
  assert.equal(map.cells[0].date, "2026-02-23");
  assert.equal(map.cells[0].weekday, 0);
  assert.equal(map.cells[0].inRange, false);
  assert.equal(map.cells.at(-1).date, "2026-04-05");
  assert.equal(map.cells.at(-1).inRange, false);
  assert.equal(map.cells.filter((cell) => cell.inRange).length, 31);
  assert.equal(new Set(map.cells.map((cell) => cell.date)).size, map.cells.length);
  assert.equal(map.cells.find((cell) => cell.date === "2026-03-04").value, 0);
});

test("agent filtering preserves shared scale and combines mixed-day totals", () => {
  const all = buildHeatmap(report, range, "all", "tokens");
  const claude = buildHeatmap(report, range, "claude", "tokens");
  assert.deepEqual(claude.thresholds, all.thresholds);
  assert.deepEqual(all.thresholds, [100, 400, 1600, 6400]);
  const mixed = all.cells.find((cell) => cell.date === "2026-03-02");
  assert.equal(mixed.value, 6400);
  assert.deepEqual(mixed.agents, ["codex", "claude"]);
  assert.equal(claude.cells.find((cell) => cell.date === mixed.date).value, 100);
  assert.equal(heatmapLevel(0, all.thresholds), 0);
  assert.equal(heatmapLevel(100, all.thresholds), 1);
  assert.equal(heatmapLevel(6400, all.thresholds), 4);
});

test("metrics use corresponding daily values", () => {
  const messages = buildHeatmap(report, range, "all", "messages");
  const costs = buildHeatmap(report, range, "claude", "costs");
  assert.equal(messages.cells.find((cell) => cell.date === "2026-03-02").value, 10);
  assert.equal(costs.cells.find((cell) => cell.date === "2026-03-02").value, 1);
});

test("unpriced usage stays visible in coverage without inventing costs", () => {
  const unknown = { date: "2026-03-04", agent: "claude", tokens: 900, messages: 1, cost: { totalCost: 0, pricedTokens: 0, unpricedTokens: 900 } };
  const data = { days: [...report.days, unknown], agentDays: [...report.agentDays, unknown] };
  const map = buildHeatmap(data, range, "all", "costs");
  const day = map.cells.find((cell) => cell.date === unknown.date);
  assert.equal(day.value, 0);
  assert.equal(day.cost.unpricedTokens, 900);
  assert.equal(heatmapLevel(day.value, map.thresholds), 0);
  assert.equal(buildHeatmap(data, range, "codex", "costs").cells.find((cell) => cell.date === unknown.date).cost.unpricedTokens, 0);
});

test("window navigation handles current partial months and past year boundaries", () => {
  const now = new Date(2026, 9, 5, 12);
  assert.deepEqual(heatmapRange(6, 0, now), { from: "2026-05-01", to: "2026-10-05", title: "6 Months of Activity" });
  assert.deepEqual(heatmapRange(6, -1, now), { from: "2025-11-01", to: "2026-04-30", title: "6 Months of Activity" });
  assert.equal(heatmapRange(12, 0, now).from, "2025-11-01");
});

test("empty periods have no intensity and do not invent activity", () => {
  const map = buildHeatmap({ days: [], agentDays: [] }, range, "all", "tokens");
  assert.deepEqual(map.thresholds, [0, 0, 0, 0]);
  assert.ok(map.cells.every((cell) => cell.value === 0 && cell.agents.length === 0));
});

test("SVG labels both axes and represents mixed cells with two clipped triangles", () => {
  const map = buildHeatmap(report, range, "all", "tokens");
  const image = heatmapImage(map, true, (value) => String(value));
  assert.equal(image.width, 560);
  for (const label of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mar", "Codex", "Claude"]) assert.ok(image.body.includes(label));
  assert.ok(image.body.includes('id="mixed-2026-03-02"'));
  assert.equal((image.body.match(/<path /g) || []).length, 2);
  assert.ok(image.body.includes('fill="#228cf6"'));
  assert.ok(image.body.includes('fill="#D97757"'));
  assert.ok(image.body.includes('opacity="1"'));
  assert.ok(!image.body.includes("NaN"));
  assert.ok(!image.body.includes("Infinity"));
  assert.match(imageMarkdown("Heatmap", image), /data:image\/svg\+xml;base64/);
  const svg = Buffer.from(imageMarkdown("Heatmap", image).split("base64,")[1].split("?")[0], "base64").toString();
  assert.ok(svg.includes('width="560"'));
});

test("calendar arithmetic stays complete across DST in multiple local time zones", () => {
  for (const timezone of ["Europe/Vienna", "America/Los_Angeles", "Pacific/Auckland"]) {
    const script = `const {buildHeatmap}=require(${JSON.stringify(require.resolve("../.test-build/heatmap-data.js"))}); const map=buildHeatmap({days:[],agentDays:[]},${JSON.stringify(range)},'all','tokens'); console.log(JSON.stringify(map.cells.filter(c=>c.inRange).map(c=>c.date)))`;
    const result = spawnSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: timezone }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const dates = JSON.parse(result.stdout);
    assert.equal(dates.length, 31, timezone);
    assert.equal(new Set(dates).size, 31, timezone);
    assert.equal(dates[0], range.from);
    assert.equal(dates.at(-1), range.to);
  }
});

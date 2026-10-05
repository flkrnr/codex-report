import assert from "node:assert/strict";
import test from "node:test";
import { topSection } from "../lib/format.js";
import { emptyTokens } from "../lib/session.js";
import {
  plainTopSection, activitySection, plainActivitySection,
  costSection, plainCostSection, plainSkillsSection,
  activityInsightsSection, plainActivityInsightsSection,
} from "../lib/render.js";

function boxed(render, ...args) {
  const lines = [];
  render(lines, ...args, 106);
  return lines.join("\n");
}

function otherLine(output) {
  return output.split("\n").find((line) => line.includes("Other (2)"));
}

test("count rankings keep their full denominator and sum omitted categories", () => {
  const counts = new Map([["first", 6], ["second", 3], ["third", 1]]);
  for (const output of [
    boxed(topSection, "Sources", counts, 1, "sessions"),
    plainTopSection("Sources", counts, 1, "sessions").join("\n"),
  ]) {
    assert.match(otherLine(output), /Other \(2\).*4 sessions.*40%/);
    assert.doesNotMatch(output, /second|third/);
  }
  assert.doesNotMatch(plainTopSection("Sources", counts, 3, "sessions").join("\n"), /Other/);
  assert.doesNotMatch(plainTopSection("Sources", new Map(), 1, "sessions").join("\n"), /Other/);
});

test("activity remainder sums both messages and tokens in either format", () => {
  const days = new Map([
    ["2026-08-14", { messages: 8, tokens: 100 }],
    ["2026-08-15", { messages: 2, tokens: 20 }],
    ["2026-08-16", { messages: 1, tokens: 30 }],
  ]);
  for (const output of [
    boxed(activitySection, "Activity", days, 1),
    plainActivitySection("Activity", days, 1).join("\n"),
  ]) {
    assert.match(otherLine(output), /Other \(2\).*3 msg.*50 tok.*27%/);
    assert.doesNotMatch(output, /2026-08-15|2026-08-16/);
  }
});

function usage(input, cached, output) {
  return { ...emptyTokens(), input_tokens: input, cached_input_tokens: cached, output_tokens: output, total_tokens: input + output };
}

const estimate = {
  totalCost: 9,
  pricedTokens: emptyTokens(),
  modelCosts: [
    { model: "first", cost: 6, tokens: usage(100, 10, 20) },
    { model: "second", cost: 2, tokens: usage(20, 2, 4) },
    { model: "third", cost: 1, tokens: usage(30, 3, 6) },
  ],
  unpricedModels: [
    { model: "unknown-first", tokens: usage(100, 0, 0) },
    { model: "unknown-second", tokens: usage(20, 0, 0) },
    { model: "unknown-third", tokens: usage(30, 0, 0) },
  ],
};

test("cost remainder preserves money and token detail, keeping unknown usage separate", () => {
  for (const output of [
    boxed(costSection, "Cost", estimate, 1),
    plainCostSection(estimate, 1).join("\n"),
  ]) {
    assert.match(otherLine(output), /Other \(2\).*\$3\.00.*50 in.*5 cached.*10 out/);
    assert.match(output, /Other \(2\)(?:: | \()50 tokens/);
    assert.doesNotMatch(output, /unknown-second|unknown-third/);
  }
  const expanded = boxed(costSection, "Cost", estimate, 100);
  assert.match(expanded, /unknown-third/);
  assert.doesNotMatch(expanded, /Other/);
});

test("skill remainder sums reads and keeps no-evidence categories visible as a count", () => {
  const analysis = {
    activeSkills: [], withEvidenceCount: 0, byScope: new Map(),
    evidence: { reads: new Map(), mentions: new Map() },
    topReads: [
      { name: "first", scope: "personal", reads: 10, readSessions: 4 },
      { name: "second", scope: "personal", reads: 3, readSessions: 2 },
      { name: "third", scope: "personal", reads: 2, readSessions: 1 },
    ],
    noEvidence: ["no-first", "no-second", "no-third"],
  };
  const output = plainSkillsSection(analysis, 1).join("\n");
  assert.match(otherLine(output), /Other \(2\).*5 reads.*3 sessions.*33%/);
  assert.match(output, /No evidence\n\nno-first\nOther \(2\)/);
});

test("reasoning rankings use the requested limit in either format", () => {
  const efforts = new Map([["high", 6], ["medium", 3], ["low", 1]]);
  const insights = { fastModePercent: null };
  const lines = [];
  activityInsightsSection(lines, insights, efforts, 106, 1);
  for (const output of [lines.join("\n"), plainActivityInsightsSection(insights, efforts, 1).join("\n")]) {
    assert.match(otherLine(output), /Other \(2\).*4 turns.*40%/);
  }
});

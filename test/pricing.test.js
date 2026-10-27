import assert from "node:assert/strict";
import test from "node:test";
import { costEstimateNotes, estimateCosts, modelPrice } from "../lib/pricing.js";
import { emptyTokens } from "../lib/session.js";

test("prices Terra, Cyber and Sonnet 5.5 with separate cache read and write rates", () => {
  const estimate = estimateCosts(new Map([
    ["gpt-6.1-terra", { input_tokens: 3_000_000, cached_input_tokens: 1_000_000, cache_write_input_tokens: 1_000_000, output_tokens: 1_000_000 }],
    ["gpt-5.6-cyber", { input_tokens: 3_000_000, cached_input_tokens: 1_000_000, cache_write_input_tokens: 1_000_000, output_tokens: 1_000_000 }],
    ["claude-sonnet-5-5[1m]", { input_tokens: 4_000_000, cached_input_tokens: 1_000_000, cache_creation_input_tokens: 2_000_000, cache_creation_1h_input_tokens: 1_000_000, output_tokens: 1_000_000 }],
  ]));
  const costs = new Map(estimate.modelCosts.map((entry) => [entry.canonicalModel, entry.cost]));
  assert.equal(costs.get("gpt-6.1-terra"), 7.3);
  assert.equal(costs.get("gpt-5.6-cyber"), 104.375);
  assert.equal(costs.get("claude-sonnet-5-5"), 18.6);
  assert.deepEqual(estimate.unpricedModels, []);
  assert.equal(modelPrice("claude-sonnet-5-20260801").cachedInput, 0.2);
  assert.equal(modelPrice("claude-sonnet-5-5-20260928[1m]").cachedInput, 0.1);
});

test("labels the unknown OpenAI cache retention without changing token accounting", () => {
  const notes = (model, tokens) => costEstimateNotes(estimateCosts(new Map([[model, { ...emptyTokens(), ...tokens }]])));
  assert.match(notes("gpt-6.1-sol", { input_tokens: 1_000, cache_write_input_tokens: 500 }).join("\n"), /assume 30-minute retention.*12-hour writes/);
  assert.deepEqual(notes("gpt-6.1-sol", { input_tokens: 1_000 }), []);
  assert.deepEqual(notes("claude-sonnet-5-5", { input_tokens: 1_000, cache_creation_input_tokens: 500 }), []);
  assert.deepEqual(notes("unknown", { input_tokens: 1_000, cache_write_input_tokens: 500 }), []);
});

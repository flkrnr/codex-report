# Agent adapters

The pipeline is:

```text
CLI arguments -> selected adapters -> cached parsed transcripts
              -> adapter reconciliation -> shared daily sessions
              -> scope/date filtering -> shared report core
              -> terminal or JSON output
```

`lib/adapters/index.js` is a small explicit registry. No runtime plugin loading,
provider authentication, or network access is involved. `agent` identifies a
coding application, `provider` identifies an API host when recorded, and `source`
identifies the recorded entrypoint. These fields have distinct meanings.

## Adapter contract

An adapter factory provides:

- `id`, `name`: stable identity and display name.
- `cacheVersion`, `insightsVersion`: versions of parsed payload and insight extraction.
- `cachePath`, `cachePattern`: an agent-specific cache location and a narrowly
  matching pattern for deleting report-owned caches.
- `skillRoots`, `projectSkillRoots`: global absolute roots and project-relative
  roots for the shared skill registry.
- `discover()`: sorted absolute paths of local transcript files.
- `parse(file, context, start, end)`: parsed cache payload or `null`. `context` is
  a run-local Map shared only by that adapter. Optional dates are supplied for
  uncached precise filtering; parsing must still update prerequisite state from
  earlier records. Parsed payloads must not retain raw conversation/tool content.
- `reconcile(parsedSessions, { start, end })`: shared daily session summaries.
  This is also called on cache hits, so cross-file ownership/deduplication never
  depends on which files happened to be cache misses.
- Optional `cacheValid(parsed)`: validates adapter-specific cached payload shape.

The shared cache fingerprints files with size and mtime, stores agent identity
and parser version, and uses atomic replacement. Dates, scope, prices and skill
registry contents are applied after cache loading. Timestamp windows bypass the
cache. Codex keeps its existing v8 daily cache; Claude caches normalized records
because deduplication across forks/subagents needs request identities before
summation. Adding a subagent or deleting a source file changes reconciliation
without requiring unchanged parent transcripts to be reparsed.

## Shared session schema

`lib/session.js` owns token operations, daily buckets, serialization, and
materialization. Reconciled parsed sessions contain:

- `agent`, `id`, `path`, `cwd`, `repositoryUrl`, `provider`, `source`.
- `turnIds` (Set, used by Codex fork handling) and `insightsVersion`.
- `days` (Map from local `YYYY-MM-DD` or `(undated)` to a daily summary).

Each daily summary has Date-valued `firstTs`/`lastTs`; Maps for `messages`
(`user`/`assistant`), `tools`, `models`, `modelTokens`, `serviceTiers`,
`reasoningEfforts`; `tokens`; `tokenEvents`; and `rawSkillEvidence` Maps for
`reads` (absolute SKILL.md paths) and `mentions` (names). Materialized sessions
resolve that evidence using the current skill registry.

`input_tokens` is inclusive: uncached input + cache reads + cache writes.
`cached_input_tokens` is cache-read input. `cache_creation_input_tokens` is all
cache-write input; `cache_creation_1h_input_tokens` and
`cache_creation_unknown_input_tokens` are subsets, not extra tokens.
`output_tokens` includes `reasoning_output_tokens`; `total_tokens` is input +
output. Unsupported categories are zero; unavailable settings have no Map entry,
so insight denominators only use known observations.

Adapters must preserve exact event dates and perform replay/deduplication before
filtering. They must not equate tool results with human messages or add repeated
cumulative/whole-request usage snapshots. Each agent documents what its model
count represents. Subagent counting policy belongs to the adapter, not the core.

## Adding another agent

1. Validate actual local transcript structure and create anonymized fixtures.
2. Implement a factory in `lib/adapters/<agent>.js` with the contract above.
3. Add it to the registry and supported CLI selection/help.
4. Add verified price/model aliases to shared pricing only where supported;
   unknown models remain unpriced.
5. Add CLI integration tests for selection, scope, exact dates, replay, cache,
   message/token semantics and mixed reporting.
6. Document supported evidence and data locations. If a new metric is needed,
   extend the common schema explicitly rather than adding agent switches to the core.

`lib/report.js` aggregates sessions once. `lib/render.js` and `lib/json.js` consume
that result. The public JSON schema is independent of internal/cache formats;
additive changes preserve schema version 1, while breaking changes require a
version change and coordinated Raycast updates. `package.json` includes `lib`,
and `raycast/prepare.mjs` copies it with ESM metadata so the CLI runs in isolation.

## Reference

[CodexBar](https://github.com/steipete/CodexBar) informed the separation of provider
behavior and capabilities. Its
[Claude usage scanner](https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Vendored/CostUsage/CostUsageScanner%2BClaude.swift)
provided a useful reference for request identity, complete-snapshot selection,
and parent/subagent ownership. This implementation is independent JavaScript and
uses local transcript parsing only; it does not adopt CodexBar's authentication
or usage-quota integrations.

## Complexity check

AST-based counts include conditional statements/expressions, loops, catches and
short-circuit operators (including `??`). Existing orchestration hotspots were
split into named responsibilities rather than moving their branching intact.

| Function | Before | After |
| --- | ---: | ---: |
| `main` | 33 | 7 |
| `parseSessionFile` | 55 | 8 |
| `readSessions` -> `readParsedSessions` | 25 | 10 |
| `parseArgs` | 15 | 5 |
| `renderPlainSections` | 15 | 1 |

Extracted responsibilities include Codex metadata/baseline/turn/tool handling,
cache eligibility/loading, session materialization, scope/date validation, and
terminal summary/section rendering. Named implementation functions are at or
below complexity 10. CLI regression and isolated packaging tests verify behavior.

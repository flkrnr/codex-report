# How codex-report works

Details behind the numbers in the [README](../README.md): where data comes from,
what is counted, how caching works, and what the JSON output contains. Cost
calculations are described in [Cost Estimation](cost-estimation.md), the adapter
boundary in [Agent adapters](agent-adapters.md).

## Data locations

| Agent | Transcripts | Override | Report cache |
| --- | --- | --- | --- |
| Codex | `~/.codex/sessions` | `CODEX_HOME` | `<codex-home>/cache/codex-report-sessions-v10.json` |
| Claude Code | `~/.claude/projects` | `CLAUDE_CONFIG_DIR` | `<claude-home>/cache/codex-report-claude-sessions-v5.json` |

- Both `.jsonl` and `.jsonl.zst` session logs are read. If both exist for the
  same path, the plain file takes precedence to avoid double counting.
- Reports include all Codex sessions in the same local `~/.codex/sessions`
  directory, even if they were created under different Codex logins. Stats are not
  split by login because the local logs do not expose a stable account identifier.
- Sessions from other OS users, machines, or containers are not included. Use
  `CODEX_HOME` or `CLAUDE_CONFIG_DIR` to select a custom local home.
- Claude Desktop chat, Cowork, and remote history are not included. Reports only
  cover transcript files still present locally; they cannot recover deleted history.
- Missing agent directories produce a diagnostic on stderr and do not block the
  other selected agent.

## Scope and dates

- By default, the report is scoped to the current folder. When the current folder
  has no matching sessions, the CLI falls back to a global report. Use `--global`
  to report across all projects.
- Dates without times are interpreted in the local time zone.
- Daily, monthly, and weekday activity uses each event's date, including sessions
  that span multiple days.

## Rankings

Ranked sections show up to `--top` named entries, followed by `Other (N)` when
entries remain. `N` counts the grouped categories; their usage is summed beside the
label, and percentages use the full section total. Skill-read rankings apply the
limit within each scope; their grouped session counts sum per-skill session counts.
Daily and monthly activity rankings, activity bars, and the busiest-day summary use
total tokens; message counts remain visible. JSON retains every individual entry.

The activity and project views answer different questions:

- `--activity` groups activity by calendar day.
- `--weekly` groups activity by weekday across the selected period.
- `--monthly` groups activity by calendar month.
- `--projects` groups sessions by their exact working directory.
- `--repositories` consolidates Git worktrees by repository and retains non-Git
  working directories as separate entries. Repository totals prefer the recorded
  Git remote URL, then a live checkout's shared Git common directory, so worktrees
  of the same repository are grouped together, including local-only repositories.
- `--insights` reports the Fast Mode share and all reasoning-effort usage from
  locally recorded turns whose logs include those settings.
- `--agents` shows per-agent session, message, token, and estimated cost totals.
  Agent identity is separate from the API provider (for example, OpenAI, Anthropic,
  or Vertex) and the recorded application source. Unknown API providers stay unknown
  rather than being inferred from a model name.

## Counting rules

Turns, messages, and sessions mean the same for both agents:

- Model, reasoning-effort, and Fast-mode counts use turns. Codex counts
  `turn_context` records; a Claude turn is a prompt that received a response, using
  the first response's model and settings. Tool loops, split responses, and advisor
  calls add tokens and cost, not turns. Each answered subagent task counts as one
  turn, as Codex counts turns in spawned subagent threads. Tracking ignores date
  filters, so a response in range still starts a turn whose prompt is not.
- Fast-mode percentages include only turns with known settings. Missing settings
  display as unavailable, and JSON exposes the eligible counts. Codex insights may
  differ from the Codex profile dashboard because its exact aggregation rules are
  not public.
- Subagent threads contribute to their root session and project. Automatic Codex
  Guardian approval reviews add tokens and cost but no messages, turns, or tool
  calls. User-created forks remain separate sessions.
- Input tokens include uncached input, cache reads, and cache writes for both the
  totals and estimated costs. Output thinking tokens are already part of output.
- Skills use actual file reads, explicit `Skill` tool calls, and user skill mentions
  matched against the selected agents' skill registries. This is best-effort
  evidence, not a complete execution ledger: concrete `SKILL.md` reads are stronger
  evidence than explicit `$skill` mentions, and system skill catalogs are ignored to
  avoid false positives.

Codex specifics:

- Token totals are based on `token_count` events.
- Messages are counted from legacy `user_message` / `agent_message` events and
  `item_completed` user/agent messages; response-item copies are not counted again.

Claude Code specifics:

- Tool-result user records, injected metadata, compaction summaries, and synthetic
  API-error replies are excluded from message counts.
- Split assistant content blocks count as one assistant response/model request.
  Whole-request usage snapshots replace earlier snapshots rather than being added.
- Like Codex agent messages, assistant messages count only responses with visible
  text. Tool-only and thinking-only responses add tokens and cost, not messages.
- Request/message identities remove copied fork history and duplicate parent/subagent
  usage. Unique tool IDs are counted once, retaining their recorded call timestamps.
  Without recorded identities, separate transcript rows are treated as separate work.
- Subagents do not increase the session count. An orphan subagent still contributes
  under its recorded parent ID.
- Each response's tokens and assistant message are attributed to its final meaningful
  usage snapshot; user messages and tool calls use their own timestamps. Timestamp
  filters run after deduplication, including when cached records are reused.
- Insights use recorded Claude effort and `usage.speed` settings when available.

## Caching

- Parsed sessions are cached once per source file in the report cache listed above.
  A source size or modification-time change, or a different local time zone,
  invalidates its entry. Date ranges and the current skill registry are applied
  after loading the cache. `--no-cache` bypasses the cache; `--clear-cache` deletes
  all Codex Report session caches for both agents and exits.
- Reports read only transcripts that can cover the selected period. Transcripts only
  grow, so files last modified more than a day before the period, and Codex rollouts
  created more than a day after it, are skipped. A selected Codex fork or copied
  Claude history still loads the file it references. Skipped files keep their cache
  entries, so a short period starts quickly without a cache and a later full-history
  report parses only the remaining files.
- Cache directories may be shared by several installed versions, such as an npx CLI
  and a pinned Raycast copy. Cache writes therefore remove only this tool's
  interrupted temporary files after 10 minutes and older cache versions unused for
  30 days. Current and newer cache versions are never removed automatically.

## JSON output

`--json` emits one JSON object on stdout, with diagnostics on stderr. Schema version
1 retains the Raycast fields and adds `selectedAgents`, `agents`, `agentDays`,
`availability`, `sources`, `providers`, `skills`, exact `timestampRange`, insight
coverage, cost assumptions, and cache-write token fields. Terminal and JSON outputs
use the same aggregated report. `agentDays` contains messages, tokens, and cost
coverage per date and agent; these contributions sum to the daily totals.

Section flags with `--json` skip the slower repository (Git) and skill lookups unless
`--repositories` or `--skills` is given; all other fields stay complete.
`--clear-cache --json` emits `{ "clearedCacheFiles": N }`.

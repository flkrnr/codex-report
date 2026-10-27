# codex-report

A tiny CLI that shows how much you're actually burning with Codex and Claude Code.

It reads local Codex and Claude Code transcripts and reports sessions, messages,
tokens, models, projects, repositories, tools, skills, daily and monthly activity,
and estimated API-equivalent costs. Parsed sessions are cached locally, so repeated
reports are fast. Everything stays on your machine.

## Quick start

```bash
npx codex-report               # run without installing
npm install -g codex-report    # or install globally
```

Requires Node.js 22.15.0 or newer; there are no other dependencies.

## Usage

```bash
codex-report                                  # current folder, all available history
codex-report --global                         # all local sessions
codex-report --from 2026-10-01 --to 2026-10-27
codex-report --top 5                          # shorter top lists
```

Print only selected sections without the boxed summary:

```bash
codex-report --models --tools
codex-report --global --repositories
codex-report --global --weekly --activity --top 5
```

Section flags: `--agents`, `--weekly`, `--monthly`, `--projects`, `--repositories`,
`--models`, `--tools`, `--activity`, `--sources`, `--providers`, `--costs`,
`--insights`, and `--skills`. `--json` prints one JSON object for scripts,
`--no-cache` bypasses the session cache, and `--clear-cache` deletes it.

### Claude Code and combined reports

The default agent is Codex. Choose Claude Code or both agents explicitly; all other
options work the same:

```bash
codex-report --agent claude --global --models --costs
codex-report --agent all --global
codex-report --agent all --agents    # per-agent totals
```

### Costs

API costs are API-equivalent estimates from local token counts and list prices,
not billing data or subscription fees. Models without a known price are shown as
unpriced. See [Cost Estimation](docs/cost-estimation.md) for the calculation.

## Example output

```text
$ codex-report --global --agent all --from 2026-09-01

┌─ codex-report ───────────────────────────────────────────────────────────────────────┐
│ Agents      codex, claude                                                            │
│ Scope       global                                                                   │
│ Period      2026-09-01 → 2026-10-27                                                  │
│ Sessions    202                                                                      │
│ Projects    74                                                                       │
│ Repos/dirs  34                                                                       │
│ Messages    19,923 (6,211 user, 13,712 assistant)                                    │
│ Tokens      10,585,305,226 total                                                     │
│             10,561,795,614 input · 10,298,574,775 cached · 23,509,612 output         │
│ API cost    $6,559.64 estimated from priced local tokens                             │
│             654M tokens in unpriced models                                           │
│ Active days 50 · longest streak 17 days                                              │
│ Busiest day 2026-10-07 (688M tokens)                                                 │
│                                                                                      │
│ Agents                                                                               │
│                                                                                      │
│ codex  131 sessions · 13,632 messages · 5.9B tokens · $4,985.01 estimated API cost   │
│ claude  71 sessions · 6,291 messages · 4.7B tokens · $1,574.64 estimated API cost    │
│                                                                                      │
│ Top repositories and directories                                                     │
│   github.com/acme/platform                        91 sessions  ███████░░░░░░░░░  45% │
│   github.com/acme/client                          51 sessions  ████░░░░░░░░░░░░  25% │
│   github.com/acme/backend                         12 sessions  █░░░░░░░░░░░░░░░   6% │
│   Other (31)                                      48 sessions  ████░░░░░░░░░░░░  24% │
│                                                                                      │
│ Top models                                                                           │
│   gpt-6-astra                                     2,514 turns  ███████░░░░░░░░░  44% │
│   claude-opus-5-5                                 1,730 turns  █████░░░░░░░░░░░  30% │
│   gpt-5.6-sol                                       820 turns  ██░░░░░░░░░░░░░░  14% │
│   Other (7)                                         624 turns  ██░░░░░░░░░░░░░░  11% │
│                                                                                      │
│ Estimated API cost by model                                                          │
│   gpt-6-astra                     $4,092.57  3.1B in · 3.1B cached · 6.0M out    62% │
│   claude-opus-5-5                 $1,558.72  4.7B in · 4.6B cached ·  11M out    24% │
│   gpt-5.6-sol                       $765.87  1.4B in · 1.3B cached · 3.7M out    12% │
│   Other (7)                         $142.49  730M in · 709M cached · 2.0M out     2% │
│   estimated: gpt-reserve ≈ gpt-5.6-luna                                              │
│   unpriced: codex-auto-review (485M tokens)                                          │
│   unpriced: (unknown) (169M tokens)                                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Raycast extension

A Raycast extension for macOS lives in [`raycast`](raycast). It bundles the CLI
and runs it with Raycast's own Node runtime, so it needs neither Node.js nor the
npm package. It is not published in the Raycast Store yet.

![Weekly report in Raycast with stacked Codex and Claude activity and estimated API costs](raycast/metadata/codex-report-1-weekly-report.png)

![Six-month activity heatmap in Raycast colored by the dominant agent](raycast/metadata/codex-report-2-activity-heatmap.png)

See the [Raycast README](raycast/README.md) for features, shortcuts, and local
development.

## More details

- [How it works](docs/how-it-works.md): data locations, counting rules, caching,
  and JSON output
- [Cost Estimation](docs/cost-estimation.md): prices and assumptions behind the
  estimates
- [Agent adapters](docs/agent-adapters.md): how agents are read and how to add
  another one

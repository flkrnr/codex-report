# codex-report

A tiny CLI that shows how much you're actually burning with Codex.

The CLI reads Codex session JSONL files from `~/.codex/sessions` and reports
sessions, messages, tokens, models, projects, repositories, tools, skills,
daily and monthly activity, and estimated API-equivalent costs. Parsed daily
session summaries are cached locally to keep repeated reports fast.

## Quick start

Run without installing:

```bash
npx codex-report
```

Or install globally:

```bash
npm install -g codex-report
codex-report
```

Verify the installed binary:

```bash
which codex-report
```

Remove the global install:

```bash
npm uninstall -g codex-report
```

## Usage

Report the current folder from the beginning of the available local data
through today:

```bash
codex-report
```

Report across all local Codex sessions:

```bash
codex-report --global
```

Report a specific period:

```bash
codex-report --from 2026-04-01 --to 2026-04-28
```

Limit top lists with `--top`:

```bash
codex-report --top 5
```

Bypass the local parsed-session cache:

```bash
codex-report --no-cache
```

Delete all Codex Report session caches and exit:

```bash
codex-report --clear-cache
```

Print only selected sections without the boxed summary:

```bash
codex-report --models
codex-report --models --tools
codex-report --costs
codex-report --insights
codex-report --skills
codex-report --global --repositories
codex-report --global --monthly
codex-report --global --weekly --activity --top 5
```

Available section flags: `--weekly`, `--monthly`, `--projects`, `--repositories`,
`--models`, `--tools`, `--activity`, `--sources`, `--providers`, `--costs`,
`--insights`, and `--skills`.

The activity and project views answer different questions:

- `--activity` groups activity by calendar day.
- `--weekly` groups activity by weekday across the selected period.
- `--monthly` groups activity by calendar month.
- `--projects` groups sessions by their exact working directory.
- `--repositories` consolidates Git worktrees by repository and retains
  non-Git working directories as separate entries.
- `--insights` reports the Fast Mode share and all reasoning-effort usage from
  locally recorded turns whose logs include those settings.

API cost estimation is experimental and should be treated as an approximation,
not billing data. For details on how estimates are calculated, see
[Cost Estimation](docs/cost-estimation.md).

## Example output

```text
$ codex-report --global

┌─ codex-report ───────────────────────────────────────────────────────────────────────┐
│ Scope       global                                                                   │
│ Period      2025-09-19 → 2026-08-15                                                  │
│ Sessions    1,026                                                                    │
│ Projects    89                                                                       │
│ Repos/dirs  50                                                                       │
│ Messages    85,651 (19,598 user, 66,053 assistant)                                   │
│ Tokens      16,080,902,795 total                                                     │
│             16,030,807,609 input · 15,051,904,000 cached · 50,095,186 output         │
│ API cost    $10,636 estimated from priced local tokens                               │
│             265M tokens in unpriced models                                           │
│ Active days 202 · longest streak 28 days                                             │
│ Busiest day 2026-06-23 (2,796 messages)                                              │
│                                                                                      │
│ Activity insights                                                                    │
│   Fast mode  70%                                                                      │
│                                                                                      │
│ Reasoning efforts                                                                    │
│   medium                                          7,128 turns  ███████░░░░░░░░░  41% │
│   high                                            6,433 turns  ██████░░░░░░░░░░  37% │
│   low                                             3,823 turns  ████░░░░░░░░░░░░  22% │
│                                                                                      │
│ Weekly activity                                                                      │
│   Mon  ███████░░░░░░░░░░░░░░░░░░░░░    5,892 messages | 884M tok                     │
│   Tue  ████████████████████████████   22,059 messages | 3.7B tok                     │
│   Wed  █████████████████████░░░░░░░   16,284 messages | 3.3B tok                     │
│   Thu  ██████████████████░░░░░░░░░░   13,922 messages | 2.8B tok                     │
│   Fri  █████████████████████░░░░░░░   16,459 messages | 3.7B tok                     │
│   Sat  █████░░░░░░░░░░░░░░░░░░░░░░░    3,895 messages | 766M tok                     │
│   Sun  █████████░░░░░░░░░░░░░░░░░░░    7,140 messages | 994M tok                     │
│                                                                                      │
│ Top repositories and directories                                                     │
│   github.com/acme/client                         837 sessions  █████████████░░░  82% │
│   github.com/acme/backend                         90 sessions  █░░░░░░░░░░░░░░░   9% │
│   ~/code/local-tool                               22 sessions  █░░░░░░░░░░░░░░░   2% │
│                                                                                      │
│ Top models                                                                           │
│   gpt-5.2-codex                                   6,689 turns  ███░░░░░░░░░░░░░  20% │
│   gpt-5.5                                         5,918 turns  ███░░░░░░░░░░░░░  18% │
│   gpt-5.4                                         4,753 turns  ██░░░░░░░░░░░░░░  14% │
│                                                                                      │
│ Estimated API cost by model                                                          │
│   gpt-5.5                            $5,019  5.9B in · 5.6B cached · 15M out     47% │
│   gpt-5.6-sol                        $3,129  4.4B in · 4.2B cached · 10M out     29% │
│   gpt-5.4                            $1,990  3.9B in · 3.5B cached · 15M out     19% │
│   unpriced: (unknown), codex-auto-review, gpt-5.3-codex-spark                        │
│                                                                                      │
│ Top tools                                                                            │
│   exec_command                                   93,462 calls  ██████████░░░░░░  60% │
│   exec                                           16,198 calls  ██░░░░░░░░░░░░░░  10% │
│   apply_patch                                    13,995 calls  █░░░░░░░░░░░░░░░   9% │
│                                                                                      │
│ Activity by day                                                                      │
│   2026-06-23                              2.8K msg | 402M tok  █░░░░░░░░░░░░░░░   3% │
│   2026-06-30                              2.6K msg | 337M tok  █░░░░░░░░░░░░░░░   3% │
│   2026-03-25                              2.4K msg | 322M tok  █░░░░░░░░░░░░░░░   3% │
│                                                                                      │
│ Activity by month                                                                    │
│   2026-03                                  18K msg | 2.8B tok  ███░░░░░░░░░░░░░  21% │
│   2026-06                                  16K msg | 2.0B tok  ███░░░░░░░░░░░░░  19% │
│   2026-04                                  14K msg | 2.3B tok  ███░░░░░░░░░░░░░  16% │
│                                                                                      │
│ Sources                                                                              │
│   Codex Desktop                                  859 sessions  █████████████░░░  84% │
│   codex_cli_rs                                   101 sessions  ██░░░░░░░░░░░░░░  10% │
│   codex_vscode                                    54 sessions  █░░░░░░░░░░░░░░░   5% │
│                                                                                      │
│ Providers                                                                            │
│   openai                                       1,004 sessions  ████████████████  98% │
│   (unknown)                                       22 sessions  █░░░░░░░░░░░░░░░   2% │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Notes

- No external Node dependencies are required.
- By default, the report is scoped to the current folder.
- Use `--global` to report across all projects.
- Repository totals prefer the recorded Git remote URL, then a live checkout's
  shared Git common directory. Worktrees of the same repository are grouped
  together, including local-only repositories. Non-Git sessions fall back to
  their exact working directory.
- Use `--projects` for exact working-directory totals and `--repositories` for
  consolidated repository and non-Git directory totals.
- When the current folder has no matching Codex sessions, the CLI falls back
  to a global report.
- Dates without times are interpreted in the local timezone.
- Parsed daily session summaries are cached once per source file under
  `~/.codex/cache` by default. A source JSONL size or modification-time change
  invalidates its entry; date ranges and the current skill registry are applied
  after loading the cache.
- Token totals are based on Codex `token_count` events in local session logs.
- Fast Mode and reasoning-effort insights are locally derived from
  `turn_context` records with known settings. They may differ from the Codex
  profile dashboard because its exact aggregation rules are not public.
- API cost totals are estimates based on OpenAI standard text-token list
  prices for each recognized model. Cached input is billed at the cached-input
  rate, uncached input at the input rate, and output at the output rate.
- Cost estimates are computed from local logs only. They are not an invoice,
  do not include non-token tool charges or regional/batch pricing differences,
  skip models without a known official API price, and should be treated as an
  experimental approximation. See
  [Cost Estimation](docs/cost-estimation.md) for the exact calculation.
- Skill usage is best-effort transcript evidence. Concrete `SKILL.md` reads are
  stronger evidence than explicit `$skill` mentions, and system skill catalogs
  are ignored to avoid false positives.
- Reports include all Codex sessions in the same local `~/.codex/sessions`
  directory, even if they were created under different Codex logins.
- Sessions from other OS users, machines, containers, or custom Codex home
  directories are not included.
- Stats are not split by Codex login because the local session logs do not
  expose a stable account identifier.

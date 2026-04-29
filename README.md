# codex-report

A tiny CLI that shows how much you're actually burning with Codex.

The CLI reads Codex session JSONL files from `~/.codex/sessions` and prints
session, message, token, model, project, tool, and activity stats.

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

Report the current git project from the beginning of the available local data
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

## Example output

```text
$ codex-report --global

┌─ codex-report ───────────────────────────────────────────────────────────────────────┐
│ Scope       global                                                                   │
│ Period      2025-09-19 → 2026-04-29                                                  │
│ Sessions    3,355                                                                    │
│ Projects    13                                                                       │
│ Messages    34,655 (8,008 user, 26,647 assistant)                                    │
│ Tokens      7,879,502,780 total                                                      │
│             7,812,940,332 input · 7,193,757,440 cached · 36,158,480 output           │
│ Active days 137 · longest streak 35 days                                             │
│ Busiest day 2026-02-28 (563 sessions)                                                │
│                                                                                      │
│ Top projects                                                                         │
│   /Users/flkrnr/code/product-api  2,872 sessions  ██████████████░░  86%              │
│   /Users/flkrnr/code/mobile-app     221 sessions  █░░░░░░░░░░░░░░░   7%              │
│   /Users/flkrnr/code/design-system  198 sessions  █░░░░░░░░░░░░░░░   6%              │
│                                                                                      │
│ Top models                                                                           │
│   gpt-5.2-codex              6,689 turns  █████░░░░░░░░░░░  29%                      │
│   gpt-5.4                    4,745 turns  ███░░░░░░░░░░░░░  20%                      │
│   gpt-5.3-codex              3,909 turns  ███░░░░░░░░░░░░░  17%                      │
│                                                                                      │
│ Top tools                                                                            │
│   exec_command              46,294 calls  ██████████░░░░░░  63%                      │
│   apply_patch                8,267 calls  ██░░░░░░░░░░░░░░  11%                      │
│   write_stdin                7,603 calls  ██░░░░░░░░░░░░░░  10%                      │
│                                                                                      │
│ Activity by day                                                                      │
│   2026-02-28                563 sessions  ███░░░░░░░░░░░░░  17%                      │
│   2026-02-16                552 sessions  ███░░░░░░░░░░░░░  16%                      │
│   2026-02-15                377 sessions  ██░░░░░░░░░░░░░░  11%                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Notes

- No external Node dependencies are required.
- By default, the report is scoped to the current git project.
- Use `--global` to report across all projects.
- When run outside a git project, the CLI falls back to a global report.
- Dates without times are interpreted in the local timezone.
- Token totals are based on `last_token_usage` entries in Codex session logs.
- Reports include all Codex sessions in the same local `~/.codex/sessions`
  directory, even if they were created under different Codex logins.
- Sessions from other OS users, machines, containers, or custom Codex home
  directories are not included.
- Stats are not split by Codex login because the local session logs do not
  expose a stable account identifier.

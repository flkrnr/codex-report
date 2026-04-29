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
│ Sessions    476                                                                      │
│ Projects    13                                                                       │
│ Messages    34,740 (8,024 user, 26,716 assistant)                                    │
│ Tokens      7,907,745,582 total                                                      │
│             7,841,153,859 input · 7,221,436,800 cached · 36,187,755 output           │
│ Active days 125 · longest streak 28 days                                             │
│ Busiest day 2026-03-25 (2,373 messages)                                              │
│                                                                                      │
│ Weekly activity                                                                      │
│   Mon  █████████████░░░░░░░░░░░░░░░    3,614 messages | 809M tok                     │
│   Tue  ████████████████████████████    7,872 messages | 2.0B tok                     │
│   Wed  ████████████████████████░░░░    6,623 messages | 1.3B tok                     │
│   Thu  █████████████████████░░░░░░░    6,043 messages | 1.4B tok                     │
│   Fri  █████████████████░░░░░░░░░░░    4,828 messages | 1.1B tok                     │
│   Sat  ███████░░░░░░░░░░░░░░░░░░░░░    1,905 messages | 427M tok                     │
│   Sun  ██████████████░░░░░░░░░░░░░░    3,855 messages | 803M tok                     │
│                                                                                      │
│ Top projects                                                                         │
│   /Users/flkrnr/code/product-api              205 sessions  ███████░░░░░░░░░  43%    │
│   /Users/flkrnr/code/mobile-app               194 sessions  ███████░░░░░░░░░  41%    │
│   /Users/flkrnr/code/design-system             39 sessions  █░░░░░░░░░░░░░░░   8%    │
│                                                                                      │
│ Top models                                                                           │
│   gpt-5.2-codex                                 6,689 turns  █████░░░░░░░░░░░  29%   │
│   gpt-5.4                                       4,745 turns  ███░░░░░░░░░░░░░  20%   │
│   gpt-5.3-codex                                 3,909 turns  ███░░░░░░░░░░░░░  17%   │
│                                                                                      │
│ Top tools                                                                            │
│   exec_command                                 46,384 calls  ██████████░░░░░░  63%   │
│   apply_patch                                   8,287 calls  ██░░░░░░░░░░░░░░  11%   │
│   write_stdin                                   7,649 calls  ██░░░░░░░░░░░░░░  10%   │
│                                                                                      │
│ Activity by day                                                                      │
│   2026-03-25                              2.4K msg | 402M tok  █░░░░░░░░░░░░░░░   7% │
│   2026-03-08                              2.3K msg | 380M tok  █░░░░░░░░░░░░░░░   7% │
│   2026-03-14                              1.5K msg | 348M tok  █░░░░░░░░░░░░░░░   4% │
│                                                                                      │
│ Sources                                                                              │
│   vscode                                       372 sessions  █████████████░░░  78%   │
│   cli                                           81 sessions  ███░░░░░░░░░░░░░  17%   │
│   codex_cli_rs                                  17 sessions  █░░░░░░░░░░░░░░░   4%   │
│                                                                                      │
│ Providers                                                                            │
│   openai                                       454 sessions  ███████████████░  95%   │
│   (unknown)                                     22 sessions  █░░░░░░░░░░░░░░░   5%   │
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

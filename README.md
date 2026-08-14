# codex-report

A tiny CLI that shows how much you're actually burning with Codex.

The CLI reads Codex session JSONL files from `~/.codex/sessions` and prints
session, message, token, model, project, tool, activity, and estimated API
cost stats.

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

Print only selected sections without the boxed summary:

```bash
codex-report --models
codex-report --models --tools
codex-report --costs
codex-report --skills
codex-report --global --weekly --activity --top 5
```

Available section flags: `--weekly`, `--projects`, `--models`, `--tools`,
`--activity`, `--sources`, `--providers`, `--costs`, and `--skills`.

API cost estimation is experimental and should be treated as an approximation,
not billing data. For details on how estimates are calculated, see
[Cost Estimation](docs/cost-estimation.md).

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
│ API cost    $335.91 estimated from priced local tokens                               │
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
│   ~/code/product-api                          205 sessions    ███████░░░░░░░░░  43%  │
│   ~/code/mobile-app                           194 sessions    ███████░░░░░░░░░  41%  │
│   ~/code/design-system                         39 sessions    █░░░░░░░░░░░░░░░   8%  │
│                                                                                      │
│ Top models                                                                           │
│   gpt-5.2-codex                                 6,689 turns   █████░░░░░░░░░░░  29%  │
│   gpt-5.4                                       4,745 turns   ███░░░░░░░░░░░░░  20%  │
│   gpt-5.3-codex                                 3,909 turns   ███░░░░░░░░░░░░░  17%  │
│                                                                                      │
│ Estimated API cost by model                                                          │
│   gpt-5.4                                           $160.25  2.1B in · 1.9B cached   │
│   gpt-5.2-codex                                     $102.10  3.2B in · 3.0B cached   │
│   gpt-5.3-codex                                      $73.56  1.1B in · 1.0B cached   │
│                                                                                      │
│ Top tools                                                                            │
│   exec_command                                 46,384 calls   ██████████░░░░░░  63%  │
│   apply_patch                                   8,287 calls   ██░░░░░░░░░░░░░░  11%  │
│   write_stdin                                   7,649 calls   ██░░░░░░░░░░░░░░  10%  │
│                                                                                      │
│ Activity by day                                                                      │
│   2026-03-25                              2.4K msg | 402M tok █░░░░░░░░░░░░░░░   7%  │
│   2026-03-08                              2.3K msg | 380M tok █░░░░░░░░░░░░░░░   7%  │
│   2026-03-14                              1.5K msg | 348M tok █░░░░░░░░░░░░░░░   4%  │
│                                                                                      │
│ Sources                                                                              │
│   Codex Desktop                                326 sessions   ███████████░░░░░  67%  │
│   codex_cli_rs                                 101 sessions   ███░░░░░░░░░░░░░  21%  │
│   codex_vscode                                  54 sessions   ██░░░░░░░░░░░░░░  11%  │
│                                                                                      │
│ Providers                                                                            │
│   openai                                       454 sessions   ███████████████░  95%  │
│   (unknown)                                     22 sessions   █░░░░░░░░░░░░░░░   5%  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Notes

- No external Node dependencies are required.
- By default, the report is scoped to the current folder.
- Use `--global` to report across all projects.
- When the current folder has no matching Codex sessions, the CLI falls back
  to a global report.
- Dates without times are interpreted in the local timezone.
- Parsed daily session summaries are cached once per source file under
  `~/.codex/cache` by default. A source JSONL size or modification-time change
  invalidates its entry; date ranges and the current skill registry are applied
  after loading the cache.
- Token totals are based on Codex `token_count` events in local session logs.
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

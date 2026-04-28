# codex-report

Text reports for local Codex usage over a selected time period.

The CLI reads Codex session JSONL files from `~/.codex/sessions` and prints
session, message, token, model, project, tool, and activity stats.

## Install locally

Link the package globally from the project directory:

```bash
npm link
```

After linking, run it from anywhere:

```bash
codex-report
```

Verify the linked binary:

```bash
which codex-report
```

Remove the global link:

```bash
npm unlink -g codex-report
```

## Usage

Report the current git project from the beginning of the available local data
through today:

```bash
node ./bin/codex-report.js
```

Report across all local Codex sessions:

```bash
node ./bin/codex-report.js --global
```

Report a specific period:

```bash
node ./bin/codex-report.js --from 2026-04-01 --to 2026-04-28
```

Limit top lists with `--top`:

```bash
node ./bin/codex-report.js --top 5
```

## Example output

```text
$ codex-report --global

Codex usage stats
Scope: global
Period: 2025-09-01 to 2026-04-28
Sessions: 1,248
Messages: 18,932 (4,321 user, 14,611 assistant)
Tokens: 2,845,931,420 total
  Input: 2,812,114,902, cached input: 2,441,870,144
  Output: 21,104,318, reasoning output: 12,712,200
Projects: 8
Active days: 96
Longest streak: 21 days
Busiest day: 2026-02-14 (84 sessions)

Top projects
  /Users/flkrnr/code/product-api: 2,872
  /Users/flkrnr/code/mobile-app: 219
  /Users/flkrnr/code/design-system: 198

Top models
  gpt-5.2-codex: 6,689
  gpt-5.4: 4,745
  gpt-5.3-codex: 3,909

Providers
  openai: 3,328
  (unknown): 24

Sources
  cli: 2,957
  vscode: 370
  codex_cli_rs: 19

Top tools
  exec_command: 46,042
  apply_patch: 8,250
  write_stdin: 7,550

Activity by day
  2026-02-28: 563
  2026-02-16: 552
  2026-02-15: 377
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

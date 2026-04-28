# codex-report

Text reports for local Codex usage over a selected time period.

The CLI reads Codex session JSONL files from `~/.codex/sessions` and prints
session, message, token, model, project, tool, and activity stats.

## Usage

Report from the beginning of the available local data through today:

```bash
node ./bin/codex-report.js
```

Report a specific period:

```bash
node ./bin/codex-report.js --from 2026-04-01 --to 2026-04-28
```

Limit top lists with `--top`:

```bash
node ./bin/codex-report.js --top 5
```

## Notes

- No external Node dependencies are required.
- Dates without times are interpreted in the local timezone.
- Token totals are based on `last_token_usage` entries in Codex session logs.

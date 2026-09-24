# Codex Report for Raycast (local MVP)

Requirements: macOS, Raycast, and Node.js >= 20.

From the `raycast` directory:

```sh
npm install
npm run dev
```

Open Raycast and search for **Show Codex Report**. `ray develop` imports the
extension locally and reloads changes automatically. After stopping development
with Ctrl+C, the last built command remains available in Raycast. No Store
publication is required.

## Dashboard

- ⌘1: Today
- ⌘2: This Week, starting on Monday
- ⌘3: This Month
- ⌘R: Refresh
- ⌘K: Open Actions, including switching between messages and tokens or copying JSON
- ⌘⇧C: Copy a readable summary

All periods use the local time zone. The default is the current week. Activity
charts show aligned weekday and date columns, with weekly groups in the monthly
view. Bars share one scale across the selected period. Charts are SVG images
without hover interaction.

## Explore

The dashboard is the entry point. Native searchable lists show details without
re-reading session logs:

- ⌘M: Models, sortable by tokens or recorded turns
- ⌘E: Estimated API Costs, including explicitly unpriced models
- ⌘I: Reasoning Efforts and Fast Mode share of known service tiers
- Actions → Show Projects: session counts grouped by repository, including worktrees,
  using the same grouping as the CLI; details show the repository or directory
- Escape: Return to the dashboard

Each detail list offers Copy Summary, Copy Name, and Copy Value. Projects are
sorted by session count. Reasoning effort counts exclude turns without recorded
settings. Costs use the existing CLI API-equivalent estimates, including its
Reserve alias; they do not represent subscription fees. The cached-input share
is calculated relative to input tokens.

## Local development

`prepare.mjs` copies the existing CLI into the extension assets and records the
local Node executable path. Restart `npm run dev` after changing Node versions
or modifying the CLI.

The extension reuses the CLI parser and cache in `~/.codex/cache`; it does not
run a separate server. A cold scan can take longer, just as it does in the CLI.
During refresh, the previous report stays visible. If refresh fails, that report
is explicitly marked as the last successful result.

Validate the extension with:

```sh
npm run build
npm run typecheck
```

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
- ⌘← / ⌘→: Previous / next day, week, or month
- Click the Agents tags: All Agents, Codex (blue), or Claude (orange)
- ⌘4: All Agents · ⌘5: Codex · ⌘6: Claude
- ⌘R: Refresh
- ⌘K: Open Actions, including switching between messages, tokens, and estimated costs or copying JSON
- ⌘⇧C: Copy a readable summary

⌘1/2/3 return to the current period. Past weeks and months include the full
period; the current period ends today.

All periods use the local time zone. The default is the current week. Activity
charts show aligned weekday and date columns, with weekly groups in the monthly
view. The default is All Agents; the CLI still defaults to Codex. In All Agents, each activity bar is stacked
with Codex in blue and Claude in orange; the legend also labels the colors.
The selected agent filters the totals, detail lists, copied summary/JSON and PNG
export. Switching back to a loaded agent/period reuses its report in memory;
Refresh invalidates all loaded views. Bars share one scale across the selected period. Charts are SVG images
without hover interaction.

## Explore

The dashboard is the entry point. Native searchable lists show details without
re-reading session logs:

- ⌘M: Models, with estimated costs and sorting by tokens, recorded turns, or cost
- ⌘E: Estimated API Costs, including explicitly unpriced models
- ⌘I: Reasoning Efforts and Fast Mode share of known service tiers
- Actions → Show Projects: session counts grouped by repository, including worktrees,
  using the same grouping as the CLI; details show the repository or directory and
  estimated costs, with sorting by sessions or cost
- Escape: Return to the dashboard

Each detail list offers Copy Summary, Copy Name, and Copy Value. Projects are
sorted by session count. Reasoning effort counts exclude turns without recorded
settings. Costs use the existing CLI API-equivalent estimates, including its
Reserve alias; they do not represent subscription fees. The cached-input share
is calculated relative to input tokens.

## Activity heatmap

Open **Show Activity Heatmap** directly or use the dashboard's Actions menu.
It defaults to tokens, both agents, and six calendar months ending today.
- ⌘1: Six months ending today
- ⌘2: Current calendar year, January through December
- ⌘← / ⌘→: Previous / next six-month window or calendar year

Every year includes January through December, with empty cells for dates without usage. ⌘1 and ⌘2 return to the current
period. Actions also switch between tokens, messages, and estimated API costs.

Columns are weeks, Monday through Sunday. Month and weekday labels identify
both axes. Grey means zero usage for the selected metric; dates outside the
window are omitted. Four intensity levels use the combined daily peak divided
by 64, 16, and 4, then the peak itself. These thresholds stay fixed when switching
agents (⌘4 / ⌘5 / ⌘6), so their usage remains comparable.

Each day uses the color of the agent with the largest value for the selected
metric. Exact ties use purple, labeled **Equal share** in the legend when present.
Intensity shows the combined daily total, so the color indicates the winner
rather than its share; both contributions remain available in the details. **Show Daily Activity** opens a searchable native list
with exact totals and each agent's recorded usage. Cost views flag partial
estimates and exclude unpriced usage. Export as PNG includes the selected view
and its legend.

## Local development

`prepare.mjs` copies the existing CLI into the extension assets and records the
local Node executable path. Restart `npm run dev` after changing Node versions
or modifying the CLI.

The extension reuses the CLI parser and cache in `~/.codex/cache` and `~/.claude/cache`; it does not
run a separate server. A cold scan can take longer, just as it does in the CLI.
A bounded Raycast cache keeps successful reports across command openings.
Previously loaded periods display immediately while a fresh report loads in the
background; the heatmap marks this state. A new period still needs an initial
scan. Refresh clears saved reports for every window and agent.
During refresh, the previous report stays visible. If refresh fails, that report
is explicitly marked as the last successful result.

Validate the extension with:

```sh
npm run build
npm run typecheck
npm test
```

Category costs reuse cached model-token totals without changing the cache format.
Unknown prices are shown as **Unpriced**; mixed priced/unpriced usage is marked
**partial**. Cost sorting places entirely unpriced entries last. Activity cost bars
and PNG exports use the same estimates.

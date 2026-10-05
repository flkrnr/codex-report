import { Action, ActionPanel, Detail, Icon, environment } from "@raycast/api";
import { useState } from "react";
import { compact } from "./charts";
import { imageMarkdown } from "./svg";
import { AgentSelection, Metric, agentLabels, metrics, money } from "./report-data";
import { useReport } from "./use-report";
import { HeatmapMonths, buildHeatmap, heatmapRange } from "./heatmap-data";
import { heatmapImage } from "./heatmap-chart";
import { HeatmapDays } from "./heatmap-days";
import { ExportPngAction } from "./export-png";

export default function HeatmapCommand() {
  const [months, setMonths] = useState<HeatmapMonths>(6);
  const [offset, setOffset] = useState(0);
  const [agent, setAgent] = useState<AgentSelection>("all");
  const [metric, setMetric] = useState<Metric>("tokens");
  const range = heatmapRange(months, offset);
  // Always load both agents so filtering is immediate and uses the same scale.
  const { report, loading, error, refresh } = useReport(range.from, range.to, "all");
  const map = report ? buildHeatmap(report, range, agent, metric) : undefined;
  const formatValue = metric === "costs" ? money : compact;
  const image = map ? heatmapImage(map, environment.appearance === "dark", formatValue) : undefined;
  const activeDays = map?.cells.filter((cell) => cell.inRange && cell.value > 0).length ?? 0;
  const total = map?.cells.filter((cell) => cell.inRange).reduce((sum, cell) => sum + cell.value, 0) ?? 0;
  const unpriced = map?.cells.some((cell) => cell.inRange && cell.cost.unpricedTokens > 0);
  const costNote = metric === "costs" ? `API-equivalent estimates; unpriced usage is excluded.${unpriced ? " This is a partial estimate." : ""} See Daily Activity for coverage.` : "";
  const note = "Grey = zero usage. Split cells indicate both agents, not their shares. Intensity shows daily usage on a shared scale across agent filters.";
  const markdown = [
    `## ${range.title} · ${agentLabels[agent]}
${range.from} — ${range.to}`,
    image ? imageMarkdown("Activity heatmap", image) : error ? "Could not load activity. Press ⌘R to retry." : "Reading local sessions…",
    `${activeDays} active days · ${formatValue(total)} ${metrics[metric].toLowerCase()}`,
    note,
    costNote,
    error && report ? "Refresh failed. Showing the last successful report." : "",
  ].join("\n\n");
  function changeWindow(value: HeatmapMonths) { setMonths(value); setOffset(0); }
  return <Detail isLoading={loading} navigationTitle="Activity Heatmap" markdown={markdown}
    actions={<ActionPanel>
      {map && <Action.Push title="Show Daily Activity" icon={Icon.Calendar} target={<HeatmapDays map={map} formatValue={formatValue} />} />}
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["cmd"], key: "r" }} onAction={refresh} />
      <ActionPanel.Section title="Agents">
        {(["all", "codex", "claude"] as AgentSelection[]).map((value, index) => <Action key={value} title={`Show ${agentLabels[value]}`}
          shortcut={{ modifiers: ["cmd"], key: String(index + 4) as "4" | "5" | "6" }} onAction={() => setAgent(value)} />)}
      </ActionPanel.Section>
      <ActionPanel.Section title="Window">
        <Action title="Show 6 Months" icon={Icon.Calendar} onAction={() => changeWindow(6)} />
        <Action title="Show 12 Months" icon={Icon.Calendar} onAction={() => changeWindow(12)} />
        <Action title="Previous Window" shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }} onAction={() => setOffset((value) => value - 1)} />
        {offset < 0 && <Action title="Next Window" shortcut={{ modifiers: ["cmd"], key: "arrowRight" }} onAction={() => setOffset((value) => value + 1)} />}
      </ActionPanel.Section>
      <ActionPanel.Section title="Metric">
        {(Object.keys(metrics) as Metric[]).map((value) => <Action key={value} title={`Show ${metrics[value]}`} onAction={() => setMetric(value)} />)}
      </ActionPanel.Section>
      {image && report && <ExportPngAction card={{ title: `${range.title} · ${agentLabels[agent]}`, subtitle: `${range.from} — ${range.to}`,
        chart: image, generatedAt: report.generatedAt, stats: [{ label: metrics[metric], value: formatValue(total) }, { label: "Active Days", value: String(activeDays) }], note: `${note} ${costNote}` }} />}
    </ActionPanel>} />;
}

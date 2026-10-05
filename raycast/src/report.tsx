import { Action, ActionPanel, Detail, Icon, Toast, environment, showToast } from "@raycast/api";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { useEffect, useState } from "react";
import { Bar, barChart, barChartImage, compact } from "./charts";
import { ExportPngAction } from "./export-png";
import local from "./local.json";
import { Breakdown } from "./breakdown";
import { Report, money, costLabel } from "./report-data";
import { Period, periods, periodRange } from "./periods";

type Metric = "tokens" | "messages" | "costs";
const metrics: Record<Metric, string> = { tokens: "Tokens", messages: "Messages", costs: "Costs" };


function activityBars(dates: string[], report: Report, metric: Metric, groupWeeks: boolean): Bar[] {
  return dates.map((date, index) => {
    // Parse at local noon to keep weekday labels independent of UTC offsets.
    const localDate = new Date(`${date}T12:00:00`);
    const weekday = localDate.toLocaleDateString("en-US", { weekday: "short" });
    let group: string | undefined;
    if (groupWeeks && (index === 0 || localDate.getDay() === 1)) {
      const monday = new Date(localDate);
      monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
      group = `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    const activity = report.days.find((entry) => entry.date === date);
    return {
      label: `${date.slice(5, 7)}/${date.slice(8)}`,
      weekday,
      value: metric === "costs" ? activity?.cost.totalCost ?? 0 : activity?.[metric] ?? 0,
      displayValue: metric === "costs" ? activity ? costLabel(activity.cost) : money(0) : undefined,
      group,
    };
  });
}

export default function Command() {
  const [period, setPeriod] = useState<Period>("week");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [metric, setMetric] = useState<Metric>("tokens");
  const [report, setReport] = useState<Report>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    const { from, to } = periodRange(period, offset);
    const child = execFile(local.node, [join(environment.assetsPath, "codex-report.mjs"), "--global", "--json", "--from", from, "--to", to],
      { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 }, (failure, stdout) => {
        if (cancelled) return;
        try {
          if (failure) throw new Error(failure.killed ? "Report timed out. Please try again." : failure.message);
          const result = JSON.parse(stdout) as Report;
          if (result.schemaVersion !== 1) throw new Error("Unsupported report format");
          setReport(result);
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason);
          setError(message);
          void showToast({ style: Toast.Style.Failure, title: "Could Not Load Report", message });
        } finally {
          setLoading(false);
        }
      });
    return () => { cancelled = true; child.kill(); };
  }, [period, offset, refresh]);

  const changePeriod = (next: Period) => {
    if (next === period && offset === 0) return;
    setReport(undefined);
    setPeriod(next);
    setOffset(0);
  };
  const unit = metrics[metric];
  const { dates, title } = periodRange(period, offset);
  const movePeriod = (direction: number) => {
    setReport(undefined);
    setOffset((value) => value + direction);
  };
  const markdown = report ? [
    `## ${title}\n${compact(report.messages)} Messages · ${compact(report.tokens.total_tokens)} Tokens · ${report.sessions} Sessions`,
    report.sessions === 0 ? "No activity in this period yet." : barChart(`Activity · ${unit}`, activityBars(dates, report, metric, period === "month")),
    metric === "costs" ? "Estimated API costs · unpriced usage excluded; partial totals are marked." : "",
    error ? "Refresh failed. Showing the last successful report." : "",
  ].join("\n\n") : error ? `## Report Unavailable\n\nPress ⌘R to try again.` : "## Codex Report\n\nReading local sessions…";

  return <Detail isLoading={loading} navigationTitle={`Codex Report · ${title}`} markdown={markdown}
    metadata={report && <Detail.Metadata>
      <Detail.Metadata.Label title="Tokens" text={report.tokens.total_tokens.toLocaleString("en-US")} />
      <Detail.Metadata.Label title={report.costEstimate.unpricedModels.length ? "Estimated API Cost · Partial" : "Estimated API Cost"} text={money(report.costEstimate.totalCost)} />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title="Sessions" text={String(report.sessions)} />
      <Detail.Metadata.Label title="Cached Input Share" text={report.tokens.input_tokens ? `${(100 * report.tokens.cached_input_tokens / report.tokens.input_tokens).toFixed(1)} %` : "—"} />
      <Detail.Metadata.Label title="Updated" text={new Date(report.generatedAt).toLocaleTimeString("en-US")} />
      <Detail.Metadata.Label title="Fast Mode" text={report.insights.fastModePercent == null ? "Unavailable" : `${report.insights.fastModePercent}% of known turns`} />
    </Detail.Metadata>}
    actions={<ActionPanel>
      {report && <ActionPanel.Section title="Explore">
        <Action.Push title="Show Models" icon={Icon.Layers} shortcut={{ modifiers: ["cmd"], key: "m" }} target={<Breakdown kind="models" report={report} period={title} />} />
        <Action.Push title="Show Costs" icon={Icon.Coins} shortcut={{ modifiers: ["cmd"], key: "e" }} target={<Breakdown kind="costs" report={report} period={title} />} />
        <Action.Push title="Show Reasoning Efforts" icon={Icon.LightBulb} shortcut={{ modifiers: ["cmd"], key: "i" }} target={<Breakdown kind="efforts" report={report} period={title} />} />
        <Action.Push title="Show Projects" icon={Icon.Folder} target={<Breakdown kind="projects" report={report} period={title} />} />
      </ActionPanel.Section>}
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["cmd"], key: "r" }} onAction={() => setRefresh((value) => value + 1)} />
      <ActionPanel.Section title="Period">
        <Action title="Previous Period" icon={Icon.ArrowLeft} shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }} onAction={() => movePeriod(-1)} />
        <Action title="Next Period" icon={Icon.ArrowRight} shortcut={{ modifiers: ["cmd"], key: "arrowRight" }} onAction={() => movePeriod(1)} />
        {(Object.keys(periods) as Period[]).map((value, index) => <Action key={value} title={periods[value]} icon={value === period && offset === 0 ? Icon.CheckCircle : Icon.Calendar} shortcut={{ modifiers: ["cmd"], key: String(index + 1) as "1" | "2" | "3" }} onAction={() => changePeriod(value)} />)}
      </ActionPanel.Section>
      <ActionPanel.Section title="Activity Metric">
        {(Object.keys(metrics) as Metric[]).map((value) => <Action key={value} title={`Show ${metrics[value]}`} icon={metric === value ? Icon.CheckCircle : Icon.BarChart} onAction={() => setMetric(value)} />)}
      </ActionPanel.Section>
      {report && <ExportPngAction card={{
        title,
        subtitle: `${report.period.from ?? "All time"} — ${report.period.to} · Activity by ${metric}`,
        generatedAt: report.generatedAt,
        stats: [
          { label: "Messages", value: report.messages.toLocaleString("en-US") },
          { label: "Tokens", value: compact(report.tokens.total_tokens) },
          { label: report.costEstimate.unpricedModels.length ? "Estimated API Cost · Partial" : "Estimated API Cost", value: money(report.costEstimate.totalCost) },
          { label: "Sessions", value: String(report.sessions) },
          { label: "Cached Input Share", value: report.tokens.input_tokens ? `${(100 * report.tokens.cached_input_tokens / report.tokens.input_tokens).toFixed(1)}%` : "—" },
          { label: "Fast Mode · Known Turns", value: report.insights.fastModePercent == null ? "Unavailable" : `${report.insights.fastModePercent}%` },
        ],
        chart: barChartImage(`Activity · ${unit}`, activityBars(dates, report, metric, period === "month")),
        note: `${error ? "Refresh failed. Showing the last successful report. " : ""}API-equivalent estimate, not subscription charges.${report.costEstimate.unpricedModels.length ? " Unpriced models are excluded." : ""}`,
      }} />}
      {report && <Action.CopyToClipboard title="Copy Summary" shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} content={`${title}: ${report.messages.toLocaleString("en-US")} messages · ${compact(report.tokens.total_tokens)} tokens · ${report.sessions} sessions · ${money(report.costEstimate.totalCost)} estimated API cost${report.costEstimate.unpricedModels.length ? " (partial)" : ""}`} />}
      {report && <Action.CopyToClipboard title="Copy Report as JSON" content={JSON.stringify(report, null, 2)} />}
    </ActionPanel>} />;
}

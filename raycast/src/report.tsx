import { Action, ActionPanel, Detail, Icon, Toast, environment, showToast } from "@raycast/api";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { useEffect, useState } from "react";
import { Bar, barChart, compact } from "./charts";
import local from "./local.json";
import { Breakdown } from "./breakdown";
import { Report, money } from "./report-data";

type Period = "today" | "week" | "month";
const periods: Record<Period, string> = { today: "Today", week: "This Week", month: "This Month" };
function day(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function range(period: Period): { from: string; to: string; dates: string[] } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (period === "week") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  if (period === "month") start.setDate(1);
  const from = day(start);
  const to = day(now);
  const dates: string[] = [];
  while (day(start) <= to) {
    dates.push(day(start));
    start.setDate(start.getDate() + 1);
  }
  return { from, to, dates };
}

function activityBars(dates: string[], report: Report, metric: "tokens" | "messages", groupWeeks: boolean): Bar[] {
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
    return {
      label: `${date.slice(5, 7)}/${date.slice(8)}`,
      weekday,
      value: report.days.find((entry) => entry.date === date)?.[metric] ?? 0,
      group,
    };
  });
}

export default function Command() {
  const [period, setPeriod] = useState<Period>("week");
  const [refresh, setRefresh] = useState(0);
  const [metric, setMetric] = useState<"tokens" | "messages">("tokens");
  const [report, setReport] = useState<Report>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    const { from, to } = range(period);
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
  }, [period, refresh]);

  const changePeriod = (next: Period) => {
    if (next === period) return;
    setReport(undefined);
    setPeriod(next);
  };
  const unit = metric === "tokens" ? "Tokens" : "Messages";
  const dates = range(period).dates;
  const markdown = report ? [
    `## ${periods[period]}\n${compact(report.messages)} Messages · ${compact(report.tokens.total_tokens)} Tokens · ${report.sessions} Sessions`,
    report.sessions === 0 ? "No activity in this period yet." : barChart(`Activity · ${unit}`, activityBars(dates, report, metric, period === "month")),
    error ? "Refresh failed. Showing the last successful report." : "",
  ].join("\n\n") : error ? `## Report Unavailable\n\nPress ⌘R to try again.` : "## Codex Report\n\nReading local sessions…";

  return <Detail isLoading={loading} navigationTitle={`Codex Report · ${periods[period]}`} markdown={markdown}
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
        <Action.Push title="Show Models" icon={Icon.Layers} shortcut={{ modifiers: ["cmd"], key: "m" }} target={<Breakdown kind="models" report={report} period={periods[period]} />} />
        <Action.Push title="Show Costs" icon={Icon.Coins} shortcut={{ modifiers: ["cmd"], key: "e" }} target={<Breakdown kind="costs" report={report} period={periods[period]} />} />
        <Action.Push title="Show Reasoning Efforts" icon={Icon.LightBulb} shortcut={{ modifiers: ["cmd"], key: "i" }} target={<Breakdown kind="efforts" report={report} period={periods[period]} />} />
        <Action.Push title="Show Projects" icon={Icon.Folder} target={<Breakdown kind="projects" report={report} period={periods[period]} />} />
      </ActionPanel.Section>}
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["cmd"], key: "r" }} onAction={() => setRefresh((value) => value + 1)} />
      <ActionPanel.Section title="Period">
        {(Object.keys(periods) as Period[]).map((value, index) => <Action key={value} title={periods[value]} icon={value === period ? Icon.CheckCircle : Icon.Calendar} shortcut={{ modifiers: ["cmd"], key: String(index + 1) as "1" | "2" | "3" }} onAction={() => changePeriod(value)} />)}
      </ActionPanel.Section>
      <Action title={metric === "tokens" ? "Show Messages" : "Show Tokens"} icon={Icon.BarChart} onAction={() => setMetric(metric === "tokens" ? "messages" : "tokens")} />
      {report && <Action.CopyToClipboard title="Copy Summary" shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} content={`${periods[period]}: ${report.messages.toLocaleString("en-US")} messages · ${compact(report.tokens.total_tokens)} tokens · ${report.sessions} sessions · ${money(report.costEstimate.totalCost)} estimated API cost${report.costEstimate.unpricedModels.length ? " (partial)" : ""}`} />}
      {report && <Action.CopyToClipboard title="Copy Report as JSON" content={JSON.stringify(report, null, 2)} />}
    </ActionPanel>} />;
}

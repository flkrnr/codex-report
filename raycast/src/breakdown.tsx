import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { basename } from "node:path";
import { useState } from "react";
import { compact } from "./charts";
import { count, money, Report, share } from "./report-data";

type Kind = "models" | "costs" | "efforts" | "projects";
const titles: Record<Kind, string> = { models: "Models", costs: "Estimated API Costs", efforts: "Reasoning Efforts", projects: "Projects" };
type Row = { name: string; value: string; detail: string; fields: [string, string][] };

function rowsFor(kind: Kind, report: Report, byTurns: boolean): Row[] {
  if (kind === "projects") {
    return report.repositories.map((project) => ({ name: basename(project.name) || project.name, value: `${count(project.sessions)} sessions`, detail: project.name, fields: [["Repository / Directory", project.name], ["Sessions", count(project.sessions)]] }));
  }
  if (kind === "models") {
    const total = report.models.reduce((sum, model) => sum + (byTurns ? model.turns : model.tokens), 0);
    return [...report.models].sort((a, b) => byTurns ? b.turns - a.turns : b.tokens - a.tokens).map((model) => ({
      name: model.name,
      value: `${compact(byTurns ? model.turns : model.tokens)} ${byTurns ? "turns" : "tokens"}`,
      detail: share(byTurns ? model.turns : model.tokens, total),
      fields: [["Tokens", count(model.tokens)], ["Turns", count(model.turns)], ["Share", share(byTurns ? model.turns : model.tokens, total)]],
    }));
  }
  if (kind === "costs") {
    return [
      ...report.costEstimate.modelCosts.map((model): Row => ({
        name: model.model,
        value: money(model.cost),
        detail: share(model.cost, report.costEstimate.totalCost),
        fields: [["Estimated API Cost", money(model.cost)], ["Share of Priced Cost", share(model.cost, report.costEstimate.totalCost)], ["Input Tokens", count(model.tokens.input_tokens)], ["Cached Input Tokens", count(model.tokens.cached_input_tokens)], ["Output Tokens", count(model.tokens.output_tokens)]],
      })),
      ...report.costEstimate.unpricedModels.map((model): Row => ({
        name: model.model,
        value: "Unpriced",
        detail: `${compact(model.tokens.total_tokens)} tokens`,
        fields: [["Pricing", "No known price"], ["Tokens", count(model.tokens.total_tokens)], ["Included in Estimate", "No"]],
      })),
    ];
  }
  const total = report.reasoningEfforts.reduce((sum, effort) => sum + effort.turns, 0);
  return report.reasoningEfforts.map((effort) => ({
    name: effort.name,
    value: `${count(effort.turns)} turns`,
    detail: share(effort.turns, total),
    fields: [["Turns", count(effort.turns)], ["Share of Known Efforts", share(effort.turns, total)], ["Known Effort Turns", count(total)], ["Fast Mode", report.insights.fastModePercent == null ? "Unavailable" : `${report.insights.fastModePercent}% of known service tiers`]],
  }));
}

export function Breakdown({ kind, report, period }: { kind: Kind; report: Report; period: string }) {
  const [byTurns, setByTurns] = useState(false);
  const rows = rowsFor(kind, report, byTurns);
  const note = kind === "costs" ? "API estimate, not subscription charges. Unpriced models are excluded." : kind === "efforts" ? "Distribution of recorded reasoning settings. Missing settings are excluded." : "Usage recorded in local Codex sessions.";
  return <List isShowingDetail navigationTitle={`${titles[kind]} · ${period}`} searchBarPlaceholder={`Filter ${kind === "efforts" ? "reasoning efforts" : kind === "projects" ? "projects" : "models"}…`}
    searchBarAccessory={kind === "models" ? <List.Dropdown tooltip="Sort Models" value={byTurns ? "turns" : "tokens"} onChange={(value) => setByTurns(value === "turns")}><List.Dropdown.Item title="By Tokens" value="tokens" /><List.Dropdown.Item title="By Turns" value="turns" /></List.Dropdown> : undefined}>
    <List.EmptyView title="No Data for This Period" description="Go back and choose another period." icon={Icon.BarChart} />
    <List.Section title={period} subtitle={kind === "costs" ? `${money(report.costEstimate.totalCost)}${report.costEstimate.unpricedModels.length ? " · partial estimate" : " estimated"}` : `${rows.length} ${kind}`}>
      {rows.map((row) => <List.Item key={`${row.name}-${row.detail}`} title={row.name} icon={kind === "costs" ? Icon.Coins : kind === "efforts" ? Icon.LightBulb : kind === "projects" ? Icon.Folder : Icon.Layers} accessories={[{ text: row.value, tooltip: row.detail }]}
        detail={<List.Item.Detail markdown={`## ${row.name}\n\n${note}`} metadata={<List.Item.Detail.Metadata>
          {row.fields.map(([title, value]) => <List.Item.Detail.Metadata.Label key={title} title={title} text={value} />)}
        </List.Item.Detail.Metadata>} />}
        actions={<ActionPanel>
          <Action.CopyToClipboard title="Copy Summary" content={`${row.name} · ${period}\n${row.fields.map(([title, value]) => `${title}: ${value}`).join("\n")}\n${note}`} />
          <Action.CopyToClipboard title="Copy Name" content={row.name} shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} />
          <Action.CopyToClipboard title="Copy Value" content={row.value} />
        </ActionPanel>} />)}
    </List.Section>
  </List>;
}

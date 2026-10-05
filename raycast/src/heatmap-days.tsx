import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { Heatmap, HeatmapCell } from "./heatmap-data";
import { agentLabels, count, metrics, costLabel } from "./report-data";

export function HeatmapDays({ map, formatValue }: { map: Heatmap; formatValue: (value: number) => string }) {
  const dayValue = (day: HeatmapCell) => map.metric === "costs" ? costLabel(day.cost) : formatValue(day.value);
  const days = map.cells.filter((cell) => cell.inRange).reverse();
  return <List navigationTitle="Daily Activity" searchBarPlaceholder="Find a date…" isShowingDetail>
    {days.map((day) => <List.Item key={day.date} title={day.date} icon={Icon.Calendar}
      accessories={[{ text: dayValue(day) }]}
      detail={<List.Item.Detail markdown={`## ${day.date}

${agentLabels[map.agent]} · ${metrics[map.metric]}: ${dayValue(day)}`}
        metadata={<List.Item.Detail.Metadata>
          {day.contributions.map((entry) => <List.Item.Detail.Metadata.Label key={entry.agent} title={agentLabels[entry.agent]}
            text={`${count(entry.tokens)} tokens · ${count(entry.messages)} messages · ${costLabel(entry.cost)}`} />)}
          {!day.contributions.length && <List.Item.Detail.Metadata.Label title="Activity" text="No recorded activity" />}
        </List.Item.Detail.Metadata>} />}
      actions={<ActionPanel><Action.CopyToClipboard title="Copy Daily Summary" content={`${day.date} · ${agentLabels[map.agent]}: ${dayValue(day)} ${metrics[map.metric].toLowerCase()}`} /></ActionPanel>} />)}
  </List>;
}

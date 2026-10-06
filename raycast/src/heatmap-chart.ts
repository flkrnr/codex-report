import type { SvgImage } from "./png";
import { agentColors, agentLabels, metrics } from "./report-data";
import { escapeXml } from "./svg";
import { Heatmap, HeatmapCell, HeatmapView, heatmapLevel, metricValue } from "./heatmap-data";
import { WeeklyHeatmap, buildWeeklyHeatmap, weeklyBlocks } from "./heatmap-weekly";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SOURCE_COLORS = { ...agentColors, tie: "#A78BFA" };
const SOURCE_LABELS = { ...agentLabels, tie: "Equal share" };
const OPACITY = [0, 0.35, 0.55, 0.75, 1];
const LEFT = 38;
const TOP = 54;

function tileSvg(week: number, row: number, size: number, gap: number, track: string, color?: string, opacity = 1, title = ""): string {
  const x = LEFT + week * (size + gap);
  const y = TOP + row * (size + gap);
  const rect = `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${Math.min(4, size / 4)}"`;
  const base = `${rect} fill="${track}"/>`;
  return color ? `${base}<g opacity="${opacity}"><title>${escapeXml(title)}</title>${rect} fill="${color}"/></g>` : base;
}

function cellSvg(cell: HeatmapCell, map: Heatmap, size: number, gap: number, track: string): string {
  if (!cell.inRange) return "";
  const level = heatmapLevel(cell.value, map.thresholds);
  const color = cell.dominantAgent && level > 0 ? SOURCE_COLORS[cell.dominantAgent] : undefined;
  const label = cell.dominantAgent ? SOURCE_LABELS[cell.dominantAgent] : "No usage";
  const title = `${cell.date}: ${cell.value} ${metrics[map.metric].toLowerCase()} · ${label}`;
  return tileSvg(cell.week, cell.weekday, size, gap, track, color, OPACITY[level], title);
}

function weeklyTiles(weekly: WeeklyHeatmap, map: Heatmap, size: number, gap: number, track: string): string {
  return weekly.weeks.map((week) => {
    const blocks = weeklyBlocks(week, weekly.peak, map.agent, map.metric);
    const shares = week.contributions.map((entry) => `${agentLabels[entry.agent]}: ${metricValue(entry, map.metric)}`);
    const title = `${week.date} — ${week.endDate}: ${week.value} ${metrics[map.metric].toLowerCase()} · ${shares.join(" · ")}`;
    return Array.from({ length: 7 }, (_, row) => {
      const agent = blocks[6 - row];
      return tileSvg(week.week, row, size, gap, track, agent ? agentColors[agent] : undefined, 1, title);
    }).join("");
  }).join("");
}

function axisLabels(weekly: WeeklyHeatmap | undefined, size: number, gap: number, muted: string, formatValue: (value: number) => string): string {
  const labels = weekly ? [7, 0, 0, 4, 0, 0, 1].map((blocks) => blocks && weekly.peak > 0 ? `≤ ${formatValue(weekly.peak * (blocks / 7) ** 2)}` : "") : WEEKDAYS;
  const fontSize = Math.min(8, size * 0.85);
  return labels.map((label, index) => `<text x="${LEFT - 10}" y="${TOP + index * (size + gap) + size / 2}" text-anchor="end" dominant-baseline="central" fill="${muted}" opacity="0.8" font-size="${fontSize}">${escapeXml(label)}</text>`).join("");
}

function dailyScale(map: Heatmap, bottom: number, track: string, text: string, muted: string, formatValue: (value: number) => string): string {
  return map.thresholds.map((value, index) => {
    const x = LEFT + index * 125;
    return `<rect x="${x}" y="${bottom + 32}" width="11" height="11" rx="2" fill="${track}"/><rect x="${x}" y="${bottom + 32}" width="11" height="11" rx="2" fill="${text}" opacity="${OPACITY[index + 1]}"/><text x="${x + 16}" y="${bottom + 41}" fill="${muted}" font-size="10">≤ ${escapeXml(formatValue(value))}</text>`;
  }).join("");
}

function monthLabels(map: Heatmap, size: number, gap: number, muted: string): string {
  const seen = new Set<string>();
  return map.cells.filter((cell) => cell.inRange).map((cell) => {
    const month = cell.date.slice(0, 7);
    if (seen.has(month)) return "";
    seen.add(month);
    const date = new Date(`${cell.date}T12:00:00`);
    const label = date.toLocaleDateString("en-US", { month: "short" });
    return `<text x="${Math.min(532, LEFT + cell.week * (size + gap))}" y="40" fill="${muted}" font-size="11">${label}</text>`;
  }).join("");
}

export function heatmapImage(map: Heatmap, dark: boolean, formatValue: (value: number) => string, view: HeatmapView = "daily"): SvgImage {
  const track = dark ? "#303030" : "#eeeeee";
  const text = dark ? "#eeeeee" : "#222222";
  const muted = dark ? "#aaaaaa" : "#666666";
  const gap = map.weeks > 32 ? 2.5 : 4;
  const size = Math.min(17, (522 - gap * (map.weeks - 1)) / map.weeks);
  const bottom = TOP + 7 * (size + gap);
  const weekly = view === "weekly" ? buildWeeklyHeatmap(map) : undefined;
  const days = axisLabels(weekly, size, gap, muted, formatValue);
  const agents = map.agent === "all" ? ["codex", "claude"] as const : [map.agent];
  const legendItems = agents.map((agent) => ({ label: agentLabels[agent], color: agentColors[agent] }));
  if (!weekly && map.cells.filter((cell) => cell.inRange).some((entry) => entry.dominantAgent === "tie")) legendItems.push({ label: SOURCE_LABELS.tie, color: SOURCE_COLORS.tie });
  const legend = legendItems.map((item, index) => `<circle cx="${LEFT + index * 95}" cy="${bottom + 15}" r="4" fill="${item.color}"/><text x="${LEFT + index * 95 + 10}" y="${bottom + 19}" fill="${muted}" font-size="11">${item.label}</text>`).join("");
  const peak = weekly?.peak ?? map.thresholds[3];
  let scale = dailyScale(map, bottom, track, text, muted, formatValue);
  if (weekly) scale = `<text x="${LEFT}" y="${bottom + 41}" fill="${muted}" font-size="10">Square-root scale · blocks approximate agent shares</text>`;
  if (peak === 0) scale = `<text x="${LEFT}" y="${bottom + 41}" fill="${muted}" font-size="10">${map.metric === "costs" ? "No priced costs" : "No usage for this metric"}</text>`;
  const cells = weekly ? weeklyTiles(weekly, map, size, gap, track) : map.cells.map((cell) => cellSvg(cell, map, size, gap, track)).join("");
  const title = `Activity · ${metrics[map.metric]} · ${view === "daily" ? "Daily" : "Weekly"}`;
  return { width: 560, height: Math.ceil(bottom + 57), body: `<g font-family="-apple-system,Helvetica,sans-serif"><text x="0" y="17" fill="${text}" font-size="14" font-weight="600">${title}</text>${monthLabels(map, size, gap, muted)}${days}${cells}${legend}${scale}</g>` };
}

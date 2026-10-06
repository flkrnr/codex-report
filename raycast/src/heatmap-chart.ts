import type { SvgImage } from "./png";
import { agentColors, agentLabels, metrics } from "./report-data";
import { escapeXml } from "./svg";
import { Heatmap, HeatmapCell, heatmapLevel } from "./heatmap-data";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIE_COLOR = "#A78BFA";
const OPACITY = [0, 0.35, 0.55, 0.75, 1];
const LEFT = 38;
const TOP = 54;

function cellSvg(cell: HeatmapCell, map: Heatmap, size: number, gap: number, track: string): string {
  if (!cell.inRange) return "";
  const x = LEFT + cell.week * (size + gap);
  const y = TOP + cell.weekday * (size + gap);
  const rect = `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${Math.min(4, size / 4)}"`;
  const base = `${rect} fill="${track}"/>`;
  const level = heatmapLevel(cell.value, map.thresholds);
  if (level === 0 || !cell.dominantAgent) return base;
  const color = cell.dominantAgent === "tie" ? TIE_COLOR : agentColors[cell.dominantAgent];
  const label = cell.dominantAgent === "tie" ? "Equal share" : agentLabels[cell.dominantAgent];
  const title = `<title>${cell.date}: ${cell.value} ${metrics[map.metric].toLowerCase()} · ${label}</title>`;
  return `${base}<g opacity="${OPACITY[level]}">${title}${rect} fill="${color}"/></g>`;
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

export function heatmapImage(map: Heatmap, dark: boolean, formatValue: (value: number) => string): SvgImage {
  const track = dark ? "#303030" : "#eeeeee";
  const text = dark ? "#eeeeee" : "#222222";
  const muted = dark ? "#aaaaaa" : "#666666";
  const gap = map.weeks > 32 ? 2.5 : 4;
  const size = Math.min(17, (522 - gap * (map.weeks - 1)) / map.weeks);
  const bottom = TOP + 7 * (size + gap);
  const weekdaySize = Math.min(8, size * 0.85);
  const days = WEEKDAYS.map((label, index) => `<text x="${LEFT - 10}" y="${TOP + index * (size + gap) + size / 2}" text-anchor="end" dominant-baseline="central" fill="${muted}" opacity="0.8" font-size="${weekdaySize}">${label}</text>`).join("");
  const agents = map.agent === "all" ? ["codex", "claude"] as const : [map.agent];
  const legendItems = agents.map((agent) => ({ label: agentLabels[agent], color: agentColors[agent] }));
  if (map.cells.some((cell) => cell.inRange && cell.dominantAgent === "tie")) legendItems.push({ label: "Equal share", color: TIE_COLOR });
  const legend = legendItems.map((item, index) => `<circle cx="${LEFT + index * 95}" cy="${bottom + 15}" r="4" fill="${item.color}"/><text x="${LEFT + index * 95 + 10}" y="${bottom + 19}" fill="${muted}" font-size="11">${item.label}</text>`).join("");
  const scale = map.thresholds[3] === 0 ? `<text x="${LEFT}" y="${bottom + 41}" fill="${muted}" font-size="10">${map.metric === "costs" ? "No priced costs" : "No usage for this metric"}</text>` : map.thresholds.map((value, index) => {
    const x = LEFT + index * 125;
    return `<rect x="${x}" y="${bottom + 32}" width="11" height="11" rx="2" fill="${track}"/><rect x="${x}" y="${bottom + 32}" width="11" height="11" rx="2" fill="${text}" opacity="${OPACITY[index + 1]}"/><text x="${x + 16}" y="${bottom + 41}" fill="${muted}" font-size="10">≤ ${escapeXml(formatValue(value))}</text>`;
  }).join("");
  const cells = map.cells.map((cell) => cellSvg(cell, map, size, gap, track)).join("");
  const title = `Activity · ${metrics[map.metric]}`;
  return { width: 560, height: Math.ceil(bottom + 57), body: `<g font-family="-apple-system,Helvetica,sans-serif"><text x="0" y="17" fill="${text}" font-size="14" font-weight="600">${title}</text>${monthLabels(map, size, gap, muted)}${days}${cells}${legend}${scale}</g>` };
}

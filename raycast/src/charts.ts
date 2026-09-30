import { environment } from "@raycast/api";
import type { SvgImage } from "./png";

export type Bar = { label: string; value: number; group?: string; weekday?: string };
export const compact = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
export const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function barChartImage(title: string, bars: Bar[]): SvgImage {
  const dark = environment.appearance === "dark";
  const text = dark ? "#eeeeee" : "#222222";
  const muted = dark ? "#999999" : "#666666";
  const track = dark ? "#303030" : "#eeeeee";
  const accent = dark ? "#228cf6" : "#0a7ff5";
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  let y = 40;
  const rows = bars.map((bar, index) => {
    let heading = "";
    if (bar.group) {
      if (index > 0) y += 12;
      heading = `<text x="0" y="${y}" fill="${muted}" font-size="11" font-weight="600">${escapeXml(bar.group)}</text>
        <line x1="170" y1="${y - 4}" x2="550" y2="${y - 4}" stroke="${track}" stroke-width="1"/>`;
      y += 27;
    }
    const label = bar.label.length > 23 ? `${bar.label.slice(0, 22)}…` : bar.label;
    const weekday = bar.weekday ? `<text x="0" y="${y}" fill="${muted}" font-size="12">${escapeXml(bar.weekday)}</text>` : "";
    const row = `${heading}${weekday}<text x="${bar.weekday ? 34 : 0}" y="${y}" fill="${muted}" font-size="12" font-variant-numeric="tabular-nums">${escapeXml(label)}</text>
      <rect x="170" y="${y - 10}" width="280" height="11" rx="3" fill="${track}"/>
      <rect x="170" y="${y - 10}" width="${280 * bar.value / max}" height="11" rx="3" fill="${accent}"/>
      <text x="550" y="${y}" text-anchor="end" fill="${text}" font-size="12">${compact(bar.value)}</text>`;
    y += 31;
    return row;
  }).join("");
  const height = y - 5;
  return { width: 560, height, body: `<g font-family="-apple-system,Helvetica,sans-serif"><text x="0" y="17" fill="${text}" font-size="14" font-weight="600">${escapeXml(title)}</text>${rows}</g>` };
}

export function barChart(title: string, bars: Bar[]): string {
  const image = barChartImage(title, bars);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}" viewBox="0 0 ${image.width} ${image.height}">${image.body}</svg>`;
  return `![${title}](data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}?raycast-width=560)`;
}

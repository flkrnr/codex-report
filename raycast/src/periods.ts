export type Period = "today" | "week" | "month";
export const periods: Record<Period, string> = { today: "Today", week: "This Week", month: "This Month" };

function day(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function periodRange(period: Period, offset: number, now = new Date()) {
  // Local noon keeps calendar arithmetic stable across daylight-saving changes.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (period === "week") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  if (period === "month") start.setDate(1);
  if (period === "month") start.setMonth(start.getMonth() + offset);
  else start.setDate(start.getDate() + offset * (period === "week" ? 7 : 1));

  const end = new Date(start);
  if (period === "week") end.setDate(end.getDate() + 6);
  if (period === "month") end.setMonth(end.getMonth() + 1, 0);
  const from = day(start);
  const to = offset === 0 ? day(now) : day(end);
  const formatted = start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const title = offset === 0 ? periods[period] : period === "month"
    ? start.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : period === "week" ? `Week of ${formatted}` : formatted;
  const dates: string[] = [];
  const cursor = new Date(start);
  while (day(cursor) <= to) {
    dates.push(day(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return { from, to, dates, title };
}

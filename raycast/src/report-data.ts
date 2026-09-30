export type CostSummary = { totalCost: number; pricedTokens: number; unpricedTokens: number };
export type TokenUsage = {
  total_tokens: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};
export type Report = {
  schemaVersion: number;
  generatedAt: string;
  period: { from: string | null; to: string };
  sessions: number;
  messages: number;
  tokens: TokenUsage;
  days: { date: string; messages: number; tokens: number; cost: CostSummary }[];
  models: { name: string; tokens: number; turns: number; cost: CostSummary }[];
  projects: { name: string; sessions: number }[];
  repositories: { name: string; sessions: number; cost: CostSummary }[];
  reasoningEfforts: { name: string; turns: number }[];
  serviceTiers: { name: string; turns: number }[];
  insights: { fastModePercent: number | null };
  costEstimate: {
    totalCost: number;
    modelCosts: { model: string; canonicalModel: string; tokens: TokenUsage; cost: number }[];
    unpricedModels: { model: string; tokens: TokenUsage }[];
  };
};
export const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
export const count = (value: number) => value.toLocaleString("en-US");
export const share = (value: number, total: number) => total > 0 ? `${(100 * value / total).toFixed(1)}%` : "—";

export function costLabel(cost: CostSummary): string {
  if (cost.unpricedTokens > 0 && cost.pricedTokens === 0) return "Unpriced";
  return `${money(cost.totalCost)}${cost.unpricedTokens > 0 ? " · partial" : ""}`;
}
export const costSortValue = (cost: CostSummary) =>
  cost.unpricedTokens > 0 && cost.pricedTokens === 0 ? -1 : cost.totalCost;

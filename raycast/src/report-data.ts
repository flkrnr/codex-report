export type TokenUsage = {
  total_tokens: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};
export type Report = {
  schemaVersion: number;
  generatedAt: string;
  sessions: number;
  messages: number;
  tokens: TokenUsage;
  days: { date: string; messages: number; tokens: number }[];
  models: { name: string; tokens: number; turns: number }[];
  projects: { name: string; sessions: number }[];
  repositories: { name: string; sessions: number }[];
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

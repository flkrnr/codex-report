import { codexAdapter } from "./codex.js";
import { claudeAdapter } from "./claude.js";
import { antigravityAdapter } from "./antigravity.js";

export function agentAdapters(selection = "codex") {
  const adapters = [codexAdapter(), claudeAdapter(), antigravityAdapter()];
  if (selection === "all") return adapters;
  const selected = adapters.find((adapter) => adapter.id === selection);
  if (!selected) throw new Error(`Unknown agent: ${selection}. Use codex, claude, antigravity, or all.`);
  return [selected];
}

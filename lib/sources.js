import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function configPath() {
  if (process.env.CODEX_REPORT_CONFIG) return process.env.CODEX_REPORT_CONFIG;
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "codex-report", "config.json");
}

function expandHome(directory) {
  return directory === "~" || directory.startsWith("~/") ? path.join(os.homedir(), directory.slice(2)) : directory;
}

// Extra agent homes, such as transcripts mirrored from another machine, laid out like CODEX_HOME or CLAUDE_CONFIG_DIR.
export function extraHomes(agentId) {
  const file = configPath();
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  let config;
  try { config = JSON.parse(text); }
  catch (error) { throw new Error(`Invalid JSON in ${file}: ${error.message}`); }
  const homes = config?.sources?.[agentId] ?? [];
  if (!Array.isArray(homes) || homes.some((home) => typeof home !== "string" || !home)) {
    throw new Error(`${file}: sources.${agentId} must be a list of directories`);
  }
  return homes.map((home) => path.resolve(expandHome(home)));
}

import { copyFileSync, writeFileSync } from "node:fs";
copyFileSync(new URL("../bin/codex-report.js", import.meta.url), new URL("assets/codex-report.mjs", import.meta.url));
writeFileSync(new URL("src/local.json", import.meta.url), JSON.stringify({ node: process.execPath }));

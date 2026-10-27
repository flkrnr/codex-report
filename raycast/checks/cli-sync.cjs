const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const extension = join(__dirname, "..");
const repository = join(extension, "..");
const sources = (directory) => readdirSync(directory, { recursive: true }).filter((file) => file.endsWith(".js")).sort();

// The Store copy has no CLI sources next to it; there the bundled assets are the source of truth.
test("bundled CLI matches the repository CLI", { skip: !existsSync(join(repository, "bin/codex-report.js")) }, () => {
  const hint = "Run npm run sync-cli";
  const cli = readFileSync(join(repository, "bin/codex-report.js"), "utf8").replaceAll('"../lib/', '"./lib/');
  assert.equal(readFileSync(join(extension, "assets/codex-report.mjs"), "utf8"), cli, hint);
  const library = sources(join(repository, "lib"));
  assert.deepEqual(sources(join(extension, "assets/lib")), library, hint);
  for (const file of library) assert.equal(readFileSync(join(extension, "assets/lib", file), "utf8"), readFileSync(join(repository, "lib", file), "utf8"), `${file}: ${hint}`);
});

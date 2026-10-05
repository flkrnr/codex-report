import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shortPath } from "./format.js";
import { increment } from "./utils.js";
import { mergeTokenMaps } from "./session.js";
const execFileAsync = promisify(execFile);

export function normalizeRepositoryUrl(value) {
  const raw = String(value ?? "").trim().replace(/\/$/, "").replace(/\.git$/, "");
  if (!raw) {
    return null;
  }

  const scp = /^(?:[^@\s]+@)?([^:/\s]+):(.+)$/.exec(raw);
  if (scp && !raw.includes("://") && !/^[A-Za-z]:[\\/]/.test(raw)) {
    return `${scp[1].toLowerCase()}/${scp[2].replace(/^\//, "")}`;
  }

  try {
    const url = new URL(raw);
    if (url.protocol === "file:") {
      return decodeURIComponent(url.pathname);
    }
    return `${url.hostname.toLowerCase()}${url.pathname}`.replace(/\/$/, "").replace(/\.git$/, "");
  } catch {
    return path.isAbsolute(raw) ? path.normalize(raw) : raw;
  }
}

export async function gitOutput(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function repositoryIdentity(session, cwdCache) {
  const recordedRepository = normalizeRepositoryUrl(session.repositoryUrl);
  if (recordedRepository) {
    return { key: `remote:${recordedRepository}`, label: recordedRepository };
  }

  const cwd = session.cwd;
  if (cwdCache.has(cwd)) {
    return cwdCache.get(cwd);
  }

  let identity = null;
  if (cwd !== "(unknown)" && fs.existsSync(cwd)) {
    const remote = normalizeRepositoryUrl(await gitOutput(cwd, ["config", "--get", "remote.origin.url"]));
    if (remote) {
      identity = { key: `remote:${remote}`, label: remote };
    } else {
      const commonDir = await gitOutput(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
      if (commonDir) {
        const normalizedCommonDir = path.normalize(commonDir);
        const repositoryRoot = path.basename(normalizedCommonDir) === ".git"
          ? path.dirname(normalizedCommonDir)
          : normalizedCommonDir;
        identity = { key: `git:${normalizedCommonDir}`, label: shortPath(repositoryRoot) };
      }
    }
  }

  identity ??= {
    key: `directory:${cwd === "(unknown)" ? cwd : path.normalize(cwd)}`,
    label: cwd === "(unknown)" ? cwd : shortPath(path.normalize(cwd)),
  };
  cwdCache.set(cwd, identity);
  return identity;
}

export async function aggregateRepositories(sessions) {
  const identities = new Map();
  const cwdCache = new Map();
  const repositoryModelTokens = new Map();
  for (const session of sessions) {
    const identity = await repositoryIdentity(session, cwdCache);
    if (!identities.has(identity.key)) {
      identities.set(identity.key, { label: identity.label, count: 0 });
    }
    identities.get(identity.key).count += 1;
    if (!repositoryModelTokens.has(identity.label)) repositoryModelTokens.set(identity.label, new Map());
    mergeTokenMaps(repositoryModelTokens.get(identity.label), session.modelTokens);
  }

  const repositories = new Map();
  for (const { label: repositoryLabel, count } of identities.values()) {
    increment(repositories, repositoryLabel, count);
  }
  return { repositories, repositoryModelTokens };
}

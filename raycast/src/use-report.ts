import { Cache, Toast, environment, showToast } from "@raycast/api";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { useEffect, useRef, useState } from "react";
import local from "./local.json";
import { createReportCache } from "./report-cache";
import { AgentSelection, Report } from "./report-data";

const snapshots = createReportCache(new Cache({ namespace: "reports-v1" }));

type ReportState = { key: string; report?: Report; loading: boolean; error?: string };

/** `section` limits the CLI's slow git/skill lookups to what the command shows; without `to` the CLI reports through today. */
export function useReport(from: string, to: string | undefined, agent: AgentSelection, section: "activity" | "repositories") {
  const reports = useRef(new Map<string, Report>());
  const [revision, setRevision] = useState(0);
  const key = `${from}:${to ?? "today"}:${agent}:${section}`;
  const [state, setState] = useState<ReportState>(() => ({ key, report: snapshots.read(key), loading: true }));

  useEffect(() => {
    const cached = reports.current.get(key);
    if (cached) {
      setState({ key, report: cached, loading: false });
      return;
    }
    let cancelled = false;
    setState((current) => ({ key, report: current.key === key ? current.report : snapshots.read(key), loading: true }));
    const child = execFile(local.node, [join(environment.assetsPath, "codex-report.mjs"), "--agent", agent, "--global", "--json", `--${section}`, "--from", from, ...(to ? ["--to", to] : [])],
      { maxBuffer: 16 * 1024 * 1024, timeout: 600_000 }, (failure, stdout) => {
        if (cancelled) return;
        try {
          if (failure) throw new Error(failure.killed ? "Report timed out. Please try again." : failure.message);
          const report = JSON.parse(stdout) as Report;
          if (report.schemaVersion !== 1) throw new Error("Unsupported report format");
          snapshots.write(key, report);
          reports.current.set(key, report);
          setState({ key, report, loading: false });
        } catch (reason) {
          const error = reason instanceof Error ? reason.message : String(reason);
          setState((current) => ({ key, report: current.key === key ? current.report : undefined, loading: false, error }));
          void showToast({ style: Toast.Style.Failure, title: "Could Not Load Report", message: error });
        }
      });
    return () => { cancelled = true; child.kill(); };
  }, [from, to, agent, section, key, revision]);

  function refresh() {
    // Every agent view must be refreshed after new activity, not just the visible one.
    snapshots.clear();
    reports.current.clear();
    setRevision((value) => value + 1);
  }
  return { ...(state.key === key ? state : { key, loading: true }), refresh };
}

import { Toast, environment, showToast } from "@raycast/api";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { useEffect, useRef, useState } from "react";
import local from "./local.json";
import { AgentSelection, Report } from "./report-data";

type ReportState = { key: string; report?: Report; loading: boolean; error?: string };

export function useReport(from: string, to: string, agent: AgentSelection) {
  const reports = useRef(new Map<string, Report>());
  const [revision, setRevision] = useState(0);
  const key = `${from}:${to}:${agent}`;
  const [state, setState] = useState<ReportState>({ key, loading: true });

  useEffect(() => {
    const cached = reports.current.get(key);
    if (cached) {
      setState({ key, report: cached, loading: false });
      return;
    }
    let cancelled = false;
    setState((current) => ({ key, report: current.key === key ? current.report : undefined, loading: true }));
    const child = execFile(local.node, [join(environment.assetsPath, "codex-report.mjs"), "--agent", agent, "--global", "--json", "--from", from, "--to", to],
      { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 }, (failure, stdout) => {
        if (cancelled) return;
        try {
          if (failure) throw new Error(failure.killed ? "Report timed out. Please try again." : failure.message);
          const report = JSON.parse(stdout) as Report;
          if (report.schemaVersion !== 1) throw new Error("Unsupported report format");
          reports.current.set(key, report);
          setState({ key, report, loading: false });
        } catch (reason) {
          const error = reason instanceof Error ? reason.message : String(reason);
          setState((current) => ({ key, report: current.key === key ? current.report : undefined, loading: false, error }));
          void showToast({ style: Toast.Style.Failure, title: "Could Not Load Report", message: error });
        }
      });
    return () => { cancelled = true; child.kill(); };
  }, [from, to, agent, key, revision]);

  function refresh() {
    // Every agent view must be refreshed after new activity, not just the visible one.
    reports.current.clear();
    setRevision((value) => value + 1);
  }
  return { ...(state.key === key ? state : { key, loading: true }), refresh };
}

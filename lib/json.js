import { localDay } from "./utils.js";
import { tokenVolume, sessionMessageCount, sessionTokenCount, hasActivity, mergeTokenMaps } from "./session.js";
import { sortedEntries } from "./format.js";
import { costSummary, costEstimateNotes } from "./pricing.js";

export function jsonReport(report) {
  const { start, end, scope, sessions, messages, tokens, daySessions, dayModelTokens, modelTokens, models, reasoningEfforts, serviceTiers, projects, repositories, repositoryModelTokens, tools, costEstimate } = report;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    timestampRange: { from: start?.toISOString() ?? null, to: end.toISOString() },
    period: { from: start ? localDay(start) : null, to: localDay(end) },
    scope,
    selectedAgents: report.selectedAgents,
    agents: report.agentSummaries,
    agentDays: agentActivityDays(sessions),
    availability: report.availability,
    sessions: sessions.length,
    messages: (messages.get("user") ?? 0) + (messages.get("assistant") ?? 0),
    tokens,
    days: [...daySessions].map(([date, activity]) => ({ date, ...activity, cost: costSummary(dayModelTokens.get(date)) })),
    models: [...modelTokens].map(([name, usage]) => ({ name, tokens: tokenVolume(usage), turns: models.get(name) ?? 0, cost: costSummary(new Map([[name, usage]])) }))
      .sort((a, b) => b.tokens - a.tokens),
    reasoningEfforts: sortedEntries(reasoningEfforts).map(([name, turns]) => ({ name, turns })),
    serviceTiers: sortedEntries(serviceTiers).map(([name, turns]) => ({ name, turns })),
    insights: report.insights,
    projects: sortedEntries(projects).map(([name, count]) => ({ name, sessions: count })),
    repositories: sortedEntries(repositories).map(([name, count]) => ({ name, sessions: count, cost: costSummary(repositoryModelTokens.get(name)) })),
    tools: sortedEntries(tools).map(([name, count]) => ({ name, count })),
    sources: sortedEntries(report.sources).map(([name, sessions]) => ({ name, sessions })),
    providers: sortedEntries(report.providers).map(([name, sessions]) => ({ name, sessions })),
    skills: jsonSkills(report.skillAnalysis),
    costEstimate,
    costAssumptions: costEstimateNotes(costEstimate),
  };
}

function jsonSkills(analysis) {
  return {
    activeSkills: analysis.activeSkills.map(({ name, scope }) => ({ name, scope })),
    withEvidenceCount: analysis.withEvidenceCount,
    topReads: analysis.topReads,
    mentions: [...analysis.evidence.mentions].map(([name, mentions]) => ({ name, mentions })),
    noEvidence: analysis.noEvidence,
  };
}

// Per-agent contributions let clients stack activity without changing daily totals.
function agentActivityDays(sessions) {
  const days = new Map();
  for (const session of sessions) {
    for (const [date, daily] of session.days) {
      if (!hasActivity(daily)) continue;
      const key = `${date}:${session.agent}`;
      if (!days.has(key)) days.set(key, { date, agent: session.agent, messages: 0, tokens: 0, modelTokens: new Map() });
      const activity = days.get(key);
      activity.messages += sessionMessageCount(daily);
      activity.tokens += sessionTokenCount(daily);
      mergeTokenMaps(activity.modelTokens, daily.modelTokens);
    }
  }
  return [...days.values()].map(({ modelTokens, ...activity }) => ({ ...activity, cost: costSummary(modelTokens) })).sort((a, b) => a.date.localeCompare(b.date) || a.agent.localeCompare(b.agent));
}

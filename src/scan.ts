import type { Finding, EOB } from "./types";
import { detectDeps, type DepProfile } from "./detect/deps";
import { triage, activeAnalyzers } from "./triage";
import { buildContext } from "./diagnose/context";
import { DryRunFixer } from "./treat/fixer";
import { buildEOB } from "./bill/eob";

// The read-only scan, assembled once and rendered two ways: a human EOB (CLI) or
// a machine report (--json, for a host agent). No model is called here — this is
// the advisory core that runs identically standalone or inside a harness.

export interface ScanData {
  deps: DepProfile;
  analyzers: string[]; // which analyzers fired (the active registry for this repo)
  findings: Finding[];
  eob: EOB;
}

export async function assembleScan(root: string): Promise<ScanData> {
  const deps = detectDeps(root);
  const analyzers = activeAnalyzers(root).map((a) => a.name);
  const findings = triage(root);

  const fixer = new DryRunFixer();
  for (const f of findings) {
    if (f.fixability !== "needs-llm") continue;
    f.context = buildContext(root, f); // the tight packet the host agent fixes from
    f.resolution = (await fixer.fix(f)).resolution; // routed model = the recommendation
  }

  return { deps, analyzers, findings, eob: buildEOB(root, findings, true) };
}

// --- machine report (the in-harness integration contract) ---

type Lane = "local" | "model" | "ignore";

export interface ScanReport {
  version: string;
  root: string;
  prices: string;
  analyzers: string[];
  deps: { manager: string; count: number };
  eob: EOB;
  findings: Array<{
    id: string;
    source: string;
    rule: string;
    severity: string;
    message: string;
    file: string;
    line: number;
    col: number;
    lane: Lane;
    difficulty?: string;
    recommendedModel?: string;
    context?: { snippet: string; startLine: number };
  }>;
  // What a host agent should do: apply the local lane cheaply; fix the escalate
  // list with its OWN model, using each finding's context — don't crawl the repo.
  advice: {
    autoApply: string[];
    escalate: Array<{ id: string; file: string; line: number; recommendedModel?: string }>;
  };
}

const laneOf = (f: Finding): Lane => (f.fixability === "autofix" ? "local" : f.fixability === "ignore" ? "ignore" : "model");

export function toReport(root: string, prices: string, { deps, analyzers, findings, eob }: ScanData): ScanReport {
  return {
    version: "0.1",
    root,
    prices,
    analyzers,
    deps: { manager: deps.manager, count: Object.keys(deps.deps).length },
    eob,
    findings: findings.map((f) => ({
      id: f.id,
      source: f.source,
      rule: f.rule,
      severity: f.severity,
      message: f.message,
      file: f.file,
      line: f.line,
      col: f.col,
      lane: laneOf(f),
      difficulty: f.difficulty,
      recommendedModel: f.resolution?.model,
      context: f.context ? { snippet: f.context.snippet, startLine: f.context.startLine } : undefined,
    })),
    advice: {
      autoApply: findings.filter((f) => f.fixability === "autofix").map((f) => f.id),
      escalate: findings
        .filter((f) => f.fixability === "needs-llm")
        .map((f) => ({ id: f.id, file: f.file, line: f.line, recommendedModel: f.resolution?.model })),
    },
  };
}

import type { Finding } from "../types";
import { runTsc } from "./analyzers/tsc";
import { runAstGrep } from "./analyzers/astgrep";

// Triage: run every applicable on-device analyzer, normalize their output into a
// single Finding[], and rank by signal (errors before warnings).
//
// Each analyzer is a (root) => Finding[] function. runTsc is the native type
// checker; runAstGrep runs the repo's promoted (amortized) rules on-device — the
// $0 lane that grows as recurring classes get synthesized into local checks.
const ANALYZERS: Array<(root: string) => Finding[]> = [runTsc, runAstGrep];

const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

export function triage(root: string): Finding[] {
  const findings = ANALYZERS.flatMap((run) => run(root));
  return findings.sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
  );
}

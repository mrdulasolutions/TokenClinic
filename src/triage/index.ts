import type { Finding } from "../types";
import { runTsc } from "./analyzers/tsc";

// Triage: run every applicable on-device analyzer, normalize their output into a
// single Finding[], and rank by signal (errors before warnings).
//
// v1 ships one analyzer (tsc). The list is the extension point: each new
// analyzer is a (root) => Finding[] function. v2 adds the generated-rule engine
// (ast-grep / fff) here so amortized local checks run in the same pass.
const ANALYZERS: Array<(root: string) => Finding[]> = [runTsc];

const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

export function triage(root: string): Finding[] {
  const findings = ANALYZERS.flatMap((run) => run(root));
  return findings.sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
  );
}

import type { Finding, Fixability, DifficultyClass } from "../types";

// Partition: decide, per finding, whether it can be fixed on-device for $0, or
// must escalate to a model — and if so, how hard the fix is (which routes it to
// a model tier in Treat).
//
// v1 uses a small hand-curated map of TS error codes. v2 replaces the static
// maps with the generated-rule engine: a recurring needs-llm class gets
// synthesized into an autofix rule, after which it lands in AUTOFIX for free.

// Unused declarations — safely removable by a deterministic codemod. $0.
const AUTOFIX = new Set(["TS6133", "TS6138", "TS6192", "TS6196", "TS6198"]);

// Localized, low-ambiguity fixes (missing import, typo, simple syntax).
const MECHANICAL = new Set(["TS2304", "TS2307", "TS2552", "TS1005", "TS1109", "TS1003"]);

export function partition(findings: Finding[]): Finding[] {
  for (const f of findings) {
    // Findings from a promoted (amortized) rule are already a $0 on-device check —
    // keep them in the autofix lane; don't reclassify by the TS-code maps.
    if (f.source.startsWith("ast-grep:")) {
      f.difficulty = "mechanical";
      continue;
    }
    const { fixability, difficulty } = classify(f.rule);
    f.fixability = fixability;
    f.difficulty = difficulty;
  }
  return findings;
}

function classify(rule: string): { fixability: Fixability; difficulty: DifficultyClass } {
  if (AUTOFIX.has(rule)) return { fixability: "autofix", difficulty: "mechanical" };
  if (MECHANICAL.has(rule)) return { fixability: "needs-llm", difficulty: "mechanical" };
  // Everything else from a type checker is, by default, a semantic fix.
  return { fixability: "needs-llm", difficulty: "semantic" };
}

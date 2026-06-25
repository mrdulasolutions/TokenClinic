// The single record that flows through every stage of the clinic loop.
// Triage creates Findings; Diagnose enriches them; Treat resolves them; Bill sums them.

export type Severity = "error" | "warning" | "info";

// How a finding can be resolved:
//   autofix   - deterministically fixable on-device, $0, no model
//   needs-llm - requires a model; escalated with a tight context packet
//   ignore    - informational, not worth a fix
export type Fixability = "autofix" | "needs-llm" | "ignore";

// Difficulty class -> drives model routing in Treat.
export type DifficultyClass = "mechanical" | "semantic" | "architectural";

export interface Finding {
  id: string; // stable hash of (source, rule, file, line) so it dedupes across runs
  source: string; // "tsc" | "eslint" | "ast-grep:<rule>" | ...
  rule: string; // e.g. "TS2322"
  severity: Severity;
  message: string;
  file: string; // relative to scan root
  line: number;
  col: number;
  fixability: Fixability;
  difficulty?: DifficultyClass;
  context?: ContextPacket; // assembled only when escalated
  resolution?: Resolution; // filled by Treat
}

// The tight, pre-assembled packet handed to the model instead of the whole repo.
export interface ContextPacket {
  snippet: string;
  startLine: number;
  tokensEstimate: number;
}

export interface Resolution {
  model: string; // "local" | model id
  tokensIn: number;
  tokensOut: number;
  cost: number; // USD
  patched: boolean;
  verified: boolean; // a fix is not "done" until its source check passes again
}

// Explanation Of Benefits — the screenshot-able receipt.
export interface EOB {
  total: number;
  fixedLocally: number;
  escalated: number;
  ignored: number;
  spend: number; // USD actually (or, in v1, would-be) spent by the clinic loop
  naiveCost: number; // USD estimate for the naive "dump the file at a top model" approach
  saved: number; // naiveCost - spend
  byModel: Record<string, { count: number; cost: number }>;
  estimated: boolean; // true while the LLM step is simulated (no key wired)
}

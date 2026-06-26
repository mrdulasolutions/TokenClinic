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
  patch?: string; // the corrected snippet that replaces the finding's context lines
}

// --- Audit (Approach A: the retroactive audit over existing call logs) ---

// Two-bucket economics (Premise 5):
//   eliminable - reducible to a deterministic rule; could have cost $0 on-device
//   routable   - real work, but resolvable on a cheaper model (not eliminable)
//   essential  - genuine reasoning; left untouched
export type Bucket = "eliminable" | "routable" | "essential";

// One past LLM call, read from a team's logs / agent traces. `category` is the
// instrumented/concierge signal — when present it's authoritative; otherwise the
// call is bucketed heuristically from `task` text (and the result flagged estimated).
export interface CallRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  task?: string;
  category?: string;
}

export interface AuditResult {
  calls: number;
  spend: number; // real USD, from tokens × price
  byBucket: Record<Bucket, { count: number; spend: number }>;
  eliminableFraction: number; // share of spend in the eliminable bucket — the bet
  projectedSpend: number; // eliminable→$0, routable→re-priced to cheapest tier, essential→unchanged
  projectedSaved: number;
  estimated: boolean; // true if any call was bucketed heuristically (no category)
  unpriced: number; // calls whose model had no known price (excluded from cost)
}

// --- Amortization (v2): synthesize a deterministic check from a recurring class ---

// A generated check, stored as DATA not code: an ast-grep rule object plus the
// fixtures that gate its promotion. Lives in .tokenclinic/rules/<id>.json once it
// passes validation, or .tokenclinic/quarantine/ if it doesn't.
export interface GeneratedRule {
  id: string; // kebab-case; also the filename
  language: string; // an ast-grep Lang key, e.g. "TypeScript"
  message: string;
  severity: Severity;
  rule: Record<string, unknown>; // the ast-grep rule object, e.g. { pattern: "..." }
  fix?: string; // optional ast-grep fix template (informational in v2)
  origin?: string; // the analyzer rule this was amortized from, e.g. "TS2304"
  fixtures: {
    positive: string[]; // code the rule MUST flag
    negative: string[]; // similar code the rule must NOT flag
  };
}

// A group of recurring needs-llm findings of the same shape — the trigger for synthesis.
export interface Cluster {
  rule: string; // the source rule code shared by the group
  message: string;
  findings: Finding[];
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

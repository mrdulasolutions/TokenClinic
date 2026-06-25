import type { Bucket, CallRecord } from "../types";

// Bucket a past call into the two-bucket economics (Premise 5).
//
// Authoritative path: if the log carries a `category` (instrumented or concierge
// tagging), trust it. Heuristic path: otherwise infer from the task text and flag
// the whole audit as estimated. The heuristic rules are intentionally explicit and
// printed in the report — the audit's credibility depends on the bucketing being
// inspectable, not magic.

const CATEGORY_BUCKET: Record<string, Bucket> = {
  import: "eliminable",
  lint: "eliminable",
  type: "eliminable",
  format: "eliminable",
  syntax: "eliminable",
  refactor: "routable",
  boilerplate: "routable",
  docs: "routable",
  test: "routable",
  architecture: "essential",
  design: "essential",
  reasoning: "essential",
  debug: "essential",
};

const ELIMINABLE_PATTERNS = [
  /\bimport\b/i,
  /\blint\b/i,
  /eslint|prettier|format/i,
  /unused/i,
  /semicolon|\bsyntax\b/i,
  /\bmissing\b/i,
  /\btypo\b/i,
  /type error|type mismatch|not assignable/i,
];

const ROUTABLE_PATTERNS = [
  /boilerplate/i,
  /docstring|\bcomment\b/i,
  /test stub|scaffold/i,
  /\brename\b/i,
  /simple refactor/i,
];

export function classify(call: CallRecord): { bucket: Bucket; estimated: boolean } {
  if (call.category) {
    const mapped = CATEGORY_BUCKET[call.category.toLowerCase()];
    if (mapped) return { bucket: mapped, estimated: false };
  }

  const task = call.task ?? "";
  if (ELIMINABLE_PATTERNS.some((re) => re.test(task))) return { bucket: "eliminable", estimated: true };
  if (ROUTABLE_PATTERNS.some((re) => re.test(task))) return { bucket: "routable", estimated: true };
  return { bucket: "essential", estimated: true };
}

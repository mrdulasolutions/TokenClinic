import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GeneratedRule } from "../types";
import { validate } from "./validate";

// Validate a synthesized rule against its fixtures, then file it: promoted rules
// go to .tokenclinic/rules/ (and run for $0 in every future triage); failures go
// to .tokenclinic/quarantine/ for inspection, never executed.

export type PromotionStatus = "promoted" | "quarantined";

export interface Promotion {
  status: PromotionStatus;
  rule: GeneratedRule;
  failures: string[];
  path: string;
}

export function promote(root: string, rule: GeneratedRule): Promotion {
  const { ok, failures } = validate(rule);
  const sub = ok ? "rules" : "quarantine";
  const dir = join(root, ".tokenclinic", sub);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${rule.id}.json`);
  writeFileSync(path, JSON.stringify(rule, null, 2));
  return { status: ok ? "promoted" : "quarantined", rule, failures, path };
}

import type { GeneratedRule } from "../types";
import { runRule } from "./sg";

// The trust gate. A synthesized rule may only be promoted if it flags every
// positive fixture and flags none of the negatives — proving, on examples, that
// it catches the class without false positives. This is what stops a noisy
// LLM-authored rule from poisoning the "high-signal" promise.

export interface ValidationResult {
  ok: boolean;
  failures: string[];
}

const oneline = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 60);

export function validate(rule: GeneratedRule): ValidationResult {
  const failures: string[] = [];

  // The rule must at least be runnable.
  try {
    runRule(rule.language, "", rule.rule);
  } catch (e) {
    return { ok: false, failures: [`rule is not runnable: ${(e as Error).message}`] };
  }

  // A rule can't trivially pass with empty fixtures.
  if (rule.fixtures.positive.length === 0) failures.push("no positive fixtures");
  if (rule.fixtures.negative.length === 0) failures.push("no negative fixtures");

  for (const code of rule.fixtures.positive) {
    let n = 0;
    try {
      n = runRule(rule.language, code, rule.rule).length;
    } catch {
      /* treated as a miss below */
    }
    if (n < 1) failures.push(`positive fixture not matched: ${oneline(code)}`);
  }

  for (const code of rule.fixtures.negative) {
    let n = 0;
    try {
      n = runRule(rule.language, code, rule.rule).length;
    } catch {
      /* a throw means it didn't match — fine for a negative */
    }
    if (n > 0) failures.push(`negative fixture matched (false positive): ${oneline(code)}`);
  }

  return { ok: failures.length === 0, failures };
}

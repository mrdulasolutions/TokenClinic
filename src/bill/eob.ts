import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding, EOB } from "../types";
import { cost, estimateTokens } from "../pricing/table";

// Bill: turn resolved Findings into an Explanation Of Benefits.
//
// The savings number is a counterfactual: for each finding, the *naive* approach
// dumps the whole containing file at a top model to find-and-fix it. The clinic
// loop instead fixes autofixable findings for $0 and escalates the rest with a
// tight packet to a routed (often cheaper) model. saved = naive - clinic.
//
// Honest caveat: in v1 the per-escalation cost is an estimate (DryRunFixer), so
// the EOB is flagged estimated. The token counts underlying it are real.
const NAIVE_MODEL = "claude-opus-4-8"; // naive = throw the whole file at the top model
const NAIVE_OUTPUT_TOKENS = 300;

export function buildEOB(root: string, findings: Finding[], estimated = true): EOB {
  const fileTokenCache = new Map<string, number>();
  const fileTokens = (file: string): number => {
    let t = fileTokenCache.get(file);
    if (t === undefined) {
      try {
        t = estimateTokens(readFileSync(join(root, file), "utf8"));
      } catch {
        t = 0;
      }
      fileTokenCache.set(file, t);
    }
    return t;
  };

  const byModel: EOB["byModel"] = {};
  const bump = (key: string, c: number) => {
    (byModel[key] ??= { count: 0, cost: 0 }).count++;
    byModel[key].cost += c;
  };

  let spend = 0;
  let naiveCost = 0;
  let fixedLocally = 0;
  let escalated = 0;
  let ignored = 0;

  for (const f of findings) {
    // Naive baseline: every finding would have cost a full-file pass at the top model.
    naiveCost += cost(NAIVE_MODEL, fileTokens(f.file), NAIVE_OUTPUT_TOKENS);

    if (f.fixability === "autofix") {
      fixedLocally++;
      bump("local", 0);
      continue;
    }
    if (f.fixability === "ignore") {
      ignored++;
      continue;
    }

    escalated++;
    if (f.resolution) {
      spend += f.resolution.cost;
      bump(f.resolution.model, f.resolution.cost);
    }
  }

  return {
    total: findings.length,
    fixedLocally,
    escalated,
    ignored,
    spend,
    naiveCost,
    saved: naiveCost - spend,
    byModel,
    estimated,
  };
}

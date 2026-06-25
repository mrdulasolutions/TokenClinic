import { readFileSync } from "node:fs";
import type { AuditResult, Bucket, CallRecord } from "../types";
import { cost } from "../pricing/table";
import { classify } from "./classify";

// Approach A — the retroactive audit. Ingest a JSONL of past LLM calls and print
// the EOB backwards: total spend, the eliminable-class fraction (the bet), and the
// projected savings had the clinic loop been in place. No code is read, nothing is
// fixed — it runs entirely on exported logs, so it carries zero autofix or
// code-exfiltration risk. This is the move that measures the core thesis (Premise 2).

// Where routable work would have run instead — the cheapest tier (Premise 5: bucket 2
// is re-priced, not eliminated).
const ROUTABLE_TARGET = "claude-haiku-4-5";

export function parseLog(path: string): CallRecord[] {
  const raw = readFileSync(path, "utf8");
  const records: CallRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const r = JSON.parse(trimmed) as CallRecord;
      if (typeof r.model === "string" && typeof r.inputTokens === "number") records.push(r);
    } catch {
      // skip malformed lines — partial logs shouldn't abort the audit
    }
  }
  return records;
}

export function audit(calls: CallRecord[]): AuditResult {
  const byBucket: AuditResult["byBucket"] = {
    eliminable: { count: 0, spend: 0 },
    routable: { count: 0, spend: 0 },
    essential: { count: 0, spend: 0 },
  };

  let spend = 0;
  let projectedSpend = 0;
  let estimated = false;

  for (const call of calls) {
    const actual = cost(call.model, call.inputTokens, call.outputTokens);
    const { bucket, estimated: wasGuessed } = classify(call);
    estimated ||= wasGuessed;

    spend += actual;
    byBucket[bucket].count++;
    byBucket[bucket].spend += actual;

    projectedSpend += projectedCost(bucket, call);
  }

  const eliminableFraction = spend > 0 ? byBucket.eliminable.spend / spend : 0;

  return {
    calls: calls.length,
    spend,
    byBucket,
    eliminableFraction,
    projectedSpend,
    projectedSaved: spend - projectedSpend,
    estimated,
  };
}

// What each call would have cost under the clinic loop.
function projectedCost(bucket: Bucket, call: CallRecord): number {
  if (bucket === "eliminable") return 0; // killed on-device
  if (bucket === "routable") return cost(ROUTABLE_TARGET, call.inputTokens, call.outputTokens);
  return cost(call.model, call.inputTokens, call.outputTokens); // essential — unchanged
}

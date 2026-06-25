import { test, expect } from "bun:test";
import { resolve } from "node:path";
import type { Finding } from "../src/types";
import { buildEOB } from "../src/bill/eob";

const ROOT = resolve(import.meta.dir, "../fixtures/sample-repo");

function finding(over: Partial<Finding>): Finding {
  return {
    id: "x",
    source: "tsc",
    rule: "TS0000",
    severity: "error",
    message: "msg",
    file: "src/index.ts",
    line: 1,
    col: 1,
    fixability: "needs-llm",
    ...over,
  };
}

test("EOB sums spend, counts buckets, and computes the savings counterfactual", () => {
  const findings: Finding[] = [
    finding({ id: "a", rule: "TS6133", fixability: "autofix", difficulty: "mechanical" }),
    finding({
      id: "b",
      rule: "TS2322",
      fixability: "needs-llm",
      difficulty: "semantic",
      resolution: { model: "claude-sonnet-4-6", tokensIn: 100, tokensOut: 50, cost: 0.001, patched: true, verified: true },
    }),
  ];

  const eob = buildEOB(ROOT, findings, false);
  expect(eob.total).toBe(2);
  expect(eob.fixedLocally).toBe(1);
  expect(eob.escalated).toBe(1);
  expect(eob.spend).toBeCloseTo(0.001, 6);
  expect(eob.naiveCost).toBeGreaterThan(eob.spend); // dumping whole files at Opus costs more
  expect(eob.saved).toBeCloseTo(eob.naiveCost - eob.spend, 6);
  expect(eob.estimated).toBe(false);
});

test("the estimated flag is honored", () => {
  expect(buildEOB(ROOT, [], true).estimated).toBe(true);
  expect(buildEOB(ROOT, [], false).estimated).toBe(false);
});

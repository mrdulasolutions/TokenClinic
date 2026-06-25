import { test, expect } from "bun:test";
import { resolve } from "node:path";
import { parseLog, audit } from "../src/audit/audit";

test("audit buckets the sample log and computes savings", () => {
  const calls = parseLog(resolve(import.meta.dir, "../fixtures/sample-logs.jsonl"));
  expect(calls.length).toBe(12);

  const a = audit(calls);
  expect(a.calls).toBe(12);
  expect(a.byBucket.eliminable.count).toBe(6);
  expect(a.byBucket.routable.count).toBe(3);
  expect(a.byBucket.essential.count).toBe(3);
  expect(a.eliminableFraction).toBeGreaterThan(0.4);
  expect(a.eliminableFraction).toBeLessThan(0.5);
  expect(a.projectedSpend).toBeLessThan(a.spend); // the loop is cheaper
  expect(a.projectedSaved).toBeGreaterThan(0);
  expect(a.estimated).toBe(true); // some calls had no category → heuristic
});

test("a category is authoritative; estimated is false when every call is tagged", () => {
  const a = audit([
    { model: "claude-opus-4-8", inputTokens: 100, outputTokens: 50, category: "import" },
    { model: "claude-opus-4-8", inputTokens: 100, outputTokens: 50, category: "design" },
  ]);
  expect(a.estimated).toBe(false);
  expect(a.byBucket.eliminable.count).toBe(1);
  expect(a.byBucket.essential.count).toBe(1);
  // eliminable spend is real; its *projection* is what goes to $0 — so saving > 0
  expect(a.projectedSaved).toBeGreaterThan(0);
});

test("parseLog skips malformed and blank lines", () => {
  // round-trips through JSON; a bad line in the middle must not abort the parse
  const calls = parseLog(resolve(import.meta.dir, "../fixtures/sample-logs.jsonl"));
  expect(calls.every((c) => typeof c.model === "string")).toBe(true);
});

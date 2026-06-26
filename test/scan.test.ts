import { test, expect } from "bun:test";
import { resolve } from "node:path";
import { assembleScan, toReport } from "../src/scan";

test("--json report: a promoted rule shows up in the local ($0) lane", async () => {
  const root = resolve(import.meta.dir, "../fixtures/with-rule");
  const report = toReport(root, "snapshot", await assembleScan(root));

  expect(report.version).toBe("0.1");
  expect(report.findings.length).toBe(2);
  expect(report.findings.every((f) => f.lane === "local")).toBe(true);
  expect(report.advice.autoApply.length).toBe(2);
  expect(report.advice.escalate.length).toBe(0);
  expect(report.eob.fixedLocally).toBe(2);
});

test("--json report: escalate list carries a packet + recommended model", async () => {
  const root = resolve(import.meta.dir, "../fixtures/sample-repo");
  const report = toReport(root, "snapshot", await assembleScan(root));

  expect(report.advice.escalate.length).toBeGreaterThan(0);
  const e = report.advice.escalate[0];
  expect(e.recommendedModel).toMatch(/^claude-/);

  const f = report.findings.find((x) => x.id === e.id);
  expect(f?.lane).toBe("model");
  expect((f?.context?.snippet.length ?? 0) > 0).toBe(true); // the tight packet, for the host agent
});

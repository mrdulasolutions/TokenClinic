import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Finding, GeneratedRule } from "../src/types";
import { runRule } from "../src/amortize/sg";
import { validate } from "../src/amortize/validate";
import { cluster } from "../src/amortize/cluster";
import { runAstGrep } from "../src/triage/analyzers/astgrep";
import { partition } from "../src/diagnose/partition";

const goodRule = (): GeneratedRule => ({
  id: "no-console-log",
  language: "TypeScript",
  message: "no console.log",
  severity: "warning",
  rule: { pattern: "console.log($A)" },
  fixtures: { positive: ["console.log(x)", "console.log(1)"], negative: ["logger.info(x)", "console.error(x)"] },
});

test("sg.runRule matches structurally, ignoring formatting", () => {
  const matches = runRule("TypeScript", "console.log( a );\nconsole.error(b);", { pattern: "console.log($A)" });
  expect(matches.length).toBe(1);
  expect(matches[0].line).toBe(1);
});

test("validate promotes a rule that passes its fixtures", () => {
  expect(validate(goodRule()).ok).toBe(true);
});

test("validate quarantines a rule whose negative fixture matches", () => {
  const bad = goodRule();
  bad.rule = { pattern: "console.$M($A)" }; // too broad — also matches console.error
  const r = validate(bad);
  expect(r.ok).toBe(false);
  expect(r.failures.some((f) => f.includes("false positive"))).toBe(true);
});

test("validate rejects empty fixtures", () => {
  const empty = goodRule();
  empty.fixtures = { positive: [], negative: [] };
  expect(validate(empty).ok).toBe(false);
});

test("cluster groups recurring needs-llm findings above the threshold", () => {
  const f = (rule: string): Finding => ({
    id: Math.random().toString(36), source: "tsc", rule, severity: "error",
    message: "m", file: "a.ts", line: 1, col: 1, fixability: "needs-llm",
  });
  const clusters = cluster([f("TS2304"), f("TS2304"), f("TS2304"), f("TS2322")], 3);
  expect(clusters.length).toBe(1);
  expect(clusters[0].rule).toBe("TS2304");
  expect(clusters[0].findings.length).toBe(3);
});

test("runAstGrep runs a promoted rule and yields $0 autofix findings", () => {
  const dir = mkdtempSync(join(tmpdir(), "tc-rule-"));
  try {
    mkdirSync(join(dir, ".tokenclinic", "rules"), { recursive: true });
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, ".tokenclinic", "rules", "no-console-log.json"), JSON.stringify(goodRule()));
    writeFileSync(join(dir, "src/a.ts"), "console.log(1);\nconsole.log(2);\nconst x = 3;\n");

    const findings = partition(runAstGrep(dir));
    expect(findings.length).toBe(2);
    expect(findings.every((f) => f.source === "ast-grep:no-console-log")).toBe(true);
    expect(findings.every((f) => f.fixability === "autofix")).toBe(true); // the $0 lane
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

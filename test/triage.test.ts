import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { triage, activeAnalyzers, detectedLanguages } from "../src/triage";

const ROOT = resolve(import.meta.dir, "../fixtures/sample-repo");

test("triage finds the sample repo's tsc errors", () => {
  const rules = triage(ROOT).map((f) => f.rule);
  expect(rules).toContain("TS2322"); // type mismatch
  expect(rules).toContain("TS6133"); // unused
  expect(rules).toContain("TS2304"); // cannot find name
  expect(rules).toContain("TS2339"); // property does not exist
});

test("analyzers classify findings into the right lanes", () => {
  const findings = triage(ROOT);
  expect(findings.find((f) => f.rule === "TS6133")?.fixability).toBe("autofix"); // local $0
  expect(findings.find((f) => f.rule === "TS2304")?.difficulty).toBe("mechanical"); // → haiku
  expect(findings.find((f) => f.rule === "TS2322")?.difficulty).toBe("semantic"); // → sonnet
});

test("findings get stable, column-distinct ids", () => {
  const ids = triage(ROOT).map((f) => f.id);
  expect(new Set(ids).size).toBe(ids.length); // the two TS2304s don't collide
});

test("the analyzer registry detects what applies to a repo", () => {
  expect(activeAnalyzers(ROOT).map((a) => a.name)).toContain("tsc");
  expect(detectedLanguages(ROOT)).toContain("typescript");

  // a repo with no tsconfig and no rules → no analyzers fire
  const empty = mkdtempSync(join(tmpdir(), "tc-empty-"));
  try {
    writeFileSync(join(empty, "readme.md"), "# nothing to analyze");
    expect(activeAnalyzers(empty).length).toBe(0);
    expect(triage(empty)).toEqual([]);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }

  // a repo with only promoted rules → ast-grep fires, tsc doesn't
  const rulesOnly = mkdtempSync(join(tmpdir(), "tc-rules-"));
  try {
    mkdirSync(join(rulesOnly, ".tokenclinic", "rules"), { recursive: true });
    const names = activeAnalyzers(rulesOnly).map((a) => a.name);
    expect(names).toContain("ast-grep");
    expect(names).not.toContain("tsc");
  } finally {
    rmSync(rulesOnly, { recursive: true, force: true });
  }
});

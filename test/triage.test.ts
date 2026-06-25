import { test, expect } from "bun:test";
import { resolve } from "node:path";
import { triage } from "../src/triage";
import { partition } from "../src/diagnose/partition";

const ROOT = resolve(import.meta.dir, "../fixtures/sample-repo");

test("triage finds the sample repo's tsc errors", () => {
  const rules = partition(triage(ROOT)).map((f) => f.rule);
  expect(rules).toContain("TS2322"); // type mismatch
  expect(rules).toContain("TS6133"); // unused
  expect(rules).toContain("TS2304"); // cannot find name
  expect(rules).toContain("TS2339"); // property does not exist
});

test("partition classifies into the right lanes", () => {
  const findings = partition(triage(ROOT));
  expect(findings.find((f) => f.rule === "TS6133")?.fixability).toBe("autofix"); // local $0
  expect(findings.find((f) => f.rule === "TS2304")?.difficulty).toBe("mechanical"); // → haiku
  expect(findings.find((f) => f.rule === "TS2322")?.difficulty).toBe("semantic"); // → sonnet
});

test("findings get stable, column-distinct ids", () => {
  const ids = partition(triage(ROOT)).map((f) => f.id);
  expect(new Set(ids).size).toBe(ids.length); // the two TS2304s don't collide
});

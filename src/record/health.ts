import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding, EOB } from "../types";
import type { DepProfile } from "../detect/deps";

// The Codebase Health Record: a .tokenclinic/ directory written into the scanned
// repo. v1 persists the dep profile and an append-only run history. v2 adds
// rules/ (promoted generated checks + fixtures), quarantine/, and routing.json
// (learned per-class model routing). Every run reads it back, so every run gets
// cheaper and smarter — this is the compounding asset, not the router.

export function writeHealthRecord(
  root: string,
  deps: DepProfile,
  findings: Finding[],
  eob: EOB,
  now: string,
): string {
  const dir = join(root, ".tokenclinic");
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    join(dir, "profile.json"),
    JSON.stringify(
      { updated: now, manager: deps.manager, deps: deps.deps, analyzers: ["tsc"] },
      null,
      2,
    ),
  );

  const entry = {
    at: now,
    findings: findings.length,
    fixedLocally: eob.fixedLocally,
    escalated: eob.escalated,
    spend: eob.spend,
    naiveCost: eob.naiveCost,
    saved: eob.saved,
    estimated: eob.estimated,
  };
  appendFileSync(join(dir, "history.jsonl"), `${JSON.stringify(entry)}\n`);

  return dir;
}

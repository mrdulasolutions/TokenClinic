import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding } from "../types";
import type { Fixer } from "./fixer";
import { triage } from "../triage";
import { buildContext } from "../diagnose/context";

// The live apply loop, decoupled from the CLI and the concrete fixer so it can be
// driven by a fake fixer in tests (no API key required).
//
// Each pass re-triages from scratch, so line shifts introduced by earlier edits
// are handled automatically. Hardening:
//   - a finding is attempted at most once (by id) → bounded by maxPasses
//   - a no-op patch (unchanged snippet) is skipped, never written
//   - a patch that increases the total finding count is reverted (don't let a
//     "fix" leave the repo worse than it found it)
//   - verified = the finding is gone on the next triage

export interface ApplyResult {
  before: Finding[]; // initial snapshot, for the EOB's autofix/ignore buckets
  fixed: Finding[]; // findings the loop escalated, each carrying its resolution
}

export async function runApplyLoop(root: string, fixer: Fixer, maxPasses = 25): Promise<ApplyResult> {
  const before = triage(root);
  const attempted = new Set<string>();
  const fixed: Finding[] = [];

  for (let pass = 0; pass < maxPasses; pass++) {
    const current = triage(root);
    const totalBefore = current.length;
    const target = current.find((f) => f.fixability === "needs-llm" && !attempted.has(f.id));
    if (!target) break;
    attempted.add(target.id);

    target.context = buildContext(root, target);
    const { resolution, newSnippet } = await fixer.fix(target);
    target.resolution = resolution;
    fixed.push(target);

    // No-op patch — nothing to write.
    if (newSnippet === undefined || newSnippet === target.context?.snippet) {
      resolution.patched = false;
      resolution.verified = false;
      continue;
    }

    const path = join(root, target.file);
    const original = readFileSync(path, "utf8");
    writeSnippet(path, target, newSnippet);

    const after = triage(root);
    if (after.length > totalBefore) {
      // The patch introduced more problems than it solved — revert.
      writeFileSync(path, original);
      resolution.patched = false;
      resolution.verified = false;
    } else {
      resolution.patched = true;
      resolution.verified = !after.some((f) => f.id === target.id);
    }
  }

  return { before, fixed };
}

function writeSnippet(path: string, f: Finding, newSnippet: string) {
  const lines = readFileSync(path, "utf8").split("\n");
  const start = (f.context?.startLine ?? f.line) - 1;
  const oldCount = (f.context?.snippet ?? "").split("\n").length;
  lines.splice(start, oldCount, ...newSnippet.split("\n"));
  writeFileSync(path, lines.join("\n"));
}

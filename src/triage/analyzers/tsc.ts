import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import type { Finding } from "../../types";
import { hash } from "../../util";

const require = createRequire(import.meta.url);

// tsc --pretty false emits one diagnostic per line:
//   src/index.ts(3,7): error TS2322: Type 'number' is not assignable to type 'string'.
const LINE_RE = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/;

// Run the project's type checker and normalize its output into Findings.
// We resolve tsc from tokenclinic's own node_modules and point it at the target
// via cwd, so the scanned repo doesn't need typescript installed itself.
export function runTsc(root: string): Finding[] {
  let tscBin: string;
  try {
    tscBin = require.resolve("typescript/bin/tsc");
  } catch {
    return []; // typescript not installed in tokenclinic — skip this analyzer
  }

  const res = spawnSync(process.execPath, [tscBin, "--noEmit", "--pretty", "false"], {
    cwd: root,
    encoding: "utf8",
  });

  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const findings: Finding[] = [];

  for (const raw of out.split("\n")) {
    const m = LINE_RE.exec(raw.trim());
    if (!m) continue; // continuation/elaboration lines are skipped in v1
    const [, file, line, col, sev, rule, message] = m;
    findings.push({
      id: hash("tsc", rule, file, line, col),
      source: "tsc",
      rule,
      severity: sev === "error" ? "error" : "warning",
      message,
      file,
      line: Number(line),
      col: Number(col),
      fixability: "needs-llm", // refined in Diagnose/partition
    });
  }

  return findings;
}

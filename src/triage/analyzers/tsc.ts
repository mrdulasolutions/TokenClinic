import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import type { Finding, Fixability, DifficultyClass } from "../../types";
import { hash } from "../../util";

const require = createRequire(import.meta.url);

// tsc --pretty false emits one diagnostic per line:
//   src/index.ts(3,7): error TS2322: Type 'number' is not assignable to type 'string'.
const LINE_RE = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/;

// Classification owned by the analyzer that understands its own rule taxonomy.
// Unused declarations — safely removable on-device, $0.
const AUTOFIX = new Set(["TS6133", "TS6138", "TS6192", "TS6196", "TS6198"]);
// Localized, low-ambiguity fixes (missing import, typo, simple syntax).
const MECHANICAL = new Set(["TS2304", "TS2307", "TS2552", "TS1005", "TS1109", "TS1003"]);

function classify(rule: string): { fixability: Fixability; difficulty: DifficultyClass } {
  if (AUTOFIX.has(rule)) return { fixability: "autofix", difficulty: "mechanical" };
  if (MECHANICAL.has(rule)) return { fixability: "needs-llm", difficulty: "mechanical" };
  return { fixability: "needs-llm", difficulty: "semantic" }; // default for a type checker
}

// Run the project's type checker and normalize + classify its output. tsc is
// resolved from tokenclinic's own node_modules and pointed at the target via cwd,
// so the scanned repo doesn't need typescript installed itself.
export function runTsc(root: string): Finding[] {
  let tscBin: string;
  try {
    tscBin = require.resolve("typescript/bin/tsc");
  } catch {
    return [];
  }

  const res = spawnSync(process.execPath, [tscBin, "--noEmit", "--pretty", "false"], {
    cwd: root,
    encoding: "utf8",
  });

  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const findings: Finding[] = [];

  for (const raw of out.split("\n")) {
    const m = LINE_RE.exec(raw.trim());
    if (!m) continue;
    const [, file, line, col, sev, rule, message] = m;
    const { fixability, difficulty } = classify(rule);
    findings.push({
      id: hash("tsc", rule, file, line, col),
      source: "tsc",
      rule,
      severity: sev === "error" ? "error" : "warning",
      message,
      file,
      line: Number(line),
      col: Number(col),
      fixability,
      difficulty,
    });
  }

  return findings;
}

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Finding, GeneratedRule } from "../../types";
import { hash } from "../../util";
import { runRule } from "../../amortize/sg";

// The payoff side of amortization: load the repo's promoted rules and run them
// on-device. Every match is a $0 finding the model never has to see again.

const EXT_BY_LANG: Record<string, string[]> = {
  TypeScript: [".ts"],
  Tsx: [".tsx"],
  JavaScript: [".js", ".mjs", ".cjs"],
};
const SKIP_DIRS = new Set(["node_modules", ".git", ".tokenclinic", "dist", "build"]);

export function runAstGrep(root: string): Finding[] {
  const rulesDir = join(root, ".tokenclinic", "rules");
  if (!existsSync(rulesDir)) return [];

  const rules: GeneratedRule[] = [];
  for (const f of readdirSync(rulesDir)) {
    if (!f.endsWith(".json")) continue;
    try {
      rules.push(JSON.parse(readFileSync(join(rulesDir, f), "utf8")) as GeneratedRule);
    } catch {
      /* skip a corrupt rule file */
    }
  }
  if (rules.length === 0) return [];

  const wantedExts = new Set(rules.flatMap((r) => EXT_BY_LANG[r.language] ?? []));
  const findings: Finding[] = [];

  for (const file of walk(root)) {
    if (![...wantedExts].some((e) => file.endsWith(e))) continue;
    const code = readFileSync(file, "utf8");
    const rel = relative(root, file);

    for (const rule of rules) {
      if (!(EXT_BY_LANG[rule.language] ?? []).some((e) => file.endsWith(e))) continue;
      let matches;
      try {
        matches = runRule(rule.language, code, rule.rule);
      } catch {
        continue; // a promoted rule that somehow no longer parses — skip, don't crash a scan
      }
      for (const m of matches) {
        findings.push({
          id: hash("ast-grep", rule.id, rel, m.line, m.col),
          source: `ast-grep:${rule.id}`,
          rule: rule.id,
          severity: rule.severity,
          message: rule.message,
          file: rel,
          line: m.line,
          col: m.col,
          fixability: "autofix", // a promoted rule is, by definition, a $0 on-device check
          difficulty: "mechanical",
        });
      }
    }
  }

  return findings;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

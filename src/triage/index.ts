import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Finding } from "../types";
import { runTsc } from "./analyzers/tsc";
import { runAstGrep } from "./analyzers/astgrep";

// An analyzer turns a repo into normalized, self-classified findings. Adding a
// language = adding one entry to the registry below (a `detect` + a `run`); the
// rest of the pipeline is language-agnostic. Each analyzer classifies its OWN
// findings (sets fixability/difficulty), so there is no central language switch.
export interface Analyzer {
  name: string;
  languages: string[]; // primary languages it covers ([] = rule-driven / cross-language)
  detect(root: string): boolean; // is this analyzer applicable to this repo?
  run(root: string): Finding[];
}

const tscAnalyzer: Analyzer = {
  name: "tsc",
  languages: ["typescript"],
  detect: (root) => existsSync(join(root, "tsconfig.json")),
  run: runTsc,
};

const astGrepAnalyzer: Analyzer = {
  name: "ast-grep",
  languages: [], // driven by the promoted rules' own `language` field
  detect: (root) => existsSync(join(root, ".tokenclinic", "rules")),
  run: runAstGrep,
};

// To add Python: `{ name: "ruff", languages: ["python"],
//   detect: r => existsSync(join(r,"pyproject.toml")) || hasGlob(r,"**/*.py"),
//   run: runRuff }` — and nothing else in the pipeline changes.
const REGISTRY: Analyzer[] = [tscAnalyzer, astGrepAnalyzer];

const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

export function activeAnalyzers(root: string): Analyzer[] {
  return REGISTRY.filter((a) => a.detect(root));
}

export function detectedLanguages(root: string): string[] {
  return [...new Set(activeAnalyzers(root).flatMap((a) => a.languages))];
}

export function triage(root: string): Finding[] {
  const findings = activeAnalyzers(root).flatMap((a) => a.run(root));
  return findings.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
}

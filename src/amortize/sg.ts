import { createRequire } from "node:module";

// ast-grep loader + a thin match helper.
//
// Bun's global install cache symlinks @ast-grep/napi out of the project tree,
// which breaks napi's internal resolution of its platform binding. So we try the
// normal package first (works under npm/node and in CI) and fall back to the
// platform package directly (works under Bun on this machine).
const require = createRequire(import.meta.url);

interface Napi {
  parse: (lang: unknown, src: string) => { root: () => SgNode };
  Lang: Record<string, unknown>;
}
interface SgNode {
  findAll: (matcher: { rule: Record<string, unknown> }) => SgNode[];
  range: () => { start: { line: number; column: number } };
  text: () => string;
}

let cached: Napi | undefined;
function napi(): Napi {
  if (cached) return cached;
  try {
    cached = require("@ast-grep/napi") as Napi;
  } catch {
    cached = require(`@ast-grep/napi-${process.platform}-${process.arch}`) as Napi;
  }
  return cached;
}

export interface SgMatch {
  line: number; // 1-based
  col: number; // 1-based
  text: string;
}

// Run an ast-grep rule object against source. Throws if the rule is malformed or
// the language is unknown — callers decide whether that's "skip" or "invalid".
export function runRule(language: string, code: string, rule: Record<string, unknown>): SgMatch[] {
  const { parse, Lang } = napi();
  const lang = Lang[language];
  if (lang === undefined) throw new Error(`unknown ast-grep language: ${language}`);
  const root = parse(lang, code).root();
  return root.findAll({ rule }).map((m) => {
    const r = m.range();
    return { line: r.start.line + 1, col: r.start.column + 1, text: m.text() };
  });
}

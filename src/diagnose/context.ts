import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding, ContextPacket } from "../types";
import { estimateTokens } from "../pricing/table";

// Build the tight context packet handed to the model — the few lines around the
// finding, not the whole file. This is the core token-saving move of Diagnose.
//
// v1 slices a fixed line radius. v2 swaps this for fff
// (https://github.com/dmtrKovalenko/fff): fast, frecency-ranked retrieval of the
// *related* symbols/definitions, not just the physically-adjacent lines.
const RADIUS = 15;

export function buildContext(root: string, f: Finding): ContextPacket {
  let lines: string[] = [];
  try {
    lines = readFileSync(join(root, f.file), "utf8").split("\n");
  } catch {
    return { snippet: "", startLine: f.line, tokensEstimate: 0 };
  }

  const start = Math.max(0, f.line - 1 - RADIUS);
  const end = Math.min(lines.length, f.line - 1 + RADIUS + 1);
  const snippet = lines.slice(start, end).join("\n");

  return { snippet, startLine: start + 1, tokensEstimate: estimateTokens(snippet) };
}

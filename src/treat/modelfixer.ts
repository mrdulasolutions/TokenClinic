import type { Finding } from "../types";
import { cost } from "../pricing/table";
import { routeModel } from "./route";
import { getCompleter } from "../llm/completer";
import type { Fixer, FixResult } from "./fixer";

// Live fixer: sends the tight context packet to whichever provider is configured
// (OpenRouter → any model; else Anthropic for claude-*), gets a corrected snippet
// via structured output, and reports the EXACT token cost from the provider's
// usage. The apply loop (treat/apply.ts) writes the patch and verifies by
// re-running the analyzer.

const SYSTEM =
  "You are a precise code-fixing assistant. You are given a single compiler/linter " +
  "error and the source lines around it. Return a corrected version of EXACTLY those " +
  "lines that resolves the error, changing as little as possible. Preserve indentation " +
  "and surrounding lines verbatim; only change what the error requires.";

const SCHEMA = {
  type: "object",
  properties: {
    fixedSnippet: { type: "string", description: "the corrected replacement for the provided lines" },
    explanation: { type: "string", description: "one sentence on what changed" },
  },
  required: ["fixedSnippet", "explanation"],
  additionalProperties: false,
};

export class ModelFixer implements Fixer {
  async fix(finding: Finding): Promise<FixResult> {
    const model = routeModel(finding.difficulty);
    const completer = getCompleter(model);
    const snippet = finding.context?.snippet ?? "";

    // No provider can run this model — report an unresolved escalation, don't crash.
    if (!completer) {
      return { resolution: { model, tokensIn: 0, tokensOut: 0, cost: 0, patched: false, verified: false } };
    }

    const startLine = finding.context?.startLine ?? finding.line;
    const user =
      `Error ${finding.rule} at ${finding.file}:${finding.line} — ${finding.message}\n\n` +
      `The lines below start at line ${startLine}. Return a corrected replacement for them.\n` +
      "```\n" +
      snippet +
      "\n```";

    const res = await completer.complete({ model, system: SYSTEM, user, schema: SCHEMA });

    let fixedSnippet = snippet;
    try {
      const parsed = JSON.parse(res.text) as { fixedSnippet?: string };
      if (typeof parsed.fixedSnippet === "string") fixedSnippet = parsed.fixedSnippet;
    } catch {
      // non-JSON despite the schema — leave the snippet unchanged
    }

    return {
      resolution: {
        model: res.model,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        cost: cost(model, res.tokensIn, res.tokensOut), // priced against the routed id
        patched: false,
        verified: false,
        patch: fixedSnippet,
      },
      newSnippet: fixedSnippet,
    };
  }
}

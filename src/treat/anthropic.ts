import Anthropic from "@anthropic-ai/sdk";
import type { Finding } from "../types";
import { cost } from "../pricing/table";
import { routeModel } from "./route";
import type { Fixer, FixResult } from "./fixer";

// Live fixer: sends the tight context packet to the routed model, gets back a
// corrected snippet via structured output, and reports the EXACT token cost from
// the API's usage. Used by `scan --apply`. The apply loop (in cli.ts) writes the
// patch and verifies by re-running the source analyzer — a fix is not done until
// the finding is gone.
//
// Reads ANTHROPIC_API_KEY from the environment (standard SDK credential resolution).

const SYSTEM =
  "You are a precise code-fixing assistant. You are given a single compiler/linter " +
  "error and the source lines around it. Return a corrected version of EXACTLY those " +
  "lines that resolves the error, changing as little as possible. Preserve indentation " +
  "and surrounding lines verbatim; only change what the error requires.";

// Structured-output schema — constrains the model to return the replacement
// snippet as data, so the apply step never parses prose.
const SCHEMA = {
  type: "object",
  properties: {
    fixedSnippet: { type: "string", description: "the corrected replacement for the provided lines" },
    explanation: { type: "string", description: "one sentence on what changed" },
  },
  required: ["fixedSnippet", "explanation"],
  additionalProperties: false,
};

export class AnthropicFixer implements Fixer {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async fix(finding: Finding): Promise<FixResult> {
    const model = routeModel(finding.difficulty);
    const snippet = finding.context?.snippet ?? "";
    const startLine = finding.context?.startLine ?? finding.line;

    const user =
      `Error ${finding.rule} at ${finding.file}:${finding.line} — ${finding.message}\n\n` +
      `The lines below start at line ${startLine}. Return a corrected replacement for them.\n` +
      "```\n" +
      snippet +
      "\n```";

    const res = await this.client.messages.create({
      model,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });

    const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
    let fixedSnippet = snippet;
    try {
      const parsed = JSON.parse(text) as { fixedSnippet?: string };
      if (typeof parsed.fixedSnippet === "string") fixedSnippet = parsed.fixedSnippet;
    } catch {
      // model returned non-JSON despite the schema — leave the snippet unchanged
    }

    const tokensIn = res.usage.input_tokens;
    const tokensOut = res.usage.output_tokens;

    return {
      resolution: {
        model,
        tokensIn,
        tokensOut,
        cost: cost(model, tokensIn, tokensOut), // exact, from real usage
        patched: false,
        verified: false,
        patch: fixedSnippet,
      },
      newSnippet: fixedSnippet,
    };
  }
}

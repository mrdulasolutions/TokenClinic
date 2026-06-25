import Anthropic from "@anthropic-ai/sdk";
import type { Cluster, GeneratedRule } from "../types";
import { buildContext } from "../diagnose/context";

// Spend ONE model call to turn a recurring class into a deterministic ast-grep
// rule + fixtures. The output is never trusted directly — it goes through the
// fixture gate (validate.ts) before it can be promoted. This is the only place
// in amortization that costs tokens; everything downstream is free and local.

const SYSTEM =
  "You author ast-grep rules. Given several real examples of the same class of " +
  "code problem, write ONE ast-grep rule that matches this class STRUCTURALLY for " +
  "the given language, plus test fixtures. ast-grep patterns use metavariables like " +
  "$A, $B for sub-expressions (e.g. `console.log($A)`). Keep the pattern minimal and " +
  "precise. Positive fixtures MUST match; negative fixtures are valid, similar-looking " +
  "code that MUST NOT match. Return the ast-grep rule object as a JSON string.";

const SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "short kebab-case rule id" },
    message: { type: "string", description: "one-line description of what the rule flags" },
    ruleJson: { type: "string", description: 'ast-grep rule object as JSON, e.g. {"pattern":"console.log($A)"}' },
    positive: { type: "array", items: { type: "string" }, description: "code snippets the rule must flag (≥2)" },
    negative: { type: "array", items: { type: "string" }, description: "similar valid code the rule must NOT flag (≥2)" },
  },
  required: ["id", "message", "ruleJson", "positive", "negative"],
  additionalProperties: false,
};

export async function synthesize(root: string, cl: Cluster, language = "TypeScript"): Promise<GeneratedRule | null> {
  const client = new Anthropic();

  const examples = cl.findings
    .slice(0, 4)
    .map((f, i) => `Example ${i + 1} (${f.file}:${f.line}) — ${f.message}\n` + "```\n" + (buildContext(root, f).snippet) + "\n```")
    .join("\n\n");

  const user =
    `Language: ${language}\n` +
    `These ${cl.findings.length} findings are all "${cl.rule}: ${cl.message}".\n` +
    `Author an ast-grep rule that catches this class on-device, with fixtures.\n\n${examples}`;

  const res = await client.messages.create({
    // synthesis is a reasoning task — use the top model once; it pays for itself forever
    model: "claude-opus-4-8",
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  try {
    const o = JSON.parse(text) as { id: string; message: string; ruleJson: string; positive: string[]; negative: string[] };
    return {
      id: o.id,
      language,
      message: o.message,
      severity: "warning",
      rule: JSON.parse(o.ruleJson) as Record<string, unknown>,
      origin: cl.rule,
      fixtures: { positive: o.positive, negative: o.negative },
    };
  } catch {
    return null; // malformed output — the cluster simply isn't amortized this run
  }
}

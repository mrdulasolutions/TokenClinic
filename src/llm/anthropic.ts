import Anthropic from "@anthropic-ai/sdk";
import type { Completer, CompletionRequest, CompletionResult } from "./completer";
import { toAnthropicId } from "../pricing/normalize";

// Direct Anthropic client — the fallback when OPENROUTER_API_KEY isn't set.
// Handles `claude-*` (and `anthropic/claude-*`, which it bare-ifies for the SDK).

export class AnthropicCompleter implements Completer {
  readonly provider = "anthropic";
  private client = new Anthropic(); // reads ANTHROPIC_API_KEY

  async complete({ model, system, user, schema, maxTokens = 2000 }: CompletionRequest): Promise<CompletionResult> {
    const res = await this.client.messages.create({
      model: toAnthropicId(model),
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      ...(schema ? { output_config: { format: { type: "json_schema", schema } } } : {}),
    });

    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    return { text, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens, model };
  }
}

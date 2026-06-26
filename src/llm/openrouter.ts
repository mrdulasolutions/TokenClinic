import type { Completer, CompletionRequest, CompletionResult } from "./completer";
import { toOpenRouterId } from "../pricing/normalize";

// Universal completer. OpenRouter speaks the OpenAI chat-completions API and
// serves every provider, keyed by the same `provider/model` ids the pricing
// catalog uses — so one key + one client unlocks Anthropic, OpenAI, Google,
// Llama, Mistral, … with no per-provider code.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

export class OpenRouterCompleter implements Completer {
  readonly provider = "openrouter";

  async complete({ model, system, user, schema, maxTokens = 2000 }: CompletionRequest): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: toOpenRouterId(model),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
    };
    if (schema) {
      body.response_format = { type: "json_schema", json_schema: { name: "tokenclinic", strict: true, schema } };
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/mrdulasolutions/TokenClinic",
        "X-Title": "Token Clinic",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as ChatResponse;

    return {
      text: json.choices?.[0]?.message?.content ?? "",
      tokensIn: json.usage?.prompt_tokens ?? 0,
      tokensOut: json.usage?.completion_tokens ?? 0,
      model: json.model ?? model,
    };
  }
}

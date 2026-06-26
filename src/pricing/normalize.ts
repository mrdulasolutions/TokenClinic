// Model-id normalization between TokenClinic's bare ids and llm-intel's
// OpenRouter-style `provider/model` ids — and unit conversion to $/1M tokens.

const BARE_TO_OPENROUTER: Record<string, string> = {
  "claude-opus-4-8": "anthropic/claude-opus-4-8",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
  "claude-haiku-4-5": "anthropic/claude-haiku-4-5",
};

// A bare Anthropic id → its OpenRouter id. Anything already provider-prefixed
// (`openai/…`, `google/…`, or an explicit `anthropic/…`) is passed through, so
// other providers work without special-casing.
export function toOpenRouterId(id: string): string {
  if (id.includes("/")) return id;
  return BARE_TO_OPENROUTER[id] ?? `anthropic/${id}`;
}

// The inverse, for the direct Anthropic SDK which wants a bare id.
export function toAnthropicId(id: string): string {
  return id.startsWith("anthropic/") ? id.slice("anthropic/".length) : id;
}

// llm-intel reports an amount + a unit; normalize everything to $/1M tokens.
// Non-token units (per_image / per_request) aren't token pricing → null.
export function perMillion(amount: unknown, unit: string): number | null {
  const n = Number(amount && typeof amount === "object" ? String(amount) : amount);
  if (!Number.isFinite(n)) return null;
  switch (unit) {
    case "per_million_tokens":
      return n;
    case "per_thousand_tokens":
      return n * 1_000;
    case "per_token":
      return n * 1_000_000;
    case "free":
      return 0;
    default:
      return null;
  }
}

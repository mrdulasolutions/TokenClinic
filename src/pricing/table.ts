// Pricing intelligence.
//
// A cost resolves in this order:
//   1. the live price book — populated at command start from llm-intel
//      (the OpenRouter catalog; any provider's model prices for free)
//   2. a committed offline SNAPSHOT — so read-only `scan` never *requires*
//      network and the routed Anthropic models are always priced
//   3. unknown → null (cost 0, surfaced separately; never a fabricated number)
//
// See ./llmIntel.ts for the warm-up and ./normalize.ts for id/unit handling.

export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
}

// Offline fallback (USD per 1M tokens). Overridden by llm-intel when reachable.
const SNAPSHOT: Record<string, ModelPrice> = {
  "claude-haiku-4-5": { inputPerM: 1.0, outputPerM: 5.0 },
  "claude-sonnet-4-6": { inputPerM: 3.0, outputPerM: 15.0 },
  "claude-opus-4-8": { inputPerM: 5.0, outputPerM: 25.0 },
};

const book = new Map<string, ModelPrice>();

export function setPrice(id: string, p: ModelPrice): void {
  book.set(id, p);
}

export function resetPrices(): void {
  book.clear();
}

export function priceOf(id: string): ModelPrice | null {
  return book.get(id) ?? SNAPSHOT[id] ?? null;
}

export function isPriced(id: string): boolean {
  return priceOf(id) !== null;
}

export function cost(model: string, tokensIn: number, tokensOut: number): number {
  const p = priceOf(model);
  if (!p) return 0; // unknown model — callers surface this via isPriced(), don't invent a price
  return (tokensIn / 1e6) * p.inputPerM + (tokensOut / 1e6) * p.outputPerM;
}

// Rough token estimate for the read-only path. chars/4 — replaced by exact usage
// counts on `--apply`.
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

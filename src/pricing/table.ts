// Pricing intelligence.
//
// v1: a static placeholder table. This is the integration seam for llm-intel
// (https://github.com/basisoasis/llm-intel) — swap `PRICES` for a live-fetched,
// cached snapshot so routing decisions track real, current per-token costs.
//
// Rates are USD per 1M tokens. Treat the numbers below as PLACEHOLDERS to be
// replaced by llm-intel data, not as authoritative prices.

export interface ModelPrice {
  id: string;
  inputPerM: number;
  outputPerM: number;
}

export const PRICES: Record<string, ModelPrice> = {
  "claude-haiku-4-5": { id: "claude-haiku-4-5", inputPerM: 1.0, outputPerM: 5.0 },
  "claude-sonnet-4-6": { id: "claude-sonnet-4-6", inputPerM: 3.0, outputPerM: 15.0 },
  "claude-opus-4-8": { id: "claude-opus-4-8", inputPerM: 15.0, outputPerM: 75.0 },
};

export function cost(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICES[model];
  if (!p) return 0;
  return (tokensIn / 1e6) * p.inputPerM + (tokensOut / 1e6) * p.outputPerM;
}

// Rough token estimate. v1 uses chars/4 (the standard back-of-envelope). Wire a
// real tokenizer (or the API's usage numbers, once calls are live) to make the
// EOB exact rather than estimated.
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

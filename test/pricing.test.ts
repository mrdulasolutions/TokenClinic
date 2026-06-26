import { test, expect } from "bun:test";
import { toOpenRouterId, perMillion } from "../src/pricing/normalize";
import { priceOf, isPriced, cost, setPrice, resetPrices } from "../src/pricing/table";

test("normalizer maps bare ids to OpenRouter ids and passes through others", () => {
  expect(toOpenRouterId("claude-opus-4-8")).toBe("anthropic/claude-opus-4-8");
  expect(toOpenRouterId("openai/gpt-4o")).toBe("openai/gpt-4o"); // already prefixed
  expect(toOpenRouterId("some-new-anthropic-model")).toBe("anthropic/some-new-anthropic-model");
});

test("perMillion normalizes every token unit to $/1M", () => {
  expect(perMillion(3, "per_million_tokens")).toBe(3);
  expect(perMillion(0.003, "per_thousand_tokens")).toBe(3);
  expect(perMillion(0.000003, "per_token")).toBeCloseTo(3, 9);
  expect(perMillion(0, "free")).toBe(0);
  expect(perMillion(5, "per_image")).toBeNull(); // not token pricing
  expect(perMillion("nope", "per_token")).toBeNull();
});

test("priceOf falls back to the offline snapshot for routed models", () => {
  resetPrices();
  expect(priceOf("claude-opus-4-8")).toEqual({ inputPerM: 5.0, outputPerM: 25.0 });
  expect(isPriced("claude-haiku-4-5")).toBe(true);
  expect(priceOf("openai/o5-imaginary")).toBeNull(); // unknown → null, not a fake number
  expect(isPriced("openai/o5-imaginary")).toBe(false);
});

test("the live price book overrides the snapshot", () => {
  resetPrices();
  setPrice("claude-opus-4-8", { inputPerM: 6, outputPerM: 30 });
  expect(priceOf("claude-opus-4-8")).toEqual({ inputPerM: 6, outputPerM: 30 });
  // 1M in + 1M out at the overridden rate
  expect(cost("claude-opus-4-8", 1_000_000, 1_000_000)).toBeCloseTo(36, 6);
  resetPrices();
});

test("cost is 0 for an unknown model (surfaced via isPriced, never invented)", () => {
  resetPrices();
  expect(cost("openai/o5-imaginary", 1000, 1000)).toBe(0);
  expect(isPriced("openai/o5-imaginary")).toBe(false);
});

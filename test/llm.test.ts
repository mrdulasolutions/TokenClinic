import { test, expect, afterEach } from "bun:test";
import { getCompleter, hasProvider } from "../src/llm/completer";
import { toAnthropicId, toOpenRouterId } from "../src/pricing/normalize";

const ORIG = { or: process.env.OPENROUTER_API_KEY, an: process.env.ANTHROPIC_API_KEY };
function setKeys(or?: string, an?: string) {
  if (or === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = or;
  if (an === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = an;
}
afterEach(() => setKeys(ORIG.or, ORIG.an));

test("OpenRouter is preferred and handles ANY model", () => {
  setKeys("sk-or-test", undefined);
  expect(getCompleter("claude-opus-4-8")?.provider).toBe("openrouter");
  expect(getCompleter("openai/gpt-4o")?.provider).toBe("openrouter");
  expect(getCompleter("google/gemini-2.0-flash")?.provider).toBe("openrouter");
  expect(hasProvider()).toBe(true);
});

test("Anthropic-direct handles claude models only", () => {
  setKeys(undefined, "sk-ant-test");
  expect(getCompleter("claude-opus-4-8")?.provider).toBe("anthropic");
  expect(getCompleter("anthropic/claude-opus-4-8")?.provider).toBe("anthropic");
  expect(getCompleter("openai/gpt-4o")).toBeNull(); // no provider for a non-claude model
  expect(hasProvider()).toBe(true);
});

test("OpenRouter wins when both keys are set", () => {
  setKeys("sk-or-test", "sk-ant-test");
  expect(getCompleter("openai/gpt-4o")?.provider).toBe("openrouter");
});

test("no keys → no provider", () => {
  setKeys(undefined, undefined);
  expect(getCompleter("claude-opus-4-8")).toBeNull();
  expect(hasProvider()).toBe(false);
});

test("model-id normalization between provider conventions", () => {
  expect(toOpenRouterId("claude-opus-4-8")).toBe("anthropic/claude-opus-4-8");
  expect(toAnthropicId("anthropic/claude-opus-4-8")).toBe("claude-opus-4-8");
  expect(toAnthropicId("claude-opus-4-8")).toBe("claude-opus-4-8"); // already bare
});

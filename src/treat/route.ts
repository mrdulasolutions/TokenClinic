import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { DifficultyClass } from "../types";

// Model routing: map a fix's difficulty class to the cheapest model that clears
// the bar. Declarative and provider-agnostic — the defaults are Anthropic, but a
// repo can override per class with ANY model id (including OpenRouter-style
// `openai/…` / `google/…`) via .tokenclinic/routing.json. Pricing resolves
// whatever id is configured through llm-intel, so other providers work for the
// cost/EOB/audit layers without touching this file.

const DEFAULT: Record<DifficultyClass, string> = {
  mechanical: "claude-haiku-4-5",
  semantic: "claude-sonnet-4-6",
  architectural: "claude-opus-4-8",
};

let routing: Record<DifficultyClass, string> = { ...DEFAULT };

export function loadRouting(root: string): void {
  routing = { ...DEFAULT };
  const path = join(root, ".tokenclinic", "routing.json");
  if (!existsSync(path)) return;
  try {
    const cfg = JSON.parse(readFileSync(path, "utf8")) as Partial<Record<DifficultyClass, string>>;
    routing = { ...DEFAULT, ...cfg };
  } catch {
    /* malformed config — keep defaults */
  }
}

export function routeModel(difficulty: DifficultyClass = "semantic"): string {
  return routing[difficulty] ?? DEFAULT[difficulty];
}

// The distinct model ids routing can target — used to warm the price book.
export function routedModels(): string[] {
  return [...new Set(Object.values(routing))];
}

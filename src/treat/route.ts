import type { DifficultyClass } from "../types";

// Model routing: map a fix's difficulty class to the cheapest model that clears
// the bar. This is the "spend control" layer — mechanical fixes must not burn
// Opus tokens.
//
// v1 is a static map. The Health Record's routing.json is the upgrade path:
// learn, per codebase, which model tier actually resolves+verifies each class,
// and demote anything that's reliably handled cheaper.
export const MODEL_BY_DIFFICULTY: Record<DifficultyClass, string> = {
  mechanical: "claude-haiku-4-5",
  semantic: "claude-sonnet-4-6",
  architectural: "claude-opus-4-8",
};

export function routeModel(difficulty: DifficultyClass = "semantic"): string {
  return MODEL_BY_DIFFICULTY[difficulty];
}

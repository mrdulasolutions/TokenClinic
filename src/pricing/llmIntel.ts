import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModelInfo, type LLMIntelConfigInput } from "@basisoasis/llm-intel";
import { setPrice } from "./table";
import { toOpenRouterId, perMillion } from "./normalize";

// Warm-up: resolve the given model ids against llm-intel (the OpenRouter catalog)
// once at command start and populate the price book. Keeps the hot path sync —
// cost() never awaits. Fully non-fatal: offline or unknown ids just fall through
// to the committed snapshot, so the read-only path keeps working with no network.

export interface PriceLoad {
  loaded: number;
  source: "llm-intel" | "snapshot";
}

const OPTS: LLMIntelConfigInput = {
  provider: "openrouter",
  cacheDir: join(tmpdir(), "tokenclinic-llm-intel"),
  cacheTtl: 24 * 60 * 60 * 1000, // 24h
};

export async function loadPrices(ids: string[]): Promise<PriceLoad> {
  let loaded = 0;
  for (const id of [...new Set(ids)]) {
    try {
      const res = await getModelInfo(toOpenRouterId(id), OPTS);
      const pricing = res?.data?.pricing;
      if (!pricing) continue;
      const inputPerM = perMillion(pricing.input.amount, pricing.input.unit);
      const outputPerM = perMillion(pricing.output.amount, pricing.output.unit);
      if (inputPerM !== null && outputPerM !== null) {
        setPrice(id, { inputPerM, outputPerM });
        loaded++;
      }
    } catch {
      // offline, rate-limited, or unknown id — snapshot covers it
    }
  }
  return { loaded, source: loaded > 0 ? "llm-intel" : "snapshot" };
}

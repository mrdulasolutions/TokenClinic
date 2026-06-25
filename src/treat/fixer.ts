import type { Finding, Resolution } from "../types";
import { cost, estimateTokens } from "../pricing/table";
import { routeModel } from "./route";

// The seam where a fix is actually performed. Treat routes each escalated
// finding through a Fixer.
export interface Fixer {
  fix(finding: Finding): Resolution;
}

// v1 fixer: estimates the cost of the escalation from real measured token counts
// of the real context packet, but does NOT call a model (no key wired) and does
// NOT mutate files. Every number it produces is honest about being an estimate;
// the EOB is flagged `estimated: true`.
//
// The real implementation is a drop-in replacement: an AnthropicFixer that sends
// the packet, applies the returned patch, then re-runs the finding's source
// analyzer and sets verified = (the finding is gone). Until that check passes,
// the fix is not done.
const ASSUMED_OUTPUT_TOKENS = 200; // a typical small patch

export class DryRunFixer implements Fixer {
  fix(finding: Finding): Resolution {
    const model = routeModel(finding.difficulty);
    const tokensIn = (finding.context?.tokensEstimate ?? 0) + estimateTokens(finding.message);
    const tokensOut = ASSUMED_OUTPUT_TOKENS;
    return {
      model,
      tokensIn,
      tokensOut,
      cost: cost(model, tokensIn, tokensOut),
      patched: false,
      verified: false,
    };
  }
}

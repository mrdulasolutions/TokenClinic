import type { Finding, Resolution } from "../types";
import { cost, estimateTokens } from "../pricing/table";
import { routeModel } from "./route";

// The seam where a fix is actually performed. Treat routes each escalated
// finding through a Fixer.
export interface FixResult {
  resolution: Resolution;
  newSnippet?: string; // present only when the fix can be applied to the file
}

export interface Fixer {
  fix(finding: Finding): Promise<FixResult>;
}

// Estimating fixer: computes the cost of an escalation from real measured token
// counts of the real context packet, but does NOT call a model or mutate files.
// Used by `scan` (the default, read-only path). Every number it produces is
// honest about being an estimate; the EOB is flagged `estimated`.
const ASSUMED_OUTPUT_TOKENS = 200; // a typical small patch

export class DryRunFixer implements Fixer {
  async fix(finding: Finding): Promise<FixResult> {
    const model = routeModel(finding.difficulty);
    const tokensIn = (finding.context?.tokensEstimate ?? 0) + estimateTokens(finding.message);
    const tokensOut = ASSUMED_OUTPUT_TOKENS;
    return {
      resolution: {
        model,
        tokensIn,
        tokensOut,
        cost: cost(model, tokensIn, tokensOut),
        patched: false,
        verified: false,
      },
    };
  }
}

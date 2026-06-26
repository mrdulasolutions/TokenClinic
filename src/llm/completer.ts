import { OpenRouterCompleter } from "./openrouter";
import { AnthropicCompleter } from "./anthropic";

// The single seam where a model is actually called. Both the fixer (--apply) and
// rule synthesis (learn) go through this, so adding a provider means adding a
// Completer — nothing else in the pipeline changes.

export interface CompletionRequest {
  model: string; // routed model id (bare `claude-*` or `provider/model`)
  system: string;
  user: string;
  schema?: Record<string, unknown>; // JSON schema → structured output
  maxTokens?: number;
}

export interface CompletionResult {
  text: string; // model output (a JSON string when `schema` was given)
  tokensIn: number;
  tokensOut: number;
  model: string; // the id the provider reports it used
}

export interface Completer {
  readonly provider: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

const isAnthropic = (m: string) => m.startsWith("claude-") || m.startsWith("anthropic/");

let openrouter: OpenRouterCompleter | undefined;
let anthropic: AnthropicCompleter | undefined;

// Pick a provider for a model. OpenRouter (one key, every provider — ids and
// pricing already match the catalog) is preferred when configured; otherwise the
// direct Anthropic client handles `claude-*`. null when nothing can run it.
export function getCompleter(model: string): Completer | null {
  if (process.env.OPENROUTER_API_KEY) return (openrouter ??= new OpenRouterCompleter());
  if (process.env.ANTHROPIC_API_KEY && isAnthropic(model)) return (anthropic ??= new AnthropicCompleter());
  return null;
}

// Is any model provider configured at all? (Gate for --apply / learn.)
export function hasProvider(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY);
}

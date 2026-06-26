# Changelog

## 0.1.1

- Fix the ast-grep native-binding loader to use the correct per-platform package
  names (Linux `…-gnu`/`…-musl`, Windows `…-msvc`), so installs and CI work off
  macOS. Degrades gracefully (no ast-grep findings) if the binding is absent.
- CI: GitHub Actions runs typecheck + tests on push/PR (test timeout raised to
  30s for the tsc-spawning apply-loop tests).

## 0.1.0

First release. The full clinic loop — triage → diagnose → treat → bill — plus the
retroactive audit, the amortization engine, provider-agnostic pricing, and an
advisory mode for running inside a harness.

### Commands
- `audit <logs.jsonl>` — retroactive audit over past LLM call logs; reports the
  eliminable-class fraction (eliminable / routable / essential) and what the
  clinic loop would have saved.
- `scan [path]` — read-only pre-flight: type-check + promoted local rules,
  partition into local ($0) / model lanes, print an EOB with a savings
  counterfactual. Writes a `.tokenclinic/` Health Record.
- `scan [path] --json` — machine report for a host agent (no model call):
  findings + tight context packets + recommended routing + `advice`.
- `scan [path] --apply` — live: fix each escalation with the routed model
  (structured-output patch), then re-run the checker to verify. Reverts any patch
  that makes things worse. Needs `ANTHROPIC_API_KEY`.
- `learn [path]` — amortize a recurring class into a deterministic ast-grep rule
  (validated against generated fixtures before promotion); promoted rules then run
  on-device for $0 forever. Needs `ANTHROPIC_API_KEY`.

### Pricing
- Resolves through llm-intel (the OpenRouter catalog → any provider) with a
  committed offline snapshot fallback. Unknown models are surfaced, never priced
  with a fabricated number. Routing is declarative via `.tokenclinic/routing.json`.

### Harness
- Ships a Claude Code skill (`skill/token-clinic/`) that runs `scan --json` as a
  pre-flight gate so the host agent fixes from the packets with its own model.

### Notes
- Runtime: Bun. The type checker (`tsc`) is invoked at runtime, so `typescript` is
  a runtime dependency.
- `--apply` and `learn` require an Anthropic API key; everything else is free and
  offline-capable.

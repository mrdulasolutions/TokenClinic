# 🩺 Token Clinic

A pre-flight gate for coding agents. It runs cheap, deterministic analysis **on-device** before any model touches your code, routes only the irreducible work to the right-priced model, and prints a bill showing what you saved.

> Thesis: most tokens in agentic coding are wasted having an expensive model rediscover what a cheap deterministic tool already knows. **Don't pay Opus to find a missing import.**

## The clinic loop

| Stage | What it does |
| --- | --- |
| **Triage** | Detect deps, run on-device analyzers (v1: `tsc`), normalize everything into one `Finding` schema, rank by signal. Most findings die here, for $0. |
| **Diagnose** | Partition findings: autofixable → handled locally; `needs-llm` → escalated with a *tight context packet* (the relevant lines, not the whole repo). |
| **Treat** | Route each escalated fix by difficulty: mechanical → Haiku, semantic → Sonnet, architectural → Opus. Apply, then re-run the source check — a fix isn't done until it verifies. |
| **Bill (EOB)** | Cost per fix + savings vs. the naive "dump the file at a top model" baseline. The screenshot-able receipt. |

## Try it

```bash
bun install
bun run demo      # scans fixtures/sample-repo
# or point it anywhere:
bun run src/cli.ts scan /path/to/a/ts/project
```

Example output:

```
🩺 Token Clinic — fixtures/sample-repo
   node project · 1 deps · 5 findings

  ● TS2322 [semantic→sonnet-4-6] Type 'number' is not assignable to type 'string'.
  ● TS6133 [local]               'unused' is declared but its value is never read.
  ● TS2304 [mechanical→haiku-4-5] Cannot find name 'radius'.
  ...

  Explanation of Benefits (estimated — LLM step stubbed)
    5 findings
    1 fixed on-device   · $0.00
    4 escalated to a model
  clinic spend   $0.0093
  naive cost     $0.12  (dump each file at the top model)
  saved ~$0.11  (92% cheaper)
```

## What's real vs. stubbed in v1

**Real:** dep detection, `tsc` analysis + normalization, partition/routing, context-packet assembly, the Health Record, and every token count (chars/4 estimate over real code).

**Stubbed (clearly flagged):**
- The LLM fix itself — `DryRunFixer` estimates cost from real packet tokens but does not call a model or mutate files. The EOB is marked `estimated`. Drop in an `AnthropicFixer` (apply patch → re-run check → set `verified`) to make it live.
- Pricing — `src/pricing/table.ts` holds placeholder rates; it's the integration seam for [llm-intel](https://github.com/basisoasis/llm-intel).

## The Codebase Health Record

Each run writes `.tokenclinic/` into the scanned repo: `profile.json` (deps + analyzers) and an append-only `history.jsonl` (findings, spend, savings over time). v2 adds `rules/`, `quarantine/`, and `routing.json`. Every run reads it back, so every run gets cheaper and smarter — this is the compounding asset, not the router.

## Roadmap

- **v1 (here):** Triage + local autofix lane + escalation estimate + EOB + Health Record. One language (TS).
- **v2 — amortization:** when a `needs-llm` class recurs (≥3×), spend *one* model call to synthesize a deterministic check **as data, not code** — a text pattern via [fff](https://github.com/dmtrKovalenko/fff) (fast lane) or a structural rule via [ast-grep](https://ast-grep.github.io/) — validated against generated fixtures before promotion. That class is then $0 forever. fff also upgrades Diagnose-stage retrieval.
- **v3 — routing + distribution:** learned per-codebase routing (`routing.json`), live pricing via llm-intel, and a Claude Code skill wrapper that inserts the gate pre-edit.

## Architecture

```
src/
  types.ts            # Finding / EOB — the records every stage shares
  detect/deps.ts      # dependency profile
  triage/             # analyzers → normalized Finding[]
  diagnose/           # partition + context-packet assembly
  treat/              # model routing + the Fixer seam
  bill/eob.ts         # cost accounting + savings counterfactual
  record/health.ts    # the .tokenclinic/ Health Record
  cli.ts              # `tokenclinic scan` — wires the loop together
```

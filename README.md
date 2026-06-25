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

## Two commands, two moves

Token Clinic ships the strategically-correct **first move** (the retroactive audit) and the **recurring product** (the live scan):

```bash
bun install

# Approach A — measure the thesis from logs you already have ($0 risk, no code read)
bun run demo:audit                                  # audits fixtures/sample-logs.jsonl
bun run src/cli.ts audit /path/to/your-llm-calls.jsonl

# Approach B — pre-flight scan of a repo (read-only, estimated EOB)
bun run demo                                        # scans fixtures/sample-repo
bun run src/cli.ts scan /path/to/a/ts/project

# Approach B, live — actually fix + verify (needs ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-ant-... bun run src/cli.ts scan /path/to/project --apply
```

### `audit` — the retroactive audit (Approach A)

Run before building anything live. Ingests a JSONL of past LLM calls and prints the EOB **backwards** — what you spent, the *eliminable-class fraction* (the whole bet), and what the clinic loop would have saved. Runs entirely on exported logs, so there's no autofix risk and no code leaves the machine.

```
🩺 Token Clinic — retroactive audit · fixtures/sample-logs.jsonl
   12 calls · $0.59 spent (estimated — some calls bucketed heuristically)

  ● eliminable   6 calls    $0.26  44% of spend · killed on-device → $0
  ● routable     3 calls    $0.07  12% of spend · re-priced to cheapest tier
  ● essential    3 calls    $0.26  44% of spend · real reasoning → unchanged

  eliminable-class fraction  44%  (clearly large — build it)
  projected spend            $0.27 under the clinic loop
  would have saved ~$0.31  (54% cheaper)
```

Log format is one JSON object per line: `{ "model", "inputTokens", "outputTokens", "task"?, "category"? }`. A `category` is authoritative; without one, the call is bucketed heuristically from `task` and the audit is flagged `estimated`.

### `scan` — the live pre-flight gate (Approach B)

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

## Two fix modes

`scan` is read-only and free; `scan --apply` is the live loop.

- **`scan`** (default) — `DryRunFixer` estimates each escalation's cost from the real packet token count but does **not** call a model or touch files. The EOB is flagged `estimated`. Zero risk, zero spend.
- **`scan --apply`** — `AnthropicFixer` ([`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript)) sends each tight packet to the routed model (Haiku/Sonnet/Opus), gets a corrected snippet via **structured output**, writes it, then **re-runs `tsc` to verify the finding is gone**. It loops — re-triaging each pass so line shifts are handled — until no escalatable findings remain. Costs are **exact**, from the API's `usage`; the EOB reads `(actual)`. Needs `ANTHROPIC_API_KEY` (it refuses cleanly without one).

## What's real vs. still stubbed

**Real:** dep detection, `tsc` analysis + normalization, partition/routing, context-packet assembly, the Health Record, the `--apply` fix-and-verify loop, and — in `--apply` — exact token costs from the API.

**Still stubbed / placeholder:**
- Token *estimates* in read-only `scan` use chars/4 (real exact counts only arrive on `--apply`).
- Pricing — `src/pricing/table.ts` holds placeholder rates; it's the integration seam for [llm-intel](https://github.com/basisoasis/llm-intel).
- Local autofix (the `[local]` lane) is still reported, not yet applied — that codemod path is v2.

## The Codebase Health Record

Each run writes `.tokenclinic/` into the scanned repo: `profile.json` (deps + analyzers) and an append-only `history.jsonl` (findings, spend, savings over time). v2 adds `rules/`, `quarantine/`, and `routing.json`. Every run reads it back, so every run gets cheaper and smarter — this is the compounding asset, not the router.

## Roadmap

Sequenced A → B → C, per the [office-hours design](docs/) — measure before you build, sell the receipt, price the moat last.

- **A — the audit (here):** `tokenclinic audit` over existing logs. Puts a real dollar number on the unverified core thesis (the eliminable-class fraction) with zero code and zero risk. Earns revenue as a paid/concierge audit. **Gate:** fraction clearly large (>40%) → build B; clearly small (<15%) → walk away.
- **B — the live scan (here):** `tokenclinic scan` — Triage + local autofix lane + escalation estimate + verify + EOB + Health Record. One language (TS). The recurring product, distributed as a self-controlled CLI (npm + GitHub Releases) — not an integration into harnesses you don't own.
- **C — sell the moat (later):** open-core. Triage + receipt is the free funnel; charge for the compounding **Health Record** (promoted rules + fixtures + learned routing), shared team-wide.

### Inside B: the amortization engine (v2)

When a `needs-llm` class recurs (≥3×), spend *one* model call to synthesize a deterministic check **as data, not code** — a text pattern via [fff](https://github.com/dmtrKovalenko/fff) (fast lane) or a structural rule via [ast-grep](https://ast-grep.github.io/) — validated against generated fixtures before promotion. That class is then $0 forever. fff also upgrades Diagnose-stage retrieval. This only holds for *eliminable* (bucket-1) findings; *routable* (bucket-2) tacit-judgment work is routed cheaper, never eliminated.

## Architecture

```
src/
  types.ts            # Finding / EOB / CallRecord — the records every stage shares
  pricing/table.ts    # model prices (llm-intel seam) + token estimate
  audit/              # Approach A: log ingest + bucket classifier + backwards EOB
  detect/deps.ts      # dependency profile
  triage/             # analyzers → normalized Finding[]
  diagnose/           # partition + context-packet assembly
  treat/              # model routing + Fixer seam (DryRun estimate / Anthropic live)
  bill/eob.ts         # cost accounting + savings counterfactual
  record/health.ts    # the .tokenclinic/ Health Record
  cli.ts              # `tokenclinic audit` + `scan` — wires the loops together
docs/
  design-token-clinic.md   # the office-hours strategy (A → B → C)
```

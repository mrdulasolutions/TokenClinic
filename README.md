# 🩺 Token Clinic

[![npm](https://img.shields.io/npm/v/tokenclinic)](https://www.npmjs.com/package/tokenclinic)
[![CI](https://github.com/mrdulasolutions/TokenClinic/actions/workflows/ci.yml/badge.svg)](https://github.com/mrdulasolutions/TokenClinic/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/tokenclinic)](LICENSE)

**Stop paying a premium model to find a missing import.**

Token Clinic is a pre-flight gate for coding agents. It runs cheap, deterministic checks **on your machine** first, fixes for free what it can, sends only the genuinely-hard problems to a model — at the right price tier — and prints a receipt showing what you saved.

> Most tokens in agentic coding are wasted having an expensive model rediscover what a cheap local tool already knows. Token Clinic does the cheap part locally and only pays for the rest.

---

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
  - [`scan` — see what's wrong, for free](#scan--see-whats-wrong-for-free)
  - [`scan --apply` — fix it](#scan---apply--fix-it)
  - [`audit` — should you even bother?](#audit--should-you-even-bother)
  - [`learn` — make a fix free forever](#learn--make-a-fix-free-forever)
  - [`scan --json` — use it inside an agent](#scan---json--use-it-inside-an-agent)
- [Use it in Claude Code](#use-it-in-claude-code)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Development](#development)
- [Background & design](#background--design)

---

## Install

Token Clinic runs on [Bun](https://bun.sh) (v1+).

```bash
npm install -g tokenclinic    # or: bun add -g tokenclinic
```

Then run it anywhere:

```bash
tokenclinic scan ./my-project
```

No install? Use `npx`:

```bash
npx tokenclinic scan ./my-project
```

**What needs an API key:** `scan` (including `--json`) and `audit` are free and run offline. Only `scan --apply` and `learn` actually call a model — those need `ANTHROPIC_API_KEY`.

> **Scope today:** the live analyzers cover **TypeScript/JavaScript** (via the TypeScript compiler) plus any promoted ast-grep rules. Analyzers are a registry — adding Python/Rust/etc. is adding one entry (a `detect` + a `run`), the rest of the pipeline is language-agnostic. `audit` is already language-agnostic (it reads logs, not code).

---

## Quick start

```bash
# 1. See what's wrong in a TypeScript project — free, nothing leaves your machine
tokenclinic scan ./my-project

# 2. Let it fix the real problems with the right-priced model
export ANTHROPIC_API_KEY=sk-ant-...
tokenclinic scan ./my-project --apply
```

`scan` prints findings and a bill:

```text
🩺 Token Clinic — my-project
   node project · 14 deps · 5 findings · prices: llm-intel

  ● TS2322 [semantic→sonnet-4-6] Type 'number' is not assignable to type 'string'.
     src/index.ts:4
  ● TS6133 [local] 'unused' is declared but its value is never read.
     src/index.ts:5
  ● TS2304 [mechanical→haiku-4-5] Cannot find name 'radius'.
     src/index.ts:8
  ● TS2339 [semantic→sonnet-4-6] Property 'email' does not exist on type 'User'.
     src/index.ts:16

  Explanation of Benefits (estimated — LLM step stubbed)
    5 findings
    1 fixed on-device   · $0.00
    4 escalated to a model
      → claude-sonnet-4-6    2× $0.0070
      → claude-haiku-4-5     2× $0.0023
  clinic spend   $0.0093
  naive cost     $0.04 (dump each file at the top model)
  saved ~$0.03  (77% cheaper)
```

Read it like this:
- **`[local]`** findings are fixed on your machine for **$0** — a model never sees them.
- **`[mechanical→haiku-4-5]` / `[semantic→sonnet-4-6]`** are escalated to the *cheapest model that can handle that difficulty*.
- The **clinic spend vs. naive cost** line is the point: what you'd pay with Token Clinic vs. throwing whole files at a top model.

---

## Commands

### `scan` — see what's wrong, for free

Read-only. Runs the type checker plus any local rules, sorts findings into a `local` ($0) lane and a `model` lane, and estimates the cost. **Calls nothing, changes nothing.**

```bash
tokenclinic scan ./my-project
```

Use it to preview the work and the savings before spending anything.

### `scan --apply` — fix it

The live loop. For each escalated finding it sends a *tight packet* (the relevant lines, not the whole repo) to the routed model, gets a corrected snippet back, writes it, then **re-runs the type checker to confirm the error is gone**. A patch that makes things worse is automatically reverted. Costs shown are exact (from the API's usage).

```bash
export ANTHROPIC_API_KEY=sk-ant-...
tokenclinic scan ./my-project --apply
```

Refuses cleanly if no key is set — run plain `scan` for the free estimate instead.

### `audit` — should you even bother?

Point it at a log of your past LLM calls and it prints the bill **backwards**: how much you spent, and how much of it was "eliminable" — work a local tool could have done for $0. Runs entirely on the exported logs; **no code leaves your machine.**

```bash
tokenclinic audit ./my-llm-calls.jsonl
```

```text
🩺 Token Clinic — retroactive audit · my-llm-calls.jsonl
   12 calls · $0.20 spent · prices: llm-intel

  ● eliminable   6 calls    $0.09  42% of spend · killed on-device → $0
  ● routable     3 calls    $0.05  24% of spend · re-priced to cheapest tier
  ● essential    3 calls    $0.07  34% of spend · real reasoning → unchanged

  eliminable-class fraction  42%  (clearly large — build it)
  projected spend            $0.08 under the clinic loop
  would have saved ~$0.12  (59% cheaper)
```

**Log format** — one JSON object per line (JSONL):

```jsonc
{ "model": "claude-opus-4-8", "inputTokens": 1500, "outputTokens": 250, "task": "add missing import", "category": "import" }
```

`model`, `inputTokens`, `outputTokens` are required. `category` (e.g. `import`, `lint`, `refactor`, `design`) is authoritative when present; otherwise the call is bucketed heuristically from `task` and the audit is flagged `estimated`.

### `learn` — make a fix free forever

When the same kind of problem keeps getting escalated, `learn` spends **one** model call to write a deterministic [ast-grep](https://ast-grep.github.io/) rule that catches it — then validates that rule against generated test fixtures before trusting it. Once promoted, that rule runs locally in every future `scan` for **$0**. Pay once, run free.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
tokenclinic learn ./my-project
```

Promoted rules are written to `.tokenclinic/rules/` (commit them — they're a shared asset). Rules that fail their fixtures are quarantined, never run.

### `scan --json` — use it inside an agent

Same read-only scan, emitted as a machine-readable report instead of a pretty table. **No model call.** A host agent (see below) reads the `advice` and does the fixes with its own model.

```bash
tokenclinic scan ./my-project --json
```

```jsonc
{
  "eob": { "fixedLocally": 1, "escalated": 4, "saved": 0.032, ... },
  "advice": {
    "autoApply": ["<ids of free local-lane findings>"],
    "escalate":  [{ "id": "...", "file": "src/x.ts", "line": 4, "recommendedModel": "claude-sonnet-4-6" }]
  },
  "findings": [ { "rule": "TS2322", "lane": "model", "context": { "snippet": "...", "startLine": 1 }, ... } ]
}
```

---

## Use it in Claude Code

Inside a coding agent like Claude Code, **the harness already owns the model, the key, and the bill** — so Token Clinic shouldn't make its own calls there. Instead it runs as an advisory pre-flight gate: it does the free local elimination and hands the agent a tight packet for each remaining problem, and the agent fixes them with its own model.

A ready-to-use skill ships in [`skill/token-clinic/SKILL.md`](skill/token-clinic/SKILL.md). Drop it into your Claude Code skills directory and the agent will run `tokenclinic scan --json` before any fix pass and act on the `advice` — fixing real problems from the packets instead of crawling your repo to rediscover them.

---

## Configuration

### API keys

Only `scan --apply` and `learn` call a model. They accept either provider:

- **`OPENROUTER_API_KEY`** — recommended. One key routes to **any** provider/model (OpenAI, Google, Anthropic, Llama, …) through [OpenRouter](https://openrouter.ai), using the same ids the pricing catalog uses.
- **`ANTHROPIC_API_KEY`** — used directly for `claude-*` models when OpenRouter isn't set.

Everything else (`scan`, `scan --json`, `audit`) works with no key at all.

### Pricing (and other providers)

Prices come from [llm-intel](https://github.com/basisoasis/llm-intel) (the OpenRouter catalog — every provider) at startup, with a built-in **offline snapshot** so `scan` never *requires* network. The footer shows which was used: `prices: llm-intel` or `prices: snapshot`. An unknown model is flagged, never priced with a made-up number.

### Custom routing / other models — `.tokenclinic/routing.json`

By default, fixes route by difficulty to Anthropic models (mechanical → Haiku, semantic → Sonnet, architectural → Opus). Override per class with **any** model id, including other providers:

```json
{
  "mechanical": "claude-haiku-4-5",
  "semantic": "openai/gpt-4o",
  "architectural": "claude-opus-4-8"
}
```

Pricing **and the live calls** resolve whatever you configure: with `OPENROUTER_API_KEY` set, `--apply`/`learn` route any model through OpenRouter; otherwise `claude-*` models go through the Anthropic SDK directly.

### The Health Record — `.tokenclinic/`

Each run writes a `.tokenclinic/` directory into the scanned repo:

- `profile.json` — detected deps + analyzers
- `history.jsonl` — findings, spend, and savings over time
- `rules/` — promoted local rules (commit these)
- `quarantine/` — generated rules that failed validation

Every run reads it back, so the more you use Token Clinic on a repo, the cheaper and sharper it gets. Add the throwaway parts to your `.gitignore` if you like, but **keep `rules/`** — that's the compounding asset:

```gitignore
.tokenclinic/history.jsonl
.tokenclinic/profile.json
.tokenclinic/quarantine/
```

---

## How it works

Four stages, one record (`Finding`) flowing through each:

| Stage | What it does |
| --- | --- |
| **Triage** | Run on-device analyzers (the TypeScript compiler + your promoted rules), normalize everything into one finding list. Most findings die here, for $0. |
| **Diagnose** | Split findings into the local ($0) lane and the model lane; for the model lane, assemble a *tight context packet* — the relevant lines, not the whole repo. |
| **Treat** | Route each escalation to the cheapest model that can handle its difficulty, apply the fix, then re-run the checker to verify. Revert anything that makes it worse. |
| **Bill** | Print the receipt: cost per fix and savings vs. dumping whole files at a top model. |

---

## Development

```bash
git clone https://github.com/mrdulasolutions/TokenClinic.git
cd TokenClinic
bun install

bun test          # run the test suite
bun run typecheck # tsc --noEmit
bun run demo      # scan the sample project
bun run demo:audit
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: see [SECURITY.md](SECURITY.md).

---

## Background & design

Token Clinic was built command-by-command in a deliberate sequence — measure demand with `audit` before building the live loop, then add the amortization moat. The full product reasoning lives in [`docs/design-token-clinic.md`](docs/design-token-clinic.md). Changelog: [`CHANGELOG.md`](CHANGELOG.md).

## License

[MIT](LICENSE) © mrdulasolutions

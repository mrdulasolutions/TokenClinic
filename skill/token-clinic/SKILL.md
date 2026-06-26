---
name: token-clinic
description: >-
  Pre-flight gate before editing code. Runs cheap on-device analysis first and
  returns high-signal findings with tight context packets, so the model fixes
  real problems instead of crawling the repo to rediscover them. Use BEFORE
  starting a fix/refactor/cleanup pass on a TypeScript project, or when asked to
  "clean up", "fix the errors", "lint", or "tighten up" a codebase.
---

# Token Clinic — pre-flight gate

Token Clinic does the cheap, deterministic work on-device *before* you spend
model tokens: it runs the type checker plus the repo's promoted local rules,
eliminates what it can for $0, and hands you a tight packet for each remaining
problem. **It does not call a model — you do the reasoning fixes, with your own
model, from the packets it gives you.** That's the point: don't pay a premium
model to find a missing import a local tool already found.

## When to use

Before any multi-file fix, refactor, lint, or "clean this up" pass on a
TypeScript project. Run it first; act on its output; don't re-derive its findings.

## How to run

```bash
tokenclinic scan <path> --json
```

(If `tokenclinic` isn't on PATH, run from the repo: `bun run /path/to/TokenClinic/src/cli.ts scan <path> --json`.)

This prints a JSON report and **makes no API calls**. Parse it and act on `advice`.

## What the report means

```jsonc
{
  "eob": { "fixedLocally": 1, "escalated": 4, "saved": 0.11, ... }, // the receipt
  "findings": [
    {
      "rule": "TS2322", "file": "src/x.ts", "line": 4,
      "lane": "model",                  // "local" = $0 cleanup; "model" = needs you
      "recommendedModel": "claude-sonnet-4-6",
      "context": { "snippet": "...the relevant lines...", "startLine": 1 }
    }
  ],
  "advice": {
    "autoApply": ["<ids of local-lane findings>"],
    "escalate":  [{ "id": "...", "file": "...", "line": 4, "recommendedModel": "..." }]
  }
}
```

## What to do with it

1. **`advice.escalate` is your work list.** Fix each one using its `context.snippet`
   — do **not** open and re-read the whole file or crawl the repo; the packet is
   the context you need. The `recommendedModel` tells you how hard Token Clinic
   judged the fix (mechanical → cheap, semantic → mid, architectural → top); use
   it to calibrate effort, not to switch models mid-session.
2. **`advice.autoApply` (the `local` lane)** are $0 mechanical/promoted-rule hits.
   Apply them directly if trivial and in scope; otherwise mention them — they don't
   warrant deep reasoning.
3. **Report the `eob`** (e.g. "41 fixed locally for $0, 6 escalated, ~$0.40 saved
   vs. crawling the repo") so the user sees what the pre-flight saved.
4. **Re-run `scan --json` after your fixes** to confirm the findings are gone.

## Notes

- `scan` and `--json` are read-only and free; they never call a model.
- For a recurring class of finding, `tokenclinic learn <path>` (needs an API key)
  amortizes it into a local rule so it's caught for $0 on every future scan.
- Standalone (outside this harness) `tokenclinic scan <path> --apply` will do the
  fixes itself with its own key — but inside a harness, prefer `--json` and fix
  with your own model, so spend and credentials stay on the harness's account.

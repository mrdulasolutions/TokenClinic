# Contributing to Token Clinic

Thanks for your interest! Contributions of all sizes are welcome — bug reports, docs, tests, and code.

## Getting set up

Token Clinic runs on [Bun](https://bun.sh) (v1+).

```bash
git clone https://github.com/mrdulasolutions/TokenClinic.git
cd TokenClinic
bun install
```

## Before you open a PR

Run both of these and make sure they pass:

```bash
bun run typecheck   # tsc --noEmit — must be clean
bun test            # the full suite — must be green
```

CI runs exactly these on every push and pull request, so a green local run means a green CI run.

## How the code is organized

Each stage of the "clinic loop" is a small module under `src/` — see the **How it works** and module layout in the [README](README.md). The short version:

- `triage/` — analyzers that produce a normalized `Finding[]`
- `diagnose/` — partition findings + assemble context packets
- `treat/` — model routing and the fix loop
- `bill/` — cost accounting
- `amortize/` — synthesize/validate/promote local rules
- `pricing/` — llm-intel adapter + offline snapshot
- `scan.ts`, `cli.ts` — assembly and the command surface

Every `Finding` flows through these stages unchanged — adding an analyzer or a fixer means adding to a list, not rewriting the pipeline.

## Guidelines

- **Add a test** for any behavior change. Deterministic units (parsing, classification, pricing, validation) and the apply loop (via the injectable fixer) are all testable without an API key — follow the patterns in `test/`.
- **Keep changes surgical.** Match the surrounding style; don't reformat or refactor unrelated code in the same PR.
- **Be honest in output.** A core principle: never show a fabricated number. Unknown prices surface as unknown; estimates are labeled as estimates.
- **No secrets in code or tests.** Anything that calls a model is gated behind `ANTHROPIC_API_KEY`.

## Commit & PR

- Write a clear commit message describing *what* changed and *why*.
- Reference any related issue.
- Small, focused PRs are easier to review and land faster.

## Reporting bugs / requesting features

Use the [issue templates](https://github.com/mrdulasolutions/TokenClinic/issues/new/choose). For security issues, **do not** open a public issue — see [SECURITY.md](SECURITY.md).

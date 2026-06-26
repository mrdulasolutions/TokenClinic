# Security Policy

## Supported versions

Token Clinic is pre-1.0. Security fixes are applied to the latest published `0.x` release on npm.

| Version | Supported |
| ------- | --------- |
| latest `0.x` | ✅ |
| older | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via one of:

- GitHub's [private vulnerability reporting](https://github.com/mrdulasolutions/TokenClinic/security/advisories/new) (preferred), or
- email **matt@mrdula.solutions**

Include: a description, steps to reproduce, affected version, and impact. You'll get an acknowledgement, and a fix or mitigation plan once the report is confirmed.

## Good to know

- `scan`, `scan --json`, and `audit` are read-only and make **no network model calls** — `audit` never reads your source, only the call log you pass it.
- `scan --apply` and `learn` send tight code snippets to the configured model provider (Anthropic by default) using **your** `ANTHROPIC_API_KEY`. Token Clinic does not store, log, or transmit your key anywhere else.
- Generated rules are validated against fixtures before they're ever executed; rules that fail validation are quarantined, never run.

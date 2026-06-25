#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import type { Finding, EOB, AuditResult, Bucket } from "./types";
import { detectDeps } from "./detect/deps";
import { triage } from "./triage";
import { partition } from "./diagnose/partition";
import { buildContext } from "./diagnose/context";
import { DryRunFixer } from "./treat/fixer";
import { AnthropicFixer } from "./treat/anthropic";
import { buildEOB } from "./bill/eob";
import { writeHealthRecord } from "./record/health";
import { parseLog, audit } from "./audit/audit";
import { c, usd } from "./util";

// ── scan (Approach B): read-only pre-flight, estimated EOB ──────────────────
async function scan(target: string) {
  const root = resolve(target);
  const now = new Date().toISOString();

  const deps = detectDeps(root);
  const findings = partition(triage(root));

  const fixer = new DryRunFixer();
  for (const f of findings) {
    if (f.fixability !== "needs-llm") continue;
    f.context = buildContext(root, f);
    f.resolution = (await fixer.fix(f)).resolution;
  }

  const eob = buildEOB(root, findings, true);
  const recordDir = writeHealthRecord(root, deps, findings, eob, now);

  const where = relative(process.cwd(), root) || ".";
  console.log(`\n${c.bold("🩺 Token Clinic")} ${c.dim(`— ${where}`)}`);
  console.log(c.dim(`   ${deps.manager} project · ${Object.keys(deps.deps).length} deps · ${findings.length} findings\n`));
  for (const f of findings) printFinding(f);
  printEOB(eob);
  console.log(c.dim(`  health record → ${relative(process.cwd(), recordDir)}/\n`));
}

// ── scan --apply (Approach B, live): iterative fix + verify ─────────────────
// Each pass re-triages, so line shifts from prior edits are handled correctly;
// a fix is verified only when its finding is gone on the next triage.
const MAX_PASSES = 25;

async function scanApply(target: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`${c.red("scan --apply needs a model")} — set ANTHROPIC_API_KEY, then re-run.`);
    console.log(c.dim("  (without it, run plain `tokenclinic scan` for the estimated EOB.)"));
    process.exit(1);
  }

  const root = resolve(target);
  const now = new Date().toISOString();
  const deps = detectDeps(root);
  const before = partition(triage(root));

  const fixer = new AnthropicFixer();
  const attempted = new Set<string>();
  const fixed: Finding[] = [];

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const target_ = partition(triage(root)).find(
      (f) => f.fixability === "needs-llm" && !attempted.has(f.id),
    );
    if (!target_) break;
    attempted.add(target_.id);

    target_.context = buildContext(root, target_);
    const { resolution, newSnippet } = await fixer.fix(target_);
    if (newSnippet !== undefined) applySnippet(root, target_, newSnippet);

    resolution.patched = true;
    resolution.verified = !partition(triage(root)).some((f) => f.id === target_.id);
    target_.resolution = resolution;
    fixed.push(target_);
    console.log(
      `  ${resolution.verified ? c.green("✓") : c.yellow("✗")} ${c.bold(target_.rule)} ` +
        `${c.dim(`${target_.file}:${target_.line}`)} → ${resolution.model.replace("claude-", "")} ${c.dim(usd(resolution.cost))}`,
    );
  }

  // EOB: real costs from `fixed`, plus the locally-fixable / ignored buckets from `before`.
  const reported = [...before.filter((f) => f.fixability !== "needs-llm"), ...fixed];
  const eob = buildEOB(root, reported, false);
  const recordDir = writeHealthRecord(root, deps, reported, eob, now);

  const verified = fixed.filter((f) => f.resolution?.verified).length;
  console.log(`\n${c.bold("🩺 Token Clinic")} ${c.dim(`— applied ${verified}/${fixed.length} fixes verified`)}\n`);
  printEOB(eob);
  console.log(c.dim(`  health record → ${relative(process.cwd(), recordDir)}/\n`));
}

function applySnippet(root: string, f: Finding, newSnippet: string) {
  const path = join(root, f.file);
  const lines = readFileSync(path, "utf8").split("\n");
  const start = (f.context?.startLine ?? f.line) - 1;
  const oldCount = (f.context?.snippet ?? "").split("\n").length;
  lines.splice(start, oldCount, ...newSnippet.split("\n"));
  writeFileSync(path, lines.join("\n"));
}

// ── shared rendering ────────────────────────────────────────────────────────
function printFinding(f: Finding) {
  const sev = f.severity === "error" ? c.red("●") : c.yellow("●");
  console.log(`  ${sev} ${c.bold(f.rule)} ${laneTag(f)} ${f.message}`);
  console.log(`     ${c.dim(`${f.file}:${f.line}`)}`);
}

function laneTag(f: Finding): string {
  if (f.fixability === "autofix") return c.green("[local]");
  if (f.fixability === "ignore") return c.dim("[ignore]");
  return c.cyan(`[${f.difficulty}→${f.resolution?.model.replace("claude-", "") ?? "?"}]`);
}

function printEOB(eob: EOB) {
  const flag = eob.estimated ? c.dim(" (estimated — LLM step stubbed)") : c.dim(" (actual)");
  console.log(`${c.bold("  Explanation of Benefits")}${flag}`);
  console.log(c.dim("  ─────────────────────────────────────────"));
  console.log(`  ${String(eob.total).padStart(3)} findings`);
  console.log(`  ${c.green(String(eob.fixedLocally).padStart(3))} fixed on-device   ${c.dim("· $0.00")}`);
  console.log(`  ${c.cyan(String(eob.escalated).padStart(3))} escalated to a model`);
  for (const [model, m] of Object.entries(eob.byModel)) {
    if (model === "local") continue;
    console.log(`      ${c.dim("→")} ${model.padEnd(20)} ${m.count}× ${c.dim(usd(m.cost))}`);
  }
  console.log(c.dim("  ─────────────────────────────────────────"));
  console.log(`  clinic spend   ${c.bold(usd(eob.spend))}`);
  console.log(`  naive cost     ${c.dim(usd(eob.naiveCost))} ${c.dim("(dump each file at the top model)")}`);
  console.log(`  ${c.green(c.bold(`saved ~${usd(eob.saved)}`))}  ${c.dim(`(${pct(eob.saved, eob.naiveCost)} cheaper)`)}\n`);
}

const pct = (saved: number, base: number) => (base > 0 ? `${Math.round((saved / base) * 100)}%` : "0%");

// ── audit (Approach A): retroactive audit over existing call logs ────────────
function runAudit(logPath: string | undefined) {
  if (!logPath) {
    console.log("usage: tokenclinic audit <logs.jsonl>");
    process.exit(1);
  }
  const calls = parseLog(resolve(logPath));
  reportAudit(relative(process.cwd(), resolve(logPath)), audit(calls));
}

const BUCKET_LABEL: Record<Bucket, (s: string) => string> = {
  eliminable: c.green,
  routable: c.cyan,
  essential: c.dim,
};
const BUCKET_NOTE: Record<Bucket, string> = {
  eliminable: "killed on-device → $0",
  routable: "re-priced to cheapest tier",
  essential: "real reasoning → unchanged",
};

function reportAudit(source: string, a: AuditResult) {
  console.log(`\n${c.bold("🩺 Token Clinic — retroactive audit")} ${c.dim(`· ${source}`)}`);
  const flag = a.estimated ? c.dim(" (estimated — some calls bucketed heuristically)") : "";
  console.log(c.dim(`   ${a.calls} calls · ${usd(a.spend)} spent${flag}\n`));

  for (const bucket of ["eliminable", "routable", "essential"] as Bucket[]) {
    const b = a.byBucket[bucket];
    const share = a.spend > 0 ? Math.round((b.spend / a.spend) * 100) : 0;
    const paint = BUCKET_LABEL[bucket];
    console.log(
      `  ${paint("●")} ${paint(bucket.padEnd(11))} ${String(b.count).padStart(2)} calls  ` +
        `${usd(b.spend).padStart(8)}  ${c.dim(`${String(share).padStart(2)}% of spend · ${BUCKET_NOTE[bucket]}`)}`,
    );
  }

  const frac = Math.round(a.eliminableFraction * 100);
  const verdict = frac >= 40 ? c.green("clearly large — build it") : frac < 15 ? c.yellow("clearly small — walk away") : c.yellow("murky — instrument deeper");
  console.log(c.dim("\n  ─────────────────────────────────────────"));
  console.log(`  eliminable-class fraction  ${c.bold(`${frac}%`)}  ${c.dim(`(${verdict})`)}`);
  console.log(`  projected spend            ${c.bold(usd(a.projectedSpend))} ${c.dim("under the clinic loop")}`);
  console.log(`  ${c.green(c.bold(`would have saved ~${usd(a.projectedSaved)}`))}  ${c.dim(`(${pct(a.projectedSaved, a.spend)} cheaper)`)}\n`);
}

// ── entry ────────────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const apply = rest.includes("--apply") || rest.includes("--fix");
const path = rest.find((a) => !a.startsWith("-"));

if (cmd === "scan") {
  await (apply ? scanApply(path ?? ".") : scan(path ?? "."));
} else if (cmd === "audit") {
  runAudit(path);
} else {
  console.log(
    "usage:\n" +
      "  tokenclinic audit <logs.jsonl>   retroactive audit over past LLM calls\n" +
      "  tokenclinic scan [path]          read-only pre-flight (estimated EOB)\n" +
      "  tokenclinic scan [path] --apply  live: fix + verify (needs ANTHROPIC_API_KEY)",
  );
  process.exit(1);
}

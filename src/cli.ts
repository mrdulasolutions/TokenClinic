#!/usr/bin/env bun
import { resolve, relative } from "node:path";
import type { Finding, EOB, AuditResult, Bucket } from "./types";
import { detectDeps } from "./detect/deps";
import { triage } from "./triage";
import { partition } from "./diagnose/partition";
import { assembleScan, toReport } from "./scan";
import { AnthropicFixer } from "./treat/anthropic";
import { runApplyLoop } from "./treat/apply";
import { loadRouting, routedModels } from "./treat/route";
import { loadPrices } from "./pricing/llmIntel";
import { cluster } from "./amortize/cluster";
import { synthesize } from "./amortize/synthesize";
import { promote } from "./amortize/promote";
import { buildEOB } from "./bill/eob";
import { writeHealthRecord } from "./record/health";
import { parseLog, audit } from "./audit/audit";
import { c, usd } from "./util";

// ── scan (Approach B): read-only pre-flight, estimated EOB ──────────────────
async function scan(target: string, json: boolean) {
  const root = resolve(target);
  const now = new Date().toISOString();

  loadRouting(root);
  const prices = await loadPrices(routedModels());
  const data = await assembleScan(root);
  const recordDir = writeHealthRecord(root, data.deps, data.findings, data.eob, now);

  if (json) {
    // The in-harness contract: emit findings + tight packets + recommended
    // routing for a host agent to act on. No model is called here.
    console.log(JSON.stringify(toReport(root, prices.source, data), null, 2));
    return;
  }

  const where = relative(process.cwd(), root) || ".";
  console.log(`\n${c.bold("🩺 Token Clinic")} ${c.dim(`— ${where}`)}`);
  console.log(c.dim(`   ${data.deps.manager} project · ${Object.keys(data.deps.deps).length} deps · ${data.findings.length} findings · prices: ${prices.source}\n`));
  for (const f of data.findings) printFinding(f);
  printEOB(data.eob);
  console.log(c.dim(`  health record → ${relative(process.cwd(), recordDir)}/\n`));
}

// ── scan --apply (Approach B, live): iterative fix + verify ─────────────────
async function scanApply(target: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`${c.red("scan --apply needs a model")} — set ANTHROPIC_API_KEY, then re-run.`);
    console.log(c.dim("  (without it, run plain `tokenclinic scan` for the estimated EOB.)"));
    process.exit(1);
  }

  const root = resolve(target);
  const now = new Date().toISOString();
  loadRouting(root);
  await loadPrices(routedModels());
  const deps = detectDeps(root);

  const { before, fixed } = await runApplyLoop(root, new AnthropicFixer());

  for (const f of fixed) {
    const ok = f.resolution?.verified;
    console.log(
      `  ${ok ? c.green("✓") : c.yellow("✗")} ${c.bold(f.rule)} ` +
        `${c.dim(`${f.file}:${f.line}`)} → ${f.resolution?.model.replace("claude-", "")} ${c.dim(usd(f.resolution?.cost ?? 0))}`,
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

// ── learn (v2): amortize recurring classes into local rules ─────────────────
const CLUSTER_MIN = 3;

async function learn(target: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`${c.red("learn needs a model")} — set ANTHROPIC_API_KEY, then re-run.`);
    process.exit(1);
  }

  const root = resolve(target);
  loadRouting(root);
  const findings = partition(triage(root));
  const clusters = cluster(findings, CLUSTER_MIN);

  console.log(`\n${c.bold("🩺 Token Clinic — learn")} ${c.dim(`— ${relative(process.cwd(), root) || "."}`)}`);
  if (clusters.length === 0) {
    console.log(c.dim(`   no needs-llm class recurs ≥${CLUSTER_MIN}× — nothing to amortize yet.\n`));
    return;
  }

  for (const cl of clusters) {
    process.stdout.write(`  synthesizing ${c.bold(cl.rule)} ${c.dim(`(${cl.findings.length}×)`)} … `);
    const rule = await synthesize(root, cl);
    if (!rule) {
      console.log(c.yellow("no usable rule returned"));
      continue;
    }
    const p = promote(root, rule);
    if (p.status === "promoted") {
      console.log(`${c.green("✓ promoted")} ${c.dim(`→ rules/${rule.id}.json — this class is now $0 forever`)}`);
    } else {
      console.log(`${c.yellow("⚠ quarantined")} ${c.dim(rule.id)}`);
      for (const f of p.failures) console.log(c.dim(`      ${f}`));
    }
  }
  console.log(c.dim(`\n  promoted rules run on every future ${c.bold("scan")} — re-run scan to see the new $0 lane.\n`));
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
async function runAudit(logPath: string | undefined) {
  if (!logPath) {
    console.log("usage: tokenclinic audit <logs.jsonl>");
    process.exit(1);
  }
  const calls = parseLog(resolve(logPath));
  const prices = await loadPrices(calls.map((c) => c.model)); // price against the log's own models
  reportAudit(relative(process.cwd(), resolve(logPath)), audit(calls), prices.source);
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

function reportAudit(source: string, a: AuditResult, priceSource: string) {
  console.log(`\n${c.bold("🩺 Token Clinic — retroactive audit")} ${c.dim(`· ${source}`)}`);
  const flag = a.estimated ? c.dim(" (estimated — some calls bucketed heuristically)") : "";
  console.log(c.dim(`   ${a.calls} calls · ${usd(a.spend)} spent · prices: ${priceSource}${flag}\n`));
  if (a.unpriced > 0) {
    console.log(c.yellow(`   ⚠ ${a.unpriced} call(s) had no known price — excluded from cost\n`));
  }

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
const json = rest.includes("--json");
const path = rest.find((a) => !a.startsWith("-"));

if (cmd === "scan") {
  if (apply) await scanApply(path ?? ".");
  else await scan(path ?? ".", json);
} else if (cmd === "audit") {
  await runAudit(path);
} else if (cmd === "learn") {
  await learn(path ?? ".");
} else {
  console.log(
    "usage:\n" +
      "  tokenclinic audit <logs.jsonl>   retroactive audit over past LLM calls\n" +
      "  tokenclinic scan [path]          read-only pre-flight (estimated EOB)\n" +
      "  tokenclinic scan [path] --json   machine report for a host agent (no model call)\n" +
      "  tokenclinic scan [path] --apply  live: fix + verify (needs ANTHROPIC_API_KEY)\n" +
      "  tokenclinic learn [path]         amortize recurring classes → local rules (needs key)",
  );
  process.exit(1);
}

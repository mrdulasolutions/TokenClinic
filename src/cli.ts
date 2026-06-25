#!/usr/bin/env bun
import { resolve, relative } from "node:path";
import type { Finding, EOB } from "./types";
import { detectDeps } from "./detect/deps";
import { triage } from "./triage";
import { partition } from "./diagnose/partition";
import { buildContext } from "./diagnose/context";
import { DryRunFixer } from "./treat/fixer";
import { buildEOB } from "./bill/eob";
import { writeHealthRecord } from "./record/health";
import { c, usd } from "./util";

function scan(target: string) {
  const root = resolve(target);
  const now = new Date().toISOString();

  // Triage — cheap local pass.
  const deps = detectDeps(root);
  const findings = triage(root);

  // Diagnose — partition, then build a tight packet for everything escalated.
  partition(findings);
  for (const f of findings) {
    if (f.fixability === "needs-llm") f.context = buildContext(root, f);
  }

  // Treat — route + resolve (v1: estimate, don't call).
  const fixer = new DryRunFixer();
  for (const f of findings) {
    if (f.fixability === "needs-llm") f.resolution = fixer.fix(f);
  }

  // Bill.
  const eob = buildEOB(root, findings);

  // Persist the Health Record.
  const recordDir = writeHealthRecord(root, deps, findings, eob, now);

  report(relative(process.cwd(), root) || ".", deps.manager, Object.keys(deps.deps).length, findings, eob, recordDir);
}

function report(
  root: string,
  manager: string,
  depCount: number,
  findings: Finding[],
  eob: EOB,
  recordDir: string,
) {
  console.log(`\n${c.bold("🩺 Token Clinic")} ${c.dim(`— ${root}`)}`);
  console.log(c.dim(`   ${manager} project · ${depCount} deps · ${findings.length} findings\n`));

  // Findings, highest-signal first.
  for (const f of findings) {
    const loc = c.dim(`${f.file}:${f.line}`);
    const tag = laneTag(f);
    const sev = f.severity === "error" ? c.red("●") : c.yellow("●");
    console.log(`  ${sev} ${c.bold(f.rule)} ${tag} ${f.message}`);
    console.log(`     ${loc}`);
  }

  // The EOB.
  const flag = eob.estimated ? c.dim(" (estimated — LLM step stubbed)") : "";
  console.log(`\n${c.bold("  Explanation of Benefits")}${flag}`);
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

  console.log(c.dim(`  health record → ${relative(process.cwd(), recordDir)}/\n`));
}

function laneTag(f: Finding): string {
  if (f.fixability === "autofix") return c.green("[local]");
  if (f.fixability === "ignore") return c.dim("[ignore]");
  return c.cyan(`[${f.difficulty}→${f.resolution?.model.replace("claude-", "") ?? "?"}]`);
}

const pct = (saved: number, base: number) => (base > 0 ? `${Math.round((saved / base) * 100)}%` : "0%");

// --- entry ---
const [cmd, target] = process.argv.slice(2);
if (cmd !== "scan") {
  console.log("usage: tokenclinic scan [path]");
  process.exit(1);
}
scan(target ?? ".");

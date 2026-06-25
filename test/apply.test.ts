import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Finding } from "../src/types";
import type { Fixer, FixResult } from "../src/treat/fixer";
import { runApplyLoop } from "../src/treat/apply";

// A fixer driven by a canned snippet — lets us exercise the whole apply/verify/
// revert loop deterministically, with no API key.
class FakeFixer implements Fixer {
  constructor(private replacement: (f: Finding) => string) {}
  async fix(f: Finding): Promise<FixResult> {
    const newSnippet = this.replacement(f);
    return {
      resolution: { model: "fake", tokensIn: 0, tokensOut: 0, cost: 0, patched: false, verified: false, patch: newSnippet },
      newSnippet,
    };
  }
}

function makeRepo(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "tc-"));
  mkdirSync(join(dir, "src"));
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext", moduleResolution: "bundler" }, include: ["src"] }),
  );
  writeFileSync(join(dir, "src/index.ts"), source);
  return dir;
}

test("apply loop fixes a real error and verifies it's gone", async () => {
  const dir = makeRepo(`export const x: string = 1;\n`);
  try {
    const { fixed } = await runApplyLoop(dir, new FakeFixer(() => `export const x: string = "1";\n`));
    expect(fixed.length).toBe(1);
    expect(fixed[0].resolution?.verified).toBe(true);
    expect(fixed[0].resolution?.patched).toBe(true);
    expect(readFileSync(join(dir, "src/index.ts"), "utf8")).toContain('"1"');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply loop reverts a patch that makes things worse", async () => {
  const original = `export const x: string = 1;\n`;
  const dir = makeRepo(original);
  try {
    const worse = `export const x: string = 1;\nexport const y: number = "no";\n`;
    const { fixed } = await runApplyLoop(dir, new FakeFixer(() => worse));
    expect(fixed[0].resolution?.verified).toBe(false);
    expect(fixed[0].resolution?.patched).toBe(false);
    expect(readFileSync(join(dir, "src/index.ts"), "utf8")).toBe(original); // reverted
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply loop is a no-op on a clean repo", async () => {
  const dir = makeRepo(`export const x: string = "ok";\n`);
  try {
    const { fixed } = await runApplyLoop(dir, new FakeFixer(() => "SHOULD NOT BE CALLED"));
    expect(fixed.length).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

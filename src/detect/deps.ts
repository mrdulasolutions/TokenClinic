import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Dependency detection. v1 reads package.json + the lockfile to identify the
// package manager and installed deps. This is what later drives dep-aware
// analyzer auto-configuration (enable the react-hooks rules iff react is a dep,
// etc.) — for v1 we just surface the profile in the report and Health Record.

export interface DepProfile {
  manager: string;
  deps: Record<string, string>;
}

export function detectDeps(root: string): DepProfile {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return { manager: "unknown", deps: {} };

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    return { manager: "unknown", deps: {} };
  }

  const manager = existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))
    ? "bun"
    : existsSync(join(root, "pnpm-lock.yaml"))
      ? "pnpm"
      : existsSync(join(root, "package-lock.json"))
        ? "npm"
        : "node";

  return {
    manager,
    deps: { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) },
  };
}

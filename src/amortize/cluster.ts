import type { Finding, Cluster } from "../types";

// Group recurring needs-llm findings by their source rule. A class is only worth
// amortizing once it has recurred enough times to pay back the one synthesis call
// — default ≥3 (don't amortize one-offs).
export function cluster(findings: Finding[], min = 3): Cluster[] {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    if (f.fixability !== "needs-llm") continue;
    const key = f.rule;
    const arr = groups.get(key);
    if (arr) arr.push(f);
    else groups.set(key, [f]);
  }

  return [...groups.entries()]
    .filter(([, fs]) => fs.length >= min)
    .map(([rule, fs]) => ({ rule, message: fs[0].message, findings: fs }))
    .sort((a, b) => b.findings.length - a.findings.length);
}

// Intentionally broken sample for the Token Clinic demo. Each error exercises a
// different lane: a $0 local autofix, a mechanical escalation, and semantic ones.

const greeting: string = 42; // TS2322 type mismatch        -> semantic
const unused = "never read"; // TS6133 unused declaration    -> local autofix ($0)

export function area(r: number) {
  return Math.PI * radius * radius; // TS2304 cannot find name 'radius' -> mechanical
}

interface User {
  name: string;
}

const u: User = { name: "ada" };
console.log(greeting, area(1), u.email); // TS2339 property does not exist -> semantic

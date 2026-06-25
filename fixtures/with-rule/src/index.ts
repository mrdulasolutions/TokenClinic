// tsc-clean on purpose: the only findings here come from the promoted ast-grep
// rule (.tokenclinic/rules/no-console-log.json), demonstrating the $0 local lane.

export function greet(name: string): string {
  console.log("greeting " + name);
  const msg = `hello ${name}`;
  console.log(msg);
  return msg;
}

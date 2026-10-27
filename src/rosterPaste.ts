import type { Employee } from "./types";
import { cleanEmployeeName } from "./assignmentLogic";
import { nameKey } from "./printLayout";

// "Add from a list" on Skills & Roles: one person per line, with a role
// after a tab (pasted from Excel) or " - " ("Ed Lura - MLL"), or on the end
// as on the printed sheet ("Jenise Amado MLT"). "Last, First" is turned
// around like everywhere else.
export interface PastedPerson {
  name: string;
  role: string;
  // Already on this shift's roster: left as it is, not added again.
  onRoster: boolean;
}

const ROLE_ON_END = /\s+(MLL|MLT|LL)$/i;

function roleName(role: string): string {
  return /^LL$/i.test(role) ? "Line Leader" : /^(MLL|MLT)$/i.test(role) ? role.toUpperCase() : role;
}

export function parsePastedRoster(text: string, roster: Employee[]): PastedPerson[] {
  const known = new Set(roster.map((e) => nameKey(e.name)).filter(Boolean));
  const seen = new Set<string>();
  const people: PastedPerson[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [first = "", ...rest] = line.split(/\t| - /);
    let role = rest.join(" ").replace(/\s+/g, " ").trim();
    const onEnd = first.trim().match(ROLE_ON_END);
    if (onEnd && !role) role = onEnd[1];
    const name = cleanEmployeeName(first.replace(/\s+/g, " "));
    const key = nameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    people.push({ name, role: roleName(role), onRoster: known.has(key) });
  }
  return people;
}

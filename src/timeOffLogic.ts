import type { TimeOffEntry } from "./types";

// Dates are compared as YYYY-MM-DD strings, which sort correctly. Built
// from local date parts (not toISOString, which is UTC and would roll to
// tomorrow in the evening in US time zones).
export function localIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return localIso(new Date());
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return localIso(new Date(y, m - 1, d + days));
}

export function covers(entry: TimeOffEntry, date: string): boolean {
  return !!entry.start && entry.start <= date && date <= (entry.end || entry.start);
}

export function overlaps(entry: TimeOffEntry, from: string, to: string): boolean {
  return !!entry.start && entry.start <= to && (entry.end || entry.start) >= from;
}

export function entriesOn(timeOff: TimeOffEntry[], date: string): TimeOffEntry[] {
  return date ? timeOff.filter((e) => e.name.trim() && covers(e, date)) : [];
}

export function describeEntry(entry: TimeOffEntry): string {
  return entry.note.trim() ? `${entry.type} – ${entry.note.trim()}` : entry.type;
}

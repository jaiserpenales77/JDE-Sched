import type { BoxLayout, Employee } from "./types";

// Stable keys for a box's saved position/size, independent of the
// underlying slot/section's generated id (which is regenerated every time
// a board is duplicated as a new day) - keyed by name instead, so a
// custom layout carries over from one day's board to the next.
export function lineBoxKey(line: string): string {
  return `line:${line.trim().toLowerCase()}`;
}
export function roomBoxKey(title: string): string {
  return `room:${title.trim().toLowerCase()}`;
}

const COLS = 6;
const ROW_HEIGHT = 16;
const GAP = 1;

// Where a box sits before the user has ever dragged/resized it - a simple
// 6-across grid, in reading order, as percentages of the canvas.
export function defaultBoxLayout(index: number): BoxLayout {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const width = 100 / COLS;
  return {
    x: col * width + GAP / 2,
    y: row * ROW_HEIGHT + GAP / 2,
    width: width - GAP,
    height: ROW_HEIGHT - GAP,
  };
}

export function resolveBoxLayout(key: string, index: number, layouts: Record<string, BoxLayout>): BoxLayout {
  return layouts[key] ?? defaultBoxLayout(index);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// First-name lookup: the day board and the skills roster were kept as two
// separate sheets in the original workbook and don't always agree on a
// person's last name/nickname (e.g. roster "Vicky LL" vs board "Vicky
// Rama") - first name is the reliable common key between them.
export function buildFirstNameRoleMap(employees: Employee[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of employees) {
    const first = e.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (first) map.set(first, e.role);
  }
  return map;
}

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
export function commentBoxKey(title: string): string {
  return `comment:${title.trim().toLowerCase()}`;
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

// Snap-to-alignment (move/resize), similar to Figma/PowerPoint smart
// guides: aligns the dragged box's edges/center with other boxes' edges/
// center (and the page edges/center), and while resizing also offers to
// match another box's exact width/height so lines up neatly the same size.

const SNAP_THRESHOLD = 1.2; // percent of the page axis

export interface SnapResult extends BoxLayout {
  guideX?: number; // % position of a vertical guide line to draw, if snapped on x
  guideY?: number; // % position of a horizontal guide line to draw, if snapped on y
}

function closestTarget(value: number, targets: number[]): number | null {
  let best: number | null = null;
  let bestDiff = SNAP_THRESHOLD;
  for (const t of targets) {
    const diff = Math.abs(value - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = t;
    }
  }
  return best;
}

export function snapMove(rect: BoxLayout, others: BoxLayout[]): SnapResult {
  const xTargets = [0, 50, 100];
  const yTargets = [0, 50, 100];
  for (const o of others) {
    xTargets.push(o.x, o.x + o.width / 2, o.x + o.width);
    yTargets.push(o.y, o.y + o.height / 2, o.y + o.height);
  }

  const xCandidates = [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
  const yCandidates = [rect.y, rect.y + rect.height / 2, rect.y + rect.height];

  let bestX: { delta: number; diff: number; guide: number } | null = null;
  for (const c of xCandidates) {
    const snap = closestTarget(c, xTargets);
    if (snap === null) continue;
    const diff = Math.abs(snap - c);
    if (!bestX || diff < bestX.diff) bestX = { delta: snap - c, diff, guide: snap };
  }
  let bestY: { delta: number; diff: number; guide: number } | null = null;
  for (const c of yCandidates) {
    const snap = closestTarget(c, yTargets);
    if (snap === null) continue;
    const diff = Math.abs(snap - c);
    if (!bestY || diff < bestY.diff) bestY = { delta: snap - c, diff, guide: snap };
  }

  return {
    x: bestX ? rect.x + bestX.delta : rect.x,
    y: bestY ? rect.y + bestY.delta : rect.y,
    width: rect.width,
    height: rect.height,
    guideX: bestX?.guide,
    guideY: bestY?.guide,
  };
}

export function snapResize(rect: BoxLayout, others: BoxLayout[]): SnapResult {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  const xEdgeTargets = [100];
  const yEdgeTargets = [100];
  const widthTargets: number[] = [];
  const heightTargets: number[] = [];
  for (const o of others) {
    xEdgeTargets.push(o.x, o.x + o.width / 2, o.x + o.width);
    yEdgeTargets.push(o.y, o.y + o.height / 2, o.y + o.height);
    widthTargets.push(o.width);
    heightTargets.push(o.height);
  }

  let width = rect.width;
  let guideX: number | undefined;
  const snapRight = closestTarget(right, xEdgeTargets);
  const snapWidth = closestTarget(rect.width, widthTargets);
  if (snapRight !== null && (snapWidth === null || Math.abs(snapRight - right) <= Math.abs(snapWidth - rect.width))) {
    width = snapRight - rect.x;
    guideX = snapRight;
  } else if (snapWidth !== null) {
    width = snapWidth;
  }

  let height = rect.height;
  let guideY: number | undefined;
  const snapBottom = closestTarget(bottom, yEdgeTargets);
  const snapHeight = closestTarget(rect.height, heightTargets);
  if (snapBottom !== null && (snapHeight === null || Math.abs(snapBottom - bottom) <= Math.abs(snapHeight - rect.height))) {
    height = snapBottom - rect.y;
    guideY = snapBottom;
  } else if (snapHeight !== null) {
    height = snapHeight;
  }

  return { x: rect.x, y: rect.y, width, height, guideX, guideY };
}

// Canonical comparison key for a person's name, so the same person matches
// however they were typed: "Sanchez, Maggie" and "Maggie Sanchez" both
// become "maggie sanchez", and trailing notes/tags like "(Training)",
// " - PTO" or a " MLL" role suffix are ignored.
export function nameKey(raw: string): string {
  let s = raw.toLowerCase().replace(/\(.*?\)/g, " ");
  s = s.split(/\s[-–—]\s/)[0];
  s = s.replace(/\s+(mll|mlt|ll)\s*$/, "");
  if (s.includes(",")) {
    const [last, ...rest] = s.split(",");
    s = `${rest.join(" ")} ${last}`;
  }
  return s.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Name -> role lookup. Matches the full name first; falls back to first
// name only when that first name is unique on the roster, because the day
// board and the roster don't always agree on a last name/nickname (e.g.
// roster "Vicky LL" vs board "Vicky Rama") - but a shared first name
// (three "Alma"s on one shift) must never guess the wrong person's role.
export function buildRoleMap(employees: Employee[]): Map<string, string> {
  const map = new Map<string, string>();
  const firstCounts = new Map<string, number>();
  for (const e of employees) {
    const first = nameKey(e.name).split(" ")[0];
    if (first) firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
  }
  for (const e of employees) {
    const key = nameKey(e.name);
    if (!key) continue;
    map.set(`full:${key}`, e.role);
    const first = key.split(" ")[0];
    if (firstCounts.get(first) === 1) map.set(`first:${first}`, e.role);
  }
  return map;
}

export function roleOf(name: string, roleMap: Map<string, string>): string | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  return roleMap.get(`full:${key}`) ?? roleMap.get(`first:${key.split(" ")[0]}`);
}

export type RoleCategory = "mll" | "leader" | "mlt" | "other";

export function roleCategory(role: string | undefined): RoleCategory {
  if (!role) return "other";
  if (/\bMLL\b/i.test(role)) return "mll";
  if (/\bline lead(er)?\b/i.test(role) || /^\s*LL\s*$/i.test(role)) return "leader";
  if (/\bMLT\b/i.test(role)) return "mlt";
  return "other";
}

const ROLE_RANK: Record<RoleCategory, number> = { mll: 0, leader: 1, mlt: 2, other: 3 };

// Priority for displaying a line's assigned team: MLL first, then Line
// Leader, then MLT, then everyone else - keeps the crew hierarchy visible
// at a glance instead of relying only on the role highlight colors.
function roleRank(name: string, roleMap: Map<string, string>): number {
  return ROLE_RANK[roleCategory(roleOf(name, roleMap))];
}

export function sortByRole(names: string[], roleMap: Map<string, string>): string[] {
  return names
    .map((name, index) => ({ name, index, rank: roleRank(name, roleMap) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.name);
}

// Holiday themes for the printed Production Schedule: icons beside the
// title, a greeting, a strip of small icons under it, and the theme's
// color on the lines. They never change the row colors that mean
// something, and none uses green for its lines (green means scheduled).

export type HolidayIconName =
  | "pumpkin"
  | "bat"
  | "moon"
  | "leaf"
  | "snowflake"
  | "ornament"
  | "star"
  | "firework"
  | "heart"
  | "shamrock"
  | "coin"
  | "rainbow"
  | "egg"
  | "flower"
  | "flag"
  | "hardHat"
  | "gear"
  | "tree"
  | "snowman"
  | "gift"
  | "holly";

export interface HolidayIcon {
  icon: HolidayIconName;
  color?: string;
}

export interface HolidayTheme {
  id: string;
  name: string;
  // When Automatic shows it, in words.
  when: string;
  // The theme's color for the line-name bands, column titles and dividers.
  accent: string;
  // A light shade for the column-title row in Classic and Clean grid.
  tint: string;
  greetingColor: string;
  greeting: (date: Date) => string;
  // Beside the title.
  side: [HolidayIcon, HolidayIcon];
  // Repeated along the strip under the title.
  strip: HolidayIcon[];
  // The scene under the schedule: a few things on the ground at the left,
  // some in the sky, and a big one at the right.
  ground: [HolidayIcon, HolidayIcon, HolidayIcon];
  sky: HolidayIcon[];
  corner: HolidayIcon;
  // Whether Automatic shows it on this date; none = only when picked.
  isOn?: (date: Date) => boolean;
}

// "Off", "auto", or a theme's id.
export type HolidayThemeSetting = string;

const icon = (name: HolidayIconName, color?: string): HolidayIcon => ({ icon: name, color });

// Month and day as one number (October 31 = 1031), for date ranges.
const monthDay = (d: Date) => (d.getMonth() + 1) * 100 + d.getDate();
const between = (from: number, to: number) => (d: Date) => {
  const md = monthDay(d);
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
};
const dayNumber = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
// The week leading up to a holiday, and the day itself.
const weekBefore = (holiday: (year: number) => Date) => (d: Date) => {
  const days = dayNumber(holiday(d.getFullYear())) - dayNumber(d);
  return days >= 0 && days <= 6;
};

// Easter Sunday (Gregorian calendar).
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// The last Monday of May (Memorial Day).
export function memorialDay(year: number): Date {
  const d = new Date(year, 4, 31);
  d.setDate(31 - ((d.getDay() + 6) % 7));
  return d;
}

// The first Monday of September (Labor Day).
export function laborDay(year: number): Date {
  const d = new Date(year, 8, 1);
  d.setDate(1 + ((8 - d.getDay()) % 7));
  return d;
}

const RED = "#b91c1c";
const BLUE = "#1d4ed8";
const GOLD = "#ca8a04";
const NAVY = "#1e3a8a";
const NAVY_TINT = "#e5eaf5";

// In calendar order. Automatic uses the first one that's on.
export const HOLIDAY_THEMES: HolidayTheme[] = [
  {
    id: "newYear",
    name: "New Year",
    when: "Dec 27 – Jan 2",
    accent: "#111827",
    tint: "#e5e7eb",
    greetingColor: "#a16207",
    // The coming year (from July on, the next one).
    greeting: (d) => `Happy New Year ${d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear()}!`,
    side: [icon("firework", GOLD), icon("star", GOLD)],
    strip: [icon("firework", GOLD), icon("star", GOLD), icon("firework", "#2563eb"), icon("star", GOLD), icon("firework", "#db2777"), icon("star", GOLD)],
    ground: [icon("star", GOLD), icon("star", "#2563eb"), icon("star", "#db2777")],
    sky: [icon("firework", GOLD), icon("firework", "#2563eb"), icon("firework", "#db2777")],
    corner: icon("firework", GOLD),
    isOn: between(1227, 102),
  },
  {
    id: "valentines",
    name: "Valentine's Day",
    when: "Feb 7 – 14",
    accent: "#9f1239",
    tint: "#fce7ef",
    greetingColor: "#e11d48",
    greeting: () => "Happy Valentine's Day!",
    side: [icon("heart", "#e11d48"), icon("heart", "#f472b6")],
    strip: [icon("heart", "#e11d48"), icon("heart", "#f472b6")],
    ground: [icon("heart", "#e11d48"), icon("heart", "#f472b6"), icon("heart", "#e11d48")],
    sky: [icon("heart", "#f472b6"), icon("heart", "#e11d48")],
    corner: icon("heart", "#e11d48"),
    isOn: between(207, 214),
  },
  {
    id: "stPatricks",
    name: "St. Patrick's Day",
    when: "Mar 10 – 17",
    accent: "#854d0e",
    tint: "#ece7da",
    greetingColor: "#15803d",
    greeting: () => "Happy St. Patrick's Day!",
    side: [icon("shamrock"), icon("coin")],
    strip: [icon("shamrock"), icon("coin")],
    ground: [icon("coin"), icon("coin"), icon("coin")],
    sky: [icon("shamrock")],
    corner: icon("rainbow"),
    isOn: between(310, 317),
  },
  {
    id: "easter",
    name: "Easter",
    when: "the week before Easter",
    accent: "#0e7490",
    tint: "#e8f6f8",
    greetingColor: "#db2777",
    greeting: () => "Happy Easter!",
    side: [icon("egg", "#f472b6"), icon("flower", "#a855f7")],
    strip: [icon("egg", "#f472b6"), icon("flower", "#a855f7"), icon("egg", "#38bdf8"), icon("flower", "#f59e0b")],
    ground: [icon("egg", "#f472b6"), icon("egg", "#38bdf8"), icon("egg", "#facc15")],
    sky: [icon("flower", "#a855f7"), icon("flower", "#f472b6"), icon("flower", "#f59e0b")],
    corner: icon("flower", "#ec4899"),
    isOn: weekBefore(easterSunday),
  },
  {
    id: "memorialDay",
    name: "Memorial Day",
    when: "the week before Memorial Day",
    accent: NAVY,
    tint: NAVY_TINT,
    greetingColor: RED,
    greeting: () => "Honoring those who served",
    side: [icon("flag"), icon("star", BLUE)],
    strip: [icon("star", RED), icon("star", BLUE)],
    ground: [icon("flag"), icon("flag"), icon("flag")],
    sky: [icon("star", RED), icon("star", BLUE)],
    corner: icon("flag"),
    isOn: weekBefore(memorialDay),
  },
  {
    id: "july4",
    name: "Independence Day",
    when: "Jun 28 – Jul 4",
    accent: NAVY,
    tint: NAVY_TINT,
    greetingColor: RED,
    greeting: () => "Happy 4th of July!",
    side: [icon("star", RED), icon("star", BLUE)],
    strip: [icon("star", RED), icon("firework", BLUE), icon("star", BLUE), icon("firework", RED)],
    ground: [icon("flag"), icon("star", RED), icon("star", BLUE)],
    sky: [icon("firework", RED), icon("firework", BLUE)],
    corner: icon("firework", RED),
    isOn: between(628, 704),
  },
  {
    id: "laborDay",
    name: "Labor Day",
    when: "the week before Labor Day",
    accent: "#334155",
    tint: "#e7ecef",
    greetingColor: "#b45309",
    greeting: () => "Happy Labor Day!",
    side: [icon("hardHat"), icon("gear")],
    strip: [icon("hardHat"), icon("gear")],
    ground: [icon("hardHat"), icon("gear"), icon("hardHat")],
    sky: [icon("star", GOLD)],
    corner: icon("gear"),
    isOn: weekBefore(laborDay),
  },
  {
    id: "halloween",
    name: "Halloween",
    when: "Oct 15 – 31",
    accent: "#4c1d95",
    tint: "#ede9fe",
    greetingColor: "#c2410c",
    greeting: () => "Happy Halloween!",
    side: [icon("pumpkin"), icon("bat")],
    strip: [icon("pumpkin"), icon("bat")],
    ground: [icon("pumpkin"), icon("pumpkin"), icon("pumpkin")],
    sky: [icon("bat")],
    corner: icon("moon"),
    isOn: between(1015, 1031),
  },
  {
    id: "veteransDay",
    name: "Veterans Day",
    when: "Nov 8 – 11",
    accent: NAVY,
    tint: NAVY_TINT,
    greetingColor: RED,
    greeting: () => "Thank you, veterans",
    side: [icon("flag"), icon("star", BLUE)],
    strip: [icon("star", RED), icon("star", BLUE)],
    ground: [icon("flag"), icon("flag"), icon("flag")],
    sky: [icon("star", RED), icon("star", BLUE)],
    corner: icon("star", GOLD),
    isOn: between(1108, 1111),
  },
  {
    id: "thanksgiving",
    name: "Thanksgiving",
    when: "Nov 15 – 30",
    accent: "#7c2d12",
    tint: "#efe4d8",
    greetingColor: "#b45309",
    greeting: () => "Happy Thanksgiving!",
    side: [icon("leaf", "#ea580c"), icon("leaf", RED)],
    strip: [icon("leaf", "#ea580c"), icon("leaf", RED), icon("leaf", GOLD)],
    ground: [icon("pumpkin"), icon("pumpkin"), icon("leaf", GOLD)],
    sky: [icon("leaf", "#ea580c"), icon("leaf", RED), icon("leaf", GOLD)],
    corner: icon("leaf", RED),
    isOn: between(1115, 1130),
  },
  {
    id: "winter",
    name: "Winter holidays",
    when: "Dec 1 – 26",
    accent: NAVY,
    tint: "#e6edf7",
    greetingColor: RED,
    greeting: () => "Happy Holidays!",
    side: [icon("snowflake"), icon("ornament", "#dc2626")],
    strip: [icon("snowflake"), icon("ornament", "#dc2626"), icon("snowflake"), icon("star", GOLD)],
    ground: [icon("tree"), icon("tree"), icon("tree")],
    sky: [icon("snowflake")],
    corner: icon("snowman"),
    isOn: between(1201, 1226),
  },
  {
    // Picked by hand only: in December, Automatic shows Winter holidays.
    id: "christmas",
    name: "Christmas",
    when: "only when picked",
    accent: "#991b1b",
    tint: "#f9e8e8",
    greetingColor: "#15803d",
    greeting: () => "Merry Christmas!",
    side: [icon("tree"), icon("star", GOLD)],
    strip: [icon("ornament", "#dc2626"), icon("star", GOLD), icon("holly"), icon("ornament", GOLD)],
    ground: [icon("gift", "#dc2626"), icon("gift", "#2563eb"), icon("gift", GOLD)],
    sky: [icon("star", GOLD), icon("snowflake")],
    corner: icon("tree"),
  },
];

export const HOLIDAY_THEME_IDS = HOLIDAY_THEMES.map((t) => t.id);

// The theme to print with: the one picked, or on Automatic the one whose
// dates include `date` (none outside them).
export function activeHolidayTheme(setting: HolidayThemeSetting, date: Date): HolidayTheme | null {
  if (setting === "auto") return HOLIDAY_THEMES.find((t) => t.isOn?.(date)) ?? null;
  return HOLIDAY_THEMES.find((t) => t.id === setting) ?? null;
}

export type SceneSize = "full" | "small" | "none";

// Heights (px) of the scene under the schedule, with the gap above it.
export const SCENE_HEIGHT = { full: 64, small: 24 } as const;
export const SCENE_GAP = { full: 16, small: 8 } as const;

// Which scene fits in the room left on the printed schedule's last page.
// The title and column titles repeat at the top of each page, and a line's
// rows never split across pages. It never adds a page: with too little
// room (or a line too long for one page) there's no scene. With Fit to one
// page, a schedule that had to shrink has no room left either.
//
// `pageHeights` are the page's room with and without the browser's own
// header and footer (a print-dialog setting the page can't see): the
// scene has to fit either way, so it takes the smaller room.
export function sceneSizeFor(table: HTMLElement, pageHeights: number[], fitToOnePage: boolean): SceneSize {
  const head = table.querySelector("thead")?.getBoundingClientRect().height ?? 0;
  const groups = [...table.querySelectorAll<HTMLElement>("tbody")].map((g) => g.getBoundingClientRect().height);
  const roomLeft = (pageHeight: number) => {
    if (fitToOnePage) return pageHeight - table.getBoundingClientRect().height;
    const perPage = pageHeight - head;
    if (groups.some((h) => h > perPage)) return -1;
    let room = perPage;
    for (const h of groups) {
      if (h > room) room = perPage;
      room -= h;
    }
    return room;
  };
  const room = Math.min(...pageHeights.map(roomLeft));
  const fits = (size: "full" | "small") => room >= SCENE_HEIGHT[size] + SCENE_GAP[size] + 4;
  return fits("full") ? "full" : fits("small") ? "small" : "none";
}

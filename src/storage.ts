import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc, waitForPendingWrites } from "firebase/firestore";
import { db } from "./firebase";
import type {
  AppData,
  ChangeoverClock,
  DailyBoard,
  PrintAssignSettings,
  SchedulePrintSettings,
  ShiftKey,
  TimeOffEntry,
} from "./types";
import { SHIFT_KEYS, TIME_OFF_TYPES } from "./types";
import { buildSeedData, defaultPrintSettings, defaultSchedulePrintSettings } from "./seedData";
import { SHIFT_HOURS, normalizeLineStatus } from "./scheduleLogic";

const CURRENT_SHIFT_KEY = "jde-sched-current-shift";
const HISTORY_LIMIT = 50;
const HISTORY_GROUP_MS = 1000;

function dataStorageKey(shift: ShiftKey): string {
  return `jde-sched-data-${shift}-v1`;
}

// Each shift syncs a completely separate document - a device showing one
// shift never even fetches another shift's Production Schedule, roster or
// Line Assignments boards, so there's no shared record anywhere to leak
// data across shifts.
function shiftDoc(shift: ShiftKey) {
  return doc(db, "jde-sched", shift);
}

function normalizeTimeOff(entry: Partial<TimeOffEntry>): TimeOffEntry {
  const start = typeof entry.start === "string" ? entry.start : "";
  const end = typeof entry.end === "string" && entry.end >= start ? entry.end : start;
  return {
    id: entry.id ?? crypto.randomUUID(),
    name: typeof entry.name === "string" ? entry.name : "",
    start,
    end,
    type: (TIME_OFF_TYPES as readonly string[]).includes(entry.type ?? "") ? (entry.type as TimeOffEntry["type"]) : "PTO",
    note: typeof entry.note === "string" ? entry.note : "",
  };
}

// Backfills fields added to the data model after some users already had
// data saved in localStorage (e.g. roomSections), so old saved boards
// don't crash the app by being missing an array a newer build expects.
function normalizeBoard(board: Partial<DailyBoard>): DailyBoard {
  return {
    id: board.id ?? crypto.randomUUID(),
    date: board.date ?? "",
    shiftLabel: board.shiftLabel ?? "",
    deptLeader: board.deptLeader ?? "",
    lineSlots: Array.isArray(board.lineSlots) ? board.lineSlots : [],
    roomSections: Array.isArray(board.roomSections) ? board.roomSections : [],
    listSections: Array.isArray(board.listSections) ? board.listSections : [],
    comments: Array.isArray(board.comments) ? board.comments : [],
  };
}

function normalizePrintSettings(settings: Partial<PrintAssignSettings> | undefined): PrintAssignSettings {
  const merged = { ...defaultPrintSettings, ...settings };
  if (!merged.boxLayouts || typeof merged.boxLayouts !== "object") merged.boxLayouts = {};
  // Migrate the old single "MLL / MLT highlight" color (crewColor) - if a
  // user already customized it, carry that over to both new fields instead
  // of silently reverting them to the default.
  const legacyCrewColor = (settings as { crewColor?: string } | undefined)?.crewColor;
  if (legacyCrewColor) {
    if (!settings?.mllColor) merged.mllColor = legacyCrewColor;
    if (!settings?.mltColor) merged.mltColor = legacyCrewColor;
  }
  return merged;
}

// Saved settings still on an earlier default tag color move to the
// current one - anything the user picked themselves is kept. (Ready / PM
// used to be pale cell fills; OT, and Trial before it, used to be purple.)
const OLD_STATUS_DEFAULTS = { readyColor: "#c6efce", pmColor: "#bdd7ee", otColor: "#6d28d9" } as const;
// The OT tag replaced the Trial tag; a Trial color the user picked moves
// over to OT (Trial's old defaults don't).
const OLD_TRIAL_DEFAULTS = ["#d9d2e9", "#6d28d9"];

type LegacySchedulePrintSettings = Partial<SchedulePrintSettings> & { trialColor?: string };

function normalizeSchedulePrintSettings(settings: LegacySchedulePrintSettings | undefined): SchedulePrintSettings {
  const { trialColor, ...rest } = settings ?? {};
  const merged: SchedulePrintSettings = { ...defaultSchedulePrintSettings, ...rest };
  if (!rest.otColor && trialColor && !OLD_TRIAL_DEFAULTS.includes(trialColor.toLowerCase())) merged.otColor = trialColor;
  for (const key of Object.keys(OLD_STATUS_DEFAULTS) as (keyof typeof OLD_STATUS_DEFAULTS)[]) {
    if (merged[key].toLowerCase() === OLD_STATUS_DEFAULTS[key]) merged[key] = defaultSchedulePrintSettings[key];
  }
  return merged;
}

export function normalizeAppData(raw: Partial<AppData>): AppData {
  return {
    workOrders: Array.isArray(raw.workOrders)
      ? raw.workOrders.map((w) => ({ ...w, lineStatus: normalizeLineStatus(w.lineStatus) }))
      : [],
    employees: Array.isArray(raw.employees) ? raw.employees : [],
    printSettings: normalizePrintSettings(raw.printSettings),
    scheduledLines: Array.isArray(raw.scheduledLines) ? raw.scheduledLines : [],
    printScheduleColumnWidths:
      raw.printScheduleColumnWidths && typeof raw.printScheduleColumnWidths === "object"
        ? raw.printScheduleColumnWidths
        : {},
    printScheduleHiddenColumns: Array.isArray(raw.printScheduleHiddenColumns) ? raw.printScheduleHiddenColumns : [],
    printScheduleColumnOrder: Array.isArray(raw.printScheduleColumnOrder) ? raw.printScheduleColumnOrder : [],
    boards: Array.isArray(raw.boards) ? raw.boards.map(normalizeBoard) : [],
    timeOff: Array.isArray(raw.timeOff) ? raw.timeOff.map(normalizeTimeOff) : [],
    schedulePrintSettings: normalizeSchedulePrintSettings(raw.schedulePrintSettings),
    importColumnMap: raw.importColumnMap && typeof raw.importColumnMap === "object" ? raw.importColumnMap : {},
    changeoverClock: normalizeChangeoverClock(raw.changeoverClock),
  };
}

// Which shift this device is showing - a per-device preference, not
// synced to Firestore, so switching it here never affects other devices.
export function useCurrentShift() {
  const [shift, setShift] = useState<ShiftKey | null>(() => {
    const saved = localStorage.getItem(CURRENT_SHIFT_KEY);
    return (SHIFT_KEYS as readonly string[]).includes(saved ?? "") ? (saved as ShiftKey) : null;
  });

  function chooseShift(next: ShiftKey) {
    try {
      localStorage.setItem(CURRENT_SHIFT_KEY, next);
    } catch (err) {
      console.error("Failed to remember the chosen shift on this device.", err);
    }
    setShift(next);
  }

  return [shift, chooseShift] as const;
}

function loadLocal(shift: ShiftKey): AppData {
  try {
    const raw = localStorage.getItem(dataStorageKey(shift));
    if (raw) return normalizeAppData(JSON.parse(raw) as Partial<AppData>);
  } catch (err) {
    console.error("Failed to load saved data, starting from seed data.", err);
  }
  return buildSeedData(shift);
}

// One shift's full data - Production Schedule, Skills & Roles roster,
// print settings and Line Assignments boards, all synced as a single
// document completely separate from every other shift's. localStorage
// stays as an instant local cache and offline fallback per shift;
// Firestore is what makes different devices on the SAME shift see each
// other's changes.
export function useShiftData(shift: ShiftKey | null) {
  const [data, setData] = useState<AppData>(() => (shift ? loadLocal(shift) : emptyAppData()));
  const lastSyncedJson = useRef<string>("");
  const [syncReady, setSyncReady] = useState(false);
  // Why changes aren't reaching the cloud right now (shown on screen), or
  // null when syncing is working.
  const [syncProblem, setSyncProblem] = useState<string | null>(null);

  // ---- Undo / redo of this device's own edits ----
  // Every committed change to `data` is recorded unless it's flagged as
  // coming from somewhere else: a shift switch or another device's update
  // clears the history instead, so undo can never put back a stale copy
  // over someone else's newer work.
  const past = useRef<AppData[]>([]);
  const future = useRef<AppData[]>([]);
  const previous = useRef<AppData>(data);
  const lastChangeAt = useRef(0);
  const external = useRef(false);
  const travelling = useRef(false);
  // The shift the recorded history belongs to - undo is ignored in the
  // instant after a shift switch, before the history has been cleared.
  const historyShift = useRef(shift);
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });

  useEffect(() => {
    const prev = previous.current;
    previous.current = data;
    if (prev === data) return;
    if (external.current) {
      external.current = false;
      past.current = [];
      future.current = [];
      historyShift.current = shift;
    } else if (travelling.current) {
      travelling.current = false;
    } else {
      // Rapid edits (typing a name, dragging a box) collapse into one step.
      const now = Date.now();
      if (now - lastChangeAt.current > HISTORY_GROUP_MS || past.current.length === 0) {
        past.current.push(prev);
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
      }
      lastChangeAt.current = now;
      future.current = [];
    }
    setHistorySize({ undo: past.current.length, redo: future.current.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function undo() {
    if (historyShift.current !== shift) return;
    const target = past.current.pop();
    if (!target) return;
    future.current.push(previous.current);
    travelling.current = true;
    lastChangeAt.current = 0;
    setData(target);
  }

  function redo() {
    if (historyShift.current !== shift) return;
    const target = future.current.pop();
    if (!target) return;
    past.current.push(previous.current);
    travelling.current = true;
    lastChangeAt.current = 0;
    setData(target);
  }

  // Reload local state when the shift changes (including into/out of
  // null), so switching shifts doesn't briefly show the old shift's data.
  useEffect(() => {
    lastSyncedJson.current = "";
    setSyncReady(false);
    setSyncProblem(null);
    external.current = true;
    setData(shift ? loadLocal(shift) : emptyAppData());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift]);

  useEffect(() => {
    if (!shift) return;
    try {
      localStorage.setItem(dataStorageKey(shift), JSON.stringify(data));
    } catch (err) {
      console.error("Failed to save data to localStorage.", err);
    }
  }, [data, shift]);

  useEffect(() => {
    if (!shift) return;
    const unsubscribe = onSnapshot(
      shiftDoc(shift),
      (snapshot) => {
        if (snapshot.exists()) {
          const remote = normalizeAppData(snapshot.data() as Partial<AppData>);
          const remoteJson = JSON.stringify(remote);
          if (remoteJson !== lastSyncedJson.current) {
            lastSyncedJson.current = remoteJson;
            external.current = true;
            setData(remote);
          }
        }
        setSyncProblem(null);
        setSyncReady(true);
      },
      (err) => {
        console.error("Firestore sync unavailable - working from this device's local copy only.", err);
        setSyncProblem(describeSyncError(err));
        setSyncReady(true);
      },
    );
    return () => unsubscribe();
  }, [shift]);

  useEffect(() => {
    if (!shift || !syncReady) return;
    const json = JSON.stringify(data);
    if (json === lastSyncedJson.current) return;
    const timer = window.setTimeout(() => {
      lastSyncedJson.current = json;
      setDoc(shiftDoc(shift), data).then(
        () => setSyncProblem(null),
        (err) => {
          console.error("Failed to sync to Firestore - this device's changes are only saved locally for now.", err);
          setSyncProblem(describeSyncError(err));
        },
      );
    }, 800);
    return () => window.clearTimeout(timer);
  }, [data, shift, syncReady]);

  // Sends any change still waiting on the 0.8s delay right away, then waits
  // until every change has reached the cloud (including ones sent earlier
  // while offline) - used before locking, so no edit is left unsaved.
  const latest = useRef({ shift, data, syncReady });
  latest.current = { shift, data, syncReady };
  async function saveNow(): Promise<void> {
    const { shift: s, data: d, syncReady: ready } = latest.current;
    if (!s || !ready) return;
    const json = JSON.stringify(d);
    if (json !== lastSyncedJson.current) {
      lastSyncedJson.current = json;
      await setDoc(shiftDoc(s), d);
    }
    await waitForPendingWrites(db);
  }

  const history = { undo, redo, canUndo: historySize.undo > 0, canRedo: historySize.redo > 0 };
  const sync = { problem: syncProblem, saveNow };
  return [data, setData, history, sync] as const;
}

function describeSyncError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "permission-denied") return "this computer isn't allowed to open this shift's data - try Lock, then unlock again";
  if (code === "unavailable") return "can't reach the cloud right now";
  return "the cloud didn't accept the last save";
}

function normalizeChangeoverClock(raw: Partial<ChangeoverClock> | undefined): ChangeoverClock {
  const hour = (n: unknown) => (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= SHIFT_HOURS ? (n as number) : 0);
  return {
    start: typeof raw?.start === "string" && /^\d{2}:\d{2}$/.test(raw.start) ? raw.start : "",
    breakHours: Array.isArray(raw?.breakHours) ? raw.breakHours.map(hour).filter(Boolean) : [],
    lunchHour: hour(raw?.lunchHour),
  };
}

export function seedDataForShift(shift: ShiftKey): AppData {
  return buildSeedData(shift);
}

export function emptyAppData(): AppData {
  return {
    workOrders: [],
    employees: [],
    printSettings: { ...defaultPrintSettings },
    scheduledLines: [],
    printScheduleColumnWidths: {},
    printScheduleHiddenColumns: [],
    printScheduleColumnOrder: [],
    boards: [],
    timeOff: [],
    schedulePrintSettings: { ...defaultSchedulePrintSettings },
    importColumnMap: {},
    changeoverClock: { start: "", breakHours: [], lunchHour: 0 },
  };
}

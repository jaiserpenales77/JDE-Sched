import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { AppData, DailyBoard, PrintAssignSettings } from "./types";
import { buildSeedData, defaultPrintSettings } from "./seedData";

const STORAGE_KEY = "jde-sched-data-v1";

// One shared document every device reads/writes - this is what makes 1st,
// 2nd and 3rd shift all see the same schedule instead of each browser
// having its own private copy. localStorage below stays in place as an
// instant local cache and an offline fallback if Firestore is unreachable.
const SHARED_DOC = doc(db, "jde-sched", "shared");

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

export function normalizeAppData(raw: Partial<AppData>): AppData {
  return {
    workOrders: Array.isArray(raw.workOrders) ? raw.workOrders : [],
    boards: Array.isArray(raw.boards) ? raw.boards.map(normalizeBoard) : [],
    employees: Array.isArray(raw.employees) ? raw.employees : [],
    printSettings: normalizePrintSettings(raw.printSettings),
    scheduledLines: Array.isArray(raw.scheduledLines) ? raw.scheduledLines : [],
    printScheduleColumnWidths:
      raw.printScheduleColumnWidths && typeof raw.printScheduleColumnWidths === "object"
        ? raw.printScheduleColumnWidths
        : {},
    printScheduleHiddenColumns: Array.isArray(raw.printScheduleHiddenColumns) ? raw.printScheduleHiddenColumns : [],
  };
}

function loadInitial(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeAppData(JSON.parse(raw) as Partial<AppData>);
  } catch (err) {
    console.error("Failed to load saved data, starting from seed data.", err);
  }
  return buildSeedData();
}

export function useAppData() {
  const [data, setData] = useState<AppData>(loadInitial);
  // The JSON of whatever we last sent to (or received from) Firestore, so
  // the snapshot listener can tell "a change from another device" apart
  // from "the server confirming the write we just made" and not loop.
  const lastSyncedJson = useRef<string>("");
  // Stays false until the first Firestore snapshot arrives, so a device
  // that's still loading (with only its local/seed copy) can't win a race
  // and stomp the real shared data with its own stale copy.
  const [syncReady, setSyncReady] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error("Failed to save data to localStorage.", err);
    }
  }, [data]);

  // Pick up changes made on other devices/shifts.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      SHARED_DOC,
      (snapshot) => {
        if (snapshot.exists()) {
          const remote = normalizeAppData(snapshot.data() as Partial<AppData>);
          const remoteJson = JSON.stringify(remote);
          if (remoteJson !== lastSyncedJson.current) {
            lastSyncedJson.current = remoteJson;
            setData(remote);
          }
        }
        setSyncReady(true);
      },
      (err) => {
        console.error("Firestore sync unavailable - working from this device's local copy only.", err);
        setSyncReady(true);
      },
    );
    return () => unsubscribe();
  }, []);

  // Push local edits up to Firestore, debounced so rapid changes (typing
  // in a field, dragging a box) collapse into one write instead of one
  // per keystroke.
  useEffect(() => {
    if (!syncReady) return;
    const json = JSON.stringify(data);
    if (json === lastSyncedJson.current) return;
    const timer = window.setTimeout(() => {
      lastSyncedJson.current = json;
      setDoc(SHARED_DOC, data).catch((err) => {
        console.error("Failed to sync to Firestore - this device's changes are only saved locally for now.", err);
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [data, syncReady]);

  return [data, setData] as const;
}

export function resetToSeed(): AppData {
  return buildSeedData();
}

export function emptyData(): AppData {
  return {
    workOrders: [],
    boards: [],
    employees: [],
    printSettings: { ...defaultPrintSettings },
    scheduledLines: [],
    printScheduleColumnWidths: {},
    printScheduleHiddenColumns: [],
  };
}

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { AppData, DailyBoard, PrintAssignSettings, SharedData, ShiftKey } from "./types";
import { SHIFT_KEYS } from "./types";
import { buildSeedSharedData, defaultPrintSettings, seedBoardsForShift } from "./seedData";

const SHARED_STORAGE_KEY = "jde-sched-shared-v1";
const CURRENT_SHIFT_KEY = "jde-sched-current-shift";

function boardsStorageKey(shift: ShiftKey): string {
  return `jde-sched-boards-${shift}-v1`;
}

// Everyone reads/writes the same "shared" document (production schedule,
// roster, print settings) - that's what makes every shift see the same
// underlying factory data. Each shift's Line Assignments boards live in
// their own separate document instead, so a device showing one shift
// never even fetches another shift's board data - genuine separation,
// not just a UI filter over one big shared blob.
const SHARED_DOC = doc(db, "jde-sched", "shared");
function boardsDoc(shift: ShiftKey) {
  return doc(db, "jde-sched", `boards-${shift}`);
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

function normalizeBoards(raw: unknown): DailyBoard[] {
  const list = Array.isArray((raw as { boards?: unknown })?.boards) ? (raw as { boards: unknown[] }).boards : [];
  return list.map((b) => normalizeBoard((b ?? {}) as Partial<DailyBoard>));
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

export function normalizeSharedData(raw: Partial<SharedData>): SharedData {
  return {
    workOrders: Array.isArray(raw.workOrders) ? raw.workOrders : [],
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

// Only used for JSON backup/restore, where the full combined shape (shared
// data + whichever shift's boards this device has loaded) is the useful
// unit for a single downloadable file.
export function normalizeAppData(raw: Partial<AppData>): AppData {
  return {
    ...normalizeSharedData(raw),
    boards: Array.isArray(raw.boards) ? raw.boards.map(normalizeBoard) : [],
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

function loadInitialShared(): SharedData {
  try {
    const raw = localStorage.getItem(SHARED_STORAGE_KEY);
    if (raw) return normalizeSharedData(JSON.parse(raw) as Partial<SharedData>);
  } catch (err) {
    console.error("Failed to load saved data, starting from seed data.", err);
  }
  return buildSeedSharedData();
}

// The production schedule, roster and print settings - shared by every
// shift. localStorage stays as an instant local cache and offline
// fallback; Firestore is what makes different devices see each other's
// changes.
export function useSharedData() {
  const [data, setData] = useState<SharedData>(loadInitialShared);
  const lastSyncedJson = useRef<string>("");
  const [syncReady, setSyncReady] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SHARED_STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error("Failed to save data to localStorage.", err);
    }
  }, [data]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      SHARED_DOC,
      (snapshot) => {
        if (snapshot.exists()) {
          const remote = normalizeSharedData(snapshot.data() as Partial<SharedData>);
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

// A single shift's Line Assignments boards - a completely separate synced
// record per shift (see boardsDoc above), so switching shifts here means
// this device stops fetching the old shift's data and starts fetching the
// new one, rather than just filtering a shared list.
export function useShiftBoards(shift: ShiftKey | null) {
  const storageKey = shift ? boardsStorageKey(shift) : null;
  const [boards, setBoards] = useState<DailyBoard[]>(() => {
    if (!storageKey) return [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return normalizeBoards({ boards: JSON.parse(raw) });
    } catch (err) {
      console.error("Failed to load saved boards, starting from seed data.", err);
    }
    return shift ? seedBoardsForShift(shift) : [];
  });
  const lastSyncedJson = useRef<string>("");
  const [syncReady, setSyncReady] = useState(false);

  // Reload local state when the shift changes (including into/out of
  // null), so switching shifts doesn't briefly show the old shift's boards.
  useEffect(() => {
    lastSyncedJson.current = "";
    setSyncReady(false);
    if (!storageKey || !shift) {
      setBoards([]);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      setBoards(raw ? normalizeBoards({ boards: JSON.parse(raw) }) : seedBoardsForShift(shift));
    } catch (err) {
      console.error("Failed to load saved boards, starting from seed data.", err);
      setBoards(seedBoardsForShift(shift));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(boards));
    } catch (err) {
      console.error("Failed to save boards to localStorage.", err);
    }
  }, [boards, storageKey]);

  useEffect(() => {
    if (!shift) return;
    const ref = boardsDoc(shift);
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          const remote = normalizeBoards(snapshot.data());
          const remoteJson = JSON.stringify(remote);
          if (remoteJson !== lastSyncedJson.current) {
            lastSyncedJson.current = remoteJson;
            setBoards(remote);
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
  }, [shift]);

  useEffect(() => {
    if (!shift || !syncReady) return;
    const json = JSON.stringify(boards);
    if (json === lastSyncedJson.current) return;
    const timer = window.setTimeout(() => {
      lastSyncedJson.current = json;
      setDoc(boardsDoc(shift), { boards }).catch((err) => {
        console.error("Failed to sync boards to Firestore - this device's changes are only saved locally for now.", err);
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [boards, shift, syncReady]);

  return [boards, setBoards] as const;
}

export function resetSharedToSeed(): SharedData {
  return buildSeedSharedData();
}

export function emptySharedData(): SharedData {
  return {
    workOrders: [],
    employees: [],
    printSettings: { ...defaultPrintSettings },
    scheduledLines: [],
    printScheduleColumnWidths: {},
    printScheduleHiddenColumns: [],
  };
}

export { seedBoardsForShift };

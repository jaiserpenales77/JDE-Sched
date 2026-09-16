import { useEffect, useState } from "react";
import type { AppData, DailyBoard, PrintAssignSettings } from "./types";
import { buildSeedData, defaultPrintSettings } from "./seedData";

const STORAGE_KEY = "jde-sched-data-v1";

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error("Failed to save data to localStorage.", err);
    }
  }, [data]);

  return [data, setData] as const;
}

export function resetToSeed(): AppData {
  return buildSeedData();
}

export function emptyData(): AppData {
  return { workOrders: [], boards: [], employees: [], printSettings: { ...defaultPrintSettings } };
}

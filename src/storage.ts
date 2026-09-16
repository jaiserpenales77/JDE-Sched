import { useEffect, useState } from "react";
import type { AppData } from "./types";
import { buildSeedData } from "./seedData";

const STORAGE_KEY = "jde-sched-data-v1";

function loadInitial(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppData;
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
  return { workOrders: [], boards: [], employees: [] };
}

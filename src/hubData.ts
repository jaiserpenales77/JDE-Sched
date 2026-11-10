import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import type { LineRate, LineRates } from "./scheduleLogic";

// What LineUp reads from the Packaging Lead Hub's Stored Data tab, kept up
// to date: its Line Rates ("LINE|FG ITEM" -> bottles in a full hour, an
// hour with lunch and an hour with a break) and its cotton and desiccant
// lists (FG item -> "Yes" or the one it takes). Empty when they can't be read
// (not allowed, or offline), so the estimates and the cotton and desiccant
// notes just don't show.
export type CottonList = Record<string, string>;
export type DesiccantList = Record<string, string>;

export interface HubData {
  lineRates: LineRates;
  cotton: CottonList;
  desiccant: DesiccantList;
}

const NONE: HubData = { lineRates: {}, cotton: {}, desiccant: {} };

export function useHubData(enabled: boolean): HubData {
  const [data, setData] = useState<HubData>(NONE);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, "pk030", "storedData"),
      (snap) => {
        const raw = snap.data();
        setData({
          lineRates: cleanRates(raw?.lineRates),
          cotton: cleanCotton(raw?.cottonItems),
          desiccant: cleanCotton(raw?.desiccantItems),
        });
      },
      (err) => {
        console.info("The Hub's Stored Data isn't available, so no estimates, cotton or desiccant list.", err.code);
        setData(NONE);
      },
    );
  }, [enabled]);
  // Locked: nothing to show (and nothing left over from the last shift).
  return enabled ? data : NONE;
}

function cleanRates(raw: unknown): LineRates {
  const out: LineRates = {};
  if (!raw || typeof raw !== "object") return out;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  for (const [key, value] of Object.entries(raw as Record<string, Partial<LineRate>>)) {
    const fullHour = num(value?.fullHour);
    if (!key.includes("|") || fullHour === null) continue;
    out[key.toUpperCase()] = { fullHour, lunch: num(value?.lunch), break: num(value?.break) };
  }
  return out;
}

// The Hub's cotton (or desiccant) list: FG item -> "Yes" (or true) or the
// one it takes. Items with none ("", "No", false) are left out.
export function cleanCotton(raw: unknown): CottonList {
  const out: CottonList = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [item, value] of Object.entries(raw as Record<string, unknown>)) {
    const fg = item.trim().toUpperCase();
    const cotton = value === true ? "Yes" : typeof value === "string" ? value.trim() : "";
    if (fg && cotton && !["N", "NO", "0", "-", "FALSE", "NONE"].includes(cotton.toUpperCase())) out[fg] = cotton;
  }
  return out;
}

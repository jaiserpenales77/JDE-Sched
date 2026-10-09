import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import type { LineRate, LineRates } from "./scheduleLogic";

// The Packaging Lead Hub's Line Rates (Stored Data tab), kept up to date:
// "LINE|FG ITEM" -> bottles in a full hour, an hour with lunch and an hour
// with a break. Empty when they can't be read (not allowed, or offline),
// so the estimates just don't show.
const NONE: LineRates = {};

export function useLineRates(enabled: boolean): LineRates {
  const [rates, setRates] = useState<LineRates>(NONE);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, "pk030", "storedData"),
      (snap) => setRates(cleanRates(snap.data()?.lineRates)),
      (err) => {
        console.info("Line rates aren't available, so no changeover estimates.", err.code);
        setRates({});
      },
    );
  }, [enabled]);
  // Locked: nothing to show (and nothing left over from the last shift).
  return enabled ? rates : NONE;
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

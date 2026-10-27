import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { Employee, ShiftKey } from "./types";
import { SHIFT_KEYS } from "./types";
import { cleanEmployeeName } from "./assignmentLogic";

// Each shift's people's names - and nothing else - shared so another shift
// can pick them for overtime on Line Assignments. A shift writes only its
// own list; every shift reads all three (firestore.rules). Schedules,
// boards, time off and skills stay in each shift's private document.
function namesDoc(shift: ShiftKey) {
  return doc(db, "jde-sched-names", shift);
}

export type ShiftNames = Record<ShiftKey, string[]>;

const NO_NAMES: ShiftNames = { "1st": [], "2nd": [], "3rd": [] };

// The lists as read, for the shift this device is showing (a shift switch
// starts over), and this shift's own list as last published (null = not
// read yet).
interface ReadNames {
  shift: ShiftKey | null;
  lists: ShiftNames;
  published: string | null;
}

// A roster's names as shared: cleaned up like everywhere else on Line
// Assignments, once each, A-Z.
export function rosterNames(employees: Employee[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const e of employees) {
    const name = cleanEmployeeName(e.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

// Every shift's names (empty until a shift has published its list, or while
// the database doesn't allow reading them), keeping this shift's list in
// step with its roster once its own data has loaded (ready).
export function useShiftNames(shift: ShiftKey | null, employees: Employee[], ready: boolean): ShiftNames {
  const [read, setRead] = useState<ReadNames>({ shift: null, lists: NO_NAMES, published: null });
  const current = read.shift === shift ? read : null;
  const lists = current?.lists ?? NO_NAMES;
  const published = current?.published ?? null;
  const names = useMemo(() => rosterNames(employees), [employees]);
  const namesJson = JSON.stringify(names);

  useEffect(() => {
    if (!shift) return;
    const unsubscribes = SHIFT_KEYS.map((s) =>
      onSnapshot(
        namesDoc(s),
        (snapshot) => {
          const raw: unknown = snapshot.data()?.names;
          const list = Array.isArray(raw) ? raw.filter((n): n is string => typeof n === "string") : [];
          setRead((prev) => {
            const base = prev.shift === shift ? prev : { shift, lists: NO_NAMES, published: null };
            return {
              shift,
              lists: { ...base.lists, [s]: list },
              published: s === shift ? JSON.stringify(list) : base.published,
            };
          });
        },
        (err) => console.warn(`${s} shift's names aren't available for overtime.`, err),
      ),
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [shift]);

  // Publish this shift's names when they've changed (once its current list
  // has been read). The short delay skips the moment a shift switch still
  // shows the old shift's roster.
  useEffect(() => {
    if (!shift || !ready || published === null || published === namesJson) return;
    const timer = window.setTimeout(() => {
      setDoc(namesDoc(shift), { names: JSON.parse(namesJson) as string[] }).catch((err) =>
        console.warn("Couldn't share this shift's names for overtime.", err),
      );
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [shift, ready, published, namesJson]);

  return lists;
}

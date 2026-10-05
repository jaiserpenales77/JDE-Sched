import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export type PrintChoice = "assignments" | "schedule" | "both";

const BUTTON_LABEL: Record<PrintChoice, string> = {
  both: "Print Both",
  assignments: "Print Line Assignments",
  schedule: "Print Schedule",
};

interface Props {
  // What the main button prints - the last thing picked from the menu.
  choice: PrintChoice;
  onPrint: (choice: PrintChoice) => void;
  // Date of the Line Assignments board that would print, if there is one.
  boardDate: string | undefined;
  today: string;
}

// Split button: the main part prints the last choice in one click, the
// arrow opens the list of what can be printed.
export default function PrintMenu({ choice, onPrint, boardDate, today }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hasBoard = !!boardDate;
  // Without a board only the schedule can print.
  const effective: PrintChoice = hasBoard ? choice : "schedule";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: PrintChoice) {
    setOpen(false);
    onPrint(next);
  }

  const boardNote = !hasBoard ? (
    "No Line Assignments board yet"
  ) : boardDate === today ? (
    `Today's board (${boardDate})`
  ) : (
    <>
      Board for {boardDate} <span className="print-menu-warn">— not today's</span>
    </>
  );

  const items: { key: PrintChoice; title: string; note: ReactNode; disabled: boolean }[] = [
    { key: "both", title: "Both", note: <>Line Assignments first, then the Production Schedule</>, disabled: !hasBoard },
    { key: "assignments", title: "Line Assignments", note: boardNote, disabled: !hasBoard },
    { key: "schedule", title: "Production Schedule", note: "All production lines", disabled: false },
  ];

  return (
    <div className="print-menu" ref={wrapRef}>
      <button className="btn print-menu-main" onClick={() => onPrint(effective)} title="Print (pick what to print with ▾)">
        🖨 {BUTTON_LABEL[effective]}
      </button>
      <button
        className="btn print-menu-caret"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Choose what to print"
        title="Choose what to print"
        onClick={() => setOpen((o) => !o)}
      >
        ▾
      </button>
      {open && (
        <div className="print-menu-list" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              role="menuitem"
              className={`print-menu-item ${item.key === effective ? "current" : ""}`}
              disabled={item.disabled}
              onClick={() => pick(item.key)}
            >
              <span className="print-menu-title">
                {item.title}
                {item.key === effective && <span className="print-menu-check"> ✓</span>}
              </span>
              <span className="print-menu-note">{item.note}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

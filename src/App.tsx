import { useEffect, useRef, useState } from "react";
import "./App.css";
import { useSharedData, useShiftBoards, useCurrentShift, resetSharedToSeed, emptySharedData, seedBoardsForShift } from "./storage";
import ProductionSchedule from "./components/ProductionSchedule";
import LineAssignments from "./components/LineAssignments";
import SkillsRoles from "./components/SkillsRoles";
import { PrintSchedule, PrintAssignments } from "./components/PrintViews";
import {
  exportAppDataToJson,
  exportWorkOrdersToExcel,
  readAppDataFromJsonFile,
  readWorkOrdersFromWorkbookFile,
} from "./excel";
import PrintDesignSettings from "./components/PrintDesignSettings";
import PrintLayoutEditor from "./components/PrintLayoutEditor";
import type { WorkOrder, Employee, PrintAssignSettings, ShiftKey } from "./types";
import { SHIFT_KEYS, SHIFT_LABELS } from "./types";

type Tab = "schedule" | "assignments" | "roster";
type PrintTarget = "schedule" | "assignments" | null;

function App() {
  const [shift, chooseShift] = useCurrentShift();
  const [shared, setShared] = useSharedData();
  const [boards, setBoards] = useShiftBoards(shift);
  const [tab, setTab] = useState<Tab>("schedule");
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const sortedBoards = [...boards].sort((a, b) => (a.date < b.date ? 1 : -1));
  const selectedBoard = boards.find((b) => b.id === selectedBoardId) ?? sortedBoards[0];

  useEffect(() => {
    if (!printTarget) return;
    document.body.classList.add(`printing-${printTarget}`);

    const orientation = printTarget === "assignments" ? shared.printSettings.orientation : "landscape";
    const marginMm = 10;
    let pageStyle = document.getElementById("dynamic-page-style") as HTMLStyleElement | null;
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "dynamic-page-style";
      document.head.appendChild(pageStyle);
    }
    pageStyle.textContent = `@media print { @page { size: ${orientation}; margin: ${marginMm}mm; } }`;

    const printRoot = document.querySelector(".print-root") as HTMLElement | null;
    const assignEl = document.querySelector(".print-assignments") as HTMLElement | null;

    // The free-form layout's canvas is already sized to the page's exact
    // aspect ratio, so it always fits one page. The normal flowing grid
    // has no such ceiling - with enough lines/room sections/comments it
    // can run past one page - so shrink it down (never up) to fit, the
    // same way Excel's "fit sheet on one page" print option works.
    if (printTarget === "assignments" && printRoot && assignEl && !shared.printSettings.freeFormLayout) {
      const PX_PER_IN = 96;
      const PX_PER_MM = PX_PER_IN / 25.4;
      const pageWidthIn = orientation === "landscape" ? 11 : 8.5;
      const pageHeightIn = orientation === "landscape" ? 8.5 : 11;
      const marginPx = marginMm * PX_PER_MM;
      // Chrome's own print header/footer (date/title above, URL/page
      // number below - on by default in the print dialog) eats into the
      // page beyond our @page margin, and the page has no way to detect
      // or disable it. Budget extra room for it, plus a small fudge
      // factor for rounding, so the fit has a real safety margin instead
      // of landing right on the edge and spilling a sliver onto page 2.
      const HEADER_FOOTER_BUFFER_PX = 0.75 * PX_PER_IN;
      const FIT_SAFETY_FACTOR = 0.98;
      const pageContentWidthPx = pageWidthIn * PX_PER_IN - marginPx * 2;
      const pageContentHeightPx = pageHeightIn * PX_PER_IN - marginPx * 2 - HEADER_FOOTER_BUFFER_PX;

      assignEl.style.transform = "";
      assignEl.style.width = `${pageContentWidthPx}px`;
      printRoot.classList.add("measuring");
      const naturalHeight = assignEl.scrollHeight;
      printRoot.classList.remove("measuring");
      assignEl.style.width = "";

      const scale = Math.min(1, (pageContentHeightPx / naturalHeight) * FIT_SAFETY_FACTOR);
      if (scale < 1) {
        assignEl.style.transformOrigin = "top left";
        assignEl.style.transform = `scale(${scale})`;
        printRoot.style.height = `${naturalHeight * scale}px`;
        printRoot.style.overflow = "hidden";
      } else {
        printRoot.style.height = "";
        printRoot.style.overflow = "";
      }
    } else {
      if (assignEl) assignEl.style.transform = "";
      if (printRoot) {
        printRoot.style.height = "";
        printRoot.style.overflow = "";
      }
    }

    const id = requestAnimationFrame(() => window.print());
    const reset = () => setPrintTarget(null);
    window.addEventListener("afterprint", reset);
    return () => {
      cancelAnimationFrame(id);
      document.body.classList.remove(`printing-${printTarget}`);
      window.removeEventListener("afterprint", reset);
      if (assignEl) {
        assignEl.style.transform = "";
        assignEl.style.width = "";
      }
      if (printRoot) {
        printRoot.style.height = "";
        printRoot.style.overflow = "";
        printRoot.classList.remove("measuring");
      }
    };
  }, [printTarget, shared.printSettings.orientation, shared.printSettings.freeFormLayout]);

  function setWorkOrders(updater: (wos: WorkOrder[]) => WorkOrder[]) {
    setShared((s) => ({ ...s, workOrders: updater(s.workOrders) }));
  }
  function setEmployees(updater: (emps: Employee[]) => Employee[]) {
    setShared((s) => ({ ...s, employees: updater(s.employees) }));
  }
  function setPrintSettings(updater: (s: PrintAssignSettings) => PrintAssignSettings) {
    setShared((s) => ({ ...s, printSettings: updater(s.printSettings) }));
  }
  function setScheduledLines(updater: (lines: string[]) => string[]) {
    setShared((s) => ({ ...s, scheduledLines: updater(s.scheduledLines) }));
  }
  function setScheduleColumnWidths(updater: (widths: Record<string, number>) => Record<string, number>) {
    setShared((s) => ({ ...s, printScheduleColumnWidths: updater(s.printScheduleColumnWidths) }));
  }
  function setScheduleHiddenColumns(updater: (cols: string[]) => string[]) {
    setShared((s) => ({ ...s, printScheduleHiddenColumns: updater(s.printScheduleHiddenColumns) }));
  }

  async function handleJsonImport(file: File) {
    try {
      const imported = await readAppDataFromJsonFile(file);
      if (
        !confirm(
          "This will replace the shared Production Schedule/roster and this shift's boards with the imported backup. Continue?",
        )
      )
        return;
      const { boards: importedBoards, ...importedShared } = imported;
      setShared(importedShared);
      setBoards(importedBoards);
    } catch (err) {
      alert(`Could not read that file: ${(err as Error).message}`);
    }
  }

  async function handleExcelImport(file: File) {
    try {
      const workOrders = await readWorkOrdersFromWorkbookFile(file);
      if (!confirm(`Found ${workOrders.length} work order row(s). Replace the current Production Schedule?`)) return;
      setShared((s) => ({ ...s, workOrders }));
      setTab("schedule");
    } catch (err) {
      alert(`Could not read that spreadsheet: ${(err as Error).message}`);
    }
  }

  function handleResetToSample() {
    if (
      !confirm(
        "Replace the shared Production Schedule/roster and this shift's boards with the original sample data from the spreadsheet?",
      )
    )
      return;
    setShared(resetSharedToSeed());
    if (shift) setBoards(seedBoardsForShift(shift));
  }

  function handleWipe() {
    if (!confirm("This will erase the shared data (schedule, roster) and this shift's boards. Continue?")) return;
    setShared(emptySharedData());
    setBoards([]);
  }

  if (!shift) {
    return (
      <div className="shift-chooser">
        <div className="shift-chooser-card">
          <div className="app-title">
            JDE Sched
            <small>Production Line Schedule &amp; Crew Board</small>
          </div>
          <h1>Which shift is this device showing?</h1>
          <div className="shift-chooser-options">
            {SHIFT_KEYS.map((key) => (
              <button key={key} className="btn primary" onClick={() => chooseShift(key)}>
                {SHIFT_LABELS[key]}
              </button>
            ))}
          </div>
          <p className="shift-chooser-hint">
            You can change this anytime from the header. Each shift's Line Assignments boards are kept completely
            separate from the others - the Production Schedule and Skills &amp; Roles roster are shared by everyone.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          JDE Sched
          <small>Production Line Schedule &amp; Crew Board</small>
        </div>
        <nav className="tabs">
          <button className={`tab-btn ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>
            Production Schedule
          </button>
          <button className={`tab-btn ${tab === "assignments" ? "active" : ""}`} onClick={() => setTab("assignments")}>
            Line Assignments
          </button>
          <button className={`tab-btn ${tab === "roster" ? "active" : ""}`} onClick={() => setTab("roster")}>
            Skills &amp; Roles
          </button>
        </nav>
        <label className="shift-picker">
          Shift
          <select value={shift} onChange={(e) => chooseShift(e.target.value as ShiftKey)}>
            {SHIFT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SHIFT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <div className="toolbar toolbar-dark">
          {tab === "schedule" && (
            <>
              <button className="btn" onClick={() => setPrintTarget("schedule")}>
                🖨 Print Report
              </button>
              <button
                className="btn"
                onClick={() =>
                  exportWorkOrdersToExcel(shared.workOrders).catch((err) =>
                    alert(`Could not export: ${(err as Error).message}`),
                  )
                }
              >
                ⬇ Export Excel
              </button>
              <button className="btn" onClick={() => excelInputRef.current?.click()}>
                ⬆ Import Excel
              </button>
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xlsm,.xls"
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleExcelImport(e.target.files[0])}
              />
            </>
          )}
          {tab === "assignments" && (
            <button className="btn" onClick={() => setPrintTarget("assignments")} disabled={!selectedBoard}>
              🖨 Print Report
            </button>
          )}
          <button className="btn" onClick={() => exportAppDataToJson({ ...shared, boards })}>
            ⬇ Backup (JSON)
          </button>
          <button className="btn" onClick={() => jsonInputRef.current?.click()}>
            ⬆ Restore Backup
          </button>
          <input
            ref={jsonInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && handleJsonImport(e.target.files[0])}
          />
          <button className="btn" onClick={handleResetToSample}>
            Reset to sample data
          </button>
          <button className="btn danger" onClick={handleWipe}>
            Wipe all data
          </button>
        </div>
      </header>

      <main className="app-main">
        {tab === "schedule" && (
          <ProductionSchedule
            workOrders={shared.workOrders}
            setWorkOrders={setWorkOrders}
            scheduledLines={shared.scheduledLines}
            setScheduledLines={setScheduledLines}
            columnWidths={shared.printScheduleColumnWidths}
            setColumnWidths={setScheduleColumnWidths}
            hiddenColumns={shared.printScheduleHiddenColumns}
            setHiddenColumns={setScheduleHiddenColumns}
          />
        )}
        {tab === "assignments" && (
          <>
            <LineAssignments
              boards={boards}
              setBoards={setBoards}
              selectedId={selectedBoard?.id ?? ""}
              setSelectedId={setSelectedBoardId}
              employees={shared.employees}
              defaultShiftLabel={SHIFT_LABELS[shift]}
            />
            <PrintDesignSettings settings={shared.printSettings} setSettings={setPrintSettings} />
            {shared.printSettings.freeFormLayout && selectedBoard && (
              <PrintLayoutEditor
                board={selectedBoard}
                employees={shared.employees}
                settings={shared.printSettings}
                setSettings={setPrintSettings}
              />
            )}
          </>
        )}
        {tab === "roster" && <SkillsRoles employees={shared.employees} setEmployees={setEmployees} />}
      </main>

      <footer className="toolbar-footer">
        Synced live to the cloud - the Production Schedule and Skills &amp; Roles roster are shared by every shift;
        this device's Line Assignments boards are kept separate to just the {SHIFT_LABELS[shift]}. Use "Backup
        (JSON)" regularly to keep a copy you can restore from any device.
      </footer>

      <div className="print-root">
        <PrintSchedule
          workOrders={shared.workOrders}
          scheduledLines={shared.scheduledLines}
          columnWidths={shared.printScheduleColumnWidths}
          hiddenColumns={shared.printScheduleHiddenColumns}
        />
        <PrintAssignments board={selectedBoard} employees={shared.employees} settings={shared.printSettings} />
      </div>
    </div>
  );
}

export default App;
